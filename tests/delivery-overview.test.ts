import assert from "node:assert/strict";
import test from "node:test";
import type { ProofAssessment, ProofCriterion, ProofDelivery, ProofDeliveryVersion, ProofEvidence } from "../lib/contracts.ts";
import { criterionDisplayTitle, deliveryOverview, overviewFeedbackDraft, overviewRowLabel } from "../lib/delivery-overview.ts";

const criteria: ProofCriterion[] = [
  { id: "page-1", title: "Separate page: index.html", source: "Deliver index.html." },
  { id: "manual-1", title: "Manual requirement 1", source: "Display the opening hours Monday to Friday 11am–8pm." },
  { id: "mobile", title: "Mobile usability", source: "Check the delivered website on a mobile screen." },
];
const evidence = (criterionId: string, finding: ProofEvidence["finding"]): ProofEvidence => ({ id: criterionId, criterionId, finding, file: "index.html", excerpt: "saved source", explanation: `Rule explanation: ${criterionId}` });
const report = (deliveryId: string, status: ProofAssessment["items"][number]["status"] = "changes_suggested"): ProofAssessment => ({
  id: "report", deliveryId, mode: "live", model: "synthetic-no-provider-call", method: "source-ai-v1", assessedAt: "2026-11-01T00:01:00Z",
  items: criteria.map(criterion => ({ criterionId: criterion.id, status: criterion.id === "manual-1" ? status : "insufficient_evidence", explanation: `AI explanation: ${criterion.id}`, citations: [], ruleEvidenceIds: [] })),
  risks: [], limitations: [], coverage: { includedFiles: [], truncatedFiles: [], omittedFiles: [] },
});
const delivery = (id = "v2", sequence = 2): ProofDelivery => ({ id, sequence, variant: "upload", label: id, submittedAt: `2026-11-01T00:0${sequence}:00Z`, evidence: [evidence("page-1", "pass"), evidence("manual-1", "needs_human"), evidence("mobile", "needs_human")], assessment: report(id) });
const review = (deliveryId = "v2") => ({ deliveryId, reviewedAt: "2026-11-01T00:02:00Z", mode: "demo" as const, summary: "Rules only" });

test("AI changes and human checks remain separate when the same criterion needs both", () => {
  const result = deliveryOverview({ delivery: delivery(), criteria, review: review(), manualChecks: [] });
  assert.equal(result.ruleFailures, 0); assert.equal(result.aiChanges, 1); assert.equal(result.humanRemaining, 2);
  assert.equal(result.rows[0].criterion.id, "manual-1"); assert.equal(result.rows[0].humanPending, true);
  assert.equal(result.rows.length, 3);
});

test("stale review and stale assessment never become current success counts", () => {
  const item = delivery(); item.assessment = report("old");
  const result = deliveryOverview({ delivery: item, criteria, review: review("old"), manualChecks: ["mobile", "manual-1"] });
  assert.equal(result.reviewCurrent, false); assert.equal(result.assessmentCurrent, false);
  assert.equal(result.ruleFailures, undefined); assert.equal(result.aiChanges, undefined); assert.equal(result.humanRemaining, undefined);
  assert.equal(result.unreviewed, 3); assert.ok(result.rows.every(row => row.rule === "unreviewed" && !row.ai));
});

test("a rule failure outranks other evidence and any AI supported suggestion", () => {
  const item = delivery(); item.evidence.push(evidence("manual-1", "fail")); item.assessment = report(item.id, "supported");
  const result = deliveryOverview({ delivery: item, criteria, review: review(), manualChecks: ["manual-1"] });
  assert.equal(result.ruleFailures, 1); assert.equal(result.rows[0].rule, "fail");
  assert.equal(result.rows[0].explanation, "Rule explanation: manual-1");
  assert.equal(result.humanRemaining, 1);
});

test("missing criterion evidence remains unreviewed even when a saved AI report supports it", () => {
  const item = delivery(); item.evidence = [evidence("page-1", "pass")]; item.assessment = report(item.id, "supported");
  const result = deliveryOverview({ delivery: item, criteria, review: review(), manualChecks: [] });
  assert.equal(result.unreviewed, 2); assert.equal(result.rows.find(row => row.criterion.id === "manual-1")?.rule, "unreviewed");
});

test("human progress counts only required IDs, never unknown checks or AI support", () => {
  const item = delivery(); item.assessment = report(item.id, "supported");
  const result = deliveryOverview({ delivery: item, criteria, review: review(), manualChecks: ["manual-1", "unknown-id", "manual-1"] });
  assert.equal(result.humanRemaining, 1); assert.equal(result.rows[0].criterion.id, "mobile");
});

test("a human-confirmed criterion keeps AI abstention visible without remaining a pending human check", () => {
  const item = delivery(); item.assessment = report(item.id, "supported");
  const result = deliveryOverview({ delivery: item, criteria, review: review(), manualChecks: ["mobile", "manual-1"] });
  const row = result.rows.find(entry => entry.criterion.id === "mobile")!;
  assert.equal(row.humanConfirmed, true); assert.equal(row.humanPending, false);
  assert.equal(row.ai?.status, "insufficient_evidence");
  assert.equal(result.humanConfirmed, 2); assert.equal(result.humanRequired, 2); assert.equal(result.humanRemaining, 0);
  assert.equal(overviewRowLabel(row, "en"), "Human-confirmed · AI could not determine");
  assert.equal(overviewRowLabel(row, "zh"), "人工已确认 · AI 无法独立判断");
  assert.notEqual(result.rows[0].criterion.id, "mobile");
});

