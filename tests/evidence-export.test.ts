import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,writeFile,symlink,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import type {ProofQuote} from "../lib/contracts.ts";
import {createEvidenceExport,verifyEvidenceExport,EVIDENCE_EXPORT_BYTE_LIMIT,EVIDENCE_EXPORT_SCHEMA,EVIDENCE_EXPORT_RULES} from "../lib/evidence-export.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {createProofDelivery,proofCriteria} from "../lib/proof-evidence.ts";
import {acceptDelivery} from "../lib/proof-workflow.ts";
import {recordCaptureConsent} from "../lib/acceptance-evidence.ts";
import {recordBrowserChecks,getBrowserCheckPlan} from "../lib/browser-check-report.ts";
import {recordLayoutReport} from "../lib/layout-report.ts";
import {createBusinessCheckReport,getBusinessCheckPlan} from "../lib/business-checks.ts";
import {runtimeDeliveryDigest,savedRuntimePlan} from "../lib/runtime-project.ts";
import {runtimeProtocolStepIds,runtimeReportSummary,type RuntimeCheckReport} from "../lib/runtime-checks.ts";

const at="2026-11-02T00:00:00.000Z";
const html=(body:string)=>`<!doctype html><html><head><title>Café &mdash; website</title></head><body>${body}</body></html>`;
function fixture():ProofQuote{
  const summary="Deliver two pages with a local booking link.";
  const parsed=parseStaticProject({title:"Evidence fixture",summary,amount:"1.00",requiredPages:["index.html","contact.html"],link:{from:"index.html",text:"Book",to:"contact.html#booking"},manualRequirements:[]},"en");
  const delivery=createUploadedDelivery({"index.html":html('<a href="contact.html#booking">Book</a>'),"contact.html":html('<section id="booking">Booking</section>')},parsed.project,"en",1);
  return {id:"export-project",reference:"PBP-EXPORT",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"PRIVATE-CUSTOMER-DO-NOT-EXPORT",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Private billing description",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,paypalOrderId:"PRIVATE-ORDER",paypalApprovalUrl:"https://example.invalid/private-approval",captureId:"PRIVATE-CAPTURE",
    proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",authorizationId:"PRIVATE-AUTH",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Source checked"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"PRIVATE-SELLER-NOTE"},sellerName:"PRIVATE-SELLER",feedback:[]}}};
}
function accepted(q=fixture()):ProofQuote{return acceptDelivery(q,{confirm:true,deliveryId:q.proof.delivery!.id,manualChecks:q.proof.delivery!.evidence.filter(row=>row.finding==="needs_human").map(row=>row.criterionId)},at);}
function annotatedFixture():ProofQuote{
  const q=fixture(),delivery=q.proof.delivery!;
  delivery.assessment={id:"old-assessment",deliveryId:delivery.id,method:"source-ai-v1",mode:"live",model:"synthetic",assessedAt:at,items:[],risks:[{title:"Inspect copy",explanation:"Source advice",suggestion:"Inspect directly",citations:[]}],limitations:["No provider execution proven"],coverage:{includedFiles:["index.html"],truncatedFiles:[],omittedFiles:[]}};
  delivery.riskReviews=[{id:"risk-review-1",deliveryId:delivery.id,assessmentId:"old-assessment",riskIndex:0,decision:"rejected",reason:"Human checked the original source",actorRole:"buyer",reviewedAt:at}];
  return accepted(q);
}
const failedCheck=(report:Awaited<ReturnType<typeof verifyEvidenceExport>>,id:string)=>report.checks.find(row=>row.id===id)?.status==="inconsistent";

