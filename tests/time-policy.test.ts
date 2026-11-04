import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {CALENDAR_TIME_PLAN,DEFAULT_TIME_PLAN,timePolicyBudget,timePolicyProtocol,evaluateTimeRequest,resolveCivilTime,timePolicyCases,validateTimePlan,validateTimePolicy,validateTimeSession,type TimePolicySession,type TimeTrace} from "../lib/time-policy.ts";
import {executeTimePolicy} from "../lib/time-policy-runner.ts";
import {validateJourneyRegistration,type JourneyRegistrationSnapshot} from "../lib/project-journey.ts";
import {handleTimePolicyRequest} from "../examples/seller-time-policy-staging/worker/time-policy-service.mjs";
const origin="https://time-policy-staging.example.org",projectId="time-project",deliveryId="time-delivery",digest="a".repeat(64),migration=readFileSync(new URL("./fixtures/seller-staging-hosted/0007_time_policy.sql",import.meta.url),"utf8");
function registration(profile="fixed"):JourneyRegistrationSnapshot{return{id:`time-${profile}`,label:"Native time fixture",projectId,registrationRevision:"time-approved-v1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:`${origin}/seller-reference/${profile}/index.html`,backendBaseUrl:`${origin}/seller-reference/${profile}/pbp/`,deploymentRevision:`lifecycle-${profile}-v1`,frontendBundleDigest:digest,scenario:profile as JourneyRegistrationSnapshot["scenario"],expiresAt:"2099-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};}
function session(profile="fixed"):TimePolicySession{const at=new Date().toISOString();return{id:crypto.randomUUID(),projectId,deliveryId,deliveryDigest:digest,createdBy:"buyer",createdAt:at,updatedAt:at,version:2,status:"running",plan:structuredClone(DEFAULT_TIME_PLAN),cases:timePolicyCases(DEFAULT_TIME_PLAN),trace:[],targetId:registration(profile).id,registration:registration(profile),startedBy:"buyer",startedAt:at,expiresAt:new Date(Date.parse(at)+60000).toISOString()};}
function calendarSession(profile="calendar-fixed"):TimePolicySession{const s=session(),r=validateJourneyRegistration({...registration(),id:`time-${profile}`,frontendEntryUrl:`${origin}/seller-reference/${profile}/index.html`,backendBaseUrl:`${origin}/seller-reference/${profile}/pbp/`,deploymentRevision:`lifecycle-${profile}-v1`,bridgeRevision:"lifecycle-fixed-v1"});return{...s,plan:structuredClone(CALENDAR_TIME_PLAN),cases:timePolicyCases(CALENDAR_TIME_PLAN),targetId:r.id,registration:r};}
function native(){const db=new DatabaseSync(":memory:");db.exec(migration);const adapter={prepare(sql:string){const statement=db.prepare(sql);return{bind(...args:unknown[]){return{async first(){return statement.get(...args as never[])??null;},async run(){const r=statement.run(...args as never[]);return{meta:{changes:Number(r.changes)}};}};}};}};return{db,env:{DB:adapter as unknown as D1Database}};}

