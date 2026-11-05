import type {ProofQuote} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {ENQUIRY_PROTOCOL,enquiryBody,enquiryInvalidBody,enquiryKey,enquiryReceipt,enquiryRows,evaluateEnquiryObservations,type EnquiryHttpReading,type EnquiryObservation,type EnquiryStepId} from "./enquiry-checks.ts";
import {validateEnquiryRegistration,type EnquiryRegistration,type ProjectEnquiryRun} from "./project-enquiry.ts";

export function parseEnquiryRegistrations(raw:unknown):EnquiryRegistration[]{if(raw===undefined||raw==="")return[];if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>32*1024)throw new DomainError("Enquiry registry requires bounded operator configuration.",503);let data:unknown;try{data=JSON.parse(raw);}catch{throw new DomainError("Enquiry registry is invalid.",503);}if(!Array.isArray(data)||data.length>20)throw new DomainError("Enquiry registry exceeds its target limit.",503);const result=data.map(validateEnquiryRegistration);if(new Set(result.map(r=>r.id)).size!==result.length)throw new DomainError("Enquiry registry IDs must be unique.",503);return result;}
export function resolveEnquiryTarget(quote:ProofQuote,targetId:unknown,digest:string,entries:readonly EnquiryRegistration[],now=Date.now()):EnquiryRegistration{const target=entries.map(validateEnquiryRegistration).find(t=>t.id===targetId&&t.projectId===quote.id);if(!target)throw new DomainError("No approved enquiry staging target is registered for this project.",404);if(target.deliveryDigest!==digest||Date.parse(target.expiresAt)<=now)throw new DomainError("Enquiry target approval expired or belongs to another uploaded version.",409);return target;}
export function availableEnquiryTargets(quote:ProofQuote,digest:string,entries:readonly EnquiryRegistration[],now=Date.now()){return entries.map(validateEnquiryRegistration).filter(t=>t.projectId===quote.id&&t.deliveryDigest===digest&&Date.parse(t.expiresAt)>now).map(t=>({id:t.id,label:t.label,registrationRevision:t.registrationRevision,expiresAt:t.expiresAt}));}
export type EnquiryServerFetch=(url:string,init:RequestInit)=>Promise<Response>;
/** Fixed paths and synthetic bodies only. Never retries an unknown write. */
export async function executeProjectEnquiryStep(run:ProjectEnquiryRun,id:EnquiryStepId,options:{fetch?:EnquiryServerFetch;now?:()=>number;timeoutMs?:number}={}):Promise<EnquiryObservation>{
 const registration=validateEnquiryRegistration(run.registration),base=new URL(registration.baseUrl),now=options.now??Date.now,reading:EnquiryObservation={id,readings:[]},evaluation=evaluateEnquiryObservations(run.id,registration.revision,base.pathname,run.observations),supported=(step:EnquiryStepId)=>evaluation.steps.find(s=>s.id===step)?.outcome==="supported";
 const needsMeta=["create","invalid_submit","loss_submit"].includes(id);if(needsMeta&&!supported("meta")||id==="retry_original"&&!supported("loss_readback")||id==="key_conflict"&&!supported("create_readback"))return{id,readings:[],unavailableReason:"required_prior_evidence_not_supported; no mutation was sent"};
 async function http(path:string,method:"GET"|"POST"="GET",body?:unknown,key?:string):Promise<EnquiryHttpReading>{
  const url=new URL(path,base);if(url.origin!==base.origin||!url.href.startsWith(base.href)||/[?#%\\]/u.test(url.href)||url.pathname.includes("//"))throw new Error("target_path_invalid");
  if(Date.parse(run.expiresAt)<=now()||Date.parse(registration.expiresAt)<=now())throw new Error("approval_or_run_expired");
  const item:EnquiryHttpReading={method,path:url.pathname,...(key?{key}:{}),...(body===undefined?{}:{request:body})};reading.readings.push(item);
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const task=(async()=>{const response=await(options.fetch??fetch)(url.href,{method,headers:{Accept:"application/json",...(body===undefined?{}:{"Content-Type":"application/json"}),...(key?{"Idempotency-Key":key}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:"manual",credentials:"omit",cache:"no-store",signal:controller.signal});
    if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw new Error("request_timeout_outcome_unknown");}
    item.status=response.status;if(response.status>=300&&response.status<400||response.redirected||response.type==="opaqueredirect"||response.url&&response.url!==url.href){void response.body?.cancel().catch(()=>{});throw new Error("redirect_blocked");}
    if(response.headers.get("content-type")?.split(";",1)[0].trim()!=="application/json"||!response.body){void response.body?.cancel().catch(()=>{});throw new Error("non_json_or_missing_response");}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;const cancel=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener("abort",cancel,{once:true});
    try{for(;;){const chunk=await reader.read();if(controller.signal.aborted)throw new Error("request_timeout_outcome_unknown");if(chunk.done)break;total+=chunk.value.byteLength;if(total>4096)throw new Error("response_size_limit");chunks.push(chunk.value);}const bytes=new Uint8Array(total);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)) as unknown;}finally{controller.signal.removeEventListener("abort",cancel);void reader.cancel().catch(()=>{});reader.releaseLock();}
   })();
   item.body=await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("request_timeout_outcome_unknown"));},Math.min(8000,Math.max(1,options.timeoutMs??8000)));})]);
  }catch(error){const known=error instanceof Error&&["request_timeout_outcome_unknown","redirect_blocked","non_json_or_missing_response","response_size_limit"].includes(error.message);item.error=known?(error as Error).message:"http_or_json_unavailable";}finally{if(timer)clearTimeout(timer);}
  return item;
 }
 try{
  if(id==="meta")await http("meta");
  else if(id==="create"||id==="loss_submit"||id==="retry_original")await http("enquiries","POST",enquiryBody(run.id,id==="create"?"normal":"loss"),enquiryKey(run.id,id==="create"?"normal":"loss"));
  else if(id==="invalid_submit")await http("enquiries","POST",enquiryInvalidBody(run.id),enquiryKey(run.id,"invalid"));
  else if(id==="key_conflict")await http("enquiries","POST",{...enquiryBody(run.id),message:"An intentionally conflicting fictional message."},enquiryKey(run.id,"normal"));
  else{
   const query=await http(`runs/${run.id}`);
   if((id==="create_readback"||id==="loss_readback")&&query.status===200&&!query.error){const kind=id==="create_readback"?"normal":"loss",rows=enquiryRows(query.body,run.id,registration.revision),matches=rows?.filter(r=>r.idempotencyKey===enquiryKey(run.id,kind));if(matches?.length===1&&enquiryReceipt(matches[0],run.id,registration.revision,kind))await http(`enquiries/${matches[0].id}`);}
  }
 }catch(error){reading.unavailableReason=error instanceof Error&&["approval_or_run_expired","target_path_invalid"].includes(error.message)?error.message:"enquiry_step_unavailable";}
 if(new TextEncoder().encode(JSON.stringify(reading)).byteLength>6144)return{id,readings:[],unavailableReason:"combined_evidence_size_limit; original request may have committed"};return reading;
}
export function enquiryRegistryExample(){return{protocol:ENQUIRY_PROTOCOL,authorisedSyntheticMutations:true,testOnly:true,provenance:"operator-approved-declaration"};}
