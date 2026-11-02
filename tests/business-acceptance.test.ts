import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote } from "../lib/contracts.ts";
import { parseStaticProject, createUploadedDelivery } from "../lib/static-project.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { getBusinessCheckPlan } from "../lib/business-checks.ts";
import { recordBusinessChecks } from "../lib/business-check-actions.ts";
import { validateBusinessDecision } from "../lib/business-decision.ts";
import { acceptDelivery, prepareReplacement } from "../lib/proof-workflow.ts";
import { businessReportsFor, assertAcceptedEvidenceReference, recordCaptureConsent } from "../lib/acceptance-evidence.ts";
import { validateAcceptance } from "../lib/proof-domain.ts";
const now="2026-11-02T02:00:00.000Z";
function fixture(): ProofQuote {
  const summary="Show Beef noodles AUD 18 on the English menu";
  const unit=summaryCoverageUnits(summary)[0];
  const project=parseStaticProject({title:"Business acceptance fixture",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:unit.id,disposition:"include"}]},businessChecks:{confirmed:true,items:[{id:"business-1",criterionId:unit.id,file:"index.html",source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:"item_price",label:"Beef noodles",amountMinor:1800,currency:"AUD"}}]}},"en");
  const delivery=createUploadedDelivery({"index.html":'<!doctype html><html><head><title>Test</title></head><body><p>Beef noodles AUD 18</p></body></html>'},project.project,"en",1);
  return {id:"business-fixture",reference:"PBP-BUSINESS",workflow:"proof-v1",title:project.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Test",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:now,proof:{project:project.project,criteria:project.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:now,mode:"demo",summary:"Synthetic rules only"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at:now,note:"Review"},feedback:[]}}};
}
function input(q:ProofQuote,text="Beef noodles AUD 18") {return {deliveryId:q.proof.delivery!.id,previousReportId:q.proof.delivery!.businessChecks?.id??null,readings:getBusinessCheckPlan(q).map(step=>({stepId:step.stepId,status:"observed",blocks:[text]}))};}
function consent(q:ProofQuote,reason?:string) {return {confirm:true,deliveryId:q.proof.delivery!.id,manualChecks:q.proof.delivery!.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId),businessDecision:{reportId:q.proof.delivery!.businessChecks?.id,...(reason?{exceptionReason:reason}:{})}};}

test("configured business checks require an exact saved run and explicit exception for mismatch",()=>{
 const q=fixture();assert.throws(()=>acceptDelivery(q,consent(q),now),/Run the agreed business/);
 const mismatch=recordBusinessChecks(q,"seller",input(q,"Beef noodles AUD 28"),now);
 assert.equal(mismatch.proof.delivery!.businessChecks!.summary.issues,2);
 assert.throws(()=>acceptDelivery(mismatch,consent(mismatch),now),/explain why/);
 assert.throws(()=>validateBusinessDecision(mismatch,{reportId:"stale",exceptionReason:"Known"}),/report changed/);
 const accepted=acceptDelivery(mismatch,consent(mismatch,"Buyer accepts this price exception after direct agreement"),now);
 const snapshot=accepted.proof.delivery!.acceptanceEvidence![0];
 assert.equal(snapshot.businessReportId,mismatch.proof.delivery!.businessChecks!.id);
 assert.equal(snapshot.businessExceptionReason,"Buyer accepts this price exception after direct agreement");
 assert.equal(accepted.proof.delivery!.businessChecks!.summary.issues,2);
 assert.equal(accepted.proof.paymentState,"unfunded");
});

