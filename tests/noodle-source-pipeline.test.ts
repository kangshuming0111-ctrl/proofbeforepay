import assert from "node:assert/strict";
import test from "node:test";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {applyScopeClarification} from "../lib/scope-clarifications.ts";
import type {ProofQuote,ProofAssessmentItem} from "../lib/contracts.ts";
const html=(body:string)=>`<!doctype html><html><head><title>Shop fixture</title></head><body>${body}</body></html>`;
const at="2026-11-06T00:00:00.000Z";
function quote():ProofQuote{
 const summary='菜单的鸡汤价格必须为AUD21。联系表单源码必须包含标签“姓名”和“邮箱”。';
 const units=summaryCoverageUnits(summary);
 const parsed=parseStaticProject({title:"Authored noodle source fixture",summary,amount:"1.00",requiredPages:["index.html","menu.html","contact.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(u=>({id:u.id,disposition:"include"}))},businessChecks:{confirmed:true,items:[{id:"business-1",criterionId:"coverage-1",file:"menu.html",source:{start:units[0].start,end:units[0].end,excerpt:units[0].text},expected:{kind:"item_price",label:"鸡汤",amountMinor:2100,currency:"AUD"}}]}},"zh");
 const delivery=createUploadedDelivery({"index.html":html('<p>Home</p>'),"menu.html":html('<table><tr><th>鸡汤</th><td>AUD21.00</td></tr></table>'),"contact.html":html('<form id="contact"><label>姓名<input></label><label>邮箱<input></label></form>')},parsed.project,"zh",1);
 return{id:"noodle-pipeline",reference:"PBP-NOODLE-TEST",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Fictional",currency:"AUD",language:"zh",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{demoRoleplay:true,project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Controlled source"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Authored"},feedback:[]}}};
}
async function controlled(q:ProofQuote,status:ProofAssessmentItem["status"]="insufficient_evidence",originalExplanation="Exact original model item before any server guards."){
 let calls=0;
 const report=await assessDelivery(q,{DEEPSEEK_API_KEY:"no-network-controlled"},async(_url,init)=>{
  calls++;const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.messages[1].content);
  const first=packet.citationCatalog.entries[0].id;
  const response={catalogId:packet.citationCatalog.catalogId,items:packet.criteria.map((c:{id:string})=>({criterionId:c.id,status,explanation:originalExplanation,citations:{c1:status==="insufficient_evidence"?"":first,c2:"",c3:"",c4:"",c5:"",c6:""}})),risks:[],limitations:["Controlled offline response only."]};
  return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:request.tools[0].function.name,arguments:JSON.stringify(response)}}]}}]});
 });assert.equal(calls,1);return report;
}

test("raw unknown stays intact while independent exact price and source labels produce real source support",async()=>{
 const q=quote(),before=structuredClone(q),report=await controlled(q);
 for(const id of ["coverage-1","coverage-2"]){const item=report.items.find(i=>i.criterionId===id)!;assert.equal(item.status,"insufficient_evidence");assert.equal(item.modelJudgment!.status,"insufficient_evidence");assert.equal(item.modelJudgment!.explanation,"Exact original model item before any server guards.");assert.deepEqual(item.modelJudgment!.citations,[]);assert.equal(item.sourceFinding!.status,"supported");assert.ok(item.sourceFinding!.citations.length);}
 assert.deepEqual(q,before);assert.equal(q.proof.acceptedDeliveryId,undefined);assert.equal(q.proof.paymentState,"unfunded");
 q.proof.delivery!.assessment=report;const bundle=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
 for(const patch of ["status","citation","explanation","missing","need_target"]){const changed=structuredClone(bundle),item=changed.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!;if(patch==="status")item.sourceFinding!.status="changes_suggested";if(patch==="citation")item.sourceFinding!.citations[0].excerpt="Invented";if(patch==="explanation")item.sourceFinding!.explanation="Changed";if(patch==="missing")delete item.sourceFinding;if(patch==="need_target")item.evidenceNeed!.targetFiles=["missing.html"];assert.equal((await verifyEvidenceExport(changed)).consistency,"inconsistent",patch);}
});

test("actual two-sided F2 path restricts independent finding to confirmed form while raw unknown is preserved",async()=>{
 let q=quote();const original=q.proof.delivery!.files!["contact.html"];
 q.proof.delivery!.files!["index.html"]=original;q.proof.delivery!.files!["contact.html"]=html('<form id="contact"><label>姓名<input></label></form>');
 q=applyDelivery(q);
 const criterion=q.proof.criteria.find(c=>c.id==="coverage-2")!;
 q=await applyScopeClarification(q,"buyer",{action:"propose",deliveryId:q.proof.delivery!.id,criterionId:criterion.id,criterionSource:criterion.source,expectedLatestId:null,target:{kind:"form",file:"contact.html",formId:"contact"},basisNote:"Fictional fixed scope"},at);
 const proposal=q.proof.scopeClarifications![0];
 for(const role of ["buyer","seller"] as const)q=await applyScopeClarification(q,role,{action:"confirm",deliveryId:q.proof.delivery!.id,proposalId:proposal.id,proposalDigest:proposal.digest,confirm:true,basisNote:"Exact scope confirmed"},at);
 const report=await controlled(q),item=report.items.find(i=>i.criterionId===criterion.id)!;
 assert.equal(item.sourceFinding!.status,"changes_suggested");assert.equal(item.modelJudgment!.status,"insufficient_evidence");assert.deepEqual(item.sourceFinding!.files,["contact.html"]);assert.equal(item.sourceFinding!.scopeBinding!.proposalId,proposal.id);
 q.proof.delivery!.assessment=report;const bundle=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
 const changed=structuredClone(bundle);changed.delivery.assessment!.items.find(i=>i.criterionId===criterion.id)!.sourceFinding!.scopeBinding!.file="index.html";assert.equal((await verifyEvidenceExport(changed)).consistency,"inconsistent");
 // A later pending proposal must not reinterpret the existing report's prefix.
 q=await applyScopeClarification(q,"seller",{action:"propose",deliveryId:q.proof.delivery!.id,criterionId:criterion.id,criterionSource:criterion.source,expectedLatestId:proposal.id,target:{kind:"form",file:"index.html",formId:"contact"},basisNote:"New proposal, not authority yet"},at);
 assert.equal(q.proof.delivery!.assessment,undefined);assert.equal(q.proof.delivery!.assessmentHistory!.length,1);
 assert.equal((await verifyEvidenceExport(await createEvidenceExport(q))).consistency,"consistent");
});
function applyDelivery(q:ProofQuote){const d=createUploadedDelivery(q.proof.delivery!.files,q.proof.project!,q.language,1);q.proof.delivery=d;q.proof.review!.deliveryId=d.id;q.proof.collaboration!.submission!.deliveryId=d.id;return q;}


test("modelJudgment preserves decoded explanation whitespace rather than rewriting original text",async()=>{
 const explanation="  Exact raw explanatory text.  ",report=await controlled(quote(),"insufficient_evidence",explanation);
 assert.equal(report.items[0].modelJudgment!.explanation,explanation);
});