test("allowlisted current-delivery export omits identity/payment fields and has explicit verification limits",async()=>{
  const quote=accepted(),before=structuredClone(quote),bundle=await createEvidenceExport(quote),report=await verifyEvidenceExport(JSON.parse(JSON.stringify(bundle)));
  assert.equal(bundle.schema,EVIDENCE_EXPORT_SCHEMA);assert.equal(bundle.verificationRules,EVIDENCE_EXPORT_RULES);assert.equal(report.consistency,"consistent");
  assert.deepEqual(quote,before);assert.equal(bundle.scope,"current-delivery-only");assert.equal(bundle.acceptanceReferences.length,1);
  assert.ok(!JSON.stringify(bundle).includes("PRIVATE-"));assert.ok(!Object.hasOwn(bundle,"quote"));
  assert.deepEqual(report.limits,{scope:"current-delivery-only",authenticity:"not-proven",backendExecution:"not-proven",modelJudgment:"not-proven",payment:"not-proven",previousVersions:"not-included",networkRequests:0});
  bundle.delivery.files!["index.html"]="changed after export";assert.notEqual(quote.proof.delivery!.files!["index.html"],bundle.delivery.files!["index.html"]);
});

test("href tampering is caught by digest and source replay, even if the attacker updates the self-declared digest",async()=>{
  const bundle=await createEvidenceExport(accepted());bundle.delivery.files!["index.html"]=bundle.delivery.files!["index.html"].replace("#booking","#missing");
  const first=await verifyEvidenceExport(bundle);assert.equal(first.consistency,"inconsistent");assert.ok(failedCheck(first,"file-digest"));assert.ok(failedCheck(first,"source-rule-replay"));
  bundle.fileDigest=await runtimeDeliveryDigest(bundle.delivery.files);
  const rehashed=await verifyEvidenceExport(bundle);assert.equal(rehashed.consistency,"inconsistent");assert.equal(failedCheck(rehashed,"file-digest"),false);assert.ok(failedCheck(rehashed,"source-rule-replay"));
});

test("saved failed deliveries can be consistent records and are never relabelled functional success",async()=>{
  const q=fixture();q.proof.delivery=createUploadedDelivery({"index.html":html("<p>Home only</p>")},q.proof.project!,"en",1);q.proof.collaboration!.stage="in_progress";
  const bundle=await createEvidenceExport(q),report=await verifyEvidenceExport(bundle);
  assert.equal(report.consistency,"consistent");assert.ok(bundle.delivery.evidence.some(row=>row.finding==="fail"));assert.equal(bundle.acceptanceReferences.length,0);
});

test("real built-in flawed/fixed deliveries retain their controlled manifest without widening custom upload types",async()=>{
  for(const language of ["en","zh"] as const)for(const variant of ["flawed","fixed"] as const){
    const q=fixture();q.language=language;delete q.proof.project;q.proof.criteria=proofCriteria(language);q.proof.delivery=createProofDelivery(variant,language);q.proof.review!.deliveryId=q.proof.delivery.id;
    delete q.proof.collaboration;
    const bundle=await createEvidenceExport(variant==="fixed"?recordCaptureConsent(q,["mobile"],at):q);
    assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.equal(bundle.delivery.files!["delivery-manifest.json"],q.proof.delivery.files!["delivery-manifest.json"]);assert.equal(bundle.fileDigest,await runtimeDeliveryDigest(q.proof.delivery.files));
    for(const patch of [
      {"extra.json":"{}"},
      {"delivery-manifest.json":JSON.stringify({...JSON.parse(bundle.delivery.files!["delivery-manifest.json"]),privateMetadata:"must not be exported"})},
      {"delivery-manifest.json":" ".repeat(2049)+bundle.delivery.files!["delivery-manifest.json"]},
      {"delivery-manifest.json":JSON.stringify({sample:true,label:"Controlled sample delivery; not a real website test",htmlPages:["invented.html"]})},
    ]){const changed=structuredClone(bundle);Object.assign(changed.delivery.files!,patch);assert.ok(failedCheck(await verifyEvidenceExport(changed),"structure"));}
  }
  const custom=fixture();custom.proof.delivery!.files!["delivery-manifest.json"]='{"sample":true}';await assert.rejects(createEvidenceExport(custom));
});

test("original contract sources retain exact spans while document name is omitted",async()=>{
  const q=accepted(),source="The website must contain a booking link.";
  q.proof.requirements={draftId:"draft-1",sourceText:source,sourceName:"PRIVATE-FILENAME",mode:"rules",extractedAt:at,confirmedAt:at,sourceRefs:[{criterionId:"link",source:{start:0,end:source.length,excerpt:source}}],unresolved:[],warnings:[]};
  const bundle=await createEvidenceExport(q);assert.equal(bundle.project.requirements!.sourceText,source);assert.equal(JSON.stringify(bundle).includes("PRIVATE-FILENAME"),false);
  bundle.project.requirements!.sourceRefs[0].source.start=1;
  const report=await verifyEvidenceExport(bundle);assert.equal(report.consistency,"inconsistent");assert.ok(failedCheck(report,"requirements")||failedCheck(report,"structure"));
});

