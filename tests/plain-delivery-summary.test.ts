import assert from "node:assert/strict";
import test from "node:test";
import type { ProofAcceptanceEvidence, ProofAssessment, ProofCriterion, ProofDelivery, ProofReview } from "../lib/contracts.ts";
import { frozenDeliveryAssessment, plainDeliverySummary } from "../lib/plain-delivery-summary.ts";
import { recordRiskReview } from "../lib/risk-reviews.ts";
import type { ProofQuote } from "../lib/contracts.ts";

const criteria: ProofCriterion[] = [{id: "home", title: "Home", source: "Deliver index.html"}, {id: "mobile", title: "Mobile", source: "Check on a phone"}];
const review: ProofReview = {deliveryId: "v2", reviewedAt: "2026-11-09T00:00:00Z", mode: "demo", summary: "Rules"};
const assessment: ProofAssessment = {id: "ai-v2", deliveryId: "v2", mode: "live", model: "synthetic-test-only", method: "source-ai-v1", assessedAt: review.reviewedAt,
  items: criteria.map(row => ({criterionId: row.id, status: "supported", explanation: "Synthetic", citations: [], ruleEvidenceIds: []})),
  risks: [{title: "Unverified", explanation: "Synthetic indication", suggestion: "Inspect", citations: []}], limitations: [], coverage: {includedFiles: [], omittedFiles: [], truncatedFiles: []}};
const delivery: ProofDelivery = {id: "v2", sequence: 2, variant: "upload", label: "Synthetic", submittedAt: review.reviewedAt, assessment,
  evidence: criteria.map(row => ({id: row.id, criterionId: row.id, finding: row.id === "home" ? "fail" : "needs_human", file: "index.html", excerpt: "fixture", explanation: "Rule fixture"}))};
const base = () => structuredClone({delivery, criteria, review, manualChecks: ["mobile"], accepted: false});
const snapshot = (): ProofAcceptanceEvidence => ({id: "accepted", deliveryId: "v2", at: review.reviewedAt, browserReportId: null, layoutReportId: null, assessmentId: "ai-v2", criteria, evidence: delivery.evidence, manualChecks: ["mobile"], review, assessment, riskReviews: []});
function ready(value: ReturnType<typeof plainDeliverySummary>) {assert.equal(value.kind, "ready"); if (value.kind !== "ready") throw new Error("Expected ready"); return value;}

test("contradictory AI support never hides a rule failure, human checks or extra risks", () => {
  const input = base(), before = structuredClone(input), result = ready(plainDeliverySummary(input));
  assert.equal(result.rows[0].rule, "fail"); assert.equal(result.rows[0].ai?.status, "supported");
  assert.equal(result.ruleFailures, 1); assert.equal(result.humanConfirmed, 1); assert.equal(result.risks?.total, 1);
  assert.equal(result.frozen, false); assert.deepEqual(input, before);
});
test("rules remain visible without AI, and a stale AI report is never reused", () => {
  for (const report of [undefined, {...assessment, deliveryId: "v1"}]) {
    const input = base(); input.delivery.assessment = report;
    const result = ready(plainDeliverySummary(input)); assert.equal(result.ruleFailures, 1);
    assert.equal(result.assessmentCurrent, false); assert.equal(result.risks, undefined); assert.ok(result.rows.every(row => !row.ai));
  }
});
test("a stale rule review cannot imply checked requirements or saved human decisions", () => {
  const input = base(); input.review.deliveryId = "v1";
  const result = ready(plainDeliverySummary(input)); assert.equal(result.unreviewed, 2); assert.equal(result.humanConfirmed, undefined);
});
test("accepted overview freezes criteria, rule evidence, AI, human checks and risk positions", () => {
  const input = base(), saved = structuredClone(snapshot());
  input.delivery.evidence = []; input.delivery.assessment = {...assessment, id: "later", risks: [], items: []};
  input.criteria = []; input.manualChecks = []; input.review.deliveryId = "stale";
  const result = ready(plainDeliverySummary({...input, accepted: true, snapshot: saved}));
  assert.equal(result.frozen, true); assert.equal(result.rows.length, 2); assert.equal(result.ruleFailures, 1);
  assert.equal(result.humanConfirmed, 1); assert.equal(result.risks?.total, 1); assert.equal(result.rows[0].ai?.status, "supported");
});
test("missing or mismatched acceptance snapshot never falls back to later delivery evidence", () => {
  for (const saved of [undefined, {...snapshot(), deliveryId: "v1"}]) assert.deepEqual(plainDeliverySummary({...base(), accepted: true, snapshot: saved}), {kind: "unavailable"});
});
test("mismatched snapshot assessment ID cannot appear as accepted model evidence", () => {
  const result = ready(plainDeliverySummary({...base(), accepted: true, snapshot: {...snapshot(), assessmentId: "different"}}));
  assert.equal(result.assessmentCurrent, false); assert.equal(result.risks, undefined); assert.equal(result.ruleFailures, 1);
});

test("post-acceptance annotations cannot replace the original evidence or its risk positions", () => {
  const saved = structuredClone(snapshot());
  saved.evidence = saved.evidence.map(row => row.finding === "fail" ? {...row, finding: "pass"} : row);
  const quote: ProofQuote = {
    id: "case", reference: "PBP-TEST", title: "Synthetic site", summary: "Synthetic site delivery",
    brief: "", clientName: "", lineItems: [], assumptions: [], questions: [], timelineDays: 1,
    currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100,
    status: "approved", aiMode: "live", paymentMode: "demo", workflow: "proof-v1", createdAt: review.reviewedAt,
    proof: {criteria, paymentState: "unfunded", review, delivery: {...structuredClone(delivery), evidence: saved.evidence},
      audit: [], collaboration: {stage: "accepted", feedback: [], acceptance: {deliveryId: "v2", at: saved.at, manualChecks: saved.manualChecks, evidenceSnapshotId: saved.id}},
      acceptedDeliveryId: "v2", acceptedEvidenceSnapshotId: saved.id, acceptedAt: saved.at},
  };
  const risk = {deliveryId:"v2",assessmentId:"ai-v2",riskIndex:0,reason:"Later opinion"};
  const buyer = recordRiskReview(quote,"buyer",{...risk,decision:"confirmed"});
  const seller = recordRiskReview(buyer,"seller",{...risk,decision:"rejected"});
  const input = {...base(), delivery:seller.proof.delivery!};
  assert.equal(ready(plainDeliverySummary(input)).risks?.differingPositions, 1);
  assert.equal(ready(plainDeliverySummary({...input, accepted:true, snapshot:saved})).risks?.differingPositions, 0);
  assert.equal(frozenDeliveryAssessment(saved, "v2"), saved.assessment);
  assert.equal(frozenDeliveryAssessment({...saved, assessmentId:null}, "v2"), undefined);
  assert.equal(frozenDeliveryAssessment({...saved, assessment:{...assessment, deliveryId:"v1"}}, "v2"), undefined);
});
