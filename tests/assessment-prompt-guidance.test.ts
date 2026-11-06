import assert from "node:assert/strict";
import test from "node:test";
import {assessDelivery, assessDeliveryCatalogReplay, assessDeliveryLegacyReplay} from "../lib/delivery-assessment.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {readFile} from "node:fs/promises";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const paragraph = "<p>Harbour Studio offers flowers.</p>";
const html = (body: string) => `<!doctype html><html><head><title>Harbour Studio</title></head><body>${body}</body></html>`;
function fixture() {
  const project: EvaluationProject = {id: "prompt-protocol-fixture", stratum: "clean", language: "en", title: "Source protocol fixture", summary: "Inspect supplied source text only.",
    files: {"index.html": html(paragraph), "about.html": html("<p>Source-only description.</p>"), "site.css": "body{margin:0}"},
    criteria: [1, 2].map(index => ({id: `manual-${index}`, title: "Business name copy", source: "The page content must include the shop name.",
      reference: {expectedStatus: "supported", rationale: "Synthetic request and decoding fixture, not a model accuracy reference.", relevantFiles: ["index.html"], requiresSemanticReview: true}}))};
  return projectQuote(project);
}
const slots = (id: string, maximum: number) => Object.fromEntries(Array.from({length: maximum}, (_, i) => [`c${i + 1}`, i === 0 ? id : ""]));

function transport(mutate?: (report: any) => void) {
  const calls: {request: any; response: any}[] = [];
  return {calls, fetcher: async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content), tool = request.tools[0].function;
    const encoding = packet.citationEncoding ?? (packet.citationCatalog ? "catalog_ids" : "legacy_quotes");
    const id = packet.citationCatalog?.entries.find((entry: any) => entry.excerpt === paragraph)?.id;
    const citations = (maximum: number) => encoding === "catalog_slots" ? slots(id, maximum) : encoding === "catalog_ids" ? [id] : [{file: "index.html", excerpt: paragraph}];
    const response = {...(packet.citationCatalog ? {catalogId: packet.citationCatalog.catalogId} : {}),
      items: packet.criteria.map((criterion: any) => ({criterionId: criterion.id, status: "supported", explanation: "The supplied source names the shop.", citations: citations(6)})),
      risks: [{title: "Controlled source lead", explanation: "The cited source is a limited description.", suggestion: "Review the supplied copy with the buyer.", citations: citations(3)}], limitations: ["Synthetic decoding test only."]};
    mutate?.(response); calls.push({request, response: structuredClone(response)});
    return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: tool.name, arguments: JSON.stringify(response)}}]}}]});
  }};
}

test("the actual V3 request explains every schema-required slot and distinguishes unused from zero selected citations", async () => {
  const quote = fixture(), before = structuredClone(quote), fake = transport();
  const report = await assessDelivery(quote, {DEEPSEEK_API_KEY: "controlled-no-network"}, fake.fetcher);
  assert.equal(fake.calls.length, 1); assert.deepEqual(quote, before); assert.equal(report.items.length, 2);
  assert.ok(report.items.every(item => item.status === "supported" && item.citations.length === 1));
  assert.deepEqual(report.risks, []);
  const packet=JSON.parse(fake.calls[0].request.messages[1].content),expectedRisks=fake.calls[0].response.risks.map((risk:any)=>({...risk,citations:Object.values(risk.citations).filter(id=>id!=="").map(id=>{const{id:_,...span}=packet.citationCatalog.entries.find((entry:any)=>entry.id===id);return span;})}));
  assert.deepEqual(report.withheldRisks,{version:4,reason:"optional_source_leads_unverified",adjustedCriteria:[],entries:expectedRisks.map((risk:any,originalRiskIndex:number)=>({originalRiskIndex,risk}))});
  assert.equal(report.withheldRisks!.entries[0].risk.citations.length, 1);
  const {request} = fake.calls[0], prompt = request.messages[0].content, schema = request.tools[0].function.parameters;
  const itemKeys = schema.properties.items.items.properties.citations.required, riskKeys = schema.properties.risks.items.properties.citations.required;
  assert.ok(prompt.includes(`Every item MUST include ALL keys ${itemKeys.join(",")}`));
  assert.ok(prompt.includes(`every risk MUST include ALL keys ${riskKeys.join(",")}`));
  assert.match(prompt, /unused empty slots are valid and are not a zero-citation item/u);
  assert.match(prompt, /risk always needs nonempty c1.*each unused trailing key/u);
  assert.doesNotMatch(prompt, /Empty item slots are permitted only for insufficient_evidence/u);
  assert.equal(schema.properties.items.items.properties.citations.additionalProperties, false);
  assert.equal(schema.properties.risks.items.properties.citations.additionalProperties, false);
});

