import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote, ProofRole } from "../lib/contracts.ts";
import { canUseRoleplaySamples, createRoleplayDelivery, createRoleplayProject, isDemoRoleplay, resolveProofRole } from "../lib/proof-demo.ts";
import {joinSeller, prepareReplacement, requestChanges, requireWorkflowAction, snapshotVersion, submitDelivery} from "../lib/proof-workflow.ts";

const now = "2026-10-30T00:00:00.000Z";
function demo(language: "zh" | "en" = "en"): ProofQuote {
  const project = createRoleplayProject(language);
  return {
    id: "demo-role-test", reference: "PBP-DEMO", workflow: "proof-v1", title: project.title, summary: project.summary,
    brief: project.criteria.map(criterion => criterion.source).join("\n"), clientName: "Demo buyer", language, currency: "AUD",
    lineItems: [{id: "site", description: project.title, quantity: 1, unitPriceCents: project.totalCents}],
    hourlyRateCents: project.totalCents, totalCents: project.totalCents, timelineDays: 1, assumptions: [], questions: [],
    status: "draft", aiMode: "demo", paymentMode: "demo", createdAt: now,
    proof: {demoRoleplay: true, demoSampleProject: true, project: project.project, criteria: project.criteria, paymentState: "unfunded",
      collaboration: {stage: "awaiting_seller", feedback: []}, audit: []},
  };
}
const membership = {buyerId: "owner", sellerId: null, actorId: "owner", authenticated: true};
const status = (operation: () => unknown, expected: number) => assert.throws(operation,
  (error: unknown) => error instanceof Error && "status" in error && error.status === expected);
function approved() {
  const quote = demo();
  quote.status = "approved";
  quote.approvedAt = now;
  return joinSeller(quote, "Demo seller", now);
}
function reviewed(quote: ProofQuote, variant: "flawed" | "fixed", sequence: number) {
  const next = prepareReplacement(quote, createRoleplayDelivery(quote, {variant}, sequence));
  next.proof.review = {deliveryId: next.proof.delivery!.id, reviewedAt: now, mode: "demo", summary: "Template review"};
  return next;
}

test("only the authenticated owner of an explicitly provider-free demo may select either perspective", () => {
  const quote = demo();
  assert.equal(resolveProofRole(quote, membership), "buyer");
  for (const requestedDemoRole of ["buyer", "seller"] as const) {
    assert.equal(resolveProofRole(quote, {...membership, requestedDemoRole}), requestedDemoRole);
    assert.equal(resolveProofRole(quote, {...membership, actorId: "outsider", requestedDemoRole}), undefined);
  }
  assert.equal(resolveProofRole(quote, {...membership, requestedDemoRole: "admin" as ProofRole}), "buyer");
  assert.equal(resolveProofRole(quote, {...membership, authenticated: false, requestedDemoRole: "seller"}), "buyer");
  assert.equal(resolveProofRole(quote, {...membership, sellerId: "real-seller", requestedDemoRole: "seller"}), "buyer");
});

test("role headers never change real collaborative membership, legacy ownership or provider-mode cases", () => {
  const cases = [
    (quote: ProofQuote) => { delete quote.proof.demoRoleplay; },
    (quote: ProofQuote) => { quote.aiMode = "live"; },
    (quote: ProofQuote) => { quote.paymentMode = "sandbox"; },
    (quote: ProofQuote) => { delete quote.proof.project; },
    (quote: ProofQuote) => { delete quote.proof.collaboration; },
  ];
  for (const change of cases) {
    const quote = demo(); change(quote);
    assert.equal(isDemoRoleplay(quote), false);
    assert.equal(resolveProofRole(quote, {...membership, requestedDemoRole: "seller"}), "buyer");
    assert.equal(resolveProofRole(quote, {...membership, actorId: "outsider", requestedDemoRole: "buyer"}), undefined);
  }
  const real = approved(); delete real.proof.demoRoleplay;
  assert.equal(resolveProofRole(real, {...membership, sellerId: "seller", actorId: "seller", requestedDemoRole: "buyer"}), "seller");
  assert.equal(resolveProofRole(real, {...membership, sellerId: "seller", requestedDemoRole: "seller"}), "buyer");
  const legacy = demo(); delete legacy.proof.demoRoleplay; delete legacy.proof.collaboration; delete legacy.proof.project;
  assert.equal(resolveProofRole(legacy, {...membership, requestedDemoRole: "seller"}), "buyer");
});

test("the fixed role-play agreement and its sample files use the same uploaded-file criteria", () => {
  for (const language of ["zh", "en"] as const) {
    const quote = demo(language);
    assert.equal(quote.totalCents, 48000);
    assert.deepEqual(quote.proof.project!.requiredPages, ["index.html", "services.html", "contact.html"]);
    assert.deepEqual(quote.proof.project!.link, {from: "index.html", text: "Book a call", to: "contact.html#booking"});
    const first = createRoleplayDelivery(quote, {variant: "flawed"}, 1);
    const fixed = createRoleplayDelivery(quote, {variant: "fixed"}, 2);
    assert.equal(first.variant, "upload"); assert.equal(fixed.variant, "upload");
    assert.notEqual(first.id, fixed.id);
    assert.equal(first.sequence, 1); assert.equal(fixed.sequence, 2);
    assert.ok(!Object.hasOwn(fixed.files!, "delivery-manifest.json"));
    assert.deepEqual(new Set(fixed.evidence.map(entry => entry.criterionId)), new Set(quote.proof.criteria.map(criterion => criterion.id)));
    assert.equal(first.evidence.find(entry => entry.criterionId === "page-3")!.finding, "fail");
    assert.equal(first.evidence.find(entry => entry.criterionId === "link")!.finding, "fail");
    assert.ok(fixed.evidence.every(entry => entry.finding !== "fail"));
    assert.equal(fixed.evidence.find(entry => entry.criterionId === "mobile")!.finding, "needs_human");
  }
});

