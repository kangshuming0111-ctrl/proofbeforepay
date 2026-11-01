import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote } from "../lib/contracts.ts";
import { canUseRoleplaySamples, createRoleplayDelivery, createRoleplayProject, isDemoRoleplay, isOwnerRoleplay, isSandboxRehearsal, requestSandboxRehearsal, resolveProofRole } from "../lib/proof-demo.ts";
import { acceptDelivery, joinSeller, prepareReplacement, requestChanges, requireWorkflowAction, snapshotVersion, submitDelivery } from "../lib/proof-workflow.ts";
import { requireActiveAuthorization, validateAcceptance } from "../lib/proof-domain.ts";
import { parseStaticProject } from "../lib/static-project.ts";
import { authorizeOrder, captureAuthorization, createAuthorizationOrder, PAYPAL_SANDBOX_URL, voidAuthorization, type Fetcher } from "../lib/providers.ts";

const stamp = "2026-11-01T00:00:00.000Z";
const html = "<!doctype html><html><head><title>Noodle website</title></head><body><main>Noodles and business details</main></body></html>";
const request = {mode: "custom", demoRoleplay: true, collaborative: false, paymentTesting: "sandbox"};
const membership = {buyerId: "owner", actorId: "owner", sellerId: null, authenticated: true};
const rejects = (operation: () => unknown, status: number) => assert.throws(operation,
  (error: unknown) => error instanceof Error && "status" in error && error.status === status);

