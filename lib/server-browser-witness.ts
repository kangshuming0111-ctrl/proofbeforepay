import {validateJourneyRegistration} from "./project-journey.ts";
import {DomainError} from "./domain.ts";
import {WITNESS_SLOT,type WitnessRead,type WitnessSession} from "./browser-witness.ts";
export type WitnessFetch=(url:string,init:RequestInit)=>Promise<Response>;
/** Finite GET corroboration. It never operates a browser, issues POSTs, follows
 * redirects or treats a declared deployment revision as build attestation. */
export async function readWitnessState(session:WitnessSession,phase:"baseline"|"result",options:{fetch?:WitnessFetch;guard:()=>Promise<void>;receiptId?:string;timeoutMs?:number}):Promise<WitnessRead[]>{
 if(options.receiptId!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(options.receiptId))throw new DomainError("Witness receipt needs a bounded identifier.");
 const registration=validateJourneyRegistration(session.registration),paths:{kind:WitnessRead["kind"];path:string}[]=[{kind:"metadata",path:"meta"},{kind:"merchant",path:`merchant/${session.runId}`}];
 if(phase==="result"){if(options.receiptId)paths.push({kind:"receipt",path:`bookings/${options.receiptId}`});paths.push({kind:"occupancy",path:`occupancy/${session.runId}/a`});}
 const result:WitnessRead[]=[];
 for(const item of paths){
  // Authority/current version/approval are checked independently for EVERY
  // request, including after a preceding response awaited network I/O.
  await options.guard();const base=new URL(registration.backendBaseUrl),url=new URL(item.path,base);if(url.origin!==base.origin||!url.href.startsWith(base.href)||url.search||url.hash)throw new Error("witness_target_mismatch");
  const controller=new AbortController(),read:WitnessRead={kind:item.kind,path:url.pathname};let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const work=(async()=>{const response=await(options.fetch??((u,i)=>fetch(u,i)))(url.href,{method:"GET",headers:{Accept:"application/json"},credentials:"omit",redirect:"manual",cache:"no-store",signal:controller.signal});if(response.status>=300&&response.status<400||response.redirected||response.type==="opaqueredirect"||response.url&&response.url!==url.href){void response.body?.cancel();throw new Error("redirect_blocked");}read.status=response.status;
    if(response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json"||Number(response.headers.get("content-length"))>8192)throw new Error("response_not_bounded_json");
    const reader=response.body?.getReader();if(!reader)throw new Error("response_body_missing");const parts:Uint8Array[]=[];let size=0;const abort=()=>{void reader.cancel().catch(()=>{});};controller.signal.addEventListener("abort",abort,{once:true});
    try{while(true){if(controller.signal.aborted)throw new Error("read_timeout");const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>8192){void reader.cancel();throw new Error("response_not_bounded_json");}parts.push(chunk.value);}if(controller.signal.aborted)throw new Error("read_timeout");const bytes=new Uint8Array(size);let at=0;for(const chunk of parts){bytes.set(chunk,at);at+=chunk.length;}read.body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}finally{controller.signal.removeEventListener("abort",abort);reader.releaseLock();}
   })();await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("read_timeout"));},Math.min(6000,Math.max(1,options.timeoutMs??4000)));})]);
  }catch(error){delete read.body;read.unavailableReason=error instanceof Error&&["redirect_blocked","response_not_bounded_json","response_body_missing","read_timeout"].includes(error.message)?error.message:"read_unavailable";}
  finally{if(timer)clearTimeout(timer);controller.abort();}result.push(read);
 }
 return result;
}
export const WITNESS_EXPECTED_SLOT=WITNESS_SLOT;