test("sample selection cannot mix with uploads or bypass normal file validation", () => {
  const quote = demo();
  const files = createRoleplayDelivery(quote, {variant: "fixed"}, 1).files!;
  status(() => createRoleplayDelivery(quote, {variant: "fixed", files}, 1), 400);
  for (const variant of ["upload", "unknown", null, false]) status(() => createRoleplayDelivery(quote, {variant}, 1), 400);
  const uploaded = createRoleplayDelivery(quote, {files}, 3);
  assert.equal(uploaded.sequence, 3); assert.equal(uploaded.variant, "upload");
  assert.deepEqual(uploaded.files, files);
  files["index.html"] = "changed after upload";
  assert.notEqual(uploaded.files!["index.html"], files["index.html"]);
  status(() => createRoleplayDelivery(quote, {files: {"bad.js": "alert(1)"}}, 1), 400);
  const real = demo(); delete real.proof.demoRoleplay;
  status(() => createRoleplayDelivery(real, {variant: "fixed"}, 1), 409);
});

test("custom and unmarked role-play origins cannot borrow fixed samples but keep uploads and saved history", () => {
  const files = createRoleplayDelivery(demo(), {variant: "fixed"}, 1).files!;
  for (const marker of [false, undefined]) {
    const quote = approved();
    quote.proof.demoSampleProject = marker;
    assert.equal(isDemoRoleplay(quote), true);
    assert.equal(canUseRoleplaySamples(quote), false);
    assert.equal(resolveProofRole(quote, {...membership, requestedDemoRole: "seller"}), "seller");
    for (const variant of ["flawed", "fixed"]) status(() => createRoleplayDelivery(quote, {variant}, 1), 409);
    const uploaded = createRoleplayDelivery(quote, {files}, 1);
    const current = prepareReplacement(quote, uploaded);
    const historical = snapshotVersion(current, now);
    assert.deepEqual(historical.delivery.files, files);
    assert.equal(historical.delivery.id, uploaded.id);
    assert.equal(createRoleplayDelivery(current, {files}, 2).sequence, 2);
  }
  assert.equal(canUseRoleplaySamples(demo()), true);
});

test("role-play submission, return, revision and human acceptance keep the collaborative state machine", () => {
  let quote = approved();
  assert.equal(quote.proof.collaboration!.stage, "in_progress");
  assert.equal(quote.proof.collaboration!.sellerName, "Demo seller");
  status(() => requireWorkflowAction(quote, "buyer", "delivery"), 403);
  status(() => requireWorkflowAction(quote, "seller", "checkout"), 403);
  quote = reviewed(quote, "flawed", 1);
  quote = submitDelivery(quote, {deliveryId: quote.proof.delivery!.id, note: "Initial delivery"}, now);
  status(() => requireWorkflowAction(quote, "seller", "delivery"), 409);
  status(() => acceptDelivery(quote, {deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: ["mobile"]}, now), 409);
  quote = requestChanges(quote, {deliveryId: quote.proof.delivery!.id, feedback: [{criterionId: "link", comment: "The booking target is missing."}]}, now);
  const oldVersion = snapshotVersion(quote, now);
  const oldId = quote.proof.delivery!.id;
  quote = reviewed(quote, "fixed", 2);
  assert.equal(oldVersion.delivery.id, oldId);
  assert.equal(oldVersion.feedback.length, 1);
  assert.equal(snapshotVersion(quote, now).feedback.length, 0);
  quote = submitDelivery(quote, {deliveryId: quote.proof.delivery!.id, note: "Booking page added"}, now);
  status(() => acceptDelivery(quote, {deliveryId: oldId, confirm: true, manualChecks: ["mobile"]}, now), 409);
  status(() => acceptDelivery(quote, {deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: []}, now), 400);
  quote = acceptDelivery(quote, {deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: ["mobile", "manual-1"]}, now);
  assert.equal(quote.proof.collaboration!.stage, "accepted");
  assert.equal(quote.proof.collaboration!.acceptance!.deliveryId, quote.proof.delivery!.id);
  assert.equal(quote.proof.paymentState, "unfunded");
  assert.equal(quote.paypalOrderId, undefined); assert.equal(quote.captureId, undefined);
  assert.equal(quote.proof.authorizationId, undefined); assert.equal(quote.proof.acceptedAt, undefined);
  status(() => requireWorkflowAction(quote, "seller", "capture"), 403);
  status(() => requireWorkflowAction(quote, "seller", "delivery"), 409);
});
