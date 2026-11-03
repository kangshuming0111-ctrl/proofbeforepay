import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {Worker} from "node:worker_threads";
import {handleCapacityRequest} from "../examples/seller-capacity-staging/worker/capacity-service.mjs";

const schema = readFileSync(new URL("../examples/seller-capacity-staging/migrations/0001_capacity.sql", import.meta.url), "utf8");
const expanded = readFileSync(new URL("../examples/seller-capacity-staging/migrations/0002_capacity_expanded.sql", import.meta.url), "utf8");
const hosted = readFileSync(new URL("./fixtures/seller-staging-hosted/0005_capacity_expanded.sql", import.meta.url), "utf8");
const origin = "https://synthetic-capacity.example.org";
const slots = {a: "2099-01-01T10:00:00Z", b: "2099-01-01T11:00:00Z", c: "2099-01-01T12:00:00Z", d: "2099-01-01T13:00:00Z", e: "2099-01-01T14:00:00Z"};
const config = {CAPACITY_PROJECT_ID: "expanded-synthetic-project", CAPACITY_REGISTRATION_REVISION: "review-1",
  CAPACITY_DEPLOYMENT_REVISION: "expanded-native-1", CAPACITY_FRONTEND_BUNDLE_DIGEST: "a".repeat(64),
  CAPACITY_POLICY_ID: "fixed", CAPACITY_PROTOCOL: "booking-http-v4", CAPACITY_VALIDATION_PROFILE: "strict"};
