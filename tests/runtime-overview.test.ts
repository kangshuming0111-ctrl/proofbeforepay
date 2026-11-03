import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {runtimeCapacitySpotlightSteps,runtimeOverviewRows} from "../lib/runtime-overview.ts";
import {runtimeCapacityStepDefinitions} from "../lib/runtime-capacity.ts";
import {buildRuntimePlanDraft,CAPACITY_EXAMPLE_REQUIREMENTS} from "../lib/runtime-plan-draft.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import type {RuntimeCheckReport} from "../lib/runtime-checks.ts";

function capacityReport():RuntimeCheckReport{
  const units=summaryCoverageUnits(CAPACITY_EXAMPLE_REQUIREMENTS),draft=buildRuntimePlanDraft({protocol:"booking-http-v3",criterionId:units[0].id,capacityCriterionId:units[1].id,units,decisions:units.map(unit=>({id:unit.id,disposition:"include"}))});
  if(draft.plan?.protocol!=="booking-http-v3")throw new Error("Invalid fixture");
  const plan=draft.plan;
  return{id:"r",runId:crypto.randomUUID(),deliveryId:"d",deliveryDigest:"a".repeat(64),method:"server-booking-http-v3",startedAt:"2026-11-03T00:00:00.000Z",finishedAt:"2026-11-03T00:00:01.000Z",target:{id:"lab-capacity-flawed",label:"Synthetic",origin:"https://example.org",revision:"r1"},plan,steps:runtimeCapacityStepDefinitions(plan).map(row=>({id:row.id,label:row.label,method:row.method,path:row.path,expected:row.expected,outcome:"unavailable",reason:"race_not_verified"})),summary:{steps:17,observed:0,issues:0,unavailable:17}};
}
test("overbooking summary retains the independently observed10 rather than using missing v1 IDs or assuming success from201",()=>{
  const report=capacityReport();
  for(const id of["capacity_race_first","capacity_race_second"]){const row=report.steps.find(step=>step.id===id)!;Object.assign(row,{status:201,outcome:"mismatch",actual:"HTTP 201; bounded receipt mismatch"});delete row.reason;}
  const aggregate=report.steps.find(step=>step.id==="slot_a_after_race")!;
  Object.assign(aggregate,{status:200,outcome:"mismatch",actual:'HTTP 200; {"guestCount":10,"bookingIds":["a","b"],"mismatchedFields":["guestCount","bookingIds"]}'});delete aggregate.reason;
  const before=structuredClone(report);
  for(const language of["zh","en"] as const){
    const rows=runtimeOverviewRows(report,language),spotlight=runtimeCapacitySpotlightSteps(report);
    assert.deepEqual(rows.map(row=>row.id),["capacity-race","slot_a_after_race","slot_a_after_rejection"]);
    assert.equal(rows[0].detail.match(/HTTP 201/gu)?.length,2);assert.ok(rows[0].detail.includes(language==="zh"?"不符":"mismatch"));
    assert.ok(rows[1].detail.includes('"guestCount":10'));assert.ok(rows[1].detail.includes(language==="zh"?"保存的实际片段":"Saved actual excerpt"));
    assert.ok(rows[2].detail.includes(language==="zh"?"未确定":"unavailable"));assert.ok(!rows[2].detail.includes('"guestCount":8'));
    assert.ok(spotlight.includes(aggregate));assert.ok(!rows.some(row=>row.id==="create"||row.id==="readback"));
  }
  assert.deepEqual(report,before);
});
test("HTTP200 without aggregate data never invents a guest count, and displayed excerpts remain bounded text",()=>{
  const report=capacityReport(),aggregate=report.steps.find(step=>step.id==="slot_a_after_race")!;
  Object.assign(aggregate,{status:200,outcome:"unavailable",reason:"race_receipt_not_verified"});
  assert.ok(!runtimeOverviewRows(report,"en")[1].detail.includes("guestCount"));
  aggregate.actual='HTTP 200; {"guestCount":"bad"} <script>not executed</script>'+"x".repeat(600);
  const row=runtimeOverviewRows(report,"en")[1];assert.ok(row.detail.length<520);assert.ok(row.detail.includes('"guestCount":"bad"'));assert.ok(row.detail.endsWith("…"));
  aggregate.actual="x".repeat(2001);assert.ok(!runtimeOverviewRows(report,"en")[1].detail.includes("Saved actual excerpt"));
  aggregate.actual="unsafe\ncontrol";assert.ok(!runtimeOverviewRows(report,"en")[1].detail.includes("Saved actual excerpt"));
});
test("v3 successful or partial final readings show their own saved outcomes without borrowing earlier evidence",()=>{
  const report=capacityReport(),final=report.steps.find(step=>step.id==="slot_a_after_rejection")!;
  Object.assign(final,{status:200,outcome:"observed",actual:'HTTP 200; {"guestCount":8,"bookingIds":["winner","fill"],"mismatchedFields":[]}'});delete final.reason;
  const rows=runtimeOverviewRows(report,"en");assert.ok(rows[0].detail.includes("unavailable"));assert.ok(!rows[1].detail.includes("guestCount"));assert.ok(rows[2].detail.includes('"guestCount":8'));assert.ok(rows[2].detail.includes("expected observation"));
  report.steps=report.steps.filter(row=>row.id!=="slot_a_after_rejection");assert.equal(runtimeOverviewRows(report,"en")[2].detail,"Not recorded");
});
test("recorded v2 and legacy v1 summaries preserve create/readback scopes and never expose capacity labels",async()=>{
  const packet=JSON.parse(await readFile(new URL("./fixtures/recorded-seller-staging/v2-evidence.json",import.meta.url),"utf8")),report=packet.delivery.runtimeReport as RuntimeCheckReport;
  for(const protocol of["booking-http-v1","booking-http-v2"]as const){const value=structuredClone(report);if(protocol==="booking-http-v1")value.plan={protocol,criterionId:report.plan.criterionId,source:report.plan.source};
    for(const language of["zh","en"]as const){const rows=runtimeOverviewRows(value,language);assert.deepEqual(rows.map(row=>row.id),["create","readback"]);for(const row of rows){const step=value.steps.find(step=>step.id===row.id)!;assert.ok(row.detail.includes(`HTTP ${step.status}`));}assert.deepEqual(runtimeCapacitySpotlightSteps(value),[]);}
  }
});

