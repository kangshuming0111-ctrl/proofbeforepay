import assert from "node:assert/strict";
import test,{before,after} from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {createServer,type Server} from "node:http";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {validateRuntimePlan,validateRuntimeReport,type RuntimeCheckReport} from "../lib/runtime-checks.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity} from "../lib/booking-capacity.ts";
import {executeRuntimeCheck} from "../lib/runtime-runner.ts";
import {RUNTIME_TARGETS} from "../lib/runtime-project.ts";
import {CAPACITY_STEP_IDS,CAPACITY_SLOTS,CAPACITY_V4_STEP_IDS,CAPACITY_V4_SLOTS} from "../lib/runtime-capacity.ts";

const root=fileURLToPath(new URL("../",import.meta.url));
let scratch:string,sqlite:DatabaseSync,server:Server,origin:string;
const requests:{path:string;method:string;headers:Record<string,string|string[]|undefined>}[]=[];
before(async()=>{
  scratch=mkdtempSync(path.join(tmpdir(),"pbp-guest-capacity-"));
  const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve("wrangler/package.json"))("esbuild"),outfile=path.join(scratch,"worker.mjs");
  await esbuild.build({entryPoints:[path.join(root,"app/guest-lab/server.ts")],bundle:true,platform:"node",format:"esm",target:"node22",outfile,logLevel:"silent",plugins:[{name:"empty-public-assets",setup(build:{onResolve:(options:unknown,callback:()=>unknown)=>void;onLoad:(options:unknown,callback:()=>unknown)=>void}){build.onResolve({filter:/^pbp-guest-assets$/},()=>({path:"assets",namespace:"guest"}));build.onLoad({filter:/.*/,namespace:"guest"},()=>({contents:"export default {}",loader:"js"}));}}]});
  const worker=(await import(pathToFileURL(outfile).href)).default as{fetch(request:Request,env:Record<string,unknown>):Promise<Response>};
  sqlite=new DatabaseSync(":memory:");
  for(const file of["tests/fixtures/booking-backend/drizzle/0000_booking_lab.sql","tests/fixtures/booking-backend/drizzle/0001_booking_policy_lab.sql","examples/seller-capacity-staging/migrations/0001_capacity.sql","examples/seller-capacity-staging/migrations/0002_capacity_expanded.sql"])sqlite.exec(readFileSync(path.join(root,file),"utf8"));
  const db={prepare(sql:string){const statement=sqlite.prepare(sql);return{bind(...args:(string|number|null)[]){return{async first(){return statement.get(...args)??null;},async all(){return{success:true,results:statement.all(...args)};},async run(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}};}};}};}};
  server=createServer(async(req,res)=>{
    try{
      const parts:Uint8Array[]=[];for await(const chunk of req)parts.push(chunk);const headers=new Headers();
      for(const[key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(","):value);
      requests.push({path:req.url!,method:req.method!,headers:req.headers});
      const request=new Request(`${origin}${req.url}`,{method:req.method,headers,...(parts.length?{body:Buffer.concat(parts)}:{})});
      const result=await worker.fetch(request,{DB:db,LAB_ALLOW_LOOPBACK:"true"});res.statusCode=result.status;result.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await result.arrayBuffer()));
    }catch{res.statusCode=500;res.end("Synthetic local worker failure");}
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("Local test port unavailable");origin=`http://127.0.0.1:${address.port}`;
});
after(async()=>{if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}sqlite?.close();if(scratch)rmSync(scratch,{recursive:true,force:true});});
function capacityPlan(protocol:"booking-http-v3"|"booking-http-v4"="booking-http-v3"){const source="Each booking accepts at most 6 people.",capacity="Each time slot accepts at most 8 guests in total.",first={start:0,end:source.length,excerpt:source},second={start:source.length+1,end:source.length+1+capacity.length,excerpt:capacity};return validateRuntimePlan({protocol,criterionId:"booking",source:first,policy:suggestBookingPolicy(first),slotCapacity:{criterionId:"slot-capacity",...suggestSlotCapacity(second)}});}
function post(value:unknown,withOrigin=true){return fetch(`${origin}/api/lab-check`,{method:"POST",headers:{"Content-Type":"application/json",...(withOrigin?{Origin:origin}:{})},body:JSON.stringify(value)});}

