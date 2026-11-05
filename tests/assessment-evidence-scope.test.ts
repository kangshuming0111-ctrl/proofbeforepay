import assert from "node:assert/strict";
import test from "node:test";
import { assessmentEvidenceScope, assessmentObservationExplanation } from "../lib/assessment-evidence-scope.ts";

test("record evidence scope returns a useful fixed explanation without modifying agreed wording", () => {
  const criterion = { id: "manual-1", title: "Enquiry receipts", source: "Record every enquiry durably and display its receipt copy." };
  const original = structuredClone(criterion), scope = assessmentEvidenceScope(criterion);
  assert.deepEqual(scope, { category: "requires_observation", reason: "durable_record" });
  assert.match(assessmentObservationExplanation(scope, "en"), /independent record-readback evidence/u);
  assert.match(assessmentObservationExplanation(scope, "zh"), /独立记录回读证据/u);
  assert.deepEqual(criterion, original);
});

test("mobile and money-moving requirements keep specific evidence categories ahead of copy allowances", () => {
  assert.equal(assessmentEvidenceScope({ id: "mobile", title: "Page copy", source: "Display the address." }).reason, "mobile");
  const scope = assessmentEvidenceScope({ id: "manual-1", title: "Refund policy copy", source: "The page copy must describe the policy and actually refund the card." });
  assert.equal(scope.reason, "financial_action");
  assert.match(assessmentObservationExplanation(scope, "en"), /execution result and transaction record/u);
});

test("a bounded appointment-copy paraphrase only grants source review, not a compliance verdict", () => {
  const scope = assessmentEvidenceScope({ id: "manual-1", title: "Booking policy copy", source: "The page copy must state: Consultations must be arranged beforehand. Visitors without an appointment cannot be accommodated." });
  assert.deepEqual(scope, { category: "source_text", reason: "explicit_policy_copy" });
  assert.equal("status" in scope, false);
  assert.equal("accepted" in scope, false);
  assert.equal(assessmentEvidenceScope({ id: "manual-1", title: "Special requirement", source: "Meet everything previously discussed." }).reason, "unclassified_requirement");
});
