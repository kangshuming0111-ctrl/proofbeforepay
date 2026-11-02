import assert from "node:assert/strict";
import test from "node:test";
import type {ProofLayoutUnavailableReason, ProofQuote} from "../lib/contracts.ts";
import {assertLayoutSnapshotResponse, assertRenderedLayoutSnapshot} from "../lib/layout-probe.ts";
import {staticPreviewResponse} from "../lib/static-resources.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";
import {recordLayoutReport} from "../lib/layout-report.ts";
import {deliveryLayoutSummary} from "../lib/delivery-layout-summary.ts";
import {createEvidenceExport, verifyEvidenceExport} from "../lib/evidence-export.ts";

const html = '<!doctype html><html><head><title>Saved café</title></head><body><main>Book six guests.</main></body></html>';
const at = "2026-11-03T00:00:00.000Z";
const reasonIs = (reason:ProofLayoutUnavailableReason) => (error:unknown) => error instanceof Error
  && error.message === reason && "reason" in error && error.reason === reason;

function counted(response:Response) {
  let reads = 0;
  const original = response.arrayBuffer.bind(response);
  response.arrayBuffer = () => {reads++; return original();};
  return {response, reads: () => reads};
}
function received(body:BodyInit, headers:Record<string,string> = {}) {
  return counted(new Response(body, {headers:{"Content-Type":"text/html; charset=utf-8", "X-ProofBeforePay-Delivery":"delivery-current", ...headers}}));
}

test("actual static preview responses preserve exact HTML, BOM and CSS with one body read", async () => {
  for (const [file, source, kind] of [
    ["index.html", html, "html"], ["index.html", "\uFEFF" + html, "html"], ["styles.css", "body { color: #123; }\r\n", "css"],
  ] as const) {
    const {response, reads} = counted(staticPreviewResponse(file, source, "https://app.example/deliveries/project/delivery-current/", "delivery-current"));
    await assertLayoutSnapshotResponse(response, source, "delivery-current", kind);
    assert.equal(reads(), 1);
  }
});

test("response diagnostics distinguish type, delivery identity and exact source without logging private response data", async () => {
  const wrongType = received("unrelated response", {"Content-Type":"application/json"});
  await assert.rejects(() => assertLayoutSnapshotResponse(wrongType.response, html, "delivery-current", "html"), reasonIs("response_type_mismatch"));
  assert.equal(wrongType.reads(), 0);
  const wrongVersion = received("PRIVATE RESPONSE CONTENT", {"X-ProofBeforePay-Delivery":"PRIVATE-OTHER-DELIVERY"});
  await assert.rejects(() => assertLayoutSnapshotResponse(wrongVersion.response, html, "delivery-current", "html"), reasonIs("response_identity_mismatch"));
  assert.equal(wrongVersion.reads(), 0);
  const missingIdentity = counted(new Response(html, {headers:{"Content-Type":"text/html"}}));
  await assert.rejects(() => assertLayoutSnapshotResponse(missingIdentity.response, html, "delivery-current", "html"), reasonIs("response_identity_mismatch"));
  assert.equal(missingIdentity.reads(), 0);
  for (const body of [html.replace("six", "seven"), html + "\n", html.replace("Saved café", "Saved cafe"), new Uint8Array([0xc3, 0x28])]) {
    const changed = received(body);
    await assert.rejects(() => assertLayoutSnapshotResponse(changed.response, html, "delivery-current", "html"), reasonIs("source_mismatch"));
    assert.equal(changed.reads(), 1);
  }
  const wrongCssType = received("body {}", {"Content-Type":"text/html"});
  await assert.rejects(() => assertLayoutSnapshotResponse(wrongCssType.response, "body {}", "delivery-current", "css"), reasonIs("response_type_mismatch"));
});

test("rendered identity remains strict for content type, body, title and text, without assigning a cause", () => {
  const expected = {contentType:"text/html", title:"Saved café", body:{textContent:"Book six guests."}};
  assert.doesNotThrow(() => assertRenderedLayoutSnapshot(structuredClone(expected), expected));
  for (const patch of [{contentType:"text/plain"}, {body:null}, {title:"Changed title"}, {body:{textContent:"Book seven guests."}}, {body:{textContent:"Book six guests.Additional browser content"}}]) {
    assert.throws(() => assertRenderedLayoutSnapshot({...expected, ...patch}, expected), reasonIs("rendered_snapshot_mismatch"));
  }
  assert.throws(() => assertRenderedLayoutSnapshot(expected, {...expected, body:null}), reasonIs("rendered_snapshot_mismatch"));
  assert.deepEqual(expected, {contentType:"text/html", title:"Saved café", body:{textContent:"Book six guests."}});
});

function fixture():ProofQuote {
  const summary = "Deliver one saved HTML page.";
  const parsed = parseStaticProject({title:"Bounded layout diagnostics", summary, amount:"1.00", requiredPages:["index.html"], manualRequirements:[]}, "en");
  const delivery = createUploadedDelivery({"index.html":html}, parsed.project, "en", 1);
  return {id:"layout-diagnostics-project", reference:"PBP-LAYOUT-DIAGNOSTICS", workflow:"proof-v1", title:parsed.title, summary, brief:summary,
    clientName:"Synthetic", currency:"AUD", language:"en", hourlyRateCents:100, totalCents:100, lineItems:[{id:"site", description:"Saved page", quantity:1, unitPriceCents:100}],
    assumptions:[], questions:[], timelineDays:1, status:"approved", aiMode:"demo", paymentMode:"demo", createdAt:at,
    proof:{project:parsed.project, criteria:parsed.criteria, paymentState:"unfunded", audit:[], delivery,
      review:{deliveryId:delivery.id, reviewedAt:at, mode:"demo", summary:"Saved source rule review"}}};
}

test("new diagnostics and legacy snapshot mismatch survive server validation, comparison and offline replay as unavailable", async () => {
  const reasons:ProofLayoutUnavailableReason[] = ["snapshot_mismatch", "response_type_mismatch", "response_identity_mismatch", "source_mismatch", "rendered_snapshot_mismatch"];
  for (const reason of reasons) {
    const quote = fixture(), deliveryId = quote.proof.delivery!.id;
    const saved = recordLayoutReport(quote, "buyer", {deliveryId, previousReportId:null,
      readings:[375, 900].map(viewportWidth => ({file:"index.html", viewportWidth, status:"unavailable", reason, outcome:"no_overflow", clientWidth:viewportWidth, scrollWidth:viewportWidth}))}, at);
    const report = saved.proof.delivery!.layoutReport!;
    assert.deepEqual(report.summary, {measured:0, unavailable:2, overflow:0});
    for (const row of report.readings) assert.deepEqual(Object.keys(row).sort(), ["file", "reason", "status", "viewportWidth"]);
    const summary = deliveryLayoutSummary(saved.proof.delivery!);
    assert.equal(summary.state, "current");
    if (summary.state === "current") {assert.equal(summary.measured, 0); assert.equal(summary.unavailable, 2); assert.equal(summary.firstIssue?.reason, reason);}
    const bundle = await createEvidenceExport(saved), replay = await verifyEvidenceExport(JSON.parse(JSON.stringify(bundle)));
    assert.equal(replay.consistency, "consistent", JSON.stringify(replay.checks));
    assert.equal(replay.checks.find(check => check.id === "reported-observation-consistency")?.status, "consistent");
    assert.deepEqual(bundle.delivery.layoutReport!.summary, {measured:0, unavailable:2, overflow:0});
    assert.equal(replay.limits.networkRequests, 0);
  }
});
