import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { ProofAssessment, ProofRiskReview, ProofRole } from "../lib/contracts.ts";
import { assessmentCoverageGroups, assessmentReviewSummary, assessmentRiskPresentation } from "../lib/assessment-display.ts";

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

test("the recorded unseen-image risk is presented as an evidence gap while the complete original answer is retained", async () => {
  const review = JSON.parse(await readFile(new URL("../public/benchmarks/five-cycles-2026-11-04/semantic-review.json", import.meta.url), "utf8"));
  const risk = review.projects.find((p: {id:string}) => p.id === "image-and-mobile-boundary").extraRisks[0].risk;
  const input = {...report, risks:[risk], coverage:{includedFiles:["index.html"],truncatedFiles:[],omittedFiles:["poster.png"]}};
  const before = structuredClone(input);
  const reading = assessmentRiskPresentation(input, risk, "en");
  assert.equal(reading.kind, "image_evidence_gap");
  assert.equal(reading.title, "Image subject has not been verified");
  assert.equal(reading.originalTitle, "Hero image alt text may not match the required blue bowl content");
  assert.match(reading.explanation, /not an observed visual defect/);
  assert.equal(assessmentRiskPresentation(input,risk,"zh").title,"图片主体尚未验证");
  assert.deepEqual(input,before);
});

test("an inspectable missing-alt source indication is not hidden as an unseen-image issue", () => {
  const risk = {title:"Image has no accessible text alternative", explanation:"The img element has no alt attribute.",suggestion:"Add an appropriate alt attribute for the agreed image.",citations:[{file:"index.html",start:0,end:22,excerpt:'<img src="poster.png">'}]};
  const input = {...report,risks:[risk]};
  const reading = assessmentRiskPresentation(input,risk,"en");
  assert.equal(reading.kind,"unverified_source_indication");
  assert.equal(reading.title,risk.title);
  assert.match(reading.label,/Unverified/);
  assert.equal(Object.hasOwn(reading,"confirmed"),false);
});

test("an unseen CSS background subject also needs image evidence without hiding inspectable CSS defects", () => {
  const risk = {title:"Hero image may not match the bowl",explanation:"The background image subject cannot be verified from this source.",suggestion:"Inspect the image pixels to confirm the required subject.",citations:[{file:"site.css",start:0,end:42,excerpt:'background-image: url("assets/poster.webp");'}]};
  assert.equal(assessmentRiskPresentation(report,risk,"en").kind,"image_evidence_gap");
  const sourceIssue = {...risk,title:"Background image has no fallback",explanation:"The background image declaration has no fallback colour.",suggestion:"Consider a fallback colour matching the agreed palette."};
  assert.equal(assessmentRiskPresentation(report,sourceIssue,"en").kind,"unverified_source_indication");
});

test("unverified runtime claims and participant confirmations never become independently observed defects", () => {
  const risk = {title:"The form may not submit",explanation:"A form is present but its backend has not been run.",suggestion:"Submit a synthetic form and independently read its receipt.",citations:[]};
  assert.equal(assessmentRiskPresentation(report,risk,"en").kind,"unverified_source_indication");
  assert.equal(assessmentRiskPresentation(report,risk,"en").nextStep,risk.suggestion);
  const noImageInput = {...report,coverage:{includedFiles:["index.html"],truncatedFiles:[],omittedFiles:[]}};
  assert.equal(assessmentRiskPresentation(noImageInput,{...risk,title:"Inspect image pixels"},"en").kind,"unverified_source_indication");
});