test("civil minute resolver distinguishes Melbourne gap/fold and Lord Howe half-hour changes",()=>{
 assert.deepEqual(resolveCivilTime("2027-10-03T02:30","Australia/Melbourne"),[]);
 assert.deepEqual(resolveCivilTime("2027-04-04T02:30","Australia/Melbourne"),["2027-04-03T15:30:00.000Z","2027-04-03T16:30:00.000Z"]);
 assert.deepEqual(resolveCivilTime("2027-01-15T12:00","Australia/Melbourne"),["2027-01-15T01:00:00.000Z"]);
 const fold=resolveCivilTime("2027-04-04T01:45","Australia/Lord_Howe");assert.equal(fold.length,2);assert.equal(Date.parse(fold[1])-Date.parse(fold[0]),1800000);
 assert.deepEqual(resolveCivilTime("2027-10-03T02:15","Australia/Lord_Howe"),[]);
 assert.deepEqual(resolveCivilTime("2027-01-15T12:00","Asia/Kathmandu"),["2027-01-15T06:15:00.000Z"]);
});
test("time oracle uses local opening inclusive/closing exclusive and exact lead/cancel deadlines",()=>{
 const p=DEFAULT_TIME_PLAN.policy,utc="2027-01-14T00:00:00.000Z";
 assert.equal(evaluateTimeRequest(p,"create","2027-01-15T10:59",utc).code,"closed");
 assert.equal(evaluateTimeRequest(p,"create","2027-01-15T11:00",utc).allowed,true);
 assert.equal(evaluateTimeRequest(p,"create","2027-01-15T19:59",utc).allowed,true);
 assert.equal(evaluateTimeRequest(p,"create","2027-01-15T20:00",utc).code,"closed");
 const local="2027-01-15T12:00",start=Date.parse(resolveCivilTime(local,p.timezone)[0]);
 for(const[delta,allowed]of [[119,false],[120,true],[121,true]]as const)assert.equal(evaluateTimeRequest(p,"create",local,new Date(start-delta*60000).toISOString()).allowed,allowed);
 for(const[delta,allowed]of [[1439,false],[1440,true],[1441,true]]as const)assert.equal(evaluateTimeRequest(p,"cancel",local,new Date(start-delta*60000).toISOString()).allowed,allowed);
 assert.equal(evaluateTimeRequest({...p,weekdays:[1]},"create",local,utc).code,"closed");
});
test("strict time plan rejects invalid dates, overnight intervals, fabricated DST probes and nonopening test dates",()=>{
 assert.throws(()=>resolveCivilTime("2027-02-29T12:00","Australia/Melbourne"));assert.throws(()=>resolveCivilTime("2027-04-31T12:00","Australia/Melbourne"));assert.throws(()=>resolveCivilTime("2027-01-15T24:00","Australia/Melbourne"));assert.throws(()=>resolveCivilTime("2036-01-15T12:00","Australia/Melbourne"));
 assert.throws(()=>validateTimePolicy({...DEFAULT_TIME_PLAN.policy,timezone:"Australia/Fake"}));assert.throws(()=>validateTimePolicy({...DEFAULT_TIME_PLAN.policy,opens:"20:00",closes:"11:00"}));assert.throws(()=>validateTimePolicy({...DEFAULT_TIME_PLAN.policy,leadMinutes:0}));assert.throws(()=>validateTimePolicy({...DEFAULT_TIME_PLAN.policy,weekdays:[1,1]}));
 assert.throws(()=>validateTimePlan({...DEFAULT_TIME_PLAN,gapLocal:"2027-01-15T02:30"}));assert.throws(()=>validateTimePlan({...DEFAULT_TIME_PLAN,foldLocal:"2027-10-03T02:30"}));assert.throws(()=>validateTimePlan({...DEFAULT_TIME_PLAN,policy:{...DEFAULT_TIME_PLAN.policy,weekdays:[1]}}));
});
test("time plan correctly crosses local midnight without relying on host timezone",()=>{
 const p={...DEFAULT_TIME_PLAN.policy,opens:"00:00",closes:"03:00"};const local="2027-01-15T00:00",utc=resolveCivilTime(local,p.timezone)[0];assert.equal(utc,"2027-01-14T13:00:00.000Z");assert.equal(evaluateTimeRequest(p,"create",local,"2027-01-14T11:00:00.000Z").allowed,true);
 const c=timePolicyCases({...DEFAULT_TIME_PLAN,policy:p});assert.equal(c.find(x=>x.id==="open_before")!.localStart,"2027-01-14T23:59");assert.equal(c.find(x=>x.id==="open_before")!.expected.code,"closed");
});
test("actual independent native SQLite fixture supports all12finite expectations and saves cancelled states",async()=>{
 const {db,env}=native(),s=session(),persisted:TimeTrace[][]=[],sent:Record<string,unknown>[]=[];let calls=0;
 try{const result=await executeTimePolicy(s,registration(),{guard:async()=>{},onTrace:async trace=>{persisted.push(trace);},fetch:async(url,init)=>{calls++;const last=persisted.at(-1)?.at(-1);assert.equal(last?.state,"pending");assert.equal(last?.method,init.method);if(init.body){const input=JSON.parse(String(init.body));sent.push(input);assert.equal("expected"in input,false);assert.equal("policy"in input,false);}return(await handleTimePolicyRequest(new Request(url,init),env))!;}});
  assert.equal(result.results.length,12);assert.deepEqual(result.results.filter(x=>x.outcome!=="observed"),[]);assert.equal(calls,31);assert.ok(result.trace.every(x=>x.state==="recorded"));assert.equal(db.prepare("SELECT count(*) n FROM lab_time_policy_receipts WHERE status = 'cancelled'").get()!.n,2);assert.equal(db.prepare("SELECT count(*) n FROM lab_time_policy_receipts").get()!.n,7);assert.equal(db.prepare("SELECT count(*) n FROM lab_time_policy_receipts WHERE case_id IN ('lead_below','dst_gap','dst_fold','close_exact','open_before')").get()!.n,0);assert.ok(sent.length<=18);
 }finally{db.close();}
});
test("native lead-time and DST mutants are actually detected, not labelled from selected fixture name",async()=>{
 for(const[profile,expected]of [["cancel-credit",["lead_below"]],["move-loss",["dst_gap","dst_fold"]]]as const){const {db,env}=native();try{const result=await executeTimePolicy(session(profile),registration(profile),{guard:async()=>{},onTrace:async()=>{},fetch:async(u,i)=>(await handleTimePolicyRequest(new Request(u,i),env))!});assert.deepEqual(result.results.filter(x=>x.outcome==="mismatch").map(x=>x.id),expected);assert.equal(result.results.filter(x=>x.outcome==="unknown").length,0);}finally{db.close();}}
});
test("missing or mismatched affirmative time metadata causes oneGET and zero booking writes",async()=>{
 for(const meta of [{protocol:"booking-lifecycle-http-v1"},{protocol:"time-policy-http-v1",testClock:true,syntheticOnly:true,deploymentRevision:"wrong",policy:DEFAULT_TIME_PLAN.policy},{protocol:"time-policy-http-v1",testClock:false,syntheticOnly:true,deploymentRevision:"lifecycle-fixed-v1",policy:DEFAULT_TIME_PLAN.policy}]){let calls=0;const result=await executeTimePolicy(session(),registration(),{guard:async()=>{},onTrace:async()=>{},fetch:async(_u,i)=>{calls++;assert.equal(i.method,"GET");return Response.json(meta);}});assert.equal(calls,1);assert.equal(result.reason,"time_policy_metadata_not_matched");assert.ok(result.results.every(r=>r.outcome==="unknown"));}
});
test("unknown first write is retained without a retry or later requests",async()=>{
 const {db,env}=native(),durable:TimeTrace[][]=[];let posts=0;try{const result=await executeTimePolicy(session(),registration(),{guard:async()=>{},onTrace:async trace=>{durable.push(trace);},timeoutMs:5,fetch:async(u,i)=>{if(i.method==="GET")return(await handleTimePolicyRequest(new Request(u,i),env))!;posts++;return new Promise<Response>(()=>{});}});assert.equal(posts,1);assert.equal(result.trace.length,2);assert.equal(result.trace[1].state,"unknown");assert.equal(durable.at(-1)?.[1].state,"unknown");assert.ok(result.results.every(r=>r.outcome==="unknown"));}finally{db.close();}
});
test("failed intent persistence or changed approval never issues the corresponding HTTP call",async()=>{
 let calls=0;const result=await executeTimePolicy(session(),registration(),{guard:async()=>{},onTrace:async()=>{throw new Error("no_store");},fetch:async()=>{calls++;return Response.json({});}});assert.equal(calls,0);assert.ok(result.results.every(r=>r.outcome==="unknown"));
 let guards=0;const {db,env}=native();try{const changed=await executeTimePolicy(session(),registration(),{guard:async()=>{if(++guards>1)throw new Error("revoked");},onTrace:async()=>{},fetch:async(u,i)=>{calls++;return(await handleTimePolicyRequest(new Request(u,i),env))!;}});assert.equal(calls,1);assert.equal(changed.trace.length,1);assert.ok(changed.results.every(r=>r.outcome==="unknown"));}finally{db.close();}
});
test("cross-project digest mismatch is rejected before any request and saved plan tampering fails closed",async()=>{
 let calls=0;await assert.rejects(()=>executeTimePolicy(session(),{...registration(),frontendBundleDigest:"b".repeat(64)},{guard:async()=>{},onTrace:async()=>{},fetch:async()=>{calls++;return Response.json({});}}));assert.equal(calls,0);const s=session();s.cases[0].expected.allowed=!s.cases[0].expected.allowed;assert.throws(()=>validateTimeSession(s));
});
test("stored conclusions, synthetic inputs, trace ordering, timestamps and deployment bindings cannot be rewritten",async()=>{
 const {db,env}=native(),s=session();try{const result=await executeTimePolicy(s,registration(),{guard:async()=>{},onTrace:async()=>{},fetch:async(u,i)=>(await handleTimePolicyRequest(new Request(u,i),env))!}),saved:TimePolicySession={...s,...result,status:"complete",version:70,updatedAt:new Date().toISOString()};assert.deepEqual(validateTimeSession(saved),saved);
  for(const mutate of [(v:TimePolicySession)=>{v.results![0].outcome="mismatch";},(v:TimePolicySession)=>{v.trace[1].request!.now="2027-01-01T00:00:00.000Z";},(v:TimePolicySession)=>{v.trace[2].path=v.trace[1].path;},(v:TimePolicySession)=>{v.trace[1].index=9;},(v:TimePolicySession)=>{v.expiresAt="not-a-date";},(v:TimePolicySession)=>{v.registration!.projectId="foreign";},(v:TimePolicySession)=>{v.trace[1].state="pending";delete v.trace[1].body;delete v.trace[1].status;},(v:TimePolicySession)=>{(v.trace[4].body as Record<string,unknown>).instant="2027-01-15T11:00:00.000Z";}]){const changed=structuredClone(saved);mutate(changed);assert.throws(()=>validateTimeSession(changed));}
 }finally{db.close();}
});
test("supplemental migration leaves old acceptance and payment payload byte-for-byte unchanged",()=>{
 const db=new DatabaseSync(":memory:");try{db.exec("CREATE TABLE quotes(id TEXT PRIMARY KEY,payload TEXT); INSERT INTO quotes VALUES('frozen','{\"acceptance\":\"A\",\"payment\":\"captured\"}');");const before=db.prepare("SELECT * FROM quotes").all();db.exec(readFileSync(new URL("../drizzle/0008_time_policy_sessions.sql",import.meta.url),"utf8"));assert.deepEqual(db.prepare("SELECT * FROM quotes").all(),before);assert.equal(db.prepare("SELECT count(*) n FROM time_policy_sessions").get()!.n,0);}finally{db.close();}
});


