import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {createRequirementCompletenessCheck,priceOnlyOriginal} from "../lib/assessment-requirement-completeness.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {resolveScopeClarifications} from "../lib/scope-clarifications.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import type {ProofQuote,ProofAssessmentCitation} from "../lib/contracts.ts";
const saved=JSON.parse(await readFile(new URL('./fixtures/noodle-v90-positive-export.json',import.meta.url),'utf8')).core;
function quote():ProofQuote{
 const d=structuredClone(saved.delivery);delete d.assessment;
 return{id:saved.project.id,reference:saved.project.reference,title:saved.project.title,summary:saved.project.summary,brief:saved.project.summary,language:saved.project.language,workflow:"proof-v1",status:"approved",aiMode:"demo",paymentMode:"demo",clientName:"Fictional local fixture",currency:"AUD",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,createdAt:d.submittedAt,
 proof:{demoRoleplay:true,project:structuredClone(saved.project.spec),criteria:structuredClone(saved.project.criteria),delivery:d,scopeClarifications:structuredClone(saved.project.scopeClarifications),paymentState:"unfunded",audit:[],review:{deliveryId:d.id,mode:"demo",reviewedAt:d.submittedAt,summary:"Controlled source replay"},collaboration:{stage:"submitted",submission:{deliveryId:d.id,at:d.submittedAt,note:"Fictional controlled fixture"},feedback:[]}}};
}
const cite=(file:string,source:string,excerpt=source):ProofAssessmentCitation=>{const start=source.indexOf(excerpt);return{file,start,end:start+excerpt.length,excerpt};};

const html=(body:string)=>`<!doctype html><html><head><title>Menu</title></head><body>${body}</body></html>`;
function intake(summary:string,{template=false,hours=false,wrong=false,checks=true}:{template?:boolean;hours?:boolean;wrong?:boolean;checks?:boolean}={}){
 const q=quote(),units=summaryCoverageUnits(summary);assert.equal(units.length,1);const unit=units[0];
 const items=checks?['牛肉面','Beef noodles'].map((label,i)=>({id:`business-${i+1}`,criterionId:'coverage-1',file:'menu.html',source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:'item_price',label,amountMinor:1800,currency:'AUD'}})):[];
 const parsed=parseStaticProject({title:'Whole original coverage control',summary,amount:'1.00',requiredPages:['index.html','menu.html'],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:unit.id,disposition:'include'}]},...(checks?{businessChecks:{confirmed:true,items}}:{})},'zh');
 const files={'index.html':html('<p>Home</p>'),'menu.html':html(`<p>牛肉面 AUD${wrong?28:18}</p><p>Beef noodles AUD${wrong?28:18}</p>${template?'<template><p>牛肉面 AUD18</p></template>':''}${hours?'<p>营业时间 上午11点到晚上8点</p>':''}`),'site.css':'body{font-family:system-ui}'};
 const delivery=createUploadedDelivery(files,parsed.project,'zh',1);
 q.title=parsed.title;q.summary=summary;q.proof.project=parsed.project;q.proof.criteria=parsed.criteria;q.proof.delivery=delivery;q.proof.review!.deliveryId=delivery.id;q.proof.collaboration!.submission!.deliveryId=delivery.id;delete q.proof.scopeClarifications;return q;
}
async function controlled(q:ProofQuote,status:'supported'|'changes_suggested'|'insufficient_evidence'='supported',owner?:string){
 let calls=0;
 const report=await assessDelivery(q,{DEEPSEEK_API_KEY:'synthetic-local-no-network',DEEPSEEK_MODEL:'deepseek-flash'},async(_url,init)=>{
  calls++;const request=JSON.parse(String(init!.body)),packet=JSON.parse(request.messages[1].content),source=q.proof.delivery!.files!['menu.html'];
  const span=owner??source,start=source.indexOf(span);const e=packet.citationCatalog.entries.find((c:any)=>c.file==='menu.html'&&c.start===start&&c.end===start+span.length&&c.excerpt===span);assert.ok(e,'exact original source span available');
  const items=packet.criteria.map((c:any)=>({criterionId:c.id,status:c.id==='mobile'?'insufficient_evidence':c.id==='coverage-1'?status:'supported',explanation:'Controlled reply only; no provider inference.',citations:{c1:e.id,c2:'',c3:'',c4:'',c5:'',c6:''}}));
  return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:request.tools[0].function.name,arguments:JSON.stringify({catalogId:packet.citationCatalog.catalogId,items,risks:[],limitations:['Controlled pipeline, not a new AI sample.']})}}]}}]});
 });assert.equal(calls,1);return report;
}
const price='菜单的牛肉面和Beef noodles标价必须为AUD18。',compound='菜单的牛肉面和Beef noodles标价必须为AUD18且营业时间必须为上午11点到晚上8点。';

