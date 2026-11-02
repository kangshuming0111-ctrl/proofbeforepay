import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleBookingRequest } from "./fixtures/booking-backend/worker/booking-api.js";

const migration = readFileSync(new URL("./fixtures/booking-backend/drizzle/0000_booking_lab.sql", import.meta.url), "utf8");
const origin = "https://booking-lab.example.test";
const key = "PBP-test-idempotency-key-0001";
const runId = "cbbf49f4-cbc8-4b5a-acb7-12d27f847b79";
const payload = () => ({ testRunId: runId, marker: `PBP-${runId}`, customer: "PBP synthetic", email: "pbp-test@example.invalid", slot: "2099-01-01T10:00:00Z", partySize: 2 });

/** Real SQLite SQL/persistence adapter, not an in-memory JS imitation of D1.
 * These tests do not execute Cloudflare's actual D1 service or a browser. */
function d1(sqlite) {
  return { prepare(sql) {
    const statement = sqlite.prepare(sql);
    return { bind(...args) {
      return {
        async first() { return statement.get(...args) ?? null; },
        async run() { const result = statement.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
      };
    } };
  } };
}
function database(filename = ":memory:") {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec(migration);
  return { sqlite, env: { DB: d1(sqlite) } };
}
function post(revision, value = payload(), idempotencyKey = key, headers = {}) {
  return new Request(`${origin}/test-api/${revision}/bookings`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey, ...headers }, body: JSON.stringify(value) });
}
function get(revision, id) { return new Request(`${origin}/test-api/${revision}/bookings/${id}`); }

test("fixed booking persists to real SQLite, independent GET reads exact canary and same-key replay does not duplicate", async () => {
  const { sqlite, env } = database();
  try {
    const response = await handleBookingRequest(post("fixed"), env);
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.revision, "booking-fixed-v2");
    assert.equal(created.testOnly, true);
    assert.equal(Date.parse(created.expiresAt) - Date.parse(created.createdAt), 3600_000);
    const readback = await handleBookingRequest(get("fixed", created.id), env);
    assert.equal(readback.status, 200);
    assert.deepEqual(await readback.json(), created);
    const replay = await handleBookingRequest(post("fixed", { partySize: 2, slot: payload().slot, email: payload().email, customer: payload().customer, marker: payload().marker, testRunId: runId }), env);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).id, created.id);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 1);
    const conflict = await handleBookingRequest(post("fixed", { ...payload(), partySize: 3 }), env);
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, "idempotency_conflict");
    assert.deepEqual(await (await handleBookingRequest(get("fixed", created.id), env)).json(), created);
  } finally { sqlite.close(); }
});

test("fixed service rejects missing slot and malformed-email sentinel; flawed revision only pretends to create without persistence", async () => {
  const { sqlite, env } = database();
  try {
    const noSlot = payload(); delete noSlot.slot;
    for (const body of [noSlot, { ...payload(), email: "not-an-email" }]) {
      assert.equal((await handleBookingRequest(post("fixed", body), env)).status, 400);
      assert.equal((await handleBookingRequest(post("flawed", body), env)).status, 201);
    }
    const first = await (await handleBookingRequest(post("flawed"), env)).json();
    const replay = await (await handleBookingRequest(post("flawed"), env)).json();
    assert.notEqual(first.id, replay.id);
    assert.equal((await handleBookingRequest(get("flawed", first.id), env)).status, 404);
    assert.equal((await handleBookingRequest(get("fixed", first.id), env)).status, 404);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 0);
  } finally { sqlite.close(); }
});

test("concurrent same-key requests preserve one winner and reject a competing payload", async () => {
  const { sqlite, env } = database();
  try {
    const same = await Promise.all([handleBookingRequest(post("fixed"), env), handleBookingRequest(post("fixed"), env)]);
    assert.deepEqual(same.map(response => response.status).sort(), [200, 201]);
    const receipts = await Promise.all(same.map(response => response.json()));
    assert.equal(receipts[0].id, receipts[1].id);
    const raceKey = "PBP-test-idempotency-key-racing";
    const different = await Promise.all([handleBookingRequest(post("fixed", payload(), raceKey), env), handleBookingRequest(post("fixed", { ...payload(), partySize: 3 }, raceKey), env)]);
    assert.deepEqual(different.map(response => response.status).sort(), [201, 409]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 2);
    assert.equal(sqlite.prepare("SELECT party_size FROM lab_bookings WHERE idempotency_key = ?").get(raceKey).party_size, 2);
  } finally { sqlite.close(); }
});

test("both revisions reject real data, arbitrary fields and non-synthetic slots without storing anything", async () => {
  const { sqlite, env } = database();
  try {
    for (const revision of ["fixed", "flawed"]) {
      for (const body of [
        { ...payload(), email: "customer@example.com" },
        { ...payload(), customer: "Real customer" },
        { ...payload(), slot: "2026-11-03T10:00:00Z" },
        { ...payload(), marker: "unrelated-marker" },
        { ...payload(), testRunId: "not-a-uuid" },
        { ...payload(), partySize: 100 },
        { ...payload(), password: "not-an-accepted-field" },
        null,
        [],
      ]) assert.equal((await handleBookingRequest(post(revision, body), env)).status, 400);
    }
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 0);
  } finally { sqlite.close(); }
});