function rehearsal(): ProofQuote {
  const custom = parseStaticProject({title: "Noodle website rehearsal", summary: "A current-version delivery followed by a test merchant payment", amount: "1.00", requiredPages: ["index.html", "contact.html"], manualRequirements: []}, "en");
  return {
    id: "sandbox-rehearsal", reference: "PBP-REHEARSAL", title: custom.title, summary: custom.summary, brief: custom.summary,
    clientName: "Synthetic buyer", currency: "AUD", language: "en", hourlyRateCents: custom.totalCents, totalCents: custom.totalCents,
    lineItems: [{id: "site", description: custom.title, quantity: 1, unitPriceCents: custom.totalCents}],
    assumptions: [], questions: [], timelineDays: 1, status: "draft", aiMode: "demo", paymentMode: "sandbox", createdAt: stamp,
    workflow: "proof-v1", proof: {demoRoleplay: true, sandboxRehearsal: true, demoSampleProject: false,
      project: custom.project, criteria: custom.criteria, collaboration: {stage: "awaiting_seller", feedback: []}, paymentState: "unfunded", audit: []},
  };
}
function approved() {
  const quote = rehearsal(); quote.status = "approved";
  return joinSeller(quote, "Virtual seller", stamp);
}
function reviewed(quote: ProofQuote, files: Record<string, string>) {
  const next = prepareReplacement(quote, createRoleplayDelivery(quote, {files}, (quote.proof.delivery?.sequence ?? 0) + 1));
  next.proof.review = {deliveryId: next.proof.delivery!.id, reviewedAt: stamp, mode: "demo", summary: "Provider-free rules only"};
  return next;
}
function accepted() {
  let quote = reviewed(approved(), {"index.html": html, "contact.html": html});
  quote = submitDelivery(quote, {deliveryId: quote.proof.delivery!.id, note: "Ready for review"}, stamp);
  return acceptDelivery(quote, {deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: ["mobile"]}, stamp);
}
function authorization(quote: ProofQuote, status = "CREATED") {
  return {id: "AUTH-REHEARSAL", status, amount: {currency_code: "AUD", value: "1.00"}, expiration_time: new Date(Date.now() + 86_400_000).toISOString(), custom_id: quote.id,
    supplementary_data: {related_ids: {order_id: "ORDER-REHEARSAL"}}};
}
function captured(quote: ProofQuote) {
  return {id: "CAPTURE-REHEARSAL", status: "COMPLETED", amount: {currency_code: "AUD", value: "1.00"}, final_capture: true, custom_id: quote.id,
    supplementary_data: {related_ids: {order_id: "ORDER-REHEARSAL", authorization_id: "AUTH-REHEARSAL"}}};
}
function order(quote: ProofQuote, auth?: ReturnType<typeof authorization>, capture?: ReturnType<typeof captured>) {
  return {id: "ORDER-REHEARSAL", status: auth ? "COMPLETED" : "APPROVED", intent: "AUTHORIZE", purchase_units: [{reference_id: quote.id, custom_id: quote.id, invoice_id: quote.reference,
    amount: {currency_code: "AUD", value: "1.00"}, payments: {authorizations: auth ? [auth] : [], captures: capture ? [capture] : []}}]};
}
function queue(replies: unknown[]) {
  const calls: {url: string; init: RequestInit}[] = [];
  const fetcher: Fetcher = async (url, init = {}) => {
    calls.push({url: String(url), init});
    assert.ok(replies.length, "Unexpected mocked provider request");
    return new Response(JSON.stringify(replies.shift()), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  return {fetcher, calls};
}
const env = {PAYPAL_CLIENT_ID: "synthetic-client", PAYPAL_CLIENT_SECRET: "synthetic-secret"};
const token = {access_token: "synthetic-provider-token"};

test("Sandbox rehearsal is an explicit creation-only opt-in with authentication, owner role play and configuration", () => {
  assert.equal(requestSandboxRehearsal(request, true, true), true);
  assert.equal(requestSandboxRehearsal({...request, mode: "demo"}, true, true), true);
  assert.equal(requestSandboxRehearsal({...request, paymentTesting: undefined}, true, true), false);
  assert.equal(requestSandboxRehearsal({}, false, false), false);
  for (const paymentTesting of [false, true, null, "demo", "live", "sandbox ", 1, {}]) rejects(() => requestSandboxRehearsal({...request, paymentTesting}, true, true), 400);
  rejects(() => requestSandboxRehearsal(request, false, true), 401);
  rejects(() => requestSandboxRehearsal(request, true, false), 409);
  for (const changes of [{demoRoleplay: false}, {collaborative: true}, {mode: "other"}, {mode: undefined}]) {
    rejects(() => requestSandboxRehearsal({...request, ...changes}, true, true), 400);
  }
});

test("only the marked one-owner Sandbox rehearsal permits both perspectives, never outsiders or real seller membership", () => {
  const quote = rehearsal();
  assert.equal(isDemoRoleplay(quote), false);
  assert.equal(isSandboxRehearsal(quote), true);
  assert.equal(isOwnerRoleplay(quote), true);
  assert.equal(resolveProofRole(quote, {...membership, requestedDemoRole: "seller"}), "seller");
  assert.equal(resolveProofRole(quote, {...membership, actorId: "outsider", requestedDemoRole: "seller"}), undefined);
  assert.equal(resolveProofRole(quote, {...membership, authenticated: false, requestedDemoRole: "seller"}), "buyer");
  assert.equal(resolveProofRole(quote, {...membership, sellerId: "real-seller", requestedDemoRole: "seller"}), "buyer");
  for (const change of [
    (q: ProofQuote) => {delete q.proof.sandboxRehearsal;},
    (q: ProofQuote) => {delete q.proof.demoRoleplay;},
    (q: ProofQuote) => {q.paymentMode = "demo";},
    (q: ProofQuote) => {q.aiMode = "live";},
    (q: ProofQuote) => {delete q.proof.project;},
    (q: ProofQuote) => {delete q.proof.collaboration;},
  ]) {
    const malformed = rehearsal(); change(malformed);
    assert.equal(isOwnerRoleplay(malformed), false);
    assert.equal(resolveProofRole(malformed, {...membership, requestedDemoRole: "seller"}), "buyer");
  }
  assert.equal(canUseRoleplaySamples(quote), false);
  rejects(() => createRoleplayDelivery(quote, {variant: "fixed"}, 1), 409);
});

test("new built-in Sandbox rehearsal samples use the server-recorded origin and honest test-merchant description", () => {
  const parsed = createRoleplayProject("en", true);
  const quote = rehearsal();
  quote.proof.project = parsed.project; quote.proof.criteria = parsed.criteria;
  quote.proof.demoSampleProject = true;
  assert.equal(canUseRoleplaySamples(quote), true);
  const fixed = createRoleplayDelivery(quote, {variant: "fixed"}, 1);
  assert.equal(fixed.variant, "upload");
  assert.ok(fixed.evidence.every(item => item.finding !== "fail"));
  assert.ok(parsed.summary.includes("test-merchant"));
  assert.ok(parsed.summary.includes("no real seller settlement"));
  for (const origin of [false, undefined]) {
    quote.proof.demoSampleProject = origin;
    assert.equal(canUseRoleplaySamples(quote), false);
    rejects(() => createRoleplayDelivery(quote, {variant: "fixed"}, 1), 409);
  }
});

test("Sandbox starts only after exact-version acceptance; seller/payment impersonation, draft, stale acceptance and real collaborations remain blocked", () => {
  const draft = rehearsal();
  rejects(() => joinSeller(draft, "Virtual seller", stamp), 409);
  const quote = reviewed(approved(), {"index.html": html, "contact.html": html});
  for (const action of ["checkout", "authorize", "capture"] as const) rejects(() => requireWorkflowAction(quote, "buyer", action), 409);
  for (const action of ["checkout", "authorize", "capture", "void", "reconcile"] as const) rejects(() => requireWorkflowAction(quote, "seller", action), 403);
  const good = accepted();
  assert.doesNotThrow(() => requireWorkflowAction(good, "buyer", "checkout"));
  assert.doesNotThrow(() => requireWorkflowAction(good, "buyer", "authorize"));
  good.proof.collaboration!.acceptance!.deliveryId = "stale";
  for (const action of ["checkout", "authorize", "capture"] as const) rejects(() => requireWorkflowAction(good, "buyer", action), 409);
  const real = accepted(); delete real.proof.demoRoleplay; delete real.proof.sandboxRehearsal;
  for (const action of ["checkout", "authorize", "capture", "void", "reconcile"] as const) rejects(() => requireWorkflowAction(real, "buyer", action), 409);
});

test("a revised delivery keeps the same Sandbox project through explicit acceptance, authorization and capture with mocked provider evidence", async () => {
  let quote = reviewed(approved(), {"index.html": html});
  quote = submitDelivery(quote, {deliveryId: quote.proof.delivery!.id, note: "Initial delivery"}, stamp);
  const oldId = quote.proof.delivery!.id;
  rejects(() => acceptDelivery(quote, {deliveryId: oldId, confirm: true, manualChecks: ["mobile"]}), 409);
  quote = requestChanges(quote, {deliveryId: oldId, feedback: [{criterionId: "page-2", comment: "The agreed contact page is missing."}]});
  const history = snapshotVersion(quote);
  quote = reviewed(quote, {"index.html": html, "contact.html": html});
  quote = submitDelivery(quote, {deliveryId: quote.proof.delivery!.id, note: "Contact page supplied"});
  quote = acceptDelivery(quote, {deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: ["mobile"]});
  assert.notEqual(quote.proof.delivery!.id, oldId);
  assert.equal(history.delivery.id, oldId);
  assert.equal(history.feedback.length, 1);
  assert.equal(quote.proof.paymentState, "unfunded");
  assert.equal(quote.paypalOrderId, undefined);
  const mock = queue([token, {...order(quote), links: [{rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-REHEARSAL"}]},
    token, order(quote), {id: "ORDER-REHEARSAL"}, order(quote, authorization(quote)),
    token, order(quote, authorization(quote)), captured(quote), order(quote, authorization(quote, "CAPTURED"), captured(quote))]);
  requireWorkflowAction(quote, "buyer", "checkout");
  const checkout = await createAuthorizationOrder(quote, env, "https://proof.test", mock.fetcher);
  quote.paypalOrderId = checkout.orderId;
  quote.paypalApprovalUrl = checkout.approvalUrl;
  requireWorkflowAction(quote, "buyer", "authorize");
  const auth = await authorizeOrder(quote, env, mock.fetcher);
  quote.proof.paymentState = "authorized"; quote.proof.authorizationId = auth.authorizationId;
  quote.proof.authorizationExpiresAt = new Date(Date.now() + 86_400_000).toISOString();
  requireWorkflowAction(quote, "buyer", "capture");
  const checks = quote.proof.collaboration!.acceptance!.manualChecks;
  rejects(() => validateAcceptance(quote, {deliveryId: oldId, confirm: true, manualChecks: checks}), 400);
  rejects(() => validateAcceptance(quote, {deliveryId: quote.proof.delivery!.id, confirm: false, manualChecks: checks}), 400);
  assert.deepEqual(validateAcceptance(quote, {deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: checks}), ["mobile"]);
  assert.equal((await captureAuthorization(quote, env, mock.fetcher)).captureId, "CAPTURE-REHEARSAL");
  assert.equal(quote.proof.collaboration!.acceptance!.deliveryId, quote.proof.delivery!.id);
  assert.ok(mock.calls.every(call => call.url.startsWith(PAYPAL_SANDBOX_URL)));
  assert.equal(JSON.parse(String(mock.calls[1].init.body)).purchase_units[0].custom_id, quote.id);
  assert.equal(new Headers(mock.calls[8].init.headers).get("PayPal-Request-Id"), `proof-capture-${quote.id}`);
});

test("accepted rehearsal still requires a current unexpired authorization; cancellation only uses a matching test authorization", async () => {
  const quote = accepted();
  const consent = {deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: ["mobile"]};
  rejects(() => validateAcceptance(quote, consent), 400);
  quote.paypalOrderId = "ORDER-REHEARSAL";
  quote.proof.authorizationId = "AUTH-REHEARSAL"; quote.proof.paymentState = "authorized";
  quote.proof.authorizationExpiresAt = new Date(Date.now() + 86_400_000).toISOString();
  quote.status = "draft";
  rejects(() => validateAcceptance(quote, consent), 400);
  quote.status = "approved";
  quote.proof.authorizationExpiresAt = new Date(Date.now() - 1).toISOString();
  rejects(() => requireActiveAuthorization(quote), 400);
  rejects(() => validateAcceptance(quote, consent), 400);
  // Existing cancellation deliberately remains available after the local window.
  requireWorkflowAction(quote, "buyer", "void");
  const mock = queue([token, order(quote, authorization(quote)), {}, authorization(quote, "VOIDED")]);
  await voidAuthorization(quote, env, mock.fetcher);
  assert.equal(mock.calls[2].url, `${PAYPAL_SANDBOX_URL}/v2/payments/authorizations/AUTH-REHEARSAL/void`);
  assert.ok(mock.calls.every(call => call.url.startsWith(PAYPAL_SANDBOX_URL)));
});
