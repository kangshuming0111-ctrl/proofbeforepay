import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote,ProofRiskReview,ProofRole} from "../lib/contracts.ts";
import {recordRiskReview} from "../lib/risk-reviews.ts";
import {assessmentReviewSummary} from "../lib/assessment-display.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";
import {acceptanceBasis,assertAcceptanceBasis,assertAcceptedSnapshotConsent} from "../lib/acceptance-basis.ts";
import {prepareReplacement,requestChanges} from "../lib/proof-workflow.ts";
import {snapshotRiskFeedbackSource} from "../lib/risk-repairs.ts";
import {sourceVisibilityPlan} from "../lib/source-visibility.ts";

const at="2026-11-06T00:00:00.000Z",source="<!doctype html><html><head><title>Shop</title></head><body><p>Home</p></body></html>";
function fixture(published=false):ProofQuote{
 const summary="Deliver source for buyer review.",p=parseStaticProject({title:"Namespaced human review",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en"),d=createUploadedDelivery({"index.html":source},p.project,"en",1),risk={title:"Inspect source",explanation:"An unverified source lead.",suggestion:"Inspect the original source.",citations:[{file:"index.html",start:0,end:source.length,excerpt:source}]};
 d.assessment={id:"namespaced-assessment",deliveryId:d.id,method:"source-ai-v1",mode:"live",model:"controlled-no-model",assessedAt:at,items:p.criteria.map(c=>({criterionId:c.id,status:"insufficient_evidence",explanation:"Controlled unknown advice.",citations:[],ruleEvidenceIds:d.evidence.filter(e=>e.criterionId===c.id).map(e=>e.id)})),risks:published?[risk]:[],limitations:["Synthetic report; no execution or model truth."],coverage:{includedFiles:["index.html"],truncatedFiles:[],omittedFiles:[]},withheldRisks:published?{version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]}:{version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:p.criteria[0].id,originalStatus:"supported",publishedStatus:"insufficient_evidence"}],entries:[{originalRiskIndex:0,risk}]}};
 return{id:"namespaced-review-project",reference:"PBP-REVIEW-ORIGIN",workflow:"proof-v1",title:p.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Website",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:p.project,criteria:p.criteria,paymentState:"unfunded",audit:[],delivery:d,review:{deliveryId:d.id,reviewedAt:at,mode:"demo",summary:"Source checked"},collaboration:{stage:"submitted",submission:{deliveryId:d.id,at,note:"Synthetic delivery"},feedback:[]}}};
}
const input=(q:ProofQuote,withheld=true)=>({deliveryId:q.proof.delivery!.id,assessmentId:q.proof.delivery!.assessment!.id,riskIndex:0,...(withheld?{riskOrigin:"withheld" as const}:{}),decision:"needs_evidence" as const,reason:"Human requests the exact missing observation."});
const aiRejected=(r:Awaited<ReturnType<typeof verifyEvidenceExport>>)=>r.checks.some(c=>c.id==="ai-source-citations"&&c.status==="inconsistent");

test("explicit withheld review appends without releasing the gate or changing any saved assessment field",()=>{
 const q=fixture(),before=structuredClone(q),next=recordRiskReview(q,"buyer",input(q),at);assert.deepEqual(q,before);assert.equal(next.proof.delivery!.riskReviews![0].riskOrigin,"withheld");assert.deepEqual(next.proof.delivery!.assessment,q.proof.delivery!.assessment);assert.deepEqual(next.proof.delivery!.assessment!.risks,[]);assert.equal(next.proof.acceptedDeliveryId,undefined);assert.equal(next.proof.paymentState,"unfunded");
});

test("published summaries never count a withheld-origin annotation at the same numeric index",()=>{
 const q=fixture(true),d=q.proof.delivery!,review:ProofRiskReview={id:"separate-origin-review",deliveryId:d.id,assessmentId:d.assessment!.id,riskIndex:0,riskOrigin:"withheld",actorRole:"buyer",decision:"confirmed",reason:"Controlled index-collision counterexample, not a valid mixed publication pool.",reviewedAt:at};const summary=assessmentReviewSummary(d.assessment!,[review]);assert.equal(summary.unreviewed,1);assert.equal(summary.participants.buyer.confirmed,0);assert.equal(summary.participants.buyer.unreviewed,1);
});

