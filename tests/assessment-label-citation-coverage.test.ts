import assert from "node:assert/strict";
import test from "node:test";
import {assessDeliveryLegacyReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";
import type {ProofQuote} from "../lib/contracts.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";
import {createEvidenceExport, verifyEvidenceExport} from "../lib/evidence-export.ts";
import {acceptDeliveryWithBasis} from "./acceptance-client.ts";

const REQUIREMENT = "Contact form source content must label Full name, Email address, Phone number, and Message.";
const LABELS = ["Full name", "Email address", "Phone number", "Message"];
const html = (body: string) => `<!doctype html><html><head><title>Controlled source fixture</title></head><body>${body}</body></html>`;
const sourceForm = (labels = LABELS) => `<form><legend>Contact details</legend>${labels.map(label => `<label>${label}</label>`).join("")}</form>`;
type Citation = {file: string; excerpt: string};
type Status = "supported" | "changes_suggested" | "insufficient_evidence";
function fixture(body = sourceForm(), source = REQUIREMENT, extras: Record<string, string> = {}): ProofQuote {
  const project: EvaluationProject = {id: "controlled-label-citation-coverage", stratum: "boundary", language: "en", title: "Controlled label evidence",
    summary: "Inspect source labels only. No form, email, payment or browser action is executed.",
    files: {"index.html": html("<p>Contact details</p>"), "contact.html": html(body), ...extras},
    criteria: [source, "Home page content must include Contact details."].map((text, i) => ({id: `manual-${i + 1}`, title: "Source label text", source: text,
      reference: {expectedStatus: "supported", rationale: "Controlled test response, not real model evaluation.", relevantFiles: ["index.html", "contact.html"], requiresSemanticReview: true}}))};
  return projectQuote(project);
}
const labelCitations = (labels = LABELS, file = "contact.html"): Citation[] => labels.map(label => ({file, excerpt: `<label>${label}</label>`}));
async function assess(q: ProofQuote, citations: Citation[], status: Status = "supported", risks: unknown[] = []) {
  const before = structuredClone(q), targetId = q.proof.criteria[0].id; let calls = 0;
  const result = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-offline-no-network"}, async () => {
    calls++;
    return Response.json({choices: [{finish_reason: "tool_calls", message: {content: null, tool_calls: [{id: "controlled-only", type: "function", function: {
      name: "submit_source_assessment", arguments: JSON.stringify({items: q.proof.criteria.map(c => ({criterionId: c.id, status: c.id === targetId ? status : "supported",
        explanation: "Controlled source text advice; no real form operation is established.", citations: c.id === targetId ? citations : [{file: "index.html", excerpt: "<p>Contact details</p>"}]})),
      risks, limitations: ["Controlled isolated response; no provider network, browser, authentication or payment was executed."]})}}]}}]});
  });
  assert.equal(calls, 1); assert.deepEqual(q, before); assert.equal(q.proof.paymentState, "unfunded");
  return result.items.find(item => item.criterionId === targetId)!;
}

test("four existing contact labels cannot be supported by citations for only three labels", async () => {
  const item = await assess(fixture(), labelCitations(LABELS.slice(0, 3)));
  assert.equal(item.status, "insufficient_evidence");
  assert.match(item.explanation, /citat|quot|referenc|excerpt/iu);
  assert.ok(!/field(?:s)? (?:is|are) missing|label(?:s)? (?:is|are) absent/iu.test(item.explanation));
});

test("four exact quotes retain source support for all four contact labels", async () => {
  const item = await assess(fixture(), labelCitations());
  assert.equal(item.status, "supported"); assert.equal(item.citations.length, 4);
});

test("six real item quotes are permitted while seven item quotes fail closed", async () => {
  const q = fixture(), six = [...labelCitations(), {file: "contact.html", excerpt: "<legend>Contact details</legend>"}, {file: "index.html", excerpt: "<p>Contact details</p>"}];
  const item = await assess(q, six);
  assert.equal(item.status, "supported"); assert.equal(item.citations.length, 6);
  await assert.rejects(assess(q, [...six, {file: "contact.html", excerpt: "<form>"}]), error => error instanceof AssessmentResponseError && error.reason === "structure");
});

test("wider item quotation allowance does not permit four risk quotes", async () => {
  const risk = {title: "Controlled source concern", explanation: "Controlled risk-boundary fixture.", suggestion: "Inspect the saved source.", citations: labelCitations()};
  await assert.rejects(assess(fixture(), labelCitations(), "supported", [risk]), error => error instanceof AssessmentResponseError && error.reason === "risk_fields");
});

