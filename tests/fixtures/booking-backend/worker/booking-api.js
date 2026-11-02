const PROTOCOL = "pbp-booking-lab-v1";
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

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
      ...extraHeaders,
    },
  });
}

function error(code, message, status) {
  return json({ error: message, code, testOnly: true }, status);
}

async function readBody(request) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    return { response: error("body_too_large", "Use a synthetic JSON request of at most 4096 bytes.", 413) };
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
    return { response: error("json_required", "Use application/json.", 415) };
  }
  if (!request.body) return { response: error("invalid_json", "A synthetic JSON body is required.", 400) };
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { response: error("body_too_large", "Use a synthetic JSON request of at most 4096 bytes.", 413) };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { response: error("invalid_json", "The synthetic JSON request could not be read.", 400) };
  } finally {
    reader.releaseLock();
  }
}

/** Both revisions reject real customer details. The deliberately flawed revision
 * may mis-handle ONLY two documented negative-test envelopes: missing slot or a
 * fixed malformed-email sentinel. It never persists them or sends email. */
function validate(value, fixed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !KEYS.has(key))) return false;
  if (typeof value.testRunId !== "string" || !UUID.test(value.testRunId)
    || value.marker !== `PBP-${value.testRunId}` || value.customer !== SYNTHETIC_CUSTOMER
    || ![2, 3].includes(value.partySize)) return false;
  const allowedEmail = value.email === SYNTHETIC_EMAIL || !fixed && BAD_EMAIL_SENTINELS.has(value.email);
  const allowedSlot = value.slot === SYNTHETIC_SLOT || !fixed && !Object.hasOwn(value, "slot");
  return allowedEmail && allowedSlot;
}

function publicBooking(row) {
  return {
    id: row.id,
    testRunId: row.test_run_id,
    marker: row.marker,
    customer: row.customer,
    email: row.email,
    slot: row.slot,
    partySize: row.party_size,
    revision: row.revision,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    testOnly: true,
  };
}

function samePayload(row, value) {
  return row.test_run_id === value.testRunId && row.marker === value.marker
    && row.customer === value.customer && row.email === value.email
    && row.slot === value.slot && row.party_size === value.partySize;
}

const SELECT_KEY = "SELECT * FROM lab_bookings WHERE revision = ? AND idempotency_key = ? AND expires_at > ?";
const SYNTHETIC_ROWS = "customer = 'PBP synthetic' AND email = 'pbp-test@example.invalid' AND marker = 'PBP-' || test_run_id";

async function saveBooking(db, revision, key, value, now) {
  // Reusing an expired key starts a new disposable test. Cleanup cannot delete a
  // concurrent unexpired booking and touches only this lab's synthetic rows.
  await db.prepare(`DELETE FROM lab_bookings WHERE revision = ? AND idempotency_key = ? AND expires_at <= ? AND ${SYNTHETIC_ROWS}`).bind(revision, key, now).run();
  await db.prepare(`DELETE FROM lab_bookings WHERE id IN (SELECT id FROM lab_bookings WHERE expires_at <= ? AND ${SYNTHETIC_ROWS} ORDER BY expires_at LIMIT 100)`).bind(now).run();
  const existing = await db.prepare(SELECT_KEY).bind(revision, key, now).first();
  if (existing) return samePayload(existing, value)
    ? json(publicBooking(existing), 200)
    : error("idempotency_conflict", "This key already belongs to a different synthetic request.", 409);

  const id = crypto.randomUUID();
  const expires = new Date(Date.parse(now) + TTL_SECONDS * 1000).toISOString();
  // The capacity check is part of this one INSERT statement, so concurrent new
  // keys cannot both consume a final slot after an out-of-date separate count.
  const inserted = await db.prepare(`INSERT INTO lab_bookings (id, test_run_id, marker, customer, email, slot, party_size, revision, idempotency_key, created_at, expires_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM lab_bookings WHERE expires_at > ? AND ${SYNTHETIC_ROWS}) < ${MAX_ACTIVE_BOOKINGS} ON CONFLICT(revision, idempotency_key) DO NOTHING`)
    .bind(id, value.testRunId, value.marker, value.customer, value.email, value.slot, value.partySize, revision, key, now, expires, now).run();
  // Read the stored row even after insertion. The unique index also protects
  // concurrent same-key requests; a race winner is checked against this payload.
  const saved = await db.prepare(SELECT_KEY).bind(revision, key, now).first();
  if (!saved) return inserted.meta?.changes === 0
    ? error("lab_capacity_reached", "This disposable lab has reached its 1,000 active-test capacity. Try again after existing tests expire.", 503)
    : error("storage_unavailable", "The synthetic booking could not be read back.", 503);
  if (!samePayload(saved, value)) return error("idempotency_conflict", "This key already belongs to a different synthetic request.", 409);
  return json(publicBooking(saved), inserted.meta?.changes === 1 ? 201 : 200);
}

