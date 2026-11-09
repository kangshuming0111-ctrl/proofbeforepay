import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {createSourcePublicationCheck,type SourcePublicationInputs,type SourcePublicationCandidate} from "../lib/assessment-source-publication.ts";
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
async function positiveInput(){
 const q=quote(),item=saved.delivery.assessment.items.find((i:any)=>i.criterionId==='coverage-1');
 const input:SourcePublicationInputs={files:q.proof.delivery!.files!,coverage:structuredClone(saved.delivery.assessment.coverage),language:q.language,businessSteps:getBusinessCheckPlan(q),scope:await resolveScopeClarifications(q),ruleEvidence:q.proof.delivery!.evidence};
 const criterion=q.proof.criteria.find(c=>c.id==='coverage-1')!,candidate:SourcePublicationCandidate={rawStatus:'supported',rawCitations:structuredClone(item.modelJudgment.citations),guardedStatus:'insufficient_evidence',guardReason:'locked_price_match'};
 return{q,input,criterion,candidate};
}
async function synthetic(q:ProofQuote,retained=true){
 let intercepted=0;const before=structuredClone(q);
 const result=await assessDelivery(q,{DEEPSEEK_API_KEY:'controlled-synthetic-envelope-no-network',DEEPSEEK_MODEL:'deepseek-flash'},async(_url,init)=>{
  intercepted++;const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.messages[1].content);
  const slots=(citations:ProofAssessmentCitation[],limit:number)=>{const ids=citations.map(c=>{const entry=packet.citationCatalog.entries.find((e:any)=>e.file===c.file&&e.start===c.start&&e.end===c.end&&e.excerpt===c.excerpt);assert.ok(entry,'Saved exact source span must still have a current catalog address');return entry.id;});return Object.fromEntries(Array.from({length:limit},(_,i)=>[`c${i+1}`,ids[i]??'']));};
  const wire=retained?packet.criteria.map((c:any)=>{const raw=saved.delivery.assessment.items.find((i:any)=>i.criterionId===c.id).modelJudgment;return{criterionId:c.id,status:raw.status,explanation:raw.explanation,citations:slots(raw.citations,6)};}):packet.criteria.map((c:any)=>({criterionId:c.id,status:c.id==='mobile'?'insufficient_evidence':'supported',explanation:'Controlled adversarial reply, not model inference.',citations:slots([cite('menu.html',q.proof.delivery!.files!['menu.html'])],6)}));
  const risks=retained?saved.delivery.assessment.withheldRisks.entries.map((e:any)=>({...e.risk,citations:slots(e.risk.citations,3)})):[];
  return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:request.tools[0].function.name,arguments:JSON.stringify({catalogId:packet.citationCatalog.catalogId,items:wire,risks,limitations:['Synthetic tool envelope from saved decoded data; no retained original provider HTTP body or original prompt bytes.']})}}]}}]});
 });assert.equal(intercepted,1);assert.deepEqual(q,before);return result;
}

test("saved v90v2 decoded model items gain only a witnessed positive source publication, never claiming original HTTP replay",async()=>{
 const q=quote(),result=await synthetic(q),item=result.items.find(i=>i.criterionId==='coverage-1')!;
 assert.deepEqual(item.modelJudgment,saved.delivery.assessment.items.find((i:any)=>i.criterionId===item.criterionId).modelJudgment);
 assert.equal(item.status,'supported');assert.equal(item.sourceFinding!.status,'supported');assert.deepEqual(item.publicationBasis,{schema:'source-publication-v3',reason:'locked_price_match'});assert.equal(item.evidenceNeed,undefined);
 assert.equal(item.explanation,item.sourceFinding!.explanation);assert.deepEqual(item.citations,item.sourceFinding!.citations);assert.deepEqual(result.publicationPolicy!.reconciledCriterionIds,['coverage-1']);
 assert.equal(result.items.find(i=>i.criterionId==='mobile')!.status,'insufficient_evidence');assert.equal(result.risks.length,0);assert.equal(result.withheldRisks!.reason,'optional_source_leads_unverified');assert.deepEqual(result.withheldRisks!.entries,saved.delivery.assessment.withheldRisks.entries);
 assert.equal(saved.delivery.assessment.items.find((i:any)=>i.criterionId==='coverage-1').status,'insufficient_evidence');
});

test("affirmative source decision requires full original witnesses for every field, not a replacement quote",async()=>{
 const{input,criterion,candidate}=await positiveInput(),check=createSourcePublicationCheck(input);assert.equal(check(criterion,candidate)!.status,'supported');
 const raw=candidate.rawCitations;
 for(const rawCitations of [[],raw.slice(0,1),raw.map(c=>({...c,file:'index.html'})),raw.map(c=>cite(c.file,input.files[c.file],c.excerpt.replace(/^<p>/u,'').replace(/<\/p>$/u,'')))])assert.equal(check(criterion,{...candidate,rawCitations}),undefined);
 for(const rawStatus of ['insufficient_evidence','changes_suggested']as const)assert.equal(check(criterion,{...candidate,rawStatus}),undefined);
 assert.equal(check(criterion,{...candidate,guardReason:undefined}),undefined);
});

