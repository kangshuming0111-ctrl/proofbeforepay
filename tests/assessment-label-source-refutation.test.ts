import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";
import {parseStaticProject} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";

const source = 'Contact source labels must include "Name" and "E-mail".';
const html = (body: string) => `<!doctype html><html><head><title>Source</title></head><body>${body}</body></html>`;
const form = '<form><label>Name</label><label>E-mail</label></form>';
function fixture(body: string, requirement = source, title = "Source labels") {
  const p: EvaluationProject = {id: "bounded-source-refutation", stratum: "boundary", language: "en", title: "Source-only control", summary: "Offline authored source-refutation test only.",
    files: {"index.html": html(body), "other.html": html("<p>Other source</p>"), "site.css": "body{margin:0}"},
    criteria: [requirement, "The page content must include Other source."].map((text, i) => ({id: `manual-${i + 1}`, source: text, title: i === 0 ? title : "Source copy",
      reference: {expectedStatus: "insufficient_evidence", rationale: "Controlled offline boundary test, not a real model reference.", relevantFiles: ["index.html", "other.html"], requiresSemanticReview: true}}))};
  return projectQuote(p);
}
async function run(q: ReturnType<typeof fixture>, status = "supported", citationMode = "all") {
  const before = structuredClone(q); let calls = 0;
  const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
    calls++; const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
    const htmlInventory = packet.fileInventory.filter((f: any) => f.type === "html").map((f: any) => f.path).sort();
    assert.deepEqual(htmlInventory, Object.keys(packet.files).filter(p => p.endsWith(".html")).sort(), "production sourcePacket cannot silently drop delivered HTML");
    for (const file of htmlInventory) assert.equal(packet.files[file], q.proof.delivery!.files![file]);
    const slots = (id: string) => ({c1: id, c2: "", c3: "", c4: "", c5: "", c6: ""});
    const first = citationMode === "none" ? "" : citationMode === "invalid" ? "not-a-source-id" : packet.citationCatalog.entries.find((e: any) => e.file === "index.html"
      && (citationMode === "nameOnly" ? e.excerpt.includes("<label>Name</label>") && !e.excerpt.includes("E-mail") : e.start === 0))?.id;
    assert.ok(first !== undefined);
    const other = packet.citationCatalog.entries.find((e: any) => e.file === "other.html" && e.start === 0).id;
    return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: request.tools[0].function.name,
      arguments: JSON.stringify({catalogId: packet.citationCatalog.catalogId, items: packet.criteria.map((c: any, i: number) => ({criterionId: c.id, status: i === 0 ? status : "supported", explanation: "Controlled original model statement, not source proof.", citations: slots(i === 0 ? first : other)})), risks: [], limitations: []})}}]}}]});
  });
  assert.equal(calls, 1); assert.deepEqual(q, before); assert.equal(q.proof.paymentState, "unfunded"); return report;
}

test("actual retained raw false positives become independently verified source changes, preserving original supported audit/citations", async () => {
  const context = JSON.parse(await readFile(new URL("./fixtures/qualified-answers-cycle40-plan-context.json", import.meta.url), "utf8"));
  for (const entry of context.cases) {
    const q = projectQuote(entry.project), before = structuredClone(q), raw = structuredClone(entry.raw); let calls = 0;
    const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
      calls++; const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
      assert.equal(packet.citationCatalog.catalogId, raw.catalogId);
      return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: request.tools[0].function.name, arguments: JSON.stringify(raw)}}]}}]});
    });
    assert.equal(calls, 1); assert.deepEqual(q, before); assert.deepEqual(raw, entry.raw);
    assert.equal(raw.items[0].status, "supported"); assert.equal(report.items[0].status, "changes_suggested");
    assert.match(report.items[0].explanation, /No single page contains all/u);
    assert.match(report.items[0].explanation, /not.*confirmed business-page identity/u);
    assert.equal(report.items[1].status, "supported");
    assert.deepEqual(report.withheldRisks?.adjustedCriteria, [{criterionId: "coverage-1", originalStatus: "supported", publishedStatus: "changes_suggested"}]);
    assert.equal(report.withheldRisks?.reason, "item_status_adjusted");
    assert.deepEqual(report.withheldRisks?.entries.map(e => e.risk.title), raw.risks.map((r: any) => r.title));
    assert.deepEqual(report.items[0].citations, entry.previousApplication.items[0].citations);
    for (const c of report.items.flatMap(i => i.citations)) assert.equal(entry.project.files[c.file].slice(c.start, c.end), c.excerpt);
  }
});

