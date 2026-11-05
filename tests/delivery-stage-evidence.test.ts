import test from "node:test";
import assert from "node:assert/strict";
import {DELIVERY_STAGES,createDeliveryStageReport,validateDeliveryStagePlan,validateDeliveryStageReport,type DeliveryStagePlan,type DeliveryStageObservation} from "../lib/delivery-stage-evidence.ts";
import {createDeliveryStageProbe} from "../lib/delivery-stage-probe.ts";
const digest="a".repeat(64);
const plan=():DeliveryStagePlan=>({schema:"pbp-delivery-stage-plan-v1",runId:"stage-controlled-1",syntheticOnly:true,scope:{projectId:"project-test",deliveryId:"delivery-test",criterionId:"manual-1",sourceRevision:"reference-v1",requirement:"Submit the enquiry, store it, read it back with a new connection, and send a test receipt."},payloadDigest:digest,stages:DELIVERY_STAGES.map(stage=>({stage,coverage:"adapter"}))});
const observations=():DeliveryStageObservation[]=>[
 {outcome:"observed",stage:"submit",runId:plan().runId,sourceRevision:plan().scope.sourceRevision,accepted:true,operationId:"post-enquiry",record:{recordId:"record-1",payloadDigest:digest}},
 {outcome:"observed",stage:"stored_record",runId:plan().runId,sourceRevision:plan().scope.sourceRevision,reader:"native_store",connectionId:"writer",record:{recordId:"record-1",payloadDigest:digest}},
 {outcome:"observed",stage:"fresh_readback",runId:plan().runId,sourceRevision:plan().scope.sourceRevision,reader:"fresh_connection",connectionId:"fresh-reader",record:{recordId:"record-1",payloadDigest:digest}},
 {outcome:"observed",stage:"email_receipt",runId:plan().runId,sourceRevision:plan().scope.sourceRevision,transport:"test_sink",receipt:{recordId:"record-1",payloadDigest:digest,receiptId:"mail-1"}}
];