test("withheld reviews survive the same strict current and acceptance-history export binding",async()=>{
 const base=fixture(),q=recordRiskReview(base,"seller",input(base),at),d=q.proof.delivery!,saved=acceptDelivery(q,{confirm:true,deliveryId:d.id,manualChecks:d.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId)},at),bundle=await createEvidenceExport(saved);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.equal(bundle.delivery.riskReviews![0].riskOrigin,"withheld");assert.equal(bundle.delivery.acceptanceEvidence![0].riskReviews[0].riskOrigin,"withheld");
});

test("each origin and participant has append-only independent positions and exact retries are idempotent",()=>{
 const q=fixture(),one=recordRiskReview(q,"buyer",input(q),at);assert.equal(recordRiskReview(one,"buyer",input(one),at),one);
 const two=recordRiskReview(one,"seller",{...input(one),decision:"rejected",reason:"Seller explains why the source lead needs a different observation."},at),three=recordRiskReview(two,"buyer",{...input(two),decision:"confirmed",reason:"Buyer independently inspected and records an opinion, not gate release."},at);
 assert.equal(three.proof.delivery!.riskReviews!.length,3);assert.equal(three.proof.delivery!.riskReviews![0].decision,"needs_evidence");assert.equal(three.proof.delivery!.riskReviews![1].actorRole,"seller");assert.equal(three.proof.delivery!.riskReviews![2].decision,"confirmed");assert.ok(three.proof.delivery!.riskReviews!.every(r=>r.riskOrigin==="withheld"));assert.deepEqual(three.proof.delivery!.assessment,q.proof.delivery!.assessment);assert.deepEqual(three.proof.delivery!.assessment!.risks,[]);
});

test("published review input and saved output keep legacy absence rather than an invented published value",()=>{
 const q=fixture(true),next=recordRiskReview(q,"buyer",input(q,false),at),entry=next.proof.delivery!.riskReviews![0];assert.equal(Object.hasOwn(entry,"riskOrigin"),false);assert.equal(recordRiskReview(next,"buyer",input(next,false),at),next);const summary=assessmentReviewSummary(next.proof.delivery!.assessment!,next.proof.delivery!.riskReviews);assert.equal(summary.participants.buyer.needsEvidence,1);
});

test("idempotence uses delivery, report, origin, numeric index and actor rather than equal text alone",()=>{
 const q=fixture(true),body=input(q,false),template:ProofRiskReview={...body,id:"controlled-other-key",decision:body.decision,actorRole:"buyer",reviewedAt:at};
 for(const patch of [{deliveryId:"another-delivery"},{assessmentId:"another-assessment"},{riskOrigin:"withheld" as const},{riskIndex:1},{actorRole:"seller" as const}]){const isolated=structuredClone(q);isolated.proof.delivery!.riskReviews=[{...template,...patch}];const next=recordRiskReview(isolated,"buyer",body,at);assert.notEqual(next,isolated);assert.equal(next.proof.delivery!.riskReviews!.length,2);assert.equal(Object.hasOwn(next.proof.delivery!.riskReviews![1],"riskOrigin"),false);}
});

