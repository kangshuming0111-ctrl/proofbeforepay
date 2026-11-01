import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote } from "../lib/contracts.ts";
import { authorizeOrder, captureAuthorization, createAuthorizationOrder, PAYPAL_SANDBOX_URL, ProviderError, reconcileProofPayment, reviewProof, voidAuthorization, type Fetcher } from "../lib/providers.ts";

const quote: ProofQuote = {
  id: "proof-123", reference: "PBP-123", title: "Contact page delivery", summary: "A contact page with agreed acceptance checks.",
  brief: "Deliver a contact page with an email field and responsive styling.", clientName: "Client", currency: "AUD", language: "en", hourlyRateCents: 7500,
  lineItems: [{ id: "build", description: "Implementation", quantity: 1.25, unitPriceCents: 7500 }],
  assumptions: [], questions: [], timelineDays: 7, totalCents: 9375, status: "approved", aiMode: "demo", paymentMode: "sandbox", createdAt: "2026-10-30T00:00:00.000Z",
  paypalOrderId: "ORDER123", workflow: "proof-v1",
  proof: {
    criteria: [{ id: "email", title: "Email field", source: "index.html" }, { id: "mobile", title: "Responsive layout", source: "styles.css" }],
    paymentState: "authorized", authorizationId: "AUTH123", audit: [],
    delivery: { id: "delivery-1", variant: "flawed", label: "First delivery", submittedAt: "2026-10-30T01:00:00.000Z", evidence: [
      { id: "e1", criterionId: "email", file: "index.html", excerpt: "<input type=\"text\">", finding: "fail", explanation: "The field uses text rather than email input type." },
      { id: "e2", criterionId: "mobile", file: "styles.css", excerpt: "@media (max-width: 600px) {}", finding: "needs_human", explanation: "A buyer must inspect the rendered mobile layout." },
    ] },
  },
};
const env = { PAYPAL_CLIENT_ID: "test-sandbox-client", PAYPAL_CLIENT_SECRET: "test-sandbox-secret" };
const token = { access_token: "test-token" };
type Reply = { body?: unknown; status?: number; networkError?: boolean };
function queue(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const reply = replies.shift();
    assert.ok(reply, `Unexpected request to ${String(url)}`);
    if (reply.networkError) throw new Error("Lost external response containing private provider detail");
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { fetcher, calls };
}
function authorization(status = "CREATED", changes = {}) {
  return { id: "AUTH123", status, amount: { currency_code: "AUD", value: "93.75" }, expiration_time: "2026-11-28T01:00:00Z", supplementary_data: { related_ids: { order_id: "ORDER123" } }, ...changes };
}
function capture(status = "COMPLETED", changes = {}) {
  return { id: "CAPTURE123", status, amount: { currency_code: "AUD", value: "93.75" }, final_capture: true, custom_id: quote.id, supplementary_data: { related_ids: { order_id: "ORDER123", authorization_id: "AUTH123" } }, ...changes };
}
function order(auth?: ReturnType<typeof authorization>, captured?: ReturnType<typeof capture>, changes = {}) {
  return { id: "ORDER123", intent: "AUTHORIZE", status: auth ? "COMPLETED" : "APPROVED", purchase_units: [{
    reference_id: quote.id, custom_id: quote.id, invoice_id: quote.reference, amount: { currency_code: "AUD", value: "93.75" },
    payments: { authorizations: auth ? [auth] : [], captures: captured ? [captured] : [] },
  }], ...changes };
}
const unfunded = { ...quote, proof: { ...quote.proof, paymentState: "unfunded" as const, authorizationId: undefined } };

