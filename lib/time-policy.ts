import {DomainError} from "./domain.ts";
import {validateJourneyRegistration,type JourneyRegistrationSnapshot} from "./project-journey.ts";

export const TIME_POLICY_PROTOCOL="time-policy-http-v1";
export const TIME_POLICY_PROTOCOL_V2="time-policy-http-v2";
export const TIME_POLICY_LIMIT=12;
export const TIME_POLICY_BYTES=128*1024;
export type TimePolicy={timezone:string;weekdays:number[];opens:string;closes:string;leadMinutes:number;cancelMinutes:number;calendar?:{version:2;closedDates:string[]}};
export type TimePolicyPlan={policy:TimePolicy;testDate:string;gapLocal?:string;foldLocal?:string;sourceNote:string;provenance:"buyer-confirmed-supplemental-agreement"};
export type TimeDecision={allowed:boolean;code:"allowed"|"nonexistent_local_time"|"ambiguous_local_time"|"closed"|"lead_time"|"cancellation_deadline";utcCandidates:string[]};
export type TimeCase={id:string;label:string;operation:"create"|"cancel";localStart:string;now:string;expected:TimeDecision};
export type TimeTrace={index:number;method:"GET"|"POST";path:string;request?:Record<string,unknown>;state:"pending"|"recorded"|"unknown";status?:number;body?:unknown;reason?:string};
export type TimeCaseResult={id:string;outcome:"observed"|"mismatch"|"unknown";reason:string};
export type TimePolicySession={id:string;projectId:string;deliveryId:string;deliveryDigest:string;createdBy:string;createdAt:string;updatedAt:string;version:number;status:"planned"|"running"|"complete"|"unknown";plan:TimePolicyPlan;cases:TimeCase[];trace:TimeTrace[];targetId?:string;registration?:JourneyRegistrationSnapshot;startedBy?:string;startedAt?:string;expiresAt?:string;results?:TimeCaseResult[];reason?:string};
const DATE=/^(202[5-9]|203[0-5])-\d\d-\d\d$/u;
const LOCAL=/^(202[5-9]|203[0-5])-\d\d-\d\dT\d\d:\d\d$/u;
export const DEFAULT_TIME_PLAN:TimePolicyPlan={policy:{timezone:"Australia/Melbourne",weekdays:[1,2,3,4,5,6,7],opens:"11:00",closes:"20:00",leadMinutes:120,cancelMinutes:1440},testDate:"2027-01-15",gapLocal:"2027-10-03T02:30",foldLocal:"2027-04-04T02:30",sourceNote:"Additional test agreement: Melbourne local opening 11:00–20:00 daily, at least120minutes notice; cancellation at least1440minutes before start. Reject nonexistent and ambiguous local times.",provenance:"buyer-confirmed-supplemental-agreement"};
export const CALENDAR_TIME_PLAN:TimePolicyPlan={policy:{timezone:"Australia/Melbourne",weekdays:[5],opens:"22:00",closes:"02:00",leadMinutes:120,cancelMinutes:1440,calendar:{version:2,closedDates:["2027-01-22","2027-01-30"]}},testDate:"2027-01-15",gapLocal:"2027-10-03T02:30",foldLocal:"2027-04-04T02:30",sourceNote:"Additional calendar agreement: Friday opening22:00 until02:00 next day in Melbourne. Opening weekdays belong to the starting date. Local dates2027-01-22 and2027-01-30 are closed throughout; a closed opening date creates no next-day spill. Book at least120minutes ahead and cancel at least1440minutes ahead. Reject nonexistent/ambiguous civil minutes.",provenance:"buyer-confirmed-supplemental-agreement"};
export function timePolicyProtocol(policy:TimePolicy){return policy.calendar?TIME_POLICY_PROTOCOL_V2:TIME_POLICY_PROTOCOL;}
export function timePolicyBudget(policy:TimePolicy){return policy.calendar?{maxRequests:50,maxPosts:24}:{maxRequests:40,maxPosts:18};}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(k=>typeof k!=="string"||!("value"in Object.getOwnPropertyDescriptor(value,k)!)))throw new DomainError("Time policy needs ordinary JSON.");return value as Record<string,unknown>;}
function keys(x:Record<string,unknown>,allowed:string[]){if(Object.keys(x).some(k=>!allowed.includes(k)))throw new DomainError("Time policy has unsupported fields.");}
function epoch(local:string){const t=Date.parse(`${local}:00.000Z`);if(!LOCAL.test(local)||!Number.isFinite(t)||new Date(t).toISOString().slice(0,16)!==local)throw new DomainError("Use a valid local minute between2025and2035.");return t;}
function formatter(zone:string){return new Intl.DateTimeFormat("en-GB-u-ca-gregory-nu-latn",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});}
function civilAt(time:number,fmt:Intl.DateTimeFormat){const parts=Object.fromEntries(fmt.formatToParts(new Date(time)).map(p=>[p.type,p.value]));return`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;}
/** Derive candidate offsets around this modern civil date, then round-trip
 * every candidate through ICU. A gap has0candidates and a fold2; never guess
 * an earlier/later offset or interpret a civil string in the host timezone. */
export function resolveCivilTime(local:string,timezone:string):string[]{
 const wanted=epoch(local);let fmt:Intl.DateTimeFormat;try{fmt=formatter(timezone);}catch{throw new DomainError("Choose a supported IANA timezone.");}
 const offsets=new Set<number>();for(let h=-36;h<=36;h+=3){const sampled=wanted+h*3600000,shown=civilAt(sampled,fmt);offsets.add(Date.parse(`${shown}:00.000Z`)-sampled);}
 return [...offsets].map(offset=>wanted-offset).filter(time=>civilAt(time,fmt)===local).sort((a,b)=>a-b).map(time=>new Date(time).toISOString());
}
function minute(value:unknown){if(typeof value!=="string"||!/^\d\d:\d\d$/u.test(value))throw new DomainError("Use HH:mm opening and closing times.");const[h,m]=value.split(":").map(Number);if(h>23||m>59)throw new DomainError("Use a valid24-hour minute.");return h*60+m;}
export function validateTimePolicy(value:unknown):TimePolicy{
 const x=object(value);keys(x,["timezone","weekdays","opens","closes","leadMinutes","cancelMinutes","calendar"]);
 if(typeof x.timezone!=="string"||x.timezone.length>80||!x.timezone.includes("/")||!/^[-A-Za-z0-9_+/]+$/u.test(x.timezone))throw new DomainError("Choose a named IANA timezone.");try{formatter(x.timezone);}catch{throw new DomainError("Choose a supported IANA timezone.");}
 if(!Array.isArray(x.weekdays)||!x.weekdays.length||x.weekdays.length>7||new Set(x.weekdays).size!==x.weekdays.length||x.weekdays.some(n=>!Number.isInteger(n)||n<1||n>7))throw new DomainError("Choose distinct ISO weekdays1–7.");
 const opening=minute(x.opens),closing=minute(x.closes);let calendar:TimePolicy["calendar"];
 if(x.calendar!==undefined){const c=object(x.calendar);keys(c,["version","closedDates"]);if(c.version!==2||!Array.isArray(c.closedDates)||c.closedDates.length>32||new Set(c.closedDates).size!==c.closedDates.length)throw new DomainError("Calendar v2 requires at most32distinct closed dates.");const closedDates=c.closedDates.map(value=>{if(typeof value!=="string"||!DATE.test(value))throw new DomainError("Use closed dates between2025and2035.");epoch(`${value}T12:00`);return value;}).sort();calendar={version:2,closedDates};}
 if(opening===closing||!calendar&&opening>closing)throw new DomainError("Use different opening/closing minutes; overnight intervals require explicit calendar v2.");
 if(!Number.isInteger(x.leadMinutes)||Number(x.leadMinutes)<1||Number(x.leadMinutes)>1440||!Number.isInteger(x.cancelMinutes)||Number(x.cancelMinutes)<1||Number(x.cancelMinutes)>10080)throw new DomainError("Lead time must be1–1440minutes and cancellation notice1–10080minutes.");
 return{timezone:x.timezone,weekdays:[...x.weekdays].sort((a,b)=>a-b) as number[],opens:x.opens as string,closes:x.closes as string,leadMinutes:x.leadMinutes as number,cancelMinutes:x.cancelMinutes as number,...(calendar?{calendar}:{})};
}
export function validateTimePlan(value:unknown):TimePolicyPlan{
 const x=object(value);keys(x,["policy","testDate","gapLocal","foldLocal","sourceNote","provenance"]);const policy=validateTimePolicy(x.policy);
 if(typeof x.testDate!=="string"||!DATE.test(x.testDate))throw new DomainError("Choose a test date between2025and2035.");const day=new Date(epoch(`${x.testDate}T12:00`)).getUTCDay()||7;if(!policy.weekdays.includes(day))throw new DomainError("Choose an opening weekday for the ordinary boundary probes.");
 const closeDate=minute(policy.opens)>minute(policy.closes)?shiftDate(x.testDate,1):x.testDate;
 if(policy.calendar?.closedDates.includes(x.testDate)||policy.calendar?.closedDates.includes(closeDate))throw new DomainError("Choose an ordinary opening interval without a closed date; closed-date probes are generated separately.");
 if(resolveCivilTime(`${x.testDate}T${policy.opens}`,policy.timezone).length!==1||resolveCivilTime(`${closeDate}T${policy.closes}`,policy.timezone).length!==1)throw new DomainError("Use an ordinary opening/closing date; optional DST probes are separate.");
 if(typeof x.sourceNote!=="string"||x.sourceNote.trim().length<10||x.sourceNote.length>1500||/[\u0000-\u001f\u007f]/u.test(x.sourceNote)||x.provenance!=="buyer-confirmed-supplemental-agreement")throw new DomainError("Retain a10–1500character explicit supplemental agreement; it is not a contract citation.");
 for(const[key,count]of [["gapLocal",0],["foldLocal",2]]as const)if(x[key]!==undefined&&(typeof x[key]!=="string"||resolveCivilTime(x[key] as string,policy.timezone).length!==count))throw new DomainError(`The ${key} probe does not have the declared DST ambiguity in this timezone.`);
 return{policy,testDate:x.testDate,...(x.gapLocal?{gapLocal:x.gapLocal as string}:{}),...(x.foldLocal?{foldLocal:x.foldLocal as string}:{}),sourceNote:x.sourceNote.trim(),provenance:x.provenance};
}
export function evaluateTimeRequest(policyValue:unknown,operation:"create"|"cancel",localStart:string,now:string):TimeDecision{
 const policy=validateTimePolicy(policyValue),candidates=resolveCivilTime(localStart,policy.timezone);if(!Number.isFinite(Date.parse(now))||new Date(now).toISOString()!==now)throw new DomainError("Synthetic now must be canonical UTC ISO.");
 const result=(allowed:boolean,code:TimeDecision["code"]):TimeDecision=>({allowed,code,utcCandidates:candidates});
 if(!candidates.length)return result(false,"nonexistent_local_time");if(candidates.length!==1)return result(false,"ambiguous_local_time");
 const start=Date.parse(candidates[0]),difference=start-Date.parse(now);
 if(operation==="cancel")return result(difference>=policy.cancelMinutes*60000,difference>=policy.cancelMinutes*60000?"allowed":"cancellation_deadline");
 const localDate=localStart.slice(0,10),localMinute=minute(localStart.slice(11)),opens=minute(policy.opens),closes=minute(policy.closes),overnight=opens>closes;
 const openingDate=overnight&&localMinute<closes?shiftDate(localDate,-1):localDate,day=new Date(`${openingDate}T12:00:00.000Z`).getUTCDay()||7;
 const inInterval=overnight?localMinute>=opens||localMinute<closes:localMinute>=opens&&localMinute<closes;
 // A closed civil date suppresses its whole day; a closed opening date cannot
 // spawn a next-day tail, even if that following civil date is otherwise open.
 if(policy.calendar?.closedDates.includes(localDate)||policy.calendar?.closedDates.includes(openingDate)||!policy.weekdays.includes(day)||!inInterval)return result(false,"closed");
 return result(difference>=policy.leadMinutes*60000,difference>=policy.leadMinutes*60000?"allowed":"lead_time");
}
function shiftDate(date:string,days:number){return new Date(Date.parse(`${date}T12:00:00.000Z`)+days*86400000).toISOString().slice(0,10);}
function shifted(local:string,minutes:number){return new Date(epoch(local)+minutes*60000).toISOString().slice(0,16);}
export function timePolicyCases(value:unknown):TimeCase[]{
 const plan=validateTimePlan(value),p=plan.policy,overnight=minute(p.opens)>minute(p.closes),closeDate=overnight?shiftDate(plan.testDate,1):plan.testDate,opening=`${plan.testDate}T${p.opens}`,closing=`${closeDate}T${p.closes}`,duration=(minute(p.closes)-minute(p.opens)+1440)%1440,middle=shifted(opening,Math.floor(duration/2));
 const cases:TimeCase[]=[];function add(id:string,label:string,operation:"create"|"cancel",local:string,delta:number){const candidates=resolveCivilTime(local,p.timezone),start=Date.parse(candidates[0]??`${plan.testDate}T00:00:00.000Z`),now=new Date(start-delta*60000).toISOString();cases.push({id,label,operation,localStart:local,now,expected:evaluateTimeRequest(p,operation,local,now)});}
 for(const[id,label,local]of [["open_before","Opening minus1minute",shifted(opening,-1)],["open_exact","At opening",opening],["close_before","Closing minus1minute",shifted(closing,-1)],["close_exact","At closing",closing]]as const)add(id,label,"create",local,p.leadMinutes+60);
 for(const[offset,suffix]of [[-1,"below"],[0,"exact"],[1,"above"]]as const)add(`lead_${suffix}`,`Lead notice ${p.leadMinutes+offset}minutes`,"create",middle,p.leadMinutes+offset);
 for(const[offset,suffix]of [[-1,"below"],[0,"exact"],[1,"above"]]as const)add(`cancel_${suffix}`,`Cancellation notice ${p.cancelMinutes+offset}minutes`,"cancel",middle,p.cancelMinutes+offset);
 if(plan.gapLocal)add("dst_gap","Nonexistent civil minute","create",plan.gapLocal,p.leadMinutes+60);if(plan.foldLocal)add("dst_fold","Ambiguous civil minute","create",plan.foldLocal,p.leadMinutes+60);
 if(p.calendar){
  if(overnight){add("overnight_before_midnight","Opening-date23:59","create",`${plan.testDate}T23:59`,p.leadMinutes+60);add("overnight_after_midnight","Next civil date00:00 uses opening weekday","create",`${closeDate}T00:00`,p.leadMinutes+60);}
  if(p.calendar.closedDates.length){const first=p.calendar.closedDates[0];add("closed_opening_date","Explicit closed opening date","create",`${first}T${p.opens}`,p.leadMinutes+60);
   if(overnight&&minute(p.closes)>0){const fromClosed=p.calendar.closedDates.find(date=>date<"2035-12-31"&&p.weekdays.includes(new Date(`${date}T12:00:00.000Z`).getUTCDay()||7));if(fromClosed)add("closed_opening_spill","No next-day tail from a closed opening date","create",`${shiftDate(fromClosed,1)}T00:00`,p.leadMinutes+60);
    const civilClosed=p.calendar.closedDates.find(date=>p.weekdays.includes(new Date(`${shiftDate(date,-1)}T12:00:00.000Z`).getUTCDay()||7)&&!p.calendar!.closedDates.includes(shiftDate(date,-1)));if(civilClosed)add("closed_civil_date","Closed civil date overrides previous-day opening","create",`${civilClosed}T00:00`,p.leadMinutes+60);}
  }
 }
 const budget=timePolicyBudget(p),posts=cases.reduce((n,c)=>n+(c.operation==="cancel"?2:1),0),requests=1+cases.reduce((n,c)=>n+(c.operation==="cancel"?4:2),0);if(posts>budget.maxPosts||requests>budget.maxRequests)throw new DomainError("Time plan exceeds its explicit request budget.");
 return cases;
}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const FAILURES=["request_timeout","request_not_started","request_pending","response_not_bounded_json","missing_response_body","network_or_storage_unavailable","redirect_blocked","request_budget_exhausted","approval_or_run_expired","target_mismatch","authorization_or_state_changed","state_or_storage_changed","expired_task_closed_without_replay"];
function plain(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==="object"&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;}
function stamp(value:unknown){if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new DomainError("Saved time-policy timestamp is invalid.",503);return value;}
function identifier(value:unknown){if(typeof value!=="string"||!value||value.length>200||/[\s\u0000-\u001f\u007f]/u.test(value))throw new DomainError("Saved time-policy identifier is invalid.",503);return value;}
/** JSON object member order has no protocol meaning. Array order remains the
 * exact saved case/trace order and is deliberately preserved here. */
function timeCanonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(timeCanonical).join(",")}]`;if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${timeCanonical((value as Record<string,unknown>)[k])}`).join(",")}}`;return JSON.stringify(value)??"undefined";}
function jsonEnvelope(value:unknown,maxBytes:number){let nodes=0;const seen=new Set<object>();function visit(v:unknown,depth:number):boolean{if(++nodes>2000||depth>10)return false;if(v===null||typeof v==="boolean")return true;if(typeof v==="string")return v.length<=maxBytes;if(typeof v==="number")return Number.isFinite(v);if(!v||typeof v!=="object"||seen.has(v))return false;seen.add(v);if(Array.isArray(v))return v.length<=100&&v.every(item=>visit(item,depth+1));try{const x=object(v);return Object.keys(x).length<=40&&Object.values(x).every(item=>visit(item,depth+1));}catch{return false;}}if(!visit(value,0)||new TextEncoder().encode(JSON.stringify(value)).byteLength>maxBytes)throw new DomainError("Time trace contains an invalid JSON envelope.",503);}
/** One strict native-record check gates dependent writes and final replay alike. */
export function timePolicyRecordMatches(value:unknown,session:Pick<TimePolicySession,"id"|"plan">,caseId:string,localStart:string,status:"active"|"cancelled",id?:string):boolean{const instants=resolveCivilTime(localStart,session.plan.policy.timezone);return instants.length===1&&plain(value)&&value.testRunId===session.id&&value.caseId===caseId&&value.marker===`PBP-${session.id}`&&value.localStart===localStart&&value.instant===instants[0]&&value.status===status&&typeof value.id==="string"&&UUID.test(value.id)&&(id===undefined||value.id===id);}
/** Re-evaluate exact ordered HTTP evidence. A status or generated text cannot
 * manufacture a supported result without the matching response AND native
 * readback. This is unsigned internal consistency, not service authenticity. */
