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

test("all seventeen capacity exceptions retain every ID and truthful state within 1000 characters",async()=>{
  const {CAPACITY_STEP_IDS}=await import("../lib/runtime-capacity.ts");
  for(const language of ["zh","en"] as const)for(const outcome of ["mismatch","unavailable"] as const){
    const original=capacityReport(CAPACITY_STEP_IDS.map(id=>step(id,outcome))),before=structuredClone(original),draft=draftRuntimeFeedback(original,language);
    assert.ok(draft.length<=1000,`${language}/${outcome}: ${draft.length}`);
    for(const id of CAPACITY_STEP_IDS)assert.ok(draft.includes(`${id} `),`${id} omitted`);
    assert.ok(!draft.includes("sensitive raw response"));assert.deepEqual(original,before);
    assert.ok(draft.endsWith(language==="zh"?"不更改报告或验收状态。":"changes no report or acceptance."));
  }
});
function capacityReport(steps:RuntimeCheckStep[]):RuntimeCheckReport{
  const original=policyReport(steps),source="Each time slot accepts at most 8 guests in total.";
  if(original.plan.protocol!=="booking-http-v2")throw new Error("fixture");
  return{...original,method:"server-booking-http-v3",plan:{...original.plan,protocol:"booking-http-v3",slotCapacity:{criterionId:"coverage-5",maxGuestsPerSlot:8,source:{start:38,end:38+source.length,excerpt:source}}}};
}
test("capacity-only feedback uses its own source clause and exposes a double-201 race",async()=>{
  const {runtimeFeedbackCriterion}=await import("../lib/runtime-feedback.ts");
  const original=capacityReport([step("revision","observed"),step("party_above","observed"),step("capacity_race_first"),step("capacity_race_second")]);
  assert.equal(runtimeFeedbackCriterion(original),"coverage-5");
  for(const language of ["zh","en"] as const){const draft=draftRuntimeFeedback(original,language);assert.match(draft,/201\/201/);assert.match(draft,/201.*409/);assert.ok(draft.includes(language==="zh"?"两条原文":"separate clauses"));}
  original.steps=original.steps.map(item=>({...item,outcome:item.id==="party_above"?"mismatch":"observed"}));
  assert.equal(runtimeFeedbackCriterion(original),"coverage-4");
});
test("every capacity step and recovery dependency has a meaningful bilingual label",async()=>{
  const {CAPACITY_STEP_IDS}=await import("../lib/runtime-capacity.ts");
  const {runtimeStepName}=await import("../lib/runtime-feedback.ts");
  for(const language of ["zh","en"] as const){
    for(const id of CAPACITY_STEP_IDS)assert.notEqual(runtimeStepName(id,language),language==="zh"?"接口步骤":"HTTP step");
    for(const reason of ["resumed_initial_state_not_observed","resumed_capacity_run_not_replayed","initial_slot_not_empty_or_unavailable","race_not_verified","race_or_replay_state_not_verified","fill_not_verified","full_slot_not_verified","slot_b_not_verified"]){const label=runtimeReasonLabel(reason,language);assert.notEqual(label,language==="zh"?"详见报告原因":"see report reason");assert.ok(!/pass|通过/u.test(label));}
  }
});

test("mixed capacity failures keep the distinct-key race advisory and every exception at each status-count boundary",async()=>{
  const {CAPACITY_STEP_IDS}=await import("../lib/runtime-capacity.ts");
  for(const language of ["zh","en"] as const)for(const outcome of ["mismatch","unavailable"] as const)for(let count=0;count<=17;count++){
    const steps=CAPACITY_STEP_IDS.map((id,index)=>{const value=step(id,outcome);if(index>=count)delete value.status;return value;});
    const draft=draftRuntimeFeedback(capacityReport(steps),language);
    assert.ok(draft.length<=1000,`${language}/${outcome}/${count}: ${draft.length}`);
    for(const id of CAPACITY_STEP_IDS)assert.ok(draft.includes(`${id} `));
    assert.ok(draft.includes(language==="zh"?"不同键容量争抢":"Distinct-key capacity race"));
  }
});

test("expanded31-step feedback keeps every exception and actual status inside1000characters in both languages",async()=>{
  const {CAPACITY_V4_STEP_IDS}=await import("../lib/runtime-capacity.ts"),{runtimeStepName,runtimeFeedbackCriterion}=await import("../lib/runtime-feedback.ts");
  for(const language of["zh","en"]as const)for(const outcome of["mismatch","unavailable"]as const)for(let statusCount=0;statusCount<=31;statusCount++){
    const original=capacityReport(CAPACITY_V4_STEP_IDS.map((id,index)=>{const row=step(id,outcome);if(index>=statusCount)delete row.status;return row;}));original.plan.protocol="booking-http-v4";original.method="server-booking-http-v4";
    const before=structuredClone(original),draft=draftRuntimeFeedback(original,language);assert.ok(draft.length<=1000,`${language}/${outcome}/${statusCount}: ${draft.length}`);
    for(const id of CAPACITY_V4_STEP_IDS){assert.ok(draft.includes(`${id} `),id);assert.notEqual(runtimeStepName(id,language),language==="zh"?"接口步骤":"HTTP step");const row=original.steps.find(step=>step.id===id)!;if(row.status!==undefined)assert.ok(draft.split("\n").find(line=>line.startsWith(`${id} `))!.includes(String(row.status)),`${id} status omitted`);}
    assert.ok(draft.includes(language==="zh"?"技术协议":"technical agreement"));
    assert.ok(draft.endsWith(language==="zh"?"不更改报告或验收状态。":"changes no report or acceptance."));assert.deepEqual(original,before);
  }
  const emailOnly=capacityReport(CAPACITY_V4_STEP_IDS.map(id=>step(id,id==="invalid_email"?"mismatch":"observed")));emailOnly.plan.protocol="booking-http-v4";assert.equal(runtimeFeedbackCriterion(emailOnly),"coverage-4");assert.match(draftRuntimeFeedback(emailOnly,"en"),/technical agreement/u);
  const capacityOnly=structuredClone(emailOnly);capacityOnly.steps=capacityOnly.steps.map(row=>({...row,outcome:row.id==="capacity_race_first"?"mismatch":"observed"}));assert.equal(runtimeFeedbackCriterion(capacityOnly),"coverage-5");
});

test("unexecuted labels preserve unknown outcomes and technical-only winning-key feedback stays with the protocol's primary anchor",async()=>{
  const {runtimeStepOutcomeLabel,runtimeFeedbackCriterion}=await import("../lib/runtime-feedback.ts");
  assert.equal(runtimeStepOutcomeLabel({outcome:"unavailable",reason:"not_run"},"en"),"Not executed");assert.equal(runtimeStepOutcomeLabel({outcome:"unavailable",reason:"not_run"},"zh"),"未执行");
  assert.equal(runtimeStepOutcomeLabel({outcome:"unavailable",reason:"network_unavailable"},"en"),"Unavailable");
  const report=capacityReport([step("winner_conflict","mismatch")]);report.plan.protocol="booking-http-v4";assert.equal(runtimeFeedbackCriterion(report),"coverage-4");assert.match(draftRuntimeFeedback(report,"en"),/technical agreement/u);
});
