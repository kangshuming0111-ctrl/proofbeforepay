import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessmentItem, ProofBusinessExpected, ProofQuote} from "../lib/contracts.ts";
import type {AssessmentCitationCatalog} from "../lib/assessment-citation-catalog.ts";
import {assessDelivery, assessDeliveryCatalogReplay, assessDeliveryLegacyReplay} from "../lib/delivery-assessment.ts";
import {SOURCE_ASSESSMENT_TOOL_NAME, SOURCE_ASSESSMENT_CATALOG_TOOL_NAME, SOURCE_ASSESSMENT_SLOTS_TOOL_NAME} from "../lib/assessment-completion.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const clause = "The full menu page copy must include the literal phrase Updated daily";
const owner = '<p class="eyebrow-rule">Updated daily</p>';
const html = (body: string, dynamic = true) => `<!doctype html><html><head><title>Controlled literal</title>${dynamic ? '<link rel="stylesheet" href="missing.css"><script src="missing.js"></script>' : ""}</head><body>${body}</body></html>`;
function fixture(options: {mixed?: boolean; dynamic?: boolean; source?: string; price?: number; manual?: boolean} = {}): ProofQuote {
  const source = options.source ?? clause, unit = summaryCoverageUnits(source)[0], price = options.price ?? 1800;
  const criterionId = "coverage-1";
  const expected: ProofBusinessExpected[] = [{kind: "visible_copy", text: "Updated daily"}, ...(options.mixed ? [{kind: "item_price" as const, label: "Tea", currency: "AUD" as const, amountMinor: price}] : [])];
  const project: EvaluationProject = {id: "controlled-positive-literal", stratum: "boundary", language: "en", title: "Finite literal source test", summary: source, requiredPages: ["index.html", "menu.html"],
    files: {"index.html": html("<p>Home</p>", false), "menu.html": html(`${owner}<p>Tea AUD 19</p>`, options.dynamic)},
    criteria: [...(options.manual ? [{id: "manual-1", title: "Manual requirement 1", source, reference: {expectedStatus: "supported" as const, rationale: "Controlled authoritative failure only.", relevantFiles: ["menu.html"], requiresSemanticReview: true as const}}] : []),
      {id: criterionId, title: "Original requirement 1", source, reference: {expectedStatus: "supported", rationale: "Controlled source behavior only; no live or browser score.", relevantFiles: ["menu.html"], requiresSemanticReview: true}}],
    businessChecks: {confirmed: true, items: expected.map((value, i) => ({id: `business-${i + 1}`, criterionId, file: "menu.html", source: {start: unit.start, end: unit.end, excerpt: unit.text}, expected: value}))}};
  return projectQuote(project);
}
async function run(q: ProofQuote, raw: ProofAssessmentItem["status"] = "supported", encoding: "v3" | "v2" | "legacy" = "v3", short = false) {
  const before = structuredClone(q); let requests = 0;
  const assess = encoding === "v3" ? assessDelivery : encoding === "v2" ? assessDeliveryCatalogReplay : assessDeliveryLegacyReplay;
  const report = await assess(q, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
    requests++;
    const packet = JSON.parse(JSON.parse(String(init!.body)).messages[1].content) as {criteria: {id: string}[]; citationCatalog?: AssessmentCitationCatalog};
    const excerpt = short ? "<title>Controlled literal</title>" : owner;
    const entry = packet.citationCatalog?.entries.find(e => e.file === "menu.html" && e.excerpt === excerpt);
    if (encoding !== "legacy") assert.ok(entry, `Controlled catalog entry missing for ${excerpt}`);
    const citations = encoding === "legacy" ? [{file: "menu.html", excerpt}] : encoding === "v2" ? [entry!.id]
      : {c1: entry!.id, c2: "", c3: "", c4: "", c5: "", c6: ""};
    const output = {...(packet.citationCatalog ? {catalogId: packet.citationCatalog.catalogId} : {}),
      items: packet.criteria.map(c => ({criterionId: c.id, status: raw, explanation: "Controlled raw prose: the menu refreshes daily and is visible to all visitors.", citations})), risks: [], limitations: ["Controlled provider response, zero network."]};
    return Response.json({choices: [{finish_reason: "tool_calls", message: {content: null, tool_calls: [{id: "controlled-literal", type: "function", function: {
      name: encoding === "v3" ? SOURCE_ASSESSMENT_SLOTS_TOOL_NAME : encoding === "v2" ? SOURCE_ASSESSMENT_CATALOG_TOOL_NAME : SOURCE_ASSESSMENT_TOOL_NAME,
      arguments: JSON.stringify(output)}}]}}]});
  });
  assert.equal(requests, 1); assert.deepEqual(q, before); return report;
}