test("full source group with incomplete citations remains unknown, and raw unknown or empty citations are never promoted", async () => {
  assert.equal((await run(fixture(form), "supported", "nameOnly")).items[0].status, "insufficient_evidence");
  assert.equal((await run(fixture('<form><label>Name</label></form>'), "insufficient_evidence")).items[0].status, "insufficient_evidence");
  assert.equal((await run(fixture('<form><label>Name</label></form>'), "supported", "none")).items[0].status, "insufficient_evidence");
  assert.equal((await run(fixture(form))).items[0].status, "supported");
});

test("foreign document and implicit-owner uncertainty cannot be refuted, and PAGE/FORM semantics stay distinct", async () => {
  for (const body of ['<label>Name</label><svg><foreignObject><label>E-mail</label></foreignObject></svg>', '<label>Name</label><iframe srcdoc="<label>E-mail</label>"></iframe>'])
    assert.equal((await run(fixture(body))).items[0].status, "insufficient_evidence");
  const formRequirement = 'Contact form source content must label "Name" and "E-mail".';
  assert.equal((await run(fixture('<form id="f"></form><label>Name<input form="f"></label><label>E-mail<input form="f"></label>', formRequirement))).items[0].status, "insufficient_evidence");
  const split = '<form><label>Name</label></form><form><label>E-mail</label></form>';
  assert.equal((await run(fixture(split, formRequirement))).items[0].status, "changes_suggested");
  assert.equal((await run(fixture(split))).items[0].status, "supported");
});

test("runtime/other-guard unknown and real buyer-saved business mapping never enter finite source refutation", async () => {
  assert.equal((await run(fixture('<label>Name</label>', source, "Working form submission"))).items[0].status, "insufficient_evidence");
  assert.equal((await run(fixture('<label>Name</label>', source + " The form must actually submit."))).items[0].status, "insufficient_evidence");
  const summary = source, unit = summaryCoverageUnits(summary)[0];
  const businessChecks = {confirmed: true as const, items: [{id: "business-1", criterionId: unit.id, file: "index.html", source: {start: unit.start, end: unit.end, excerpt: unit.text}, expected: {kind: "visible_copy" as const, text: "Name"}}]};
  const parsed = parseStaticProject({title: "Locked source mapping", summary, amount: "1.00", requiredPages: ["index.html", "other.html"], manualRequirements: [], coverage: {version: 1, sourceText: summary, confirmed: true, decisions: [{id: unit.id, disposition: "include"}]}, businessChecks}, "en");
  const q = projectQuote({id: "mapped-refutation-control", stratum: "boundary", language: "en", title: parsed.title, summary, files: {"index.html": html('<label>Name</label>'), "other.html": html('<p>Other source</p>'), "site.css": "body{margin:0}"}, requiredPages: ["index.html", "other.html"], businessChecks,
    criteria: parsed.criteria.filter(c => c.id.startsWith("coverage-")).map(c => ({...c, reference: {expectedStatus: "insufficient_evidence", rationale: "Controlled mapped boundary only.", relevantFiles: ["index.html"], requiresSemanticReview: true}}))});
  assert.equal((await run(q)).items[0].status, "insufficient_evidence");
});

test("an invalid raw source citation rejects the whole report before any independent refutation", async () => {
  await assert.rejects(run(fixture('<label>Name</label>'), "supported", "invalid"), error => error instanceof AssessmentResponseError && error.reason === "citation");
});
