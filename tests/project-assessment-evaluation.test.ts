import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import type { Fetcher } from "../lib/providers.ts";
import { validateProjectCorpus, projectQuote, freezeProjectEvaluation, prepareProjectEvaluation, runProjectEvaluation,
  summarizeProjectEvaluation, type ProjectCorpus, type EvaluationStatus } from "../scripts/run-project-assessment-evaluation.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const corpusText = await readFile(path.join(ROOT, "scripts/assessment-project-corpus-2026-11-04.json"), "utf8");
const corpus = validateProjectCorpus(JSON.parse(corpusText));
const env = { DEEPSEEK_API_KEY: "synthetic-process-key", DEEPSEEK_MODEL: "deepseek-flash" };
function subset(...indices: number[]): ProjectCorpus { return { ...structuredClone(corpus), projects: indices.map(i => structuredClone(corpus.projects[i])) }; }
type Packet = { criteria: { id: string }[]; files: Record<string, string> };
function provider(options: { statuses?: EvaluationStatus[]; usage?: boolean; invalidCitation?: boolean; extraRisk?: boolean; malformed?: boolean; httpStatus?: number } = {}) {
  const bodies: string[] = [], rawBodies: string[] = [];
  const fetcher: Fetcher = async (_url, init) => {
    bodies.push(String(init?.body));
    const packet = JSON.parse(JSON.parse(String(init?.body)).messages[1].content) as Packet;
    const [file, source] = Object.entries(packet.files)[0];
    const quote = options.invalidCitation ? "This exact string never occurs in the file." : source.slice(0, 80);
    const output = { items: packet.criteria.map((criterion, i) => ({ criterionId: criterion.id, status: options.statuses?.[i] ?? "supported",
      explanation: i === 0 ? "A deliberately questionable semantic explanation retained for independent review." : "Synthetic source finding.", citations: [{ file, excerpt: quote }] })),
      risks: options.extraRisk ? [{ title: "A synthetic risk", explanation: "This potentially mistaken inference must remain available to the independent adjudicator.", suggestion: "Compare all source and requirement wording.", citations: [{ file, excerpt: quote }] }] : [],
      limitations: ["Synthetic model limitation remains verbatim."] };
    const body = JSON.stringify({ model: "DeepSeek-V4.1-Flash-1017", choices: [{ finish_reason: "stop", message: { content: options.malformed ? "{invalid model JSON" : JSON.stringify(output) } }],
      ...(options.usage === false ? {} : { usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 } }) });
    rawBodies.push(body); return new Response(body, { status: options.httpStatus ?? 200 });
  };
  return { fetcher, bodies, rawBodies };
}
async function run(input: ProjectCorpus, fetcher: Fetcher, options: { maxCalls?: number; maxUsd?: number; onResult?: NonNullable<Parameters<typeof runProjectEvaluation>[1]>["onResult"] } = {}) {
  const frozen = await freezeProjectEvaluation(input);
  return runProjectEvaluation(input, { live: true, env, maxCalls: options.maxCalls ?? input.projects.length, maxUsd: options.maxUsd ?? .1, frozen, fetcher, onResult: options.onResult });
}

test("new cohort has twelve distinct multi-file projects and 24 audited source labels, not historical cases", async () => {
  assert.equal(corpus.projects.length, 12); assert.equal(corpus.projects.flatMap(p => p.criteria).length, 24);
  assert.deepEqual(Object.fromEntries(["supported", "changes_suggested", "insufficient_evidence"].map(s => [s, corpus.projects.flatMap(p => p.criteria).filter(c => c.reference.expectedStatus === s).length])),
    { supported: 14, changes_suggested: 6, insufficient_evidence: 4 });
  assert.equal(corpus.projects.filter(p => p.stratum === "clean").length, 4);
  const preparation = await prepareProjectEvaluation(corpus);
  assert.ok(preparation.snapshot.implementation.some(row => row.file === "lib/delivery-assessment.ts"));
  assert.ok(preparation.snapshot.implementation.some(row => row.file === "lib/providers.ts"));
  assert.ok(preparation.snapshot.implementation.some(row => row.file === "lib/static-project.ts"));
  assert.ok(preparation.snapshot.implementation.some(row => row.file === "lib/static-resources.ts"));
  for (const p of preparation.prepared) {
    for (const [file, source] of Object.entries(p.project.files)) if (/\.(?:html|css)$/u.test(file)) assert.equal(p.packet.files[file], source);
    assert.deepEqual(p.plan.coverage.truncatedFiles, []);
  }
  const image = preparation.prepared.find(p => p.project.id === "image-and-mobile-boundary")!;
  assert.ok(image.plan.coverage.omittedFiles.includes("poster.png")); assert.ok(!image.body.includes("iVBORw0KGgo"));
});

