import {DomainError} from "./domain.ts";
import {validateJourneyRegistration,type JourneyRegistrationSnapshot} from "./project-journey.ts";
import {timePolicyBudget,timePolicyProtocol,timePolicyRecordMatches,evaluateTimeTrace,validateTimePolicy,validateTimeSession,type TimePolicySession,type TimeTrace,type TimeCaseResult} from "./time-policy.ts";
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
class Unknown extends Error{}
function plain(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
async function limited(response:Response,signal:AbortSignal){
 if(response.headers.get("content-type")?.split(";",1)[0].trim()!=="application/json"||Number(response.headers.get("content-length"))>4096)throw new Unknown("response_not_bounded_json");const reader=response.body?.getReader();if(!reader)throw new Unknown("missing_response_body");const chunks:Uint8Array[]=[];let n=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener("abort",cancel,{once:true});
 try{while(true){if(signal.aborted)throw new Unknown("request_timeout");const part=await reader.read();if(part.done)break;n+=part.value.length;if(n>4096){await reader.cancel();throw new Unknown("response_not_bounded_json");}chunks.push(part.value);}const bytes=new Uint8Array(n);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch(error){if(error instanceof Unknown)throw error;throw new Unknown("response_not_bounded_json");}finally{signal.removeEventListener("abort",cancel);reader.releaseLock();}
}
/** Run only the affirmative synthetic clock protocol nested inside an already
 * approved lifecycle base. It never sends the oracle's expected answer, accepts
 * a caller URL, retries a write, drives a browser or changes acceptance/payment. */
export async function executeTimePolicy(sessionValue:TimePolicySession,registrationValue:JourneyRegistrationSnapshot,options:{fetch?:Fetcher;guard:()=>Promise<void>;onTrace:(trace:TimeTrace[])=>Promise<void>;timeoutMs?:number}):Promise<{trace:TimeTrace[];results:TimeCaseResult[];reason?:string}>{
 const session=validateTimeSession(sessionValue),registration=validateJourneyRegistration(registrationValue);if(registration.projectId!==session.projectId||registration.frontendBundleDigest!==session.deliveryDigest||registration.id!==session.targetId||JSON.stringify(registration)!==JSON.stringify(session.registration))throw new DomainError("Time test target does not match the exact delivery.",409);
 const budget=timePolicyBudget(session.plan.policy),trace:TimeTrace[]=[],results:TimeCaseResult[]=[],deadline=Date.now()+45000,base=new URL("time-policy/",registration.backendBaseUrl);
 async function request(method:"GET"|"POST",path:string,input?:Record<string,unknown>){
  if(trace.length>=budget.maxRequests||method==="POST"&&trace.filter(t=>t.method==="POST").length>=budget.maxPosts||Date.now()>=deadline)throw new Unknown("request_budget_exhausted");await options.guard();if(Date.parse(registration.expiresAt)<=Date.now()||session.expiresAt&&Date.parse(session.expiresAt)<=Date.now())throw new Unknown("approval_or_run_expired");
  const url=new URL(path,base);if(url.origin!==base.origin||!url.href.startsWith(base.href)||url.search||url.hash)throw new Unknown("target_mismatch");const index=trace.length;trace.push({index,method,path:url.pathname,...(input?{request:structuredClone(input)}:{}),state:"pending"});await options.onTrace(structuredClone(trace));
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{const work=(async()=>{const response=await(options.fetch??fetch)(url.href,{method,headers:{Accept:"application/json",...(method==="POST"?{"Content-Type":"application/json"}:{})},credentials:"omit",redirect:"manual",cache:"no-store",signal:controller.signal,...(input?{body:JSON.stringify(input)}:{})});if(response.status>=300&&response.status<400||response.redirected||response.type==="opaqueredirect"||response.url&&response.url!==url.href){void response.body?.cancel();throw new Unknown("redirect_blocked");}return{status:response.status,body:await limited(response,controller.signal)};})();
   const response=await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Unknown("request_timeout"));},Math.min(4000,Math.max(1,options.timeoutMs??4000),Math.max(1,deadline-Date.now())));})]);trace[index]={...trace[index],state:"recorded",status:response.status,body:response.body};await options.onTrace(structuredClone(trace));return response;
  }catch(error){trace[index]={...trace[index],state:"unknown",reason:error instanceof Unknown?error.message:"network_or_storage_unavailable"};await options.onTrace(structuredClone(trace));throw new Unknown(trace[index].reason);}
  finally{if(timer)clearTimeout(timer);controller.abort();}
 }
 const envelope=(caseId:string,localStart:string,now:string)=>({testRunId:session.id,caseId,marker:`PBP-${session.id}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",localStart,now});
 const bodyRecord=(value:unknown,caseId:string,localStart:string,status:"active"|"cancelled",id?:string)=>timePolicyRecordMatches(value,session,caseId,localStart,status,id);
 try{
  const metadata=await request("GET","meta");let matched=false;try{matched=metadata.status===200&&plain(metadata.body)&&metadata.body.protocol===timePolicyProtocol(session.plan.policy)&&metadata.body.syntheticOnly===true&&metadata.body.testClock===true&&metadata.body.deploymentRevision===registration.deploymentRevision&&JSON.stringify(validateTimePolicy(metadata.body.policy))===JSON.stringify(session.plan.policy);}catch{/* Unsupported protocol: stop before any write. */}
  if(!matched)return{trace,...evaluateTimeTrace(session,registration,trace)};
  for(const item of session.cases){
   if(item.operation==="create"){
    const write=await request("POST","bookings",envelope(item.id,item.localStart,item.now)),read=await request("GET",`cases/${session.id}/${item.id}`);
    const good=item.expected.allowed?write.status===201&&bodyRecord(write.body,item.id,item.localStart,"active")&&read.status===200&&bodyRecord(read.body,item.id,item.localStart,"active",(write.body as Record<string,unknown>).id as string):write.status===422&&plain(write.body)&&write.body.code===item.expected.code&&read.status===404;
    results.push({id:item.id,outcome:good?"observed":"mismatch",reason:good?"response_and_independent_readback_match":"response_or_native_record_differs"});
   }else{
    const setupId=`${item.id}-setup`,start=Date.parse(item.expected.utcCandidates[0]),setupNow=new Date(start-(Math.max(session.plan.policy.leadMinutes,session.plan.policy.cancelMinutes)+60)*60000).toISOString();
    const setup=await request("POST","bookings",envelope(setupId,item.localStart,setupNow)),baseline=await request("GET",`cases/${session.id}/${setupId}`);
    if(setup.status!==201||!bodyRecord(setup.body,setupId,item.localStart,"active")||baseline.status!==200||!bodyRecord(baseline.body,setupId,item.localStart,"active",(setup.body as Record<string,unknown>).id as string)){results.push({id:item.id,outcome:"unknown",reason:"cancellation_setup_not_established"});continue;}
    const id=(setup.body as Record<string,unknown>).id as string,write=await request("POST",`bookings/${id}/cancel`,{testRunId:session.id,caseId:item.id,now:item.now}),read=await request("GET",`cases/${session.id}/${setupId}`);
    const good=item.expected.allowed?write.status===200&&read.status===200&&bodyRecord(read.body,setupId,item.localStart,"cancelled",id):write.status===422&&plain(write.body)&&write.body.code===item.expected.code&&read.status===200&&bodyRecord(read.body,setupId,item.localStart,"active",id);
    results.push({id:item.id,outcome:good?"observed":"mismatch",reason:good?"cancellation_and_preserved_state_match":"cancellation_or_preserved_state_differs"});
   }
  }
  return{trace,...evaluateTimeTrace(session,registration,trace)};
 }catch(error){const reason=error instanceof Unknown?error.message:"authorization_or_state_changed";return{trace,...evaluateTimeTrace(session,registration,trace,reason)};}
}
