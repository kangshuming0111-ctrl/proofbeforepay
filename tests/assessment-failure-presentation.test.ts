import {test} from "node:test";
import assert from "node:assert/strict";
import {AssessmentResponseError,requireAssessmentItemCoverage} from "../lib/assessment-response.ts";
import {assessmentFailureResponse} from "../lib/assessment-failure-presentation.ts";

test("a missing criterion has bilingual actionable diagnostics without declaring any returned item correct",()=>{
  const error = new AssessmentResponseError("missing_items",{expectedCriterionIds:["manual-1","manual-2"],missingCriterionIds:["manual-2"],duplicateCriterionIds:[],unknownCriterionCount:0});
  for(const language of ["zh","en"] as const){
    const response=assessmentFailureResponse(error,language);
    assert.match(response.error,/manual-2/u);assert.equal(response.assessmentFailure.reason,"missing_items");
    assert.deepEqual(response.assessmentFailure.coverage?.missingCriterionIds,["manual-2"]);
    assert.match(response.error,language==="zh"?/不会自动重试/u:/no automatic retry/u);
    assert.doesNotMatch(response.error,/valid answer|有效答复/u);
  }
});
test("unknown model identifiers never appear in the API failure response",()=>{
  let error:unknown;
  try{requireAssessmentItemCoverage([{criterionId:"PRIVATE_MODEL_TEXT",status:"supported",explanation:"PRIVATE explanation",citations:[]}],["manual-1"]);}catch(value){error=value;}
  assert.ok(error instanceof AssessmentResponseError);
  const response=assessmentFailureResponse(error,"zh");
  assert.equal(response.assessmentFailure.coverage?.unknownCriterionCount,1);
  assert.doesNotMatch(JSON.stringify(response),/PRIVATE/u);
});
