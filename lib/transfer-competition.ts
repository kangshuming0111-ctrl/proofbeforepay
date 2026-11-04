import {DomainError} from "./domain.ts";
import type {JourneyRegistrationSnapshot} from "./project-journey.ts";
import {validateModelRegistration} from "./model-checks.ts";

export const TRANSFER_REPORT_BYTES=32*1024;
export const TRANSFER_SESSION_LIMIT=12;
export const TRANSFER_SLOTS={a:"2099-01-01T10:00:00Z",b:"2099-01-01T11:00:00Z",c:"2099-01-01T12:00:00Z"} as const;
export const TRANSFER_DEFINITION={family:"transfer-competition-v1",protocol:"booking-lifecycle-http-v1",seed:"uint32-lcg1664525-1013904223-fisher-yates-v1",partyRange:[2,6],capacity:8,slots:TRANSFER_SLOTS,setup:["X:S:p","Y:U:p","Z:T:8-p"],concurrent:["move:X:T","move:Y:T"],orders:["x_then_y","y_then_x"],realTime:"completion ordinal before invocation ordinal imposes precedence",maxWrites:5,maxRequests:24,totalTimeoutMs:20000,observer:"server-direct-http"} as const;
/** SHA-256 of UTF-8 JSON.stringify(TRANSFER_DEFINITION), independently tested. */
export const TRANSFER_SPEC_DIGEST="a6a11c5923d1ffa5fd2ff9ab0b4e845a1ee9f3cdc3e42487befea793dc839a18";
export const TRANSFER_OPERATION_IDS=["meta","empty_merchant","empty_a","empty_b","empty_c","create_x","create_y","create_z","seeded_merchant","seeded_a","seeded_b","seeded_c","seeded_x","seeded_y","seeded_z","transfer_x","transfer_y","final_merchant","final_a","final_b","final_c","final_x","final_y","final_z"] as const;
export type TransferOperationId=typeof TRANSFER_OPERATION_IDS[number];
export type TransferObservation={operationId:TransferOperationId;method:"GET"|"POST";path:string;invokedOrdinal:number;completedOrdinal:number|null;request?:unknown;key?:string;status?:number;body?:unknown;unavailableReason?:string};
export type TransferBase={id:string;projectId:string;deliveryId:string;deliveryDigest:string;journeyPlanDigest:string;modelSpecDigest:string;seed:number;registration:JourneyRegistrationSnapshot;startedAt:string;expiresAt?:string};
export type TransferLease=TransferBase&{expiresAt:string;startedByRole:"buyer"|"seller"};
export type TransferOrder="x_then_y"|"y_then_x";
export type TransferEvaluation={outcome:"compatible"|"violated"|"inconclusive";reason:string;compatibleOrders:TransferOrder[]};
export type TransferReport={id:string;runId:string;projectId:string;deliveryId:string;deliveryDigest:string;journeyPlanDigest:string;modelSpecDigest:string;family:"transfer-competition-v1";seed:number;registration:JourneyRegistrationSnapshot;startedAt:string;finishedAt:string;trace:TransferObservation[];closureReason?:string;result:TransferEvaluation;scope:{supplemental:true;observer:"server-direct-http";browserAttestation:false;syntheticOnly:true;deploymentAttestation:false;acceptance:false;payment:false}};
export type TransferExpected={deliveryId?:string;deliveryDigest?:string;journeyPlanDigest?:string;projectId?:string;/** Trusted loopback test harness only, never populated from an API request. */allowLoopback?:boolean};
type Obj=Record<string,unknown>;
type Wire={id:string;testRunId:string;marker:string;customer:string;email:string;slot:string;partySize:number;status:"active"|"cancelled";revision:string;idempotencyKey:string};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u,ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u,DIGEST=/^[a-f0-9]{64}$/u;
const plain=(v:unknown):v is Obj=>!!v&&typeof v==="object"&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const stamp=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const TRANSFER_SCOPE={supplemental:true,observer:"server-direct-http",browserAttestation:false,syntheticOnly:true,deploymentAttestation:false,acceptance:false,payment:false} as const;
const inconclusive=(reason:string):TransferEvaluation=>({outcome:"inconclusive",reason,compatibleOrders:[]});
function fail(message="The transfer-competition report is invalid."):never{throw new DomainError(message,409);}
function exact(v:Obj,keys:readonly string[],optional:readonly string[]=[]){if(keys.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!keys.includes(k)&&!optional.includes(k)))fail();}
function boundedJson(value:unknown){
 let count=0;const seen=new Set<object>();
 const visit=(v:unknown,depth:number):void=>{if(++count>6000||depth>12)fail();if(v===null||typeof v==="boolean"||typeof v==="string")return;if(typeof v==="number"&&Number.isFinite(v))return;if(typeof v!=="object"||seen.has(v!))fail();seen.add(v!);if(Array.isArray(v)){if(v.length>100)fail();for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!("value"in d))fail();visit(d.value,depth+1);}if(Reflect.ownKeys(v).some(k=>k!=="length"&&(typeof k!=="string"||!/^\d+$/u.test(k))))fail();return;}if(!plain(v))fail();for(const key of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,key)!;if(typeof key!=="string"||!("value"in d)||["__proto__","constructor","prototype"].includes(key))fail();visit(d.value,depth+1);}};
 visit(value,0);if(new TextEncoder().encode(JSON.stringify(value)).byteLength>TRANSFER_REPORT_BYTES)fail("Transfer-competition evidence exceeds32KiB.");
}

