import assert from "node:assert/strict";
import test from "node:test";
import type { BriefInput, Quote, QuoteDraft } from "../lib/contracts.ts";
import { captureOrder, createOrder, generateDraft, PAYPAL_SANDBOX_URL, ProviderError, type Fetcher } from "../lib/providers.ts";

const input: BriefInput = {
  brief: "Build a small website for a local flower shop with a contact form.",
  clientName: "Willow Flowers", currency: "AUD", language: "en", hourlyRate: 75,
};
const draft: QuoteDraft = {
  title: "Flower shop website", summary: "A small website with a contact form.",
  lineItems: [{ id: "build", description: "Website implementation (hours)", quantity: 1.25, unitPriceCents: 7500 }],
  assumptions: ["Client supplies content."], questions: ["What is the launch date?"], timelineDays: 7,
};
const quote: Quote = {
  ...draft, id: "quote-123", reference: "BP-123", brief: input.brief,
  clientName: input.clientName, currency: "AUD", language: "en", hourlyRateCents: 7500,
  totalCents: 9375, status: "approved", aiMode: "live", paymentMode: "sandbox",
  createdAt: "2026-10-29T00:00:00.000Z", paypalOrderId: "ORDER123",
};
const env = { PAYPAL_CLIENT_ID: "sandbox-client", PAYPAL_CLIENT_SECRET: "sandbox-secret" };
const token = { access_token: "test-access-token" };
type Call = { url: string; init: RequestInit };
function queue(responses: { body: unknown; status?: number }[]) {
  const calls: Call[] = [];
  const fetcher: Fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    assert.ok(next, "Unexpected external request");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetcher };
}
function completed(changes: { orderId?: string; currency?: string; value?: string; customId?: string; status?: string } = {}) {
  return {
    id: changes.orderId ?? "ORDER123", status: "COMPLETED",
    purchase_units: [{
      custom_id: changes.customId ?? quote.id, reference_id: quote.id,
      payments: { captures: [{
        id: "CAPTURE123", status: changes.status ?? "COMPLETED", final_capture: true,
        amount: { currency_code: changes.currency ?? "AUD", value: changes.value ?? "93.75" },
      }] },
    }],
  };
}

test("missing AI key returns an honest, relevant deterministic demo without making a request", async () => {
  const { fetcher, calls } = queue([]);
  const result = await generateDraft({ ...input, language: "zh" }, {}, fetcher);
  assert.equal(result.aiMode, "demo");
  assert.match(result.draft.title, /网站/u);
  assert.ok(result.draft.assumptions.some((entry) => entry.includes("未调用 AI")));
  assert.ok(result.draft.lineItems.every((item) => item.unitPriceCents === 7500));
  assert.equal(calls.length, 0);
});

test("live AI validates structured output, ignores model totals and uses the freelancer's rate", async () => {
  const modelDraft = { ...draft, totalCents: 1, lineItems: [{ ...draft.lineItems[0], unitPriceCents: 1 }] };
  const { fetcher, calls } = queue([{ body: { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(modelDraft) } }] } }]);
  const result = await generateDraft(input, { DEEPSEEK_API_KEY: "test-key" }, fetcher);
  assert.equal(result.aiMode, "live");
  assert.equal(result.draft.lineItems[0].unitPriceCents, 7500);
  assert.equal("totalCents" in result.draft, false);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.model, "deepseek-flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(JSON.parse(body.messages[1].content).brief, input.brief);
});

test("configured AI failures never silently become demos or expose upstream details", async () => {
  const { fetcher } = queue([{ status: 401, body: { error: { message: "secret-key-should-never-leak" } } }]);
  await assert.rejects(generateDraft(input, { DEEPSEEK_API_KEY: "secret-key-should-never-leak" }, fetcher), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.message.includes("secret-key"), false);
    return true;
  });
  const invalid = queue([{ body: { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ...draft, lineItems: [] }) } }] } }]);
  await assert.rejects(generateDraft(input, { DEEPSEEK_API_KEY: "test-key" }, invalid.fetcher), ProviderError);
});

