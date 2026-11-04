import assert from "node:assert/strict";
import test,{before,after} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {createServer,type Server} from "node:http";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {JOURNEY_STEP_IDS,JOURNEY_SLOTS,journeyBackendBase,journeyKey,evaluateJourneyReport,validateJourneyReport,type JourneyInput,type JourneyObservation,type JourneyStepId,type JourneyReceipt} from "../lib/journey-checks.ts";

// This suite exercises the bundled public Worker with real HTTP and SQLite.
// Its HTTP stand-in does not claim that a browser clicked the journey forms.
const root=fileURLToPath(new URL("../",import.meta.url));
let scratch:string,sqlite:DatabaseSync,server:Server,origin:string;
const requests:{path:string;method:string;headers:Record<string,string|string[]|undefined>;body:string}[]=[];
const nativeWrites:{sql:string;args:(string|number|null)[]}[]=[];
before(async()=>{
  scratch=mkdtempSync(path.join(tmpdir(),"pbp-guest-journey-"));
  const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve("wrangler/package.json"))("esbuild"),outfile=path.join(scratch,"worker.mjs");
  await esbuild.build({entryPoints:[path.join(root,"app/guest-lab/server.ts")],bundle:true,platform:"node",format:"esm",target:"node22",outfile,logLevel:"silent",plugins:[{name:"empty-public-assets",setup(build:{onResolve:(options:unknown,callback:()=>unknown)=>void;onLoad:(options:unknown,callback:()=>unknown)=>void}){build.onResolve({filter:/^pbp-guest-assets$/},()=>({path:"assets",namespace:"guest"}));build.onLoad({filter:/.*/,namespace:"guest"},()=>({contents:"export default {}",loader:"js"}));}}]});
  const worker=(await import(pathToFileURL(outfile).href)).default as{fetch(request:Request,env:Record<string,unknown>):Promise<Response>};
  sqlite=new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(path.join(root,"examples/seller-lifecycle-staging/migrations/0001_lifecycle.sql"),"utf8"));
  const db={prepare(sql:string){const statement=sqlite.prepare(sql);return{bind(...args:(string|number|null)[]){return{async first(){return statement.get(...args)??null;},async all(){return{success:true,results:statement.all(...args)};},async run(){nativeWrites.push({sql,args:structuredClone(args)});return{success:true,meta:{changes:Number(statement.run(...args).changes)}};}};}};}};
  server=createServer(async(req,res)=>{
    try{
      const parts:Uint8Array[]=[];for await(const chunk of req)parts.push(chunk);const headers=new Headers();
      for(const[key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(","):value);
      const body=Buffer.concat(parts).toString("utf8");requests.push({path:req.url!,method:req.method!,headers:req.headers,body});
      const request=new Request(`${origin}${req.url}`,{method:req.method,headers,...(parts.length?{body}: {})});
      const result=await worker.fetch(request,{DB:db,LAB_ALLOW_LOOPBACK:"true"});res.statusCode=result.status;result.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await result.arrayBuffer()));
    }catch{res.statusCode=500;res.end("Synthetic local journey worker failure");}
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("Local test port unavailable");origin=`http://127.0.0.1:${address.port}`;
});
after(async()=>{if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}sqlite?.close();if(scratch)rmSync(scratch,{recursive:true,force:true});});

