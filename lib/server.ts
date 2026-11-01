import { env } from "cloudflare:workers";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { quotes } from "@/db/schema";
import type { Quote } from "@/lib/contracts";
import { DomainError } from "@/lib/domain";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function providerEnv() {
  const config = env as unknown as Record<string, string | undefined>;
  return {
    DEEPSEEK_API_KEY: config.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL: config.DEEPSEEK_MODEL || "deepseek-flash",
    PAYPAL_CLIENT_ID: config.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: config.PAYPAL_CLIENT_SECRET,
  };
}

export function owner(request: Request, mutation = false) {
  const url = new URL(request.url);
  if (mutation) {
    const origin = request.headers.get("origin");
    const expected = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
    if (origin) {
      let originHost = "";
      try { originHost = new URL(origin).host; } catch { /* Invalid origins are rejected below. */ }
      if (originHost !== expected) throw new HttpError(403, "This action must come from BriefPay.");
    }
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-site request rejected.");
  }
  const identity = request.headers.get("oai-authenticated-user-id");
  if (identity) return identity;
  if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return "local-preview";
  throw new HttpError(401, "Please sign in to open your workspace.");
}

export async function body(request: Request, maxBytes = 24_000) {
  // Limit bytes while reading, including requests without a Content-Length header.
  const size = Number(request.headers.get("content-length"));
  if (Number.isFinite(size) && size > maxBytes) throw new HttpError(413, "Request is too large.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          throw new HttpError(413, "Request is too large.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  try {
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder("utf-8", {fatal: true}).decode(buffer);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected object");
    return parsed;
  } catch { throw new HttpError(400, "Invalid JSON object."); }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handle(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof DomainError) return json({ error: error.message }, error.status);
    // Provider errors are deliberately sanitized by the provider layer.
    if (error instanceof Error && error.name === "ProviderError") return json({ error: error.message }, 502);
    console.error("BriefPay request failed", error instanceof Error ? error.name : "Unknown error");
    return json({ error: "The request could not be completed. Please try again." }, 500);
  }
}

export async function listQuotes(ownerId: string) {
  const rows = await getDb().select({payload: sql<string>`json_remove(${quotes.payload}, '$.proof.delivery.files', '$.proof.delivery.assessment', '$.proof.requirements.sourceText')`})
    .from(quotes).where(eq(quotes.ownerId, ownerId)).orderBy(desc(quotes.updatedAt)).limit(50);
  return rows.map(row => JSON.parse(row.payload) as Quote);
}

/** History needs metadata, not every uploaded source snapshot. */
export async function listProofQuotes(ownerId: string) {
  const rows = await getDb().select({payload: sql<string>`json_remove(${quotes.payload}, '$.proof.delivery.files')`})
    .from(quotes).where(and(eq(quotes.ownerId, ownerId), sql`json_extract(${quotes.payload}, '$.workflow') = 'proof-v1'`))
    .orderBy(desc(quotes.updatedAt)).limit(50);
  return rows.map(row => JSON.parse(row.payload) as Quote);
}

export async function readQuote(id: string, ownerId: string) {
  const [row] = await getDb().select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.ownerId, ownerId))).limit(1);
  if (!row) throw new HttpError(404, "Quote not found.");
  return { quote: JSON.parse(row.payload) as Quote, version: row.version };
}

export async function insertQuote(quote: Quote, ownerId: string) {
  await getDb().insert(quotes).values({ id: quote.id, ownerId, payload: JSON.stringify(quote), version: 1, updatedAt: quote.createdAt });
}

export async function saveQuote(quote: Quote, ownerId: string, version: number) {
  const updated = await getDb().update(quotes).set({ payload: JSON.stringify(quote), version: version + 1, updatedAt: new Date().toISOString() }).where(and(eq(quotes.id, quote.id), eq(quotes.ownerId, ownerId), eq(quotes.version, version))).returning({ id: quotes.id });
  if (!updated.length) throw new HttpError(409, "This quote changed in another request. Reload it and try again.");
}
