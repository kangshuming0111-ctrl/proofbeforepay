/** Standalone seller-owned synthetic staging service.
 *
 * This implementation has its own business policy and database. It imports no
 * ProofBeforePay checker, expectation generator or built-in lab handler. Only
 * the public synthetic HTTP contract is shared. No email, payment or outbound
 * network operation is performed here.
 */
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SUFFIXES = new Set(["", "-missing-slot", "-invalid-email", "-zero", "-fraction", "-below", "-exact", "-above", "-concurrent"]);
const INPUT_FIELDS = ["testRunId", "marker", "customer", "email", "slot", "partySize"];
const BODY_BYTES = 4096;
const TTL_MS = 3600_000;

class InputError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
class ConfigurationError extends Error {}

function response(value, status = 200, extraHeaders = {}) {
  return Response.json(value, {status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...extraHeaders,
  }});
}
function configuration(env) {
  const projectId = env?.SELLER_PROJECT_ID;
  const registrationRevision = env?.SELLER_REGISTRATION_REVISION;
  const frontendBundleDigest = env?.SELLER_FRONTEND_BUNDLE_DIGEST;
  const deploymentRevision = env?.SELLER_DEPLOYMENT_REVISION;
  const backendArtifactDigest = env?.SELLER_BACKEND_ARTIFACT_DIGEST;
  const backendSourceCommit = env?.SELLER_BACKEND_SOURCE_COMMIT;
  const db = env?.SELLER_DB;
  if (typeof projectId !== "string" || !IDENTIFIER.test(projectId)
    || typeof registrationRevision !== "string" || !IDENTIFIER.test(registrationRevision)
    || typeof frontendBundleDigest !== "string" || !DIGEST.test(frontendBundleDigest)
    || typeof deploymentRevision !== "string" || !REVISION.test(deploymentRevision)
    || backendArtifactDigest !== undefined && (typeof backendArtifactDigest !== "string" || !DIGEST.test(backendArtifactDigest))
    || backendSourceCommit !== undefined && (typeof backendSourceCommit !== "string" || !COMMIT.test(backendSourceCommit))
    || !db || typeof db.prepare !== "function") throw new ConfigurationError();
  return {projectId, registrationRevision, frontendBundleDigest, deploymentRevision, backendArtifactDigest, backendSourceCommit, db,
    namespace: `${projectId}:${registrationRevision}:${deploymentRevision}:${frontendBundleDigest}`};
}

async function jsonBody(request) {
  const type = request.headers.get("content-type")?.trim();
  if (!type || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(type)) throw new InputError(415, "json_required");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > BODY_BYTES)) throw new InputError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError(400, "synthetic_validation_failed");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > BODY_BYTES) { await reader.cancel(); throw new InputError(413, "body_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)); }
  catch { throw new InputError(400, "synthetic_validation_failed"); }
}

function syntheticInput(value, key) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== INPUT_FIELDS.length || Object.keys(value).some(field => !INPUT_FIELDS.includes(field))
    || typeof value.testRunId !== "string" || !UUID.test(value.testRunId)
    || value.marker !== `PBP-${value.testRunId}` || value.customer !== "PBP synthetic"
    || value.email !== "pbp-test@example.invalid" || value.slot !== "2099-01-01T10:00:00Z") throw new InputError(400, "synthetic_validation_failed");
  const prefix = `pbp-${value.testRunId}`;
  if (typeof key !== "string" || !key.startsWith(prefix) || !SUFFIXES.has(key.slice(prefix.length))) throw new InputError(400, "synthetic_validation_failed");
  if (!Number.isInteger(value.partySize) || value.partySize < 1) throw new InputError(422, "party_size_invalid");
  // Thirteen is accepted only as a negative boundary probe. It can never be
  // stored: the business maximum is <=12 and SQL has an independent hard cap.
  if (value.partySize > 13) throw new InputError(400, "synthetic_validation_failed");
  return value;
}
async function businessPolicy(db) {
  const row = await db.prepare("SELECT max_party_size AS maximum FROM seller_business_policy WHERE id = ?").bind(1).first();
  if (!row || !Number.isInteger(row.maximum) || row.maximum < 2 || row.maximum > 12) throw new Error("seller_policy_unavailable");
  return row.maximum;
}
function receipt(row) {
  return {id: row.id, testRunId: row.test_run_id, marker: row.marker, customer: row.customer, email: row.email, slot: row.slot,
    partySize: row.party_size, revision: row.deployment_revision, createdAt: row.created_at, expiresAt: row.expires_at};
}
function sameBooking(row, input) {
  return row.test_run_id === input.testRunId && row.marker === input.marker && row.customer === input.customer
    && row.email === input.email && row.slot === input.slot && row.party_size === input.partySize;
}
function replayResponse(saved, input) {
  return sameBooking(saved, input) ? response(receipt(saved)) : response({code: "idempotency_conflict"}, 409);
}
async function savedByKey(config, key, at) {
  return config.db.prepare("SELECT * FROM seller_booking_receipts WHERE namespace = ? AND idempotency_key = ? AND expires_at > ?")
    .bind(config.namespace, key, at).first();
}