test("AI citations verify exact UTF-16 spans and cannot validate model judgment",async()=>{
  const q=fixture(),delivery=q.proof.delivery!,source=delivery.files!["index.html"],excerpt='<a href="contact.html#booking">Book</a>',start=source.indexOf(excerpt);
  delivery.assessment={id:"assessment-1",deliveryId:delivery.id,method:"source-ai-v1",mode:"live",model:"synthetic-no-provider-call",assessedAt:at,items:[{criterionId:"link",status:"supported",explanation:"The cited anchor exists in source.",citations:[{file:"index.html",start,end:start+excerpt.length,excerpt}],ruleEvidenceIds:["evidence-link"]}],risks:[],limitations:["Synthetic report; no model call"],coverage:{includedFiles:["index.html","contact.html"],truncatedFiles:[],omittedFiles:[]}};
  const bundle=await createEvidenceExport(accepted(q));bundle.delivery.assessment!.items[0].citations[0].end--;
  assert.ok(failedCheck(await verifyEvidenceExport(bundle),"ai-source-citations"));
});

test("risk annotations bind their recorded report and risk while historical rejected annotations remain unchanged",async()=>{
  const saved=annotatedFixture();saved.proof.delivery!.assessment={...structuredClone(saved.proof.delivery!.assessment!),id:"new-assessment"};
  const original=await createEvidenceExport(saved);assert.equal((await verifyEvidenceExport(original)).consistency,"consistent");assert.equal(original.delivery.acceptanceEvidence![0].riskReviews[0].decision,"rejected");
  for(const patch of [{deliveryId:"other-delivery"},{assessmentId:"missing-report"},{riskIndex:1}]){const bundle=structuredClone(original);Object.assign(bundle.delivery.riskReviews![0],patch);assert.ok(failedCheck(await verifyEvidenceExport(bundle),"ai-source-citations"));}
  const wrongSnapshot=structuredClone(original);wrongSnapshot.delivery.acceptanceEvidence![0].review!.deliveryId="other-delivery";assert.ok(failedCheck(await verifyEvidenceExport(wrongSnapshot),"acceptance-references"));
});

test("immutable assessment and risk-review IDs have identical content across current and all acceptance snapshots",async()=>{
  const original=await createEvidenceExport(annotatedFixture());
  const changedAssessment=structuredClone(original);changedAssessment.delivery.acceptanceEvidence![0].assessment!.risks[0].title="Changed old advice";
  assert.ok(failedCheck(await verifyEvidenceExport(changedAssessment),"ai-source-citations"));
  const changedReview=structuredClone(original);Object.assign(changedReview.delivery.acceptanceEvidence![0].riskReviews[0],{decision:"confirmed",reason:"A different historical decision"});
  assert.ok(failedCheck(await verifyEvidenceExport(changedReview),"ai-source-citations"));
  const changedLaterSnapshot=structuredClone(original),later=structuredClone(changedLaterSnapshot.delivery.acceptanceEvidence![0]);later.id="later-snapshot";later.assessment!.risks[0].title="Changed in another snapshot";changedLaterSnapshot.delivery.acceptanceEvidence!.push(later);
  assert.ok(failedCheck(await verifyEvidenceExport(changedLaterSnapshot),"ai-source-citations"));
  const appended=structuredClone(original);appended.delivery.assessment!.id="new-assessment";appended.delivery.assessment!.risks[0].title="New advice";Object.assign(appended.delivery.riskReviews![0],{id:"new-review",assessmentId:"new-assessment",decision:"confirmed",reason:"A new explicitly recorded decision"});
  assert.equal((await verifyEvidenceExport(appended)).consistency,"consistent");
});

