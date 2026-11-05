import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { modelFixture, modelTrace, modelInput } from "./model-check-fixture.ts";
import { beginModelCheckRun, finishModelCheckRun } from "../lib/model-check-actions.ts";
import { modelCheckReportFromTrace } from "../lib/model-checks.ts";
import { diagnoseModelReport, modelDiagnosisExplanationPacket, type ModelDiagnosis } from "../lib/model-diagnostics.ts";
import { modelEvidenceContext, currentModelEvidenceExplanation, saveModelEvidenceExplanation, type ModelEvidenceExplanation } from "../lib/model-evidence-explanation.ts";
import { explainModelEvidence } from "../lib/model-evidence-provider.ts";
import { modelExplanationCoverage } from "../lib/model-explanation-coverage.ts";
import { createEvidenceExport, verifyEvidenceExport } from "../lib/evidence-export.ts";
import { DomainError } from "../lib/domain.ts";

const root = path.resolve(import.meta.dirname, "..");
const env = { DEEPSEEK_API_KEY: "synthetic-no-network-key", DEEPSEEK_MODEL: "synthetic-model" };
async function fixture(kind: "two" | "many" | "unknown" | "clean" = "two") {
  const f = await modelFixture(), pending = beginModelCheckRun(f.quote, "seller", modelInput(f.quote, f.registration.id, 4), f.digest, f.registration);
  const run = pending.proof.delivery!.modelRun!, trace = modelTrace(run), find = (id: string) => trace.find(row => row.operationId === id)!;
  if (kind === "two") (find("final_x").body as Record<string, unknown>).status = "cancelled";
  if (kind === "unknown") { find("final_x").status = 503; find("final_y").status = 503; }
  if (kind === "many") {
    const x = find("final_x").body as Record<string, unknown>, y = find("final_y").body as Record<string, unknown>, z = find("final_z").body as Record<string, unknown>;
    x.status = "cancelled"; x.partySize = 5; y.status = "active"; z.status = "cancelled"; z.partySize = 1;
    (find("final_merchant").body as Record<string, unknown>).bookings = JSON.parse(JSON.stringify([x, x, z]));
    for (const row of trace.filter(row => /^final_[abc]$/u.test(row.operationId))) { const body = row.body as Record<string, unknown>; body.guestCount = 99; body.bookingIds = ["synthetic-other"]; }
    for (const id of ["cancel_y", "transfer_x"]) { find(id).status = 400; find(id).body = { code: "synthetic_rejection" }; }
  }
  const report = modelCheckReportFromTrace(run, JSON.parse(JSON.stringify(trace)), new Date().toISOString()), quote = finishModelCheckRun(pending, run.id, report);
  const input = { confirm: true, deliveryId: report.deliveryId, reportId: report.id, previousExplanationId: null };
  const context = await modelEvidenceContext(quote, "buyer", input), diagnosis = diagnoseModelReport(report), packet = modelDiagnosisExplanationPacket(report);
  return { ...f, quote, report, input, context, diagnosis, packet };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function explain(f: Fixture, groups: string[][]) {
  const value = { findings: groups.map(findingIds => ({ findingIds,
    explanation: "The cited saved observations require reconciliation; no code-level root cause is established.",
    retest: "Inspect the saved records and explicitly authorize a fresh isolated check after revision." })),
    limitations: ["Seller-controlled readbacks do not establish all-site correctness."] };
  let mockedCalls = 0;
  const explanation = await explainModelEvidence(f.context, env, async (_url, init) => {
    mockedCalls++; const request = JSON.parse(String(init?.body));
    assert.match(request.messages[0].content, /Cover EVERY supplied diagnostic with severity issue or unknown/u);
    assert.match(request.messages[0].content, /never invent explanations for IDs not supplied/u);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
  });
  assert.equal(mockedCalls, 1);
  return explanation;
}

test("the actual provider/save seam retains partial old-compatible advice while coverage exposes an omitted issue", async () => {
  const f = await fixture(), before = structuredClone(f.quote);
  assert.deepEqual(f.packet.findingIds, ["original_booking_status", "receipt_merchant_agreement"]);
  const explanation = await explain(f, [["receipt_merchant_agreement"]]);
  const saved = await saveModelEvidenceExplanation(f.quote, "buyer", f.input, explanation);
  assert.deepEqual(await currentModelEvidenceExplanation(saved), explanation, "partial historical-schema advice remains readable");
  const originalAdvice = structuredClone(explanation), coverage = modelExplanationCoverage(f.diagnosis, f.packet, explanation);
  assert.deepEqual(coverage.summary, { criticalTotal: 2, explained: 1, providerOmission: 1, packetLimit: 0, notRequested: 0 });
  assert.deepEqual(coverage.rows.map(row => [row.finding.id, row.state]), [["original_booking_status", "provider_omission"], ["receipt_merchant_agreement", "explained"]]);
  assert.equal(saved.proof.delivery!.modelReport!.result.outcome, "violated");
  assert.deepEqual(saved.proof.review, before.proof.review); assert.equal(saved.proof.paymentState, before.proof.paymentState);
  assert.deepEqual(f.quote, before); assert.deepEqual(explanation, originalAdvice);
  const bundle = await createEvidenceExport(saved);
  assert.equal((await verifyEvidenceExport(bundle)).consistency, "consistent", "derived coverage adds no incompatible persisted/export field");
});

test("no usable current explanation is not a provider omission, including an unsent large packet", async () => {
  for (const kind of ["two", "many"] as const) {
    const f = await fixture(kind), coverage = modelExplanationCoverage(f.diagnosis, f.packet);
    assert.ok(coverage.rows.length >= 2); assert.ok(coverage.rows.every(row => row.state === "not_requested"));
    assert.equal(coverage.summary.providerOmission, 0); assert.equal(coverage.summary.packetLimit, 0);
    assert.equal(coverage.summary.notRequested, coverage.summary.criticalTotal);
  }
});

test("supplied-but-unanswered and never-sent critical facts remain separate at the eight-finding input cap", async () => {
  const f = await fixture("many"); assert.ok(f.diagnosis.findings.length > 8); assert.equal(f.packet.findingIds.length, 8);
  const explanation = await explain(f, [f.packet.findingIds.slice(1)]), coverage = modelExplanationCoverage(f.diagnosis, f.packet, explanation);
  assert.equal(coverage.rows.find(row => row.finding.id === f.packet.findingIds[0])!.state, "provider_omission");
  const capped = coverage.rows.filter(row => row.state === "packet_limit");
  assert.ok(capped.length > 0); assert.ok(capped.every(row => !f.packet.findingIds.includes(row.finding.id)));
  assert.equal(coverage.summary.packetLimit, f.packet.omittedFindingCount);
  assert.equal(coverage.summary.providerOmission, 1);
  assert.equal(coverage.summary.explained + coverage.summary.providerOmission + coverage.summary.packetLimit, coverage.summary.criticalTotal);
});

test("overlapping AI groups count an issue once and unknown diagnostic facts stay unknown", async () => {
  const f = await fixture(), explanation = await explain(f, [f.packet.findingIds, [f.packet.findingIds[1]]]);
  const coverage = modelExplanationCoverage(f.diagnosis, f.packet, explanation);
  assert.equal(coverage.summary.explained, 2); assert.equal(coverage.summary.providerOmission, 0);
  const unknown = await fixture("unknown"), partial = await explain(unknown, [[unknown.packet.findingIds[0]]]);
  const rows = modelExplanationCoverage(unknown.diagnosis, unknown.packet, partial).rows;
  assert.equal(unknown.diagnosis.outcome, "inconclusive"); assert.ok(rows.every(row => row.finding.severity === "unknown"));
  assert.ok(rows.some(row => row.state === "provider_omission"));
  assert.equal("accepted" in coverage, false); assert.equal("verdict" in coverage, false);
});

test("foreign/stale report, file, plan, revision and packet inventories cannot contribute explained counts", async () => {
  const f = await fixture(), explanation = await explain(f, [f.packet.findingIds]);
  for (const patch of [{ reportId: "foreign" }, { deliveryDigest: "e".repeat(64) }, { journeyPlanDigest: "e".repeat(64) }, { diagnosisRevision: "future" }]) {
    assert.throws(() => modelExplanationCoverage(f.diagnosis, f.packet, { ...explanation, ...patch } as ModelEvidenceExplanation), DomainError);
  }
  const altered = structuredClone(f.packet); altered.findingIds.reverse();
  assert.throws(() => modelExplanationCoverage(f.diagnosis, altered, explanation), DomainError);
  const future = { ...f.packet, diagnosisRevision: "future" } as unknown as typeof f.packet;
  assert.throws(() => modelExplanationCoverage(f.diagnosis, future, explanation), DomainError);
  assert.throws(() => modelExplanationCoverage({ ...f.diagnosis, reportId: "foreign" }, f.packet, explanation), DomainError);
  const clean = await fixture("clean"), cleanAdvice = await explain(clean, [clean.packet.findingIds]);
  assert.equal(modelExplanationCoverage(clean.diagnosis, clean.packet, cleanAdvice).summary.criticalTotal, 0);
});

// Real React SSR of the shared disclosure AND both real call sites. The single
// async digest hook is replaced with independently validated per-report facts;
// no browser, HTTP request or user study is claimed by these rendering tests.
type UiModules = {
  ModelExplanationCoverage: typeof import("../app/components/ModelExplanationCoverage.tsx").ModelExplanationCoverage;
  ModelCheckPanel: typeof import("../app/components/ModelCheckPanel.tsx").ModelCheckPanel;
  ModelEvidenceReadings: typeof import("../app/components/ModelEvidenceReadings.tsx").ModelEvidenceReadings;
};
const globals = globalThis as typeof globalThis & { __pbpCoverageTestDiagnoses?: Map<string, ModelDiagnosis>; __pbpCoverageTestStates?: Map<string, "checking" | "invalid"> };
let uiPromise: Promise<UiModules> | undefined, uiDirectory: string | undefined;
function uiModules() {
  return uiPromise ??= (async () => {
    uiDirectory = await mkdtemp(path.join(tmpdir(), "pbp-model-coverage-ssr-"));
    const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve("wrangler/package.json"))("esbuild"), outfile = path.join(uiDirectory, "ui.mjs");
    const names = ["ModelExplanationCoverage", "ModelCheckPanel", "ModelEvidenceReadings"];
    await esbuild.build({ stdin: { contents: names.map(name => `export {${name}} from ${JSON.stringify(path.join(root, `app/components/${name}.tsx`))};`).join("\n"), resolveDir: root, loader: "ts" },
      absWorkingDir: root, bundle: true, platform: "node", format: "esm", target: "node22", outfile, logLevel: "silent", loader: { ".css": "empty" },
      plugins: [{ name: "same-react-and-validated-digest-hook", setup(build: { onResolve: (options: unknown, fn: (args: { path: string }) => unknown) => void; onLoad: (options: unknown, fn: () => unknown) => void }) {
        build.onResolve({ filter: /^react(\/|$)/ }, args => ({ path: require.resolve(args.path), external: true }));
        build.onResolve({ filter: /useModelDiagnosis$/ }, () => ({ path: "validated-diagnosis-hook", namespace: "test-hook" }));
        build.onLoad({ filter: /.*/, namespace: "test-hook" }, () => ({ contents: 'export function useModelDiagnosis(delivery){const state=globalThis.__pbpCoverageTestStates?.get(delivery.modelReport?.id);if(state)return{state};const diagnosis=globalThis.__pbpCoverageTestDiagnoses?.get(delivery.modelReport?.id);return diagnosis?{state:"ready",diagnosis,acceptance:"not_accepted"}:{state:"invalid"};}', loader: "js" }));
      } }] });
    return await import(pathToFileURL(outfile).href) as UiModules;
  })();
}
after(async () => { delete globals.__pbpCoverageTestDiagnoses; delete globals.__pbpCoverageTestStates; if (uiDirectory) await rm(uiDirectory, { recursive: true, force: true }); });