test("dry run has no model or network results and never mutates the source workflow", async () => {
  let calls = 0; const before = JSON.stringify(corpus), report = await runProjectEvaluation(corpus, { fetcher: async () => { calls++; throw new Error("No I/O."); } });
  assert.equal(calls, 0); assert.equal(report.accounting.calls, 0); assert.equal(report.accounting.stopReason, "dry_run_no_provider_calls");
  assert.ok(report.results.every(r => !r.attempted && !r.raw && !r.application)); assert.equal(report.summary.overall.attemptedCriteria, 0);
  assert.equal(JSON.stringify(corpus), before);
  const quote = projectQuote(corpus.projects[0]); assert.equal(quote.proof.paymentState, "unfunded"); assert.equal(quote.proof.acceptedDeliveryId, undefined);
});

test("references, category IDs and labels are stripped from real multi-criterion provider requests", async () => {
  const input = subset(0), marker = "REFERENCE-PRIVATE-TO-SCORER";
  input.projects[0].criteria[0].reference.rationale = marker;
  const p = provider(), report = await run(input, p.fetcher);
  assert.equal(report.accounting.calls, 1); assert.equal(report.results[0].criteria.length, 2);
  for (const forbidden of [marker, '"expectedStatus"', '"reference"', '"stratum"', input.projects[0].id]) assert.ok(!p.bodies[0].includes(forbidden), forbidden);
  assert.equal(report.results[0].application?.report?.items.length, 2);
  assert.ok(report.results[0].application?.report?.items.every(i => i.ruleEvidenceIds.length === 1));
});

test("freeze is deterministic across independently generated upload fixtures and includes exact corpus bytes", async () => {
  const a = await freezeProjectEvaluation(corpus, { corpusText }), b = await freezeProjectEvaluation(corpus, { corpusText });
  assert.equal(a.snapshotSha256, b.snapshotSha256); assert.deepEqual(a.snapshot.projects.map(p => p.requestBody), b.snapshot.projects.map(p => p.requestBody));
  assert.equal(a.snapshot.corpusEncoding, "exact-file-utf8");
  assert.notEqual((await freezeProjectEvaluation(corpus, { corpusText: `${corpusText} ` })).snapshotSha256, a.snapshotSha256);
  await assert.rejects(freezeProjectEvaluation(corpus, { corpusText: "{}" }), /Corpus bytes/u);
});

test("changed source, criteria, reference or frozen request denies all live I/O", async () => {
  const original = subset(0), frozen = await freezeProjectEvaluation(original); let calls = 0;
  const fetcher: Fetcher = async () => { calls++; throw new Error("Must not run."); };
  for (const mutate of [
    (input: ProjectCorpus) => { input.projects[0].files["menu-en.html"] += "<!-- changed source -->"; },
    (input: ProjectCorpus) => { input.projects[0].criteria[0].source += " Updated requirement."; },
    (input: ProjectCorpus) => { input.projects[0].criteria[0].reference.expectedStatus = "changes_suggested"; },
  ]) {
    const input = structuredClone(original); mutate(input);
    await assert.rejects(runProjectEvaluation(input, { live: true, env, maxCalls: 1, maxUsd: .1, frozen, fetcher }), /Frozen corpus/u);
  }
  const tampered = structuredClone(frozen); tampered.snapshot.projects[0].requestBody += " ";
  await assert.rejects(runProjectEvaluation(original, { live: true, env, maxCalls: 1, maxUsd: .1, frozen: tampered, fetcher }), /Frozen corpus/u);
  assert.equal(calls, 0);
});