test("duplicating an existing quote does not supply evidence for Message", async () => {
  const three = labelCitations(LABELS.slice(0, 3)), item = await assess(fixture(), [...three, three[0]]);
  assert.equal(item.status, "insufficient_evidence"); assert.match(item.explanation, /citat|quot|referenc|excerpt/iu);
});

test("raw unknown and change advice are never promoted by complete or incomplete label quotes", async () => {
  for (const status of ["insufficient_evidence", "changes_suggested"] as const) for (const quotes of [labelCitations(), labelCitations(LABELS.slice(0, 3))]) {
    assert.equal((await assess(fixture(), quotes, status)).status, status);
  }
});

test("three-label legacy source support still accepts its three exact quotes", async () => {
  const labels = ["Full name", "Email address", "Message"], source = "Contact form source content must label Full name, Email address, and Message.";
  const item = await assess(fixture(sourceForm(labels), source), labelCitations(labels));
  assert.equal(item.status, "supported"); assert.equal(item.citations.length, 3);
});

test("inline label markup and HTML entities retain exact source-byte UTF-16 spans", async () => {
  const fragments = ["<label>Full <span>name</span></label>", "<label>Email&#32;address</label>", "<label>Phone&nbsp;number</label>", "<label><strong>Message</strong></label>"];
  const q = fixture(`<p>🙂 Controlled source prefix</p><form>${fragments.join("")}</form>`);
  const item = await assess(q, fragments.map(excerpt => ({file: "contact.html", excerpt})));
  assert.equal(item.status, "supported");
  for (const citation of item.citations) {
    const source = q.proof.delivery!.files![citation.file], expectedStart = source.indexOf(citation.excerpt);
    assert.equal(citation.start, expectedStart); assert.equal(citation.end, expectedStart + citation.excerpt.length);
    assert.equal(source.slice(citation.start, citation.end), citation.excerpt);
  }
});

test("text-node-only quotes can witness labels without fabricating surrounding tags", async () => {
  const q = fixture(), item = await assess(q, LABELS.map(excerpt => ({file: "contact.html", excerpt})));
  assert.equal(item.status, "supported"); assert.equal(item.citations.length, 4);
  for (const citation of item.citations) assert.equal(q.proof.delivery!.files![citation.file].slice(citation.start, citation.end), citation.excerpt);
});

test("a truncated entity quote cannot fill a missing raw source byte inside a label", async () => {
  const q = fixture("<form><label>Owner<span>&#39;</span>s</label></form>", "Contact form source content must label Owner's.");
  const fragments = ["<label>Owner<span>", "&#39", "</span>s</label>"], truncated = await assess(q, fragments.map(excerpt => ({file: "contact.html", excerpt})));
  assert.equal(truncated.status, "insufficient_evidence");
  fragments[1] = "&#39;";
  const complete = await assess(q, fragments.map(excerpt => ({file: "contact.html", excerpt})));
  assert.equal(complete.status, "supported");
});

for (const [kind, fake] of [
  ["attribute", '<div data-example="<label>Message</label>">No field here</div>'],
  ["comment", "<!-- <label>Message</label> -->"],
  ["script", '<script type="application/json">"<label>Message</label>"</script>'],
  ["template", "<template><label>Message</label></template>"],
] as const) test(`a ${kind} pseudo-label cannot complete a real contact form`, async () => {
  const q = fixture(sourceForm(LABELS.slice(0, 3)) + fake), item = await assess(q, labelCitations());
  assert.equal(item.status, "insufficient_evidence");
});

test("two incomplete forms on one page cannot be combined into one complete contact form", async () => {
  const q = fixture(sourceForm(LABELS.slice(0, 2)) + sourceForm(LABELS.slice(2))), item = await assess(q, labelCitations());
  assert.equal(item.status, "insufficient_evidence");
});

test("label quotes from different files cannot be combined into a complete single form", async () => {
  const q = fixture(sourceForm(LABELS.slice(0, 2)), REQUIREMENT, {"other.html": html(sourceForm(LABELS.slice(2)))});
  const item = await assess(q, [...labelCitations(LABELS.slice(0, 2)), ...labelCitations(LABELS.slice(2), "other.html")]);
  assert.equal(item.status, "insufficient_evidence");
});

