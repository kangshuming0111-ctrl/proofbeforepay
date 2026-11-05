import assert from "node:assert/strict";
import test from "node:test";
import { assessmentEvidenceScope, assessmentObservationExplanation } from "../lib/assessment-evidence-scope.ts";

test("complete Chinese cancellation wording directives admit only source advice",()=>{
  for(const source of [
    "页面取消政策必须写明：活动开始前至少七天取消可以全额退还订金。",
    "网站退订政策文字须注明：课程开始前至少7天取消可全额退还定金。",
    "页面取消政策文案应说明：开课前至少48小时取消可全额退还订金。",
  ]) assert.deepEqual(assessmentEvidenceScope({id:"manual-1",title:"取消政策",source}),{category:"source_text",reason:"literal_content"});
});
test("wording cannot launder additional execution, storage, title or unfamiliar policy obligations",()=>{
  const base="页面取消政策必须写明：活动开始前至少七天取消可以全额退还订金。";
  for(const source of [base+"并实际自动退款至原支付卡。",base+"同时保存可查询的退款记录。",base+"用户可以点击按钮提交取消。",base+"其他条款按双方另议。"])
    assert.equal(assessmentEvidenceScope({id:"manual-1",title:"取消政策",source}).category,"requires_observation",source);
  assert.equal(assessmentEvidenceScope({id:"manual-1",title:"自动退款功能",source:base}).category,"requires_observation");
  assert.equal(assessmentEvidenceScope({id:"manual-1",title:"取消政策",source:"页面取消政策必须写明：取消均可退款。"}).category,"requires_observation");
});

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
