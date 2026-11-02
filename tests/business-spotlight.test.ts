import assert from "node:assert/strict";
import test from "node:test";
import type { ProofBusinessCheckStep, ProofDeliveryVersion, ProofQuote } from "../lib/contracts.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { createBusinessCheckReport, getBusinessCheckPlan } from "../lib/business-checks.ts";
import { businessSpotlight, businessSpotlightFeedback } from "../lib/business-spotlight.ts";

const items=[{label:"Beef noodles",price:1800},{label:"Soup",price:900},{label:"Tea",price:300}];
function quote(sequence:number,count=1):ProofQuote {
  const selected=items.slice(0,count),summary=selected.map(item=>`Show ${item.label} AUD${item.price/100} on menu`).join("\n"),units=summaryCoverageUnits(summary);
  const p=parseStaticProject({title:"Spotlight",summary,amount:"1",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(unit=>({id:unit.id,disposition:"include"}))},businessChecks:{confirmed:true,items:selected.map((item,index)=>({id:`business-${index+1}`,criterionId:units[index].id,file:"index.html",source:{start:units[index].start,end:units[index].end,excerpt:units[index].text},expected:{kind:"item_price",label:item.label,amountMinor:item.price,currency:"AUD"}}))}},"en");
  const delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Menu</title></head><body><p>Menu</p></body></html>"},p.project,"en",sequence);delivery.submittedAt=`2026-11-02T00:0${sequence}:00Z`;
  return {id:"spotlight",reference:"PBP-SPOTLIGHT",workflow:"proof-v1",title:p.title,summary,brief:summary,clientName:"Synthetic",language:"en",currency:"AUD",lineItems:[{id:"site",description:"Test",quantity:1,unitPriceCents:100}],hourlyRateCents:100,totalCents:100,timelineDays:1,assumptions:[],questions:[],status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:"2026-11-02T00:00:00Z",proof:{criteria:p.criteria,project:p.project,delivery,paymentState:"unfunded",audit:[]}};
}
function report(q:ProofQuote,fn:(step:ProofBusinessCheckStep)=>string[]|undefined) {
  const d=q.proof.delivery!;
  d.businessChecks=createBusinessCheckReport(q,{deliveryId:d.id,previousReportId:d.businessChecks?.id??null,readings:getBusinessCheckPlan(q).map(step=>{const blocks=fn(step);return blocks?{stepId:step.stepId,status:"observed",blocks}:{stepId:step.stepId,status:"unavailable",reason:"load_failed"};})});
}
function version(q:ProofQuote):ProofDeliveryVersion{return {delivery:q.proof.delivery!,feedback:[],archivedAt:"2026-11-02T00:09:00Z"};}
const normal=(step:ProofBusinessCheckStep)=>step.expected.kind==="item_price"?[`${step.expected.label} ${step.expected.currency}${step.expected.amountMinor/100}`]:[step.expected.text];