test("metadata object key order is irrelevant while array order and file contents remain significant",async()=>{
  const original=await createEvidenceExport(await registeredFixture());
  const reverse=(value:unknown):unknown=>Array.isArray(value)?value.map(reverse):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([key,entry])=>[key,reverse(entry)])):value;
  const reordered=reverse(original) as typeof original,before=structuredClone(reordered);
  assert.equal((await verifyEvidenceExport(reordered)).consistency,"consistent");assert.deepEqual(reordered,before);assert.equal(await runtimeDeliveryDigest(reordered.delivery.files),original.fileDigest);
  const oneCopy=structuredClone(original);oneCopy.delivery.runtimeReport!.target.registration=reverse(oneCopy.delivery.runtimeReport!.target.registration) as NonNullable<typeof oneCopy.delivery.runtimeReport>["target"]["registration"];
  assert.equal((await verifyEvidenceExport(oneCopy)).consistency,"consistent");
  const annotations=annotatedFixture();annotations.proof.delivery!.assessment!.risks.push({title:"Second risk",explanation:"Other source advice",suggestion:"Inspect separately",citations:[]});annotations.proof.delivery!.acceptanceEvidence![0].assessment=structuredClone(annotations.proof.delivery!.assessment);
  const reorderedArray=await createEvidenceExport(annotations);reorderedArray.delivery.acceptanceEvidence![0].assessment!.risks.reverse();
  assert.ok(failedCheck(await verifyEvidenceExport(reorderedArray),"ai-source-citations"));
});

test("browser/layout derived outcomes are replayed from reported values without a browser",async()=>{
  let q=fixture();q=recordBrowserChecks(q,"buyer",{deliveryId:q.proof.delivery!.id,previousReportId:null,readings:getBrowserCheckPlan(q).map(step=>({stepId:step.stepId,status:"unavailable",reason:"timeout"}))},at);
  q=recordLayoutReport(q,"seller",{deliveryId:q.proof.delivery!.id,previousReportId:null,readings:["index.html","contact.html"].flatMap(file=>[375,900].map(viewportWidth=>({file,viewportWidth,status:"measured",clientWidth:viewportWidth,scrollWidth:viewportWidth})))},at);
  const bundle=await createEvidenceExport(accepted(q));assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
  bundle.delivery.layoutReport!.summary.overflow=1;
  assert.ok(failedCheck(await verifyEvidenceExport(bundle),"reported-observation-consistency"));
});

test("missing historical report and snapshot references fail rather than borrowing a newer report",async()=>{
  let q=fixture();q=recordBrowserChecks(q,"buyer",{deliveryId:q.proof.delivery!.id,previousReportId:null,readings:getBrowserCheckPlan(q).map(step=>({stepId:step.stepId,status:"unavailable",reason:"timeout"}))},at);
  const original=await createEvidenceExport(accepted(q));
  const missingReport=structuredClone(original);delete missingReport.delivery.browserChecks;missingReport.delivery.browserCheckHistory=[];
  assert.ok(failedCheck(await verifyEvidenceExport(missingReport),"acceptance-references"));
  const missingSnapshot=structuredClone(original);missingSnapshot.acceptanceReferences[0].evidenceSnapshotId="not-retained";
  assert.ok(failedCheck(await verifyEvidenceExport(missingSnapshot),"acceptance-references"));
});

