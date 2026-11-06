import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessment,ProofQuote} from "../lib/contracts.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {createEvidenceExport,verifyEvidenceExport,type EvidenceExport} from "../lib/evidence-export.ts";
import {createEvidenceBundle} from "../lib/evidence-bundle.ts";
import {buildSupplementalEvidenceCatalog} from "../lib/supplemental-evidence.ts";
import {createRevisionAudit,verifyRevisionAudit} from "../lib/revision-audit.ts";
import {verifyAssessmentProvenanceMetadata,verifyAdditiveObligationsBaseline} from "../scripts/replay-evidence-actions-2026-11-06.mjs";
import {createRequirementCompletenessCheck,requirementCompletenessExplanation} from "../lib/assessment-requirement-completeness.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {createAssessmentSourceFindingCheck} from "../lib/assessment-source-findings.ts";
import {resolveAssessmentScopeContext} from "../lib/scope-clarifications.ts";

const at="2026-11-07T00:00:00.000Z";
const policy={schema:"requirement-completeness-v1",version:"bilingual-bounded-v2"} as const;
const html=(body:string)=>`<!doctype html><html><head><title>Controlled noodle source</title></head><body>${body}</body></html>`;
async function scenario({compound=true,template=false,hours=false,typed=true,raw="supported",summaryOverride}:{compound?:boolean;template?:boolean;hours?:boolean;typed?:boolean;raw?:ProofAssessment["items"][number]["status"];summaryOverride?:string}={}){
 const summary=summaryOverride??"菜单的牛肉面和Beef noodles标价必须为AUD18"+(compound?"且营业时间必须为上午11点到晚上8点。":"。"),units=summaryCoverageUnits(summary);
 assert.equal(units.length,1,"The test must exercise a real single coverage clause, not unrelated manually edited requirements.");
 const unit=units[0],checks=["牛肉面","Beef noodles"].map((label,index)=>({id:`business-${index+1}`,criterionId:"coverage-1",file:"menu.html",source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:"item_price" as const,label,amountMinor:1800,currency:"AUD" as const}}));
 const parsed=parseStaticProject({title:"Controlled whole-original noodle check",summary,amount:"1.00",requiredPages:["index.html","menu.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(u=>({id:u.id,disposition:"include"}))},...(typed?{businessChecks:{confirmed:true,items:checks}}:{})},"zh");
 const files={"index.html":html("<p>Home</p>"),"menu.html":html("<p>牛肉面 AUD18</p><p>Beef noodles AUD18</p>"+(hours?"<p>营业时间：上午11点到晚上8点</p>":"")+(template?"<template><p>Alternate AUD28</p></template>":"")),"site.css":"body{font-family:system-ui}"};
 const delivery=createUploadedDelivery(files,parsed.project,"zh",1);
 const quote:ProofQuote={id:"controlled-whole-original-project",reference:"PBP-CONTROLLED-WHOLE",title:parsed.title,summary,brief:summary,language:"zh",workflow:"proof-v1",status:"approved",aiMode:"demo",paymentMode:"demo",clientName:"Fictional local fixture",currency:"AUD",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,createdAt:at,
  proof:{demoRoleplay:true,project:parsed.project,criteria:parsed.criteria,delivery,paymentState:"unfunded",audit:[],review:{deliveryId:delivery.id,mode:"demo",reviewedAt:at,summary:"Controlled source check"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Controlled fictional delivery"},feedback:[]}}};
 let packet:any,wire:any,callbacks=0;const before=structuredClone(quote);
 const controlled=async(_url:unknown,init?:RequestInit)=>{
  callbacks++;const request=JSON.parse(String(init?.body));packet=JSON.parse(request.messages[1].content);
  const entry=packet.citationCatalog.entries.find((e:{file:string;start:number;end:number})=>e.file==="menu.html"&&e.start===0&&e.end===files["menu.html"].length);assert.ok(entry);
  wire=packet.criteria.map((c:{id:string})=>({criterionId:c.id,status:c.id==="coverage-1"?raw:"insufficient_evidence",explanation:"Controlled overconfident original item; not a provider evaluation.",citations:{c1:entry.id,c2:"",c3:"",c4:"",c5:"",c6:""}}));
  return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:request.tools[0].function.name,arguments:JSON.stringify({catalogId:packet.citationCatalog.catalogId,items:wire,risks:[],limitations:["Controlled fixture; no provider call."]})}}]}}]});
 };
 const reassess=(target:ProofQuote)=>assessDelivery(target,{DEEPSEEK_API_KEY:"controlled-no-provider",DEEPSEEK_MODEL:"deepseek-flash"},controlled);
 const report=await reassess(quote);
 assert.equal(callbacks,1);assert.deepEqual(quote,before);quote.proof.delivery!.assessment=report;
 return{quote,report,packet,wire,reassess,item:report.items.find(i=>i.criterionId==="coverage-1")!};
}
const aiCheck=async(bundle:EvidenceExport)=>(await verifyEvidenceExport(bundle)).checks.find(c=>c.id==="ai-source-citations")!.status;
async function projectLegacySource(quote:ProofQuote,report:ProofAssessment){
 const check=createAssessmentSourceFindingCheck({files:quote.proof.delivery!.files!,coverage:report.coverage,language:quote.language,businessSteps:getBusinessCheckPlan(quote),scope:await resolveAssessmentScopeContext(quote,report),version:"source-finding-v1"});
 if(report.publicationPolicy)report.publicationPolicy.schema="source-publication-v1";
 for(const item of report.items){const fact=check(quote.proof.criteria.find(c=>c.id===item.criterionId)!);if(fact)item.sourceFinding=fact;else delete item.sourceFinding;if(item.publicationBasis)item.publicationBasis.schema="source-publication-v1";}
}

