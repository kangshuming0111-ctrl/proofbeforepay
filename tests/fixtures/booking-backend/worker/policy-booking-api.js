const PROTOCOL = "booking-http-v2";
const MAX_PARTY_SIZE = 6;
const MAX_SYNTHETIC_PARTY = 13;
const TTL_SECONDS = 3600;
const MAX_ACTIVE_BOOKINGS = 1000;
const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9:_-]{20,160}$/;
const KEYS = new Set(["testRunId", "marker", "customer", "email", "slot", "partySize"]);
const SYNTHETIC_EMAIL = "pbp-test@example.invalid";
const SYNTHETIC_CUSTOMER = "PBP synthetic";
const SYNTHETIC_SLOT = "2099-01-01T10:00:00Z";
const BAD_EMAIL_SENTINELS = new Set(["not-an-email", "invalid-email"]);
const SYNTHETIC_ROWS = "customer = 'PBP synthetic' AND email = 'pbp-test@example.invalid' AND marker = 'PBP-' || test_run_id";
const SELECT_KEY = "SELECT * FROM lab_policy_bookings WHERE revision = ? AND idempotency_key = ? AND expires_at > ?";

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow", ...extraHeaders,
  } });
}
function error(code, message, status) { return json({ error: message, code, testOnly: true }, status); }

async function readBody(request) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return { response: error("body_too_large", "Use at most 4096 bytes of synthetic JSON.", 413) };
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) return { response: error("json_required", "Use application/json.", 415) };
  if (!request.body) return { response: error("invalid_json", "A synthetic JSON body is required.", 400) };
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return { response: error("body_too_large", "Use at most 4096 bytes of synthetic JSON.", 413) }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch { return { response: error("invalid_json", "The synthetic JSON request could not be read.", 400) }; }
  finally { reader.releaseLock(); }
}

/** Limit probes vary only partySize. Real names, contacts, arbitrary dates and
 * extra fields are rejected before a request can reach persistent storage. */
function validationError(value, fixed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !KEYS.has(key))
    || typeof value.testRunId !== "string" || !UUID.test(value.testRunId)
    || value.marker !== `PBP-${value.testRunId}` || value.customer !== SYNTHETIC_CUSTOMER
    || ![SYNTHETIC_EMAIL, ...BAD_EMAIL_SENTINELS].includes(value.email)
    || Object.hasOwn(value, "slot") && value.slot !== SYNTHETIC_SLOT) {
    return error("synthetic_validation_failed", "Only the documented synthetic test envelope is accepted.", 400);
  }
  if (value.email !== SYNTHETIC_EMAIL || value.slot !== SYNTHETIC_SLOT) return error("synthetic_validation_failed", "A valid synthetic email and slot are required.", 400);
  if (!Number.isInteger(value.partySize) || value.partySize < 1) return error("party_size_invalid", "Party size must be a positive integer.", 422);
  if (value.partySize > MAX_SYNTHETIC_PARTY) return error("synthetic_validation_failed", "This lab accepts only bounded synthetic party-size probes.", 400);
  if (fixed && value.partySize > MAX_PARTY_SIZE) return error("party_size_exceeded", "Each booking accepts at most 6 people.", 422);
  return null;
}
function publicBooking(row) {
  return { id: row.id, testRunId: row.test_run_id, marker: row.marker, customer: row.customer,
    email: row.email, slot: row.slot, partySize: row.party_size, revision: row.revision,
    createdAt: row.created_at, expiresAt: row.expires_at, testOnly: true };
}
function samePayload(row, value) {
  return row.test_run_id === value.testRunId && row.marker === value.marker && row.customer === value.customer
    && row.email === value.email && row.slot === value.slot && row.party_size === value.partySize;
}
async function saveBooking(db, revision, key, value, now) {
  await db.prepare(`DELETE FROM lab_policy_bookings WHERE revision = ? AND idempotency_key = ? AND expires_at <= ? AND ${SYNTHETIC_ROWS}`).bind(revision, key, now).run();
  await db.prepare(`DELETE FROM lab_policy_bookings WHERE id IN (SELECT id FROM lab_policy_bookings WHERE expires_at <= ? AND ${SYNTHETIC_ROWS} ORDER BY expires_at LIMIT 100)`).bind(now).run();
  const existing = await db.prepare(SELECT_KEY).bind(revision, key, now).first();
  if (existing) return samePayload(existing, value) ? json(publicBooking(existing), 200)
    : error("idempotency_conflict", "This key already belongs to a different synthetic request.", 409);
  const id = crypto.randomUUID(), expires = new Date(Date.parse(now) + TTL_SECONDS * 1000).toISOString();
  // Capacity and the unique revision/key constraint are checked inside a single
  // INSERT. Separate concurrent requests cannot both consume a final slot.
  const inserted = await db.prepare(`INSERT INTO lab_policy_bookings (id, test_run_id, marker, customer, email, slot, party_size, revision, idempotency_key, created_at, expires_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM lab_policy_bookings WHERE expires_at > ? AND ${SYNTHETIC_ROWS}) < ${MAX_ACTIVE_BOOKINGS} ON CONFLICT(revision, idempotency_key) DO NOTHING`)
    .bind(id, value.testRunId, value.marker, value.customer, value.email, value.slot, value.partySize, revision, key, now, expires, now).run();
  const saved = await db.prepare(SELECT_KEY).bind(revision, key, now).first();
  if (!saved) return error(inserted.meta?.changes === 0 ? "lab_capacity_reached" : "storage_unavailable", "The bounded synthetic lab could not retain this booking.", 503);
  if (!samePayload(saved, value)) return error("idempotency_conflict", "This key already belongs to a different synthetic request.", 409);
  return json(publicBooking(saved), inserted.meta?.changes === 1 ? 201 : 200);
}

