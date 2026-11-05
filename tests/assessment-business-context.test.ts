import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote } from "../lib/contracts.ts";
import { assessDeliveryLegacyReplay as assessDelivery } from "../lib/delivery-assessment.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { getBusinessCheckPlan, createBusinessCheckReport } from "../lib/business-checks.ts";
import { proofInvitationPreview } from "../lib/proof-invitation-preview.ts";
import { DomainError } from "../lib/domain.ts";
import { ProviderError, type Fetcher } from "../lib/providers.ts";

const date = "2026-11-02T08:00:00.000Z";
const source = '<!doctype html><html><head><title>Test shop</title></head><body><p>Beef noodles AUD 28</p><p>Phone +61 3 9000 9999</p></body></html>';
function agreement(): ProofQuote {
  const summary = "Show menu prices; Display contact details; Do not provide delivery service.";
  const units = summaryCoverageUnits(summary);
  const item = (index: number) => ({start: units[index].start, end: units[index].end, excerpt: units[index].text});
  const parsed = parseStaticProject({title: "Exact plan fixture", summary, amount: "1.00", requiredPages: ["index.html", "menu-zh.html"], manualRequirements: [],
    coverage: {version: 1, sourceText: summary, confirmed: true, decisions: units.map((unit, index) => ({id: unit.id, disposition: index === 2 ? "exclude" : "include", ...(index === 2 ? {reason: "A later milestone."} : {})}))},
    businessChecks: {confirmed: true, items: [
      {id: "business-1", criterionId: "coverage-1", file: "index.html", source: item(0), expected: {kind: "item_price", label: "Beef noodles", currency: "AUD", amountMinor: 1800}},
      {id: "business-2", criterionId: "coverage-1", file: "menu-zh.html", source: item(0), expected: {kind: "item_price", label: "牛肉面", currency: "AUD", amountMinor: 1800}},
      {id: "business-3", criterionId: "coverage-2", file: "index.html", source: item(1), expected: {kind: "visible_copy", text: "+61 3 9000 0000"}},
    ]}}, "en", {requireCoverage: true});
  const delivery = createUploadedDelivery({"index.html": source, "menu-zh.html": source.replace("Beef noodles", "牛肉面")}, parsed.project, "en", 1);
  return {id: "business-context", reference: "PBP-CONTEXT", workflow: "proof-v1", title: parsed.title, summary, brief: "PRIVATE ORIGINAL MATERIAL",
    clientName: "PRIVATE CLIENT", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100,
    lineItems: [{id: "build", description: "Synthetic", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1,
    status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: date, proof: {project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery,
      review: {deliveryId: delivery.id, mode: "demo", summary: "Synthetic source review", reviewedAt: date},
      collaboration: {stage: "submitted", submission: {deliveryId: delivery.id, at: date, note: "Synthetic"}, feedback: []}}};
}

function fakeAssessment(quote: ProofQuote, citation = "<p>Beef noodles AUD 28</p>") {
  const output = {items: quote.proof.criteria.map(criterion => ({criterionId: criterion.id, status: criterion.id === "coverage-1" ? "changes_suggested" : "supported",
    explanation: "The actual supplied source price differs from the precise locked expectation.", citations: [{file: "index.html", excerpt: citation}]})), risks: [], limitations: ["Source-only synthetic response."]};
  const calls: {url: string; init: RequestInit}[] = [];
  const fetcher: Fetcher = async (url, init = {}) => {
    calls.push({url: String(url), init});
    return new Response(JSON.stringify({choices: [{finish_reason: "stop", message: {content: JSON.stringify(output)}}]}), {status: 200});
  };
  return {calls, fetcher};
}
const env = {DEEPSEEK_API_KEY: "synthetic-only-no-network"};
function userPacket(fake: ReturnType<typeof fakeAssessment>) {return JSON.parse(JSON.parse(String(fake.calls[0].init.body)).messages[1].content);}

test("source AI receives every precise locked business value once and preserves all decisions", async () => {
  const quote = agreement(), before = structuredClone(quote), fake = fakeAssessment(quote);
  const result = await assessDelivery(quote, env, fake.fetcher), packet = userPacket(fake);
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(packet.scopeContext.businessChecks, quote.proof.project!.businessChecks);
  assert.equal(packet.scopeContext.businessChecks.length, 3); // not the six-width plan
  assert.equal(packet.scopeContext.businessChecks[1].file, "menu-zh.html");
  assert.deepEqual(packet.scopeContext.businessChecks[1].expected, {kind: "item_price", label: "牛肉面", currency: "AUD", amountMinor: 1800});
  assert.equal(result.items.find(item => item.criterionId === "coverage-1")!.status, "changes_suggested");
  assert.equal(result.items.find(item => item.criterionId === "mobile")!.status, "insufficient_evidence");
  assert.deepEqual(quote, before);
  const serialized = String(fake.calls[0].init.body);
  assert.ok(!serialized.includes("PRIVATE ORIGINAL MATERIAL") && !serialized.includes("PRIVATE CLIENT"));
  assert.match(JSON.parse(serialized).messages[0].content, /No client browser report/);
  assert.match(JSON.parse(serialized).messages[0].content, /compare EVERY listed check/);
});

test("current, historical and misbound client text is never fed into source-only assessment", async () => {
  for (const stale of [false, true]) {
    const quote = agreement();
    const report = createBusinessCheckReport(quote, {deliveryId: quote.proof.delivery!.id, previousReportId: null,
      readings: getBusinessCheckPlan(quote).map(step => ({stepId: step.stepId, status: "observed", blocks: ["UNTRUSTED CLIENT REPORT ONLY"]}))});
    if (stale) report.deliveryId = "a-different-delivery";
    quote.proof.delivery!.businessChecks = report;
    quote.proof.delivery!.businessCheckHistory = [structuredClone(report)];
    const before = structuredClone(quote), fake = fakeAssessment(quote);
    await assessDelivery(quote, env, fake.fetcher);
    assert.ok(!String(fake.calls[0].init.body).includes("UNTRUSTED CLIENT REPORT ONLY"));
    assert.ok(!String(fake.calls[0].init.body).includes(report.id));
    assert.deepEqual(quote, before);
  }
});

test("poisoned locked business plans refuse before any model request", async () => {
  const mutations: ((quote: ProofQuote) => void)[] = [
    quote => {quote.proof.project!.businessChecks![0].source.excerpt = "fabricated source";},
    quote => {quote.proof.project!.businessChecks![0].file = "not-agreed.html";},
    quote => {quote.proof.project!.businessChecks![0].criterionId = "coverage-3";},
    quote => {Object.assign(quote.proof.project!.businessChecks![0].expected, {run: "untrusted executable"});},
    quote => {quote.proof.criteria.find(row => row.id === "coverage-1")!.source = "changed criterion";},
  ];
  for (const mutate of mutations) {
    const quote = agreement(); mutate(quote);
    const before = structuredClone(quote), fake = fakeAssessment(quote);
    await assert.rejects(() => assessDelivery(quote, env, fake.fetcher), DomainError);
    assert.equal(fake.calls.length, 0); assert.deepEqual(quote, before);
    assert.throws(() => proofInvitationPreview(quote), DomainError);
  }
});

test("expected text and reported observations cannot become invented delivery-source citations", async () => {
  const quote = agreement(), before = structuredClone(quote);
  const fake = fakeAssessment(quote, "+61 3 9000 0000"); // expected, absent from actual source
  await assert.rejects(() => assessDelivery(quote, env, fake.fetcher), ProviderError);
  assert.equal(fake.calls.length, 1); assert.deepEqual(quote, before);
});

test("seller preview contains exact business pages/values and exclusions before confirmation, without private delivery/payment state", () => {
  const quote = agreement(), before = structuredClone(quote), preview = proofInvitationPreview(quote);
  assert.deepEqual(preview.businessChecks, quote.proof.project!.businessChecks);
  assert.deepEqual(preview.coverage, quote.proof.project!.coverage);
  assert.equal(preview.businessChecks.length, 3);
  assert.equal(preview.coverage!.decisions.find(item => item.disposition === "exclude")!.reason, "A later milestone.");
  assert.ok(!("proof" in preview) && !("brief" in preview) && !("clientName" in preview) && !("paypalOrderId" in preview));
  preview.businessChecks[0].file = "changed.html";
  assert.deepEqual(quote, before);
  delete quote.proof.project!.businessChecks;
  assert.deepEqual(proofInvitationPreview(quote).businessChecks, []);
});