test("authorization checkout uses AUTHORIZE, authoritative money, proof callback and stable request ID", async () => {
  const response = { ...order(), links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123" }] };
  const fake = queue([{ body: token }, { body: response }, { body: token }, { body: response }]);
  await createAuthorizationOrder(unfunded, env, "https://proof.example", fake.fetcher);
  await createAuthorizationOrder(unfunded, env, "https://proof.example", fake.fetcher);
  const payload = JSON.parse(String(fake.calls[1].init.body));
  assert.equal(payload.intent, "AUTHORIZE");
  assert.deepEqual(payload.purchase_units[0].amount, { currency_code: "AUD", value: "93.75" });
  assert.equal(payload.purchase_units[0].custom_id, quote.id);
  assert.equal(payload.payment_source.paypal.experience_context.return_url, "https://proof.example/?proof=proof-123");
  assert.equal(new Headers(fake.calls[1].init.headers).get("PayPal-Request-Id"), new Headers(fake.calls[3].init.headers).get("PayPal-Request-Id"));
  assert.ok(fake.calls.every((call) => call.url.startsWith(PAYPAL_SANDBOX_URL)));
});

test("authorize requires buyer approval, then verifies the active authorization on the saved order", async () => {
  const fake = queue([{ body: token }, { body: order() }, { body: { id: "ORDER123", status: "COMPLETED" } }, { body: order(authorization()) }]);
  assert.deepEqual(await authorizeOrder(unfunded, env, fake.fetcher), { authorizationId: "AUTH123", expiresAt: "2026-11-28T01:00:00.000Z" });
  assert.equal(fake.calls[2].url, `${PAYPAL_SANDBOX_URL}/v2/checkout/orders/ORDER123/authorize`);
  const notApproved = queue([{ body: token }, { body: order(undefined, undefined, { status: "CREATED" }) }]);
  await assert.rejects(authorizeOrder(unfunded, env, notApproved.fetcher), /buyer must approve/u);
  assert.equal(notApproved.calls.length, 2);
});

test("authorization retries reconcile documented duplicates, not merely successful-looking error bodies", async () => {
  const duplicate = queue([{ body: token }, { body: order() }, { status: 422, body: { details: [{ issue: "ORDER_ALREADY_AUTHORIZED" }] } }, { body: order(authorization()) }]);
  assert.equal((await authorizeOrder(unfunded, env, duplicate.fetcher)).authorizationId, "AUTH123");
  const existing = queue([{ body: token }, { body: order(authorization()) }]);
  assert.equal((await authorizeOrder(unfunded, env, existing.fetcher)).authorizationId, "AUTH123");
  assert.ok(existing.calls.every((call) => !call.url.endsWith("/authorize")));
  const unconfirmed = queue([{ body: token }, { body: order() }, { networkError: true }, { body: order() }]);
  await assert.rejects(authorizeOrder(unfunded, env, unconfirmed.fetcher), /has not confirmed/u);
});

test("foreign or altered order and authorization records are rejected before payment mutations", async () => {
  const badUnit = order(authorization());
  badUnit.purchase_units[0].custom_id = "other-proof";
  for (const data of [badUnit, order(authorization("CREATED", { id: "FOREIGN_AUTH" })), order(authorization(), undefined, { intent: "CAPTURE" })]) {
    const fake = queue([{ body: token }, { body: data }]);
    await assert.rejects(captureAuthorization(quote, env, fake.fetcher), ProviderError);
    assert.equal(fake.calls.length, 2);
  }
});

test("capture verifies exact money and order/authorization relationship before marking completed", async () => {
  const fake = queue([{ body: token }, { body: order(authorization()) }, { body: capture() }, { body: order(authorization("CAPTURED"), capture()) }]);
  assert.deepEqual(await captureAuthorization(quote, env, fake.fetcher), { captureId: "CAPTURE123" });
  assert.equal(fake.calls[2].url, `${PAYPAL_SANDBOX_URL}/v2/payments/authorizations/AUTH123/capture`);
  assert.equal(new Headers(fake.calls[2].init.headers).get("PayPal-Request-Id"), "proof-capture-proof-123");
  assert.deepEqual(JSON.parse(String(fake.calls[2].init.body)).amount, { currency_code: "AUD", value: "93.75" });
  assert.deepEqual(Object.keys(JSON.parse(String(fake.calls[2].init.body))).sort(), ["amount", "final_capture", "invoice_id"]);
  for (const changed of [
    { status: "PENDING" }, { amount: { currency_code: "AUD", value: "0.01" } }, { amount: { currency_code: "USD", value: "93.75" } },
    { supplementary_data: { related_ids: { order_id: "ORDER123", authorization_id: "FOREIGN_AUTH" } } },
  ]) {
    const invalid = queue([{ body: token }, { body: order(authorization()) }, { body: capture("COMPLETED", changed) }]);
    await assert.rejects(captureAuthorization(quote, env, invalid.fetcher), ProviderError);
  }
});

test("lost capture response or duplicate reconciles only a completed capture on the same order", async () => {
  for (const reply of [{ networkError: true }, { status: 422, body: { details: [{ issue: "AUTHORIZATION_ALREADY_CAPTURED" }] } }]) {
    const fake = queue([{ body: token }, { body: order(authorization()) }, reply, { body: order(authorization("CAPTURED"), capture()) }]);
    assert.deepEqual(await captureAuthorization(quote, env, fake.fetcher), { captureId: "CAPTURE123" });
  }
  const persisted = queue([{ body: token }, { body: order(authorization("CAPTURED"), capture()) }]);
  assert.deepEqual(await captureAuthorization(quote, env, persisted.fetcher), { captureId: "CAPTURE123" });
  assert.equal(persisted.calls.length, 2);
  const pending = queue([{ body: token }, { body: order(authorization()) }, { networkError: true }, { body: order(authorization(), capture("PENDING")) }]);
  await assert.rejects(captureAuthorization(quote, env, pending.fetcher), /Pending payments are not paid/u);
});

test("a 204 void succeeds only after GET proves the saved authorization is VOIDED", async () => {
  const fake = queue([{ body: token }, { body: order(authorization()) }, { status: 204 }, { body: authorization("VOIDED") }]);
  await voidAuthorization(quote, env, fake.fetcher);
  assert.equal(fake.calls[2].url, `${PAYPAL_SANDBOX_URL}/v2/payments/authorizations/AUTH123/void`);
  assert.equal(fake.calls[3].url, `${PAYPAL_SANDBOX_URL}/v2/payments/authorizations/AUTH123`);
  assert.equal(new Headers(fake.calls[2].init.headers).get("PayPal-Request-Id"), "proof-void-proof-123");
  const unconfirmed = queue([{ body: token }, { body: order(authorization()) }, { status: 204 }, { body: authorization() }]);
  await assert.rejects(voidAuthorization(quote, env, unconfirmed.fetcher), /has not confirmed/u);
});

test("void retry reconciles its exact authorization, and cannot cancel captured or foreign funds", async () => {
  const existing = queue([{ body: token }, { body: order(authorization("VOIDED")) }, { body: authorization("VOIDED") }]);
  await voidAuthorization(quote, env, existing.fetcher);
  assert.ok(existing.calls.every((call) => !call.url.endsWith("/void")));
  const duplicate = queue([{ body: token }, { body: order(authorization()) }, { status: 422, body: { details: [{ issue: "AUTHORIZATION_VOIDED" }] } }, { body: authorization("VOIDED") }]);
  await voidAuthorization(quote, env, duplicate.fetcher);
  const captured = queue([{ body: token }, { body: order(authorization("CAPTURED"), capture()) }]);
  await assert.rejects(voidAuthorization(quote, env, captured.fetcher), /already has a capture/u);
  const wrong = queue([{ body: token }, { body: order(authorization()) }, { status: 204 }, { body: authorization("VOIDED", { id: "OTHER_AUTH" }) }]);
  await assert.rejects(voidAuthorization(quote, env, wrong.fetcher), ProviderError);
});

test("proof review demo discloses no AI and preserves deterministic failed/human findings", async () => {
  const fake = queue([]);
  const before = structuredClone(quote.proof.delivery);
  const result = await reviewProof(quote, {}, fake.fetcher);
  assert.equal(result.mode, "demo");
  assert.match(result.summary, /no AI request/u);
  assert.match(result.summary, /0 passed, 1 failed, 1 need human review/u);
  assert.deepEqual(quote.proof.delivery, before);
  assert.equal(fake.calls.length, 0);
});

test("live proof review only returns a bounded explanation and cannot set payment or evidence status", async () => {
  const response = (content: unknown) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] });
  const summary = "index.html has a text input instead of an email input. A buyer still needs to inspect the mobile layout.";
  const fake = queue([{ body: response({ summary }) }]);
  const result = await reviewProof(quote, { DEEPSEEK_API_KEY: "test-only" }, fake.fetcher);
  assert.equal(result.mode, "live");
  assert.match(result.summary, /1 failed/u);
  assert.match(result.summary, /AI does not decide acceptance or payment/u);
  const payload = JSON.parse(String(fake.calls[0].init.body));
  const source = JSON.parse(payload.messages[1].content);
  assert.equal(source.evidence[0].finding, "fail");
  assert.match(payload.messages[0].content, /untrusted quoted source data/u);
  for (const invalid of [{ summary, paymentState: "captured" }, { summary: "x" }, { summary: "x".repeat(1201) }]) {
    const bad = queue([{ body: response(invalid) }]);
    await assert.rejects(reviewProof(quote, { DEEPSEEK_API_KEY: "test-only" }, bad.fetcher), ProviderError);
  }
  const failure = queue([{ status: 401, body: { message: "SECRET upstream detail" } }]);
  await assert.rejects(reviewProof(quote, { DEEPSEEK_API_KEY: "test-only" }, failure.fetcher), (error: unknown) => error instanceof ProviderError && !error.message.includes("SECRET"));
});

