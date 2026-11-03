import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {Worker} from "node:worker_threads";
import {handleCapacityRequest} from "../examples/seller-capacity-staging/worker/capacity-service.mjs";

const schema=readFileSync(new URL("../examples/seller-capacity-staging/migrations/0001_capacity.sql",import.meta.url),"utf8");
const hosted=readFileSync(new URL("./fixtures/seller-staging-hosted/0004_capacity_reference.sql",import.meta.url),"utf8");
const origin="https://capacity-staging.example.org",slotA="2099-01-01T10:00:00Z",slotB="2099-01-01T11:00:00Z";
const runId="cbbf49f4-cbc8-4b5a-acb7-12d27f847b79";
const config={CAPACITY_PROJECT_ID:"synthetic-capacity-project",CAPACITY_REGISTRATION_REVISION:"review-1",CAPACITY_DEPLOYMENT_REVISION:"capacity-build-1",CAPACITY_FRONTEND_BUNDLE_DIGEST:"a".repeat(64),CAPACITY_POLICY_ID:"fixed",CAPACITY_BACKEND_ARTIFACT_DIGEST:"b".repeat(64),CAPACITY_BACKEND_SOURCE_COMMIT:"c".repeat(40)};
const payload=(partySize=5,slot=slotA,id=runId)=>({testRunId:id,marker:`PBP-${id}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize});
const key=(suffix="race-a",id=runId)=>`pbp-${id}-capacity-${suffix}`;
const manifest=values=>`${values.CAPACITY_PROJECT_ID}:${values.CAPACITY_REGISTRATION_REVISION}:${values.CAPACITY_DEPLOYMENT_REVISION}:${values.CAPACITY_FRONTEND_BUNDLE_DIGEST}:${values.CAPACITY_POLICY_ID}`;
function apply(sqlite,sql){for(const chunk of sql.split(/^--> statement-breakpoint\s*$/mu).map(value=>value.trim()).filter(Boolean))sqlite.exec(chunk);}
function d1(sqlite){return{prepare(sql){const statement=sqlite.prepare(sql);return{bind(...args){return{
  async first(){return statement.get(...args)??null;},async all(){return{success:true,results:statement.all(...args)};},async run(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}};},
};}};}};}
function database(filename=":memory:",migrate=true){const sqlite=new DatabaseSync(filename);sqlite.exec("PRAGMA busy_timeout=5000");if(filename!==":memory:")sqlite.exec("PRAGMA journal_mode=WAL");if(migrate)apply(sqlite,schema);return{sqlite,env:{...config,CAPACITY_DB:d1(sqlite)}};}
function post(value=payload(),suffix="race-a",extra={}){return new Request(`${origin}/pbp/bookings`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key(suffix,value?.testRunId??runId),...extra},body:JSON.stringify(value)});}
function get(id){return new Request(`${origin}/pbp/bookings/${id}`);}
async function occupancy(env,slot="a",id=runId){const response=await handleCapacityRequest(new Request(`${origin}/pbp/occupancy/${id}/${slot}`),env);assert.equal(response.status,200);return response.json();}
function count(sqlite){return sqlite.prepare("SELECT COUNT(*) AS count FROM seller_capacity_receipts").get().count;}
function seed(sqlite,values=config,changes={}){
  const id=crypto.randomUUID(),testRunId=crypto.randomUUID(),at=new Date().toISOString();
  const row={id,...payload(1,slotA,testRunId),manifestNamespace:manifest(values),namespace:`${manifest(values)}:${testRunId}`,idempotencyKey:key("race-a",testRunId),createdAt:at,expiresAt:new Date(Date.parse(at)+3600_000).toISOString(),...changes};
  const result=sqlite.prepare(`INSERT INTO seller_capacity_receipts
    (id,namespace,manifest_namespace,project_id,registration_revision,deployment_revision,frontend_bundle_digest,policy_id,test_run_id,marker,customer,email,slot,party_size,idempotency_key,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.id,row.namespace,row.manifestNamespace,values.CAPACITY_PROJECT_ID,values.CAPACITY_REGISTRATION_REVISION,values.CAPACITY_DEPLOYMENT_REVISION,values.CAPACITY_FRONTEND_BUNDLE_DIGEST,values.CAPACITY_POLICY_ID,row.testRunId,row.marker,row.customer,row.email,row.slot,row.partySize,row.idempotencyKey,row.createdAt,row.expiresAt);
  return{row,changes:Number(result.changes)};
}

test("standalone and hosted schema-only chunks create native policies, receipts, indexes and complete SQL triggers without seed receipts",()=>{
  assert.equal(hosted,schema);
  for(const sql of [schema,hosted]){const sqlite=new DatabaseSync(":memory:");try{
    apply(sqlite,sql);assert.equal(count(sqlite),0);
    assert.deepEqual(sqlite.prepare("SELECT * FROM seller_capacity_policy ORDER BY policy_id").all().map(row=>({...row})),[
      {policy_id:"fixed",max_party_size:6,max_guests_per_slot:8,enforce_capacity:1},
      {policy_id:"overbook",max_party_size:6,max_guests_per_slot:8,enforce_capacity:0},
      {policy_id:"underlimit",max_party_size:6,max_guests_per_slot:7,enforce_capacity:1},
    ]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'seller_capacity_%'").get().count,3);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name IN('seller_capacity_slot_lookup','seller_capacity_expiry')").get().count,2);
  }finally{sqlite.close();}}
});

