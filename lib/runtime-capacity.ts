import {DomainError} from "./domain.ts";
import {capacityRecipeNumbers,validateBookingCapacityPlan,type BookingCapacityPlan} from "./booking-capacity.ts";
import {diagnoseRuntimeMetadata} from "./runtime-metadata.ts";
import type {RuntimeCheckReport,RuntimeCheckStep,RuntimeCheckTarget} from "./runtime-checks.ts";
import type {RuntimeRegistrationSnapshot} from "./runtime-registration.ts";

export type RuntimeCapacityTarget=Omit<RuntimeCheckTarget,"protocol">&{protocol:"booking-http-v3"};
export type RuntimeCapacityRegistration=Omit<RuntimeRegistrationSnapshot,"protocol">&{protocol:"booking-http-v3"};
export type RuntimeCapacityReport=Omit<RuntimeCheckReport,"method"|"plan"|"target">&{method:"server-booking-http-v3";plan:BookingCapacityPlan;target:Omit<RuntimeCheckReport["target"],"registration">&{registration?:RuntimeCapacityRegistration}};
export type RuntimeCapacityInput={deliveryId:string;deliveryDigest:string;runId:string;plan:BookingCapacityPlan;target:RuntimeCapacityTarget;registration?:RuntimeCapacityRegistration;startedAt?:string};
export type RuntimeCapacityOptions={fetch?:(url:string,init:RequestInit)=>Promise<Response>;allowLoopback?:boolean;signal?:AbortSignal;requestTimeoutMs?:number;totalTimeoutMs?:number;resuming?:boolean;noNetworkReason?:"registration_no_longer_approved"};
export const CAPACITY_SLOTS={a:"2099-01-01T10:00:00Z",b:"2099-01-01T11:00:00Z"} as const;
export const CAPACITY_STEP_IDS=["revision","slot_a_initial","party_above","capacity_race_first","capacity_race_second","race_winner_readback","slot_a_after_race","race_winner_replay","slot_a_after_replay","fill_remainder","fill_readback","slot_a_full","reject_extra","slot_a_after_rejection","slot_b_create","slot_b_readback","slot_b_occupancy"] as const;
export type CapacityStepId=typeof CAPACITY_STEP_IDS[number];
/** The response array stays in canonical order. Late witnesses deliberately
 * follow every write so new orders cannot silently replace older receipts. */
