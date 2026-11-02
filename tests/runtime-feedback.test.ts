import assert from "node:assert/strict";
import test from "node:test";
import {draftRuntimeFeedback,runtimeReasonLabel} from "../lib/runtime-feedback.ts";
import {runtimeReportSummary,type RuntimeCheckReport,type RuntimeCheckStep} from "../lib/runtime-checks.ts";

const ids=["revision","missing_slot","invalid_email","create","readback","replay","conflict","unchanged"];
function report(steps:RuntimeCheckStep[]):RuntimeCheckReport {
  return {id:"r",runId:"r",deliveryId:"d",deliveryDigest:"a".repeat(64),method:"server-booking-http-v1",startedAt:"2026-11-02T00:00:00Z",finishedAt:"2026-11-02T00:00:01Z",target:{id:"lab-flawed",label:"Controlled fixture",origin:"https://example.org",revision:"r1"},plan:{protocol:"booking-http-v1",criterionId:"coverage-4",source:{start:0,end:1000,excerpt:"原".repeat(1000)}},steps,summary:runtimeReportSummary(steps)};
}
function step(id:string,outcome:RuntimeCheckStep["outcome"]="mismatch"):RuntimeCheckStep {
  return {id,label:"long label ".repeat(15),outcome,method:["revision","readback","unchanged"].includes(id)?"GET":"POST",path:"bookings",status:id==="readback"?404:201,expected:"expected ".repeat(50),actual:"sensitive raw response ".repeat(80),...(outcome==="unavailable"?{reason:"revision_not_verified"}:{})};
}
test("both feedback languages retain all eight exceptions within the field limit without raw payloads",()=>{
  for(const language of ["zh","en"] as const)for(const outcome of ["mismatch","unavailable"] as const){
    const original=report(ids.map(id=>step(id,outcome))),before=structuredClone(original),draft=draftRuntimeFeedback(original,language);
    assert.ok(draft.length<=1000,`${language}/${outcome}: ${draft.length}`);
    for(const id of ids)assert.ok(draft.includes(`${id} `),`${id} is missing`);
    assert.ok(!draft.includes("sensitive raw response"));assert.ok(!draft.includes("原".repeat(1000)));
    assert.ok(draft.endsWith(language==="zh"?"不更改报告或验收状态。":"changes no report or acceptance."));
    assert.deepEqual(original,before);
  }
});
test("201 followed by independent 404 is prominent, while validation and conflict expectations stay explicit",()=>{
  const original=report(ids.map(id=>step(id,["revision","create"].includes(id)?"observed":"mismatch")));
  for(const language of ["zh","en"] as const){
    const draft=draftRuntimeFeedback(original,language);
    assert.ok(draft.length<=1000);assert.match(draft,/201.*404/);
    assert.match(draft,/400\/422/);assert.match(draft,/409/);
    assert.ok(draft.includes(language==="zh"?"验证错误码":"validation code"));
    assert.ok(draft.includes(language==="zh"?"冲突错误码":"conflict code"));
    assert.ok(!draft.includes("revision "));assert.ok(!draft.includes("create "));
    for(const id of ["missing_slot","invalid_email","readback","replay","conflict","unchanged"])assert.ok(draft.includes(`${id} `));
  }
});

const businessIds=[...ids,"party_zero","party_fraction","party_below","party_below_readback","party_exact","party_exact_readback","party_above","concurrent_first","concurrent_second","concurrent_readback"];
function policyReport(steps:RuntimeCheckStep[]):RuntimeCheckReport {
  const clause="Each booking accepts at most 6 people.";
  return {...report(steps),method:"server-booking-http-v2",plan:{protocol:"booking-http-v2",criterionId:"coverage-4",source:{start:0,end:clause.length,excerpt:clause},policy:{maxPartySize:6,source:{start:0,end:clause.length-1,excerpt:clause.slice(0,-1)}}}};
}
test("all eighteen exceptions remain complete within the field limit, including the final concurrency readback",()=>{
  for(const language of ["zh","en"] as const)for(const outcome of ["mismatch","unavailable"] as const){
    const original=policyReport(businessIds.map(id=>step(id,outcome))),before=structuredClone(original),draft=draftRuntimeFeedback(original,language);
    assert.ok(draft.length<=1000,`${language}/${outcome}: ${draft.length}`);
    for(const id of businessIds)assert.ok(draft.includes(`${id} `),`${id} missing in ${language}/${outcome}`);
    assert.ok(draft.endsWith(language==="zh"?"不更改报告或验收状态。":"changes no report or acceptance."));
    assert.ok(!draft.includes("sensitive raw response"));assert.deepEqual(original,before);
  }
});
test("the adopted business maximum drives feedback rather than a fixture's assumed policy",()=>{
  const original=policyReport(businessIds.map(id=>step(id,id==="party_above"?"mismatch":"observed")));
  for(const language of ["zh","en"] as const){
    const draft=draftRuntimeFeedback(original,language);
    assert.match(draft,/6.*7.*201/);assert.match(draft,/400\/422/);assert.ok(draft.includes("party_above "));
    assert.ok(!draft.includes("concurrent_readback "));assert.ok(draft.length<=1000);
  }
  const ordinaryRejection=structuredClone(original);ordinaryRejection.steps.find(step=>step.id==="party_above")!.status=400;
  assert.ok(!draftRuntimeFeedback(ordinaryRejection,"zh").includes("但7人请求"));
});
test("recovery and dependency reasons explain what was not observed instead of implying a fresh pass",()=>{
  for(const reason of ["resumed_creation_not_observed","resumed_concurrency_not_observed","boundary_not_verified","concurrent_not_verified"]){
    for(const language of ["zh","en"] as const){
      const label=runtimeReasonLabel(reason,language);
      assert.ok(label.length>5);assert.notEqual(label,reason);assert.ok(!/pass|通过/u.test(label));
    }
  }
});
