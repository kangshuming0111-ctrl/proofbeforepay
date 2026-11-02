import assert from "node:assert/strict";
import test from "node:test";
import type { ProofAssessment, ProofCollaboration, ProofQuote, ProofRole } from "../lib/contracts.ts";
import { acceptDelivery, joinSeller, prepareReplacement, requestChanges, requireExpectedDelivery, requireWorkflowAction, snapshotVersion, submitDelivery } from "../lib/proof-workflow.ts";
import type { ProofWorkflowAction } from "../lib/proof-workflow.ts";
import { validateAcceptance } from "../lib/proof-domain.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";

const html = "<!doctype html><html><head><title>Work</title></head><body><main>Delivered website</main></body></html>";
const now = "2026-10-30T00:00:00.000Z";
function agreement(stage: ProofCollaboration["stage"] = "in_progress"): ProofQuote {
  const parsed = parseStaticProject({ title: "Shared delivery", summary: "One HTML page and a human design check", amount: "125.50", requiredPages: ["index.html"], manualRequirements: ["Approve the design."] }, "en");
  const delivery = createUploadedDelivery({ "index.html": html }, parsed.project, "en", 1);
  return {
    id: "workflow-test", reference: "PBP-SHARED", workflow: "proof-v1", title: parsed.title, summary: parsed.summary, brief: parsed.summary,
    clientName: "Buyer", currency: "AUD", language: "en", hourlyRateCents: parsed.totalCents, totalCents: parsed.totalCents,
    lineItems: [{ id: "site", description: parsed.title, quantity: 1, unitPriceCents: parsed.totalCents }], timelineDays: 1, assumptions: [], questions: [],
    status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: now,
    proof: { project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery,
      review: { deliveryId: delivery.id, reviewedAt: now, mode: "demo", summary: "Saved source checked" },
      collaboration: { stage, feedback: [], ...(stage === "submitted" || stage === "accepted" ? { submission: { deliveryId: delivery.id, note: "Please check this delivery.", at: now } } : {}) } },
  };
}
const status = (operation: () => unknown, expected: number) => assert.throws(operation, (error: unknown) => error instanceof Error && "status" in error && error.status === expected);
const consent = (quote: ProofQuote) => ({ deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: ["mobile", "manual-1"] });
function authorized(quote: ProofQuote) {
  quote.proof.paymentState = "authorized";
  quote.proof.authorizationId = "SIM-AUTH-TEST";
  quote.proof.authorizationExpiresAt = new Date(Date.now() + 60_000).toISOString();
  return quote;
}

test("uploads require the caller's explicit current delivery baseline, including null for the first upload", () => {
  const quote = agreement();
  const current = quote.proof.delivery!.id;
  const before = structuredClone(quote);
  assert.doesNotThrow(() => requireExpectedDelivery(quote, { expectedDeliveryId: current }));
  for (const input of [{}, {expectedDeliveryId: undefined}, {expectedDeliveryId: null}, {expectedDeliveryId: ""},
    {expectedDeliveryId: "old-version"}, {expectedDeliveryId: true}, {expectedDeliveryId: 1}, {expectedDeliveryId: []},
    {expectedDeliveryId: {id: current}}, Object.create({expectedDeliveryId: current})]) {
    status(() => requireExpectedDelivery(quote, input), 409);
  }
  assert.deepEqual(quote, before);

  const empty = structuredClone(quote);
  empty.proof.delivery = undefined;
  empty.proof.review = undefined;
  assert.doesNotThrow(() => requireExpectedDelivery(empty, {expectedDeliveryId: null}));
  status(() => requireExpectedDelivery(empty, {}), 409);
  status(() => requireExpectedDelivery(empty, {expectedDeliveryId: current}), 409);
  const first = prepareReplacement(empty, quote.proof.delivery!);
  status(() => requireExpectedDelivery(first, {expectedDeliveryId: null}), 409);
  assert.doesNotThrow(() => requireExpectedDelivery(first, {expectedDeliveryId: current}));
  const newDelivery = createUploadedDelivery({"index.html": html.replace("Delivered website", "Newer delivery")}, quote.proof.project!, "en", 2);
  const replaced = prepareReplacement(first, newDelivery);
  status(() => requireExpectedDelivery(replaced, {expectedDeliveryId: current}), 409);
  assert.doesNotThrow(() => requireExpectedDelivery(replaced, {expectedDeliveryId: newDelivery.id}));
});

