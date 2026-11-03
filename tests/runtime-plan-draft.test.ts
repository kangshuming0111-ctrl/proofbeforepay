import assert from "node:assert/strict";
import test from "node:test";
import {buildRuntimePlanDraft,confirmedRuntimeDraft,CAPACITY_EXAMPLE_REQUIREMENTS} from "../lib/runtime-plan-draft.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
function input(source=CAPACITY_EXAMPLE_REQUIREMENTS){const units=summaryCoverageUnits(source);return{protocol:"booking-http-v3" as const,criterionId:units[0].id,capacityCriterionId:units[1].id,units,decisions:units.map(unit=>({id:unit.id,disposition:"include" as const}))};}
test("capacity intake retains two separate complete original quotes and requires explicit adoption",()=>{
  const source=CAPACITY_EXAMPLE_REQUIREMENTS,draft=buildRuntimePlanDraft(input());
  assert.equal(draft.ready,true);assert.throws(()=>confirmedRuntimeDraft(draft,false));
  const adopted=confirmedRuntimeDraft(draft,true);assert.equal(adopted.protocol,"booking-http-v3");
  if(adopted.protocol!=="booking-http-v3")throw new Error("wrong protocol");
  assert.equal(adopted.policy.maxPartySize,6);assert.equal(adopted.slotCapacity.maxGuestsPerSlot,8);
  assert.notEqual(adopted.criterionId,adopted.slotCapacity.criterionId);
  for(const quote of [adopted.source,adopted.slotCapacity.source]){assert.equal(source.slice(quote.start,quote.end),quote.excerpt);assert.ok(quote.excerpt.endsWith("."));}
  adopted.slotCapacity.maxGuestsPerSlot=9;assert.equal(draft.slotCapacity?.maxGuestsPerSlot,8);
});
test("excluded, pending, same-row or changed unsupported capacity clauses cannot be adopted",()=>{
  for(const disposition of ["exclude","pending"] as const){const value=input();const decisions=[value.decisions[0],{id:value.capacityCriterionId,disposition}];const draft=buildRuntimePlanDraft({...value,decisions});assert.equal(draft.ready,false);assert.throws(()=>confirmedRuntimeDraft(draft,true));}
  const same=input();assert.equal(buildRuntimePlanDraft({...same,capacityCriterionId:same.criterionId}).ready,false);
  for(const source of ["Each booking accepts at most 6 people.\nEach time slot accepts at most 8 guests in total, except weekends.","Each booking accepts at most 6 people.\nEach time slot accepts at most 12 guests in total.","Each booking accepts at most 6 people.\nEach time slot accepts at most 5 guests in total."]){assert.equal(buildRuntimePlanDraft(input(source)).ready,false);}
});
test("switching protocols rebuilds the draft and preserves v1/v2 behavior without capacity inference",()=>{
  const value=input();const v2=buildRuntimePlanDraft({...value,protocol:"booking-http-v2",capacityCriterionId:""});assert.equal(v2.ready,true);assert.equal(v2.plan?.protocol,"booking-http-v2");assert.equal(v2.slotCapacity,undefined);
  const v1=buildRuntimePlanDraft({...value,protocol:"booking-http-v1",criterionId:value.capacityCriterionId});assert.equal(v1.ready,true);assert.equal(v1.policy,undefined);
  assert.equal(buildRuntimePlanDraft({...value,criterionId:""}).ready,false);
});

test("fresh capacity example proposesv4 butv3 remains a separate17-step agreement requiring its own confirmation",async()=>{
  const {CAPACITY_EXAMPLE_PROTOCOL}=await import("../lib/runtime-plan-draft.ts");assert.equal(CAPACITY_EXAMPLE_PROTOCOL,"booking-http-v4");
  for(const protocol of["booking-http-v3","booking-http-v4"]as const){const value=input(),draft=buildRuntimePlanDraft({...value,protocol});assert.equal(draft.ready,true);assert.equal(draft.plan?.protocol,protocol);assert.throws(()=>confirmedRuntimeDraft(draft,false));const adopted=confirmedRuntimeDraft(draft,true);assert.equal(adopted.protocol,protocol);if(adopted.protocol!=="booking-http-v3"&&adopted.protocol!=="booking-http-v4")throw new Error("capacity fixture");assert.equal(adopted.slotCapacity.maxGuestsPerSlot,8);assert.equal(adopted.source.excerpt,value.units[0].text);}
});
