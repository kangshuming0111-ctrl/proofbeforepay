import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {readFile} from "node:fs/promises";
import {assessMenuPricePublicationAdmissionV3,isFiniteMenuStylesheetV2,isMenuSourcePublicationSafeV2} from "../lib/menu-source-publication-v2.ts";
import {createAssessmentSourceFindingCheck,sourceFindingVersionForPublication} from "../lib/assessment-source-findings.ts";
import {createMenuDomSourceBusinessFactCheckV2} from "../lib/menu-dom-source-v2.ts";
import {createMenuDomSourceBusinessFactCheckV3, UNCONFIRMED_MENU_CARD_OWNER} from "../lib/menu-dom-source-v3.ts";
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


const fixture=JSON.parse(await readFile(new URL('./fixtures/noodle-stage3-static-menu.json',import.meta.url),'utf8'));
const ordinaryCSS=fixture.files['site.css'];
function menuQuote({shape='complex',wrong=false,template=false,css=ordinaryCSS,transform=(s:string)=>s,original=price,expectedLabels}:{shape?:string;wrong?:boolean;template?:boolean;css?:string;transform?:(s:string)=>string;original?:string;expectedLabels?:string[]}={}){
 const q=languageQuote(original,expectedLabels),files=structuredClone(fixture.files),amount=wrong?28:18;
 const owners=shape==='plain'?[`<p>牛肉面 AUD${amount}</p>`,`<p>Beef noodles AUD${amount}</p>`]:[`<p><strong>牛肉面</strong> <span>AUD${amount}.00</span></p>`,`<div class="menu-item"><h3>Beef noodles</h3><p class="price">AUD ${amount}</p></div>`];
 const old='<p><strong>牛肉面</strong> <span>AUD28.00</span></p><div class="menu-item"><h3>Beef noodles</h3><p class="price">AUD 28</p></div>';
 files['menu.html']=transform(files['menu.html'].replace(old,owners.join('')).replace('</body>',`${template?' '.repeat(400)+'<template><p>牛肉面 AUD18</p><p>Beef noodles AUD18</p></template>':''}</body>`));files['site.css']=css;
 const delivery=createUploadedDelivery(files,q.proof.project!,'zh',2);q.proof.delivery=delivery;q.proof.review!.deliveryId=delivery.id;q.proof.collaboration!.submission!.deliveryId=delivery.id;return{q,owners};
}
async function controlledOwners(q:ProofQuote,owners:string[],status:'supported'|'changes_suggested'|'insufficient_evidence'='supported',selection='all'){
 let count=0;
 const report=await assessDelivery(q,{DEEPSEEK_API_KEY:'local-synthetic-only',DEEPSEEK_MODEL:'deepseek-flash'},async(_url,init)=>{
  count++;const request=JSON.parse(String(init!.body)),packet=JSON.parse(request.messages[1].content),source=q.proof.delivery!.files!['menu.html'];
  const raw=selection==='first'?owners.slice(0,1):selection==='inner'?['<span>AUD18.00</span>']:selection==='inert'?['<p>牛肉面 AUD18</p>']:owners;
  const ids=selection==='inert'?[packet.citationCatalog.entries.find((e:any)=>e.file==='menu.html'&&e.start>=source.indexOf(owners.at(-1)!)+owners.at(-1)!.length&&e.excerpt.includes('AUD18'))!.id]:raw.map(excerpt=>{const start=source.indexOf(excerpt);assert.ok(start>=0,excerpt);const e=packet.citationCatalog.entries.find((e:any)=>e.file==='menu.html'&&e.start===start&&e.end===start+excerpt.length&&e.excerpt===excerpt);assert.ok(e,excerpt);return e.id;});
  const items=packet.criteria.map((c:any)=>({criterionId:c.id,status:c.id==='mobile'?'insufficient_evidence':c.id==='coverage-1'?status:'supported',explanation:'Controlled source test, not provider inference.',citations:Object.fromEntries(Array.from({length:6},(_,i)=>[`c${i+1}`,ids[i]??'']))}));
  return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:request.tools[0].function.name,arguments:JSON.stringify({catalogId:packet.citationCatalog.catalogId,items,risks:[],limitations:['Controlled callback only.']})}}]}}]});
 });assert.equal(count,1);return report;
}
test('schema3 covers ordinary local stylesheet/head/nav plus same-owner inline/card prices with full original quotes',async()=>{
 for(const shape of ['plain','complex'])for(const template of[false,true]){
  const{q,owners}=menuQuote({shape,template}),report=await controlledOwners(q,owners),item=report.items.find(i=>i.criterionId==='coverage-1')!;
  assert.equal(item.status,'supported');assert.equal(item.modelJudgment!.status,'supported');assert.equal(item.sourceFinding!.version,'source-finding-v3');assert.equal(item.sourceFinding!.status,'supported');assert.equal(report.publicationPolicy!.schema,'source-publication-v3');
  if(shape==='complex'||template)assert.deepEqual(item.publicationBasis,{schema:'source-publication-v3',reason:'locked_price_match'});
  assert.equal(assessMenuPricePublicationAdmissionV3(q.proof.delivery!.files!,item.sourceFinding,item.modelJudgment!.citations,report.coverage),true);
 }
});
test('finite CSS qualification is final on ALL plain/complex supported paths, not just source restoration',async()=>{
 for(const shape of['plain','complex'])for(const css of[ordinaryCSS+'p{display:none}',ordinaryCSS+'body{opacity:0}',ordinaryCSS+'p{position:absolute}',ordinaryCSS+'p{color:#fff}',ordinaryCSS+'@media(max-width:400px){p{display:none}}']){
  const{q,owners}=menuQuote({shape,css}),report=await controlledOwners(q,owners),item=report.items.find(i=>i.criterionId==='coverage-1')!;assert.equal(item.status,'insufficient_evidence',shape+css);assert.equal(item.publicationBasis,undefined);assert.equal(item.sourceFinding!.status,'supported');
 }
 for(const shape of['plain','complex']){const{q,owners}=menuQuote({shape}),report=await controlledOwners(q,owners,'insufficient_evidence');assert.equal(report.items.find(i=>i.criterionId==='coverage-1')!.status,'insufficient_evidence');}
});
test('wrong same-owner prices remain evidenced mismatches; rawunknowns or bad owner quotes are never promoted',async()=>{
 const{q,owners}=menuQuote({wrong:true}),report=await controlledOwners(q,owners,'changes_suggested'),item=report.items.find(i=>i.criterionId==='coverage-1')!;assert.equal(item.status,'changes_suggested');assert.equal(item.sourceFinding!.status,'changes_suggested');assert.deepEqual(item.publicationBasis,{schema:'source-publication-v3',reason:'locked_price_mismatch'});
 for(const selection of['first','inner','inert']){const x=menuQuote({template:true}),r=await controlledOwners(x.q,x.owners,'supported',selection);assert.equal(r.items.find(i=>i.criterionId==='coverage-1')!.status,'insufficient_evidence',selection);}
 const x=menuQuote({original:compound}),r=await controlledOwners(x.q,x.owners);assert.equal(r.items.find(i=>i.criterionId==='coverage-1')!.status,'insufficient_evidence');assert.equal(r.items.find(i=>i.criterionId==='coverage-1')!.sourceFinding!.status,'supported');
});
test('hidden/native/dynamic attributes and scripts remain outside the same static source-publication boundary',async()=>{
 for(const transform of[(s:string)=>s.replace('<body>','<body hidden>'),(s:string)=>s.replace('<body>','<body style="opacity:0">'),(s:string)=>s.replace('<body>','<body><details>').replace('</body>','</details></body>'),(s:string)=>s.replace('<body>','<body><div popover>').replace('</body>','</div></body>'),(s:string)=>s.replace('</body>','<script>activate()</script></body>')]){
  const{q,owners}=menuQuote({transform}),r=await controlledOwners(q,owners);assert.equal(r.items.find(i=>i.criterionId==='coverage-1')!.status,'insufficient_evidence');
 }
});
test('finite stylesheet parser consumes all source and does not accept hidden syntax or fixture-specific CSS strings',()=>{
 for(const css of[ordinaryCSS,'main, .menu-item > h3{padding:.5rem 12px;margin:0 auto;font-family:Arial, sans-serif}nav{display:flex;gap:8px;flex-wrap:wrap}','body{max-width:960px;margin:16px auto}.menu-item{border:2px dashed #abc;padding:12px}'])assert.equal(isFiniteMenuStylesheetV2(css),true,css);
 for(const css of['p{opacity:0}','p{display:none}','p{padding:1rem} trailing','p::before{content:""}','p{margin:-1px}','p{font-size:0}','@import "remote.css";','p{padding:var(--x)}','p{padding:1rem!important}','p{padding:1rem}/*ignored*/'])assert.equal(isFiniteMenuStylesheetV2(css),false,css);
 assert.equal(sourceFindingVersionForPublication('source-publication-v1'),'source-finding-v1');assert.equal(sourceFindingVersionForPublication('source-publication-v2'),'source-finding-v2');
});