/** Deterministic parameters, not a generated verdict or a seller fault label. */
export function generateTransferPlan(seed:number){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new DomainError("The model seed must be an unsigned32-bit integer.");
 let state=seed>>>0;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;
 const slots:(keyof typeof TRANSFER_SLOTS)[]=["a","b","c"];
 for(let i=slots.length-1;i>0;i--){const j=next()%(i+1);[slots[i],slots[j]]=[slots[j],slots[i]];}
 return{family:"transfer-competition-v1" as const,seed,p:2+seed%5,source:slots[0],target:slots[1],spare:slots[2]};
}

export function transferKey(runId:string,suffix:string){return`pbp-${runId}-transfer-competition-${suffix}`;}
function receipt(value:unknown,runId:string,revision:string):Wire|undefined{
 if(!plain(value)||typeof value.id!=="string"||!ID.test(value.id)||value.testRunId!==runId||value.marker!==`PBP-${runId}`||value.customer!=="PBP synthetic"||value.email!=="pbp-test@example.invalid"||value.revision!==revision||!Number.isInteger(value.partySize)||(value.partySize as number)<1||(value.partySize as number)>6||!Object.values(TRANSFER_SLOTS).includes(value.slot as typeof TRANSFER_SLOTS.a)||!["active","cancelled"].includes(String(value.status))||typeof value.idempotencyKey!=="string"||!value.idempotencyKey.startsWith(`pbp-${runId}-transfer-competition-`))return;
 return value as unknown as Wire;
}
const comparable=(v:Wire)=>({id:v.id,testRunId:v.testRunId,marker:v.marker,customer:v.customer,email:v.email,slot:v.slot,partySize:v.partySize,status:v.status,revision:v.revision,idempotencyKey:v.idempotencyKey});
const sameWire=(a:Wire,b:Wire)=>JSON.stringify(comparable(a))===JSON.stringify(comparable(b));
function canonical(value:unknown):string{const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):plain(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,sort(v[key])])):v;return JSON.stringify(sort(value));}

/** Independent finite-state oracle. It reads responses, native readbacks and
 * invocation/completion ordinals only; no seller code or scenario selection. */