test("complete label quotes do not override compound runtime, runtime title or mobile scope", async () => {
  const compound = fixture(sourceForm(), `${REQUIREMENT} The form must actually email the owner.`);
  assert.equal((await assess(compound, labelCitations())).status, "insufficient_evidence");
  const titled = fixture(); titled.proof.criteria[0].title = "Authenticate users and actually execute a payment";
  assert.equal((await assess(titled, labelCitations())).status, "insufficient_evidence");
  const mobile = fixture(); mobile.proof.criteria[0].id = "mobile";
  for (const evidence of mobile.proof.delivery!.evidence) if (evidence.criterionId === "manual-1") evidence.criterionId = "mobile";
  assert.equal((await assess(mobile, labelCitations())).status, "insufficient_evidence");
});

test("offline verification retains wider current and historical item quotes without widening risk quotes", async () => {
  const q = fixture(), files = q.proof.delivery!.files!, at = "2026-11-05T00:00:00.000Z";
  const parsed = parseStaticProject({title: q.title, summary: q.summary, amount: "1.00", requiredPages: ["index.html"], manualRequirements: [REQUIREMENT, "Home page content must include Contact details."]}, "en");
  q.proof.project = parsed.project; q.proof.criteria = parsed.criteria;
  q.proof.delivery = createUploadedDelivery(files, parsed.project, "en", 1);
  q.proof.review = {deliveryId: q.proof.delivery.id, reviewedAt: at, mode: "demo", summary: "Controlled source-rule fixture; no observed browser or provider operation."};
  q.proof.collaboration = {stage: "submitted", submission: {deliveryId: q.proof.delivery.id, at, note: "Controlled local test submission."}, feedback: []};
  const savedReport = (id: string, quotes: Citation[]) => ({id, deliveryId: q.proof.delivery!.id, method: "source-ai-v1" as const, mode: "live" as const, model: "controlled-no-provider",
    assessedAt: at, items: q.proof.criteria.map(c => ({criterionId: c.id, status: c.id === "manual-1" ? "supported" as const : "insufficient_evidence" as const,
      explanation: "Controlled saved source report; no actual model result or acceptance recommendation.",
      citations: (c.id === "manual-1" ? quotes : []).map(citation => {const start = files[citation.file].indexOf(citation.excerpt); return {...citation, start, end: start + citation.excerpt.length};}),
      ruleEvidenceIds: q.proof.delivery!.evidence.filter(e => e.criterionId === c.id).map(e => e.id)})), risks: [], limitations: ["Controlled offline-record verification only."],
    coverage: {includedFiles: Object.keys(files), truncatedFiles: [], omittedFiles: []}});
  const sixQuotes = [...labelCitations(), {file: "contact.html", excerpt: "<legend>Contact details</legend>"}, {file: "index.html", excerpt: "<p>Contact details</p>"}];
  q.proof.delivery.assessment = savedReport("controlled-historical-six-quotes", sixQuotes);
  const accepted = acceptDeliveryWithBasis(q, {confirm: true, deliveryId: q.proof.delivery.id, manualChecks: q.proof.delivery.evidence.filter(e => e.finding === "needs_human").map(e => e.criterionId)}, at);
  accepted.proof.delivery!.assessment = savedReport("controlled-current-six-quotes", sixQuotes);
  const bundle = await createEvidenceExport(accepted);
  assert.equal(bundle.delivery.assessment!.items.find(i => i.criterionId === "manual-1")!.citations.length, 6);
  assert.equal(bundle.delivery.acceptanceEvidence![0].assessment!.items.find(i => i.criterionId === "manual-1")!.citations.length, 6);
  assert.equal((await verifyEvidenceExport(bundle)).consistency, "consistent");
  const oversizedHistorical = structuredClone(bundle), historicalItem = oversizedHistorical.delivery.acceptanceEvidence![0].assessment!.items.find(i => i.criterionId === "manual-1")!;
  historicalItem.citations.push(structuredClone(historicalItem.citations[0]));
  const historicalFailure = await verifyEvidenceExport(oversizedHistorical);
  assert.equal(historicalFailure.consistency, "inconsistent"); assert.equal(historicalFailure.checks.find(c => c.id === "ai-source-citations")?.status, "inconsistent");
  const oversizedRisk = structuredClone(bundle);
  oversizedRisk.delivery.assessment!.risks.push({title: "Controlled source concern", explanation: "Controlled oversized risk quotes.", suggestion: "Inspect the source.", citations: labelCitations().map(citation => {const start = files[citation.file].indexOf(citation.excerpt); return {...citation, start, end: start + citation.excerpt.length};})});
  assert.equal((await verifyEvidenceExport(oversizedRisk)).checks.find(c => c.id === "ai-source-citations")?.status, "inconsistent");
});
