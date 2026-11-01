import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runEvaluation, VERIFIED_PRICE, type EvaluationCase } from "../scripts/run-assessment-evaluation.ts";
import type { Fetcher } from "../lib/providers.ts";

const html = '<!doctype html><html><head><title>Florist</title></head><body><p>Opening hours: 11am–8pm.</p></body></html>';
const env = { DEEPSEEK_API_KEY: "synthetic-evaluation-key", DEEPSEEK_MODEL: "deepseek-flash" };
function fixture(id = "hours-correct", stratum: EvaluationCase["evaluationStratum"] = "complete-literal", expectedStatus: EvaluationCase["reference"]["expectedStatus"] = "supported"): EvaluationCase {
  return { id, category: expectedStatus === "supported" ? "literal-supported" : "must-abstain", language: "en", criterion: { id: "manual-1", title: "Page content", source: "Display opening hours: 11am–8pm." }, files: { "index.html": html }, evaluationStratum: stratum,
    reference: { expectedStatus, rationale: "THIS-REFERENCE-MUST-NEVER-BE-SENT", requiresHumanSemanticReview: true } };
}
function provider(status = "supported", includeUsage = true, excerpt = "Opening hours: 11am–8pm.") {
  const bodies: string[] = [];
  const fetcher: Fetcher = async (_url, init) => {
    bodies.push(String(init?.body));
    return new Response(JSON.stringify({ model: "deepseek-flash", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ items: [{ criterionId: "manual-1", status, explanation: "Synthetic controlled response.", citations: [{ file: "index.html", excerpt }] }], risks: [], limitations: [] }) } }],
      ...(includeUsage ? { usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 } } : {}) }), { status: 200 });
  };
  return { bodies, fetcher };
}

test("default dry-run uses application packet construction without any network, credentials or model results", async () => {
  let called = 0;
  const report = await runEvaluation([fixture()], { fetcher: async () => { called++; throw new Error("No network allowed."); } });
  assert.equal(called, 0);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.accounting.calls, 0);
  assert.ok(report.results[0].plan.requestUtf8Bytes > 0);
  assert.equal(report.results[0].raw, undefined);
  assert.equal(report.results[0].application, undefined);
  assert.equal(report.results[0].networkAttempted, false);
  assert.equal(report.results[0].httpError, null);
  assert.equal(report.results[0].usageExceededReservation, null);
});

test("live use requires explicit bounded configuration and a verified model", async () => {
  await assert.rejects(runEvaluation([fixture()], { live: true, env }), /explicit --max-calls/u);
  await assert.rejects(runEvaluation([fixture()], { live: true, env, maxCalls: 1, maxUsd: 2 }), /explicit --max-calls/u);
  await assert.rejects(runEvaluation([fixture()], { env: { DEEPSEEK_MODEL: "unverified-price-model" } }), /no verified price/u);
});

test("budget reservation blocks a request before network even when maxCalls permits it", async () => {
  const p = provider();
  const report = await runEvaluation([fixture()], { live: true, env, maxCalls: 1, maxUsd: 0.000001, fetcher: p.fetcher });
  assert.equal(p.bodies.length, 0);
  assert.equal(report.accounting.stopReason, "budget_reservation_rejected");
});

test("an application-admission failure rejects corpus preparation before any real evaluation call", async () => {
  const head = "<!doctype html><html><head><title>Admission</title></head><body>", tail = "</body></html>";
  const escaped = head + "\\".repeat(65536 - Buffer.byteLength(head + tail)) + tail;
  const oversized = fixture("escaped-admission");
  oversized.files = { "index.html": escaped, "second.html": escaped, "third.html": escaped, "fourth.html": escaped };
  const p = provider();
  await assert.rejects(runEvaluation([oversized, fixture("later-eligible")], { live: true, env, maxCalls: 2, maxUsd: 1, fetcher: p.fetcher }),
    /evaluation fixture was rejected before request construction/u);
  assert.equal(p.bodies.length, 0);
});

