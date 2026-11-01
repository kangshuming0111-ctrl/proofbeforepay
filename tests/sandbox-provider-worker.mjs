// Local integration fixture only. Import this from a separately built test
// wrapper, never from the application worker. No original fetch is retained.
// Only create-order, authorize and capture are simulated here. Void/reconcile
// are intentionally unsupported and fail closed; separate provider unit tests
// cover their controlled-response protocols.
export const SYNTHETIC_SANDBOX_CLIENT = "pbp-local-synthetic-merchant";
export const SYNTHETIC_SANDBOX_SECRET = "pbp-local-synthetic-secret";

export function wrapSandboxTestWorker(app) {
  const orders = new Map();
  let syntheticCalls = 0;
  const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}});
  const blockedFetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== "https://api-m.sandbox.paypal.com") throw new Error("All external network access is blocked in this synthetic Worker.");
    syntheticCalls += 1;
    const method = init.method ?? "GET";
    if (url.pathname === "/v1/oauth2/token" && method === "POST") return json({access_token: "local-synthetic-access-token"});
    if (url.pathname === "/v2/checkout/orders" && method === "POST") {
      const body = JSON.parse(String(init.body));
      const id = `LOCAL-ORDER-${orders.size + 1}`;
      const order = {id, status: "APPROVED", intent: body.intent, purchase_units: body.purchase_units, links: [{rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`}]};
      orders.set(id, order);
      return json(order);
    }
    const orderMatch = /^\/v2\/checkout\/orders\/(LOCAL-ORDER-\d+)(\/authorize)?$/u.exec(url.pathname);
    if (orderMatch) {
      const order = orders.get(orderMatch[1]);
      if (!order) return json({name: "RESOURCE_NOT_FOUND"}, 404);
      if (!orderMatch[2] && method === "GET") return json(order);
      if (orderMatch[2] && method === "POST") {
        const unit = order.purchase_units[0];
        const authorization = {id: `LOCAL-AUTH-${order.id}`, status: "CREATED", amount: unit.amount, expiration_time: new Date(Date.now() + 86_400_000).toISOString(), custom_id: unit.custom_id, supplementary_data: {related_ids: {order_id: order.id}}};
        order.status = "COMPLETED"; unit.payments = {authorizations: [authorization], captures: []};
        return json(order);
      }
    }
    const captureMatch = /^\/v2\/payments\/authorizations\/(LOCAL-AUTH-LOCAL-ORDER-\d+)\/capture$/u.exec(url.pathname);
    if (captureMatch && method === "POST") {
      const order = [...orders.values()].find(value => value.purchase_units[0].payments?.authorizations[0]?.id === captureMatch[1]);
      if (!order) return json({name: "RESOURCE_NOT_FOUND"}, 404);
      const unit = order.purchase_units[0], authorization = unit.payments.authorizations[0];
      if (authorization.status !== "CREATED") return json({details: [{issue: "AUTHORIZATION_ALREADY_CAPTURED"}]}, 422);
      const body = JSON.parse(String(init.body));
      if (body.final_capture !== true || body.invoice_id !== unit.invoice_id
        || body.amount?.currency_code !== unit.amount.currency_code || body.amount?.value !== unit.amount.value) {
        return json({details: [{issue: "AMOUNT_MISMATCH"}]}, 422);
      }
      const capture = {id: `LOCAL-CAPTURE-${order.id}`, status: "COMPLETED", amount: unit.amount, final_capture: true, custom_id: unit.custom_id, supplementary_data: {related_ids: {order_id: order.id, authorization_id: authorization.id}}};
      authorization.status = "CAPTURED"; unit.payments.captures = [capture];
      return json(capture);
    }
    throw new Error("Unrecognized provider operation is blocked in this synthetic Worker.");
  };
  return {
    async fetch(request, env, context) {
      const syntheticConfiguration = env.PAYPAL_CLIENT_ID === SYNTHETIC_SANDBOX_CLIENT
        && env.PAYPAL_CLIENT_SECRET === SYNTHETIC_SANDBOX_SECRET && !env.DEEPSEEK_API_KEY;
      if (!syntheticConfiguration) return json({error: "This test wrapper requires its fixed synthetic configuration."}, 503);
      globalThis.fetch = blockedFetch;
      if (new URL(request.url).pathname === "/api/__synthetic_sandbox_test_mode") return json({syntheticConfiguration, outboundFetch: "blocked", syntheticCalls});
      return app.fetch(request, env, context);
    },
  };
}
