import {DomainError} from "./domain.ts";

/** A separate backend-only contract. It does not attest a website form or email. */
export const ENQUIRY_PROTOCOL="enquiry-http-v1" as const;
export const ENQUIRY_STEP_IDS=["meta","create","create_readback","invalid_submit","invalid_readback","loss_submit","loss_readback","retry_original","retry_readback","key_conflict","conflict_readback","final_readback"] as const;
export type EnquiryStepId=typeof ENQUIRY_STEP_IDS[number];
export type EnquiryBody={testRunId:string;marker:string;name:"PBP synthetic";email:"pbp-test@example.invalid";subject:"Website enquiry";message:string};
export type EnquiryReceipt=EnquiryBody&{id:string;revision:string;idempotencyKey:string;status:"received"};
export type EnquiryHttpReading={method:"GET"|"POST";path:string;status?:number;body?:unknown;error?:string;key?:string;request?:unknown};
export type EnquiryObservation={id:EnquiryStepId;readings:EnquiryHttpReading[];unavailableReason?:string};
export type EnquiryStep={id:EnquiryStepId;outcome:"supported"|"mismatch"|"unknown";expected:string;reason:string};
export const ENQUIRY_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
export const ENQUIRY_SCOPE={observer:"server-http-contract-v1",syntheticOnly:true,websiteFormVerified:false,emailDeliveryVerified:false,backendAuthenticityAttested:false,acceptance:false,payment:false} as const;
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
export const enquiryKey=(runId:string,kind:"normal"|"loss"|"invalid")=>`pbp-${runId}-enquiry-${kind}`;
export function enquiryBody(runId:string,kind:"normal"|"loss"="normal"):EnquiryBody{return{testRunId:runId,marker:`PBP-${runId}`,name:"PBP synthetic",email:"pbp-test@example.invalid",subject:"Website enquiry",message:kind==="normal"?"A fictional enquiry about a small shop website.":"A second fictional enquiry, used for explicit recovery testing."};}
export function enquiryInvalidBody(runId:string):Omit<EnquiryBody,"message">{const body=enquiryBody(runId);return{testRunId:body.testRunId,marker:body.marker,name:body.name,email:body.email,subject:body.subject};}
export function enquirySame(a:unknown,b:unknown):boolean{const order=(v:unknown):unknown=>Array.isArray(v)?v.map(order):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,order(v[k])])):v;return JSON.stringify(order(a))===JSON.stringify(order(b));}
export function enquiryReceipt(value:unknown,runId:string,revision:string,kind:"normal"|"loss"):value is EnquiryReceipt{
 if(!plain(value)||Object.keys(value).sort().join(",")!==[...Object.keys(enquiryBody(runId,kind)),"id","revision","idempotencyKey","status"].sort().join(",")||typeof value.id!=="string"||!ENQUIRY_UUID.test(value.id)||value.revision!==revision||value.idempotencyKey!==enquiryKey(runId,kind)||value.status!=="received")return false;
 return Object.entries(enquiryBody(runId,kind)).every(([k,v])=>value[k]===v);
}
export function enquiryRows(value:unknown,runId:string,revision:string):EnquiryReceipt[]|undefined{
 if(!plain(value)||Object.keys(value).sort().join(",")!=="enquiries,revision,testRunId"||value.testRunId!==runId||value.revision!==revision||!Array.isArray(value.enquiries)||value.enquiries.length>8||value.enquiries.some(v=>!enquiryReceipt(v,runId,revision,"normal")&&!enquiryReceipt(v,runId,revision,"loss")))return;
 const rows=value.enquiries as EnquiryReceipt[];if(new Set(rows.map(r=>r.id)).size!==rows.length)return;return rows;
}
const definitions:Record<EnquiryStepId,string>={meta:"The registered service declares the exact protocol/revision, synthetic-only data and no email delivery.",create:"One fixed fictional enquiry is submitted once; HTTP201 returns the same fields and original key.",create_readback:"Fresh run query and receipt GET retain exactly one matching first enquiry.",invalid_submit:"A missing-message enquiry is rejected as invalid without a successful receipt.",invalid_readback:"Fresh query still contains only the unchanged first enquiry.",loss_submit:"A separate enquiry is committed, then deliberately returns HTTP504; its write outcome remains unknown until readback.",loss_readback:"Fresh query and receipt GET find exactly one enquiry for the original loss key.",retry_original:"Only after explicit confirmation and successful readback, replay the exact original loss key/body; HTTP200 returns the original receipt.",retry_readback:"Fresh query contains exactly two receipts, with no duplicate original keys.",key_conflict:"An altered message under the first successful key returns HTTP409 idempotency_conflict.",conflict_readback:"Fresh query preserves both original receipts and their original content.",final_readback:"Final fresh query reconciles exactly two unchanged enquiries and their distinct original keys."};
export function enquiryStepExpected(id:EnquiryStepId){return definitions[id];}
/** Validate the retained transport envelope before evaluating trusted server observations. */
export function validateEnquiryObservation(value:unknown,basePath:string):EnquiryObservation{
 if(!plain(value)||Object.keys(value).some(k=>!["id","readings","unavailableReason"].includes(k))||!ENQUIRY_STEP_IDS.includes(value.id as EnquiryStepId)||!Array.isArray(value.readings)||value.readings.length>2||value.unavailableReason!==undefined&&(typeof value.unavailableReason!=="string"||!value.unavailableReason||value.unavailableReason.length>120))throw new DomainError("Invalid bounded enquiry observation.",409);
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>6144)throw new DomainError("Enquiry observation exceeds its evidence allowance.",409);
 for(const item of value.readings){if(!plain(item)||Object.keys(item).some(k=>!["method","path","status","body","error","key","request"].includes(k))||!["GET","POST"].includes(item.method as string)||typeof item.path!=="string"||!item.path.startsWith(basePath)||/[?#%\\]/u.test(item.path)||item.path.includes("//")||/(?:^|\/)\.{1,2}(?:\/|$)/u.test(item.path)||item.path.length>300||item.status!==undefined&&(!Number.isInteger(item.status)||Number(item.status)<100||Number(item.status)>599)||item.error!==undefined&&(typeof item.error!=="string"||item.error.length>120)||item.key!==undefined&&(typeof item.key!=="string"||item.key.length>120))throw new DomainError("Enquiry transport evidence is invalid.",409);}
 return structuredClone(value) as EnquiryObservation;
}
export function evaluateEnquiryObservations(runId:string,revision:string,basePath:string,observations:EnquiryObservation[]):{steps:EnquiryStep[];summary:{supported:number;mismatch:number;unknown:number}}{
 if(!ENQUIRY_UUID.test(runId)||!Array.isArray(observations)||observations.length>ENQUIRY_STEP_IDS.length||observations.some((x,i)=>x.id!==ENQUIRY_STEP_IDS[i]))throw new DomainError("Enquiry observations are not in the fixed order.",409);
 const seen=new Map(observations.map(o=>[o.id,validateEnquiryObservation(o,basePath)]));
 const original=(kind:"normal"|"loss")=>{const o=seen.get(kind==="normal"?"create_readback":"loss_readback");const rows=enquiryRows(o?.readings[0]?.body,runId,revision);return rows?.filter(r=>r.idempotencyKey===enquiryKey(runId,kind))[0];};
 const records=(o:EnquiryObservation,count:number)=>{const r=o.readings[0],rows=r?.method==="GET"&&r.path===`${basePath}runs/${runId}`&&r.status===200&&!r.error?enquiryRows(r.body,runId,revision):undefined;if(!rows||rows.length!==count||rows.filter(r=>r.idempotencyKey===enquiryKey(runId,"normal")).length!==1||count===2&&rows.filter(r=>r.idempotencyKey===enquiryKey(runId,"loss")).length!==1)return;return rows;};
 const write=(o:EnquiryObservation,kind:"normal"|"loss"|"invalid",expectedStatus:number,body:unknown)=>{const r=o.readings[0];return o.readings.length===1&&r.method==="POST"&&r.path===`${basePath}enquiries`&&!r.error&&r.status===expectedStatus&&r.key===enquiryKey(runId,kind)&&enquirySame(r.request,body);};
 const supported=new Set<EnquiryStepId>();
 const steps=ENQUIRY_STEP_IDS.map(id=>{const o=seen.get(id);let ok=false,reason="Expected evidence was not observed.",outcome:EnquiryStep["outcome"]="unknown";
  if(o&&!o.unavailableReason&&!o.readings.some(r=>r.error)){
   const r=o.readings[0],normal=original("normal"),loss=original("loss");
   switch(id){
    case"meta":ok=o.readings.length===1&&r?.method==="GET"&&r.path===`${basePath}meta`&&r.status===200&&plain(r.body)&&enquirySame(r.body,{protocol:ENQUIRY_PROTOCOL,revision,syntheticOnly:true,emailDelivery:false});break;
    case"create":ok=supported.has("meta")&&write(o,"normal",201,enquiryBody(runId))&&enquiryReceipt(r.body,runId,revision,"normal");break;
    case"create_readback":case"loss_readback":{const kind=id==="create_readback"?"normal":"loss",rows=records(o,kind==="normal"?1:2),matches=rows?.filter(r=>r.idempotencyKey===enquiryKey(runId,kind)),read=o.readings[1];ok=supported.has("meta")&&!!matches&&matches.length===1&&o.readings.length===2&&read?.method==="GET"&&read.path===`${basePath}enquiries/${matches[0].id}`&&read.status===200&&enquirySame(read.body,matches[0]);if(id==="create_readback"&&ok&&supported.has("create"))ok=(seen.get("create")!.readings[0].body as EnquiryReceipt).id===matches![0].id;break;}
    case"invalid_submit":ok=supported.has("meta")&&write(o,"invalid",400,enquiryInvalidBody(runId))&&enquirySame(r.body,{code:"invalid_enquiry"});break;
    case"invalid_readback":ok=supported.has("create_readback")&&supported.has("invalid_submit")&&o.readings.length===1&&!!records(o,1)&&records(o,1)![0].id===normal?.id;break;
    case"loss_submit":ok=supported.has("meta")&&write(o,"loss",504,enquiryBody(runId,"loss"))&&enquirySame(r.body,{code:"response_lost_after_commit"});break;
    case"retry_original":ok=supported.has("loss_readback")&&write(o,"loss",200,enquiryBody(runId,"loss"))&&enquiryReceipt(r.body,runId,revision,"loss")&&(r.body as EnquiryReceipt).id===loss?.id;break;
    case"key_conflict":ok=supported.has("create_readback")&&write(o,"normal",409,{...enquiryBody(runId),message:"An intentionally conflicting fictional message."})&&enquirySame(r.body,{code:"idempotency_conflict"});break;
    case"retry_readback":case"conflict_readback":case"final_readback":{const rows=records(o,2);ok=o.readings.length===1&&!!normal&&!!loss&&!!rows&&rows.some(row=>enquirySame(row,normal))&&rows.some(row=>enquirySame(row,loss))&&(id!=="retry_readback"||supported.has("retry_original"))&&(id!=="conflict_readback"||supported.has("key_conflict"));break;}
   }
   outcome=ok?"supported":"mismatch";if(ok){supported.add(id);reason=id==="loss_submit"?"Controlled HTTP504 observed; commit outcome was independently checked in the next step.":"The bounded observation matches this explicit test expectation.";}
  }else reason=o?.unavailableReason??o?.readings.find(r=>r.error)?.error??"Not executed.";
  return{id,outcome,expected:definitions[id],reason};
 });
 return{steps,summary:{supported:steps.filter(s=>s.outcome==="supported").length,mismatch:steps.filter(s=>s.outcome==="mismatch").length,unknown:steps.filter(s=>s.outcome==="unknown").length}};
}
