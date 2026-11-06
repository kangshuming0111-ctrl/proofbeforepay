import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createSourcePublicationCheck,type SourcePublicationCandidate,type SourcePublicationInputs} from "../lib/assessment-source-publication.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {resolveScopeClarifications} from "../lib/scope-clarifications.ts";
import type {ProofCriterion} from "../lib/contracts.ts";
const fixture=JSON.parse(await readFile(new URL('./fixtures/noodle-f1-first-four-replay.json',import.meta.url),'utf8'));
async function scenario(id='f1-sealed-wrong-object'){
 const entry=fixture.cases.find((c:any)=>c.id===id),q=structuredClone(entry.quote),criterionId=id==='f1-sealed-wrong-object'?'coverage-1':'coverage-2';
 const item=entry.originalApplication.items.find((i:any)=>i.criterionId===criterionId);
 const input:SourcePublicationInputs={files:q.proof.delivery.files,coverage:entry.originalApplication.coverage,language:q.language,businessSteps:getBusinessCheckPlan(q),scope:await resolveScopeClarifications(q),ruleEvidence:q.proof.delivery.evidence};
 const candidate:SourcePublicationCandidate={rawStatus:item.modelJudgment.status,rawCitations:item.modelJudgment.citations,guardedStatus:'insufficient_evidence',guardReason:id==='f1-sealed-wrong-object'?'locked_price_mismatch':'confirmed_form_label_absence'};
 return{input,candidate,criterion:q.proof.criteria.find((c:ProofCriterion)=>c.id===criterionId)as ProofCriterion};
}
const cite=(file:string,source:string,excerpt=source)=>{const start=source.indexOf(excerpt);return{file,start,end:start+excerpt.length,excerpt};};

test("only the reproduced rawchanges/guardunknown source negatives yield full canonical source publication",async()=>{
 for(const id of ['f1-sealed-wrong-object','f1-sealed-wrong-page']){
  const{input,candidate,criterion}=await scenario(id),before=structuredClone({input,candidate,criterion});
  const result=createSourcePublicationCheck(input)(criterion,candidate)!;assert.ok(result);assert.equal(result.status,'changes_suggested');
  assert.equal(result.explanation,result.sourceFinding.explanation);assert.deepEqual(result.citations,result.sourceFinding.citations);assert.ok(result.citations.length>0&&result.citations.length<=6);
  assert.deepEqual({input,candidate,criterion},before);
 }
});

test("rawunknown/supported, no actual guard, empty/invalid original citations and rule failure cannot be restored",async()=>{
 const{input,candidate,criterion}=await scenario();const check=createSourcePublicationCheck(input);
 for(const patch of [{rawStatus:'insufficient_evidence'},{rawStatus:'supported'},{guardedStatus:'changes_suggested'},{guardReason:undefined},{guardReason:'confirmed_form_label_absence'},{rawCitations:[]},{rawCitations:[{file:'missing.html',start:0,end:1,excerpt:'x'}]}])assert.equal(check(criterion,{...candidate,...patch}as SourcePublicationCandidate),undefined);
 assert.equal(createSourcePublicationCheck({...input,ruleEvidence:[...input.ruleEvidence,{criterionId:criterion.id,finding:'fail'}]})(criterion,candidate),undefined);
 assert.equal(check({...criterion,source:criterion.source+' 提交后必须持久保存。'},candidate),undefined);
 for(const coverage of [{...input.coverage,truncatedFiles:['menu.html']},{...input.coverage,omittedFiles:['menu.html']},{...input.coverage,includedFiles:input.coverage.includedFiles.filter(f=>f!=='menu.html')}])assert.equal(createSourcePublicationCheck({...input,coverage})(criterion,candidate),undefined);
});

test("price restoration never relaxes script/shadowroot/generatedCSS/badparse/ambiguous active subject uncertainty",async()=>{
 const{input,candidate,criterion}=await scenario(),original=input.files['menu.html'];
 const sources=[original.replace('</body>','<script>activate()</script></body>'),original.replace('<template>','<template shadowrootmode="open">'),original.replace('<p>牛肉面','<p onclick="activate()">牛肉面'),original.replace('</body>','<style>p::after{content:"AUD18"}</style></body>'),original.replace('<p>牛肉面','<p data-x="1" data-x="2">牛肉面'),original.replace('</body>','<p>牛肉面 AUD18</p></body>')];
 for(const source of sources){const files={...input.files,'menu.html':source},rawCitations=[cite('menu.html',source)];assert.equal(createSourcePublicationCheck({...input,files})(criterion,{...candidate,rawCitations}),undefined);}
 const ordinary=original.replace(/<template>[\s\S]*?<\/template>/u,'');assert.equal(createSourcePublicationCheck({...input,files:{...input.files,'menu.html':ordinary}})(criterion,{...candidate,rawCitations:[cite('menu.html',ordinary)]}),undefined,'Without template the legacy guard is not the reproduced unknown branch.');
});

test("FORM restoration requires exact current bilateral form scope and real global source-disagrees premise",async()=>{
 const{input,candidate,criterion}=await scenario('f1-sealed-wrong-page');
 for(const scope of [undefined,{states:[{criterionId:criterion.id,status:'pending' as const}],bindings:[]},{states:[{criterionId:criterion.id,status:'unavailable' as const}],bindings:[]}])assert.equal(createSourcePublicationCheck({...input,scope})(criterion,candidate),undefined);
 const pageScope=structuredClone(input.scope!);pageScope.bindings=pageScope.bindings.map(b=>{const changed={...b,kind:'page' as const};delete changed.formId;return changed;});assert.equal(createSourcePublicationCheck({...input,scope:pageScope})(criterion,candidate),undefined);
 assert.equal(createSourcePublicationCheck(input)({...criterion,source:'联系页面源码必须包含标签“姓名”和“邮箱”。'},candidate),undefined);
 const files:Record<string,string>={...input.files,'index.html':input.files['index.html'].replace('<label>邮箱<input></label>','')};assert.equal(createSourcePublicationCheck({...input,files})(criterion,{...candidate,rawCitations:[cite('contact.html',files['contact.html'])]}),undefined,'If no complete group exists anywhere, the old negative checker did not source-disagree and no restoration marker applies.');
});

test("a complete seven-citation price fact is not silently sliced to the six-citation publication budget",async()=>{
 const{input,candidate,criterion}=await scenario();
 const body=Array.from({length:7},(_,i)=>`<p>Item${i+1} AUD28</p>`).join(''),source=`<!doctype html><html><head><title>T</title></head><body>${body}<template><p>Item1 AUD18</p></template></body></html>`;
 const first=input.businessSteps[0],steps=Array.from({length:7},(_,i)=>({...first,checkId:`business-${i+1}`,stepId:`business-${i+1}-375`,expected:{kind:'item_price' as const,label:`Item${i+1}`,currency:'AUD' as const,amountMinor:1800}}));
 assert.equal(createSourcePublicationCheck({...input,files:{...input.files,'menu.html':source},businessSteps:steps})(criterion,{...candidate,rawCitations:[cite('menu.html',source)]}),undefined);
});
