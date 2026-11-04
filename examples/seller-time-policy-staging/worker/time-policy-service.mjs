/** Independent native SQL fixture for the finite synthetic-clock protocol.
 * It intentionally does not import the application's oracle or expected cases.
 * All effects use PBP-only rows; no customers, email or payments are involved. */
export const NATIVE_TIME_POLICY={timezone:"Australia/Melbourne",weekdays:[1,2,3,4,5,6,7],opens:"11:00",closes:"20:00",leadMinutes:120,cancelMinutes:1440};
export const NATIVE_CALENDAR_POLICY={timezone:"Australia/Melbourne",weekdays:[5],opens:"22:00",closes:"02:00",leadMinutes:120,cancelMinutes:1440,calendar:{version:2,closedDates:["2027-01-22","2027-01-30"]}};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const CASE=/^(?:open_before|open_exact|close_before|close_exact|lead_below|lead_exact|lead_above|dst_gap|dst_fold|overnight_before_midnight|overnight_after_midnight|closed_opening_date|closed_opening_spill|closed_civil_date|cancel_(?:below|exact|above)(?:-setup)?)$/u;
function json(value,status=200){return Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"}});}
const error=(code,status=422)=>json({code,testOnly:true},status);
function minute(s){const[a,b]=s.split(":").map(Number);return a*60+b;}
function formatter(){return new Intl.DateTimeFormat("sv-SE-u-ca-gregory-nu-latn",{timeZone:NATIVE_TIME_POLICY.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});}
function civil(time){const p=Object.fromEntries(formatter().formatToParts(new Date(time)).map(v=>[v.type,v.value]));return`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
/** Native adapter searches modern quarter-hour offsets, independently from the
 * app oracle's nearby-transition offset derivation. This fixture is Melbourne
 * only; external adapters must implement their own configured native policy. */
function instants(local){if(typeof local!=="string"||!/^(202[5-9]|203[0-5])-\d\d-\d\dT\d\d:\d\d$/u.test(local))return null;const wall=Date.parse(local+":00.000Z");if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==local)return null;const found=[];for(let offset=-14*60;offset<=14*60;offset+=15){const t=wall-offset*60000;if(civil(t)===local)found.push(t);}return found.sort((a,b)=>a-b);}
function nowValid(now){return typeof now==="string"&&Number.isFinite(Date.parse(now))&&new Date(now).toISOString()===now&&Date.parse(now)>=Date.parse("2024-01-01T00:00:00.000Z")&&Date.parse(now)<Date.parse("2037-01-01T00:00:00.000Z");}
function previousDate(date){const d=new Date(date+"T12:00:00.000Z");d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
function decision(local,now,profile){
 const policy=profile.startsWith("calendar-")?NATIVE_CALENDAR_POLICY:NATIVE_TIME_POLICY,candidates=instants(local);
 if(!candidates)return{code:"synthetic_validation_failed"};if(candidates.length!==1){if(profile==="move-loss")return{allowed:true,instant:Date.parse(local+":00.000Z")};return{code:candidates.length?"ambiguous_local_time":"nonexistent_local_time"};}
 const utc=candidates[0],mins=minute(local.slice(11)),opening=minute(policy.opens),closing=minute(policy.closes),overnight=opening>closing,date=local.slice(0,10),openingDate=overnight&&mins<closing?previousDate(date):date;
 // Independent native implementation: early tail belongs to its prior opening
 // date. The deliberately defective profile instead uses the current weekday.
 const weekdayDate=profile==="calendar-weekday-defect"?date:openingDate,weekday=new Date(weekdayDate+"T12:00:00.000Z").getUTCDay()||7;
 const inHours=overnight?mins>=opening||mins<closing:mins>=opening&&mins<closing;
 const dates=profile==="calendar-holiday-defect"?[]:policy.calendar?.closedDates??[];
 if(!policy.weekdays.includes(weekday)||!inHours||dates.includes(date)||dates.includes(openingDate))return{code:"closed"};
 if(profile!=="cancel-credit"&&utc-Date.parse(now)<policy.leadMinutes*60000)return{code:"lead_time"};return{allowed:true,instant:utc};
}
async function body(request){if(request.headers.get("content-type")?.split(";",1)[0]!=="application/json")throw new Error("json_required");const reader=request.body?.getReader();if(!reader)throw new Error("json_required");let n=0;const parts=[];try{while(true){const part=await reader.read();if(part.done)break;n+=part.value.length;if(n>4096){await reader.cancel();throw new Error("body_too_large");}parts.push(part.value);}const bytes=new Uint8Array(n);let i=0;for(const p of parts){bytes.set(p,i);i+=p.length;}const value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("invalid_json");return value;}finally{reader.releaseLock();}}
function publicRow(r){return{id:r.id,testRunId:r.run_id,caseId:r.case_id,marker:r.marker,localStart:r.local_start,instant:r.instant,status:r.status,testOnly:true};}
export async function handleTimePolicyRequest(request,env){
 const url=new URL(request.url),route=/^\/seller-reference\/(fixed|cancel-credit|move-loss|retry-duplicate|calendar-fixed|calendar-weekday-defect|calendar-holiday-defect)\/pbp\/time-policy\/(meta|bookings|cases\/([a-f0-9-]+)\/([a-z_-]+)|bookings\/([a-f0-9-]+)\/cancel)$/u.exec(url.pathname);if(!route)return null;
 if(url.search||url.hash)return error("query_not_supported",400);const profile=route[1],policy=profile.startsWith("calendar-")?NATIVE_CALENDAR_POLICY:NATIVE_TIME_POLICY;
 if(route[2]==="meta")return request.method==="GET"?json({protocol:policy.calendar?"time-policy-http-v2":"time-policy-http-v1",syntheticOnly:true,testClock:true,deploymentRevision:`lifecycle-${profile}-v1`,policy,fixtureProfile:profile==="calendar-weekday-defect"?"wrong_opening_weekday":profile==="calendar-holiday-defect"?"ignores_closed_dates":profile==="cancel-credit"?"ignores_lead_time":profile==="move-loss"?"admits_invalid_dst_minutes":"fixed",ttlSeconds:3600,browserExecution:false,deploymentAttestation:false,payments:false}):error("method_not_allowed",405);
 if(!env?.DB)return error("storage_unavailable",503);const wallNow=new Date().toISOString();
 try{
  if(route[3]){if(request.method!=="GET"||!UUID.test(route[3])||!CASE.test(route[4]))return error("not_found",404);const row=await env.DB.prepare("SELECT * FROM lab_time_policy_receipts WHERE profile = ? AND run_id = ? AND case_id = ? AND expires_at > ?").bind(profile,route[3],route[4],wallNow).first();return row?json(publicRow(row)):error("not_found",404);}
  if(request.method!=="POST")return error("method_not_allowed",405);const origin=request.headers.get("origin");if(origin&&origin!==url.origin)return error("origin_mismatch",403);
  let input;try{input=await body(request);}catch(e){return error(e.message,400);}if(!UUID.test(input.testRunId??"")||!CASE.test(input.caseId??"")||!nowValid(input.now))return error("synthetic_validation_failed",400);
  if(route[5]){
   if(Object.keys(input).some(k=>!["testRunId","caseId","now"].includes(k))||!/^cancel_(below|exact|above)$/u.test(input.caseId)||!UUID.test(route[5]))return error("synthetic_validation_failed",400);
   const row=await env.DB.prepare("SELECT * FROM lab_time_policy_receipts WHERE id = ? AND profile = ? AND run_id = ? AND case_id = ? AND expires_at > ?").bind(route[5],profile,input.testRunId,`${input.caseId}-setup`,wallNow).first();if(!row)return error("not_found",404);
   if(Date.parse(row.instant)-Date.parse(input.now)<policy.cancelMinutes*60000)return error("cancellation_deadline");
   await env.DB.prepare("UPDATE lab_time_policy_receipts SET status = 'cancelled' WHERE id = ? AND profile = ? AND run_id = ? AND status = 'active'").bind(row.id,profile,input.testRunId).run();const saved=await env.DB.prepare("SELECT * FROM lab_time_policy_receipts WHERE id = ? AND profile = ?").bind(row.id,profile).first();return json(publicRow(saved));
  }
  if(Object.keys(input).some(k=>!["testRunId","caseId","marker","customer","email","localStart","now"].includes(k))||input.marker!==`PBP-${input.testRunId}`||input.customer!=="PBP synthetic"||input.email!=="pbp-test@example.invalid"||input.caseId.startsWith("cancel_")&&!input.caseId.endsWith("-setup"))return error("synthetic_validation_failed",400);
  const result=decision(input.localStart,input.now,profile);if(!result.allowed)return error(result.code);
  const id=crypto.randomUUID(),expires=new Date(Date.now()+3600000).toISOString();
  await env.DB.prepare("DELETE FROM lab_time_policy_receipts WHERE id IN (SELECT id FROM lab_time_policy_receipts WHERE expires_at <= ? ORDER BY expires_at LIMIT 100)").bind(wallNow).run();
  const inserted=await env.DB.prepare("INSERT INTO lab_time_policy_receipts (id,profile,run_id,case_id,marker,local_start,instant,status,created_at,expires_at) SELECT ?,?,?,?,?,?,?,'active',?,? WHERE (SELECT count(*) FROM lab_time_policy_receipts) <512 AND (SELECT count(*) FROM lab_time_policy_receipts WHERE profile = ? AND run_id = ?) <? ON CONFLICT(profile,run_id,case_id) DO NOTHING").bind(id,profile,input.testRunId,input.caseId,input.marker,input.localStart,new Date(result.instant).toISOString(),wallNow,expires,profile,input.testRunId,policy.calendar?24:18).run();if(inserted.meta.changes!==1)return error("duplicate_or_capacity",409);const saved=await env.DB.prepare("SELECT * FROM lab_time_policy_receipts WHERE id = ?").bind(id).first();return json(publicRow(saved),201);
 }catch{return error("storage_unavailable",503);}
}
