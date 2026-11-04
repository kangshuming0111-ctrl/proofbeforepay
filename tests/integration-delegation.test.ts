import assert from "node:assert/strict";
import test from "node:test";
import {modelFixture} from "./model-check-fixture.ts";
import {JOURNEY_INTEGRATION_TEMPLATE} from "../lib/journey-integration-preflight.ts";
import {newIntegrationRequest,reviewAssignedIntegrationRequest,validateIntegrationRequest} from "../lib/seller-integration.ts";
import {assertAssignedIntegrationOperator,changeIntegrationDelegation,integrationReviewerChoices,integrationTargetEnabled,validateIntegrationDelegation} from "../lib/integration-delegation.ts";
const at=Date.parse("2026-11-04T00:00:00.000Z"),operators=["reviewer-one","reviewer-two","buyer","seller"];
async function fixture(){const f=await modelFixture(),application=await newIntegrationRequest(f.quote,"seller","seller",{action:"submit",deliveryId:f.quote.proof.delivery!.id,manifest:structuredClone(JOURNEY_INTEGRATION_TEMPLATE)},undefined,at),choices=await integrationReviewerChoices(operators,"buyer","seller");return{...f,application,choices};}
function access(request:Awaited<ReturnType<typeof fixture>>["application"],key:string|null,grant=true){return{action:grant?"grant-review":"revoke-review",requestId:request.id,expectedRevision:request.revision,expectedDelegationRevision:request.delegation?.revision??0,reviewerKey:key,confirm:true};}
function decision(request:Awaited<ReturnType<typeof fixture>>["application"]){return{action:"review",requestId:request.id,expectedRevision:request.revision,expectedDelegationRevision:request.delegation!.revision,status:"approved",reason:"Independent configured reviewer checked synthetic staging ownership.",approval:{label:"External staging",scenario:"fixed",expiresAt:new Date(at+86400000).toISOString()}};}
test("buyer explicitly assigns one configured independent reviewer; no role or membership is granted",async()=>{
 const f=await fixture(),before=structuredClone(f.application);assert.equal(f.choices.length,2);assert.equal(f.choices.some(row=>row.key.includes(row.id)),false);
 const assigned=await changeIntegrationDelegation(f.application,"buyer","buyer","seller",operators,access(f.application,f.choices[0].key),at+1000);
 assert.equal(assigned.delegation!.active,true);assert.equal(assigned.delegation!.operatorId,"reviewer-one");assert.deepEqual(f.application,before);assert.deepEqual(await validateIntegrationRequest(assigned),assigned);
 assert.doesNotThrow(()=>assertAssignedIntegrationOperator(assigned,"reviewer-one","buyer","seller",operators));
 for(const actor of["buyer","seller","reviewer-two","outsider"])assert.throws(()=>assertAssignedIntegrationOperator(assigned,actor,"buyer","seller",operators),/not found/);
 assert.throws(()=>assertAssignedIntegrationOperator(assigned,"reviewer-one","buyer","seller",[]),/not found/);
});
test("sharing rejects seller, caller-supplied authority, stale revisions, invalid choice and absent explicit disclosure",async()=>{
 const f=await fixture(),input=access(f.application,f.choices[0].key);
 await assert.rejects(()=>changeIntegrationDelegation(f.application,"seller","buyer","seller",operators,input,at+1000),/Only.*buyer/);
 for(const patch of[{reviewerKey:"reviewer-one"},{confirm:false},{expectedRevision:9},{expectedDelegationRevision:1},{operatorId:"reviewer-one"},{buyerId:"other-buyer"}])await assert.rejects(()=>changeIntegrationDelegation(f.application,"buyer","buyer","seller",operators,{...input,...patch},at+1000));
});
test("independent reviewer approval is exact-delivery bound and stale delegation cannot authorize a decision",async()=>{
 const f=await fixture(),assigned=await changeIntegrationDelegation(f.application,"buyer","buyer","seller",operators,access(f.application,f.choices[0].key),at+1000),before=structuredClone(f.quote);
 const approved=await reviewAssignedIntegrationRequest(f.quote,assigned,"reviewer-one","buyer","seller",operators,decision(assigned),at+2000);assert.equal(approved.status,"approved");assert.equal(integrationTargetEnabled(approved),true);assert.deepEqual(await validateIntegrationRequest(approved),approved);assert.deepEqual(f.quote,before);
 const changed=structuredClone(f.quote);changed.proof.delivery!.files!["index.html"]+="<!--replaced-->";await assert.rejects(()=>reviewAssignedIntegrationRequest(changed,assigned,"reviewer-one","buyer","seller",operators,decision(assigned),at+2000),/replaced upload/);
 await assert.rejects(()=>reviewAssignedIntegrationRequest(f.quote,assigned,"reviewer-one","buyer","seller",operators,{...decision(assigned),expectedDelegationRevision:0},at+2000),/access changed/);
 await assert.rejects(()=>reviewAssignedIntegrationRequest(f.quote,assigned,"reviewer-two","buyer","seller",operators,decision(assigned),at+2000),/not found/);
});
test("withdrawal disables future testing and reviewer reads while preserving approved registration and original history",async()=>{
 const f=await fixture(),assigned=await changeIntegrationDelegation(f.application,"buyer","buyer","seller",operators,access(f.application,f.choices[0].key),at+1000),approved=await reviewAssignedIntegrationRequest(f.quote,assigned,"reviewer-one","buyer","seller",operators,decision(assigned),at+2000);
 const withdrawn=await changeIntegrationDelegation(approved,"buyer","buyer","seller",operators,access(approved,null,false),at+3000);
 assert.equal(integrationTargetEnabled(withdrawn),false);assert.deepEqual(withdrawn.registration,approved.registration);assert.deepEqual(withdrawn.history,approved.history);assert.equal(withdrawn.revision,approved.revision);assert.equal(withdrawn.delegation!.revision,2);assert.deepEqual(await validateIntegrationRequest(withdrawn),withdrawn);
 assert.throws(()=>assertAssignedIntegrationOperator(withdrawn,"reviewer-one","buyer","seller",operators),/not found/);
 await assert.rejects(()=>changeIntegrationDelegation(withdrawn,"buyer","buyer","seller",operators,access(withdrawn,f.choices[1].key),at+4000),/pending application/);
 const next=await newIntegrationRequest(f.quote,"seller","seller",{action:"submit",deliveryId:f.quote.proof.delivery!.id,manifest:structuredClone(JOURNEY_INTEGRATION_TEMPLATE),previousRequestId:withdrawn.id},withdrawn,at+4000);assert.equal(next.previousRequestId,withdrawn.id);assert.equal(next.delegation,undefined);assert.equal(integrationTargetEnabled(next),false);
});
test("pending reassignment requires withdrawal; complete audit remains bounded and tamper-evident",async()=>{
 const f=await fixture();let item=f.application;
 item=await changeIntegrationDelegation(item,"buyer","buyer","seller",operators,access(item,f.choices[0].key),at+1000);
 await assert.rejects(()=>changeIntegrationDelegation(item,"buyer","buyer","seller",operators,access(item,f.choices[1].key),at+2000),/withdraw/);
 item=await changeIntegrationDelegation(item,"buyer","buyer","seller",operators,access(item,null,false),at+2000);
 item=await changeIntegrationDelegation(item,"buyer","buyer","seller",operators,access(item,f.choices[1].key),at+3000);assert.equal(item.delegation!.operatorId,"reviewer-two");assert.equal(item.delegation!.events.length,3);
 for(const mutate of[(x:typeof item.delegation)=>{x!.active=false;},(x:typeof item.delegation)=>{x!.operatorId="seller";},(x:typeof item.delegation)=>{x!.events[0].buyerId="other";},(x:typeof item.delegation)=>{x!.events[1].at=new Date(at).toISOString();}]){const bad=structuredClone(item.delegation);mutate(bad);assert.throws(()=>validateIntegrationDelegation(bad,item.submittedAt,item.submittedBy));}
 for(let i=4;i<=8;i++)item=await changeIntegrationDelegation(item,"buyer","buyer","seller",operators,access(item,i%2?f.choices[0].key:null,i%2===1),at+i*1000);
 await assert.rejects(()=>changeIntegrationDelegation(item,"buyer","buyer","seller",operators,access(item,f.choices[0].key),at+9000),/history is full/);
});