export function evaluateTransferReport(report:Pick<TransferReport,"runId"|"seed"|"registration"|"trace"|"closureReason">):TransferEvaluation{
 if(report.closureReason)return inconclusive(report.closureReason);
 const plan=generateTransferPlan(report.seed),rows=report.trace,byId=new Map(rows.map(row=>[row.operationId,row]));
 if(rows.length!==TRANSFER_OPERATION_IDS.length||byId.size!==rows.length||TRANSFER_OPERATION_IDS.some(id=>!byId.has(id)))return inconclusive("incomplete_trace");
 if(rows.some(row=>row.completedOrdinal===null||row.unavailableReason||row.status===undefined||row.status>=500||row.body===undefined))return inconclusive("unknown_http_outcome");
 const ordinals=rows.flatMap(row=>[row.invokedOrdinal,row.completedOrdinal!]);
 if(ordinals.some(n=>!Number.isInteger(n)||n<1)||new Set(ordinals).size!==48||rows.some(row=>row.completedOrdinal!<=row.invokedOrdinal))return inconclusive("invalid_call_order");
 const get=(id:TransferOperationId)=>byId.get(id)!,rev=report.registration.bridgeRevision??report.registration.deploymentRevision,runId=report.runId,base=new URL(report.registration.backendBaseUrl);
 const meta=get("meta").body;
 if(get("meta").status!==200||!plain(meta)||meta.protocol!=="booking-lifecycle-http-v1"||meta.revision!==rev||meta.syntheticOnly!==true||meta.deploymentAttestation!==false||meta.maxPartySize!==6||meta.maxGuestsPerSlot!==8||!Array.isArray(meta.supportedModels)||!meta.supportedModels.includes("transfer-competition-v1")||report.registration.bridgeRevision!==undefined&&meta.nativeRevision!==report.registration.deploymentRevision)return inconclusive("registered_metadata_not_established");
 const creationIds=["create_x","create_y","create_z"] as const,suffixes=["source-x","source-y","target-z"],parties=[plan.p,plan.p,8-plan.p],slots=[TRANSFER_SLOTS[plan.source],TRANSFER_SLOTS[plan.spare],TRANSFER_SLOTS[plan.target]];
 const created=creationIds.map((id,i)=>{const row=get(id),r=receipt(row.body,runId,rev);return row.status===201&&r&&r.partySize===parties[i]&&r.slot===slots[i]&&r.status==="active"&&r.idempotencyKey===transferKey(runId,suffixes[i])?r:undefined;});
 if(created.some(row=>!row)||new Set(created.map(row=>row!.id)).size!==3)return inconclusive("seed_state_not_established");
 const [x,y,z]=created as Wire[];
 const expectedPath=(id:TransferOperationId):string=>id==="meta"?"meta":id.startsWith("create_")?"bookings":id==="transfer_y"?`bookings/${y.id}/move`:id==="transfer_x"?`bookings/${x.id}/move`:id.endsWith("merchant")?`merchant/${runId}`:/_(a|b|c)$/u.test(id)?`occupancy/${runId}/${id.at(-1)}`:`bookings/${({x,y,z}as Record<string,Wire>)[id.at(-1)!].id}`;
 if(rows.some(row=>row.path!==new URL(expectedPath(row.operationId),base).pathname||row.method!==(row.operationId.startsWith("create_")||row.operationId==="transfer_y"||row.operationId==="transfer_x"?"POST":"GET")))return inconclusive("trace_path_or_method_mismatch");
 for(const[id,suffix,body]of[["create_x",suffixes[0],{testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:slots[0],partySize:parties[0]}],["create_y",suffixes[1],{testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:slots[1],partySize:parties[1]}],["create_z",suffixes[2],{testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:slots[2],partySize:parties[2]}],["transfer_y","move-y",{testRunId:runId,marker:`PBP-${runId}`,slot:TRANSFER_SLOTS[plan.target]}],["transfer_x","move-x",{testRunId:runId,marker:`PBP-${runId}`,slot:TRANSFER_SLOTS[plan.target]}]]as const){const o=get(id);if(o.key!==transferKey(runId,suffix)||canonical(o.request)!==canonical(body))return inconclusive("trace_intent_mismatch");}
 function state(prefix:"empty"|"seeded"|"final",expected:Wire[]):boolean{
  const merchant=get(`${prefix}_merchant`),body=merchant.body;
  if(merchant.status!==200||!plain(body)||body.testRunId!==runId||body.revision!==rev||!Array.isArray(body.bookings)||body.bookings.length!==expected.length)return false;
  const records=body.bookings.map(value=>receipt(value,runId,rev));if(records.some(row=>!row)||new Set(records.map(row=>row!.id)).size!==expected.length||expected.some(row=>!records.some(actual=>actual&&sameWire(actual,row))))return false;
  for(const alias of["a","b","c"]as const){const o=get(`${prefix}_${alias}`),value=o.body,active=expected.filter(row=>row.status==="active"&&row.slot===TRANSFER_SLOTS[alias]);if(o.status!==200||!plain(value)||value.testRunId!==runId||value.revision!==rev||value.slot!==TRANSFER_SLOTS[alias]||value.guestCount!==active.reduce((sum,row)=>sum+row.partySize,0)||!Array.isArray(value.bookingIds)||JSON.stringify([...value.bookingIds].sort())!==JSON.stringify(active.map(row=>row.id).sort()))return false;}
  if(prefix!=="empty")for(const[name,row]of[["x",expected.find(row=>row.id===x.id)!],["y",expected.find(row=>row.id===y.id)!],["z",expected.find(row=>row.id===z.id)!]]as const){const o=get(`${prefix}_${name}`),actual=receipt(o.body,runId,rev);if(o.status!==200||!actual||!sameWire(actual,row))return false;}
  return true;
 }
 if(!state("empty",[])||!state("seeded",[x,y,z]))return inconclusive("seed_readbacks_not_established");
 const c=get("transfer_y"),m=get("transfer_x"),setup=rows.filter(row=>!row.operationId.startsWith("final_")&&row!==c&&row!==m),final=rows.filter(row=>row.operationId.startsWith("final_"));
 if(Math.max(...setup.map(row=>row.completedOrdinal!))>=Math.min(c.invokedOrdinal,m.invokedOrdinal)||Math.min(...final.map(row=>row.invokedOrdinal))<=Math.max(c.completedOrdinal!,m.completedOrdinal!))return inconclusive("phase_order_not_established");
 const finalMerchant=get("final_merchant").body;
 if(final.some(row=>row.status!==200)||!plain(finalMerchant)||finalMerchant.testRunId!==runId||finalMerchant.revision!==rev||!Array.isArray(finalMerchant.bookings)||finalMerchant.bookings.length>24||finalMerchant.bookings.some(row=>!receipt(row,runId,rev))||["final_x","final_y","final_z"].some(id=>!receipt(get(id as TransferOperationId).body,runId,rev)))return inconclusive("final_readbacks_not_established");
 const movedX={...x,slot:TRANSFER_SLOTS[plan.target]},movedY={...y,slot:TRANSFER_SLOTS[plan.target]},xResponse=receipt(m.body,runId,rev),yResponse=receipt(c.body,runId,rev);
 const xSuccess=m.status===200&&!!xResponse&&sameWire(xResponse,movedX),ySuccess=c.status===200&&!!yResponse&&sameWire(yResponse,movedY);
 const xRejected=m.status===409&&plain(m.body)&&m.body.code==="slot_capacity_exceeded",yRejected=c.status===409&&plain(c.body)&&c.body.code==="slot_capacity_exceeded";
 const candidates:TransferOrder[]=[];
 if(!(c.completedOrdinal!<m.invokedOrdinal)&&xSuccess&&yRejected&&state("final",[movedX,y,z]))candidates.push("x_then_y");
 if(!(m.completedOrdinal!<c.invokedOrdinal)&&ySuccess&&xRejected&&state("final",[x,movedY,z]))candidates.push("y_then_x");
 return candidates.length?{outcome:"compatible",reason:"one_real_time_consistent_serial_order_matches",compatibleOrders:candidates}:{outcome:"violated",reason:"no_real_time_consistent_serial_order_matches",compatibleOrders:[]};
}