const pendingQuote: ProofQuote = { ...quote, proof: { ...quote.proof, paymentOperation: "capture" } };
function assertReconciliationIsReadOnly(calls: { url: string; init: RequestInit }[]) {
  assert.ok(calls.every((call) => call.url.startsWith(PAYPAL_SANDBOX_URL)));
  const writes = calls.filter((call) => call.init.method !== "GET");
  assert.equal(writes.length, 1, "Only the OAuth token exchange may use POST");
  assert.equal(writes[0].url, `${PAYPAL_SANDBOX_URL}/v1/oauth2/token`);
  assert.equal(writes[0].init.method, "POST");
}

test("read-only reconciliation confirms completed capture from matching order, authorization and capture resources", async () => {
  const fake = queue([{ body: token }, { body: order(authorization("CAPTURED"), capture()) }, { body: authorization("CAPTURED") }, { body: capture() }]);
  const before = structuredClone(pendingQuote);
  const result = await reconcileProofPayment(pendingQuote, env, fake.fetcher);
  assert.equal(result.kind, "captured");
  if (result.kind !== "captured") assert.fail("Expected verified capture");
  assert.equal(result.captureId, "CAPTURE123");
  assert.ok(Number.isFinite(Date.parse(result.verifiedAt)));
  assert.equal(fake.calls[2].url, `${PAYPAL_SANDBOX_URL}/v2/payments/authorizations/AUTH123`);
  assert.equal(fake.calls[3].url, `${PAYPAL_SANDBOX_URL}/v2/payments/captures/CAPTURE123`);
  assert.deepEqual(pendingQuote, before, "Provider queries never mutate the operation lock or consent");
  assertReconciliationIsReadOnly(fake.calls);
});