test("missing optional-risk c3 still rejects the whole report once without padding, dropping or retrying", async () => {
  const quote = fixture(), before = structuredClone(quote), fake = transport(report => {delete report.risks[0].citations.c3;});
  await assert.rejects(assessDelivery(quote, {DEEPSEEK_API_KEY: "controlled-no-network"}, fake.fetcher), error => error instanceof AssessmentResponseError && error.reason === "risk_fields");
  assert.equal(fake.calls.length, 1); assert.deepEqual(quote, before);
  assert.deepEqual(Object.keys(fake.calls[0].response.risks[0].citations), ["c1", "c2"]);
});

test("prompt clarification never weakens mandatory coverage, gaps or exact citation membership", async () => {
  const mutations: [string, (report: any) => void][] = [
    ["missing_items", report => {report.items.pop();}],
    ["structure", report => {delete report.items[0].citations.c6;}],
    ["structure", report => {report.items[0].citations.c2 = ""; report.items[0].citations.c3 = "not-a-catalog-id";}],
    ["citation", report => {report.items[0].citations.c1 = "not-a-catalog-id";}],
  ];
  for (const [reason, mutate] of mutations) {
    const quote = fixture(), before = structuredClone(quote), fake = transport(mutate);
    await assert.rejects(assessDelivery(quote, {DEEPSEEK_API_KEY: "controlled-no-network"}, fake.fetcher), error => error instanceof AssessmentResponseError && error.reason === reason);
    assert.equal(fake.calls.length, 1); assert.deepEqual(quote, before);
  }
});

test("all real request encodings retain factual binding and exact-copy boundaries without requiring V3 keys in old replays", async () => {
  for (const [assess, fixedSlots] of [[assessDelivery, true], [assessDeliveryCatalogReplay, false], [assessDeliveryLegacyReplay, false]] as const) {
    const fake = transport(); await assess(fixture(), {DEEPSEEK_API_KEY: "controlled-no-network"}, fake.fetcher);
    const prompt = fake.calls[0].request.messages[0].content;
    assert.match(prompt, /ordinary factual content requirement.*does not explicitly demand exact or verbatim/u);
    assert.match(prompt, /applicable row AND column headers/u);
    assert.match(prompt, /different page, row, column or unrelated control do not satisfy/u);
    assert.match(prompt, /Explicit exact\/verbatim copy and buyer-confirmed business-check expectations retain their precise conditions/u);
    assert.match(prompt, /item statuses, explanations, risks and limitations alike/u);
    assert.equal(prompt.includes("Every item MUST include ALL keys"), fixedSlots);
    assert.equal(fake.calls.length, 1);
    assert.doesNotMatch(prompt, /MDN|Our world|Earth|corpus|15\/16/u);
  }
});

test("report completeness instruction uses the actual selected top-level schema in every encoding", async () => {
  for (const assess of [assessDelivery, assessDeliveryCatalogReplay, assessDeliveryLegacyReplay]) {
    const fake = transport(); await assess(fixture(), {DEEPSEEK_API_KEY: "controlled-no-network"}, fake.fetcher);
    const request = fake.calls[0].request, schema = request.tools[0].function.parameters;
    assert.ok(request.messages[0].content.includes(`EVERY top-level key required by this tool schema: ${schema.required.join(",")}.`));
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
    assert.match(request.messages[0].content, /risks:\[\] or limitations:\[\].*never omit either key/u);
    assert.equal(schema.additionalProperties, false); assert.ok(schema.required.includes("limitations"));
  }
});

test("the actual missing-limitations first reply is still rejected whole once, without filling keys or changing the catalog or quote", async () => {
  const known = JSON.parse(await readFile(new URL("./fixtures/qualified-answers-malformed-top-level.json", import.meta.url), "utf8"));
  const q = projectQuote(known.project), before = structuredClone(q), raw = structuredClone(known.raw); let calls = 0;
  assert.ok(!Object.hasOwn(raw, "limitations"));
  await assert.rejects(assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
    calls++; const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
    assert.equal(packet.citationCatalog.catalogId, raw.catalogId);
    return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: request.tools[0].function.name, arguments: JSON.stringify(raw)}}]}}]});
  }), error => error instanceof AssessmentResponseError && error.reason === "structure");
  assert.equal(calls, 1); assert.deepEqual(q, before); assert.deepEqual(raw, known.raw); assert.ok(!Object.hasOwn(raw, "limitations"));
});
