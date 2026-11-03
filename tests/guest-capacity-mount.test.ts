import assert from "node:assert/strict";
import {after, test} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity, validateBookingCapacityPlan} from "../lib/booking-capacity.ts";
import {executeRuntimeCheck} from "../lib/runtime-runner.ts";
import {validateRuntimeReport, type RuntimeCheckTarget} from "../lib/runtime-checks.ts";
import {RUNTIME_TARGETS} from "../lib/runtime-project.ts";
import {validateRuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";

type Worker = {fetch(request: Request, env: Record<string, unknown>): Promise<Response>};
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("wrangler/package.json"))("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "pbp-capacity-mount-"));
after(() => rm(temporary, {recursive: true, force: true}));

// Exercise the actual bundled worker's routing and environment handoff. Static
// assets are deliberately empty: this verifies API mounts, not a browser build.
const bundle = path.join(temporary, "worker.mjs");
await esbuild.build({
  entryPoints: [path.join(root, "app/guest-lab/server.ts")], bundle: true,
  platform: "browser", format: "esm", target: "es2022", outfile: bundle,
  plugins: [{name: "test-assets", setup(build: {
    onResolve(options: {filter: RegExp}, callback: () => unknown): void;
    onLoad(options: {filter: RegExp; namespace: string}, callback: () => unknown): void;
  }) {
    build.onResolve({filter: /^pbp-guest-assets$/}, () => ({path: "assets", namespace: "test-assets"}));
    build.onLoad({filter: /.*/, namespace: "test-assets"}, () => ({contents: "export default {}", loader: "js"}));
  }}],
});
const worker = (await import(pathToFileURL(bundle).href)).default as Worker;
const schema = await readFile(new URL("./fixtures/seller-staging-hosted/0004_capacity_reference.sql", import.meta.url), "utf8");
const party = "Each booking accepts at most 6 people.";
const capacity = "Each time slot accepts at most 8 guests in total.";
const partySource = {start: 0, end: party.length, excerpt: party};
const capacitySource = {start: party.length + 1, end: party.length + 1 + capacity.length, excerpt: capacity};
const plan = validateBookingCapacityPlan({protocol: "booking-http-v3", criterionId: "party", source: partySource,
  policy: suggestBookingPolicy(partySource), slotCapacity: {criterionId: "capacity", ...suggestSlotCapacity(capacitySource)}});

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const chunk of schema.split(/^--> statement-breakpoint\s*$/mu).map(value => value.trim()).filter(Boolean)) sqlite.exec(chunk);
  const binding = {prepare(sql: string) {
    const statement = sqlite.prepare(sql);
    return {bind(...args: (string | number | null)[]) {return {
      async first() {return statement.get(...args) ?? null;},
      async all() {return {success: true, results: statement.all(...args)};},
      async run() {return {success: true, meta: {changes: Number(statement.run(...args).changes)}};},
    };}};
  }};
  return {sqlite, binding};
}

