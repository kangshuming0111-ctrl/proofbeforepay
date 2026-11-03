import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {register} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import type {ProofQuote,ProofRole} from "../lib/contracts.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {JOURNEY_STEP_IDS,JOURNEY_SLOTS,journeyKey,type JourneyObservation,type JourneyStepId} from "../lib/journey-checks.ts";
import {newProjectJourneyPlan,validateProjectJourneyPlan,validateJourneyRegistration,validateStoredProjectJourneyReport,evaluateStoredProjectJourneyReport,validateProjectJourneyDecision,projectJourneyReportsFor,PROJECT_JOURNEY_AGREEMENT,PROJECT_JOURNEY_CANONICAL_DEFINITION,PROJECT_JOURNEY_DEFINITION,PROJECT_JOURNEY_PLAN_DIGEST,type JourneyRegistrationSnapshot,type ProjectJourneyReport} from "../lib/project-journey.ts";
import {beginProjectJourneyRun,beginProjectJourneyStep,finishProjectJourneyStep,finishProjectJourneyRun,confirmProjectJourneyPlan,projectJourneyCommand,projectJourneyClientWindowOpen} from "../lib/project-journey-actions.ts";
import {prepareReplacement} from "../lib/proof-workflow.ts";
import {assertAcceptedEvidenceReference} from "../lib/acceptance-evidence.ts";
import {handleLifecycleRequest} from "../examples/seller-lifecycle-staging/worker/lifecycle-service.mjs";
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(specifier,context,nextResolve){return specifier==="cloudflare:workers"?{url:"data:text/javascript,export const env = {}",shortCircuit:true}:nextResolve(specifier,context);}`)}`,import.meta.url);
const {readProjectJourneyStep,parseJourneyRegistrations,resolveJourneyTarget,requireCurrentJourneyRegistration,assertSeparateJourneyOrigin}=await import("../lib/server-journey-targets.ts");
const origin="https://synthetic-seller.example.org",at=new Date().toISOString(),schema=readFileSync(new URL("../examples/seller-lifecycle-staging/migrations/0001_lifecycle.sql",import.meta.url),"utf8");
function persisted<T>(value:T):T{return JSON.parse(JSON.stringify(value));}
async function fixture(scenario:JourneyRegistrationSnapshot["scenario"]="fixed"){
 const parsed=parseStaticProject({title:"Synthetic project",summary:"Build a website.",amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en"),delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Booking</title></head><body><h1>Synthetic website</h1></body></html>"},parsed.project,"en",1);
 let quote={id:"synthetic-journey-project",reference:"PBP-JOURNEY",workflow:"proof-v1",title:parsed.title,summary:"Build a website.",brief:"Build a website.",clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Static review only"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Ready"},feedback:[]}}} as ProofQuote;
 const digest=await runtimeDeliveryDigest(delivery.files),profile=scenario==="fake-success"||scenario==="wrong-party"?"fixed":scenario;
 const registration=validateJourneyRegistration({id:`seller-${scenario}`,label:"Owned synthetic seller deployment",projectId:quote.id,registrationRevision:"r1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:`${origin}/seller-lifecycle.html`,backendBaseUrl:`${origin}/pbp/`,deploymentRevision:`lifecycle-${profile}-v1`,frontendBundleDigest:digest,scenario,expiresAt:"2099-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"});
 quote=persisted(confirmProjectJourneyPlan(quote,"buyer",{action:"confirm-plan",deliveryId:delivery.id,confirm:true}));return{quote,digest,registration};
}
function startInput(q:ProofQuote,targetId:string){return{action:"start",deliveryId:q.proof.delivery!.id,targetId,confirm:true,previousReportId:q.proof.delivery!.journeyReport?.id??null};}
function d1(sqlite:DatabaseSync){return{prepare(sql:string){const stmt=sqlite.prepare(sql);return{bind(...args:(string|number|null)[]){return{async first(){return stmt.get(...args)??null;},async all(){return{success:true,results:stmt.all(...args)};},async run(){return{success:true,meta:{changes:Number(stmt.run(...args).changes)}};}};}};}};}
async function execute(quote:ProofQuote,digest:string,registration:JourneyRegistrationSnapshot){
 let q=persisted(beginProjectJourneyRun(quote,"buyer",startInput(quote,registration.id),digest,registration)),saves=1,serverGets=0,browserPosts=0;
 const sqlite=new DatabaseSync(":memory:");sqlite.exec(schema);const env={DB:d1(sqlite),LIFECYCLE_PROFILE:registration.scenario};
 let originalLoss:{body:Record<string,unknown>;key:string}|undefined;
 try{
 for(const stepId of JOURNEY_STEP_IDS){const run=q.proof.delivery!.journeyRun!,command=projectJourneyCommand(run,stepId),input:Record<string,unknown>={action:"observe",deliveryId:run.deliveryId,runId:run.id,stepId};
  if(command){let operation:"create"|"cancel"|"move"="create",path="/pbp/bookings",requestOperation="loss-create",requestBody:Record<string,unknown>,fields:Record<string,string>;
   const marker={testRunId:run.id,marker:`PBP-${run.id}`};
   if(command.type==="retry-original"){assert.ok(originalLoss);requestBody=originalLoss.body;fields={operation:"create",partySize:"1",slot:JOURNEY_SLOTS.b};}
   else if(command.type==="create"){requestOperation=command.requestOperation;requestBody={...marker,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:command.slot,partySize:command.partySize};fields={operation:"create",partySize:String(command.partySize),slot:command.slot};if(stepId==="response_loss_create")originalLoss={body:requestBody,key:journeyKey(run.id,requestOperation)};}
   else{operation=command.type;requestOperation=command.requestOperation;path=`/pbp/bookings/${command.bookingId}/${operation}`;requestBody={...marker,...(command.type==="move"?{slot:command.slot}:{})};fields={operation,bookingId:command.bookingId,...(command.type==="move"?{slot:command.slot}:{})};}
   const key=command.type==="retry-original"?originalLoss!.key:journeyKey(run.id,requestOperation),response=await handleLifecycleRequest(new Request(origin+path,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key,Origin:origin},body:JSON.stringify(requestBody)}),env),body=await response.json();browserPosts++;
   input.ui={actionId:stepId,status:response.status===504?"unknown":response.status>=400?"error":"success",message:"Native service observation from test driver, not a real browser",fields,...(response.status<300?{receipt:body}:{})};input.requests=[{method:"POST",path,key,status:response.status,request:requestBody,response:body}];
  }
  const begun=beginProjectJourneyStep(q,"buyer",input);q=persisted(begun.quote);saves++;
  const observed=await readProjectJourneyStep(q.proof.delivery!.journeyRun!,begun.observation,{fetch:async(url,init)=>{assert.equal(init.method,"GET");assert.equal(init.credentials,"omit");assert.equal(init.redirect,"manual");serverGets++;return handleLifecycleRequest(new Request(url,init),env);}});
  q=persisted(finishProjectJourneyStep(q,run.id,begun.leaseId,observed.observation,observed.metadata));saves++;
 }
 const runId=q.proof.delivery!.journeyRun!.id;q=persisted(finishProjectJourneyRun(q,"buyer",{action:"finish",deliveryId:q.proof.delivery!.id,runId}));saves++;
 const rows=sqlite.prepare("SELECT status,slot,party_size FROM seller_lifecycle_bookings WHERE test_run_id=?").all(runId);return{quote:q,report:q.proof.delivery!.journeyReport!,saves,serverGets,browserPosts,rows};
 }finally{sqlite.close();}
}
test("optional recipe requires explicit buyer consent and never inherits original contract provenance",async()=>{
 const f=await fixture(),q=structuredClone(f.quote);delete q.proof.delivery!.journeyPlan;const input={action:"confirm-plan",deliveryId:q.proof.delivery!.id,confirm:true};
 assert.throws(()=>confirmProjectJourneyPlan(q,"seller",input),/buyer/);assert.throws(()=>confirmProjectJourneyPlan(q,"buyer",{...input,confirm:false}),/Explicitly/);assert.throws(()=>confirmProjectJourneyPlan(q,"buyer",{...input,deliveryId:"old"}),/current/);
 const adopted=confirmProjectJourneyPlan(q,"buyer",input);assert.equal(adopted.summary,"Build a website.");assert.equal(adopted.proof.delivery!.journeyPlan!.provenance,"buyer-confirmed-technical-agreement");assert.equal(q.proof.delivery!.journeyPlan,undefined);assert.deepEqual(validateProjectJourneyPlan(newProjectJourneyPlan(at)),newProjectJourneyPlan(at));
 const altered=structuredClone(adopted.proof.delivery!.journeyPlan!);altered.maxPartySize=7 as 6;assert.throws(()=>validateProjectJourneyPlan(altered),/unsupported/);
});
test("the frozen agreement digest is independently reproducible from the complete ordered recipe definition",async()=>{
 assert.equal(PROJECT_JOURNEY_CANONICAL_DEFINITION,JSON.stringify(PROJECT_JOURNEY_DEFINITION));const definition=JSON.parse(PROJECT_JOURNEY_CANONICAL_DEFINITION);assert.equal(definition.agreement,PROJECT_JOURNEY_AGREEMENT);assert.deepEqual(definition.stepIds,[...JOURNEY_STEP_IDS]);assert.equal(definition.maxPartySize,6);assert.equal(definition.maxGuestsPerSlot,8);
 const digest=async(value:string)=>Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))).toString("hex");assert.equal(await digest(PROJECT_JOURNEY_CANONICAL_DEFINITION),PROJECT_JOURNEY_PLAN_DIGEST);assert.equal(newProjectJourneyPlan(at).planDigest,PROJECT_JOURNEY_PLAN_DIGEST);
 for(const changed of [{...definition,agreement:definition.agreement+" Changed obligation."},{...definition,maxGuestsPerSlot:9},{...definition,stepIds:definition.stepIds.slice(0,-1)}])assert.notEqual(await digest(JSON.stringify(changed)),PROJECT_JOURNEY_PLAN_DIGEST);
});
test("operator registry refuses public lab substitution, arbitrary URLs, expiry, another project or upload",async()=>{
 const f=await fixture();assert.deepEqual(parseJourneyRegistrations(JSON.stringify([f.registration])),[f.registration]);assert.deepEqual(resolveJourneyTarget(f.quote,f.registration.id,f.digest,[f.registration]),f.registration);
 const changes:Array<(r:JourneyRegistrationSnapshot)=>unknown>=[r=>r.id="lab-fixed",r=>r.frontendEntryUrl=origin+"/journey.html",r=>r.backendBaseUrl="http://127.0.0.1/pbp/",r=>r.frontendEntryUrl="https://foreign.example.org/seller.html",r=>r.frontendEntryUrl+="?scenario=fixed",r=>r.deploymentRevision="unknown"];
 for(const change of changes){const r=structuredClone(f.registration);change(r);assert.throws(()=>validateJourneyRegistration(r));}
 assert.throws(()=>resolveJourneyTarget(f.quote,f.registration.id,"a".repeat(64),[f.registration]),/another uploaded/);assert.throws(()=>resolveJourneyTarget({...f.quote,id:"other"},f.registration.id,f.digest,[f.registration]),/No approved/);assert.throws(()=>resolveJourneyTarget(f.quote,f.registration.id,f.digest,[{...f.registration,expiresAt:"2000-01-01T00:00:00.000Z"}]),/expired/);assert.throws(()=>assertSeparateJourneyOrigin(f.registration,origin),/separately approved/);
});
test("each native lifecycle profile is independently GET-read, persisted step by step and canonically evaluated",async()=>{
 for(const [profile,expected]of[["fixed",{observed:20,issues:0,unavailable:0}],["cancel-credit",{observed:14,issues:2,unavailable:4}],["move-loss",{observed:16,issues:2,unavailable:2}],["retry-duplicate",{observed:18,issues:2,unavailable:0}]] as const){const f=await fixture(profile),result=await execute(f.quote,f.digest,f.registration),evaluation=evaluateStoredProjectJourneyReport(result.report);
  assert.deepEqual(evaluation.summary,{steps:20,...expected},profile);assert.equal(result.saves,42);assert.ok(result.serverGets>=20&&result.serverGets<=28);assert.ok(result.browserPosts<=11);assert.equal(result.quote.proof.delivery!.journeyRun,undefined);assert.equal(projectJourneyReportsFor(result.quote.proof.delivery!).length,1);assert.deepEqual(validateStoredProjectJourneyReport(result.report,{deliveryId:result.quote.proof.delivery!.id,deliveryDigest:f.digest,plan:result.quote.proof.delivery!.journeyPlan,projectId:f.quote.id}),result.report);assert.ok(new TextEncoder().encode(JSON.stringify(result.report)).byteLength<64*1024);assert.equal(evaluation.scope.privateDeliveryLinked,true);assert.equal(evaluation.scope.browserWritesAttested,false);
  assert.ok(evaluation.steps.find(step=>step.id==="create")!.actual.includes(new URL("bookings",f.registration.backendBaseUrl).pathname));assert.ok(evaluation.steps.every(step=>!step.actual.includes("/journey-api/")),"Internal evaluator paths must never be displayed as seller observations");assert.ok(evaluation.observations.flatMap(row=>row.requests??[]).every(request=>request.path.startsWith(new URL(f.registration.backendBaseUrl).pathname)),"Returned raw traces must retain the registered seller service path");
  const count=result.rows.reduce((n,row)=>n+(row.status==="active"?Number(row.party_size):0),0);assert.equal(count,profile==="fixed"?11:profile==="cancel-credit"?12:profile==="move-loss"?9:12);
 }
});
test("run tickets and step leases reject cross-version, cross-role, replay, untrusted readbacks and revoked targets",async()=>{
 const f=await fixture(),q=beginProjectJourneyRun(f.quote,"buyer",startInput(f.quote,f.registration.id),f.digest,f.registration),run=q.proof.delivery!.journeyRun!,input={action:"observe",deliveryId:run.deliveryId,runId:run.id,stepId:"meta"};
 assert.throws(()=>beginProjectJourneyRun(q,"buyer",startInput(q,f.registration.id),f.digest,f.registration),/already pending/);assert.throws(()=>beginProjectJourneyStep(q,"seller",input),/role that initiated/);assert.throws(()=>beginProjectJourneyStep(q,"buyer",{...input,runId:crypto.randomUUID()}),/no longer matches/);assert.throws(()=>beginProjectJourneyStep(q,"buyer",{...input,stepId:"create"}),/canonical order/);assert.throws(()=>beginProjectJourneyStep(q,"buyer",{...input,merchant:{status:200,body:{}}}),/unsupported fields/);assert.throws(()=>beginProjectJourneyStep(q,"buyer",{...input,requests:[]}),/client-supplied/);
 const begun=beginProjectJourneyStep(q,"buyer",input),saved=finishProjectJourneyStep(begun.quote,run.id,begun.leaseId,{id:"meta",unavailableReason:"synthetic-outbound-blocked"});assert.throws(()=>finishProjectJourneyStep(saved,run.id,begun.leaseId,{id:"meta"}),/lease changed/);assert.equal(projectJourneyCommand(saved.proof.delivery!.journeyRun!,"create"),undefined);assert.throws(()=>beginProjectJourneyStep(saved,"buyer",{...input,stepId:"create",ui:{}}),/blocked/);
 assert.throws(()=>requireCurrentJourneyRegistration(q,f.digest,[]),/No approved/);assert.throws(()=>requireCurrentJourneyRegistration(q,f.digest,[{...f.registration,registrationRevision:"r2"}]),/changed/);
 const ended=finishProjectJourneyRun(saved,"seller",{action:"abort",deliveryId:run.deliveryId,runId:run.id});assert.equal(evaluateStoredProjectJourneyReport(ended.proof.delivery!.journeyReport!).summary.unavailable,20);assert.throws(()=>finishProjectJourneyRun(ended,"buyer",{action:"abort",deliveryId:run.deliveryId,runId:run.id}),/no longer matches/);
});
test("exact report acknowledgement freezes A while supplemental B and replacement cannot rewrite A",async()=>{
 const f=await fixture(),a=await execute(f.quote,f.digest,f.registration),delivery=a.quote.proof.delivery!,reportA=delivery.journeyReport!;
 assert.throws(()=>validateProjectJourneyDecision(a.quote,{reportId:reportA.id}),/client-supplied/);const decision={reportId:reportA.id,acknowledgeClientObservation:true};assert.equal(validateProjectJourneyDecision(a.quote,decision)!.reportId,reportA.id);
 let accepted=acceptDelivery(a.quote,{deliveryId:delivery.id,confirm:true,manualChecks:delivery.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId),journeyDecision:decision});const frozen=structuredClone(accepted.proof.delivery!.acceptanceEvidence!);assertAcceptedEvidenceReference(accepted);
 const b=await execute(accepted,f.digest,f.registration);assert.equal(projectJourneyReportsFor(b.quote.proof.delivery!).length,2);assert.notEqual(b.report.id,reportA.id);assert.deepEqual(b.quote.proof.delivery!.acceptanceEvidence,frozen);assertAcceptedEvidenceReference(b.quote);
 const changed=structuredClone(reportA);changed.deliveryDigest="b".repeat(64);assert.throws(()=>validateStoredProjectJourneyReport(changed,{deliveryId:delivery.id,deliveryDigest:f.digest,projectId:f.quote.id}));
 const edits=structuredClone(a.quote);edits.proof.collaboration!.stage="changes_requested";const replacement=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Replacement</title></head><body>New upload</body></html>"},edits.proof.project!,"en",2);const next=prepareReplacement(edits,replacement);assert.equal(next.proof.delivery!.journeyReport,undefined);assert.equal(next.proof.delivery!.journeyPlan,undefined);assert.equal(next.proof.delivery!.journeyHistory,undefined);assert.equal(edits.proof.delivery!.journeyReport!.id,reportA.id);
});
test("server read timeout retains unavailable evidence and a full twenty-step report without claiming success",async()=>{
 const f=await fixture();let q=beginProjectJourneyRun(f.quote,"buyer",startInput(f.quote,f.registration.id),f.digest,f.registration),requests=0;
 for(const stepId of JOURNEY_STEP_IDS){const run=q.proof.delivery!.journeyRun!;assert.equal(projectJourneyCommand(run,stepId),undefined);const begun=beginProjectJourneyStep(q,"buyer",{action:"observe",deliveryId:run.deliveryId,runId:run.id,stepId});q=persisted(begun.quote);const observed=await readProjectJourneyStep(q.proof.delivery!.journeyRun!,begun.observation,{timeoutMs:2,fetch:async()=>{requests++;return new Promise<Response>(()=>{});}});q=persisted(finishProjectJourneyStep(q,run.id,begun.leaseId,observed.observation,observed.metadata));}
 const run=q.proof.delivery!.journeyRun!;q=finishProjectJourneyRun(q,"buyer",{action:"finish",deliveryId:run.deliveryId,runId:run.id});const report=q.proof.delivery!.journeyReport!;assert.deepEqual(evaluateStoredProjectJourneyReport(report).summary,{steps:20,observed:0,issues:0,unavailable:20});assert.ok(requests>0);assert.equal(report.input.observations[0].unavailableReason,"server_read_timeout");assert.equal(q.proof.delivery!.journeyRun,undefined);
});
test("large server evidence is marked unavailable without stranding a run or evicting earlier evidence",async()=>{
 const f=await fixture();let q=beginProjectJourneyRun(f.quote,"buyer",startInput(f.quote,f.registration.id),f.digest,f.registration);
 for(const stepId of JOURNEY_STEP_IDS){const run=q.proof.delivery!.journeyRun!,begun=beginProjectJourneyStep(q,"buyer",{action:"observe",deliveryId:run.deliveryId,runId:run.id,stepId});q=begun.quote;const reading:JourneyObservation={...begun.observation,unavailableReason:"synthetic-test-no-browser",merchant:{status:200,body:{unused:"x".repeat(15000)}}};q=persisted(finishProjectJourneyStep(q,run.id,begun.leaseId,reading));}
 const run=q.proof.delivery!.journeyRun!;q=finishProjectJourneyRun(q,"buyer",{action:"finish",deliveryId:run.deliveryId,runId:run.id});assert.ok(q.proof.delivery!.journeyReport!.input.observations.some(o=>o.unavailableReason?.startsWith("evidence_size_limit")));assert.equal(q.proof.delivery!.journeyReport!.input.observations[0].merchant?.status,200);assert.equal(q.proof.delivery!.journeyReport!.input.observations.length,20);
});

