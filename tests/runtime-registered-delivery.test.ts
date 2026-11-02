import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import type {ProofQuote} from "../lib/contracts.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {runtimeDeliveryDigest,savedRuntimePlan} from "../lib/runtime-project.ts";
import {executeRuntimeCheck,type RuntimeFetch} from "../lib/runtime-runner.ts";
import {beginRuntimeRun,finishRuntimeRun} from "../lib/runtime-actions.ts";
import {registrationTarget,type RuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";
import {assertAcceptedEvidenceReference,createAcceptanceEvidence,withAcceptanceEvidence} from "../lib/acceptance-evidence.ts";
import {acceptDelivery} from "../lib/proof-workflow.ts";
import {acceptanceSnapshotReservationBytes} from "../lib/evidence-budget.ts";
import {validateRuntimeReport} from "../lib/runtime-checks.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";

const summary="Each booking accepts at most 6 people.";
async function fixture():Promise<{quote:ProofQuote;registration:RuntimeRegistrationSnapshot}> {
  const units=summaryCoverageUnits(summary),at=new Date().toISOString();
  const parsed=parseStaticProject({title:"Own staging acceptance",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(unit=>({id:unit.id,disposition:"include"}))},runtimeCheck:{protocol:"booking-http-v2",criterionId:units[0].id,confirmed:true,policy:suggestBookingPolicy({start:0,end:summary.length,excerpt:summary})}},"en");
  const delivery=createUploadedDelivery({"index.html":"<!doctype html><title>Bookings &mdash; staging</title><main><p>Book a table</main>"},parsed.project,"en",1);
  const digest=await runtimeDeliveryDigest(delivery.files);
  const registration:RuntimeRegistrationSnapshot={id:"seller-staging",label:"Seller disposable staging",registrationRevision:"review-1",projectId:"registered-project",protocol:"booking-http-v2",baseUrl:"https://seller-staging.example.org/pbp/",deploymentRevision:"seller-build-7",frontendBundleDigest:digest,backendArtifactDigest:"b".repeat(64),backendSourceCommit:"c".repeat(40),expiresAt:new Date(Date.now()+3600_000).toISOString(),testOnly:true,provenance:"operator-approved-declaration"};
  delivery.backendTargetId=registration.id;delivery.runtimeDeliveryDigest=digest;delivery.runtimeRegistration=structuredClone(registration);
  const quote:ProofQuote={id:registration.projectId,reference:"PBP-REGISTERED",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Source checked"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Review own staging"},feedback:[]}}};
  return{quote,registration};
}
const start=(q:ProofQuote)=>beginRuntimeRun(q,"seller",{deliveryId:q.proof.delivery!.id,previousReportId:q.proof.delivery!.runtimeReport?.id??null,confirm:true},q.proof.delivery!.runtimeDeliveryDigest!);
function input(q:ProofQuote){const d=q.proof.delivery!,run=d.runtimeRun!;return{deliveryId:d.id,deliveryDigest:d.runtimeDeliveryDigest!,runId:run.id,startedAt:run.startedAt,plan:savedRuntimePlan(q)!,target:registrationTarget(d.runtimeRegistration!),registration:d.runtimeRegistration};}
const meta=(r:RuntimeRegistrationSnapshot)=>({protocol:r.protocol,revision:r.deploymentRevision,projectId:r.projectId,registrationRevision:r.registrationRevision,frontendBundleDigest:r.frontendBundleDigest,backendArtifactDigest:r.backendArtifactDigest,backendSourceCommit:r.backendSourceCommit});

