import assert from "node:assert/strict";
import test from "node:test";
import {register} from "node:module";
import {newProjectJourneyPlan,validateJourneyRegistration,type ProjectJourneyRun} from "../lib/project-journey.ts";
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(specifier,context,nextResolve){return specifier==="cloudflare:workers"?{url:"data:text/javascript,export const env = {}",shortCircuit:true}:nextResolve(specifier,context);}`)}`,import.meta.url);
const {readProjectJourneyStep}=await import("../lib/server-journey-targets.ts");
const origin="https://synthetic-seller.example.org";
function fixture():ProjectJourneyRun{const plan=newProjectJourneyPlan(),now=Date.now();return{id:crypto.randomUUID(),deliveryId:"synthetic-delivery",deliveryDigest:"a".repeat(64),planDigest:plan.planDigest,plan,registration:validateJourneyRegistration({id:"synthetic-seller",label:"Synthetic seller deployment",projectId:"synthetic-project",registrationRevision:"r1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:origin+"/seller-lifecycle.html",backendBaseUrl:origin+"/pbp/",deploymentRevision:"lifecycle-fixed-v1",frontendBundleDigest:"a".repeat(64),scenario:"fixed",expiresAt:"2099-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"}),startedAt:new Date(now).toISOString(),expiresAt:new Date(now+600_000).toISOString(),reportedByRole:"buyer",observations:[]};}
const metadata={protocol:"booking-lifecycle-http-v1",revision:"lifecycle-fixed-v1",maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false};

test("Workers-compatible fetch uses manual; the old error mode would fail before issuing a request",async()=>{
 const run=fixture();let calls=0;const result=await readProjectJourneyStep(run,{id:"meta"},{fetch:async(url,init)=>{calls++;if(init.redirect==="error")throw new TypeError("Workers does not implement redirect error");assert.equal(init.redirect,"manual");assert.equal(init.method,"GET");assert.equal(init.credentials,"omit");assert.equal(url,origin+"/pbp/meta");return Response.json(metadata);}});
 assert.equal(calls,1);assert.equal(result.observation.unavailableReason,undefined);assert.deepEqual(result.metadata,metadata);assert.equal(result.observation.requests![0].status,200);
});
test("manual redirect responses are unavailable without following the Location or reading their body",async()=>{
 for(const status of [300,301,302,303,307,308,399]){let calls=0,bodyAccesses=0;const response=new Response("untrusted redirect body",{status,headers:{Location:"https://unapproved.example.org/pbp/meta","Content-Type":"application/json"}});Object.defineProperty(response,"body",{get(){bodyAccesses++;throw new Error("A redirect body must not be read");}});
  const result=await readProjectJourneyStep(fixture(),{id:"meta"},{fetch:async(_url,init)=>{calls++;assert.equal(init.redirect,"manual");return response;}});
  assert.equal(calls,1);assert.equal(bodyAccesses,0);assert.equal(result.observation.unavailableReason,"redirect_blocked",String(status));assert.equal(result.metadata,undefined);
 }
});
test("already-followed and mismatched response URLs fail closed even with successful JSON metadata",async()=>{
 for(const properties of [{redirected:true,url:origin+"/pbp/meta"},{redirected:false,url:"https://unapproved.example.org/pbp/meta"},{redirected:false,url:origin+"/other/meta"}]){let calls=0;const response=Response.json(metadata);Object.defineProperties(response,{redirected:{value:properties.redirected},url:{value:properties.url}});const result=await readProjectJourneyStep(fixture(),{id:"meta"},{fetch:async()=>{calls++;return response;}});assert.equal(calls,1);assert.equal(result.observation.unavailableReason,"redirect_blocked");assert.equal(result.metadata,undefined);}
 const response=Response.json(metadata);Object.defineProperty(response,"url",{value:origin+"/pbp/meta"});const result=await readProjectJourneyStep(fixture(),{id:"meta"},{fetch:async()=>response});assert.equal(result.observation.unavailableReason,undefined);assert.deepEqual(result.metadata,metadata);
});
test("Location-less302 and opaque redirects are blocked before any body parsing",async()=>{
 const opaque=new Response(null);Object.defineProperties(opaque,{type:{value:"opaqueredirect"},status:{value:0}});
 for(const response of [new Response(null,{status:302}),opaque]){const result=await readProjectJourneyStep(fixture(),{id:"meta"},{fetch:async()=>response});assert.equal(result.observation.unavailableReason,"redirect_blocked");assert.equal(result.metadata,undefined);}
});
test("late fetch ignoring abort is cancelled without reading a body or changing the saved timeout result",async()=>{
 let resolveFetch!:(response:Response)=>void,signal:AbortSignal|undefined,cancelled=0,reads=0;
 const result=await readProjectJourneyStep(fixture(),{id:"meta"},{timeoutMs:2,fetch:async(_url,init)=>{signal=init.signal as AbortSignal;return new Promise<Response>(resolve=>{resolveFetch=resolve;});}}),saved=JSON.stringify(result);
 assert.equal(result.observation.unavailableReason,"server_read_timeout");assert.equal(signal!.aborted,true);
 const stream=new ReadableStream<Uint8Array>({pull(){reads++;},cancel(){cancelled++;}},{highWaterMark:0});resolveFetch(new Response(stream,{headers:{"Content-Type":"application/json"}}));await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(reads,0);assert.equal(cancelled,1);assert.equal(JSON.stringify(result),saved);assert.equal(result.metadata,undefined);
});
test("timeout cancels an already active reader and does not resume reading further chunks",async()=>{
 let reads=0,cancelled=0;const stream=new ReadableStream<Uint8Array>({pull(controller){reads++;if(reads===1)controller.enqueue(new TextEncoder().encode('{"protocol":'));else return new Promise<void>(()=>{});},cancel(){cancelled++;}},{highWaterMark:0});
 const result=await readProjectJourneyStep(fixture(),{id:"meta"},{timeoutMs:2,fetch:async()=>new Response(stream,{headers:{"Content-Type":"application/json"}})}),saved=JSON.stringify(result);assert.equal(result.observation.unavailableReason,"server_read_timeout");assert.equal(cancelled,1);const priorReads=reads;await new Promise(resolve=>setTimeout(resolve,5));assert.equal(reads,priorReads);assert.equal(JSON.stringify(result),saved);
});
test("known unsupported fetch configuration is bounded separately from generic network errors",async()=>{
 for(const message of ['Workers does not implement redirect error','Invalid redirect mode','The cache field is not implemented']){const result=await readProjectJourneyStep(fixture(),{id:"meta"},{fetch:async()=>{throw new TypeError(message+" private detail must not be retained");}});assert.equal(result.observation.unavailableReason,"server_fetch_configuration");assert.ok(!JSON.stringify(result).includes("private detail"));}
 const result=await readProjectJourneyStep(fixture(),{id:"meta"},{fetch:async()=>{throw new TypeError("fetch failed: private network details");}});assert.equal(result.observation.unavailableReason,"server_read_unavailable");assert.ok(!JSON.stringify(result).includes("private network"));
});
test("malformed JSON and invalid UTF8 retain a bounded parse reason without leaking response contents",async()=>{
 for(const body of ['{"private-content":broken-json}',new Uint8Array([0xc3,0x28])]){const result=await readProjectJourneyStep(fixture(),{id:"meta"},{fetch:async()=>new Response(body,{headers:{"Content-Type":"application/json"}})});assert.equal(result.observation.unavailableReason,"invalid_json_response");assert.equal(result.metadata,undefined);assert.ok(!JSON.stringify(result).includes("private-content"));}
});
test("a rejected body read always attempts reader cancellation while preserving the original unavailable result",async()=>{
 let cancelCalls=0;const stream=new ReadableStream<Uint8Array>({pull(controller){controller.error(new Error("private upstream stream failure"));}},{highWaterMark:0});const getReader=stream.getReader.bind(stream);
 Object.defineProperty(stream,"getReader",{value:()=>{const reader=getReader(),cancel=reader.cancel.bind(reader);Object.defineProperty(reader,"cancel",{value:(reason:unknown)=>{cancelCalls++;return cancel(reason);}});return reader;}});
 const result=await readProjectJourneyStep(fixture(),{id:"meta"},{fetch:async()=>new Response(stream,{headers:{"Content-Type":"application/json"}})});assert.equal(cancelCalls,1);assert.equal(result.observation.unavailableReason,"server_read_unavailable");assert.equal(result.metadata,undefined);assert.ok(!JSON.stringify(result).includes("private upstream"));
});