async function registeredFixture(){
  const summary="Save bookings and retain each record for independent readback.";
  const parsed=parseStaticProject({title:"Staging export",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:"coverage-1",disposition:"include"}]},runtimeCheck:{protocol:"booking-http-v1",criterionId:"coverage-1",confirmed:true}},"en");
  const q=fixture();q.title=parsed.title;q.summary=summary;q.proof.project=parsed.project;q.proof.criteria=parsed.criteria;q.proof.delivery=createUploadedDelivery({"index.html":html("<p>Booking</p>")},parsed.project,"en",1);
  const delivery=q.proof.delivery,digest=await runtimeDeliveryDigest(delivery.files);
  q.proof.collaboration!.submission={deliveryId:delivery.id,at,note:"Review the current synthetic delivery"};
  delivery.backendTargetId="seller-staging";delivery.runtimeDeliveryDigest=digest;
  delivery.runtimeRegistration={id:"seller-staging",label:"Seller staging",registrationRevision:"review-1",projectId:q.id,protocol:"booking-http-v1",baseUrl:"https://seller-staging.example.org/pbp/",deploymentRevision:"build-1",frontendBundleDigest:digest,expiresAt:"2000-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
  const plan=savedRuntimePlan(q)!,runId=crypto.randomUUID(),readbacks=new Set(["readback","unchanged"]);
  const steps:RuntimeCheckReport["steps"]=runtimeProtocolStepIds(plan).map((id,index)=>({id,label:id,outcome:"unavailable",reason:"synthetic_no_network",method:index===0||readbacks.has(id)?"GET":"POST",path:index===0?"meta":readbacks.has(id)?"bookings/:id":"bookings",expected:"Retain a bounded observation"}));
  const report:RuntimeCheckReport={id:runId,runId,deliveryId:delivery.id,deliveryDigest:digest,method:"server-booking-http-v1",startedAt:at,finishedAt:at,plan,target:{id:"seller-staging",label:"Seller staging",origin:"https://seller-staging.example.org",revision:"build-1",registration:structuredClone(delivery.runtimeRegistration)},steps,summary:runtimeReportSummary(steps)};
  delivery.runtimeReport=report;delivery.runtimeHistory=[structuredClone(report)];q.proof.review={deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Source checked"};
  return acceptDelivery(q,{confirm:true,deliveryId:delivery.id,manualChecks:["mobile","coverage-1"],runtimeDecision:{reportId:runId,exceptionReason:"Synthetic history retained without any network request",acknowledgedSteps:steps.map(row=>row.id)}},at);
}

test("expired registered history is readable and exact runtime target/digest/step bindings are checked",async()=>{
  const original=await createEvidenceExport(await registeredFixture());assert.equal((await verifyEvidenceExport(original)).consistency,"consistent");
  for(const mutate of [
    (value:typeof original)=>{value.delivery.runtimeReport!.target.registration!.registrationRevision="other-review";},
    (value:typeof original)=>{value.delivery.runtimeReport!.deliveryDigest="b".repeat(64);},
    (value:typeof original)=>{value.delivery.runtimeReport!.steps[0].path="https://outside.example.org/";},
  ]){const changed=structuredClone(original);mutate(changed);assert.ok(failedCheck(await verifyEvidenceExport(changed),"runtime-bindings"));}
});

test("supplemental HTTP runs never replace the original acceptance reference",async()=>{
  const bundle=await createEvidenceExport(await registeredFixture()),previous=bundle.delivery.runtimeReport!,next=structuredClone(previous);next.id=next.runId=crypto.randomUUID();
  bundle.delivery.runtimeHistory=[previous,next];bundle.delivery.runtimeReport=next;
  assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
  bundle.delivery.runtimeHistory=[next];assert.ok(failedCheck(await verifyEvidenceExport(bundle),"acceptance-references"));
});

test("runtime-enabled snapshots cannot drop mandatory reports while retaining an apparently accepted reference",async()=>{
  const original=await createEvidenceExport(await registeredFixture());
  for(const value of [undefined,null,""]){const bundle=structuredClone(original);if(value===undefined)delete bundle.delivery.acceptanceEvidence![0].runtimeReportId;else Object.assign(bundle.delivery.acceptanceEvidence![0],{runtimeReportId:value});assert.ok(failedCheck(await verifyEvidenceExport(bundle),"acceptance-references"));}
});

test("optional runtime acceptance annotations are bounded typed values even when every step was observed",async()=>{
  const original=await createEvidenceExport(await registeredFixture()),report=original.delivery.runtimeReport!;
  for(const step of report.steps){step.outcome="observed";delete step.reason;step.status=step.id==="revision"||["readback","unchanged","replay"].includes(step.id)?200:step.id==="create"?201:step.id==="conflict"?409:422;step.actual="Synthetic supported observation; no HTTP request";if(["readback","unchanged"].includes(step.id))step.path="bookings/synthetic-receipt";}
  report.summary=runtimeReportSummary(report.steps);original.delivery.runtimeHistory=[structuredClone(report)];
  const snapshot=original.delivery.acceptanceEvidence![0],ids=report.steps.map(step=>step.id);
  snapshot.runtimeExceptionReason="Optional explanation even without an exception";snapshot.runtimeAcknowledgedSteps=[];
  assert.equal((await verifyEvidenceExport(original)).consistency,"consistent");
  for(const value of [{privateCredential:"SYNTHETIC-PRIVATE-CANARY"},null,42,""," ","x".repeat(501)]){
    const bundle=structuredClone(original);Object.assign(bundle.delivery.acceptanceEvidence![0],{runtimeExceptionReason:value});assert.ok(failedCheck(await verifyEvidenceExport(bundle),"acceptance-references"));
  }
  for(const value of [null,{},[ids[0],{privateCredential:"SYNTHETIC-PRIVATE-CANARY"}],[ids[0],ids[0]],["not-a-protocol-step"],Array(19).fill(ids[0])]){
    const bundle=structuredClone(original);Object.assign(bundle.delivery.acceptanceEvidence![0],{runtimeAcknowledgedSteps:value});assert.ok(failedCheck(await verifyEvidenceExport(bundle),"acceptance-references"));
  }
  const bounded=structuredClone(original);bounded.delivery.acceptanceEvidence![0].runtimeExceptionReason="x".repeat(500);bounded.delivery.acceptanceEvidence![0].runtimeAcknowledgedSteps=[...ids].reverse();
  assert.equal((await verifyEvidenceExport(bounded)).consistency,"consistent");
});

test("acceptance annotations cannot attach business or runtime metadata without its report",async()=>{
  const original=await createEvidenceExport(accepted()),registered=await registeredFixture();
  for(const patch of [
    {businessExceptionReason:{privateCredential:"SYNTHETIC-PRIVATE-CANARY"}},
    {businessExceptionReason:"An explanation without a business report"},
    {runtimeExceptionReason:"An explanation without a runtime report"},
    {runtimeAcknowledgedSteps:[]},
    {runtimeDeliveryDigest:original.fileDigest},
    {runtimeTargetId:"seller-staging"},
    {runtimeRegistration:registered.proof.delivery!.runtimeRegistration},
  ]){const bundle=structuredClone(original);Object.assign(bundle.delivery.acceptanceEvidence![0],patch);assert.ok(failedCheck(await verifyEvidenceExport(bundle),"acceptance-references"));}
  assert.equal((await verifyEvidenceExport(original)).consistency,"consistent");
});

test("business-enabled acceptance retains its required report and validates every present exception reason",async()=>{
  const summary="The menu must show Tea AUD 3.",source={start:0,end:summary.length,excerpt:summary};
  const parsed=parseStaticProject({title:"Business export",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:"coverage-1",disposition:"include"}]},businessChecks:{confirmed:true,items:[{id:"business-1",criterionId:"coverage-1",file:"index.html",source,expected:{kind:"item_price",label:"Tea",amountMinor:300,currency:"AUD"}}]}},"en");
  const q=fixture();q.title=parsed.title;q.summary=summary;q.proof.project=parsed.project;q.proof.criteria=parsed.criteria;q.proof.delivery=createUploadedDelivery({"index.html":html("<p>Tea AUD 3</p>")},parsed.project,"en",1);
  const delivery=q.proof.delivery;q.proof.review={deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Source checked"};q.proof.collaboration!.submission={deliveryId:delivery.id,at,note:"Review"};
  delivery.businessChecks=createBusinessCheckReport(q,{deliveryId:delivery.id,previousReportId:null,readings:getBusinessCheckPlan(q).map(step=>({stepId:step.stepId,status:"observed",blocks:["Tea AUD 3"]}))},at);
  const bundle=await createEvidenceExport(acceptDelivery(q,{confirm:true,deliveryId:delivery.id,manualChecks:["mobile","coverage-1"],businessDecision:{reportId:delivery.businessChecks.id}},at));
  for(const value of [{privateCredential:"SYNTHETIC-PRIVATE-CANARY"},null,42,""," ","x".repeat(501)]){const changed=structuredClone(bundle);Object.assign(changed.delivery.acceptanceEvidence![0],{businessExceptionReason:value});assert.ok(failedCheck(await verifyEvidenceExport(changed),"acceptance-references"));}
  const bounded=structuredClone(bundle);bounded.delivery.acceptanceEvidence![0].businessExceptionReason="x".repeat(500);assert.equal((await verifyEvidenceExport(bounded)).consistency,"consistent");
  delete bundle.delivery.acceptanceEvidence![0].businessReportId;
  assert.ok(failedCheck(await verifyEvidenceExport(bundle),"acceptance-references"));
});

