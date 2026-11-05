import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import type {ProofAssessmentItem, ProofQuote} from "../lib/contracts.ts";
import {ASSESSMENT_EVIDENCE_NEED_REASONS, assessmentEvidenceNeedPresentation, isAssessmentEvidenceNeed, makeAssessmentEvidenceNeed} from "../lib/assessment-evidence-needs.ts";
import {assessDelivery, assessDeliveryCatalogReplay} from "../lib/delivery-assessment.ts";
import type {AssessmentCitationCatalog} from "../lib/assessment-citation-catalog.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {projectQuote, validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";

const corpus = validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-project-corpus-2026-11-04.json", import.meta.url), "utf8")));
const html = (body: string) => `<!doctype html><html><head><title>Fixture</title></head><body>${body}</body></html>`;
const baseSource = "The page content must list the contact details.", details = "<p>Details</p>";
function fixture(source = baseSource, content = details): ProofQuote {
  const q = projectQuote(corpus.projects[0]), summary = "Review the current delivered website source.";
  const parsed = parseStaticProject({title: "Evidence-needed fixture", summary, amount: "1.00", requiredPages: ["index.html"], manualRequirements: [source]}, "en");
  q.language = "en"; q.summary = summary; q.proof.project = parsed.project; q.proof.criteria = parsed.criteria;
  q.proof.delivery = createUploadedDelivery({"index.html": html(content), "menu.html": html(content), "about.html": html(content)}, parsed.project, "en", 1);
  q.proof.review = {deliveryId: q.proof.delivery.id, reviewedAt: q.createdAt, mode: "demo", summary: "Controlled source rules."}; return q;
}
function businessFixture(ambiguous = false) {
  const q = fixture(), summary = "Display the agreed Tea price on both pages.", unit = summaryCoverageUnits(summary)[0];
  const parsed = parseStaticProject({title: q.title, summary, amount: "1.00", requiredPages: ["index.html", "menu.html"], manualRequirements: [],
    coverage: {version: 1, sourceText: summary, confirmed: true, decisions: [{id: unit.id, disposition: "include"}]},
    businessChecks: {confirmed: true, items: ["index.html", "menu.html"].map((file, index) => ({id: `business-${index + 1}`, criterionId: "coverage-1", file,
      source: {start: unit.start, end: unit.end, excerpt: unit.text}, expected: {kind: "item_price", label: "Tea", currency: "AUD", amountMinor: 1800}}))}}, "en");
  const content = "<p>Tea AUD 18</p><p>Coffee AUD 18</p>";
  q.summary = summary; q.proof.project = parsed.project; q.proof.criteria = parsed.criteria;
  q.proof.delivery = createUploadedDelivery({"index.html": html(content), "menu.html": html(ambiguous ? "<p>Tea</p><p>AUD18</p>" : content), "about.html": html(content)}, parsed.project, "en", 1);
  q.proof.review = {deliveryId: q.proof.delivery.id, reviewedAt: q.createdAt, mode: "demo", summary: "Controlled source rules."}; return q;
}
async function run(q: ProofQuote, options: {id?: string; raw?: ProofAssessmentItem["status"]; citations?: [string, string][]; legacy?: boolean; explanation?: string} = {}) {
  const before = structuredClone(q), target = options.id ?? "manual-1"; let calls = 0;
  const assess = options.legacy ? assessDeliveryCatalogReplay : assessDelivery;
  const report = await assess(q, {DEEPSEEK_API_KEY: "controlled-offline-no-network"}, async (_url, init) => {
    calls++; const body = String(init?.body), packet = JSON.parse(JSON.parse(body).messages[1].content) as {criteria: {id: string}[]; citationCatalog: AssessmentCitationCatalog};
    assert.ok(!body.includes('"evidenceNeed"')); assert.ok(!body.includes("source-evidence-need-v1"));
    const ids = (options.citations ?? []).map(([file, excerpt]) => {const span = packet.citationCatalog.entries.find(entry => entry.file === file && entry.excerpt === excerpt); assert.ok(span, excerpt); return span.id;});
    const slot = (values: string[]) => Object.fromEntries(Array.from({length: 6}, (_, index) => [`c${index + 1}`, values[index] ?? ""]));
    const output = {catalogId: packet.citationCatalog.catalogId, items: packet.criteria.map(c => ({criterionId: c.id, status: c.id === target ? options.raw ?? "supported" : "insufficient_evidence",
      explanation: options.explanation ?? "Controlled provider prose; not the source of evidence-needed reasons.", citations: options.legacy ? c.id === target ? ids : [] : slot(c.id === target ? ids : [])})), risks: [], limitations: []};
    return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: options.legacy ? "submit_source_assessment_v2" : "submit_source_assessment_v3", arguments: JSON.stringify(output)}}]}}]});
  });
  assert.equal(calls, 1); assert.deepEqual(q, before); return report.items.find(item => item.criterionId === target)!;
}

