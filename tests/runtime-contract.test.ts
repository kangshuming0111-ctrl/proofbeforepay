import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {buildRuntimeContract} from "../lib/runtime-contract.ts";
import {parseStaticProject} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {runtimeProtocolStepIds} from "../lib/runtime-checks.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity} from "../lib/booking-capacity.ts";
import {CAPACITY_EXECUTION_ORDER,CAPACITY_SLOTS,CAPACITY_STEP_IDS} from "../lib/runtime-capacity.ts";

function quoteFor(protocol:"booking-http-v1"|"booking-http-v2"="booking-http-v2",maximum=6):ProofQuote {
 const summary=protocol==="booking-http-v2"?`Each booking accepts at most ${maximum} people.`:"Bookings must persist for independent readback and support idempotent repeated submission.";
 const units=summaryCoverageUnits(summary),unit=units[0];
 const source={start:unit.start,end:unit.end,excerpt:unit.text};
 const parsed=parseStaticProject({title:"Synthetic backend handoff",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(row=>({id:row.id,disposition:"include"}))},runtimeCheck:{protocol,criterionId:unit.id,confirmed:true,...(protocol==="booking-http-v2"?{policy:suggestBookingPolicy(source)}:{})}},"en");
 const at="2026-11-02T00:00:00.000Z";
 return{id:"synthetic-project",reference:"PBP-CONTRACT",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[]}};
}
function capacityQuote(maximum=6,total=8):ProofQuote{
 const summary=`Each booking accepts at most ${maximum} people. Each time slot accepts at most ${total} guests in total.`,units=summaryCoverageUnits(summary);
 const source={start:units[0].start,end:units[0].end,excerpt:units[0].text},capacity={start:units[1].start,end:units[1].end,excerpt:units[1].text};
 const parsed=parseStaticProject({title:"Synthetic capacity handoff",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(row=>({id:row.id,disposition:"include"}))},runtimeCheck:{protocol:"booking-http-v3",criterionId:units[0].id,confirmed:true,policy:suggestBookingPolicy(source),slotCapacity:{criterionId:units[1].id,...suggestSlotCapacity(capacity)}}},"en");
 const value=quoteFor();Object.assign(value,{summary,brief:summary,title:parsed.title});value.proof.project=parsed.project;value.proof.criteria=parsed.criteria;return value;
}
test("locked v2 contract retains exact source,18step inventory and requirement-driven probes without registering or calling anything",()=>{
 const quote=quoteFor(),before=structuredClone(quote),contract=buildRuntimeContract(quote);
 assert.equal(contract.projectId,quote.id);assert.equal(contract.protocol,"booking-http-v2");assert.deepEqual(contract.plan,quote.proof.project!.runtimeCheck);
 assert.deepEqual(contract.steps.map(step=>step.id),runtimeProtocolStepIds(contract.plan));assert.equal(contract.steps.length,18);
 assert.equal(contract.steps.find(step=>step.id==="party_below")!.bodyChange!.partySize,5);
 assert.equal(contract.steps.find(step=>step.id==="party_exact")!.bodyChange!.partySize,6);
 assert.equal(contract.steps.find(step=>step.id==="party_above")!.bodyChange!.partySize,7);
 assert.equal(contract.syntheticCanary.partySize,1);assert.equal(contract.steps.find(step=>step.id==="conflict")!.bodyChange!.partySize,2);
 assert.deepEqual(contract.metadata.requiredFields,["revision","projectId","registrationRevision","frontendBundleDigest","protocol"]);
 assert.deepEqual(contract.metadata.requiredWhenDeclared,["backendArtifactDigest","backendSourceCommit"]);
 assert.equal(contract.metadata.schema.properties.projectId.const,quote.id);
 assert.equal(contract.metadata.fieldSources.revision,"runtimeRegistration.deploymentRevision");
 assert.equal(contract.metadata.fieldSources.frontendBundleDigest,"runtimeRegistration.frontendBundleDigest");
 assert.match(contract.metadata.declarationBinding,/not deployment provenance attestation/);
 const pair=contract.steps.filter(step=>step.concurrentGroup);assert.equal(pair.length,2);assert.equal(pair[0].key,pair[1].key);assert.notEqual(pair[0].key,contract.steps.find(step=>step.id==="create")!.key);
 const witnessIds=["readback","unchanged","party_below_readback","party_exact_readback","concurrent_readback"];
 assert.deepEqual(contract.execution.stepOrder.slice(-5),witnessIds);assert.equal(contract.execution.finalCrossKeyReadbacks,true);
 assert.equal(new Set(contract.execution.stepOrder).size,18);assert.deepEqual([...contract.execution.stepOrder].sort(),runtimeProtocolStepIds(contract.plan).sort());
 for(const id of witnessIds)assert.match(contract.steps.find(step=>step.id===id)!.expected,/after all later independent-key writes/u);
 assert.equal(contract.frontendBundleDigest,null);assert.equal(contract.registration.status,"operator-review-required");assert.equal(contract.execution.requiresConsentForEveryRun,true);assert.equal(contract.execution.modelCalled,false);assert.equal(contract.execution.paymentCalled,false);assert.equal(contract.execution.autoAcceptance,false);assert.equal(contract.execution.deploymentAttestation,false);
 assert.ok(!JSON.stringify(contract).includes("https://"));assert.ok(new TextEncoder().encode(JSON.stringify(contract)).byteLength<24*1024);assert.deepEqual(quote,before);
});
test("v1 handoff preserves original8steps and2/3guest canary; changing v2original maximum changes probes",()=>{
 const basic=buildRuntimeContract(quoteFor("booking-http-v1"));assert.equal(basic.steps.length,8);assert.equal(basic.syntheticCanary.partySize,2);assert.equal(basic.steps.find(step=>step.id==="conflict")!.bodyChange!.partySize,3);assert.equal("maximum"in basic.requestSchema.properties.partySize,false);
 assert.equal(basic.execution.finalCrossKeyReadbacks,false);assert.deepEqual(basic.execution.stepOrder,basic.steps.map(step=>step.id));
 assert.deepEqual(basic.metadata.requiredFields,["revision","projectId","registrationRevision","frontendBundleDigest"]);
 for(const maximum of [2,7,12]){const c=buildRuntimeContract(quoteFor("booking-http-v2",maximum));assert.equal(c.requestSchema.properties.partySize.maximum,maximum);assert.equal(c.steps.find(step=>step.id==="party_above")!.bodyChange!.partySize,maximum+1);}
});
test("unlocked,missing,forged or out-of-scope plans cannot become a developer acceptance contract",()=>{
 const draft=quoteFor();draft.status="draft";assert.throws(()=>buildRuntimeContract(draft),/Lock/);
 const missing=quoteFor();delete missing.proof.project!.runtimeCheck;assert.throws(()=>buildRuntimeContract(missing),/no agreed/);
 const forged=quoteFor();forged.proof.project!.runtimeCheck!.source.excerpt="Another requirement";assert.throws(()=>buildRuntimeContract(forged));
 const changed=quoteFor();changed.summary="Different original requirement";assert.throws(()=>buildRuntimeContract(changed));
 const excluded=quoteFor();excluded.proof.project!.coverage!.decisions[0].disposition="exclude";assert.throws(()=>buildRuntimeContract(excluded));
});
test("export is independent of private quote/provider fields and includes only a validated optional frontend digest",()=>{
 const q=quoteFor();(q as unknown as Record<string,unknown>).privateToken="DO_NOT_EXPORT_SYNTHETIC_PRIVATE_FIELD";
 const fake={id:"delivery",runtimeDeliveryDigest:"a".repeat(64),privateCustomer:"DO_NOT_EXPORT_CUSTOMER"};
 q.proof.delivery=fake as unknown as NonNullable<ProofQuote["proof"]["delivery"]>;
 const contract=buildRuntimeContract(q);assert.equal(contract.frontendBundleDigest,"a".repeat(64));assert.ok(!JSON.stringify(contract).includes("DO_NOT_EXPORT"));
 contract.plan.source.excerpt="Outside mutation";assert.notEqual(q.proof.project!.runtimeCheck!.source.excerpt,"Outside mutation");
 q.proof.delivery.runtimeDeliveryDigest="invalid";assert.throws(()=>buildRuntimeContract(q));
});
test("v3 handoff preserves two complete sources and the canonical17-step distinct-key capacity recipe",()=>{
 const quote=capacityQuote(),before=structuredClone(quote),contract=buildRuntimeContract(quote);
 assert.equal(contract.protocol,"booking-http-v3");assert.deepEqual(contract.steps.map(step=>step.id),[...CAPACITY_STEP_IDS]);assert.equal(contract.bounds.maxRequests,17);
 assert.deepEqual(contract.execution.stepOrder,[...CAPACITY_EXECUTION_ORDER]);assert.equal(contract.execution.finalCrossKeyReadbacks,true);
 assert.ok(contract.capacityRecipe);assert.equal(contract.capacityRecipe.maxPartySize,6);assert.equal(contract.capacityRecipe.maxGuestsPerSlot,8);assert.equal(contract.capacityRecipe.racePartySize,5);assert.equal(contract.capacityRecipe.remainingPartySize,3);
 assert.equal(contract.capacityRecipe.partyRequirement.source.excerpt,"Each booking accepts at most 6 people.");assert.equal(contract.capacityRecipe.slotRequirement.source.excerpt,"Each time slot accepts at most 8 guests in total.");
 assert.deepEqual(contract.requestSchema.properties.slot.enum,[CAPACITY_SLOTS.a,CAPACITY_SLOTS.b]);assert.equal(contract.requestSchema.properties.partySize.maximum,6);
 assert.equal(contract.paths.occupancy,"occupancy/{runId}/{a|b}");assert.deepEqual(contract.capacityRecipe.occupancySchema.required,["testRunId","slot","revision","guestCount","bookingIds"]);
 assert.equal(contract.capacityRecipe.occupancySchema.additionalProperties,false);assert.equal(contract.capacityRecipe.occupancySchema.properties.bookingIds.uniqueItems,true);
 const pair=contract.steps.filter(step=>step.concurrentGroup);assert.equal(pair.length,2);assert.notEqual(pair[0].key,pair[1].key);assert.ok(pair.every(step=>step.bodyChange?.partySize===5));
 assert.equal(contract.steps.find(step=>step.id==="race_winner_replay")!.key,"{actualWinningRaceKey}");assert.equal(contract.steps.find(step=>step.id==="race_winner_replay")!.keyFrom,"capacity-race-winner");
 assert.equal(contract.steps.find(step=>step.id==="fill_remainder")!.bodyChange!.partySize,3);assert.equal(contract.steps.find(step=>step.id==="reject_extra")!.bodyChange!.partySize,1);
 assert.equal(contract.steps.find(step=>step.id==="slot_b_create")!.bodyChange!.slot,CAPACITY_SLOTS.b);
 const b=contract.execution.stepOrder.indexOf("slot_b_create");for(const id of["race_winner_readback","fill_readback","slot_a_after_rejection"] as const)assert.ok(contract.execution.stepOrder.indexOf(id)>b);
 assert.match(contract.execution.recovery,/no POST retries/u);assert.match(contract.execution.recovery,/not substituted/u);assert.equal(contract.execution.autoAcceptance,false);assert.equal(contract.execution.paymentCalled,false);
 assert.ok(new TextEncoder().encode(JSON.stringify(contract)).byteLength<24*1024);assert.deepEqual(quote,before);
});
test("v3 contract derives both race sizes and rejects excluded or shortened slot-capacity sources",()=>{
 for(const[m,c]of[[2,3],[7,12]]){const contract=buildRuntimeContract(capacityQuote(m,c));assert.equal(contract.capacityRecipe!.racePartySize,Math.floor(c/2)+1);assert.equal(contract.capacityRecipe!.remainingPartySize,c-Math.floor(c/2)-1);}
 const excluded=capacityQuote();excluded.proof.project!.coverage!.decisions[1].disposition="exclude";assert.throws(()=>buildRuntimeContract(excluded));
 const shortened=capacityQuote(),plan=shortened.proof.project!.runtimeCheck!;if(plan.protocol!=="booking-http-v3")throw new Error("fixture protocol");plan.slotCapacity.source.end--;plan.slotCapacity.source.excerpt=plan.slotCapacity.source.excerpt.slice(0,-1);assert.throws(()=>buildRuntimeContract(shortened));
});
