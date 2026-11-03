import { env } from "cloudflare:workers";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { proofVersions, quotes } from "@/db/schema";
import type { ProofDeliveryVersion, ProofQuote, ProofRole } from "./contracts";
import { requireProof } from "./proof-domain";
import { joinSeller, snapshotVersion } from "./proof-workflow";
import { isSandboxCollaboration, resolveProofRole } from "./proof-demo";
import { HttpError, owner } from "./server";
import { assertQuoteEvidenceBudget } from "./evidence-budget";

export type ProofActor = {id: string; email: string; authenticated: boolean; requestedDemoRole?: ProofRole};
export type ProofRecord = {
  quote: ProofQuote; version: number; buyerId: string; sellerId: string | null; role: ProofRole;
  invitationHash: string | null; invitationEmail: string | null; invitationExpiresAt: string | null;
};

export function proofActor(request: Request, mutation = false): ProofActor {
  const id = owner(request, mutation);
  const demoRole = request.headers.get("x-proof-demo-role");
  return {id, email: (request.headers.get("oai-authenticated-user-email") ?? "").trim().toLowerCase(), authenticated: !!request.headers.get("oai-authenticated-user-id"),
    ...(demoRole === "buyer" || demoRole === "seller" ? {requestedDemoRole: demoRole} : {})};
}

function fromRow(row: typeof quotes.$inferSelect, actor: ProofActor): ProofRecord {
  const quote = JSON.parse(row.payload);
  requireProof(quote);
  if (quote.proof.collaboration && !actor.authenticated) throw new HttpError(401, "Sign in to use a shared delivery project.");
  const role = resolveProofRole(quote, {buyerId: row.ownerId, sellerId: row.sellerId, actorId: actor.id,
    authenticated: actor.authenticated, requestedDemoRole: actor.requestedDemoRole});
  if (!role) throw new HttpError(404, "Project not found.");
  return {quote, role, version: row.version, buyerId: row.ownerId, sellerId: row.sellerId,
    invitationHash: row.invitationHash, invitationEmail: row.invitationEmail, invitationExpiresAt: row.invitationExpiresAt};
}

export async function readProofCase(id: string, actor: ProofActor): Promise<ProofRecord> {
  const [row] = await getDb().select().from(quotes).where(and(eq(quotes.id, id), or(eq(quotes.ownerId, actor.id), eq(quotes.sellerId, actor.id)))).limit(1);
  if (!row) throw new HttpError(404, "Project not found.");
  return fromRow(row, actor);
}

/** Transport-only projection. Seller views do not expose buyer approval links or provider identifiers. */
export function proofView(quote: ProofQuote, role: ProofRole): ProofQuote {
  if (role === "buyer") return quote;
  const copy = structuredClone(quote);
  delete copy.paypalOrderId;
  delete copy.paypalApprovalUrl;
  delete copy.captureId;
  delete copy.proof.authorizationId;
  return copy;
}

export function proofResponse(record: ProofRecord, quote = record.quote) {
  return {quote: proofView(quote, record.role), role: record.role};
}

export async function listProofCases(actor: ProofActor) {
  const rows = await getDb().select({
    id: quotes.id, ownerId: quotes.ownerId, sellerId: quotes.sellerId,
    payload: sql<string>`json_remove(${quotes.payload}, '$.proof.delivery.files', '$.proof.delivery.assessment', '$.proof.delivery.browserCheckHistory', '$.proof.delivery.businessCheckHistory', '$.proof.delivery.layoutHistory', '$.proof.delivery.acceptanceEvidence', '$.proof.delivery.runtimeHistory', '$.proof.delivery.runtimeRun', '$.proof.delivery.journeyRun', '$.proof.delivery.journeyReport', '$.proof.delivery.journeyHistory', '$.proof.delivery.journeyPlanSuggestions', '$.proof.delivery.journeyPlanAdoption', '$.proof.delivery.journeyExplanation', '$.proof.delivery.modelRun', '$.proof.delivery.modelReport', '$.proof.delivery.modelHistory', '$.proof.delivery.modelEvidenceReservation', '$.proof.requirements.sourceText')`,
  }).from(quotes).where(and(or(eq(quotes.ownerId, actor.id), eq(quotes.sellerId, actor.id)), sql`json_extract(${quotes.payload}, '$.workflow') = 'proof-v1'`)).orderBy(desc(quotes.updatedAt)).limit(50);
  const result: ProofQuote[] = [];
  const roles: Record<string, ProofRole> = {};
  for (const row of rows) {
    const quote = JSON.parse(row.payload) as ProofQuote;
    if (quote.proof.collaboration && !actor.authenticated) continue;
    const role = resolveProofRole(quote, {buyerId: row.ownerId, sellerId: row.sellerId, actorId: actor.id,
      authenticated: actor.authenticated, requestedDemoRole: actor.requestedDemoRole});
    if (!role) continue;
    result.push(proofView(quote, role)); roles[row.id] = role;
  }
  return {quotes: result, roles};
}