test("all-path price facts remain separate from whole-original support through export",async()=>{
 for(const compound of[false,true])for(const template of[false,true])for(const hours of[false,true]){
  const{quote,report,item}=await scenario({compound,template,hours});
  assert.deepEqual(report.requirementCompletenessPolicy,policy);assert.equal(item.modelJudgment!.status,"supported");assert.equal(item.sourceFinding!.status,"supported");
  assert.equal(item.status,compound?"insufficient_evidence":"supported");
  if(compound){assert.equal(item.publicationBasis,undefined);assert.ok(item.evidenceNeed);}
  const before=structuredClone(quote),bundle=await createEvidenceExport(quote);assert.equal(await aiCheck(bundle),"consistent");assert.deepEqual(bundle.delivery.assessment,report);assert.deepEqual(quote,before);
  assert.equal(quote.proof.paymentState,"unfunded");assert.equal(quote.proof.acceptedDeliveryId,undefined);
 }
});

test("unknown raw results and untyped compound originals never become whole passes",async()=>{
 for(const options of[{typed:false},{raw:"insufficient_evidence" as const}]){
  const{quote,item}=await scenario(options);assert.equal(item.status,"insufficient_evidence");
  assert.equal((await verifyEvidenceExport(await createEvidenceExport(quote))).consistency,"consistent");
 }
});

test("new policy refuses forged whole support even when every price fact is exact",async()=>{
 const{quote}=await scenario(),bundle=await createEvidenceExport(quote);
 const forged=structuredClone(bundle),item=forged.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!;
 item.status="supported";delete item.evidenceNeed;item.explanation=item.sourceFinding!.explanation;
 forged.delivery.assessment!.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};
 assert.equal(item.sourceFinding!.status,"supported");assert.equal(await aiCheck(forged),"inconsistent");
 for(const change of[(p:any)=>{p.schema="future";},(p:any)=>{p.version="bilingual-bounded-v3";},(p:any)=>{p.extra=true;},(p:any)=>{delete p.version;}]){
  const altered=structuredClone(bundle);change(altered.delivery.assessment!.requirementCompletenessPolicy);assert.equal(await aiCheck(altered),"inconsistent");
 }
 const noRaw=structuredClone(bundle);delete noRaw.delivery.assessment!.items[0].modelJudgment;assert.equal(await aiCheck(noRaw),"inconsistent");
});