const runId = "aee64152-03c7-4be7-befa-6b94a46808bf";
type Config = Record<string, string>;
type NativeReceipt = {id: string; email: string; [key: string]: unknown};
async function object(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
async function receipt(response: Response): Promise<NativeReceipt> {
  const value = await object(response);
  assert.equal(typeof value.id, "string"); assert.equal(typeof value.email, "string");
  return value as NativeReceipt;
}
function apply(sqlite: DatabaseSync, sql: string) {for (const chunk of sql.split(/^--> statement-breakpoint\s*$/mu).map(value => value.trim()).filter(Boolean)) sqlite.exec(chunk);}
function d1(sqlite: DatabaseSync) {return {prepare(sql: string) {const statement = sqlite.prepare(sql); return {bind(...args: (string | number | null)[]) {return {
  async first() {return statement.get(...args) ?? null;}, async all() {return {success: true, results: statement.all(...args)};},
  async run() {return {success: true, meta: {changes: Number(statement.run(...args).changes)}};},
};}};}};}
function database(filename = ":memory:") {const sqlite = new DatabaseSync(filename); sqlite.exec("PRAGMA busy_timeout=5000"); if (filename !== ":memory:") sqlite.exec("PRAGMA journal_mode=WAL"); apply(sqlite, schema); apply(sqlite, expanded); return {sqlite, env: {...config, CAPACITY_DB: d1(sqlite)}};}
const payload = (partySize: unknown = 1, slot = slots.c, id = runId) => ({testRunId: id, marker: `PBP-${id}`, customer: "PBP synthetic", email: "pbp-test@example.invalid", slot, partySize});
const key = (suffix = "same-key", id = runId) => `pbp-${id}-capacity-${suffix}`;
const post = (value: unknown = payload(), suffix = "same-key") => new Request(`${origin}/pbp/bookings`, {method: "POST", headers: {"Content-Type": "application/json", "Idempotency-Key": key(suffix, (value as ReturnType<typeof payload>)?.testRunId ?? runId)}, body: JSON.stringify(value)});
const get = (id: string) => new Request(`${origin}/pbp/bookings/${id}`);
function manifest(values: Config) {return `${values.CAPACITY_PROJECT_ID}:${values.CAPACITY_REGISTRATION_REVISION}:${values.CAPACITY_DEPLOYMENT_REVISION}:${values.CAPACITY_FRONTEND_BUNDLE_DIGEST}:${values.CAPACITY_POLICY_ID}:${values.CAPACITY_PROTOCOL}:${values.CAPACITY_VALIDATION_PROFILE}`;}
function seed(sqlite: DatabaseSync, values: Config = config, changes: Record<string, unknown> = {}) {
  const id = crypto.randomUUID(), testRunId = crypto.randomUUID(), at = new Date().toISOString();
  const row = {id, ...payload(1, slots.c, testRunId), manifestNamespace: manifest(values), namespace: `${manifest(values)}:${testRunId}`,
    idempotencyKey: key("same-key", testRunId), createdAt: at, expiresAt: new Date(Date.parse(at) + 3600_000).toISOString(), ...changes};
  const args = [row.id, row.namespace, row.manifestNamespace, values.CAPACITY_PROJECT_ID, values.CAPACITY_REGISTRATION_REVISION,
    values.CAPACITY_DEPLOYMENT_REVISION, values.CAPACITY_FRONTEND_BUNDLE_DIGEST, values.CAPACITY_POLICY_ID, row.testRunId,
    row.marker, row.customer, row.email, row.slot, row.partySize, row.idempotencyKey, row.createdAt, row.expiresAt, values.CAPACITY_PROTOCOL, values.CAPACITY_VALIDATION_PROFILE];
  sqlite.prepare(`INSERT INTO seller_capacity_expanded_receipts
    (id,namespace,manifest_namespace,project_id,registration_revision,deployment_revision,frontend_bundle_digest,policy_id,test_run_id,marker,customer,email,slot,party_size,idempotency_key,created_at,expires_at,protocol,validation_profile)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...args as (string | number | null)[]);
  return row;
}
const count = (sqlite: DatabaseSync) => sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capacity_expanded_receipts").get()!.n;

test("expanded append-only schema preserves existing v3 rows and uses complete standalone/hosted SQL chunks", async () => {
  assert.equal(expanded, hosted);
  assert.equal(schema, readFileSync(new URL("./fixtures/seller-staging-hosted/0004_capacity_reference.sql", import.meta.url), "utf8"));
  const sqlite = new DatabaseSync(":memory:");
  try {
    apply(sqlite, schema);
    const env = {...config, CAPACITY_PROTOCOL: "booking-http-v3", CAPACITY_DB: d1(sqlite)};
    const original = await handleCapacityRequest(post(payload(5, slots.a), "race-a"), env); assert.equal(original.status, 201); const saved = await receipt(original);
    apply(sqlite, expanded);
    assert.deepEqual(await object(await handleCapacityRequest(get(saved.id), env)), saved);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capacity_receipts").get()!.n, 1); assert.equal(count(sqlite), 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'seller_capacity_expanded_%'").get()!.n, 4);
    const meta = await object(await handleCapacityRequest(new Request(`${origin}/pbp/meta`), {...env, CAPACITY_PROTOCOL: "booking-http-v4"}));
    assert.equal(meta.protocol, "booking-http-v4"); assert.equal(meta.maxPartySize, 6); assert.equal(meta.maxGuestsPerSlot, 8);
    assert.equal(Object.hasOwn(meta, "validationProfile"), false); assert.equal(Object.hasOwn(meta, "enforce_email"), false);
  } finally {sqlite.close();}
});

test("strict v4 rejects missing/invalid fields and numeric coercion before touching storage; v3 keeps old slot/key limits", async () => {
  let accesses = 0;
  const env = {...config, CAPACITY_DB: {prepare() {accesses++; throw new Error("storage must not be touched");}}};
  const missing = {...payload(1, slots.a)} as Record<string, unknown>; delete missing.slot;
  for (const [value, suffix, status, code] of [
    [missing, "missing-slot", 400, "synthetic_validation_failed"], [{...payload(1, slots.a), email: "not-an-email"}, "invalid-email", 400, "synthetic_validation_failed"],
    ...[[0, "zero"], [1.5, "fraction"], [-1, "negative"], ["1", "string"]].map(([n, suffix]) => [payload(n, slots.a), suffix, 422, "party_size_invalid"]),
  ] as [unknown, string, number, string][]) {
    const response = await handleCapacityRequest(post(value, suffix), env); assert.equal(response.status, status); assert.equal((await object(response)).code, code);
  }
  for (const value of [{...payload(), email: "real@example.com"}, {...payload(), validationProfile: "email-gap"}, {...payload(), slot: "2099-01-01T15:00:00Z"}]) assert.equal((await handleCapacityRequest(post(value), env)).status, 400);
  assert.equal((await handleCapacityRequest(post(payload(), "unknown"), env)).status, 400);
  assert.equal((await handleCapacityRequest(post(payload(), "same-key"), {...env, CAPACITY_PROTOCOL: "booking-http-v3"})).status, 400);
  assert.equal((await handleCapacityRequest(post(payload(1, slots.a), "one"), {...env, CAPACITY_PROTOCOL: "booking-http-v3"})).status, 400);
  assert.equal(accesses, 0);
});

test("expanded slots retain actual distinct receipts, same-key replay and changed-payload conflict", async () => {
  const {sqlite, env} = database();
  try {
    const records = [];
    for (const [slot, n, suffix] of [[slots.c, 1, "same-key"], [slots.d, 1, "one"], [slots.e, 5, "below"]] as const) {
      const response = await handleCapacityRequest(post(payload(n, slot), suffix), env); assert.equal(response.status, 201); records.push(await receipt(response));
    }
    assert.equal(new Set(records.map(row => row.id)).size, 3); assert.equal(count(sqlite), 3);
    const replay = await handleCapacityRequest(post(), env); assert.equal(replay.status, 200); assert.deepEqual(await object(replay), records[0]);
    const conflict = await handleCapacityRequest(post(payload(2)), env); assert.equal(conflict.status, 409); assert.equal((await object(conflict)).code, "idempotency_conflict");
    for (const saved of records) assert.deepEqual(await object(await handleCapacityRequest(get(saved.id), env)), saved);
    for (const [slot, n] of [["c", 1], ["d", 1], ["e", 5]] as const) {
      const occupancy = await object(await handleCapacityRequest(new Request(`${origin}/pbp/occupancy/${runId}/${slot}`), env)); assert.equal(occupancy.guestCount, n); assert.ok(Array.isArray(occupancy.bookingIds)); assert.equal(occupancy.bookingIds.length, 1);
    }
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capacity_receipts").get()!.n, 0);
  } finally {sqlite.close();}
});

test("operator-only email gap creates real invalid-email storage while native strict SQL and capacity remain authoritative", async () => {
  const {sqlite, env} = database();
  try {
    assert.throws(() => seed(sqlite, config, {email: "not-an-email"}), /seller_capacity_email_invalid/u);
    assert.throws(() => seed(sqlite, config, {email: "person@example.com"}));
    const gapConfig = {...config, CAPACITY_VALIDATION_PROFILE: "email-gap"};
    const gap = {...env, ...gapConfig};
    const response = await handleCapacityRequest(post({...payload(1, slots.a), email: "not-an-email"}, "invalid-email"), gap);
    assert.equal(response.status, 201); const saved = await receipt(response);
    assert.equal(saved.email, "not-an-email"); assert.equal(sqlite.prepare("SELECT email FROM seller_capacity_expanded_receipts WHERE id=?").get(saved.id)!.email, "not-an-email");
    assert.deepEqual(await object(await handleCapacityRequest(get(saved.id), gap)), saved);
    const first = seed(sqlite, gapConfig, {partySize: 5});
    assert.throws(() => seed(sqlite, gapConfig, {testRunId: first.testRunId, marker: first.marker, namespace: first.namespace,
      idempotencyKey: key("one", first.testRunId), partySize: 4}), /seller_slot_capacity_exceeded/u);
    assert.throws(() => seed(sqlite, gapConfig, {partySize: 7}), /seller_capacity_party_exceeded/u);
    for (const change of [{CAPACITY_VALIDATION_PROFILE: "unknown"}, {CAPACITY_VALIDATION_PROFILE: "email-gap", CAPACITY_POLICY_ID: "overbook"}, {CAPACITY_PROTOCOL: "booking-http-v5"}]) {
      const rejected = await handleCapacityRequest(new Request(`${origin}/pbp/meta`), {...env, ...change}); assert.equal(rejected.status, 503); assert.equal((await object(rejected)).code, "configuration_unavailable");
    }
  } finally {sqlite.close();}
});

test("new protocol and validation profile isolate stored receipt identities without changing historical v3 namespace", async () => {
  const {sqlite, env} = database();
  try {
    const v3gap = {...env, CAPACITY_PROTOCOL: "booking-http-v3", CAPACITY_VALIDATION_PROFILE: "email-gap"};
    const response = await handleCapacityRequest(post(payload(1, slots.a), "race-a"), v3gap); assert.equal(response.status, 201); const saved = await receipt(response);
    const row = sqlite.prepare("SELECT protocol,validation_profile,manifest_namespace FROM seller_capacity_expanded_receipts WHERE id=?").get(saved.id)!;
    assert.equal(row.protocol, "booking-http-v3"); assert.equal(row.validation_profile, "email-gap"); assert.ok(String(row.manifest_namespace).endsWith(":booking-http-v3:email-gap"));
    assert.equal((await handleCapacityRequest(get(saved.id), {...v3gap, CAPACITY_PROTOCOL: "booking-http-v4"})).status, 404);
    assert.equal((await handleCapacityRequest(get(saved.id), {...env, CAPACITY_PROTOCOL: "booking-http-v4"})).status, 404);
    const meta = await object(await handleCapacityRequest(new Request(`${origin}/pbp/meta`), v3gap)); assert.equal(meta.protocol, "booking-http-v3");
  } finally {sqlite.close();}
});

const threadSource = `
const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');
(async()=>{const {handleCapacityRequest}=await import(workerData.moduleUrl);const sqlite=new DatabaseSync(workerData.filename);sqlite.exec('PRAGMA busy_timeout=5000');
const db={prepare(sql){const s=sqlite.prepare(sql);return{bind(...args){return{async first(){return s.get(...args)??null},async all(){return{success:true,results:s.all(...args)}},async run(){return{success:true,meta:{changes:Number(s.run(...args).changes)}}}}}}}};
parentPort.postMessage({ready:true});await new Promise(resolve=>parentPort.once('message',resolve));
try{const response=await handleCapacityRequest(new Request(workerData.url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':workerData.key},body:JSON.stringify(workerData.payload)}),{...workerData.config,CAPACITY_DB:db});parentPort.postMessage({status:response.status,body:await response.json()})}finally{sqlite.close()}
})().catch(error=>parentPort.postMessage({error:String(error)}));`;
async function race(filename: string, parties: number[]) {
  const workers: Worker[] = [], ready: Promise<void>[] = [], results: Promise<{status: number; body: Record<string, unknown>}>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    for (const party of parties) {
      const worker = new Worker(threadSource, {eval: true, workerData: {filename, config, payload: payload(party), key: key(), url: `${origin}/pbp/bookings`, moduleUrl: new URL("../examples/seller-capacity-staging/worker/capacity-service.mjs", import.meta.url).href}}); workers.push(worker);
      ready.push(new Promise((resolve, reject) => {worker.on("message", message => {if (message.ready) resolve(); else if (message.error) reject(new Error(message.error));}); worker.on("error", reject);}));
      results.push(new Promise((resolve, reject) => {worker.on("message", message => {if (message.status) resolve(message); else if (message.error) reject(new Error(message.error));}); worker.on("error", reject);}));
    }
    return await Promise.race([(async () => {await Promise.all(ready); workers.forEach(worker => worker.postMessage("go")); return Promise.all(results);})(), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error("Expanded native race timed out")), 8000);})]);
  } finally {clearTimeout(timer); await Promise.all(workers.map(worker => worker.terminate()));}
}

test("independent native SQLite connections produce one201/one200 for v4 same key, and one201/one409 for changed payload", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pbp-expanded-race-")), filename = path.join(dir, "capacity.sqlite"), {sqlite} = database(filename);
  try {
    const same = await race(filename, [1, 1]); assert.deepEqual(same.map(row => row.status).sort(), [200, 201]); assert.deepEqual(same[0].body, same[1].body); assert.equal(count(sqlite), 1);
    sqlite.exec("DELETE FROM seller_capacity_expanded_receipts");
    const conflict = await race(filename, [1, 2]); assert.deepEqual(conflict.map(row => row.status).sort(), [201, 409]); assert.equal(conflict.find(row => row.status === 409)!.body.code, "idempotency_conflict"); assert.equal(count(sqlite), 1);
  } finally {sqlite.close(); rmSync(dir, {recursive: true, force: true});}
});

test("expanded global cap and bounded expired-key cleanup retain replay semantics in the new table", async () => {
  const {sqlite, env} = database();
  try {
    const saved = await receipt(await handleCapacityRequest(post(), env));
    sqlite.prepare("UPDATE seller_capacity_expanded_receipts SET created_at=?,expires_at=? WHERE id=?").run("2001-01-01T00:00:00.000Z", "2001-01-01T01:00:00.000Z", saved.id);
    for (let i = 0; i < 100; i++) seed(sqlite, config, {createdAt: "2000-01-01T00:00:00.000Z", expiresAt: "2000-01-01T01:00:00.000Z"});
    assert.equal(count(sqlite), 101); const recreated = await handleCapacityRequest(post(), env); assert.equal(recreated.status, 201); const current = await receipt(recreated); assert.notEqual(current.id, saved.id); assert.equal(count(sqlite), 2);
    sqlite.exec("DELETE FROM seller_capacity_expanded_receipts");
    const first = await receipt(await handleCapacityRequest(post(payload(1, slots.a), "race-a"), env)); for (let i = 0; i < 998; i++) seed(sqlite);
    const last = await Promise.all([handleCapacityRequest(post(payload(1, slots.a), "fill"), env), handleCapacityRequest(post(payload(1, slots.a), "extra"), env)]); assert.deepEqual(last.map(row => row.status).sort(), [201, 503]); assert.equal(count(sqlite), 1000);
    const replay = await handleCapacityRequest(post(payload(1, slots.a), "race-a"), env); assert.equal(replay.status, 200); assert.equal((await object(replay)).id, first.id);
  } finally {sqlite.close();}
});
