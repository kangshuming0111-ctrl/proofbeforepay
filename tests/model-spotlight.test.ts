import assert from "node:assert/strict";
import test from "node:test";
import {buildModelSpotlight} from "../lib/model-spotlight.ts";
import {beginModelCheckRun} from "../lib/model-check-actions.ts";
import {acceptDelivery} from "../lib/proof-workflow.ts";
import {modelFixture,completeModel,modelConsent,modelInput} from "./model-check-fixture.ts";

test("main model presentation withholds verdicts until the actual current file digest is bound",async()=>{
 const f=await modelFixture(),q=completeModel(f.quote,f.digest,f.registration),delivery=q.proof.delivery!,before=structuredClone(delivery);
 assert.equal(buildModelSpotlight(delivery,{digestPending:true}).state,"checking");
 assert.equal(buildModelSpotlight(delivery,{}).state,"invalid");
 assert.equal(buildModelSpotlight(delivery,{deliveryDigest:"e".repeat(64)}).state,"invalid");
 assert.equal(buildModelSpotlight(delivery,{deliveryDigest:f.digest,projectId:"other-project"}).state,"invalid");
 const ready=buildModelSpotlight(delivery,{deliveryDigest:f.digest,projectId:q.id});assert.equal(ready.state,"ready");assert.equal(ready.diagnosis!.reportId,delivery.modelReport!.id);assert.equal(ready.acceptance,"not_accepted");assert.deepEqual(delivery,before);
 const stale=structuredClone(delivery);stale.id="new-delivery";assert.equal(buildModelSpotlight(stale,{deliveryDigest:f.digest,projectId:q.id}).state,"invalid");
 const missingAgreement=structuredClone(delivery);delete missingAgreement.journeyPlan;assert.equal(buildModelSpotlight(missingAgreement,{deliveryDigest:f.digest}).state,"invalid");
});

test("a pending fresh run supersedes a reassuring saved report without rewriting that report",async()=>{
 const f=await modelFixture(),a=completeModel(f.quote,f.digest,f.registration),pending=beginModelCheckRun(a,"seller",modelInput(a,f.registration.id,43),f.digest,f.registration),delivery=pending.proof.delivery!,before=structuredClone(delivery);
 const spotlight=buildModelSpotlight(delivery,{deliveryDigest:f.digest,projectId:pending.id});assert.equal(spotlight.state,"pending");assert.equal(spotlight.diagnosis,undefined);assert.equal(spotlight.acceptance,"not_accepted");assert.deepEqual(delivery,before);
 const wrong=structuredClone(delivery);wrong.modelRun!.deliveryId="other-delivery";assert.equal(buildModelSpotlight(wrong,{deliveryDigest:f.digest}).state,"invalid");
});

test("frozen A and supplemental violated B stay distinct and no most-recent snapshot is guessed",async()=>{
 const f=await modelFixture(),a=completeModel(f.quote,f.digest,f.registration),accepted=acceptDelivery(a,modelConsent(a)),snapshot=structuredClone(accepted.proof.delivery!.acceptanceEvidence!.at(-1)!);
 const bound=buildModelSpotlight(accepted.proof.delivery!,{deliveryDigest:f.digest,projectId:accepted.id,accepted:true,acceptedSnapshotId:snapshot.id});assert.equal(bound.state,"ready");assert.equal(bound.acceptance,"accepted_report");assert.equal(bound.referenceReportId,snapshot.modelReportId);
 const b=completeModel(accepted,f.digest,f.registration,43,"violated"),before=structuredClone(b.proof.delivery!);
 const supplement=buildModelSpotlight(b.proof.delivery!,{deliveryDigest:f.digest,projectId:b.id,accepted:true,acceptedSnapshotId:snapshot.id});assert.equal(supplement.state,"ready");assert.equal(supplement.diagnosis!.outcome,"violated");assert.equal(supplement.diagnosis!.reportId,b.proof.delivery!.modelReport!.id);assert.equal(supplement.acceptance,"supplemental");assert.equal(supplement.referenceReportId,snapshot.modelReportId);
 assert.equal(buildModelSpotlight(b.proof.delivery!,{deliveryDigest:f.digest,accepted:true}).acceptance,"unavailable");assert.equal(buildModelSpotlight(b.proof.delivery!,{deliveryDigest:f.digest,accepted:true,acceptedSnapshotId:"missing-snapshot"}).acceptance,"unavailable");assert.deepEqual(b.proof.delivery!,before);
 const missing=structuredClone(b.proof.delivery!);missing.modelHistory=missing.modelHistory!.filter(row=>row.id!==snapshot.modelReportId);assert.equal(buildModelSpotlight(missing,{deliveryDigest:f.digest,accepted:true,acceptedSnapshotId:snapshot.id}).acceptance,"unavailable");
});

test("matching report identifiers cannot label tampered snapshot digests or missing acknowledgement as accepted evidence",async()=>{
 const f=await modelFixture(),a=completeModel(f.quote,f.digest,f.registration),q=acceptDelivery(a,modelConsent(a)),delivery=q.proof.delivery!,snapshot=delivery.acceptanceEvidence!.at(-1)!;
 for(const mutate of[
  (copy:typeof delivery)=>{copy.acceptanceEvidence!.at(-1)!.modelDeliveryDigest="e".repeat(64);},
  (copy:typeof delivery)=>{copy.acceptanceEvidence!.at(-1)!.modelSpecDigest="e".repeat(64);},
  (copy:typeof delivery)=>{copy.acceptanceEvidence!.at(-1)!.journeyPlanDigest="e".repeat(64);},
  (copy:typeof delivery)=>{delete copy.acceptanceEvidence!.at(-1)!.modelDecision;},
  (copy:typeof delivery)=>{copy.acceptanceEvidence!.at(-1)!.modelDecision!.reportId="other-report";},
 ]){const copy=structuredClone(delivery);mutate(copy);const result=buildModelSpotlight(copy,{deliveryDigest:f.digest,projectId:q.id,accepted:true,acceptedSnapshotId:snapshot.id});assert.equal(result.acceptance,"unavailable");assert.notEqual(result.acceptance,"accepted_report");}
});

test("an acceptance predating any model report treats a later valid report as supplemental",async()=>{
 const f=await modelFixture(),accepted=acceptDelivery(f.quote,modelConsent(f.quote)),snapshot=structuredClone(accepted.proof.delivery!.acceptanceEvidence!.at(-1)!),withSupplement=completeModel(accepted,f.digest,f.registration),delivery=withSupplement.proof.delivery!;
 assert.equal(snapshot.modelReportId,undefined);const spotlight=buildModelSpotlight(delivery,{deliveryDigest:f.digest,projectId:withSupplement.id,accepted:true,acceptedSnapshotId:snapshot.id});assert.equal(spotlight.state,"ready");assert.equal(spotlight.acceptance,"supplemental");assert.equal(spotlight.referenceReportId,undefined);assert.deepEqual(delivery.acceptanceEvidence!.at(-1),snapshot);
});
