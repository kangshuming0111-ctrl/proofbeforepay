import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {readFile} from "node:fs/promises";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {createRequirementCompletenessCheck,priceOnlyOriginalForVersion} from "../lib/assessment-requirement-completeness.ts";
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


const v1='bounded-original-zh-v1',v2='bilingual-bounded-v2';
const criterion=(source:string)=>({id:'coverage-1',title:'Original requirement',source});
function stepsFor(labels:string[],amount=1800,currency:'AUD'|'USD'='AUD',files=['menu.html']){
 return files.flatMap((file,f)=>labels.map((label,i)=>({stepId:`step-${f}-${i}`,checkId:`business-${f}-${i}`,criterionId:'coverage-1',file,viewportWidth:375 as const,source:{start:0,end:1,excerpt:'x'},expected:{kind:'item_price' as const,label,currency,amountMinor:amount}})));
}
function languageQuote(summary:string,labels=['牛肉面','Beef noodles'],template=true){
 const q=quote(),units=summaryCoverageUnits(summary);assert.equal(units.length,1);const unit=units[0];
 const items=labels.map((label,i)=>({id:`business-${i+1}`,criterionId:'coverage-1',file:'menu.html',source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:'item_price',label,amountMinor:1800,currency:'AUD'}}));
 const parsed=parseStaticProject({title:'Bounded bilingual control',summary,amount:'1.00',requiredPages:['index.html','menu.html'],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:unit.id,disposition:'include'}]},businessChecks:{confirmed:true,items}},'zh');
 const files={'index.html':html('<p>Home</p>'),'menu.html':html(labels.map(label=>`<p>${label} AUD18</p>`).join('')+(template?'<template><p>Unrelated inert placeholder AUD28</p></template>':'')),'site.css':'body{font-family:system-ui}'},delivery=createUploadedDelivery(files,parsed.project,'zh',1);
 q.title=parsed.title;q.summary=summary;q.proof.project=parsed.project;q.proof.criteria=parsed.criteria;q.proof.delivery=delivery;q.proof.review!.deliveryId=delivery.id;q.proof.collaboration!.submission!.deliveryId=delivery.id;delete q.proof.scopeClarifications;return q;
}

test('named v2 covers equivalent finite Chinese/English amounts while v1 saved semantics remain unchanged',()=>{
 const names=['牛肉面','Beef noodles'],steps=stepsFor(names),forms=['菜单的牛肉面和Beef noodles标价必须为AUD18。','菜单中牛肉面和Beef noodles的价格必须为18澳元。','菜单中牛肉面和Beef noodles的价格必须为AUD 18.00。','The menu must list 牛肉面 and Beef noodles at AUD18.','the menu must list 牛肉面 and Beef noodles at aud 18.00.'];
 for(const source of forms)assert.equal(createRequirementCompletenessCheck({businessSteps:steps,version:v2})(criterion(source)).kind,'complete',source);
 for(const source of forms.slice(1))assert.equal(createRequirementCompletenessCheck({businessSteps:steps,version:v1})(criterion(source)).kind,'incomplete',source);
 assert.equal(priceOnlyOriginalForVersion(criterion('菜单中Soup的价格必须为18.5美元。'),stepsFor(['Soup'],1850,'USD'),v2),true);
 assert.equal(priceOnlyOriginalForVersion(criterion('The menu must list Soup at AUD0.'),stepsFor(['Soup'],0),v2),true);
});
test('subject data is consumed whole and exactly once; overlapping full partitions remain unknown',()=>{
 for(const source of ['The menu must list Fish and Chips and Soup at AUD18.','The menu must list "Fish and Chips" and Soup at AUD18.'])assert.equal(priceOnlyOriginalForVersion(criterion(source),stepsFor(['Fish and Chips','Soup']),v2),true);
 for(const[source,labels]of [['The menu must list Fish and Chips and Soup at AUD18.',['Fish and Chips','Soup','Beef noodles']],['The menu must list Soup and Soup at AUD18.',['Soup']],['The menu must list Tea and Tea and Tea at AUD18.',['Tea','Tea and Tea']]]as const)assert.equal(priceOnlyOriginalForVersion(criterion(source),stepsFor([...labels]),v2),false,source);
});
test('common price whole wording rejects extra duties, guessed currency, conditions, wrong amounts and mixed prices',()=>{
 const base='The menu must list 牛肉面 and Beef noodles at AUD18',steps=stepsFor(['牛肉面','Beef noodles']);
 for(const source of [base+' and opening hours must be 11am to 8pm.',base+' if ordered online.',base+' per bowl.',base.replace('AUD18','$18'),base.replace('AUD18','USD18'),base.replace('AUD18','AUD18.50'),base.replace('AUD18','AUD18.000'),'菜单中牛肉面和Beef noodles的价格必须为18澳元且营业时间必须到晚上8点。'])assert.equal(priceOnlyOriginalForVersion(criterion(source),steps,v2),false,source);
 const mixed=structuredClone(steps);mixed[1].expected.amountMinor=1900;assert.equal(priceOnlyOriginalForVersion(criterion(base),mixed,v2),false);
});
test('the exact plural-page form is generic subject data scoped to exactly two buyer-confirmed file checks',()=>{
 const source='Display Tea prices on both agreed menu pages.',steps=stepsFor(['Tea'],1800,'AUD',['menu.html','menu2.html']);steps[1].expected.amountMinor=1900;
 assert.equal(priceOnlyOriginalForVersion(criterion(source),steps,v2),true);assert.equal(priceOnlyOriginalForVersion(criterion(source),steps,v1),false);
 assert.equal(priceOnlyOriginalForVersion(criterion(source.replace('Tea','Green Tea')),steps,v2),false);
 assert.equal(priceOnlyOriginalForVersion(criterion(source+' Also state opening hours.'),steps,v2),false);
 for(const files of [['menu.html'],['menu.html','menu2.html','menu3.html']])assert.equal(priceOnlyOriginalForVersion(criterion(source),stepsFor(['Tea'],1800,'AUD',files),v2),false);
});
test('English and new Chinese template source publications use v2 while preserving unknown/mismatch guards',async()=>{
 for(const source of ['The menu must list Beef noodles at AUD18.','菜单中Beef noodles的价格必须为18澳元。','菜单中Beef noodles的价格必须为AUD 18.00。'])for(const template of[false,true]){
  const q=languageQuote(source,['Beef noodles'],template),report=await controlled(q),item=report.items.find(i=>i.criterionId==='coverage-1')!;
  assert.equal(item.status,'supported');assert.equal(item.modelJudgment!.status,'supported');assert.equal(item.sourceFinding!.status,'supported');assert.equal(report.requirementCompletenessPolicy!.version,"bilingual-bounded-v3");
  assert.equal(item.publicationBasis?.reason,template?'locked_price_match':undefined);
 }
 const q=languageQuote('The menu must list Beef noodles at AUD18.',['Beef noodles']),unknown=await controlled(q,'insufficient_evidence');assert.equal(unknown.items.find(i=>i.criterionId==='coverage-1')!.status,'insufficient_evidence');
 const incomplete=languageQuote('The menu must list Beef noodles at AUD18 and opening hours must be 11am to 8pm.',['Beef noodles'],false),report=await controlled(incomplete);assert.equal(report.items.find(i=>i.criterionId==='coverage-1')!.status,'insufficient_evidence');
});

