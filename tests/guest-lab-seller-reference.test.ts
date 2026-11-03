import assert from "node:assert/strict";
import test,{before,after} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,rmSync,copyFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url)),origin="https://reference.example",main="https://briefpay-kang-lab.blueheron8.chatgpt.site";
let scratch:string,output:string,db:DatabaseSync,worker:{fetch(request:Request,env:Record<string,unknown>):Promise<Response>},binding:unknown;
before(async()=>{
 scratch=mkdtempSync(path.join(tmpdir(),"pbp-seller-reference-"));output=path.join(scratch,"bundle");
 execFileSync(process.execPath,["scripts/build-verification-lab.mjs","--output",output],{cwd:root,stdio:"pipe",timeout:120000});
 const file=path.join(scratch,"worker.mjs");copyFileSync(path.join(output,"worker/index.js"),file);worker=(await import(pathToFileURL(file).href)).default;
 db=new DatabaseSync(":memory:");db.exec(readFileSync(path.join(root,"examples/seller-lifecycle-staging/migrations/0001_lifecycle.sql"),"utf8"));
 binding={prepare(sql:string){const statement=db.prepare(sql);return{bind(...args:(string|number|null)[]){return{async first(){return statement.get(...args)??null;},async all(){return{success:true,results:statement.all(...args)};},async run(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}};}};}};}};
});
after(()=>{db?.close();if(scratch)rmSync(scratch,{recursive:true,force:true});});
const get=(route:string,extra:Record<string,unknown>={})=>worker.fetch(new Request(origin+route),{DB:binding,...extra});
test("bundled seller reference preserves independently authored bytes for four pinned profiles, correct JS MIME and narrow frame CSP",async()=>{
 for(const profile of["fixed","cancel-credit","move-loss","retry-duplicate"]){
  for(const name of["index.html","seller.css","seller.mjs","bridge.mjs","config.mjs","runtime-config.mjs"]){
   const route=`/seller-reference/${profile}/${name}`,expected=readFileSync(path.join(root,"examples/seller-lifecycle-staging/frontend",name),"utf8"),response=await get(route);
   assert.equal(response.status,200);assert.equal(await response.text(),expected);assert.equal(readFileSync(path.join(output,"frontend",route),"utf8"),expected);
   assert.match(response.headers.get("content-security-policy")!,new RegExp(`frame-ancestors ${main.replace(/[.]/gu,"\\.")};`));assert.ok(!response.headers.get("content-security-policy")!.includes("127.0.0.1"));assert.equal(response.headers.get("referrer-policy"),"no-referrer");
   if(name.endsWith(".mjs"))assert.equal(response.headers.get("content-type"),"text/javascript; charset=utf-8");
  }
 }
 const health=await(await get("/health")).json()as Record<string,unknown>;
 assert.deepEqual(health.sellerJourneyReference,{protocol:"booking-lifecycle-http-v1",bridge:"pbp-seller-bridge-v1",developerOperated:true,independentSeller:false,syntheticOnly:true,sharesPhysicalLabDatabase:true});
 assert.equal((await get("/seller-reference/unapproved/index.html")).status,404);assert.equal((await get("/seller-reference/fixed/private.json")).status,404);
 const lab=await get("/journeys.html");assert.match(lab.headers.get("content-security-policy")!,/frame-ancestors 'none'/);assert.match(lab.headers.get("content-security-policy")!,/frame-src 'self'/);assert.equal((await get("/api/proofs/private-project")).status,404);
});
test("local parent permission is exclusively operator-controlled and never enabled by query or old truthy values",async()=>{
 const route="/seller-reference/fixed/runtime-config.mjs";
 for(const flag of[undefined,"true","yes","0"]){const response=await get(route,{LAB_ALLOW_LOOPBACK:flag});assert.match(await response.text(),/allowLoopbackParent = false/);assert.ok(!response.headers.get("content-security-policy")!.includes("127.0.0.1"));}
 const query=await get(route+"?LAB_ALLOW_LOOPBACK=1");assert.match(await query.text(),/allowLoopbackParent = false/);assert.ok(!query.headers.get("content-security-policy")!.includes("127.0.0.1"));
 const local=await get(route,{LAB_ALLOW_LOOPBACK:"1"});assert.equal(await local.text(),"export const allowLoopbackParent = true;\n");assert.match(local.headers.get("content-security-policy")!,/http:\/\/127\.0\.0\.1:\*/);
});
test("seller reference path pins each actual native SQL policy and retains post-commit retry counterexamples",async()=>{
 for(const profile of["fixed","cancel-credit","move-loss","retry-duplicate"]){
  const prefix=`/seller-reference/${profile}/pbp/`,meta=await(await get(prefix+"meta")).json()as Record<string,unknown>;assert.equal(meta.revision,`lifecycle-${profile}-v1`);assert.equal(meta.protocol,"booking-lifecycle-http-v1");
  const runId=crypto.randomUUID(),body={testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:"2099-01-01T11:00:00Z",partySize:1};
  const write=()=>worker.fetch(new Request(origin+prefix+"bookings",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","Idempotency-Key":`pbp-${runId}-lifecycle-loss-create`},body:JSON.stringify(body)}),{DB:binding});
  const lost=await write();assert.equal(lost.status,504);assert.deepEqual(await lost.json(),{code:"response_lost_after_commit"});
  const first=(await(await get(prefix+`merchant/${runId}`)).json()as {bookings:{id:string}[]}).bookings;assert.equal(first.length,1);
  const replay=await write();assert.equal(replay.status,200);
  const rows=(await(await get(prefix+`merchant/${runId}`)).json()as {bookings:{id:string}[]}).bookings;assert.equal(rows.length,profile==="retry-duplicate"?2:1);
  assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM seller_lifecycle_bookings WHERE test_run_id=?").get(runId)!.n),rows.length);
  assert.equal((await get(prefix+"meta?profile=fixed")).status,404);
 }
});
test("seller reference write route rejects missing/foreign Origin, credentials and unknown targets before mutation",async()=>{
 const runId=crypto.randomUUID(),body={testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:"2099-01-01T10:00:00Z",partySize:5};
 const snapshot=()=>JSON.stringify(["seller_lifecycle_bookings","seller_lifecycle_operations","seller_lifecycle_cancel_credits"].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())),before=snapshot();
 for(const headers of[{}, {Origin:"https://foreign.example"},{Origin:origin,Authorization:"test"},{Origin:origin,Cookie:"test=1"}]as Record<string,string>[]){
  const response=await worker.fetch(new Request(origin+"/seller-reference/fixed/pbp/bookings",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":`pbp-${runId}-lifecycle-cancel-create`,...headers},body:JSON.stringify(body)}),{DB:binding});assert.equal(response.status,403);
 }
 assert.equal((await worker.fetch(new Request(origin+"/seller-reference/new-policy/pbp/bookings",{method:"POST",body:"{}"}),{DB:binding})).status,404);assert.equal(snapshot(),before);
});
