import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import type {ProofBusinessCheckStep, ProofCriterion} from "../lib/contracts.ts";
import {criterionOwnSourceTargetHint, checkSourceTargetAssertion} from "../lib/assessment-source-target.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const files = {"index.html": "<form>Contact page content</form>", "contact.html": "<p>Copyright only</p>"};
const criterion = (source: string): ProofCriterion => ({id: "coverage-1", title: "Original requirement 1", source});
const labels = criterion('Contact source labels must include "Name:" and "E-mail:" and "Message:".');
const assertion = "The form has one label, but the check targets index.html.";
const noOp = {kind: "not_applicable"};

test("a matching source basename is only a hint, including when it is the wrong business page", () => {
  const before = structuredClone(files), hint = criterionOwnSourceTargetHint(labels, files);
  assert.equal(hint.basis, "alias_hint_only"); assert.deepEqual(hint.candidateFiles, ["contact.html"]); assert.deepEqual(hint.establishedFiles, []);
  const result = checkSourceTargetAssertion(labels, assertion, files);
  assert.equal(result.kind, "unestablished");
  assert.deepEqual(result.establishedFiles, []); assert.deepEqual(result.candidateFiles, ["contact.html", "index.html"]);
  assert.deepEqual(files, before);
});

test("only an explicit own-source file or validated locked business file establishes the assertion target", () => {
  const c = criterion("The page content in index.html must include the business name.");
  assert.deepEqual(criterionOwnSourceTargetHint(c, files), {basis: "explicit_own_source_file", establishedFiles: ["index.html"], candidateFiles: ["index.html"]});
  assert.deepEqual(checkSourceTargetAssertion(c, "The check targets index.html.", files), noOp);
  assert.equal(checkSourceTargetAssertion(c, "The check targets contact.html.", files).kind, "contradicted");
  const steps = [{criterionId: c.id, file: "contact.html"}] as ProofBusinessCheckStep[];
  assert.equal(criterionOwnSourceTargetHint(c, files, steps).basis, "conflicting_explicit_and_locked");
  for (const target of ["contact.html", "index.html"])
    assert.equal(checkSourceTargetAssertion(c, `The check targets ${target}.`, files, steps).kind, "conflicting_scope", "neither side wins a contradictory saved scope");
  const consistent = [{criterionId: c.id, file: "index.html"}] as ProofBusinessCheckStep[];
  assert.equal(criterionOwnSourceTargetHint(c, files, consistent).basis, "locked_business_files");
  assert.deepEqual(checkSourceTargetAssertion(c, "The check targets index.html.", files, consistent), noOp);
  assert.equal(checkSourceTargetAssertion(c, "The check targets contact.html.", files, consistent).kind, "contradicted");
});

test("ambiguous basenames and unrecognised role names never become automatic mappings", () => {
  const duplicate = {"en/contact.html": "<form>One</form>", "fr/contact.html": "<form>Two</form>"};
  const hint = criterionOwnSourceTargetHint(labels, duplicate);
  assert.deepEqual(hint.establishedFiles, []); assert.deepEqual(hint.candidateFiles, ["en/contact.html", "fr/contact.html"]);
  const result = checkSourceTargetAssertion(labels, "The check targets en/contact.html.", duplicate);
  assert.equal(result.kind, "unestablished");
  assert.equal(criterionOwnSourceTargetHint(criterion("The contact experience needs more information."), files).basis, "unspecified");
});

test("supported explicit Chinese prefixes and English keyword case preserve the exact target filename", () => {
  for (const source of ["index.html 必须显示电话。", "index.html应显示电话。", "网页 index.html 的文案须注明电话。", "the page content in index.html must include the business name."]) {
    const c = criterion(source);
    assert.deepEqual(criterionOwnSourceTargetHint(c, files).establishedFiles, ["index.html"], source);
    assert.deepEqual(checkSourceTargetAssertion(c, "本项检查目标页面是 index.html。", files), noOp, source);
    assert.equal(checkSourceTargetAssertion(c, "本项检查目标页面是 contact.html。", files).kind, "contradicted", source);
  }
  const c = criterion("the page content in Index.html must include the business name.");
  assert.deepEqual(criterionOwnSourceTargetHint(c, files).establishedFiles, ["Index.html"]);
  assert.equal(checkSourceTargetAssertion(c, "The check targets index.html.", files).kind, "contradicted", "source filename case must not be normalised");
  const quoted = criterion('index.html应显示文字“contact.html”。');
  assert.deepEqual(criterionOwnSourceTargetHint(quoted, files).establishedFiles, ["index.html"]);
  assert.deepEqual(checkSourceTargetAssertion(quoted, "本项要求的目标页面是 index.html。", files), noOp);
});

