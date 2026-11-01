import assert from "node:assert/strict";
import test from "node:test";
import type { ProofAssessment, ProofCriterion, ProofDelivery, ProofDeliveryVersion, ProofEvidence, ProofFeedback, ProofLayoutReport, ProofReview } from "../lib/contracts.ts";
import { buildDeliveryComparison, isOlderDelivery } from "../lib/delivery-comparison.ts";

const criteria: ProofCriterion[] = [
  { id: "page-1", title: "Home page", source: "交付 index.html，保留原文换行。\nShow the noodle menu and prices." },
  { id: "manual-1", title: "Opening hours", source: "Display Monday–Friday 11:00–20:00." },
];
const evidence = (criterionId: string, finding: ProofEvidence["finding"]): ProofEvidence => ({ id: `${criterionId}-${finding}`, criterionId, finding, file: "index.html", excerpt: "<p>11:00–20:00</p>", explanation: `Saved rule explanation for ${criterionId}.` });
function assessment(deliveryId: string): ProofAssessment {
  return { id: `ai-${deliveryId}`, deliveryId, method: "source-ai-v1", mode: "live", model: "synthetic-no-request", assessedAt: "2026-11-02T00:05:00Z", items: criteria.map(item => ({ criterionId: item.id, status: "insufficient_evidence", explanation: "Needs a direct buyer check.", citations: [{ file: "index.html", start: 2, end: 18, excerpt: "<p>11:00–20:00</p>" }], ruleEvidenceIds: [] })), risks: [], limitations: ["No script or backend execution."], coverage: { includedFiles: ["index.html"], truncatedFiles: [], omittedFiles: [] } };
}
function layout(deliveryId: string): ProofLayoutReport {
  return { id: `layout-${deliveryId}`, deliveryId, method: "browser-observation-v1", receivedAt: "2026-11-02T00:06:00Z", viewportHeight: 800,
    readings: [{ file: "index.html", viewportWidth: 375, status: "measured", clientWidth: 375, scrollWidth: 640, overflowPx: 0, outcome: "no_overflow" }],
    summary: { measured: 999, unavailable: 0, overflow: 0 } };
}
function delivery(id = "v2", sequence: number | undefined = 2): ProofDelivery {
  return { id, sequence, variant: "upload", label: `Noodle website ${id}`, submittedAt: `2026-11-02T00:0${sequence ?? 2}:00Z`, evidence: [evidence("page-1", "pass"), evidence("manual-1", "needs_human")], assessment: assessment(id), layoutReport: layout(id) };
}
const review = (deliveryId = "v2"): ProofReview => ({ deliveryId, mode: "demo", reviewedAt: "2026-11-02T00:06:00Z", summary: "Rules only; not a quality verdict." });
const feedback = (id: string, deliveryId: string, criterionId = "manual-1", comment = "Please correct the opening hours."): ProofFeedback => ({ id, deliveryId, criterionId, comment, at: "2026-11-02T00:07:00Z" });
function version(old = delivery("v1", 1)): ProofDeliveryVersion {
  return { delivery: old, review: review(old.id), feedback: [feedback("request-1", old.id)], archivedAt: "2026-11-02T00:08:00Z" };
}

test("rule findings, AI advice and actual browser readings remain separate for each requirement", () => {
  const old = version(); old.delivery.evidence = [evidence("page-1", "fail"), evidence("manual-1", "needs_human")];
  const result = buildDeliveryComparison({ delivery: delivery(), review: review(), criteria, previousVersion: old });
  const row = result.rows[0];
  assert.equal(row.criterion.source, criteria[0].source);
  assert.equal(row.previous?.rules.state, "available"); assert.equal(row.current.rules.state, "available");
  if (row.previous?.rules.state === "available" && row.current.rules.state === "available") {
    assert.equal(row.previous.rules.data.evidence[0].finding, "fail");
    assert.equal(row.current.rules.data.evidence[0].finding, "pass");
  }
  assert.equal(row.current.ai.state, "available");
  if (row.current.ai.state === "available") assert.equal(row.current.ai.data.item.status, "insufficient_evidence");
  assert.equal(row.current.browser.state, "available");
  if (row.current.browser.state === "available") {
    assert.equal(row.current.browser.data.readings[0].status, "measured");
    assert.equal("scrollWidth" in row.current.browser.data.readings[0] && row.current.browser.data.readings[0].scrollWidth, 640);
  }
  assert.equal("fixed" in row, false); assert.equal("accepted" in result, false);
});

test("a current matching report never rescues missing or stale historical records", () => {
  const old = version(); old.review = review("wrong"); old.delivery.assessment = assessment("wrong"); old.delivery.layoutReport = layout("wrong");
  const result = buildDeliveryComparison({ delivery: delivery(), review: review(), criteria, previousVersion: old });
  const before = result.rows[0].previous!;
  assert.deepEqual(before.rules, { state: "unavailable", reason: "different_delivery" });
  assert.deepEqual(before.ai, { state: "unavailable", reason: "different_delivery" });
  assert.deepEqual(before.browser, { state: "unavailable", reason: "different_delivery" });
  assert.equal(result.rows[0].current.ai.state, "available");
});