export const CAPACITY_EXECUTION_ORDER=["revision","slot_a_initial","party_above","capacity_race_first","capacity_race_second","slot_a_after_race","race_winner_replay","slot_a_after_replay","fill_remainder","slot_a_full","reject_extra","slot_b_create","slot_b_readback","slot_b_occupancy","race_winner_readback","fill_readback","slot_a_after_rejection"] as const satisfies readonly CapacityStepId[];
export type CapacityStepDefinition={id:CapacityStepId;label:string;method:"GET"|"POST";path:string;pathKind:"meta"|"bookings"|"receipt"|"occupancy-a"|"occupancy-b";expected:string;observedStatuses:readonly number[]};
export function runtimeCapacityStepDefinitions(plan:BookingCapacityPlan):CapacityStepDefinition[]{
  const{maxPartySize:m,maxGuestsPerSlot:c,racePartySize:a,remainingPartySize:r}=capacityRecipeNumbers(plan);
  const row=(id:CapacityStepId,label:string,pathKind:CapacityStepDefinition["pathKind"],expected:string,observedStatuses:readonly number[]):CapacityStepDefinition=>({id,label,pathKind,method:pathKind==="bookings"?"POST":"GET",path:pathKind==="meta"?"meta":pathKind==="bookings"?"bookings":pathKind==="receipt"?"bookings/:id":`occupancy/{runId}/${pathKind==="occupancy-a"?"a":"b"}`,expected,observedStatuses});
  return[
    row("revision","Declared capacity target revision","meta","HTTP200 and exact declared protocol/revision/registration association",[200]),
    row("slot_a_initial","Slot A starts empty","occupancy-a","HTTP200; this run/slot/revision, guestCount0 and no booking IDs",[200]),
    row("party_above","Reject a party above the agreed per-booking limit","bookings",`HTTP400/422 code party_size_exceeded for ${m+1} guests`,[400,422]),
    row("capacity_race_first","First distinct-key capacity contender","bookings",`Together: one201 exact ${a}-guest receipt and one409 slot_capacity_exceeded`,[201,409]),
    row("capacity_race_second","Second distinct-key capacity contender","bookings",`Together: one201 exact ${a}-guest receipt and one409 slot_capacity_exceeded`,[201,409]),
    row("race_winner_readback","Final readback of the retained winning receipt","receipt",`HTTP200; original winning ID and ${a}-guest fields after every later write`,[200]),
    row("slot_a_after_race","Read occupancy after the capacity race","occupancy-a",`HTTP200; guestCount${a} and exactly the winning booking ID`,[200]),
    row("race_winner_replay","Replay the actual winning key","bookings","HTTP200; exact original winning ID/fields, no additional capacity consumed",[200]),
    row("slot_a_after_replay","Read occupancy after winner replay","occupancy-a",`HTTP200; guestCount${a} and only the same winning booking ID`,[200]),
    row("fill_remainder","Fill the remaining agreed slot capacity","bookings",`HTTP201; new ${r}-guest receipt distinct from the race winner`,[201]),
    row("fill_readback","Final readback of the retained fill receipt","receipt",`HTTP200; original fill ID and ${r}-guest fields after every later write`,[200]),
    row("slot_a_full","Read the exactly full slot","occupancy-a",`HTTP200; guestCount${c} and exactly the winner/fill booking IDs`,[200]),
    row("reject_extra","Reject one guest above full slot capacity","bookings","HTTP409 code slot_capacity_exceeded; no additional booking",[409]),
    row("slot_a_after_rejection","Final slot A occupancy after rejection and slot B writes","occupancy-a",`HTTP200; guestCount${c} and original two IDs, unchanged by other-slot creation`,[200]),
    row("slot_b_create","Create a maximum-size booking in independent slot B","bookings",`HTTP201; distinct receipt for ${m} guests in slot B`,[201]),
    row("slot_b_readback","Read back the independent slot B booking","receipt",`HTTP200; exact slot B receipt and ${m}-guest fields`,[200]),
    row("slot_b_occupancy","Read independent slot B occupancy","occupancy-b",`HTTP200; guestCount${m} and only slot B's booking ID`,[200]),
  ];
}

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u,ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u,RECEIPT=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u,DIGEST=/^[a-f0-9]{64}$/u;
const CONTROL=/[\u0000-\u001f\u007f]/u,RESPONSE_BYTES=16*1024;
function plain(value:unknown):value is Record<string,unknown>{return!!value&&typeof value==="object"&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function text(value:unknown,max:number):value is string{return typeof value==="string"&&value.length>0&&value.length<=max&&value===value.trim()&&!CONTROL.test(value);}
function id(value:unknown,name:string):string{if(typeof value!=="string"||!ID.test(value))throw new DomainError(`${name} is invalid.`);return value;}
function target(value:RuntimeCapacityTarget,allowLoopback?:boolean):RuntimeCapacityTarget{
  if(!plain(value)||Object.keys(value).some(key=>!["id","label","baseUrl","revision","testOnly","protocol"].includes(key))||value.protocol!=="booking-http-v3"||value.testOnly!==true||!text(value.label,100)||!text(value.revision,120)||!text(value.baseUrl,500)||/[\\%?#]/u.test(value.baseUrl)||/(?:^|\/)\.{1,2}(?:\/|$)/u.test(value.baseUrl))throw new DomainError("Capacity targets require an explicit test-only v3 registry entry.");
  let url:URL;try{url=new URL(value.baseUrl);}catch{throw new DomainError("Capacity target URL is invalid.");}
  const host=url.hostname.toLowerCase(),loopback=["localhost","127.0.0.1","[::1]"].includes(host);
  if(url.username||url.password||url.search||url.hash||url.pathname.includes("//")||!url.pathname.endsWith("/")||url.href!==value.baseUrl
    ||(loopback?!allowLoopback||!["http:","https:"].includes(url.protocol):url.protocol!=="https:"||!host.includes(".")||/^[\d.]+$/u.test(host)||host.includes(":")||/(?:^|\.)(?:localhost|local|internal|test|invalid|localdomain)$/u.test(host)))throw new DomainError("Capacity target must use a canonical approved HTTPS directory URL.");
  return{id:id(value.id,"Capacity target ID"),label:value.label,baseUrl:value.baseUrl,revision:value.revision,testOnly:true,protocol:"booking-http-v3"};
}
function registration(value:RuntimeCapacityRegistration|undefined,selected:RuntimeCapacityTarget,digest:string):RuntimeCapacityRegistration|undefined{
  if(value===undefined)return;
  const allowed=["id","label","registrationRevision","projectId","protocol","baseUrl","deploymentRevision","frontendBundleDigest","backendArtifactDigest","backendSourceCommit","expiresAt","testOnly","provenance"];
  if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key))||value.protocol!=="booking-http-v3"||value.testOnly!==true||value.provenance!=="operator-approved-declaration"
    ||value.id!==selected.id||value.label!==selected.label||value.baseUrl!==selected.baseUrl||value.deploymentRevision!==selected.revision||value.frontendBundleDigest!==digest
    ||typeof value.expiresAt!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.expiresAt)||!Number.isFinite(Date.parse(value.expiresAt))||new Date(value.expiresAt).toISOString()!==value.expiresAt
    ||value.backendArtifactDigest!==undefined&&!DIGEST.test(value.backendArtifactDigest)||value.backendSourceCommit!==undefined&&!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.backendSourceCommit))throw new DomainError("Capacity registration must match the exact submitted frontend and approved target.",409);
  id(value.projectId,"Capacity registration project");id(value.registrationRevision,"Capacity registration revision");return structuredClone(value);
}
type ReceiptExpected={runId:string;revision:string;slot:string;partySize:number;id?:string};
/** Only controlled field names and bounded synthetic receipt IDs are retained. */
export function inspectCapacityReceipt(value:unknown,expected:ReceiptExpected):{matches:boolean;id?:string;actual:string}{
  if(!plain(value))return{matches:false,actual:"Expected a JSON booking receipt object."};
  const required={testRunId:expected.runId,marker:`PBP-${expected.runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:expected.slot,partySize:expected.partySize,revision:expected.revision};
  const candidate=typeof value.id==="string"&&RECEIPT.test(value.id)?value.id:undefined;
  const mismatched=Object.entries(required).filter(([key,wanted])=>value[key]!==wanted).map(([key])=>key);
  if(!candidate||expected.id!==undefined&&candidate!==expected.id)mismatched.unshift("id");
  return{matches:mismatched.length===0,...(candidate?{id:candidate}:{}),actual:JSON.stringify({...(candidate?{id:candidate}:{}),matchedFields:Object.keys(required).filter(key=>!mismatched.includes(key)),mismatchedFields:mismatched})};
}
type OccupancyExpected={runId:string;revision:string;slot:string;guestCount:number;bookingIds:readonly string[]};
export function inspectCapacityOccupancy(value:unknown,expected:OccupancyExpected):{matches:boolean;actual:string}{
  if(!plain(value))return{matches:false,actual:"Expected a JSON occupancy object."};
  const keys=["testRunId","slot","revision","guestCount","bookingIds"],ids=value.bookingIds;
  const validIds=Array.isArray(ids)&&ids.length<=24&&ids.every(item=>typeof item==="string"&&RECEIPT.test(item))&&new Set(ids).size===ids.length;
  const validCount=Number.isSafeInteger(value.guestCount)&&(value.guestCount as number)>=0&&(value.guestCount as number)<=1000;
  const mismatched:string[]=[];
  if(Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))mismatched.push("shape");
  if(value.testRunId!==expected.runId)mismatched.push("testRunId");if(value.slot!==expected.slot)mismatched.push("slot");if(value.revision!==expected.revision)mismatched.push("revision");
  if(!validCount||value.guestCount!==expected.guestCount)mismatched.push("guestCount");
  if(!validIds||JSON.stringify([...ids].sort())!==JSON.stringify([...expected.bookingIds].sort()))mismatched.push("bookingIds");
  return{matches:mismatched.length===0,actual:JSON.stringify({...(validCount?{guestCount:value.guestCount}:{}),...(validIds?{bookingIds:ids}:{}),mismatchedFields:mismatched})};
}

class Unavailable extends Error{}
async function jsonLimited(response:Response):Promise<unknown>{
  if(Number(response.headers.get("content-length"))>RESPONSE_BYTES)throw new Unavailable("response_too_large");
  if(response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")throw new Unavailable("non_json_response");
  const reader=response.body?.getReader();if(!reader)throw new Unavailable("missing_response_body");const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>RESPONSE_BYTES){await reader.cancel();throw new Unavailable("response_too_large");}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw new Unavailable("invalid_json_response");}
}

/** Bounded synthetic HTTP observations, not browser execution, backend build
 * attestation, a database audit, acceptance or payment. A persisted lease must
 * exist before the caller starts this recipe. Recovery never retries a write. */
export async function executeRuntimeCapacityCheck(input:RuntimeCapacityInput,options:RuntimeCapacityOptions={}):Promise<RuntimeCapacityReport>{
  const deliveryId=id(input.deliveryId,"Capacity delivery ID"),runId=input.runId;
  if(typeof runId!=="string"||!UUID.test(runId)||typeof input.deliveryDigest!=="string"||!DIGEST.test(input.deliveryDigest))throw new DomainError("Capacity checks need a generated UUID and exact frontend digest.");
  const deliveryDigest=input.deliveryDigest,plan=validateBookingCapacityPlan(input.plan),selected=target(input.target,options.allowLoopback),savedRegistration=registration(input.registration,selected,deliveryDigest);
  const startedAt=input.startedAt??new Date().toISOString();if(!Number.isFinite(Date.parse(startedAt)))throw new DomainError("Capacity run time is invalid.");
  const definitions=runtimeCapacityStepDefinitions(plan),steps:RuntimeCheckStep[]=definitions.map(({id,label,method,path,expected})=>({id,label,method,path:path.replace("{runId}",runId),expected,outcome:"unavailable",reason:"not_run"}));
  const byId=new Map(steps.map(step=>[step.id,step])),numbers=capacityRecipeNumbers(plan),fetcher=options.fetch??((url,init)=>fetch(url,init));
  const deadline=Date.now()+Math.min(30_000,Math.max(1,options.totalTimeoutMs??30_000)),perRequest=Math.min(4_000,Math.max(1,options.requestTimeoutMs??4_000));let requests=0;
  const report=():RuntimeCapacityReport=>({id:runId,deliveryId,deliveryDigest,runId,method:"server-booking-http-v3",startedAt,finishedAt:new Date().toISOString(),target:{id:selected.id,label:selected.label,origin:new URL(selected.baseUrl).origin,revision:selected.revision,...(savedRegistration?{registration:savedRegistration}: {})},plan,steps,summary:{steps:steps.length,observed:steps.filter(step=>step.outcome==="observed").length,issues:steps.filter(step=>step.outcome==="mismatch").length,unavailable:steps.filter(step=>step.outcome==="unavailable").length}});
  const mark=(ids:readonly CapacityStepId[],reason:string)=>{for(const stepId of ids){const step=byId.get(stepId)!;if(step.reason==="not_run")step.reason=reason;}};
  async function request(stepId:CapacityStepId,body?:Record<string,unknown>,key?:string):Promise<{status:number;data:unknown}>{
    if(options.signal?.aborted)throw new Unavailable("cancelled");if(options.noNetworkReason)throw new Unavailable(options.noNetworkReason);
    if(savedRegistration&&Date.parse(savedRegistration.expiresAt)<=Date.now())throw new Unavailable("registration_expired");
    if(++requests>17)throw new Unavailable("request_limit");const remaining=deadline-Date.now();if(remaining<=0)throw new Unavailable("run_timeout");
    const step=byId.get(stepId)!,url=new URL(step.path,selected.baseUrl);if(url.origin!==new URL(selected.baseUrl).origin||!url.href.startsWith(selected.baseUrl)||url.search||url.hash)throw new Unavailable("target_mismatch");
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,cancel:(()=>void)|undefined;
    const operation=Promise.resolve().then(async()=>{const headers:Record<string,string>={Accept:"application/json","Cache-Control":"no-cache"};if(body){headers["Content-Type"]="application/json";headers["Idempotency-Key"]=key!;}
      const response=await fetcher(url.href,{method:step.method,headers,...(body?{body:JSON.stringify(body)}:{}),redirect:"manual",credentials:"omit",cache:"no-store",signal:controller.signal});
      if(response.status>=300&&response.status<400||response.redirected||response.url&&response.url!==url.href)throw new Unavailable("redirect_blocked");return{status:response.status,data:await jsonLimited(response)};});
    try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Unavailable(remaining<=perRequest?"run_timeout":"request_timeout"));},Math.min(remaining,perRequest));cancel=()=>{controller.abort();reject(new Unavailable("cancelled"));};options.signal?.addEventListener("abort",cancel,{once:true});if(options.signal?.aborted)cancel();})]);}
    catch(error){throw error instanceof Unavailable?error:new Unavailable("network_unavailable");}finally{if(timer)clearTimeout(timer);if(cancel)options.signal?.removeEventListener("abort",cancel);controller.abort();}
  }
  type Check=(response:{status:number;data:unknown})=>{matches:boolean;actual:string};
  async function perform(stepId:CapacityStepId,body:Record<string,unknown>|undefined,key:string|undefined,check:Check):Promise<boolean>{
    const step=byId.get(stepId)!;try{const response=await request(stepId,body,key),result=check(response);Object.assign(step,{status:response.status,actual:result.actual,outcome:result.matches?"observed":"mismatch"});delete step.reason;return result.matches;}
    catch(error){step.reason=error instanceof Unavailable?error.message:"network_unavailable";return false;}
  }
  const payload=(partySize:number,slot:typeof CAPACITY_SLOTS[keyof typeof CAPACITY_SLOTS]=CAPACITY_SLOTS.a)=>({testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize});
  const key=(suffix:string)=>`pbp-${runId}-capacity-${suffix}`;
  const receipt=(data:unknown,partySize:number,slot:string,receiptId?:string)=>inspectCapacityReceipt(data,{runId,revision:selected.revision,slot,partySize,...(receiptId?{id:receiptId}:{})});
  const occupancy=(stepId:CapacityStepId,slot:string,guestCount:number,bookingIds:readonly string[])=>perform(stepId,undefined,undefined,response=>{const observed=inspectCapacityOccupancy(response.data,{runId,revision:selected.revision,slot,guestCount,bookingIds});return{matches:response.status===200&&observed.matches,actual:`HTTP ${response.status}; ${observed.actual}`};});
  const reject=(status:readonly number[],code:string):Check=>response=>({matches:status.includes(response.status)&&plain(response.data)&&response.data.code===code,actual:`HTTP ${response.status}; structured ${code} ${plain(response.data)&&response.data.code===code?"matched":"did not match"}`});
  if(options.noNetworkReason){mark(CAPACITY_STEP_IDS,options.noNetworkReason);return report();}
  const metadata=await perform("revision",undefined,undefined,response=>{const diagnosis=diagnoseRuntimeMetadata(response.data,{revision:selected.revision,protocol:"booking-http-v3",...(savedRegistration?{registration:savedRegistration as unknown as RuntimeRegistrationSnapshot}:{})});return{matches:response.status===200&&diagnosis.matches,actual:JSON.stringify({status:response.status,...diagnosis})};});
  if(!metadata){mark(CAPACITY_STEP_IDS.slice(1),"revision_not_verified");return report();}
  if(options.resuming){
    await occupancy("slot_a_initial",CAPACITY_SLOTS.a,0,[]);const initial=byId.get("slot_a_initial")!;
    if(initial.status!==undefined){initial.outcome="unavailable";initial.reason="resumed_initial_state_not_observed";initial.actual=`${initial.actual} Current occupancy only; original initial/race checkpoints were not observed.`;}
    mark(CAPACITY_STEP_IDS.slice(2),"resumed_capacity_run_not_replayed");return report();
  }
  if(!await occupancy("slot_a_initial",CAPACITY_SLOTS.a,0,[])){mark(CAPACITY_STEP_IDS.slice(2),"initial_slot_not_empty_or_unavailable");return report();}
  await perform("party_above",payload(numbers.maxPartySize+1),key("above"),reject([400,422],"party_size_exceeded"));
  const pair=await Promise.allSettled([request("capacity_race_first",payload(numbers.racePartySize),key("race-a")),request("capacity_race_second",payload(numbers.racePartySize),key("race-b"))]);
  const responses=pair.map(result=>result.status==="fulfilled"?result.value:undefined),winnerIndex=responses.findIndex(response=>response?.status===201);
  const winnerResponse=winnerIndex>=0?responses[winnerIndex]:undefined,winnerRecord=winnerResponse?receipt(winnerResponse.data,numbers.racePartySize,CAPACITY_SLOTS.a):undefined;
  const loser=winnerIndex>=0?responses[1-winnerIndex]:undefined,complete=responses.every(Boolean),raceGood=complete&&winnerRecord?.matches===true&&loser?.status===409&&plain(loser.data)&&loser.data.code==="slot_capacity_exceeded";
  for(let index=0;index<2;index++){const step=byId.get(index===0?"capacity_race_first":"capacity_race_second")!,result=pair[index];
    if(result.status==="rejected"){step.reason=result.reason instanceof Unavailable?result.reason.message:"network_unavailable";continue;}
    Object.assign(step,{status:result.value.status,outcome:!complete?"unavailable":raceGood?"observed":"mismatch",actual:`HTTP ${result.value.status}; exactlyOneCreatedAndOneCapacityRejection: ${raceGood}; ${result.value.status===201?receipt(result.value.data,numbers.racePartySize,CAPACITY_SLOTS.a).actual:"structured capacity rejection "+(plain(result.value.data)&&result.value.data.code==="slot_capacity_exceeded"?"matched":"did not match")}`});
    if(!complete)step.reason="concurrent_peer_unavailable";else delete step.reason;
  }
  if(complete&&!raceGood){
    // A completed failed race still needs aggregate evidence. In particular,
    // two201 responses must not hide an actual stored10 guests behind counts.
    // This candidate is only a comparison reference, never a verified winner.
    const diagnosticId=responses.filter(response=>response?.status===201).map(response=>receipt(response!.data,numbers.racePartySize,CAPACITY_SLOTS.a)).find(observed=>observed.matches)?.id;
    await occupancy("slot_a_after_race",CAPACITY_SLOTS.a,numbers.racePartySize,diagnosticId?[diagnosticId]:[]);
    if(!diagnosticId){const aggregate=byId.get("slot_a_after_race")!;if(aggregate.status!==undefined){aggregate.outcome="unavailable";aggregate.reason="race_receipt_not_verified";aggregate.actual=`${aggregate.actual} Current aggregate only; no valid created receipt ID was observed for the expected single booking.`;}}
  }
  let winnerId:string|undefined,fillId:string|undefined,slotBId:string|undefined,finalOccupancy=false;
  if(raceGood&&winnerRecord?.id){
    winnerId=winnerRecord.id;const winnerKey=key(winnerIndex===0?"race-a":"race-b");
    const afterRace=await occupancy("slot_a_after_race",CAPACITY_SLOTS.a,numbers.racePartySize,[winnerId]);
    await perform("race_winner_replay",payload(numbers.racePartySize),winnerKey,response=>{const observed=receipt(response.data,numbers.racePartySize,CAPACITY_SLOTS.a,winnerId);return{matches:response.status===200&&observed.matches,actual:`HTTP ${response.status}; ${observed.actual}`};});
    const afterReplay=await occupancy("slot_a_after_replay",CAPACITY_SLOTS.a,numbers.racePartySize,[winnerId]);
    if(afterRace&&afterReplay){
      const filled=await perform("fill_remainder",payload(numbers.remainingPartySize),key("fill"),response=>{const observed=receipt(response.data,numbers.remainingPartySize,CAPACITY_SLOTS.a),distinct=observed.id!==winnerId;if(response.status===201&&observed.matches&&distinct)fillId=observed.id;return{matches:response.status===201&&observed.matches&&distinct,actual:`HTTP ${response.status}; distinctIndependentReceiptId: ${distinct}; ${observed.actual}`};});
      if(filled&&fillId){
        const full=await occupancy("slot_a_full",CAPACITY_SLOTS.a,numbers.maxGuestsPerSlot,[winnerId,fillId]);
        if(full){await perform("reject_extra",payload(1),key("extra"),reject([409],"slot_capacity_exceeded"));finalOccupancy=true;}
        else mark(["reject_extra","slot_a_after_rejection"],"full_slot_not_verified");
      }else mark(["fill_readback","slot_a_full","reject_extra","slot_a_after_rejection"],"fill_not_verified");
    }else mark(["fill_remainder","fill_readback","slot_a_full","reject_extra","slot_a_after_rejection"],"race_or_replay_state_not_verified");
  }else mark(["race_winner_readback","slot_a_after_race","race_winner_replay","slot_a_after_replay","fill_remainder","fill_readback","slot_a_full","reject_extra","slot_a_after_rejection"],"race_not_verified");
  const slotB=await perform("slot_b_create",payload(numbers.maxPartySize,CAPACITY_SLOTS.b),key("slot-b"),response=>{const observed=receipt(response.data,numbers.maxPartySize,CAPACITY_SLOTS.b),distinct=observed.id!==winnerId&&observed.id!==fillId;if(response.status===201&&observed.matches&&distinct)slotBId=observed.id;return{matches:response.status===201&&observed.matches&&distinct,actual:`HTTP ${response.status}; distinctIndependentReceiptId: ${distinct}; ${observed.actual}`};});
  async function readback(stepId:CapacityStepId,receiptId:string,partySize:number,slot:string){byId.get(stepId)!.path=`bookings/${encodeURIComponent(receiptId)}`;return perform(stepId,undefined,undefined,response=>{const observed=receipt(response.data,partySize,slot,receiptId);return{matches:response.status===200&&observed.matches,actual:`HTTP ${response.status}; ${observed.actual}`};});}
  if(slotB&&slotBId){await readback("slot_b_readback",slotBId,numbers.maxPartySize,CAPACITY_SLOTS.b);await occupancy("slot_b_occupancy",CAPACITY_SLOTS.b,numbers.maxPartySize,[slotBId]);}
  else mark(["slot_b_readback","slot_b_occupancy"],"slot_b_not_verified");
  if(winnerId)await readback("race_winner_readback",winnerId,numbers.racePartySize,CAPACITY_SLOTS.a);
  if(fillId)await readback("fill_readback",fillId,numbers.remainingPartySize,CAPACITY_SLOTS.a);
  if(finalOccupancy&&winnerId&&fillId)await occupancy("slot_a_after_rejection",CAPACITY_SLOTS.a,numbers.maxGuestsPerSlot,[winnerId,fillId]);
  return report();
}