test("the corpus reference labels never enter the real application request", async () => {
  const p = provider();
  const report = await runEvaluation([fixture()], { live: true, env, maxCalls: 1, maxUsd: .1, fetcher: p.fetcher });
  assert.equal(report.accounting.calls, 1);
  assert.ok(!p.bodies[0].includes("THIS-REFERENCE-MUST-NEVER-BE-SENT"));
  assert.ok(!p.bodies[0].includes('"expectedStatus"'));
  const sent = JSON.parse(p.bodies[0]);
  assert.equal(sent.max_tokens, 1800);
  assert.equal(sent.model, "deepseek-flash");
  assert.equal(report.results[0].raw?.status, "supported");
  assert.equal(report.results[0].application?.status, "supported");
  assert.equal(report.results[0].raw?.citationValidity, "valid");
  assert.equal(report.results[0].networkAttempted, true);
  assert.equal(report.results[0].httpError, false);
  assert.equal(report.results[0].usageExceededReservation, false);
  assert.equal(report.accounting.conservativeReportedUsageCostUsd, (1000 * .3 + 100 * 1.2) / 1e6);
});

test("missing usage stops after the first attempted call and reserves that unknown cost", async () => {
  const p = provider("supported", false);
  const report = await runEvaluation([fixture(), fixture("second-case")], { live: true, env, maxCalls: 2, maxUsd: .1, fetcher: p.fetcher });
  assert.equal(p.bodies.length, 1);
  assert.equal(report.accounting.stopReason, "unknown_usage_stop");
  assert.equal(report.results[1].attempted, false);
  assert.equal(report.results[0].usage, null);
  assert.equal(report.accounting.unknownUsageReservedUsd, report.results[0].plan.reservedCostUsd);
});

test("a network failure has no automatic retry and stops further budget use", async () => {
  let calls = 0;
  const report = await runEvaluation([fixture(), fixture("second-case")], { live: true, env, maxCalls: 2, maxUsd: .1, fetcher: async () => { calls++; throw new Error("Untrusted provider details must not appear in a report."); } });
  assert.equal(calls, 1);
  assert.equal(report.accounting.stopReason, "unknown_usage_stop");
  assert.ok(!JSON.stringify(report).includes("Untrusted provider details"));
});

