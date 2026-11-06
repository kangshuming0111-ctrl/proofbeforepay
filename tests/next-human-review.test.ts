import assert from "node:assert/strict";
import test from "node:test";
import {nextHumanReview} from "../lib/next-human-review.ts";
import type {ProofAssessment,ProofCriterion} from "../lib/contracts.ts";
const pending: ProofCriterion[] = [{id:"mobile",title:"Mobile",source:"Check mobile usability."},{id:"phone",title:"Phone",source:"The page must include a phone number."}];
function delivery(status="changes_suggested",id="current") {
  return {id:"current",assessment:{id:"report",deliveryId:id,items:[{criterionId:"phone",status,explanation:"Controlled navigation input",citations:[],ruleEvidenceIds:[]}]} as unknown as ProofAssessment};
}
test("a current suggestion opens its pending human requirement before checklist order",()=>{
  const d=delivery(),before=structuredClone({pending,d});
  assert.deepEqual(nextHumanReview(pending,d),{criterion:pending[1],reason:"ai_change"});
  assert.deepEqual({pending,d},before);
});
test("missing, stale, unknown and supported AI reports cannot change ordinary navigation",()=>{
  for(const d of [undefined,{id:"current"},delivery("changes_suggested","old"),delivery("insufficient_evidence"),delivery("supported")])
    assert.deepEqual(nextHumanReview(pending,d),{criterion:pending[0],reason:"checklist"});
});
test("a confirmed or unrelated criterion is never reintroduced as a pending check",()=>{
  assert.deepEqual(nextHumanReview([pending[0]],delivery()),{criterion:pending[0],reason:"checklist"});
  assert.deepEqual(nextHumanReview([],delivery()),{reason:"complete"});
});
test("multiple AI changes keep the agreed pending order and do not become a new verdict",()=>{
  const d=delivery();d.assessment.items.unshift({...d.assessment.items[0],criterionId:"mobile"});
  assert.deepEqual(nextHumanReview(pending,d),{criterion:pending[0],reason:"ai_change"});
  assert.equal(d.assessment.items[1].status,"changes_suggested");
});