test("default indices cannot review quarantined entries and explicit origin requires the exact eligible pool",()=>{
 const q=fixture(),before=structuredClone(q);assert.throws(()=>recordRiskReview(q,"buyer",input(q,false),at));
 for(const patch of [{riskOrigin:"published"},{riskOrigin:"other"},{riskOrigin:null},{riskOrigin:undefined},{riskIndex:-1},{riskIndex:1},{riskIndex:0.5},{riskIndex:"0"},{assessmentId:"stale-assessment"},{deliveryId:"stale-delivery"},{actorRole:"buyer"}]){assert.throws(()=>recordRiskReview(q,"seller",{...input(q),...patch},at));assert.deepEqual(q,before);}
 assert.throws(()=>recordRiskReview(q,"outsider" as ProofRole,input(q),at));
 for(const kind of ["absent","not-withheld","version","wrong-index","no-entry"]){const changed=structuredClone(q),r=changed.proof.delivery!.assessment!;if(kind==="absent")delete r.withheldRisks;if(kind==="not-withheld")r.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};if(kind==="version")Object.assign(r.withheldRisks!,{version:2});if(kind==="wrong-index")r.withheldRisks!.entries[0].originalRiskIndex=1;if(kind==="no-entry")r.withheldRisks!.entries=[];assert.throws(()=>recordRiskReview(changed,"buyer",input(changed),at),kind);}
});

test("exact review parsing rejects accessors, symbols, unknown keys and prototypes without invoking code",()=>{
 const q=fixture();let ran=false;const accessor={...input(q)};Object.defineProperty(accessor,"riskOrigin",{enumerable:true,get(){ran=true;return "withheld";}});assert.throws(()=>recordRiskReview(q,"buyer",accessor,at));assert.equal(ran,false);
 for(const value of [{...input(q),extra:true},{...input(q),[Symbol("extra")]:"ignored"},Object.assign(Object.create({foreign:true}),input(q))])assert.throws(()=>recordRiskReview(q,"buyer",value,at));
 const nullPrototype=Object.assign(Object.create(null),input(q));assert.equal(recordRiskReview(q,"buyer",nullPrototype,at).proof.delivery!.riskReviews![0].riskOrigin,"withheld");
});

test("a new human review invalidates the stale first-acceptance view but preserves frozen acceptance and captured state",()=>{
 const q=fixture(),basis=acceptanceBasis(q),first=recordRiskReview(q,"buyer",input(q),at);assert.throws(()=>assertAcceptanceBasis(first,basis));assertAcceptanceBasis(first,acceptanceBasis(first));
 const d=first.proof.delivery!,saved=acceptDelivery(first,{confirm:true,deliveryId:d.id,manualChecks:d.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId)},at);saved.status="paid";saved.proof.paymentState="captured";saved.proof.acceptedDeliveryId=d.id;saved.proof.acceptedAt=at;saved.captureId="synthetic-capture";const snapshot=JSON.stringify(saved.proof.delivery!.acceptanceEvidence),before=structuredClone(saved);
 const next=recordRiskReview(saved,"seller",{...input(saved),decision:"rejected",reason:"Separate seller opinion after acceptance; original consent is unchanged."},at);assert.deepEqual(saved,before);assert.equal(JSON.stringify(next.proof.delivery!.acceptanceEvidence),snapshot);assert.equal(next.captureId,saved.captureId);assert.equal(next.proof.acceptedDeliveryId,saved.proof.acceptedDeliveryId);assert.equal(next.proof.paymentState,"captured");assertAcceptedSnapshotConsent(next,next.proof.collaboration!.acceptance!.evidenceSnapshotId);
});

test("a real replacement clears current assessments and reviews while archived objects retain their namespace",()=>{
 const q=fixture(),reviewed=recordRiskReview(q,"buyer",input(q),at),archive=structuredClone(reviewed.proof.delivery),criterionId=q.proof.criteria[0].id,returned=requestChanges(reviewed,{deliveryId:q.proof.delivery!.id,feedback:[{criterionId,comment:"Please provide additional source evidence for the existing agreed requirement."}]},at),fresh=createUploadedDelivery(q.proof.delivery!.files,q.proof.project!,"en",2),next=prepareReplacement(returned,fresh);
 assert.equal(next.proof.delivery!.assessment,undefined);assert.equal(next.proof.delivery!.riskReviews,undefined);assert.throws(()=>recordRiskReview(next,"buyer",input(q),at));assert.equal(archive!.riskReviews![0].riskOrigin,"withheld");assert.equal(archive!.assessment!.withheldRisks!.entries.length,1);
});

