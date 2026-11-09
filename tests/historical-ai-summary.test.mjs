import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {historicalAiSummary} from "../public/ai-evidence-model.mjs";

const load = name => readFile(new URL(`../public/benchmarks/noodle-core-2026-11-06/${name}`, import.meta.url), "utf8");
const records = () => Promise.all([load("first-live.json"), load("author-first-four-whole-review.json")]);
const serialize = record => JSON.stringify(record, null, 2) + "\n";

test("first-run counts retain original mismatches, unavailable findings and whole-answer caveats", async () => {
  const result = await historicalAiSummary(...await records());
  assert.equal(result.criteria, 9);
  assert.equal(result.cases.length, 4);
  assert.deepEqual(result.metrics.raw, {matches: 9, evaluated: 9, unavailable: 0});
  assert.deepEqual(result.metrics.published, {matches: 7, evaluated: 9, unavailable: 0});
  assert.deepEqual(result.metrics.effective, {matches: 8, evaluated: 9, unavailable: 0});
  assert.deepEqual(result.metrics.source, {matches: 6, evaluated: 7, unavailable: 2});
  assert.equal(result.cases.filter(row => row.rawWholeAnswer.startsWith("qualified")).length, 2);

  const wrongObject = result.cases.find(row => row.id === "f1-sealed-wrong-object");
  assert.equal(wrongObject.rows[0].reference, "changes_suggested");
  assert.equal(wrongObject.rows[0].effective, "insufficient_evidence");
  assert.match(wrongObject.notes[1], /wrongly abstains/);
});

test("a changed reference or a missing historical negative fails closed", async () => {
  const [first, whole] = await records();
  const changedReference = JSON.parse(first);
  changedReference.results[1].focused[0].reference = "insufficient_evidence";
  await assert.rejects(historicalAiSummary(serialize(changedReference), whole), /frozen copy/);

  const missingRow = JSON.parse(first);
  missingRow.results[1].focused.shift();
  await assert.rejects(historicalAiSummary(serialize(missingRow), whole), /frozen copy/);

  const missingCase = JSON.parse(first), missingReview = JSON.parse(whole);
  missingCase.results.splice(1, 1);
  missingReview.wholeAnswers.splice(1, 1);
  await assert.rejects(historicalAiSummary(serialize(missingCase), serialize(missingReview)), /frozen copy/);
});

test("missing or rewritten whole-answer qualifications fail closed", async () => {
  const [first, whole] = await records();
  const changedReview = JSON.parse(whole);
  changedReview.wholeAnswers[1].raw = "accepted";
  await assert.rejects(historicalAiSummary(first, serialize(changedReview)), /frozen copy/);

  const missingNotes = JSON.parse(whole);
  missingNotes.wholeAnswers[1].notes = [];
  await assert.rejects(historicalAiSummary(first, serialize(missingNotes)), /frozen copy/);
  await assert.rejects(historicalAiSummary(first, ""), /frozen copy/);
});

test("Git checkout line endings leave the historical score unchanged", async () => {
  const originals = await records();
  const crlf = originals.map(text => text.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"));
  assert.deepEqual(await historicalAiSummary(...crlf), await historicalAiSummary(...originals));
});