export function transferReportFromTrace(base:TransferBase,trace:TransferObservation[],finishedAt:string,closureReason?:string,options:{allowLoopback?:boolean}={}):TransferReport{
 const report:TransferReport={id:crypto.randomUUID(),runId:base.id,projectId:base.projectId,deliveryId:base.deliveryId,deliveryDigest:base.deliveryDigest,journeyPlanDigest:base.journeyPlanDigest,modelSpecDigest:TRANSFER_SPEC_DIGEST,family:"transfer-competition-v1",seed:base.seed,registration:structuredClone(base.registration),startedAt:base.startedAt,finishedAt,trace:structuredClone(trace),...(closureReason?{closureReason}:{}),result:inconclusive("not_evaluated"),scope:{...TRANSFER_SCOPE}};
 report.result=evaluateTransferReport(report);return validateTransferReport(report,options);
}

export function validateTransferReport(value:unknown,expected:TransferExpected={}):TransferReport{
 boundedJson(value);if(!plain(value))fail();exact(value,["id","runId","projectId","deliveryId","deliveryDigest","journeyPlanDigest","modelSpecDigest","family","seed","registration","startedAt","finishedAt","trace","result","scope"],["closureReason"]);
 if(typeof value.id!=="string"||!UUID.test(value.id)||typeof value.runId!=="string"||!UUID.test(value.runId)||typeof value.deliveryId!=="string"||!ID.test(value.deliveryId)||typeof value.deliveryDigest!=="string"||!DIGEST.test(value.deliveryDigest)||typeof value.journeyPlanDigest!=="string"||!DIGEST.test(value.journeyPlanDigest)||value.modelSpecDigest!==TRANSFER_SPEC_DIGEST||value.family!=="transfer-competition-v1"||!stamp(value.startedAt)||!stamp(value.finishedAt)||Date.parse(value.finishedAt)<Date.parse(value.startedAt))fail();
 generateTransferPlan(value.seed as number);const registration=validateModelRegistration(value.registration,expected.allowLoopback);
 if(typeof value.projectId!=="string"||!ID.test(value.projectId)||registration.projectId!==value.projectId||registration.frontendBundleDigest!==value.deliveryDigest||expected.deliveryId!==undefined&&value.deliveryId!==expected.deliveryId||expected.deliveryDigest!==undefined&&value.deliveryDigest!==expected.deliveryDigest||expected.journeyPlanDigest!==undefined&&value.journeyPlanDigest!==expected.journeyPlanDigest||expected.projectId!==undefined&&registration.projectId!==expected.projectId)fail("Transfer-competition evidence belongs to another delivery, plan or registration.");
 if(value.closureReason!==undefined&&(typeof value.closureReason!=="string"||!value.closureReason||value.closureReason.length>120||/[\u0000-\u001f\u007f]/u.test(value.closureReason)))fail();
 if(!Array.isArray(value.trace)||value.trace.length>24)fail();const ids=new Set<string>(),ordinals=new Set<number>();
 for(const item of value.trace){if(!plain(item))fail();exact(item,["operationId","method","path","invokedOrdinal","completedOrdinal"],["request","key","status","body","unavailableReason"]);const prefix=new URL(registration.backendBaseUrl).pathname;if(!TRANSFER_OPERATION_IDS.includes(item.operationId as TransferOperationId)||ids.has(String(item.operationId))||!["GET","POST"].includes(String(item.method))||typeof item.path!=="string"||item.path.length>500||!item.path.startsWith(prefix)||! /^(?:meta|merchant\/[a-f0-9-]{36}|occupancy\/[a-f0-9-]{36}\/[abc]|bookings(?:\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}(?:\/(?:cancel|move))?)?)$/u.test(item.path.slice(prefix.length))||!Number.isInteger(item.invokedOrdinal)||(item.invokedOrdinal as number)<1||(item.invokedOrdinal as number)>48||ordinals.has(item.invokedOrdinal as number))fail();ids.add(String(item.operationId));ordinals.add(item.invokedOrdinal as number);if(item.completedOrdinal!==null){if(!Number.isInteger(item.completedOrdinal)||(item.completedOrdinal as number)<=(item.invokedOrdinal as number)||(item.completedOrdinal as number)>48||ordinals.has(item.completedOrdinal as number))fail();ordinals.add(item.completedOrdinal as number);}if(item.key!==undefined&&(typeof item.key!=="string"||item.key.length>180||/[\u0000-\u001f\u007f]/u.test(item.key))||item.status!==undefined&&(!Number.isInteger(item.status)||(item.status as number)<100||(item.status as number)>599)||item.unavailableReason!==undefined&&(typeof item.unavailableReason!=="string"||!item.unavailableReason||item.unavailableReason.length>120||/[\u0000-\u001f\u007f]/u.test(item.unavailableReason)))fail();}
 const report=structuredClone(value)as unknown as TransferReport;
 if(canonical(report.scope)!==canonical(TRANSFER_SCOPE)||canonical(report.result)!==canonical(evaluateTransferReport(report)))fail("Transfer-competition derived results differ from their retained observations.");
 return report;
}

