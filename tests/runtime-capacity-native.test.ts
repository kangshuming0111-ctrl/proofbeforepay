import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleCapacityRequest} from "../examples/seller-capacity-staging/worker/capacity-service.mjs";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity,validateBookingCapacityPlan} from "../lib/booking-capacity.ts";
import {executeRuntimeCheck} from "../lib/runtime-runner.ts";
import {validateRuntimeReport,type RuntimeCheckTarget} from "../lib/runtime-checks.ts";

const schema=readFileSync(new URL("../examples/seller-capacity-staging/migrations/0001_capacity.sql",import.meta.url),"utf8");
const party="Each booking accepts at most 6 people.",capacity="Each time slot accepts at most 8 guests in total.";
const partySource={start:0,end:party.length,excerpt:party},slotSource={start:party.length+1,end:party.length+1+capacity.length,excerpt:capacity};
const plan=validateBookingCapacityPlan({protocol:"booking-http-v3",criterionId:"coverage-party",source:partySource,policy:suggestBookingPolicy(partySource),slotCapacity:{criterionId:"coverage-slot",...suggestSlotCapacity(slotSource)}});
const slotA="2099-01-01T10:00:00Z",slotB="2099-01-01T11:00:00Z";

function d1(sqlite:DatabaseSync){return{prepare(sql:string){const statement=sqlite.prepare(sql);return{bind(...args:(string|number|null)[]){return{
  async first(){return statement.get(...args)??null;},async all(){return{success:true,results:statement.all(...args)};},async run(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}};},
};}};}};}

for(const policyId of["fixed","overbook","underlimit"]as const)test(`owned HTTP + native SQL capacity reference: ${policyId}`,async context=>{
  const sqlite=new DatabaseSync(":memory:");
  for(const chunk of schema.split(/^--> statement-breakpoint\s*$/mu).map(value=>value.trim()).filter(Boolean))sqlite.exec(chunk);
  const revision=`capacity-native-${policyId}`,runId=crypto.randomUUID();
  const env={CAPACITY_DB:d1(sqlite),CAPACITY_PROJECT_ID:"native-http-project",CAPACITY_REGISTRATION_REVISION:"native-review-1",CAPACITY_DEPLOYMENT_REVISION:revision,CAPACITY_FRONTEND_BUNDLE_DIGEST:"a".repeat(64),CAPACITY_POLICY_ID:policyId};
  const trace:{method:string;path:string;slot?:string;key?:string;status:number}[]=[];
  // This is an owned ephemeral loopback transport, not an external seller or
  // hosted-D1 claim. The request reaches the actual service and native SQL.
  const server=createServer(async(request,response)=>{
    try{
      const headers=new Headers();for(const[name,value]of Object.entries(request.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(","):value);
      assert.equal(headers.has("authorization"),false);assert.equal(headers.has("cookie"),false);assert.equal(headers.has("origin"),false);
      const buffers:Buffer[]=[];let size=0;for await(const chunk of request){size+=chunk.length;assert.ok(size<=4096);buffers.push(Buffer.from(chunk));}
      const body=buffers.length?Buffer.concat(buffers).toString("utf8"):undefined;
      const path=request.url!,entry={method:request.method!,path,...(body?{slot:JSON.parse(body).slot as string}:{}),...(headers.has("idempotency-key")?{key:headers.get("idempotency-key")!}:{}),status:0};trace.push(entry);
      const result=await handleCapacityRequest(new Request(new URL(path,"http://127.0.0.1"),{method:request.method,headers,...(body?{body}:{})}),env);
      entry.status=result.status;response.statusCode=result.status;result.headers.forEach((value,name)=>response.setHeader(name,value));response.end(Buffer.from(await result.arrayBuffer()));
    }catch{response.statusCode=500;response.setHeader("Content-Type","application/json");response.end(JSON.stringify({code:"synthetic_transport_error"}));}
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const port=(server.address()as AddressInfo).port,target:RuntimeCheckTarget={id:`native-capacity-${policyId}`,label:"Owned native SQL reference",baseUrl:`http://127.0.0.1:${port}/pbp/`,revision,protocol:"booking-http-v3",testOnly:true};
    const input={deliveryId:"native-capacity-delivery",deliveryDigest:"a".repeat(64),runId,plan,target};
    const report=await executeRuntimeCheck(input,{allowLoopback:true});
    assert.deepEqual(validateRuntimeReport(report,input),report);
    assert.equal(report.plan.protocol,"booking-http-v3");assert.deepEqual(report.plan,plan);assert.equal(plan.policy.maxPartySize,6);assert.equal(plan.slotCapacity.maxGuestsPerSlot,8);
    assert.ok(trace.length<=17);assert.equal(trace[0].method,"GET");assert.equal(trace[0].path,"/pbp/meta");
    const rows=sqlite.prepare("SELECT id,slot,party_size FROM seller_capacity_receipts ORDER BY slot,party_size").all();
    const aRows=rows.filter(row=>row.slot===slotA),bRows=rows.filter(row=>row.slot===slotB);
    const aSum=aRows.reduce((sum,row)=>sum+Number(row.party_size),0);
    if(policyId==="fixed"){
      assert.deepEqual(report.summary,{steps:17,observed:17,issues:0,unavailable:0});assert.equal(trace.length,17);
      assert.equal(rows.length,3);assert.deepEqual(aRows.map(row=>row.party_size),[3,5]);assert.deepEqual(bRows.map(row=>row.party_size),[6]);assert.equal(aSum,8);
      const slotBWrite=trace.findIndex(row=>row.method==="POST"&&row.slot===slotB);assert.ok(slotBWrite>=0);
      for(const row of aRows)assert.ok(trace.findIndex(call=>call.method==="GET"&&call.path===`/pbp/bookings/${row.id}`)>slotBWrite);
      assert.equal(trace.at(-1)!.path,`/pbp/occupancy/${runId}/a`);
      for(const id of["race_winner_readback","fill_readback","slot_a_after_rejection"])assert.equal(report.steps.find(row=>row.id===id)!.outcome,"observed");
    }else if(policyId==="overbook"){
      assert.ok(report.summary.issues>0);assert.notEqual(report.summary.observed,17);
      assert.equal(aRows.length,2);assert.deepEqual(aRows.map(row=>row.party_size),[5,5]);assert.equal(new Set(aRows.map(row=>row.id)).size,2);assert.equal(aSum,10);
      for(const id of["capacity_race_first","capacity_race_second"]){const step=report.steps.find(row=>row.id===id)!;assert.equal(step.status,201);assert.equal(step.outcome,"mismatch");}
    }else{
      assert.ok(report.summary.issues>0);assert.equal(report.steps.find(row=>row.id==="fill_remainder")!.status,409);assert.equal(report.steps.find(row=>row.id==="fill_remainder")!.outcome,"mismatch");
      assert.deepEqual(aRows.map(row=>row.party_size),[5]);assert.equal(aSum,5);assert.equal(sqlite.prepare("SELECT max_guests_per_slot FROM seller_capacity_policy WHERE policy_id='underlimit'").get()!.max_guests_per_slot,7);
    }
    context.diagnostic(JSON.stringify({kind:"native-capacity-http-evidence",policyId,requests:trace.length,reportSummary:report.summary,lockedBuyerPartyMaximum:6,lockedBuyerSlotCapacity:8,nativeRows:rows.length,slotAGuests:aSum,slotAParties:aRows.map(row=>row.party_size),slotBParties:bRows.map(row=>row.party_size),network:"owned loopback only",externalProviders:0,deployment:"none",databaseAttestation:"not claimed"}));
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));sqlite.close();}
});