type SaveOptions = {archive?: boolean; invitation?: {hash: string; email: string; expiresAt: string} | null; sellerId?: string; claimInvitation?: boolean};

/** One D1 transaction archives the prior snapshot and performs the quote-version CAS. */
export async function saveProofCase(record: ProofRecord, next: ProofQuote, options: SaveOptions = {}) {
  if (next.id !== record.quote.id) throw new HttpError(409, "Project identity cannot change.");
  assertQuoteEvidenceBudget(next);
  const db = env.DB as D1Database;
  const at = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (options.archive && record.quote.proof.delivery) {
    const count = await getDb().select({count: sql<number>`count(*)`}).from(proofVersions).where(eq(proofVersions.quoteId, next.id));
    if (count[0]?.count >= 49) throw new HttpError(409, "This project has reached 50 delivery versions. Start a new project to continue.");
    const snapshot = snapshotVersion(record.quote, at);
    statements.push(db.prepare("INSERT INTO proof_versions (id, quote_id, payload, archived_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM quotes WHERE id = ? AND owner_id = ? AND version = ?)")
      .bind(`${next.id}:${snapshot.delivery.id}`, next.id, JSON.stringify(snapshot), at, next.id, record.buyerId, record.version));
  }
  const invitation = options.invitation === undefined
    ? {hash: record.invitationHash, email: record.invitationEmail, expiresAt: record.invitationExpiresAt}
    : options.invitation === null ? {hash: null, email: null, expiresAt: null} : options.invitation;
  const claimGuard = options.claimInvitation ? " AND seller_id IS NULL AND invitation_hash = ? AND invitation_email = ? AND julianday(invitation_expires_at) > julianday('now')" : "";
  const bindings: unknown[] = [JSON.stringify(next), at, options.sellerId ?? record.sellerId, invitation.hash, invitation.email, invitation.expiresAt, next.id, record.buyerId, record.version];
  if (options.claimInvitation) bindings.push(record.invitationHash, record.invitationEmail);
  statements.push(db.prepare("UPDATE quotes SET payload = ?, version = version + 1, updated_at = ?, seller_id = ?, invitation_hash = ?, invitation_email = ?, invitation_expires_at = ? WHERE id = ? AND owner_id = ? AND version = ?" + claimGuard).bind(...bindings));
  const results = await db.batch(statements);
  if (!results[results.length - 1].meta.changes) throw new HttpError(409, "This project changed in another request. Reload it and try again.");
  record.quote = next; record.version += 1;
  record.sellerId = options.sellerId ?? record.sellerId;
  record.invitationHash = invitation.hash; record.invitationEmail = invitation.email; record.invitationExpiresAt = invitation.expiresAt;
}

export async function listProofVersions(record: ProofRecord): Promise<ProofDeliveryVersion[]> {
  const rows = await getDb().select({payload: sql<string>`json_remove(${proofVersions.payload}, '$.delivery.files', '$.delivery.browserCheckHistory', '$.delivery.businessCheckHistory', '$.delivery.layoutHistory', '$.delivery.acceptanceEvidence', '$.delivery.runtimeHistory', '$.delivery.runtimeRun', '$.delivery.journeyRun', '$.delivery.journeyReport', '$.delivery.journeyHistory', '$.delivery.journeyPlanSuggestions', '$.delivery.journeyPlanAdoption', '$.delivery.journeyExplanation', '$.delivery.modelRun', '$.delivery.modelReport', '$.delivery.modelHistory', '$.delivery.modelEvidenceReservation')`}).from(proofVersions)
    .where(eq(proofVersions.quoteId, record.quote.id)).orderBy(desc(proofVersions.archivedAt)).limit(50);
  const list = rows.map(row => JSON.parse(row.payload) as ProofDeliveryVersion);
  if (record.quote.proof.delivery) {
    const current = {...snapshotVersion(record.quote), isCurrent: true};
    delete current.delivery.files;
    delete current.delivery.businessCheckHistory;
    delete current.delivery.browserCheckHistory;
    delete current.delivery.layoutHistory;
    delete current.delivery.acceptanceEvidence;
    delete current.delivery.runtimeHistory;
    delete current.delivery.runtimeRun;
    delete current.delivery.journeyRun;
    delete current.delivery.modelRun;
    delete current.delivery.modelReport;
    delete current.delivery.modelHistory;
    delete current.delivery.modelEvidenceReservation;
    delete current.delivery.journeyReport;
    delete current.delivery.journeyHistory;
    delete current.delivery.journeyPlanSuggestions;
    delete current.delivery.journeyPlanAdoption;
    delete current.delivery.journeyExplanation;
    list.unshift(current);
  }
  return list;
}