/** env is an explicit non-secret deployment contract: SELLER_DB plus the four
 * required SELLER_* association values, with optional backend build identifiers.
 * Caller URLs, request fields, cookies and arbitrary process.env are never used
 * as configuration. The association is a declaration, not build attestation. */
export async function handleSellerBookingRequest(request, env) {
  try {
    const config = configuration(env), url = new URL(request.url);
    if (request.headers.has("origin") || request.headers.has("authorization") || request.headers.has("cookie")) return response({code: "credentials_and_browser_origins_not_accepted"}, 403);
    if (/[?#]/u.test(request.url)) return response({code: "query_and_fragment_not_accepted"}, 400);
    if (url.pathname === "/pbp/meta") {
      if (request.method !== "GET") return response({code: "method_not_allowed"}, 405, {Allow: "GET"});
      const maximum = await businessPolicy(config.db);
      return response({protocol: "booking-http-v2", revision: config.deploymentRevision, projectId: config.projectId,
        registrationRevision: config.registrationRevision, frontendBundleDigest: config.frontendBundleDigest,
        ...(config.backendArtifactDigest === undefined ? {} : {backendArtifactDigest: config.backendArtifactDigest}),
        ...(config.backendSourceCommit === undefined ? {} : {backendSourceCommit: config.backendSourceCommit}),
        maxPartySize: maximum, syntheticOnly: true, ttlSeconds: TTL_MS / 1000, deploymentAttestation: false, emailDelivery: false, payments: false});
    }
    const match = /^\/pbp\/bookings\/([a-f0-9-]{36})$/u.exec(url.pathname);
    if (match) {
      if (request.method !== "GET") return response({code: "method_not_allowed"}, 405, {Allow: "GET"});
      if (!UUID.test(match[1])) return response({code: "not_found"}, 404);
      const row = await config.db.prepare("SELECT * FROM seller_booking_receipts WHERE namespace = ? AND id = ? AND expires_at > ?")
        .bind(config.namespace, match[1], new Date().toISOString()).first();
      return row ? response(receipt(row)) : response({code: "not_found"}, 404);
    }
    if (url.pathname !== "/pbp/bookings") return response({code: "not_found"}, 404);
    if (request.method !== "POST") return response({code: "method_not_allowed"}, 405, {Allow: "POST"});
    // Validate the complete synthetic namespace before any storage operation.
    const input = syntheticInput(await jsonBody(request), request.headers.get("idempotency-key"));
    const key = request.headers.get("idempotency-key"), at = new Date().toISOString();
    const existing = await savedByKey(config, key, at);
    // Today's policy governs new bookings. A policy change must not rewrite or
    // hide a receipt that this exact key already committed under an older rule.
    if (existing) return replayResponse(existing, input);
    const maximum = await businessPolicy(config.db);
    if (input.partySize > maximum) {
      const raced = await savedByKey(config, key, at);
      return raced ? replayResponse(raced, input) : response({code: "party_size_exceeded"}, 422);
    }
    const expiresAt = new Date(Date.parse(at) + TTL_MS).toISOString();
    await config.db.prepare("DELETE FROM seller_booking_receipts WHERE id IN (SELECT id FROM seller_booking_receipts WHERE expires_at <= ? ORDER BY expires_at, id LIMIT 100)").bind(at).run();
    const id = crypto.randomUUID();
    // Atomic uniqueness is enforced by SQLite/D1, across separate handlers and
    // database connections. There is no in-memory idempotency map or mutex.
    let inserted;
    try {
      inserted = await config.db.prepare(`INSERT OR IGNORE INTO seller_booking_receipts
        (id, namespace, project_id, registration_revision, deployment_revision, frontend_bundle_digest,
         test_run_id, marker, customer, email, slot, party_size, idempotency_key, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, config.namespace, config.projectId,
        config.registrationRevision, config.deploymentRevision, config.frontendBundleDigest, input.testRunId, input.marker,
        input.customer, input.email, input.slot, input.partySize, key, at, expiresAt).run();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("seller_party_size_exceeded")) throw error;
      const raced = await savedByKey(config, key, at);
      return raced ? replayResponse(raced, input) : response({code: "party_size_exceeded"}, 422);
    }
    if (inserted.success === false || ![0, 1].includes(inserted.meta?.changes)) throw new Error("seller_insert_unavailable");
    const saved = await savedByKey(config, key, at);
    if (!saved) return response({code: "staging_capacity_reached"}, 503);
    if (!sameBooking(saved, input)) return response({code: "idempotency_conflict"}, 409);
    return response(receipt(saved), inserted.meta.changes === 1 ? 201 : 200);
  } catch (error) {
    if (error instanceof InputError) return response({code: error.code}, error.status);
    if (error instanceof ConfigurationError) return response({code: "configuration_unavailable"}, 503);
    // A concurrent native policy update may tighten the maximum between its
    // initial read and INSERT. SQL independently prevents the larger booking.
    if (error instanceof Error && error.message.includes("seller_party_size_exceeded")) return response({code: "party_size_exceeded"}, 422);
    // Do not expose or log request bodies, configuration, SQL or storage errors.
    return response({code: "storage_unavailable"}, 503);
  }
}