test("working-tree source change is detected independently of HEAD before provider I/O", async () => {
  const input = subset(0), frozen = await freezeProjectEvaluation(input), sourceRoot = await mkdtemp(path.join(os.tmpdir(), "pbp-project-freeze-"));
  try {
    for (const row of frozen.snapshot.implementation) {
      const dest = path.join(sourceRoot, row.file); await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, await readFile(path.join(ROOT, row.file)));
    }
    await writeFile(path.join(sourceRoot, "lib/delivery-assessment.ts"), `${await readFile(path.join(ROOT, "lib/delivery-assessment.ts"), "utf8")}\n// New unreviewed working-tree prompt revision.\n`);
    let calls = 0;
    await assert.rejects(runProjectEvaluation(input, { live: true, env, maxCalls: 1, maxUsd: .1, frozen, sourceRoot, fetcher: async () => { calls++; throw new Error("No."); } }), /working-tree implementation/u);
    assert.equal(calls, 0);
  } finally { await rm(sourceRoot, { recursive: true, force: true }); }
});

test("complete provider body, extra risks, limitations and full application report survive capture", async () => {
  const p = provider({ extraRisk: true }), report = await run(subset(0), p.fetcher), result = report.results[0];
  assert.equal(result.raw?.bodyText, p.rawBodies[0]); assert.equal(result.raw?.bodyComplete, true);
  assert.equal((result.raw?.risks as unknown[]).length, 1); assert.deepEqual(result.raw?.limitations, ["Synthetic model limitation remains verbatim."]);
  assert.equal(result.application?.report?.risks.length, 1); assert.ok(result.application!.report!.limitations.length > 1);
  assert.equal(result.raw?.riskCitationChecks[0][0].valid, true);
  assert.equal(result.criteria[0].rawCitations[0].valid, true); assert.equal(result.criteria[0].applicationCitations[0].valid, true);
  assert.equal(result.wholeAnswerSemanticReview, "pending_independent_adjudication");
  assert.equal(report.summary.overall.pendingWholeAnswerReviews, 1); assert.equal(report.summary.overall.pendingSemanticCriterionReviews, 2);
  assert.ok(result.application!.report!.items[0].explanation.includes("questionable semantic"));
});

test("raw unsupported runtime assurance remains separate from application forced unknown", async () => {
  const p = provider(), report = await run(subset(10), p.fetcher), result = report.results[0];
  assert.deepEqual(result.criteria.map(c => c.rawStatus), ["supported", "supported"]);
  assert.deepEqual(result.criteria.map(c => c.applicationStatus), ["insufficient_evidence", "insufficient_evidence"]);
  assert.deepEqual(report.summary.overall.raw.justifiedUnknown, { count: 0, total: 2, fraction: 0 });
  assert.deepEqual(report.summary.overall.application.justifiedUnknown, { count: 2, total: 2, fraction: 1 });
  assert.equal(report.summary.overall.raw.unsupportedRuntimeAssurance.count, 2);
});

test("invalid citation and malformed output retain all original data while the application rejects", async () => {
  const invalid = provider({ extraRisk: true, invalidCitation: true }), a = await run(subset(0), invalid.fetcher);
  assert.equal(a.results[0].application?.accepted, false); assert.equal(a.results[0].raw?.bodyText, invalid.rawBodies[0]);
  assert.equal(a.results[0].criteria[0].rawCitationValidity, "invalid"); assert.equal(a.results[0].criteria[0].applicationStatus, "error");
  const malformed = provider({ malformed: true }), b = await run(subset(0), malformed.fetcher);
  assert.equal(b.results[0].raw?.contentText, "{invalid model JSON"); assert.equal(b.results[0].criteria[0].rawStatus, "invalid");
  assert.equal(b.results[0].application?.accepted, false);
});

