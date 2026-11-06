import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";

const base = new URL("../public/benchmarks/three-gaps-2026-11-06/source-assessment/", import.meta.url);
const bytes = (path: string) => readFile(new URL(path, base));
const json = async (path: string) => JSON.parse(await readFile(new URL(path, base), "utf8"));
const digest = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

test("the public evidence inventory authenticates every retained artifact and exact source-license text", async () => {
  const manifest = await json("manifest.json"), paths = new Set<string>();
  for (const entry of manifest.artifacts) {
    assert.match(entry.path, /^[A-Za-z0-9/-]+\.json$/u);
    assert.ok(!paths.has(entry.path)); paths.add(entry.path);
    const data = await bytes(entry.path);
    assert.equal(data.byteLength, entry.bytes, entry.path); assert.equal(digest(data), entry.sha256, entry.path);
    assert.doesNotMatch(data.toString(), /\/Users\/|\bsk-[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9_.-]{12,}/u);
    JSON.parse(data.toString());
    if (entry.path.includes("root-review")) assert.match(entry.reviewerKind, /Root Codex AI; not human study/u);
  }
  for (const path of ["provenance/mdn-CC0-license.json", "provenance/httpbin-ISC-license.json"]) {
    const license = await json(path);
    assert.equal(digest(Buffer.from(license.text)), license.sha256); assert.match(license.gitBlob, /^[a-f0-9]{40}$/u);
    assert.ok(license.text.length > 500);
  }
});

test("public per-cohort counts replay full retained answers, corpus and freezes without pooling old failures away", async () => {
  const latest = await json("latest.json"), unique = new Set<string>(); let calls = 0, cost = 0;
  for (const cohort of latest.cohorts) {
    const report = await json(cohort.report), corpus = await json(cohort.corpus), freeze = await json(cohort.requestFreeze);
    assert.equal(report.freezeSha256, freeze.snapshotSha256); assert.equal(cohort.freezeSha256, freeze.snapshotSha256);
    assert.equal(digest(await bytes(cohort.corpus)), freeze.snapshot.corpusSha256);
    let raw = 0, application = 0, count = 0;
    for (const project of report.results) {
      unique.add(project.id);
      for (const item of project.criteria) {count++; raw += +(item.rawStatus === item.referenceStatus); application += +(item.applicationStatus === item.referenceStatus);}
      const source = corpus.projects.find((p: any) => p.id === project.id).files;
      for (const citation of project.application.report?.items.flatMap((i: any) => i.citations) ?? [])
        assert.equal(source[citation.file].slice(citation.start, citation.end), citation.excerpt);
    }
    assert.deepEqual([raw, count], [cohort.rawStatusMatches.count, cohort.rawStatusMatches.total]);
    assert.deepEqual([application, count], [cohort.applicationStatusMatches.count, cohort.applicationStatusMatches.total]);
    calls += report.accounting.calls; cost += report.accounting.reportedUsageCostUsd;
  }
  assert.equal(calls, latest.accounting.evaluationCalls); assert.equal(unique.size, latest.accounting.distinctAuthoredCaseVariants);
  assert.ok(Math.abs(cost-latest.accounting.estimatedCostUsd) < 1e-9);
  const baseline = latest.cohorts.find((c: any) => c.id === "baseline-first-eight");
  assert.ok(baseline.applicationRejectedProjects > 0); assert.ok(baseline.rawStatusMatches.count < baseline.rawStatusMatches.total);
  const overAbstained = latest.cohorts.find((c: any) => c.id === "cycle34-httpbin-first-four");
  assert.equal(overAbstained.applicationCleanUnderAdmission.count + overAbstained.applicationDefectConservativeUnknown.count, 6);
  assert.equal(latest.accounting.humanParticipants, 0); assert.equal(latest.accounting.retryCalls, 0);
});

test("latest status success stays separate from qualified application prose and the rejected raw whole answer", async () => {
  assert.equal(digest(await bytes("latest.json")), digest(await readFile(new URL("./fixtures/three-gaps-public-record-review-context.json", import.meta.url))));
  const latest = await json("latest.json"), review = await json(latest.latestWholeAnswerReview.artifact);
  for (const [summary, field] of [["rawWholeAnswerReview", "rawWholeAnswerDecision"], ["applicationWholeAnswerReview", "applicationWholeAnswerDecision"]])
    for (const grade of ["accepted", "qualified", "rejected"])
      assert.equal(latest.latestWholeAnswerReview[summary][grade], review.rows.filter((r: any) => r[field] === grade).length);
  assert.deepEqual(latest.activeApplicationQualifications.map((r: any) => r.id), review.rows.filter((r: any) => r.applicationWholeAnswerDecision === "qualified").map((r: any) => r.id));
  assert.equal(latest.activeApplicationQualifications.length, 3);
  assert.equal(review.rows.find((r: any) => r.id === "mdn-original-runtime-unknown").rawWholeAnswerDecision, "rejected");
  assert.match(latest.cycleDisposition.cycle33, /partial/u); assert.match(latest.cycleDisposition.cycle34, /partial/u);
});
