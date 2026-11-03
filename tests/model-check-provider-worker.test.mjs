import assert from "node:assert/strict";
import test from "node:test";
import {wrapModelCheckTestWorker} from "./model-check-provider-worker.mjs";
import {SYNTHETIC_SANDBOX_CLIENT, SYNTHETIC_SANDBOX_SECRET} from "./sandbox-provider-worker.mjs";
const config = {PAYPAL_CLIENT_ID: SYNTHETIC_SANDBOX_CLIENT, PAYPAL_CLIENT_SECRET: SYNTHETIC_SANDBOX_SECRET, DEEPSEEK_API_KEY: ""};

test("model API fixture observes durable lease/checkpoint before blocking metadata, without returning a fabricated backend result", async () => {
  const original = globalThis.fetch;
  try {
    const quote = {proof: {delivery: {modelRun: {id: "synthetic-run", registration: {backendBaseUrl: "https://seller-journey.synthetic.example/pbp/"}, trace: [{completedOrdinal: null}]}, modelEvidenceReservation: {runId: "synthetic-run"}, privateSource: "DO NOT EXPOSE"}}};
    let lookups = 0;
    const env = {...config, DB: {prepare(sql) {assert.match(sql, /modelRun/u); return {async all() {lookups++; return {results: [{payload: JSON.stringify(quote)}]};}};}}};
    const app = {fetch: async () => {await assert.rejects(fetch("https://seller-journey.synthetic.example/pbp/meta", {method: "GET"}), /deliberately blocked/u); return new Response("synthetic app completed");}};
    const worker = wrapModelCheckTestWorker(app);
    assert.equal(await (await worker.fetch(new Request("http://127.0.0.1/api/synthetic-app"), env, {})).text(), "synthetic app completed");
    const marker = await (await worker.fetch(new Request("http://127.0.0.1/api/__synthetic_model_test_mode"), env, {})).json();
    assert.equal(marker.backendAttempts, 1); assert.equal(marker.checkpointBeforeIo, true); assert.equal(lookups, 1);
    assert.deepEqual(marker.observations[0], {method: "GET", path: "/pbp/meta", lease: true, reservation: true, checkpoint: true, runId: "synthetic-run"});
    assert.ok(!JSON.stringify(marker).includes("DO NOT EXPOSE"));
    await assert.rejects(fetch("https://outside.example/private"), /external network access is blocked/u);
  } finally {globalThis.fetch = original;}
});

test("fixture never reports a missing durable lease as a successful pre-I/O checkpoint", async () => {
  const original = globalThis.fetch;
  try {
    const env = {...config, DB: {prepare() {return {async all() {return {results: []};}};}}};
    const worker = wrapModelCheckTestWorker({fetch: async () => {await assert.rejects(fetch("https://seller-journey.synthetic.example/pbp/meta"), /deliberately blocked/u); return new Response("blocked");}});
    await worker.fetch(new Request("http://127.0.0.1/api/synthetic-app"), env, {});
    const marker = await (await worker.fetch(new Request("http://127.0.0.1/api/__synthetic_model_test_mode"), env, {})).json();
    assert.equal(marker.checkpointBeforeIo, false); assert.equal(marker.observations[0].lease, false);
  } finally {globalThis.fetch = original;}
});
