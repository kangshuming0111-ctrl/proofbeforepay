import assert from "node:assert/strict";
import test from "node:test";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {executeRuntimeCheck, type RuntimeCheckInput, type RuntimeFetch} from "../lib/runtime-runner.ts";
import {validateRuntimeReport} from "../lib/runtime-checks.ts";

type Fault="none"|"shared_id"|"global_last"|"lose_boundaries"|"unavailable_final_read";
function input():RuntimeCheckInput{
  const excerpt="Each booking accepts at most 6 people.",source={start:0,end:excerpt.length,excerpt};
  return{deliveryId:"cross-key-delivery",deliveryDigest:"d".repeat(64),runId:crypto.randomUUID(),
    plan:{protocol:"booking-http-v2",criterionId:"coverage-policy",source,policy:suggestBookingPolicy(source)!},
    target:{id:"cross-key-audit",label:"Synthetic cross-key persistence audit",baseUrl:"https://audit.example.org/pbp/",revision:"cross-key-v1",testOnly:true,protocol:"booking-http-v2"}};
}
function backend(run:RuntimeCheckInput,fault:Fault="none"){
  const byKey=new Map<string,Record<string,unknown>>(),byId=new Map<string,Record<string,unknown>>();
  const calls:{method:string;path:string;key?:string}[]=[];let last:Record<string,unknown>|undefined,created=0,concurrentWritten=false;
  const fetcher:RuntimeFetch=async(url,init)=>{
    const path=new URL(url).pathname,key=(init.headers as Record<string,string>)["Idempotency-Key"];
    calls.push({method:init.method!,path,...(key?{key}:{})});
    if(path.endsWith("/meta"))return Response.json({revision:run.target.revision,protocol:"booking-http-v2"});
    if(init.method==="GET"){
      if(fault==="unavailable_final_read"&&concurrentWritten)throw new Error("synthetic final-read outage");
      const id=path.split("/").at(-1)!,row=fault==="shared_id"||fault==="global_last"?last:byId.get(id);
      return row?Response.json(row):Response.json({code:"not_found"},{status:404});
    }
    const body=JSON.parse(init.body as string) as Record<string,unknown>;
    if(!body.slot||body.email==="not-an-email")return Response.json({code:"synthetic_validation_failed"},{status:422});
    if(!Number.isInteger(body.partySize)||(body.partySize as number)<1)return Response.json({code:"party_size_invalid"},{status:422});
    const saved=byKey.get(key);
    if(saved)return body.partySize===saved.partySize?Response.json(saved):Response.json({code:"idempotency_conflict"},{status:409});
    if((body.partySize as number)>6)return Response.json({code:"party_size_exceeded"},{status:422});
    const row={...body,id:fault==="shared_id"?"one-global-receipt":`receipt-${++created}`,revision:run.target.revision};
    byKey.set(key,row);byId.set(row.id,row);last=row;
    if(key.endsWith("-concurrent")){
      concurrentWritten=true;
      if(fault==="lose_boundaries")for(const [id,record]of byId)if(record.partySize===5||record.partySize===6)byId.delete(id);
    }
    return Response.json(row,{status:201});
  };
  return{fetcher,calls,byId};
}
const step=(report:Awaited<ReturnType<typeof executeRuntimeCheck>>,id:string)=>report.steps.find(row=>row.id===id)!;

test("independent keys cannot reuse one global receipt ID and overwrite prior bookings",async()=>{
  const run=input(),state=backend(run,"shared_id"),report=await executeRuntimeCheck(run,{fetch:state.fetcher});
  assert.equal(step(report,"create").outcome,"observed");
  for(const id of["party_below","party_exact","concurrent_first","concurrent_second"]){
    assert.equal(step(report,id).outcome,"mismatch",id);assert.match(step(report,id).actual!,/distinctIndependentReceiptId: false/u);
  }
  assert.ok(report.summary.issues>=4);assert.equal(state.byId.size,1);
  assert.ok(state.calls.length<=18);assert.deepEqual(validateRuntimeReport(report,run),report);
});