export async function readProofVersion(record: ProofRecord, deliveryId: string): Promise<ProofDeliveryVersion> {
  if (record.quote.proof.delivery?.id === deliveryId) return {...snapshotVersion(record.quote), isCurrent: true};
  const [row] = await getDb().select().from(proofVersions).where(and(eq(proofVersions.id, `${record.quote.id}:${deliveryId}`), eq(proofVersions.quoteId, record.quote.id))).limit(1);
  if (!row) throw new HttpError(404, "Delivery version not found.");
  return JSON.parse(row.payload) as ProofDeliveryVersion;
}

async function tokenHash(token: unknown) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/u.test(token)) throw new HttpError(404, "Invitation unavailable, expired, or addressed to another account.");
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function issueInvitation(record: ProofRecord, email: unknown, actor: ProofActor) {
  if (record.quote.proof.demoRoleplay) throw new HttpError(409, "Demo role play uses a virtual seller and cannot invite another account.");
  if (!actor.authenticated || !actor.email) throw new HttpError(401, "Sign in with a verified email before inviting a seller.");
  if (record.role !== "buyer" || record.quote.status !== "approved" || record.quote.proof.collaboration?.stage !== "awaiting_seller"
    || record.sellerId || record.quote.proof.paymentState !== "unfunded" || record.quote.paypalOrderId) throw new HttpError(409, "Invite a seller after locking a new, unfunded shared project.");
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim())) throw new HttpError(400, "Enter the seller's sign-in email.");
  const recipient = email.trim().toLowerCase();
  if (recipient === actor.email) throw new HttpError(400, "Invite a different account as the seller.");
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await saveProofCase(record, record.quote, {invitation: {hash: await tokenHash(token), email: recipient, expiresAt}});
  return {token, email: recipient, expiresAt};
}

export async function readInvitation(token: unknown, actor: ProofActor): Promise<ProofRecord> {
  if (!actor.authenticated || !actor.email) throw new HttpError(401, "Sign in with the invited email to view this invitation.");
  const hash = await tokenHash(token);
  const [row] = await getDb().select().from(quotes).where(eq(quotes.invitationHash, hash)).limit(1);
  if (!row || row.ownerId === actor.id || row.sellerId || row.invitationEmail !== actor.email
    || !row.invitationExpiresAt || Date.parse(row.invitationExpiresAt) <= Date.now()) throw new HttpError(404, "Invitation unavailable, expired, or addressed to another account.");
  const quote = JSON.parse(row.payload); requireProof(quote);
  if (quote.proof.demoRoleplay) throw new HttpError(409, "Demo role play does not accept seller invitations.");
  if (quote.status !== "approved" || quote.proof.collaboration?.stage !== "awaiting_seller" || quote.proof.paymentOperation
    || quote.proof.paymentState !== "unfunded" || (quote.paymentMode !== "demo" && !isSandboxCollaboration(quote)) || quote.paypalOrderId) throw new HttpError(409, "This project no longer accepts this invitation.");
  return {quote, role: "seller", buyerId: row.ownerId, sellerId: null, version: row.version,
    invitationHash: row.invitationHash, invitationEmail: row.invitationEmail, invitationExpiresAt: row.invitationExpiresAt};
}

export async function acceptInvitation(record: ProofRecord, actor: ProofActor, name: unknown, confirm: unknown) {
  if (record.quote.proof.demoRoleplay) throw new HttpError(409, "Demo role play does not accept seller invitations.");
  if (confirm !== true) throw new HttpError(400, "Confirm the exact scope before joining as seller.");
  if (!actor.authenticated || !actor.email || actor.email !== record.invitationEmail || actor.id === record.buyerId || record.sellerId) throw new HttpError(403, "This invitation belongs to a different account.");
  const next = joinSeller(record.quote, name);
  await saveProofCase(record, next, {sellerId: actor.id, invitation: null, claimInvitation: true});
  return proofResponse(record);
}
