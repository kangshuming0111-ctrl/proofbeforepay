import assert from "node:assert/strict";
import test from "node:test";
import type {ProofDelivery,ProofDeliveryVersion} from "../lib/contracts.ts";
import {buildRuntimeComparison,type RuntimeComparisonInput} from "../lib/runtime-comparison.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity} from "../lib/booking-capacity.ts";
import {runtimeCapacityStepDefinitions} from "../lib/runtime-capacity.ts";
import {createUploadedDelivery} from "../lib/static-project.ts";
import {runtimeDeliveryDigest,RUNTIME_TARGETS} from "../lib/runtime-project.ts";
import {runtimeProtocolStepIds,runtimeReportSummary,validateRuntimePlan,type RuntimeCheckPlan,type RuntimeCheckReport} from "../lib/runtime-checks.ts";

const projectId="comparison-project",source="Each booking accepts at most 6 people.";
const plan:RuntimeCheckPlan=validateRuntimePlan({protocol:"booking-http-v2",criterionId:"coverage-1",source:{start:0,end:source.length,excerpt:source},policy:suggestBookingPolicy({start:0,end:source.length,excerpt:source})});
const html=(revision:number)=>`<!doctype html><title>Booking revision ${revision}</title><main><p>Saved revision ${revision}</p></main>`;
const readbacks=new Set(["readback","unchanged","party_below_readback","party_exact_readback","concurrent_readback"]);
async function delivery(sequence:number,flawed:boolean):Promise<ProofDelivery>{
  const value=createUploadedDelivery({"index.html":html(sequence)},{requiredPages:["index.html"],manualRequirements:[]},"en",sequence);
  value.id=`delivery-${sequence}`;value.submittedAt=`2026-11-02T00:0${sequence}:00.000Z`;
  const digest=await runtimeDeliveryDigest(value.files),targetId=`seller-staging-${sequence}`;
  value.backendTargetId=targetId;value.runtimeDeliveryDigest=digest;
  value.runtimeRegistration={id:targetId,label:`Seller staging ${sequence}`,registrationRevision:`review-${sequence}`,projectId,protocol:plan.protocol,baseUrl:`https://seller-staging.example.org/v${sequence}/`,deploymentRevision:`build-${sequence}`,frontendBundleDigest:digest,expiresAt:"2000-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
  const steps:RuntimeCheckReport["steps"]=runtimeProtocolStepIds(plan).map((id,index)=>{
    const invalid=["missing_slot","invalid_email","party_zero","party_fraction","party_above"].includes(id);
    const status=index===0||readbacks.has(id)?200:id==="conflict"?409:invalid?422:["create","party_below","party_exact","concurrent_first"].includes(id)?201:200;
    return {id,label:id,method:index===0||readbacks.has(id)?"GET":"POST",path:index===0?"meta":readbacks.has(id)?`bookings/receipt-${sequence}`:"bookings",outcome:id==="party_above"&&flawed?"mismatch":"observed",status:id==="party_above"&&flawed?201:status,expected:"Recorded protocol expectation",actual:"Synthetic saved response; no HTTP call in this unit test"};
  });
  value.runtimeReport={id:`run-${sequence}`,runId:`run-${sequence}`,deliveryId:value.id,deliveryDigest:digest,method:"server-booking-http-v2",startedAt:value.submittedAt,finishedAt:value.submittedAt,plan:structuredClone(plan),target:{id:targetId,label:`Seller staging ${sequence}`,origin:"https://seller-staging.example.org",revision:`build-${sequence}`,registration:structuredClone(value.runtimeRegistration)},steps,summary:runtimeReportSummary(steps)};
  value.runtimeHistory=[structuredClone(value.runtimeReport)];return value;
}
async function fixture():Promise<RuntimeComparisonInput>{
  const old=await delivery(1,true),current=await delivery(2,false);
  return {projectId,plan:structuredClone(plan),delivery:current,previousVersion:{delivery:old,feedback:[],archivedAt:"2026-11-02T00:02:00.000Z"}};
}
const reason=(side:Awaited<ReturnType<typeof buildRuntimeComparison>>["current"])=>side.state==="unavailable"?side.reason:undefined;

test("two changed registered targets retain their own 17/18 and 18/18 boundary/concurrency evidence",async()=>{
  const input=await fixture(),before=structuredClone(input),result=await buildRuntimeComparison(input);
  assert.deepEqual(input,before);assert.equal(result.plan!.source.excerpt,source);assert.equal(result.plan!.protocol,"booking-http-v2");
  assert.equal(result.previous.state,"available");assert.equal(result.current.state,"available");
  if(result.previous.state!=="available"||result.current.state!=="available")return;
  const old=result.previous.data,current=result.current.data;
  assert.equal(old.report.summary.observed,17);assert.equal(current.report.summary.observed,18);assert.equal(old.report.steps.length,18);assert.equal(current.report.steps.length,18);
  assert.equal(old.boundary!.status,201);assert.equal(old.boundary!.outcome,"mismatch");assert.equal(current.boundary!.status,422);assert.equal(current.boundary!.outcome,"observed");
  assert.equal(old.report.target.id,"seller-staging-1");assert.equal(current.report.target.id,"seller-staging-2");assert.notEqual(old.fileDigest,current.fileDigest);
  assert.equal(old.concurrency!.creationResponses,1);assert.equal(old.concurrency!.replayResponses,1);assert.equal(old.concurrency!.observedPair,true);assert.equal(current.concurrency!.readback.status,200);
  current.report.steps[0].actual="Changed returned projection";assert.deepEqual(input,before);
  assert.equal("fixed" in result,false);assert.equal("accepted" in result,false);
});

test("actual source and digest mismatch makes only the affected side unavailable",async()=>{
  const input=await fixture();input.previousVersion!.delivery.files!["index.html"]+="<p>Changed after the recorded run</p>";
  let result=await buildRuntimeComparison(input);assert.equal(reason(result.previous),"digest_mismatch");assert.equal(result.current.state,"available");
  input.previousVersion!.delivery.runtimeDeliveryDigest=await runtimeDeliveryDigest(input.previousVersion!.delivery.files);
  result=await buildRuntimeComparison(input);assert.equal(reason(result.previous),"digest_mismatch");
  const missing=await fixture();delete missing.delivery.files;assert.equal(reason((await buildRuntimeComparison(missing)).current),"missing_files");
  const invalid=await fixture();invalid.delivery.files!["script.js"]="No execution";assert.equal(reason((await buildRuntimeComparison(invalid)).current),"invalid_files");
});

test("report original source and locked plan must match exactly",async()=>{
  const input=await fixture(),old=input.previousVersion!.delivery.runtimeReport!;
  const changed=source.replace("6","7");old.plan=validateRuntimePlan({protocol:"booking-http-v2",criterionId:"coverage-1",source:{start:0,end:changed.length,excerpt:changed},policy:suggestBookingPolicy({start:0,end:changed.length,excerpt:changed})});
  assert.equal(reason((await buildRuntimeComparison(input)).previous),"plan_mismatch");
  const invalid=await fixture();invalid.plan.source.end--;
  const result=await buildRuntimeComparison(invalid);assert.equal(reason(result.previous),"invalid_plan");assert.equal(reason(result.current),"invalid_plan");
});

test("registration, target, project and report identity mismatches are not compared",async()=>{
  for(const mutate of [
    (value:ProofDelivery)=>{value.runtimeRegistration!.registrationRevision="another-review";},
    (value:ProofDelivery)=>{value.runtimeRegistration!.frontendBundleDigest="b".repeat(64);},
    (value:ProofDelivery)=>{value.backendTargetId="unregistered-target";},
    (value:ProofDelivery)=>{value.runtimeReport!.target.label="Changed target label";},
    (value:ProofDelivery)=>{value.runtimeReport!.deliveryId="another-delivery";},
    (value:ProofDelivery)=>{value.runtimeReport!.steps[0].path="https://unapproved.example.org/";},
  ]){const input=await fixture();mutate(input.previousVersion!.delivery);const result=await buildRuntimeComparison(input);assert.equal(result.previous.state,"unavailable");assert.equal(result.current.state,"available");}
  const crossProject=await fixture();crossProject.delivery.runtimeRegistration!.projectId="different-project";crossProject.delivery.runtimeReport!.target.registration!.projectId="different-project";
  assert.equal(reason((await buildRuntimeComparison(crossProject)).current),"different_project");
  const missingProject=await fixture();delete missingProject.projectId;const missing=await buildRuntimeComparison(missingProject);assert.equal(reason(missing.previous),"missing_project");assert.equal(reason(missing.current),"missing_project");
});

test("missing/latest stale reports never borrow a saved history or the other version",async()=>{
  const input=await fixture();delete input.previousVersion!.delivery.runtimeReport;
  let result=await buildRuntimeComparison(input);assert.equal(reason(result.previous),"no_report");assert.equal(result.current.state,"available");
  delete input.delivery.runtimeReport;result=await buildRuntimeComparison(input);assert.equal(reason(result.current),"no_report");
  const conflicted=await fixture();conflicted.delivery.runtimeHistory![0].steps[0].actual="Changed content under one report ID";
  assert.equal(reason((await buildRuntimeComparison(conflicted)).current),"invalid_report");
});

test("pending and expired unfinished runs remain unavailable rather than reusing the prior report",async()=>{
  for(const expiresAt of ["2099-01-01T00:00:00.000Z","2000-01-01T00:00:00.000Z"]){
    const input=await fixture(),value=input.delivery;value.runtimeRun={id:"pending-run",deliveryId:value.id,deliveryDigest:value.runtimeDeliveryDigest!,targetId:value.backendTargetId!,startedAt:value.submittedAt,expiresAt};
    const result=await buildRuntimeComparison(input);assert.equal(reason(result.current),"pending_run");assert.equal(result.previous.state,"available");
  }
});

test("history must be demonstrably older and absent history stays explicitly unavailable",async()=>{
  const input=await fixture();for(const candidate of [
    {...structuredClone(input.previousVersion!),isCurrent:true},
    {...structuredClone(input.previousVersion!),delivery:structuredClone(input.delivery)},
    {...structuredClone(input.previousVersion!),delivery:{...structuredClone(input.previousVersion!.delivery),sequence:3}},
    {...structuredClone(input.previousVersion!),delivery:{...structuredClone(input.previousVersion!.delivery),submittedAt:"2099-01-01T00:00:00.000Z"}},
  ] satisfies ProofDeliveryVersion[]){assert.equal(reason((await buildRuntimeComparison({...input,previousVersion:candidate})).previous),"not_older");}
  assert.equal(reason((await buildRuntimeComparison({...input,previousVersion:undefined})).previous),"no_previous");
});

test("reported concurrent pairs must satisfy the complete validated pair, not just counts",async()=>{
  const input=await fixture(),value=input.delivery;
  value.runtimeReport!.steps.find(step=>step.id==="concurrent_second")!.status=201;
  assert.equal(reason((await buildRuntimeComparison(input)).current),"invalid_report");
  const allMismatch=await fixture();for(const step of allMismatch.delivery.runtimeReport!.steps.filter(step=>step.id.startsWith("concurrent_"))){step.outcome="mismatch";step.status=201;}
  allMismatch.delivery.runtimeReport!.summary=runtimeReportSummary(allMismatch.delivery.runtimeReport!.steps);allMismatch.delivery.runtimeHistory=[structuredClone(allMismatch.delivery.runtimeReport!)];
  const result=await buildRuntimeComparison(allMismatch);assert.equal(result.current.state,"available");if(result.current.state==="available"){assert.equal(result.current.data.concurrency!.observedPair,false);assert.equal(result.current.data.concurrency!.creationResponses,2);assert.equal(result.current.data.concurrency!.replayResponses,0);}
});

test("input snapshots are captured before asynchronous hashing and built-in targets need no registration",async()=>{
  const input=await fixture(),pending=buildRuntimeComparison(input);input.delivery.files!["index.html"]="Changed while hashing";input.delivery.runtimeReport!.steps[0].actual="Changed while hashing";
  const result=await pending;assert.equal(result.current.state,"available");if(result.current.state==="available")assert.notEqual(result.current.data.report.steps[0].actual,"Changed while hashing");
  const legacy=await fixture(),target=RUNTIME_TARGETS.find(target=>target.id==="lab-policy-fixed")!;delete legacy.delivery.runtimeRegistration;legacy.delivery.backendTargetId=target.id;
  Object.assign(legacy.delivery.runtimeReport!.target,{id:target.id,label:target.label,origin:new URL(target.baseUrl).origin,revision:target.revision});delete legacy.delivery.runtimeReport!.target.registration;legacy.delivery.runtimeHistory=[structuredClone(legacy.delivery.runtimeReport!)];
  assert.equal((await buildRuntimeComparison(legacy)).current.state,"available");
});

async function capacityFixture(protocol:"booking-http-v3"|"booking-http-v4"="booking-http-v3"):Promise<RuntimeComparisonInput>{
  const capacityText="Each time slot accepts at most 8 guests in total.",sourceSpan={start:0,end:source.length,excerpt:source},capacitySpan={start:source.length+1,end:source.length+1+capacityText.length,excerpt:capacityText};
  const capacityPlan=validateRuntimePlan({protocol,criterionId:"coverage-party",source:sourceSpan,policy:suggestBookingPolicy(sourceSpan),slotCapacity:{criterionId:"coverage-capacity",...suggestSlotCapacity(capacitySpan)}});
  async function version(sequence:number,flawed:boolean){
    const value=await delivery(sequence,false),runId=crypto.randomUUID();value.runtimeRegistration!.protocol=protocol;
    if(capacityPlan.protocol!=="booking-http-v3"&&capacityPlan.protocol!=="booking-http-v4")throw new Error("fixture protocol");
    const dependent=new Set(["race_winner_readback","slot_a_after_race","race_winner_replay","slot_a_after_replay","fill_remainder","fill_readback","slot_a_full","reject_extra","slot_a_after_rejection"]);
    const steps:RuntimeCheckReport["steps"]=runtimeCapacityStepDefinitions(capacityPlan).map(definition=>{
      const race=definition.id==="capacity_race_first"||definition.id==="capacity_race_second",unavailable=flawed&&dependent.has(definition.id);
      const status=["party_above","missing_slot","invalid_email","party_zero","party_fraction","party_negative","party_string"].includes(definition.id)?422:definition.id==="winner_conflict"?409:["same_key_first","party_one","party_below"].includes(definition.id)?201:definition.id==="capacity_race_first"||definition.id==="capacity_race_second"&&flawed||definition.id==="fill_remainder"||definition.id==="slot_b_create"?201:definition.id==="capacity_race_second"||definition.id==="reject_extra"?409:200;
      return{id:definition.id,label:definition.label,method:definition.method,path:definition.pathKind==="receipt"?unavailable?"bookings/:id":`bookings/receipt-${sequence}-${definition.id}`:definition.path.replace("{runId}",runId),expected:definition.expected,
        outcome:unavailable?"unavailable":flawed&&race?"mismatch":"observed",...(unavailable?{reason:"race_not_verified"}:{status,actual:"Synthetic saved capacity response; no HTTP execution in this projection test"})};
    });
    const previous=value.runtimeReport!;
    value.runtimeReport={...previous,id:runId,runId,method:protocol==="booking-http-v4"?"server-booking-http-v4":"server-booking-http-v3",plan:structuredClone(capacityPlan),target:{...previous.target,registration:structuredClone(value.runtimeRegistration)},steps,summary:runtimeReportSummary(steps)};
    value.runtimeHistory=[structuredClone(value.runtimeReport)];return value;
  }
  return{projectId,plan:capacityPlan,delivery:await version(2,false),previousVersion:{delivery:await version(1,true),feedback:[],archivedAt:"2026-11-02T00:02:00.000Z"}};
}
test("v3 compares each version's two-constraint race and occupancy evidence without relabeling it as v2",async()=>{
  const input=await capacityFixture(),before=structuredClone(input),result=await buildRuntimeComparison(input);assert.deepEqual(input,before);
  assert.equal(result.plan!.protocol,"booking-http-v3");assert.equal(result.previous.state,"available");assert.equal(result.current.state,"available");
  if(result.previous.state!=="available"||result.current.state!=="available"||result.plan?.protocol!=="booking-http-v3")return;
  const old=result.previous.data,current=result.current.data;
  assert.equal(result.plan.policy.maxPartySize,6);assert.equal(result.plan.slotCapacity.maxGuestsPerSlot,8);assert.equal(result.plan.slotCapacity.source.excerpt,"Each time slot accepts at most 8 guests in total.");
  assert.equal(old.report.steps.length,17);assert.equal(current.report.steps.length,17);assert.equal(old.capacity!.creationResponses,2);assert.equal(old.capacity!.capacityRejections,0);assert.equal(old.capacity!.observedPair,false);
  assert.equal(current.capacity!.creationResponses,1);assert.equal(current.capacity!.capacityRejections,1);assert.equal(current.capacity!.observedPair,true);assert.equal(current.capacity!.winnerReplay.status,200);
  assert.equal(current.capacity!.winnerReadback.id,"race_winner_readback");assert.equal(current.capacity!.fillReadback.id,"fill_readback");assert.equal(current.capacity!.occupancy.finalA.id,"slot_a_after_rejection");assert.equal(current.capacity!.occupancy.slotB.id,"slot_b_occupancy");
  assert.equal(old.concurrency,undefined);assert.equal(current.concurrency,undefined);assert.equal(old.boundary,undefined);assert.notEqual(old.fileDigest,current.fileDigest);
  assert.equal(old.report.target.id,"seller-staging-1");assert.equal(current.report.target.id,"seller-staging-2");assert.equal("accepted"in current,false);
  current.capacity!.occupancy.full.actual="mutated returned projection";assert.deepEqual(input,before);
});
test("capacity comparison cannot substitute a v2 report or a different second source constraint",async()=>{
  const input=await capacityFixture(),v2=await delivery(1,false);input.previousVersion!.delivery=v2;
  let result=await buildRuntimeComparison(input);assert.equal(reason(result.previous),"plan_mismatch");assert.equal(result.current.state,"available");
  const changed=await capacityFixture(),old=changed.previousVersion!.delivery.runtimeReport!,oldPlan=old.plan;
  if(oldPlan.protocol!=="booking-http-v3")throw new Error("fixture protocol");
  oldPlan.slotCapacity.maxGuestsPerSlot=9;oldPlan.slotCapacity.source.excerpt=oldPlan.slotCapacity.source.excerpt.replace("8","9");
  result=await buildRuntimeComparison(changed);assert.equal(reason(result.previous),"plan_mismatch");assert.equal(result.current.state,"available");
});
test("v3 saved evidence remains subject to exact files, registration and pending-run guards",async()=>{
  const changed=await capacityFixture();changed.delivery.files!["index.html"]+="<p>Later changed file</p>";
  assert.equal(reason((await buildRuntimeComparison(changed)).current),"digest_mismatch");
  const pin=await capacityFixture();pin.delivery.runtimeRegistration!.registrationRevision="unmatched-pin";
  assert.equal(reason((await buildRuntimeComparison(pin)).current),"invalid_report");
  const pending=await capacityFixture(),value=pending.delivery;value.runtimeRun={id:crypto.randomUUID(),deliveryId:value.id,deliveryDigest:value.runtimeDeliveryDigest!,targetId:value.backendTargetId!,startedAt:value.submittedAt,expiresAt:"2099-01-01T00:00:00.000Z"};
  assert.equal(reason((await buildRuntimeComparison(pending)).current),"pending_run");
});
test("v3 comparison rejects a supposedly observed two201 race instead of showing an observed capacity pair",async()=>{
  const input=await capacityFixture(),value=input.delivery;value.runtimeReport!.steps.find(step=>step.id==="capacity_race_second")!.status=201;
  value.runtimeReport!.summary=runtimeReportSummary(value.runtimeReport!.steps);value.runtimeHistory=[structuredClone(value.runtimeReport!)];
  assert.equal(reason((await buildRuntimeComparison(input)).current),"invalid_report");
});

test("v4 version comparison independently retains31steps, same-key and distinct-key races under the exact two-source agreement",async()=>{
  const input=await capacityFixture("booking-http-v4"),before=structuredClone(input),result=await buildRuntimeComparison(input);assert.deepEqual(input,before);
  assert.equal(result.current.state,"available");assert.equal(result.previous.state,"available");if(result.current.state!=="available"||result.previous.state!=="available")return;
  for(const side of[result.previous.data,result.current.data]){assert.equal(side.report.plan.protocol,"booking-http-v4");assert.equal(side.report.steps.length,31);assert.equal(side.concurrency!.observedPair,true);assert.deepEqual(side.concurrency!.responses.map(row=>row.status),[201,200]);assert.equal(side.concurrency!.readback.id,"same_key_readback");assert.equal(side.boundary!.id,"party_above");assert.equal(side.capacity!.occupancy.afterRace.id,"slot_a_after_race");assert.equal(side.capacity!.occupancy.finalA.id,"slot_a_after_rejection");}
  assert.equal(result.previous.data.capacity!.observedPair,false);assert.equal(result.current.data.capacity!.observedPair,true);
  input.previousVersion!.delivery.runtimeReport!.plan.protocol="booking-http-v3";
  assert.equal(reason((await buildRuntimeComparison(input)).previous),"plan_mismatch");
});