test("replacement archives the old report and refuses to inherit an internal builder's assessment", () => {
  const quote = agreement();
  const report: ProofAssessment = {
    id: "synthetic-report", deliveryId: quote.proof.delivery!.id, method: "source-ai-v1", mode: "live", model: "synthetic-no-provider-call", assessedAt: now,
    items: [], risks: [], limitations: ["Synthetic storage fixture; no provider was called."],
    coverage: { includedFiles: ["index.html"], truncatedFiles: [], omittedFiles: [] },
  };
  quote.proof.delivery!.assessment = report;
  const before = structuredClone(quote);
  const archived = snapshotVersion(quote, now);
  const replacement = createUploadedDelivery({ "index.html": html.replace("Delivered website", "Replacement") }, quote.proof.project!, "en", 2);
  // Defense against a future internal builder accidentally copying an old report.
  replacement.assessment = structuredClone(report);
  const next = prepareReplacement(quote, replacement);
  assert.deepEqual(quote, before);
  assert.equal(next.proof.delivery!.assessment, undefined);
  assert.equal(next.proof.review, undefined);
  assert.deepEqual(archived.delivery.assessment, report);
});

test("legacy action authorization stays buyer-only without adding seller collaboration", () => {
  const quote = agreement();
  quote.proof.collaboration = undefined;
  quote.proof.project = undefined;
  for (const action of ["approve", "checkout", "authorize", "delivery", "review", "assess", "layout", "capture", "void", "reconcile"] as const) {
    assert.doesNotThrow(() => requireWorkflowAction(quote, "buyer", action));
    status(() => requireWorkflowAction(quote, "seller", action), 403);
  }
  for (const action of ["invite", "return", "accept_delivery", "submit_delivery"] as const) status(() => requireWorkflowAction(quote, "buyer", action), 409);
});

test("collaboration roles authorize only their own actions, independent of client payload claims", () => {
  for (const action of ["approve", "checkout", "authorize", "capture", "void", "reconcile", "return", "accept_delivery", "invite"] as const) {
    status(() => requireWorkflowAction(agreement("submitted"), "seller", action), 403);
  }
  for (const action of ["delivery", "submit_delivery"] as const) status(() => requireWorkflowAction(agreement(), "buyer", action), 403);
  for (const role of ["buyer", "seller"] as const) {
    for (const action of ["review", "assess", "layout"] as const) assert.doesNotThrow(() => requireWorkflowAction(agreement(), role, action));
  }
  status(() => requireWorkflowAction(agreement(), "admin" as ProofRole, "layout"), 403);
  const notCustom = agreement();
  notCustom.proof.project = undefined;
  status(() => requireWorkflowAction(notCustom, "buyer", "approve"), 409);
});

test("awaiting a seller permits only buyer invite or approve mutations", () => {
  const quote = agreement("awaiting_seller");
  for (const action of ["invite", "approve"] as const) assert.doesNotThrow(() => requireWorkflowAction(quote, "buyer", action));
  for (const [role, action] of [["buyer", "checkout"], ["buyer", "review"], ["seller", "delivery"], ["seller", "layout"]] as const) status(() => requireWorkflowAction(quote, role, action), 409);
});

