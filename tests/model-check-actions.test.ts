import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {DomainError} from "../lib/domain.ts";
import {acceptanceBasis} from "../lib/acceptance-basis.ts";
import {acceptDelivery,prepareReplacement,requestChanges,snapshotVersion} from "../lib/proof-workflow.ts";
import {validateAcceptance} from "../lib/proof-domain.ts";
import {assertAcceptedEvidenceReference,recordCaptureConsent} from "../lib/acceptance-evidence.ts";
import {beginProjectJourneyRun} from "../lib/project-journey-actions.ts";
import {assertQuoteEvidenceBudget,acceptanceSnapshotReservationBytes,MODEL_REPORT_RESERVATION_BYTES} from "../lib/evidence-budget.ts";
import {createUploadedDelivery} from "../lib/static-project.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {beginModelCheckRun,recordModelCheckCheckpoint,finishModelCheckRun,closeExpiredModelCheckRun,modelReportsFor,validateModelDecision} from "../lib/model-check-actions.ts";
import {modelCheckReportFromTrace,MODEL_REPORT_BYTES} from "../lib/model-checks.ts";
import {modelFixture,modelInput,modelTrace,completeModel,modelConsent} from "./model-check-fixture.ts";
const code=(status:number)=>(error:unknown)=>error instanceof DomainError&&error.status===status;

test("model starts reserve actual acceptance and32KiB before I/O; stale role/seed/upload/target and concurrent runs reject",async()=>{
 const f=await modelFixture(),input=modelInput(f.quote,f.registration.id),before=structuredClone(f.quote),pending=beginModelCheckRun(f.quote,"seller",input,f.digest,f.registration);
 assert.deepEqual(f.quote,before);assert.equal(MODEL_REPORT_BYTES,MODEL_REPORT_RESERVATION_BYTES);assert.equal(pending.proof.delivery!.modelEvidenceReservation!.reportBytes,32768);assert.ok(pending.proof.delivery!.modelEvidenceReservation!.acceptanceBytes>=acceptanceSnapshotReservationBytes(pending));
 for(const patch of [{confirm:false},{seed:-1},{seed:0x100000000},{deliveryId:"old"},{previousReportId:"old"},{targetId:"wrong"},{url:"https://caller.example.org/"}])assert.throws(()=>beginModelCheckRun(f.quote,"seller",{...input,...patch},f.digest,f.registration),DomainError);
 assert.throws(()=>beginModelCheckRun(pending,"buyer",input,f.digest,f.registration),code(409));assert.throws(()=>beginProjectJourneyRun(pending,"buyer",{action:"start",deliveryId:input.deliveryId,previousReportId:f.quote.proof.delivery!.journeyReport!.id,targetId:f.registration.id,confirm:true},f.digest,f.registration),code(409));
 const payment=structuredClone(f.quote);payment.proof.paymentOperation="capture";assert.throws(()=>beginModelCheckRun(payment,"buyer",input,f.digest,f.registration),code(409));
 assert.throws(()=>beginModelCheckRun(f.quote,"seller",input,"0".repeat(64),f.registration),code(409));
});

test("durable intent becomes a settled checkpoint once; expired close is zero-network and late completion cannot replace it",async()=>{
 const f=await modelFixture(),started=beginModelCheckRun(f.quote,"buyer",modelInput(f.quote,f.registration.id),f.digest,f.registration),run=started.proof.delivery!.modelRun!,full=modelTrace(run),intent={...full[0],completedOrdinal:null};delete intent.status;delete intent.body;
 const invoked=recordModelCheckCheckpoint(started,run.id,[intent]),settled=recordModelCheckCheckpoint(invoked,run.id,[full[0]]);
 assert.throws(()=>recordModelCheckCheckpoint(settled,run.id,[{...full[0],status:201}]),code(409));assert.throws(()=>recordModelCheckCheckpoint(settled,run.id,[]),code(409));
 assert.throws(()=>closeExpiredModelCheckRun(settled,"buyer",{action:"close",deliveryId:run.deliveryId,runId:run.id}),code(409));
 const closed=closeExpiredModelCheckRun(settled,"seller",{action:"close",deliveryId:run.deliveryId,runId:run.id},Date.parse(run.expiresAt)+1);
 assert.equal(closed.proof.delivery!.modelRun,undefined);assert.equal(closed.proof.delivery!.modelReport!.result.outcome,"inconclusive");assert.deepEqual(closed.proof.delivery!.modelReport!.trace,[full[0]]);assert.equal(closed.proof.delivery!.modelEvidenceReservation!.reportBytes,0);
 assert.throws(()=>finishModelCheckRun(closed,run.id,modelCheckReportFromTrace(run,full,new Date(Date.parse(run.expiresAt)+2).toISOString())),code(409));
});