test("unseen reference metrics distinguish missed defect, conservative unknown, false alarm and justified unknown", async () => {
  const p = provider(), report = await run(subset(0, 4, 10), p.fetcher);
  const results = structuredClone(report.results);
  results[0].criteria[0].rawStatus = "changes_suggested";
  results[1].criteria.find(c => c.referenceStatus === "changes_suggested")!.rawStatus = "insufficient_evidence";
  results[2].criteria[0].rawStatus = "insufficient_evidence";
  const summary = summarizeProjectEvaluation(results);
  assert.deepEqual(summary.overall.raw.defectDetected, { count: 0, total: 1, fraction: 0 });
  assert.deepEqual(summary.overall.raw.defectFalsePass, { count: 0, total: 1, fraction: 0 });
  assert.deepEqual(summary.overall.raw.defectConservativeUnknown, { count: 1, total: 1, fraction: 1 });
  assert.equal(summary.overall.raw.falseAlarmOnClean.count, 1); assert.equal(summary.overall.raw.falseAlarmOnClean.total, 3);
  assert.deepEqual(summary.overall.raw.justifiedUnknown, { count: 1, total: 2, fraction: .5 });
  assert.equal(summary.byStratum.clean.attemptedCriteria, 2); assert.equal(summary.byStratum.boundary.attemptedCriteria, 2);
});

test("bounded cost and max calls reject before I/O; unknown usage and ambiguity stop without retry", async () => {
  const input = subset(0, 1), p = provider();
  const budget = await run(input, p.fetcher, { maxUsd: .000001 }); assert.equal(budget.accounting.calls, 0); assert.equal(budget.accounting.stopReason, "budget_reservation_rejected");
  const one = await run(input, p.fetcher, { maxCalls: 1 }); assert.equal(one.accounting.calls, 1); assert.equal(one.accounting.stopReason, "max_calls_reached");
  const missing = provider({ usage: false }), unknown = await run(input, missing.fetcher);
  assert.equal(missing.bodies.length, 1); assert.equal(unknown.accounting.stopReason, "unknown_usage_stop");
  assert.equal(unknown.accounting.unknownUsageReservedUsd, unknown.results[0].plan.reservedCostUsd); assert.equal(unknown.results[1].attempted, false);
  let calls = 0;
  const ambiguous = await run(input, async () => { calls++; throw new Error("Upstream credential-like diagnostics must not escape."); });
  assert.equal(calls, 1); assert.equal(ambiguous.accounting.stopReason, "unknown_usage_stop"); assert.ok(!JSON.stringify(ambiguous).includes("credential-like"));
  await assert.rejects(runProjectEvaluation(input, { live: true, env, maxCalls: 13, maxUsd: .1 }), /explicit maxCalls/u);
});

test("known-usage HTTP errors, excess usage and durable attempt errors prevent subsequent calls", async () => {
  const input = subset(0, 1), http = provider({ httpStatus: 503 }), failure = await run(input, http.fetcher);
  assert.equal(http.bodies.length, 1); assert.equal(failure.accounting.stopReason, "provider_http_error"); assert.equal(failure.results[0].raw?.bodyText, http.rawBodies[0]);
  const p = provider(); let calls = 0;
  const excess = await run(input, async (url, init) => {
    calls++; const response = await p.fetcher(url, init), body = await response.json() as Record<string, unknown>;
    const tokens = Buffer.byteLength(String(init?.body)) + 4097;
    body.usage = { prompt_tokens: tokens, completion_tokens: 100, total_tokens: tokens + 100 };
    return new Response(JSON.stringify(body));
  });
  assert.equal(calls, 1); assert.equal(excess.accounting.stopReason, "usage_exceeded_conservative_estimate");
  let attempts = 0; const durable = provider();
  await assert.rejects(run(input, durable.fetcher, { onResult: async () => { attempts++; throw new Error("Disk unavailable."); } }), /Disk unavailable/u);
  assert.equal(attempts, 1); assert.equal(durable.bodies.length, 1);
});