test("shared compact SSR labels each omission honestly in both languages and renders existing facts, not AI filler", async () => {
  const ui = await uiModules(), f = await fixture(), explanation = await explain(f, [["receipt_merchant_agreement"]]);
  for (const language of ["en", "zh"] as const) {
    const html = renderToStaticMarkup(createElement(ui.ModelExplanationCoverage, { diagnosis: f.diagnosis, packet: f.packet, explanation, language }));
    assert.match(html, /data-explanation-state="provider_omission"/u);
    assert.match(html, language === "en" ? /Unexplained: 1; not sent because of the input limit: 0/u : /未解释 1 项；因输入上限未发送 0 项/u);
    assert.match(html, language === "en" ? /not generated AI completion/u : /不是 AI 补答/u);
    assert.match(html, language === "en" ? /Original retest notes/u : /原报告复测要点/u);
    assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/u);
    assert.doesNotMatch(html, /<button|<form|<input/u);
  }
  const none = renderToStaticMarkup(createElement(ui.ModelExplanationCoverage, { diagnosis: f.diagnosis, packet: f.packet, language: "en" }));
  assert.match(none, /No usable AI explanation is saved/u); assert.match(none, /data-explanation-state="not_requested"/u);
  assert.doesNotMatch(none, /data-explanation-state="provider_omission"/u);
  const foreign = renderToStaticMarkup(createElement(ui.ModelExplanationCoverage, { diagnosis: f.diagnosis, packet: f.packet, explanation: { ...explanation, reportId: "foreign" }, language: "en" }));
  assert.match(foreign, /was not counted as explained/u); assert.doesNotMatch(foreign, /citation coverage: 2/u);
  const large = await fixture("many"), largeAdvice = await explain(large, [large.packet.findingIds]);
  const capped = renderToStaticMarkup(createElement(ui.ModelExplanationCoverage, { diagnosis: large.diagnosis, packet: large.packet, explanation: largeAdvice, language: "en" }));
  assert.match(capped, /data-explanation-state="packet_limit"/u); assert.match(capped, /not a provider omission/u);
});

