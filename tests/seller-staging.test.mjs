import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {Worker} from "node:worker_threads";
import {handleSellerBookingRequest} from "../examples/seller-staging/worker/booking-service.mjs";

const migration = readFileSync(new URL("../examples/seller-staging/migrations/0001_seller_staging.sql", import.meta.url), "utf8");
const origin = "https://seller-staging.example.org";
const config = {
  SELLER_PROJECT_ID: "synthetic-project-1", SELLER_REGISTRATION_REVISION: "operator-review-1",
  SELLER_FRONTEND_BUNDLE_DIGEST: "a".repeat(64), SELLER_DEPLOYMENT_REVISION: "seller-build-1",
  SELLER_BACKEND_ARTIFACT_DIGEST: "b".repeat(64), SELLER_BACKEND_SOURCE_COMMIT: "c".repeat(40),
};
const runId = "cbbf49f4-cbc8-4b5a-acb7-12d27f847b79";
const payload = (partySize = 2, id = runId) => ({testRunId: id, marker: `PBP-${id}`, customer: "PBP synthetic", email: "pbp-test@example.invalid", slot: "2099-01-01T10:00:00Z", partySize});
const key = id => `pbp-${id}`;
const namespace = values => `${values.SELLER_PROJECT_ID}:${values.SELLER_REGISTRATION_REVISION}:${values.SELLER_DEPLOYMENT_REVISION}:${values.SELLER_FRONTEND_BUNDLE_DIGEST}`;

/** Actual native SQLite executes the service's migration and SQL. This does not
 * claim remote D1 or an independent seller has been deployed or verified. */
