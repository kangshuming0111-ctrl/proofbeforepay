import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleCapacityRequest} from "../examples/seller-capacity-staging/worker/capacity-service.mjs";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity, validateBookingCapacityPlan} from "../lib/booking-capacity.ts";
import {executeRuntimeCheck} from "../lib/runtime-runner.ts";
import {validateRuntimeReport, type RuntimeCheckTarget} from "../lib/runtime-checks.ts";

const migrations = ["0001_capacity.sql", "0002_capacity_expanded.sql"].map(name => readFileSync(new URL(`../examples/seller-capacity-staging/migrations/${name}`, import.meta.url), "utf8"));
const party = "Each booking accepts at most 6 people.", capacity = "Each time slot accepts at most 8 guests in total.";
const partySource = {start: 0, end: party.length, excerpt: party}, capacitySource = {start: party.length + 1, end: party.length + 1 + capacity.length, excerpt: capacity};
function planFor(protocol: "booking-http-v3" | "booking-http-v4") {return validateBookingCapacityPlan({protocol, criterionId: "party", source: partySource, policy: suggestBookingPolicy(partySource), slotCapacity: {criterionId: "slot", ...suggestSlotCapacity(capacitySource)}});}
function d1(sqlite: DatabaseSync) {return {prepare(sql: string) {const statement = sqlite.prepare(sql); return {bind(...args: (string | number | null)[]) {return {
  async first() {return statement.get(...args) ?? null;}, async all() {return {success: true, results: statement.all(...args)};}, async run() {return {success: true, meta: {changes: Number(statement.run(...args).changes)}};},
};}};}};}

const cases = [
  {name: "expanded strict", protocol: "booking-http-v4", policy: "fixed", profile: "strict"},
  {name: "expanded real validation gap", protocol: "booking-http-v4", policy: "fixed", profile: "email-gap"},
  {name: "expanded real overbooking", protocol: "booking-http-v4", policy: "overbook", profile: "strict"},
  {name: "shorter v3 valid-email baseline on the same validation-gap implementation", protocol: "booking-http-v3", policy: "fixed", profile: "email-gap"},
] as const;

