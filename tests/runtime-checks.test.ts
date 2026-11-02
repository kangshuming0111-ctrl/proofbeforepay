import assert from "node:assert/strict";
import test from "node:test";
import { executeRuntimeCheck, type RuntimeCheckInput, type RuntimeFetch } from "../lib/runtime-runner.ts";
import { runtimeReportSummary, validateRuntimePlan, validateRuntimeReport, validateRuntimeTarget } from "../lib/runtime-checks.ts";

const source="Accept a booking with required slot and valid email, retain it for readback and handle repeated submission without duplicates.";
const target={id:"booking-fixed",label:"Disposable booking test",baseUrl:"https://verification.example.org/test-api/fixed/",revision:"booking-fixed-v2",testOnly:true as const};
const input:RuntimeCheckInput={deliveryId:"delivery-1",deliveryDigest:"a".repeat(64),runId:"92951916-73e6-4ee1-8251-7d513b37b966",plan:{protocol:"booking-http-v1",criterionId:"coverage-1",source:{start:0,end:source.length,excerpt:source}},target};
type Fault="none"|"false_success"|"invalid_accepted"|"duplicate"|"conflict_mutates"|"missing_fields"|"revision";
function backend(fault:Fault="none") {
  const calls:{url:string;init:RequestInit;body?:Record<string,unknown>}[]=[];
  let saved:Record<string,unknown>|undefined;
  const reply=(value:unknown,status=200)=>Response.json(value,{status});
  const fetcher:RuntimeFetch=async(url,init)=>{
    const body=typeof init.body==="string"?JSON.parse(init.body):undefined;
    calls.push({url,init,body});
    const route=new URL(url).pathname.replace("/test-api/fixed/","");
    if(route==="meta")return reply({revision:fault==="revision"?"unexpected-sensitive-revision":target.revision,operatorSecret:"never store this"});
    if(init.method==="GET")return saved&&fault!=="false_success"?reply({...saved,operatorSecret:"private-backend-secret"}):reply({error:"not saved",customer:"private-customer"},404);
    if(!body?.slot||body.email==="not-an-email")return fault==="invalid_accepted"?reply({accepted:true},201):reply({code:"synthetic_validation_failed"},422);
    if(saved){
      if(body.partySize===3){if(fault==="conflict_mutates")saved.partySize=3;return reply({code:"idempotency_conflict"},409);}
      return reply({...saved,...(fault==="duplicate"?{id:"booking-2"}:{})},200);
    }
    saved={...body,id:"booking-1",revision:target.revision};
    return fault==="missing_fields"?reply({id:"booking-1"},201):reply({...saved,operatorSecret:"private-backend-secret"},201);
  };
  return{fetcher,calls};
}

test("booking protocol exercises eight real interface calls and sanitizes evidence without changing input",async()=>{
  const state=backend(),before=structuredClone(input);const report=await executeRuntimeCheck(input,{fetch:state.fetcher});
  assert.deepEqual(report.summary,{steps:8,observed:8,issues:0,unavailable:0});assert.equal(state.calls.length,8);
  assert.deepEqual(input,before);assert.equal(report.deliveryDigest,input.deliveryDigest);assert.equal(report.id,input.runId);
  for(const call of state.calls){assert.equal(call.init.redirect,"manual");assert.equal(call.init.credentials,"omit");assert.equal(call.init.cache,"no-store");assert.equal(new URL(call.url).origin,"https://verification.example.org");assert.ok(!JSON.stringify(call.init.headers).toLowerCase().includes("authorization"));assert.ok(!JSON.stringify(call.init.headers).toLowerCase().includes("cookie"));}
  assert.ok(state.calls[4].url.endsWith("bookings/booking-1"));assert.equal(state.calls[4].body,undefined);assert.ok(!state.calls[4].url.includes(input.runId));assert.ok(!state.calls[4].url.includes("PBP-"));
  assert.equal((state.calls[3].init.headers as Record<string,string>)["Idempotency-Key"],(state.calls[5].init.headers as Record<string,string>)["Idempotency-Key"]);
  assert.equal((state.calls[3].init.headers as Record<string,string>)["Idempotency-Key"],(state.calls[6].init.headers as Record<string,string>)["Idempotency-Key"]);
  assert.ok(!JSON.stringify(report).includes("private-backend-secret"));assert.ok(!JSON.stringify(report).includes("operatorSecret"));
  assert.deepEqual(validateRuntimeReport(report,input),report);
});