test("first-version mismatch remains a current observation, two widths are one group rather than two problems",()=>{
  const q=quote(1);report(q,()=>["Beef noodles AUD28"]);const before=structuredClone(q),data=businessSpotlight(q.proof.delivery!)!;
  assert.equal(data.issues,2);assert.equal(data.observations,2);assert.equal(data.checkCount,1);assert.equal(data.groups.length,1);assert.deepEqual(data.groups[0].widths,[375,900]);
  assert.equal(data.groups[0].row.state,"no_previous");assert.equal(data.groups[0].previousComparable,false);assert.deepEqual(q,before);
});
test("genuine correction retains exact comparable earlier/current text while ignoring forged summary counts",()=>{
  const a=quote(1),b=quote(2);report(a,()=>["Beef noodles AUD28"]);report(b,normal);b.proof.delivery!.businessChecks!.summary.issues=999;
  const data=businessSpotlight(b.proof.delivery!,version(a))!;assert.equal(data.issues,0);assert.equal(data.matching,2);assert.equal(data.groups[0].row.state,"now_matches");assert.equal(data.groups[0].previousComparable,true);
  assert.deepEqual(data.groups[0].row.previous?.status==="observed"&&data.groups[0].row.previous.blocks,["Beef noodles AUD28"]);
  data.groups[0].row.step.source.excerpt="outside mutation";assert.notEqual(b.proof.delivery!.businessChecks!.readings[0].source.excerpt,"outside mutation");
});
test("changed plans, unavailable old readings and nonolder deliveries never supply a comparable correction",()=>{
  const a=quote(1),b=quote(2);report(a,()=>["Beef noodles AUD28"]);report(b,normal);
  for(const row of a.proof.delivery!.businessChecks!.readings)row.source.excerpt="Different original plan";
  let group=businessSpotlight(b.proof.delivery!,version(a))!.groups[0];assert.equal(group.row.state,"plan_changed");assert.equal(group.previousComparable,false);
  report(a,()=>undefined);group=businessSpotlight(b.proof.delivery!,version(a))!.groups[0];assert.equal(group.row.state,"uncertain");assert.equal(group.previousComparable,false);
  report(a,()=>["Beef noodles AUD28"]);a.proof.delivery!.sequence=9;group=businessSpotlight(b.proof.delivery!,version(a))!.groups[0];assert.equal(group.row.state,"no_previous");assert.equal(group.previousComparable,false);
});
test("foreign, partial, duplicated or forged current outcomes suppress the spotlight",()=>{
  const q=quote(1);report(q,normal);const d=q.proof.delivery!;d.businessChecks!.deliveryId="other";assert.equal(businessSpotlight(d),undefined);
  report(q,normal);d.businessChecks!.readings.pop();assert.equal(businessSpotlight(d),undefined);
  report(q,normal);d.businessChecks!.readings[1]=structuredClone(d.businessChecks!.readings[0]);assert.equal(businessSpotlight(d),undefined);
  report(q,normal);d.businessChecks!.readings[0].outcome="mismatch";assert.equal(businessSpotlight(d),undefined);
});
test("different observations at different widths are not collapsed",()=>{
  const q=quote(1);report(q,step=>step.viewportWidth===375?["Beef noodles AUD28"]:["Beef noodles AUD18"]);
  const data=businessSpotlight(q.proof.delivery!)!;assert.equal(data.groups.length,2);assert.equal(data.issues,1);assert.deepEqual(data.groups[0].widths,[375]);assert.deepEqual(data.groups[1].widths,[900]);
});
test("priority is current mismatch, uncertain/changed-plan, genuine now-matching then ordinary matching",()=>{
  const a=quote(1,3),b=quote(2,3);report(a,step=>step.checkId==="business-1"?["Beef noodles AUD28"]:normal(step));
  report(b,step=>step.checkId==="business-2"?undefined:step.checkId==="business-3"?["Tea AUD4"]:normal(step));
  const data=businessSpotlight(b.proof.delivery!,version(a))!;assert.deepEqual(data.groups.map(g=>g.row.step.checkId),["business-3","business-2","business-1"]);assert.equal(data.issues,2);assert.equal(data.unavailable,2);assert.equal(data.matching,2);
});
test("identical current widths remain separate when their comparable earlier observations differ",()=>{
  const a=quote(1),b=quote(2);report(a,step=>step.viewportWidth===375?["Beef noodles AUD28"]:["Beef noodles AUD29"]);report(b,normal);
  const data=businessSpotlight(b.proof.delivery!,version(a))!;assert.equal(data.groups.length,2);assert.ok(data.groups.every(group=>group.row.state==="now_matches"));
});
test("feedback is bounded editable source-grounded text for this exact delivery, with no source mutation",()=>{
  const q=quote(1);report(q,()=>["Beef noodles AUD28"]);const group=businessSpotlight(q.proof.delivery!)!.groups[0],before=structuredClone(q);
  const draft=businessSpotlightFeedback(q.proof.delivery!.id,group,"en");assert.equal(draft.deliveryId,q.proof.delivery!.id);assert.equal(draft.criterionId,group.row.step.criterionId);assert.match(draft.comment,/draft for buyer review/);assert.match(draft.comment,/AUD28/);assert.match(draft.comment,/AUD 18\.00/);assert.ok(draft.comment.length<=1000);assert.deepEqual(q,before);
});
