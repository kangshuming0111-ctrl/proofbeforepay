import assert from "node:assert/strict";
import test from "node:test";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {capacityRecipeNumbers,suggestSlotCapacity,validateBookingCapacityPlan,validateSlotCapacity} from "../lib/booking-capacity.ts";

const span=(excerpt:string,start=0)=>({start,end:start+excerpt.length,excerpt});
function plan(m=6,c=8){
  const source=span(`Each booking accepts at most ${m} people.`),capacity=span(`Each time slot accepts at most ${c} guests in total.`,source.end+1);
  return{protocol:"booking-http-v3",criterionId:"coverage-party",source,policy:suggestBookingPolicy(source)!,slotCapacity:{criterionId:"coverage-slot",...suggestSlotCapacity(capacity)!}};
}
test("complete English and Chinese capacity clauses preserve original punctuation and UTF-16 spans",()=>{
  for(const text of["Each time slot accepts at most 8 guests in total.","Every time slot allows a maximum of 9 people in total!","每个时段合计最多8人。","每個時段總共最多接待 8 位客人！","每个时间段最多12人"]){
    const source=span(text,3),value=suggestSlotCapacity(source)!;
    assert.ok(value);assert.deepEqual(value.source,source);assert.deepEqual(validateSlotCapacity(value,source),value);
  }
  const source=span("  Each time slot accepts at most 8 guests in total.  ","🍜".length),value=suggestSlotCapacity(source)!;
  assert.deepEqual(value.source,source);assert.equal(value.source.start,2);
});
test("minimums, exceptions, alternatives, compound policies and unsupported bounds are not guessed",()=>{
  for(const text of["Each time slot accepts at least 8 guests in total.","Each time slot accepts at most 8 guests in total except on Fridays.","Each time slot accepts at most 8 or 10 guests in total.","Each time slot accepts at most 8 guests in total. Each booking accepts at most 6 people.","Do not limit each time slot to 8 guests in total.","每个时段最多8人，节假日最多10人","每个时段至少8人","每个时段最多8到10人","每个时段最多08人","每个时段最多８人","每个时段最多2人","每个时段最多13人"]){
    assert.equal(suggestSlotCapacity(span(text)),undefined,text);
  }
});
test("a capacity citation cannot trim a compound original to a convenient supported substring",()=>{
  const full=span("Each time slot accepts at most 8 guests in total, except on Friday.");
  const shorter=span("Each time slot accepts at most 8 guests in total");
  assert.throws(()=>validateSlotCapacity({maxGuestsPerSlot:8,source:shorter},full));
  const original=span("Each time slot accepts at most 8 guests in total.");
  assert.throws(()=>validateSlotCapacity({maxGuestsPerSlot:8,source:{...original,end:original.end-1,excerpt:original.excerpt.slice(0,-1)}},original));
  assert.throws(()=>validateSlotCapacity({maxGuestsPerSlot:9,source:original},original));
});
test("v3 binds separate included clauses, exact source text and independently confirmed maxima",()=>{
  const raw=plan(),text=`${raw.source.excerpt}\n${raw.slotCapacity.source.excerpt}`;
  const criteria=[{id:raw.criterionId,source:raw.source.excerpt},{id:raw.slotCapacity.criterionId,source:raw.slotCapacity.source.excerpt}];
  const saved=validateBookingCapacityPlan(raw,{sourceText:text,criteria});assert.deepEqual(saved,raw);
  assert.deepEqual(capacityRecipeNumbers(saved),{maxPartySize:6,maxGuestsPerSlot:8,racePartySize:5,remainingPartySize:3});
  for(const mutate of[(v:typeof raw)=>{v.slotCapacity.criterionId=v.criterionId;},(v:typeof raw)=>{v.slotCapacity.source.start--;v.slotCapacity.source.end--;},(v:typeof raw)=>{v.slotCapacity.maxGuestsPerSlot=9;},(v:typeof raw)=>{v.policy.maxPartySize=7;}]){
    const copy=structuredClone(raw);mutate(copy);assert.throws(()=>validateBookingCapacityPlan(copy,{sourceText:text,criteria}));
  }
  assert.throws(()=>validateBookingCapacityPlan(raw,{criteria:criteria.slice(0,1)}));
  assert.throws(()=>validateBookingCapacityPlan(raw,{criteria:[criteria[0],{...criteria[1],source:"changed"}]}));
  saved.slotCapacity.source.excerpt="changed";assert.notEqual(raw.slotCapacity.source.excerpt,"changed");
});
test("only bounded recipes with two individually valid contenders and a positive fill are accepted",()=>{
  for(const[m,c]of[[2,3],[3,3],[6,8],[7,12],[12,12]]){
    const value=validateBookingCapacityPlan(plan(m,c)),n=capacityRecipeNumbers(value);
    assert.ok(n.racePartySize<=m);assert.ok(n.remainingPartySize>0&&n.remainingPartySize<=m);assert.ok(2*n.racePartySize>c);
  }
  for(const[m,c]of[[6,5],[6,12],[2,4],[3,8]])assert.throws(()=>validateBookingCapacityPlan(plan(m,c)));
});
test("malformed sources, getters, extra fields and unsupported protocols fail without evaluating getters",()=>{
  let accessed=false;const raw=plan();
  const withGetter=Object.defineProperty({...raw},"slotCapacity",{enumerable:true,get(){accessed=true;return raw.slotCapacity;}});
  assert.throws(()=>validateBookingCapacityPlan(withGetter));assert.equal(accessed,false);
  for(const source of[span("每个时段最多8人\n"),{...span("每个时段最多8人"),end:99},span("每个时段最多\u200b8人")])assert.throws(()=>suggestSlotCapacity(source));
  assert.throws(()=>validateBookingCapacityPlan({...raw,protocol:"booking-http-v2"}));
  assert.throws(()=>validateBookingCapacityPlan({...raw,confirmed:true}));
  assert.throws(()=>validateBookingCapacityPlan({...raw,slotCapacity:{...raw.slotCapacity,confirmed:true}}));
});
test("v4 explicitly reuses the same two complete source clauses without aliasing a saved v3 plan",()=>{
  const original=plan(),before=structuredClone(original),v3=validateBookingCapacityPlan(original),v4=validateBookingCapacityPlan({...original,protocol:"booking-http-v4"});
  assert.equal(v3.protocol,"booking-http-v3");assert.equal(v4.protocol,"booking-http-v4");assert.deepEqual({...v4,protocol:"booking-http-v3"},v3);assert.deepEqual(original,before);
  const shortened=structuredClone(v4);shortened.slotCapacity.source.end--;shortened.slotCapacity.source.excerpt=shortened.slotCapacity.source.excerpt.slice(0,-1);
  const text=`${original.source.excerpt}\n${original.slotCapacity.source.excerpt}`;
  assert.throws(()=>validateBookingCapacityPlan(shortened,{sourceText:text,criteria:[{id:original.criterionId,source:original.source.excerpt},{id:original.slotCapacity.criterionId,source:original.slotCapacity.source.excerpt}]}));
  assert.throws(()=>validateBookingCapacityPlan({...original,protocol:"booking-http-v5"}));
});