test("capacity schema coexists with the old hosted seller schema without rewriting its policy",()=>{
  const sqlite=new DatabaseSync(":memory:");try{
    for(const file of ["0002_seller_reference_staging.sql","0003_seller_reference_policy_fix.sql"])apply(sqlite,readFileSync(new URL(`./fixtures/seller-staging-hosted/${file}`,import.meta.url),"utf8"));
    apply(sqlite,hosted);assert.equal(sqlite.prepare("SELECT max_party_size FROM seller_business_policy").get().max_party_size,6);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM seller_booking_receipts").get().count,0);assert.equal(count(sqlite),0);
  }finally{sqlite.close();}
});

test("metadata reads operator-selected native policy and declaration without outbound calls or exposing enforcement faults",async()=>{
  const{sqlite,env}=database(),originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error("must not contact external services");};
  try{
    for(const[policyId,capacity]of[["fixed",8],["overbook",8],["underlimit",7]]){
      const response=await handleCapacityRequest(new Request(`${origin}/pbp/meta`),{...env,CAPACITY_POLICY_ID:policyId});assert.equal(response.status,200);const meta=await response.json();
      assert.equal(meta.protocol,"booking-http-v3");assert.equal(meta.maxPartySize,6);assert.equal(meta.maxGuestsPerSlot,capacity);assert.equal(meta.revision,config.CAPACITY_DEPLOYMENT_REVISION);assert.equal(meta.projectId,config.CAPACITY_PROJECT_ID);
      assert.equal(meta.registrationRevision,config.CAPACITY_REGISTRATION_REVISION);assert.equal(meta.frontendBundleDigest,config.CAPACITY_FRONTEND_BUNDLE_DIGEST);assert.equal(meta.backendArtifactDigest,config.CAPACITY_BACKEND_ARTIFACT_DIGEST);assert.equal(meta.backendSourceCommit,config.CAPACITY_BACKEND_SOURCE_COMMIT);
      assert.equal(meta.deploymentAttestation,false);assert.equal(meta.emailDelivery,false);assert.equal(meta.payments,false);assert.equal(Object.hasOwn(meta,"enforce_capacity"),false);
    }
    assert.equal(calls,0);assert.equal(count(sqlite),0);
  }finally{globalThis.fetch=originalFetch;sqlite.close();}
});