type Json=Record<string,unknown>;
type Receipt=Json&{id:string;slot:string;partySize:number;status:string;idempotencyKey:string};
type Profile="fixed"|"cancel-credit"|"move-loss"|"retry-duplicate";
const slots={a:"2099-01-01T10:00:00Z",b:"2099-01-01T11:00:00Z",c:"2099-01-01T12:00:00Z"};
function context(profile:Profile){const runId=crypto.randomUUID(),marker=`PBP-${runId}`,prefix=`${origin}/journey-api/${profile}/pbp/`,key=(suffix:string)=>`pbp-${runId}-lifecycle-${suffix}`;
  const value=(slot:string,partySize:number)=>({testRunId:runId,marker,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize});
  const call=async(route:string,body?:Json,suffix?:string)=>{const response=await fetch(prefix+route,{method:body?"POST":"GET",headers:{Accept:"application/json",Origin:origin,...(body?{"Content-Type":"application/json","Idempotency-Key":key(suffix!)}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()as Json};};
  return{profile,runId,marker,prefix,key,value,call};
}

async function exercise(profile:Profile){
 const c=context(profile),observations:JourneyObservation[]=[],offset=requests.length,base=journeyBackendBase(profile),startedAt=new Date().toISOString();
 const add=(o:JourneyObservation)=>observations.push(structuredClone(o));
 const write=async(id:JourneyStepId,operation:"create"|"cancel"|"move",suffix:string,body:Json,receiptId?:string)=>{
  const route=operation==="create"?"bookings":`bookings/${receiptId}/${operation}`,result=await c.call(route,body,suffix);
  const observation:JourneyObservation={id,ui:{actionId:id,status:result.status===504?"unknown":result.status>=400?"error":"success",message:"HTTP stand-in for the declared synthetic form; no browser execution asserted",fields:{operation,...(operation==="create"?{partySize:String(body.partySize),slot:String(body.slot)}:{bookingId:receiptId!,...(operation==="move"?{slot:String(body.slot)}:{})})},...(result.status<300?{receipt:result.body}:{})},requests:[{method:"POST",path:base+route,key:journeyKey(c.runId,suffix),status:result.status,request:body,response:result.body}]};
  add(observation);return result.body as Receipt;
 };
 const read=async(id:JourneyStepId,which:readonly("a"|"b"|"c")[],receiptId?:string)=>{
  const receipt=receiptId?await c.call(`bookings/${receiptId}`):undefined,merchant=await c.call(`merchant/${c.runId}`),occupancies=[];
  for(const slot of which)occupancies.push({slot,...await c.call(`occupancy/${c.runId}/${slot}`)});
  const observation:JourneyObservation={id,merchant,occupancies,...(receipt?{receipt}:{})};add(observation);return observation;
 };
 const action={testRunId:c.runId,marker:c.marker},metadata=await c.call("meta");assert.equal(metadata.status,200);add({id:"meta",requests:[{method:"GET",path:base+"meta",status:metadata.status,response:metadata.body}]});
 const first=await write("create","create","cancel-create",c.value(slots.a,5));assert.equal(typeof first.id,"string");await read("create_readback",["a"],first.id);
 await write("cancel","cancel","cancel-first",action,first.id);await read("cancel_readback",["a"],first.id);
 await write("rebook","create","cancel-five",c.value(slots.a,5));await write("fill","create","cancel-three",c.value(slots.a,3));await read("full_readback",["a"]);
 await write("cancel_repeat","cancel","cancel-repeat",action,first.id);await read("cancel_repeat_readback",["a"],first.id);
 await write("reject_extra","create","cancel-extra",c.value(slots.a,1));const rejected=await read("reject_extra",["a"]);Object.assign(observations.find(o=>o.id==="reject_extra")!,{merchant:rejected.merchant,occupancies:rejected.occupancies});observations.pop();
 const source=await write("source_create","create","source-create",c.value(slots.b,2));assert.equal(typeof source.id,"string");
 await write("move_full","move","move-full",{...action,slot:slots.a},source.id);await read("move_full_readback",["a","b"],source.id);
 await write("move_free","move","move-free",{...action,slot:slots.c},source.id);await read("move_free_readback",["b","c"],source.id);
 await write("response_loss_create","create","loss-create",c.value(slots.b,1));await read("response_loss_readback",[]);
 await write("response_loss_retry","create","loss-create",c.value(slots.b,1));const retry=await read("response_loss_retry",[]);Object.assign(observations.find(o=>o.id==="response_loss_retry")!,{merchant:retry.merchant});observations.pop();
 await read("final_merchant_readback",["a","b","c"]);
 const input:JourneyInput={runId:c.runId,scenario:profile,startedAt,finishedAt:new Date().toISOString(),frontendEntry:`/journey.html?run=${c.runId}&scenario=${profile}`,metadata:metadata.body,observations};
 const report=evaluateJourneyReport(input);assert.deepEqual(validateJourneyReport(report),report);assert.deepEqual(report.steps.map(o=>o.id),[...JOURNEY_STEP_IDS]);assert.equal(observations.length,20);
 return{c,input,report,requests:requests.slice(offset),first,source};
}
function rows(runId:string){return sqlite.prepare("SELECT id,profile,test_run_id,slot,party_size,status,idempotency_key FROM seller_lifecycle_bookings WHERE test_run_id=? ORDER BY id").all(runId);}
function activeTotal(runId:string,slot:string){return sqlite.prepare("SELECT COALESCE(SUM(party_size),0) AS n FROM seller_lifecycle_bookings WHERE test_run_id=? AND status='active' AND slot=?").get(runId,slot)!.n;}

test("bundled guest Worker supports the fixed20-milestone HTTP stand-in with real native rows, independent reads and one explicit retry",async()=>{
 const result=await exercise("fixed"),saved=rows(result.c.runId);
 assert.deepEqual(result.report.summary,{steps:20,observed:20,issues:0,unavailable:0});assert.equal(saved.length,5);assert.equal(saved.filter(r=>r.status==="active").length,4);assert.equal(saved.find(r=>r.id===result.first.id)!.status,"cancelled");
 assert.deepEqual([activeTotal(result.c.runId,slots.a),activeTotal(result.c.runId,slots.b),activeTotal(result.c.runId,slots.c)],[8,1,2]);assert.equal(saved.find(r=>r.id===result.source.id)!.slot,slots.c);
 assert.equal(result.requests.length,39);assert.equal(result.requests.filter(r=>r.method==="POST").length,11);assert.equal(result.requests.filter(r=>r.method==="GET").length,28);
 const retries=result.requests.filter(r=>r.headers["idempotency-key"]===result.c.key("loss-create"));assert.equal(retries.length,2);assert.equal(retries[0].body,retries[1].body);assert.equal(saved.filter(r=>r.idempotency_key===result.c.key("loss-create")).length,1);
 for(const request of result.requests){assert.ok(request.path.startsWith("/journey-api/fixed/pbp/"));assert.equal(request.headers.authorization,undefined);assert.equal(request.headers.cookie,undefined);}
 assert.deepEqual(Object.keys(result.input.metadata as object).sort(),["protocol","revision","nativeRevision","maxPartySize","maxGuestsPerSlot","syntheticOnly","deploymentAttestation","supportedModels"].sort());
 assert.equal(result.report.scope.authenticatedRoles,false);assert.equal(result.report.scope.privateDeliveryLinked,false);assert.equal(result.report.scope.payment,false);
});
test("controlled cancellation, failed-move and retry defects produce actual persisted counterexamples and never a clean report",async()=>{
 for(const profile of["cancel-credit","move-loss","retry-duplicate"]as const){
  const result=await exercise(profile),saved=rows(result.c.runId);assert.ok(result.report.summary.issues>0);assert.notEqual(result.report.summary.observed,20);
  const final=result.report.steps.find(s=>s.id==="final_merchant_readback")!;assert.equal(final.outcome,"mismatch");
  if(profile==="cancel-credit"){
   assert.equal(activeTotal(result.c.runId,slots.a),9);assert.equal(saved.filter(r=>r.status==="active"&&r.slot===slots.a).length,3);assert.equal(result.report.steps.find(s=>s.id==="reject_extra")!.outcome,"mismatch");
   assert.equal(sqlite.prepare("SELECT COALESCE(SUM(guests),0) AS n FROM seller_lifecycle_cancel_credits WHERE namespace=?").get(`lifecycle-${profile}-v1:${result.c.runId}`)!.n,5);
  }else if(profile==="move-loss"){
   assert.equal(saved.find(r=>r.id===result.source.id)!.status,"cancelled");assert.equal(saved.find(r=>r.id===result.source.id)!.slot,slots.b);assert.equal(activeTotal(result.c.runId,slots.c),0);assert.equal(result.report.steps.find(s=>s.id==="move_full_readback")!.outcome,"mismatch");
  }else{
   const duplicates=saved.filter(r=>r.idempotency_key===result.c.key("loss-create"));assert.equal(duplicates.length,2);assert.equal(new Set(duplicates.map(r=>r.id)).size,2);assert.equal(activeTotal(result.c.runId,slots.b),2);assert.equal(result.report.steps.find(s=>s.id==="response_loss_retry")!.outcome,"mismatch");
  }
 }
});
test("guest journey hosting rejects foreign or missing Origin, caller profiles/targets, unknown fields and oversized bodies before native writes",async()=>{
 const c=context("fixed"),before=sqlite.prepare("SELECT COUNT(*) n FROM seller_lifecycle_bookings").get()!.n,operations=sqlite.prepare("SELECT COUNT(*) n FROM seller_lifecycle_operations").get()!.n,credits=sqlite.prepare("SELECT COUNT(*) n FROM seller_lifecycle_cancel_credits").get()!.n;
 const snapshot=()=>JSON.stringify(["seller_lifecycle_bookings","seller_lifecycle_operations","seller_lifecycle_cancel_credits"].map(table=>sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all())),prior=snapshot(),writeOffset=nativeWrites.length;
 const send=(body:string,originHeader:string|null=origin,route="fixed",headers:Record<string,string>={})=>fetch(`${origin}/journey-api/${route}/pbp/bookings`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":c.key("cancel-create"),...(originHeader!==null?{Origin:originHeader}:{}),...headers},body});
 for(const originHeader of[null,"https://foreign.example"]){const response=await send(JSON.stringify(c.value(slots.a,5)),originHeader);assert.equal(response.status,403);assert.equal((await response.json()as Json).code,"origin_not_allowed");}
 assert.equal((await send("{","https://foreign.example")).status,403);assert.equal((await send("{")).status,400);
 for(const extra of[{profile:"cancel-credit"},{target:"https://unapproved.example/"},{now:"2099-01-01"},{idempotencyKey:c.key("cancel-create")},{operation:"create"}])assert.equal((await send(JSON.stringify({...c.value(slots.a,5),...extra}))).status,400);
 assert.equal((await send(JSON.stringify(c.value(slots.a,5)),origin,"unknown-profile")).status,404);
 assert.equal((await send("x".repeat(4097))).status,413);assert.equal((await send(JSON.stringify(c.value(slots.a,5)),origin,"fixed",{"Content-Type":"text/plain"})).status,415);
 for(const headers of[{Authorization:"test"},{Cookie:"synthetic=not-accepted"}] as Record<string,string>[])assert.equal((await send(JSON.stringify(c.value(slots.a,5)),origin,"fixed",headers)).status,403);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_lifecycle_bookings").get()!.n,before);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_lifecycle_operations").get()!.n,operations);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_lifecycle_cancel_credits").get()!.n,credits);
 assert.equal(snapshot(),prior);assert.deepEqual(nativeWrites.slice(writeOffset),[]);
 assert.equal((await fetch(`${origin}/api/proofs/private-project`)).status,404);
});