test("four model histories are immutable and bounded; no fifth lease or overwritten identifier is accepted",async()=>{
 const f=await modelFixture();let q=f.quote;for(let seed=0;seed<4;seed++)q=completeModel(q,f.digest,f.registration,seed);
 assert.equal(modelReportsFor(q.proof.delivery!).length,4);assert.throws(()=>beginModelCheckRun(q,"seller",modelInput(q,f.registration.id,5),f.digest,f.registration),code(409));
 const corrupt=structuredClone(q.proof.delivery!);corrupt.modelHistory![3]={...corrupt.modelReport!,seed:99};assert.throws(()=>modelReportsFor(corrupt),code(409));
});

test("new model report invalidates null and stale model consent; compatible still requires an explicit server-check acknowledgement",async()=>{
 const f=await modelFixture(),old=modelConsent(f.quote),q=completeModel(f.quote,f.digest,f.registration),before=structuredClone(q);
 assert.equal(old.expectedEvidence.modelReportId,null);assert.throws(()=>acceptDelivery(q,{...modelConsent(q),expectedEvidence:old.expectedEvidence}),code(409));
 for(const modelDecision of [undefined,{reportId:q.proof.delivery!.modelReport!.id,acknowledgeServerCheck:false},{reportId:"old",acknowledgeServerCheck:true}])assert.throws(()=>acceptDelivery(q,{...modelConsent(q),modelDecision}),DomainError);
 const accepted=acceptDelivery(q,modelConsent(q)),snapshot=accepted.proof.delivery!.acceptanceEvidence!.at(-1)!;
 assert.equal(snapshot.modelReportId,q.proof.delivery!.modelReport!.id);assert.equal(snapshot.modelDecision!.acknowledgeServerCheck,true);assert.deepEqual(q,before);
 const b=completeModel(q,f.digest,f.registration,43);assert.throws(()=>acceptDelivery(b,{...modelConsent(b),expectedEvidence:acceptanceBasis(q)}),code(409));
});

test("violated and inconclusive model results need bounded explicit exception reasons",async()=>{
 const f=await modelFixture(),violated=completeModel(f.quote,f.digest,f.registration,42,"violated");assert.equal(violated.proof.delivery!.modelReport!.result.outcome,"violated");
 for(const exceptionReason of [undefined,"short","x".repeat(501)])assert.throws(()=>validateModelDecision(violated,{reportId:violated.proof.delivery!.modelReport!.id,acknowledgeServerCheck:true,exceptionReason}),DomainError);
 assert.equal(acceptDelivery(violated,modelConsent(violated)).proof.collaboration!.stage,"accepted");
 const pending=beginModelCheckRun(f.quote,"seller",modelInput(f.quote,f.registration.id),f.digest,f.registration),run=pending.proof.delivery!.modelRun!,closed=closeExpiredModelCheckRun(pending,"buyer",{action:"close",deliveryId:run.deliveryId,runId:run.id},Date.parse(run.expiresAt)+1);
 assert.equal(acceptDelivery(closed,modelConsent(closed)).proof.collaboration!.stage,"accepted");
});

