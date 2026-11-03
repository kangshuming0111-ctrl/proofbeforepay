import {acceptDeliveryWithBasis as acceptDelivery, validateAcceptanceWithBasis as validateAcceptance} from "./acceptance-client.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote } from "../lib/contracts.ts";
import { isOwnerRoleplay, isSandboxCollaboration, requestSandboxTesting, resolveProofRole } from "../lib/proof-demo.ts";
import {joinSeller, prepareReplacement, requestChanges, requireExpectedDelivery, requireWorkflowAction, snapshotVersion, submitDelivery} from "../lib/proof-workflow.ts";

import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import { authorizeOrder, captureAuthorization, createAuthorizationOrder, PAYPAL_SANDBOX_URL, type Fetcher } from "../lib/providers.ts";

// All identities, configuration and provider responses here are local synthetic
// fixtures. These tests do not establish two real authenticated browser sessions.
const at = "2026-11-02T00:00:00.000Z";
const html = "<!doctype html><html><head><title>Delivery</title></head><body><main>Business website</main></body></html>";
const request = {mode: "custom", collaborative: true, demoRoleplay: false, paymentTesting: "collaborative-sandbox"};
const rejects = (operation: () => unknown, expected: number) => assert.throws(operation,
  (error: unknown) => error instanceof Error && "status" in error && error.status === expected);

