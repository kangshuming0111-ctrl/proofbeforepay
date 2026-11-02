import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {buildRuntimeContract} from "../lib/runtime-contract.ts";
import {parseStaticProject} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {runtimeProtocolStepIds} from "../lib/runtime-checks.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";

function quoteFor(protocol:"booking-http-v1"|"booking-http-v2"="booking-http-v2",maximum=6):ProofQuote {
 const summary=protocol==="booking-http-v2"?`Each booking accepts at most ${maximum} people.`:"Bookings must persist for independent readback and support idempotent repeated submission.";
 const units=summaryCoverageUnits(summary),unit=units[0];
 const source={start:unit.start,end:unit.end,excerpt:unit.text};
 const parsed=parseStaticProject({title:"Synthetic backend handoff",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(row=>({id:row.id,disposition:"include"}))},runtimeCheck:{protocol,criterionId:unit.id,confirmed:true,...(protocol==="booking-http-v2"?{policy:suggestBookingPolicy(source)}:{})}},"en");
 const at="2026-11-02T00:00:00.000Z";
 return{id:"synthetic-project",reference:"PBP-CONTRACT",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[]}};
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
 assert.equal(contract.frontendBundleDigest,null);assert.equal(contract.registration.status,"operator-review-required");assert.equal(contract.execution.requiresConsentForEveryRun,true);assert.equal(contract.execution.modelCalled,false);assert.equal(contract.execution.paymentCalled,false);assert.equal(contract.execution.autoAcceptance,false);assert.equal(contract.execution.deploymentAttestation,false);
 assert.ok(!JSON.stringify(contract).includes("https://"));assert.ok(new TextEncoder().encode(JSON.stringify(contract)).byteLength<24*1024);assert.deepEqual(quote,before);
});
test("v1 handoff preserves original8steps and2/3guest canary; changing v2original maximum changes probes",()=>{
 const basic=buildRuntimeContract(quoteFor("booking-http-v1"));assert.equal(basic.steps.length,8);assert.equal(basic.syntheticCanary.partySize,2);assert.equal(basic.steps.find(step=>step.id==="conflict")!.bodyChange!.partySize,3);assert.equal("maximum"in basic.requestSchema.properties.partySize,false);
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