test("all four scoped cooperative observations match without acceptance or authenticity claims",async()=>{
 const p=plan(),o=observations(),before=structuredClone({p,o}),r=await createDeliveryStageReport(p,o);
 assert.deepEqual(r.summary,{matched:4,mismatch:0,unknown:0,unsupported:0});assert.equal(r.evidenceLevel,"cooperative_adapter_observations");assert.equal("acceptance" in r,false);assert.deepEqual({p,o},before);assert.deepEqual(await validateDeliveryStageReport(r),r);
 const reordered=JSON.parse(JSON.stringify(r,(_k,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v));assert.deepEqual(await validateDeliveryStageReport(reordered),r);
});
test("missing records, identity/content mismatches and nonfresh readers remain separate failures",async()=>{
 for(const [stage,key,value,reason]of [[1,"record",null,"record_missing"],[2,"connectionId","writer","reader_not_fresh"],[2,"record",{recordId:"record-2",payloadDigest:digest},"record_identity_differs"],[3,"receipt",null,"receipt_missing"],[1,"record",{recordId:"record-1",payloadDigest:"b".repeat(64)},"payload_differs"]]as const){
  const o=observations();Object.assign(o[stage],{[key]:value});const r=await createDeliveryStageReport(plan(),o);assert.equal(r.rows[stage].status,"mismatch");assert.equal(r.rows[stage].reason,reason);assert.equal(r.rows[0].status,"matched");
 }
});
test("wrong run and source revision are not accepted; current project is not inferred from imported claims",async()=>{
 for(const field of ["runId","sourceRevision"]){const o=observations();Object.assign(o[1],{[field]:"wrong-identity"});const r=await createDeliveryStageReport(plan(),o);assert.equal(r.rows[1].reason,"wrong_run_or_revision");}
});
test("manual/unsupported coverage remains visible and cannot contain a fabricated executed observation",async()=>{
 const p=plan();p.stages[2].coverage="manual";p.stages[3].coverage="unsupported";const o=observations();o[2]={outcome:"unknown",reason:"manual_required"};o[3]={outcome:"unsupported"};const r=await createDeliveryStageReport(p,o);assert.deepEqual(r.summary,{matched:2,mismatch:0,unknown:1,unsupported:1});await assert.rejects(()=>createDeliveryStageReport(p,observations()));
});
test("complete ordered stage list, exact fields and budgets reject malformed evidence before getters execute",async()=>{
 for(const mutate of [(p:any)=>p.stages.pop(),(p:any)=>p.stages[1].stage="submit",(p:any)=>p.syntheticOnly=false,(p:any)=>p.scope.requirement="x".repeat(4001),(p:any)=>p.secret="hidden",(p:any)=>p.payloadDigest="bad"]){const p=plan();mutate(p);assert.throws(()=>validateDeliveryStagePlan(p));}
 let read=false;const evil=plan();Object.defineProperty(evil,"runId",{get(){read=true;throw Error("getter");}});assert.throws(()=>validateDeliveryStagePlan(evil));assert.equal(read,false);
 const r=await createDeliveryStageReport(plan(),observations());for(const mutate of [(r:any)=>r.rows[1].status="unknown",(r:any)=>r.summary.matched=3,(r:any)=>r.digest="0".repeat(64),(r:any)=>r.rows[1].observation.privateToken="never"]){const wrong=structuredClone(r);mutate(wrong);await assert.rejects(()=>validateDeliveryStageReport(wrong));}
});
test("adapter errors use a fixed code, do not leak error text and never retry or continue uncertain effects",async()=>{
 let calls=0,later=0;const probe=createDeliveryStageProbe({submit:async()=>{calls++;throw Error("private-url-and-password");},stored_record:async()=>{later++;return observations()[1];}});
 const r=await probe.run(plan());assert.equal(calls,1);assert.equal(later,0);assert.deepEqual(r.rows.map(x=>x.status),["unknown","unknown","unknown","unknown"]);assert.equal(r.rows[0].reason,"adapter_error");assert.ok(!JSON.stringify(r).includes("private-url"));await assert.rejects(()=>probe.run(plan()),/EXTERNAL_OUTCOME_UNKNOWN/u);
});
test("timeout closes a probe, blocks concurrent reuse and never resends writes",async()=>{
 let calls=0,sawAbort=false;const probe=createDeliveryStageProbe({submit:async({signal})=>{calls++;await new Promise<void>(resolve=>signal.addEventListener("abort",()=>{sawAbort=true;resolve();}));return observations()[0];}},{timeoutMs:5});
 const pending=probe.run(plan());await assert.rejects(()=>probe.run(plan()),/BUSY/u);const r=await pending;assert.equal(calls,1);assert.equal(sawAbort,true);assert.equal(r.rows[0].reason,"timeout");await assert.rejects(()=>probe.run(plan()),/EXTERNAL_OUTCOME_UNKNOWN/u);
});
test("missing and manually declared adapters do not run code or invent success",async()=>{
 let calls=0;const p=plan();p.stages[0].coverage="manual";p.stages[3].coverage="unsupported";const r=await createDeliveryStageProbe({submit:async()=>{calls++;return observations()[0];}}).run(p);assert.equal(calls,0);assert.equal(r.summary.matched,0);assert.equal(r.rows[0].status,"unknown");assert.equal(r.rows[3].status,"unsupported");
});
test("a malformed adapter output yields fixed unknown and no downstream calls",async()=>{
 let calls=0;const r=await createDeliveryStageProbe({submit:async()=>({outcome:"observed",stage:"submit",secret:"not-retained"}),stored_record:async()=>{calls++;return observations()[1];}}).run(plan());assert.equal(calls,0);assert.equal(r.rows[0].reason,"adapter_error");assert.ok(!JSON.stringify(r).includes("not-retained"));
});