test("joining records only the display name and server time and does not mutate or settle the agreement", () => {
  const quote = agreement("awaiting_seller");
  const before = structuredClone(quote);
  const next = joinSeller(quote, "  Seller studio  ", now);
  assert.deepEqual(quote, before);
  assert.equal(next.proof.collaboration!.stage, "in_progress");
  assert.equal(next.proof.collaboration!.sellerName, "Seller studio");
  assert.equal(next.proof.collaboration!.sellerJoinedAt, now);
  assert.deepEqual(next.proof.audit, [{ kind: "seller_joined", at: now }]);
  assert.equal(next.proof.paymentState, "unfunded");
  assert.equal(next.totalCents, quote.totalCents);
  status(() => joinSeller(next, "Different seller", now), 409);
  for (const name of ["", " ", "a".repeat(101), "bad\0name", { sellerName: "Name", role: "seller" }]) status(() => joinSeller(quote, name, now), 400);
  status(() => joinSeller(quote, "Seller", "bad-time"), 400);
});

test("joining independently rejects draft, Sandbox, existing-order and authorized projects", () => {
  for (const change of [
    (quote: ProofQuote) => { quote.status = "draft"; },
    (quote: ProofQuote) => { quote.paymentMode = "sandbox"; },
    (quote: ProofQuote) => { quote.paypalOrderId = "EXISTING-ORDER"; },
    (quote: ProofQuote) => { authorized(quote); },
  ]) {
    const quote = agreement("awaiting_seller");
    change(quote);
    const before = structuredClone(quote);
    status(() => joinSeller(quote, "Seller", now), 409);
    assert.deepEqual(quote, before);
  }
});

test("stage checks prevent replacing sent work or writing checks after acceptance", () => {
  for (const stage of ["submitted", "accepted"] as const) {
    const quote = agreement(stage);
    status(() => requireWorkflowAction(quote, "seller", "delivery"), 409);
    status(() => requireWorkflowAction(quote, "seller", "submit_delivery"), 409);
  }
  for (const role of ["buyer", "seller"] as const) {
    for (const action of ["review", "layout"] as const) status(() => requireWorkflowAction(agreement("accepted"), role, action), 409);
  }
  for (const action of ["return", "accept_delivery"] as const) {
    for (const stage of ["in_progress", "changes_requested", "accepted"] as const) status(() => requireWorkflowAction(agreement(stage), "buyer", action), 409);
    const stale = agreement("submitted");
    stale.proof.collaboration!.submission!.deliveryId = "previous-version";
    status(() => requireWorkflowAction(stale, "buyer", action), 409);
  }
});

test("every delivery mutation is frozen for pending, terminal or expired authorized payments", () => {
  const mutations: [ProofRole, ProofWorkflowAction, ProofCollaboration["stage"]][] = [
    ["seller", "delivery", "in_progress"], ["seller", "submit_delivery", "in_progress"], ["buyer", "review", "in_progress"],
    ["seller", "layout", "submitted"], ["buyer", "return", "submitted"], ["buyer", "accept_delivery", "submitted"],
  ];
  for (const [role, action, stage] of mutations) {
    const cases = [
      (q: ProofQuote) => { q.proof.paymentOperation = "capture"; },
      (q: ProofQuote) => { q.proof.paymentOperation = "void"; },
      (q: ProofQuote) => { q.proof.paymentState = "captured"; },
      (q: ProofQuote) => { q.proof.paymentState = "voided"; },
      (q: ProofQuote) => { q.proof.paymentState = "closed_unpaid"; },
      (q: ProofQuote) => { q.status = "paid"; },
      (q: ProofQuote) => { authorized(q).proof.authorizationExpiresAt = new Date(Date.now() - 1000).toISOString(); },
      (q: ProofQuote) => { authorized(q).proof.authorizationExpiresAt = "invalid"; },
      (q: ProofQuote) => { authorized(q).proof.authorizationId = undefined; },
      (q: ProofQuote) => { q.status = "draft"; },
    ];
    for (const change of cases) {
      const quote = agreement(stage);
      change(quote);
      status(() => requireWorkflowAction(quote, role, action), 409);
    }
    assert.doesNotThrow(() => requireWorkflowAction(authorized(agreement(stage)), role, action));
  }
});