test("same-version legacy snapshot stays byte-equivalent without applying a new whole-original policy",async()=>{
 const{quote,report,item}=await scenario(),legacy=structuredClone(report);legacy.id="synthetic-v91-compatible-legacy-report";
 // This is a controlled schema-compatibility example, not an original saved
 // provider report. It models the demonstrated old ordinary-price path.
 delete legacy.requirementCompletenessPolicy;const prior=legacy.items.find(i=>i.criterionId===item.criterionId)!;
 await projectLegacySource(quote,legacy);
 prior.status="supported";prior.explanation=prior.sourceFinding!.explanation;delete prior.evidenceNeed;
 legacy.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};
 quote.proof.delivery!.assessmentHistory=[legacy];const before=structuredClone(legacy),bundle=await createEvidenceExport(quote);
 assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual(bundle.delivery.assessmentHistory,[before]);assert.deepEqual(legacy,before);
 const claimed=structuredClone(bundle);claimed.delivery.assessmentHistory![0].requirementCompletenessPolicy=policy;assert.equal(await aiCheck(claimed),"inconsistent");
});

test("selected-revision verification replays each saved policy without rewriting archived source or verdicts",async()=>{
 const{quote,reassess}=await scenario(),archived=await createEvidenceExport(quote),next=structuredClone(quote);
 next.proof.delivery=createUploadedDelivery(quote.proof.delivery!.files,quote.proof.project!,quote.language,2);
 next.proof.review!.deliveryId=next.proof.delivery.id;next.proof.collaboration!.submission!.deliveryId=next.proof.delivery.id;
 next.proof.delivery.assessment=await reassess(next);
 const core=await createEvidenceExport(next),catalog=await buildSupplementalEvidenceCatalog(next.proof.delivery.id,core.fileDigest,[]),current=await createEvidenceBundle(next,{catalog,objects:[]});
 const audit=await createRevisionAudit({versions:[{retainedAt:at,isCurrent:false,scope:"archived-core",evidence:archived},{retainedAt:at,isCurrent:true,scope:"current-full",evidence:current}]});
 assert.equal((await verifyRevisionAudit(audit)).consistency,"consistent");assert.deepEqual((audit.versions[0].evidence as EvidenceExport).delivery.assessment,archived.delivery.assessment);
 const forged=structuredClone(audit),old=(forged.versions[0].evidence as EvidenceExport).delivery.assessment!,item=old.items.find(i=>i.criterionId==="coverage-1")!;
 item.status="supported";delete item.evidenceNeed;old.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};assert.equal((await verifyRevisionAudit(forged)).consistency,"inconsistent");
});

test("policy normalization never disguises the actual corrected whole-original verdict",async()=>{
 const{quote,report,packet,wire}=await scenario(),previous=structuredClone(report);delete previous.requirementCompletenessPolicy;
 await projectLegacySource(quote,previous);
 const item=previous.items.find(i=>i.criterionId==="coverage-1")!;item.status="supported";item.explanation=item.sourceFinding!.explanation;delete item.evidenceNeed;
 previous.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};
 const normalized=await verifyAssessmentProvenanceMetadata(report,previous,packet,quote,wire);
 assert.equal(normalized.accounting.requirementCompletenessPoliciesVerified,1);assert.equal(normalized.accounting.requirementCompletenessChecksRecomputed,quote.proof.criteria.length);
 assert.equal(Object.hasOwn(normalized.report,"requirementCompletenessPolicy"),false);assert.equal(normalized.report.items.find((i:any)=>i.criterionId==="coverage-1").status,"insufficient_evidence");
 assert.throws(()=>verifyAdditiveObligationsBaseline(normalized.report,normalized.previous,quote.proof.criteria),/field other than/u);
 const invalid=structuredClone(report);delete invalid.requirementCompletenessPolicy;await assert.rejects(verifyAssessmentProvenanceMetadata(invalid,previous,packet,quote,wire));
});

