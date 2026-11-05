import test from "node:test";
import assert from "node:assert/strict";
import type {ProofQuote, ProofRole} from "../lib/contracts.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";
import {prepareReplacement, requestChanges, snapshotVersion, submitDelivery} from "../lib/proof-workflow.ts";
import {recordRiskRepair, replayRiskRepairs, validateRiskFeedbackSource, RISK_REPAIR_EVENT_LIMIT} from "../lib/risk-repairs.ts";
import {DomainError} from "../lib/domain.ts";

const at = "2026-11-05T00:00:00.000Z", later = "2026-11-05T00:01:00.000Z";
const html = "<!doctype html><html><head><title>Synthetic</title></head><body><main><a href='/contact'>Contact</a></main></body></html>";
function fixture(): ProofQuote {
  const p = parseStaticProject({title: "Synthetic risk workflow", summary: "Deliver a contact website", amount: "1.00", requiredPages: ["index.html"], manualRequirements: ["The contact link must lead to the delivered contact page."]}, "en");
  const delivery = createUploadedDelivery({"index.html": html}, p.project, "en", 1), excerpt = "<a href='/contact'>Contact</a>", start = html.indexOf(excerpt);
  delivery.assessment = {id: "report-original", deliveryId: delivery.id, method: "source-ai-v1", mode: "live", model: "synthetic-provider-not-called", assessedAt: at, items: [], risks: [{title: "Contact destination needs review", explanation: "The quote alone does not show a delivered destination.", suggestion: "Inspect the destination and exact agreed requirement.", citations: [{file: "index.html", start, end: start + excerpt.length, excerpt}]}], limitations: ["Synthetic test fixture; no live model call."], coverage: {includedFiles: ["index.html"], truncatedFiles: [], omittedFiles: []}};
  return {id: "risk-project", reference: "PBP-RISK-REPAIR", workflow: "proof-v1", title: p.title, summary: p.summary, brief: p.summary, clientName: "Synthetic buyer", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100, lineItems: [{id: "site", description: p.title, quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1, status: "approved", paymentMode: "demo", aiMode: "demo", createdAt: at, proof: {project: p.project, criteria: p.criteria, delivery, paymentState: "unfunded", audit: [], review: {deliveryId: delivery.id, reviewedAt: at, mode: "demo", summary: "Synthetic source review"}, collaboration: {stage: "submitted", submission: {deliveryId: delivery.id, note: "Synthetic submission", at}, feedback: []}}};
}
function returned() {
  const q = fixture();
  return requestChanges(q, {deliveryId: q.proof.delivery!.id, feedback: [{criterionId: "manual-1", comment: "Please supply the agreed contact destination and evidence.", riskSource: {assessmentId: "report-original", riskIndex: 0}}]}, at);
}
function replaced(q = returned()) {
  const d = createUploadedDelivery({"index.html": html.replace("/contact", "contact.html"), "contact.html": "<!doctype html><html><head><title>Contact</title></head><body><main>Contact the synthetic shop.</main></body></html>"}, q.proof.project!, "en", 2);
  const n = prepareReplacement(q, d);
  n.proof.review = {deliveryId: d.id, reviewedAt: later, mode: "demo", summary: "Synthetic new-version source review"};
  return n;
}
const proposal = (q: ProofQuote, extra: object = {}) => ({action: "propose", feedbackId: q.proof.collaboration!.feedback[0].id, deliveryId: q.proof.delivery!.id, expectedEventId: q.proof.collaboration!.riskRepairEvents?.at(-1)?.id ?? null, reason: "Contact now links to contact.html in this new delivery; inspect that file.", ...extra});
function reviewedInput(q: ProofQuote, extra: object = {}) {
  const event = q.proof.collaboration!.riskRepairEvents!.at(-1)!;
  return {action: "review", feedbackId: event.feedbackId, deliveryId: q.proof.delivery!.id, expectedEventId: event.id, proposalId: event.id, outcome: "repaired", reason: "I inspected this delivery's contact link and its destination against the locked requirement.", ...extra};
}
function submittedProposal() {
  const q = replaced(), p = recordRiskRepair(q, "seller", proposal(q), later);
  return submitDelivery(p, {deliveryId: p.proof.delivery!.id, note: "New version ready for explicit buyer review."}, later);
}
function rejectUnchanged(q: ProofQuote, f: () => unknown, status?: number) {const before = structuredClone(q); assert.throws(f, (e: unknown) => e instanceof DomainError && (status === undefined || e.status === status)); assert.deepEqual(q, before);}

test("formal return copies exact server risk and locked criterion; draft payload cannot edit the model snapshot", () => {
  const q = fixture(), before = structuredClone(q), input = {deliveryId: q.proof.delivery!.id, feedback: [{criterionId: "manual-1", comment: "Inspect the agreed destination.", riskSource: {assessmentId: "report-original", riskIndex: 0}}]};
  const n = requestChanges(q, input, at), source = n.proof.collaboration!.feedback[0].riskSource!;
  assert.deepEqual(q, before); assert.equal(source.deliveryId, q.proof.delivery!.id); assert.deepEqual(source.criterion, q.proof.criteria.find(c => c.id === "manual-1")); assert.deepEqual(source.risk, q.proof.delivery!.assessment!.risks[0]);
  q.proof.delivery!.assessment!.risks[0].title = "Mutated after return"; q.proof.criteria[2].source = "Mutated source";
  assert.equal(source.risk.title, "Contact destination needs review"); assert.equal(source.criterion.source, before.proof.criteria[2].source);
  assert.deepEqual(n.proof.delivery!.assessment, before.proof.delivery!.assessment);
});

test("stale, forged, malformed and ungrounded risk references reject the entire formal return", () => {
  const bad = [{assessmentId: "old", riskIndex: 0}, {assessmentId: "report-original", riskIndex: -1}, {assessmentId: "report-original", riskIndex: 1}, {assessmentId: "report-original", riskIndex: 0.5}, {assessmentId: "report-original", riskIndex: "0"}, {assessmentId: "report-original", riskIndex: 0, risk: {}}, {assessmentId: "report-original", riskIndex: 0, deliveryId: "forged"}, null, []];
  for (const riskSource of bad) {const q = fixture(); rejectUnchanged(q, () => requestChanges(q, {deliveryId: q.proof.delivery!.id, feedback: [{criterionId: "manual-1", comment: "Inspect contact destination", riskSource}]}, at));}
  for (const patch of ["report-delivery", "citation", "unknown-criterion"]) {
    const q = fixture(); if (patch === "report-delivery") q.proof.delivery!.assessment!.deliveryId = "old";
    if (patch === "citation") q.proof.delivery!.files!["index.html"] = "Modified files that do not match the risk excerpt";
    rejectUnchanged(q, () => requestChanges(q, {deliveryId: q.proof.delivery!.id, feedback: [{criterionId: patch === "unknown-criterion" ? "invented" : "manual-1", comment: "Inspect contact destination", riskSource: {assessmentId: "report-original", riskIndex: 0}}]}, at));
  }
});

test("risk repair task survives replacement; archived original remains immutable and no new report resolves it", () => {
  const q = returned(), archived = snapshotVersion(q, later), n = replaced(q);
  assert.deepEqual(n.proof.collaboration!.feedback, q.proof.collaboration!.feedback); assert.equal(archived.feedback[0].riskSource!.assessmentId, "report-original");
  assert.equal(n.proof.delivery!.assessment, undefined); assert.equal(replayRiskRepairs(n.proof.collaboration!.feedback)[0].status, "open");
  n.proof.delivery!.assessment = {...archived.delivery.assessment!, id: "new-report-no-risks", deliveryId: n.proof.delivery!.id, risks: []};
  assert.equal(replayRiskRepairs(n.proof.collaboration!.feedback, n.proof.collaboration!.riskRepairEvents)[0].status, "open");
  assert.deepEqual(archived.delivery.assessment!.risks, q.proof.delivery!.assessment!.risks);
});

test("seller proposes on new reviewed delivery; buyer explicitly reviews exact current submitted proposal without acceptance or payment", () => {
  const q = submittedProposal(), before = structuredClone(q), p = q.proof.collaboration!.riskRepairEvents![0];
  assert.equal(p.actorRole, "seller"); assert.equal(p.reviewedAt, q.proof.review!.reviewedAt);
  const n = recordRiskRepair(q, "buyer", reviewedInput(q), later), tasks = replayRiskRepairs(n.proof.collaboration!.feedback, n.proof.collaboration!.riskRepairEvents, n.proof.criteria);
  assert.deepEqual(q, before); assert.equal(tasks[0].status, "repaired"); assert.equal(tasks[0].review!.proposalId, p.id); assert.equal(tasks[0].events.length, 2);
  assert.equal(n.proof.collaboration!.stage, "submitted"); assert.equal(n.proof.acceptedDeliveryId, undefined); assert.equal(n.proof.paymentState, "unfunded"); assert.equal(n.paypalOrderId, undefined); assert.equal(n.captureId, undefined); assert.deepEqual(n.proof.delivery, q.proof.delivery);
  assert.equal(n.proof.audit.at(-1)!.feedbackId, tasks[0].feedbackId);
});

test("seller cannot close and buyer cannot propose; stale proposal, event, delivery and not-submitted review reject", () => {
  const q = submittedProposal();
  rejectUnchanged(q, () => recordRiskRepair(q, "seller", reviewedInput(q), later), 403);
  rejectUnchanged(q, () => recordRiskRepair(q, "buyer", proposal(q), later), 403);
  for (const patch of [{deliveryId: "old"}, {expectedEventId: "stale"}, {proposalId: "other"}, {feedbackId: "foreign"}, {outcome: "supported"}, {reason: "short"}, {reason: "a\0forbidden"}, {reason: "x".repeat(1001)}, {actorRole: "buyer"}]) rejectUnchanged(q, () => recordRiskRepair(q, "buyer", reviewedInput(q, patch), later));
  const notSent = structuredClone(q); notSent.proof.collaboration!.stage = "changes_requested";
  rejectUnchanged(notSent, () => recordRiskRepair(notSent, "buyer", reviewedInput(notSent), later));
  const noReview = structuredClone(q); noReview.proof.review = undefined;
  rejectUnchanged(noReview, () => recordRiskRepair(noReview, "buyer", reviewedInput(noReview), later));
  rejectUnchanged(q, () => recordRiskRepair(q, "outsider" as ProofRole, reviewedInput(q), later), 403);
});

test("original delivery cannot be proposed as repaired and newer delivery invalidates old pending proposal", () => {
  const old = returned(); rejectUnchanged(old, () => recordRiskRepair(old, "seller", proposal(old), later));
  const q = submittedProposal(); q.proof.collaboration!.stage = "changes_requested";
  const newer = replaced(q); newer.proof.delivery!.id = "third-delivery"; newer.proof.review!.deliveryId = "third-delivery";
  const submitted = submitDelivery(newer, {deliveryId: "third-delivery", note: "Third synthetic version"}, later);
  rejectUnchanged(submitted, () => recordRiskRepair(submitted, "buyer", reviewedInput(submitted), later));
  const p = recordRiskRepair(submitted, "seller", proposal(submitted), later);
  assert.equal(replayRiskRepairs(p.proof.collaboration!.feedback, p.proof.collaboration!.riskRepairEvents)[0].proposal!.deliveryId, "third-delivery");
});

test("buyer may retain changes or record an explicit exception; no AI absence or seller proposal seals a task", () => {
  const q = submittedProposal(), open = recordRiskRepair(q, "buyer", reviewedInput(q, {outcome: "still_needs_changes"}), later);
  assert.equal(replayRiskRepairs(open.proof.collaboration!.feedback, open.proof.collaboration!.riskRepairEvents)[0].status, "open");
  const p = recordRiskRepair(open, "seller", proposal(open), later), exception = recordRiskRepair(p, "buyer", reviewedInput(p, {outcome: "exception"}), later);
  assert.equal(replayRiskRepairs(exception.proof.collaboration!.feedback, exception.proof.collaboration!.riskRepairEvents)[0].status, "exception");
  rejectUnchanged(exception, () => recordRiskRepair(exception, "seller", proposal(exception), later));
  assert.equal(exception.proof.collaboration!.stage, "submitted"); assert.equal(exception.proof.collaboration!.acceptance, undefined);
});

test("accepted, terminal, pending-payment, expired-authorisation and running-check projects keep repair history view-only", () => {
  const base = submittedProposal();
  const patches: ((q: ProofQuote) => void)[] = [q => {q.status = "paid";}, q => {q.proof.acceptedDeliveryId = q.proof.delivery!.id;}, q => {q.proof.collaboration!.stage = "accepted";}, q => {q.proof.paymentState = "captured";}, q => {q.proof.paymentState = "voided";}, q => {q.proof.paymentState = "closed_unpaid";}, q => {q.proof.paymentOperation = {} as NonNullable<typeof q.proof.paymentOperation>;}, q => {q.proof.paymentState = "authorized"; q.proof.authorizationId = "test"; q.proof.authorizationExpiresAt = at;}, q => {q.proof.delivery!.runtimeRun = {} as never;}];
  for (const patch of patches) {const q = structuredClone(base); patch(q); rejectUnchanged(q, () => recordRiskRepair(q, "buyer", reviewedInput(q), later));}
});

test("offline replay rejects tampered actor, sequence, source, criterion, task identity and event order", () => {
  const original = submittedProposal(), q = recordRiskRepair(original, "buyer", reviewedInput(original), later), state = q.proof.collaboration!;
  const tamper: ((events: Record<string, unknown>[]) => void)[] = [events => {events[0].actorRole = "buyer";}, events => {events[0].sequence = 2;}, events => {events[1].proposalId = "other";}, events => {events[1].previousEventId = null;}, events => {events[1].feedbackId = "foreign";}, events => {events[1].outcome = "supported";}, events => {events[1].deliveryId = "foreign";}, events => {events[1].reason = "bad\0reason";}, events => {events.reverse();}, events => {events[1].id = events[0].id;}, events => {events[0].at = "2026-11-05T00:00:30.000Z";}];
  for (const patch of tamper) {const events = structuredClone(state.riskRepairEvents) as unknown as Record<string, unknown>[]; patch(events); assert.throws(() => replayRiskRepairs(state.feedback, events as unknown as typeof state.riskRepairEvents, q.proof.criteria), DomainError);}
  const feedback = structuredClone(state.feedback); feedback[0].riskSource!.criterion.source = "Changed scope";
  assert.throws(() => replayRiskRepairs(feedback, state.riskRepairEvents, q.proof.criteria), DomainError);
  for (const patch of [{riskIndex: 5}, {deliveryId: "foreign"}, {riskSource: "wrong"}]) {
    if ("riskSource" in patch) assert.throws(() => validateRiskFeedbackSource({...state.feedback[0].riskSource, forged: true}), DomainError);
    else {const feedback = structuredClone(state.feedback); Object.assign(feedback[0].riskSource!, patch); assert.throws(() => replayRiskRepairs(feedback, state.riskRepairEvents), DomainError);}
  }
  const duplicate = structuredClone(state.feedback); duplicate.push(structuredClone(duplicate[0]));
  assert.throws(() => replayRiskRepairs(duplicate, state.riskRepairEvents), DomainError);
});

test("history cap refuses additions without truncating 100 prior events", () => {
  let q = replaced(); q = submitDelivery(q, {deliveryId: q.proof.delivery!.id, note: "Synthetic test of retained bounds"}, later);
  for (let i = 0; i < RISK_REPAIR_EVENT_LIMIT; i += 2) {q = recordRiskRepair(q, "seller", proposal(q), later); q = recordRiskRepair(q, "buyer", reviewedInput(q, {outcome: "still_needs_changes"}), later);}
  assert.equal(q.proof.collaboration!.riskRepairEvents!.length, RISK_REPAIR_EVENT_LIMIT);
  rejectUnchanged(q, () => recordRiskRepair(q, "seller", proposal(q), later));
  assert.equal(replayRiskRepairs(q.proof.collaboration!.feedback, q.proof.collaboration!.riskRepairEvents)[0].events.length, 100);
});

test("retained byte bound is explicit and a too-large record set is rejected rather than silently shortened", () => {
  const q = returned(), source = q.proof.collaboration!.feedback[0];
  const feedback = Array.from({length: 200}, (_, i) => ({...structuredClone(source), id: `feedback-${i}`, comment: "界".repeat(1000)}));
  assert.throws(() => replayRiskRepairs(feedback), /256 KiB/u);
  assert.equal(feedback.length, 200); assert.equal(feedback[199].comment.length, 1000);
});