/** Pure business facts from the already validated finite experiment. Partial
 * evidence does not acquire a confirmed state-loss diagnosis. */
export function describeTransferReport(value:unknown,expected:TransferExpected={}){
 const report=validateTransferReport(value,expected),plan=generateTransferPlan(report.seed),known=report.result.outcome!=="inconclusive";
 const body=(id:TransferOperationId)=>report.trace.find(row=>row.operationId===id)?.body;
 const slot=body(`final_${plan.target}`),count=known&&plain(slot)&&Number.isInteger(slot.guestCount)?Number(slot.guestCount):null;
 const state=(alias:"x"|"y")=>{if(!known)return"unknown"as const;const original=receipt(body(`create_${alias}`),report.runId,report.registration.bridgeRevision??report.registration.deploymentRevision),final=receipt(body(`final_${alias}`),report.runId,report.registration.bridgeRevision??report.registration.deploymentRevision);if(!original||!final)return"unknown"as const;if(sameWire(original,final))return"preserved"as const;if(sameWire({...original,slot:TRANSFER_SLOTS[plan.target]},final))return"moved"as const;return"changed"as const;};
 const zBefore=receipt(body("create_z"),report.runId,report.registration.bridgeRevision??report.registration.deploymentRevision),zAfter=receipt(body("final_z"),report.runId,report.registration.bridgeRevision??report.registration.deploymentRevision);
 return{...plan,outcome:report.result.outcome,expectedTargetGuests:8,targetGuestCount:count,moveStatuses:{x:known?report.trace.find(row=>row.operationId==="transfer_x")?.status??null:null,y:known?report.trace.find(row=>row.operationId==="transfer_y")?.status??null:null},originals:{x:state("x"),y:state("y")},otherBookingUnchanged:known&&zBefore&&zAfter?sameWire(zBefore,zAfter):null,compatibleOrders:[...report.result.compatibleOrders]};
}