/** Separate controlled v2 fixture. Both revisions really persist and preserve
 * idempotency; only the flawed revision intentionally ignores the declared max6.
 * Neither one is a real merchant backend, deployment attestation or email test. */
export async function handlePolicyBookingRequest(request, env) {
  const url = new URL(request.url);
  const route = /^\/test-api\/(policy-fixed|policy-flawed)\/(meta|bookings(?:\/([^/]+))?)$/.exec(url.pathname);
  if (!route) return null;
  const fixed = route[1] === "policy-fixed", revision = fixed ? "booking-policy-fixed-v1" : "booking-policy-flawed-v1";
  if (url.search) return error("query_not_supported", "This synthetic protocol does not use query parameters.", 400);
  if (route[2] === "meta") {
    if (request.method !== "GET") return json({ code: "method_not_allowed", testOnly: true }, 405, { allow: "GET" });
    return json({ protocol: PROTOCOL, revision, maxPartySize: MAX_PARTY_SIZE, syntheticOnly: true, ttlSeconds: TTL_SECONDS,
      deploymentAttestation: false, emailDelivery: false, payments: false });
  }
  if (route[3]) {
    if (request.method !== "GET") return json({ code: "method_not_allowed", testOnly: true }, 405, { allow: "GET" });
    if (!UUID.test(route[3])) return error("not_found", "No unexpired synthetic booking exists for this receipt.", 404);
    if (!env?.DB) return error("storage_unavailable", "The isolated lab database is unavailable.", 503);
    try {
      const row = await env.DB.prepare("SELECT * FROM lab_policy_bookings WHERE id = ? AND revision = ? AND expires_at > ?").bind(route[3], revision, new Date().toISOString()).first();
      return row ? json(publicBooking(row)) : error("not_found", "No unexpired synthetic booking exists for this receipt.", 404);
    } catch { return error("storage_unavailable", "The synthetic booking could not be read.", 503); }
  }
  if (request.method !== "POST") return json({ code: "method_not_allowed", testOnly: true }, 405, { allow: "POST" });
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return error("origin_mismatch", "Use this lab's same-origin test page.", 403);
  const key = request.headers.get("idempotency-key") || "";
  if (!KEY.test(key)) return error("invalid_idempotency_key", "Use a 20–160 character synthetic Idempotency-Key.", 400);
  const body = await readBody(request); if (body.response) return body.response;
  const invalid = validationError(body.value, fixed); if (invalid) return invalid;
  if (!env?.DB) return error("storage_unavailable", "The isolated lab database is unavailable.", 503);
  try { return await saveBooking(env.DB, revision, key, body.value, new Date().toISOString()); }
  catch { return error("storage_unavailable", "The synthetic booking could not be stored.", 503); }
}