test("unrelated Chinese words do not masquerade as conditional scope while actual conditional clauses still skip", () => {
  for (const source of ["index.html应显示若干联系方式。", "index.html应显示若茶店的电话。", "index.html应显示不可能咖啡馆的电话。"])
    assert.equal(checkSourceTargetAssertion(criterion(source), "本项检查目标页面是 contact.html。", files).kind, "contradicted", source);
  const c = criterion("index.html应显示电话。");
  assert.equal(checkSourceTargetAssertion(c, "本项检查目标页面是 contact.html。页面包含若干字段。", files).kind, "contradicted");
  for (const explanation of ["如果本项检查目标页面是 contact.html，应先核对。", "若本项检查目标页面是 contact.html，应先核对。", "是否本项检查目标页面是 contact.html？", "可能本项检查目标页面是 contact.html。"])
    assert.deepEqual(checkSourceTargetAssertion(c, explanation, files), noOp, explanation);
});

test("global or multiple-page requirements, quoted data and conditional questions are not arbitrarily narrowed", () => {
  for (const source of ["Every page must contain contact labels.", "Both forms must contain the labels.", "The page content in index.html and contact.html must include the business name."])
    assert.deepEqual(checkSourceTargetAssertion(criterion(source), assertion, files), noOp);
  const quoted = criterion('index.html must show text "contact.html".');
  assert.deepEqual(criterionOwnSourceTargetHint(quoted, files).establishedFiles, ["index.html"]);
  assert.deepEqual(checkSourceTargetAssertion(quoted, "The check targets index.html.", files), noOp);
  for (const explanation of ["If the check targets index.html, inspect its form.", "Confirm whether the check targets index.html.", "The check targets index.html?", 'The source contains "the check targets index.html" as text.', "The requirement does not target index.html."])
    assert.deepEqual(checkSourceTargetAssertion(labels, explanation, files), noOp, explanation);
});

test("cross-page comparison alone is not a target assertion; Chinese direct assertions remain bounded", () => {
  assert.deepEqual(checkSourceTargetAssertion(labels, "The other page contains the label, while contact.html has only two labels.", files), noOp);
  assert.equal(checkSourceTargetAssertion(labels, "本项要求的目标页面是 index.html。", files).kind, "unestablished");
  assert.deepEqual(checkSourceTargetAssertion(labels, "如果本项要求的目标页面是 index.html，应先核对。", files), noOp);
  const c = criterion("The page content in index.html must include the shop name.");
  const steps = [{criterionId: c.id, file: "index.html"}, {criterionId: c.id, file: "contact.html"}] as ProofBusinessCheckStep[];
  assert.deepEqual(checkSourceTargetAssertion(c, "The check targets index.html.", files, steps), noOp);
});

test("the retained actual wrong-page response now publishes unresolved scope and withholds its original risk without changing source or other items", async () => {
  const context = JSON.parse(await readFile(new URL("./fixtures/three-gaps-cycle34-scope-context.json", import.meta.url), "utf8"));
  const observed = context.observed, sources = observed.criterionSources as ProofCriterion[];
  const project: EvaluationProject = {id: "mdn-derived-cross-page-label", stratum: "mismatch", language: "en", title: "Retained known source-scope failure", summary: sources.map(c => c.source).join("\n"),
    files: observed.files, requiredPages: ["index.html", "contact.html"], criteria: sources.map((c, i) => ({...c,
      reference: {expectedStatus: i === 0 ? "changes_suggested" : "supported", rationale: "Retained sealed source references; publication guard intentionally leaves unsupported scope unresolved, not a new model judgment.", relevantFiles: ["contact.html", "index.html"], requiresSemanticReview: true}}))};
  const quote = projectQuote(project), before = structuredClone(quote), raw = structuredClone(observed.wrongSourceScopeRaw), original = structuredClone(raw); let calls = 0;
  const report = await assessDelivery(quote, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
    calls++; const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
    assert.equal(packet.citationCatalog.catalogId, raw.catalogId, "retained response must bind the same actual source catalog, not rewritten IDs");
    assert.match(request.messages[0].content, /Never inherit a page, file, form or owner from an adjacent criterion/u);
    return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: request.tools[0].function.name, arguments: JSON.stringify(raw)}}]}}]});
  });
  assert.equal(calls, 1); assert.deepEqual(quote, before); assert.deepEqual(raw, original);
  const first = report.items[0], second = report.items[1];
  assert.equal(first.status, "insufficient_evidence"); assert.equal(first.evidenceNeed?.reason, "requirement_clarification");
  assert.deepEqual(first.evidenceNeed?.targetFiles, ["contact.html", "index.html"]);
  assert.match(first.explanation, /only a search hint/u); assert.doesNotMatch(first.explanation, /add Name|all three labels/u);
  assert.equal(second.status, "supported");
  assert.deepEqual(report.withheldRisks?.adjustedCriteria, [{criterionId: "coverage-1", originalStatus: "changes_suggested", publishedStatus: "insufficient_evidence"}]);
  assert.equal(report.risks.length, 0); assert.equal(report.withheldRisks?.reason, "item_status_adjusted");
  assert.equal(report.withheldRisks?.entries[0].risk.suggestion, original.risks[0].suggestion);
  assert.ok(first.citations.length > 0); for (const citation of first.citations) assert.equal(project.files[citation.file].slice(citation.start, citation.end), citation.excerpt);
  assert.equal(quote.proof.paymentState, "unfunded"); assert.equal(quote.proof.acceptedAt, undefined);
});
