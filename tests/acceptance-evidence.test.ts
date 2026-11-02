import assert from "node:assert/strict";
import test from "node:test";
import type { ProofBrowserCheckReading, ProofQuote } from "../lib/contracts.ts";
import { assertAcceptedEvidenceReference, browserReportsFor, createAcceptanceEvidence, layoutReportsFor, recordCaptureConsent, withAcceptanceEvidence, withBrowserReport, OBSERVATION_HISTORY_LIMIT, ACCEPTANCE_HISTORY_LIMIT } from "../lib/acceptance-evidence.ts";
import { createBrowserCheckReport, getBrowserCheckPlan, recordBrowserChecks } from "../lib/browser-check-report.ts";
import { recordLayoutReport } from "../lib/layout-report.ts";
import { acceptDelivery, prepareReplacement, snapshotVersion } from "../lib/proof-workflow.ts";
import { validateAcceptance } from "../lib/proof-domain.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import { DomainError } from "../lib/domain.ts";

const now = "2026-11-02T01:00:00.000Z", later = "2026-11-02T01:10:00.000Z";
const html = '<!doctype html><html><head><title>Source</title></head><body><p>Saved delivery</p></body></html>';
function quote(): ProofQuote {
  const project = parseStaticProject({title:"Evidence fixture",summary:"One static page",amount:"1.00",requiredPages:["index.html"],manualRequirements:[]}, "en");
  const delivery = createUploadedDelivery({"index.html":html},project.project,"en",1);
  return {id:"evidence-test",reference:"PBP-EVIDENCE",workflow:"proof-v1",title:project.title,summary:project.summary,brief:project.summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,
    lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:now,
    proof:{project:project.project,criteria:project.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:now,mode:"demo",summary:"Saved source checked"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at:now,note:"Please review"},feedback:[]}}};
}
function browserInput(q: ProofQuote) {
  const readings: ProofBrowserCheckReading[] = getBrowserCheckPlan(q).map(step=>({stepId:step.stepId,status:"observed",kind:"page",stylesExpected:0,stylesLoaded:0,imagesExpected:0,imagesLoaded:0}));
  return {deliveryId:q.proof.delivery!.id,previousReportId:q.proof.delivery!.browserChecks?.id??null,readings};
}
function layoutInput(q: ProofQuote) {return {deliveryId:q.proof.delivery!.id,previousReportId:q.proof.delivery!.layoutReport?.id??null,readings:[375,900].map(viewportWidth=>({file:"index.html",viewportWidth,status:"measured",clientWidth:viewportWidth,scrollWidth:viewportWidth}))};}
function consent(q: ProofQuote) {return {confirm:true,deliveryId:q.proof.delivery!.id,manualChecks:["mobile"]};}

test("new browser and layout runs retain immutable earlier observations and report-specific audit entries",()=>{
  const original=quote(), before=structuredClone(original);
  const first=recordBrowserChecks(original,"buyer",browserInput(original),now);
  const withLayout=recordLayoutReport(first,"seller",layoutInput(first),now);
  const second=recordBrowserChecks(withLayout,"seller",browserInput(withLayout),later);
  assert.deepEqual(original,before);
  assert.equal(second.proof.delivery!.browserCheckHistory!.length,2);
  assert.equal(second.proof.delivery!.layoutHistory!.length,1);
  assert.deepEqual(second.proof.delivery!.browserCheckHistory![0],first.proof.delivery!.browserChecks);
  assert.equal(second.proof.audit.at(-1)!.reportId,second.proof.delivery!.browserChecks!.id);
  assert.equal(second.proof.audit.at(-2)!.reportId,withLayout.proof.delivery!.layoutReport!.id);
  assert.equal(second.proof.delivery!.layoutReport!.reportedByRole,"seller");
  const copy=browserReportsFor(second.proof.delivery!);copy[0].readings=[];
  assert.notEqual(second.proof.delivery!.browserCheckHistory![0].readings.length,0);
});