test("current and historical UI call sites disclose the same missing issue without substituting another report", async () => {
  const ui = await uiModules(), f = await fixture(), explanation = await explain(f, [["receipt_merchant_agreement"]]);
  const saved = await saveModelEvidenceExplanation(f.quote, "buyer", f.input, explanation);
  globals.__pbpCoverageTestDiagnoses = new Map([[f.report.id, f.diagnosis]]);
  let requests = 0;
  const current = renderToStaticMarkup(createElement(ui.ModelCheckPanel, { quote: saved, role: "buyer", language: "en", enabled: false,
    request: async () => { requests++; throw new Error("SSR must not request anything"); }, onApply: () => { throw new Error("No mutation"); }, onBusy: () => {}, onDecision: () => {} }));
  const historical = renderToStaticMarkup(createElement(ui.ModelEvidenceReadings, { report: f.report, deliveryId: saved.proof.delivery!.id, language: "en", context: { delivery: saved.proof.delivery!, projectId: saved.id } }));
  for (const html of [current, historical]) { assert.match(html, /AI critical-item citation coverage: 1 \/ 2/u); assert.match(html, /data-explanation-state="provider_omission"/u); assert.match(html, /original deterministic report/u); }
  assert.equal(requests, 0); assert.equal(saved.proof.delivery!.modelReport!.result.outcome, "violated");
  const other = await fixture("clean"), otherAdvice = await explain(other, [other.packet.findingIds]);
  const foreignDelivery = { ...saved.proof.delivery!, modelExplanation: otherAdvice };
  const foreign = renderToStaticMarkup(createElement(ui.ModelEvidenceReadings, { report: f.report, deliveryId: saved.proof.delivery!.id, language: "en", context: { delivery: foreignDelivery, projectId: saved.id } }));
  assert.match(foreign, /No usable AI explanation is saved/u); assert.match(foreign, /data-explanation-state="not_requested"/u);
  assert.doesNotMatch(foreign, /AI critical-item citation coverage: 1/u);
});

