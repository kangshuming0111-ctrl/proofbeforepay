import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessment, ProofQuote} from "../lib/contracts.ts";
import {DomainError} from "../lib/domain.ts";
import {acceptanceBasis, assertAcceptanceBasis} from "../lib/acceptance-basis.ts";
import {acceptDelivery} from "../lib/proof-workflow.ts";
import {applyPaymentReconciliation, validateAcceptance} from "../lib/proof-domain.ts";
import {recordCaptureConsent} from "../lib/acceptance-evidence.ts";
import {getBrowserCheckPlan, recordBrowserChecks} from "../lib/browser-check-report.ts";
import {recordLayoutReport} from "../lib/layout-report.ts";
import {recordRiskReview} from "../lib/risk-reviews.ts";
import {newProjectJourneyPlan} from "../lib/project-journey.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";

const at = new Date().toISOString();
function fixture(): ProofQuote {
  const parsed = parseStaticProject({title: "Synthetic stale-view protection", summary: "One static page", amount: "1.00", requiredPages: ["index.html"], manualRequirements: []}, "en");
  const delivery = createUploadedDelivery({"index.html": "<!doctype html><html><head><title>Synthetic</title></head><body>A saved page</body></html>"}, parsed.project, "en", 1);
  return {id: "synthetic-client-basis", reference: "PBP-BASIS", workflow: "proof-v1", title: parsed.title, summary: parsed.summary, brief: parsed.summary, clientName: "Synthetic", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100,
    lineItems: [{id: "site", description: "Synthetic", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: at,
    proof: {project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery, review: {deliveryId: delivery.id, reviewedAt: at, mode: "demo", summary: "Rules only"}, collaboration: {stage: "submitted", submission: {deliveryId: delivery.id, at, note: "Review this version"}, feedback: []}}};
}
function consent(q: ProofQuote) {return {confirm: true, deliveryId: q.proof.delivery!.id, expectedEvidence: acceptanceBasis(q), manualChecks: q.proof.delivery!.evidence.filter(item => item.finding === "needs_human").map(item => item.criterionId)};}
function browser(q: ProofQuote): ProofQuote {return recordBrowserChecks(q, "seller", {deliveryId: q.proof.delivery!.id, previousReportId: q.proof.delivery!.browserChecks?.id ?? null, readings: getBrowserCheckPlan(q).map(step => ({stepId: step.stepId, status: "observed", kind: "page", stylesExpected: 0, stylesLoaded: 0, imagesExpected: 0, imagesLoaded: 0}))});}
function layout(q: ProofQuote): ProofQuote {return recordLayoutReport(q, "seller", {deliveryId: q.proof.delivery!.id, previousReportId: q.proof.delivery!.layoutReport?.id ?? null, readings: [375, 900].map(viewportWidth => ({file: "index.html", viewportWidth, status: "measured", clientWidth: viewportWidth, scrollWidth: viewportWidth}))});}
function assessment(q: ProofQuote): ProofQuote {
  const next = structuredClone(q);next.proof.delivery!.assessment = {id: "synthetic-source-report", deliveryId: q.proof.delivery!.id, method: "source-ai-v1", mode: "live", model: "synthetic-no-provider", assessedAt: at, items: [], risks: [{title: "Synthetic risk", explanation: "Must inspect directly", suggestion: "Request evidence", citations: []}], limitations: ["Synthetic fixture, no provider execution"], coverage: {includedFiles: ["index.html"], truncatedFiles: [], omittedFiles: []}} satisfies ProofAssessment;return next;
}
function authorized(q: ProofQuote): ProofQuote {const next = structuredClone(q);next.proof.paymentState = "authorized";next.proof.authorizationId = "SYNTHETIC-AUTH";next.proof.authorizationExpiresAt = new Date(Date.now() + 60_000).toISOString();return next;}
const code = (status: number) => (error: unknown) => error instanceof DomainError && error.status === status;

test("a complete current view requires all explicit nulls and rejects malformed or hidden fields without evaluating accessors", () => {
  const q = fixture(), expected = acceptanceBasis(q), before = structuredClone(q);
  assert.equal(expected.browserReportId, null);assert.deepEqual(expected.riskReviewIds, []);assert.doesNotThrow(() => assertAcceptanceBasis(q, expected));
  const missing = {...expected};delete (missing as Partial<typeof missing>).layoutReportId;
  for (const value of [undefined, null, [], {}, missing, {...expected, approval: true}, {...expected, riskReviewIds: ["same", "same"]}, {...expected, journeyPlanDigest: "wrong"}, {...expected, reviewReviewedAt: "bad-time"}, {...expected, browserReportId: undefined}]) assert.throws(() => assertAcceptanceBasis(q, value), code(400));
  let getterCalls = 0;const getter = {...expected};Object.defineProperty(getter, "assessmentId", {get() {getterCalls++;return null;}, enumerable: true});assert.throws(() => assertAcceptanceBasis(q, getter), code(400));assert.equal(getterCalls, 0);
  assert.deepEqual(q, before);assert.throws(() => acceptDelivery(q, {...consent(q), expectedEvidence: undefined}), code(400));
});

test("a stale A-to-B browser view cannot create an acceptance snapshot for the unseen B", () => {
  const a = browser(fixture()), stale = consent(a), b = browser(a), before = structuredClone(b);
  assert.notEqual(a.proof.delivery!.browserChecks!.id, b.proof.delivery!.browserChecks!.id);
  assert.throws(() => acceptDelivery(b, stale), code(409));assert.deepEqual(b, before);assert.equal(b.proof.delivery!.acceptanceEvidence, undefined);
  const accepted = acceptDelivery(b, consent(b));assert.equal(accepted.proof.delivery!.acceptanceEvidence![0].browserReportId, b.proof.delivery!.browserChecks!.id);assert.equal(accepted.proof.paymentState, "unfunded");
});

test("null-to-report additions in browser, layout or source AI invalidate the earlier explicit view", () => {
  for (const add of [browser, layout, assessment]) {
    const original = fixture(), stale = consent(original), changed = add(original), before = structuredClone(changed);
    assert.throws(() => acceptDelivery(changed, stale), code(409));assert.deepEqual(changed, before);
    assert.equal(acceptDelivery(changed, consent(changed)).proof.collaboration!.stage, "accepted");
  }
});

test("new relevant risk annotations change the basis, but unrelated stale annotations are not falsely adopted", () => {
  const q = assessment(fixture()), stale = consent(q), changed = recordRiskReview(q, "seller", {deliveryId: q.proof.delivery!.id, assessmentId: q.proof.delivery!.assessment!.id, riskIndex: 0, decision: "needs_evidence", reason: "The buyer should inspect supporting evidence"});
  assert.throws(() => acceptDelivery(changed, stale), code(409));assert.equal(acceptanceBasis(changed).riskReviewIds.length, 1);
  const old = structuredClone(changed);old.proof.delivery!.riskReviews!.push({...old.proof.delivery!.riskReviews![0], id: "not-current-assessment", assessmentId: "another-assessment"});
  assert.deepEqual(acceptanceBasis(old), acceptanceBasis(changed));const accepted = acceptDelivery(old, consent(old));assert.equal(accepted.proof.delivery!.acceptanceEvidence![0].riskReviews.length, 1);
});

test("all current report and plan identities participate, without inventing a result or changing recipe semantics", () => {
  const q = fixture(), baseline = acceptanceBasis(q), changed = structuredClone(q);
  changed.proof.delivery!.journeyPlan = newProjectJourneyPlan(at);assert.throws(() => assertAcceptanceBasis(changed, baseline), code(409));
  for (const key of ["businessReportId", "runtimeReportId", "journeyReportId"] as const) assert.throws(() => assertAcceptanceBasis(q, {...baseline, [key]: "different-report"}), code(409));
  assert.throws(() => assertAcceptanceBasis(q, {...baseline, reviewReviewedAt: new Date(Date.now() + 1000).toISOString()}), code(409));
});

test("single-user first capture needs the exact current view before any frozen consent exists", () => {
  let q = authorized(browser(fixture()));delete q.proof.collaboration;
  const stale = consent(q), fresh = browser(q), before = structuredClone(fresh);
  assert.throws(() => validateAcceptance(fresh, stale), code(409));assert.throws(() => validateAcceptance(fresh, {...consent(fresh), expectedEvidence: undefined}), code(400));
  const checks = validateAcceptance(fresh, consent(fresh)), pending = recordCaptureConsent(fresh, checks, at);
  assert.deepEqual(fresh, before);assert.ok(pending.proof.acceptedEvidenceSnapshotId);assert.equal(pending.proof.delivery!.acceptanceEvidence!.length, 1);
});

test("accepted A plus supplemental B captures only A and requires its explicit frozen snapshot identity", () => {
  const a = browser(fixture()), accepted = acceptDelivery(a, consent(a)), frozen = structuredClone(accepted.proof.delivery!.acceptanceEvidence![0]);
  const b = browser(authorized(accepted)), input = {confirm: true, deliveryId: b.proof.delivery!.id, manualChecks: accepted.proof.collaboration!.acceptance!.manualChecks, acceptedEvidenceSnapshotId: frozen.id};
  assert.notEqual(b.proof.delivery!.browserChecks!.id, frozen.browserReportId);
  assert.throws(() => validateAcceptance(b, {...input, acceptedEvidenceSnapshotId: undefined}), code(400));
  assert.throws(() => validateAcceptance(b, {...input, acceptedEvidenceSnapshotId: "another-snapshot"}), code(409));
  const pending = recordCaptureConsent(b, validateAcceptance(b, input), at);
  assert.deepEqual(pending.proof.delivery!.acceptanceEvidence, [frozen]);assert.equal(pending.proof.acceptedEvidenceSnapshotId, frozen.id);
  pending.proof.authorizationExpiresAt = new Date(Date.parse(at) + 1).toISOString();
  assert.deepEqual(validateAcceptance(pending, {...input, expectedEvidence: acceptanceBasis(a)}), input.manualChecks, "A later B and an ended local window cannot force the original capture onto a new view");
  const paid = applyPaymentReconciliation(pending, {kind: "captured", captureId: "SYNTHETIC-CAPTURE", verifiedAt: new Date(Date.now() + 1000).toISOString()});
  assert.equal(paid.proof.paymentState, "captured");assert.equal(paid.proof.acceptedEvidenceSnapshotId, frozen.id);assert.deepEqual(paid.proof.delivery!.acceptanceEvidence, [frozen]);
});

test("unknown historical acceptance cannot start a new capture, while existing pending state remains readable and reconcilable", () => {
  const historical = authorized(fixture());delete historical.proof.collaboration;
  historical.proof.paymentOperation = "capture";historical.proof.acceptedDeliveryId = historical.proof.delivery!.id;historical.proof.acceptedAt = at;historical.proof.manualChecks = ["mobile"];
  const input = {...consent(historical), acceptedEvidenceSnapshotId: undefined};
  assert.throws(() => validateAcceptance(historical, input), code(409));assert.equal(acceptanceBasis(historical).deliveryId, historical.proof.delivery!.id);
  const reconciled = applyPaymentReconciliation(historical, {kind: "captured", captureId: "SYNTHETIC-HISTORICAL", verifiedAt: new Date(Date.now() + 1000).toISOString()});
  assert.equal(reconciled.proof.paymentState, "captured");assert.equal(reconciled.proof.acceptedEvidenceSnapshotId, undefined);assert.equal(reconciled.proof.delivery!.acceptanceEvidence, undefined);
  assert.equal(historical.proof.paymentState, "authorized");assert.equal(historical.proof.paymentOperation, "capture");
});