test("a human checkbox does not hide a failed rule or AI suggestion to change", () => {
  const item = delivery();
  const result = deliveryOverview({ delivery: item, criteria, review: review(), manualChecks: ["manual-1"] });
  assert.equal(overviewRowLabel(result.rows[0], "en"), "AI suggests changes");
  item.evidence.push(evidence("manual-1", "fail"));
  const failed = deliveryOverview({ delivery: item, criteria, review: review(), manualChecks: ["manual-1"] });
  assert.equal(overviewRowLabel(failed.rows[0], "en"), "Rule mismatch");
});

test("history compares only independently bound rule and AI reports", () => {
  const previous = delivery("v1", 1); previous.evidence.push(evidence("page-1", "fail"));
  const version: ProofDeliveryVersion = { delivery: previous, review: review(previous.id), feedback: [], archivedAt: "2026-11-01T00:02:00Z" };
  const result = deliveryOverview({ delivery: delivery(), criteria, review: review(), manualChecks: [], previousVersion: version });
  assert.equal(result.previous?.ruleFailures, 1); assert.equal(result.ruleFailures, 0); assert.equal(result.previous?.aiChanges, 1);
  version.review = review("wrong-version"); previous.assessment = report("wrong-version");
  const stale = deliveryOverview({ delivery: delivery(), criteria, review: review(), manualChecks: [], previousVersion: version });
  assert.equal(stale.previous?.ruleFailures, undefined); assert.equal(stale.previous?.aiChanges, undefined);
});

test("current or later versions cannot be presented as historical improvement", () => {
  for (const previous of [delivery("v2", 2), delivery("v3", 3)]) {
    const result = deliveryOverview({ delivery: delivery(), criteria, review: review(), manualChecks: [], previousVersion: { delivery: previous, review: review(previous.id), feedback: [], archivedAt: "2026-11-01T00:04:00Z" } });
    assert.equal(result.previous, undefined);
  }
});

test("friendly titles are display-only and do not mutate requirements or reports", () => {
  const item = delivery(), original = structuredClone(item), originalCriteria = structuredClone(criteria);
  assert.equal(criterionDisplayTitle(criteria[1], "en"), criteria[1].source);
  assert.equal(criterionDisplayTitle(criteria[0], "en"), criteria[0].title);
  assert.equal(criterionDisplayTitle({ id: "manual-2", title: "人工要求 2", source: "😀".repeat(70) }, "zh"), `${"😀".repeat(55)}…`);
  deliveryOverview({ delivery: item, criteria, review: review(), manualChecks: [] });
  assert.deepEqual(item, original); assert.deepEqual(criteria, originalCriteria);
});

test("feedback is an exact-version bounded advisory draft and never marks evidence accepted", () => {
  const result = deliveryOverview({ delivery: delivery(), criteria, review: review(), manualChecks: [] });
  const row = result.rows[0], draft = overviewFeedbackDraft(row, "v2", "zh");
  assert.equal(draft.deliveryId, "v2"); assert.equal(draft.criterionId, "manual-1"); assert.match(draft.comment, /AI 修改建议（待买家核对）/);
  assert.match(draft.comment, /Display the opening hours/); assert.equal(row.rule, "needs_human"); assert.equal(row.humanPending, true);
  row.explanation = "😀".repeat(1000);
  const bounded = overviewFeedbackDraft(row, "v2", "en"); assert.ok(bounded.comment.length <= 1000); assert.doesNotMatch(bounded.comment, /[\uD800-\uDBFF]$/u);
});

test("a marked source publication drafts its real origin without changing version, budget or rule priority",()=>{
 for(const schema of["source-publication-v1","source-publication-v2"]as const){
 const value=delivery(),row=deliveryOverview({delivery:value,criteria,review:review(),manualChecks:[]}).rows[0];
 row.ai!.publicationBasis={schema,reason:"locked_price_mismatch"};const before=structuredClone(row);
 for(const language of["zh","en"]as const){
  const draft=overviewFeedbackDraft(row,"exact-current-version",language);assert.match(draft.comment,language==="zh"?/^系统源码核验差异（待买家核对）：/u:/^System source-check difference \(for buyer review\):/u);assert.equal(draft.deliveryId,"exact-current-version");assert.equal(draft.criterionId,row.criterion.id);assert.deepEqual(row,before);
  const long={...row,explanation:"😀".repeat(1000)},bounded=overviewFeedbackDraft(long,"exact-current-version",language);assert.ok(bounded.comment.length<=1000);assert.doesNotMatch(bounded.comment,/[\uD800-\uDBFF]$/u);
 }
 row.rule="fail";assert.match(overviewFeedbackDraft(row,"exact-current-version","en").comment,/^Rule checks found a mismatch/u);
 }
});

test("overview drafts never promote an unknown future publication schema into source-check attribution",()=>{
 const row=deliveryOverview({delivery:delivery(),criteria,review:review(),manualChecks:[]}).rows[0];row.ai!.publicationBasis={schema:"source-publication-future",reason:"locked_price_mismatch"}as never;const before=structuredClone(row);
 assert.match(overviewFeedbackDraft(row,"exact-current-version","en").comment,/^AI change suggestion/u);assert.deepEqual(row,before);
});
