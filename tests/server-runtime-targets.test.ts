import assert from "node:assert/strict";
import test from "node:test";
import {register} from "node:module";
import type {ProofQuote} from "../lib/contracts.ts";
import {DomainError} from "../lib/domain.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {beginRuntimeRun,finishRuntimeRun} from "../lib/runtime-actions.ts";
import {deliveryRuntimeTarget,runtimeDeliveryDigest,savedRuntimePlan,validateRuntimeDecision} from "../lib/runtime-project.ts";
import {executeRuntimeCheck,type RuntimeFetch} from "../lib/runtime-runner.ts";
import {sameRuntimeRegistration,type RuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";
import {prepareReplacement,requestChanges,requireWorkflowAction} from "../lib/proof-workflow.ts";

// The production wrapper reads Cloudflare server configuration. Intercept only
// that module for this isolated file: no actual environment or endpoint is read.
const stubUrl="data:text/javascript,export const env = {}";
// module.register is available across the declared Node >=22.13 range; the
// newer synchronous registerHooks API would unnecessarily raise that minimum.
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(specifier,context,nextResolve){
  return specifier==="cloudflare:workers"?{url:${JSON.stringify(stubUrl)},shortCircuit:true}:nextResolve(specifier,context);
}`)}`,import.meta.url);
const {availableRuntimeTargets,operatorRuntimeRegistrations,resolveUploadRuntimeTarget,requireCurrentRuntimeRegistration,authorizeRuntimeExecution}=await import("../lib/server-runtime-targets.ts");
const fakeEnv=(await import("cloudflare:workers")).env as unknown as Record<string,unknown>;

const now=Date.parse("2026-11-02T00:00:00.000Z");
const summary="Accept a booking with required slot and valid email; retain its record for readback and handle repeated submissions without duplicates.";
const files={"index.html":"<!doctype html><html><head><title>Merchant</title></head><body><h1>Book a visit</h1></body></html>"};
async function fixture(){
  const units=summaryCoverageUnits(summary);
  const parsed=parseStaticProject({title:"Merchant staging acceptance",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(unit=>({id:unit.id,disposition:"include"}))},runtimeCheck:{protocol:"booking-http-v1",criterionId:units[0].id,confirmed:true}},"en");
  const delivery=createUploadedDelivery(files,parsed.project,"en",1),digest=await runtimeDeliveryDigest(delivery.files);
  const quote:ProofQuote={id:"merchant-project",reference:"PBP-MERCHANT",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:new Date(now).toISOString(),proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at:new Date(now).toISOString(),note:"Synthetic upload"},feedback:[]}}};
  const registration:RuntimeRegistrationSnapshot={id:"merchant-staging",label:"Merchant staging API",registrationRevision:"registration-1",projectId:quote.id,protocol:"booking-http-v1",baseUrl:"https://merchant.example.org/pbp/",deploymentRevision:"merchant-build-1",frontendBundleDigest:digest,backendArtifactDigest:"b".repeat(64),backendSourceCommit:"c".repeat(40),expiresAt:"2036-11-03T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
  const resolved=resolveUploadRuntimeTarget(quote,registration.id,digest,[registration],now);
  delivery.backendTargetId=resolved.target.id;delivery.runtimeDeliveryDigest=digest;delivery.runtimeRegistration=resolved.registration;
  return{quote,registration,digest};
}
function status(code:number){return(error:unknown)=>error instanceof DomainError&&error.status===code;}
function syntheticBackend(registration:RuntimeRegistrationSnapshot):RuntimeFetch{
  let saved:Record<string,unknown>|undefined;
  return async(url,init)=>{
    const path=new URL(url).pathname.slice(new URL(registration.baseUrl).pathname.length);
    if(path==="meta")return Response.json({revision:registration.deploymentRevision,registrationRevision:registration.registrationRevision,projectId:registration.projectId,frontendBundleDigest:registration.frontendBundleDigest,backendArtifactDigest:registration.backendArtifactDigest,backendSourceCommit:registration.backendSourceCommit});
    if(init.method==="GET")return saved?Response.json(saved):Response.json({error:"not_found"},{status:404});
    const body=JSON.parse(init.body as string) as Record<string,unknown>;
    if(!body.slot||body.email==="not-an-email")return Response.json({code:"synthetic_validation_failed"},{status:422});
    if(saved)return body.partySize===3?Response.json({code:"idempotency_conflict"},{status:409}):Response.json(saved);
    saved={...body,id:"synthetic-receipt-1",revision:registration.deploymentRevision};return Response.json(saved,{status:201});
  };
}