export type TransferExport={schema:"proofbeforepay-transfer-competition-evidence-v1";definition:typeof TRANSFER_DEFINITION;report:TransferReport;summary:ReturnType<typeof describeTransferReport>;scope:typeof TRANSFER_SCOPE};
export function exportTransferReport(report:unknown,expected:TransferExpected={}):TransferExport{const validated=validateTransferReport(report,expected);return{schema:"proofbeforepay-transfer-competition-evidence-v1",definition:TRANSFER_DEFINITION,report:validated,summary:describeTransferReport(validated,expected),scope:{...TRANSFER_SCOPE}};}
export function verifyTransferExport(value:unknown,expected:TransferExpected={}){if(!plain(value)||Object.keys(value).length!==5||value.schema!=="proofbeforepay-transfer-competition-evidence-v1"||canonical(value.definition)!==canonical(TRANSFER_DEFINITION)||canonical(value.scope)!==canonical(TRANSFER_SCOPE))fail("The standalone transfer evidence format is unsupported.");const report=validateTransferReport(value.report,expected);if(canonical(value.summary)!==canonical(describeTransferReport(report,expected)))fail("The supplemental business summary differs from its retained observations.");return{consistency:"consistent"as const,reportId:report.id,outcome:report.result.outcome,scope:{...TRANSFER_SCOPE},authenticity:"not-proven"as const,networkRequests:0};}