test('named bilingual UI reads full-original completeness independently from source-supported price subfacts',async()=>{
 const source=await readFile(new URL('../app/components/ScopeClarificationPanel.tsx',import.meta.url),'utf8');
 let js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "../scope-clarification.css";','');
 for(const name of ['react','react/jsx-runtime'])js=js.replaceAll(JSON.stringify(name),JSON.stringify(import.meta.resolve(name)));
 for(const name of ['assessment-evidence-needs','assessment-requirement-completeness'])js=js.replaceAll(JSON.stringify(`@/lib/${name}`),JSON.stringify(new URL(`../lib/${name}.ts`,import.meta.url).href));
 js = js.replaceAll('"./noodle-hours-guidance"', JSON.stringify(new URL("../app/components/noodle-hours-guidance.ts", import.meta.url).href));
 js = js.replaceAll('"./noodle-evidence-guidance"', JSON.stringify(new URL("../app/components/noodle-evidence-guidance.ts", import.meta.url).href));
 const{RequirementNextStep}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`),steps=stepsFor(['Beef noodles']);
 const item={criterionId:'coverage-1',status:'insufficient_evidence',explanation:'retained',citations:[],ruleEvidenceIds:[],modelJudgment:{status:'supported',explanation:'raw',citations:[]},sourceFinding:{version:'source-finding-v1',status:'supported',basis:'locked_business_values',explanation:'typed price facts only',citations:[],files:['menu.html']}};
 const render=(original:string,version:string)=>renderToStaticMarkup(createElement(RequirementNextStep,{criterion:criterion(original),item,businessSteps:steps,requirementCompletenessPolicy:{schema:'requirement-completeness-v1',version},language:'en'}));
 const ordinary='The menu must list Beef noodles at AUD18.',compound=ordinary.slice(0,-1)+' and opening hours must be 11am to 8pm.';
 assert.match(render(ordinary,v2),/Established: source meets the checked conditions/u);assert.doesNotMatch(render(ordinary,v2),/whole requirement still needs review/u);
 for(const original of [ordinary,compound]){const h=render(original,original===ordinary?v1:v2);assert.match(h,/Checked business values have support; the whole requirement still needs review/u);assert.match(h,/Buyer and seller/u);}
});
