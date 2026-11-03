import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {acceptDelivery} from "../lib/proof-workflow.ts";
import {acceptanceBasis} from "../lib/acceptance-basis.ts";
import {proofReadiness,captureEvidenceReady} from "../lib/proof-readiness.ts";

function fixture():ProofQuote{
 const parsed=parseStaticProject({title:"Readiness evidence",summary:"Deliver a workshop website.",amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en"),at=new Date().toISOString();
 const delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Workshop</title></head><body><h1>Fictional workshop</h1></body></html>"},parsed.project,"en",1);
 return {id:"readiness-project",reference:"PBP-READY",workflow:"proof-v1",title:parsed.title,summary:parsed.summary,brief:parsed.summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Workshop",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"sandbox",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Source reviewed"},paymentState:"unfunded",audit:[],collaboration:{stage:"submitted",feedback:[],submission:{deliveryId:delivery.id,note:"Synthetic",at}}}};
}
test("readiness is read-only and pending evidence blocks financial controls even with an earlier acceptance",()=>{
 let q=fixture();q=acceptDelivery(q,{deliveryId:q.proof.delivery!.id,confirm:true,manualChecks:q.proof.delivery!.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId),expectedEvidence:acceptanceBasis(q)});
 q.proof.delivery!.journeyRun={id:"pending-supplement"} as never;
 const before=structuredClone(q),ready=proofReadiness(q,"buyer");
 assert.equal(ready.financialActionsBlockedByRun,true);assert.ok(ready.blockers.some(r=>r.phase==="payment"&&r.code==="checks_running"));assert.equal(ready.frozenAcceptance?.valid,true);assert.deepEqual(q,before);assert.equal(ready.limits.providerQueried,false);assert.equal(ready.limits.automaticConsent,false);
});
test("current supplements are separate from frozen acceptance, and missing legacy snapshots are unknown",()=>{
 let q=fixture();q=acceptDelivery(q,{deliveryId:q.proof.delivery!.id,confirm:true,manualChecks:q.proof.delivery!.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId),expectedEvidence:acceptanceBasis(q)});
 const frozen=q.proof.delivery!.acceptanceEvidence![0];
 q.proof.delivery!.assessment={id:"supplemental-assessment-B",deliveryId:q.proof.delivery!.id} as never;
 const ready=proofReadiness(q,"seller");assert.equal(ready.frozenAcceptance?.snapshotId,frozen.id);assert.equal(ready.frozenAcceptance?.assessmentId,null);assert.deepEqual(ready.supplementalDifferences,[{kind:"assessmentId",acceptedReportId:null,currentReportId:"supplemental-assessment-B"}]);assert.equal(ready.payment.canRetryOriginalOperation,false);
 delete q.proof.delivery!.acceptanceEvidence;
 const legacy=proofReadiness(q,"buyer");assert.equal(legacy.frozenAcceptance,null);assert.ok(legacy.blockers.some(row=>row.code==="frozen_evidence_inconsistent"));
});

test("legacy pending capture without a frozen snapshot offers reconciliation but never a new capture retry",()=>{
 const q=fixture();q.proof.paymentState="authorized";q.proof.authorizationId="synthetic-auth";q.proof.paymentOperation="capture";q.proof.authorizationExpiresAt=new Date(Date.now()-1000).toISOString();
 const ready=proofReadiness(q,"buyer");assert.equal(ready.frozenAcceptance,null);assert.equal(ready.payment.canRetryOriginalOperation,false);assert.equal(ready.payment.canRequestReconciliation,true);assert.ok(ready.blockers.some(row=>row.code==="frozen_evidence_inconsistent"));
});

test("accepted and pending capture need retained evidence while first single-user consent uses the current basis",()=>{
 let q=fixture();delete q.proof.collaboration;assert.equal(captureEvidenceReady(q),true);
 q=fixture();q=acceptDelivery(q,{deliveryId:q.proof.delivery!.id,confirm:true,manualChecks:q.proof.delivery!.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId),expectedEvidence:acceptanceBasis(q)});
 assert.equal(captureEvidenceReady(q),true);q.proof.paymentState="authorized";q.proof.authorizationId="synthetic-auth";q.proof.authorizationExpiresAt=new Date(Date.now()-1000).toISOString();q.proof.paymentOperation="capture";
 const valid=proofReadiness(q,"buyer");assert.equal(valid.payment.canRetryOriginalOperation,true);assert.equal(valid.payment.canRequestReconciliation,true);assert.ok(!valid.blockers.some(row=>row.code==="frozen_evidence_inconsistent"));
 delete q.proof.paymentOperation;delete q.proof.delivery!.acceptanceEvidence;delete q.proof.collaboration!.acceptance!.evidenceSnapshotId;
 assert.equal(captureEvidenceReady(q),false);assert.ok(proofReadiness(q,"buyer").blockers.some(row=>row.code==="frozen_evidence_inconsistent"));
});
