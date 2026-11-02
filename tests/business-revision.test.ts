import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote, ProofDeliveryVersion, ProofBusinessCheckReport } from "../lib/contracts.ts";
import { parseStaticProject,createUploadedDelivery } from "../lib/static-project.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { createBusinessCheckReport,getBusinessCheckPlan } from "../lib/business-checks.ts";
import { compareBusinessRevision } from "../lib/business-revision.ts";
const summary="Show Beef noodles AUD18 on menu";
function quote(sequence:number):ProofQuote {
 const unit=summaryCoverageUnits(summary)[0], p=parseStaticProject({title:"Revision",summary,amount:"1",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:unit.id,disposition:"include"}]},businessChecks:{confirmed:true,items:[{id:"business-1",criterionId:unit.id,file:"index.html",source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:"item_price",label:"Beef noodles",amountMinor:1800,currency:"AUD"}}]}},"en");
 const delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Menu</title></head><body><p>Beef noodles AUD18</p></body></html>"},p.project,"en",sequence);delivery.submittedAt=`2026-11-02T00:0${sequence}:00Z`;
 return {id:"revision",reference:"PBP-REVISION",workflow:"proof-v1",title:p.title,summary,brief:summary,clientName:"Synthetic",language:"en",currency:"AUD",lineItems:[{id:"site",description:"Test",quantity:1,unitPriceCents:100}],hourlyRateCents:100,totalCents:100,timelineDays:1,assumptions:[],questions:[],status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:"2026-11-02T00:00:00Z",proof:{criteria:p.criteria,project:p.project,delivery,paymentState:"unfunded",audit:[]}};
}
function report(q:ProofQuote,blocks:string[]|undefined):ProofBusinessCheckReport {
 return createBusinessCheckReport(q,{deliveryId:q.proof.delivery!.id,previousReportId:q.proof.delivery!.businessChecks?.id??null,readings:getBusinessCheckPlan(q).map(s=>blocks?{stepId:s.stepId,status:"observed",blocks}:{stepId:s.stepId,status:"unavailable",reason:"load_failed"})});
}
function version(q:ProofQuote):ProofDeliveryVersion {return {delivery:q.proof.delivery!,feedback:[],archivedAt:"2026-11-02T00:09:00Z"};}
for(const [oldText,newText,state] of [["Beef noodles AUD28","Beef noodles AUD18","now_matches"],["Beef noodles AUD18","Beef noodles USD18","new_mismatch"],["Beef noodles AUD28","Beef noodles AUD28","still_mismatch"],["Beef noodles AUD18","Beef noodles AUD18","still_matches"]] as const) {
 test(`business revision keeps exact old/new excerpts: ${state}`,()=>{
  const a=quote(1),b=quote(2);a.proof.delivery!.businessChecks=report(a,[oldText]);b.proof.delivery!.businessChecks=report(b,[newText]);const before=structuredClone([a,b]);
  const r=compareBusinessRevision(b.proof.delivery!,version(a));assert.equal(r.rows.length,2);assert.ok(r.rows.every(row=>row.state===state));assert.equal(r.rows[0].previous!.status,"observed");
  assert.deepEqual([a,b],before);r.rows[0].step.source.excerpt="Outside mutation";assert.deepEqual([a,b],before);
 });
}
test("missing, uncertain, foreign or nonolder records cannot imply a correction",()=>{
 const a=quote(1),b=quote(2);a.proof.delivery!.businessChecks=report(a,undefined);b.proof.delivery!.businessChecks=report(b,["Beef noodles AUD18"]);
 assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows[0].state,"uncertain");
 delete a.proof.delivery!.businessChecks;assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows[0].state,"no_previous");
 a.proof.delivery!.businessChecks=report(a,["Beef noodles AUD28"]);a.proof.delivery!.businessChecks.deliveryId="foreign";assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows[0].state,"no_previous");
 a.proof.delivery!.businessChecks=report(a,["Beef noodles AUD28"]);a.proof.delivery!.sequence=9;assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows[0].state,"no_previous");
});
test("changed expected values cannot be called corrected and corrupt outcomes are rejected",()=>{
 const a=quote(1),b=quote(2);a.proof.delivery!.businessChecks=report(a,["Beef noodles AUD28"]);b.proof.delivery!.businessChecks=report(b,["Beef noodles AUD18"]);
 for(const row of a.proof.delivery!.businessChecks.readings)row.source.excerpt="Other original agreement";
 assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows[0].state,"plan_changed");
 b.proof.delivery!.businessChecks.readings[0].outcome="mismatch";assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows.length,0);
});
test("a missing width or duplicate step invalidates comparison while summary counters are never authority",()=>{
 const a=quote(1),b=quote(2);a.proof.delivery!.businessChecks=report(a,["Beef noodles AUD28"]);b.proof.delivery!.businessChecks=report(b,["Beef noodles AUD18"]);
 b.proof.delivery!.businessChecks.summary.issues=999;assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows[0].state,"now_matches");
 b.proof.delivery!.businessChecks.readings.pop();assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows.length,0);
 b.proof.delivery!.businessChecks=report(b,["Beef noodles AUD18"]);b.proof.delivery!.businessChecks.readings[1]=structuredClone(b.proof.delivery!.businessChecks.readings[0]);assert.equal(compareBusinessRevision(b.proof.delivery!,version(a)).rows.length,0);
});