test("acceptance freezes original criteria, findings and report references while later checks remain supplements",()=>{
  let q=quote();q=recordBrowserChecks(q,"buyer",browserInput(q),now);q=recordLayoutReport(q,"buyer",layoutInput(q),now);
  q.proof.delivery!.assessment={id:"synthetic-assessment",deliveryId:q.proof.delivery!.id,method:"source-ai-v1",mode:"live",model:"controlled-fixture-no-network",assessedAt:now,items:[],risks:[{title:"Fixture risk",explanation:"Synthetic source advice",suggestion:"Inspect directly",citations:[]}],limitations:["No provider call"],coverage:{includedFiles:["index.html"],truncatedFiles:[],omittedFiles:[]}};
  q.proof.delivery!.riskReviews=[{id:"synthetic-human-review",deliveryId:q.proof.delivery!.id,assessmentId:"synthetic-assessment",riskIndex:0,decision:"needs_evidence",reason:"Direct inspection is required",actorRole:"buyer",reviewedAt:now}];
  const accepted=acceptDelivery(q,consent(q),now), originalSnapshot=structuredClone(accepted.proof.delivery!.acceptanceEvidence![0]);
  const laterRun=recordBrowserChecks(accepted,"seller",browserInput(accepted),later);
  assert.deepEqual(laterRun.proof.delivery!.acceptanceEvidence![0],originalSnapshot);
  assert.equal(originalSnapshot.browserReportId,q.proof.delivery!.browserChecks!.id);
  assert.equal(originalSnapshot.layoutReportId,q.proof.delivery!.layoutReport!.id);
  assert.equal(originalSnapshot.assessmentId,"synthetic-assessment");
  assert.equal(originalSnapshot.assessment!.risks[0].title,"Fixture risk");assert.equal(originalSnapshot.riskReviews[0].reason,"Direct inspection is required");
  assert.deepEqual(originalSnapshot.manualChecks,["mobile"]);
  assert.equal(laterRun.proof.collaboration!.acceptance!.evidenceSnapshotId,originalSnapshot.id);
  assert.notEqual(laterRun.proof.delivery!.browserChecks!.id,originalSnapshot.browserReportId);
  assert.doesNotThrow(()=>assertAcceptedEvidenceReference(laterRun));
  assert.ok(browserReportsFor(laterRun.proof.delivery!).some(run=>run.id===originalSnapshot.browserReportId));
  q.proof.criteria[0].source="Changed outside";q.proof.delivery!.evidence[0].excerpt="Changed outside";
  q.proof.delivery!.assessment!.risks[0].title="Changed outside";q.proof.delivery!.riskReviews![0].reason="Changed outside";
  assert.notEqual(originalSnapshot.criteria[0].source,q.proof.criteria[0].source);
  assert.notEqual(originalSnapshot.evidence[0].excerpt,q.proof.delivery!.evidence[0].excerpt);
  assert.notEqual(originalSnapshot.assessment!.risks[0].title,q.proof.delivery!.assessment!.risks[0].title);
  assert.notEqual(originalSnapshot.riskReviews[0].reason,q.proof.delivery!.riskReviews![0].reason);
  const archive=snapshotVersion(laterRun,later);assert.deepEqual(archive.delivery.acceptanceEvidence![0],originalSnapshot);
});

test("a legacy latest run is preserved as the first known run, without reconstructing an earlier acceptance",()=>{
  const q=quote(),old=createBrowserCheckReport(q,browserInput(q),now);
  q.proof.delivery!.browserChecks=old;q.proof.collaboration!.stage="accepted";q.proof.collaboration!.acceptance={deliveryId:q.proof.delivery!.id,at:now,manualChecks:["mobile"]};
  q.status="paid";q.proof.paymentState="captured";q.captureId="synthetic-receipt";
  const next=recordBrowserChecks(q,"buyer",browserInput(q),later);
  assert.deepEqual(next.proof.delivery!.browserCheckHistory![0],old);
  assert.equal(next.proof.delivery!.acceptanceEvidence,undefined);
  assert.equal(next.proof.collaboration!.acceptance!.evidenceSnapshotId,undefined);
  assert.equal(next.captureId,"synthetic-receipt");assert.equal(next.proof.paymentState,"captured");
});

test("single-user capture consent saves its evidence; collaborative capture keeps the earlier accepted snapshot",()=>{
  let q=quote();q=recordBrowserChecks(q,"buyer",browserInput(q),now);
  const accepted=acceptDelivery(q,consent(q),now),first=structuredClone(accepted.proof.delivery!.acceptanceEvidence![0]);
  const laterRun=recordBrowserChecks(accepted,"seller",browserInput(accepted),later);
  laterRun.proof.paymentState="authorized";laterRun.proof.authorizationId="synthetic-auth";laterRun.proof.authorizationExpiresAt=new Date(Date.now()+60000).toISOString();
  const checks=validateAcceptance(laterRun,consent(laterRun)),pending=recordCaptureConsent(laterRun,checks,later);
  assert.equal(pending.proof.acceptedEvidenceSnapshotId,first.id);assert.deepEqual(pending.proof.delivery!.acceptanceEvidence,[first]);
  assert.equal(pending.proof.audit.at(-1)!.evidenceSnapshotId,first.id);
  assert.throws(()=>recordCaptureConsent(pending,checks,later),DomainError);
  const solo=structuredClone(q);delete solo.proof.collaboration;
  const soloPending=recordCaptureConsent(solo,["mobile"],later);
  assert.equal(soloPending.proof.delivery!.acceptanceEvidence!.length,1);
  assert.equal(soloPending.proof.acceptedEvidenceSnapshotId,soloPending.proof.delivery!.acceptanceEvidence![0].id);
  const legacy=structuredClone(accepted);delete legacy.proof.collaboration!.acceptance!.evidenceSnapshotId;delete legacy.proof.delivery!.acceptanceEvidence;
  const legacyPending=recordCaptureConsent(legacy,["mobile"],later);
  assert.equal(legacyPending.proof.acceptedEvidenceSnapshotId,undefined);assert.equal(legacyPending.proof.delivery!.acceptanceEvidence,undefined);
});