test("historical checks cannot be reused when the replacement has no saved reports", () => {
  const current = delivery(); delete current.assessment; delete current.layoutReport;
  const result = buildDeliveryComparison({ delivery: current, criteria, previousVersion: version() });
  assert.equal(result.rows[0].previous?.rules.state, "available");
  assert.equal(result.rows[0].previous?.ai.state, "available");
  assert.deepEqual(result.rows[0].current.rules, { state: "unavailable", reason: "no_report" });
  assert.deepEqual(result.rows[0].current.ai, { state: "unavailable", reason: "no_report" });
  assert.deepEqual(result.rows[0].current.browser, { state: "unavailable", reason: "no_report" });
});

test("absent history, the current version, future versions and contradictory order are never used as earlier evidence", () => {
  const current = delivery();
  const missing = buildDeliveryComparison({ delivery: current, review: review(), criteria });
  assert.deepEqual(missing.previous, { state: "unavailable", reason: "no_previous" });
  assert.equal(missing.rows[0].previous, undefined);
  const contradictory = version(); contradictory.delivery.submittedAt = "2026-11-03T00:00:00Z";
  for (const candidate of [version(current), version(delivery("v3", 3)), { ...version(), isCurrent: true }, contradictory]) {
    assert.equal(isOlderDelivery(candidate, current), false);
    const result = buildDeliveryComparison({ delivery: current, review: review(), criteria, previousVersion: candidate, feedback: [feedback("not-old", "v2")] });
    assert.deepEqual(result.previous, { state: "unavailable", reason: "not_older" });
    assert.ok(result.rows.every(row => !row.previous && row.previousFeedback.length === 0));
  }
});

test("known sequences tolerate identical creation timestamps; otherwise a strict valid earlier timestamp is required", () => {
  const current = delivery(), old = version(); old.delivery.submittedAt = current.submittedAt;
  assert.equal(isOlderDelivery(old, current), true);
  old.delivery.sequence = undefined; current.sequence = undefined;
  assert.equal(isOlderDelivery(old, current), false);
  old.delivery.submittedAt = "2026-11-02T00:01:00Z";
  assert.equal(isOlderDelivery(old, current), true);
  old.delivery.submittedAt = "invalid";
  assert.equal(isOlderDelivery(old, current), false);
});

test("feedback is matched by exact historical delivery and criterion; immutable snapshot wins duplicate IDs", () => {
  const old = version();
  old.feedback.push(feedback("wrong-criterion", "v1", "not-a-criterion"), feedback("current", "v2"));
  const result = buildDeliveryComparison({ delivery: delivery(), criteria, previousVersion: old, feedback: [feedback("request-1", "v1", "manual-1", "Overwritten outside snapshot"), feedback("request-2", "v1", "page-1", "Page request"), feedback("request-3", "v2")] });
  assert.deepEqual(result.rows[0].previousFeedback.map(item => item.comment), ["Page request"]);
  assert.deepEqual(result.rows[1].previousFeedback.map(item => item.comment), ["Please correct the opening hours."]);
});

test("a saved review cannot imply evidence for a missing criterion; duplicate AI rows are unavailable", () => {
  const current = delivery(); current.evidence = [evidence("page-1", "pass")];
  current.assessment!.items.push(structuredClone(current.assessment!.items[1]));
  const result = buildDeliveryComparison({ delivery: current, review: review(), criteria });
  assert.deepEqual(result.rows[1].current.rules, { state: "unavailable", reason: "no_criterion_evidence" });
  assert.deepEqual(result.rows[1].current.ai, { state: "unavailable", reason: "invalid_report" });
  assert.equal(result.rows[0].current.rules.state, "available");
});

test("browser association is explicit and missing or malformed readings never count as success", () => {
  const current = delivery(); current.evidence[0].file = "contact.html"; current.assessment!.items[0].citations[0].file = "contact.html";
  let row = buildDeliveryComparison({ delivery: current, review: review(), criteria }).rows[0];
  assert.deepEqual(row.current.browser, { state: "unavailable", reason: "no_file_readings" });
  current.evidence[0].file = "manual inspection"; current.assessment!.items[0].citations = [];
  row = buildDeliveryComparison({ delivery: current, review: review(), criteria }).rows[0];
  assert.equal(row.current.browser.state, "available");
  if (row.current.browser.state === "available") assert.equal(row.current.browser.data.relation, "delivery_wide");
  current.layoutReport!.readings.push(structuredClone(current.layoutReport!.readings[0]));
  row = buildDeliveryComparison({ delivery: current, review: review(), criteria }).rows[0];
  assert.deepEqual(row.current.browser, { state: "unavailable", reason: "invalid_report" });
});

test("exact original clauses, citations and feedback remain unchanged when a consumer mutates the projection", () => {
  const input = { delivery: delivery(), review: review(), criteria: structuredClone(criteria), previousVersion: version() };
  const original = structuredClone(input);
  const result = buildDeliveryComparison(input);
  assert.deepEqual(input, original);
  const current = result.rows[0].current;
  assert.equal(current.ai.state, "available");
  if (current.ai.state === "available") {
    assert.deepEqual(current.ai.data.item.citations, input.delivery.assessment!.items[0].citations);
    current.ai.data.item.citations[0].excerpt = "MUTATED";
    current.ai.data.coverage.includedFiles.push("injected.html");
  }
  result.rows[0].criterion.source = "Changed requirement";
  result.rows[1].previousFeedback[0].comment = "Changed feedback";
  if (current.rules.state === "available") current.rules.data.evidence[0].excerpt = "Changed rule excerpt";
  assert.deepEqual(input, original);
});
