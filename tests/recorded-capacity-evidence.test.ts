import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {verifyEvidenceExport,type EvidenceExport,type EvidenceVerification} from "../lib/evidence-export.ts";
import {CAPACITY_STEP_IDS} from "../lib/runtime-capacity.ts";

const bytes=readFileSync(new URL("./fixtures/recorded-capacity-v3/evidence.json",import.meta.url));
const record=()=>JSON.parse(bytes.toString("utf8")) as EvidenceExport;
const status=(result:EvidenceVerification,id:string)=>result.checks.find(row=>row.id===id)?.status;

test("the unchanged recorded accepted v3 delivery verifies all8gates offline with exact frozen17step references",async()=>{
  assert.equal(bytes.length,28906);assert.equal(createHash("sha256").update(bytes).digest("hex"),"70916546f9752fb08acdb0af811f98bb303654bb49ac2d1f3f17a2bb11b172b6");
  const saved=record(),before=structuredClone(saved),runtime=saved.delivery.runtimeReport!,snapshot=saved.delivery.acceptanceEvidence![0];
  assert.equal(saved.scope,"current-delivery-only");assert.equal(saved.delivery.sequence,2);assert.equal(runtime.plan.protocol,"booking-http-v3");
  if(runtime.plan.protocol!=="booking-http-v3")throw new Error("Recorded capacity protocol missing");
  assert.equal(runtime.plan.policy.maxPartySize,6);assert.equal(runtime.plan.slotCapacity.maxGuestsPerSlot,8);
  assert.equal(runtime.plan.slotCapacity.source.excerpt,"Each time slot accepts at most 8 guests in total.");
  assert.deepEqual(runtime.steps.map(row=>row.id),[...CAPACITY_STEP_IDS]);assert.deepEqual(runtime.summary,{steps:17,observed:17,issues:0,unavailable:0});
  assert.equal(snapshot.deliveryId,saved.delivery.id);assert.equal(snapshot.runtimeReportId,runtime.id);assert.equal(snapshot.runtimeDeliveryDigest,saved.fileDigest);assert.equal(snapshot.runtimeTargetId,runtime.target.id);
  assert.deepEqual(snapshot.manualChecks,["mobile","coverage-1","coverage-2"]);
  assert.deepEqual(saved.acceptanceReferences,[{kind:"delivery-acceptance",deliveryId:saved.delivery.id,evidenceSnapshotId:snapshot.id}]);
  const originalFetch=globalThis.fetch;let networkCalls=0;
  globalThis.fetch=async()=>{networkCalls++;throw new Error("Offline fixture verification must not contact a service");};
  try{
    const result=await verifyEvidenceExport(saved);assert.equal(result.consistency,"consistent");assert.equal(result.checks.length,8);assert.ok(result.checks.every(row=>row.status==="consistent"));
    assert.equal(result.limits.networkRequests,0);assert.equal(result.limits.authenticity,"not-proven");assert.equal(result.limits.backendExecution,"not-proven");assert.equal(result.limits.payment,"not-proven");assert.equal(networkCalls,0);assert.deepEqual(saved,before);
  }finally{globalThis.fetch=originalFetch;}
});
test("changing current and historical v3 report capacity cannot borrow the original locked8guest clause",async()=>{
  const saved=record();
  for(const runtime of[saved.delivery.runtimeReport!,...saved.delivery.runtimeHistory!]){
    if(runtime.plan.protocol!=="booking-http-v3")throw new Error("Recorded capacity protocol missing");
    runtime.plan.slotCapacity.maxGuestsPerSlot=9;runtime.plan.slotCapacity.source.excerpt=runtime.plan.slotCapacity.source.excerpt.replace("8","9");
  }
  const result=await verifyEvidenceExport(saved);assert.equal(result.consistency,"inconsistent");assert.equal(status(result,"file-digest"),"consistent");assert.equal(status(result,"runtime-bindings"),"inconsistent");
});
test("a shortened v3 slot-capacity citation is rejected against its complete included original clause",async()=>{
  const saved=record(),plan=saved.project.spec!.runtimeCheck!;if(plan.protocol!=="booking-http-v3")throw new Error("Recorded capacity plan missing");
  plan.slotCapacity.source.end--;plan.slotCapacity.source.excerpt=plan.slotCapacity.source.excerpt.slice(0,-1);
  const result=await verifyEvidenceExport(saved);assert.equal(result.consistency,"inconsistent");assert.equal(status(result,"file-digest"),"consistent");assert.equal(status(result,"source-rule-replay"),"inconsistent");
});
test("frozen v3 acceptance cannot point to an absent report or omit its mandatory original runtime reference",async()=>{
  for(const remove of[false,true]){
    const saved=record(),snapshot=saved.delivery.acceptanceEvidence![0];
    if(remove)delete snapshot.runtimeReportId;else snapshot.runtimeReportId="absent-capacity-report";
    const result=await verifyEvidenceExport(saved);assert.equal(result.consistency,"inconsistent");assert.equal(status(result,"file-digest"),"consistent");assert.equal(status(result,"runtime-bindings"),"consistent");assert.equal(status(result,"acceptance-references"),"inconsistent");
  }
});