test("report and snapshot limits reject additions without silently pruning or mutating saved evidence",()=>{
  const q=quote();let delivery=q.proof.delivery!;
  const base=createBrowserCheckReport(q,browserInput(q),now);
  for(let n=0;n<OBSERVATION_HISTORY_LIMIT;n++) delivery=withBrowserReport(delivery,{...base,id:`report-${n}`});
  const before=structuredClone(delivery);
  assert.throws(()=>withBrowserReport(delivery,{...base,id:"one-too-many"}),/history limit/u);
  assert.throws(()=>withBrowserReport(delivery,{...base,id:"report-0"}),/cannot be replaced/u);
  assert.deepEqual(delivery,before);assert.equal(browserReportsFor(delivery).length,OBSERVATION_HISTORY_LIMIT);
  const snapshot=createAcceptanceEvidence(q,["mobile"],now);let accepted=q.proof.delivery!;
  for(let n=0;n<ACCEPTANCE_HISTORY_LIMIT;n++) accepted=withAcceptanceEvidence(accepted,{...snapshot,id:`snapshot-${n}`});
  assert.throws(()=>withAcceptanceEvidence(accepted,{...snapshot,id:"one-too-many"}),/acceptance evidence limit/u);
  const huge={...snapshot,id:"oversized",review:{deliveryId:q.proof.delivery!.id,reviewedAt:now,mode:"demo" as const,summary:"x".repeat(256*1024)}};
  assert.throws(()=>withAcceptanceEvidence(q.proof.delivery!,huge),/history is full/u);
  assert.equal(q.proof.delivery!.acceptanceEvidence,undefined);
});

test("cross-version/conflicting history is rejected and replacements inherit no observation or acceptance history",()=>{
  const q=quote(),base=createBrowserCheckReport(q,browserInput(q),now),delivery=q.proof.delivery!;
  assert.throws(()=>withBrowserReport(delivery,{...base,deliveryId:"another"}),DomainError);
  const corrupt={...delivery,browserChecks:base,browserCheckHistory:[{...base,summary:{...base.summary,issues:1}}]};
  assert.throws(()=>browserReportsFor(corrupt),/conflicting/u);
  assert.deepEqual(layoutReportsFor(delivery),[]);
  const snapshot=createAcceptanceEvidence(q,["mobile"],now);assert.throws(()=>withAcceptanceEvidence(delivery,{...snapshot,deliveryId:"another"}),DomainError);
  q.proof.collaboration!.stage="in_progress";
  const replacement=createUploadedDelivery({"index.html":html.replace("Saved delivery","Replacement")},q.proof.project!,"en",2);
  replacement.browserChecks=base;replacement.browserCheckHistory=[base];replacement.acceptanceEvidence=[snapshot];
  const next=prepareReplacement(q,replacement);
  assert.equal(next.proof.delivery!.browserChecks,undefined);assert.equal(next.proof.delivery!.browserCheckHistory,undefined);assert.equal(next.proof.delivery!.acceptanceEvidence,undefined);
});

test("new snapshot content cannot be forged and saved bindings must resolve without rebinding to a newer run",()=>{
  let q=quote();q=recordBrowserChecks(q,"buyer",browserInput(q),now);
  const snapshot=createAcceptanceEvidence(q,["mobile"],now);
  for(const patch of [{browserReportId:"not-current"},{assessmentId:"forged"},{evidence:[]},{manualChecks:[]},{criteria:[]}]) assert.throws(()=>withAcceptanceEvidence(q.proof.delivery!,{...snapshot,...patch}),DomainError);
  const accepted=acceptDelivery(q,consent(q),now),laterRun=recordBrowserChecks(accepted,"seller",browserInput(accepted),later);
  assert.doesNotThrow(()=>assertAcceptedEvidenceReference(laterRun));
  const missing=structuredClone(laterRun);missing.proof.delivery!.acceptanceEvidence=[];assert.throws(()=>assertAcceptedEvidenceReference(missing),DomainError);
  const missingReport=structuredClone(laterRun);missingReport.proof.delivery!.browserCheckHistory=missingReport.proof.delivery!.browserCheckHistory!.slice(1);assert.throws(()=>assertAcceptedEvidenceReference(missingReport),DomainError);
  const differing=structuredClone(laterRun);differing.proof.acceptedEvidenceSnapshotId="different";assert.throws(()=>assertAcceptedEvidenceReference(differing),DomainError);
  const solo=structuredClone(accepted);delete solo.proof.collaboration;solo.proof.acceptedEvidenceSnapshotId=snapshot.id;solo.proof.delivery!.acceptanceEvidence=[snapshot];
  assert.throws(()=>recordCaptureConsent(solo,["mobile"],later),/no pending operation/u);
});
