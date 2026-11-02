import assert from "node:assert/strict";
import test from "node:test";
import {draftRuntimeFeedback} from "../lib/runtime-feedback.ts";
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
