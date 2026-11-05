import assert from "node:assert/strict";
import test from "node:test";
import type {Language, ProofAssessment, ProofAssessmentItem} from "../lib/contracts.ts";
import {publishSourceAssessmentNotes} from "../lib/assessment-publication-policy.ts";

const item = (id = "coverage-1", status: ProofAssessmentItem["status"] = "supported"): ProofAssessmentItem => ({criterionId: id, status,
  explanation: "Validated source-only item.", citations: [{file: "index.html", start: 0, end: 4, excerpt: "Home"}], ruleEvidenceIds: []});
const risks = (): ProofAssessment["risks"] => [{title: "Validated AI lead", explanation: "Source property may need review.", suggestion: "Check the agreed static property.",
  citations: [{file: "index.html", start: 0, end: 4, excerpt: "Home"}]}];
const files = {"index.html": '<!doctype html><script>runBrowser(); writeDatabase(); analyzePixels();</script><p>Home</p>', "theme.css": "body{}"};

test("published inventory counts actual file kinds and never turns source script strings into execution", () => {
  const result = publishSourceAssessmentNotes("en", [item()], new Map([["coverage-1", "supported"]]), [], 4, files);
  assert.match(result.limitations[0], /1 HTML, 1 CSS and 0 raster image/);
  assert.match(result.limitations[0], /did not run a browser, scripts or backend, or analyze image pixels/);
  assert.ok(!result.limitations.join(" ").includes("runBrowser")); assert.ok(!result.limitations.join(" ").includes("writeDatabase"));
  const imageFiles = {...files, "About.HTML": "<p>About</p>", "PRINT.CSS": "p{}", "logo.PNG": "validated-raster-data", "photo.JPEG": "validated-raster-data", "photo.jpg": "validated-raster-data", "banner.webp": "validated-raster-data"};
  const withImages = publishSourceAssessmentNotes("en", [], new Map(), [], 0, imageFiles);
  assert.match(withImages.limitations[0], /2 HTML, 2 CSS and 4 raster image/);
  assert.match(withImages.limitations[0], /analyze image pixels/);
});

test("one adjusted item suppresses all optional risks with exact counts without changing item findings", () => {
  const items = [item(), item("coverage-2", "insufficient_evidence")], original = new Map([["coverage-1", "supported"], ["coverage-2", "supported"]]), modelRisks = [...risks(), {...risks()[0], title: "Second lead"}];
  const before = structuredClone({items, original, modelRisks});
  const result = publishSourceAssessmentNotes("en", items, original, modelRisks, 3, files);
  assert.equal(result.statusAdjustedCount, 1); assert.deepEqual(result.risks, []); assert.notEqual(result.risks, modelRisks);
  assert.match(result.limitations[2], /1 item status\(es\).*2 unreviewed optional AI risk\(s\)/);
  assert.match(result.limitations[2], /does not accept work, authorize or trigger payment/);
  assert.deepEqual({items, original, modelRisks}, before);
});

test("every final status difference is counted and a missing premise conservatively withholds risks", () => {
  const items = [item("coverage-1", "changes_suggested"), item("coverage-2", "insufficient_evidence"), item("coverage-3", "supported")];
  const result = publishSourceAssessmentNotes("zh", items, new Map([["coverage-1", "supported"], ["coverage-2", "changes_suggested"]]), risks(), 2, files);
  assert.equal(result.statusAdjustedCount, 3); assert.deepEqual(result.risks, []);
  assert.match(result.limitations[2], /3 项状态经系统调整，1 条未复核风险暂不采纳，以逐项证据为准/);
});

test("unchanged statuses retain all validated risk details in independent arrays and objects", () => {
  const items = [item(), item("coverage-2", "changes_suggested"), item("coverage-3", "insufficient_evidence")], original = new Map(items.map(row => [row.criterionId, row.status])), modelRisks = risks(), before = structuredClone(modelRisks);
  const result = publishSourceAssessmentNotes("en", items, original, modelRisks, 1, files);
  assert.equal(result.statusAdjustedCount, 0); assert.deepEqual(result.risks, modelRisks); assert.equal(result.limitations.length, 2);
  assert.notEqual(result.risks, modelRisks); assert.notEqual(result.risks[0], modelRisks[0]);
  assert.notEqual(result.risks[0].citations, modelRisks[0].citations); assert.notEqual(result.risks[0].citations[0], modelRisks[0].citations[0]);
  result.risks[0].suggestion = "Presentation copy changed"; result.risks[0].citations[0].excerpt = "Changed";
  assert.deepEqual(modelRisks, before);
});

test("model limitation prose is not an input to system facts and its withheld count is explicit", () => {
  for (const count of [0, 4, 8]) {
    const result = publishSourceAssessmentNotes("en", [item()], new Map([["coverage-1", "supported"]]), [], count, files);
    assert.match(result.limitations[1], new RegExp(`model supplied ${count} self-described limitations`));
    assert.match(result.limitations[1], /not independently verified.*not published as detection findings/);
    assert.ok(!result.limitations.join(" ").includes("Raster image files listed in the inventory were not analyzed"));
  }
});

test("both languages use bounded fixed notes and do not echo long criterion IDs or paths", () => {
  const id = "Secret".repeat(40), path = `${"LongPrivatePath".repeat(10)}.html`, items = [item(id, "insufficient_evidence")];
  for (const language of ["en", "zh"] satisfies Language[]) {
    const result = publishSourceAssessmentNotes(language, items, new Map([[id, "supported"]]), risks(), 8, {[path]: "<p>Home</p>"});
    assert.equal(result.limitations.length, 3);
    assert.ok(result.limitations.every(note => note.length > 0 && note.length <= 300));
    assert.ok(result.limitations.every(note => !note.includes(id) && !note.includes(path)));
    assert.match(result.limitations[1], language === "zh" ? /8 条自述局限.*未作为检测事实发布/ : /8 self-described limitations/);
  }
});

test("the publication gate supplies no missing risk fields and preserves its caller-validation precondition", () => {
  // Invalid model structures must have been rejected before this function.
  // It does not fill a missing suggestion or recast a risk as a valid result.
  const invalid = [{title: "Invalid caller fixture", explanation: "Missing suggestion.", citations: []}] as unknown as ProofAssessment["risks"];
  const result = publishSourceAssessmentNotes("en", [item()], new Map([["coverage-1", "supported"]]), invalid, 0, files);
  assert.equal(Object.hasOwn(result.risks[0], "suggestion"), false);
  for (const count of [-1, 1.5, Number.NaN]) assert.throws(() => publishSourceAssessmentNotes("en", [], new Map(), [], count, files), TypeError);
});
