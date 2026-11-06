import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createAssessmentLabelSourceFactsCheck, labelSourceFactExplanation} from "../lib/assessment-label-citations.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const criterion = (source = 'Contact source labels must include "Name" and "E-mail".') => ({id: "manual-1", title: "Declared source labels", source});
const html = (body: string) => `<!doctype html><html><head><title>Source facts</title></head><body>${body}</body></html>`;
const form = '<form><label>Name</label><label>E-mail</label></form>';
const citation = (file: string, source: string, excerpt = source) => {const start = source.indexOf(excerpt); assert.ok(start >= 0); return {file, excerpt, start, end: start + excerpt.length};};
const coverage = (files: Record<string, string>) => ({includedFiles: Object.keys(files), omittedFiles: [] as string[], truncatedFiles: [] as string[]});

test("source facts retain exact declared labels and inspected file without asserting rendered visibility or role identity", () => {
  const files = {"index.html": html(form)}, cited = [citation("index.html", files["index.html"])];
  const fact = createAssessmentLabelSourceFactsCheck(files, coverage(files))(criterion(), cited, "supported");
  assert.deepEqual(fact, {kind: "declared", context: "page", file: "index.html", labelCount: 2});
  assert.match(labelSourceFactExplanation(fact, "en"), /inspected location, not a confirmed business-page identity/u);
  assert.match(labelSourceFactExplanation(fact, "en"), /visibility.*were not observed/u);
  assert.equal(createAssessmentLabelSourceFactsCheck(files, coverage(files))(criterion(), [citation("index.html", files["index.html"], "Name")], "supported").kind, "unknown");
});

test("negative source fact inspects every sent page rather than converting missing citation coverage to absent fields", () => {
  const partial = html('<label>Name</label>'), complete = html(form), files = {"index.html": partial, "other.html": complete};
  const fact = createAssessmentLabelSourceFactsCheck(files, coverage(files))(criterion(), [citation("index.html", partial)], "changes_suggested");
  assert.equal(fact.kind, "unknown"); if (fact.kind === "unknown") assert.equal(fact.reason, "source_disagrees_with_change");
  files["other.html"] = html('<label>E-mail</label>');
  const absent = createAssessmentLabelSourceFactsCheck(files, coverage(files))(criterion(), [citation("index.html", partial)], "changes_suggested");
  assert.deepEqual(absent, {kind: "no_complete_group", context: "page", files: ["index.html", "other.html"], labelCount: 2});
  assert.match(labelSourceFactExplanation(absent, "en"), /Clarify the applicable scope before directing page edits/u);
});

test("whole-source absence requires complete HTML coverage and parser, retaining raster omission as a separate non-HTML boundary", () => {
  const files = {"index.html": html('<label>Name</label>'), "other.HTML": html('<label>E-mail</label>')};
  for (const observed of [undefined, {...coverage(files), includedFiles: ["index.html"]}, {...coverage(files), truncatedFiles: ["other.HTML"]}, {...coverage(files), omittedFiles: ["other.HTML"]}])
    assert.equal(createAssessmentLabelSourceFactsCheck(files, observed)(criterion(), [], "changes_suggested").kind, "unknown");
  assert.equal(createAssessmentLabelSourceFactsCheck(files, {...coverage(files), omittedFiles: ["image.png"]})(criterion(), [], "changes_suggested").kind, "no_complete_group");
  const malformed = {...files, "other.HTML": html('<label for="x" for="y">E-mail</label>')};
  assert.equal(createAssessmentLabelSourceFactsCheck(malformed, coverage(malformed))(criterion(), [], "changes_suggested").kind, "unknown");
});

