import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleCapacityRequest} from "../examples/seller-capacity-staging/worker/capacity-service.mjs";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity,validateBookingCapacityPlan} from "../lib/booking-capacity.ts";
import {CAPACITY_EXECUTION_ORDER,CAPACITY_SLOTS,CAPACITY_STEP_IDS,executeRuntimeCapacityCheck,inspectCapacityOccupancy,runtimeCapacityStepDefinitions,type RuntimeCapacityInput,type RuntimeCapacityReport} from "../lib/runtime-capacity.ts";

function input():RuntimeCapacityInput{
  const party="Each booking accepts at most 6 people.",capacity="Each time slot accepts at most 8 guests in total.";
  const source={start:0,end:party.length,excerpt:party},slotSource={start:party.length+1,end:party.length+1+capacity.length,excerpt:capacity};
  return{deliveryId:"capacity-delivery",deliveryDigest:"c".repeat(64),runId:crypto.randomUUID(),
    plan:validateBookingCapacityPlan({protocol:"booking-http-v3",criterionId:"coverage-party",source,policy:suggestBookingPolicy(source),slotCapacity:{criterionId:"coverage-slot",...suggestSlotCapacity(slotSource)}}),
    target:{id:"capacity-staging",label:"Synthetic capacity staging",baseUrl:"https://capacity.example.org/pbp/",revision:"capacity-native-v1",protocol:"booking-http-v3",testOnly:true}};
}
type Fault="none"|"overbook_race"|"replay_consumes_again"|"global_slot_limit"|"slot_b_deletes_a"|"global_last_get"|"unavailable_peer";
type Row={id:string;testRunId:string;marker:string;customer:string;email:string;slot:string;partySize:number;revision:string};
function backend(run:RuntimeCapacityInput,options:{fault?:Fault;capacity?:number;partyMaximum?:number;reverseWinner?:boolean}={}){
  const fault=options.fault??"none",nativeCapacity=options.capacity??8,nativePartyMaximum=options.partyMaximum??6;
  const rows=new Map<string,Row>(),byKey=new Map<string,Row>(),calls:{url:string;init:RequestInit;body?:Row;key?:string}[]=[];
  let sequence=0,last:Row|undefined,raceStarted=0;const raceWaiters:(()=>void)[]=[];
  const occupancy=(slot:string)=>[...rows.values()].filter(row=>row.testRunId===run.runId&&row.slot===slot);
  const count=(slot:string)=>occupancy(slot).reduce((sum,row)=>sum+row.partySize,0);
  const fetcher=async(url:string,init:RequestInit):Promise<Response>=>{
    const path=new URL(url).pathname.replace("/pbp/",""),key=(init.headers as Record<string,string>)["Idempotency-Key"];
    const body=typeof init.body==="string"?JSON.parse(init.body) as Row:undefined;calls.push({url,init,...(body?{body}:{}),...(key?{key}:{})});
    if(path==="meta")return Response.json({protocol:"booking-http-v3",revision:run.target.revision,operatorSecret:"must not enter saved report"});
    if(path.startsWith("occupancy/")){
      const[,runId,which]=path.split("/"),slot=which==="a"?CAPACITY_SLOTS.a:CAPACITY_SLOTS.b;
      return Response.json({testRunId:runId,slot,revision:run.target.revision,guestCount:count(slot),bookingIds:occupancy(slot).map(row=>row.id).reverse()});
    }
    if(init.method==="GET"){
      const row=fault==="global_last_get"?last:rows.get(path.split("/").at(-1)!);
      return row?Response.json({...row,privateDiagnostic:"must not enter saved report"}):Response.json({code:"not_found"},{status:404});
    }
    assert.ok(body&&key);
    if(!Number.isInteger(body.partySize)||body.partySize<1)return Response.json({code:"party_size_invalid"},{status:422});
    if(body.partySize>nativePartyMaximum)return Response.json({code:"party_size_exceeded"},{status:422});
    const saved=byKey.get(key);
    if(saved){
      if(fault==="replay_consumes_again"&&key.includes("-capacity-race-")){
        const duplicate={...saved,id:`receipt-${++sequence}`};rows.set(duplicate.id,duplicate);
      }
      return body.partySize===saved.partySize&&body.slot===saved.slot?Response.json(saved):Response.json({code:"idempotency_conflict"},{status:409});
    }
    const isRace=key.includes("-capacity-race-");
    if(isRace){
      raceStarted++;await new Promise<void>(resolve=>{raceWaiters.push(resolve);if(raceWaiters.length===2){for(const wake of options.reverseWinner?[...raceWaiters].reverse():raceWaiters)wake();}});
      if(options.reverseWinner&&key.endsWith("race-a"))await Promise.resolve();
      if(fault==="unavailable_peer"&&key.endsWith("race-b"))throw new Error("synthetic peer unavailable");
    }
    const occupied=fault==="global_slot_limit"?[...rows.values()].reduce((sum,row)=>sum+row.partySize,0):count(body.slot);
    if(!(fault==="overbook_race"&&isRace)&&occupied+body.partySize>nativeCapacity)return Response.json({code:"slot_capacity_exceeded"},{status:409});
    if(fault==="slot_b_deletes_a"&&body.slot===CAPACITY_SLOTS.b)for(const[id,row]of rows)if(row.slot===CAPACITY_SLOTS.a)rows.delete(id);
    const row={...body,id:`receipt-${++sequence}`,revision:run.target.revision};rows.set(row.id,row);byKey.set(key,row);last=row;
    return Response.json(row,{status:201});
  };
  return{fetcher,calls,rows,get raceStarted(){return raceStarted;},seed(slot:string,partySize:number){const row={id:`seed-${++sequence}`,testRunId:run.runId,marker:`PBP-${run.runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize,revision:run.target.revision};rows.set(row.id,row);}};
}
const step=(report:RuntimeCapacityReport,id:string)=>report.steps.find(row=>row.id===id)!;

test("the explicit capacity recipe runs17 real interface observations with two simultaneous distinct-key contenders",async()=>{
  const run=input(),before=structuredClone(run),state=backend(run),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.deepEqual(report.summary,{steps:17,observed:17,issues:0,unavailable:0});assert.equal(state.calls.length,17);assert.equal(state.raceStarted,2);assert.deepEqual(run,before);
  assert.deepEqual(report.steps.map(row=>row.id),[...CAPACITY_STEP_IDS]);assert.equal(new Set(CAPACITY_EXECUTION_ORDER).size,17);
  assert.deepEqual(runtimeCapacityStepDefinitions(run.plan).map(row=>row.id),[...CAPACITY_STEP_IDS]);
  const race=state.calls.filter(call=>call.key?.includes("-capacity-race-"));assert.equal(race.length,3);assert.notEqual(race[0].key,race[1].key);assert.equal(race[2].key,race[0].key);
  assert.deepEqual([step(report,"capacity_race_first").status,step(report,"capacity_race_second").status],[201,409]);
  assert.equal(step(report,"reject_extra").status,409);assert.equal(state.rows.size,3);
  for(const call of state.calls){assert.equal(call.init.redirect,"manual");assert.equal(call.init.credentials,"omit");assert.equal(call.init.cache,"no-store");assert.ok(!/authorization|cookie|origin/iu.test(JSON.stringify(call.init.headers)));if(call.init.method==="GET"){assert.equal(call.init.body,undefined);assert.equal(new URL(call.url).search,"");}}
  const slotBWrite=state.calls.findIndex(call=>call.body?.slot===CAPACITY_SLOTS.b),lateAReads=state.calls.filter(call=>call.init.method==="GET"&&/bookings\/receipt-[12]$/u.test(call.url));
  assert.equal(lateAReads.length,2);for(const call of lateAReads)assert.ok(state.calls.indexOf(call)>slotBWrite);
  assert.ok(state.calls.at(-1)!.url.endsWith(`/occupancy/${run.runId}/a`));assert.ok(!JSON.stringify(report).includes("privateDiagnostic"));assert.ok(!JSON.stringify(report).includes("operatorSecret"));
});
test("either distinct-key contender may win and replay uses the actual winning key",async()=>{
  const run=input(),state=backend(run,{reverseWinner:true}),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.deepEqual(report.summary,{steps:17,observed:17,issues:0,unavailable:0});
  assert.deepEqual([step(report,"capacity_race_first").status,step(report,"capacity_race_second").status],[409,201]);
  const replay=state.calls.filter(call=>call.key?.endsWith("race-b"));assert.equal(replay.length,2);assert.equal(step(report,"race_winner_replay").status,200);
});
test("two individually valid contenders both accepted is a race failure, not a passing capacity check",async()=>{
  const run=input(),state=backend(run,{fault:"overbook_race"}),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  for(const id of["capacity_race_first","capacity_race_second"]){assert.equal(step(report,id).status,201);assert.equal(step(report,id).outcome,"mismatch");}
  const aggregate=step(report,"slot_a_after_race");assert.equal(aggregate.status,200);assert.equal(aggregate.outcome,"mismatch");assert.match(aggregate.actual!,/"guestCount":10/u);
  const recorded=JSON.parse(aggregate.actual!.slice(aggregate.actual!.indexOf("{")));assert.equal(recorded.bookingIds.length,2);
  assert.equal(step(report,"race_winner_replay").outcome,"unavailable");assert.equal(step(report,"race_winner_replay").reason,"race_not_verified");assert.equal(step(report,"race_winner_readback").reason,"race_not_verified");
  assert.equal(state.calls.filter(call=>call.key?.includes("-capacity-race-")).length,2);assert.deepEqual(report.summary,{steps:17,observed:6,issues:3,unavailable:8});assert.equal(state.calls.length,9);
});
test("native slot capacities7 and9 both disagree with the buyer's independently locked total8",async()=>{
  for(const capacity of[7,9]){const run=input(),state=backend(run,{capacity}),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
    assert.equal(report.plan.slotCapacity.maxGuestsPerSlot,8);assert.ok(report.summary.issues>0);
    if(capacity===7){assert.equal(step(report,"fill_remainder").status,409);assert.equal(step(report,"fill_remainder").outcome,"mismatch");assert.equal(step(report,"reject_extra").reason,"fill_not_verified");}
    else{assert.equal(step(report,"reject_extra").status,201);assert.equal(step(report,"reject_extra").outcome,"mismatch");assert.equal(step(report,"slot_a_after_rejection").outcome,"mismatch");}
  }
});
test("winner replay must not consume capacity a second time",async()=>{
  const run=input(),state=backend(run,{fault:"replay_consumes_again"}),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.equal(step(report,"race_winner_replay").status,200);assert.equal(step(report,"slot_a_after_replay").outcome,"mismatch");assert.equal(step(report,"fill_remainder").reason,"race_or_replay_state_not_verified");assert.ok(report.summary.issues>0);
});
test("a global guest limit that makes independent slot B share slot A capacity is detected",async()=>{
  const run=input(),state=backend(run,{fault:"global_slot_limit"}),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.equal(step(report,"slot_a_full").outcome,"observed");assert.equal(step(report,"slot_b_create").status,409);assert.equal(step(report,"slot_b_create").outcome,"mismatch");
  assert.equal(step(report,"slot_a_after_rejection").outcome,"observed");assert.equal(step(report,"slot_b_readback").reason,"slot_b_not_verified");
});
test("creating slot B cannot delete prior slot A receipts or reset its capacity ledger",async()=>{
  const run=input(),state=backend(run,{fault:"slot_b_deletes_a"}),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.equal(step(report,"slot_b_create").outcome,"observed");
  for(const id of["race_winner_readback","fill_readback"]){assert.equal(step(report,id).status,404);assert.equal(step(report,id).outcome,"mismatch");}
  assert.equal(step(report,"slot_a_after_rejection").outcome,"mismatch");assert.equal(report.summary.issues,3);
});
test("global-last receipt reads cannot borrow successful occupancy numbers for old receipts",async()=>{
  const run=input(),state=backend(run,{fault:"global_last_get"}),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  for(const id of["race_winner_readback","fill_readback"])assert.equal(step(report,id).outcome,"mismatch");
  assert.equal(step(report,"slot_a_after_rejection").outcome,"observed");assert.equal(report.summary.issues,2);
});
test("an unavailable race peer leaves the complete race unresolved without retrying its write",async()=>{
  const run=input(),state=backend(run,{fault:"unavailable_peer"}),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.equal(step(report,"capacity_race_first").status,201);assert.equal(step(report,"capacity_race_first").outcome,"unavailable");assert.equal(step(report,"capacity_race_first").reason,"concurrent_peer_unavailable");
  assert.equal(step(report,"capacity_race_second").reason,"network_unavailable");assert.equal(step(report,"race_winner_replay").reason,"race_not_verified");
  assert.equal(state.calls.filter(call=>call.key?.endsWith("race-b")).length,1);assert.equal(step(report,"slot_b_create").outcome,"observed");
  assert.equal(state.calls.filter(call=>call.url.endsWith(`/occupancy/${run.runId}/a`)).length,1);
});
test("a complete race without a valid created receipt retains current occupancy without inventing a winner binding",async()=>{
  const run=input(),state=backend(run),report=await executeRuntimeCapacityCheck(run,{fetch:async(url,init)=>{
    const result=await state.fetcher(url,init),key=(init.headers as Record<string,string>)["Idempotency-Key"];
    if(key?.endsWith("race-a")&&result.status===201){const original=await result.json() as Record<string,unknown>;return Response.json({...original,revision:"wrong-build"},{status:201});}return result;
  }});
  const aggregate=step(report,"slot_a_after_race");assert.equal(aggregate.status,200);assert.equal(aggregate.outcome,"unavailable");assert.equal(aggregate.reason,"race_receipt_not_verified");assert.match(aggregate.actual!,/"guestCount":5/u);
  assert.equal(step(report,"capacity_race_first").outcome,"mismatch");assert.equal(step(report,"race_winner_readback").reason,"race_not_verified");assert.equal(step(report,"race_winner_replay").reason,"race_not_verified");
});
test("server recovery observes metadata/current occupancy only and never manufactures the missing original race",async()=>{
  const run=input(),state=backend(run);await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});const offset=state.calls.length;
  const report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher,resuming:true}),recoveryCalls=state.calls.slice(offset);
  assert.equal(recoveryCalls.length,2);assert.ok(recoveryCalls.every(call=>call.init.method==="GET"));assert.deepEqual(report.summary,{steps:17,observed:1,issues:0,unavailable:16});
  assert.equal(step(report,"slot_a_initial").reason,"resumed_initial_state_not_observed");assert.equal(step(report,"capacity_race_first").reason,"resumed_capacity_run_not_replayed");assert.match(step(report,"slot_a_initial").actual!,/Current occupancy only/u);
  const fresh=input(),emptyState=backend(fresh),empty=await executeRuntimeCapacityCheck(fresh,{fetch:emptyState.fetcher,resuming:true});assert.equal(step(empty,"slot_a_initial").outcome,"unavailable");assert.equal(emptyState.calls.length,2);
});
test("a nonempty new-run slot stops before any write and revoked recovery performs zero requests",async()=>{
  const run=input(),state=backend(run);state.seed(CAPACITY_SLOTS.a,1);const report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.equal(step(report,"slot_a_initial").outcome,"mismatch");assert.equal(state.calls.length,2);assert.ok(state.calls.every(call=>call.init.method==="GET"));
  let requests=0;const blocked=await executeRuntimeCapacityCheck(input(),{noNetworkReason:"registration_no_longer_approved",fetch:async()=>{requests++;throw new Error("must not request");}});
  assert.equal(requests,0);assert.equal(blocked.summary.unavailable,17);assert.ok(blocked.steps.every(row=>row.reason==="registration_no_longer_approved"));
});
test("occupancy validates exact run/slot/revision and distinct IDs while tolerating ID array order",()=>{
  const expected={runId:crypto.randomUUID(),revision:"capacity-v1",slot:CAPACITY_SLOTS.a,guestCount:8,bookingIds:["receipt-a","receipt-b"]};
  const value={testRunId:expected.runId,revision:expected.revision,slot:expected.slot,guestCount:8,bookingIds:["receipt-b","receipt-a"]};
  assert.equal(inspectCapacityOccupancy(value,expected).matches,true);
  for(const changed of[{...value,testRunId:crypto.randomUUID()},{...value,slot:CAPACITY_SLOTS.b},{...value,revision:"other"},{...value,guestCount:"8"},{...value,bookingIds:["receipt-a","receipt-a"]},{...value,bookingIds:["receipt-a","other"]},{...value,unexpected:true}])assert.equal(inspectCapacityOccupancy(changed,expected).matches,false);
});
test("unsafe URLs and changed source/digest/registration fail before the network",async()=>{
  const run=input();let requests=0;const fetcher=async()=>{requests++;return Response.json({});};
  for(const baseUrl of["http://capacity.example.org/pbp/","https://capacity.example.org/pbp/?token=x","https://user:password@capacity.example.org/pbp/","https://127.0.0.1/pbp/","https://capacity.example.org/pbp/%2e%2e/","https://capacity.example.org/pbp/../other/","https://capacity.example.org/pbp//"])
    await assert.rejects(()=>executeRuntimeCapacityCheck({...run,target:{...run.target,baseUrl}},{fetch:fetcher}));
  await assert.rejects(()=>executeRuntimeCapacityCheck({...run,deliveryDigest:"wrong"},{fetch:fetcher}));
  await assert.rejects(()=>executeRuntimeCapacityCheck({...run,runId:"not-a-uuid"},{fetch:fetcher}));
  await assert.rejects(()=>executeRuntimeCapacityCheck({...run,plan:{...run.plan,slotCapacity:{...run.plan.slotCapacity,maxGuestsPerSlot:9}}},{fetch:fetcher}));assert.equal(requests,0);
});
test("redirects, huge bodies, non-JSON metadata and cancellation never start booking writes",async()=>{
  for(const[reply,reason]of[[()=>new Response(null,{status:302,headers:{Location:"http://127.0.0.1/private"}}),"redirect_blocked"],[()=>new Response("x".repeat(16*1024+1),{headers:{"Content-Type":"application/json"}}),"response_too_large"],[()=>new Response("not JSON"),"non_json_response"]] as const){
    let calls=0;const report=await executeRuntimeCapacityCheck(input(),{fetch:async()=>{calls++;return reply();}});assert.equal(calls,1);assert.equal(step(report,"revision").reason,reason);assert.equal(report.summary.observed,0);
  }
  const controller=new AbortController();controller.abort();let calls=0;const report=await executeRuntimeCapacityCheck(input(),{signal:controller.signal,fetch:async()=>{calls++;return Response.json({});}});assert.equal(calls,0);assert.equal(step(report,"revision").reason,"cancelled");
  const timeout=await executeRuntimeCapacityCheck(input(),{requestTimeoutMs:5,fetch:async()=>new Promise(()=>{})});assert.equal(step(timeout,"revision").reason,"request_timeout");
});
test("the independently implemented native SQL handler produces stored fixed/overbook/underlimit/overlimit outcomes",async()=>{
  const schema=readFileSync(new URL("../examples/seller-capacity-staging/migrations/0001_capacity.sql",import.meta.url),"utf8");
  for(const policyId of["fixed","overbook","underlimit","overlimit"]){
    const run=input(),sqlite=new DatabaseSync(":memory:");
    // A deliberately different native SQL view in this isolated fixture; no
    // caller field or checker expectation changes the seller's business rule.
    const nativeSchema=policyId==="overlimit"?schema.replace("8 AS max_guests_per_slot","9 AS max_guests_per_slot"):schema;
    if(policyId==="overlimit")assert.notEqual(nativeSchema,schema);sqlite.exec(nativeSchema);
    const db={prepare(sql:string){const statement=sqlite.prepare(sql);return{bind(...args:(string|number|null)[]){return{async first(){return statement.get(...args)??null;},async all(){return{success:true,results:statement.all(...args)};},async run(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}};}};}};}};
    const env={CAPACITY_DB:db,CAPACITY_PROJECT_ID:"synthetic-native-project",CAPACITY_REGISTRATION_REVISION:"review-1",CAPACITY_DEPLOYMENT_REVISION:run.target.revision,CAPACITY_FRONTEND_BUNDLE_DIGEST:run.deliveryDigest,CAPACITY_POLICY_ID:policyId==="overlimit"?"fixed":policyId};
    let calls=0;
    try{
      const report=await executeRuntimeCapacityCheck(run,{fetch:async(url,init)=>{calls++;return handleCapacityRequest(new Request(url,init),env);}});
      const actual=sqlite.prepare("SELECT slot,SUM(party_size) AS guestCount,COUNT(*) AS bookings FROM seller_capacity_receipts GROUP BY slot ORDER BY slot").all();
      if(policyId==="fixed"){
        assert.deepEqual(report.summary,{steps:17,observed:17,issues:0,unavailable:0});assert.equal(calls,17);
        assert.deepEqual(actual.map(row=>({...row})),[{slot:CAPACITY_SLOTS.a,guestCount:8,bookings:2},{slot:CAPACITY_SLOTS.b,guestCount:6,bookings:1}]);
      }else if(policyId==="overbook"){
        assert.equal(step(report,"capacity_race_first").status,201);assert.equal(step(report,"capacity_race_second").status,201);assert.deepEqual(report.summary,{steps:17,observed:6,issues:3,unavailable:8});assert.equal(calls,9);
        assert.equal(step(report,"slot_a_after_race").outcome,"mismatch");assert.match(step(report,"slot_a_after_race").actual!,/"guestCount":10/u);assert.equal(actual[0].guestCount,10);assert.equal(actual[0].bookings,2);
      }else if(policyId==="underlimit"){
        assert.equal(step(report,"fill_remainder").status,409);assert.equal(step(report,"fill_remainder").outcome,"mismatch");assert.equal(actual[0].guestCount,5);assert.equal(actual[0].bookings,1);
      }else{
        assert.equal(step(report,"reject_extra").status,201);assert.equal(step(report,"reject_extra").outcome,"mismatch");assert.equal(step(report,"slot_a_after_rejection").outcome,"mismatch");assert.equal(actual[0].guestCount,9);assert.equal(actual[0].bookings,3);
      }
      assert.equal(report.plan.slotCapacity.maxGuestsPerSlot,8);assert.ok(calls<=17);
    }finally{sqlite.close();}
  }
});