function d1(sqlite) {
  return {prepare(sql) {
    const statement = sqlite.prepare(sql);
    return {bind(...args) { return {
      async first() { return statement.get(...args) ?? null; },
      async run() { const result = statement.run(...args); return {success: true, meta: {changes: Number(result.changes)}}; },
    }; }};
  }};
}
function database(filename = ":memory:", migrate = true) {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec("PRAGMA busy_timeout = 5000");
  if (filename !== ":memory:") sqlite.exec("PRAGMA journal_mode = WAL");
  if (migrate) sqlite.exec(migration);
  return {sqlite, env: {...config, SELLER_DB: d1(sqlite)}};
}
function post(value = payload(), idempotencyKey = key(runId), extra = {}) {
  return new Request(`${origin}/pbp/bookings`, {method: "POST", headers: {"content-type": "application/json", "Idempotency-Key": idempotencyKey, ...extra}, body: JSON.stringify(value)});
}
function get(id) { return new Request(`${origin}/pbp/bookings/${id}`); }
function count(sqlite) { return sqlite.prepare("SELECT COUNT(*) AS count FROM seller_booking_receipts").get().count; }
function seed(sqlite, changes = {}) {
  const id = crypto.randomUUID(), testRunId = crypto.randomUUID(), at = new Date().toISOString();
  const record = {id, namespace: namespace(config), projectId: config.SELLER_PROJECT_ID, registrationRevision: config.SELLER_REGISTRATION_REVISION,
    deploymentRevision: config.SELLER_DEPLOYMENT_REVISION, frontendBundleDigest: config.SELLER_FRONTEND_BUNDLE_DIGEST,
    ...payload(2, testRunId), idempotencyKey: key(testRunId), createdAt: at, expiresAt: new Date(Date.parse(at) + 3600_000).toISOString(), ...changes};
  const result = sqlite.prepare(`INSERT INTO seller_booking_receipts
    (id,namespace,project_id,registration_revision,deployment_revision,frontend_bundle_digest,test_run_id,marker,customer,email,slot,party_size,idempotency_key,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(record.id, record.namespace, record.projectId, record.registrationRevision, record.deploymentRevision,
    record.frontendBundleDigest, record.testRunId, record.marker, record.customer, record.email, record.slot, record.partySize, record.idempotencyKey, record.createdAt, record.expiresAt);
  return {record, changes: Number(result.changes)};
}

test("independent metadata declares exact association and native max6 without attestation or provider operations", async () => {
  const {sqlite, env} = database(); const originalFetch = globalThis.fetch; let outbound = 0;
  globalThis.fetch = async () => { outbound++; throw new Error("no outbound service operation is permitted"); };
  try {
    const response = await handleSellerBookingRequest(new Request(`${origin}/pbp/meta`), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {protocol: "booking-http-v2", revision: config.SELLER_DEPLOYMENT_REVISION, projectId: config.SELLER_PROJECT_ID,
      registrationRevision: config.SELLER_REGISTRATION_REVISION, frontendBundleDigest: config.SELLER_FRONTEND_BUNDLE_DIGEST,
      backendArtifactDigest: config.SELLER_BACKEND_ARTIFACT_DIGEST, backendSourceCommit: config.SELLER_BACKEND_SOURCE_COMMIT,
      maxPartySize: 6, syntheticOnly: true, ttlSeconds: 3600, deploymentAttestation: false, emailDelivery: false, payments: false});
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    assert.equal((await handleSellerBookingRequest(post(), env)).status, 201);
    assert.equal(outbound, 0);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

test("native policy accepts1/5/6 and rejects7; a changed seller policy genuinely changes stored business behaviour", async () => {
  const {sqlite, env} = database();
  try {
    for (const party of [1, 5, 6]) {
      const response = await handleSellerBookingRequest(post(payload(party), `${key(runId)}-${party === 1 ? "below" : party === 5 ? "exact" : "above"}`), env);
      assert.equal(response.status, 201);
      const saved = await response.json(); assert.equal(saved.partySize, party);
      assert.deepEqual(await (await handleSellerBookingRequest(get(saved.id), env)).json(), saved);
    }
    const seven = await handleSellerBookingRequest(post(payload(7)), env);
    assert.equal(seven.status, 422); assert.equal((await seven.json()).code, "party_size_exceeded");
    assert.equal(count(sqlite), 3);
    // Intentional local business-rule fault. No checker input or response
    // expectation is consulted; seven guests are actually stored and read back.
    sqlite.prepare("UPDATE seller_business_policy SET max_party_size = ? WHERE id = 1").run(7);
    const wrong = await handleSellerBookingRequest(post(payload(7)), env); assert.equal(wrong.status, 201);
    const wrongReceipt = await wrong.json();
    assert.equal(sqlite.prepare("SELECT party_size FROM seller_booking_receipts WHERE id = ?").get(wrongReceipt.id).party_size, 7);
    assert.equal((await (await handleSellerBookingRequest(get(wrongReceipt.id), env)).json()).partySize, 7);
    sqlite.prepare("UPDATE seller_business_policy SET max_party_size = ? WHERE id = 1").run(5);
    const tooStrict = await handleSellerBookingRequest(post(payload(6), `${key(runId)}-concurrent`), env);
    assert.equal(tooStrict.status, 422); assert.equal((await tooStrict.json()).code, "party_size_exceeded");
  } finally { sqlite.close(); }
});

test("exact synthetic input, bounded keys and negative probes reject before any storage access", async () => {
  let accessed = 0;
  const env = {...config, SELLER_DB: {prepare() { accessed++; throw new Error("invalid input must not reach storage"); }}};
  const missing = payload(); delete missing.slot;
  for (const value of [missing, {...payload(), email: "not-an-email"}, {...payload(), customer: "Real customer"}, {...payload(), email: "real@example.com"},
    {...payload(), slot: "2026-11-03T10:00:00Z"}, {...payload(), marker: "wrong"}, {...payload(), testRunId: "not-a-uuid"},
    {...payload(), privateNote: "not allowed"}, null, []]) {
    const result = await handleSellerBookingRequest(post(value), env);
    assert.equal(result.status, 400); assert.equal((await result.json()).code, "synthetic_validation_failed");
  }
  for (const party of [0, -1, 1.5, "2", true, null]) {
    const result = await handleSellerBookingRequest(post(payload(party)), env);
    assert.equal(result.status, 422); assert.equal((await result.json()).code, "party_size_invalid");
  }
  for (const candidate of ["short", "pbp-another-run", `${key(runId)}-arbitrary-suffix`, `PBP-${runId}`]) {
    assert.equal((await handleSellerBookingRequest(post(payload(), candidate), env)).status, 400);
  }
  assert.equal((await handleSellerBookingRequest(post(payload(14)), env)).status, 400);
  assert.equal(accessed, 0);
});

test("SQL independently rejects private contacts, wrong namespace, malformed canaries and native policy violations", () => {
  const {sqlite} = database();
  try {
    for (const changes of [{customer: "Real customer"}, {email: "real@example.com"}, {slot: "2026-11-03T10:00:00Z"}, {marker: "wrong"},
      {namespace: "unbound"}, {frontendBundleDigest: "not-a-hash"}, {partySize: 1.5}, {partySize: 7}, {idempotencyKey: "unbound-key"},
      {testRunId: "a".repeat(36)}, {testRunId: "--------aaaa-aaaa-aaaa-aaaaaaaaaaaa"}]) assert.throws(() => seed(sqlite, changes));
    assert.equal(count(sqlite), 0);
    sqlite.prepare("UPDATE seller_business_policy SET max_party_size = ? WHERE id = 1").run(12);
    assert.throws(() => seed(sqlite, {partySize: 13}));
    for (const maximum of [0, 1, 13, 1.5, "wrong"]) assert.throws(() => sqlite.prepare("UPDATE seller_business_policy SET max_party_size = ? WHERE id = 1").run(maximum));
  } finally { sqlite.close(); }
});

test("replay and changed-data conflict retain one original receipt, scoped to the exact manifest namespace", async () => {
  const {sqlite, env} = database();
  try {
    const created = await handleSellerBookingRequest(post(), env); assert.equal(created.status, 201); const saved = await created.json();
    const replay = await handleSellerBookingRequest(post(), env); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), saved);
    const conflict = await handleSellerBookingRequest(post(payload(3)), env); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, "idempotency_conflict");
    assert.deepEqual(await (await handleSellerBookingRequest(get(saved.id), env)).json(), saved); assert.equal(count(sqlite), 1);
    const other = {...env, SELLER_PROJECT_ID: "another-synthetic-project"};
    assert.equal((await handleSellerBookingRequest(get(saved.id), other)).status, 404);
    const otherReceipt = await (await handleSellerBookingRequest(post(), other)).json(); assert.notEqual(otherReceipt.id, saved.id);
    assert.equal(count(sqlite), 2);
    for (const changes of [{SELLER_REGISTRATION_REVISION: "operator-review-2"}, {SELLER_DEPLOYMENT_REVISION: "seller-build-2"}, {SELLER_FRONTEND_BUNDLE_DIGEST: "d".repeat(64)}]) {
      assert.equal((await handleSellerBookingRequest(get(saved.id), {...env, ...changes})).status, 404);
    }
  } finally { sqlite.close(); }
});

test("tightened native policy preserves old replay/conflict and SQL still rejects a newly oversized insertion after its policy read", async () => {
  const {sqlite, env} = database();
  try {
    const response = await handleSellerBookingRequest(post(payload(6)), env); assert.equal(response.status, 201);
    const saved = await response.json();
    sqlite.prepare("UPDATE seller_business_policy SET max_party_size = 5 WHERE id = 1").run();
    const replay = await handleSellerBookingRequest(post(payload(6)), env); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), saved);
    assert.equal((await handleSellerBookingRequest(post(payload(5)), env)).status, 409);
    const newTooLarge = await handleSellerBookingRequest(post(payload(6), `${key(runId)}-exact`), env);
    assert.equal(newTooLarge.status, 422); assert.equal(count(sqlite), 1);
    sqlite.prepare("UPDATE seller_business_policy SET max_party_size = 6 WHERE id = 1").run();
    const underlying = d1(sqlite); let tightened = false;
    const concurrentPolicy = {...env, SELLER_DB: {prepare(sql) {
      const prepared = underlying.prepare(sql);
      return {bind(...args) {
        const bound = prepared.bind(...args);
        return {first: () => bound.first(), async run() {
          if (/^INSERT OR IGNORE/u.test(sql) && !tightened) {
            tightened = true; sqlite.prepare("UPDATE seller_business_policy SET max_party_size = 5 WHERE id = 1").run();
          }
          return bound.run();
        }};
      }};
    }}};
    const raced = await handleSellerBookingRequest(post(payload(6), `${key(runId)}-below`), concurrentPolicy);
    assert.equal(tightened, true); assert.equal(raced.status, 422); assert.equal((await raced.json()).code, "party_size_exceeded"); assert.equal(count(sqlite), 1);
  } finally {sqlite.close();}
});

test("receipts survive closing and reopening the real SQLite file; expired rows cannot be read and are recreated safely", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pbp-seller-persistence-")), filename = path.join(dir, "seller.sqlite"); let state;
  try {
    state = database(filename); const saved = await (await handleSellerBookingRequest(post(), state.env)).json();
    assert.equal(Date.parse(saved.expiresAt) - Date.parse(saved.createdAt), 3600_000);
    state.sqlite.close(); state = database(filename, false);
    assert.deepEqual(await (await handleSellerBookingRequest(get(saved.id), state.env)).json(), saved);
    state.sqlite.prepare("UPDATE seller_booking_receipts SET created_at = ?, expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", "2000-01-01T01:00:00.000Z", saved.id);
    assert.equal((await handleSellerBookingRequest(get(saved.id), state.env)).status, 404);
    const recreated = await handleSellerBookingRequest(post(), state.env); assert.equal(recreated.status, 201);
    assert.notEqual((await recreated.json()).id, saved.id); assert.equal(count(state.sqlite), 1);
  } finally { state?.sqlite.close(); rmSync(dir, {recursive: true, force: true}); }
});

const threadSource = `
  const {parentPort,workerData}=require('node:worker_threads');
  const {DatabaseSync}=require('node:sqlite');
  (async()=>{
    const {handleSellerBookingRequest}=await import(workerData.moduleUrl);
    const sqlite=new DatabaseSync(workerData.filename);sqlite.exec('PRAGMA busy_timeout=5000');
    const db={prepare(sql){const s=sqlite.prepare(sql);return{bind(...args){return{
      async first(){return s.get(...args)??null;},async run(){return{success:true,meta:{changes:Number(s.run(...args).changes)}};}
    };}};}};
    parentPort.postMessage({ready:true});await new Promise(resolve=>parentPort.once('message',resolve));
    try{
      const request=new Request(workerData.url,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':workerData.key},body:JSON.stringify(workerData.payload)});
      const response=await handleSellerBookingRequest(request,{...workerData.config,SELLER_DB:db});
      parentPort.postMessage({status:response.status,receipt:await response.json()});
    }finally{sqlite.close();}
  })().catch(error=>{parentPort.postMessage({error:String(error)});});
`;
async function raceConnections(filename, bodies) {
  const workers = [], ready = [], results = [];
  let timeout;
  try {
    for (const body of bodies) {
      const worker = new Worker(threadSource, {eval: true, workerData: {filename, config, payload: body, key: `${key(runId)}-concurrent`, url: `${origin}/pbp/bookings`, moduleUrl: new URL("../examples/seller-staging/worker/booking-service.mjs", import.meta.url).href}});
      workers.push(worker);
      ready.push(new Promise((resolve, reject) => {worker.on("message", message => {if (message.ready) resolve(); else if (message.error) reject(new Error(message.error));}); worker.on("error", reject);}));
      results.push(new Promise((resolve, reject) => {worker.on("message", message => {if (message.status) resolve(message); else if (message.error) reject(new Error(message.error));}); worker.on("error", reject);}));
    }
    const work = (async () => {await Promise.all(ready); workers.forEach(worker => worker.postMessage("go")); return Promise.all(results);})();
    return await Promise.race([work, new Promise((_, reject) => {timeout = setTimeout(() => reject(new Error("SQLite worker race timed out")), 8000);})]);
  } finally {clearTimeout(timeout); await Promise.all(workers.map(worker => worker.terminate()));}
}

test("two simultaneous worker threads with independent SQLite connections create one original row and reject changed-key races", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pbp-seller-atomic-")), filename = path.join(dir, "seller.sqlite");
  const {sqlite} = database(filename);
  try {
    const same = await raceConnections(filename, [payload(), payload()]);
    assert.deepEqual(same.map(result => result.status).sort(), [200, 201]);
    assert.deepEqual(same[0].receipt, same[1].receipt); assert.equal(count(sqlite), 1);
    sqlite.exec("DELETE FROM seller_booking_receipts");
    const changed = await raceConnections(filename, [payload(1), payload(2)]);
    assert.deepEqual(changed.map(result => result.status).sort(), [201, 409]); assert.equal(count(sqlite), 1);
    assert.equal(sqlite.prepare("SELECT party_size FROM seller_booking_receipts").get().party_size, changed.find(row => row.status === 201).receipt.partySize);
  } finally {sqlite.close(); rmSync(dir, {recursive: true, force: true});}
});

test("atomic capacity leaves one winner for the final row, allows full-store replay/conflict and deletes at most100expired rows", async () => {
  const {sqlite, env} = database();
  try {
    const saved = await (await handleSellerBookingRequest(post(), env)).json();
    for (let i = 0; i < 998; i++) seed(sqlite);
    const responses = await Promise.all([handleSellerBookingRequest(post(payload(), `${key(runId)}-below`), env), handleSellerBookingRequest(post(payload(), `${key(runId)}-exact`), env)]);
    assert.deepEqual(responses.map(result => result.status).sort(), [201, 503]); assert.equal(count(sqlite), 1000);
    const replay = await handleSellerBookingRequest(post(), env); assert.equal(replay.status, 200); assert.equal((await replay.json()).id, saved.id);
    assert.equal((await handleSellerBookingRequest(post(payload(3)), env)).status, 409);
    sqlite.exec("DELETE FROM seller_booking_receipts");
    for (let i = 0; i < 110; i++) seed(sqlite, {createdAt: "2000-01-01T00:00:00.000Z", expiresAt: "2000-01-01T01:00:00.000Z"});
    assert.equal((await handleSellerBookingRequest(post(), env)).status, 201);
    assert.equal(count(sqlite), 11);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM seller_booking_receipts WHERE expires_at < ?").get(new Date().toISOString()).count, 10);
  } finally {sqlite.close();}
});

test("routes, methods, header privacy and stream body bounds reject safely; absent schema is never created", async () => {
  const {sqlite, env} = database();
  try {
    for (const candidate of ["/test-api/fixed/meta", "/pbp/bookings/not-an-id", "/pbp/unknown"]) assert.equal((await handleSellerBookingRequest(new Request(origin + candidate), env)).status, 404);
    for (const suffix of ["?max=7", "?", "#fragment", "#"]) assert.equal((await handleSellerBookingRequest(new Request(`${origin}/pbp/meta${suffix}`), env)).status, 400);
    assert.equal((await handleSellerBookingRequest(new Request(`${origin}/pbp/bookings`), env)).status, 405);
    for (const extra of [{Origin: origin}, {Authorization: "synthetic-no-secret"}, {Cookie: "synthetic=no-secret"}]) assert.equal((await handleSellerBookingRequest(post(payload(), key(runId), extra), env)).status, 403);
    assert.equal((await handleSellerBookingRequest(post(payload(), key(runId), {"content-type": "text/plain"}), env)).status, 415);
    assert.equal((await handleSellerBookingRequest(post({...payload(), padding: "x".repeat(5000)}), env)).status, 413);
    const huge = new Request(`${origin}/pbp/bookings`, {method: "POST", headers: {"content-type": "application/json", "Idempotency-Key": key(runId)}, body: new ReadableStream({start(controller) {controller.enqueue(new TextEncoder().encode(" ".repeat(4097)));controller.close();}}), duplex: "half"});
    assert.equal((await handleSellerBookingRequest(huge, env)).status, 413); assert.equal(count(sqlite), 0);
  } finally {sqlite.close();}
  const empty = database(":memory:", false);
  try {
    const result = await handleSellerBookingRequest(post(), empty.env); assert.equal(result.status, 503); assert.equal((await result.json()).code, "storage_unavailable");
    assert.equal(empty.sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'").get().count, 0);
  } finally {empty.sqlite.close();}
});

test("only explicit association configuration is read and malformed declarations never expose values or touch storage", async () => {
  for (const patch of [{SELLER_PROJECT_ID: "bad/project"}, {SELLER_REGISTRATION_REVISION: ""}, {SELLER_FRONTEND_BUNDLE_DIGEST: "wrong-private-value"},
    {SELLER_DEPLOYMENT_REVISION: "bad revision"}, {SELLER_BACKEND_ARTIFACT_DIGEST: "short"}, {SELLER_BACKEND_SOURCE_COMMIT: "not-a-commit"}]) {
    let accesses = 0;
    const result = await handleSellerBookingRequest(new Request(`${origin}/pbp/meta`), {...config, ...patch, SELLER_DB: {prepare() {accesses++;throw new Error("must not touch storage");}}});
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), {code: "configuration_unavailable"}); assert.equal(accesses, 0);
  }
  const {sqlite, env} = database(), seen = new Set();
  try {
    const explicit = new Proxy(env, {get(target, property) {seen.add(property);if (!Object.hasOwn(target, property)) throw new Error("implicit environment access");return target[property];}});
    assert.equal((await handleSellerBookingRequest(new Request(`${origin}/pbp/meta`), explicit)).status, 200);
    assert.deepEqual([...seen].sort(), [...Object.keys(config), "SELLER_DB"].sort());
  } finally {sqlite.close();}
});