test("fixed shared capacity supports fill, full-slot replay/conflict and final independent readbacks after other-slot writes",async()=>{
  const{sqlite,env}=database();try{
    assert.deepEqual(await occupancy(env),{testRunId:runId,slot:slotA,revision:config.CAPACITY_DEPLOYMENT_REVISION,guestCount:0,bookingIds:[]});
    const first=await handleCapacityRequest(post(),env);assert.equal(first.status,201);const winner=await first.json();
    const rejected=await handleCapacityRequest(post(payload(),"race-b"),env);assert.equal(rejected.status,409);assert.equal((await rejected.json()).code,"slot_capacity_exceeded");
    const fill=await handleCapacityRequest(post(payload(3),"fill"),env);assert.equal(fill.status,201);const remainder=await fill.json();
    assert.notEqual(remainder.id,winner.id);const full=await occupancy(env);assert.equal(full.guestCount,8);assert.deepEqual(full.bookingIds.sort(),[winner.id,remainder.id].sort());assert.deepEqual(Object.keys(full).sort(),["bookingIds","guestCount","revision","slot","testRunId"]);
    const replay=await handleCapacityRequest(post(),env);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),winner);
    const conflict=await handleCapacityRequest(post(payload(4)),env);assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,"idempotency_conflict");
    const extra=await handleCapacityRequest(post(payload(1),"extra"),env);assert.equal(extra.status,409);assert.equal((await extra.json()).code,"slot_capacity_exceeded");
    const secondSlot=await handleCapacityRequest(post(payload(6,slotB),"slot-b"),env);assert.equal(secondSlot.status,201);const independent=await secondSlot.json();
    assert.equal((await occupancy(env,"b")).guestCount,6);assert.deepEqual((await occupancy(env,"b")).bookingIds,[independent.id]);
    assert.deepEqual(await(await handleCapacityRequest(get(winner.id),env)).json(),winner);assert.deepEqual(await(await handleCapacityRequest(get(remainder.id),env)).json(),remainder);assert.deepEqual(await occupancy(env),full);
    assert.equal(sqlite.prepare("SELECT SUM(party_size) AS sum FROM seller_capacity_receipts WHERE slot = ?").get(slotA).sum,8);assert.equal(count(sqlite),3);
  }finally{sqlite.close();}
});

test("controlled overbook and underlimit policies cause actual stored business defects without changing checker inputs",async()=>{
  const{sqlite,env}=database();try{
    const flawed={...env,CAPACITY_POLICY_ID:"overbook"};
    for(const suffix of["race-a","race-b"])assert.equal((await handleCapacityRequest(post(payload(),suffix),flawed)).status,201);
    const wrong=await occupancy(flawed);assert.equal(wrong.guestCount,10);assert.equal(wrong.bookingIds.length,2);
    assert.equal(sqlite.prepare("SELECT SUM(party_size) AS sum FROM seller_capacity_receipts WHERE policy_id='overbook'").get().sum,10);
    const strict={...env,CAPACITY_POLICY_ID:"underlimit"};assert.equal((await handleCapacityRequest(post(),strict)).status,201);
    const tooStrict=await handleCapacityRequest(post(payload(3),"fill"),strict);assert.equal(tooStrict.status,409);assert.equal((await tooStrict.json()).code,"slot_capacity_exceeded");
    assert.equal((await handleCapacityRequest(post(payload(2),"fill"),strict)).status,201);assert.equal((await occupancy(strict)).guestCount,7);
  }finally{sqlite.close();}
});

