import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {DomainError} from "../lib/domain.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {newProjectJourneyPlan,validateJourneyRegistration} from "../lib/project-journey.ts";
import {beginProjectJourneyRun,finishProjectJourneyRun} from "../lib/project-journey-actions.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {prepareReplacement,requestChanges,snapshotVersion,submitDelivery} from "../lib/proof-workflow.ts";

const html = "<!doctype html><html><head><title>Static website</title></head><body><h1>Delivered original page</h1></body></html>";
async function fixture(withReport = true) {
  const parsed = parseStaticProject({title: "Technical feedback", summary: "Deliver one HTML page.", amount: "1.00", requiredPages: ["index.html"], manualRequirements: []}, "en");
  const delivery = createUploadedDelivery({"index.html": html}, parsed.project, "en", 1), at = new Date().toISOString();
  delivery.journeyPlan = newProjectJourneyPlan(at);
  let quote = {id: "journey-feedback-project", reference: "PBP-FEEDBACK", workflow: "proof-v1", title: parsed.title, summary: parsed.summary, brief: parsed.summary, clientName: "Synthetic", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100, lineItems: [{id: "site", description: "One page", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: at, proof: {project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery, review: {deliveryId: delivery.id, reviewedAt: at, mode: "demo", summary: "Static source checked"}, collaboration: {stage: "submitted", submission: {deliveryId: delivery.id, at, note: "Ready for review"}, feedback: []}}} as ProofQuote;
  const digest = await runtimeDeliveryDigest(delivery.files), registration = validateJourneyRegistration({id: "seller-feedback", label: "Synthetic declared seller", projectId: quote.id, registrationRevision: "r1", protocol: "booking-lifecycle-http-v1", recipe: "booking-lifecycle-20-v1", frontendEntryUrl: "https://seller-feedback.synthetic.example/seller-lifecycle.html", backendBaseUrl: "https://seller-feedback.synthetic.example/pbp/", deploymentRevision: "lifecycle-fixed-v1", frontendBundleDigest: digest, scenario: "fixed", expiresAt: "2099-01-01T00:00:00.000Z", testOnly: true, provenance: "operator-approved-declaration"});
  function saveUnknownReport(value: ProofQuote): ProofQuote {
    const next = beginProjectJourneyRun(value, "buyer", {action: "start", deliveryId: delivery.id, previousReportId: value.proof.delivery!.journeyReport?.id ?? null, targetId: registration.id, confirm: true}, digest, registration);
    return finishProjectJourneyRun(next, "buyer", {action: "abort", deliveryId: delivery.id, runId: next.proof.delivery!.journeyRun!.id});
  }
  if (withReport) quote = saveUnknownReport(quote);
  return {quote, saveUnknownReport};
}
function payload(quote: ProofQuote, patch: Record<string, unknown> = {}) {return {deliveryId: quote.proof.delivery!.id, feedback: [{criterionId: "journey-agreement", comment: "Please fix cancellation and repeat the separately confirmed technical journey.", journeyReportId: quote.proof.delivery!.journeyReport?.id, ...patch}]};}
const rejects = (run: () => unknown, status: number) => assert.throws(run, (error: unknown) => error instanceof DomainError && error.status === status);

test("technical feedback binds current report without changing original requirements or implying an original failure", async () => {
  const {quote} = await fixture(), before = structuredClone(quote), next = requestChanges(quote, payload(quote));
  const feedback = next.proof.collaboration!.feedback[0];
  assert.equal(feedback.criterionId, "journey-agreement");assert.equal(feedback.deliveryId, quote.proof.delivery!.id);assert.equal(feedback.journeyReportId, quote.proof.delivery!.journeyReport!.id);
  assert.equal(next.proof.collaboration!.stage, "changes_requested");assert.equal(next.proof.paymentState, "unfunded");assert.equal(next.proof.acceptedDeliveryId, undefined);
  assert.deepEqual(next.proof.criteria, before.proof.criteria);assert.deepEqual(next.proof.project, before.proof.project);assert.deepEqual(next.proof.delivery!.evidence, before.proof.delivery!.evidence);assert.equal(next.summary, before.summary);
  assert.ok(!next.proof.criteria.some(row => row.id === "journey-agreement"));assert.equal(next.proof.delivery!.evidence.find(row => row.criterionId === "page-1")!.finding, "pass");
  assert.deepEqual(Object.keys(feedback).sort(), ["id", "deliveryId", "criterionId", "comment", "at", "journeyReportId"].sort());assert.deepEqual(quote, before);
});

test("technical choice requires a confirmed current agreement and a saved current report", async () => {
  const {quote} = await fixture(), noPlan = structuredClone(quote);delete noPlan.proof.delivery!.journeyPlan;
  rejects(() => requestChanges(noPlan, payload(noPlan)), 400);
  const {quote: noReport} = await fixture(false);rejects(() => requestChanges(noReport, payload(noReport)), 409);
  for (const journeyReportId of [undefined, null, "stale-report", 12]) rejects(() => requestChanges(quote, payload(quote, {journeyReportId})), 409);
});

test("technical report must retain this project, delivery and exact confirmed plan", async () => {
  const {quote} = await fixture();
  for (const patch of [{deliveryId: "another-delivery"}, {planDigest: "f".repeat(64)}, {registration: {...quote.proof.delivery!.journeyReport!.registration, projectId: "another-project"}}]) {
    const changed = structuredClone(quote);Object.assign(changed.proof.delivery!.journeyReport!, patch);rejects(() => requestChanges(changed, payload(changed)), 409);
  }
});

test("a newer supplemental report requires fresh explicit feedback binding rather than silently borrowing a prior report", async () => {
  const {quote, saveUnknownReport} = await fixture(), oldPayload = payload(quote), newer = saveUnknownReport(quote);
  assert.notEqual(newer.proof.delivery!.journeyReport!.id, quote.proof.delivery!.journeyReport!.id);
  rejects(() => requestChanges(newer, oldPayload), 409);
  const next = requestChanges(newer, payload(newer));assert.equal(next.proof.collaboration!.feedback[0].journeyReportId, newer.proof.delivery!.journeyReport!.id);
  assert.equal(quote.proof.collaboration!.feedback.length, 0);
});

test("original criterion feedback cannot receive a technical report or an invented source citation", async () => {
  const {quote} = await fixture(), original = {criterionId: quote.proof.criteria[0].id, comment: "Please improve the original page."};
  const next = requestChanges(quote, {deliveryId: quote.proof.delivery!.id, feedback: [original]});assert.equal(next.proof.collaboration!.feedback[0].journeyReportId, undefined);
  rejects(() => requestChanges(quote, {deliveryId: quote.proof.delivery!.id, feedback: [{...original, journeyReportId: quote.proof.delivery!.journeyReport!.id}]}), 400);
  for (const patch of [{source: quote.proof.criteria[0].source}, {criterion: "page-1"}, {deliveryId: "caller-delivery"}]) rejects(() => requestChanges(quote, payload(quote, patch)), 400);
});

test("technical plus original feedback supports unique parallel choices, bounded text and the existing history limit", async () => {
  const {quote} = await fixture(), original = quote.proof.criteria.map(row => ({criterionId: row.id, comment: "Human original-criterion change request."})), technical = payload(quote).feedback[0];
  const next = requestChanges(quote, {deliveryId: quote.proof.delivery!.id, feedback: [...original, technical]});assert.equal(next.proof.collaboration!.feedback.length, quote.proof.criteria.length + 1);
  rejects(() => requestChanges(quote, {deliveryId: quote.proof.delivery!.id, feedback: [technical, technical]}), 400);
  assert.equal(requestChanges(quote, payload(quote, {comment: "x".repeat(1000)})).proof.collaboration!.feedback[0].comment.length, 1000);
  for (const comment of ["", "   ", "x".repeat(1001), "invalid\0comment"]) rejects(() => requestChanges(quote, payload(quote, {comment})), 400);
  const full = structuredClone(quote);full.proof.collaboration!.feedback = Array.from({length: 200}, (_, i) => ({id: `old-${i}`, deliveryId: "old-version", criterionId: "page-1", comment: "Prior comment", at: quote.createdAt}));rejects(() => requestChanges(full, payload(full)), 400);
});

test("return and seller replacement retain report-linked feedback in the old version without giving the replacement false sources or old checks", async () => {
  const {quote} = await fixture(), returned = requestChanges(quote, payload(quote)), archived = snapshotVersion(returned);
  const replacement = createUploadedDelivery({"index.html": html.replace("original", "revised")}, quote.proof.project!, "en", 2), next = prepareReplacement(returned, replacement);
  assert.equal(archived.feedback[0].journeyReportId, quote.proof.delivery!.journeyReport!.id);assert.equal(archived.feedback[0].deliveryId, quote.proof.delivery!.id);
  assert.deepEqual(next.proof.collaboration!.feedback, returned.proof.collaboration!.feedback);assert.equal(next.proof.delivery!.journeyPlan, undefined);assert.equal(next.proof.delivery!.journeyReport, undefined);assert.deepEqual(next.proof.criteria, quote.proof.criteria);
  next.proof.review = {deliveryId: replacement.id, reviewedAt: new Date().toISOString(), mode: "demo", summary: "New source reviewed"};
  const submitted = submitDelivery(next, {deliveryId: replacement.id, note: "Updated source addressing the report-linked technical feedback."});assert.equal(submitted.proof.collaboration!.stage, "submitted");
  rejects(() => requestChanges(submitted, payload(submitted, {journeyReportId: quote.proof.delivery!.journeyReport!.id})), 400);
  rejects(() => requestChanges(submitted, payload(quote)), 409);
});
