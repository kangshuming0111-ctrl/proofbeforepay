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
import {CAPACITY_STEP_IDS,CAPACITY_SLOTS} from "../lib/runtime-capacity.ts";

const root=fileURLToPath(new URL("../",import.meta.url));
let scratch:string,sqlite:DatabaseSync,server:Server,origin:string;
const requests:{path:string;method:string;headers:Record<string,string|string[]|undefined>}[]=[];
before(async()=>{
  scratch=mkdtempSync(path.join(tmpdir(),"pbp-guest-capacity-"));
  const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve("wrangler/package.json"))("esbuild"),outfile=path.join(scratch,"worker.mjs");
  await esbuild.build({entryPoints:[path.join(root,"app/guest-lab/server.ts")],bundle:true,platform:"node",format:"esm",target:"node22",outfile,logLevel:"silent",plugins:[{name:"empty-public-assets",setup(build:{onResolve:(options:unknown,callback:()=>unknown)=>void;onLoad:(options:unknown,callback:()=>unknown)=>void}){build.onResolve({filter:/^pbp-guest-assets$/},()=>({path:"assets",namespace:"guest"}));build.onLoad({filter:/.*/,namespace:"guest"},()=>({contents:"export default {}",loader:"js"}));}}]});
  const worker=(await import(pathToFileURL(outfile).href)).default as{fetch(request:Request,env:Record<string,unknown>):Promise<Response>};
  sqlite=new DatabaseSync(":memory:");
  for(const file of["tests/fixtures/booking-backend/drizzle/0000_booking_lab.sql","tests/fixtures/booking-backend/drizzle/0001_booking_policy_lab.sql","examples/seller-capacity-staging/migrations/0001_capacity.sql"])sqlite.exec(readFileSync(path.join(root,file),"utf8"));
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
function capacityPlan(){const source="Each booking accepts at most 6 people.",capacity="Each time slot accepts at most 8 guests in total.",first={start:0,end:source.length,excerpt:source},second={start:source.length+1,end:source.length+1+capacity.length,excerpt:capacity};return validateRuntimePlan({protocol:"booking-http-v3",criterionId:"booking",source:first,policy:suggestBookingPolicy(first),slotCapacity:{criterionId:"slot-capacity",...suggestSlotCapacity(second)}});}
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