test("stored booking survives separate connection restart, while expiry prevents access and permits a fresh same-key test", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pbp-booking-lab-test-"));
  const filename = path.join(dir, "lab.sqlite");
  let sqlite;
  try {
    let db = database(filename); sqlite = db.sqlite;
    const saved = await (await handleBookingRequest(post("fixed"), db.env)).json();
    sqlite.close();
    sqlite = new DatabaseSync(filename);
    const env = { DB: d1(sqlite) };
    assert.deepEqual(await (await handleBookingRequest(get("fixed", saved.id), env)).json(), saved);
    sqlite.prepare("UPDATE lab_bookings SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", saved.id);
    assert.equal((await handleBookingRequest(get("fixed", saved.id), env)).status, 404);
    const freshResponse = await handleBookingRequest(post("fixed"), env);
    assert.equal(freshResponse.status, 201);
    const fresh = await freshResponse.json();
    assert.notEqual(fresh.id, saved.id);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 1);
  } finally { sqlite?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("opportunistic expiry cleanup is bounded to one hundred existing synthetic rows", async () => {
  const { sqlite, env } = database();
  try {
    const insert = sqlite.prepare("INSERT INTO lab_bookings (id,test_run_id,marker,customer,email,slot,party_size,revision,idempotency_key,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 110; i++) {
      const id = crypto.randomUUID();
      insert.run(id, runId, `PBP-${runId}`, payload().customer, payload().email, payload().slot, 2, "booking-fixed-v2", `PBP-expired-key-${String(i).padStart(6, "0")}`, "2000-01-01T00:00:00.000Z", "2000-01-01T01:00:00.000Z");
    }
    assert.equal((await handleBookingRequest(post("fixed"), env)).status, 201);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings WHERE expires_at <= ?").get(new Date().toISOString()).count, 10);
  } finally { sqlite.close(); }
});

test("active capacity is atomically capped at1000 while replay remains allowed and expiry makes room", async () => {
  const { sqlite, env } = database();
  try {
    const first = await (await handleBookingRequest(post("fixed"), env)).json();
    const insert = sqlite.prepare("INSERT INTO lab_bookings (id,test_run_id,marker,customer,email,slot,party_size,revision,idempotency_key,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < 999; i++) insert.run(crypto.randomUUID(), runId, `PBP-${runId}`, payload().customer, payload().email, payload().slot, 2, "booking-fixed-v2", `PBP-active-key-${String(i).padStart(6, "0")}`, first.createdAt, first.expiresAt);
    const full = await handleBookingRequest(post("fixed", payload(), "PBP-new-test-key-at-capacity"), env);
    assert.equal(full.status, 503);
    assert.equal((await full.json()).code, "lab_capacity_reached");
    const replay = await handleBookingRequest(post("fixed"), env);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).id, first.id);
    assert.equal((await handleBookingRequest(post("fixed", { ...payload(), partySize: 3 }), env)).status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 1000);

    sqlite.prepare("UPDATE lab_bookings SET expires_at = ? WHERE idempotency_key = ?").run("2000-01-01T00:00:00.000Z", "PBP-active-key-000000");
    const nearCap = await Promise.all([
      handleBookingRequest(post("fixed", payload(), "PBP-race-final-capacity-key-1"), env),
      handleBookingRequest(post("fixed", payload(), "PBP-race-final-capacity-key-2"), env),
    ]);
    assert.deepEqual(nearCap.map(response => response.status).sort(), [201, 503]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 1000);
  } finally { sqlite.close(); }
});

test("routes, methods, JSON limit, origin and absent migration fail explicitly without creating schema", async () => {
  const { sqlite, env } = database();
  try {
    assert.equal(await handleBookingRequest(new Request(`${origin}/unrelated`), env), null);
    const meta = await handleBookingRequest(new Request(`${origin}/test-api/fixed/meta`), env);
    assert.deepEqual(await meta.json(), { protocol: "pbp-booking-lab-v1", revision: "booking-fixed-v2", syntheticOnly: true, ttlSeconds: 3600, emailDelivery: false, payments: false });
    assert.equal((await handleBookingRequest(new Request(`${origin}/test-api/fixed/bookings`), env)).status, 405);
    assert.equal((await handleBookingRequest(post("fixed", payload(), "short"), env)).status, 400);
    assert.equal((await handleBookingRequest(post("fixed", payload(), key, { origin: "https://other.example.test" }), env)).status, 403);
    assert.equal((await handleBookingRequest(post("fixed", payload(), key, { "content-type": "text/plain" }), env)).status, 415);
    assert.equal((await handleBookingRequest(post("fixed", { ...payload(), padding: "x".repeat(5000) }), env)).status, 413);
    assert.equal((await handleBookingRequest(new Request(`${origin}/test-api/fixed/meta?expected=true`), env)).status, 400);
    assert.equal((await handleBookingRequest(get("fixed", "bad-id"), env)).status, 404);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM lab_bookings").get().count, 0);
  } finally { sqlite.close(); }
  const empty = new DatabaseSync(":memory:");
  try {
    assert.equal((await handleBookingRequest(post("fixed"), { DB: d1(empty) })).status, 503);
    assert.equal(empty.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count, 0);
  } finally { empty.close(); }
});
