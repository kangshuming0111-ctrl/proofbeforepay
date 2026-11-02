import assert from "node:assert/strict";
import test from "node:test";
import type { ProofBusinessCheck, ProofBusinessCheckReading, ProofBusinessExpected, ProofQuote } from "../lib/contracts.ts";
import { DomainError } from "../lib/domain.ts";
import { createBusinessCheckReport, evaluateBusinessBlocks, getBusinessCheckPlan, parseBusinessChecks, validateSavedBusinessChecks } from "../lib/business-checks.ts";
import { confirmCoverage, summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";

const now = "2026-11-02T00:00:00.000Z";
const summary = "Display Beef noodles AUD 18.00 on both menu pages; Display phone +61 3 1234 5678; Include opening hours Monday-Friday 11:00-20:00.";
const units = summaryCoverageUnits(summary);
const coverageInput = () => ({version: 1, sourceText: summary, confirmed: true, decisions: units.map(row => ({id: row.id, disposition: "include"}))});
const price: Extract<ProofBusinessExpected, {kind: "item_price"}> = {kind: "item_price", label: "Beef noodles", amountMinor: 1800, currency: "AUD"};
function checks(): ProofBusinessCheck[] {
  const source = (index: number) => ({start: units[index].start, end: units[index].end, excerpt: units[index].text});
  return [
    {id: "business-1", criterionId: units[0].id, file: "index.html", source: source(0), expected: {...price}},
    {id: "business-2", criterionId: units[0].id, file: "menu-zh.html", source: source(0), expected: {...price, kind: "item_price"}},
    {id: "business-3", criterionId: units[1].id, file: "index.html", source: source(1), expected: {kind: "visible_copy", text: "+61 3 1234 5678"}},
  ];
}
function project() {return {requiredPages: ["index.html", "menu-zh.html"], manualRequirements: [], coverage: confirmCoverage(summary, coverageInput(), now)};}
function quote(): ProofQuote {
  const parsed = parseStaticProject({title: "Noodle website", summary, amount: "1.00", requiredPages: project().requiredPages, coverage: coverageInput(), businessChecks: {confirmed: true, items: checks()}}, "en");
  const html = "<!doctype html><html><head><title>Menu</title></head><body><p>Beef noodles AUD 18.00</p><p>+61 3 1234 5678</p></body></html>";
  const delivery = createUploadedDelivery({"index.html": html, "menu-zh.html": html}, parsed.project, "en", 1);
  return {id: "business-test", reference: "PBP-BUSINESS", title: parsed.title, summary, brief: summary, clientName: "Synthetic", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100,
    lineItems: [{id: "test", description: "Synthetic", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: now, workflow: "proof-v1",
    proof: {project: parsed.project, criteria: parsed.criteria, delivery, paymentState: "unfunded", audit: [], review: {deliveryId: delivery.id, reviewedAt: now, mode: "demo", summary: "Controlled"}}};
}
function input(q: ProofQuote) {
  const readings: ProofBusinessCheckReading[] = getBusinessCheckPlan(q).map(step => ({stepId: step.stepId, status: "observed", blocks: step.expected.kind === "item_price" ? ["Beef noodles AUD 18.00"] : ["Phone: +61 3 1234 5678"]}));
  return {deliveryId: q.proof.delivery!.id, previousReportId: q.proof.delivery!.businessChecks?.id ?? null, readings};
}
const invalid = (operation: () => unknown) => assert.throws(operation, DomainError);

test("explicit business confirmation binds canonical IDs, required pages and exact original included spans", () => {
  const parsed = parseBusinessChecks({confirmed: true, items: checks()}, project());
  assert.deepEqual(parsed, checks());
  assert.deepEqual(validateSavedBusinessChecks(parsed, project()), parsed);
  parsed[0].expected = {kind: "visible_copy", text: "Changed"};
  assert.equal(checks()[0].expected.kind, "item_price");
  const unit = units[0], shorter = checks();
  shorter[0].source = {start: unit.start + 8, end: unit.end - 1, excerpt: summary.slice(unit.start + 8, unit.end - 1)};
  assert.deepEqual(parseBusinessChecks({confirmed: true, items: shorter}, project()), shorter);
});
test("static project creation persists independently confirmed business checks without replacing human coverage", () => {
  const q = quote();
  assert.deepEqual(q.proof.project!.businessChecks, checks());
  assert.ok(q.proof.delivery!.evidence.filter(row => row.criterionId.startsWith("coverage-")).every(row => row.finding === "needs_human"));
  const legacy = parseStaticProject({title: "Old project", summary: "A static website", amount: "1.00", requiredPages: ["index.html"]}, "en");
  assert.equal(legacy.project.businessChecks, undefined);
});
test("business expectations reject missing confirmation, unknown fields, malformed kinds, stale IDs and invalid paths", () => {
  for (const value of [undefined, null, [], {}, {confirmed: false, items: checks()}, {confirmed: true, items: checks(), outcome: "pass"}]) invalid(() => parseBusinessChecks(value, project()));
  for (const patch of [{id: "business-9"}, {criterionId: "manual-1"}, {file: "other.html"}, {file: "https://evil.test/a.html"}, {unexpected: true}]) {
    const rows = checks(); Object.assign(rows[0], patch); invalid(() => parseBusinessChecks({confirmed: true, items: rows}, project()));
  }
  invalid(() => parseBusinessChecks({confirmed: true, items: Array.from({length: 9}, (_, index) => ({...checks()[0], id: `business-${index + 1}`}))}, project()));
  for (const expected of [{kind: "visible_copy", text: "", label: "extra"}, {kind: "visible_copy", text: "x".repeat(161)}, {kind: "item_price", label: "x".repeat(81), currency: "AUD", amountMinor: 1}, {kind: "item_price", label: "x", currency: "EUR", amountMinor: 1}, {kind: "item_price", label: "x", currency: "AUD", amountMinor: 1.5}, {kind: "item_price", label: "x", currency: "AUD", amountMinor: -1}, {kind: "item_price", label: "x", currency: "AUD", amountMinor: Number.MAX_SAFE_INTEGER + 1}, {kind: "dynamic_form", text: "x"}]) {
    const rows = checks(); rows[0].expected = expected as ProofBusinessExpected; invalid(() => parseBusinessChecks({confirmed: true, items: rows}, project()));
  }
});
test("source provenance rejects shifted, forged, cross-criterion, stale saved and excluded coverage", () => {
  for (const source of [{...checks()[0].source, start: 1}, {...checks()[0].source, excerpt: "fabricated"}, checks()[2].source, {...checks()[0].source, end: 0}, {...checks()[0].source, start: 0.5}, {...checks()[0].source, extra: "forged"}]) {
    const rows = checks(); rows[0].source = source; invalid(() => parseBusinessChecks({confirmed: true, items: rows}, project()));
  }
  const p = project(); p.coverage.decisions[0].text = "Changed"; invalid(() => parseBusinessChecks({confirmed: true, items: checks()}, p));
  const excluded = coverageInput(); Object.assign(excluded.decisions[0], {disposition: "exclude", reason: "Separate order"});
  const p2 = {...project(), coverage: confirmCoverage(summary, excluded, now)}; invalid(() => parseBusinessChecks({confirmed: true, items: checks()}, p2));
  const p3 = project(); delete (p3 as {coverage?: unknown}).coverage; invalid(() => parseBusinessChecks({confirmed: true, items: checks()}, p3));
});
test("strict plain data records reject accessors, symbols and prototype-bearing objects without invoking them", () => {
  let accessed = false;
  const value = Object.defineProperty({confirmed: true}, "items", {enumerable: true, get() {accessed = true; return checks();}});
  invalid(() => parseBusinessChecks(value, project())); assert.equal(accessed, false);
  invalid(() => parseBusinessChecks({confirmed: true, items: checks(), [Symbol("extra")]: true}, project()));
  invalid(() => parseBusinessChecks(Object.create({confirmed: true, items: checks()}), project()));
});
test("literal copy normalizes NFKC, case and whitespace but not wording or containing words", () => {
  const expected: ProofBusinessExpected = {kind: "visible_copy", text: "Monday Friday 11:00"};
  assert.equal(evaluateBusinessBlocks(expected, ["Hours: ＭＯＮＤＡＹ\n FRIDAY 11:00"]).outcome, "expected_observation");
  assert.equal(evaluateBusinessBlocks(expected, ["Mon-Fri 11am"]).outcome, "mismatch");
  assert.equal(evaluateBusinessBlocks({kind: "visible_copy", text: "open"}, ["reopened"]).outcome, "mismatch");
  assert.equal(evaluateBusinessBlocks({kind: "visible_copy", text: "营业时间"}, ["我们的营业时间如下"]).outcome, "expected_observation");
  assert.equal(evaluateBusinessBlocks(expected, []).outcome, "mismatch");
});
test("price observation requires the label and correct exact cents/ISO currency together", () => {
  for (const block of ["Beef noodles AUD18", "Beef noodles AUD 18.0", "Beef noodles 18.00 AUD", "ＢＥＥＦ NOODLES ＡＵＤ １８．００", "Beef noodles AUD 18.00 per serving", "Beef noodles AUD 18.00.", "Beef noodles AUD 18.00, per serving"]) assert.equal(evaluateBusinessBlocks(price, [block]).outcome, "expected_observation", block);
  for (const block of ["Beef noodles AUD 118.00", "Beef noodles USD 18.00", "Beef noodles AUD 18.01", "Beef noodles AUD 0.18", "Beef noodles AUD 1800"]) assert.equal(evaluateBusinessBlocks(price, [block]).outcome, "mismatch", block);
  assert.equal(evaluateBusinessBlocks(price, ["Dessert AUD 18.00"]).outcome, "mismatch");
  assert.equal(evaluateBusinessBlocks(price, ["Beef noodles AUD16.00", "Dessert AUD18.00"]).outcome, "mismatch");
  assert.equal(evaluateBusinessBlocks({...price, kind: "item_price", label: "牛肉面"}, ["牛肉面AUD18.00"]).outcome, "expected_observation");
  assert.equal(evaluateBusinessBlocks({...price, kind: "item_price", label: "元气牛肉面"}, ["元气牛肉面 AUD 18"]).outcome, "expected_observation");
});
test("missing currency, unsupported number forms and conflicting label blocks abstain", () => {
  for (const block of ["Beef noodles $18.00", "Beef noodles 18.00", "Beef noodles AUD 18.000", "Beef noodles AUD -18", "Beef noodles AUD 018", "Beef noodles AUD 1,800", "Beef noodles CAD 18.00"]) assert.equal(evaluateBusinessBlocks(price, [block]).outcome, "unavailable", block);
  assert.equal(evaluateBusinessBlocks(price, ["Beef noodles", "AUD 18.00"]).outcome, "unavailable");
  assert.equal(evaluateBusinessBlocks(price, ["Beef noodles AUD 18.00", "Beef noodles AUD 28.00"]).outcome, "unavailable");
  assert.equal(evaluateBusinessBlocks(price, ["Beef noodles AUD 18.00 USD 18.00"]).outcome, "unavailable");
  for (const block of ["Beef noodles AUD18 ($28)", "Beef noodles AUD18 / EUR28", "Beef noodles AUD18 / 28GBP", "Beef noodles AUD18 and AUD ?", "Beef noodles AUD18 / AUD 1,800", "Beef noodles AUD18 / AUD 18.000"]) assert.equal(evaluateBusinessBlocks(price, [block]).outcome, "unavailable", block);
  for (const block of ["牛肉面 28元 AUD 18", "牛肉面 人民币28 AUD18", "牛肉面 USD18 日元28", "牛肉面 AUD18 28港元", "牛肉面 28欧元 AUD18", "牛肉面 28澳元 AUD18", "牛肉面 AUD18 28美元", "牛肉面 28圆 AUD18", "牛肉面 28圓 AUD18", "牛肉面 RMB18 AUD18", "牛肉面 CNY18 AUD18"]) assert.equal(evaluateBusinessBlocks({...price, kind: "item_price", label: "牛肉面"}, [block]).outcome, "unavailable", block);
  assert.equal(evaluateBusinessBlocks(price, ["Beef noodles AUD 18.00", "Beef noodles AUD 18.00"]).outcome, "expected_observation");
});
test("business plan derives both viewports and immutable source/expected rows from the saved scope", () => {
  const q = quote(), before = structuredClone(q), plan = getBusinessCheckPlan(q);
  assert.equal(plan.length, 6);
  assert.deepEqual(plan.map(row => row.stepId), ["business:375:business-1", "business:900:business-1", "business:375:business-2", "business:900:business-2", "business:375:business-3", "business:900:business-3"]);
  plan[0].source.excerpt = "Changed"; assert.deepEqual(q, before);
  q.proof.criteria = q.proof.criteria.filter(row => row.id !== "coverage-1"); invalid(() => getBusinessCheckPlan(q));
  const changed = quote(); changed.summary += " Changed"; invalid(() => getBusinessCheckPlan(changed));
  const legacy = quote(); delete legacy.proof.project!.businessChecks; assert.deepEqual(getBusinessCheckPlan(legacy), []);
});
test("server report derives complete ordered expectations/outcomes and never accepts or mutates the project", () => {
  const q = quote(), value = input(q), before = structuredClone(q), payload = structuredClone(value);
  value.readings.reverse();
  const report = createBusinessCheckReport(q, value, now);
  assert.deepEqual(report.summary, {steps: 6, observed: 6, issues: 0, unavailable: 0});
  assert.equal(report.method, "client-business-content-v1"); assert.equal(report.deliveryId, q.proof.delivery!.id);
  assert.equal(report.readings[0].expected.kind, "item_price"); assert.equal(report.readings[0].stepId, payload.readings[0].stepId);
  assert.ok(report.readings.every(row => row.explanation && row.outcome === "expected_observation"));
  assert.deepEqual(q, before); assert.equal(q.proof.acceptedAt, undefined); assert.equal(q.proof.paymentState, "unfunded");
});
test("report summary distinguishes observed mismatch, server-derived ambiguity and browser unavailability", () => {
  const q = quote(), value = input(q);
  value.readings[0] = {stepId: value.readings[0].stepId, status: "observed", blocks: ["Beef noodles AUD 28.00"]};
  value.readings[1] = {stepId: value.readings[1].stepId, status: "observed", blocks: ["Beef noodles $18.00"]};
  value.readings[2] = {stepId: value.readings[2].stepId, status: "unavailable", reason: "text_limit"};
  assert.deepEqual(createBusinessCheckReport(q, value, now).summary, {steps: 6, observed: 5, issues: 1, unavailable: 2});
});
test("report rejects stale delivery/CAS, incomplete/duplicate/forged steps and client outcomes", () => {
  const q = quote(), value = input(q);
  invalid(() => createBusinessCheckReport(q, {...value, deliveryId: "old"}));
  invalid(() => createBusinessCheckReport(q, {...value, previousReportId: "old"}));
  const missing = {...value} as Record<string, unknown>; delete missing.previousReportId; invalid(() => createBusinessCheckReport(q, missing));
  invalid(() => createBusinessCheckReport(q, {...value, readings: value.readings.slice(1)}));
  invalid(() => createBusinessCheckReport(q, {...value, readings: [value.readings[0], ...value.readings.slice(0, -1)]}));
  invalid(() => createBusinessCheckReport(q, {...value, readings: [{...value.readings[0], expected: price}, ...value.readings.slice(1)]}));
  invalid(() => createBusinessCheckReport(q, {...value, readings: [{...value.readings[0], outcome: "expected_observation"}, ...value.readings.slice(1)]}));
  invalid(() => createBusinessCheckReport(q, value, "invalid date"));
  q.proof.delivery!.businessChecks = createBusinessCheckReport(q, value, now); invalid(() => createBusinessCheckReport(q, value, now));
  assert.equal(createBusinessCheckReport(q, input(q), now).summary.steps, 6);
});
test("visible blocks enforce count/text bounds, strict field/status types and required page presence", () => {
  const q = quote();
  for (const blocks of [null, "Beef noodles AUD18.00", Array(13).fill("x"), ["x".repeat(301)], [""], [18], ["bad\u0000text"], ["\ud800"]]) {
    const value = input(q); value.readings[0] = {...value.readings[0], blocks} as ProofBusinessCheckReading; invalid(() => createBusinessCheckReport(q, value));
  }
  const unknown = input(q); unknown.readings[0] = {stepId: unknown.readings[0].stepId, status: "unavailable", reason: "forged"} as unknown as ProofBusinessCheckReading; invalid(() => createBusinessCheckReport(q, unknown));
  delete q.proof.delivery!.files!["menu-zh.html"]; invalid(() => createBusinessCheckReport(q, input(q)));
  const missing = input(q); missing.readings = missing.readings.map(row => row.stepId.endsWith("business-2") ? {stepId: row.stepId, status: "unavailable", reason: "missing_file"} : row);
  assert.equal(createBusinessCheckReport(q, missing, now).summary.unavailable, 2);
});