test("retained valid policy is checked on both sides while unknown core prose and citations stay immutable",async()=>{
 const complete=await scenario({compound:false}),same=await verifyAssessmentProvenanceMetadata(complete.report,structuredClone(complete.report),complete.packet,complete.quote,complete.wire);
 assert.equal(same.accounting.requirementCompletenessPoliciesVerified,1);assert.equal(same.accounting.baselineRequirementCompletenessPoliciesRetained,1);
 assert.equal(verifyAdditiveObligationsBaseline(same.report,same.previous,complete.quote.proof.criteria).publishedCoreFieldsUnchanged,true);
 const incomplete=await scenario();assert.equal(incomplete.item.status,"insufficient_evidence");
 for(const change of[(r:ProofAssessment)=>{r.items.find(i=>i.criterionId==="coverage-1")!.explanation="Altered unknown explanation";},(r:ProofAssessment)=>{r.items.find(i=>i.criterionId==="coverage-1")!.citations=[];}]){
  const altered=structuredClone(incomplete.report);change(altered);
  const compared=await verifyAssessmentProvenanceMetadata(altered,incomplete.report,incomplete.packet,incomplete.quote,incomplete.wire);
  assert.throws(()=>verifyAdditiveObligationsBaseline(compared.report,compared.previous,incomplete.quote.proof.criteria),/field other than/u);
 }
});

test("new bilingual price-only publication replays its named version and cannot fall back to an old grammar",async()=>{
 for(const summaryOverride of["The menu must list 牛肉面 and Beef noodles at AUD18.","菜单中牛肉面和Beef noodles的价格必须为18澳元。"]){
  for(const template of[false,true]){
   const{quote,report,item}=await scenario({compound:false,summaryOverride,template});assert.deepEqual(report.requirementCompletenessPolicy,policy);assert.equal(item.status,"supported");
   const bundle=await createEvidenceExport(quote);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
   const v1=structuredClone(bundle);v1.delivery.assessment!.requirementCompletenessPolicy!.version="bounded-original-zh-v1";assert.equal(await aiCheck(v1),"inconsistent");
   if(template){assert.equal(item.publicationBasis?.reason,"locked_price_match");const noVersion=structuredClone(bundle);delete noVersion.delivery.assessment!.requirementCompletenessPolicy;assert.equal(await aiCheck(noVersion),"inconsistent");}
  }
 }
});

test("a v1 English unknown and v2 support can coexist without reinterpreting the historical policy",async()=>{
 const{quote,report,item}=await scenario({compound:false,summaryOverride:"The menu must list 牛肉面 and Beef noodles at AUD18.",template:true});
 const criterion=quote.proof.criteria.find(c=>c.id===item.criterionId)!,oldCheck=createRequirementCompletenessCheck({businessSteps:getBusinessCheckPlan(quote),version:"bounded-original-zh-v1"})(criterion);assert.equal(oldCheck.kind,"incomplete");
 const legacy=structuredClone(report);legacy.id="controlled-v1-english-unknown";legacy.requirementCompletenessPolicy={schema:"requirement-completeness-v1",version:"bounded-original-zh-v1"};legacy.publicationPolicy!.reconciledCriterionIds=[];
 await projectLegacySource(quote,legacy);
 const prior=legacy.items.find(i=>i.criterionId===item.criterionId)!;delete prior.publicationBasis;prior.status="insufficient_evidence";prior.explanation=requirementCompletenessExplanation(oldCheck,quote.language);prior.evidenceNeed={schema:"source-evidence-need-v1",reason:"requirement_clarification",targetFiles:[]};
 legacy.withheldRisks={version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:item.criterionId,originalStatus:"supported",publishedStatus:"insufficient_evidence"}],entries:[]};
 quote.proof.delivery!.assessmentHistory=[legacy];const before=structuredClone(legacy),bundle=await createEvidenceExport(quote);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual(bundle.delivery.assessmentHistory,[before]);assert.equal(bundle.delivery.assessment!.items.find(i=>i.criterionId===item.criterionId)!.status,"supported");
 const claim=structuredClone(bundle),claimed=claim.delivery.assessmentHistory![0];claimed.items.find(i=>i.criterionId===item.criterionId)!.status="supported";delete claimed.items.find(i=>i.criterionId===item.criterionId)!.evidenceNeed;claimed.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};assert.equal(await aiCheck(claim),"inconsistent");assert.deepEqual(legacy,before);
});