test("a native adapter declares its own revision separately from the canonical bridge without changing scoring or old registrations",async()=>{
 const f=await fixture(),result=await execute(f.quote,f.digest,f.registration),legacy=structuredClone(result.report);
 assert.equal(legacy.registration.bridgeRevision,undefined);assert.deepEqual(validateJourneyRegistration(f.registration),f.registration);
 const adapted=structuredClone(legacy);adapted.registration=validateJourneyRegistration({...adapted.registration,deploymentRevision:"florist-enrolments-v1",bridgeRevision:"lifecycle-fixed-v1"});
 adapted.input.metadata={...(adapted.input.metadata as object),nativeRevision:"florist-enrolments-v1"};adapted.input.observations[0].requests![0].response=structuredClone(adapted.input.metadata);
 assert.equal(evaluateStoredProjectJourneyReport(adapted).summary.observed,20);
 assert.equal(evaluateStoredProjectJourneyReport(adapted).frontendEntry,adapted.input.frontendEntry);
 assert.deepEqual(validateStoredProjectJourneyReport(adapted),adapted);
 adapted.input.metadata={...(adapted.input.metadata as object),nativeRevision:"other-native-revision"};adapted.input.observations[0].requests![0].response=structuredClone(adapted.input.metadata);
 assert.equal(evaluateStoredProjectJourneyReport(adapted).steps[0].outcome,"mismatch");
 assert.throws(()=>validateJourneyRegistration({...f.registration,deploymentRevision:"native-without-bridge"}));
 assert.throws(()=>validateJourneyRegistration({...f.registration,deploymentRevision:"florist-enrolments-v1",bridgeRevision:"lifecycle-move-loss-v1"}));
});

test("a resumed client cannot send its next browser action at or after run/registration expiry",async()=>{
 const f=await fixture(),now=Date.now(),q=beginProjectJourneyRun(f.quote,"buyer",startInput(f.quote,f.registration.id),f.digest,f.registration,now),run=q.proof.delivery!.journeyRun!;
 assert.equal(projectJourneyClientWindowOpen(run,now),true);assert.equal(projectJourneyClientWindowOpen(run,Date.parse(run.expiresAt)),false);assert.equal(projectJourneyClientWindowOpen(run,Date.parse(run.expiresAt)+1),false);
 assert.equal(projectJourneyClientWindowOpen({...run,registration:{...run.registration,expiresAt:new Date(now).toISOString()}},now),false);assert.equal(projectJourneyClientWindowOpen(run,NaN),false);
});