const threadSource=`
const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');
(async()=>{const {handleCapacityRequest}=await import(workerData.moduleUrl);const sqlite=new DatabaseSync(workerData.filename);sqlite.exec('PRAGMA busy_timeout=5000');
const db={prepare(sql){const s=sqlite.prepare(sql);return{bind(...args){return{async first(){return s.get(...args)??null;},async all(){return{success:true,results:s.all(...args)};},async run(){return{success:true,meta:{changes:Number(s.run(...args).changes)}};}};}};}};
parentPort.postMessage({ready:true});await new Promise(resolve=>parentPort.once('message',resolve));
try{const response=await handleCapacityRequest(new Request(workerData.url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':workerData.key},body:JSON.stringify(workerData.payload)}),{...workerData.config,CAPACITY_DB:db});parentPort.postMessage({status:response.status,body:await response.json()});}finally{sqlite.close();}
})().catch(error=>parentPort.postMessage({error:String(error)}));`;
async function raceConnections(filename,requests){
  const workers=[],ready=[],results=[];let timer;
  try{
    for(const request of requests){const worker=new Worker(threadSource,{eval:true,workerData:{filename,config,payload:request.payload,key:request.key,url:`${origin}/pbp/bookings`,moduleUrl:new URL("../examples/seller-capacity-staging/worker/capacity-service.mjs",import.meta.url).href}});workers.push(worker);
      ready.push(new Promise((resolve,reject)=>{worker.on("message",message=>{if(message.ready)resolve();else if(message.error)reject(new Error(message.error));});worker.on("error",reject);}));
      results.push(new Promise((resolve,reject)=>{worker.on("message",message=>{if(message.status)resolve(message);else if(message.error)reject(new Error(message.error));});worker.on("error",reject);}));
    }
    const work=(async()=>{await Promise.all(ready);workers.forEach(worker=>worker.postMessage("go"));return Promise.all(results);})();
    return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Capacity SQLite race timed out")),8000);})]);
  }finally{clearTimeout(timer);await Promise.all(workers.map(worker=>worker.terminate()));}
}

test("independent worker threads atomically admit one of two DIFFERENT five-person keys, and preserve same-key replay/conflict",async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"pbp-capacity-atomic-")),filename=path.join(dir,"capacity.sqlite"),{sqlite}=database(filename);
  try{
    const different=await raceConnections(filename,[{payload:payload(),key:key("race-a")},{payload:payload(),key:key("race-b")}]);
    assert.deepEqual(different.map(result=>result.status).sort(),[201,409]);assert.equal(different.find(result=>result.status===409).body.code,"slot_capacity_exceeded");
    assert.equal(count(sqlite),1);assert.equal(sqlite.prepare("SELECT SUM(party_size) AS sum FROM seller_capacity_receipts").get().sum,5);
    sqlite.exec("DELETE FROM seller_capacity_receipts");
    const same=await raceConnections(filename,[{payload:payload(),key:key()},{payload:payload(),key:key()}]);assert.deepEqual(same.map(result=>result.status).sort(),[200,201]);assert.deepEqual(same[0].body,same[1].body);assert.equal(count(sqlite),1);
    sqlite.exec("DELETE FROM seller_capacity_receipts");
    const changed=await raceConnections(filename,[{payload:payload(4),key:key()},{payload:payload(5),key:key()}]);assert.deepEqual(changed.map(result=>result.status).sort(),[201,409]);assert.equal(changed.find(result=>result.status===409).body.code,"idempotency_conflict");assert.equal(count(sqlite),1);
  }finally{sqlite.close();rmSync(dir,{recursive:true,force:true});}
});

test("manifest, operator policy and synthetic run namespaces isolate receipt/occupancy reads without sharing seats",async()=>{
  const{sqlite,env}=database();try{
    const original=await(await handleCapacityRequest(post(),env)).json();
    for(const changes of[{CAPACITY_PROJECT_ID:"other-project"},{CAPACITY_REGISTRATION_REVISION:"review-2"},{CAPACITY_DEPLOYMENT_REVISION:"capacity-build-2"},{CAPACITY_FRONTEND_BUNDLE_DIGEST:"d".repeat(64)},{CAPACITY_POLICY_ID:"overbook"}]){
      const other={...env,...changes};assert.equal((await handleCapacityRequest(get(original.id),other)).status,404);assert.equal((await occupancy(other)).guestCount,0);
      assert.equal((await handleCapacityRequest(post(),other)).status,201);
    }
    const otherRun=crypto.randomUUID();assert.equal((await occupancy(env,"a",otherRun)).guestCount,0);assert.equal((await handleCapacityRequest(post(payload(5,slotA,otherRun)),env)).status,201);
    assert.equal((await occupancy(env)).guestCount,5);assert.equal((await occupancy(env,"a",otherRun)).guestCount,5);
  }finally{sqlite.close();}
});

