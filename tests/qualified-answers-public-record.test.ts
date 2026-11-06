import assert from "node:assert/strict";
import test from "node:test";
import {readFile, readdir, stat} from "node:fs/promises";
import {createHash} from "node:crypto";

const base = new URL("../public/benchmarks/qualified-answers-2026-11-06/", import.meta.url);
const bytes = (path: string) => readFile(new URL(path, base));
const json = async (path: string) => JSON.parse((await bytes(path)).toString());
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

test("the new public inventory hashes all exact records and preserves the official source/license bytes", async () => {
  const manifest = await json("manifest.json"), listed = new Set<string>();
  for (const entry of manifest.artifacts) {
    assert.match(entry.path, /^[A-Za-z0-9/-]+\.json$/u); assert.ok(!entry.path.includes("..")); assert.ok(!listed.has(entry.path)); listed.add(entry.path);
    const raw = await bytes(entry.path); assert.equal(raw.byteLength, entry.bytes, entry.path); assert.equal(sha(raw), entry.sha256, entry.path);
    assert.doesNotMatch(raw.toString(), /\/Users\/|\bsk-[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9_.-]{12,}/u); JSON.parse(raw.toString());
  }
  const actual = [];
  for (const path of await readdir(base, {recursive: true})) if ((await stat(new URL(path, base))).isFile()) actual.push(path);
  assert.deepEqual(actual.sort(), [...listed, "manifest.json"].sort());
  const license = await json("provenance/google-Apache-2-license.json"), original = await json("provenance/google-original-source.json"), provenance = await json("provenance/google-official-source.json");
  assert.equal(sha(Buffer.from(license.text)), license.sha256); assert.equal(license.sha256, provenance.files.find((f: any) => f.path === "LICENSE").sha256);
  assert.equal(sha(Buffer.from(original.source)), original.sha256); assert.equal(original.sha256, provenance.files.find((f: any) => f.path.endsWith("text-input.html")).sha256);
  assert.equal(license.license, "Apache-2.0"); assert.equal(original.commit, provenance.commit); assert.equal(original.executed, false);
});

test("all five stages derive their counts from retained answers with exact corpus/request provenance", async () => {
  const latest = await json("latest.json"), exposures: Record<string, number> = {}; let calls = 0, cost = 0;
  for (const cohort of latest.cohorts) {
    const report = await json(cohort.report), corpus = await json(cohort.corpus), freeze = await json(cohort.requestFreeze);
    assert.equal(report.freezeSha256, freeze.snapshotSha256); assert.equal(cohort.freezeSha256, freeze.snapshotSha256);
    assert.equal(sha(await bytes(cohort.corpus)), freeze.snapshot.corpusSha256);
    assert.equal(report.results.length, corpus.projects.length); let rawMatch = 0, appMatch = 0, criteria = 0, refuted = 0;
    for (const result of report.results) {
      exposures[result.id] = (exposures[result.id] ?? 0) + 1;
      assert.ok(result.raw.bodyComplete && result.raw.bodyText, "complete first provider response must remain retained");
      for (const c of result.criteria) {criteria++; rawMatch += +(c.rawStatus === c.referenceStatus); appMatch += +(c.applicationStatus === c.referenceStatus); refuted += +(c.rawStatus === "supported" && c.applicationStatus === "changes_suggested");}
      const source = corpus.projects.find((p: any) => p.id === result.id).files;
      for (const c of result.application.report?.items.flatMap((i: any) => i.citations) ?? []) assert.equal(source[c.file].slice(c.start, c.end), c.excerpt);
    }
    assert.deepEqual([rawMatch, criteria], [cohort.rawStatusAgreement.count, cohort.rawStatusAgreement.total]);
    assert.deepEqual([appMatch, criteria], [cohort.applicationStatusAgreement.count, cohort.applicationStatusAgreement.total]);
    assert.equal(refuted, cohort.rawSupportedRefutedToSourceChanges); calls += report.accounting.calls; cost += report.accounting.reportedUsageCostUsd;
  }
  assert.equal(calls, latest.accounting.phaseCalls); assert.equal(Object.keys(exposures).length, latest.accounting.phaseDistinctCaseVariants); assert.deepEqual(exposures, latest.accounting.caseExposureCounts);
  assert.ok(Math.abs(cost-latest.accounting.phaseCostUsdEstimate) < 1e-9);
  const previous = JSON.parse(await readFile(new URL("../public/benchmarks/three-gaps-2026-11-06/source-assessment/latest.json", import.meta.url), "utf8"));
  assert.equal(latest.accounting.evaluationCallsInLinkedRecords, previous.accounting.evaluationCalls + calls);
  assert.ok(Math.abs(latest.accounting.estimatedCostUsdInLinkedRecords-previous.accounting.estimatedCostUsd-cost) < 1e-9);
  assert.match(latest.accounting.countingScope, /Not the project lifetime/u); assert.equal(latest.accounting.retryCalls, 0);
});