test("read-only reconciliation recognizes VOIDED without issuing a void", async () => {
  const fake = queue([{ body: token }, { body: order(authorization("VOIDED")) }, { body: authorization("VOIDED") }]);
  const result = await reconcileProofPayment(pendingQuote, env, fake.fetcher);
  assert.equal(result.kind, "voided");
  if (result.kind !== "voided") assert.fail("Expected verified void");
  assert.ok(Number.isFinite(Date.parse(result.verifiedAt)));
  assertReconciliationIsReadOnly(fake.calls);
});

test("read-only reconciliation closes unpaid only for matching DENIED authorization without capture history", async () => {
  const fake = queue([{ body: token }, { body: order(authorization("DENIED")) }, { body: authorization("DENIED") }]);
  const result = await reconcileProofPayment(pendingQuote, env, fake.fetcher);
  assert.equal(result.kind, "closed_unpaid");
  if (result.kind !== "closed_unpaid") assert.fail("Expected verified unpaid closure");
  assert.equal(result.reason, "authorization_denied");
  assertReconciliationIsReadOnly(fake.calls);
});

test("pending authorization or pending capture remains unresolved", async () => {
  const authorizationPending = queue([{ body: token }, { body: order(authorization("PENDING")) }, { body: authorization("PENDING") }]);
  assert.deepEqual(await reconcileProofPayment(pendingQuote, env, authorizationPending.fetcher), { kind: "unresolved", reason: "pending" });
  const capturePending = queue([{ body: token }, { body: order(authorization(), capture("PENDING")) }, { body: authorization() }, { body: capture("PENDING") }]);
  assert.deepEqual(await reconcileProofPayment(pendingQuote, env, capturePending.fetcher), { kind: "unresolved", reason: "pending" });
  assertReconciliationIsReadOnly(capturePending.calls);
});

test("active authorization remains unresolved despite local deadline or failed/declined capture", async () => {
  const expiredLocally = { ...pendingQuote, proof: { ...pendingQuote.proof, authorizationExpiresAt: "2020-01-01T00:00:00.000Z" } };
  for (const status of [undefined, "FAILED", "DECLINED"]) {
    const recordedCapture = status ? capture(status) : undefined;
    const fake = queue([{ body: token }, { body: order(authorization(), recordedCapture) }, { body: authorization() }, ...(recordedCapture ? [{ body: recordedCapture }] : [])]);
    assert.deepEqual(await reconcileProofPayment(expiredLocally, env, fake.fetcher), { kind: "unresolved", reason: "authorization_still_active" });
    assertReconciliationIsReadOnly(fake.calls);
  }
});

