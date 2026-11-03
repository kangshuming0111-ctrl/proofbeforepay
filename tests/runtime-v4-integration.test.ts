import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity} from "../lib/booking-capacity.ts";
import {CAPACITY_V4_STEP_IDS,CAPACITY_V4_SLOTS,CAPACITY_V4_EXECUTION_ORDER} from "../lib/runtime-capacity.ts";
import {buildRuntimeContract} from "../lib/runtime-contract.ts";
import {runtimeDeliveryDigest,savedRuntimePlan,RUNTIME_TARGETS} from "../lib/runtime-project.ts";
import {runtimeProtocolStepIds,validateRuntimeReport,runtimeReportSummary} from "../lib/runtime-checks.ts";
import {beginRuntimeRun,finishRuntimeRun} from "../lib/runtime-actions.ts";
import {executeRuntimeCheck} from "../lib/runtime-runner.ts";
import {acceptDelivery} from "../lib/proof-workflow.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {EXPANDED_RUNTIME_REPORT_RESERVATION_BYTES,RUNTIME_REPORT_RESERVATION_BYTES,acceptanceSnapshotReservationBytes,runtimeReportReservationBytes} from "../lib/evidence-budget.ts";

async function fixture(protocol:"booking-http-v3"|"booking-http-v4"="booking-http-v4"):Promise<ProofQuote>{
  const summary="Each booking accepts at most 6 people.\nEach time slot accepts at most 8 guests in total.",units=summaryCoverageUnits(summary);
  const source={start:units[0].start,end:units[0].end,excerpt:units[0].text},capacity={start:units[1].start,end:units[1].end,excerpt:units[1].text};
  const parsed=parseStaticProject({title:"Synthetic combined coverage",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],
    coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(row=>({id:row.id,disposition:"include"}))},
    runtimeCheck:{protocol,criterionId:units[0].id,confirmed:true,policy:suggestBookingPolicy(source),slotCapacity:{criterionId:units[1].id,...suggestSlotCapacity(capacity)}}},"en");
  const files={"index.html":"<!doctype html><html><head><title>Synthetic combined coverage</title></head><body><p>Each booking accepts at most 6 people.</p><p>Each time slot accepts at most 8 guests in total.</p></body></html>"};
  const delivery=createUploadedDelivery(files,parsed.project,"en",1),at=new Date().toISOString();
  delivery.backendTargetId=protocol==="booking-http-v4"?"lab-coverage-fixed":"lab-capacity-fixed";
  delivery.runtimeDeliveryDigest=await runtimeDeliveryDigest(files);
  return{id:"combined-fixture",reference:"PBP-COMBINED",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,
    proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Synthetic static rule check"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Synthetic controlled coverage"},feedback:[]}}};
}
function start(quote:ProofQuote){return beginRuntimeRun(quote,"buyer",{deliveryId:quote.proof.delivery!.id,previousReportId:quote.proof.delivery!.runtimeReport?.id??null,confirm:true},quote.proof.delivery!.runtimeDeliveryDigest!);}
async function unavailable(quote:ProofQuote){
  const delivery=quote.proof.delivery!,run=delivery.runtimeRun!,target=RUNTIME_TARGETS.find(row=>row.id===delivery.backendTargetId)!;let calls=0;
  const report=await executeRuntimeCheck({deliveryId:delivery.id,deliveryDigest:delivery.runtimeDeliveryDigest!,runId:run.id,startedAt:run.startedAt,plan:savedRuntimePlan(quote)!,target},{fetch:async()=>{calls++;throw new Error("Owned no-network regression");}});
  assert.equal(calls,1);return report;
}

test("combined handoff explicitly retains all31 checks, isolated valid-input slots and both concurrency contracts",async()=>{
  const q=await fixture(),before=structuredClone(q),c=buildRuntimeContract(q);
  assert.equal(c.protocol,"booking-http-v4");assert.deepEqual(c.steps.map(step=>step.id),[...CAPACITY_V4_STEP_IDS]);assert.equal(c.bounds.maxRequests,31);
  assert.deepEqual(c.execution.stepOrder,[...CAPACITY_V4_EXECUTION_ORDER]);assert.equal(new Set(c.execution.stepOrder).size,31);
  assert.deepEqual(c.requestSchema.properties.slot.enum,Object.values(CAPACITY_V4_SLOTS));
  assert.deepEqual(c.steps.find(step=>step.id==="missing_slot")!.bodyChange!.omit,["slot"]);
  assert.equal(c.steps.find(step=>step.id==="invalid_email")!.bodyChange!.email,"not-an-email");
  for(const[id,value]of[["party_zero",0],["party_fraction",1.5],["party_negative",-1],["party_string","1"]] as const)assert.equal(c.steps.find(step=>step.id===id)!.bodyChange!.partySize,value);
  assert.equal(c.steps.find(step=>step.id==="winner_conflict")!.keyFrom,"capacity-race-winner");
  assert.equal(c.steps.find(step=>step.id==="same_key_first")!.key,c.steps.find(step=>step.id==="same_key_second")!.key);
  assert.equal(c.steps.find(step=>step.id==="same_key_first")!.bodyChange!.slot,CAPACITY_V4_SLOTS.c);
  assert.equal(c.steps.find(step=>step.id==="party_one")!.bodyChange!.slot,CAPACITY_V4_SLOTS.d);
  assert.equal(c.steps.find(step=>step.id==="party_below")!.bodyChange!.slot,CAPACITY_V4_SLOTS.e);
  assert.equal(c.plan.source.excerpt,q.proof.criteria.find(row=>row.id===c.plan.criterionId)!.source);
  assert.deepEqual(q,before);assert.ok(new TextEncoder().encode(JSON.stringify(c)).byteLength<24*1024);
});

