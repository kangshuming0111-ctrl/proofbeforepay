import assert from "node:assert/strict";
import test, {type TestContext} from "node:test";
import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {evaluateJourneyReport, JOURNEY_SLOTS, journeyBackendBase, journeyKey, type JourneyInput, type JourneyObservation, type JourneyStepId} from "../lib/journey-checks.ts";
import {parseJourneyIntegrationManifest} from "../lib/journey-integration-preflight.ts";

const directory=fileURLToPath(new URL("../examples/seller-workshop-python/",import.meta.url));
type Profile="fixed"|"move-loss";
type Wire={id:string;testRunId:string;marker:string;customer:string;email:string;slot:string;partySize:number;status:string;revision:string;idempotencyKey:string};
type Reply={status:number;body:Record<string,unknown>};
type Service={child:ChildProcessWithoutNullStreams;origin:string;stop:()=>Promise<void>};

async function start(profile:Profile,database:string):Promise<Service>{
  const child=spawn("/usr/bin/python3",[path.join(directory,"server.py"),"--profile",profile,"--db",database,"--port","0"],{env:{PATH:"/usr/bin:/bin",LANG:"en_US.UTF-8",NODE_ENV:"test"}});
  let stderr="";child.stderr.on("data",part=>{stderr+=String(part);});
  const ready=await new Promise<{origin:string}>((resolve,reject)=>{
    let text="";const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error(`Python workshop startup timed out: ${stderr}`));},8000);
    child.once("error",error=>{clearTimeout(timer);reject(error);});
    child.once("exit",code=>{clearTimeout(timer);reject(new Error(`Python workshop exited before ready (${code}): ${stderr}`));});
    child.stdout.on("data",part=>{text+=String(part);const end=text.indexOf("\n");if(end>=0){clearTimeout(timer);try{const value=JSON.parse(text.slice(0,end));assert.equal(value.ready,true);assert.equal(value.profile,profile);resolve(value);}catch(error){child.kill("SIGKILL");reject(error);}}});
  });
  return{child,origin:ready.origin,async stop(){
    if(child.exitCode!==null||child.signalCode!==null)return;
    const exited=once(child,"exit");child.kill("SIGTERM");
    const timer=setTimeout(()=>child.kill("SIGKILL"),2000);timer.unref();
    try{await exited;}finally{clearTimeout(timer);}
  }};
}
async function fixture(t:TestContext,profile:Profile="fixed"){
  const temp=await mkdtemp(path.join(tmpdir(),"pbp-workshop-native-")),database=path.join(temp,"workshop.sqlite");
  let service=await start(profile,database);
  t.after(async()=>{await service.stop();await rm(temp,{recursive:true,force:true});});
  const runId=crypto.randomUUID(),marker={testRunId:runId,marker:`PBP-${runId}`};
  async function request(route:string,body?:unknown,extra:Record<string,string>={},method=body===undefined?"GET":"POST"):Promise<Reply>{
    const response=await fetch(service.origin+route,{method,headers:{...(body===undefined?{}:{"Content-Type":"application/json",Origin:service.origin}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"manual",signal:AbortSignal.timeout(8000)});
    return{status:response.status,body:await response.json()as Record<string,unknown>};
  }
  const get=(route:string)=>request("/pbp/"+route);
  const create=(n:unknown,slot:string,suffix:string)=>request("/pbp/bookings",{...marker,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize:n},{"Idempotency-Key":journeyKey(runId,suffix)});
  const command=(ref:string,operation:"cancel"|"move",suffix:string,slot?:string)=>request(`/pbp/bookings/${ref}/${operation}`,{...marker,...(slot?{slot}:{})},{"Idempotency-Key":journeyKey(runId,suffix)});
  function snapshot(){const db=new DatabaseSync(database,{readOnly:true});try{return{sessions:db.prepare("SELECT * FROM sessions ORDER BY session_code").all(),enrolments:db.prepare("SELECT * FROM enrolments ORDER BY enrolment_ref").all(),commands:db.prepare("SELECT * FROM command_log ORDER BY command_ref").all(),tables:db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name)};}finally{db.close();}}
  return{profile,runId,marker,database,get,create,command,request,snapshot,get origin(){return service.origin;},async restart(){await service.stop();service=await start(profile,database);}};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const wire=(reply:Reply,status:number)=>{assert.equal(reply.status,status,JSON.stringify(reply.body));return reply.body as unknown as Wire;};

/** Real HTTP and SQLite, but intentionally programmatic UI-shaped claims.
 * Only the evaluator copy maps /pbp/ to its canonical laboratory trace prefix.
 * This runner neither starts a browser nor proves the cooperative frontend ran.
 */
async function fullHttpJourney(f:Fixture){
  const startedAt=new Date().toISOString(),observations:JourneyObservation[]=[],actualHttpPaths:string[]=[];
  const canonical=journeyBackendBase(f.profile),run=f.runId;
  async function readbacks(id:JourneyStepId,ref?:string){
    const merchant=await f.get(`merchant/${run}`),occupancies=[];
    actualHttpPaths.push(`/pbp/merchant/${run}`);
    for(const slot of ["a","b","c"]as const){const result=await f.get(`occupancy/${run}/${slot}`);occupancies.push({slot,...result});actualHttpPaths.push(`/pbp/occupancy/${run}/${slot}`);}
    const receipt=ref?await f.get(`bookings/${ref}`):undefined;
    if(ref)actualHttpPaths.push(`/pbp/bookings/${ref}`);
    return{id,merchant,occupancies,...(receipt?{receipt}:{})}as JourneyObservation;
  }
  async function write(id:JourneyStepId,suffix:string,n:number,slot:string,operation:"create"|"cancel"|"move"="create",ref?:string){
    const body={...f.marker,...(operation==="create"?{customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize:n}:operation==="move"?{slot}:{})};
    const endpoint=operation==="create"?"bookings":`bookings/${ref}/${operation}`;
    const result=await f.request("/pbp/"+endpoint,body,{"Idempotency-Key":journeyKey(run,suffix)});actualHttpPaths.push("/pbp/"+endpoint);
    const success=result.status>=200&&result.status<300;
    const observation:JourneyObservation={id,ui:{actionId:id,status:success?"success":result.status===504?"unknown":"error",message:`Programmatic HTTP ${result.status}; not a browser observation`,fields:operation==="create"?{operation,requestOperation:suffix,partySize:String(n),slot}:operation==="cancel"?{operation,requestOperation:suffix,bookingId:ref!}:{operation,requestOperation:suffix,bookingId:ref!,slot},...(success?{receipt:result.body}:{})},requests:[{method:"POST",path:canonical+endpoint,key:journeyKey(run,suffix),request:body,status:result.status,response:result.body}]};
    if(["reject_extra","response_loss_retry"].includes(id)){const reads=await readbacks(id);observation.merchant=reads.merchant;observation.occupancies=reads.occupancies;}
    observations.push(observation);return result;
  }
  const metadata=await f.get("meta");actualHttpPaths.push("/pbp/meta");
  observations.push({id:"meta",requests:[{method:"GET",path:canonical+"meta",status:metadata.status,response:metadata.body}]});
  const first=wire(await write("create","cancel-create",5,JOURNEY_SLOTS.a),201);
  observations.push(await readbacks("create_readback",first.id));
  wire(await write("cancel","cancel-first",5,JOURNEY_SLOTS.a,"cancel",first.id),200);
  observations.push(await readbacks("cancel_readback",first.id));
  wire(await write("rebook","cancel-five",5,JOURNEY_SLOTS.a),201);
  wire(await write("fill","cancel-three",3,JOURNEY_SLOTS.a),201);
  observations.push(await readbacks("full_readback"));
  wire(await write("cancel_repeat","cancel-repeat",5,JOURNEY_SLOTS.a,"cancel",first.id),200);
  observations.push(await readbacks("cancel_repeat_readback",first.id));
  assert.equal((await write("reject_extra","cancel-extra",1,JOURNEY_SLOTS.a)).status,409);
  const source=wire(await write("source_create","source-create",2,JOURNEY_SLOTS.b),201);
  assert.equal((await write("move_full","move-full",2,JOURNEY_SLOTS.a,"move",source.id)).status,409);
  observations.push(await readbacks("move_full_readback",source.id));
  await write("move_free","move-free",2,JOURNEY_SLOTS.c,"move",source.id);
  observations.push(await readbacks("move_free_readback",source.id));
  assert.equal((await write("response_loss_create","loss-create",1,JOURNEY_SLOTS.b)).status,504);
  observations.push(await readbacks("response_loss_readback"));
  wire(await write("response_loss_retry","loss-create",1,JOURNEY_SLOTS.b),200);
  observations.push(await readbacks("final_merchant_readback"));
  const input:JourneyInput={runId:run,scenario:f.profile,startedAt,finishedAt:new Date().toISOString(),frontendEntry:`/journey.html?run=${run}&scenario=${f.profile}`,metadata:metadata.body,observations};
  return{report:evaluateJourneyReport(input),source,actualHttpPaths};
}

test("independent Python HTTP fixed flow meets the unchanged 20-step checker over real native enrolments",async t=>{
  const f=await fixture(t),{report,actualHttpPaths}=await fullHttpJourney(f);
  assert.deepEqual(report.summary,{steps:20,observed:20,issues:0,unavailable:0});
  const stored=f.snapshot();assert.deepEqual(stored.tables,["command_log","enrolments","sessions","workshop_installation"]);
  assert.equal(stored.enrolments.length,5);assert.equal(stored.enrolments.filter(row=>row.enrolment_state==="confirmed").length,4);
  assert.equal(stored.commands.length,8);assert.equal(stored.sessions.length,3);
  assert.ok(stored.enrolments.every(row=>row.exercise_id===f.runId&&String(row.enrolment_ref).startsWith("enr_")&&!Object.hasOwn(row,"party_size")));
  assert.ok(actualHttpPaths.length>40);assert.ok(actualHttpPaths.every(url=>url.startsWith("/pbp/")));
  t.diagnostic("Real loopback HTTP + native SQLite + unchanged checker:20/20. UI-shaped claims are programmatic, not browser evidence.");
});

test("operator move-loss profile commits a real withdrawn source and the same checker detects the defect",async t=>{
  const f=await fixture(t,"move-loss"),{report,source}=await fullHttpJourney(f);
  assert.equal(report.steps.find(row=>row.id==="move_full")!.outcome,"observed");
  assert.equal(report.steps.find(row=>row.id==="move_full_readback")!.outcome,"mismatch");
  assert.equal(report.steps.find(row=>row.id==="final_merchant_readback")!.outcome,"mismatch");
  assert.ok(report.summary.issues>=2);assert.ok(report.summary.observed<20);
  const stored=f.snapshot(),native=stored.enrolments.find(row=>row.enrolment_ref===source.id)!;
  assert.equal(native.enrolment_state,"withdrawn");assert.equal(native.session_code,"STEM-MIDDAY");
  assert.equal(stored.enrolments.filter(row=>row.enrolment_state==="withdrawn").length,2);
  assert.equal((await f.get(`occupancy/${f.runId}/c`)).body.guestCount,0);
  t.diagnostic(JSON.stringify({profile:"move-loss",summary:report.summary,nativeState:native.enrolment_state,browserObserved:false}));
});

test("concurrent independent HTTP requests serialize same-key replay and distinct-key capacity admission",async t=>{
  const f=await fixture(t);
  const same=await Promise.all([f.create(5,JOURNEY_SLOTS.a,"cancel-create"),f.create(5,JOURNEY_SLOTS.a,"cancel-create")]);
  assert.deepEqual(same.map(row=>row.status).sort(),[200,201]);assert.equal(same[0].body.id,same[1].body.id);
  assert.equal((await f.create(4,JOURNEY_SLOTS.a,"cancel-create")).status,409);
  const pair=await Promise.all([f.create(5,JOURNEY_SLOTS.b,"cancel-five"),f.create(5,JOURNEY_SLOTS.b,"cancel-three")]);
  assert.deepEqual(pair.map(row=>row.status).sort(),[201,409]);assert.equal((await f.get(`occupancy/${f.runId}/b`)).body.guestCount,5);
  assert.equal(f.snapshot().enrolments.length,2);assert.equal(f.snapshot().commands.length,2);
});

test("fixed failed transfer rolls back native state and command log; repeated withdrawal releases no extra seats",async t=>{
  const f=await fixture(t),first=wire(await f.create(5,JOURNEY_SLOTS.a,"cancel-create"),201);
  wire(await f.create(3,JOURNEY_SLOTS.a,"cancel-three"),201);
  const source=wire(await f.create(2,JOURNEY_SLOTS.b,"source-create"),201),before=f.snapshot();
  assert.equal((await f.command(source.id,"move","move-full",JOURNEY_SLOTS.a)).status,409);assert.deepEqual(f.snapshot(),before);
  wire(await f.command(source.id,"move","move-free",JOURNEY_SLOTS.c),200);
  assert.equal((await f.command(source.id,"move","move-free",JOURNEY_SLOTS.b)).status,409);
  wire(await f.command(first.id,"cancel","cancel-first"),200);
  wire(await f.create(5,JOURNEY_SLOTS.a,"cancel-five"),201);
  wire(await f.command(first.id,"cancel","cancel-repeat"),200);
  assert.equal((await f.get(`occupancy/${f.runId}/a`)).body.guestCount,8);
  assert.equal((await f.create(1,JOURNEY_SLOTS.a,"cancel-extra")).status,409);
});

test("native SQL capacity guards also reject cross-exercise reassignment outside the HTTP adapter",async t=>{
  const f=await fixture(t),first=wire(await f.create(5,JOURNEY_SLOTS.c,"cancel-create"),201);
  const otherRun=crypto.randomUUID(),otherBody={testRunId:otherRun,marker:`PBP-${otherRun}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:JOURNEY_SLOTS.c,partySize:5};
  const other=wire(await f.request("/pbp/bookings",otherBody,{"Idempotency-Key":journeyKey(otherRun,"cancel-create")}),201);
  const db=new DatabaseSync(f.database);try{
    assert.throws(()=>db.prepare("UPDATE enrolments SET exercise_id=?,exercise_tag=? WHERE enrolment_ref=?").run(f.runId,f.marker.marker,other.id),/workshop_full/u);
    assert.equal(db.prepare("SELECT exercise_id FROM enrolments WHERE enrolment_ref=?").get(other.id)!.exercise_id,otherRun);
  }finally{db.close();}
  assert.equal((await f.get(`occupancy/${f.runId}/c`)).body.guestCount,5);
  assert.equal((await f.get(`bookings/${first.id}`)).body.status,"active");
});

test("post-commit504 is independently readable and same-key recovery survives a real Python process restart",async t=>{
  const f=await fixture(t),lost=await f.create(1,JOURNEY_SLOTS.b,"loss-create");
  assert.equal(lost.status,504);assert.deepEqual(lost.body,{code:"response_lost_after_commit"});
  const prior=(await f.get(`merchant/${f.runId}`)).body.bookings as Wire[];assert.equal(prior.length,1);
  await f.restart();const recovered=wire(await f.create(1,JOURNEY_SLOTS.b,"loss-create"),200);
  assert.equal(recovered.id,prior[0].id);assert.equal(f.snapshot().enrolments.length,1);assert.equal(f.snapshot().commands.length,1);
  assert.equal((await f.create(2,JOURNEY_SLOTS.b,"loss-create")).status,409);
});

test("real HTTP guards reject credentials, foreign origins, malformed synthetic data, bodies and query-selected faults without writes",async t=>{
  const f=await fixture(t),base={...f.marker,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:JOURNEY_SLOTS.a,partySize:5};
  for(const extra of[{Cookie:"practice=1"},{Authorization:"Fictional value"},{Origin:"https://foreign.example.org"}]as Record<string,string>[])
    assert.equal((await f.request("/pbp/bookings",base,{"Idempotency-Key":journeyKey(f.runId,"cancel-create"),...extra})).status,403);
  for(const body of[{...base,email:"real@example.com"},{...base,profile:"move-loss"},{...base,partySize:"5"},{...base,partySize:true},{...base,slot:"2099-01-02T10:00:00Z"},{...base,marker:"wrong"},[base]]){
    const response=await f.request("/pbp/bookings",body,{"Idempotency-Key":journeyKey(f.runId,"cancel-create")});assert.ok([400,422].includes(response.status),JSON.stringify(body));
  }
  assert.equal((await f.request("/pbp/bookings",base,{"Idempotency-Key":journeyKey(f.runId,"move-free")})).status,400);
  for(const route of["/pbp/bookings?fault=move-loss","/pbp/meta?profile=fixed","/workshop.html?run="+f.runId+"&fault=move-loss","/workshop.html?run="+f.runId+"&run="+f.runId])
    assert.equal((await f.request(route)).status,400,route);
  assert.equal((await f.request("/pbp/unknown",base)).status,404);
  assert.equal((await f.request("/schema.sql")).status,404);
  assert.equal((await f.request("/pbp/meta",undefined,{},"DELETE")).status,405);
  const raw=(text:string,contentType="application/json")=>fetch(f.origin+"/pbp/bookings",{method:"POST",headers:{Origin:f.origin,"Content-Type":contentType,"Idempotency-Key":journeyKey(f.runId,"cancel-create")},body:text,signal:AbortSignal.timeout(8000)});
  assert.equal((await raw("x".repeat(4097))).status,413);
  assert.equal((await raw(JSON.stringify(base),"text/plain")).status,415);
  assert.equal((await raw('{"testRunId":"x","testRunId":"y"}')).status,400);
  assert.equal((await raw("{malformed")).status,400);
  assert.equal(f.snapshot().enrolments.length,0);assert.equal(f.snapshot().commands.length,0);
});

test("native manifests describe actual independent fields, distinct revisions and eleven cooperative actions",async t=>{
  const f=await fixture(t),metadata=(await f.get("meta")).body;
  assert.equal(metadata.revision,"lifecycle-fixed-v1");assert.equal(metadata.nativeRevision,"florist-workshop-python-fixed-v1");assert.equal(metadata.nativeSchemaRevision,"florist-enrolments-v1");
  for(const profile of["fixed","move-loss"]){
    const text=await readFile(path.join(directory,`manifest.${profile}.json`),"utf8"),manifest=JSON.parse(text),preflight=parseJourneyIntegrationManifest(text);
    assert.equal(preflight.canRequestRegistration,true);assert.deepEqual(preflight.errors,[]);
    assert.equal(manifest.native.deploymentRevision,`florist-workshop-python-${profile}-v1`);assert.equal(manifest.bridge.revision,`lifecycle-${profile}-v1`);
    assert.equal(manifest.bridge.supportedActions.length,11);
    const db=new DatabaseSync(f.database,{readOnly:true});try{for(const field of Object.values(manifest.native.receiptFields)as string[]){const[table,column]=field.split(".");assert.ok(db.prepare(`PRAGMA table_info(${table})`).all().some(row=>row.name===column),field);}}finally{db.close();}
  }
  const page=await fetch(f.origin+"/workshop.html?run="+f.runId),html=await page.text();assert.equal(page.status,200);assert.match(html,/Garden bouquet/u);assert.match(html,/id="panel-manage"/u);assert.match(html,/src="\/workshop.mjs"/u);
  assert.match(page.headers.get("Content-Security-Policy")!,/frame-ancestors https:\/\/briefpay-kang-lab\.blueheron8\.chatgpt\.site/u);
  const module=await fetch(f.origin+"/workshop.mjs");assert.equal(module.status,200);assert.ok(!(await module.text()).includes("journey-checks"));
});
