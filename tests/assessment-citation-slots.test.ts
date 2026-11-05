import assert from "node:assert/strict";
import test from "node:test";
import {assessmentCatalogToolDefinition, assessmentCompletionText, assessmentSlotsToolDefinition, SOURCE_ASSESSMENT_CATALOG_TOOL_NAME, SOURCE_ASSESSMENT_SLOTS_TOOL_NAME, SOURCE_ASSESSMENT_TOOL_NAME} from "../lib/assessment-completion.ts";
import {assessmentCitationSelection, assessmentItemsForValidation} from "../lib/assessment-citation-selection.ts";
import {resolveCatalogCitations} from "../lib/assessment-citation-catalog.ts";
import {AssessmentResponseError, requireAssessmentItemCoverage} from "../lib/assessment-response.ts";

const catalog = {version: "source-citation-catalog-v1" as const, catalogId: "a".repeat(64), entries: [
  {id: "s1", file: "index.html", start: 0, end: 12, excerpt: "<p>Alpha</p>"},
  {id: "s2", file: "menu.html", start: 20, end: 31, excerpt: "<p>Beta</p>"},
]};
const slots = (ids: string[], maximum = 6) => Object.fromEntries(Array.from({length: maximum}, (_, index) => [`c${index + 1}`, ids[index] ?? ""]));
const reason = (expected: string) => (error: unknown) => error instanceof AssessmentResponseError && error.reason === expected;
const strict = (name: string, argumentsText = "{}") => ({choices: [{finish_reason: "tool_calls", message: {tool_calls: [
  {type: "function", function: {name, arguments: argumentsText}},
]}}]});

test("V3 strict schema bounds item citations to six named slots and risk citations to three", () => {
  const tool = assessmentSlotsToolDefinition(["manual-1", "manual-2"], catalog), parameters = tool.function.parameters;
  assert.equal(tool.function.name, SOURCE_ASSESSMENT_SLOTS_TOOL_NAME); assert.equal(tool.function.strict, true);
  const item = parameters.properties.items.items, risk = parameters.properties.risks.items;
  const itemSlots = item.properties.citations, riskSlots = risk.properties.citations;
  assert.equal(itemSlots.type, "object"); assert.equal(riskSlots.type, "object");
  assert.deepEqual(itemSlots.required, ["c1", "c2", "c3", "c4", "c5", "c6"]);
  assert.deepEqual(riskSlots.required, ["c1", "c2", "c3"]);
  assert.equal(itemSlots.additionalProperties, false); assert.equal(riskSlots.additionalProperties, false);
  for (const field of Object.values(itemSlots.properties)) {assert.equal(field.type, "string"); assert.deepEqual(field.enum, ["", "s1", "s2"]);}
  assert.deepEqual(riskSlots.properties.c1.enum, ["s1", "s2"]);
  for (const name of ["c2", "c3"]) assert.deepEqual(riskSlots.properties[name].enum, ["", "s1", "s2"]);
  assert.deepEqual(parameters.properties.catalogId.enum, [catalog.catalogId]);
  assert.deepEqual(item.properties.criterionId.enum, ["manual-1", "manual-2"]);
  const pending: unknown[] = [tool];
  while (pending.length) {
    const value = pending.pop(); if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    for (const unsupported of ["maxItems", "minItems", "maxLength", "minLength", "uniqueItems"]) assert.equal(Object.hasOwn(row, unsupported), false, unsupported);
    pending.push(...Object.values(row));
  }
  const v2 = assessmentCatalogToolDefinition(["manual-1"], catalog);
  assert.equal(v2.function.name, SOURCE_ASSESSMENT_CATALOG_TOOL_NAME);
  assert.equal(v2.function.parameters.properties.items.items.properties.citations.type, "array");
});

test("completion decoding requires the exact protocol tool and rejects catalog content fallback", () => {
  const text = '{"catalogId":"frozen","items":[]}';
  for (const [encoding, name] of [["catalog_slots", SOURCE_ASSESSMENT_SLOTS_TOOL_NAME], ["catalog_ids", SOURCE_ASSESSMENT_CATALOG_TOOL_NAME], ["legacy_quotes", SOURCE_ASSESSMENT_TOOL_NAME]] as const) {
    assert.deepEqual(assessmentCompletionText(strict(name, text), encoding), {text, transport: "strict_tool"});
    for (const wrong of [SOURCE_ASSESSMENT_SLOTS_TOOL_NAME, SOURCE_ASSESSMENT_CATALOG_TOOL_NAME, SOURCE_ASSESSMENT_TOOL_NAME].filter(candidate => candidate !== name))
      assert.throws(() => assessmentCompletionText(strict(wrong, text), encoding), reason("structure"));
  }
  const legacy = {choices: [{finish_reason: "stop", message: {content: text}}]};
  for (const encoding of ["catalog_slots", "catalog_ids"] as const) assert.throws(() => assessmentCompletionText(legacy, encoding), reason("structure"));
  assert.deepEqual(assessmentCompletionText(legacy, "legacy_quotes"), {text, transport: "legacy_json"});
  assert.throws(() => assessmentCompletionText({choices: [{finish_reason: "length", message: null}]}, "catalog_slots"), reason("output_limit"));
});

