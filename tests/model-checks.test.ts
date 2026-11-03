import assert from "node:assert/strict";
import test from "node:test";
import {MODEL_DEFINITION,MODEL_SPEC_DIGEST,MODEL_SLOTS,generateModelTrace,evaluateModelCheckReport,validateStoredModelCheckReport,modelCheckReportFromTrace,type ModelCheckBase,type ModelHttpObservation} from "../lib/model-checks.ts";
import {executeModelCheckRun} from "../lib/model-check-runner.ts";
import {PROJECT_JOURNEY_PLAN_DIGEST} from "../lib/project-journey.ts";

export function modelInput(seed=1):ModelCheckBase{
 const at=new Date().toISOString();return{id:crypto.randomUUID(),deliveryId:"model-delivery",deliveryDigest:"d".repeat(64),journeyPlanDigest:PROJECT_JOURNEY_PLAN_DIGEST,modelSpecDigest:MODEL_SPEC_DIGEST,seed,startedAt:at,expiresAt:new Date(Date.now()+30000).toISOString(),registration:{id:"model-native",label:"Independent native HTTP",projectId:"model-project",registrationRevision:"model-registration-v1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:"https://native-model.example.org/workshop.html",backendBaseUrl:"https://native-model.example.org/pbp/",deploymentRevision:"native-implementation-v1",bridgeRevision:"lifecycle-fixed-v1",frontendBundleDigest:"d".repeat(64),scenario:"fixed",expiresAt:new Date(Date.now()+60000).toISOString(),testOnly:true,provenance:"operator-approved-declaration"}};
}
type Row={id:string;testRunId:string;marker:string;customer:string;email:string;slot:string;partySize:number;status:string;revision:string;idempotencyKey:string};
export function abstractHttp(input:ModelCheckBase,moveFirst=false){
 const rows=new Map<string,Row>(),calls:{url:string;init:RequestInit}[]=[];let waitingCancel:(()=>void)|undefined;
 const reply=(value:unknown,status=200)=>Response.json(value,{status});
 const fetch=async(url:string,init:RequestInit):Promise<Response>=>{
  calls.push({url,init});const route=new URL(url).pathname.slice("/pbp/".length),body=init.body?JSON.parse(String(init.body)):undefined,key=(init.headers as Record<string,string>)["Idempotency-Key"];
  if(route==="meta")return reply({protocol:"booking-lifecycle-http-v1",revision:"lifecycle-fixed-v1",nativeRevision:input.registration.deploymentRevision,maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false});
  if(route.startsWith("merchant/"))return reply({testRunId:input.id,revision:"lifecycle-fixed-v1",bookings:[...rows.values()]});
  if(route.startsWith("occupancy/")){const slot=MODEL_SLOTS[route.at(-1)as keyof typeof MODEL_SLOTS],active=[...rows.values()].filter(row=>row.status==="active"&&row.slot===slot);return reply({testRunId:input.id,revision:"lifecycle-fixed-v1",slot,guestCount:active.reduce((sum,row)=>sum+row.partySize,0),bookingIds:active.map(row=>row.id)});}
  if(init.method==="GET")return reply(rows.get(route.split("/")[1]));
  if(route==="bookings"){const row={...body,id:`receipt-${rows.size+1}`,status:"active",revision:"lifecycle-fixed-v1",idempotencyKey:key};rows.set(row.id,row);return reply(row,201);}
  const[,id,verb]=route.split("/"),row=rows.get(id)!;
  if(verb==="cancel"){if(moveFirst)await new Promise<void>(resolve=>{waitingCancel=resolve;});row.status="cancelled";return reply(row);}
  const count=[...rows.values()].filter(other=>other.status==="active"&&other.slot===body.slot).reduce((sum,row)=>sum+row.partySize,0);
  const response=count+row.partySize>8?reply({code:"slot_capacity_exceeded"},409):reply({...row,slot:body.slot});
  if(count+row.partySize<=8)row.slot=body.slot;
  waitingCancel?.();return response;
 };
 return{fetch,calls,rows};
}

test("independent model definition digest and seeded p/slot permutation stay deterministic and bounded",async()=>{
 assert.equal(Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(MODEL_DEFINITION)))).toString("hex"),MODEL_SPEC_DIGEST);
 for(const seed of[0,1,2,3,4,12345,0xffffffff]){const a=generateModelTrace(seed);assert.deepEqual(a,generateModelTrace(seed));assert.ok(a.p>=2&&a.p<=6);assert.equal(new Set([a.source,a.target,a.spare]).size,3);}
 for(const seed of[-1,0x100000000,1.5,NaN])assert.throws(()=>generateModelTrace(seed));
});
test("the oracle accepts both legal overlapping histories without reading scenario or fault names",async()=>{
 for(const first of[false,true]){const input=modelInput(),server=abstractHttp(input,first),report=await executeModelCheckRun(input,{fetch:server.fetch});
  assert.equal(report.result.outcome,"compatible");assert.deepEqual(report.result.compatibleOrders,[first?"move_then_cancel":"cancel_then_move"]);assert.equal(server.calls.length,24);assert.equal(server.calls.filter(row=>row.init.method==="POST").length,5);
  const renamed=structuredClone(report);renamed.registration.scenario="move-loss";assert.deepEqual(evaluateModelCheckReport(renamed),report.result);
  assert.doesNotThrow(()=>validateStoredModelCheckReport(report,{deliveryId:input.deliveryId,deliveryDigest:input.deliveryDigest,journeyPlanDigest:input.journeyPlanDigest,projectId:input.registration.projectId}));
 }
});
test("real-time precedence excludes a serial order even when that order would explain the final records",async()=>{
 const input=modelInput(),server=abstractHttp(input,true),report=await executeModelCheckRun(input,{fetch:server.fetch}),changed=structuredClone(report);
 const c=changed.trace.find(row=>row.operationId==="cancel_y")!,m=changed.trace.find(row=>row.operationId==="transfer_x")!;
 c.invokedOrdinal=31;c.completedOrdinal=32;m.invokedOrdinal=33;m.completedOrdinal=34;
 assert.equal(evaluateModelCheckReport(changed).outcome,"violated");
 assert.throws(()=>validateStoredModelCheckReport(changed));
});
test("complete valid native states which match neither order violate; missing or uncertain observations remain inconclusive",async()=>{
 const input=modelInput(),server=abstractHttp(input),report=await executeModelCheckRun(input,{fetch:server.fetch});
 const changed=structuredClone(report),x=(changed.trace.find(row=>row.operationId==="final_x")!.body as Row);x.status="cancelled";
 assert.equal(evaluateModelCheckReport(changed).outcome,"violated");
 for(const mutate of[(trace:ModelHttpObservation[])=>trace.pop(),(trace:ModelHttpObservation[])=>{trace.find(row=>row.operationId==="transfer_x")!.unavailableReason="network_unavailable";},(trace:ModelHttpObservation[])=>{trace.find(row=>row.operationId==="final_x")!.status=503;}]){const partial=structuredClone(report);mutate(partial.trace);assert.equal(evaluateModelCheckReport(partial).outcome,"inconclusive");}
 const closure=modelCheckReportFromTrace(input,report.trace,new Date().toISOString(),"stopped_without_replay");assert.equal(closure.result.outcome,"inconclusive");
});
test("stored validators reject changed bindings, result tampering, accessors, excessive evidence and ordinal duplication",async()=>{
 const input=modelInput(),server=abstractHttp(input),report=await executeModelCheckRun(input,{fetch:server.fetch});
 for(const expected of[{deliveryId:"another"},{deliveryDigest:"e".repeat(64)},{journeyPlanDigest:"e".repeat(64)},{projectId:"another"}])assert.throws(()=>validateStoredModelCheckReport(report,expected));
 for(const mutate of[(r:typeof report)=>{r.modelSpecDigest="0".repeat(64);},(r:typeof report)=>{r.trace[0].completedOrdinal=r.trace[0].invokedOrdinal;},(r:typeof report)=>{r.trace[0].body={text:"x".repeat(33000)};},(r:typeof report)=>{r.trace[0].path="/pbp/../meta";}]){const bad=structuredClone(report);mutate(bad);assert.throws(()=>validateStoredModelCheckReport(bad));}
 let touched=false;const bad={...report};Object.defineProperty(bad,"result",{enumerable:true,get(){touched=true;return report.result;}});assert.throws(()=>validateStoredModelCheckReport(bad));assert.equal(touched,false);
});