test("guest lab v3 actually runs native SQL via loopback HTTP and independently validates both reports",async()=>{
  for(const scenario of["flawed","fixed"] as const){
    const offset=requests.length,response=await post({scenario,consent:true,protocol:"booking-http-v3",maxPartySize:6,maxGuestsPerSlot:8});assert.equal(response.status,200);
    const report=await response.json() as RuntimeCheckReport,plan=capacityPlan();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`controlled-fixture:booking-http-v3:${scenario}`)))).map(n=>n.toString(16).padStart(2,"0")).join("");
    const target={id:`lab-capacity-${scenario}`,label:`Controlled native ${scenario} capacity fixture`,baseUrl:`${origin}/test-api/capacity-${scenario}/`,revision:`capacity-${scenario==="flawed"?"overbook":"fixed"}-v1`};
    assert.deepEqual(validateRuntimeReport(report,{deliveryId:`lab-${scenario}-${report.runId}`,deliveryDigest:digest,runId:report.runId,plan,target}),report);
    assert.deepEqual(report.steps.map(row=>row.id),[...CAPACITY_STEP_IDS]);assert.equal(report.plan.protocol,"booking-http-v3");assert.equal(report.method,"server-booking-http-v3");
    const backend=requests.slice(offset).filter(row=>row.path.startsWith("/test-api/"));assert.equal(backend.length,scenario==="fixed"?17:9);
    for(const row of backend){assert.ok(row.path.startsWith(`/test-api/capacity-${scenario}/`));assert.equal(row.headers.authorization,undefined);assert.equal(row.headers.cookie,undefined);assert.equal(row.headers.origin,undefined);}
    const aggregate=report.steps.find(row=>row.id==="slot_a_after_race")!,stored=sqlite.prepare("SELECT SUM(party_size) guestCount,COUNT(*) bookings FROM seller_capacity_receipts WHERE test_run_id=? AND slot=?").get(report.runId,CAPACITY_SLOTS.a)!;
    if(scenario==="flawed"){
      assert.deepEqual(report.summary,{steps:17,observed:6,issues:3,unavailable:8});assert.equal(stored.guestCount,10);assert.equal(stored.bookings,2);assert.match(aggregate.actual!,/"guestCount":10/u);
      assert.deepEqual(report.steps.filter(row=>row.id.startsWith("capacity_race_")).map(row=>row.status),[201,201]);
    }else{
      assert.deepEqual(report.summary,{steps:17,observed:17,issues:0,unavailable:0});assert.equal(stored.guestCount,8);assert.equal(stored.bookings,2);
      assert.deepEqual(report.steps.filter(row=>row.id.startsWith("capacity_race_")).map(row=>row.status).sort(),[201,409]);
      assert.equal(report.steps.find(row=>row.id==="slot_a_after_rejection")!.outcome,"observed");
    }
    for(const change of[(copy:RuntimeCheckReport)=>{copy.deliveryDigest="f".repeat(64);},(copy:RuntimeCheckReport)=>{copy.target.revision="another-build";},(copy:RuntimeCheckReport)=>{copy.steps.pop();},(copy:RuntimeCheckReport)=>{if(copy.plan.protocol==="booking-http-v3")copy.plan.slotCapacity.maxGuestsPerSlot=9;}]){const copy=structuredClone(report);change(copy);assert.throws(()=>validateRuntimeReport(copy,{deliveryId:`lab-${scenario}-${report.runId}`,deliveryDigest:digest,plan,target}));}
  }
});
test("guest API rejects absent consent, altered capacity, caller target URLs and cross-origin before writes",async()=>{
  const before=sqlite.prepare("SELECT COUNT(*) n FROM seller_capacity_receipts").get()!.n,offset=requests.length;
  const base={scenario:"fixed",consent:true,protocol:"booking-http-v3",maxPartySize:6,maxGuestsPerSlot:8};
  for(const value of[{...base,consent:false},{...base,maxGuestsPerSlot:9},{...base,maxPartySize:7},{...base,maxGuestsPerSlot:"8"},{...base,target:"https://private.example.org/"},{...base,protocol:"booking-http-v2"},{...base,protocol:"booking-http-v1"}])assert.equal((await post(value)).status,400);
  assert.equal((await post(base,false)).status,403);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_capacity_receipts").get()!.n,before);
  assert.equal(requests.slice(offset).filter(row=>row.path.startsWith("/test-api/")).length,0);assert.equal((await fetch(`${origin}/api/proofs/private-project`)).status,404);
});
test("legacy v1 default and explicit v2 remain independently runnable with their original8/18step scopes",async()=>{
  for(const[value,steps,protocol]of[[{scenario:"fixed",consent:true},8,"booking-http-v1"],[{scenario:"fixed",consent:true,protocol:"booking-http-v2",maxPartySize:6},18,"booking-http-v2"]] as const){
    const response=await post(value);assert.equal(response.status,200);const report=await response.json() as RuntimeCheckReport;
    assert.equal(report.plan.protocol,protocol);assert.equal(report.summary.steps,steps);assert.equal(report.summary.observed,steps);assert.equal(report.summary.issues,0);
  }
});