test('one final supported funnel covers normal unchanged and template source restoration without suppressing proven price subfacts',async()=>{
 for(const template of [false,true])for(const hours of [false,true]){
  const q=intake(compound,{template,hours}),report=await controlled(q),item=report.items.find(i=>i.criterionId==='coverage-1')!;
  assert.equal(item.modelJudgment!.status,'supported');assert.equal(item.sourceFinding!.status,'supported');assert.equal(item.status,'insufficient_evidence');assert.equal(item.publicationBasis,undefined);assert.equal(report.publicationPolicy!.reconciledCriterionIds.length,0);assert.deepEqual(report.requirementCompletenessPolicy,{schema:'requirement-completeness-v1',version:'bilingual-bounded-v2'});
  if(!template){assert.equal(item.evidenceNeed!.reason,'requirement_clarification');assert.match(item.explanation,/价格子事实/u);}
 }
});
test('price-only full-original subjects remain supported on normal and template paths, not split on 和/and in names',async()=>{
 for(const template of [false,true]){
  const q=intake(price,{template}),report=await controlled(q),item=report.items.find(i=>i.criterionId==='coverage-1')!;assert.equal(item.status,'supported');
  assert.equal(createRequirementCompletenessCheck({businessSteps:getBusinessCheckPlan(q)})(q.proof.criteria.find(c=>c.id==='coverage-1')!).kind,'complete');
 }
 const q=intake(price),steps=getBusinessCheckPlan(q).map(s=>({...s,expected:s.expected.kind==='item_price'?{...s.expected,label:s.expected.label==='牛肉面'?'Fish and Chips':'Soup'}:s.expected}));
 assert.equal(priceOnlyOriginal({id:'coverage-1',title:'Original',source:'菜单的Fish and Chips和Soup标价必须为AUD18。'},steps),true);
});
test('final completeness never promotes raw unknown or suppresses independently evidenced price mismatch',async()=>{
 for(const template of [false,true]){
  const unknown=await controlled(intake(compound,{template}),'insufficient_evidence'),item=unknown.items.find(i=>i.criterionId==='coverage-1')!;assert.equal(item.status,'insufficient_evidence');assert.equal(item.modelJudgment!.status,'insufficient_evidence');assert.equal(item.publicationBasis,undefined);
  const mismatch=await controlled(intake(compound,{template,wrong:true}),'changes_suggested'),bad=mismatch.items.find(i=>i.criterionId==='coverage-1')!;assert.equal(bad.status,'changes_suggested');assert.equal(bad.modelJudgment!.status,'changes_suggested');assert.equal(bad.sourceFinding!.status,'changes_suggested');
 }
});
test('untyped explicit compound source duties are withheld, but quoted data and complete native/literal originals are not split',async()=>{
 for(const summary of ['菜单必须显示牛肉面价格且营业时间必须到晚上8点。','The menu must show dish prices and opening hours.','The menu must show dish prices and state opening hours.','菜单必须显示价格并显示营业时间。','The page must list the phone and address.']){
  const q=intake(summary,{checks:false}),report=await controlled(q),item=report.items.find(i=>i.criterionId==='coverage-1')!;assert.equal(item.status,'insufficient_evidence',summary);assert.equal(item.evidenceNeed!.reason,'requirement_clarification');
 }
 const check=createRequirementCompletenessCheck({businessSteps:[]});
 for(const source of ['The page copy must include the exact text "Fish and Chips plus the address".','Contact form source content must label "Name:" and "E-mail:".','The page must include the phone number.','菜单必须包含“牛肉面和电话且地址”。','The menu must list Fish and Chips.'])assert.equal(check({id:'coverage-1',title:'Original',source}).kind,'not_applicable',source);
});
test('complete mapping rejects omitted/duplicated/mismatched typed subjects and preserves independent version boundary',()=>{
 const q=intake(price),criterion=q.proof.criteria.find(c=>c.id==='coverage-1')!,steps=getBusinessCheckPlan(q);
 assert.equal(createRequirementCompletenessCheck({businessSteps:steps})(criterion).kind,'complete');
 for(const selected of [steps.slice(0,2),steps.map(s=>({...s,expected:s.expected.kind==='item_price'?{...s.expected,amountMinor:1900}:s.expected})),steps.map(s=>({...s,expected:s.expected.kind==='item_price'?{...s.expected,currency:'USD' as const}:s.expected}))])assert.equal(createRequirementCompletenessCheck({businessSteps:selected})(criterion).kind,'incomplete');
 assert.equal(createRequirementCompletenessCheck({businessSteps:steps})({...criterion,source:'菜单的牛肉面和牛肉面标价必须为AUD18。'}).kind,'incomplete');
 assert.throws(()=>createRequirementCompletenessCheck({businessSteps:steps,version:'unrecognised' as any}),/Unsupported/u);
});

test('the existing positive literal restoration remains supported only for its complete atomic original',async()=>{
 const q=quote(),summary='The full menu page copy must include the literal phrase Required notice',unit=summaryCoverageUnits(summary)[0],literal='Required notice';
 const parsed=parseStaticProject({title:'Known atomic literal path',summary,amount:'1.00',requiredPages:['index.html','menu.html'],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:unit.id,disposition:'include'}]},businessChecks:{confirmed:true,items:[{id:'business-1',criterionId:'coverage-1',file:'menu.html',source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:'visible_copy',text:literal}}]}},'en');
 const files={'index.html':html('<p>Home</p>'),'menu.html':html('<p>Required notice</p><script>/* unrelated and inert for this quoted owner */</script>'),'site.css':'body{font-family:system-ui}'},delivery=createUploadedDelivery(files,parsed.project,'en',1);
 q.title=parsed.title;q.summary=summary;q.language='en';q.proof.project=parsed.project;q.proof.criteria=parsed.criteria;q.proof.delivery=delivery;q.proof.review!.deliveryId=delivery.id;q.proof.collaboration!.submission!.deliveryId=delivery.id;delete q.proof.scopeClarifications;
 const result=await controlled(q,'supported','<p>Required notice</p>'),item=result.items.find(i=>i.criterionId==='coverage-1')!;
 assert.equal(item.status,'supported');assert.match(item.explanation,/complete original source block/iu);assert.equal(item.publicationBasis,undefined);
 assert.equal(createRequirementCompletenessCheck({businessSteps:getBusinessCheckPlan(q)})(q.proof.criteria.find(c=>c.id===item.criterionId)!).kind,'not_applicable');
});
