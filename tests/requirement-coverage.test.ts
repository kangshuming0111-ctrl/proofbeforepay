import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote } from "../lib/contracts.ts";
import { DomainError } from "../lib/domain.ts";
import { assertCoverageForAcceptance, confirmCoverage, coverageCriteria, summaryCoverageUnits, validateSavedCoverage } from "../lib/requirement-coverage.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";


const summary = "为墨尔本面馆制作手机友好的网站，展示菜单、营业时间、地址，提供可用的预约入口和中文英文切换。";
const at = "2026-11-02T00:00:00.000Z";
const request = (source = summary) => ({version: 1, sourceText: source.trim(), confirmed: true, decisions: summaryCoverageUnits(source).map(({id}) => ({id, disposition: "include"}))});
const invalid = (operation: () => unknown) => assert.throws(operation, DomainError);

test("literal requirement groups preserve every non-whitespace source character and exact UTF-16 spans", () => {
  for (const source of [summary, "Menu and hours.\nContact phone; bilingual pages, with a local link.", "  One original clause  ", "🙂".repeat(500), Array.from({length: 120}, (_, n) => `要求${n}，`).join("")]) {
    const normalized = source.trim(), units = summaryCoverageUnits(source);
    assert.ok(units.length > 0 && units.length <= 12);
    for (const unit of units) {
      assert.equal(unit.text, normalized.slice(unit.start, unit.end));
      assert.ok(unit.text.length <= 300);
      assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(unit.text));
    }
    [...normalized].forEach((character, index, chars) => {
      if (/\s/u.test(character)) return;
      const offset = chars.slice(0, index).join("").length;
      assert.ok(units.some(unit => unit.start <= offset && unit.end >= offset + character.length));
    });
  }
});

test("coverage confirmation derives its original spans, IDs, criteria and server timestamp", () => {
  const input = request(); input.decisions.reverse();
  const coverage = confirmCoverage(summary, input, at);
  assert.equal(coverage.confirmedAt, at);
  assert.deepEqual(coverage.decisions.map(({id}) => id), summaryCoverageUnits(summary).map(({id}) => id));
  assert.deepEqual(coverageCriteria(coverage, "zh").map(({source}) => source), coverage.decisions.map(({text}) => text));
  assert.deepEqual(validateSavedCoverage(JSON.parse(JSON.stringify(coverage))), coverage);
  assert.deepEqual(request().decisions[0], {id: "coverage-1", disposition: "include"});
});

test("missing, stale, duplicate, forged or unconfirmed coverage cannot become a new custom agreement", () => {
  const valid = request();
  const cases = [undefined, null, [], {}, {...valid, version: "1"}, {...valid, confirmed: false}, {...valid, confirmed: []}, {...valid, sourceText: `${summary}新要求`}, {...valid, extra: true},
    {...valid, decisions: valid.decisions.slice(1)}, {...valid, decisions: [...valid.decisions, valid.decisions[0]]},
    {...valid, decisions: valid.decisions.map((row, index) => index ? row : {...row, id: "foreign"})},
    {...valid, decisions: valid.decisions.map((row, index) => index ? row : {...row, disposition: "pass"})},
    {...valid, decisions: valid.decisions.map((row, index) => index ? row : {...row, start: 0, text: "forged", criterionId: "page-1"})},
    {...valid, decisions: valid.decisions.map((row, index) => index ? row : {...row, reason: "not an exclusion"})}];
  for (const value of cases) invalid(() => confirmCoverage(summary, value, at));
  invalid(() => parseStaticProject({title: "Cafe", summary, amount: "100", requiredPages: ["index.html"], manualRequirements: []}, "zh", {requireCoverage: true}));
  invalid(() => confirmCoverage(" ", valid));
  invalid(() => summaryCoverageUnits("x".repeat(1001)));
});

