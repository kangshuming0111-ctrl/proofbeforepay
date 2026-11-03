import {env} from "cloudflare:workers";
import type {ProofQuote} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {sameJourneyRegistration,validateJourneyRegistration,type JourneyRegistrationSnapshot,type ProjectJourneyRun} from "./project-journey.ts";
import {projectJourneyReadPaths} from "./project-journey-actions.ts";
import type {JourneyObservation} from "./journey-checks.ts";

export function parseJourneyRegistrations(raw:string|undefined):JourneyRegistrationSnapshot[]{
 if(raw===undefined||raw==="")return[];if(typeof raw!=="string"||new TextEncoder().encode(raw).byteLength>64*1024)throw new DomainError("Journey registry exceeds its bounded configuration envelope.");
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new DomainError("Journey registry needs a JSON array.");}if(!Array.isArray(value)||value.length>20)throw new DomainError("Journey registry contains too many targets.");const result=value.map(validateJourneyRegistration);if(new Set(result.map(r=>r.id)).size!==result.length)throw new DomainError("Journey registry IDs must be unique.");return result;
}
export function operatorJourneyRegistrations():JourneyRegistrationSnapshot[]{const raw=(env as unknown as Record<string,unknown>).PBP_JOURNEY_TARGETS;try{return parseJourneyRegistrations(raw as string|undefined);}catch{throw new DomainError("Journey deployment registry needs operator review.",503);}}
export function resolveJourneyTarget(quote:ProofQuote,targetId:unknown,digest:string,entries:readonly JourneyRegistrationSnapshot[]=operatorJourneyRegistrations(),now=Date.now()):JourneyRegistrationSnapshot{
 const entry=entries.map(validateJourneyRegistration).find(r=>r.id===targetId&&r.projectId===quote.id);if(!entry)throw new DomainError("No approved seller journey deployment is registered for this project.",404);if(entry.frontendBundleDigest!==digest||Date.parse(entry.expiresAt)<=now)throw new DomainError("This journey deployment approval is expired or belongs to another uploaded version.",409);return entry;
}
export function availableJourneyTargets(quote:ProofQuote,digest:string,entries:readonly JourneyRegistrationSnapshot[]=operatorJourneyRegistrations(),now=Date.now()){
 return entries.map(validateJourneyRegistration).filter(r=>r.projectId===quote.id&&r.frontendBundleDigest===digest&&Date.parse(r.expiresAt)>now).map(r=>({id:r.id,label:r.label,registrationRevision:r.registrationRevision,expiresAt:r.expiresAt}));
}
export function requireCurrentJourneyRegistration(quote:ProofQuote,digest:string,entries:readonly JourneyRegistrationSnapshot[]=operatorJourneyRegistrations(),now=Date.now()):JourneyRegistrationSnapshot{
 const run=quote.proof.delivery?.journeyRun;if(!run||run.deliveryDigest!==digest||run.deliveryId!==quote.proof.delivery?.id)throw new DomainError("The journey run belongs to another delivery snapshot.",409);const current=resolveJourneyTarget(quote,run.registration.id,digest,entries,now);if(!sameJourneyRegistration(run.registration,current))throw new DomainError("The approved journey deployment changed. Close the existing run without further requests.",409);return current;
}
export function assertSeparateJourneyOrigin(registration:JourneyRegistrationSnapshot,applicationOrigin:string){if(new URL(registration.frontendEntryUrl).origin===applicationOrigin)throw new DomainError("The seller journey must use its separately approved staging origin; the application lab cannot stand in for a seller deployment.",409);}
export type JourneyServerFetch=(url:string,init:RequestInit)=>Promise<Response>;
async function limitedJson(response:Response,signal:AbortSignal):Promise<unknown>{
 if(signal.aborted)throw new Error("server_read_timeout");if(response.headers.get("content-type")?.split(";",1)[0].trim()!=="application/json")throw new Error("non_json_response");if(Number(response.headers.get("content-length"))>16*1024)throw new Error("response_too_large");const reader=response.body?.getReader();if(!reader)throw new Error("missing_response_body");const chunks:Uint8Array[]=[];let count=0;
 const cancel=()=>{void reader.cancel("journey_read_cancelled").catch(()=>{});};signal.addEventListener("abort",cancel,{once:true});
 try{
  while(true){if(signal.aborted)throw new Error("server_read_timeout");const part=await reader.read();if(signal.aborted)throw new Error("server_read_timeout");if(part.done)break;count+=part.value.byteLength;if(count>16*1024)throw new Error("response_too_large");chunks.push(part.value);}
  const all=new Uint8Array(count);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}if(signal.aborted)throw new Error("server_read_timeout");
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all));}catch{throw new Error("invalid_json_response");}
 }catch(error){cancel();throw error;}finally{signal.removeEventListener("abort",cancel);if(signal.aborted)cancel();reader.releaseLock();}
}
function unsupportedFetchConfiguration(error:unknown):boolean{return error instanceof TypeError&&/(?:redirect|cache)/iu.test(error.message.slice(0,512))&&/(?:unsupported|not supported|not implement|invalid|unrecognized)/iu.test(error.message.slice(0,512));}
/** Server independently GETs only finite recipe paths. It never replays a client
 * POST, forwards credentials, accepts a URL, or attests a browser action. */
