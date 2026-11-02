import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleBookingRequest } from "./fixtures/booking-backend/worker/booking-api.js";
import { handlePolicyBookingRequest } from "./fixtures/booking-backend/worker/policy-booking-api.js";

const oldMigration = readFileSync(new URL("./fixtures/booking-backend/drizzle/0000_booking_lab.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("./fixtures/booking-backend/drizzle/0001_booking_policy_lab.sql", import.meta.url), "utf8");
const origin = "https://policy-booking-lab.example.test";
const runId = "cbbf49f4-cbc8-4b5a-acb7-12d27f847b79";
const key = "PBP-policy-idempotency-key-0001";
const payload = (partySize = 2) => ({ testRunId: runId, marker: `PBP-${runId}`, customer: "PBP synthetic", email: "pbp-test@example.invalid", slot: "2099-01-01T10:00:00Z", partySize });

/** Real native SQLite executes the actual fixture SQL. This is not a claim that
 * Cloudflare's remote D1 or two independently scheduled isolates were tested. */
function d1(sqlite) { return { prepare(sql) {
  const statement = sqlite.prepare(sql);
  return { bind(...args) { return {
    async first() { return statement.get(...args) ?? null; },
    async run() { const result = statement.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
  }; } };
} }; }
function database(filename = ":memory:") {
  const sqlite = new DatabaseSync(filename); sqlite.exec(oldMigration); sqlite.exec(migration);
  return { sqlite, env: { DB: d1(sqlite) } };
}
function post(variant, value = payload(), idempotencyKey = key, headers = {}) {
  return new Request(`${origin}/test-api/policy-${variant}/bookings`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey, ...headers }, body: JSON.stringify(value) });
}
function get(variant, id) { return new Request(`${origin}/test-api/policy-${variant}/bookings/${id}`); }
function rowCount(sqlite) { return sqlite.prepare("SELECT COUNT(*) AS count FROM lab_policy_bookings").get().count; }
function insert(sqlite, { id = crypto.randomUUID(), partySize = 2, revision = "booking-policy-fixed-v1", idempotencyKey = key, now = new Date().toISOString(), expires = new Date(Date.now() + 3600_000).toISOString(), ...overrides } = {}) {
  const value = { ...payload(partySize), ...overrides };
  sqlite.prepare("INSERT INTO lab_policy_bookings (id,test_run_id,marker,customer,email,slot,party_size,revision,idempotency_key,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, value.testRunId, value.marker, value.customer, value.email, value.slot, value.partySize, revision, idempotencyKey, now, expires);
}

test("policy fixture declares server-owned max6 and preserves fixed/flawed revision separation", async () => {
  const { sqlite, env } = database();
  try {
    for (const variant of ["fixed", "flawed"]) {
      const meta = await handlePolicyBookingRequest(new Request(`${origin}/test-api/policy-${variant}/meta`), env);
      assert.deepEqual(await meta.json(), { protocol: "booking-http-v2", revision: `booking-policy-${variant}-v1`, maxPartySize: 6, syntheticOnly: true, ttlSeconds: 3600, deploymentAttestation: false, emailDelivery: false, payments: false });
    }
    const fixed = await (await handlePolicyBookingRequest(post("fixed"), env)).json();
    const flawed = await (await handlePolicyBookingRequest(post("flawed"), env)).json();
    assert.notEqual(fixed.id, flawed.id);
    assert.equal((await handlePolicyBookingRequest(get("flawed", fixed.id), env)).status, 404);
    assert.equal((await handlePolicyBookingRequest(get("fixed", flawed.id), env)).status, 404);
    assert.equal(rowCount(sqlite), 2);
  } finally { sqlite.close(); }
});

test("actual max boundary accepts5and6, fixed rejects7 while flawed persists7 despite declaring6", async () => {
  const { sqlite, env } = database();
  try {
    for (const party of [1, 5, 6]) {
      const result = await handlePolicyBookingRequest(post("fixed", payload(party), `${key}-boundary-${party}`), env);
      assert.equal(result.status, 201);
      const saved = await result.json();
      assert.equal(saved.partySize, party);
      assert.deepEqual(await (await handlePolicyBookingRequest(get("fixed", saved.id), env)).json(), saved);
    }
    for (const party of [7, 12, 13]) {
      const rejected = await handlePolicyBookingRequest(post("fixed", payload(party), `${key}-too-large-${party}`), env);
      assert.equal(rejected.status, 422); assert.equal((await rejected.json()).code, "party_size_exceeded");
      const admitted = await handlePolicyBookingRequest(post("flawed", payload(party), `${key}-too-large-${party}`), env);
      assert.equal(admitted.status, 201);
      const saved = await admitted.json();
      assert.equal((await (await handlePolicyBookingRequest(get("flawed", saved.id), env)).json()).partySize, party);
    }
    for (const variant of ["fixed", "flawed"]) assert.equal((await handlePolicyBookingRequest(post(variant, payload(14)), env)).status, 400);
    assert.equal(rowCount(sqlite), 6);
  } finally { sqlite.close(); }
});

test("zero,fraction,types and missing party are rejected before storage with explicit structured code", async () => {
  const { sqlite, env } = database();
  try {
    for (const variant of ["fixed", "flawed"]) {
      for (const party of [0, -1, 1.5, "2", null, true]) {
        const result = await handlePolicyBookingRequest(post(variant, payload(party)), env);
        assert.equal(result.status, 422); assert.equal((await result.json()).code, "party_size_invalid");
      }
      const missing = payload(); delete missing.partySize;
      assert.equal((await (await handlePolicyBookingRequest(post(variant, missing), env)).json()).code, "party_size_invalid");
      const noSlot = payload(); delete noSlot.slot;
      for (const value of [noSlot, { ...payload(), email: "not-an-email" }, { ...payload(), email: "invalid-email" }]) {
        const result = await handlePolicyBookingRequest(post(variant, value), env);
        assert.equal(result.status, 400); assert.equal((await result.json()).code, "synthetic_validation_failed");
      }
    }
    assert.equal(rowCount(sqlite), 0);
  } finally { sqlite.close(); }
});

test("concurrent same-key creates yield one201andone200sameID; conflict cannot rewrite the original", async () => {
  const { sqlite, env } = database();
  try {
    for (const variant of ["fixed", "flawed"]) {
      const responses = await Promise.all([handlePolicyBookingRequest(post(variant), env), handlePolicyBookingRequest(post(variant), env)]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
      const receipts = await Promise.all(responses.map(r => r.json()));
      assert.equal(receipts[0].id, receipts[1].id);
      const conflict = await handlePolicyBookingRequest(post(variant, payload(1)), env);
      assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, "idempotency_conflict");
      assert.deepEqual(await (await handlePolicyBookingRequest(get(variant, receipts[0].id), env)).json(), receipts[0]);
      const raceKey = `${key}-different-payload`;
      const racing = await Promise.all([handlePolicyBookingRequest(post(variant, payload(2), raceKey), env), handlePolicyBookingRequest(post(variant, payload(1), raceKey), env)]);
      assert.deepEqual(racing.map(r => r.status).sort(), [201, 409]);
    }
    assert.equal(rowCount(sqlite), 4);
  } finally { sqlite.close(); }
});

test("new migration preserves an existing v1 receipt and policy receipts survive reopening the same SQLite file", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pbp-policy-booking-test-")), filename = path.join(dir, "lab.sqlite");
  let sqlite;
  try {
    sqlite = new DatabaseSync(filename); sqlite.exec(oldMigration);
    let env = { DB: d1(sqlite) };
    const oldRequest = new Request(`${origin}/test-api/fixed/bookings`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload()) });
    const oldReceipt = await (await handleBookingRequest(oldRequest, env)).json();
    sqlite.exec(migration);
    assert.deepEqual(await (await handleBookingRequest(new Request(`${origin}/test-api/fixed/bookings/${oldReceipt.id}`), env)).json(), oldReceipt);
    const saved = await (await handlePolicyBookingRequest(post("fixed", payload(6)), env)).json();
    assert.equal(Date.parse(saved.expiresAt) - Date.parse(saved.createdAt), 3600_000);
    sqlite.close(); sqlite = new DatabaseSync(filename); env = { DB: d1(sqlite) };
    assert.deepEqual(await (await handlePolicyBookingRequest(get("fixed", saved.id), env)).json(), saved);
    assert.deepEqual(await (await handleBookingRequest(new Request(`${origin}/test-api/fixed/bookings/${oldReceipt.id}`), env)).json(), oldReceipt);
    sqlite.prepare("UPDATE lab_policy_bookings SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", saved.id);
    assert.equal((await handlePolicyBookingRequest(get("fixed", saved.id), env)).status, 404);
    const recreated = await handlePolicyBookingRequest(post("fixed", payload(6)), env);
    assert.equal(recreated.status, 201); assert.notEqual((await recreated.json()).id, saved.id);
    assert.equal(rowCount(sqlite), 1);
  } finally { sqlite?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("capacity is atomic across revisions; full-store replays/conflicts work and cleanup removes at most100expired rows", async () => {
  const { sqlite, env } = database();
  try {
    const saved = await (await handlePolicyBookingRequest(post("fixed"), env)).json();
    for (let i = 0; i < 998; i++) insert(sqlite, { idempotencyKey: `${key}-active-${i}` });
    const finalSlot = await Promise.all([handlePolicyBookingRequest(post("fixed", payload(), `${key}-race-fixed`), env), handlePolicyBookingRequest(post("flawed", payload(), `${key}-race-flawed`), env)]);
    assert.deepEqual(finalSlot.map(r => r.status).sort(), [201, 503]);
    assert.equal(rowCount(sqlite), 1000);
    const full = await handlePolicyBookingRequest(post("fixed", payload(), `${key}-full`), env);
    assert.equal(full.status, 503); assert.equal((await full.json()).code, "lab_capacity_reached");
    const replay = await handlePolicyBookingRequest(post("fixed"), env);
    assert.equal(replay.status, 200); assert.equal((await replay.json()).id, saved.id);
    assert.equal((await handlePolicyBookingRequest(post("fixed", payload(1)), env)).status, 409);
    sqlite.prepare("DELETE FROM lab_policy_bookings WHERE id != ?").run(saved.id);
    for (let i = 0; i < 110; i++) insert(sqlite, { idempotencyKey: `${key}-expired-${i}`, now: "2000-01-01T00:00:00.000Z", expires: "2000-01-01T01:00:00.000Z" });
    assert.equal((await handlePolicyBookingRequest(post("fixed", payload(), `${key}-cleanup`), env)).status, 201);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_policy_bookings WHERE expires_at <= ?").get(new Date().toISOString()).count, 10);
  } finally { sqlite.close(); }
});

test("both revisions reject real contacts, arbitrary fields and slots, and SQL guards independently reject non-synthetic rows", async () => {
  const { sqlite, env } = database();
  try {
    for (const variant of ["fixed", "flawed"]) for (const value of [
      { ...payload(), customer: "Real customer" }, { ...payload(), email: "customer@example.com" },
      { ...payload(), slot: "2026-11-03T10:00:00Z" }, { ...payload(), marker: "wrong-marker" },
      { ...payload(), testRunId: "not-a-uuid" }, { ...payload(), apiKey: "not-an-allowed-field" }, null, [],
    ]) assert.equal((await handlePolicyBookingRequest(post(variant, value), env)).status, 400);
    for (const changes of [{ customer: "Real customer" }, { email: "customer@example.com" }, { partySize: 1.5 }, { partySize: 7 }, { revision: "unknown-revision" }]) assert.throws(() => insert(sqlite, changes));
    assert.equal(rowCount(sqlite), 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 0);
  } finally { sqlite.close(); }
});

test("unsupported routes, method, origin, body limit and absent migration fail without creating schema", async () => {
  const { sqlite, env } = database();
  try {
    assert.equal(await handlePolicyBookingRequest(new Request(`${origin}/test-api/fixed/meta`), env), null);
    assert.equal((await handlePolicyBookingRequest(new Request(`${origin}/test-api/policy-fixed/meta?max=2`), env)).status, 400);
    assert.equal((await handlePolicyBookingRequest(new Request(`${origin}/test-api/policy-fixed/bookings`), env)).status, 405);
    assert.equal((await handlePolicyBookingRequest(post("fixed", payload(), "short"), env)).status, 400);
    assert.equal((await handlePolicyBookingRequest(post("fixed", payload(), key, { origin: "https://other.example.test" }), env)).status, 403);
    assert.equal((await handlePolicyBookingRequest(post("fixed", payload(), key, { "content-type": "text/plain" }), env)).status, 415);
    assert.equal((await handlePolicyBookingRequest(post("fixed", { ...payload(), padding: "x".repeat(5000) }), env)).status, 413);
    assert.equal((await handlePolicyBookingRequest(get("fixed", "not-id"), env)).status, 404);
    assert.equal(rowCount(sqlite), 0);
  } finally { sqlite.close(); }
  const empty = new DatabaseSync(":memory:");
  try {
    const response = await handlePolicyBookingRequest(post("fixed"), { DB: d1(empty) });
    assert.equal(response.status, 503); assert.equal((await response.json()).code, "storage_unavailable");
    assert.equal(empty.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count, 0);
  } finally { empty.close(); }
});
