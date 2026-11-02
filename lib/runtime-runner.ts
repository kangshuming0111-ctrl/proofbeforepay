import { DomainError } from "./domain.ts";
import { runtimeDeliveryDigest, runtimeIdentifier, runtimeReportMethod, runtimeReportSummary, validateRuntimePlan, validateRuntimeTarget, type RuntimeCheckPlan, type RuntimeCheckReport, type RuntimeCheckStep, type RuntimeCheckTarget } from "./runtime-checks.ts";
import {registrationTarget,validateRuntimeRegistrationSnapshot,type RuntimeRegistrationSnapshot} from "./runtime-registration.ts";

export type RuntimeFetch = (url: string, init: RequestInit) => Promise<Response>;
export type RuntimeCheckInput = {deliveryId: string; deliveryDigest: string; runId: string; plan: RuntimeCheckPlan; target: RuntimeCheckTarget; startedAt?: string;registration?:RuntimeRegistrationSnapshot};
export type RuntimeCheckOptions = {fetch?: RuntimeFetch; allowLoopback?: boolean; signal?: AbortSignal; requestTimeoutMs?: number; totalTimeoutMs?: number; /** Trusted server recovery of an expired, persisted run; never a client payload field. */ resuming?: boolean; /** Close an abandoned persisted lease without contacting a revoked target. Never a client field. */ noNetworkReason?: "registration_no_longer_approved"};
const RESPONSE_BYTES = 16 * 1024;
const FIELDS = ["testRunId","marker","customer","email","slot","partySize","revision"] as const;
class Unavailable extends Error {}

function plain(value: unknown): value is Record<string,unknown> {return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;}
function receiptId(value: unknown): value is string {return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(value);}
function stamp(value?: string): string {
  const result = value ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(result))) throw new DomainError("Runtime run time is invalid.");
  return result;
}
async function jsonLimited(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > RESPONSE_BYTES) throw new Unavailable("response_too_large");
  const contentType = response.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new Unavailable("non_json_response");
  const reader = response.body?.getReader();
  if (!reader) throw new Unavailable("missing_response_body");
  const chunks: Uint8Array[] = []; let size=0;
  try {
    while (true) {
      const {value,done}=await reader.read(); if(done)break;
      size+=value.byteLength;
      if(size>RESPONSE_BYTES) {await reader.cancel();throw new Unavailable("response_too_large");}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const joined=new Uint8Array(size);let offset=0;for(const part of chunks){joined.set(part,offset);offset+=part.length;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(joined));}catch{throw new Unavailable("invalid_json_response");}
}

/** A bounded protocol against an operator-registered disposable backend. The
 * caller must persist an exact-delivery run lease before invoking this function.
 * This observes an HTTP protocol; it does not execute a UI, prove durable database
 * storage, inspect arbitrary code, deliver email or accept/pay for any work. */