test("unique receipt IDs do not hide a backend whose GET always returns only the last booking",async()=>{
  const run=input(),state=backend(run,"global_last"),report=await executeRuntimeCheck(run,{fetch:state.fetcher});
  for(const id of["readback","unchanged","party_below_readback","party_exact_readback"])assert.equal(step(report,id).outcome,"mismatch",id);
  assert.equal(step(report,"concurrent_readback").outcome,"observed");assert.equal(report.summary.issues,4);
  assert.equal(state.calls.length,18);assert.deepEqual(validateRuntimeReport(report,run),report);
});

test("earlier five- and six-guest records must survive a subsequent independent-key create",async()=>{
  const run=input(),state=backend(run,"lose_boundaries"),report=await executeRuntimeCheck(run,{fetch:state.fetcher});
  for(const id of["party_below_readback","party_exact_readback"]){assert.equal(step(report,id).status,404);assert.equal(step(report,id).outcome,"mismatch");}
  assert.equal(step(report,"unchanged").outcome,"observed");assert.equal(report.summary.issues,2);
  assert.equal(state.calls.length,18);assert.deepEqual(validateRuntimeReport(report,run),report);
});

test("correct per-key storage keeps all18 canonical steps while final witnesses follow every create",async()=>{
  const run=input(),before=structuredClone(run),state=backend(run),report=await executeRuntimeCheck(run,{fetch:state.fetcher});
  assert.deepEqual(report.summary,{steps:18,observed:18,issues:0,unavailable:0});assert.deepEqual(run,before);
  assert.equal(state.byId.size,4);assert.equal(state.calls.length,18);
  const firstRead=state.calls.findIndex(call=>call.method==="GET"&&!call.path.endsWith("/meta"));
  const lastPost=state.calls.findLastIndex(call=>call.method==="POST");assert.ok(firstRead>lastPost);
  assert.deepEqual(report.steps.map(row=>row.id),["revision","missing_slot","invalid_email","create","readback","replay","conflict","unchanged","party_zero","party_fraction","party_below","party_below_readback","party_exact","party_exact_readback","party_above","concurrent_first","concurrent_second","concurrent_readback"]);
  assert.deepEqual(validateRuntimeReport(report,run),report);
});

test("recovery keeps original create and concurrency unobserved while rereading every retained receipt",async()=>{
  const run=input(),state=backend(run);await executeRuntimeCheck(run,{fetch:state.fetcher});
  const report=await executeRuntimeCheck(run,{fetch:state.fetcher,resuming:true});
  assert.deepEqual(report.summary,{steps:18,observed:15,issues:0,unavailable:3});
  assert.equal(step(report,"create").reason,"resumed_creation_not_observed");
  // This retry's own replay response is observed now. It does not establish
  // the creation response from the interrupted earlier attempt.
  assert.equal(step(report,"replay").outcome,"observed");assert.equal(step(report,"replay").status,200);assert.equal(step(report,"replay").reason,undefined);
  for(const id of["concurrent_first","concurrent_second"])assert.equal(step(report,id).reason,"resumed_concurrency_not_observed");
  for(const id of["readback","unchanged","party_below_readback","party_exact_readback","concurrent_readback"])assert.equal(step(report,id).outcome,"observed");
  assert.equal(state.byId.size,4);assert.deepEqual(validateRuntimeReport(report,run),report);
});

test("unavailable final witnesses cannot inherit successful earlier create responses",async()=>{
  const run=input(),state=backend(run,"unavailable_final_read"),report=await executeRuntimeCheck(run,{fetch:state.fetcher});
  assert.equal(report.summary.unavailable,5);assert.equal(report.summary.issues,0);
  for(const id of["readback","unchanged","party_below_readback","party_exact_readback","concurrent_readback"]){assert.equal(step(report,id).outcome,"unavailable");assert.equal(step(report,id).reason,"network_unavailable");}
  assert.equal(state.calls.length,18);assert.deepEqual(validateRuntimeReport(report,run),report);
});
