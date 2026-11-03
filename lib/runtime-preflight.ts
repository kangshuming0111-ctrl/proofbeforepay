import {validateRuntimeTarget,type RuntimeCheckTarget,type RuntimeCheckPlan} from "./runtime-checks.ts";
import {registrationTarget,validateRuntimeRegistrationSnapshot,type RuntimeRegistrationSnapshot} from "./runtime-registration.ts";
import {diagnoseRuntimeMetadata,type RuntimeMetadataDiagnosis} from "./runtime-metadata.ts";
import {DomainError} from "./domain.ts";

export type RuntimePreflightUnavailableReason="network_unavailable"|"timeout"|"cancelled"|"redirect_blocked"|"access_denied"|"http_error"|"non_json_response"|"response_too_large"|"invalid_json_response"|"registration_expired";
type Binding={deliveryId:string;targetId:string;protocol:RuntimeCheckPlan["protocol"];checkedAt:string;method:"server-booking-meta-preflight-v1"};
export type RuntimePreflightResult=Binding&({status:"matched"|"mismatch";diagnosis:RuntimeMetadataDiagnosis}|{status:"unavailable";reason:RuntimePreflightUnavailableReason});
export type RuntimePreflightFetch=(url:string,init:RequestInit)=>Promise<Response>;
type Options={fetch?:RuntimePreflightFetch;signal?:AbortSignal;timeoutMs?:number};
class Unavailable extends Error{
  readonly reason:RuntimePreflightUnavailableReason;
  constructor(reason:RuntimePreflightUnavailableReason){super(reason);this.reason=reason;}
}
const MAX_BYTES=16*1024;

async function readMetadata(response:Response,signal:AbortSignal):Promise<unknown>{
  const declared=Number(response.headers.get("content-length"));
  if(Number.isFinite(declared)&&declared>MAX_BYTES){void response.body?.cancel().catch(()=>{});throw new Unavailable("response_too_large");}
  if(response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json"){void response.body?.cancel().catch(()=>{});throw new Unavailable("non_json_response");}
  const reader=response.body?.getReader();if(!reader)throw new Unavailable("invalid_json_response");
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener("abort",cancel,{once:true});
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){if(signal.aborted)throw signal.reason instanceof Unavailable?signal.reason:new Unavailable("cancelled");const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new Unavailable("response_too_large");}chunks.push(value);}}
  finally{signal.removeEventListener("abort",cancel);reader.releaseLock();}
  const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(joined));}catch{throw new Unavailable("invalid_json_response");}
}

/** One bounded GET of the already approved target. No booking endpoint, model,
 * payment, caller URL, authentication material or persisted report is used. */
export async function runRuntimePreflight(input:{deliveryId:string;target:RuntimeCheckTarget;protocol:RuntimeCheckPlan["protocol"];registration?:RuntimeRegistrationSnapshot},options:Options={}):Promise<RuntimePreflightResult>{
  const target=validateRuntimeTarget(input.target),registration=input.registration===undefined?undefined:validateRuntimeRegistrationSnapshot(input.registration);
  if((target.protocol??"booking-http-v1")!==input.protocol)throw new DomainError("The preflight target does not match the agreed protocol.",409);
  if(registration&&JSON.stringify(validateRuntimeTarget(registrationTarget(registration)))!==JSON.stringify(target))throw new DomainError("The preflight target differs from the saved registration.",409);
  const binding:Binding={deliveryId:input.deliveryId,targetId:target.id,protocol:input.protocol,checkedAt:new Date().toISOString(),method:"server-booking-meta-preflight-v1"};
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>controller.abort(new Unavailable("cancelled"));
  options.signal?.addEventListener("abort",cancel,{once:true});
  try{
    if(options.signal?.aborted)throw new Unavailable("cancelled");
    if(registration&&Date.parse(registration.expiresAt)<=Date.now())throw new Unavailable("registration_expired");
    const url=new URL("meta",target.baseUrl);
    if(!url.href.startsWith(target.baseUrl)||url.origin!==new URL(target.baseUrl).origin||url.search||url.hash)throw new DomainError("The preflight path is not inside the approved target.",409);
    const operation=Promise.resolve().then(async()=>{
      const response=await(options.fetch??fetch)(url.href,{method:"GET",headers:{Accept:"application/json","Cache-Control":"no-cache"},credentials:"omit",redirect:"manual",cache:"no-store",signal:controller.signal});
      if(response.status>=300&&response.status<400||response.redirected||response.url&&response.url!==url.href)throw new Unavailable("redirect_blocked");
      if(response.status===401||response.status===403)throw new Unavailable("access_denied");
      if(response.status!==200)throw new Unavailable("http_error");
      return readMetadata(response,controller.signal);
    });
    const metadata=await Promise.race([operation,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{controller.abort(new Unavailable("timeout"));reject(new Unavailable("timeout"));},Math.min(4000,Math.max(1,options.timeoutMs??4000)));
      controller.signal.addEventListener("abort",()=>reject(controller.signal.reason instanceof Unavailable?controller.signal.reason:new Unavailable("cancelled")),{once:true});
    })]);
    const diagnosis=diagnoseRuntimeMetadata(metadata,{revision:target.revision,protocol:input.protocol,registration});
    return{...binding,status:diagnosis.matches?"matched":"mismatch",diagnosis};
  }catch(error){
    if(error instanceof DomainError)throw error;
    return{...binding,status:"unavailable",reason:error instanceof Unavailable?error.reason:"network_unavailable"};
  }finally{if(timer)clearTimeout(timer);options.signal?.removeEventListener("abort",cancel);controller.abort();}
}
