import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import type {ProofAssessmentCitation, ProofBusinessCheckStep, ProofCriterion} from "../lib/contracts.ts";
import {createPositiveLiteralSourceWitnessCheck, positiveLiteralSourceWitnessExplanation} from "../lib/positive-literal-source-witness.ts";
import {createSourceBusinessEvidenceCheck} from "../lib/source-business-evidence.ts";
import {projectQuote} from "../scripts/run-project-assessment-evaluation.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {STATIC_RESOURCE_LIMITS} from "../lib/static-resources.ts";

const source = "The full menu page copy must include the literal phrase Updated daily";
const criterion: ProofCriterion = {id: "coverage-1", title: "Original requirement 1", source};
const html = (body: string, head = "") => `<!doctype html><html><head><title>Menu</title>${head}</head><body>${body}</body></html>`;
function plan(c = criterion, file = "menu.html", literal = "Updated daily"): ProofBusinessCheckStep[] {
  return [375, 900].map(viewportWidth => ({criterionId: c.id, file, source: {start: 0, end: c.source.length, excerpt: c.source},
    expected: {kind: "visible_copy", text: literal}, checkId: "business-1", stepId: `business:${viewportWidth}:business-1`, viewportWidth})) as ProofBusinessCheckStep[];
}
function cite(files: Record<string, string>, excerpt: string, file = "menu.html"): ProofAssessmentCitation {
  const start = files[file].indexOf(excerpt); assert.ok(start >= 0);
  return {file, start, end: start + excerpt.length, excerpt};
}
function evaluate(body: string, options: {head?: string; criteria?: ProofCriterion; steps?: ProofBusinessCheckStep[]; cited?: string; extra?: Record<string, string>} = {}) {
  const files = {"menu.html": html(body, options.head), ...options.extra};
  const check = createPositiveLiteralSourceWitnessCheck(files, options.steps ?? plan(options.criteria ?? criterion));
  return check(options.criteria ?? criterion, [cite(files, options.cited ?? body)]);
}

test("a locked complete original source owner is a positive source fact despite unrelated script and missing stylesheet", () => {
  const owner = '<p class="eyebrow-rule mb-4">Updated daily</p>', files = {"menu.html": html(owner,
    '<link rel="stylesheet" href="missing.css"><script src="missing.js"></script>')};
  const steps = plan(), before = structuredClone({files, steps}), exact = cite(files, owner);
  const old = createSourceBusinessEvidenceCheck(files, steps)(criterion.id);
  assert.equal(old.kind, "unknown"); assert.equal(old.checks[0].reason, "dynamic_or_unsupported_source");
  const result = createPositiveLiteralSourceWitnessCheck(files, steps)(criterion, [exact]);
  assert.equal(result.kind, "covered");
  if (result.kind !== "covered") return;
  assert.deepEqual(result.citation, exact); assert.equal(files[result.file as "menu.html"].slice(exact.start, exact.end), exact.excerpt);
  for (const language of ["en", "zh"] as const) {
    const text = positiveLiteralSourceWitnessExplanation(result, language);
    assert.ok(text.length <= 600); assert.ok(text.includes("Updated daily")); assert.ok(text.includes("menu.html"));
    assert.match(text, language === "en" ? /source copy only.*visibility, actual updates and runtime behavior are unverified/u : /只确认已提交源码.*可见性.*实际更新.*未验证/u);
  }
  assert.deepEqual({files, steps}, before);
});

test("the actual retained Tavola source and production typed plan satisfy only this bounded source witness", async () => {
  const corpus = JSON.parse(await readFile(new URL("../scripts/project-assessment-corpus-citation-relations-holdout.json", import.meta.url), "utf8"));
  const project = corpus.projects.find((p: {id: string}) => p.id === "citation-relations-holdout-tavola");
  const c = project.criteria.find((c: ProofCriterion) => c.id === "coverage-2"), q = projectQuote(project), steps = getBusinessCheckPlan(q);
  const owner = '<p class="eyebrow-rule mb-4">Updated daily</p>', exact = cite(project.files, owner);
  assert.deepEqual(exact, {file: "menu.html", start: 3877, end: 3923, excerpt: owner});
  const check = createPositiveLiteralSourceWitnessCheck(project.files, steps);
  assert.equal(check(c, [exact]).kind, "covered");
  for (const id of ["coverage-1", "coverage-3"]) assert.notEqual(check(project.criteria.find((c: ProofCriterion) => c.id === id), [exact]).kind, "covered");
});