test('the shared affirmative wrapper rejects omitted/truncated text coverage even on a normal no-marker plain-owner pass',async()=>{
 const{q,owners}=menuQuote({shape:'plain'}),report=await controlledOwners(q,owners),item=report.items.find(i=>i.criterionId==='coverage-1')!,files=q.proof.delivery!.files!;
 assert.equal(item.status,'supported');assert.equal(item.publicationBasis,undefined);
 const check=(coverage:typeof report.coverage)=>assessMenuPricePublicationAdmissionV3(files,item.sourceFinding,item.modelJudgment!.citations,coverage);
 assert.equal(check(report.coverage),true);
 assert.equal(check({...report.coverage,truncatedFiles:['site.css']}),false);
 assert.equal(check({...report.coverage,includedFiles:report.coverage.includedFiles.filter(f=>f!=='site.css'),omittedFiles:['site.css']}),false);
 assert.equal(check({...report.coverage,omittedFiles:['image.png']}),true,'an omitted raster does not become a missing text requirement');
});

test('card descendants cannot publish an affirmative or negative price for a different card title', async () => {
  const original = 'The menu must list Beef noodles at AUD18.';
  for (const [amount, raw, historical] of [[18, 'supported', 'unchanged'], [28, 'changes_suggested', 'mismatch']] as const) {
    const leaf = `<p class="price">Beef noodles AUD${amount}</p>`;
    const {q} = menuQuote({
      original,
      expectedLabels: ['Beef noodles'],
      transform: source => source.replace('<h3>Beef noodles</h3><p class="price">AUD 18</p>', `<h3>Vegetable noodles</h3>${leaf}`),
    });
    const files = q.proof.delivery!.files!;
    const steps = getBusinessCheckPlan(q);
    assert.equal(createMenuDomSourceBusinessFactCheckV2(files, steps)('coverage-1').kind, historical);
    const owned = createMenuDomSourceBusinessFactCheckV3(files, steps)('coverage-1');
    assert.equal(owned.kind, 'unknown');
    assert.ok(owned.kind === 'unknown' && owned.checks.some(check => check.reason === UNCONFIRMED_MENU_CARD_OWNER));

    const report = await controlledOwners(q, [leaf], raw);
    const item = report.items.find(entry => entry.criterionId === 'coverage-1')!;
    assert.equal(item.modelJudgment?.status, raw);
    assert.equal(item.modelJudgment?.citations[0]?.excerpt, leaf);
    assert.equal(item.sourceFinding?.status, 'insufficient_evidence');
    assert.equal(item.status, 'insufficient_evidence');
    assert.equal(item.publicationBasis, undefined);
  }
});

test('a nested duplicate cannot supply a sibling card price witness', async () => {
  const nested = '<div class="menu-item"><h3>Vegetable noodles</h3><p class="price">AUD 24</p><div class="menu-item"><h3>Beef noodles</h3><p class="price">AUD 28</p></div></div>';
  const {q, owners} = menuQuote({
    original: 'The menu must list Beef noodles at AUD18.',
    expectedLabels: ['Beef noodles'],
    transform: source => source.replace('</body>', `${nested}</body>`),
  });
  const files = q.proof.delivery!.files!;
  const steps = getBusinessCheckPlan(q);
  for (const reader of [createMenuDomSourceBusinessFactCheckV2, createMenuDomSourceBusinessFactCheckV3]) {
    assert.equal(reader(files, steps)('coverage-1').kind, 'unknown');
  }
  const report = await controlledOwners(q, [owners[1]]);
  assert.equal(report.items.find(item => item.criterionId === 'coverage-1')?.status, 'insufficient_evidence');
});