test("active V3 supported keeps only canonical submitted-source fact and exact owner; no acceptance/payment mutation", async () => {
  const q = fixture(), report = await run(q), item = report.items[0];
  assert.equal(item.status, "supported"); assert.equal(item.evidenceNeed, undefined);
  assert.match(item.explanation, /submitted source copy only.*rendered visibility, actual updates and runtime behavior are unverified/u);
  assert.ok(!item.explanation.includes("refreshes daily"));
  assert.equal(item.citations.length, 1); assert.equal(item.citations[0].excerpt, owner);
  assert.equal(q.proof.delivery!.files!["menu.html"].slice(item.citations[0].start, item.citations[0].end), owner);
  assert.deepEqual(report.withheldRisks!.adjustedCriteria, []);
  assert.equal(q.proof.acceptedDeliveryId, undefined); assert.equal(q.proof.paymentState, "unfunded");
});

test("ordinary covered unchanged source receives the same bounded prose without a status bypass", async () => {
  const report = await run(fixture({dynamic: false})), item = report.items[0];
  assert.equal(item.status, "supported"); assert.equal(item.evidenceNeed, undefined);
  assert.match(item.explanation, /submitted source copy only.*actual updates and runtime behavior are unverified/u);
  assert.ok(!item.explanation.includes("refreshes daily")); assert.deepEqual(item.citations.map(c => c.excerpt), [owner]);
  assert.deepEqual(report.withheldRisks!.adjustedCriteria, []);
});

test("raw unknown is not promoted or falsely recorded as an adjusted item; raw changes stays unknown through the old gate", async () => {
  const unknown = await run(fixture(), "insufficient_evidence"), negative = await run(fixture(), "changes_suggested");
  assert.equal(unknown.items[0].status, "insufficient_evidence"); assert.equal(unknown.items[0].evidenceNeed?.reason, "model_unresolved");
  assert.match(unknown.items[0].explanation, /Controlled raw prose/u); assert.deepEqual(unknown.withheldRisks!.adjustedCriteria, []);
  assert.equal(negative.items[0].status, "insufficient_evidence"); assert.equal(negative.items[0].evidenceNeed?.reason, "source_ambiguity");
  assert.deepEqual(negative.withheldRisks!.adjustedCriteria, [{criterionId: "coverage-1", originalStatus: "changes_suggested", publishedStatus: "insufficient_evidence"}]);
});

test("failed server evidence retains priority over the complete positive literal witness", async () => {
  const q = fixture({manual: true}); q.proof.delivery!.evidence[0].finding = "fail";
  const item = (await run(q)).items[0]; assert.equal(item.status, "changes_suggested"); assert.equal(item.evidenceNeed, undefined);
  assert.match(item.explanation, /Server rules found a failed check/u); assert.ok(!item.explanation.includes("complete original source block"));
});

test("historical V2 and legacy exact same source/citation retain their old dynamic unknown result", async () => {
  for (const encoding of ["v2", "legacy"] as const) {
    const report = await run(fixture(), "supported", encoding), item = report.items[0];
    assert.equal(item.status, "insufficient_evidence", encoding); assert.match(item.explanation, /limited static simple-block/u);
    assert.equal(item.obligations, undefined); assert.equal(item.evidenceNeed, undefined);
  }
});

test("mixed typed checks cannot borrow the literal exemption; missing full owner citation cannot qualify", async () => {
  for (const [q, short] of [[fixture({mixed: true}), false], [fixture(), true]] as const) {
    const item = (await run(q, "supported", "v3", short)).items[0];
    assert.equal(item.status, "insufficient_evidence"); assert.equal(item.evidenceNeed?.reason, "source_ambiguity");
    assert.match(item.explanation, /limited static simple-block/u);
  }
});

test("a confirmed same-criterion price mismatch remains authoritative and owns the published citation", async () => {
  const item = (await run(fixture({mixed: true, dynamic: false, price: 1800}))).items[0];
  assert.equal(item.status, "changes_suggested"); assert.match(item.explanation, /AUD 18\.00.*AUD 19\.00/u);
  assert.deepEqual(item.citations.map(c => c.excerpt), ["<p>Tea AUD 19</p>"]);
});

test("a compound operation tail never inherits the source literal exemption", async () => {
  const q = fixture({source: `${clause} and email the owner`}), item = (await run(q)).items[0];
  assert.equal(item.status, "insufficient_evidence"); assert.ok(!item.explanation.includes("complete original source block"));
});