export async function executeRuntimeCheck(input: RuntimeCheckInput, options: RuntimeCheckOptions = {}): Promise<RuntimeCheckReport> {
  const deliveryId=runtimeIdentifier(input.deliveryId,"Runtime delivery ID"),runId=runtimeIdentifier(input.runId,"Runtime run ID");
  const deliveryDigest=runtimeDeliveryDigest(input.deliveryDigest);
  const plan=validateRuntimePlan(input.plan),target=validateRuntimeTarget(input.target,{allowLoopback:options.allowLoopback});
  if((target.protocol??"booking-http-v1")!==plan.protocol)throw new DomainError("The registered target does not support this agreed protocol.");
  const registration=input.registration===undefined?undefined:validateRuntimeRegistrationSnapshot(input.registration);
  if(registration&&(registration.frontendBundleDigest!==deliveryDigest||JSON.stringify(validateRuntimeTarget(registrationTarget(registration)))!==JSON.stringify(target)))throw new DomainError("The runtime registration differs from the uploaded frontend and target.",409);
  const policy=plan.protocol==="booking-http-v2"?plan.policy:undefined,maxRequests=policy?18:8;
  const startedAt=stamp(input.startedAt), deadline=Date.now()+Math.min(30_000,Math.max(1,options.totalTimeoutMs??30_000));
  const perRequest=Math.min(4_000,Math.max(1,options.requestTimeoutMs??4_000));
  const fetcher=options.fetch??((url,init)=>fetch(url,init));
  const marker=`PBP-${runId}`, key=`pbp-${runId}`;
  const payload={testRunId:runId,marker,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:"2099-01-01T10:00:00Z",partySize:policy?1:2};
  const expectedRecord={...payload,revision:target.revision};
  const definitions: [string,string,"GET"|"POST",string,string][]=[
    ["revision","Declared target revision","GET","meta",`HTTP 200 and declared revision ${target.revision}`],
    ["missing_slot","Reject missing slot","POST","bookings","HTTP 400 or 422 and JSON code synthetic_validation_failed for a missing slot"],
    ["invalid_email","Reject malformed email","POST","bookings","HTTP 400 or 422 and JSON code synthetic_validation_failed for a malformed email"],
    ["create",policy?"Create a minimum-size booking (1 guest)":"Create a synthetic booking","POST","bookings",policy?"HTTP 201, a receipt ID and exact fields for one guest":"HTTP 201, a receipt ID and the exact synthetic booking fields"],
    ["readback","Read the booking independently","GET","bookings/:id","HTTP 200 with the same ID and original fields; request carries no expected marker"],
    ["replay","Replay the same idempotency key","POST","bookings","HTTP 200 or 201 with the same ID and original fields"],
    ["conflict","Reject changed data with the same key","POST","bookings","HTTP 409 and JSON code idempotency_conflict when the same key carries a different valid party size"],
    ["unchanged","Read the original record again","GET","bookings/:id","HTTP 200 with the original fields unchanged"],
  ];
  if(policy)definitions.push(
    ["party_zero","Reject zero guests","POST","bookings","HTTP 400/422 and JSON code party_size_invalid for zero guests"],
    ["party_fraction","Reject a fractional guest count","POST","bookings","HTTP 400/422 and JSON code party_size_invalid for 1.5 guests"],
    ["party_below","Accept one below the agreed maximum","POST","bookings",`HTTP 200/201 and exact fields for ${policy.maxPartySize-1} guests`],
    ["party_below_readback","Read back the below-limit booking","GET","bookings/:id",`HTTP 200 with the original ${policy.maxPartySize-1}-guest record`],
    ["party_exact","Accept the agreed maximum","POST","bookings",`HTTP 200/201 and exact fields for ${policy.maxPartySize} guests`],
    ["party_exact_readback","Read back the maximum-size booking","GET","bookings/:id",`HTTP 200 with the original ${policy.maxPartySize}-guest record`],
    ["party_above","Reject one above the agreed maximum","POST","bookings",`HTTP 400/422 and JSON code party_size_exceeded for ${policy.maxPartySize+1} guests`],
    ["concurrent_first","First simultaneous same-key request","POST","bookings","Pair has exactly one201 and one200, same ID and original fields"],
    ["concurrent_second","Second simultaneous same-key request","POST","bookings","Pair has exactly one201 and one200, same ID and original fields"],
    ["concurrent_readback","Read back the concurrent receipt","GET","bookings/:id","HTTP 200 with the agreed original fields and the same receipt ID"],
  );
  const steps:RuntimeCheckStep[]=definitions.map(([id,label,method,path,expected])=>({id,label,method,path,expected,outcome:"unavailable",reason:"not_run"}));
  let requests=0;
  async function request(step: RuntimeCheckStep, body?: Record<string,unknown>, idempotencyKey?:string): Promise<{status:number;data:unknown}> {
    if(options.signal?.aborted)throw new Unavailable("cancelled");
    if(options.noNetworkReason)throw new Unavailable(options.noNetworkReason);
    // Approval may expire after the route has committed its run lease. Retain
    // an unavailable report so that lease can finish; never start another HTTP
    // request after expiry, including midway through a valid-started run.
    if(registration&&Date.parse(registration.expiresAt)<=Date.now())throw new Unavailable("registration_expired");
    if(++requests>maxRequests)throw new Unavailable("request_limit");
    const remaining=deadline-Date.now();if(remaining<=0)throw new Unavailable("run_timeout");
    const url=new URL(step.path,target.baseUrl);
    if(url.origin!==new URL(target.baseUrl).origin||!url.href.startsWith(target.baseUrl)||url.search||url.hash)throw new Unavailable("target_mismatch");
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined; let cancel:(()=>void)|undefined;
    const operation=Promise.resolve().then(async()=>{
      const headers:Record<string,string>={Accept:"application/json","Cache-Control":"no-cache"};
      if(body){headers["Content-Type"]="application/json";if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;}
      const response=await fetcher(url.href,{method:step.method,headers,...(body?{body:JSON.stringify(body)}:{}),redirect:"manual",credentials:"omit",cache:"no-store",signal:controller.signal});
      if(response.status>=300&&response.status<400||response.redirected||response.url&&response.url!==url.href)throw new Unavailable("redirect_blocked");
      return {status:response.status,data:await jsonLimited(response)};
    });
    try {
      return await Promise.race([operation,new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>{controller.abort();reject(new Unavailable(remaining<=perRequest?"run_timeout":"request_timeout"));},Math.min(remaining,perRequest));
        cancel=()=>{controller.abort();reject(new Unavailable("cancelled"));};options.signal?.addEventListener("abort",cancel,{once:true});
        if(options.signal?.aborted)cancel();
      })]);
    } catch(error){throw error instanceof Unavailable?error:new Unavailable("network_unavailable");}
    finally {if(timer)clearTimeout(timer);if(cancel)options.signal?.removeEventListener("abort",cancel);controller.abort();}
  }
  async function perform(index:number, body:Record<string,unknown>|undefined, idempotencyKey:string|undefined, check:(response:{status:number;data:unknown})=>{matches:boolean;actual:string}):Promise<boolean>{
    const step=steps[index];
    try {
      const response=await request(step,body,idempotencyKey);const result=check(response);
      Object.assign(step,{status:response.status,outcome:result.matches?"observed":"mismatch",actual:result.actual});delete step.reason;return result.matches;
    }catch(error){step.outcome="unavailable";step.reason=error instanceof Unavailable?error.message:"network_unavailable";return false;}
  }
  function compareRecord(data:unknown,id?:string,partySize=payload.partySize):{matches:boolean;actual:string;id?:string}{
    if(!plain(data))return{matches:false,actual:"Expected a JSON booking record object."};
    const candidate=receiptId(data.id)?data.id:undefined;
    const expected={...expectedRecord,partySize};
    const mismatches:string[]=FIELDS.filter(field=>data[field]!==expected[field]);
    if(!candidate||id!==undefined&&candidate!==id)mismatches.unshift("id");
    return {matches:!!candidate&&(id===undefined||candidate===id)&&mismatches.length===0,actual:JSON.stringify({...(candidate?{id:candidate}:{}),matchedFields:FIELDS.filter(field=>data[field]===expected[field]),mismatchedFields:[...new Set(mismatches)],...(id!==undefined?{sameReceiptId:candidate===id}:{})}),...(candidate?{id:candidate}:{})};
  }
  const revisionGood=await perform(0,undefined,undefined,response=>{
    const data=response.data;
    const association=!registration||plain(data)&&data.registrationRevision===registration.registrationRevision&&data.projectId===registration.projectId&&data.frontendBundleDigest===registration.frontendBundleDigest&&(!registration.backendArtifactDigest||data.backendArtifactDigest===registration.backendArtifactDigest)&&(!registration.backendSourceCommit||data.backendSourceCommit===registration.backendSourceCommit);
    const matches=response.status===200&&plain(data)&&data.revision===target.revision&&(!policy||data.protocol==="booking-http-v2")&&association;
    return{matches,actual:matches?`Declared revision matched: ${target.revision}${registration?"; declared registration association matched (not deployment attestation)":""}`:"Declared revision, protocol, registration association or HTTP status did not match; no booking writes were attempted."};
  });
  if(revisionGood){
    const missingSlot:Record<string,unknown>={...payload};delete missingSlot.slot;
    const validationRejected=(response:{status:number;data:unknown})=>{
      const codeMatches=plain(response.data)&&response.data.code==="synthetic_validation_failed";
      return{matches:[400,422].includes(response.status)&&codeMatches,actual:`HTTP ${response.status}; structured validation code ${codeMatches?"matched":"did not match"}.`};
    };
    await perform(1,missingSlot,`${key}-missing-slot`,validationRejected);
    await perform(2,{...payload,email:"not-an-email"},`${key}-invalid-email`,validationRejected);
    let id:string|undefined,recoveredReceipt=false;
    const created=await perform(3,payload,key,response=>{
      const record=compareRecord(response.data);
      recoveredReceipt=options.resuming===true&&response.status===200&&record.matches;
      if(record.matches&&(response.status===201||recoveredReceipt))id=record.id;
      return{matches:response.status===201&&record.matches,actual:`HTTP ${response.status}; ${record.actual}`};
    });
    if(recoveredReceipt){
      // A prior attempt may have committed before its report was saved. The
      // same key safely recovers that exact receipt, but its original creation
      // response is unknown; never turn a replay200 into an observed create201.
      steps[3].outcome="unavailable";steps[3].reason="resumed_creation_not_observed";
      steps[3].actual=`${steps[3].actual} Recovered the exact receipt on a resumed run; the original creation response was not observed.`;
    }
    if((created||recoveredReceipt)&&id){
      steps[4].path=`bookings/${encodeURIComponent(id)}`;steps[7].path=steps[4].path;
      await perform(4,undefined,undefined,response=>{const record=compareRecord(response.data,id);return{matches:response.status===200&&record.matches,actual:`HTTP ${response.status}; ${record.actual}`};});
      await perform(5,payload,key,response=>{const record=compareRecord(response.data,id);return{matches:[200,201].includes(response.status)&&record.matches,actual:`HTTP ${response.status}; ${record.actual}`};});
      await perform(6,{...payload,partySize:policy?2:3},key,response=>{
        const codeMatches=plain(response.data)&&response.data.code==="idempotency_conflict";
        return{matches:response.status===409&&codeMatches,actual:`HTTP ${response.status}; structured idempotency-conflict code ${codeMatches?"matched":"did not match"}.`};
      });
      await perform(7,undefined,undefined,response=>{const record=compareRecord(response.data,id);return{matches:response.status===200&&record.matches,actual:`HTTP ${response.status}; ${record.actual}`};});
    }else{for(const step of steps.slice(4,8))step.reason="create_not_verified";}
    if(policy){
      const reject=(code:string)=>(response:{status:number;data:unknown})=>{const matched=plain(response.data)&&response.data.code===code;return{matches:[400,422].includes(response.status)&&matched,actual:`HTTP ${response.status}; expected structured code ${code} ${matched?"matched":"did not match"}.`};};
      await perform(8,{...payload,partySize:0},`${key}-zero`,reject("party_size_invalid"));
      await perform(9,{...payload,partySize:1.5},`${key}-fraction`,reject("party_size_invalid"));
      async function boundary(index:number,partySize:number,suffix:string){
        let receipt:string|undefined;
        const accepted=await perform(index,{...payload,partySize},`${key}-${suffix}`,response=>{const record=compareRecord(response.data,undefined,partySize);if([200,201].includes(response.status)&&record.matches)receipt=record.id;return{matches:[200,201].includes(response.status)&&record.matches,actual:`HTTP ${response.status}; requested partySize ${partySize}; ${record.actual}`};});
        if(accepted&&receipt){steps[index+1].path=`bookings/${receipt}`;await perform(index+1,undefined,undefined,response=>{const record=compareRecord(response.data,receipt,partySize);return{matches:response.status===200&&record.matches,actual:`HTTP ${response.status}; ${record.actual}`};});}
        else steps[index+1].reason="boundary_not_verified";
      }
      await boundary(10,policy.maxPartySize-1,"below");
      await boundary(12,policy.maxPartySize,"exact");
      await perform(14,{...payload,partySize:policy.maxPartySize+1},`${key}-above`,reject("party_size_exceeded"));
      // Initiate both requests before awaiting either response. Equality of two
      // receipts is bounded HTTP evidence, not proof of hidden database counts.
      const pair=await Promise.allSettled([request(steps[15],payload,`${key}-concurrent`),request(steps[16],payload,`${key}-concurrent`)]);
      const first=pair[0].status==="fulfilled"?pair[0].value:undefined,second=pair[1].status==="fulfilled"?pair[1].value:undefined;
      const a=first?compareRecord(first.data):undefined,b=second?compareRecord(second.data,a?.id):undefined;
      const consistent=!!first&&!!second&&!!a?.matches&&!!b?.matches&&[200,201].includes(first.status)&&[200,201].includes(second.status);
      const fresh=consistent&&[first!.status,second!.status].sort().join(",")==="200,201";
      const resumed=consistent&&options.resuming===true&&first!.status===200&&second!.status===200;
      for(let offset=0;offset<2;offset++){
        const result=pair[offset],step=steps[15+offset];
        if(result.status==="rejected"){step.reason=result.reason instanceof Unavailable?result.reason.message:"network_unavailable";continue;}
        const record=compareRecord(result.value.data,a?.id);
        const missingPeer=!first||!second;
        Object.assign(step,{status:result.value.status,outcome:resumed||missingPeer?"unavailable":fresh?"observed":"mismatch",actual:`HTTP ${result.value.status}; pairSameReceipt: ${consistent}; exactlyOneCreatedResponse: ${fresh}; ${record.actual}`});
        if(missingPeer)step.reason="concurrent_peer_unavailable";else if(resumed)step.reason="resumed_concurrency_not_observed";else delete step.reason;
      }
      if(consistent&&a?.id){steps[17].path=`bookings/${a.id}`;await perform(17,undefined,undefined,response=>{const record=compareRecord(response.data,a.id);return{matches:response.status===200&&record.matches,actual:`HTTP ${response.status}; ${record.actual}`};});}
      else steps[17].reason="concurrent_not_verified";
    }
  }else{for(const step of steps.slice(1))step.reason="revision_not_verified";}
  return {id:runId,deliveryId,deliveryDigest,runId,method:runtimeReportMethod(plan),startedAt,finishedAt:new Date().toISOString(),target:{id:target.id,label:target.label,origin:new URL(target.baseUrl).origin,revision:target.revision,...(registration?{registration}: {})},plan,steps,summary:runtimeReportSummary(steps)};
}