test("the actual scope branches supply observation, financial, readback and clarification reasons", async () => {
  for (const [source, reason] of [
    ["The login must reject invalid credentials.", "direct_observation"],
    ["The page copy must list prices and actually refund the original card.", "financial_execution"],
    ["Record every enquiry durably and display its receipt copy.", "record_readback"],
    ["Meet all conditions previously discussed.", "requirement_clarification"],
  ]) {
    const result = await run(fixture(source)); assert.equal(result.status, "insufficient_evidence");
    assert.equal(result.evidenceNeed?.reason, reason); assert.deepEqual(result.evidenceNeed?.targetFiles, []);
  }
  assert.equal((await run(fixture(), {id: "mobile"})).evidenceNeed?.reason, "browser_observation");
});

test("actual empty citations and raw unknown have distinct reasons independent of adversarial model prose", async () => {
  const prose = "Upload a contract and execute payment; viewport evidence is missing from menu.html.";
  const noCitations = await run(fixture(), {explanation: prose}), unresolved = await run(fixture(), {raw: "insufficient_evidence", explanation: prose});
  assert.equal(noCitations.evidenceNeed?.reason, "no_citations"); assert.equal(unresolved.evidenceNeed?.reason, "model_unresolved");
  assert.deepEqual(unresolved.evidenceNeed?.targetFiles, []); assert.equal(unresolved.explanation, prose);
  assert.ok(!assessmentEvidenceNeedPresentation(unresolved.evidenceNeed, "en").nextStep.includes("Upload a contract"));
});

test("business unknowns and actual owner/page witness gaps retain exact provided targets", async () => {
  const ambiguous = await run(businessFixture(true), {id: "coverage-1", raw: "changes_suggested", citations: [["menu.html", "<p>AUD18</p>"]]});
  assert.equal(ambiguous.evidenceNeed?.reason, "source_ambiguity"); assert.deepEqual(ambiguous.evidenceNeed?.targetFiles, ["menu.html"]);
  const pages = await run(businessFixture(), {id: "coverage-1", citations: [["about.html", "<p>Tea AUD 18</p>"]]});
  assert.equal(pages.evidenceNeed?.reason, "page_citations"); assert.deepEqual(pages.evidenceNeed?.targetFiles, ["index.html", "menu.html"]);
  const fields = await run(businessFixture(), {id: "coverage-1", citations: [["index.html", "<p>Coffee AUD 18</p>"], ["menu.html", "<p>Coffee AUD 18</p>"]]});
  assert.equal(fields.evidenceNeed?.reason, "field_relationship");
});

