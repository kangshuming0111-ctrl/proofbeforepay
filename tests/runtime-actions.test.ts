import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote, ProofRole } from "../lib/contracts.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { beginRuntimeRun, finishRuntimeRun } from "../lib/runtime-actions.ts";
import { parseRuntimePlan, RUNTIME_TARGETS, runtimeDeliveryDigest, runtimeReportsFor, savedRuntimePlan, validateRuntimeDecision } from "../lib/runtime-project.ts";
import { executeRuntimeCheck, type RuntimeFetch } from "../lib/runtime-runner.ts";
import { acceptDelivery, prepareReplacement } from "../lib/proof-workflow.ts";
import { assertAcceptedEvidenceReference, recordCaptureConsent } from "../lib/acceptance-evidence.ts";
import { validateAcceptance } from "../lib/proof-domain.ts";

const summary="Accept a booking with required slot and valid email; retain its record for readback and handle repeated submissions without duplicates.";
const at=new Date().toISOString();
const files={"index.html":"<!doctype html><html><head><title>Booking test</title></head><body><h1>Book a visit</h1><p>Test-only booking handoff.</p></body></html>"};
const fixed=RUNTIME_TARGETS.find(target=>target.id==="lab-fixed")!;
async function fixture():Promise<ProofQuote> {
  const units=summaryCoverageUnits(summary);
  const parsed=parseStaticProject({title:"Synthetic backend acceptance",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(unit=>({id:unit.id,disposition:"include"}))},runtimeCheck:{protocol:"booking-http-v1",criterionId:units[0].id,confirmed:true}},"en");
  const delivery=createUploadedDelivery(files,parsed.project,"en",1);
  delivery.backendTargetId=fixed.id;delivery.runtimeDeliveryDigest=await runtimeDeliveryDigest(delivery.files);
  return{id:"runtime-fixture",reference:"PBP-RUNTIME",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Static rule evidence only"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Synthetic fixture ready for review"},feedback:[]}}};
}
function startInput(q:ProofQuote){return{deliveryId:q.proof.delivery!.id,previousReportId:q.proof.delivery!.runtimeReport?.id??null,confirm:true};}
function consent(q:ProofQuote,extra:Record<string,unknown>={}){return{deliveryId:q.proof.delivery!.id,confirm:true,manualChecks:q.proof.delivery!.evidence.filter(item=>item.finding==="needs_human").map(item=>item.criterionId),runtimeDecision:{reportId:q.proof.delivery!.runtimeReport?.id,...extra}};}
function backend(acceptInvalid=false):RuntimeFetch {
  let saved:Record<string,unknown>|undefined;
  return async(url,init)=>{
    const path=new URL(url).pathname.replace(new URL(fixed.baseUrl).pathname,"");
    if(path==="meta")return Response.json({revision:fixed.revision});
    if(init.method==="GET")return saved?Response.json(saved):Response.json({error:"not_found"},{status:404});
    const body=JSON.parse(init.body as string) as Record<string,unknown>;
    if(!body.slot||body.email==="not-an-email")return Response.json(acceptInvalid?{accepted:true}:{code:"synthetic_validation_failed"},{status:acceptInvalid?201:422});
    if(saved)return body.partySize===3?Response.json({code:"idempotency_conflict"},{status:409}):Response.json(saved);
    saved={...body,id:"receipt-synthetic-1",revision:fixed.revision};return Response.json(saved,{status:201});
  };
}
async function completed(q:ProofQuote,acceptInvalid=false):Promise<ProofQuote>{
  const pending=beginRuntimeRun(q,"seller",startInput(q),q.proof.delivery!.runtimeDeliveryDigest!);
  const delivery=pending.proof.delivery!,run=delivery.runtimeRun!;
  const report=await executeRuntimeCheck({deliveryId:delivery.id,deliveryDigest:delivery.runtimeDeliveryDigest!,runId:run.id,startedAt:run.startedAt,plan:savedRuntimePlan(pending)!,target:fixed},{fetch:backend(acceptInvalid)});
  return finishRuntimeRun(pending,report);
}