test("full-source grammar rejects operational, negative, conditional, compound, quoted and unfamiliar aliases", () => {
  for (const source of [
    `${criterion.source} at runtime`, `${criterion.source}. Prices must also update hourly`, `${criterion.source} and email the owner`,
    `${criterion.source} if available`, `${criterion.source} unless offline`, `${criterion.source} after submit`,
    'The full menu page copy must not include the literal phrase Updated daily',
    'The full menu page copy must include the literal phrase "Updated daily"',
    'The full menu page copy must include the literal phrase Updated daily.',
    'The homepage page copy must include the literal phrase Updated daily',
    'The checkout portal page copy must include the literal phrase Updated daily',
  ]) {
    const c = {...criterion, source};
    assert.notEqual(evaluate("<p>Updated daily</p>", {criteria: c}).kind, "covered", source);
  }
  for (const title of ["Actually email the owner", "Runtime delivery", "Mobile view at 375px"]) {
    const c = {...criterion, title}; assert.notEqual(evaluate("<p>Updated daily</p>", {criteria: c}).kind, "covered", title);
  }
});

test("all saved typed identity must match: no cross criterion, invented source, mixed family, repeated IDs or other file", () => {
  const good = plan();
  for (const steps of [[], good.map(s => ({...s, criterionId: "coverage-2"})), good.map(s => ({...s, file: "other.html"})),
    good.map(s => ({...s, source: {...s.source, excerpt: "Unrelated contract phrase"}})),
    good.map(s => ({...s, source: {...s.source, end: s.source.end + 1}})),
    good.map(s => ({...s, expected: {kind: "visible_copy" as const, text: "Other phrase"}})),
    [good[0], {...good[1], checkId: "business-2"}],
    [good[0], {...good[1], expected: {kind: "item_price" as const, label: "Tea", currency: "AUD" as const, amountMinor: 1800}}],
    [good[0], {...good[1], viewportWidth: 375 as const}],
  ]) assert.notEqual(evaluate("<p>Updated daily</p>", {steps}).kind, "covered", JSON.stringify(steps));
  const c = {...criterion, source: "The menu.html page copy must include the literal phrase Updated daily"};
  assert.equal(evaluate("<p>Updated daily</p>", {criteria: c}).kind, "covered");
  assert.notEqual(evaluate("<p>Updated daily</p>", {criteria: c, steps: plan(c, "index.html")}).kind, "covered");
});

test("inert, hidden, styled, foreign, dynamic owners/ancestors and reported parser repairs never become witnesses", () => {
  for (const body of [
    '<!-- <p>Updated daily</p> -->', '<script>"<p>Updated daily</p>"</script>', '<template><p>Updated daily</p></template>',
    '<noscript><p>Updated daily</p></noscript>', '<textarea><p>Updated daily</p></textarea>', '<iframe><p>Updated daily</p></iframe>',
    '<p title="Updated daily">Other copy</p>', '<p>Updated <b>daily</b></p>', '<p>Updated<!-- comment --> daily</p>',
    '<p hidden>Updated daily</p>', '<div inert><p>Updated daily</p></div>', '<p aria-hidden="true">Updated daily</p>',
    '<div class="d-none"><p>Updated daily</p></div>', '<p style="display:block">Updated daily</p>',
    '<div style="color:red"><p>Updated daily</p></div>', '<div contenteditable><p>Updated daily</p></div>',
    '<div onclick="go()"><p>Updated daily</p></div>', '<p data-bind="copy">Updated daily</p>',
    '<div x-data="copy"><p>Updated daily</p></div>', '<div v-if="copy"><p>Updated daily</p></div>',
    '<svg><foreignObject><p>Updated daily</p></foreignObject></svg>', '<table><p>Updated daily</p></table>', '<p>Updated daily',
  ]) assert.notEqual(evaluate(body).kind, "covered", body);
  assert.notEqual(evaluate("<p>Other text</p>", {head: "<title>Updated daily</title>"}).kind, "covered");
});

