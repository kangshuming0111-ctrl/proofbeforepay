import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const corpus = JSON.parse(readFileSync(new URL("../scripts/assessment-evaluation-cases.json", import.meta.url), "utf8"));

test("the labelled evaluation corpus has distinct synthetic cases and reports no measured results", () => {
  assert.equal(corpus.synthetic, true);
  assert.equal(corpus.providerCallsMadeByThisFile, 0);
  assert.equal(corpus.cases.length, 19);
  assert.equal(new Set(corpus.cases.map((entry: { id: string }) => entry.id)).size, 19);
  for (const entry of corpus.cases) {
    assert.ok(["supported", "changes_suggested", "insufficient_evidence"].includes(entry.reference.expectedStatus));
    assert.equal(entry.reference.requiresHumanSemanticReview, true);
    assert.ok(entry.criterion.source.length > 0 && entry.reference.rationale.length > 0);
  }
});

test("the truncation reference actually puts its required literal outside the current source prefix", () => {
  const entry = corpus.cases.find((item: { id: string }) => item.id === "truncated-hours");
  const source = entry.files["index.html"];
  assert.ok(source.length > 6000);
  assert.ok(source.indexOf("Monday to Friday, 11am–8pm") >= 6000);
  assert.ok(!source.slice(0, 6000).includes("Monday to Friday, 11am–8pm"));
  assert.equal(entry.reference.expectedStatus, "insufficient_evidence");
});