test("v4 reserves report and31-step exception room before outbound work while old protocols retain48KiB",async()=>{
  const q=await fixture(),old=await fixture("booking-http-v3");
  assert.equal(runtimeReportReservationBytes(q),EXPANDED_RUNTIME_REPORT_RESERVATION_BYTES);assert.equal(runtimeReportReservationBytes(old),RUNTIME_REPORT_RESERVATION_BYTES);
  assert.ok(acceptanceSnapshotReservationBytes(q)>acceptanceSnapshotReservationBytes(old));
  const pending=start(q),run=pending.proof.delivery!.runtimeRun!;
  assert.equal(pending.proof.delivery!.evidenceReservation!.reportBytes,96*1024);
  const report=await unavailable(pending);assert.equal(report.method,"server-booking-http-v4");assert.deepEqual(report.summary,{steps:31,observed:0,issues:0,unavailable:31});
  const target=RUNTIME_TARGETS.find(row=>row.id==="lab-coverage-fixed")!;
  assert.deepEqual(validateRuntimeReport(report,{deliveryId:run.deliveryId,deliveryDigest:run.deliveryDigest,runId:run.id,plan:savedRuntimePlan(q)!,target}),report);
  const mixed=structuredClone(report);mixed.steps.pop();assert.throws(()=>validateRuntimeReport(mixed,{deliveryId:run.deliveryId,deliveryDigest:run.deliveryDigest,plan:savedRuntimePlan(q)!,target}));
  const badPair=structuredClone(report);for(const step of badPair.steps)if(["same_key_first","same_key_second"].includes(step.id)){step.outcome="observed";step.status=201;step.actual="Synthetic schema-only duplicate creation";delete step.reason;}
  badPair.summary=runtimeReportSummary(badPair.steps);assert.throws(()=>validateRuntimeReport(badPair,{deliveryId:run.deliveryId,deliveryDigest:run.deliveryDigest,plan:savedRuntimePlan(q)!,target}),/one creation and one replay/);
});

test("all31 unavailable steps require explicit exceptions and survive frozen acceptance plus independent offline verification",async()=>{
  let q=start(await fixture()),run=q.proof.delivery!.runtimeRun!;q=finishRuntimeRun(q,await unavailable(q));
  const delivery=q.proof.delivery!,report=delivery.runtimeReport!,consent={deliveryId:delivery.id,confirm:true,manualChecks:delivery.evidence.filter(row=>row.finding==="needs_human").map(row=>row.criterionId),runtimeDecision:{reportId:report.id,exceptionReason:"Explicit synthetic exception for every unavailable protocol step",acknowledgedSteps:report.steps.map(step=>step.id)}};
  const partial=structuredClone(consent);partial.runtimeDecision.acknowledgedSteps.pop();assert.throws(()=>acceptDelivery(q,partial),/every failed or uncertain/);
  q=acceptDelivery(q,consent);const accepted=structuredClone(q.proof.collaboration!.acceptance),snapshot=structuredClone(q.proof.delivery!.acceptanceEvidence);
  const packet=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(packet)).consistency,"consistent");assert.equal(packet.delivery.acceptanceEvidence![0].runtimeAcknowledgedSteps!.length,31);
  const tampered=structuredClone(packet);tampered.delivery.acceptanceEvidence![0].runtimeAcknowledgedSteps!.pop();assert.equal((await verifyEvidenceExport(tampered)).consistency,"inconsistent");
  q=start(q);run=q.proof.delivery!.runtimeRun!;q=finishRuntimeRun(q,await unavailable(q));
  assert.deepEqual(q.proof.collaboration!.acceptance,accepted);assert.deepEqual(q.proof.delivery!.acceptanceEvidence,snapshot);assert.equal(q.proof.paymentState,"unfunded");
  assert.equal((await verifyEvidenceExport(await createEvidenceExport(q))).consistency,"consistent");
});
