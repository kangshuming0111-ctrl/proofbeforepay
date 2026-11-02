import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleSellerBookingRequest} from "../examples/seller-staging/worker/booking-service.mjs";

const migration = readFileSync(new URL("./fixtures/seller-staging-hosted/0002_seller_reference_staging.sql", import.meta.url), "utf8");
const policyFix = readFileSync(new URL("./fixtures/seller-staging-hosted/0003_seller_reference_policy_fix.sql", import.meta.url), "utf8");
const origin = "https://controlled-seller-staging.example.org";
const v1 = {SELLER_PROJECT_ID: "synthetic-hosted-project", SELLER_REGISTRATION_REVISION: "review-v1",
  SELLER_DEPLOYMENT_REVISION: "seller-native-v1", SELLER_FRONTEND_BUNDLE_DIGEST: "a".repeat(64)};
const v2 = {...v1, SELLER_REGISTRATION_REVISION: "review-v2", SELLER_DEPLOYMENT_REVISION: "seller-native-v2", SELLER_FRONTEND_BUNDLE_DIGEST: "b".repeat(64)};
const runId = "cbbf49f4-cbc8-4b5a-acb7-12d27f847b79";
const payload = (partySize = 7) => ({testRunId: runId, marker: `PBP-${runId}`, customer: "PBP synthetic", email: "pbp-test@example.invalid", slot: "2099-01-01T10:00:00Z", partySize});
const key = `pbp-${runId}`;

/** Execute complete migration chunks, including BEGIN...END trigger bodies.
 * sqlite.exec proves native SQL validity, not the remote Sites/D1 migration
 * transport's parsing, deployment state or transaction scheduling. */
function chunks(sql) {return sql.split(/^--> statement-breakpoint\s*$/mu).map(part => part.trim()).filter(Boolean);}
function apply(sqlite, sql) {for (const statement of chunks(sql)) sqlite.exec(statement);}
/** Lex only statement delimiters outside SQL literals, quoted identifiers and
 * comments. Trigger bodies deliberately remain complete BEGIN...END chunks;
 * their internal semicolons are not treated as migration boundaries. */
