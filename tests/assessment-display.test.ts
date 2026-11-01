import assert from "node:assert/strict";
import test from "node:test";
import type { ProofAssessment, ProofRiskReview, ProofRole } from "../lib/contracts.ts";
import { assessmentCoverageGroups, assessmentReviewSummary } from "../lib/assessment-display.ts";

const report: ProofAssessment = { id: "assessment-current", deliveryId: "delivery-current", mode: "live", model: "synthetic", method: "source-ai-v1", assessedAt: "2026-11-02T00:00:00Z", items: [],
  risks: [0, 1, 2].map(index => ({ title: `Risk ${index}`, explanation: "Synthetic", suggestion: "Inspect evidence", citations: [] })), limitations: [],
  coverage: { includedFiles: ["index.html"], truncatedFiles: ["services.html"], omittedFiles: ["contact.html", "assets/flower.JPG", "images/logo.webp"] } };
const review = (id: string, role: ProofRole, riskIndex: number, decision: ProofRiskReview["decision"]): ProofRiskReview => ({ id, actorRole: role, riskIndex, decision,
  deliveryId: report.deliveryId, assessmentId: report.id, reason: "Synthetic reason", reviewedAt: "2026-11-02T00:00:00Z" });

test("no human reviews remain visibly unreviewed for each participant", () => {
  const result = assessmentReviewSummary(report);
  assert.equal(result.total, 3); assert.equal(result.unreviewed, 3); assert.equal(result.differingPositions, 0);
  assert.deepEqual(result.participants.buyer, { confirmed: 0, rejected: 0, needsEvidence: 0, unreviewed: 3 });
});

test("latest positions are independent per participant and disagreement is never converted to resolved", () => {
  const reviews = [review("old-buyer", "buyer", 0, "confirmed"), review("new-buyer", "buyer", 0, "rejected"), review("seller", "seller", 0, "confirmed"),
    review("buyer-pending", "buyer", 1, "needs_evidence"), review("seller-pending", "seller", 1, "needs_evidence")];
  const before = structuredClone({ report, reviews });
  const result = assessmentReviewSummary(report, reviews);
  assert.equal(result.unreviewed, 1); assert.equal(result.differingPositions, 1);
  assert.deepEqual(result.participants.buyer, { confirmed: 0, rejected: 1, needsEvidence: 1, unreviewed: 1 });
  assert.deepEqual(result.participants.seller, { confirmed: 1, rejected: 0, needsEvidence: 1, unreviewed: 1 });
  assert.equal(Object.hasOwn(result, "resolved"), false); assert.equal(Object.hasOwn(result, "accepted"), false);
  assert.deepEqual({ report, reviews }, before);
});

test("old delivery/report annotations and outside risk indexes do not affect the current summary", () => {
  const oldDelivery = { ...review("old-delivery", "buyer", 0, "confirmed"), deliveryId: "old" };
  const oldReport = { ...review("old-report", "seller", 1, "rejected"), assessmentId: "old" };
  const result = assessmentReviewSummary(report, [oldDelivery, oldReport, review("outside", "buyer", 3, "confirmed")]);
  assert.equal(result.unreviewed, 3); assert.equal(result.participants.buyer.confirmed, 0); assert.equal(result.participants.seller.rejected, 0);
});

test("text coverage and image-pixel exclusions stay distinct without rewriting the saved report", () => {
  const before = structuredClone(report), result = assessmentCoverageGroups(report);
  assert.deepEqual(result.omittedTextFiles, ["contact.html"]);
  assert.deepEqual(result.rasterFiles, ["assets/flower.JPG", "images/logo.webp"]);
  assert.deepEqual(result.truncatedFiles, ["services.html"]);
  assert.deepEqual(report, before);
});