test("calendar v2 explicitly enables overnight hours, dates are canonical and v1 frozen plans replay unchanged",()=>{
 const frozen=JSON.parse(readFileSync(new URL("./fixtures/time-policy-v1-frozen.json",import.meta.url),"utf8"));assert.deepEqual(validateTimePlan(frozen.plan),frozen.plan);assert.deepEqual(timePolicyCases(frozen.plan),frozen.cases);assert.deepEqual(timePolicyCases(DEFAULT_TIME_PLAN),frozen.cases);assert.equal(timePolicyProtocol(frozen.plan.policy),"time-policy-http-v1");assert.equal(timePolicyProtocol(CALENDAR_TIME_PLAN.policy),"time-policy-http-v2");
 assert.deepEqual(timePolicyBudget(frozen.plan.policy),{maxRequests:40,maxPosts:18});assert.deepEqual(timePolicyBudget(CALENDAR_TIME_PLAN.policy),{maxRequests:50,maxPosts:24});
 assert.throws(()=>validateTimePolicy({...DEFAULT_TIME_PLAN.policy,opens:"22:00",closes:"02:00"}));assert.throws(()=>validateTimePolicy({...CALENDAR_TIME_PLAN.policy,closes:"22:00"}));
 for(const calendar of [{version:1,closedDates:[]},{version:2,closedDates:["2027-02-29"]},{version:2,closedDates:["2027-01-22","2027-01-22"]},{version:2,closedDates:["2036-01-01"]},{version:2,closedDates:Array.from({length:33},(_,i)=>`2027-02-${String(i+1).padStart(2,"0")}`)},{version:2,closedDates:[],unexpected:true}])assert.throws(()=>validateTimePolicy({...CALENDAR_TIME_PLAN.policy,calendar}));
 assert.deepEqual(validateTimePolicy({...CALENDAR_TIME_PLAN.policy,calendar:{version:2,closedDates:["2027-01-30","2027-01-22"]}}).calendar,{version:2,closedDates:["2027-01-22","2027-01-30"]});
 assert.throws(()=>validateTimePlan({...CALENDAR_TIME_PLAN,testDate:"2027-01-22"}));assert.throws(()=>validateTimePlan({...CALENDAR_TIME_PLAN,policy:{...CALENDAR_TIME_PLAN.policy,weekdays:[3],calendar:{version:2,closedDates:[]}},testDate:"2035-12-31"}));
});
test("overnight weekday belongs to opening date and local full-day closures override spill",()=>{
 const p=CALENDAR_TIME_PLAN.policy,now="2027-01-01T00:00:00.000Z";
 for(const[local,code]of [["2027-01-15T21:59","closed"],["2027-01-15T22:00","allowed"],["2027-01-15T23:59","allowed"],["2027-01-16T00:00","allowed"],["2027-01-16T01:59","allowed"],["2027-01-16T02:00","closed"],["2027-01-16T22:00","closed"],["2027-01-22T22:00","closed"],["2027-01-23T01:00","closed"],["2027-01-29T23:59","allowed"],["2027-01-30T00:00","closed"]]as const)assert.equal(evaluateTimeRequest(p,"create",local,now).code,code,local);
 // Cancellation of an existing reservation is still controlled by its deadline,
 // not blocked just because the date has since been marked closed.
 assert.equal(evaluateTimeRequest(p,"cancel","2027-01-22T22:00",now).code,"allowed");
 const midnightClose={...p,closes:"00:00",calendar:{version:2 as const,closedDates:[]}};assert.equal(evaluateTimeRequest(midnightClose,"create","2027-01-16T00:00",now).code,"closed");
 const sameDayV2={...DEFAULT_TIME_PLAN.policy,calendar:{version:2 as const,closedDates:["2027-01-15"]}};assert.equal(evaluateTimeRequest(sameDayV2,"create","2027-01-15T12:00",now).code,"closed");
});
test("overnight DST gaps and folds reject before weekday or closure logic, at year bounds and non-hour offsets",()=>{
 const p={...CALENDAR_TIME_PLAN.policy,weekdays:[6],closes:"04:00",calendar:{version:2 as const,closedDates:[]}},now="2027-01-01T00:00:00.000Z";
 assert.equal(evaluateTimeRequest(p,"create","2027-10-03T02:30",now).code,"nonexistent_local_time");assert.equal(evaluateTimeRequest(p,"create","2027-04-04T02:30",now).code,"ambiguous_local_time");
 assert.equal(evaluateTimeRequest({...p,timezone:"Australia/Lord_Howe"},"create","2027-10-03T02:15",now).code,"nonexistent_local_time");assert.equal(evaluateTimeRequest({...p,timezone:"Australia/Lord_Howe"},"create","2027-04-04T01:45",now).code,"ambiguous_local_time");
 const kathmandu={...p,timezone:"Asia/Kathmandu",weekdays:[5]};assert.equal(evaluateTimeRequest(kathmandu,"create","2027-01-16T01:00",now).code,"allowed");
 const edge=validateTimePlan({...CALENDAR_TIME_PLAN,testDate:"2035-12-28",gapLocal:undefined,foldLocal:undefined,policy:{...p,weekdays:[5]}});assert.equal(timePolicyCases(edge).find(x=>x.id==="close_exact")!.localStart,"2035-12-29T04:00");
 assert.throws(()=>validateTimePlan({...CALENDAR_TIME_PLAN,testDate:"2035-12-31",policy:{...p,weekdays:[1]}}));
});
test("calendar v2 real native SQLite checks cross-midnight weekdays and closure-state mutants with bounded writes",async context=>{
 for(const profile of ["calendar-fixed","calendar-weekday-defect","calendar-holiday-defect"]){const{db,env}=native(),s=calendarSession(profile);try{const output=await executeTimePolicy(s,s.registration!,{guard:async()=>{},onTrace:async()=>{},fetch:async(u,i)=>{if(i.body){const body=JSON.parse(String(i.body));assert.equal("expected"in body,false);assert.equal("policy"in body,false);}return(await handleTimePolicyRequest(new Request(u,i),env))!;}}),mismatches=output.results.filter(r=>r.outcome==="mismatch").map(r=>r.id);
  assert.equal(s.cases.length,17);assert.equal(output.trace.length,profile==="calendar-weekday-defect"?35:41);assert.equal(output.trace.filter(r=>r.method==="POST").length,profile==="calendar-weekday-defect"?17:20);assert.equal(output.results.filter(r=>r.outcome==="unknown").length,profile==="calendar-weekday-defect"?3:0);
  if(profile==="calendar-fixed")assert.deepEqual(mismatches,[]);if(profile==="calendar-weekday-defect")assert.ok(mismatches.includes("overnight_after_midnight"));if(profile==="calendar-holiday-defect")assert.deepEqual(mismatches,["closed_opening_date","closed_opening_spill","closed_civil_date"]);
  const saved:TimePolicySession={...s,...output,status:output.results.some(r=>r.outcome==="unknown")?"unknown":"complete",version:90,updatedAt:new Date().toISOString()};assert.deepEqual(validateTimeSession(saved),saved);const changed=structuredClone(saved);changed.plan.policy.calendar!.closedDates=[];assert.throws(()=>validateTimeSession(changed));
  const nativeRows=db.prepare("SELECT case_id,status FROM lab_time_policy_receipts WHERE run_id = ?").all(s.id);if(profile==="calendar-fixed")assert.equal(nativeRows.some(r=>String(r.case_id).startsWith("closed_")),false);if(profile==="calendar-holiday-defect")assert.equal(nativeRows.filter(r=>String(r.case_id).startsWith("closed_")).length,3);
  context.diagnostic(JSON.stringify({profile,cases:17,requests:output.trace.length,posts:output.trace.filter(r=>r.method==="POST").length,unknown:output.results.filter(r=>r.outcome==="unknown").length,mismatches,nativeRows:nativeRows.length,scope:"native handler and actual isolated SQLite, not hosted user evidence"}));
 }finally{db.close();}}
});
test("calendar v2 requires affirmative matching protocol and policy before any write",async()=>{
 for(const meta of [{protocol:"time-policy-http-v1",policy:CALENDAR_TIME_PLAN.policy},{protocol:"time-policy-http-v2",policy:DEFAULT_TIME_PLAN.policy}]){const s=calendarSession();let calls=0;const output=await executeTimePolicy(s,s.registration!,{guard:async()=>{},onTrace:async()=>{},fetch:async(_u,i)=>{calls++;assert.equal(i.method,"GET");return Response.json({...meta,syntheticOnly:true,testClock:true,deploymentRevision:s.registration!.deploymentRevision});}});assert.equal(calls,1);assert.equal(output.reason,"time_policy_metadata_not_matched");assert.ok(output.results.every(r=>r.outcome==="unknown"));}
});


