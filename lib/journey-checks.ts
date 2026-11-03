/** Controlled browser journey evidence. This is deliberately separate from
 * uploaded static deliveries and the immutable server HTTP v1-v4 reports. */
export const JOURNEY_STEP_IDS = ["meta","create","create_readback","cancel","cancel_readback","rebook","fill","full_readback","cancel_repeat","cancel_repeat_readback","reject_extra","source_create","move_full","move_full_readback","move_free","move_free_readback","response_loss_create","response_loss_readback","response_loss_retry","final_merchant_readback"] as const;
export type JourneyStepId = typeof JOURNEY_STEP_IDS[number];
export const JOURNEY_SCENARIOS = ["fixed","cancel-credit","move-loss","retry-duplicate","fake-success","wrong-party"] as const;
export type JourneyScenario = typeof JOURNEY_SCENARIOS[number];
export const JOURNEY_SLOTS = {a:"2099-01-01T10:00:00Z",b:"2099-01-01T11:00:00Z",c:"2099-01-01T12:00:00Z"} as const;
export type JourneyReceipt = {id:string;testRunId:string;marker:string;customer:string;email:string;slot:string;partySize:number;status:"active"|"cancelled";revision:string;idempotencyKey:string;[key:string]:unknown};
export type JourneyRequest = {method:string;path:string;key?:string;status?:number;request?:unknown;response?:unknown;error?:string};
export type JourneyObservation = {id:JourneyStepId;ui?:{status:"success"|"error"|"unknown";message:string;receipt?:unknown;fields?:Record<string,string>;actionId:string};requests?:JourneyRequest[];merchant?:{status:number;body:unknown};receipt?:{status:number;body:unknown};occupancies?:Array<{slot:"a"|"b"|"c";status:number;body:unknown}>;unavailableReason?:string};
export type JourneyInput = {runId:string;scenario:JourneyScenario;startedAt:string;finishedAt:string;frontendEntry:string;frontendDigest?:string;metadata:unknown;observations:JourneyObservation[]};
export type JourneyStep = {id:JourneyStepId;label:string;expected:string;outcome:"observed"|"mismatch"|"unavailable";actual:string;reason?:string};
const SCOPE={syntheticOnly:true,observer:"client-controlled-browser" as const,deploymentAttestation:false,independentSeller:false,authenticatedRoles:false,acceptance:false,payment:false,privateDeliveryLinked:false,responseFault:"controlled HTTP504 after native commit; not an observed production outage"};
const BRIEF={maxPartySize:6,maxGuestsPerSlot:8,slots:JOURNEY_SLOTS,confirmation:"Explicit fictional test agreement, not a customer contract",rules:["Cancellation releases capacity once; repeating cancellation has no further effect.","A rejected move preserves the original booking; successful move changes the same booking atomically.","A commit followed by controlled HTTP504 remains unknown in the UI until independently queried; same-key retry must not create another booking."]};
export type JourneyReport = JourneyInput & {schema:"proofbeforepay-journey-report-v1";method:"browser-controlled-booking-lifecycle-v1";protocol:"booking-lifecycle-http-v1";scope:typeof SCOPE;brief:typeof BRIEF;steps:JourneyStep[];summary:{steps:number;observed:number;issues:number;unavailable:number}};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u;
const record=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))?v as Record<string,unknown>:undefined;
function ordered(v:unknown):unknown{return Array.isArray(v)?v.map(ordered):record(v)?Object.fromEntries(Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,ordered(x)])):v;}
const same=(a:unknown,b:unknown)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
export function journeyBackendProfile(scenario:JourneyScenario):string{return scenario==="fake-success"||scenario==="wrong-party"?"fixed":scenario;}
export function journeyBackendBase(scenario:JourneyScenario):string{return `/journey-api/${journeyBackendProfile(scenario)}/pbp/`;}
export function journeyKey(runId:string,suffix:string):string{return `pbp-${runId}-lifecycle-${suffix}`;}
const definitions:Record<JourneyStepId,[string,string]>={
 meta:["Declared controlled service","Matching lifecycle protocol, revision, synthetic scope and independent native limits6/8"],
 create:["Submit five guests through the page","The actual page sends five guests to slot A; success response retains the same data"],
 create_readback:["Read the created booking independently","Fresh receipt GET and merchant query retain the same active five-guest booking"],
 cancel:["Cancel the first booking","Actual page cancel request returns the same booking as cancelled"],
 cancel_readback:["Verify released capacity","Fresh receipt is cancelled and actual slot A occupancy is zero"],
 rebook:["Rebook five guests","A new independent key creates a new active five-guest receipt in A"],
 fill:["Fill three remaining places","Another independent key creates three guests, distinct from earlier receipts"],
 full_readback:["Independently verify full slot","Active merchant rows and occupancy both show exactly5+3=8 in A"],
 cancel_repeat:["Repeat the original cancellation","Cancelling the old cancelled booking again has no additional effect"],
 cancel_repeat_readback:["Verify repeated cancellation","A remains full at8 and the original receipt remains cancelled"],
 reject_extra:["Reject an extra guest","The actual page observes409 slot_capacity_exceeded; no extra active booking"],
 source_create:["Create a booking to reschedule","Create a distinct active two-guest booking in B"],
 move_full:["Move into a full slot","A full-slot move returns409 slot_capacity_exceeded"],
 move_full_readback:["Verify failed move preserves original","The same booking remains active in B with2 guests; A8/B2"],
 move_free:["Move into a free slot","An actual page request moves the original two-guest booking to C"],
 move_free_readback:["Verify successful atomic move","The original ID is active in C; B0/C2 in independent reads"],
 response_loss_create:["Observe controlled post-commit failure","Actual page POST receives504 and displays unknown; no false success"],
 response_loss_readback:["Find the committed booking independently","A fresh merchant GET finds exactly one active one-guest B booking for the original key"],
 response_loss_retry:["Explicitly retry the same key","The page sends the original key/body; HTTP200 returns the independently found ID"],
 final_merchant_readback:["Reconcile final native records","Fresh merchant rows and A/B/C occupancy agree: A8/B1/C2,4 active receipts and1 cancelled original"],
};
export function journeyStepDefinition(id:JourneyStepId):{label:string;expected:string}{return{label:definitions[id][0],expected:definitions[id][1]};}
function invalid(message:string):never{throw new Error(message);}
function cloneInput(input:JourneyInput):JourneyInput{
 const text=JSON.stringify(input);if(!text||new TextEncoder().encode(text).length>512*1024)invalid("Journey evidence exceeds its bounded512KiB envelope.");
 const x=JSON.parse(text) as JourneyInput;
 if(!UUID.test(x.runId)||!JOURNEY_SCENARIOS.includes(x.scenario)||typeof x.frontendEntry!=="string"||x.frontendEntry.length>500||!x.frontendEntry.startsWith("/journey.html?")||x.frontendEntry.includes("#")||/[\\\u0000-\u001f]/u.test(x.frontendEntry))invalid("Journey identity or controlled frontend entry is invalid.");
 const url=new URL(x.frontendEntry,"https://controlled.invalid");if(url.pathname!=="/journey.html"||url.origin!=="https://controlled.invalid"||url.searchParams.get("run")!==x.runId||url.searchParams.get("scenario")!==x.scenario)invalid("Journey frontend entry differs from this run and scenario.");
 if([...url.searchParams.keys()].some(k=>!["run","scenario","lang"].includes(k))||url.searchParams.getAll("run").length!==1||url.searchParams.getAll("scenario").length!==1||url.searchParams.getAll("lang").length>1||url.searchParams.has("lang")&&!["zh","en"].includes(url.searchParams.get("lang")!))invalid("Journey frontend entry contains ambiguous or unsupported parameters.");
 if(x.frontendDigest!==undefined&&!/^[a-f0-9]{64}$/u.test(x.frontendDigest))invalid("Journey controlled frontend digest is invalid.");
 for(const at of[x.startedAt,x.finishedAt])if(typeof at!=="string"||!Number.isFinite(Date.parse(at)))invalid("Journey timestamps are invalid.");
 if(Date.parse(x.finishedAt)<Date.parse(x.startedAt))invalid("Journey time order is invalid.");
 if(!Array.isArray(x.observations)||x.observations.length>20)invalid("Journey observation inventory is invalid.");
 const ids=new Set<string>();
 for(const o of x.observations){
  if(!record(o)||!JOURNEY_STEP_IDS.includes(o.id)||ids.has(o.id))invalid("Journey observation identifiers must be canonical and unique.");ids.add(o.id);
  if(o.unavailableReason!==undefined&&(typeof o.unavailableReason!=="string"||!o.unavailableReason||o.unavailableReason.length>200))invalid("Journey unavailable reason is invalid.");
  if(o.ui&&(!record(o.ui)||!["success","error","unknown"].includes(o.ui.status)||typeof o.ui.message!=="string"||o.ui.message.length>2000||typeof o.ui.actionId!=="string"||!o.ui.actionId||o.ui.actionId.length>100))invalid("Journey UI observation is invalid.");
  if(o.requests&&(!Array.isArray(o.requests)||o.requests.length>4))invalid("Journey request trace is invalid.");
  for(const r of o.requests??[])if(!record(r)||!["GET","POST"].includes(r.method)||typeof r.path!=="string"||r.path.length>500||!r.path.startsWith(journeyBackendBase(x.scenario))||r.path.includes("?")||r.path.includes("#")||r.status!==undefined&&(!Number.isInteger(r.status)||r.status<100||r.status>599))invalid("Journey request trace leaves its declared controlled service.");
  if(o.occupancies&&(!Array.isArray(o.occupancies)||o.occupancies.length>3||new Set(o.occupancies.map(a=>a.slot)).size!==o.occupancies.length||o.occupancies.some(a=>!["a","b","c"].includes(a.slot))))invalid("Journey occupancy readings are invalid.");
 }
 return x;
}
export function evaluateJourneyReport(input:JourneyInput):JourneyReport{
 const x=cloneInput(input),base=journeyBackendBase(x.scenario),revision=`lifecycle-${journeyBackendProfile(x.scenario)}-v1`,seen=new Map(x.observations.map(o=>[o.id,o])),outcomes=new Map<JourneyStepId,JourneyStep["outcome"]>();
 const receipts=new Map<string,JourneyReceipt>();
 const validReceipt=(v:unknown,party?:number,slot?:string,state?:string,id?:string):v is JourneyReceipt=>{
  const r=record(v);return !!r&&typeof r.id==="string"&&ID.test(r.id)&&r.testRunId===x.runId&&r.marker===`PBP-${x.runId}`&&r.customer==="PBP synthetic"&&r.email==="pbp-test@example.invalid"&&r.revision===revision&&Number.isInteger(r.partySize)&&(r.partySize as number)>=1&&(r.partySize as number)<=6&&Object.values(JOURNEY_SLOTS).includes(r.slot as typeof JOURNEY_SLOTS.a)&&["active","cancelled"].includes(r.status as string)&&typeof r.idempotencyKey==="string"&&r.idempotencyKey.startsWith(`pbp-${x.runId}-lifecycle-`)&&(party===undefined||r.partySize===party)&&(slot===undefined||r.slot===slot)&&(state===undefined||r.status===state)&&(id===undefined||r.id===id);
 };
 const fromWrite=(id:JourneyStepId)=>{const o=seen.get(id),r=o?.requests?.[0]?.response;return validReceipt(r)?r:undefined;};
 const merchant=(o:JourneyObservation):JourneyReceipt[]|undefined=>{const m=record(o.merchant?.body);if(o.merchant?.status!==200||!m||m.testRunId!==x.runId||m.revision!==revision||!Array.isArray(m.bookings)||m.bookings.length>24||!m.bookings.every(r=>validReceipt(r))||new Set(m.bookings.map(r=>(r as JourneyReceipt).id)).size!==m.bookings.length)return;return m.bookings as JourneyReceipt[];};
 const occupancy=(o:JourneyObservation,slot:"a"|"b"|"c",count:number,expectedIds?:string[]):boolean=>{
  const a=o.occupancies?.find(a=>a.slot===slot),b=record(a?.body);if(a?.status!==200||!b||b.testRunId!==x.runId||b.revision!==revision||b.slot!==JOURNEY_SLOTS[slot]||b.guestCount!==count||!Array.isArray(b.bookingIds)||b.bookingIds.some(id=>typeof id!=="string"||!ID.test(id))||new Set(b.bookingIds).size!==b.bookingIds.length)return false;
  const rows=merchant(o);if(!rows)return false;const active=rows.filter(r=>r.status==="active"&&r.slot===JOURNEY_SLOTS[slot]);return active.reduce((n,r)=>n+r.partySize,0)===count&&same([...b.bookingIds].sort(),active.map(r=>r.id).sort())&&(!expectedIds||same([...b.bookingIds].sort(),[...expectedIds].sort()));
 };
 const receiptRead=(o:JourneyObservation,party:number,slot:string,status:string,id:string):boolean=>{if(o.receipt?.status!==200||!validReceipt(o.receipt.body,party,slot,status,id))return false;const rows=merchant(o);return !!rows&&rows.some(r=>r.id===id&&validReceipt(r,party,slot,status,id));};
 const keyFor=(suffix:string)=>journeyKey(x.runId,suffix);
 const write=(o:JourneyObservation,operation:"create"|"cancel"|"move",suffix:string,status:number,party:number,slot:string,id?:string):boolean=>{
  if(!o.ui||o.ui.actionId!==o.id||o.requests?.length!==1)return false;const r=o.requests[0],b=record(r.request),p=operation==="create"?`${base}bookings`:`${base}bookings/${id}/${operation}`;
  const fields=record(o.ui.fields);if(!fields||fields.operation!==operation)return false;
  if(operation==="create"&&(fields.partySize!==String(party)||fields.slot!==slot))return false;
  if(operation!=="create"&&fields.bookingId!==id||operation==="move"&&fields?.slot!==slot)return false;
  if(r.method!=="POST"||r.path!==p||r.status!==status||r.error||!b||b.testRunId!==x.runId||b.marker!==`PBP-${x.runId}`)return false;
  const bodyKeys=operation==="create"?["testRunId","marker","customer","email","slot","partySize"]:operation==="move"?["testRunId","marker","slot"]:["testRunId","marker"];
  if(!same(Object.keys(b).sort(),bodyKeys.sort()))return false;
  // The trace includes the key separately from the native wire body, supplied
  // by the trusted page observer, and is checked against its action identity.
  const key=r.key;
  if(key!==keyFor(suffix))return false;
  if(operation==="create"&&(b.partySize!==party||b.slot!==slot||b.customer!=="PBP synthetic"||b.email!=="pbp-test@example.invalid"))return false;
  if(operation==="move"&&b.slot!==slot)return false;
  if(status===504)return o.ui.status==="unknown"&&record(r.response)?.code==="response_lost_after_commit";
  if(status===409)return o.ui.status==="error"&&record(r.response)?.code==="slot_capacity_exceeded";
  if(o.ui.status!=="success"||!validReceipt(r.response,party,slot,operation==="cancel"?"cancelled":"active",id))return false;
  const body=r.response as JourneyReceipt;if(body.idempotencyKey!==keyFor(operation==="create"?suffix:operation==="cancel"?"cancel-create":"source-create"))return false;
  if(o.ui.receipt!==undefined&&!validReceipt(o.ui.receipt,party,slot,operation==="cancel"?"cancelled":"active",body.id))return false;
  return true;
 };
 const need=(ids:JourneyStepId[])=>ids.every(id=>outcomes.get(id)==="observed");
 const results:JourneyStep[]=JOURNEY_STEP_IDS.map(id=>{
  const o=seen.get(id),def=journeyStepDefinition(id);let verdict:JourneyStep["outcome"]="unavailable",reason="not_executed",ok=false;
  if(o&&!o.unavailableReason){
   const first=receipts.get("first"),five=receipts.get("five"),three=receipts.get("three"),source=receipts.get("source"),loss=receipts.get("loss");let prerequisites=true;
   switch(id){
    case"meta":{const m=record(x.metadata),r=o.requests?.[0];ok=o.requests?.length===1&&r?.method==="GET"&&r.path===`${base}meta`&&r.status===200&&!r.error&&same(r.response,x.metadata)&&!!m&&m.protocol==="booking-lifecycle-http-v1"&&m.revision===revision&&m.maxPartySize===6&&m.maxGuestsPerSlot===8&&m.syntheticOnly===true&&m.deploymentAttestation===false;break;}
    case"create":prerequisites=need(["meta"]);ok=write(o,"create","cancel-create",201,5,JOURNEY_SLOTS.a);if(ok)receipts.set("first",fromWrite(id)!);break;
    case"create_readback":prerequisites=need(["create"]);ok=!!first&&receiptRead(o,5,JOURNEY_SLOTS.a,"active",first.id)&&occupancy(o,"a",5,[first.id]);break;
    case"cancel":prerequisites=need(["create_readback"]);ok=!!first&&write(o,"cancel","cancel-first",200,5,JOURNEY_SLOTS.a,first.id);break;
    case"cancel_readback":prerequisites=need(["cancel"]);ok=!!first&&receiptRead(o,5,JOURNEY_SLOTS.a,"cancelled",first.id)&&occupancy(o,"a",0,[]);break;
    case"rebook":prerequisites=need(["cancel_readback"]);ok=write(o,"create","cancel-five",201,5,JOURNEY_SLOTS.a);if(ok){const r=fromWrite(id)!;ok=r.id!==first?.id;if(ok)receipts.set("five",r);}break;
    case"fill":prerequisites=need(["rebook"]);ok=write(o,"create","cancel-three",201,3,JOURNEY_SLOTS.a);if(ok){const r=fromWrite(id)!;ok=r.id!==five?.id&&r.id!==first?.id;if(ok)receipts.set("three",r);}break;
    case"full_readback":prerequisites=need(["fill"]);ok=!!five&&!!three&&occupancy(o,"a",8,[five.id,three.id]);break;
    case"cancel_repeat":prerequisites=need(["full_readback"]);ok=!!first&&write(o,"cancel","cancel-repeat",200,5,JOURNEY_SLOTS.a,first.id);break;
    case"cancel_repeat_readback":prerequisites=need(["cancel_repeat"]);ok=!!first&&!!five&&!!three&&receiptRead(o,5,JOURNEY_SLOTS.a,"cancelled",first.id)&&occupancy(o,"a",8,[five.id,three.id]);break;
    case"reject_extra":prerequisites=need(["cancel_repeat_readback"]);ok=write(o,"create","cancel-extra",409,1,JOURNEY_SLOTS.a);if(ok)ok=occupancy(o,"a",8,five&&three?[five.id,three.id]:undefined);break;
    case"source_create":prerequisites=need(["meta"]);ok=write(o,"create","source-create",201,2,JOURNEY_SLOTS.b);if(ok){const r=fromWrite(id)!;ok=![first?.id,five?.id,three?.id].includes(r.id);if(ok)receipts.set("source",r);}break;
    case"move_full":prerequisites=need(["source_create","full_readback","reject_extra"]);ok=!!source&&write(o,"move","move-full",409,2,JOURNEY_SLOTS.a,source.id);break;
    case"move_full_readback":prerequisites=need(["move_full"]);ok=!!source&&receiptRead(o,2,JOURNEY_SLOTS.b,"active",source.id)&&occupancy(o,"a",8)&&occupancy(o,"b",2,[source.id]);break;
    case"move_free":prerequisites=need(["move_full_readback"]);ok=!!source&&write(o,"move","move-free",200,2,JOURNEY_SLOTS.c,source.id);break;
    case"move_free_readback":prerequisites=need(["move_free"]);ok=!!source&&receiptRead(o,2,JOURNEY_SLOTS.c,"active",source.id)&&occupancy(o,"b",0,[])&&occupancy(o,"c",2,[source.id]);break;
    case"response_loss_create":prerequisites=need(["meta"]);ok=write(o,"create","loss-create",504,1,JOURNEY_SLOTS.b);break;
    case"response_loss_readback":{prerequisites=need(["response_loss_create"]);const rows=merchant(o),matches=rows?.filter(r=>r.idempotencyKey===keyFor("loss-create"));ok=matches?.length===1&&validReceipt(matches[0],1,JOURNEY_SLOTS.b,"active");if(ok)receipts.set("loss",matches![0]);break;}
    case"response_loss_retry":prerequisites=need(["response_loss_readback"]);ok=!!loss&&write(o,"create","loss-create",200,1,JOURNEY_SLOTS.b,loss.id);if(ok){const rows=merchant(o);ok=rows?.filter(r=>r.idempotencyKey===keyFor("loss-create")).length===1;}break;
    case"final_merchant_readback":{prerequisites=need(["meta"]);const rows=merchant(o);ok=!!rows&&rows.length===5&&rows.filter(r=>r.status==="active").length===4&&!!first&&!!five&&!!three&&!!source&&!!loss&&same(rows.map(r=>r.id).sort(),[first.id,five.id,three.id,source.id,loss.id].sort())&&rows.some(r=>r.id===first.id&&r.status==="cancelled")&&rows.some(r=>validReceipt(r,5,JOURNEY_SLOTS.a,"active",five.id))&&rows.some(r=>validReceipt(r,3,JOURNEY_SLOTS.a,"active",three.id))&&rows.some(r=>validReceipt(r,2,JOURNEY_SLOTS.c,"active",source.id))&&rows.some(r=>validReceipt(r,1,JOURNEY_SLOTS.b,"active",loss.id))&&occupancy(o,"a",8,[five.id,three.id])&&occupancy(o,"b",1,[loss.id])&&occupancy(o,"c",2,[source.id]);break;}
   }
   if(!prerequisites){verdict="unavailable";reason="prerequisite_not_observed";}else{verdict=ok?"observed":"mismatch";reason="";}
  }else if(o?.unavailableReason)reason=o.unavailableReason;
  outcomes.set(id,verdict);const detail=o?JSON.stringify(ordered(o)):"No observation was supplied.";
  return{id,...def,outcome:verdict,actual:detail.length>3000?detail.slice(0,2999)+"…":detail,...(verdict==="unavailable"?{reason}:{})};
 });
 return{...x,schema:"proofbeforepay-journey-report-v1",method:"browser-controlled-booking-lifecycle-v1",protocol:"booking-lifecycle-http-v1",scope:structuredClone(SCOPE),brief:structuredClone(BRIEF),steps:results,summary:{steps:20,observed:results.filter(s=>s.outcome==="observed").length,issues:results.filter(s=>s.outcome==="mismatch").length,unavailable:results.filter(s=>s.outcome==="unavailable").length}};
}
export function validateJourneyReport(value:unknown):JourneyReport{
 const v=record(value);if(!v)invalid("Journey report must be an object.");
 const keys=["runId","scenario","startedAt","finishedAt","frontendEntry","frontendDigest","metadata","observations","schema","method","protocol","scope","brief","steps","summary"];
 if(Object.keys(v).some(k=>!keys.includes(k)))invalid("Journey report contains unknown fields.");
 const rebuilt=evaluateJourneyReport({runId:v.runId as string,scenario:v.scenario as JourneyScenario,startedAt:v.startedAt as string,finishedAt:v.finishedAt as string,frontendEntry:v.frontendEntry as string,...(v.frontendDigest!==undefined?{frontendDigest:v.frontendDigest as string}:{}),metadata:v.metadata,observations:v.observations as JourneyObservation[]});
 if(!same(rebuilt,value))invalid("Journey report differs from its canonical observations, brief, scope or derived results.");return rebuilt;
}
