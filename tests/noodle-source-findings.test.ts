import assert from "node:assert/strict";
import test from "node:test";
import {createAssessmentSourceFindingCheck,type SourceFindingScope} from "../lib/assessment-source-findings.ts";
import {parseSourceLiteralDirective} from "../lib/source-literal-directive.ts";
import {assessmentEvidenceScope} from "../lib/assessment-evidence-scope.ts";
import type {ProofBusinessCheckStep,ProofCriterion} from "../lib/contracts.ts";
const html=(body:string)=>`<!doctype html><html><head><title>Authored shop</title></head><body>${body}</body></html>`;
const labels=(source='Contact form source content must label "Name" and "Email".'):ProofCriterion=>({id:"manual-1",title:"Declared source labels",source});
const coverage=(files:Record<string,string>)=>({includedFiles:Object.keys(files),omittedFiles:[] as string[],truncatedFiles:[] as string[]});
const checks=(label="Vegetable soup"):ProofBusinessCheckStep[]=>[{stepId:"business-1-375",checkId:"business-1",criterionId:"coverage-1",file:"menu.html",source:{start:0,end:1,excerpt:"x"},expected:{kind:"item_price",label,amountMinor:2100,currency:"AUD"},viewportWidth:375}];
const price:ProofCriterion={id:"coverage-1",title:"Price content",source:"The menu price for Vegetable soup must be AUD21."};
function finding(files:Record<string,string>,criterion=labels(),steps:ProofBusinessCheckStep[]=[],scope?:SourceFindingScope){return createAssessmentSourceFindingCheck({files,coverage:coverage(files),language:"en",businessSteps:steps,scope})(criterion)!;}
const form='<form id="contact"><label>Name<input name="name"></label><label>Email<input name="email"></label></form>';
function bound(file="contact.html",formId="contact",status:"pending"|"confirmed"|"unavailable"="confirmed"):SourceFindingScope{return{states:[{criterionId:"manual-1",status}],bindings:status==="confirmed"?[{proposalId:"scope-1",proposalDigest:"a".repeat(64),criterionId:"manual-1",criterionSource:labels().source,file,kind:"form",formId}]:[]};}

test("atomic Chinese label grammar admits literal data but never a second runtime duty",()=>{
 for(const source of ['联系表单源码必须包含标签“姓名”和“邮箱”。','联系页面源码须包含标签"Send payment"和"Visible".']){
  assert.equal(parseSourceLiteralDirective(source)?.kind,"html_labels");
  assert.equal(assessmentEvidenceScope({id:"manual-1",title:"人工要求 1",source}).category,"source_text");
 }
 for(const source of ['联系表单源码必须包含标签“姓名”提交后保存。联系表单源码必须包含标签“邮箱”','提交后保存联系表单源码必须包含标签“邮箱”。','自动发送联系表单源码必须包含标签“姓名”。']){
  assert.equal(parseSourceLiteralDirective(source),undefined);assert.equal(assessmentEvidenceScope({id:"manual-1",title:"人工要求 1",source}).category,"requires_observation");
 }
 for(const tail of ['提交后保存。','并且发送邮件。','; Persist orders.','\n保存结果']){
  const source='联系表单源码必须包含标签“姓名”和“邮箱”。'+tail;
  assert.equal(parseSourceLiteralDirective(source),undefined);
  assert.equal(assessmentEvidenceScope({id:"manual-1",title:"人工要求 1",source}).category,"requires_observation");
 }
});

test("independent source labels use complete actual owner and preserve exact spans without model citations",()=>{
 const files={"contact.html":html(form),"index.html":html('<p>Home</p>')};
 const result=finding(files);assert.equal(result.status,"supported");assert.equal(result.basis,"declared_html_labels");
 assert.equal(result.citations.length,2);for(const c of result.citations)assert.equal(files[c.file as keyof typeof files].slice(c.start,c.end),c.excerpt);
 assert.equal(result.scopeBinding,undefined);assert.match(result.explanation,/identity remains unconfirmed/u);
 const scoped=finding(files,labels(),[],bound());assert.equal(scoped.status,"supported");assert.equal(scoped.scopeBinding!.file,"contact.html");
 assert.equal(scoped.scopeBinding!.formId,"contact");
});

test("cross-page, cross-form and confirmed wrong page cannot combine borrowed labels",()=>{
 assert.equal(finding({"one.html":html('<label>Name</label>'),"two.html":html('<label>Email</label>')},labels('Contact source labels must include "Name" and "Email".')).status,"changes_suggested");
 assert.equal(finding({"contact.html":html('<form><label>Name</label></form><form><label>Email</label></form>')}).status,"changes_suggested");
 const files={"contact.html":html('<form id="contact"><label>Name</label></form>'),"index.html":html(form)};
 const result=finding(files,labels(),[],bound());assert.equal(result.status,"changes_suggested");assert.deepEqual(result.files,["contact.html"]);
 assert.equal(result.citations.some(c=>c.file==="index.html"),false);
 assert.equal(finding(files,labels(),[],bound("index.html")).status,"supported");
});