test("untrusted native record UUID or instant cannot establish a cancellation baseline or authorize dependent writes",async()=>{
 for(const defect of ["uuid","instant"]){const{db,env}=native(),s=session();let cancelWrites=0;try{const output=await executeTimePolicy(s,s.registration!,{guard:async()=>{},onTrace:async()=>{},fetch:async(u,i)=>{if(u.endsWith("/cancel"))cancelWrites++;const response=(await handleTimePolicyRequest(new Request(u,i),env))!,body=await response.json()as Record<string,unknown>;if(body.status==="active"){if(defect==="uuid")body.id="------------------------------------";else body.instant="2027-01-01T00:00:00.000Z";}return Response.json(body,{status:response.status});}});assert.equal(cancelWrites,0);assert.equal(output.trace.length,25);assert.equal(output.trace.filter(t=>t.method==="POST").length,12);assert.equal(output.results.filter(r=>r.outcome==="unknown").length,3);assert.ok(output.results.filter(r=>r.id.startsWith("cancel_")).every(r=>r.reason==="cancellation_setup_not_established"));assert.ok(output.results.some(r=>r.outcome==="mismatch"));const saved:TimePolicySession={...s,...output,status:"unknown",version:60,updatedAt:new Date().toISOString()};assert.deepEqual(validateTimeSession(saved),saved);
 }finally{db.close();}}
});


