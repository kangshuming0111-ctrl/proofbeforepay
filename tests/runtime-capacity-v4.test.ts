import assert from "node:assert/strict";
import test from "node:test";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {suggestSlotCapacity,validateBookingCapacityPlan} from "../lib/booking-capacity.ts";
import {CAPACITY_STEP_IDS,CAPACITY_V4_STEP_IDS,CAPACITY_V4_EXTRA_IDS,CAPACITY_V4_EXECUTION_ORDER,CAPACITY_V4_SLOTS,executeRuntimeCapacityCheck,runtimeCapacityStepDefinitions,type RuntimeCapacityInput,type RuntimeCapacityReport} from "../lib/runtime-capacity.ts";

type Fault="none"|"email_gap"|"accept_zero"|"accept_fraction"|"accept_negative"|"coerce_string"|"conflict_mutates"|"same_key_duplicates"|"same_key_both201"|"same_key_old_id"|"one_old_id"|"last_write_deletes_others"|"same_key_peer_unavailable";
type Protocol="booking-http-v3"|"booking-http-v4";
function input(protocol:Protocol="booking-http-v4",m=6,c=8):RuntimeCapacityInput{
  const party=`Each booking accepts at most ${m} people.`,slot=`Each time slot accepts at most ${c} guests in total.`,source={start:0,end:party.length,excerpt:party},capacity={start:party.length+1,end:party.length+1+slot.length,excerpt:slot};
  return{deliveryId:"v4-synthetic-delivery",deliveryDigest:"d".repeat(64),runId:crypto.randomUUID(),plan:validateBookingCapacityPlan({protocol,criterionId:"party",source,policy:suggestBookingPolicy(source),slotCapacity:{criterionId:"slot",...suggestSlotCapacity(capacity)}}),target:{id:"v4-controlled-target",label:"Synthetic independently stored booking policy",baseUrl:"https://capacity.example.org/pbp/",revision:"capacity-test-1",protocol,testOnly:true}};
}
function backend(run:RuntimeCapacityInput,fault:Fault="none",nativeM=6,nativeC=8,reverseWinner=false){
  const rows=new Map<string,Record<string,unknown>>(),keys=new Map<string,Record<string,unknown>>(),calls:{path:string;method:string;key?:string;body?:Record<string,unknown>}[]=[];
  const waiting=new Map<string,(()=>void)[]>();let sequence=0;
  async function barrier(group:string,delayFirst=false){await new Promise<void>(resolve=>{const list=waiting.get(group)??[];list.push(resolve);waiting.set(group,list);if(list.length===2)for(const wake of list)wake();});if(delayFirst)await Promise.resolve();}
  function reply(row:Record<string,unknown>,status:number,key:string){
    let id=row.id;
    if(fault==="same_key_old_id"&&key.endsWith("same-key"))id=[...rows.values()].find(row=>row.slot===CAPACITY_V4_SLOTS.a)?.id;
    if(fault==="one_old_id"&&key.endsWith("-one"))id=[...rows.values()].find(row=>row.slot===CAPACITY_V4_SLOTS.c)?.id;
    return Response.json({...row,id},{status:fault==="same_key_both201"&&key.endsWith("same-key")?201:status});
  }
  const fetcher=async(url:string,init:RequestInit):Promise<Response>=>{
    const path=new URL(url).pathname.replace("/pbp/",""),key=(init.headers as Record<string,string>)["Idempotency-Key"],body=typeof init.body==="string"?JSON.parse(init.body) as Record<string,unknown>:undefined;
    calls.push({path,method:init.method!,...(key?{key}:{}),...(body?{body}:{})});
    if(path==="meta")return Response.json({protocol:run.target.protocol,revision:run.target.revision});
    if(path.startsWith("occupancy/")){const slot=path.endsWith("/a")?CAPACITY_V4_SLOTS.a:CAPACITY_V4_SLOTS.b,matching=[...rows.values()].filter(row=>row.slot===slot);return Response.json({testRunId:run.runId,slot,revision:run.target.revision,guestCount:matching.reduce((sum,row)=>sum+Number(row.partySize),0),bookingIds:matching.map(row=>row.id)});}
    if(init.method==="GET"){const saved=rows.get(path.split("/").at(-1)!);return saved?Response.json(saved):Response.json({code:"not_found"},{status:404});}
    assert.ok(body&&key);
    if(!body.slot||body.email!=="pbp-test@example.invalid"&&!(fault==="email_gap"&&body.email==="not-an-email"))return Response.json({code:"synthetic_validation_failed"},{status:400});
    const acceptedInvalid=fault==="accept_zero"&&body.partySize===0||fault==="accept_fraction"&&body.partySize===1.5||fault==="accept_negative"&&body.partySize===-1||fault==="coerce_string"&&body.partySize==="1";
    if(!acceptedInvalid&&(!Number.isInteger(body.partySize)||Number(body.partySize)<1))return Response.json({code:"party_size_invalid"},{status:422});
    const isRace=key.endsWith("race-a")||key.endsWith("race-b"),sameKey=key.endsWith("same-key");
    if((isRace||sameKey)&&!keys.has(key)){
      await barrier(isRace?"race":"same",reverseWinner&&key.endsWith("race-a"));
    }
    // The second callback of the same-key pair deliberately fails in this
    // fixture only, after both requests really started.
    if(sameKey&&fault==="same_key_peer_unavailable"&&keys.has(key))throw new Error("Synthetic same-key peer unavailable");
    const saved=keys.get(key);
    if(saved&&!(sameKey&&fault==="same_key_duplicates")){
      if(saved.partySize!==Number(body.partySize)||saved.slot!==body.slot){if(fault==="conflict_mutates")saved.partySize=Number(body.partySize);return Response.json({code:"idempotency_conflict"},{status:409});}
      return reply(saved,200,key);
    }
    if(Number(body.partySize)>nativeM)return Response.json({code:"party_size_exceeded"},{status:422});
    const used=[...rows.values()].filter(row=>row.slot===body.slot).reduce((sum,row)=>sum+Number(row.partySize),0);
    if(used+Number(body.partySize)>nativeC)return Response.json({code:"slot_capacity_exceeded"},{status:409});
    const row={...body,partySize:Number(body.partySize),id:`receipt-${++sequence}`,revision:run.target.revision};rows.set(row.id,row);keys.set(key,row);
    if(fault==="last_write_deletes_others"&&key.endsWith("-below"))for(const id of rows.keys())if(id!==row.id)rows.delete(id);
    return reply(row,201,key);
  };
  return{fetcher,calls,rows};
}
const step=(report:RuntimeCapacityReport,id:string)=>report.steps.find(row=>row.id===id)!;
test("v4 combines31 explicit checks without changing v3's exact17 inventory or slots",async()=>{
  const run=input(),before=structuredClone(run),state=backend(run),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.deepEqual(report.summary,{steps:31,observed:31,issues:0,unavailable:0});assert.equal(report.method,"server-booking-http-v4");assert.equal(state.calls.length,31);assert.deepEqual(run,before);
  assert.deepEqual(report.steps.map(row=>row.id),[...CAPACITY_V4_STEP_IDS]);assert.equal(new Set(CAPACITY_V4_EXECUTION_ORDER).size,31);assert.deepEqual([...CAPACITY_V4_EXECUTION_ORDER].sort(),[...CAPACITY_V4_STEP_IDS].sort());assert.equal(CAPACITY_V4_EXTRA_IDS.length,14);
  assert.equal(state.rows.size,6);const lastWrite=state.calls.findLastIndex(call=>call.method==="POST");for(const call of state.calls.filter(call=>call.method==="GET"&&call.path.startsWith("bookings/")))assert.ok(state.calls.indexOf(call)>lastWrite);
  const negatives=state.calls.slice(1,7);assert.deepEqual(negatives.map(call=>call.key?.split("capacity-")[1]),["missing-slot","invalid-email","zero","fraction","negative","string"]);assert.equal(negatives[0].body!.slot,undefined);assert.equal(negatives[1].body!.email,"not-an-email");assert.equal(negatives[5].body!.partySize,"1");
  const pair=state.calls.filter(call=>call.key?.endsWith("same-key"));assert.equal(pair.length,2);assert.equal(pair[0].key,pair[1].key);assert.ok(pair.every(call=>call.body?.slot===CAPACITY_V4_SLOTS.c&&call.body.partySize===1));
  const legacy=input("booking-http-v3"),oldState=backend(legacy),old=await executeRuntimeCapacityCheck(legacy,{fetch:oldState.fetcher});assert.deepEqual(old.steps.map(row=>row.id),[...CAPACITY_STEP_IDS]);assert.equal(old.summary.observed,17);assert.equal(oldState.calls.length,17);assert.equal(old.method,"server-booking-http-v3");assert.equal(runtimeCapacityStepDefinitions(legacy.plan).length,17);
});
test("a backend can pass v3 yet fail v4 by actually storing a malformed email",async()=>{
  const old=input("booking-http-v3"),oldState=backend(old,"email_gap");assert.equal((await executeRuntimeCapacityCheck(old,{fetch:oldState.fetcher})).summary.observed,17);
  const run=input(),state=backend(run,"email_gap"),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.equal(step(report,"invalid_email").status,201);assert.equal(step(report,"invalid_email").outcome,"mismatch");assert.equal(step(report,"slot_a_initial").outcome,"mismatch");assert.equal(step(report,"capacity_race_first").reason,"initial_slot_not_empty_or_unavailable");
  assert.equal(state.calls.length,8);assert.equal(state.rows.size,1);assert.equal([...state.rows.values()][0].email,"not-an-email");assert.equal(report.summary.steps,31);
});
test("accepted zero, fractional, negative and string guest inputs remain failures even if coerced or stored",async()=>{
  for(const[fault,id]of[["accept_zero","party_zero"],["accept_fraction","party_fraction"],["accept_negative","party_negative"],["coerce_string","party_string"]] as const){const run=input(),state=backend(run,fault),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});assert.equal(step(report,id).outcome,"mismatch");assert.equal(step(report,"slot_a_initial").outcome,"mismatch");assert.equal(state.calls.length,8);}
});
test("winner conflict uses whichever race key really won and checks retained original fields",async()=>{
  for(const reverse of[false,true]){const run=input(),state=backend(run,"none",6,8,reverse),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});assert.equal(report.summary.observed,31);
    const conflict=state.calls.find(call=>call.key?.endsWith(reverse?"race-b":"race-a")&&call.body?.partySize===1)!;assert.ok(conflict);assert.equal(conflict.body!.slot,CAPACITY_V4_SLOTS.a);assert.equal(step(report,"winner_conflict").status,409);
  }
  const run=input(),state=backend(run,"conflict_mutates"),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});assert.equal(step(report,"winner_conflict").outcome,"observed");assert.equal(step(report,"slot_a_after_replay").outcome,"mismatch");assert.equal(step(report,"race_winner_readback").outcome,"mismatch");
});
test("same-key concurrency and independent-key receipt IDs each require their own invariant",async()=>{
  for(const fault of["same_key_duplicates","same_key_both201","same_key_old_id"] as const){const run=input(),state=backend(run,fault),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});assert.equal(step(report,"same_key_first").outcome,"mismatch",fault);assert.equal(step(report,"same_key_second").outcome,"mismatch",fault);assert.equal(step(report,"same_key_readback").reason,"same_key_not_verified");}
  const run=input(),state=backend(run,"one_old_id"),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});assert.equal(step(report,"party_one").outcome,"mismatch");assert.equal(step(report,"party_one_readback").reason,"party_one_not_verified");
});
test("all prior receipt witnesses follow the last new-key write and detect cross-slot deletion",async()=>{
  const run=input(),state=backend(run,"last_write_deletes_others"),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  for(const id of["race_winner_readback","fill_readback","slot_b_readback","same_key_readback","party_one_readback"])assert.equal(step(report,id).outcome,"mismatch",id);
  assert.equal(step(report,"party_below_readback").outcome,"observed");assert.equal(step(report,"slot_a_after_rejection").outcome,"mismatch");assert.equal(state.calls.length,31);
});
test("a missing same-key peer is unavailable rather than success or retry",async()=>{
  const run=input(),state=backend(run,"same_key_peer_unavailable"),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});
  assert.equal(step(report,"same_key_first").outcome,"unavailable");assert.equal(step(report,"same_key_first").reason,"concurrent_peer_unavailable");assert.equal(step(report,"same_key_second").reason,"network_unavailable");assert.equal(step(report,"same_key_readback").reason,"same_key_not_verified");assert.equal(state.calls.filter(call=>call.key?.endsWith("same-key")).length,2);assert.equal(state.calls.length,30);
});
test("v4 recovery retains31 original steps while making only safe current-state GETs",async()=>{
  const run=input(),state=backend(run);await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});const offset=state.calls.length;
  const result=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher,resuming:true});assert.deepEqual(result.summary,{steps:31,observed:1,issues:0,unavailable:30});assert.equal(state.calls.length-offset,2);assert.ok(state.calls.slice(offset).every(call=>call.method==="GET"));assert.equal(step(result,"same_key_first").reason,"resumed_capacity_run_not_replayed");assert.equal(state.rows.size,6);
  let calls=0;const revoked=await executeRuntimeCapacityCheck(input(),{noNetworkReason:"registration_no_longer_approved",fetch:async()=>{calls++;throw new Error("must not fetch");}});assert.equal(calls,0);assert.equal(revoked.summary.unavailable,31);
});
test("v4 requires its exact target and metadata protocol, and bounded recipes work at2/3 and12/12",async()=>{
  for(const[m,c]of[[2,3],[12,12]]){const run=input("booking-http-v4",m,c),state=backend(run,"none",m,c),report=await executeRuntimeCapacityCheck(run,{fetch:state.fetcher});assert.equal(report.summary.observed,31);assert.equal(state.calls.length,31);}
  const run=input();let calls=0;await assert.rejects(()=>executeRuntimeCapacityCheck({...run,target:{...run.target,protocol:"booking-http-v3"}},{fetch:async()=>{calls++;return Response.json({});}}));assert.equal(calls,0);
  const report=await executeRuntimeCapacityCheck(run,{fetch:async()=>{calls++;return Response.json({revision:run.target.revision,protocol:"booking-http-v3"});}});assert.equal(calls,1);assert.equal(step(report,"revision").outcome,"mismatch");assert.equal(report.summary.unavailable,30);
});
