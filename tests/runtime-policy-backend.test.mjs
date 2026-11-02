import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {executeRuntimeCheck} from "../lib/runtime-runner.ts";
import {validateRuntimeReport,runtimeProtocolStepIds} from "../lib/runtime-checks.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {handlePolicyBookingRequest} from "./fixtures/booking-backend/worker/policy-booking-api.js";

function backend(){
  const sqlite=new DatabaseSync(":memory:");
  for(const name of ["0000_booking_lab.sql","0001_booking_policy_lab.sql"])sqlite.exec(readFileSync(new URL(`./fixtures/booking-backend/drizzle/${name}`,import.meta.url),"utf8"));
  const env={DB:{prepare(sql){const s=sqlite.prepare(sql);return{bind(...args){return{async first(){return s.get(...args)??null;},async run(){return{meta:{changes:Number(s.run(...args).changes)}};}};}};}}};
  const calls=[];
  return{sqlite,calls,async fetch(url,init){calls.push({url,init});return await handlePolicyBookingRequest(new Request(url,init),env);}};
}
function input(variant="fixed",maximum=6){
  const excerpt=`Each booking accepts at most ${maximum} people.`,source={start:0,end:excerpt.length,excerpt};
  return{deliveryId:"delivery-policy-1",deliveryDigest:"d".repeat(64),runId:crypto.randomUUID(),plan:{protocol:"booking-http-v2",criterionId:"coverage-policy",source,policy:suggestBookingPolicy(source)},target:{id:`lab-policy-${variant}`,label:"Controlled policy fixture",baseUrl:`https://policy.example.org/test-api/policy-${variant}/`,revision:`booking-policy-${variant}-v1`,testOnly:true,protocol:"booking-http-v2"}};
}
test("real SQL policy flow uses18bounded requests, explicit5/6/7 probes and simultaneous same-key calls",async()=>{
 const state=backend(),run=input();try{
  const report=await executeRuntimeCheck(run,{fetch:state.fetch});
  assert.deepEqual(report.summary,{steps:18,observed:18,issues:0,unavailable:0});assert.equal(state.calls.length,18);
  assert.equal(report.method,"server-booking-http-v2");assert.deepEqual(report.steps.map(s=>s.id),runtimeProtocolStepIds(run.plan));
  assert.equal(report.steps.find(s=>s.id==="party_above").status,422);
  const sent=state.calls.filter(c=>c.init.body).map(c=>JSON.parse(c.init.body).partySize);assert.ok(sent.includes(1)&&sent.includes(5)&&sent.includes(6)&&sent.includes(7)&&sent.includes(0)&&sent.includes(1.5));
  const concurrent=state.calls.filter(c=>c.init.headers["Idempotency-Key"]?.endsWith("-concurrent"));assert.equal(concurrent.length,2);
  assert.deepEqual(validateRuntimeReport(report,run),report);
  assert.equal(state.sqlite.prepare("SELECT COUNT(*) n FROM lab_policy_bookings").get().n,4);
 }finally{state.sqlite.close();}
});
test("a backend can pass basic persistence yet violate buyer max6 by actually storing7",async()=>{
 const state=backend(),run=input("flawed");try{
  const report=await executeRuntimeCheck(run,{fetch:state.fetch});
  assert.deepEqual(report.steps.slice(0,8).map(s=>s.outcome),Array(8).fill("observed"));
  assert.deepEqual(report.summary,{steps:18,observed:17,issues:1,unavailable:0});
  assert.equal(report.steps.find(s=>s.id==="party_above").status,201);assert.equal(state.sqlite.prepare("SELECT COUNT(*) n FROM lab_policy_bookings WHERE party_size=7").get().n,1);
  assert.deepEqual(validateRuntimeReport(report,run),report);
 }finally{state.sqlite.close();}
});
test("expected limits follow original buyer policy rather than server metadata or fixture constant",async()=>{
 for(const maximum of [5,7]){const state=backend(),run=input("fixed",maximum);try{
  const report=await executeRuntimeCheck(run,{fetch:state.fetch});
  assert.ok(report.summary.issues>0);assert.equal(report.plan.policy.maxPartySize,maximum);
  if(maximum===5)assert.equal(report.steps.find(s=>s.id==="party_above").outcome,"mismatch");
  else{assert.equal(report.steps.find(s=>s.id==="party_exact").outcome,"mismatch");assert.equal(report.steps.find(s=>s.id==="party_exact_readback").reason,"boundary_not_verified");}
 }finally{state.sqlite.close();}}
});
test("a server enforcing a lower ceiling cannot pass the agreed max6 boundary observations",async()=>{
 for(const actualMaximum of [1,4]){const state=backend(),run=input();try{
  const report=await executeRuntimeCheck(run,{fetch:async(url,init)=>{
   const body=init.body?JSON.parse(init.body):undefined;
   if(body&&Number.isInteger(body.partySize)&&body.partySize>actualMaximum)return Response.json({code:"party_size_exceeded"},{status:422});
   return state.fetch(url,init);
  }});
  assert.equal(report.steps.find(s=>s.id==="party_below").outcome,"mismatch");assert.equal(report.steps.find(s=>s.id==="party_exact").outcome,"mismatch");assert.ok(report.summary.issues>=2);
 }finally{state.sqlite.close();}}
});
test("resumed policy run retains unobserved creation/concurrency rather than inventing fresh responses",async()=>{
 const state=backend(),run=input();try{
  await executeRuntimeCheck(run,{fetch:state.fetch});
  const recovered=await executeRuntimeCheck(run,{fetch:state.fetch,resuming:true});
  assert.equal(recovered.steps.find(s=>s.id==="create").reason,"resumed_creation_not_observed");
  assert.equal(recovered.steps.find(s=>s.id==="concurrent_first").reason,"resumed_concurrency_not_observed");
  assert.equal(recovered.steps.find(s=>s.id==="concurrent_second").reason,"resumed_concurrency_not_observed");
  assert.equal(recovered.steps.at(-1).outcome,"observed");assert.equal(recovered.summary.issues,0);assert.equal(recovered.summary.unavailable,3);
  assert.deepEqual(validateRuntimeReport(recovered,run),recovered);
 }finally{state.sqlite.close();}
});
test("one timed-out concurrent peer cannot be falsely labelled an observed pair or duplicate failure",async()=>{
 const state=backend(),run=input();let seen=0;try{
  const report=await executeRuntimeCheck(run,{fetch:async(url,init)=>{if(init.headers["Idempotency-Key"]?.endsWith("-concurrent")&&++seen===2)throw new Error("synthetic peer unavailable");return state.fetch(url,init);}});
  assert.equal(report.steps.find(s=>s.id==="concurrent_first").outcome,"unavailable");assert.equal(report.steps.find(s=>s.id==="concurrent_first").reason,"concurrent_peer_unavailable");
  assert.equal(report.steps.find(s=>s.id==="concurrent_second").outcome,"unavailable");assert.equal(report.steps.at(-1).outcome,"unavailable");
 }finally{state.sqlite.close();}
});
test("unsupported protocol and tampered policy fail before any external request; report inventory cannot borrow v1",async()=>{
 const run=input();let calls=0;const fetch=async()=>{calls++;throw new Error("must not fetch");};
 await assert.rejects(()=>executeRuntimeCheck({...run,target:{...run.target,protocol:"booking-http-v1"}},{fetch}));
 await assert.rejects(()=>executeRuntimeCheck({...run,plan:{...run.plan,policy:{...run.plan.policy,maxPartySize:7}}},{fetch}));assert.equal(calls,0);
 const state=backend();try{const report=await executeRuntimeCheck(run,{fetch:state.fetch});const copy=structuredClone(report);copy.steps=copy.steps.slice(0,8);copy.summary={steps:8,observed:8,issues:0,unavailable:0};assert.throws(()=>validateRuntimeReport(copy,run));}finally{state.sqlite.close();}
});