test("collaborative payment endpoints refuse real Sandbox mode and capture needs accepted-version binding", () => {
  for (const action of ["checkout", "authorize", "capture", "void", "reconcile"] as const) {
    const quote = agreement("accepted");
    quote.paymentMode = "sandbox";
    status(() => requireWorkflowAction(quote, "buyer", action), 409);
  }
  status(() => requireWorkflowAction(agreement("submitted"), "buyer", "capture"), 409);
  status(() => requireWorkflowAction(agreement("accepted"), "buyer", "capture"), 409);
});

test("a seller can submit only the exact reviewed delivery and a nonempty bounded note", () => {
  for (const stage of ["in_progress", "changes_requested"] as const) {
    const quote = agreement(stage);
    const before = structuredClone(quote);
    const next = submitDelivery(quote, { deliveryId: quote.proof.delivery!.id, note: "  Ready for review  ", role: "buyer", at: "forged" }, now);
    assert.deepEqual(quote, before);
    assert.equal(next.proof.collaboration!.stage, "submitted");
    assert.deepEqual(next.proof.collaboration!.submission, { deliveryId: quote.proof.delivery!.id, note: "Ready for review", at: now });
    assert.equal(next.proof.audit.at(-1)!.kind, "delivery_sent");
    for (const note of ["", " ", "n".repeat(2001), 123]) status(() => submitDelivery(quote, { deliveryId: quote.proof.delivery!.id, note }, now), 400);
    status(() => submitDelivery(quote, { deliveryId: "stale", note: "Ready" }, now), 409);
    quote.proof.review!.deliveryId = "old-review";
    status(() => submitDelivery(quote, { deliveryId: quote.proof.delivery!.id, note: "Ready" }, now), 409);
  }
});

test("returning a delivery appends versioned criterion feedback and clears prior acceptance without erasing review", () => {
  const quote = agreement("submitted");
  quote.proof.manualChecks = ["mobile", "manual-1"];
  quote.proof.acceptedDeliveryId = quote.proof.delivery!.id;
  quote.proof.acceptedAt = now;
  quote.proof.collaboration!.acceptance = { deliveryId: quote.proof.delivery!.id, at: now, manualChecks: ["mobile", "manual-1"] };
  quote.proof.collaboration!.feedback = [{ id: "prior", deliveryId: "old", criterionId: "mobile", comment: "Prior feedback", at: now }];
  const before = structuredClone(quote);
  const next = requestChanges(quote, { deliveryId: quote.proof.delivery!.id, feedback: [{ criterionId: "mobile", comment: "  Fix mobile layout  ", id: "forged", deliveryId: "old", at: "forged" }] }, now);
  assert.deepEqual(quote, before);
  assert.equal(next.proof.collaboration!.stage, "changes_requested");
  assert.equal(next.proof.collaboration!.feedback.length, 2);
  const entry = next.proof.collaboration!.feedback[1];
  assert.match(entry.id, /^[0-9a-f-]{36}$/u);
  assert.deepEqual({ ...entry, id: "new" }, { id: "new", deliveryId: quote.proof.delivery!.id, criterionId: "mobile", comment: "Fix mobile layout", at: now });
  assert.deepEqual(next.proof.review, quote.proof.review);
  assert.equal(next.proof.acceptedAt, undefined);
  assert.equal(next.proof.acceptedDeliveryId, undefined);
  assert.equal(next.proof.manualChecks, undefined);
  assert.equal(next.proof.collaboration!.acceptance, undefined);
  assert.equal(next.proof.audit.at(-1)!.kind, "changes_requested");
});