export function evaluateTimeTrace(session:Pick<TimePolicySession,"id"|"plan"|"cases">,registration:JourneyRegistrationSnapshot,trace:TimeTrace[],stopReason?:string):{results:TimeCaseResult[];reason?:string}{
 const prefix=new URL("time-policy/",registration.backendBaseUrl).pathname;let cursor=0;const results:TimeCaseResult[]=[];
 const envelope=(caseId:string,localStart:string,now:string)=>({testRunId:session.id,caseId,marker:`PBP-${session.id}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",localStart,now});
 const bodyRecord=(value:unknown,caseId:string,localStart:string,status:"active"|"cancelled",id?:string)=>timePolicyRecordMatches(value,session,caseId,localStart,status,id);
 class Incomplete extends Error{}
 function take(method:"GET"|"POST",path:string,input?:Record<string,unknown>){const row=trace[cursor++];if(!row)throw new Incomplete(stopReason??"request_not_started");if(row.method!==method||row.path!==prefix+path||timeCanonical(row.request)!==timeCanonical(input))throw new DomainError("Time trace request differs from its frozen synthetic plan.",503);if(row.state!=="recorded")throw new Incomplete(stopReason??(row.state==="pending"?"request_pending":row.reason??"network_or_storage_unavailable"));return{status:row.status!,body:row.body};}
 try{
  const metadata=take("GET","meta");let matched=false;try{matched=metadata.status===200&&plain(metadata.body)&&metadata.body.protocol===timePolicyProtocol(session.plan.policy)&&metadata.body.syntheticOnly===true&&metadata.body.testClock===true&&metadata.body.deploymentRevision===registration.deploymentRevision&&timeCanonical(validateTimePolicy(metadata.body.policy))===timeCanonical(session.plan.policy);}catch{/* Unknown metadata never authorizes writes. */}
  if(!matched){if(trace.length!==1)throw new DomainError("Time trace continued after unsupported metadata.",503);return{results:session.cases.map(c=>({id:c.id,outcome:"unknown",reason:"time_policy_metadata_not_matched"})),reason:"time_policy_metadata_not_matched"};}
  for(const item of session.cases){
   if(item.operation==="create"){
    const write=take("POST","bookings",envelope(item.id,item.localStart,item.now)),read=take("GET",`cases/${session.id}/${item.id}`),good=item.expected.allowed?write.status===201&&bodyRecord(write.body,item.id,item.localStart,"active")&&read.status===200&&bodyRecord(read.body,item.id,item.localStart,"active",(write.body as Record<string,unknown>).id as string):write.status===422&&plain(write.body)&&write.body.code===item.expected.code&&read.status===404;
    results.push({id:item.id,outcome:good?"observed":"mismatch",reason:good?"response_and_independent_readback_match":"response_or_native_record_differs"});
   }else{
    const setupId=`${item.id}-setup`,start=Date.parse(item.expected.utcCandidates[0]),setupNow=new Date(start-(Math.max(session.plan.policy.leadMinutes,session.plan.policy.cancelMinutes)+60)*60000).toISOString(),setup=take("POST","bookings",envelope(setupId,item.localStart,setupNow)),baseline=take("GET",`cases/${session.id}/${setupId}`);
    if(setup.status!==201||!bodyRecord(setup.body,setupId,item.localStart,"active")||baseline.status!==200||!bodyRecord(baseline.body,setupId,item.localStart,"active",(setup.body as Record<string,unknown>).id as string)){results.push({id:item.id,outcome:"unknown",reason:"cancellation_setup_not_established"});continue;}
    const id=(setup.body as Record<string,unknown>).id as string,write=take("POST",`bookings/${id}/cancel`,{testRunId:session.id,caseId:item.id,now:item.now}),read=take("GET",`cases/${session.id}/${setupId}`),good=item.expected.allowed?write.status===200&&read.status===200&&bodyRecord(read.body,setupId,item.localStart,"cancelled",id):write.status===422&&plain(write.body)&&write.body.code===item.expected.code&&read.status===200&&bodyRecord(read.body,setupId,item.localStart,"active",id);
    results.push({id:item.id,outcome:good?"observed":"mismatch",reason:good?"cancellation_and_preserved_state_match":"cancellation_or_preserved_state_differs"});
   }
  }
  if(cursor!==trace.length)throw new DomainError("Time trace contains unexpected extra requests.",503);return{results};
 }catch(error){if(!(error instanceof Incomplete))throw error;if(cursor<trace.length)throw new DomainError("Time trace continued after an incomplete request.",503);const reason=error.message;return{results:[...results,...session.cases.filter(c=>!results.some(r=>r.id===c.id)).map(c=>({id:c.id,outcome:"unknown"as const,reason}))],reason};}
}
export function validateTimeSession(value:unknown):TimePolicySession{
 const x=object(value);keys(x,["id","projectId","deliveryId","deliveryDigest","createdBy","createdAt","updatedAt","version","status","plan","cases","trace","targetId","registration","startedBy","startedAt","expiresAt","results","reason"]);
 if(typeof x.id!=="string"||!UUID.test(x.id)||typeof x.deliveryDigest!=="string"||!/^[a-f0-9]{64}$/u.test(x.deliveryDigest)||!Number.isInteger(x.version)||Number(x.version)<1||!["planned","running","complete","unknown"].includes(String(x.status)))throw new DomainError("Saved time-policy identity is invalid.",503);
 identifier(x.projectId);identifier(x.deliveryId);identifier(x.createdBy);if(Date.parse(stamp(x.updatedAt))<Date.parse(stamp(x.createdAt)))throw new DomainError("Time-policy update predates its creation.",503);
 const plan=validateTimePlan(x.plan);if(timeCanonical(x.cases)!==timeCanonical(timePolicyCases(plan))||!Array.isArray(x.trace)||x.trace.length>timePolicyBudget(plan.policy).maxRequests||x.trace.filter(row=>row&&typeof row==="object"&&row.method==="POST").length>timePolicyBudget(plan.policy).maxPosts)throw new DomainError("Saved time-policy plan or trace changed.",503);
 for(const[rowIndex,value]of x.trace.entries()){const row=object(value);keys(row,["index","method","path","request","state","status","body","reason"]);if(row.index!==rowIndex||!["GET","POST"].includes(String(row.method))||typeof row.path!=="string"||row.path.length>600||!["pending","recorded","unknown"].includes(String(row.state))||row.method==="GET"&&row.request!==undefined||row.method==="POST"&&row.request===undefined)throw new DomainError("Time trace shape is invalid.",503);if(row.request!==undefined)jsonEnvelope(row.request,2048);if(row.state==="recorded"){if(!Number.isInteger(row.status)||Number(row.status)<100||Number(row.status)>599||row.body===undefined||row.reason!==undefined)throw new DomainError("Recorded HTTP evidence is incomplete.",503);jsonEnvelope(row.body,4096);}else if(row.status!==undefined||row.body!==undefined||row.state==="pending"&&row.reason!==undefined||row.state==="unknown"&&!FAILURES.includes(String(row.reason)))throw new DomainError("Incomplete HTTP evidence has invalid fields.",503);if(row.state!=="recorded"&&rowIndex!==x.trace.length-1)throw new DomainError("Time trace continued after an incomplete request.",503);}
 if(x.status==="planned"){if(x.version!==1||x.trace.length||["targetId","registration","startedBy","startedAt","expiresAt","results","reason"].some(k=>x[k]!==undefined))throw new DomainError("A planned time policy contains execution fields.",503);}
 else{
  identifier(x.startedBy);const started=Date.parse(stamp(x.startedAt)),expiry=Date.parse(stamp(x.expiresAt));if(x.version===1||started<Date.parse(x.createdAt as string)||expiry!==started+60000||Date.parse(x.updatedAt as string)<started)throw new DomainError("Time run clock is invalid.",503);
  const registration=validateJourneyRegistration(x.registration);if(registration.id!==x.targetId||registration.projectId!==x.projectId||registration.frontendBundleDigest!==x.deliveryDigest)throw new DomainError("Time policy target binding changed.",503);
  if(x.reason!==undefined&&!FAILURES.includes(String(x.reason))&&x.reason!=="time_policy_metadata_not_matched")throw new DomainError("Unsupported time-policy stop reason.",503);
  const replay=evaluateTimeTrace({id:x.id,plan,cases:x.cases as TimeCase[]},registration,x.trace as TimeTrace[],x.reason as string|undefined);
  if(x.status==="running"){if(x.results!==undefined||x.reason!==undefined)throw new DomainError("A running time policy already has final results.",503);}
  else if(timeCanonical(x.results)!==timeCanonical(replay.results)||x.reason!==replay.reason||(x.status==="unknown")!==replay.results.some(r=>r.outcome==="unknown"))throw new DomainError("Saved time-policy conclusions differ from their ordered HTTP evidence.",503);
 }
 if(new TextEncoder().encode(JSON.stringify(x)).byteLength>TIME_POLICY_BYTES)throw new DomainError("Saved time-policy report exceeds128KiB.",503);return structuredClone(x)as unknown as TimePolicySession;
}