test("the malformed first reply, intermediate unknown and final two unknowns cannot be replaced by later counts", async () => {
  const latest = await json("latest.json"), first = await json(latest.cohorts.find((c: any) => c.id === "google-four-first").report);
  const malformed = first.results.find((r: any) => r.id === "chrome-canvas-derived-cross-page-label");
  assert.equal(Object.hasOwn(malformed.raw.completion, "limitations"), false); assert.equal(malformed.application.accepted, false); assert.equal(malformed.application.failureReason, "structure");
  const repeat = latest.cohorts.find((c: any) => c.id === "known-three-repeat"); assert.equal(repeat.applicationStatusAgreement.count, 5); assert.equal(repeat.applicationReferenceDefectUnknown.count, 1);
  const final = latest.cohorts.at(-1); assert.equal(final.applicationStatusAgreement.count, 12); assert.equal(final.applicationReferenceDefectUnknown.count, 1); assert.equal(final.applicationCleanUnderAdmission.count, 1);
  const review = await json(latest.finalSevenWholeAnswerReview.artifact); assert.deepEqual(latest.finalSevenWholeAnswerReview.summary, review.summary);
  assert.deepEqual(latest.activeRemainingCases, review.rows.filter((r: any) => r.applicationWholeAnswer.startsWith("qualified"))); assert.equal(latest.activeRemainingCases.length, 2);
  assert.equal(await bytes("reviews/previous-cycle35-root.json").then(sha), sha(await readFile(new URL("../public/benchmarks/three-gaps-2026-11-06/source-assessment/reviews/cycle35-root-review.json", import.meta.url))));
});

test("controlled source refutation is explicit zero-call evidence with original supported audit and exact citations", async () => {
  const latest = await json("latest.json"), replay = await json(latest.controlledIndependentRefutation.artifact);
  assert.equal(replay.providerCalls, 0); assert.equal(replay.rows.length, latest.controlledIndependentRefutation.retainedGenuineRawFalsePassesRefuted);
  for (const row of replay.rows) {
    assert.equal(row.providerCalls, 0); assert.equal(row.raw.items[0].status, "supported"); assert.equal(row.application.items[0].status, "changes_suggested");
    assert.equal(row.quoteUnchanged, true); assert.equal(row.citationSpansPreserved, true);
    assert.deepEqual(row.application.withheldRisks.adjustedCriteria, [{criterionId: "coverage-1", originalStatus: "supported", publishedStatus: "changes_suggested"}]);
  }
  assert.equal(latest.cohorts.at(-1).rawSupportedRefutedToSourceChanges, 0, "this live batch did not exercise a raw supported false positive; do not invent a live correction count");
  assert.equal(latest.accounting.humanParticipants, 0); assert.equal(latest.accounting.independentMerchantIntegrations, 0);
  assert.equal(sha(await bytes("latest.json")), sha(await readFile(new URL("./fixtures/qualified-answers-public-record-review.json", import.meta.url))));
});