export async function readProjectJourneyStep(run:ProjectJourneyRun,observation:JourneyObservation,options:{fetch?:JourneyServerFetch;now?:()=>number;timeoutMs?:number}={}):Promise<{observation:JourneyObservation;metadata?:unknown}>{
 const result=structuredClone(observation),paths=projectJourneyReadPaths(run,observation.id),now=options.now??Date.now,registration=validateJourneyRegistration(run.registration);let metadata:unknown;
 async function get(path:string):Promise<{status:number;body:unknown}>{
  if(Date.parse(registration.expiresAt)<=now()||Date.parse(run.expiresAt)<=now())throw new Error("approval_or_run_expired");const base=new URL(registration.backendBaseUrl),url=new URL(path,base);if(url.origin!==base.origin||!url.href.startsWith(base.href)||url.search||url.hash)throw new Error("target_mismatch");
  // Workers implements follow/manual only: redirect:"error" throws before I/O.
  // Manual plus these explicit checks preserves the no-redirect boundary without
  // treating a runtime incompatibility as a defect in the seller deployment.
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;const task=(async()=>{let response:Response;try{response=await(options.fetch??((u,i)=>fetch(u,i)))(url.href,{method:"GET",headers:{Accept:"application/json"},redirect:"manual",credentials:"omit",cache:"no-store",signal:controller.signal});}catch(error){if(unsupportedFetchConfiguration(error))throw new Error("server_fetch_configuration");throw error;}if(controller.signal.aborted){void response.body?.cancel("journey_read_cancelled").catch(()=>{});throw new Error("server_read_timeout");}if(response.status>=300&&response.status<400||response.type==="opaqueredirect"||response.redirected||response.url&&response.url!==url.href)throw new Error("redirect_blocked");return{status:response.status,body:await limitedJson(response,controller.signal)};})();
  try{return await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("server_read_timeout"));},Math.min(8000,Math.max(1,options.timeoutMs??8000)));})]);}finally{if(timer)clearTimeout(timer);}
 }
 try{
  if(paths.meta){const response=await get(paths.meta);metadata=response.body;result.requests=[{method:"GET",path:new URL(paths.meta,registration.backendBaseUrl).pathname,status:response.status,response:response.body}];}
  if(paths.merchant)result.merchant=await get(paths.merchant);
  if(paths.receipt)result.receipt=await get(paths.receipt);
  if(paths.occupancies){result.occupancies=[];for(const item of paths.occupancies){const response=await get(item.path);result.occupancies.push({slot:item.slot,...response});}}
 }catch(error){result.unavailableReason=error instanceof Error&&["non_json_response","invalid_json_response","response_too_large","missing_response_body","approval_or_run_expired","target_mismatch","server_read_timeout","redirect_blocked","server_fetch_configuration"].includes(error.message)?error.message:"server_read_unavailable";}
 return{observation:result,...(metadata!==undefined?{metadata}:{})};
}