test("backend plan is separately confirmed and tied to an included original source",async()=>{
  const q=await fixture(),project=q.proof.project!,plan=project.runtimeCheck!;
  assert.deepEqual(parseRuntimePlan({...plan,confirmed:true},project,true),plan);
  assert.throws(()=>parseRuntimePlan(plan,project,true),/confirm/);
  assert.throws(()=>parseRuntimePlan({...plan,confirmed:false},project,true),/confirm/);
  assert.throws(()=>parseRuntimePlan({...plan,source:{...plan.source,excerpt:"Other requirement"}},project),/source reference/);
  assert.throws(()=>parseRuntimePlan({...plan,criterionId:"unrelated"},project),/included original/);
  const excluded=structuredClone(project);excluded.coverage!.decisions[0].disposition="exclude";
  assert.throws(()=>parseRuntimePlan(plan,excluded),/included original/);
  const forged=structuredClone(project);forged.coverage!.sourceText="A different contract";
  assert.throws(()=>parseRuntimePlan(plan,forged),/included original/);
  const scopeChanged=structuredClone(q);scopeChanged.summary="A different requirement";
  assert.throws(()=>savedRuntimePlan(scopeChanged),/saved scope differ/);
});

test("run lease needs role, explicit write consent, exact delivery, digest and latest report",async()=>{
  const q=await fixture(),digest=q.proof.delivery!.runtimeDeliveryDigest!,before=structuredClone(q);
  assert.throws(()=>beginRuntimeRun(q,"outsider" as ProofRole,startInput(q),digest),error=>!!error&&typeof error==="object"&&"status"in error&&error.status===403);
  assert.throws(()=>beginRuntimeRun(q,"buyer",{...startInput(q),confirm:false},digest),/Authorize synthetic/);
  assert.throws(()=>beginRuntimeRun(q,"buyer",{...startInput(q),deliveryId:"another"},digest),/current upload/);
  assert.throws(()=>beginRuntimeRun(q,"buyer",startInput(q),"b".repeat(64)),/current upload/);
  assert.throws(()=>beginRuntimeRun(q,"buyer",{...startInput(q),previousReportId:"old"},digest),/report changed/);
  const draft=structuredClone(q);draft.status="draft";assert.throws(()=>beginRuntimeRun(draft,"buyer",startInput(draft),digest),/not open/);
  const payment=structuredClone(q);payment.proof.paymentOperation="capture";assert.throws(()=>beginRuntimeRun(payment,"buyer",startInput(payment),digest),/not open/);
  const unknown=structuredClone(q);unknown.proof.delivery!.backendTargetId="unregistered";assert.throws(()=>beginRuntimeRun(unknown,"buyer",startInput(unknown),digest),/registered/);
  const pending=beginRuntimeRun(q,"seller",startInput(q),digest);
  assert.notEqual(pending.proof.delivery!.runtimeRun!.id,undefined);assert.equal(pending.proof.delivery!.runtimeRun!.deliveryId,q.proof.delivery!.id);assert.equal(pending.proof.delivery!.runtimeRun!.deliveryDigest,digest);assert.equal(pending.proof.delivery!.runtimeRun!.targetId,fixed.id);
  assert.deepEqual(q,before);
});