test("exclusions need explicit bounded reasons and never create a passing requirement", () => {
  const input = request();
  const first = input.decisions[0].id;
  const excluded = {...input, decisions: input.decisions.map(row => row.id === first ? {...row, disposition: "exclude", reason: "This is outside the agreed milestone."} : row)};
  const saved = confirmCoverage(summary, excluded, at);
  assert.equal(saved.decisions[0].disposition, "exclude");
  assert.equal(saved.decisions[0].criterionId, undefined);
  assert.ok(!coverageCriteria(saved, "en").some(item => item.id === first));
  for (const reason of [undefined, "", "   ", "x".repeat(301), "invalid\u0000reason", true]) invalid(() => confirmCoverage(summary, {...excluded, decisions: excluded.decisions.map(row => row.id === first ? {...row, reason} : row)}, at));
});

test("saved coverage cannot silently alter original spans, source, dispositions, criterion IDs or time", () => {
  const valid = confirmCoverage(summary, request(), at);
  const changes = [
    (saved: typeof valid) => {saved.decisions[0].text = "replacement";},
    (saved: typeof valid) => {saved.decisions[0].start++;},
    (saved: typeof valid) => {saved.decisions[0].criterionId = "page-1";},
    (saved: typeof valid) => {saved.decisions[0].disposition = "exclude";},
    (saved: typeof valid) => {saved.sourceText += "changed";},
    (saved: typeof valid) => {saved.confirmedAt = "invalid";},
    (saved: typeof valid) => {delete (saved as Partial<typeof valid>).confirmedAt;},
  ];
  for (const change of changes) {const saved = structuredClone(valid);change(saved);invalid(() => validateSavedCoverage(saved));}
});

function coveredQuote(): ProofQuote {
  const parsed = parseStaticProject({title: "Cafe website", summary, amount: "100", requiredPages: ["index.html"], manualRequirements: [], coverage: request()}, "zh", {requireCoverage: true});
  const delivery = createUploadedDelivery({"index.html": "<!doctype html><html><head><title>Hello</title></head><body><p>Hello</p></body></html>"}, parsed.project, "zh", 1);
  return {id: "coverage-test", reference: "PBP-COVERAGE", workflow: "proof-v1", title: parsed.title, summary, brief: summary,
    clientName: "Synthetic buyer", currency: "AUD", language: "zh", hourlyRateCents: parsed.totalCents, totalCents: parsed.totalCents,
    lineItems: [{id: "site", description: parsed.title, quantity: 1, unitPriceCents: parsed.totalCents}], timelineDays: 1, assumptions: [], questions: [],
    status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: at,
    proof: {project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery,
      review: {deliveryId: delivery.id, reviewedAt: at, mode: "demo", summary: "Saved source checked"},
      collaboration: {stage: "submitted", feedback: [], submission: {deliveryId: delivery.id, note: "Please review this version.", at}}}};
}

test("the Hello-page counterexample cannot be accepted by checking mobile alone", () => {
  const quote = coveredQuote();
  const checks = quote.proof.delivery!.evidence.filter(row => row.finding === "needs_human").map(row => row.criterionId);
  assert.ok(checks.length > 1);
  assert.ok(summaryCoverageUnits(summary).every(unit => checks.includes(unit.id)));
  assert.doesNotThrow(() => assertCoverageForAcceptance(quote));
  invalid(() => acceptDelivery(quote, {confirm: true, deliveryId: quote.proof.delivery!.id, manualChecks: ["mobile"]}, at));
  // A person still has final authority and may explicitly confirm all checks.
  assert.equal(acceptDelivery(quote, {confirm: true, deliveryId: quote.proof.delivery!.id, manualChecks: checks}, at).proof.collaboration?.stage, "accepted");
  assert.equal(quote.proof.collaboration?.stage, "submitted");
  assert.equal(quote.proof.paymentState, "unfunded");
});

test("coverage-aware acceptance rejects a missing criterion or an automatically passed original requirement", () => {
  const missing = coveredQuote(); missing.proof.criteria = missing.proof.criteria.filter(row => row.id !== "coverage-1");
  invalid(() => assertCoverageForAcceptance(missing));
  const passed = coveredQuote(); passed.proof.delivery!.evidence.find(row => row.criterionId === "coverage-1")!.finding = "pass";
  invalid(() => assertCoverageForAcceptance(passed));
  const stale = coveredQuote(); stale.summary += "New request"; invalid(() => assertCoverageForAcceptance(stale));
  const legacy = coveredQuote(); delete legacy.proof.project!.coverage; assert.doesNotThrow(() => assertCoverageForAcceptance(legacy));
});