test("native SQL independently enforces synthetic values, per-booking maximum and shared cross-key sum",()=>{
  const{sqlite}=database();try{
    for(const changes of[{customer:"Real customer"},{email:"customer@example.com"},{slot:"2026-11-03T10:00:00Z"},{namespace:"wrong"},{manifestNamespace:"wrong"},{marker:"wrong"},{idempotencyKey:"wrong"},{partySize:1.5},{partySize:7}])assert.throws(()=>seed(sqlite,config,changes));
    const first=seed(sqlite);const known=first.row;
    assert.throws(()=>seed(sqlite,config,{testRunId:known.testRunId,marker:known.marker,namespace:known.namespace,idempotencyKey:key("race-b",known.testRunId),partySize:7}),/seller_capacity_party_exceeded/u);
    const five=seed(sqlite,config,{partySize:5});
    assert.throws(()=>seed(sqlite,config,{testRunId:five.row.testRunId,marker:five.row.marker,namespace:five.row.namespace,idempotencyKey:key("race-b",five.row.testRunId),partySize:4}),/seller_slot_capacity_exceeded/u);
    assert.equal(count(sqlite),2);
  }finally{sqlite.close();}
});

test("receipts persist across reopen and expired-key recreation succeeds within100deletions even with an older backlog",async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"pbp-capacity-persistence-")),filename=path.join(dir,"capacity.sqlite");let state;
  try{
    state=database(filename);const saved=await(await handleCapacityRequest(post(),state.env)).json();assert.equal(Date.parse(saved.expiresAt)-Date.parse(saved.createdAt),3600_000);
    state.sqlite.close();state=database(filename,false);assert.deepEqual(await(await handleCapacityRequest(get(saved.id),state.env)).json(),saved);
    state.sqlite.prepare("UPDATE seller_capacity_receipts SET created_at=?,expires_at=? WHERE id=?").run("2001-01-01T00:00:00.000Z","2001-01-01T01:00:00.000Z",saved.id);
    for(let i=0;i<100;i++)seed(state.sqlite,config,{createdAt:"2000-01-01T00:00:00.000Z",expiresAt:"2000-01-01T01:00:00.000Z"});
    assert.equal(count(state.sqlite),101);assert.equal((await handleCapacityRequest(get(saved.id),state.env)).status,404);assert.equal((await occupancy(state.env)).guestCount,0);
    const recreated=await handleCapacityRequest(post(),state.env);assert.equal(recreated.status,201);const receipt=await recreated.json();assert.notEqual(receipt.id,saved.id);assert.equal(count(state.sqlite),2);assert.equal((await occupancy(state.env)).guestCount,5);
  }finally{state?.sqlite.close();rmSync(dir,{recursive:true,force:true});}
});

test("global cap leaves one final-row winner without evicting history and full-store existing keys still replay or conflict",async()=>{
  const{sqlite,env}=database();try{
    const first=await(await handleCapacityRequest(post(payload(1)),env)).json();for(let i=0;i<998;i++)seed(sqlite);
    const final=await Promise.all([handleCapacityRequest(post(payload(1),"fill"),env),handleCapacityRequest(post(payload(1),"extra"),env)]);assert.deepEqual(final.map(result=>result.status).sort(),[201,503]);assert.equal(count(sqlite),1000);
    const replay=await handleCapacityRequest(post(payload(1)),env);assert.equal(replay.status,200);assert.equal((await replay.json()).id,first.id);
    const conflict=await handleCapacityRequest(post(payload(2)),env);assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,"idempotency_conflict");assert.equal(count(sqlite),1000);
  }finally{sqlite.close();}
});