for (const optionalManifest of [true, false]) test(`built operator capacity mount preserves ${optionalManifest ? "optional" : "required-only"} declaration`, async context => {
  const {sqlite, binding} = database();
  try {
    // These are synthetic public test identifiers, not installed credentials.
    const env = {DB: binding, CAPACITY_PROJECT_ID: "registered-capacity-project",
      CAPACITY_REGISTRATION_REVISION: "review-1", CAPACITY_DEPLOYMENT_REVISION: "capacity-build-1",
      CAPACITY_FRONTEND_BUNDLE_DIGEST: "a".repeat(64), CAPACITY_POLICY_ID: "fixed",
      ...(optionalManifest ? {CAPACITY_BACKEND_ARTIFACT_DIGEST: "b".repeat(64), CAPACITY_BACKEND_SOURCE_COMMIT: "c".repeat(40)} : {})};
    const target: RuntimeCheckTarget = {id: "registered-capacity", label: "Synthetic registered capacity",
      baseUrl: "https://lab.example.org/capacity-staging/pbp/", revision: env.CAPACITY_DEPLOYMENT_REVISION,
      protocol: "booking-http-v3", testOnly: true};
    const registration = validateRuntimeRegistrationSnapshot({id: target.id, label: target.label,
      baseUrl: target.baseUrl, protocol: target.protocol, deploymentRevision: target.revision,
      projectId: env.CAPACITY_PROJECT_ID, registrationRevision: env.CAPACITY_REGISTRATION_REVISION,
      frontendBundleDigest: env.CAPACITY_FRONTEND_BUNDLE_DIGEST,
      ...(optionalManifest ? {backendArtifactDigest: "b".repeat(64), backendSourceCommit: "c".repeat(40)} : {}),
      expiresAt: "2036-11-03T00:00:00.000Z", testOnly: true, provenance: "operator-approved-declaration"});
    const meta = await (await worker.fetch(new Request(`${target.baseUrl}meta`), env)).json() as Record<string, unknown>;
    assert.equal(Object.hasOwn(meta, "backendArtifactDigest"), optionalManifest);
    assert.equal(Object.hasOwn(meta, "backendSourceCommit"), optionalManifest);
    if (optionalManifest) {assert.equal(meta.backendArtifactDigest, registration.backendArtifactDigest); assert.equal(meta.backendSourceCommit, registration.backendSourceCommit);}
    const input = {deliveryId: "synthetic-delivery", deliveryDigest: registration.frontendBundleDigest, runId: crypto.randomUUID(), plan, target, registration};
    const calls: string[] = [];
    const report = await executeRuntimeCheck(input, {fetch: async (url, init) => {
      const request = new Request(url, init); calls.push(request.method); return worker.fetch(request, env);
    }});
    assert.deepEqual(report.summary, {steps: 17, observed: 17, issues: 0, unavailable: 0});
    assert.deepEqual(validateRuntimeReport(report, input), report);
    assert.equal(calls.filter(method => method === "POST").length, 7);
    assert.equal(calls.filter(method => method === "GET").length, 10);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM seller_capacity_receipts").get()!.n, 3);
    // Independently adjudicate the advisory claim that occupancy and POST paths
    // can be replaced with unsupported paths in an otherwise valid v3 report.
    let rejectedPaths = 0;
    for (const step of report.steps) {
      const tampered = structuredClone(report);
      tampered.steps.find(row => row.id === step.id)!.path = step.method === "POST" ? "bookings/arbitrary" : "bookings";
      assert.throws(() => validateRuntimeReport(tampered, input), /unsupported path/u);
      rejectedPaths++;
    }
    context.diagnostic(JSON.stringify({kind: "capacity-mount-regression", optionalManifest,
      summary: report.summary, getRequests: 10, postRequests: 7, nativeRows: 3, rejectedMalformedPaths: rejectedPaths,
      scope: "bundled worker API mount + actual local SQLite; no real network, providers, remote D1 or deployment"}));
  } finally {sqlite.close();}
});

test("built native capacity fixture mounts retain configured paths, revisions and actual policy behavior", async context => {
  const results = [];
  const targets = RUNTIME_TARGETS.filter(target => target.protocol === "booking-http-v3");
  assert.deepEqual(targets.map(target => target.id).sort(), ["lab-capacity-fixed", "lab-capacity-flawed", "lab-capacity-underlimit"]);
  for (const target of targets) {
    const {sqlite, binding} = database();
    try {
      const env = {DB: binding};
      const metaResponse = await worker.fetch(new Request(`${target.baseUrl}meta`), env);
      assert.equal(metaResponse.status, 200);
      const meta = await metaResponse.json() as Record<string, unknown>;
      assert.equal(meta.revision, target.revision); assert.equal(meta.protocol, target.protocol);
      const input = {deliveryId: "synthetic-fixture-delivery", deliveryDigest: "0".repeat(64), runId: crypto.randomUUID(), plan, target};
      const report = await executeRuntimeCheck(input, {fetch: (url, init) => worker.fetch(new Request(url, init), env)});
      assert.deepEqual(validateRuntimeReport(report, input), report);
      const rows = sqlite.prepare("SELECT slot,party_size FROM seller_capacity_receipts").all();
      const slotAGuests = rows.filter(row => row.slot === "2099-01-01T10:00:00Z").reduce((sum, row) => sum + Number(row.party_size), 0);
      if (target.id === "lab-capacity-fixed") {assert.equal(report.summary.observed, 17); assert.equal(slotAGuests, 8);}
      else if (target.id === "lab-capacity-flawed") {assert.ok(report.summary.issues > 0); assert.equal(slotAGuests, 10);}
      else {assert.ok(report.summary.issues > 0); assert.equal(slotAGuests, 5); assert.equal(report.steps.find(row => row.id === "fill_remainder")!.status, 409);}
      results.push({id: target.id, summary: report.summary, slotAGuests});
    } finally {sqlite.close();}
  }
  context.diagnostic(JSON.stringify({kind: "capacity-built-in-mount-evidence", results,
    scope: "actual bundled route + local SQLite; no outbound HTTP, providers or deployment"}));
});