test("every actual HTTP call follows its durable intent and a checkpoint failure prevents later writes",async()=>{
 const input=modelInput(),server=abstractHttp(input);let checkpoint:ModelHttpObservation[]=[];
 await executeModelCheckRun(input,{onCheckpoint:async trace=>{checkpoint=structuredClone(trace);},fetch:async(url,init)=>{const pending=checkpoint.find(row=>row.completedOrdinal===null&&row.path===new URL(url).pathname&&row.method===init.method);assert.ok(pending,"The request intent must be retained before fetch");return server.fetch(url,init);}});
 for(const phase of["meta","create_x"]){const next=modelInput(),native=abstractHttp(next);await assert.rejects(executeModelCheckRun(next,{fetch:native.fetch,onCheckpoint:async trace=>{if(trace.some(row=>row.operationId===phase&&row.completedOrdinal===null))throw new Error("synthetic checkpoint CAS failure");}}),/checkpoint CAS failure/u);assert.equal(native.calls.filter(row=>row.init.method==="POST").length,0);assert.equal(native.calls.length,phase==="meta"?0:5);}
});
test("Workers manual redirects, changed response URLs, incompatible metadata and oversized JSON stop before synthetic writes",async()=>{
 for(const kind of["redirect","changed-url","metadata","oversize","nonjson"]){const input=modelInput();let calls=0;const report=await executeModelCheckRun(input,{fetch:async(_url,init)=>{calls++;assert.equal(init.redirect,"manual");assert.equal(init.credentials,"omit");assert.equal(init.method,"GET");if(kind==="redirect")return new Response("",{status:302,headers:{Location:"https://foreign.example.org"}});if(kind==="changed-url"){const response=Response.json({});Object.defineProperty(response,"url",{value:"https://foreign.example.org/meta"});return response;}if(kind==="oversize")return Response.json({big:"x".repeat(9000)});if(kind==="nonjson")return new Response("hello");return Response.json({protocol:"different"});}});assert.equal(report.result.outcome,"inconclusive",kind);assert.equal(calls,1,kind);assert.equal(report.trace.filter(row=>row.method==="POST").length,0);}
});
test("unknown race writes are never retried; bounded streaming/abort timeout cannot become a compatible report",async()=>{
 const input=modelInput(),native=abstractHttp(input);let writes=0;
 const report=await executeModelCheckRun(input,{fetch:async(url,init)=>{if(init.method==="POST")writes++;if(url.endsWith("/move"))throw new Error("Synthetic lost response");return native.fetch(url,init);}});
 assert.equal(report.result.outcome,"inconclusive");assert.equal(writes,5);assert.equal(report.trace.filter(row=>row.operationId==="transfer_x").length,1);
 const stall=modelInput();let cancelled=false,calls=0;
 const timed=await executeModelCheckRun(stall,{requestTimeoutMs:5,totalTimeoutMs:30,fetch:async()=>{calls++;return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"protocol":'));},cancel(){cancelled=true;}}),{headers:{"Content-Type":"application/json"}});}});
 assert.equal(timed.result.outcome,"inconclusive");assert.equal(calls,1);assert.equal(cancelled,true);
 const controller=new AbortController();controller.abort();let contacted=false;
 const aborted=await executeModelCheckRun(modelInput(),{signal:controller.signal,fetch:async()=>{contacted=true;return Response.json({});}});assert.equal(aborted.result.outcome,"inconclusive");assert.equal(contacted,false);
});