test("positive-only plain owner gate rejects hidden/ancestor/CSS/style/class/dynamic uncertainty without changing source facts",async()=>{
 const{input,criterion,candidate}=await positiveInput(),original=input.files['menu.html'];
 const sources=[original.replace('<p>牛肉面','<p style="display:none">牛肉面'),original.replace('<body>','<body style="opacity:0">'),original.replace('<body>','<body class="hidden">'),original.replace('<body>','<body hidden>'),original.replace('<p>牛肉面','<p aria-hidden="true">牛肉面'),original.replace('<body>','<body inert>'),original.replace('</head>','<style>p{display:none}</style></head>'),original.replace('<p>牛肉面','<p onclick="activate()">牛肉面'),original.replace('<template>','<template shadowrootmode="open">'),original.replace('</body>','<script>activate()</script></body>'),original.replace('<p>牛肉面','<p data-x="1" data-x="2">牛肉面'),original.replace('<body>','<body><details>').replace('</body>','</details></body>'),original.replace('<body>','<body><dialog>').replace('</body>','</dialog></body>'),original.replace('<body>','<body><datalist>').replace('</body>','</datalist></body>'),original.replace('</head>','<meta http-equiv="refresh" content="0;url=index.html"></head>'),original.replace('<p>牛肉面','<p popover>牛肉面'),original.replace('<body>','<body><div popover>').replace('</body>','</div></body>'),original.replace('<body>','<body><div popover="manual">').replace('</body>','</div></body>')];
 for(const source of sources){const files={...input.files,'menu.html':source};assert.equal(createSourcePublicationCheck({...input,files})(criterion,{...candidate,rawCitations:[cite('menu.html',source)]}),undefined,source);}
 assert.equal(createSourcePublicationCheck({...input,files:{...input.files,'site.css':'p{display:none}'}})(criterion,candidate),undefined);
 assert.equal(createSourcePublicationCheck({...input,ruleEvidence:[...input.ruleEvidence,{criterionId:criterion.id,finding:'fail'}]})(criterion,candidate),undefined);
 assert.equal(createSourcePublicationCheck(input)({...criterion,source:criterion.source+'提交后必须保存。'},candidate),undefined);
});

test("uncovered non-price original duties cannot gain a positive price-only publication marker",async()=>{
 const q=quote(),summary='The page copy must include the exact wording "Required notice".',unit=summaryCoverageUnits(summary)[0];
 const parsed=parseStaticProject({title:'Later guard control',summary,amount:'1.00',requiredPages:['index.html','menu.html'],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:unit.id,disposition:'include'}]},businessChecks:{confirmed:true,items:[{id:'business-1',criterionId:'coverage-1',file:'menu.html',source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:'item_price',label:'Soup',amountMinor:2100,currency:'AUD'}}]}},'en');
 const html=(b:string)=>`<!doctype html><html><head><title>Control</title></head><body>${b}</body></html>`,delivery=createUploadedDelivery({'index.html':html('<p>Home</p>'),'menu.html':html('<p>Soup AUD21</p><template><p>Soup AUD31</p></template>'),'site.css':'body{font-family:system-ui}'},parsed.project,'en',1);
 q.summary=summary;q.title=parsed.title;q.language='en';q.proof.project=parsed.project;q.proof.criteria=parsed.criteria;q.proof.delivery=delivery;q.proof.review!.deliveryId=delivery.id;q.proof.collaboration!.submission!.deliveryId=delivery.id;delete q.proof.scopeClarifications;
 const rule=q.proof.criteria.find(c=>c.id==='coverage-1')!,scope=await resolveScopeClarifications(q);
 const prior=createSourcePublicationCheck({files:delivery.files!,coverage:{includedFiles:Object.keys(delivery.files!),omittedFiles:[],truncatedFiles:[]},language:q.language,businessSteps:getBusinessCheckPlan(q),scope,ruleEvidence:delivery.evidence})(rule,{rawStatus:'supported',rawCitations:[cite('menu.html',delivery.files!['menu.html'])],guardedStatus:'insufficient_evidence',guardReason:'locked_price_match'});
 assert.equal(prior,undefined,'A locked price subset cannot establish an unrelated whole exact-copy requirement.');
 const result=await synthetic(q,false),item=result.items.find(i=>i.criterionId==='coverage-1')!;
 assert.equal(item.sourceFinding!.status,'supported');assert.equal(item.status,'insufficient_evidence');assert.notEqual(item.explanation,item.sourceFinding!.explanation);assert.equal(item.publicationBasis,undefined);assert.deepEqual(result.publicationPolicy!.reconciledCriterionIds,[]);
});


test("self-consistent single original clause with prices plus untested hours cannot be published as supported",async()=>{
 const q=quote(),summary='菜单的牛肉面和Beef noodles标价必须为AUD18且营业时间必须为上午11点到晚上8点。',unit=summaryCoverageUnits(summary)[0];
 assert.equal(summaryCoverageUnits(summary).length,1);
 const checks=['牛肉面','Beef noodles'].map((label,i)=>({id:`business-${i+1}`,criterionId:'coverage-1',file:'menu.html',source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:'item_price',label,amountMinor:1800,currency:'AUD'}}));
 const parsed=parseStaticProject({title:'Extra duty control',summary,amount:'1.00',requiredPages:['index.html','menu.html'],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:unit.id,disposition:'include'}]},businessChecks:{confirmed:true,items:checks}},'zh');
 const files=structuredClone(q.proof.delivery!.files!),delivery=createUploadedDelivery(files,parsed.project,'zh',1);
 q.title=parsed.title;q.summary=summary;q.proof.project=parsed.project;q.proof.criteria=parsed.criteria;q.proof.delivery=delivery;q.proof.review!.deliveryId=delivery.id;q.proof.collaboration!.submission!.deliveryId=delivery.id;delete q.proof.scopeClarifications;
 const result=await synthetic(q,false),item=result.items.find(i=>i.criterionId==='coverage-1')!;
 assert.equal(item.modelJudgment!.status,'supported');assert.equal(item.sourceFinding!.status,'supported');assert.equal(item.status,'insufficient_evidence');assert.equal(item.publicationBasis,undefined);assert.deepEqual(result.publicationPolicy!.reconciledCriterionIds,[]);
});