function unquotedSql(sql) {
  let bare = "", index = 0;
  while (index < sql.length) {
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index + 2); index = end < 0 ? sql.length : end; bare += " "; continue;
    }
    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2); assert.notEqual(end, -1, "unterminated SQL comment"); index = end + 2; bare += " "; continue;
    }
    if (["'", '"', "`", "["].includes(sql[index])) {
      const close = sql[index] === "[" ? "]" : sql[index]; index++;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] !== close) {index++; continue;}
        if (close !== "]" && sql[index + 1] === close) {index += 2; continue;}
        index++; closed = true; break;
      }
      assert.equal(closed, true, "unterminated SQL literal or identifier"); bare += " "; continue;
    }
    bare += sql[index++];
  }
  return bare.trim();
}
function assertSingleStatementChunks(sql) {
  for (const chunk of chunks(sql)) {
    const bare = unquotedSql(chunk);
    if (/^CREATE\s+TRIGGER\b/iu.test(bare)) {
      assert.match(bare, /\bEND\s*;$/iu, "a trigger must remain a complete BEGIN...END migration chunk");
      continue;
    }
    assert.equal((bare.match(/;/gu) ?? []).length, 1, "non-trigger chunks must contain one SQL statement; add a statement-breakpoint between CREATE TABLE and CREATE INDEX");
    assert.match(bare, /;$/u, "a non-trigger chunk must end at its single statement delimiter");
  }
}
function d1(sqlite) {return {prepare(sql) {
  const statement = sqlite.prepare(sql);
  return {bind(...args) {return {
    async first() {return statement.get(...args) ?? null;},
    async run() {return {success: true, meta: {changes: Number(statement.run(...args).changes)}};},
  };}};
}};}
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  apply(sqlite, migration);
  return {sqlite, env: {...v1, SELLER_DB: d1(sqlite)}};
}
function post(value = payload(), suffix = "") {return new Request(`${origin}/pbp/bookings`, {method: "POST", headers: {"content-type": "application/json", "Idempotency-Key": key + suffix}, body: JSON.stringify(value)});}
function get(id) {return new Request(`${origin}/pbp/bookings/${id}`);}
function applyPolicyFix(sqlite) {apply(sqlite, policyFix);}
function insert(sqlite, values, changes = {}) {
  const id = crypto.randomUUID(), at = new Date().toISOString();
  const row = {id, namespace: `${values.SELLER_PROJECT_ID}:${values.SELLER_REGISTRATION_REVISION}:${values.SELLER_DEPLOYMENT_REVISION}:${values.SELLER_FRONTEND_BUNDLE_DIGEST}`,
    ...payload(), createdAt: at, expiresAt: new Date(Date.parse(at) + 3600_000).toISOString(), idempotencyKey: key, ...changes};
  return sqlite.prepare(`INSERT INTO seller_booking_receipts
    (id,namespace,project_id,registration_revision,deployment_revision,frontend_bundle_digest,test_run_id,marker,customer,email,slot,party_size,idempotency_key,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.id, row.namespace, values.SELLER_PROJECT_ID, values.SELLER_REGISTRATION_REVISION,
    values.SELLER_DEPLOYMENT_REVISION, values.SELLER_FRONTEND_BUNDLE_DIGEST, row.testRunId, row.marker, row.customer, row.email, row.slot,
    row.partySize, row.idempotencyKey, row.createdAt, row.expiresAt);
}

test("hosted migration source keeps each non-trigger statement separate without splitting trigger bodies", () => {
  assertSingleStatementChunks(migration); assertSingleStatementChunks(policyFix);
  assert.throws(() => assertSingleStatementChunks("CREATE TABLE example (value TEXT); CREATE INDEX example_value ON example (value);"), /one SQL statement/u);
  assert.doesNotThrow(() => assertSingleStatementChunks("-- comment with ;\nCREATE VIEW example AS SELECT 'value; -- literal' AS value; /* trailing ; */"));
});

test("hosted schema-only migration executes complete chunks, creates both native triggers and a max7 VIEW without business seed rows", () => {
  const {sqlite} = fixture();
  try {
    const objects = sqlite.prepare("SELECT type,name FROM sqlite_master WHERE name LIKE 'seller_%' ORDER BY name").all().map(row => ({...row}));
    assert.deepEqual(objects, [
      {type: "trigger", name: "seller_booking_capacity_guard"},
      {type: "trigger", name: "seller_booking_policy_guard"},
      {type: "table", name: "seller_booking_receipts"},
      {type: "index", name: "seller_booking_receipts_expiry"},
      {type: "view", name: "seller_business_policy"},
    ]);
    assert.deepEqual({...sqlite.prepare("SELECT * FROM seller_business_policy").get()}, {id: 1, max_party_size: 7});
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM seller_booking_receipts").get().count, 0);
    assert.throws(() => sqlite.prepare("UPDATE seller_business_policy SET max_party_size = 6 WHERE id = 1").run(), /view/u);
  } finally {sqlite.close();}
});

test("hosted max7 declaration genuinely stores and independently reads back a seven-person synthetic receipt", async () => {
  const {sqlite, env} = fixture();
  try {
    const meta = await (await handleSellerBookingRequest(new Request(`${origin}/pbp/meta`), env)).json();
    assert.equal(meta.maxPartySize, 7); assert.equal(meta.revision, v1.SELLER_DEPLOYMENT_REVISION);
    assert.equal(meta.registrationRevision, v1.SELLER_REGISTRATION_REVISION); assert.equal(meta.frontendBundleDigest, v1.SELLER_FRONTEND_BUNDLE_DIGEST);
    assert.equal(meta.deploymentAttestation, false);
    const response = await handleSellerBookingRequest(post(), env); assert.equal(response.status, 201);
    const receipt = await response.json();
    assert.equal(receipt.partySize, 7); assert.equal(receipt.revision, v1.SELLER_DEPLOYMENT_REVISION);
    assert.equal(sqlite.prepare("SELECT party_size FROM seller_booking_receipts WHERE id = ?").get(receipt.id).party_size, 7);
    const readback = await handleSellerBookingRequest(get(receipt.id), env); assert.equal(readback.status, 200); assert.deepEqual(await readback.json(), receipt);
    const replay = await handleSellerBookingRequest(post(), env); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), receipt);
    const conflict = await handleSellerBookingRequest(post(payload(6)), env); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, "idempotency_conflict");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM seller_booking_receipts").get().count, 1);
  } finally {sqlite.close();}
});

test("DROP/CREATE policy VIEW to6 under a new manifest rejects7 and stores6 while preserving old receipt scope and native triggers", async () => {
  const {sqlite, env} = fixture();
  try {
    const oldReceipt = await (await handleSellerBookingRequest(post(), env)).json();
    applyPolicyFix(sqlite);
    const next = {...v2, SELLER_DB: env.SELLER_DB};
    const meta = await (await handleSellerBookingRequest(new Request(`${origin}/pbp/meta`), next)).json();
    assert.equal(meta.maxPartySize, 6); assert.equal(meta.revision, v2.SELLER_DEPLOYMENT_REVISION);
    assert.equal(meta.registrationRevision, v2.SELLER_REGISTRATION_REVISION); assert.equal(meta.frontendBundleDigest, v2.SELLER_FRONTEND_BUNDLE_DIGEST);
    const seven = await handleSellerBookingRequest(post(), next); assert.equal(seven.status, 422); assert.equal((await seven.json()).code, "party_size_exceeded");
    const six = await handleSellerBookingRequest(post(payload(6)), next); assert.equal(six.status, 201); const receipt = await six.json();
    assert.equal(receipt.partySize, 6); assert.equal(receipt.revision, v2.SELLER_DEPLOYMENT_REVISION); assert.notEqual(receipt.id, oldReceipt.id);
    assert.deepEqual(await (await handleSellerBookingRequest(get(receipt.id), next)).json(), receipt);
    assert.equal((await handleSellerBookingRequest(get(oldReceipt.id), next)).status, 404);
    assert.deepEqual(await (await handleSellerBookingRequest(get(oldReceipt.id), env)).json(), oldReceipt);
    // Tightening native policy does not rewrite an already committed old key.
    const oldReplay = await handleSellerBookingRequest(post(), env); assert.equal(oldReplay.status, 200); assert.deepEqual(await oldReplay.json(), oldReceipt);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM seller_booking_receipts").get().count, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'seller_%'").get().count, 2);
    assert.throws(() => insert(sqlite, v2, {partySize: 7, idempotencyKey: key + "-above"}), /seller_party_size_exceeded/u);
  } finally {sqlite.close();}
});

test("hosted SQL policy and synthetic CHECK guards independently refuse oversized, private and unbound direct rows", () => {
  const {sqlite} = fixture();
  try {
    assert.throws(() => insert(sqlite, v1, {partySize: 8}), /seller_party_size_exceeded/u);
    for (const changes of [{customer: "Real customer"}, {email: "customer@example.com"}, {marker: "wrong"}, {namespace: "unbound"}, {partySize: 1.5}]) assert.throws(() => insert(sqlite, v1, changes));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM seller_booking_receipts").get().count, 0);
    applyPolicyFix(sqlite);
    assert.throws(() => insert(sqlite, v2, {partySize: 7}), /seller_party_size_exceeded/u);
    assert.equal(Number(insert(sqlite, v2, {partySize: 6}).changes), 1);
    assert.equal(sqlite.prepare("SELECT party_size FROM seller_booking_receipts").get().party_size, 6);
  } finally {sqlite.close();}
});

test("a hosted VIEW tightened between its policy read and INSERT still rejects the new seven-person row in native SQL", async () => {
  const {sqlite, env} = fixture();
  try {
    let tightened = false;
    const underlying = d1(sqlite);
    const racing = {...env, SELLER_DB: {prepare(sql) {
      const prepared = underlying.prepare(sql);
      return {bind(...args) {
        const bound = prepared.bind(...args);
        return {first: () => bound.first(), async run() {
          if (/^INSERT OR IGNORE/u.test(sql) && !tightened) {tightened = true; applyPolicyFix(sqlite);}
          return bound.run();
        }};
      }};
    }}};
    const result = await handleSellerBookingRequest(post(), racing);
    assert.equal(tightened, true); assert.equal(result.status, 422); assert.equal((await result.json()).code, "party_size_exceeded");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM seller_booking_receipts").get().count, 0);
  } finally {sqlite.close();}
});