test("feedback validation rejects foreign or repeated criteria, stale versions and excess history", () => {
  const quote = agreement("submitted");
  const feedback = { criterionId: "mobile", comment: "Fix the layout" };
  for (const entries of [[], [feedback, feedback], [{ ...feedback, criterionId: "unknown" }], [{ ...feedback, comment: "" }], [{ ...feedback, comment: "c".repeat(1001) }], [{ ...feedback, comment: "bad\0text" }], [null], Array(4).fill(feedback)]) {
    status(() => requestChanges(quote, { deliveryId: quote.proof.delivery!.id, feedback: entries }, now), 400);
  }
  status(() => requestChanges(quote, { deliveryId: "stale", feedback: [feedback] }, now), 409);
  quote.proof.collaboration!.feedback = Array.from({ length: 199 }, (_, i) => ({ id: `f${i}`, deliveryId: "old", criterionId: "mobile", comment: "Prior", at: now }));
  assert.equal(requestChanges(quote, { deliveryId: quote.proof.delivery!.id, feedback: [feedback] }, now).proof.collaboration!.feedback.length, 200);
  quote.proof.collaboration!.feedback.push({ id: "last", deliveryId: "old", criterionId: "mobile", comment: "Prior", at: now });
  status(() => requestChanges(quote, { deliveryId: quote.proof.delivery!.id, feedback: [feedback] }, now), 400);
});

test("delivery acceptance is independent of payment but still requires current complete review and human decisions", () => {
  const quote = agreement("submitted");
  quote.proof.acceptedDeliveryId = "prior-payment-consent";
  quote.proof.acceptedAt = "2026-10-29T00:00:00.000Z";
  quote.proof.manualChecks = ["prior-payment-check"];
  const input = { ...consent(quote), manualChecks: ["mobile", "manual-1", "forged-extra"], paymentState: "captured", captureId: "forged" };
  const before = structuredClone(quote);
  const next = acceptDelivery(quote, input, now);
  assert.deepEqual(quote, before);
  assert.equal(next.proof.collaboration!.stage, "accepted");
  const snapshotId = next.proof.delivery!.acceptanceEvidence?.[0].id;
  assert.ok(snapshotId);
  assert.deepEqual(next.proof.collaboration!.acceptance, { deliveryId: quote.proof.delivery!.id, at: now, manualChecks: ["mobile", "manual-1"], evidenceSnapshotId: snapshotId });
  assert.equal(next.proof.acceptedDeliveryId, quote.proof.acceptedDeliveryId);
  assert.equal(next.proof.acceptedAt, quote.proof.acceptedAt);
  assert.deepEqual(next.proof.manualChecks, quote.proof.manualChecks);
  assert.equal(next.proof.paymentState, "unfunded");
  assert.equal(next.captureId, undefined);
  assert.equal(next.totalCents, quote.totalCents);
  assert.equal(next.status, "approved");
  assert.equal(next.proof.audit.at(-1)!.kind, "delivery_accepted");
  for (const patch of [{ confirm: false }, { confirm: "true" }, { deliveryId: "old" }, { manualChecks: [] }, { manualChecks: ["mobile"] }, { manualChecks: ["manual-1"] }]) assert.throws(() => acceptDelivery(quote, { ...input, ...patch }, now));
  const staleReview = agreement("submitted");
  staleReview.proof.review!.deliveryId = "old";
  status(() => acceptDelivery(staleReview, consent(staleReview), now), 409);
  const incomplete = agreement("submitted");
  incomplete.proof.delivery!.evidence.shift();
  status(() => acceptDelivery(incomplete, consent(incomplete), now), 409);
  const failed = agreement("submitted");
  failed.proof.delivery!.evidence[0].finding = "fail";
  status(() => acceptDelivery(failed, consent(failed), now), 409);
});