test("active duplicate is rejected and expired retry reuses the same idempotent run identity",async()=>{
  const q=await fixture(),now=Date.now(),digest=q.proof.delivery!.runtimeDeliveryDigest!;
  const pending=beginRuntimeRun(q,"buyer",startInput(q),digest,now),run=structuredClone(pending.proof.delivery!.runtimeRun!);
  assert.throws(()=>beginRuntimeRun(pending,"seller",startInput(pending),digest,now+1),/already pending/);
  const retry=beginRuntimeRun(pending,"seller",startInput(pending),digest,now+46_000);
  assert.equal(retry.proof.delivery!.runtimeRun!.id,run.id);assert.equal(retry.proof.delivery!.runtimeRun!.startedAt,run.startedAt);assert.notEqual(retry.proof.delivery!.runtimeRun!.expiresAt,run.expiresAt);
  const inconsistent=structuredClone(pending);inconsistent.proof.delivery!.runtimeRun!.deliveryDigest="f".repeat(64);
  assert.throws(()=>beginRuntimeRun(inconsistent,"buyer",startInput(inconsistent),digest,now+46_000),/inconsistent/);
});

test("finish appends exact validated report and rejects stale or replayed bindings without input mutation",async()=>{
  const q=await fixture(),pending=beginRuntimeRun(q,"buyer",startInput(q),q.proof.delivery!.runtimeDeliveryDigest!),delivery=pending.proof.delivery!,run=delivery.runtimeRun!;
  const report=await executeRuntimeCheck({deliveryId:delivery.id,deliveryDigest:delivery.runtimeDeliveryDigest!,runId:run.id,startedAt:run.startedAt,plan:savedRuntimePlan(pending)!,target:fixed},{fetch:backend()});
  const before=structuredClone(pending),finished=finishRuntimeRun(pending,report);
  assert.deepEqual(pending,before);assert.equal(finished.proof.delivery!.runtimeRun,undefined);assert.equal(finished.proof.delivery!.runtimeHistory!.length,1);assert.deepEqual(finished.proof.delivery!.runtimeReport,report);
  report.steps[0].actual="Outside mutation";assert.notEqual(finished.proof.delivery!.runtimeReport!.steps[0].actual,"Outside mutation");
  const current=finished.proof.delivery!.runtimeReport!;
  for(const mutation of [(r:typeof current)=>{r.deliveryId="foreign";},(r:typeof current)=>{r.runId="foreign-run";},(r:typeof current)=>{r.deliveryDigest="e".repeat(64);},(r:typeof current)=>{r.target.id="lab-flawed";},(r:typeof current)=>{r.summary.observed=900;}]){const copy=structuredClone(current);mutation(copy);assert.throws(()=>finishRuntimeRun(pending,copy));}
  const replay=structuredClone(finished);replay.proof.delivery!.runtimeRun=structuredClone(run);assert.throws(()=>finishRuntimeRun(replay,current),/cannot replace/);
  assert.throws(()=>finishRuntimeRun(finished,current),/no longer matches/);
  const history=runtimeReportsFor(finished.proof.delivery!);history[0].steps=[];assert.equal(finished.proof.delivery!.runtimeReport!.steps.length,8);
});

test("acceptance needs the exact latest backend report and explicit acknowledgement of all exceptions",async()=>{
  const q=await fixture();assert.throws(()=>acceptDelivery(q,consent(q),at),/Run the agreed backend/);
  const failed=await completed(q,true),report=failed.proof.delivery!.runtimeReport!,steps=report.steps.filter(step=>step.outcome!=="observed").map(step=>step.id);
  assert.ok(steps.length>0);assert.throws(()=>acceptDelivery(failed,consent(failed),at),/every failed or uncertain/);
  assert.throws(()=>acceptDelivery(failed,consent(failed,{exceptionReason:"Reviewed explicitly but one failed step omitted",acknowledgedSteps:steps.slice(1)}),at),/every failed or uncertain/);
  assert.throws(()=>validateRuntimeDecision(failed,{reportId:"old",exceptionReason:"Reviewed explicitly",acknowledgedSteps:steps}),/report changed/);
  const accepted=acceptDelivery(failed,consent(failed,{exceptionReason:"Buyer accepts the documented test exception after direct review",acknowledgedSteps:steps}),at);
  assert.equal(accepted.proof.collaboration!.stage,"accepted");assert.equal(accepted.proof.paymentState,"unfunded");
  const snapshot=accepted.proof.delivery!.acceptanceEvidence![0];assert.equal(snapshot.runtimeReportId,report.id);assert.deepEqual(snapshot.runtimeAcknowledgedSteps,steps);assert.equal(snapshot.runtimeDeliveryDigest,report.deliveryDigest);assert.equal(snapshot.runtimeTargetId,fixed.id);
});