test("PAGE does not invent FORM grouping while ambiguous explicit form owners disable absence", () => {
  const source = html('<form><label>Name</label></form><form><label>E-mail</label></form>'), files = {"index.html": source};
  const check = createAssessmentLabelSourceFactsCheck(files, coverage(files));
  assert.equal(check(criterion(), [], "changes_suggested").kind, "unknown");
  assert.equal(check(criterion('Contact form source content must label "Name" and "E-mail".'), [], "changes_suggested").kind, "no_complete_group");
  const ambiguous = {"index.html": html('<form><label>Name</label><label for="mail">E-mail</label><input id="mail" form="other"></form><form id="other"></form>')};
  assert.equal(createAssessmentLabelSourceFactsCheck(ambiguous, coverage(ambiguous))(criterion('Contact form source content must label "Name" and "E-mail".'), [], "changes_suggested").kind, "unknown");
  for (const ending of ['<input id="mail"><input id="mail">', '']) {
    const page = {"index.html": html('<label>Name</label><label for="mail">E-mail</label>' + ending)};
    const checkPage = createAssessmentLabelSourceFactsCheck(page, coverage(page));
    assert.equal(checkPage(criterion(), [citation("index.html", page["index.html"])], "supported").kind, "declared", "PAGE asks declared labels, not accessible control association");
    const change = checkPage(criterion(), [], "changes_suggested");
    assert.equal(change.kind, "unknown"); if (change.kind === "unknown") assert.equal(change.reason, "source_disagrees_with_change");
  }
});

test("foreign HTML islands and nested documents cannot silently become absence, while inert rawtext and template are not active labels", () => {
  for (const extra of ['<svg><foreignObject><label>E-mail</label></foreignObject></svg>', '<iframe srcdoc="<label>E-mail</label>"></iframe>']) {
    const files = {"index.html": html('<label>Name</label>' + extra)};
    assert.equal(createAssessmentLabelSourceFactsCheck(files, coverage(files))(criterion(), [], "changes_suggested").kind, "unknown");
  }
  const foreignText = {"index.html": html('<label>Name<svg><foreignObject><span>Extra</span></foreignObject></svg></label><label>E-mail</label>')};
  for (const status of ["supported", "changes_suggested"] as const)
    assert.equal(createAssessmentLabelSourceFactsCheck(foreignText, coverage(foreignText))(criterion(), [citation("index.html", foreignText["index.html"])], status).kind, "unknown", "foreign text must not be silently subtracted from an actual HTML label");
  for (const extra of ['<xmp><label>E-mail</label></xmp>', '<template><label>E-mail</label></template>', '<!-- <label>E-mail</label> -->']) {
    const files = {"index.html": html('<label>Name</label>' + extra)};
    assert.equal(createAssessmentLabelSourceFactsCheck(files, coverage(files))(criterion(), [], "changes_suggested").kind, "no_complete_group");
  }
});

test("implicit control form attributes never invent same-form support or whole-source absence, while PAGE remains declaration-only", () => {
  const directive = criterion('Contact form source content must label "Name" and "E-mail".');
  const variants = [
    '<form id="f"></form><label>Name<input name="name" form="f"></label><label>E-mail<input name="mail" form="f"></label>',
    '<form id="f"></form><form id="one"><label>Name<input form="f"></label></form><form id="two"><label>E-mail<input form="f"></label></form>',
    '<form id="f"><label>Name<input form="one"></label><label>E-mail<input form="two"></label></form><form id="one"></form><form id="two"></form>',
    '<form><label>Name<input><input></label><label>E-mail<input></label></form>',
    '<div id="f"></div><form id="f"><label>Name<input form="f"></label><label>E-mail<input form="f"></label></form>',
  ];
  for (const body of variants) {
    const files = {"index.html": html(body)}, check = createAssessmentLabelSourceFactsCheck(files, coverage(files));
    for (const status of ["supported", "changes_suggested"] as const)
      assert.equal(check(directive, [citation("index.html", files["index.html"])], status).kind, "unknown", body);
    assert.equal(check(criterion(), [citation("index.html", files["index.html"])], "supported").kind, "declared", "PAGE does not promise association");
  }
  for (const body of ['<form><label>Name<input></label><label>E-mail<input></label></form>', '<form id="f"><label>Name<input form="f"></label><label>E-mail<input form="f"></label></form>']) {
    const files = {"index.html": html(body)}, check = createAssessmentLabelSourceFactsCheck(files, coverage(files));
    assert.equal(check(directive, [citation("index.html", files["index.html"])], "supported").kind, "declared");
    const negative = check(directive, [], "changes_suggested");
    assert.equal(negative.kind, "unknown"); if (negative.kind === "unknown") assert.equal(negative.reason, "source_disagrees_with_change");
  }
  const empty = {"index.html": html('<form><label>Name</label><label><input></label></form><label>E-mail</label>')};
  assert.equal(createAssessmentLabelSourceFactsCheck(empty, coverage(empty))(directive, [], "changes_suggested").kind, "no_complete_group", "empty label cannot replace the required E-mail text; outside unbound E-mail is not a form label");
});