test("pending runtime leases bind exact delivery, digest, target and ordered timestamps without proving completion",async()=>{
  const original=await createEvidenceExport(await registeredFixture());
  original.delivery.runtimeRun={id:crypto.randomUUID(),deliveryId:original.delivery.id,deliveryDigest:original.fileDigest,targetId:original.delivery.backendTargetId!,startedAt:at,expiresAt:"2026-11-02T00:01:00.000Z"};
  assert.equal((await verifyEvidenceExport(original)).consistency,"consistent");
  for(const patch of [{deliveryId:"another-delivery"},{deliveryDigest:"b".repeat(64)},{targetId:"other-target"},{startedAt:"invalid"},{expiresAt:at},{id:original.delivery.runtimeReport!.runId}]){
    const bundle=structuredClone(original);Object.assign(bundle.delivery.runtimeRun!,patch);assert.ok(failedCheck(await verifyEvidenceExport(bundle),"runtime-bindings"));
  }
});

test("plain-data limits reject getters, cycles, nonfinite values and unknown formats without executing them",async()=>{
  let calls=0;const getter={schema:EVIDENCE_EXPORT_SCHEMA};Object.defineProperty(getter,"delivery",{enumerable:true,get(){calls++;throw new Error("Do not read");}});
  assert.equal((await verifyEvidenceExport(getter)).consistency,"inconsistent");assert.equal(calls,0);
  const cyclic:Record<string,unknown>={};cyclic.self=cyclic;assert.equal((await verifyEvidenceExport(cyclic)).consistency,"inconsistent");
  assert.equal((await verifyEvidenceExport({value:Infinity})).consistency,"inconsistent");
  assert.equal((await verifyEvidenceExport({value:new Array(1_000_000)})).consistency,"inconsistent");
  assert.equal((await verifyEvidenceExport(fixture())).consistency,"unsupported");
  const bundle=await createEvidenceExport(accepted());assert.equal((await verifyEvidenceExport({...bundle,verificationRules:"unknown-future-rules"})).consistency,"unsupported");
});

