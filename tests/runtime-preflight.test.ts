import assert from "node:assert/strict";
import test from "node:test";
import {runRuntimePreflight,type RuntimePreflightFetch} from "../lib/runtime-preflight.ts";
import {registrationTarget,type RuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";

const registration:RuntimeRegistrationSnapshot={id:"seller-staging",label:"Seller staging",projectId:"project-1",registrationRevision:"review-1",protocol:"booking-http-v2",baseUrl:"https://seller.example.org/pbp/",deploymentRevision:"seller-build-1",frontendBundleDigest:"a".repeat(64),backendArtifactDigest:"b".repeat(64),expiresAt:"2036-11-03T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
const input=()=>({deliveryId:"delivery-1",protocol:registration.protocol,target:registrationTarget(registration),registration:structuredClone(registration)});
const metadata=()=>({revision:registration.deploymentRevision,protocol:registration.protocol,projectId:registration.projectId,registrationRevision:registration.registrationRevision,frontendBundleDigest:registration.frontendBundleDigest,backendArtifactDigest:registration.backendArtifactDigest});

test("connection preflight issues one GET meta without booking body, cookies, auth or provider requests",async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const result=await runRuntimePreflight(input(),{fetch:async(url,init)=>{calls.push({url,init});return Response.json({...metadata(),privateExtra:"MUST-NOT-BE-RETAINED"});}});
  assert.equal(result.status,"matched");assert.equal(calls.length,1);assert.equal(calls[0].url,registration.baseUrl+"meta");
  assert.equal(calls[0].init.method,"GET");assert.equal(calls[0].init.body,undefined);assert.equal(calls[0].init.credentials,"omit");assert.equal(calls[0].init.redirect,"manual");
  assert.deepEqual(calls[0].init.headers,{Accept:"application/json","Cache-Control":"no-cache"});assert.equal(JSON.stringify(result).includes("MUST-NOT"),false);assert.equal(JSON.stringify(result).includes(registration.frontendBundleDigest),false);
  assert.equal(Object.hasOwn(result,"runId"),false);assert.equal(Object.hasOwn(result,"steps"),false);
});

test("preflight reports only controlled missing/mismatched/malformed fields",async()=>{
  const result=await runRuntimePreflight(input(),{fetch:async()=>Response.json({...metadata(),projectId:"other-project",registrationRevision:17,frontendBundleDigest:undefined})});
  assert.equal(result.status,"mismatch");
  assert.deepEqual(result.diagnosis,{matches:false,missing:["frontendBundleDigest"],mismatch:["projectId"],malformed:["registrationRevision"]});
  assert.equal(JSON.stringify(result).includes("other-project"),false);
});

test("redirects, denied status, nonJSON, invalid JSON and oversized declarations fail with one bounded GET",async()=>{
  const cases:[()=>Response,string][]=[
    [()=>new Response(null,{status:302,headers:{Location:"https://other.example.org/"}}),"redirect_blocked"],
    [()=>new Response(null,{status:403}),"access_denied"],
    [()=>new Response(null,{status:503}),"http_error"],
    [()=>new Response("<html>private page</html>",{headers:{"Content-Type":"text/html"}}),"non_json_response"],
    [()=>new Response("{invalid",{headers:{"Content-Type":"application/json"}}),"invalid_json_response"],
    [()=>new Response(new Uint8Array([0xc3,0x28]),{headers:{"Content-Type":"application/json"}}),"invalid_json_response"],
    [()=>new Response(" ".repeat(16*1024+1),{headers:{"Content-Type":"application/json"}}),"response_too_large"],
    [()=>new Response("{}",{headers:{"Content-Type":"application/json","Content-Length":"65536"}}),"response_too_large"],
  ];
  for(const[response,reason]of cases){let calls=0;const result=await runRuntimePreflight(input(),{fetch:async()=>{calls++;return response();}});assert.equal(calls,1);assert.equal(result.status,"unavailable");if(result.status==="unavailable")assert.equal(result.reason,reason);}
});

test("timeout and caller cancellation abort the single operation without retry",async()=>{
  let calls=0,aborted=false;
  const stalled:RuntimePreflightFetch=async(_url,init)=>{calls++;init.signal?.addEventListener("abort",()=>{aborted=true;});return new Promise(()=>{});};
  const timed=await runRuntimePreflight(input(),{fetch:stalled,timeoutMs:5});assert.equal(timed.status,"unavailable");if(timed.status==="unavailable")assert.equal(timed.reason,"timeout");assert.equal(calls,1);assert.equal(aborted,true);
  const controller=new AbortController();controller.abort();calls=0;
  const cancelled=await runRuntimePreflight(input(),{fetch:stalled,signal:controller.signal});assert.equal(cancelled.status,"unavailable");if(cancelled.status==="unavailable")assert.equal(cancelled.reason,"cancelled");assert.equal(calls,0);
  let streamCancelled=false;
  const streamed=await runRuntimePreflight(input(),{timeoutMs:5,fetch:async()=>new Response(new ReadableStream({cancel(){streamCancelled=true;}}),{headers:{"Content-Type":"application/json"}})});
  assert.equal(streamed.status,"unavailable");if(streamed.status==="unavailable")assert.equal(streamed.reason,"timeout");assert.equal(streamCancelled,true);
});

test("pending fetch rejecting AbortError on signal abort preserves caller cancellation and timeout labels",async()=>{
  for(const trigger of["caller","timeout"] as const){
    let notifyStarted:()=>void=()=>{},calls=0,abortRejections=0,rejectedError:DOMException|undefined;
    const started=new Promise<void>(resolve=>{notifyStarted=resolve;}),controller=new AbortController();
    const rejectingFetch:RuntimePreflightFetch=(_url,init)=>new Promise<Response>((_resolve,reject)=>{
      calls++;assert.ok(init.signal);assert.equal(init.signal.aborted,false);
      // Real fetch rejects when aborted. This exercises that rejection rather
      // than leaving the operation permanently unsettled behind Promise.race.
      init.signal.addEventListener("abort",()=>{abortRejections++;rejectedError=new DOMException("aborted","AbortError");reject(rejectedError);},{once:true});
      notifyStarted();
    });
    const pending=runRuntimePreflight(input(),{fetch:rejectingFetch,signal:controller.signal,timeoutMs:trigger==="timeout"?5:1000});
    await started;if(trigger==="caller")controller.abort();
    const result=await pending;
    assert.equal(calls,1);assert.equal(abortRejections,1);assert.equal(rejectedError?.name,"AbortError");assert.equal(result.status,"unavailable");
    if(result.status==="unavailable")assert.equal(result.reason,trigger==="caller"?"cancelled":"timeout");
  }
});

test("expired or inconsistent saved registration never reaches the network",async()=>{
  let calls=0;const fetcher:RuntimePreflightFetch=async()=>{calls++;throw new Error("must not fetch");};
  const expired=input();expired.registration.expiresAt="2000-01-01T00:00:00.000Z";
  const result=await runRuntimePreflight(expired,{fetch:fetcher});assert.equal(result.status,"unavailable");if(result.status==="unavailable")assert.equal(result.reason,"registration_expired");
  const changed=input();changed.registration.baseUrl="https://other.example.org/pbp/";
  await assert.rejects(()=>runRuntimePreflight(changed,{fetch:fetcher}),/differs from the saved registration/u);assert.equal(calls,0);
});