test("actual label, universal-role, universal-page and dynamic-copy guards record their own reasons", async () => {
  const labels = await run(fixture("Contact form source content must label Name and Email.", "<form><label>Name</label><label>Email</label></form>"), {citations: [["index.html", "<label>Name</label>"]]});
  assert.equal(labels.evidenceNeed?.reason, "field_relationship");
  const role = await run(fixture("The homepage and full menu source content must both attach the GF tag to Tea"), {citations: [["index.html", details]]});
  assert.equal(role.evidenceNeed?.reason, "page_scope"); assert.deepEqual(role.evidenceNeed?.targetFiles, []);
  const list = await run(fixture("Text content in mainNav on all three pages must include Home and About", '<nav id="mainNav"><a>Home</a><a>About</a></nav>'+details), {citations: [["index.html", details]]});
  assert.equal(list.evidenceNeed?.reason, "page_citations"); assert.deepEqual(list.evidenceNeed?.targetFiles, ["about.html", "index.html", "menu.html"]);
  const copy = await run(fixture('The page copy must include the exact wording "Opening hours".', details+"<script>ignored()</script>"), {citations: [["index.html", details]]});
  assert.equal(copy.evidenceNeed?.reason, "source_ambiguity");
});

test("metadata exists only for active final unknowns and never weakens rule priority or upgrades a model unknown", async () => {
  const supported = await run(fixture(), {citations: [["index.html", details]]}); assert.equal(supported.status, "supported"); assert.equal(supported.evidenceNeed, undefined);
  const legacy = await run(fixture(), {raw: "insufficient_evidence", legacy: true}); assert.equal(legacy.evidenceNeed, undefined);
  const failed = fixture(); const evidence = failed.proof.delivery!.evidence.find(row => row.criterionId === "manual-1")!; evidence.finding = "fail";
  const result = await run(failed, {raw: "insufficient_evidence"}); assert.equal(result.status, "changes_suggested"); assert.equal(result.evidenceNeed, undefined);
  const unknown = await run(fixture(), {raw: "insufficient_evidence"}); assert.equal(unknown.status, "insufficient_evidence");
});

test("target construction preserves only exact supplied HTML/CSS keys and presentation never mutates saved data", () => {
  const sent = {"index.html": "source", "About.HTML": "source", "style.css": "source", "photo.png": "pixels"};
  const value = makeAssessmentEvidenceNeed("page_citations", ["index.html", "./index.html", "about.html", "About.HTML", "photo.png", "style.css", "index.html", "missing.html"], sent), before = structuredClone(value);
  assert.deepEqual(value.targetFiles, ["index.html", "About.HTML", "style.css"]); assert.equal(isAssessmentEvidenceNeed(value), true);
  for (const reason of ASSESSMENT_EVIDENCE_NEED_REASONS) for (const language of ["zh", "en"] as const) {
    const presented = assessmentEvidenceNeedPresentation({...value, reason}, language); assert.equal(presented.legacy, false); assert.ok(presented.reason); assert.ok(presented.nextStep.length <= 300);
    presented.targetFiles.push("changed.html");
  }
  assert.deepEqual(value, before);
});

test("old and invalid persisted metadata use truthful fallback without executing accessors", () => {
  const valid = {schema: "source-evidence-need-v1", reason: "page_citations", targetFiles: ["index.html"]};
  for (const value of [undefined, null, {}, {...valid, schema: "other"}, {...valid, reason: "invented"}, {...valid, targetFiles: null}, {...valid, targetFiles: ["../index.html"]}, {...valid, targetFiles: ["index.html", "index.html"]}, {...valid, extra: true}])
    assert.equal(assessmentEvidenceNeedPresentation(value, "en").legacy, true);
  let called = false; const getter = {...valid}; Object.defineProperty(getter, "reason", {get() {called = true; throw new Error("Must not execute");}});
  assert.equal(assessmentEvidenceNeedPresentation(getter, "en").legacy, true);
  const targets: string[] = []; Object.defineProperty(targets, 0, {get() {called = true; throw new Error("Must not execute");}}); targets.length = 1;
  assert.equal(assessmentEvidenceNeedPresentation({...valid, targetFiles: targets}, "zh").legacy, true); assert.equal(called, false);
});