test("verification neither performs network calls nor executes delivered script text",async()=>{
  const q=fixture();q.proof.delivery=createUploadedDelivery({...q.proof.delivery!.files!,"index.html":q.proof.delivery!.files!["index.html"]+'<script>globalThis.PBP_EXECUTED=true</script>'},q.proof.project!,"en",1);q.proof.review!.deliveryId=q.proof.delivery.id;
  const saved=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;throw new Error("Offline verifier must not fetch");};
  try{const bundle=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.equal(fetches,0);assert.equal((globalThis as Record<string,unknown>).PBP_EXECUTED,undefined);}finally{globalThis.fetch=saved;}
});

test("CLI accepts only a bounded regular JSON file, prints JSON and preserves unsupported exit status",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"pbp-evidence-check-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,"evidence.json"),link=join(dir,"symlink.json"),large=join(dir,"oversized.json");await writeFile(file,JSON.stringify(await createEvidenceExport(accepted())));await symlink(file,link);await writeFile(large," ".repeat(EVIDENCE_EXPORT_BYTE_LIMIT+1));
  const run=(path:string)=>spawnSync(process.execPath,["--experimental-strip-types","scripts/verify-evidence-export.mjs",path],{cwd:process.cwd(),encoding:"utf8",env:{PATH:process.env.PATH??"",NODE_ENV:"test"}});
  const valid=run(file);assert.equal(valid.status,0,valid.stderr);assert.equal(JSON.parse(valid.stdout).consistency,"consistent");
  for(const path of [link,large,dir]){const result=run(path);assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).consistency,"unsupported");}
  await writeFile(file,JSON.stringify(fixture()));const legacy=run(file);assert.equal(legacy.status,2);assert.equal(JSON.parse(legacy.stdout).consistency,"unsupported");
});
