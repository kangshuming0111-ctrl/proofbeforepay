import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {DEFAULT_TIME_PLAN,evaluateTimeRequest,resolveCivilTime,timePolicyCases,validateTimePlan,validateTimePolicy,validateTimeSession,type TimePolicySession,type TimeTrace} from "../lib/time-policy.ts";
import {executeTimePolicy} from "../lib/time-policy-runner.ts";
import type {JourneyRegistrationSnapshot} from "../lib/project-journey.ts";
import {handleTimePolicyRequest} from "../examples/seller-time-policy-staging/worker/time-policy-service.mjs";
const origin="https://time-policy-staging.example.org",projectId="time-project",deliveryId="time-delivery",digest="a".repeat(64),migration=readFileSync(new URL("./fixtures/seller-staging-hosted/0007_time_policy.sql",import.meta.url),"utf8");
function registration(profile="fixed"):JourneyRegistrationSnapshot{return{id:`time-${profile}`,label:"Native time fixture",projectId,registrationRevision:"time-approved-v1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:`${origin}/seller-reference/${profile}/index.html`,backendBaseUrl:`${origin}/seller-reference/${profile}/pbp/`,deploymentRevision:`lifecycle-${profile}-v1`,frontendBundleDigest:digest,scenario:profile as JourneyRegistrationSnapshot["scenario"],expiresAt:"2099-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};}
function session(profile="fixed"):TimePolicySession{const at=new Date().toISOString();return{id:crypto.randomUUID(),projectId,deliveryId,deliveryDigest:digest,createdBy:"buyer",createdAt:at,updatedAt:at,version:2,status:"running",plan:structuredClone(DEFAULT_TIME_PLAN),cases:timePolicyCases(DEFAULT_TIME_PLAN),trace:[],targetId:registration(profile).id,registration:registration(profile),startedBy:"buyer",startedAt:at,expiresAt:new Date(Date.parse(at)+60000).toISOString()};}
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