test("history preserves report A and acceptance while later report B differs; capture still binds A",()=>{
 let q=fixture();q=recordBusinessChecks(q,"buyer",input(q),now);
 const accepted=acceptDelivery(q,consent(q),now), snapshot=structuredClone(accepted.proof.delivery!.acceptanceEvidence![0]);
 const supplement=recordBusinessChecks(accepted,"seller",input(accepted,"Beef noodles USD 18"),now);
 assert.equal(supplement.proof.delivery!.businessCheckHistory!.length,2);
 assert.deepEqual(supplement.proof.delivery!.acceptanceEvidence![0],snapshot);
 assert.doesNotThrow(()=>assertAcceptedEvidenceReference(supplement));
 supplement.proof.paymentState="authorized";supplement.proof.authorizationId="synthetic-only";supplement.proof.authorizationExpiresAt=new Date(Date.now()+60_000).toISOString();
 const checks=validateAcceptance(supplement,consent(supplement));
 const pending=recordCaptureConsent(supplement,checks,now);
 assert.equal(pending.proof.acceptedEvidenceSnapshotId,snapshot.id);
 assert.equal(pending.proof.delivery!.acceptanceEvidence![0].businessReportId,q.proof.delivery!.businessChecks!.id);
 const broken=structuredClone(supplement);broken.proof.delivery!.businessCheckHistory=broken.proof.delivery!.businessCheckHistory!.slice(1);
 assert.throws(()=>assertAcceptedEvidenceReference(broken),/unavailable/);
});

test("a newer report invalidates an earlier acceptance request and unknown observations need a reason",()=>{
 let q=fixture();q=recordBusinessChecks(q,"buyer",input(q),now);const old=consent(q);
 const unavailable={...input(q),readings:getBusinessCheckPlan(q).map(s=>({stepId:s.stepId,status:"unavailable",reason:"load_failed"}))};
 q=recordBusinessChecks(q,"buyer",unavailable,now);
 assert.throws(()=>acceptDelivery(q,old,now),/report changed/);
 assert.throws(()=>acceptDelivery(q,consent(q),now),/explain why/);
 assert.equal(acceptDelivery(q,consent(q,"Observed directly in a separate review"),now).proof.collaboration!.stage,"accepted");
});

test("replacement drops all business observations and acceptance but archive remains untouched",()=>{
 let q=fixture();q=recordBusinessChecks(q,"buyer",input(q),now);const before=structuredClone(q);
 q.proof.collaboration!.stage="changes_requested";
 const nextDelivery={...structuredClone(q.proof.delivery!),id:"fresh-delivery"};
 const replacement=prepareReplacement(q,nextDelivery);
 assert.equal(replacement.proof.delivery!.businessChecks,undefined);assert.equal(replacement.proof.delivery!.businessCheckHistory,undefined);
 assert.equal(before.proof.delivery!.businessCheckHistory!.length,1);
 assert.throws(()=>recordBusinessChecks(replacement,"seller",input(before),now),/current delivery/);
});

test("single-user financial consent freezes business evidence and pending retry needs no newer decision",()=>{
 let q=fixture();q=recordBusinessChecks(q,"buyer",input(q),now);delete q.proof.collaboration;
 q.proof.paymentState="authorized";q.proof.authorizationId="synthetic-only";q.proof.authorizationExpiresAt=new Date(Date.now()+60_000).toISOString();
 assert.throws(()=>validateAcceptance(q,{...consent(q),businessDecision:undefined}),/Confirm the exact/);
 const decision=validateBusinessDecision(q,consent(q).businessDecision), checks=validateAcceptance(q,consent(q));
 const pending=recordCaptureConsent(q,checks,now,decision);
 assert.doesNotThrow(()=>validateAcceptance(pending,{confirm:true,deliveryId:pending.proof.delivery!.id,manualChecks:checks}));
 assert.equal(pending.proof.delivery!.acceptanceEvidence![0].businessReportId,q.proof.delivery!.businessChecks!.id);
});

test("observation append is immutable and role derived; replay, pending payment and limits reject",()=>{
 const q=fixture(),first=recordBusinessChecks(q,"seller",input(q),now);
 assert.equal(q.proof.delivery!.businessChecks,undefined);assert.equal(first.proof.delivery!.businessChecks!.reportedByRole,"seller");
 assert.equal(first.proof.audit.at(-1)!.kind,"business_checked");
 assert.throws(()=>recordBusinessChecks(first,"buyer",input(q),now),/changed/);
 const pending=structuredClone(first);pending.proof.paymentOperation="capture";
 assert.throws(()=>recordBusinessChecks(pending,"buyer",input(pending),now),/pending/);
 const copies=businessReportsFor(first.proof.delivery!);copies[0].readings=[];
 assert.equal(first.proof.delivery!.businessChecks!.readings.length,2);
});
