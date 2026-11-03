import {DomainError} from "./domain.ts";
import {MODEL_SPEC_DIGEST,MODEL_SLOTS,generateModelTrace,modelKey,modelCheckReportFromTrace,validateModelRegistration,type ModelCheckBase,type ModelCheckReport,type ModelHttpObservation,type ModelOperationId} from "./model-checks.ts";

export type ModelCheckFetch=(url:string,init:RequestInit)=>Promise<Response>;
export type ModelCheckOptions={fetch?:ModelCheckFetch;signal?:AbortSignal;requestTimeoutMs?:number;totalTimeoutMs?:number;/** Native loopback tests only; no API/client field. */allowLoopback?:boolean;onCheckpoint?:(trace:ModelHttpObservation[])=>Promise<void>};
class Unavailable extends Error{}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
async function limitedJson(response:Response,signal:AbortSignal):Promise<unknown>{
 if(response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")throw new Unavailable("non_json_response");
 if(Number(response.headers.get("content-length"))>8192)throw new Unavailable("response_too_large");
 const reader=response.body?.getReader();if(!reader)throw new Unavailable("missing_response_body");
 const parts:Uint8Array[]=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",cancel,{once:true});
 try{while(true){if(signal.aborted)throw new Unavailable("request_aborted");const next=await reader.read();if(signal.aborted)throw new Unavailable("request_aborted");if(next.done)break;size+=next.value.length;if(size>8192)throw new Unavailable("response_too_large");parts.push(next.value);}const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw new Unavailable("invalid_json_response");}}
 catch(error){cancel();throw error;}finally{signal.removeEventListener("abort",cancel);reader.releaseLock();}
}

/** Five named synthetic writes, at most24 total requests and20seconds. Every
 * intent is durably checkpointed BEFORE I/O. Checkpoint failure propagates and
 * stops later I/O; an interrupted lease is closed, never resumed with POSTs. */