test("sandbox create uses authoritative cents, quote binding and stable idempotency", async () => {
  const response = { id: "ORDER123", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123" }] };
  const { fetcher, calls } = queue([{ body: token }, { body: response }, { body: token }, { body: response }]);
  const first = await createOrder(quote, env, "https://briefpay.example", fetcher);
  const second = await createOrder(quote, env, "https://briefpay.example", fetcher);
  assert.deepEqual(first, second);
  assert.ok(calls.every((call) => call.url.startsWith(PAYPAL_SANDBOX_URL)));
  assert.equal(calls[0].init.body, "grant_type=client_credentials");
  const headers = new Headers(calls[1].init.headers);
  assert.equal(headers.get("PayPal-Request-Id"), new Headers(calls[3].init.headers).get("PayPal-Request-Id"));
  const body = JSON.parse(String(calls[1].init.body));
  assert.equal(body.intent, "CAPTURE");
  assert.deepEqual(body.purchase_units[0].amount, { currency_code: "AUD", value: "93.75" });
  assert.equal(body.purchase_units[0].custom_id, quote.id);
  assert.equal(body.purchase_units[0].invoice_id, quote.reference);
  assert.equal(body.payment_source.paypal.experience_context.return_url, "https://briefpay.example/?quote=quote-123");
  assert.equal(body.payment_source.paypal.experience_context.cancel_url, "https://briefpay.example/?quote=quote-123&cancelled=1");
});

test("provider redirects are rejected without following or trusting successful-looking bodies", async () => {
  const order = { id: "ORDER123", links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123" }] };
  for (const status of [301, 302, 303, 304, 307, 308]) {
    for (const redirectAt of [0, 1]) {
      const calls: string[] = [];
      const fetcher: Fetcher = async (url, init = {}) => {
        assert.equal(init.redirect, "manual");
        calls.push(String(url));
        const redirect = calls.length - 1 === redirectAt;
        return new Response(status === 304 && redirect ? null : JSON.stringify(calls.length === 1 ? token : order), {
          status: redirect ? status : 200,
          headers: { Location: "https://unexpected.example/collect", "Content-Type": "application/json" },
        });
      };
      await assert.rejects(createOrder(quote, env, "https://briefpay.example", fetcher), ProviderError);
      assert.equal(calls.length, redirectAt + 1);
      assert.ok(calls.every((url) => url.startsWith(PAYPAL_SANDBOX_URL)));
    }
  }
});

test("create blocks forged totals before contacting PayPal and rejects non-sandbox redirects", async () => {
  const untouched = queue([]);
  await assert.rejects(createOrder({ ...quote, totalCents: 1 }, env, "https://briefpay.example", untouched.fetcher), /total/u);
  assert.equal(untouched.calls.length, 0);
  const malicious = queue([{ body: token }, { body: { id: "ORDER123", links: [{ rel: "approve", href: "https://www.paypal.com/checkoutnow?token=ORDER123" }] } }]);
  await assert.rejects(createOrder(quote, env, "https://briefpay.example", malicious.fetcher), ProviderError);
});

test("capture requires a completed capture matching saved order, quote, currency and exact cents", async () => {
  const success = queue([{ body: token }, { body: completed() }]);
  assert.deepEqual(await captureOrder(quote, env, success.fetcher), { captureId: "CAPTURE123" });
  assert.equal(success.calls[1].url, `${PAYPAL_SANDBOX_URL}/v2/checkout/orders/ORDER123/capture`);
  assert.equal(new Headers(success.calls[1].init.headers).get("PayPal-Request-Id"), "briefpay-capture-quote-123");
  for (const changed of [
    { value: "0.01" }, { value: "9.375e1" }, { currency: "USD" },
    { orderId: "ORDER999" }, { customId: "quote-other" }, { status: "PENDING" },
  ]) {
    const invalid = queue([{ body: token }, { body: completed(changed) }]);
    await assert.rejects(captureOrder(quote, env, invalid.fetcher), ProviderError);
  }
});

test("already-captured retry reads the saved order and still verifies amount", async () => {
  for (const value of ["93.75", "0.01"]) {
    const { fetcher, calls } = queue([
      { body: token },
      { status: 422, body: { details: [{ issue: "ORDER_ALREADY_CAPTURED" }] } },
      { body: completed({ value }) },
    ]);
    if (value === "93.75") assert.deepEqual(await captureOrder(quote, env, fetcher), { captureId: "CAPTURE123" });
    else await assert.rejects(captureOrder(quote, env, fetcher), ProviderError);
    assert.equal(calls[2].init.method, "GET");
    assert.equal(calls[2].url, `${PAYPAL_SANDBOX_URL}/v2/checkout/orders/ORDER123`);
  }
});