test("pending, unavailable, conflicting and unresolvable scope has no independent pass",()=>{
 const files={"contact.html":html(form)};
 for(const state of ["pending","unavailable"] as const)assert.equal(finding(files,labels(),[],bound("contact.html","contact",state)).status,"insufficient_evidence");
 assert.equal(finding(files,labels(),[],bound("contact.html","missing")).status,"insufficient_evidence");
 const twice={"contact.html":html(form+form)};assert.equal(finding(twice,labels(),[],bound()).status,"insufficient_evidence");
});

test("inert decoys cannot satisfy labels and unresolved implicit form owners cannot prove absence",()=>{
 for(const decoy of ['<template><label>Email</label></template>','<!-- <label>Email</label> -->','<script>"<label>Email</label>"</script>']){
  assert.equal(finding({"contact.html":html('<form><label>Name</label>'+decoy+'</form>')}).status,"changes_suggested");
 }
 for(const body of ['<form id="f"></form><label>Name<input form="f"></label><label>Email<input form="f"></label>','<form id="f"><label>Name<input form="other"></label><label>Email<input></label></form><form id="other"></form>'])assert.equal(finding({"contact.html":html(body)}).status,"insufficient_evidence");
 const files={"contact.html":html(form)};
 assert.equal(createAssessmentSourceFindingCheck({files,coverage:{...coverage(files),truncatedFiles:["contact.html"]},language:"en",businessSteps:[]})(labels())!.status,"insufficient_evidence");
});

test("same locked price permits decimal equivalence and text-only two-cell table relationships",()=>{
 for(const body of ['<p>Vegetable soup AUD21</p>','<p>Vegetable soup AUD 21.00</p>','<table><tr><th>Vegetable soup</th><td>AUD21.0</td></tr></table>']){
  const result=finding({"menu.html":html(body)},price,checks());assert.equal(result.status,"supported",body);
  assert.equal(result.citations.length,1);assert.match(result.explanation,/minor-unit amount/u);
 }
});

test("wrong dish, wrong page, duplicate or ambiguous price cannot borrow a matching number",()=>{
 assert.equal(finding({"menu.html":html('<p>Vegetable soup AUD31</p><p>Tomato soup AUD21</p>')},price,checks()).status,"changes_suggested");
 assert.equal(finding({"menu.html":html('<p>Vegetable soup AUD31</p>'),"index.html":html('<p>Vegetable soup AUD21</p>')},price,checks()).status,"changes_suggested");
 for(const body of ['<p>Vegetable soup AUD21</p><p>Vegetable soup AUD31</p>','<p>Vegetable soup with rice AUD21</p>','<p>Vegetable soup $21</p>'])assert.equal(finding({"menu.html":html(body)},price,checks()).status,"insufficient_evidence",body);
});

test("source presence and agreed mapping cannot prove actual saving or persistence",()=>{
 const runtime={...price,source:"The menu price is AUD21 and orders must be saved after restart."};
 const result=finding({"menu.html":html('<p>Vegetable soup AUD21</p>')},runtime,checks());assert.equal(result.status,"insufficient_evidence");assert.equal(result.citations.length,0);
 assert.equal(finding({"menu.html":html('<p>Vegetable soup AUD21</p>')},price,checks(),{states:[{criterionId:price.id,status:"pending"}],bindings:[]}).status,"insufficient_evidence");
});

test("independent price facts ignore only inert template decoys, retaining exact active source and strict legacy guard",async()=>{
 const {createSourceBusinessEvidenceCheck}=await import("../lib/source-business-evidence.ts");
 for(const amount of ["21","31"]){
  const files={"menu.html":html(`<p>Vegetable soup AUD${amount}</p><template><p>Vegetable soup AUD21</p></template>`)};
  const result=finding(files,price,checks());assert.equal(result.status,amount==="21"?"supported":"changes_suggested");
  assert.equal(result.citations[0].excerpt,`<p>Vegetable soup AUD${amount}</p>`);
  assert.equal(createSourceBusinessEvidenceCheck(files,checks())(price.id).kind,"unknown");
 }
 for(const body of [
  '<p>Vegetable soup AUD31</p><template shadowrootmode="open"><p>Vegetable soup AUD21</p></template>',
  '<p>Vegetable soup AUD31</p><template><p>Vegetable soup AUD21</p></template><script>document.querySelector("template").content.cloneNode(true)</script>',
  '<p onclick="activate()">Vegetable soup AUD31</p><template><p>Vegetable soup AUD21</p></template>',
  '<p>Vegetable soup AUD31</p><p>Vegetable soup AUD21</p><template><p>Other AUD21</p></template>',
  '<p data-x="x" data-x="y">Vegetable soup AUD31</p><template><p>Vegetable soup AUD21</p></template>',
  '<p>Vegetable soup AUD31</p><template><p>Other AUD21</p></template><style>p::after{content:"AUD21"}</style>',
 ])assert.equal(finding({"menu.html":html(body)},price,checks()).status,"insufficient_evidence",body);
});

test("explicit Chinese durable capability names the correct evidence without borrowing another criterion",()=>{
 for(const source of ['提交结果必须持久保存。','并在重新启动后可独立回读。','记录重启之后必须回读。']){
  const rule={id:"coverage-1",title:"原始要求",source};assert.deepEqual(assessmentEvidenceScope(rule),{category:"requires_observation",reason:"durable_record"});
 }
 assert.equal(assessmentEvidenceScope({id:"coverage-1",title:"Notice",source:'页面文案必须逐字包含“持久保存并在重启后可独立回读”。'}).category,"source_text");
});
