import assert from "node:assert/strict";
import test from "node:test";
import {assessDeliveryLegacyReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";
import {parseStaticProject, createUploadedDelivery} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import type {ProofQuote} from "../lib/contracts.ts";

const TITLE = "Man must explore and this is exploration at its greatest", ACTUAL = "Man must explore, and this is exploration at its greatest";
const SOURCE = `The post page content must contain the article title ${TITLE}`;
const H1 = `<h1>${ACTUAL}</h1>`, html = (body: string) => `<!doctype html><html><head><title>Source fixture</title></head><body>${body}</body></html>`;
type Citation = {file: string; excerpt: string};
function fixture(source = SOURCE, body = H1, extra: Record<string, string> = {}): ProofQuote {
  const p: EvaluationProject = {id: "controlled-article-punctuation", stratum: "boundary", language: "en", title: "Controlled article source", summary: "Inspect the article title source only.",
    files: {"index.html": html("<p>Controlled home</p>"), "post.html": html(body), "site.css": "h1{font-family:serif}", ...extra},
    criteria: [{id: "manual-1", title: "Manual requirement 1", source, reference: {expectedStatus: "supported", rationale: "Controlled report transport, not a new model or reference score.", relevantFiles: ["post.html"], requiresSemanticReview: true}}]};
  return projectQuote(p);
}
async function run(q: ProofQuote, status = "changes_suggested", quotes: Citation[] = [{file: "post.html", excerpt: H1}]) {
  const before = structuredClone(q); let calls = 0;
  const raw = {items: q.proof.criteria.map(c => ({criterionId: c.id, status, explanation: "Controlled model modification request based on the cited source.", citations: quotes})),
    risks: [{title: "Controlled advisory concern", explanation: "This synthetic concern remains unchanged.", suggestion: "A person should inspect the original source.", citations: [quotes[0]]}], limitations: ["Controlled response; no actual model, browser or payment was run."]};
  const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-no-network"}, async () => {calls++; return Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify(raw)}}]});});
  assert.equal(calls, 1); assert.deepEqual(q, before); assert.equal(q.proof.paymentState, "unfunded");
  assert.equal(raw.items[0].status, status); assert.equal(report.risks[0].title, raw.risks[0].title);
  return report.items.find(i => i.criterionId === "manual-1" || i.criterionId === "coverage-1")!;
}

test("a sole ordinary and-comma difference cannot remain a definite article-content modification request", async () => {
  const item = await run(fixture()); assert.equal(item.status, "insufficient_evidence");
  assert.match(item.explanation, /comma|逗号/iu); assert.match(item.explanation, /not.*(?:establish|prove)|未.*证实/iu);
  assert.equal(item.citations[0].excerpt, H1);
});

test("the negative guard never promotes a raw supported or unknown result", async () => {
  for (const status of ["supported", "insufficient_evidence"]) assert.equal((await run(fixture(), status)).status, status);
});

test("different words, case, additional punctuation or numeric titles keep their modification advice", async () => {
  for (const text of [ACTUAL.replace("explore", "travel"), ACTUAL.replace("Man", "man"), ACTUAL.replace("greatest", "greatest!"), `${ACTUAL} 2`]) {
    const h1 = `<h1>${text}</h1>`, item = await run(fixture(SOURCE, h1), "changes_suggested", [{file: "post.html", excerpt: h1}]);
    assert.equal(item.status, "changes_suggested", text);
  }
});

test("explicit exact wording, quoted title text and non-neutral titles are outside this allowance", async () => {
  for (const source of [SOURCE.replace("the article title", "the exact article title"), SOURCE.replace("the article title", "the verbatim article title"), SOURCE.replace(TITLE, `"${TITLE}"`)])
    assert.equal((await run(fixture(source))).status, "changes_suggested", source);
  const q = fixture(); q.proof.criteria[0].title = "Exact article title wording";
  assert.equal((await run(q)).status, "changes_suggested");
});

test("inline or entity headings and multiple h1 elements do not receive this bounded punctuation guard", async () => {
  for (const body of [H1.replace("Man", "<span>Man</span>"), H1.replace(",", "&#44;"), H1 + "<h1>Another heading</h1>"])
    assert.equal((await run(fixture(SOURCE, body), "changes_suggested", [{file: "post.html", excerpt: body.startsWith(H1) ? H1 : body}])).status, "changes_suggested");
});

test("wrong-page, ambiguous basename, partial and repeated quotations do not establish the bounded witness", async () => {
  assert.equal((await run(fixture(SOURCE, H1, {"about.html": html(H1)}), "changes_suggested", [{file: "about.html", excerpt: H1}])).status, "changes_suggested");
  assert.equal((await run(fixture(SOURCE, H1, {"nested/post.html": html(H1)}))).status, "changes_suggested");
  assert.equal((await run(fixture(), "changes_suggested", [{file: "post.html", excerpt: ACTUAL}])).status, "changes_suggested");
  assert.equal((await run(fixture(), "changes_suggested", [{file: "post.html", excerpt: H1}, {file: "post.html", excerpt: H1}])).status, "changes_suggested");
});

test("an appended runtime obligation and authoritative rule failure keep their existing precedence", async () => {
  assert.equal((await run(fixture(SOURCE + ". The form must actually submit and email the owner."))).status, "insufficient_evidence");
  const q = fixture(); q.proof.delivery!.evidence[0].finding = "fail";
  const item = await run(q); assert.equal(item.status, "changes_suggested"); assert.match(item.explanation, /Server rules/u);
});

test("a linked buyer-confirmed content check retains its stricter source uncertainty instead of the comma allowance", async () => {
  const q = fixture(), unit = summaryCoverageUnits(SOURCE)[0], at = "2026-11-05T00:00:00.000Z";
  const parsed = parseStaticProject({title: q.title, summary: SOURCE, amount: "1.00", requiredPages: ["index.html", "post.html"], manualRequirements: [],
    coverage: {version: 1, sourceText: SOURCE, confirmed: true, decisions: [{id: unit.id, disposition: "include"}]},
    businessChecks: {confirmed: true, items: [{id: "business-1", criterionId: unit.id, file: "post.html", source: {start: unit.start, end: unit.end, excerpt: unit.text}, expected: {kind: "visible_copy", text: TITLE}}]}}, "en");
  q.summary = SOURCE; q.proof.project = parsed.project; q.proof.criteria = parsed.criteria;
  q.proof.delivery = createUploadedDelivery(q.proof.delivery!.files!, parsed.project, "en", 1);
  q.proof.review = {deliveryId: q.proof.delivery.id, reviewedAt: at, mode: "demo", summary: "Controlled source-only fixture."};
  const item = await run(q);
  assert.equal(item.status, "insufficient_evidence");
  assert.match(item.explanation, /confirmed business checks/u);
  assert.doesNotMatch(item.explanation, /comma before/u);
});