test("stream capture is byte bounded and never treats an oversized prefix as complete output or trusted usage", async () => {
  let calls = 0;
  const report = await run(subset(0, 1), async () => {
    calls++;
    let n = 0;
    return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
      if (++n <= 8) controller.enqueue(new TextEncoder().encode("x".repeat(250_000)));
      else controller.close();
    } }));
  });
  const raw = report.results[0].raw!;
  assert.equal(calls, 1); assert.equal(raw.bodyComplete, false); assert.equal(raw.bodyText, null);
  assert.equal(raw.bodyByteCountIsComplete, false); assert.equal(Buffer.byteLength(raw.bodyPrefixText!), 1_000_000);
  assert.equal(raw.providerBody, null); assert.equal(report.results[0].usage, null); assert.equal(report.results[1].attempted, false);
  assert.equal(report.accounting.stopReason, "unknown_usage_stop");
});

test("invalid UTF-8 is explicitly retained as an invalid bounded prefix and stops without replacement-decoding JSON", async () => {
  const report = await run(subset(0, 1), async () => new Response(new Uint8Array([0xff, 0xfe, 0x7b, 0x7d])));
  const raw = report.results[0].raw!;
  assert.equal(raw.utf8Valid, false); assert.equal(raw.bodyComplete, true); assert.equal(raw.bodyByteCountIsComplete, true);
  assert.equal(raw.bodyText, null); assert.ok(raw.bodyPrefixText); assert.equal(raw.providerBody, null);
  assert.equal(report.accounting.calls, 1); assert.equal(report.accounting.stopReason, "unknown_usage_stop");
});

test("CLI discovers orphan attempt outputs before any live request and preserves the existing artifact", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pbp-project-cli-"));
  try {
    const output = path.join(directory, "live.json"), frozenPath = path.join(directory, "freeze.json");
    const frozen = await freezeProjectEvaluation(corpus, { corpusText });
    await writeFile(frozenPath, JSON.stringify(frozen));
    const orphan = `${output}.attempt-${corpus.projects[0].id}.json`; await writeFile(orphan, "prior-attempt-do-not-overwrite");
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/run-project-assessment-evaluation.ts", "--output", output, "--frozen", frozenPath, "--live", "--max-calls", "12", "--max-usd", ".1"],
      { cwd: ROOT, env: { ...process.env, DEEPSEEK_API_KEY: "synthetic-no-call-key" }, timeout: 2000, encoding: "utf8" });
    assert.equal(result.status, 1); assert.match(result.stderr, /Project evaluation stopped/u);
    assert.equal(await readFile(orphan, "utf8"), "prior-attempt-do-not-overwrite");
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), { state: "preparing", live: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("classifier repair follow-up preserves the original counterexamples and labels separate runtime boundary controls", async () => {
  const followup = validateProjectCorpus(JSON.parse(await readFile(path.join(ROOT, "scripts/assessment-project-classifier-followup-2026-11-04.json"), "utf8")));
  assert.equal(followup.projects.length, 4); assert.match(followup.scope, /repair validation, not new unseen/u);
  for (const id of ["cross-page-conflicting-copy", "tour-refund-copy-equivalent"]) {
    assert.deepEqual(followup.projects.find(p => p.id === id), corpus.projects.find(p => p.id === id));
  }
  assert.ok(followup.projects.slice(2).flatMap(p => p.criteria).every(c => c.reference.expectedStatus === "insufficient_evidence"));
  let calls = 0;
  const result = await run(followup, async (url, init) => {
    const p = followup.projects[calls++];
    return provider({ statuses: p.criteria.map(c => c.reference.expectedStatus) }).fetcher(url, init);
  });
  assert.equal(calls, 4); assert.equal(result.summary.overall.application.statusAgreement.count, 8);
  assert.equal(result.summary.overall.application.justifiedUnknown.count, 4);
  assert.equal(result.summary.overall.raw.statusAgreement.count, 8);
});