/** Controlled disposable service for the separate verification lab. Returns null
 * for unrelated routes. This is neither the seller's real backend nor email,
 * payment, browser-form or production booking verification. */
export async function handleBookingRequest(request, env) {
  const url = new URL(request.url);
  const route = /^\/test-api\/(flawed|fixed)\/(meta|bookings(?:\/([^/]+))?)$/.exec(url.pathname);
  if (!route) return null;
  const fixed = route[1] === "fixed";
  const revision = fixed ? "booking-fixed-v2" : "booking-flawed-v1";
  const resource = route[2];
  if (url.search) return error("query_not_supported", "This synthetic protocol does not use query parameters.", 400);

  if (resource === "meta") {
    if (request.method !== "GET") return json({ error: "Use GET.", code: "method_not_allowed", testOnly: true }, 405, { allow: "GET" });
    return json({ protocol: PROTOCOL, revision, syntheticOnly: true, ttlSeconds: TTL_SECONDS, emailDelivery: false, payments: false });
  }
  if (route[3]) {
    if (request.method !== "GET") return json({ error: "Use GET.", code: "method_not_allowed", testOnly: true }, 405, { allow: "GET" });
    if (!UUID.test(route[3])) return error("not_found", "No unexpired synthetic booking exists for this receipt.", 404);
    if (!fixed) return error("not_found", "The deliberately flawed revision did not persist this synthetic booking.", 404);
    if (!env?.DB) return error("storage_unavailable", "The isolated lab database is unavailable.", 503);
    try {
      const row = await env.DB.prepare("SELECT * FROM lab_bookings WHERE id = ? AND revision = ? AND expires_at > ?").bind(route[3], revision, new Date().toISOString()).first();
      return row ? json(publicBooking(row)) : error("not_found", "No unexpired synthetic booking exists for this receipt.", 404);
    } catch {
      return error("storage_unavailable", "The isolated lab database could not be read.", 503);
    }
  }
  if (request.method !== "POST") return json({ error: "Use POST.", code: "method_not_allowed", testOnly: true }, 405, { allow: "POST" });
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return error("origin_mismatch", "Use this lab's same-origin test page.", 403);
  const key = request.headers.get("idempotency-key") || "";
  if (!KEY.test(key)) return error("invalid_idempotency_key", "Use a 20–160 character synthetic Idempotency-Key.", 400);
  const body = await readBody(request);
  if (body.response) return body.response;
  if (!validate(body.value, fixed)) return error("synthetic_validation_failed", "Only the documented synthetic customer, email, future slot and test marker are accepted.", 400);

  if (!fixed) {
    const now = new Date().toISOString();
    return json({ id: crypto.randomUUID(), ...body.value, revision, createdAt: now, expiresAt: new Date(Date.parse(now) + TTL_SECONDS * 1000).toISOString(), testOnly: true }, 201);
  }
  if (!env?.DB) return error("storage_unavailable", "The isolated lab database is unavailable.", 503);
  try { return await saveBooking(env.DB, revision, key, body.value, new Date().toISOString()); }
  catch { return error("storage_unavailable", "The synthetic booking could not be stored.", 503); }
}
