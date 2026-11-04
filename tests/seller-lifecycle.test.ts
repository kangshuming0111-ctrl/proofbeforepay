import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {executeTransferRun} from '../lib/transfer-competition-runner.ts';
import {TRANSFER_SPEC_DIGEST,generateTransferPlan,TRANSFER_SLOTS,type TransferBase} from '../lib/transfer-competition.ts';
import {PROJECT_JOURNEY_PLAN_DIGEST} from '../lib/project-journey.ts';
import {handleLifecycleRequest} from '../examples/seller-lifecycle-staging/worker/lifecycle-service.mjs';

const schema=readFileSync(new URL('../examples/seller-lifecycle-staging/migrations/0001_lifecycle.sql',import.meta.url),'utf8');
const origin='https://fictional-lifecycle.example.org',slots={a:'2099-01-01T10:00:00Z',b:'2099-01-01T11:00:00Z',c:'2099-01-01T12:00:00Z'};
type Row={id:string;testRunId:string;marker:string;customer:string;email:string;slot:string;partySize:number;status:string;revision:string;idempotencyKey:string};
function d1(sqlite:DatabaseSync){return{prepare(sql:string){const stmt=sqlite.prepare(sql);return{bind(...args:(string|number|null)[]){return{async first(){return stmt.get(...args)??null;},async all(){return{success:true,results:stmt.all(...args)};},async run(){return{success:true,meta:{changes:Number(stmt.run(...args).changes)}};}};}};}};}
function fixture(profile='fixed',filename=':memory:'){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA busy_timeout=5000');if(filename!==':memory:')sqlite.exec('PRAGMA journal_mode=WAL');sqlite.exec(schema);
 const env={DB:d1(sqlite),LIFECYCLE_PROFILE:profile},runId=crypto.randomUUID(),key=(suffix:string)=>`pbp-${runId}-lifecycle-${suffix}`;
 const marker={testRunId:runId,marker:`PBP-${runId}`};
 const create=(n:number,slot:string,suffix:string)=>handleLifecycleRequest(new Request(`${origin}/pbp/bookings`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key(suffix),Origin:origin},body:JSON.stringify({...marker,customer:'PBP synthetic',email:'pbp-test@example.invalid',slot,partySize:n})}),env);
 const command=(id:string,action:'cancel'|'move',suffix:string,slot?:string)=>handleLifecycleRequest(new Request(`${origin}/pbp/bookings/${id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key(suffix),Origin:origin},body:JSON.stringify({...marker,...(slot?{slot}:{})})}),env);
 const get=(route:string)=>handleLifecycleRequest(new Request(`${origin}/pbp/${route}`),env);
 return{sqlite,env,runId,key,marker,create,command,get};
}
async function json(response:Response){return await response.json()as Record<string,unknown>;}
async function row(response:Response,status:number){assert.equal(response.status,status);const result=await response.json()as Row;assert.match(result.id,/^[a-f0-9-]{36}$/u);return result;}
const occupancy=async(f:ReturnType<typeof fixture>,slot:keyof typeof slots)=>{const r=await f.get(`occupancy/${f.runId}/${slot}`);assert.equal(r.status,200);return json(r);};
async function coreFlow(profile:string){
 const f=fixture(profile);
 try{
  const meta=await json(await f.get('meta'));assert.deepEqual(meta,{protocol:'booking-lifecycle-http-v1',revision:`lifecycle-${profile}-v1`,nativeRevision:`lifecycle-${profile}-v1`,maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false,supportedModels:['release-vs-transfer-v1','transfer-competition-v1']});
  const first=await row(await f.create(5,slots.a,'cancel-create'),201);assert.equal(first.status,'active');assert.equal((await occupancy(f,'a')).guestCount,5);
  assert.equal((await row(await f.command(first.id,'cancel','cancel-first'),200)).status,'cancelled');assert.equal((await occupancy(f,'a')).guestCount,0);
  const five=await row(await f.create(5,slots.a,'cancel-five'),201),three=await row(await f.create(3,slots.a,'cancel-three'),201);assert.equal((await occupancy(f,'a')).guestCount,8);
  assert.equal((await row(await f.command(first.id,'cancel','cancel-repeat'),200)).status,'cancelled');assert.equal((await occupancy(f,'a')).guestCount,8);
  const extra=await f.create(1,slots.a,'cancel-extra');assert.equal(extra.status,profile==='cancel-credit'?201:409);if(extra.status===409)assert.equal((await json(extra)).code,'slot_capacity_exceeded');
  const source=await row(await f.create(2,slots.b,'source-create'),201);assert.equal((await occupancy(f,'b')).guestCount,2);
  const failedMove=await f.command(source.id,'move','move-full',slots.a);assert.equal(failedMove.status,profile==='cancel-credit'?200:409);if(failedMove.status===409)assert.equal((await json(failedMove)).code,'slot_capacity_exceeded');
  const retained=await row(await f.get(`bookings/${source.id}`),200);assert.equal(retained.slot,profile==='cancel-credit'?slots.a:slots.b);assert.equal(retained.status,profile==='move-loss'?'cancelled':'active');
  const movedResponse=await f.command(source.id,'move','move-free',slots.c);
  if(profile==='move-loss'){assert.equal(movedResponse.status,409);assert.equal((await json(movedResponse)).code,'booking_state_conflict');}
  else{const moved=await row(movedResponse,200);assert.equal(moved.id,source.id);assert.equal(moved.slot,slots.c);assert.equal(moved.partySize,2);assert.equal((await occupancy(f,'b')).guestCount,0);assert.equal((await occupancy(f,'c')).guestCount,2);}
  const lost=await f.create(1,slots.b,'loss-create');assert.equal(lost.status,504);assert.deepEqual(await json(lost),{code:'response_lost_after_commit'});
  const merchant1=await json(await f.get(`merchant/${f.runId}`));const committed=(merchant1.bookings as Row[]).filter(r=>r.idempotencyKey===f.key('loss-create'));assert.equal(committed.length,1);assert.equal(committed[0].partySize,1);assert.equal(committed[0].slot,slots.b);
  const retry=await row(await f.create(1,slots.b,'loss-create'),200);assert.equal(retry.id===committed[0].id,profile!=='retry-duplicate');
  const merchant2=await json(await f.get(`merchant/${f.runId}`));const after=(merchant2.bookings as Row[]).filter(r=>r.idempotencyKey===f.key('loss-create'));assert.equal(after.length,profile==='retry-duplicate'?2:1);
  const rows=f.sqlite.prepare('SELECT * FROM seller_lifecycle_bookings WHERE test_run_id=? ORDER BY slot,party_size').all(f.runId);
  const active=rows.filter(r=>r.status==='active');const sum=(slot:string)=>active.filter(r=>r.slot===slot).reduce((n,r)=>n+Number(r.party_size),0);
  assert.equal(sum(slots.a),profile==='cancel-credit'?9:8);assert.equal(sum(slots.b),profile==='retry-duplicate'?2:1);assert.equal(sum(slots.c),profile==='move-loss'?0:2);
  assert.equal(rows.length,profile==='cancel-credit'||profile==='retry-duplicate'?6:5);
  assert.equal(rows.filter(r=>r.status==='cancelled').length,profile==='move-loss'?2:1);
  for(const original of [first,five,three,source])assert.ok(rows.some(r=>r.id===original.id));
  assert.equal((await occupancy(f,'a')).guestCount,sum(slots.a));assert.equal((await occupancy(f,'b')).guestCount,sum(slots.b));assert.equal((await occupancy(f,'c')).guestCount,sum(slots.c));
  return{profile,rows:rows.length,active:active.length,a:sum(slots.a),b:sum(slots.b),c:sum(slots.c),operations:Number(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_lifecycle_operations').get()!.n),lossRows:after.length};
 }finally{f.sqlite.close();}
}
for(const profile of ['fixed','cancel-credit','move-loss','retry-duplicate'])test(`native lifecycle actual persisted policy: ${profile}`,async context=>{context.diagnostic(JSON.stringify(await coreFlow(profile)));});

test('lifecycle rejects real data, foreign origins, credentials, unknown fields and paths before storage',async()=>{
 let accesses=0;const env={LIFECYCLE_PROFILE:'fixed',DB:{prepare(){accesses++;throw new Error('unexpected storage');}}};
 const runId=crypto.randomUUID(),base={testRunId:runId,marker:`PBP-${runId}`,customer:'PBP synthetic',email:'pbp-test@example.invalid',slot:slots.a,partySize:5};
 const make=(payload:unknown=base,extra:Record<string,string>={},route='/pbp/bookings')=>new Request(`${origin}${route}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`pbp-${runId}-lifecycle-cancel-create`,Origin:origin,...extra},body:JSON.stringify(payload)});
 for(const payload of[{...base,email:'real@example.com'},{...base,profile:'cancel-credit'},{...base,partySize:'5'},{...base,slot:'2099-01-02T10:00:00Z'},{...base,testRunId:'not-a-uuid'},{...base,marker:'wrong'}])assert.ok([400,422].includes((await handleLifecycleRequest(make(payload),env)).status));
 for(const headers of[{Origin:'https://foreign.example.org'},{Authorization:'Fictional test value'},{Cookie:'fictional=1'}] as Record<string,string>[])assert.equal((await handleLifecycleRequest(make(base,headers),env)).status,403);
 assert.equal((await handleLifecycleRequest(make(base,{'Idempotency-Key':`pbp-${runId}-lifecycle-anything`}),env)).status,400);
 assert.equal((await handleLifecycleRequest(make(base,{},'/pbp/bookings?fault=move-loss'),env)).status,400);
 assert.equal((await handleLifecycleRequest(make(base,{},'/pbp/unknown'),env)).status,404);
 assert.equal(accesses,0);
});
test('lifecycle idempotent replay is intent-bound and failed atomic moves append no command or mutation',async()=>{
 const f=fixture();try{
  const original=await row(await f.create(5,slots.a,'cancel-create'),201);assert.equal((await row(await f.create(5,slots.a,'cancel-create'),200)).id,original.id);
  assert.equal((await f.create(4,slots.a,'cancel-create')).status,409);
  const source=await row(await f.create(2,slots.b,'source-create'),201);await row(await f.create(3,slots.a,'cancel-three'),201);
  const before=f.sqlite.prepare('SELECT * FROM seller_lifecycle_bookings ORDER BY id').all(),ops=Number(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_lifecycle_operations').get()!.n);
  assert.equal((await f.command(source.id,'move','move-full',slots.a)).status,409);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM seller_lifecycle_bookings ORDER BY id').all(),before);assert.equal(Number(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_lifecycle_operations').get()!.n),ops);
  const moved=await row(await f.command(source.id,'move','move-free',slots.c),200);assert.equal((await row(await f.command(source.id,'move','move-free',slots.c),200)).id,moved.id);
  assert.equal((await f.command(source.id,'move','move-free',slots.b)).status,409);assert.equal((await row(await f.get(`bookings/${source.id}`),200)).slot,slots.c);
 }finally{f.sqlite.close();}
});
test('lifecycle exact hosted migration is append-only and missing schema stays unavailable',async()=>{
 assert.equal(schema,readFileSync(new URL('./fixtures/seller-staging-hosted/0006_lifecycle.sql',import.meta.url),'utf8'));
 const sqlite=new DatabaseSync(':memory:');try{const response=await handleLifecycleRequest(new Request(`${origin}/pbp/meta`),{DB:d1(sqlite),LIFECYCLE_PROFILE:'fixed'});assert.equal(response.status,503);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'seller_lifecycle_%'").get()!.n,0);}finally{sqlite.close();}
});
test('lifecycle fresh-operation identity is independent of driver counters that include trigger writes',async()=>{
 const f=fixture();try{
  f.env.DB={prepare(sql:string){const prepared=d1(f.sqlite).prepare(sql);return{bind(...args:(string|number|null)[]){const statement=prepared.bind(...args);return{...statement,async run(){const result=await statement.run();return{...result,meta:{changes:result.meta.changes*2}};}};}};}};
  const original=await row(await f.create(5,slots.a,'cancel-create'),201);assert.equal((await row(await f.create(5,slots.a,'cancel-create'),200)).id,original.id);
  const lost=await f.create(1,slots.b,'loss-create');assert.equal(lost.status,504);assert.deepEqual(await json(lost),{code:'response_lost_after_commit'});
  const retry=await row(await f.create(1,slots.b,'loss-create'),200);assert.equal(retry.partySize,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_lifecycle_bookings WHERE idempotency_key=?').get(f.key('loss-create'))!.n,1);
 }finally{f.sqlite.close();}
});
test('lifecycle global staging bound remains explicit after a committed504; ordinary replay still reads its original row',async()=>{
 for(const profile of ['fixed','retry-duplicate']){
  const f=fixture(profile);try{
   const seed=f.sqlite.prepare('INSERT INTO seller_lifecycle_bookings(id,namespace,profile,test_run_id,revision,idempotency_key,slot,party_size,status,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
   for(let i=0;i<999;i++){const runId=crypto.randomUUID();seed.run(crypto.randomUUID(),`lifecycle-fixed-v1:${runId}`,'fixed',runId,'lifecycle-fixed-v1',`pbp-${runId}-lifecycle-cancel-create`,slots.a,1,'active','2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z','9999-01-01T00:00:00.000Z');}
   assert.equal((await f.create(1,slots.b,'loss-create')).status,504);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_lifecycle_bookings').get()!.n,1000);
   const response=await f.create(1,slots.b,'loss-create');assert.equal(response.status,profile==='fixed'?200:503);
   if(profile==='retry-duplicate')assert.deepEqual(await json(response),{code:'staging_limit_reached'});
   assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_lifecycle_bookings WHERE test_run_id=?').get(f.runId)!.n,1);
   const merchant=await json(await f.get(`merchant/${f.runId}`));assert.equal((merchant.bookings as Row[]).length,1);
  }finally{f.sqlite.close();}
 }
});
test('lifecycle concurrent same-key creation across independent connections commits only one command and booking',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'pbp-lifecycle-race-')),file=path.join(dir,'native.sqlite'),f=fixture('fixed',file);
 const workerCode=`
 const {parentPort,workerData}=require('node:worker_threads');
 const {DatabaseSync}=require('node:sqlite');
 (async()=>{
  const {handleLifecycleRequest}=await import(workerData.module);
  const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=5000');
  const adapter={prepare(sql){const stmt=db.prepare(sql);return{bind(...args){return{
    async first(){return stmt.get(...args)||null;},
    async all(){return{success:true,results:stmt.all(...args)};},
    async run(){return{success:true,meta:{changes:Number(stmt.run(...args).changes)}};}
  };}};}};
  const env={LIFECYCLE_PROFILE:'fixed',DB:adapter};
  const response=await handleLifecycleRequest(new Request(workerData.url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':workerData.key},body:JSON.stringify(workerData.body)}),env);
  const body=await response.json();db.close();parentPort.postMessage({status:response.status,body});
 })().catch(error=>parentPort.postMessage({error:error.message}));`;

 const data={module:new URL('../examples/seller-lifecycle-staging/worker/lifecycle-service.mjs',import.meta.url).href,file,url:`${origin}/pbp/bookings`,key:f.key('cancel-create'),body:{...f.marker,customer:'PBP synthetic',email:'pbp-test@example.invalid',slot:slots.a,partySize:5}};
 const launch=()=>new Promise<{status:number;body:Row}>( (resolve,reject)=>{const w=new Worker(workerCode,{eval:true,workerData:data});w.once('message',m=>m.error?reject(new Error(m.error)):resolve(m));w.once('error',reject);});
 try{const pair=await Promise.all([launch(),launch()]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,201]);assert.equal(pair[0].body.id,pair[1].body.id);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_lifecycle_operations').get()!.n,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM seller_lifecycle_bookings').get()!.n,1);}finally{f.sqlite.close();rmSync(dir,{recursive:true,force:true});}
});