test("server registry config is optional, bounded and hides malformed config details",()=>{
  delete fakeEnv.PBP_RUNTIME_TARGETS;assert.deepEqual(operatorRuntimeRegistrations(),[]);
  for(const raw of [7,"{SECRET: invalid-json}"," ".repeat(32769)]){
    fakeEnv.PBP_RUNTIME_TARGETS=raw;
    assert.throws(()=>operatorRuntimeRegistrations(),error=>status(503)(error)&&!(error as Error).message.includes("SECRET"));
  }
  delete fakeEnv.PBP_RUNTIME_TARGETS;
});

test("member selector lists only active same-project same-protocol registrations and safe fixture descriptors",async()=>{
  const {quote,registration}=await fixture();
  const records=[registration,{...registration,id:"other-project",projectId:"other-project"},{...registration,id:"other-protocol",protocol:"booking-http-v2" as const},{...registration,id:"expired",expiresAt:new Date(now).toISOString()}];
  const targets=availableRuntimeTargets(quote,records,now);
  assert.deepEqual(targets.map(item=>item.id),["lab-flawed","lab-fixed",registration.id]);
  assert.equal(targets[2].kind,"registered");
  for(const target of targets)for(const forbidden of ["baseUrl","backendArtifactDigest","backendSourceCommit","projectId","provenance"])assert.equal(Object.hasOwn(target,forbidden),false);
  const noPlan=structuredClone(quote);delete noPlan.proof.project!.runtimeCheck;
  fakeEnv.PBP_RUNTIME_TARGETS="invalid";assert.deepEqual(availableRuntimeTargets(noPlan),[]);delete fakeEnv.PBP_RUNTIME_TARGETS;
});

test("upload pins exact server declaration; cross-project, unknown, expired and digest-mismatched entries refuse the upload",async()=>{
  const {quote,registration,digest}=await fixture();
  const result=resolveUploadRuntimeTarget(quote,registration.id,digest,[registration],now);
  assert.equal(sameRuntimeRegistration(result.registration,registration),true);
  result.registration!.label="mutated response";assert.equal(registration.label,"Merchant staging API");
  assert.throws(()=>resolveUploadRuntimeTarget(quote,"unregistered",digest,[],now),status(400));
  assert.throws(()=>resolveUploadRuntimeTarget(quote,registration.id,digest,[{...registration,projectId:"another-project"}],now),status(400));
  assert.throws(()=>resolveUploadRuntimeTarget(quote,registration.id,"d".repeat(64),[registration],now),status(409));
  assert.throws(()=>resolveUploadRuntimeTarget(quote,registration.id,digest,[{...registration,expiresAt:new Date(now).toISOString()}],now),status(409));
  // Existing fixture uploads require no custom registry or snapshot.
  fakeEnv.PBP_RUNTIME_TARGETS="invalid";
  assert.deepEqual(Object.keys(resolveUploadRuntimeTarget(quote,"lab-fixed",digest)).sort(),["target"]);
  delete fakeEnv.PBP_RUNTIME_TARGETS;
});

test("new runs reject removed, retargeted, cross-project, expired and changed declarations before outbound work",async()=>{
  const {quote,registration,digest}=await fixture();
  assert.deepEqual(requireCurrentRuntimeRegistration(quote,digest,[registration],now),registration);
  const changed=[[],[{...registration,baseUrl:"https://other.example.org/pbp/"}],[{...registration,baseUrl:"https://merchant.example.org/new-path/"}],[{...registration,registrationRevision:"registration-2"}],[{...registration,projectId:"another-project"}],[{...registration,frontendBundleDigest:"d".repeat(64)}],[{...registration,expiresAt:"2037-01-01T00:00:00.000Z"}]];
  for(const records of changed){
    let outbound=0;
    assert.throws(()=>{requireCurrentRuntimeRegistration(quote,digest,records,now);outbound++;},status(409));
    assert.equal(outbound,0);
  }
  assert.throws(()=>requireCurrentRuntimeRegistration(quote,digest,[registration],Date.parse(registration.expiresAt)),status(409));
  assert.throws(()=>requireCurrentRuntimeRegistration(quote,"d".repeat(64),[registration],now),status(409));
});