test("reviewing a withheld lead never enables a risk-repair source or changes the source-visibility plan",async()=>{
 const q=fixture(),plan=await sourceVisibilityPlan(q),next=recordRiskReview(q,"buyer",{...input(q),decision:"confirmed",reason:"Human opinion remains separate from technical findings and publication."},at);assert.deepEqual(await sourceVisibilityPlan(next),plan);const id=q.proof.criteria[0].id;assert.throws(()=>snapshotRiskFeedbackSource(next,id,{assessmentId:next.proof.delivery!.assessment!.id,riskIndex:0}));assert.throws(()=>snapshotRiskFeedbackSource(next,id,{assessmentId:next.proof.delivery!.assessment!.id,riskIndex:0,riskOrigin:"withheld"}));assert.deepEqual(next.proof.delivery!.assessment!.risks,[]);
});

test("offline review origins bind their own source pools and reject current or historical tampering",async()=>{
 const q=fixture(),reviewed=recordRiskReview(q,"buyer",input(q),at),base=await createEvidenceExport(reviewed);
 for(const patch of [{riskOrigin:"published"},{riskOrigin:"unknown"},{riskOrigin:null},{riskIndex:1},{assessmentId:"foreign-report"},{deliveryId:"foreign-delivery"},{actorRole:"outsider"},{extra:"private metadata"}]){const changed=structuredClone(base);Object.assign(changed.delivery.riskReviews![0],patch);assert.equal((await verifyEvidenceExport(changed)).consistency,"inconsistent",JSON.stringify(patch));}
 const defaulted=structuredClone(base);delete defaulted.delivery.riskReviews![0].riskOrigin;assert.ok(aiRejected(await verifyEvidenceExport(defaulted)));
 const duplicate=structuredClone(base);duplicate.delivery.riskReviews!.push(structuredClone(duplicate.delivery.riskReviews![0]));assert.ok(aiRejected(await verifyEvidenceExport(duplicate)));
 const wrongPool=structuredClone(base);wrongPool.delivery.assessment!.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};assert.ok(aiRejected(await verifyEvidenceExport(wrongPool)));
 const d=reviewed.proof.delivery!,saved=acceptDelivery(reviewed,{confirm:true,deliveryId:d.id,manualChecks:d.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId)},at);saved.proof.delivery!.assessment={...structuredClone(d.assessment!),id:"new-current-report",withheldRisks:{version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]}};delete saved.proof.delivery!.riskReviews;const historical=await createEvidenceExport(saved);assert.equal((await verifyEvidenceExport(historical)).consistency,"consistent");delete historical.delivery.acceptanceEvidence![0].riskReviews[0].riskOrigin;const result=await verifyEvidenceExport(historical);assert.equal(result.consistency,"inconsistent");assert.ok(result.checks.some(c=>c.id==="acceptance-references"&&c.status==="inconsistent"));
});

test("published offline annotations retain their old namespace while an explicit withheld origin cannot borrow them",async()=>{
 const q=fixture(true),reviewed=recordRiskReview(q,"buyer",input(q,false),at),bundle=await createEvidenceExport(reviewed);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.equal(Object.hasOwn(bundle.delivery.riskReviews![0],"riskOrigin"),false);const changed=structuredClone(bundle);changed.delivery.riskReviews![0].riskOrigin="withheld";assert.ok(aiRejected(await verifyEvidenceExport(changed)));
});

test("the existing hundred-record history bound and exact duplicate retry behavior are preserved",()=>{
 const q=fixture(),first=recordRiskReview(q,"buyer",input(q),at),saved=first.proof.delivery!.riskReviews![0];first.proof.delivery!.riskReviews=Array.from({length:100},(_,i)=>({...saved,id:`review-${i}`}));assert.equal(recordRiskReview(first,"buyer",input(first),at),first);assert.throws(()=>recordRiskReview(first,"buyer",{...input(first),reason:"A new opinion cannot evict the retained hundred records."},at));assert.equal(first.proof.delivery!.riskReviews.length,100);assert.equal(first.proof.delivery!.assessment!.withheldRisks!.entries.length,1);
});