test("guest v4 route validates native metadata and exact fixture fingerprint, detects real invalid-email storage, and completes the fixed31-step flow",async context=>{
  for(const scenario of["flawed","fixed"]as const){
    const variant=scenario==="flawed"?"validation-gap":"fixed",baseUrl=`${origin}/test-api/coverage-${variant}/`;
    const metaResponse=await fetch(`${baseUrl}meta`);assert.equal(metaResponse.status,200);const meta=await metaResponse.json()as Record<string,unknown>;
    assert.equal(meta.protocol,"booking-http-v4");assert.equal(meta.revision,`coverage-${variant}-v1`);
    assert.equal(meta.projectId,"lab-combined-reference");assert.equal(meta.registrationRevision,"combined-reference-v1");assert.equal(meta.frontendBundleDigest,"0".repeat(64));assert.equal(meta.deploymentAttestation,false);
    const offset=requests.length,response=await post({scenario,consent:true,protocol:"booking-http-v4",maxPartySize:6,maxGuestsPerSlot:8});assert.equal(response.status,200);
    const report=await response.json()as RuntimeCheckReport,plan=capacityPlan("booking-http-v4");
    // This fingerprint binds the declared controlled fixture identity; it is
    // deliberately not represented as the hash of uploaded frontend bytes.
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`controlled-fixture:booking-http-v4:${scenario}`)))).map(n=>n.toString(16).padStart(2,"0")).join("");
    const target={id:`lab-coverage-${variant}`,label:`Controlled combined ${variant} booking fixture`,baseUrl,revision:`coverage-${variant}-v1`};
    const expected={deliveryId:`lab-${scenario}-${report.runId}`,deliveryDigest:digest,runId:report.runId,plan,target};
    assert.deepEqual(validateRuntimeReport(report,expected),report);assert.equal(report.method,"server-booking-http-v4");assert.equal(report.plan.protocol,"booking-http-v4");
    assert.deepEqual(report.steps.map(row=>row.id),[...CAPACITY_V4_STEP_IDS]);assert.equal(report.target.revision,meta.revision);assert.equal(report.target.origin,origin);assert.equal(report.target.registration,undefined);
    const backend=requests.slice(offset).filter(row=>row.path.startsWith("/test-api/"));assert.equal(backend.length,scenario==="fixed"?31:8);
    for(const row of backend){assert.ok(row.path.startsWith(`/test-api/coverage-${variant}/`));assert.equal(row.headers.authorization,undefined);assert.equal(row.headers.cookie,undefined);assert.equal(row.headers.origin,undefined);}
    const rows=sqlite.prepare("SELECT id,email,slot,party_size,protocol,validation_profile,manifest_namespace FROM seller_capacity_expanded_receipts WHERE test_run_id=? ORDER BY slot,party_size").all(report.runId);
    assert.ok(rows.every(row=>row.protocol==="booking-http-v4"&&String(row.manifest_namespace).endsWith(`:booking-http-v4:${scenario==="flawed"?"email-gap":"strict"}`)));
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_capacity_receipts WHERE test_run_id=?").get(report.runId)!.n,0);
    if(scenario==="flawed"){
      assert.deepEqual(report.summary,{steps:31,observed:6,issues:2,unavailable:23});assert.equal(rows.length,1);assert.equal(rows[0].email,"not-an-email");assert.equal(rows[0].slot,CAPACITY_SLOTS.a);assert.equal(rows[0].party_size,1);
      assert.equal(report.steps.find(row=>row.id==="invalid_email")!.status,201);assert.equal(report.steps.find(row=>row.id==="invalid_email")!.outcome,"mismatch");
      assert.equal(report.steps.find(row=>row.id==="slot_a_initial")!.outcome,"mismatch");assert.match(report.steps.find(row=>row.id==="slot_a_initial")!.actual!,/"guestCount":1/u);
      assert.equal(backend.filter(row=>row.method==="GET").length,2);assert.equal(backend.filter(row=>row.method==="POST").length,6);assert.equal(backend.at(-1)!.path,`/test-api/coverage-validation-gap/occupancy/${report.runId}/a`);
      assert.ok(report.steps.filter(row=>row.outcome==="unavailable").every(row=>row.reason==="initial_slot_not_empty_or_unavailable"));
    }else{
      assert.deepEqual(report.summary,{steps:31,observed:31,issues:0,unavailable:0});assert.equal(rows.length,6);assert.equal(new Set(rows.map(row=>row.id)).size,6);assert.ok(rows.every(row=>row.email==="pbp-test@example.invalid"));
      for(const[slot,parties]of[[CAPACITY_SLOTS.a,[3,5]],[CAPACITY_SLOTS.b,[6]],[CAPACITY_V4_SLOTS.c,[1]],[CAPACITY_V4_SLOTS.d,[1]],[CAPACITY_V4_SLOTS.e,[5]]]as const)assert.deepEqual(rows.filter(row=>row.slot===slot).map(row=>row.party_size),parties);
      assert.equal(backend.filter(row=>row.method==="GET").length,13);assert.equal(backend.filter(row=>row.method==="POST").length,18);
      assert.equal(backend.filter(row=>row.headers["idempotency-key"]===`pbp-${report.runId}-capacity-same-key`).length,2);
      assert.deepEqual(report.steps.filter(row=>row.id==="same_key_first"||row.id==="same_key_second").map(row=>row.status).sort(),[200,201]);
      const lastPost=backend.findLastIndex(row=>row.method==="POST");for(const row of backend.filter(row=>row.method==="GET"&&/\/bookings\//u.test(row.path)))assert.ok(backend.indexOf(row)>lastPost);
    }
    for(const change of[
      (copy:RuntimeCheckReport)=>{copy.deliveryDigest="f".repeat(64);},(copy:RuntimeCheckReport)=>{copy.target.revision="different-build";},
      (copy:RuntimeCheckReport)=>{copy.target.id="lab-coverage-another";},(copy:RuntimeCheckReport)=>{copy.target.origin="https://different.example.org";},
      (copy:RuntimeCheckReport)=>{copy.steps.pop();},(copy:RuntimeCheckReport)=>{copy.runId=crypto.randomUUID();},
      (copy:RuntimeCheckReport)=>{if(copy.plan.protocol==="booking-http-v4")copy.plan.policy.maxPartySize=7;},
      (copy:RuntimeCheckReport)=>{if(copy.plan.protocol==="booking-http-v4")copy.plan.slotCapacity.maxGuestsPerSlot=9;},
    ]){const tampered=structuredClone(report);change(tampered);assert.throws(()=>validateRuntimeReport(tampered,expected));}
    context.diagnostic(JSON.stringify({kind:"guest-native-v4-http",scenario,targetId:target.id,summary:report.summary,backendRequests:backend.length,actualRows:rows.length,actualInvalidEmailRows:rows.filter(row=>row.email==="not-an-email").length,reportSchemaValid:true,scope:"bundled guest route + owned loopback HTTP + actual local SQLite; no remote deployment or frontend attestation"}));
  }
});