test("occupancy never silently truncates oversized synthetic result sets",async()=>{
  const{sqlite,env}=database();try{
    const overbook={...config,CAPACITY_POLICY_ID:"overbook"},ns=`${manifest(overbook)}:${runId}`;
    // Six legal API suffixes limit normal scenarios. Direct controlled SQL
    // cannot manufacture more keys: the independent namespace CHECK rejects it.
    assert.throws(()=>seed(sqlite,overbook,{namespace:ns,testRunId:runId,marker:`PBP-${runId}`,idempotencyKey:key("unknown")}),/CHECK/u);
    const malformed={...env,CAPACITY_DB:{prepare(){return{bind(){return{async all(){return{success:true,results:Array.from({length:25},()=>({id:crypto.randomUUID(),guest_count:25,booking_count:25}))};}};}};}}};
    const result=await handleCapacityRequest(new Request(`${origin}/pbp/occupancy/${runId}/a`),malformed);assert.equal(result.status,503);assert.equal((await result.json()).code,"occupancy_limit_exceeded");
  }finally{sqlite.close();}
});

test("real inputs, arbitrary keys/slots, credentials and oversized bodies fail before storage access",async()=>{
  let accessed=0;const env={...config,CAPACITY_DB:{prepare(){accessed++;throw new Error("must not reach storage");}}};
  for(const value of[{...payload(),customer:"Real customer"},{...payload(),email:"real@example.com"},{...payload(),slot:"2099-01-02T10:00:00Z"},{...payload(),policyId:"overbook"},{...payload(),expectedCapacity:8},{...payload(),marker:"wrong"},null,[]])assert.equal((await handleCapacityRequest(post(value),env)).status,400);
  for(const party of[0,-1,1.5,"5",null])assert.equal((await handleCapacityRequest(post(payload(party)),env)).status,422);
  assert.equal((await handleCapacityRequest(post(payload(14)),env)).status,400);
  for(const extra of[{Origin:origin},{Cookie:"synthetic=no-secret"},{Authorization:"synthetic-no-secret"}])assert.equal((await handleCapacityRequest(post(payload(),"race-a",extra),env)).status,403);
  assert.equal((await handleCapacityRequest(post(payload(),"unknown"),env)).status,400);
  assert.equal((await handleCapacityRequest(post({...payload(),padding:"x".repeat(5000)}),env)).status,413);
  const streamed=new Request(`${origin}/pbp/bookings`,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key()},body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4097));controller.close();}}),duplex:"half"});assert.equal((await handleCapacityRequest(streamed,env)).status,413);
  assert.equal(accessed,0);
});

test("unknown methods/queries/configuration and absent schema fail without creating tables or leaking declaration values",async()=>{
  const{sqlite,env}=database();try{
    for(const suffix of["?","?capacity=100","#fragment"])assert.equal((await handleCapacityRequest(new Request(`${origin}/pbp/meta${suffix}`),env)).status,400);
    assert.equal((await handleCapacityRequest(new Request(`${origin}/pbp/bookings`),env)).status,405);assert.equal((await handleCapacityRequest(new Request(`${origin}/pbp/unknown`),env)).status,404);
    for(const change of[{CAPACITY_POLICY_ID:"caller-choice"},{CAPACITY_PROJECT_ID:"bad/project"},{CAPACITY_FRONTEND_BUNDLE_DIGEST:"PRIVATE-INVALID-DIGEST"}]){const result=await handleCapacityRequest(new Request(`${origin}/pbp/meta`),{...env,...change});assert.equal(result.status,503);assert.deepEqual(await result.json(),{code:"configuration_unavailable"});}
    assert.equal(count(sqlite),0);
  }finally{sqlite.close();}
  const empty=database(":memory:",false);try{const result=await handleCapacityRequest(post(),empty.env);assert.equal(result.status,503);assert.deepEqual(await result.json(),{code:"storage_unavailable"});assert.equal(empty.sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'").get().count,0);}finally{empty.sqlite.close();}
});