export async function executeModelCheckRun(input:ModelCheckBase,options:ModelCheckOptions={}):Promise<ModelCheckReport>{
 if(input.modelSpecDigest!==MODEL_SPEC_DIGEST)throw new DomainError("The model specification changed.",409);
 const registration=validateModelRegistration(input.registration,options.allowLoopback),base={...structuredClone(input),registration},plan=generateModelTrace(base.seed);
 modelCheckReportFromTrace(base,[],base.startedAt,"preflight",options);
 const started=Date.parse(base.startedAt),deadline=Math.min(started+20000,Date.now()+Math.min(20000,Math.max(1,options.totalTimeoutMs??20000)));
 const marker={testRunId:base.id,marker:`PBP-${base.id}`},trace:ModelHttpObservation[]=[],fetcher=options.fetch??((url,init)=>fetch(url,init));
 let ordinal=0,requests=0,writes=0,checkpointQueue=Promise.resolve(),checkpointFailed=false;
 const active=new Set<AbortController>();
 async function checkpoint(){
  const snapshot=structuredClone(trace),queued=checkpointQueue.then(async()=>{if(checkpointFailed)throw new Error("model_checkpoint_failed");await options.onCheckpoint?.(snapshot);});checkpointQueue=queued;
  try{await queued;}catch(error){checkpointFailed=true;for(const controller of active)controller.abort();throw error;}
 }
 function allowed(){if(checkpointFailed)throw new Error("model_checkpoint_failed");if(options.signal?.aborted)throw new Unavailable("cancelled");if(Date.parse(registration.expiresAt)<=Date.now())throw new Unavailable("registration_expired");if(base.expiresAt&&Date.parse(base.expiresAt)<=Date.now())throw new Unavailable("run_expired");if(Date.now()>=deadline)throw new Unavailable("run_timeout");}
 async function request(operationId:ModelOperationId,path:string,body?:Record<string,unknown>,suffix?:string){
  allowed();if(requests>=24||body&&writes>=5)throw new Unavailable("request_limit");
  const url=new URL(path,registration.backendBaseUrl),target=new URL(registration.backendBaseUrl);
  if(url.origin!==target.origin||!url.href.startsWith(target.href)||url.search||url.hash)throw new Unavailable("target_mismatch");
  const observation:ModelHttpObservation={operationId,method:body?"POST":"GET",path:url.pathname,invokedOrdinal:++ordinal,completedOrdinal:null,...(body?{request:structuredClone(body),key:modelKey(base.id,suffix!)}:{})};trace.push(observation);
  await checkpoint(); // Never contact a target before the intent is saved.
  let timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();active.add(controller);
  const abort=()=>controller.abort();options.signal?.addEventListener("abort",abort,{once:true});
  try{
   allowed();requests++;if(body)writes++;
   const remaining=deadline-Date.now(),milliseconds=Math.min(remaining,Math.min(8000,Math.max(1,options.requestTimeoutMs??4000)));
   const work=(async()=>{const response=await fetcher(url.href,{method:observation.method,headers:{Accept:"application/json",...(body?{"Content-Type":"application/json","Idempotency-Key":observation.key!,Origin:target.origin}:{})},...(body?{body:JSON.stringify(body)}:{}),credentials:"omit",redirect:"manual",cache:"no-store",signal:controller.signal});
    if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw new Unavailable("request_aborted");}
    if(response.status>=300&&response.status<400||response.type==="opaqueredirect"||response.redirected||response.url&&response.url!==url.href){void response.body?.cancel().catch(()=>{});throw new Unavailable("redirect_blocked");}
    return{status:response.status,body:await limitedJson(response,controller.signal)};})();
   const result=await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Unavailable(remaining<=milliseconds?"run_timeout":"request_timeout"));},milliseconds);const rejectAbort=()=>reject(new Unavailable("cancelled"));controller.signal.addEventListener("abort",rejectAbort,{once:true});if(controller.signal.aborted)rejectAbort();})]);
   observation.status=result.status;observation.body=result.body;
   if(new TextEncoder().encode(JSON.stringify(trace)).byteLength>24576){delete observation.body;observation.unavailableReason="evidence_limit";}
  }catch(error){observation.unavailableReason=error instanceof Unavailable?error.message:"network_unavailable";}
  finally{if(timer)clearTimeout(timer);active.delete(controller);options.signal?.removeEventListener("abort",abort);controller.abort();observation.completedOrdinal=++ordinal;}
  await checkpoint(); // A failure here also propagates; it cannot start another write.
  return observation;
 }
 const get=(id:ModelOperationId,path:string)=>request(id,path);
 function complete(o:ModelHttpObservation){return !o.unavailableReason&&o.status!==undefined&&o.status<500&&o.body!==undefined;}
 function finish(reason?:string){return modelCheckReportFromTrace(base,trace,new Date(Math.max(Date.now(),started)).toISOString(),reason,options);}
 async function readState(phase:"empty"|"seeded"|"final",ids?:Record<"x"|"y"|"z",string>){
  await get(`${phase}_merchant`,`merchant/${base.id}`);
  for(const slot of["a","b","c"]as const)await get(`${phase}_${slot}`,`occupancy/${base.id}/${slot}`);
  if(ids&&phase!=="empty")for(const name of["x","y","z"]as const)await get(`${phase}_${name}`,`bookings/${ids[name]}`);
 }
 function observed(id:ModelOperationId){return trace.find(row=>row.operationId===id)!;}
 function stateMatches(phase:"empty"|"seeded",rows:Record<string,unknown>[]){
  const merchant=observed(`${phase}_merchant`),value=merchant.body;
  if(merchant.status!==200||!object(value)||value.testRunId!==base.id||value.revision!==(registration.bridgeRevision??registration.deploymentRevision)||!Array.isArray(value.bookings)||value.bookings.length!==rows.length)return false;
  const matches=(a:unknown,b:Record<string,unknown>)=>object(a)&&Object.keys(b).every(key=>a[key]===b[key]);
  if(rows.some(row=>!(value.bookings as unknown[]).some(actual=>matches(actual,row))))return false;
  for(const alias of["a","b","c"]as const){const o=observed(`${phase}_${alias}`),b=o.body,active=rows.filter(row=>row.slot===MODEL_SLOTS[alias]);if(o.status!==200||!object(b)||b.testRunId!==base.id||b.revision!==(registration.bridgeRevision??registration.deploymentRevision)||b.slot!==MODEL_SLOTS[alias]||b.guestCount!==active.reduce((sum,row)=>sum+(row.partySize as number),0)||!Array.isArray(b.bookingIds)||JSON.stringify([...b.bookingIds].sort())!==JSON.stringify(active.map(row=>row.id).sort()))return false;}
  if(phase==="seeded")for(const name of["x","y","z"]as const){const o=observed(`seeded_${name}`);if(o.status!==200||!matches(o.body,rows[["x","y","z"].indexOf(name)]))return false;}
  return true;
 }
 try{
  const meta=await get("meta","meta"),m=meta.body,rev=registration.bridgeRevision??registration.deploymentRevision;
  if(!complete(meta)||meta.status!==200||!object(m)||m.protocol!=="booking-lifecycle-http-v1"||m.revision!==rev||m.maxPartySize!==6||m.maxGuestsPerSlot!==8||m.syntheticOnly!==true||m.deploymentAttestation!==false||registration.bridgeRevision!==undefined&&m.nativeRevision!==registration.deploymentRevision)return finish("registered_metadata_not_established");
  await readState("empty");if(!trace.every(complete)||!stateMatches("empty",[]))return finish("initial_state_not_empty_or_unavailable");
  const parties=[plan.p,plan.p,8-plan.p],slots=[MODEL_SLOTS[plan.source],MODEL_SLOTS[plan.target],MODEL_SLOTS[plan.target]],suffixes=["source-create","cancel-five","cancel-three"],native:Record<string,unknown>[]=[];
  for(const[name,i]of[["x",0],["y",1],["z",2]]as const){const body={...marker,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:slots[i],partySize:parties[i]},o=await request(`create_${name}`,"bookings",body,suffixes[i]),r=o.body;
   if(!complete(o)||o.status!==201||!object(r)||typeof r.id!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(r.id)||native.some(row=>row.id===r.id)||!Object.keys(body).every(key=>r[key]===body[key as keyof typeof body])||r.status!=="active"||r.revision!==rev||r.idempotencyKey!==modelKey(base.id,suffixes[i]))return finish("seed_creation_not_established");native.push({...body,id:r.id,status:"active",revision:rev,idempotencyKey:r.idempotencyKey});
  }
  const ids={x:native[0].id as string,y:native[1].id as string,z:native[2].id as string};
  await readState("seeded",ids);if(!trace.every(complete)||!stateMatches("seeded",native))return finish("seed_readbacks_not_established");
  // Both requests register durable intents before each fetch. The oracle uses
  // their real invocation/completion ordinals, not this source array's order.
  await Promise.all([request("cancel_y",`bookings/${ids.y}/cancel`,marker,"cancel-first"),request("transfer_x",`bookings/${ids.x}/move`,{...marker,slot:MODEL_SLOTS[plan.target]},"move-full")]);
  await readState("final",ids);return finish();
 }catch(error){if(checkpointFailed)throw error;if(error instanceof Unavailable)return finish(error.message);throw error;}
}