test("setup-only forged records skip only dependent cancel writes while preserving all nine earlier create conclusions",async context=>{
 for(const defect of ["uuid","instant"]){const{db,env}=native(),s=session();let cancelWrites=0;try{const output=await executeTimePolicy(s,s.registration!,{guard:async()=>{},onTrace:async()=>{},fetch:async(u,i)=>{if(u.endsWith("/cancel"))cancelWrites++;const response=(await handleTimePolicyRequest(new Request(u,i),env))!,body=await response.json()as Record<string,unknown>;if(body.status==="active"&&typeof body.caseId==="string"&&body.caseId.endsWith("-setup")){if(defect==="uuid")body.id="------------------------------------";else body.instant="2027-01-01T00:00:00.000Z";}return Response.json(body,{status:response.status});}});
  assert.equal(cancelWrites,0);assert.equal(output.trace.length,25);assert.equal(output.trace.filter(t=>t.method==="POST").length,12);assert.equal(output.results.filter(r=>r.outcome==="observed").length,9);assert.equal(output.results.filter(r=>r.outcome==="mismatch").length,0);assert.equal(output.results.filter(r=>r.outcome==="unknown").length,3);assert.ok(output.results.filter(r=>r.id.startsWith("cancel_")).every(r=>r.reason==="cancellation_setup_not_established"));const saved:TimePolicySession={...s,...output,status:"unknown",version:60,updatedAt:new Date().toISOString()};assert.deepEqual(validateTimeSession(saved),saved);context.diagnostic(JSON.stringify({counterexampleTo:"time-review-final P2/P3",defect,requests:output.trace.length,postAttempts:12,cancelWrites,observed:9,unknown:3,replayValidated:true}));
 }finally{db.close();}}
 const{db,env}=native(),s=session();try{const control=await executeTimePolicy(s,s.registration!,{guard:async()=>{},onTrace:async()=>{},fetch:async(u,i)=>(await handleTimePolicyRequest(new Request(u,i),env))!});assert.equal(control.trace.filter(t=>t.method==="POST"&&t.path.endsWith("/cancel")).length,3);assert.equal(control.results.filter(r=>r.outcome==="observed").length,12);}finally{db.close();}
});