for (const entry of cases) test(`owned HTTP + expanded native SQL: ${entry.name}`, async context => {
  const sqlite = new DatabaseSync(":memory:"); for (const sql of migrations) for (const chunk of sql.split(/^--> statement-breakpoint\s*$/mu).map(value => value.trim()).filter(Boolean)) sqlite.exec(chunk);
  const revision = `native-${entry.protocol}-${entry.profile}-${entry.policy}`, runId = crypto.randomUUID();
  const env = {CAPACITY_DB: d1(sqlite), CAPACITY_PROJECT_ID: "native-expanded-http", CAPACITY_REGISTRATION_REVISION: "review-1",
    CAPACITY_FRONTEND_BUNDLE_DIGEST: "a".repeat(64), CAPACITY_DEPLOYMENT_REVISION: revision,
    CAPACITY_PROTOCOL: entry.protocol, CAPACITY_POLICY_ID: entry.policy, CAPACITY_VALIDATION_PROFILE: entry.profile};
  const trace: {method: string; path: string; status: number}[] = [];
  const server = createServer(async (request, response) => {
    try {
      const headers = new Headers(); for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(",") : value);
      for (const forbidden of ["authorization", "cookie", "origin"]) assert.equal(headers.has(forbidden), false);
      const buffers: Buffer[] = []; let size = 0; for await (const chunk of request) {size += chunk.length; assert.ok(size <= 4096); buffers.push(Buffer.from(chunk));}
      const body = buffers.length ? Buffer.concat(buffers).toString("utf8") : undefined;
      const call = {method: request.method!, path: request.url!, status: 0}; trace.push(call);
      const result = await handleCapacityRequest(new Request(new URL(request.url!, "http://127.0.0.1"), {method: request.method, headers, ...(body ? {body} : {})}), env);
      call.status = result.status; response.statusCode = result.status; result.headers.forEach((value, name) => response.setHeader(name, value)); response.end(Buffer.from(await result.arrayBuffer()));
    } catch {response.statusCode = 500; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({code: "synthetic_transport_error"}));}
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const target: RuntimeCheckTarget = {id: `native-expanded-${entry.protocol}-${entry.policy}-${entry.profile}`, label: "Owned native SQL coverage reference",
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/pbp/`, revision, protocol: entry.protocol, testOnly: true};
    const input = {deliveryId: "native-expanded-delivery", deliveryDigest: "a".repeat(64), runId, plan: planFor(entry.protocol), target};
    const report = await executeRuntimeCheck(input, {allowLoopback: true}); assert.deepEqual(validateRuntimeReport(report, input), report);
    assert.equal(report.plan.protocol, entry.protocol); assert.equal(report.method, `server-${entry.protocol}`);
    const rows = sqlite.prepare("SELECT id,email,slot,party_size,protocol,validation_profile FROM seller_capacity_expanded_receipts ORDER BY slot,party_size").all();
    assert.ok(rows.every(row => row.protocol === entry.protocol && row.validation_profile === entry.profile));
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capacity_receipts").get()!.n, 0);
    const invalidEmailRows = rows.filter(row => row.email === "not-an-email");
    const slotAGuests = rows.filter(row => row.slot === "2099-01-01T10:00:00Z").reduce((sum, row) => sum + Number(row.party_size), 0);
    if (entry.protocol === "booking-http-v3") {
      assert.deepEqual(report.summary, {steps: 17, observed: 17, issues: 0, unavailable: 0}); assert.equal(trace.length, 17); assert.equal(rows.length, 3); assert.equal(invalidEmailRows.length, 0); assert.equal(slotAGuests, 8);
    } else if (entry.profile === "email-gap") {
      assert.deepEqual(report.summary, {steps: 31, observed: 6, issues: 2, unavailable: 23}); assert.equal(trace.length, 8);
      assert.equal(report.steps.find(row => row.id === "invalid_email")!.status, 201); assert.equal(report.steps.find(row => row.id === "invalid_email")!.outcome, "mismatch");
      assert.equal(report.steps.find(row => row.id === "slot_a_initial")!.outcome, "mismatch"); assert.equal(rows.length, 1); assert.equal(invalidEmailRows.length, 1); assert.equal(slotAGuests, 1);
      assert.ok(trace.at(-1)!.path.includes(`/occupancy/${runId}/a`)); assert.equal(trace.filter(row => row.method === "POST").length, 6);
    } else {
      assert.equal(report.summary.steps, 31); assert.equal(invalidEmailRows.length, 0); assert.equal(rows.length, 6); assert.equal(new Set(rows.map(row => row.id)).size, 6);
      for (const [slot, n] of [["2099-01-01T12:00:00Z", 1], ["2099-01-01T13:00:00Z", 1], ["2099-01-01T14:00:00Z", 5]] as const) assert.deepEqual(rows.filter(row => row.slot === slot).map(row => row.party_size), [n]);
      assert.deepEqual(report.steps.filter(row => row.id === "same_key_first" || row.id === "same_key_second").map(row => row.status).sort(), [200, 201]);
      assert.equal(report.steps.find(row => row.id === "same_key_readback")!.outcome, "observed");
      const lastPost = trace.findLastIndex(row => row.method === "POST"); for (const row of trace.filter(row => row.method === "GET" && row.path.startsWith("/pbp/bookings/"))) assert.ok(trace.indexOf(row) > lastPost);
      if (entry.policy === "fixed") {assert.deepEqual(report.summary, {steps: 31, observed: 31, issues: 0, unavailable: 0}); assert.equal(trace.length, 31); assert.equal(slotAGuests, 8);}
      else {assert.ok(report.summary.issues >= 3); assert.equal(slotAGuests, 10); assert.equal(report.steps.find(row => row.id === "slot_a_after_race")!.outcome, "mismatch");}
    }
    context.diagnostic(JSON.stringify({kind: "native-expanded-http-evidence", protocol: entry.protocol, nativePolicy: entry.policy, validationProfile: entry.profile,
      reportSummary: report.summary, requests: trace.length, GET: trace.filter(row => row.method === "GET").length, POST: trace.filter(row => row.method === "POST").length,
      nativeRows: rows.length, actualInvalidEmailRows: invalidEmailRows.length, slotAGuests, reportSchemaValid: true,
      scope: "owned loopback HTTP and actual native SQLite; no external providers, remote D1, deployment or frontend attestation"}));
  } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); sqlite.close();}
});