test("a success response with no independent readback cannot be recorded as passing persistence",async()=>{
  const state=backend("false_success"),report=await executeRuntimeCheck(input,{fetch:state.fetcher});
  assert.equal(report.steps[3].outcome,"observed");assert.equal(report.steps[4].outcome,"mismatch");assert.equal(report.steps[7].outcome,"mismatch");assert.equal(report.summary.issues,2);
  assert.ok(!JSON.stringify(report).includes("private-customer"));
});
test("resuming a committed run recovers the same receipt without inventing its original creation response",async()=>{
  const state=backend(),first=await executeRuntimeCheck(input,{fetch:state.fetcher}),before=structuredClone(first);
  const retry=await executeRuntimeCheck(input,{fetch:state.fetcher,resuming:true});
  assert.deepEqual(first,before);assert.deepEqual(retry.summary,{steps:8,observed:7,issues:0,unavailable:1});
  assert.equal(retry.steps[3].status,200);assert.equal(retry.steps[3].outcome,"unavailable");assert.equal(retry.steps[3].reason,"resumed_creation_not_observed");
  assert.match(retry.steps[3].actual!,/original creation response was not observed/);
  assert.ok(retry.steps.slice(4).every(step=>step.outcome==="observed"));
  assert.equal(state.calls.length,16);assert.equal(state.calls[3].body!.testRunId,state.calls[11].body!.testRunId);
  assert.equal((state.calls[3].init.headers as Record<string,string>)["Idempotency-Key"],(state.calls[11].init.headers as Record<string,string>)["Idempotency-Key"]);
  assert.deepEqual(validateRuntimeReport(retry,input),retry);assert.ok(!JSON.stringify(retry).includes("private-backend-secret"));
});
test("an unexpected fresh create200 or an incomplete recovery record cannot unlock dependent checks",async()=>{
  const state=backend();await executeRuntimeCheck(input,{fetch:state.fetcher});
  const fresh=await executeRuntimeCheck(input,{fetch:state.fetcher});
  assert.equal(fresh.steps[3].outcome,"mismatch");assert.equal(fresh.steps[3].status,200);
  assert.ok(fresh.steps.slice(4).every(step=>step.outcome==="unavailable"&&step.reason==="create_not_verified"));
  assert.equal(state.calls.length,12);
  const incomplete=backend("missing_fields");let calls=0;
  const invalidRecovery=await executeRuntimeCheck(input,{resuming:true,fetch:async(url,init)=>{
    calls++;const response=await incomplete.fetcher(url,init);
    return calls===4?Response.json({id:"booking-1"},{status:200}):response;
  }});
  assert.equal(invalidRecovery.steps[3].outcome,"mismatch");assert.equal(calls,4);
  assert.ok(invalidRecovery.steps.slice(4).every(step=>step.reason==="create_not_verified"));
});
test("negative input acceptance and duplicate replay remain distinct protocol failures",async()=>{
  const negative=await executeRuntimeCheck(input,{fetch:backend("invalid_accepted").fetcher});
  assert.equal(negative.steps[1].outcome,"mismatch");assert.equal(negative.steps[2].outcome,"mismatch");assert.equal(negative.summary.issues,2);
  const replay=await executeRuntimeCheck(input,{fetch:backend("duplicate").fetcher});
  assert.equal(replay.steps[5].outcome,"mismatch");assert.equal(replay.steps[7].outcome,"observed");assert.match(replay.steps[5].actual!,/sameReceiptId":false/);
});
test("negative and conflict steps require bounded structured protocol rejection, not a generic status",async()=>{
  const scenarios:[()=>Response,string,string][]=[
    [()=>new Response("generic proxy failure",{status:422,headers:{"Content-Type":"text/plain"}}),"unavailable","non_json_response"],
    [()=>Response.json({code:"unrelated_validation",error:"private operator diagnostics"},{status:422}),"mismatch",""],
    [()=>Response.json({code:"synthetic_validation_failed"},{status:404}),"mismatch",""],
    [()=>Response.json({code:"synthetic_validation_failed"},{status:500}),"mismatch",""],
  ];
  for(const [response,outcome,reason] of scenarios){
    const state=backend();
    const report=await executeRuntimeCheck(input,{fetch:async(url,init)=>{
      const body=typeof init.body==="string"?JSON.parse(init.body):undefined;
      return init.method==="POST"&&body&&!body.slot?response():state.fetcher(url,init);
    }});
    assert.equal(report.steps[1].outcome,outcome);if(reason)assert.equal(report.steps[1].reason,reason);
    assert.equal(report.steps[2].outcome,"observed");assert.ok(!JSON.stringify(report).includes("private operator diagnostics"));
  }
  for(const response of [()=>new Response("generic conflict",{status:409}),()=>Response.json({code:"some_other_conflict"},{status:409})]){
    const state=backend(),report=await executeRuntimeCheck(input,{fetch:async(url,init)=>{
      const body=typeof init.body==="string"?JSON.parse(init.body):undefined;
      return init.method==="POST"&&body?.partySize===3?response():state.fetcher(url,init);
    }});
    assert.notEqual(report.steps[6].outcome,"observed");assert.equal(report.steps[7].outcome,"observed");
  }
});
test("a rejected conflicting replay must leave original record unchanged",async()=>{
  const report=await executeRuntimeCheck(input,{fetch:backend("conflict_mutates").fetcher});
  assert.equal(report.steps[6].outcome,"observed");assert.equal(report.steps[7].outcome,"mismatch");assert.match(report.steps[7].actual!,/partySize/);
});
test("an unverified revision performs no writes and missing receipt fields never invent a readback",async()=>{
  const changed=backend("revision"),report=await executeRuntimeCheck(input,{fetch:changed.fetcher});
  assert.equal(changed.calls.length,1);assert.equal(report.steps[0].outcome,"mismatch");assert.equal(report.summary.unavailable,7);assert.ok(!JSON.stringify(report).includes("unexpected-sensitive-revision"));
  const missing=backend("missing_fields"),second=await executeRuntimeCheck(input,{fetch:missing.fetcher});
  assert.equal(missing.calls.length,4);assert.equal(second.steps[3].outcome,"mismatch");assert.ok(second.steps.slice(4).every(step=>step.outcome==="unavailable"&&step.reason==="create_not_verified"));
});
test("redirects, arbitrary response URLs, huge bodies, malformed JSON and network failures remain unavailable",async()=>{
  const cases:[RuntimeFetch,string][]=[
    [async()=>new Response(null,{status:302,headers:{Location:"http://127.0.0.1/private"}}),"redirect_blocked"],
    [async()=>{const r=Response.json({revision:target.revision});Object.defineProperty(r,"url",{value:"https://other.example.org/"});return r;},"redirect_blocked"],
    [async()=>new Response("x".repeat(16*1024+1),{headers:{"Content-Type":"application/json"}}),"response_too_large"],
    [async()=>new Response("not-json",{headers:{"Content-Type":"application/json"}}),"invalid_json_response"],
    [async()=>{throw new Error("private response details must not enter report");},"network_unavailable"],
  ];
  for(const [fetch,reason] of cases){let calls=0;const report=await executeRuntimeCheck(input,{fetch:async(url,init)=>{calls++;return fetch(url,init);}});assert.equal(calls,1);assert.equal(report.steps[0].outcome,"unavailable");assert.equal(report.steps[0].reason,reason);assert.equal(report.summary.observed,0);assert.ok(!JSON.stringify(report).includes("private response details"));}
});
test("timeouts and caller cancellation terminate without claiming a check passed",async()=>{
  const timeout=await executeRuntimeCheck(input,{fetch:async()=>new Promise(()=>{}),requestTimeoutMs:5,totalTimeoutMs:20});
  assert.equal(timeout.steps[0].reason,"request_timeout");assert.equal(timeout.summary.observed,0);
  const controller=new AbortController();controller.abort();let calls=0;
  const aborted=await executeRuntimeCheck(input,{fetch:async()=>{calls++;return Response.json({});},signal:controller.signal});
  assert.equal(calls,0);assert.equal(aborted.steps[0].reason,"cancelled");assert.equal(aborted.summary.unavailable,8);
});
test("registry policy rejects unsafe target forms before making any request",async()=>{
  for(const baseUrl of ["http://verification.example.org/","https://user:password@verification.example.org/","https://verification.example.org/?token=x","https://verification.example.org/#token","https://127.0.0.1/","https://2130706433/","https://[::1]/","https://192.168.1.1/","https://metadata.internal/","https://verification.example.org/a/%2e%2e/","https://verification.example.org/a/../b/"]){assert.throws(()=>validateRuntimeTarget({...target,baseUrl}));}
  assert.throws(()=>validateRuntimeTarget({...target,testOnly:false}));assert.throws(()=>validateRuntimeTarget({...target,baseUrl:"http://127.0.0.1:5173/test/"}));
  assert.equal(validateRuntimeTarget({...target,baseUrl:"http://127.0.0.1:5173/test/"},{allowLoopback:true}).baseUrl,"http://127.0.0.1:5173/test/");
  let calls=0;await assert.rejects(()=>executeRuntimeCheck({...input,deliveryDigest:"wrong"},{fetch:async()=>{calls++;return Response.json({});}}));assert.equal(calls,0);
});
test("plan source, stored identities, summaries and step inventory remain exact and immutable",async()=>{
  assert.deepEqual(validateRuntimePlan(input.plan,{sourceText:source,criteria:[{id:"coverage-1"}]}),input.plan);
  assert.throws(()=>validateRuntimePlan({...input.plan,criterionId:"unknown"},{criteria:[{id:"coverage-1"}]}));
  assert.throws(()=>validateRuntimePlan({...input.plan,source:{...input.plan.source,end:2}},{sourceText:source}));
  const report=await executeRuntimeCheck(input,{fetch:backend().fetcher});const before=structuredClone(report);
  for(const mutation of [
    (r:typeof report)=>{r.deliveryId="other";},(r:typeof report)=>{r.deliveryDigest="b".repeat(64);},(r:typeof report)=>{r.runId="different";},
    (r:typeof report)=>{r.summary.observed=999;},(r:typeof report)=>{r.steps.pop();},(r:typeof report)=>{r.steps[4].path="bookings/:id";},
    (r:typeof report)=>{r.target.revision="other";},(r:typeof report)=>{r.plan.source.excerpt="x";},
  ]){const copy=structuredClone(report);mutation(copy);assert.throws(()=>validateRuntimeReport(copy,{...input,target:input.target}));}
  const validated=validateRuntimeReport(report,input);validated.steps[0].actual="External mutation";assert.deepEqual(report,before);
  assert.deepEqual(runtimeReportSummary(report.steps),report.summary);
});