test("saved pins cannot bypass built-in-only legacy resolution or bind another upload",async()=>{
  const {quote}=await fixture(),delivery=quote.proof.delivery!;
  assert.equal(deliveryRuntimeTarget(delivery).baseUrl,delivery.runtimeRegistration!.baseUrl);
  const missing=structuredClone(delivery);delete missing.runtimeRegistration;
  assert.throws(()=>deliveryRuntimeTarget(missing),/registered/u);
  for(const patch of [{backendTargetId:"lab-fixed"},{runtimeDeliveryDigest:"d".repeat(64)}])assert.throws(()=>deliveryRuntimeTarget({...delivery,...patch}),status(409));
  const crossProject=structuredClone(quote);crossProject.proof.delivery!.runtimeRegistration!.projectId="another-project";
  assert.throws(()=>beginRuntimeRun(crossProject,"seller",{deliveryId:delivery.id,previousReportId:null,confirm:true},delivery.runtimeDeliveryDigest!,now),status(409));
});

test("finishing and explicit buyer report decisions retain historical pin after expiry and registry revocation",async()=>{
  const {quote,registration,digest}=await fixture(),delivery=quote.proof.delivery!;
  const input={deliveryId:delivery.id,previousReportId:null,confirm:true};
  assert.throws(()=>beginRuntimeRun(quote,"seller",{...input,confirm:false},digest,now),status(400));
  const pending=beginRuntimeRun(quote,"seller",input,digest,now),run=pending.proof.delivery!.runtimeRun!;
  const report=await executeRuntimeCheck({deliveryId:delivery.id,deliveryDigest:digest,runId:run.id,startedAt:run.startedAt,plan:savedRuntimePlan(pending)!,target:deliveryRuntimeTarget(delivery),registration},{fetch:syntheticBackend(registration)});
  assert.equal(report.steps.every(step=>step.outcome==="observed"),true);
  assert.equal(sameRuntimeRegistration(report.target.registration,registration),true);
  const originalNow=Date.now;
  Date.now=()=>Date.parse(registration.expiresAt)+1;
  try{
    assert.throws(()=>requireCurrentRuntimeRegistration(pending,digest,[]),status(409));
    const finished=finishRuntimeRun(pending,report);
    assert.deepEqual(validateRuntimeDecision(finished,{reportId:report.id}),{reportId:report.id});
    assert.equal(Object.hasOwn(finished.proof.delivery!.runtimeReport!.target,"baseUrl"),false);
    assert.equal(finished.proof.delivery!.runtimeReport!.target.registration!.baseUrl,registration.baseUrl);
  }finally{Date.now=originalNow;}
});