function quote(body = form, source = criterion().source, title = "Declared source labels") {
  const p: EvaluationProject = {id: "source-presentation-synthetic", stratum: "clean", language: "en", title: "Source facts fixture", summary: "Authored offline source presentation test only.",
    files: {"index.html": html(body), "other.html": html("<p>Other source</p>"), "site.css": "label{display:none}"},
    criteria: [1, 2].map(i => ({id: `manual-${i}`, title: i === 1 ? title : "Source content", source: i === 1 ? source : "The page content must include Other source.",
      reference: {expectedStatus: "supported", rationale: "Controlled reply fixture, not real model evaluation.", relevantFiles: ["index.html", "other.html"], requiresSemanticReview: true}}))};
  return projectQuote(p);
}
async function synthetic(explanation: string, status = "supported", body = form, source = criterion().source, title?: string) {
  const q = quote(body, source, title), before = structuredClone(q); let calls = 0;
  const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
    calls++; const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
    const ids = ["index.html", "other.html"].map(file => packet.citationCatalog.entries.find((e: any) => e.file === file && e.start === 0).id);
    const slots = (id: string) => ({c1: id, c2: "", c3: "", c4: "", c5: "", c6: ""});
    const raw = {catalogId: packet.citationCatalog.catalogId, items: packet.criteria.map((c: any, i: number) => ({criterionId: c.id, status: i === 0 ? status : "supported", explanation, citations: slots(ids[i])})), risks: [], limitations: ["Controlled response; no browser, provider network or payment."]};
    return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: request.tools[0].function.name, arguments: JSON.stringify(raw)}}]}}]});
  });
  assert.equal(calls, 1); assert.deepEqual(q, before); assert.equal(q.proof.paymentState, "unfunded"); return report.items[0];
}

test("model positive, negative and conditional visible prose does not drive word replacement or a blanket unknown", async () => {
  for (const explanation of ["The labels are visible.", "The labels are not visible.", "If the labels are visible, inspect them.", 'The source says "Visible" as data.']) {
    const item = await synthetic(explanation);
    assert.equal(item.status, "supported"); assert.notEqual(item.explanation, explanation);
    assert.match(item.explanation, /declared HTML label texts/u); assert.match(item.explanation, /were not observed/u);
  }
});

test("quoted Visible stays source data; runtime title/suffix and raw unknown never become a static pass", async () => {
  const body = '<form><label>Visible</label><label>Submit payment</label></form>', source = 'Contact source labels must include "Visible" and "Submit payment".';
  assert.equal((await synthetic("The labels are visible.", "supported", body, source)).status, "supported");
  assert.equal((await synthetic("Runtime claim.", "supported", body, source, "Working form submission")).status, "insufficient_evidence");
  assert.equal((await synthetic("Runtime claim.", "supported", body, source + " The form must actually submit payment.")).status, "insufficient_evidence");
  assert.equal((await synthetic("Unresolved model.", "insufficient_evidence")).status, "insufficient_evidence");
});

test("three exact previously-qualified provider answers retain statuses/catalog/citations with structural source explanations", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/qualified-answers-three-replay.json", import.meta.url), "utf8"));
  for (const entry of fixture.cases) {
    const q = projectQuote(entry.project), before = structuredClone(q), raw = structuredClone(entry.raw); let calls = 0;
    const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
      calls++; const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
      assert.equal(packet.citationCatalog.catalogId, raw.catalogId);
      return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: request.tools[0].function.name, arguments: JSON.stringify(raw)}}]}}]});
    });
    assert.equal(calls, 1); assert.deepEqual(q, before); assert.deepEqual(raw, entry.raw);
    assert.deepEqual(report.items.map(i => i.status), entry.raw.items.map((i: any) => i.status));
    assert.match(report.items[0].explanation, /No single page contains all/u);
    assert.doesNotMatch(report.items[0].explanation, /add a label|remove|relocate|visible.*label/u);
    for (const c of report.items.flatMap(i => i.citations)) assert.equal(entry.project.files[c.file].slice(c.start, c.end), c.excerpt);
  }
});
