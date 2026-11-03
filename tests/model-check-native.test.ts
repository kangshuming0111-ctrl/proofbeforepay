import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp,rm,mkdir,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {executeModelCheckRun} from "../lib/model-check-runner.ts";
import {MODEL_SPEC_DIGEST,generateModelTrace,type ModelCheckBase} from "../lib/model-checks.ts";
import {evaluateJourneyReport,JOURNEY_SLOTS,journeyKey,journeyBackendBase,type JourneyObservation,type JourneyStepId} from "../lib/journey-checks.ts";
import {PROJECT_JOURNEY_PLAN_DIGEST} from "../lib/project-journey.ts";

type Row={id:string;partySize:number;slot:string;status:string};
async function fixture(t:TestContext,variant:"fixed"|"overlap-loss"){
 const temp=await mkdtemp(path.join(tmpdir(),"pbp-model-native-")),database=path.join(temp,"native.sqlite"),script=fileURLToPath(new URL("../examples/seller-workshop-python/race-fixture.py",import.meta.url));
 const child=spawn("/usr/bin/python3",[script,"--variant",variant,"--db",database,"--port","0"],{env:{PATH:"/usr/bin:/bin",NODE_ENV:"test"}});let errors="";child.stderr.on("data",part=>{errors+=String(part);});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const exited=once(child,"exit");child.kill("SIGTERM");const timer=setTimeout(()=>child.kill("SIGKILL"),2000);timer.unref();try{await exited;}finally{clearTimeout(timer);}}await rm(temp,{recursive:true,force:true});});
 const ready=await new Promise<{origin:string;nativeRevision:string}>((resolve,reject)=>{let output="";const timer=setTimeout(()=>reject(new Error("Native fixture did not start: "+errors)),8000);child.once("exit",()=>{clearTimeout(timer);reject(new Error("Native fixture exited: "+errors));});child.stdout.on("data",part=>{output+=String(part);const at=output.indexOf("\n");if(at>=0){clearTimeout(timer);resolve(JSON.parse(output.slice(0,at)));}});});
 const base=(seed:number):ModelCheckBase=>({id:crypto.randomUUID(),deliveryId:"native-model-delivery",deliveryDigest:"d".repeat(64),journeyPlanDigest:PROJECT_JOURNEY_PLAN_DIGEST,modelSpecDigest:MODEL_SPEC_DIGEST,seed,startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30000).toISOString(),registration:{id:"native-model-race",label:"Native flower workshop",projectId:"native-model-project",registrationRevision:"native-race-reg-v1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:ready.origin+"/workshop.html",backendBaseUrl:ready.origin+"/pbp/",deploymentRevision:ready.nativeRevision,bridgeRevision:"lifecycle-fixed-v1",frontendBundleDigest:"d".repeat(64),scenario:"fixed",expiresAt:new Date(Date.now()+60000).toISOString(),testOnly:true,provenance:"operator-approved-declaration"}});
 async function request(route:string,body?:unknown,key?:string){const r=await fetch(ready.origin+"/pbp/"+route,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json",Origin:ready.origin,"Idempotency-Key":key!}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});return{status:r.status,body:await r.json()as Record<string,unknown>};}
 return{base,request,database};
}

/** Actual HTTP/native records; the old20 evaluator receives programmatic UI
 * claims with canonical trace-prefix mapping, not browser attestation. */
async function oldSequential20(f:Awaited<ReturnType<typeof fixture>>,runId:string){
 const startedAt=new Date().toISOString(),observations:JourneyObservation[]=[],base=journeyBackendBase("fixed"),marker={testRunId:runId,marker:`PBP-${runId}`};
 async function reads(id:JourneyStepId,ref?:string){const merchant=await f.request(`merchant/${runId}`),occupancies=[];for(const alias of["a","b","c"]as const)occupancies.push({slot:alias,...await f.request(`occupancy/${runId}/${alias}`)});return{id,merchant,occupancies,...(ref?{receipt:await f.request(`bookings/${ref}`)}:{})}as JourneyObservation;}
 async function write(id:JourneyStepId,suffix:string,n:number,slot:string,operation:"create"|"cancel"|"move"="create",ref?:string){const body={...marker,...(operation==="create"?{customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize:n}:operation==="move"?{slot}:{})},route=operation==="create"?"bookings":`bookings/${ref}/${operation}`,response=await f.request(route,body,journeyKey(runId,suffix)),success=response.status<300;
  const o:JourneyObservation={id,ui:{actionId:id,status:success?"success":response.status===504?"unknown":"error",message:"Programmatic old20 HTTP trace, no browser",fields:operation==="create"?{operation,requestOperation:suffix,partySize:String(n),slot}:operation==="cancel"?{operation,requestOperation:suffix,bookingId:ref!}:{operation,requestOperation:suffix,bookingId:ref!,slot},...(success?{receipt:response.body}:{})},requests:[{method:"POST",path:base+route,key:journeyKey(runId,suffix),request:body,status:response.status,response:response.body}]};if(id==="reject_extra"||id==="response_loss_retry")Object.assign(o,await reads(id));observations.push(o);return response.body as unknown as Row;
 }
 const meta=await f.request("meta");observations.push({id:"meta",requests:[{method:"GET",path:base+"meta",status:meta.status,response:meta.body}]});
 const first=await write("create","cancel-create",5,JOURNEY_SLOTS.a);observations.push(await reads("create_readback",first.id));await write("cancel","cancel-first",5,JOURNEY_SLOTS.a,"cancel",first.id);observations.push(await reads("cancel_readback",first.id));
 await write("rebook","cancel-five",5,JOURNEY_SLOTS.a);await write("fill","cancel-three",3,JOURNEY_SLOTS.a);observations.push(await reads("full_readback"));await write("cancel_repeat","cancel-repeat",5,JOURNEY_SLOTS.a,"cancel",first.id);observations.push(await reads("cancel_repeat_readback",first.id));await write("reject_extra","cancel-extra",1,JOURNEY_SLOTS.a);
 const source=await write("source_create","source-create",2,JOURNEY_SLOTS.b);await write("move_full","move-full",2,JOURNEY_SLOTS.a,"move",source.id);observations.push(await reads("move_full_readback",source.id));await write("move_free","move-free",2,JOURNEY_SLOTS.c,"move",source.id);observations.push(await reads("move_free_readback",source.id));await write("response_loss_create","loss-create",1,JOURNEY_SLOTS.b);observations.push(await reads("response_loss_readback"));await write("response_loss_retry","loss-create",1,JOURNEY_SLOTS.b);observations.push(await reads("final_merchant_readback"));
 return evaluateJourneyReport({runId,scenario:"fixed",startedAt,finishedAt:new Date().toISOString(),frontendEntry:`/journey.html?run=${runId}&scenario=fixed`,metadata:meta.body,observations});
}

test("the real overlap-only native mutant passes unchanged sequential20 but violates the new independent race oracle",async t=>{
 const f=await fixture(t,"overlap-loss"),oldRun=crypto.randomUUID(),old=await oldSequential20(f,oldRun);assert.deepEqual(old.summary,{steps:20,observed:20,issues:0,unavailable:0});
 const input=f.base(4),report=await executeModelCheckRun(input,{allowLoopback:true});assert.equal(report.result.outcome,"violated");assert.equal(report.trace.length,24);assert.equal(report.trace.filter(row=>row.method==="POST").length,5);
 const db=new DatabaseSync(f.database,{readOnly:true});try{const rows=db.prepare("SELECT * FROM enrolments WHERE exercise_id=?").all(input.id),x=rows.find(row=>row.creation_command===`pbp-${input.id}-lifecycle-source-create`)!;assert.equal(rows.length,3);assert.equal(x.enrolment_state,"withdrawn");assert.equal(rows.filter(row=>row.enrolment_state==="withdrawn").length,2);assert.equal(db.prepare("SELECT COUNT(*) n FROM command_log WHERE exercise_id=? AND verb='transfer'").get(input.id)!.n,0);
  if(process.env.PBP_MODEL_NATIVE_EVIDENCE){const destination=path.resolve(process.env.PBP_MODEL_NATIVE_EVIDENCE),schema=await readFile(new URL("../examples/seller-workshop-python/schema.sql",import.meta.url),"utf8"),query="SELECT enrolment_ref,exercise_id,session_code,seat_count,enrolment_state,creation_command FROM enrolments WHERE exercise_id=? ORDER BY enrolment_ref",commandQuery="SELECT command_ref,verb,enrolment_ref FROM command_log WHERE exercise_id=? ORDER BY command_ref";
   const evidence={schema:"proofbeforepay-native-model-comparison-v1",generatedAt:new Date().toISOString(),syntheticOnly:true,controlledOverlapBarrier:true,scope:{browserObserved:false,payment:false,deployment:false,oldTrace:"programmatic UI-shaped claims over actual loopback HTTP; canonical-prefix evaluator copy",newTrace:"server-direct loopback HTTP with durable-intent callback support"},nativeFixture:"examples/seller-workshop-python/race-fixture.py --variant overlap-loss",nativeSchema:{revision:"florist-enrolments-v1",sha256:Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(schema))).toString("hex"),tables:["sessions","enrolments","command_log"]},oldSequential20:old,newModelCheck:report,sql:{query,commandQuery,oldRows:db.prepare(query).all(oldRun),newRows:db.prepare(query).all(input.id),newCommands:db.prepare(commandQuery).all(input.id),facts:{newRows:rows.length,newWithdrawn:rows.filter(row=>row.enrolment_state==="withdrawn").length,xRef:x.enrolment_ref,xActualNativeState:x.enrolment_state,successfulTransfers:0}}};
   await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(evidence,null,2)+"\n");
  }
 }finally{db.close();}
 t.diagnostic(JSON.stringify({sequential20:old.summary,newFamily:report.family,seed:report.seed,p:generateModelTrace(report.seed).p,outcome:report.result.outcome,observer:report.scope.observer,browserEvidence:false,controlledOverlapBarrier:true}));
});
test("the independent fixed Python SQLite service satisfies seeded race histories for both p boundaries and changed slot arrangements",async t=>{
 const f=await fixture(t,"fixed");for(const seed of[0,4,17]){const input=f.base(seed),report=await executeModelCheckRun(input,{allowLoopback:true});assert.equal(report.result.outcome,"compatible",JSON.stringify(report.result));assert.equal(report.trace.length,24);assert.ok(report.result.compatibleOrders.length>0);const db=new DatabaseSync(f.database,{readOnly:true});try{assert.equal(db.prepare("SELECT COUNT(*) n FROM enrolments WHERE exercise_id=?").get(input.id)!.n,3);assert.equal(db.prepare("SELECT COUNT(*) n FROM enrolments WHERE exercise_id=? AND enrolment_state='confirmed'").get(input.id)!.n,2);}finally{db.close();}}
});