test("only an expired persisted lease can recover without HTTP after registration removal, retargeting, expiry or malformed config",async()=>{
  const {quote,registration,digest}=await fixture(),delivery=quote.proof.delivery!;
  const input={deliveryId:delivery.id,previousReportId:null,confirm:true};
  const pending=beginRuntimeRun(quote,"seller",input,digest,now),oldRun=pending.proof.delivery!.runtimeRun!;
  const afterLease=Date.parse(oldRun.expiresAt)+1;
  assert.throws(()=>authorizeRuntimeExecution(quote,digest,[],afterLease),status(409));
  assert.throws(()=>authorizeRuntimeExecution(pending,digest,[],now+1),status(409));
  assert.deepEqual(authorizeRuntimeExecution(pending,digest,[registration],afterLease),{resuming:true});
  const changed=[[],[{...registration,baseUrl:"https://other.example.org/pbp/"}],[{...registration,expiresAt:"2037-01-01T00:00:00.000Z"}]];
  const executions=changed.map(entries=>authorizeRuntimeExecution(pending,digest,entries,afterLease));
  executions.push(authorizeRuntimeExecution(pending,digest,[registration],Date.parse(registration.expiresAt)+1));
  fakeEnv.PBP_RUNTIME_TARGETS="invalid-registry";
  try{
    assert.throws(()=>authorizeRuntimeExecution(quote,digest,undefined,afterLease),status(503));
    assert.throws(()=>authorizeRuntimeExecution(pending,digest,undefined,now+1),status(409));
    executions.push(authorizeRuntimeExecution(pending,digest,undefined,afterLease));
  }finally{delete fakeEnv.PBP_RUNTIME_TARGETS;}
  for(const execution of executions){
    assert.deepEqual(execution,{resuming:true,noNetworkReason:"registration_no_longer_approved"});
    assert.throws(()=>beginRuntimeRun(pending,"seller",{...input,confirm:false},digest,afterLease),status(400));
    const leased=beginRuntimeRun(pending,"seller",input,digest,afterLease),run=leased.proof.delivery!.runtimeRun!;
    assert.equal(run.id,oldRun.id);assert.equal(run.startedAt,oldRun.startedAt);
    let calls=0;
    const report=await executeRuntimeCheck({deliveryId:delivery.id,deliveryDigest:digest,runId:run.id,startedAt:run.startedAt,plan:savedRuntimePlan(leased)!,target:deliveryRuntimeTarget(delivery),registration},{...execution,fetch:async()=>{calls++;throw new Error("must not contact a revoked registration");}});
    assert.equal(calls,0);assert.equal(report.id,oldRun.id);
    assert.equal(report.steps[0].reason,"registration_no_longer_approved");
    assert.equal(report.steps.every(step=>step.outcome==="unavailable"),true);
    const recovered=finishRuntimeRun(leased,report);
    assert.equal(recovered.proof.delivery!.runtimeRun,undefined);
    assert.equal(recovered.proof.delivery!.runtimeHistory!.at(-1)!.id,oldRun.id);
    assert.equal(recovered.proof.collaboration!.stage,"submitted");
    assert.throws(()=>validateRuntimeDecision(recovered,{reportId:report.id}),/every failed or uncertain/u);
    const returned=requestChanges(recovered,{deliveryId:delivery.id,feedback:[{criterionId:quote.proof.criteria[0].id,comment:"Register the new staging revision and resubmit."}]});
    assert.doesNotThrow(()=>requireWorkflowAction(returned,"seller","delivery"));
    const replacement=createUploadedDelivery({...files,"style.css":"body { color: black; }"},quote.proof.project!,"en",2);
    assert.doesNotThrow(()=>prepareReplacement(returned,replacement));
  }
  // The original external outcome remains unknown; recovery does not erase the
  // old lease, invent successful observations or mutate the caller's snapshot.
  assert.equal(pending.proof.delivery!.runtimeRun!.id,oldRun.id);
  assert.equal(pending.proof.delivery!.runtimeReport,undefined);
});

test("offline recovery refuses mismatched or malformed persisted lease bindings",async()=>{
  const {quote,digest}=await fixture(),delivery=quote.proof.delivery!;
  const pending=beginRuntimeRun(quote,"seller",{deliveryId:delivery.id,previousReportId:null,confirm:true},digest,now);
  const after=Date.parse(pending.proof.delivery!.runtimeRun!.expiresAt)+1;
  for(const patch of [{deliveryId:"other-delivery"},{targetId:"other-target"},{deliveryDigest:"d".repeat(64)},{expiresAt:"not-a-time"}]){
    const changed=structuredClone(pending);Object.assign(changed.proof.delivery!.runtimeRun!,patch);
    assert.throws(()=>authorizeRuntimeExecution(changed,digest,[],after),status(409));
  }
  assert.throws(()=>authorizeRuntimeExecution(pending,"d".repeat(64),[],after),status(409));
  const crossProject=structuredClone(pending);crossProject.proof.delivery!.runtimeRegistration!.projectId="other-project";
  assert.throws(()=>authorizeRuntimeExecution(crossProject,digest,[],after),status(409));
});