test("guest v4 native overbook prefix matches the configured target and independently exposes actual10 guests",async()=>{
  const configured=RUNTIME_TARGETS.find(row=>row.id==="lab-coverage-overbook")!;assert.ok(configured);assert.equal(configured.protocol,"booking-http-v4");
  const target={...configured,baseUrl:`${origin}${new URL(configured.baseUrl).pathname}`},runId=crypto.randomUUID();
  const metaResponse=await fetch(`${target.baseUrl}meta`);assert.equal(metaResponse.status,200);const meta=await metaResponse.json()as Record<string,unknown>;assert.equal(meta.protocol,target.protocol);assert.equal(meta.revision,target.revision);
  const offset=requests.length,input={deliveryId:"guest-native-overbook",deliveryDigest:"0".repeat(64),runId,plan:capacityPlan("booking-http-v4"),target};
  const report=await executeRuntimeCheck(input,{allowLoopback:true});assert.deepEqual(validateRuntimeReport(report,input),report);assert.deepEqual(report.summary,{steps:31,observed:19,issues:3,unavailable:9});
  const stored=sqlite.prepare("SELECT COUNT(*) n,SUM(party_size) guests FROM seller_capacity_expanded_receipts WHERE test_run_id=? AND slot=?").get(runId,CAPACITY_SLOTS.a)!;assert.equal(stored.n,2);assert.equal(stored.guests,10);
  assert.match(report.steps.find(row=>row.id==="slot_a_after_race")!.actual!,/"guestCount":10/u);assert.equal(requests.slice(offset).filter(row=>row.path.startsWith("/test-api/coverage-overbook/")).length,22);
});