test("frozen model A remains accepted and paid evidence when a different supplemental B is added",async()=>{
 const f=await modelFixture(),a=completeModel(f.quote,f.digest,f.registration),accepted=acceptDelivery(a,modelConsent(a)),snapshot=structuredClone(accepted.proof.delivery!.acceptanceEvidence!.at(-1)!);
 const b=completeModel(accepted,f.digest,f.registration,43,"violated");assert.deepEqual(b.proof.delivery!.acceptanceEvidence!.at(-1),snapshot);assert.doesNotThrow(()=>assertAcceptedEvidenceReference(b));
 b.proof.paymentState="authorized";b.proof.authorizationId="SYNTHETIC-AUTH";b.proof.authorizationExpiresAt=new Date(Date.now()+60000).toISOString();
 const input={confirm:true,deliveryId:b.proof.delivery!.id,manualChecks:snapshot.manualChecks,acceptedEvidenceSnapshotId:snapshot.id};const pending=recordCaptureConsent(b,validateAcceptance(b,input),new Date().toISOString());
 assert.equal(pending.proof.acceptedEvidenceSnapshotId,snapshot.id);assert.equal(pending.proof.delivery!.acceptanceEvidence!.at(-1)!.modelReportId,snapshot.modelReportId);
 const missing=structuredClone(b);missing.proof.delivery!.modelHistory=missing.proof.delivery!.modelHistory!.filter(row=>row.id!==snapshot.modelReportId);assert.throws(()=>assertAcceptedEvidenceReference(missing),code(409));
});

test("model feedback binds the current additional report without requiring a20-step report or inventing an original citation",async()=>{
 const f=await modelFixture(),q=completeModel(f.quote,f.digest,f.registration,42,"violated");delete q.proof.delivery!.journeyReport;delete q.proof.delivery!.journeyHistory;
 const entry={criterionId:"model-agreement",comment:"Please repair the native concurrent booking state",modelReportId:q.proof.delivery!.modelReport!.id};
 const returned=requestChanges(q,{deliveryId:q.proof.delivery!.id,feedback:[entry]});assert.equal(returned.proof.collaboration!.feedback.at(-1)!.modelReportId,entry.modelReportId);assert.equal(returned.proof.collaboration!.feedback.at(-1)!.journeyReportId,undefined);
 for(const patch of [{modelReportId:"old"},{journeyReportId:"forged"},{source:{excerpt:"fake contract"}}])assert.throws(()=>requestChanges(q,{deliveryId:q.proof.delivery!.id,feedback:[{...entry,...patch}]}),DomainError);
 assert.throws(()=>requestChanges(q,{deliveryId:q.proof.delivery!.id,feedback:[{...entry,criterionId:q.proof.criteria[0].id}]}),DomainError);
 const archive=snapshotVersion(returned),replacement=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Revised</title></head><body>Updated</body></html>"},q.proof.project!,"en",2),next=prepareReplacement(returned,replacement);
 for(const key of ["modelRun","modelReport","modelHistory","modelEvidenceReservation"] as const)assert.equal(next.proof.delivery![key],undefined);assert.equal(archive.delivery.modelReport!.id,entry.modelReportId);
});

test("offline export recomputes seed/model outcome and retained A references without network",async()=>{
 const f=await modelFixture(),q=completeModel(f.quote,f.digest,f.registration),accepted=acceptDelivery(q,modelConsent(q)),b=completeModel(accepted,f.digest,f.registration,43,"violated"),bundle=await createEvidenceExport(b);
 assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
 for(const mutate of [(copy:typeof bundle)=>{copy.delivery.modelReport!.seed++;},(copy:typeof bundle)=>{copy.delivery.modelHistory=[];},(copy:typeof bundle)=>{copy.delivery.acceptanceEvidence!.at(-1)!.modelReportId="missing";},(copy:typeof bundle)=>{copy.delivery.modelReport!.result.outcome="compatible";}]){const copy=structuredClone(bundle);mutate(copy);assert.equal((await verifyEvidenceExport(copy)).consistency,"inconsistent");}
 const pending=beginModelCheckRun(f.quote,"seller",modelInput(f.quote,f.registration.id),f.digest,f.registration);assert.doesNotThrow(()=>assertQuoteEvidenceBudget(pending));assert.equal((await verifyEvidenceExport(await createEvidenceExport(pending))).consistency,"consistent");
});
