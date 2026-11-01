import assert from "node:assert/strict";
import test from "node:test";
import { SYNTHETIC_SANDBOX_CLIENT, SYNTHETIC_SANDBOX_SECRET, wrapSandboxTestWorker } from "./sandbox-provider-worker.mjs";

test("local provider fixture blocks outside egress, rejects non-synthetic config and validates capture inputs", async () => {
  const original = globalThis.fetch;
  try {
    const worker = wrapSandboxTestWorker({fetch: () => new Response("synthetic app")});
    const request = new Request("http://127.0.0.1/api/__synthetic_sandbox_test_mode");
    assert.equal((await worker.fetch(request, {}, {})).status, 503);
    assert.equal(globalThis.fetch, original, "Invalid configuration cannot install the test interceptor");
    await worker.fetch(request, {PAYPAL_CLIENT_ID: SYNTHETIC_SANDBOX_CLIENT, PAYPAL_CLIENT_SECRET: SYNTHETIC_SANDBOX_SECRET}, {});
    await assert.rejects(fetch("https://example.com"), /blocked/u);
    const base = "https://api-m.sandbox.paypal.com";
    const unit = {custom_id: "synthetic-quote", invoice_id: "PBP-SYNTHETIC", amount: {currency_code: "AUD", value: "1.00"}};
    const order = await (await fetch(base + "/v2/checkout/orders", {method: "POST", body: JSON.stringify({intent: "AUTHORIZE", purchase_units: [unit]})})).json();
    const authorized = await (await fetch(base + "/v2/checkout/orders/" + order.id + "/authorize", {method: "POST"})).json();
    const authorization = authorized.purchase_units[0].payments.authorizations[0];
    const captureUrl = base + "/v2/payments/authorizations/" + authorization.id + "/capture";
    const correct = {amount: unit.amount, invoice_id: unit.invoice_id, final_capture: true};
    for (const patch of [{amount: {currency_code: "AUD", value: "0.01"}}, {amount: {currency_code: "USD", value: "1.00"}}, {invoice_id: "WRONG"}, {final_capture: false}]) {
      assert.equal((await fetch(captureUrl, {method: "POST", body: JSON.stringify({...correct, ...patch})})).status, 422);
    }
    assert.equal((await fetch(captureUrl, {method: "POST", body: JSON.stringify(correct)})).status, 200);
    assert.equal((await fetch(captureUrl, {method: "POST", body: JSON.stringify(correct)})).status, 422);
  } finally {
    globalThis.fetch = original;
  }
});