test("wrong order/authorization identity, amount or currency cannot produce a terminal reconciliation", async () => {
  const modifiedOrder = order(authorization("DENIED"));
  modifiedOrder.purchase_units[0].amount.value = "0.01";
  const mismatchedOrder = order(authorization("DENIED"));
  mismatchedOrder.purchase_units[0].custom_id = "other-proof";
  const cases = [
    [{ body: token }, { body: order(authorization("DENIED"), undefined, { id: "OTHER_ORDER" }) }],
    [{ body: token }, { body: modifiedOrder }],
    [{ body: token }, { body: mismatchedOrder }],
    [{ body: token }, { body: order(authorization("DENIED")) }, { body: authorization("DENIED", { id: "OTHER_AUTH" }) }],
    [{ body: token }, { body: order(authorization("DENIED")) }, { body: authorization("DENIED", { amount: { currency_code: "USD", value: "93.75" } }) }],
    [{ body: token }, { body: order(authorization("DENIED")) }, { body: authorization("DENIED", { supplementary_data: { related_ids: { order_id: "OTHER_ORDER" } } }) }],
  ];
  for (const replies of cases) {
    const fake = queue(replies);
    assert.deepEqual(await reconcileProofPayment(pendingQuote, env, fake.fetcher), { kind: "unresolved", reason: "inconsistent_resources" });
    assertReconciliationIsReadOnly(fake.calls);
  }
});

test("capture detail mismatches, unknown states and conflicting snapshots remain unresolved", async () => {
  for (const changed of [
    { id: "OTHER_CAPTURE" }, { amount: { currency_code: "AUD", value: "0.01" } },
    { amount: { currency_code: "USD", value: "93.75" } },
    { supplementary_data: { related_ids: { order_id: "ORDER123", authorization_id: "OTHER_AUTH" } } },
    { status: "PENDING" },
  ]) {
    const fake = queue([{ body: token }, { body: order(authorization("CAPTURED"), capture()) }, { body: authorization("CAPTURED") }, { body: capture("COMPLETED", changed) }]);
    assert.deepEqual(await reconcileProofPayment(pendingQuote, env, fake.fetcher), { kind: "unresolved", reason: "inconsistent_resources" });
  }
  for (const status of ["CREATED", "VOIDED", "DENIED", "EXPIRED"]) {
    const fake = queue([{ body: token }, { body: order(authorization(status), capture()) }, { body: authorization(status) }, { body: capture() }]);
    assert.deepEqual(await reconcileProofPayment(pendingQuote, env, fake.fetcher), { kind: "unresolved", reason: "inconsistent_resources" });
  }
  const stale = queue([{ body: token }, { body: order(authorization()) }, { body: authorization("VOIDED") }]);
  assert.deepEqual(await reconcileProofPayment(pendingQuote, env, stale.fetcher), { kind: "unresolved", reason: "inconsistent_resources" });
});

test("GET errors and missing resources never mean unpaid or safe to unlock", async () => {
  for (const failed of [{ status: 404, body: { name: "RESOURCE_NOT_FOUND" } }, { status: 503, body: {} }, { networkError: true }]) {
    for (const stage of ["order", "authorization", "capture"]) {
      const replies: Reply[] = [{ body: token }];
      if (stage === "order") replies.push(failed);
      else {
        replies.push({ body: order(authorization("CAPTURED"), capture()) });
        if (stage === "authorization") replies.push(failed);
        else replies.push({ body: authorization("CAPTURED") }, failed);
      }
      const fake = queue(replies);
      assert.deepEqual(await reconcileProofPayment(pendingQuote, env, fake.fetcher), { kind: "unresolved", reason: "provider_unavailable" });
      assertReconciliationIsReadOnly(fake.calls);
    }
  }
});

test("reconciliation rejects non-sandbox or non-pending cases before contacting providers", async () => {
  for (const value of [
    { ...pendingQuote, paymentMode: "demo" as const },
    { ...pendingQuote, proof: { ...pendingQuote.proof, paymentOperation: undefined } },
    { ...pendingQuote, proof: { ...pendingQuote.proof, paymentState: "captured" as const } },
  ]) {
    const fake = queue([]);
    assert.deepEqual(await reconcileProofPayment(value, env, fake.fetcher), { kind: "unresolved", reason: "inconsistent_resources" });
    assert.equal(fake.calls.length, 0);
  }
});