function agreement(): ProofQuote {
  const parsed = parseStaticProject({title: "Two-account website", summary: "Synthetic membership and test-merchant payment", amount: "1.00", requiredPages: ["index.html", "contact.html"], manualRequirements: []}, "en");
  return {id: "synthetic-two-account", reference: "PBP-TWO-ACCOUNT", title: parsed.title, summary: parsed.summary, brief: parsed.summary,
    clientName: "Synthetic buyer", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100,
    lineItems: [{id: "site", description: parsed.title, quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1,
    status: "approved", aiMode: "demo", paymentMode: "sandbox", createdAt: at, workflow: "proof-v1",
    proof: {sandboxCollaboration: true, project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], collaboration: {stage: "awaiting_seller", feedback: []}}};
}
function reviewed(quote: ProofQuote, files: Record<string, string>) {
  const next = prepareReplacement(quote, createUploadedDelivery(files, quote.proof.project!, "en", (quote.proof.delivery?.sequence ?? 0) + 1));
  next.proof.review = {deliveryId: next.proof.delivery!.id, mode: "demo", summary: "Provider-free rules", reviewedAt: at};
  return next;
}
function accepted() {
  let quote = reviewed(joinSeller(agreement(), "Synthetic invited seller", at), {"index.html": html, "contact.html": html});
  quote = submitDelivery(quote, {deliveryId: quote.proof.delivery!.id, note: "Please review"}, at);
  return acceptDelivery(quote, {deliveryId: quote.proof.delivery!.id, confirm: true, manualChecks: ["mobile"]}, at);
}

test("two-account Sandbox is an explicit configured authenticated custom creation mode; existing requests never gain it", () => {
  assert.equal(requestSandboxTesting(request, true, true), "collaborative");
  assert.equal(requestSandboxTesting({...request, demoRoleplay: undefined}, true, true), "collaborative");
  assert.equal(requestSandboxTesting({mode: "custom", collaborative: true}, true, true), undefined);
  assert.equal(requestSandboxTesting({}, false, false), undefined);
  rejects(() => requestSandboxTesting(request, false, true), 401);
  rejects(() => requestSandboxTesting(request, true, false), 409);
  for (const patch of [{mode: "demo"}, {mode: undefined}, {collaborative: false}, {collaborative: undefined}, {demoRoleplay: true}, {demoRoleplay: "false"}, {paymentTesting: "live"}]) {
    rejects(() => requestSandboxTesting({...request, ...patch}, true, true), 400);
  }
  assert.equal(requestSandboxTesting({mode: "demo", demoRoleplay: true, paymentTesting: "sandbox"}, true, true), "rehearsal");
});

test("Sandbox membership never uses owner perspective headers and only the joined seller receives seller rights", () => {
  const quote = agreement(), membership = {buyerId: "synthetic-buyer", sellerId: null, actorId: "synthetic-buyer", authenticated: true};
  assert.equal(isSandboxCollaboration(quote), true); assert.equal(isOwnerRoleplay(quote), false);
  assert.equal(resolveProofRole(quote, {...membership, requestedDemoRole: "seller"}), "buyer");
  assert.equal(resolveProofRole(quote, {...membership, actorId: "synthetic-outsider", requestedDemoRole: "seller"}), undefined);
  assert.equal(resolveProofRole(quote, {...membership, sellerId: "synthetic-seller", actorId: "synthetic-seller", requestedDemoRole: "buyer"}), undefined);
  const joined = joinSeller(quote, "Synthetic seller", at);
  assert.equal(resolveProofRole(joined, {...membership, sellerId: "synthetic-seller", actorId: "synthetic-seller", requestedDemoRole: "buyer"}), "seller");
  assert.equal(resolveProofRole(joined, {...membership, sellerId: "synthetic-seller", requestedDemoRole: "seller"}), "buyer");
  for (const action of ["checkout", "authorize", "capture", "void", "reconcile", "approve", "invite", "return", "accept_delivery"] as const) rejects(() => requireWorkflowAction(joined, "seller", action), 403);
  for (const action of ["delivery", "submit_delivery"] as const) rejects(() => requireWorkflowAction(joined, "buyer", action), 403);
});

test("unmarked legacy or contradictory Sandbox records cannot be upgraded to collaborative payment or seller joins", () => {
  const legacy = agreement(); delete legacy.proof.sandboxCollaboration;
  assert.equal(isSandboxCollaboration(legacy), false);
  rejects(() => joinSeller(legacy, "Seller", at), 409);
  const finished = accepted(); delete finished.proof.sandboxCollaboration;
  for (const action of ["checkout", "authorize", "capture", "void", "reconcile"] as const) rejects(() => requireWorkflowAction(finished, "buyer", action), 409);
  for (const change of [
    (q: ProofQuote) => {q.paymentMode = "demo";},
    (q: ProofQuote) => {q.proof.demoRoleplay = true;},
    (q: ProofQuote) => {q.proof.sandboxRehearsal = true;},
    (q: ProofQuote) => {delete q.proof.project;},
    (q: ProofQuote) => {delete q.proof.collaboration;},
  ]) {
    const invalid = agreement(); change(invalid);
    assert.equal(isSandboxCollaboration(invalid), false);
    rejects(() => requireWorkflowAction(invalid, "buyer", "approve"), 409);
    rejects(() => joinSeller(invalid, "Seller", at), 409);
  }
});

test("a two-member revision remains payment-free until the buyer accepts its exact current version", () => {
  let quote = agreement();
  for (const action of ["checkout", "authorize"] as const) rejects(() => requireWorkflowAction(quote, "buyer", action), 409);
  quote = reviewed(joinSeller(quote, "Synthetic seller", at), {"index.html": html});
  const firstId = quote.proof.delivery!.id;
  quote = submitDelivery(quote, {deliveryId: firstId, note: "Initial source files"}, at);
  rejects(() => acceptDelivery(quote, {deliveryId: firstId, confirm: true, manualChecks: ["mobile"]}, at), 409);
  quote = requestChanges(quote, {deliveryId: firstId, feedback: [{criterionId: "page-2", comment: "The agreed contact page is missing."}]}, at);
  const history = snapshotVersion(quote, at);
  quote = reviewed(quote, {"index.html": html, "contact.html": html});
  const currentId = quote.proof.delivery!.id;
  rejects(() => requireExpectedDelivery(quote, {expectedDeliveryId: firstId}), 409);
  quote = submitDelivery(quote, {deliveryId: currentId, note: "Revised source files"}, at);
  rejects(() => acceptDelivery(quote, {deliveryId: firstId, confirm: true, manualChecks: ["mobile"]}, at), 409);
  quote = acceptDelivery(quote, {deliveryId: currentId, confirm: true, manualChecks: ["mobile"]}, at);
  assert.equal(history.delivery.id, firstId); assert.equal(history.feedback.length, 1);
  assert.deepEqual(Object.keys(history).sort(), ["archivedAt", "delivery", "feedback", "review", "submission"], "Version snapshots contain no quote-level payment resources");
  assert.equal(quote.proof.collaboration!.acceptance!.deliveryId, currentId);
  assert.equal(quote.proof.paymentState, "unfunded"); assert.equal(quote.paypalOrderId, undefined);
  assert.doesNotThrow(() => requireWorkflowAction(quote, "buyer", "checkout"));
  assert.doesNotThrow(() => requireWorkflowAction(quote, "buyer", "authorize"));
  rejects(() => validateAcceptance(quote, {deliveryId: currentId, confirm: true, manualChecks: ["mobile"]}), 400);
  const stale = structuredClone(quote); stale.proof.collaboration!.acceptance!.deliveryId = firstId;
  for (const action of ["checkout", "authorize", "capture"] as const) rejects(() => requireWorkflowAction(stale, "buyer", action), 409);
  // Even a corrupted/stale acceptance must not remove the buyer's cancellation
  // authority. The provider/domain independently validates its authorization.
  assert.doesNotThrow(() => requireWorkflowAction(stale, "buyer", "void"));
});

test("the accepted two-account Sandbox project uses one configured test merchant and exact-version mocked authorization/capture", async () => {
  const quote = accepted(), deliveryId = quote.proof.delivery!.id;
  const auth = {id: "AUTH-TWO", status: "CREATED", amount: {currency_code: "AUD", value: "1.00"}, expiration_time: new Date(Date.now() + 86_400_000).toISOString(), custom_id: quote.id, supplementary_data: {related_ids: {order_id: "ORDER-TWO"}}};
  const captured = {id: "CAP-TWO", status: "COMPLETED", amount: {currency_code: "AUD", value: "1.00"}, final_capture: true, custom_id: quote.id, supplementary_data: {related_ids: {order_id: "ORDER-TWO", authorization_id: "AUTH-TWO"}}};
  const order = (authorization?: typeof auth, capture?: typeof captured) => ({id: "ORDER-TWO", status: authorization ? "COMPLETED" : "APPROVED", intent: "AUTHORIZE", purchase_units: [{reference_id: quote.id, custom_id: quote.id, invoice_id: quote.reference, amount: {currency_code: "AUD", value: "1.00"}, payments: {authorizations: authorization ? [authorization] : [], captures: capture ? [capture] : []}}]});
  const token = {access_token: "synthetic-local-provider-token"};
  const replies = [token, {...order(), links: [{rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-TWO"}]}, token, order(), {id: "ORDER-TWO"}, order(auth), token, order(auth), captured, order({...auth, status: "CAPTURED"}, captured)];
  const calls: {url: string; init: RequestInit}[] = [];
  const fetcher: Fetcher = async (url, init = {}) => {
    calls.push({url: String(url), init}); assert.ok(replies.length, "Unexpected synthetic provider request");
    return new Response(JSON.stringify(replies.shift()), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  const env = {PAYPAL_CLIENT_ID: "synthetic-configured-merchant", PAYPAL_CLIENT_SECRET: "synthetic-local-secret"};
  const checkout = await createAuthorizationOrder(quote, env, "https://proof.test", fetcher);
  quote.paypalOrderId = checkout.orderId; quote.paypalApprovalUrl = checkout.approvalUrl;
  const authorization = await authorizeOrder(quote, env, fetcher);
  quote.proof.paymentState = "authorized"; quote.proof.authorizationId = authorization.authorizationId; quote.proof.authorizationExpiresAt = auth.expiration_time;
  const consent = {deliveryId, confirm: true, manualChecks: ["mobile"]};
  requireWorkflowAction(quote, "buyer", "capture");
  rejects(() => validateAcceptance(quote, {...consent, deliveryId: "stale"}), 400);
  assert.deepEqual(validateAcceptance(quote, consent), ["mobile"]);
  assert.equal((await captureAuthorization(quote, env, fetcher)).captureId, "CAP-TWO");
  assert.equal(quote.proof.collaboration!.acceptance!.deliveryId, deliveryId);
  assert.equal(replies.length, 0); assert.ok(calls.every(call => call.url.startsWith(PAYPAL_SANDBOX_URL)));
  const purchase = JSON.parse(String(calls[1].init.body)).purchase_units[0];
  assert.equal(purchase.custom_id, quote.id); assert.equal(purchase.amount.value, "1.00");
  assert.equal(purchase.payee, undefined, "The app uses its configured merchant, never a seller-supplied payee");
  const captures = calls.filter(call => call.init.method === "POST" && call.url.endsWith("/capture"));
  assert.equal(captures.length, 1);
  assert.equal(new Headers(captures[0].init.headers).get("PayPal-Request-Id"), `proof-capture-${quote.id}`);
});