test("guest v4 rejects changed limits, unknown caller target/profile fields and foreign origin without backend requests or native writes",async()=>{
  const before=sqlite.prepare("SELECT COUNT(*) n FROM seller_capacity_expanded_receipts").get()!.n,legacyBefore=sqlite.prepare("SELECT COUNT(*) n FROM seller_capacity_receipts").get()!.n,offset=requests.length;
  const base={scenario:"fixed",consent:true,protocol:"booking-http-v4",maxPartySize:6,maxGuestsPerSlot:8};
  for(const value of[{...base,maxPartySize:5},{...base,maxPartySize:7},{...base,maxPartySize:"6"},{...base,maxGuestsPerSlot:7},{...base,maxGuestsPerSlot:9},{...base,maxGuestsPerSlot:"8"},
    {...base,consent:false},{...base,target:"https://caller.example.org/"},{...base,validationProfile:"email-gap"},{...base,scenario:"validation-gap"}]){
    const rejected=await post(value);assert.equal(rejected.status,400);
    if("target"in value||"validationProfile"in value)assert.equal((await rejected.json()as Record<string,unknown>).error,"Confirm synthetic writes and choose a controlled scenario");
  }
  const absentOrigin=await post(base,false);assert.equal(absentOrigin.status,403);assert.equal((await absentOrigin.json()as Record<string,unknown>).error,"Same-origin request required");
  const foreign=await fetch(`${origin}/api/lab-check`,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://foreign.example.org"},body:JSON.stringify(base)});
  assert.equal(foreign.status,403);assert.equal((await foreign.json()as Record<string,unknown>).error,"Same-origin request required");
  // The same malformed body distinguishes the origin guard's precedence from
  // JSON parsing: foreign requests stop at403, same-origin content reaches400.
  for(const[requestOrigin,status,message]of[["https://foreign.example.org",403,"Same-origin request required"],[origin,400,"Send a bounded JSON test consent"]]as const){
    const rejected=await fetch(`${origin}/api/lab-check`,{method:"POST",headers:{"Content-Type":"application/json",Origin:requestOrigin},body:"{"});
    assert.equal(rejected.status,status);assert.equal((await rejected.json()as Record<string,unknown>).error,message);
  }
  assert.equal((await fetch(`${origin}/api/lab-check`)).status,405);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_capacity_expanded_receipts").get()!.n,before);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM seller_capacity_receipts").get()!.n,legacyBefore);
  assert.equal(requests.slice(offset).filter(row=>row.path.startsWith("/test-api/")).length,0);
});