test("old and revised capacity excerpts keep after-race and final stages distinct instead of claiming10to8 at one stage",async()=>{
  const {runtimeSavedActualExcerpt}=await import("../lib/runtime-overview.ts"),old=capacityReport(),revised=capacityReport();
  const set=(report:RuntimeCheckReport,id:string,count:number)=>{const step=report.steps.find(row=>row.id===id)!;Object.assign(step,{status:200,outcome:count===10?"mismatch":"observed",actual:`HTTP 200; {"guestCount":${count},"bookingIds":["synthetic"],"mismatchedFields":[]}`});delete step.reason;return step;};
  const oldRace=set(old,"slot_a_after_race",10),newRace=set(revised,"slot_a_after_race",5),newFinal=set(revised,"slot_a_after_rejection",8);
  assert.ok(runtimeSavedActualExcerpt(oldRace)!.includes('"guestCount":10'));assert.ok(runtimeSavedActualExcerpt(newRace)!.includes('"guestCount":5'));assert.ok(runtimeSavedActualExcerpt(newFinal)!.includes('"guestCount":8'));
  assert.equal(runtimeSavedActualExcerpt(old.steps.find(row=>row.id==="slot_a_after_rejection")),undefined);
  const rows=runtimeOverviewRows(revised,"en");assert.equal(rows[1].label,"Independent slot A read after race");assert.ok(rows[1].detail.includes('"guestCount":5'));assert.ok(rows[2].label.startsWith("Final slot A"));assert.ok(rows[2].detail.includes('"guestCount":8'));
});
