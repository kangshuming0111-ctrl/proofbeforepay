// Local-only instrumentation around the already network-blocked provider
// fixture. It never retains a real fetch or fabricates a passing model trace.
import {wrapSandboxTestWorker} from "./sandbox-provider-worker.mjs";
export function wrapModelCheckTestWorker(app) {
  const observations = [];
  return wrapSandboxTestWorker({async fetch(request, env, context) {
    if (new URL(request.url).pathname === "/api/__synthetic_model_test_mode") return Response.json({outboundFetch: "blocked", backendAttempts: observations.length,
      checkpointBeforeIo: observations.every(row => row.lease && row.reservation && row.checkpoint), observations});
    const blocked = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.origin !== "https://seller-journey.synthetic.example") return blocked(input, init);
      const rows = await env.DB.prepare("SELECT payload FROM quotes WHERE json_extract(payload, '$.proof.delivery.modelRun.id') IS NOT NULL").all();
      const current = (rows.results ?? []).map(row => JSON.parse(row.payload)).find(quote => quote.proof.delivery.modelRun.registration.backendBaseUrl === "https://seller-journey.synthetic.example/pbp/");
      const delivery = current?.proof.delivery, run = delivery?.modelRun;
      observations.push({method: init.method ?? "GET", path: url.pathname, lease: !!run?.id,
        reservation: delivery?.modelEvidenceReservation?.runId === run?.id,
        checkpoint: !!run?.trace.some(row => row.completedOrdinal === null), runId: run?.id ?? null});
      // Give the API suite a bounded window to read the durable lease and save
      // an unrelated human observation while the runner awaits its GET.
      await new Promise(resolve => setTimeout(resolve, 1500));
      throw new Error("Synthetic model backend egress is deliberately blocked; no backend response was observed.");
    };
    return app.fetch(request, env, context);
  }});
}