// Actual native SQL mutations with the production disposable handler. This is
// a controlled protocol fixture, not a browser or independent seller claim.
test('hosted lifecycle protocol explicitly supports competing transfers and its SQL retains the capacity loser',async()=>{
 const f=fixture();try{for(const seed of[0,4,17]){
  const id=crypto.randomUUID(),base:TransferBase={id,projectId:'hosted-transfer-project',deliveryId:'hosted-transfer-delivery',deliveryDigest:'d'.repeat(64),journeyPlanDigest:PROJECT_JOURNEY_PLAN_DIGEST,modelSpecDigest:TRANSFER_SPEC_DIGEST,seed,startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30000).toISOString(),registration:{id:'hosted-transfer-target',label:'Controlled native lifecycle SQL',projectId:'hosted-transfer-project',registrationRevision:'hosted-transfer-reg-v1',protocol:'booking-lifecycle-http-v1',recipe:'booking-lifecycle-20-v1',frontendEntryUrl:origin+'/index.html',backendBaseUrl:origin+'/pbp/',deploymentRevision:'lifecycle-fixed-v1',bridgeRevision:'lifecycle-fixed-v1',frontendBundleDigest:'d'.repeat(64),scenario:'fixed',expiresAt:new Date(Date.now()+60000).toISOString(),testOnly:true,provenance:'operator-approved-declaration'}};
  const report=await executeTransferRun(base,{fetch:async(url,init)=>handleLifecycleRequest(new Request(url,init),f.env)});assert.equal(report.result.outcome,'compatible',JSON.stringify(report.result));assert.equal(report.trace.length,24);assert.equal(report.trace.filter(r=>r.method==='POST').length,5);
  const plan=generateTransferPlan(seed),rows=f.sqlite.prepare('SELECT * FROM seller_lifecycle_bookings WHERE test_run_id=? ORDER BY id').all(id),target=rows.filter(r=>r.slot===TRANSFER_SLOTS[plan.target]);assert.equal(rows.length,3);assert.equal(rows.filter(r=>r.status==='active').length,3);assert.equal(target.reduce((sum,r)=>sum+Number(r.party_size),0),8);assert.equal(rows.filter(r=>r.slot===TRANSFER_SLOTS[plan.source]||r.slot===TRANSFER_SLOTS[plan.spare]).length,1);
  assert.deepEqual(report.trace.filter(r=>r.operationId==='transfer_x'||r.operationId==='transfer_y').map(r=>r.status).sort(),[200,409]);
 }
 const unknown=crypto.randomUUID(),request=new Request(origin+'/pbp/bookings',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Idempotency-Key':`pbp-${unknown}-transfer-competition-anything`},body:JSON.stringify({testRunId:unknown,marker:`PBP-${unknown}`,customer:'PBP synthetic',email:'pbp-test@example.invalid',slot:slots.a,partySize:2})});const before=f.sqlite.prepare('SELECT count(*) n FROM seller_lifecycle_bookings').get()!.n;assert.equal((await handleLifecycleRequest(request,f.env)).status,400);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM seller_lifecycle_bookings').get()!.n,before);
 }finally{f.sqlite.close();}
});

test('competition command names are finite and action-specific before any datastore access',async()=>{
 let accesses=0;const env={LIFECYCLE_PROFILE:'fixed',DB:{prepare(){accesses++;throw new Error('unexpected storage');}}},id=crypto.randomUUID(),booking=crypto.randomUUID(),marker={testRunId:id,marker:`PBP-${id}`};
 for(const [action,suffix]of[['create','source-extra'],['create','move-x'],['move','move-z'],['move','source-x'],['cancel','cancel-first']]as const){
  const body=action==='create'?{...marker,customer:'PBP synthetic',email:'pbp-test@example.invalid',slot:slots.a,partySize:2}:action==='move'?{...marker,slot:slots.a}:marker;
  const response=await handleLifecycleRequest(new Request(origin+'/pbp/'+(action==='create'?'bookings':`bookings/${booking}/${action}`),{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'Idempotency-Key':`pbp-${id}-transfer-competition-${suffix}`},body:JSON.stringify(body)}),env);assert.equal(response.status,400,`${action}/${suffix}`);
 }assert.equal(accesses,0);
});