test("invalid or inconsistent usage is treated as unknown and halts the next call", async () => {
  const p = provider();
  let calls = 0;
  const fetcher: Fetcher = async (url, init) => {
    calls++;
    const response = await p.fetcher(url, init);
    const body = await response.json() as Record<string, unknown>;
    body.usage = { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 9999 };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const report = await runEvaluation([fixture(), fixture("second-case")], { live: true, env, maxCalls: 2, maxUsd: .1, fetcher });
  assert.equal(calls, 1);
  assert.equal(report.results[0].usage, null);
  assert.equal(report.accounting.stopReason, "unknown_usage_stop");
});

test("usage above the input reservation is explicitly flagged and stops further calls", async () => {
  const p = provider(); let calls = 0;
  const fetcher: Fetcher = async (url, init) => {
    calls++;
    const response = await p.fetcher(url, init);
    const body = await response.json() as Record<string, unknown>;
    const promptTokens = new TextEncoder().encode(String(init?.body)).length + 4097;
    body.usage = { prompt_tokens: promptTokens, completion_tokens: 100, total_tokens: promptTokens + 100 };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const report = await runEvaluation([fixture(), fixture("second-case")], { live: true, env, maxCalls: 2, maxUsd: .1, fetcher });
  assert.equal(calls, 1);
  assert.equal(report.results[0].usageExceededReservation, true);
  assert.equal(report.accounting.stopReason, "usage_exceeded_conservative_estimate");
  assert.equal(report.results[1].networkAttempted, false);
});

test("known-usage HTTP failure is explicitly marked and stops without retry", async () => {
  let calls = 0;
  const report = await runEvaluation([fixture(), fixture("second-case")], { live: true, env, maxCalls: 2, maxUsd: .1, fetcher: async () => {
    calls++;
    return new Response(JSON.stringify({ usage: { prompt_tokens: 20, completion_tokens: 0, total_tokens: 20 } }), { status: 503 });
  } });
  assert.equal(calls, 1);
  assert.equal(report.results[0].networkAttempted, true);
  assert.equal(report.results[0].httpError, true);
  assert.equal(report.results[0].usageExceededReservation, false);
  assert.equal(report.accounting.stopReason, "provider_http_error");
  assert.equal(report.results[1].networkAttempted, false);
});

test("maxCalls counts actual attempts and never retries an already evaluated case", async () => {
  const p = provider();
  const report = await runEvaluation([fixture(), fixture("second-case")], { live: true, env, maxCalls: 1, maxUsd: .1, fetcher: p.fetcher });
  assert.equal(p.bodies.length, 1);
  assert.equal(report.accounting.stopReason, "max_calls_reached");
  assert.equal(report.results[1].attempted, false);
});

test("raw model status is not conflated with the application's conservative runtime abstention", async () => {
  const c = fixture("runtime-email", "runtime-or-subjective", "insufficient_evidence");
  c.criterion.source = "The form must send an email after submission.";
  const p = provider("supported");
  const report = await runEvaluation([c], { live: true, env, maxCalls: 1, maxUsd: .1, fetcher: p.fetcher });
  assert.equal(report.results[0].raw?.status, "supported");
  assert.equal(report.results[0].application?.status, "insufficient_evidence");
  assert.equal(report.summaryByStratum["runtime-or-subjective"].correctAbstention.raw.count, 0);
  assert.equal(report.summaryByStratum["runtime-or-subjective"].correctAbstention.application.count, 1);
});

test("invalid citations are recorded separately when the actual application rejects the output", async () => {
  const p = provider("supported", true, "Not present in the supplied source.");
  const report = await runEvaluation([fixture()], { live: true, env, maxCalls: 1, maxUsd: .1, fetcher: p.fetcher });
  assert.equal(report.results[0].raw?.citationValidity, "invalid");
  assert.equal(report.results[0].application?.status, "error");
  assert.equal(report.summaryByStratum["complete-literal"].invalidCitationResponses, 1);
});

test("legacy prefix-only references are preserved but skipped and excluded when the actual HTML input is now complete", async () => {
  const p = provider("changes_suggested");
  const report = await runEvaluation([fixture(), fixture("limited-case", "coverage-limited", "insufficient_evidence")], { live: true, env, maxCalls: 2, maxUsd: .1, fetcher: p.fetcher });
  assert.equal(report.summaryByStratum["complete-literal"].falsePositiveOnClean.raw.total, 1);
  assert.equal(report.summaryByStratum["complete-literal"].falsePositiveOnClean.raw.count, 1);
  assert.equal(report.summaryByStratum["coverage-limited"].correctAbstention.raw.total, 0);
  assert.equal(report.summaryByStratum["coverage-limited"].falsePositiveOnClean.raw.total, 0);
  assert.equal(report.summaryByStratum["coverage-limited"].excludedReferenceScopeMismatch, 1);
  assert.equal(report.summaryByStratum["coverage-limited"].referenceEligible, 0);
  assert.equal(report.results[1].referenceStatus, "insufficient_evidence");
  assert.equal(report.results[1].referenceCompatibility, "reference_scope_mismatch");
  assert.equal(report.results[1].error, "reference_scope_mismatch");
  assert.equal(report.results[1].attempted, false); assert.equal(report.results[1].networkAttempted, false);
  assert.equal(p.bodies.length, 1); assert.equal(report.accounting.calls, 1);
  assert.equal(report.pricing.source, VERIFIED_PRICE.source);
});

test("the separate complete-source corpus covers late correct copy, wrong copy, cross-page conflict and source schema injection", async () => {
  const group = JSON.parse(readFileSync(new URL("../scripts/assessment-complete-source-evaluation-cases.json", import.meta.url), "utf8"));
  assert.equal(group.evaluationGroup, "complete-source-follow-up"); assert.equal(group.synthetic, true);
  assert.equal(group.cases.length, 4);
  const report = await runEvaluation(group.cases);
  assert.equal(report.accounting.calls, 0);
  assert.ok(report.results.every(item => item.referenceCompatibility === "compatible"));
  assert.ok(report.results.every(item => !item.plan.coverage.truncatedFiles.length && !item.plan.coverage.omittedFiles.length));
  assert.deepEqual(group.cases.map((item: EvaluationCase) => item.reference.expectedStatus), ["supported", "changes_suggested", "changes_suggested", "changes_suggested"]);
  assert.ok(group.cases.every((item: EvaluationCase) => item.files["index.html"].length > 6000));
  assert.ok(report.results.every(item => item.plan.outputTokenLimit === 1800));
  assert.ok(group.protocolCounterexamples.invalidStatuses.some(Array.isArray));
});