test("while exact-file validation is pending both real call sites show checking, not missing or explained coverage", async () => {
  const ui = await uiModules(), f = await fixture(), explanation = await explain(f, [["receipt_merchant_agreement"]]);
  const saved = await saveModelEvidenceExplanation(f.quote, "buyer", f.input, explanation);
  globals.__pbpCoverageTestDiagnoses = new Map([[f.report.id, f.diagnosis]]);
  globals.__pbpCoverageTestStates = new Map([[f.report.id, "checking"]]);
  try {
    const current = renderToStaticMarkup(createElement(ui.ModelCheckPanel, { quote: saved, role: "buyer", language: "en", enabled: false,
      request: async () => { throw new Error("No SSR request"); }, onApply: () => {}, onBusy: () => {}, onDecision: () => {} }));
    const historical = renderToStaticMarkup(createElement(ui.ModelEvidenceReadings, { report: f.report, deliveryId: saved.proof.delivery!.id, language: "en", context: { delivery: saved.proof.delivery!, projectId: saved.id } }));
    assert.match(current, /Validating the saved report against this delivery/u);
    assert.match(historical, /Checking the report against this version/u);
    for (const html of [current, historical]) {
      assert.doesNotMatch(html, /AI critical-item citation coverage|No usable AI explanation is saved|data-explanation-state=/u);
      assert.doesNotMatch(html, /The cited saved observations require reconciliation/u);
    }
  } finally { delete globals.__pbpCoverageTestStates; }
});