test("accepted delivery still cannot be captured without real authorization checks in the existing financial domain", () => {
  const quote = agreement("submitted");
  const next = acceptDelivery(quote, consent(quote), now);
  assert.doesNotThrow(() => requireWorkflowAction(next, "buyer", "capture"));
  assert.throws(() => validateAcceptance(next, consent(next)), /confirmed authorization/u);
  authorized(next);
  assert.throws(() => validateAcceptance(next, { ...consent(next), confirm: false }), /Explicit confirmation/u);
  assert.throws(() => validateAcceptance(next, { ...consent(next), manualChecks: [] }), /human check/u);
  assert.deepEqual(validateAcceptance(next, consent(next)), ["mobile", "manual-1"]);
  const stale = structuredClone(next);
  stale.proof.collaboration!.acceptance!.deliveryId = "old";
  status(() => requireWorkflowAction(stale, "buyer", "capture"), 409);
});

test("replacement retains feedback history and amount while resetting submission, review and consent", () => {
  const quote = agreement("changes_requested");
  quote.proof.collaboration!.submission = { deliveryId: quote.proof.delivery!.id, note: "Previous submission", at: now };
  quote.proof.collaboration!.feedback = [{ id: "f1", deliveryId: quote.proof.delivery!.id, criterionId: "mobile", comment: "Fix mobile", at: now }];
  quote.proof.acceptedAt = now;
  quote.proof.acceptedDeliveryId = quote.proof.delivery!.id;
  quote.proof.manualChecks = ["mobile", "manual-1"];
  quote.proof.collaboration!.acceptance = { deliveryId: quote.proof.delivery!.id, at: now, manualChecks: ["mobile", "manual-1"] };
  const before = structuredClone(quote);
  const delivery = createUploadedDelivery({ "index.html": html.replace("Delivered website", "Revised website") }, quote.proof.project!, "en", 2);
  const next = prepareReplacement(quote, delivery);
  assert.deepEqual(quote, before);
  assert.equal(next.proof.collaboration!.stage, "in_progress");
  assert.equal(next.proof.collaboration!.submission, undefined);
  assert.equal(next.proof.collaboration!.acceptance, undefined);
  assert.equal(next.proof.review, undefined);
  assert.equal(next.proof.acceptedAt, undefined);
  assert.equal(next.proof.acceptedDeliveryId, undefined);
  assert.equal(next.proof.manualChecks, undefined);
  assert.deepEqual(next.proof.collaboration!.feedback, quote.proof.collaboration!.feedback);
  assert.equal(next.totalCents, quote.totalCents);
  assert.equal(next.proof.paymentState, quote.proof.paymentState);
  delivery.files!["index.html"] = "changed externally";
  assert.notEqual(next.proof.delivery!.files!["index.html"], delivery.files!["index.html"]);
  status(() => prepareReplacement(quote, quote.proof.delivery!), 400);
  status(() => prepareReplacement(quote, { ...delivery, variant: "fixed" }), 400);
});

test("version archives deep-copy only current-version review, submission and feedback", () => {
  const quote = agreement("submitted");
  quote.proof.collaboration!.feedback = [
    { id: "current", deliveryId: quote.proof.delivery!.id, criterionId: "mobile", comment: "Current feedback", at: now },
    { id: "old", deliveryId: "old", criterionId: "mobile", comment: "Old feedback", at: now },
  ];
  const before = structuredClone(quote);
  const version = snapshotVersion(quote, now);
  assert.deepEqual(quote, before);
  assert.equal(version.archivedAt, now);
  assert.deepEqual(version.review, quote.proof.review);
  assert.deepEqual(version.submission, quote.proof.collaboration!.submission);
  assert.deepEqual(version.feedback.map(entry => entry.id), ["current"]);
  version.delivery.files!["index.html"] = "archive changed externally";
  version.feedback[0].comment = "changed externally";
  assert.deepEqual(quote, before);
  quote.proof.review!.deliveryId = "old";
  quote.proof.collaboration!.submission!.deliveryId = "old";
  const filtered = snapshotVersion(quote, now);
  assert.equal(filtered.review, undefined);
  assert.equal(filtered.submission, undefined);
  quote.proof.delivery = undefined;
  status(() => snapshotVersion(quote, now), 409);
});