test("V3 selector decoding preserves order, exact IDs and a trailing unused suffix without mutation", () => {
  for (const [ids, maximum] of [[[], 6], [["s1"], 6], [["s1", "s2"], 6], [["s2", "s1"], 3]] as [string[], number][]) {
    const value = slots(ids, maximum), before = structuredClone(value);
    assert.deepEqual(assessmentCitationSelection(value, maximum, "catalog_slots"), ids);
    assert.deepEqual(value, before);
  }
  const reordered = {c6: "", c5: "", c4: "", c3: "", c2: "s1", c1: "s2"};
  assert.deepEqual(assessmentCitationSelection(reordered, 6, "catalog_slots"), ["s2", "s1"]);
  const value = slots(["s1", "s2"]), ids = assessmentCitationSelection(value, 6, "catalog_slots");
  assert.deepEqual(resolveCatalogCitations(ids, catalog, 6), catalog.entries.map(({id: _id, ...citation}) => citation));
});

test("slots reject over-cap objects, old arrays, extra metadata, missing keys, nonstrings and gaps", () => {
  for (const [value, maximum] of [
    [slots(["s1"], 8), 6], [slots(["s1"], 4), 3], [["s1"], 6], [[], 6], [null, 6],
    [{...slots(["s1"]), metadata: "ignored"}, 6], [{c1: "s1"}, 6],
    [{...slots(["s1"]), c2: null}, 6], [{...slots(["s1"]), c2: 2}, 6],
    [{...slots([]), c2: "s1"}, 6], [{...slots(["s1"]), c3: "s2"}, 6],
    [slots(["s1"]), 0], [slots(["s1"]), 7], [slots(["s1"]), 3.5],
  ] as [unknown, number][]) assert.throws(() => assessmentCitationSelection(value, maximum, "catalog_slots"), reason("structure"));
  const accessor = slots(["s1"]); let read = false;
  Object.defineProperty(accessor, "c2", {enumerable: true, get() {read = true; return "s2";}});
  assert.throws(() => assessmentCitationSelection(accessor, 6, "catalog_slots"), reason("structure")); assert.equal(read, false);
  assert.throws(() => assessmentCitationSelection({...slots(["s1"]), [Symbol("extra")]: "s2"}, 6, "catalog_slots"), reason("structure"));
});

test("duplicate selectors are citation failures and unknown IDs remain for the exact resolver", () => {
  assert.throws(() => assessmentCitationSelection(slots(["s1", "s1"]), 6, "catalog_slots"), reason("citation"));
  assert.throws(() => assessmentCitationSelection(slots(["s1", "", "s1"]), 6, "catalog_slots"), reason("citation"));
  for (const id of ["missing", " s1", "s1 "]) {
    const selected = assessmentCitationSelection(slots([id]), 6, "catalog_slots");
    assert.deepEqual(selected, [id]);
    assert.throws(() => resolveCatalogCitations(selected, catalog, 6), reason("citation"));
  }
});

test("item normalization creates a separate citation-array view without changing status or shape validation", () => {
  for (const status of ["supported", "changes_suggested", "insufficient_evidence"]) {
    const raw = [{criterionId: "manual-1", status, explanation: "Controlled source advice only.", citations: slots(status === "insufficient_evidence" ? [] : ["s1"])}];
    const before = structuredClone(raw), normalized = assessmentItemsForValidation(raw, "catalog_slots");
    const validated = requireAssessmentItemCoverage(normalized, ["manual-1"]);
    assert.equal(validated[0].status, status); assert.deepEqual(validated[0].citations, status === "insufficient_evidence" ? [] : ["s1"]);
    assert.notEqual(normalized, raw); assert.deepEqual(raw, before);
  }
  for (const item of [
    {criterionId: "manual-1", status: "invented", explanation: "Not valid.", citations: slots(["s1"])},
    {criterionId: "manual-1", status: "supported", explanation: "Not valid.", citations: slots(["s1"]), metadata: true},
    {criterionId: "manual-1", status: "supported", explanation: "Missing citations."},
  ]) assert.throws(() => requireAssessmentItemCoverage(assessmentItemsForValidation([item], "catalog_slots"), ["manual-1"]), reason("structure"));
  const raw = [{criterionId: "manual-1", status: "supported", explanation: "Duplicate remains rejected.", citations: slots(["s1"])}];
  assert.throws(() => requireAssessmentItemCoverage(assessmentItemsForValidation([...raw, ...raw], "catalog_slots"), ["manual-1"]), reason("duplicate_items"));
});

test("explicit V2 and legacy selector views remain untouched for their existing validators", () => {
  for (const encoding of ["catalog_ids", "legacy_quotes"] as const) {
    const citationValue = ["raw", "unvalidated"], items = [{citations: citationValue}];
    assert.equal(assessmentCitationSelection(citationValue, 6, encoding), citationValue);
    assert.equal(assessmentItemsForValidation(items, encoding), items);
  }
});