test("new backend report invalidates stale acceptance request; pending run cannot be accepted",async()=>{
  const first=await completed(await fixture()),old=consent(first),pending=beginRuntimeRun(first,"buyer",startInput(first),first.proof.delivery!.runtimeDeliveryDigest!);
  assert.throws(()=>validateRuntimeDecision(pending,old.runtimeDecision),/pending backend run/);
  assert.throws(()=>acceptDelivery(pending,old,at),/pending backend run/);
  const second=await completed(first,true);
  assert.notEqual(second.proof.delivery!.runtimeReport!.id,first.proof.delivery!.runtimeReport!.id);assert.throws(()=>acceptDelivery(second,old,at),/report changed/);
});

test("acceptance freezes report A while later B differs and capture still references A",async()=>{
  const first=await completed(await fixture()),accepted=acceptDelivery(first,consent(first),at),snapshot=structuredClone(accepted.proof.delivery!.acceptanceEvidence![0]);
  const second=await completed(accepted,true);
  assert.equal(second.proof.delivery!.runtimeHistory!.length,2);assert.ok(second.proof.delivery!.runtimeReport!.summary.issues>0);assert.deepEqual(second.proof.delivery!.acceptanceEvidence![0],snapshot);
  assert.doesNotThrow(()=>assertAcceptedEvidenceReference(second));
  second.proof.paymentState="authorized";second.proof.authorizationId="synthetic-authorization";second.proof.authorizationExpiresAt=new Date(Date.now()+60_000).toISOString();
  const checks=validateAcceptance(second,consent(second));const capture=recordCaptureConsent(second,checks,at);
  assert.equal(capture.proof.acceptedEvidenceSnapshotId,snapshot.id);assert.equal(capture.proof.delivery!.acceptanceEvidence![0].runtimeReportId,first.proof.delivery!.runtimeReport!.id);assert.equal(capture.proof.paymentOperation,"capture");
  const absent=structuredClone(second);absent.proof.delivery!.runtimeHistory=absent.proof.delivery!.runtimeHistory!.slice(1);assert.throws(()=>assertAcceptedEvidenceReference(absent),/unavailable or has changed/);
  const wrongDigest=structuredClone(second);wrongDigest.proof.delivery!.runtimeDeliveryDigest="d".repeat(64);assert.throws(()=>assertAcceptedEvidenceReference(wrongDigest),/unavailable or has changed/);
});

test("replacement drops runtime evidence and pending lease without changing archived evidence",async()=>{
  const first=await completed(await fixture()),archive=structuredClone(first);
  first.proof.collaboration!.stage="changes_requested";
  const replacement={...structuredClone(first.proof.delivery!),id:"new-upload",runtimeRun:{id:"stale-run",deliveryId:"new-upload",deliveryDigest:first.proof.delivery!.runtimeDeliveryDigest!,targetId:fixed.id,startedAt:at,expiresAt:new Date(Date.now()+30_000).toISOString()}};
  const next=prepareReplacement(first,replacement);
  assert.equal(next.proof.delivery!.runtimeReport,undefined);assert.equal(next.proof.delivery!.runtimeHistory,undefined);assert.equal(next.proof.delivery!.runtimeRun,undefined);assert.equal(next.proof.delivery!.acceptanceEvidence,undefined);
  assert.equal(next.proof.review,undefined);assert.equal(next.proof.collaboration!.stage,"in_progress");assert.equal(archive.proof.delivery!.runtimeHistory!.length,1);
});
