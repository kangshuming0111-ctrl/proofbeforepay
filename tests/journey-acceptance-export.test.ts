import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {confirmProjectJourneyPlan,beginProjectJourneyRun,finishProjectJourneyRun} from "../lib/project-journey-actions.ts";
import {validateProjectJourneyDecision,evaluateStoredProjectJourneyReport,type JourneyRegistrationSnapshot} from "../lib/project-journey.ts";
import {prepareReplacement} from "../lib/proof-workflow.ts";
import {assertAcceptedEvidenceReference} from "../lib/acceptance-evidence.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {assertQuoteEvidenceBudget,EVIDENCE_HISTORY_BYTE_LIMIT} from "../lib/evidence-budget.ts";
const at=new Date().toISOString();
async function fixture(){
 const parsed=parseStaticProject({title:"Journey archive counterexamples",summary:"Deliver a booking page.",amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en");
 const delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Fictional booking</title></head><body><h1>Booking</h1></body></html>"},parsed.project,"en",1);
 let quote:ProofQuote={id:"journey-export-project",reference:"PBP-JOURNEY-EXPORT",workflow:"proof-v1",title:parsed.title,summary:parsed.summary,brief:parsed.summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic site",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Source checked"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Synthetic"},feedback:[]}}};
 quote=confirmProjectJourneyPlan(quote,"buyer",{deliveryId:delivery.id,confirm:true},at);
 const registration:JourneyRegistrationSnapshot={id:"seller-export-reference",label:"Developer reference staging",projectId:quote.id,registrationRevision:"reference-1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:"https://staging.example/seller/index.html",backendBaseUrl:"https://staging.example/seller/pbp/",deploymentRevision:"lifecycle-fixed-v1",frontendBundleDigest:await runtimeDeliveryDigest(delivery.files),scenario:"fixed",expiresAt:"2099-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
 return{quote,registration};
}
function closeWithoutNetwork(q:ProofQuote,r:JourneyRegistrationSnapshot){q=beginProjectJourneyRun(q,"buyer",{deliveryId:q.proof.delivery!.id,previousReportId:q.proof.delivery!.journeyReport?.id??null,targetId:r.id,confirm:true},r.frontendBundleDigest,r);return finishProjectJourneyRun(q,"buyer",{deliveryId:q.proof.delivery!.id,runId:q.proof.delivery!.journeyRun!.id},new Date().toISOString(),true);}
function decision(q:ProofQuote){const report=q.proof.delivery!.journeyReport!;return{reportId:report.id,acknowledgeClientObservation:true,acknowledgedSteps:evaluateStoredProjectJourneyReport(report).steps.filter(s=>s.outcome!=="observed").map(s=>s.id),exceptionReason:"Synthetic interrupted run explicitly accepted for this counterexample only."};}
function accept(q:ProofQuote){return acceptDelivery(q,{deliveryId:q.proof.delivery!.id,confirm:true,manualChecks:q.proof.delivery!.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId),journeyDecision:decision(q)});}

test("missing or unknown journey evidence never silently accepts; the client-observation limit is explicit",async()=>{
 let{quote,registration}=await fixture();assert.throws(()=>accept(quote));quote=closeWithoutNetwork(quote,registration);
 assert.equal(evaluateStoredProjectJourneyReport(quote.proof.delivery!.journeyReport!).summary.observed,0);
 assert.throws(()=>validateProjectJourneyDecision(quote,{...decision(quote),acknowledgeClientObservation:false}));
 assert.throws(()=>validateProjectJourneyDecision(quote,{...decision(quote),acknowledgedSteps:[]}));
 const accepted=accept(quote),snapshot=accepted.proof.delivery!.acceptanceEvidence![0];
 assert.equal(snapshot.journeyReportId,quote.proof.delivery!.journeyReport!.id);assert.equal(snapshot.journeyClientObservationAcknowledged,true);assert.equal(snapshot.journeyAcknowledgedSteps!.length,20);
});
test("acceptance freezes report A while a supplemental interrupted report B remains separate",async()=>{
 let{quote,registration}=await fixture();quote=accept(closeWithoutNetwork(quote,registration));const snapshot=structuredClone(quote.proof.delivery!.acceptanceEvidence![0]);
 quote=closeWithoutNetwork(quote,registration);assert.notEqual(quote.proof.delivery!.journeyReport!.id,snapshot.journeyReportId);assert.deepEqual(quote.proof.delivery!.acceptanceEvidence![0],snapshot);assert.doesNotThrow(()=>assertAcceptedEvidenceReference(quote));
 const bundle=await createEvidenceExport(quote);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
 bundle.delivery.journeyHistory=bundle.delivery.journeyHistory!.filter(r=>r.id!==snapshot.journeyReportId);assert.equal((await verifyEvidenceExport(bundle)).consistency,"inconsistent");
});
test("offline export rechecks journey digest, registration, agreement and exception acknowledgements",async()=>{
 let{quote,registration}=await fixture();quote=accept(closeWithoutNetwork(quote,registration));const original=await createEvidenceExport(quote);assert.equal((await verifyEvidenceExport(original)).consistency,"consistent");
 for(const mutate of [(b:typeof original)=>{b.delivery.journeyReport!.deliveryDigest="f".repeat(64);},(b:typeof original)=>{b.delivery.journeyPlan!.maxGuestsPerSlot=9 as 8;},(b:typeof original)=>{b.delivery.acceptanceEvidence![0].journeyRegistration!.projectId="foreign-project";},(b:typeof original)=>{b.delivery.acceptanceEvidence![0].journeyAcknowledgedSteps=[];}]){const bundle=structuredClone(original);mutate(bundle);assert.equal((await verifyEvidenceExport(bundle)).consistency,"inconsistent");}
});
test("replacement clears the optional agreement and every current journey field; shared history cannot evade its byte bound",async()=>{
 let{quote,registration}=await fixture();quote=closeWithoutNetwork(quote,registration);quote.proof.collaboration!.stage="changes_requested";
 const next=prepareReplacement(quote,{...quote.proof.delivery!,id:crypto.randomUUID()});for(const key of ["journeyPlan","journeyRun","journeyReport","journeyHistory","journeyEvidenceReservation"])assert.equal((next.proof.delivery as unknown as Record<string,unknown>)[key],undefined);
 const tooLarge=structuredClone(quote);tooLarge.proof.delivery!.journeyHistory![0].input.observations[0].unavailableReason="x".repeat(EVIDENCE_HISTORY_BYTE_LIMIT);tooLarge.proof.delivery!.journeyReport=structuredClone(tooLarge.proof.delivery!.journeyHistory![0]);assert.throws(()=>assertQuoteEvidenceBudget(tooLarge),/history is full/);
});

test("offline evidence validates manual adoption and a step-bound AI explanation without changing acceptance",async()=>{
 let{quote,registration}=await fixture();quote=closeWithoutNetwork(quote,registration);
 const report=quote.proof.delivery!.journeyReport!,before=structuredClone(report);
 quote.proof.delivery!.journeyExplanation={id:crypto.randomUUID(),method:"ai-journey-evidence-explanation-v1",mode:"live",model:"synthetic-no-network",generatedAt:new Date().toISOString(),deliveryId:report.deliveryId,deliveryDigest:report.deliveryDigest,planDigest:report.planDigest,reportId:report.id,stepIds:evaluateStoredProjectJourneyReport(report).steps.map(s=>s.id),findings:[{stepIds:["meta"],priority:"high",explanation:"The interrupted run has no complete server evidence.",retest:"Reconnect the staging service and start a new run."}],limitations:["This is a synthetic explanation fixture, not an external AI call."]};
 const bundle=await createEvidenceExport(quote);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
 for(const change of [(b:typeof bundle)=>{b.delivery.journeyPlanAdoption!.planDigest="f".repeat(64);},(b:typeof bundle)=>{b.delivery.journeyExplanation!.reportId="foreign-report";},(b:typeof bundle)=>{b.delivery.journeyExplanation!.findings[0].stepIds=["unknown" as "meta"];}]){const altered=structuredClone(bundle);change(altered);assert.equal((await verifyEvidenceExport(altered)).consistency,"inconsistent");}
 assert.deepEqual(quote.proof.delivery!.journeyReport,before);assert.equal(quote.proof.acceptedDeliveryId,undefined);
 quote=closeWithoutNetwork(quote,registration);assert.notEqual(quote.proof.delivery!.journeyReport!.id,report.id);assert.equal((await verifyEvidenceExport(await createEvidenceExport(quote))).consistency,"consistent");
});
