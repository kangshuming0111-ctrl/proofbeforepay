import assert from "node:assert/strict";
import test from "node:test";
import {runtimeCoverage,runtimeCoverageFamilyName} from "../lib/runtime-coverage.ts";
import {buildRuntimePlanDraft,CAPACITY_EXAMPLE_REQUIREMENTS} from "../lib/runtime-plan-draft.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {runtimeProtocolStepIds,runtimeReportMethod,type RuntimeCheckPlan,type RuntimeCheckReport} from "../lib/runtime-checks.ts";

function plan(protocol:RuntimeCheckPlan["protocol"]):RuntimeCheckPlan{
  const units=summaryCoverageUnits(CAPACITY_EXAMPLE_REQUIREMENTS),draft=buildRuntimePlanDraft({protocol,criterionId:units[0].id,capacityCriterionId:units[1].id,units,decisions:units.map(unit=>({id:unit.id,disposition:"include"}))});
  if(!draft.plan)throw new Error("Invalid fixture");return draft.plan;
}
function report(value:RuntimeCheckPlan):RuntimeCheckReport{return{id:"r",runId:crypto.randomUUID(),deliveryId:"d",deliveryDigest:"a".repeat(64),method:runtimeReportMethod(value),plan:structuredClone(value),startedAt:"2026-11-03T00:00:00.000Z",finishedAt:"2026-11-03T00:00:01.000Z",target:{id:"fixture",label:"Synthetic",origin:"https://example.org",revision:"r1"},steps:runtimeProtocolStepIds(value).map(id=>({id,label:id,method:"GET",path:"meta",outcome:"unavailable",reason:"not_run",expected:"Controlled fixture"})),summary:{steps:999,observed:999,issues:0,unavailable:0}};}
test("every canonical protocol step belongs to exactly one named coverage family, preserving8/18/17/31 scopes",()=>{
  for(const[protocol,count]of[["booking-http-v1",8],["booking-http-v2",18],["booking-http-v3",17],["booking-http-v4",31]]as const){
    const value=plan(protocol),coverage=runtimeCoverage(value),ids=coverage.groups.flatMap(group=>group.stepIds);
    assert.equal(coverage.planned,count);assert.equal(coverage.state,"not_run");assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);assert.deepEqual([...ids].sort(),runtimeProtocolStepIds(value).sort());assert.ok(!coverage.groups.some(group=>group.id==="other"));
    for(const group of coverage.groups){assert.equal(group.observed,undefined);assert.equal(group.mismatched,undefined);assert.equal(group.unavailable,undefined);for(const language of["zh","en"]as const)assert.notEqual(runtimeCoverageFamilyName(group.id,language),group.id);}
  }
  assert.deepEqual(runtimeCoverage(plan("booking-http-v4")).groups.map(group=>group.planned),[1,6,5,6,8,2,3]);
});
test("coverage derives outcomes from named saved steps, not provider summary orHTTP status alone",()=>{
  const value=plan("booking-http-v4"),saved=report(value),before=structuredClone(saved);
  Object.assign(saved.steps.find(step=>step.id==="invalid_email")!,{status:201,outcome:"mismatch",actual:"HTTP201 must not be considered a successful rejection"});
  Object.assign(saved.steps.find(step=>step.id==="revision")!,{status:200,outcome:"observed",actual:"HTTP200 and matching declaration"});
  const unchanged=structuredClone(saved),coverage=runtimeCoverage(value,saved);
  assert.equal(coverage.state,"recorded");assert.equal(coverage.reportId,"r");
  assert.equal(coverage.groups.reduce((sum,group)=>sum+group.observed!,0),1);assert.equal(coverage.groups.reduce((sum,group)=>sum+group.mismatched!,0),1);assert.equal(coverage.groups.reduce((sum,group)=>sum+group.unavailable!,0),29);
  assert.equal(coverage.groups.find(group=>group.id==="invalid-input")!.mismatched,1);assert.deepEqual(saved,unchanged);assert.equal(before.summary.observed,999);
});
test("pending and absent evidence show only the plan; incompatible reports never borrow partial or old counts",()=>{
  const value=plan("booking-http-v4"),saved=report(value);
  assert.equal(runtimeCoverage(value,saved,true).state,"pending");assert.ok(runtimeCoverage(value,saved,true).groups.every(group=>group.observed===undefined));
  for(const modify of[(copy:RuntimeCheckReport)=>{copy.method="server-booking-http-v3";},(copy:RuntimeCheckReport)=>{copy.plan=plan("booking-http-v3");},(copy:RuntimeCheckReport)=>{copy.steps.pop();},(copy:RuntimeCheckReport)=>{copy.steps[1].id=copy.steps[0].id;}]){const copy=structuredClone(saved);modify(copy);const coverage=runtimeCoverage(value,copy);assert.equal(coverage.state,"unavailable");assert.equal(coverage.reportId,undefined);assert.ok(coverage.groups.every(group=>group.observed===undefined&&group.mismatched===undefined&&group.unavailable===undefined));}
});