test("registered staging uses actual HTTP, independent ID readback and frozen acceptance; no provider calls",async()=>{
  const {quote,registration}=await fixture(),records=new Map<string,Record<string,unknown>>(),ids=new Map<string,Record<string,unknown>>();
  let requests=0;
  // Synthetic socket-level test server, not an independently deployed seller or
  // a claim of durable storage. Native SQLite persistence has separate tests.
  const server=createServer(async(req,res)=>{
    requests++;res.setHeader("content-type","application/json");
    const reply=(value:unknown,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
    if(req.url==="/pbp/meta")return reply(meta(registration));
    if(req.method==="GET")return ids.has(req.url!.slice("/pbp/bookings/".length))?reply(ids.get(req.url!.slice("/pbp/bookings/".length))):reply({code:"not_found"},404);
    let raw="";for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw) as Record<string,unknown>;
    if(!body.slot||body.email==="not-an-email")return reply({code:"synthetic_validation_failed"},422);
    if(!Number.isInteger(body.partySize)||(body.partySize as number)<1)return reply({code:"party_size_invalid"},422);
    if((body.partySize as number)>6)return reply({code:"party_size_exceeded"},422);
    const key=String(req.headers["idempotency-key"]),old=records.get(key);
    if(old){const original={...old};delete original.id;delete original.revision;return JSON.stringify(original)===JSON.stringify(body)?reply(old):reply({code:"idempotency_conflict"},409);}
    const record={...body,id:crypto.randomUUID(),revision:registration.deploymentRevision};records.set(key,record);ids.set(record.id,record);return reply(record,201);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {
    const port=(server.address() as AddressInfo).port,pending=start(quote);
    const transport:RuntimeFetch=async(url,init)=>{
      const source=new URL(url);assert.equal(source.origin,"https://seller-staging.example.org");
      // Return the received HTTP response as a test transport response. Its
      // rewritten loopback URL is intentionally not a production target URL.
      const received=await fetch(`http://127.0.0.1:${port}${source.pathname}`,init);
      return new Response(received.body,{status:received.status,headers:received.headers});
    };
    const report=await executeRuntimeCheck(input(pending),{fetch:transport});
    assert.deepEqual(report.summary,{steps:18,observed:18,issues:0,unavailable:0},JSON.stringify(report.steps));assert.equal(requests,18);assert.equal(records.size,4);
    const completed=finishRuntimeRun(pending,report);
    const accepted=acceptDelivery(completed,{deliveryId:completed.proof.delivery!.id,confirm:true,manualChecks:completed.proof.delivery!.evidence.filter(row=>row.finding==="needs_human").map(row=>row.criterionId),runtimeDecision:{reportId:report.id}},new Date().toISOString());
    const snapshot=accepted.proof.delivery!.acceptanceEvidence![0];
    assert.deepEqual(snapshot.runtimeRegistration,registration);assert.notEqual(snapshot.runtimeRegistration,report.target.registration);
    assert.doesNotThrow(()=>assertAcceptedEvidenceReference(accepted));
    const changed=structuredClone(accepted);changed.proof.delivery!.runtimeRegistration!.registrationRevision="review-2";
    assert.throws(()=>assertAcceptedEvidenceReference(changed),/unavailable or has changed/);
    // Historical evidence is retained after expiry; only new HTTP work requires
    // current approval and a non-expired declaration.
    const expired=structuredClone(accepted),past="2000-01-01T00:00:00.000Z";
    expired.proof.delivery!.runtimeRegistration!.expiresAt=past;
    expired.proof.delivery!.runtimeReport!.target.registration!.expiresAt=past;
    expired.proof.delivery!.runtimeHistory![0].target.registration!.expiresAt=past;
    expired.proof.delivery!.acceptanceEvidence![0].runtimeRegistration!.expiresAt=past;
    assert.doesNotThrow(()=>assertAcceptedEvidenceReference(expired));
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("registered metadata mismatches stop after GET meta without synthetic POST writes",async()=>{
  const {quote,registration}=await fixture();
  for(const patch of [{projectId:"other-project"},{registrationRevision:"review-2"},{frontendBundleDigest:"d".repeat(64)},{backendArtifactDigest:"e".repeat(64)},{backendSourceCommit:"f".repeat(40)}]){
    const calls:string[]=[],pending=start(quote);
    const report=await executeRuntimeCheck(input(pending),{fetch:async(_url,init)=>{calls.push(init.method!);return Response.json({...meta(registration),...patch});}});
    assert.deepEqual(calls,["GET"]);assert.equal(report.steps[0].outcome,"mismatch");assert.ok(report.steps.slice(1).every(row=>row.outcome==="unavailable"));
    assert.doesNotThrow(()=>finishRuntimeRun(pending,report));
  }
});

test("forged and expired registration input is rejected before any network; report cannot drop the declaration",async()=>{
  const {quote}=await fixture(),pending=start(quote);let calls=0;
  const fetcher:RuntimeFetch=async()=>{calls++;throw new Error("must not reach HTTP");};
  for(const patch of [{frontendBundleDigest:"f".repeat(64)},{deploymentRevision:"changed"}]){
    const candidate=input(pending);candidate.registration={...candidate.registration!,...patch};
    await assert.rejects(()=>executeRuntimeCheck(candidate,{fetch:fetcher}),/differs/);
  }
  assert.equal(calls,0);
  const expired=input(pending);expired.registration={...expired.registration!,expiresAt:"2000-01-01T00:00:00.000Z"};
  const expiredReport=await executeRuntimeCheck(expired,{fetch:fetcher});
  assert.equal(calls,0);assert.equal(expiredReport.steps[0].reason,"registration_expired");assert.equal(expiredReport.summary.unavailable,18);
  const report=await executeRuntimeCheck(input(pending),{fetch:async()=>{throw new Error("synthetic unavailable");}});
  const dropped=structuredClone(report);delete dropped.target.registration;
  assert.throws(()=>validateRuntimeReport(dropped,input(pending)),/registration differs/);
  assert.throws(()=>finishRuntimeRun(pending,dropped),/registration differs/);
  const completed=finishRuntimeRun(pending,report),reason="Buyer accepts the unavailable synthetic staging observations after direct review";
  const snapshot=createAcceptanceEvidence(completed,completed.proof.delivery!.evidence.filter(row=>row.finding==="needs_human").map(row=>row.criterionId),new Date().toISOString(),undefined,{reportId:report.id,exceptionReason:reason,acknowledgedSteps:report.steps.map(row=>row.id)});
  const noDeclaration=structuredClone(snapshot);delete noDeclaration.runtimeRegistration;
  assert.throws(()=>withAcceptanceEvidence(completed.proof.delivery!,noDeclaration),/exact backend evidence/);
  const measured=new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  assert.ok(acceptanceSnapshotReservationBytes(completed)>measured);
  const noRegistration=structuredClone(completed);delete noRegistration.proof.delivery!.runtimeRegistration;
  assert.ok(acceptanceSnapshotReservationBytes(completed)>acceptanceSnapshotReservationBytes(noRegistration));
});
