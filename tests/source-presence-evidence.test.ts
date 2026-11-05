import assert from 'node:assert/strict';
import test from 'node:test';
import {createSourcePresenceEvidenceCheck} from '../lib/source-presence-evidence.ts';
import {projectQuote} from '../scripts/run-project-assessment-evaluation.ts';
import {assessDelivery} from '../lib/delivery-assessment.ts';
const requirement='The page content must list the shop telephone number.';
const html=(body:string)=>'<!doctype html><html><head><title>Contact</title></head><body>'+body+'</body></html>';
const criterion=(source=requirement)=>({id:'coverage-1',title:'Original requirement 1',source});
test('presence witness is exact complete text owner, not a model conclusion',()=>{
 const files={'index.html':html('<p>Phone: +61 3 9000 1234</p>')};const r=createSourcePresenceEvidenceCheck(files)(criterion());assert.equal(r.kind,'present');if(r.kind==='present'){assert.equal(r.citations.length,1);const c=r.citations[0];assert.equal(files['index.html'].slice(c.start,c.end),c.excerpt);assert.equal(c.excerpt,'<p>Phone: +61 3 9000 1234</p>');}
});
test('generic content and exact named-file scopes remain distinct',()=>{
 const f={'index.html':html('<p>Welcome</p>'),'contact.html':html('<p>Phone: +61 3 9000 1234</p>')},check=createSourcePresenceEvidenceCheck(f);assert.equal(check(criterion()).kind,'present');assert.equal(check(criterion('index.html must list the shop phone number.')).kind,'absent');assert.equal(check(criterion('missing.html must list the shop phone number.')).kind,'unknown');
});
test('email and Chinese simple directives have source witnesses',()=>{
 for(const [source,body] of [['页面必须列出店铺的电话号码。','<p>电话：+61 3 9000 1234</p>'],['网站必须提供联系邮箱。','<p>team@example.invalid</p>'],['The website must include the business email address.','<a href="mailto:team@example.invalid">team@example.invalid</a>']])assert.equal(createSourcePresenceEvidenceCheck({'index.html':html(body)})(criterion(source)).kind,'present');
});
test('negation, compound actions, exact values, locations and undefined roles do not borrow a presence-only grammar',()=>{
 for(const source of ['The page must not list the phone number.','The page content must list the phone number and send a confirmation.','The page must list the telephone number +61 3 9000 1234.','The homepage must list the shop telephone number.','The page must list the phone number in its footer.','页面必须列出电话并发送邮件。'])assert.equal(createSourcePresenceEvidenceCheck({'index.html':html('<p>Phone: +61 3 9000 1234</p>')})(criterion(source)).kind,'not_applicable',source);
});
test('comment, script, template, attribute and head data are not phone-content witnesses',()=>{
 for(const body of ['<!-- Phone: +61 3 9000 1234 -->','<script>const phone="Phone: +61 3 9000 1234";</script>','<template><p>Phone: +61 3 9000 1234</p></template>','<div data-phone="Phone: +61 3 9000 1234">Contact</div>'])assert.notEqual(createSourcePresenceEvidenceCheck({'index.html':html(body)})(criterion()).kind,'present');
});
test('image, hidden, dynamic or overlong unlocated source does not establish absence',()=>{
 for(const body of ['<img src="phone.png" alt="contact">','<p hidden>Phone: +61 3 9000 1234</p>','<script src="contact.js"></script>','<p>'+('x'.repeat(600))+' Phone: +61 3 9000 1234</p>'])assert.equal(createSourcePresenceEvidenceCheck({'index.html':html(body)})(criterion()).kind,'unknown',body.slice(0,60));
});
async function run(source=requirement,body='<p>Phone: +61 3 9000 1234</p>',raw='changes_suggested',failed=false){
 const q=projectQuote({id:'controlled-presence-claim',stratum:'boundary',language:'en',title:'Presence counterexample',summary:source,requiredPages:['index.html'],files:{'index.html':html(body)},criteria:[{...criterion(source),...(failed?{id:'manual-1',title:'Manual requirement 1'}:{}),reference:{expectedStatus:'supported',rationale:'Controlled injection, no real model.',relevantFiles:['index.html'],requiresSemanticReview:true}}]});
 if(failed)q.proof.delivery!.evidence[0].finding='fail';const before=structuredClone(q);let calls=0;
 const r=await assessDelivery(q,{DEEPSEEK_API_KEY:'controlled-offline'},async(_u,init)=>{calls++;const p=JSON.parse(JSON.parse(String(init!.body)).messages[1].content),entry=p.citationCatalog.entries.find((e:{excerpt:string})=>e.excerpt.startsWith('<p>'))??p.citationCatalog.entries[0];const slots=(n:number)=>Object.fromEntries(Array.from({length:n},(_,i)=>['c'+(i+1),i?'':entry.id]));return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:'submit_source_assessment_v3',arguments:JSON.stringify({catalogId:p.citationCatalog.catalogId,items:p.criteria.map((c:{id:string})=>({criterionId:c.id,status:raw,explanation:'The shop phone number is absent, so the seller must add it.',citations:slots(6)})),risks:[{title:'Possible missing phone',explanation:'The phone is claimed missing.',suggestion:'Ask for verification.',citations:slots(3)}],limitations:[]})}}]}}]});});assert.equal(calls,1);assert.deepEqual(q,before);return r;
}
test('the reproduced V3 contradictory absence claim is held for manual review with exact positive witness',async()=>{
 const r=await run();assert.equal(r.items[0].status,'insufficient_evidence');assert.equal(r.items[0].evidenceNeed?.reason,'manual_interpretation');assert.match(r.items[0].explanation,/independent source check/i);assert.equal(r.items[0].citations[0].excerpt,'<p>Phone: +61 3 9000 1234</p>');assert.equal(r.risks.length,0);assert.equal(r.withheldRisks?.entries.length,1);assert.deepEqual(r.withheldRisks?.adjustedCriteria,[{criterionId:'coverage-1',originalStatus:'changes_suggested',publishedStatus:'insufficient_evidence'}]);
});
test('actual absence and authoritative failed server rule retain changes priority',async()=>{assert.equal((await run(requirement,'<p>Welcome to our shop.</p>')).items[0].status,'changes_suggested');assert.equal((await run(requirement,undefined,undefined,true)).items[0].status,'changes_suggested');});
test('raw unknown stays unresolved with source-only wording and no invented status adjustment',async()=>{const r=await run(requirement,undefined,'insufficient_evidence');assert.equal(r.items[0].status,'insufficient_evidence');assert.equal(r.items[0].evidenceNeed?.reason,'model_unresolved');assert.match(r.items[0].explanation,/model left this item unresolved/);assert.match(r.items[0].explanation,/complete phone text witness in index.html/);assert.doesNotMatch(r.items[0].explanation,/phone number is absent/);assert.match(r.items[0].citations[0].excerpt,/Phone:/);assert.equal(r.withheldRisks?.reason,'source_scope_unestablished');assert.deepEqual(r.withheldRisks?.adjustedCriteria,[]);});
test('explicit V2 and legacy replays cannot enter the V3 presence override',async()=>{
 const {assessDeliveryCatalogReplay,assessDeliveryLegacyReplay}=await import('../lib/delivery-assessment.ts');
 for(const mode of ['v2','legacy']){
  const source=requirement,files={'index.html':html('<p>Phone: +61 3 9000 1234</p>')},q=projectQuote({id:'controlled-old-presence',stratum:'boundary',language:'en',title:'Old source protocol',summary:source,requiredPages:['index.html'],files,criteria:[{...criterion(source),reference:{expectedStatus:'supported',rationale:'Retained controlled response, not a live model.',relevantFiles:['index.html'],requiresSemanticReview:true}}]});
  const result=await (mode==='v2'?assessDeliveryCatalogReplay:assessDeliveryLegacyReplay)(q,{DEEPSEEK_API_KEY:'controlled-offline'},async(_u,init)=>{
   const p=JSON.parse(JSON.parse(String(init!.body)).messages[1].content),excerpt='<p>Phone: +61 3 9000 1234</p>',citations=mode==='v2'?[p.citationCatalog.entries.find((e:{excerpt:string})=>e.excerpt===excerpt).id]:[{file:'index.html',excerpt}];
   const data={...(mode==='v2'?{catalogId:p.citationCatalog.catalogId}:{}),items:p.criteria.map((c:{id:string})=>({criterionId:c.id,status:'changes_suggested',explanation:'The shop phone number is absent, so the seller must add it.',citations})),risks:[],limitations:[]};
   return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:mode==='v2'?'submit_source_assessment_v2':'submit_source_assessment',arguments:JSON.stringify(data)}}]}}]});
  });assert.equal(result.items[0].status,'changes_suggested',mode);assert.equal(result.items[0].evidenceNeed,undefined);assert.equal(result.withheldRisks,undefined);
 }
});
test('affirmative phone claims also need a complete in-scope literal owner',async()=>{
 assert.equal((await run(requirement,undefined,'supported')).items[0].status,'supported');
 for(const body of ['<p>Welcome to our shop.</p>','<p>Welcome.</p><!-- Phone: +61 3 9000 1234 -->','<p>Welcome.</p><script>const value="Phone: +61 3 9000 1234";</script>']){
  const r=await run(requirement,body,'supported');assert.equal(r.items[0].status,'insufficient_evidence');assert.equal(r.items[0].evidenceNeed?.reason,'source_ambiguity');assert.equal(r.withheldRisks?.reason,'item_status_adjusted');
 }
});