test("an explicit complete owner can establish only source text despite an unrelated unclosed ancestor", () => {
  for (const body of ["<div><p>Updated daily</p>", "<ul><li>Updated daily</li>", "<div><p>Updated daily</p></span></div>"]) {
    const files = {"menu.html": html(body)}, owner = body.includes("<li>") ? "<li>Updated daily</li>" : "<p>Updated daily</p>";
    const result = createPositiveLiteralSourceWitnessCheck(files, plan())(criterion, [cite(files, owner)]);
    assert.equal(result.kind, "covered", body); if (result.kind !== "covered") continue;
    assert.match(positiveLiteralSourceWitnessExplanation(result, "en"), /source copy only.*runtime behavior are unverified/u);
  }
});

test("same-file exact owner position is mandatory; substrings, broad windows and identical inert/other-file text fail", () => {
  const owner = "<p>Updated daily</p>", body = `<div>${owner}</div><template>${owner}</template>`, files = {"menu.html": html(body), "other.html": html(owner)};
  const check = createPositiveLiteralSourceWitnessCheck(files, plan());
  assert.equal(check(criterion, [cite(files, owner)]).kind, "covered");
  for (const c of [cite(files, "Updated daily"), cite(files, `<div>${owner}</div>`), cite(files, owner, "other.html"),
    {...cite(files, owner), start: files["menu.html"].lastIndexOf(owner), end: files["menu.html"].lastIndexOf(owner) + owner.length},
    {...cite(files, owner), excerpt: "<p>Updated  daily</p>"},
  ]) assert.notEqual(check(criterion, [c]).kind, "covered", JSON.stringify(c));
  assert.notEqual(check(criterion, []).kind, "covered");
});

test("literal identity is exact, with no entity, NBSP, case or internal-whitespace equivalence", () => {
  for (const body of ["<p>Updated&#32;daily</p>", "<p>Updated&nbsp;daily</p>", "<p>Updated\u00a0daily</p>",
    "<p>updated daily</p>", "<p>Updated  daily</p>", "<p>Updated\ndaily</p>", "<p>Not Updated daily</p>", "<p>Updated daily.</p>",
    "<p>Updated daily</p><p>Updated daily</p>", "<p>Updated daily</p><span>Updated daily</span>",
    "<p>Updated daily</p><p>Updated daily at noon.</p>"])
    assert.notEqual(evaluate(body).kind, "covered", body);
  assert.equal(evaluate("<li>Updated daily</li>").kind, "covered");
});

test("source budgets, long owners and snapshot mutation fail closed without changing other fields", () => {
  const owner = "<p>Updated daily</p>", files = {"menu.html": html(owner)}, steps = plan(), check = createPositiveLiteralSourceWitnessCheck(files, steps);
  const exact = cite(files, owner); files["menu.html"] = html("<p>Other</p>"); steps[0].expected = {kind: "visible_copy", text: "Other"};
  assert.equal(check(criterion, [exact]).kind, "covered");
  assert.notEqual(evaluate(`<p class="${"x".repeat(500)}">Updated daily</p>`).kind, "covered");
  assert.notEqual(evaluate(owner, {extra: {"large.css": "x".repeat(STATIC_RESOURCE_LIMITS.textTotalBytes)}}).kind, "covered");
  assert.notEqual(evaluate(owner, {head: `<!--${"x".repeat(STATIC_RESOURCE_LIMITS.textFileBytes)}-->`}).kind, "covered");
});

test("long eligible filename/literal keep exact identities and canonical prose within600 UTF16", () => {
  const file = `${"a".repeat(50)}/${"b".repeat(50)}/${"c".repeat(53)}.html`, literal = "A".repeat(120), c = {...criterion, source: `The full menu page copy must include the literal phrase ${literal}`};
  const files = {[file]: html(`<p>${literal}</p>`)}, result = createPositiveLiteralSourceWitnessCheck(files, plan(c, file, literal))(c, [cite(files, `<p>${literal}</p>`, file)]);
  assert.equal(result.kind, "covered"); if (result.kind !== "covered") return;
  assert.equal(result.file, file); assert.equal(result.citation.file, file);
  for (const language of ["en", "zh"] as const) assert.ok(positiveLiteralSourceWitnessExplanation(result, language).length <= 600);
});
