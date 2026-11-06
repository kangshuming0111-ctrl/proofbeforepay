import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import type {ProofBusinessCheckStep,ProofCriterion,ProofQuote} from "../lib/contracts.ts";
import {createMenuDomSourceBusinessFactCheckV2} from "../lib/menu-dom-source-v2.ts";
import {createIndependentSourceBusinessFactCheck} from "../lib/source-business-evidence.ts";
import {createAssessmentSourceFindingCheck,sourceFindingVersionForPublication} from "../lib/assessment-source-findings.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {resolveAssessmentScopeContext} from "../lib/scope-clarifications.ts";

const criterion:ProofCriterion={id:"coverage-1",title:"Locked menu prices",source:"菜单的牛肉面标价必须为AUD18。"};
const step:ProofBusinessCheckStep={criterionId:criterion.id,checkId:"business-1",stepId:"business:375:business-1",viewportWidth:375,file:"menu.html",source:{start:0,end:criterion.source.length,excerpt:criterion.source},expected:{kind:"item_price",label:"牛肉面",currency:"AUD",amountMinor:1800}};
const html=(body:string)=>`<!doctype html><html><head><title>Menu</title></head><body>${body}</body></html>`;
const facts=(body:string)=>{const files={"menu.html":html(body)};return{files,v1:createIndependentSourceBusinessFactCheck(files,[step])(criterion.id),v2:createMenuDomSourceBusinessFactCheckV2(files,[step])(criterion.id)};};
const card=(label="牛肉面",price="AUD18")=>`<div class="card menu-item featured"><h3><strong>${label}</strong></h3><p class="price"><span>${price}</span></p></div>`;

test("v2 witnesses finite inline and card owners without changing old v1 results",()=>{
 for(const body of["<p><strong>牛肉面</strong> <span>AUD18</span></p>","<li><span>牛肉面</span> <strong>AUD18.00</strong></li>",`<div class="menu-grid">${card()}</div>`]){
  const{files,v1,v2}=facts(body);assert.equal(v1.kind,"unknown");assert.equal(v2.kind,"unchanged");assert.notEqual(v2.kind,"not_applicable");
  const cite=v2.checks[0].citation!;assert.ok(cite);assert.equal(cite.excerpt,files[cite.file as keyof typeof files].slice(cite.start,cite.end));assert.ok(cite.excerpt.startsWith("<p")||cite.excerpt.startsWith("<li")||cite.excerpt.startsWith('<div class="card menu-item'));
 }
 for(const body of["<p>牛肉面 AUD18</p>","<p>牛肉面 AUD28</p>","<table><tr><td>牛肉面</td><td>AUD18</td></tr></table>"]){const{v1,v2}=facts(body);assert.deepEqual(v2,v1);}
});

test("wrong neighboring prices cannot replace the exact same-card value",()=>{
 const{v2}=facts(card("牛肉面","AUD28")+card("茶","AUD18"));assert.equal(v2.kind,"mismatch");assert.notEqual(v2.kind,"not_applicable");assert.equal(v2.checks[0].actual,"AUD 28.00");assert.equal(v2.checks[0].citation!.excerpt,card("牛肉面","AUD28"));
 const split=['<div class="menu-item"><h3>牛肉面</h3></div><div class="menu-item"><h3>茶</h3><p class="price">AUD18</p></div>', '<div class="menu-item"><h3>茶</h3><p class="price"><span>牛肉面</span> <span>AUD18</span></p></div>', `<div class="menu-item"><h3>牛肉面</h3>${card("茶")}</div>`];
 for(const body of split)assert.equal(facts(body).v2.kind,"unknown");
});

test("new ownership never excuses duplicate labels, hidden or dynamic ancestors",()=>{
 const inline="<p><span>牛肉面</span> <strong>AUD18</strong></p>",changes=[
  (s:string)=>s+s,(s:string)=>`<div hidden>${s}</div>`,(s:string)=>`<div inert>${s}</div>`,(s:string)=>`<div aria-hidden="true">${s}</div>`,(s:string)=>`<div style="display:none">${s}</div>`,(s:string)=>`<div popover>${s}</div>`,(s:string)=>`<div class="menu-grid hidden">${s}</div>`,(s:string)=>`<details>${s}</details>`,(s:string)=>`<dialog>${s}</dialog>`,(s:string)=>`<svg><foreignObject>${s}</foreignObject></svg>`,(s:string)=>s+'<script>render()</script>',(s:string)=>s.replace('<p>','<p onclick="render()">'),(s:string)=>s.replace('<span>','<span data-bind="name">')
 ];
 for(const change of changes)assert.equal(facts(change(inline)).v2.kind,"unknown");
 for(const body of[card()+card(),card().replace('card menu-item featured','menu-item hidden'),card().replace('class="price"','class="price d-none"'),card().replace('menu-item','menu-itemhidden')])assert.equal(facts(body).v2.kind,"unknown");
});

test("closed owners, source budgets and exact fields fail closed instead of filling gaps",()=>{
 const bodies=["<p><span>牛肉面</span><!-- unknown gap --> <span>AUD18</span></p>","<p><span>牛肉面</span><em>AUD18</em></p>",'<div class="menu-item"><h3>牛肉面</h3><p class="price">AUD18 each</p></div>',card().replace('</h3>',''),card().replace('<span>','<span title="'+"x".repeat(501)+'">'),'<li><p><span>牛肉面</span> <span>AUD18</span></p></li>'];
 for(const body of bodies)assert.equal(facts(body).v2.kind,"unknown");
 const wrongFile=createMenuDomSourceBusinessFactCheckV2({"other.html":html(card())},[step])(criterion.id);assert.equal(wrongFile.kind,"unknown");
 const title='<p title="'+"x".repeat(501)+'"><span>牛肉面</span> <span>AUD18</span></p>';assert.equal(facts(title).v2.kind,"unknown");
});

test("explicit v2 facts use complete locked-file coverage and v1 retains its exact policy",()=>{
 const files={"menu.html":html(card()),"unrelated.html":html("<p>Unrelated source</p>")},coverage={includedFiles:Object.keys(files),omittedFiles:[],truncatedFiles:[]};
 assert.equal(sourceFindingVersionForPublication(),"source-finding-v1");assert.equal(sourceFindingVersionForPublication("source-publication-v2"),"source-finding-v2");assert.throws(()=>sourceFindingVersionForPublication("future"as never));
 const input={files,coverage,language:"zh"as const,businessSteps:[step]},v1=createAssessmentSourceFindingCheck(input)(criterion)!,v2=createAssessmentSourceFindingCheck({...input,version:"source-finding-v2"})(criterion)!;
 assert.equal(v1.version,"source-finding-v1");assert.equal(v1.status,"insufficient_evidence");assert.equal(v2.version,"source-finding-v2");assert.equal(v2.status,"supported");
 for(const changed of[{...coverage,truncatedFiles:["menu.html"]},{...coverage,omittedFiles:["menu.html"]},{...coverage,includedFiles:["unrelated.html"]}])assert.equal(createAssessmentSourceFindingCheck({...input,coverage:changed,version:"source-finding-v2"})(criterion)!.status,"insufficient_evidence");
 assert.equal(createAssessmentSourceFindingCheck({...input,coverage:{...coverage,omittedFiles:["unrelated.html"]},version:"source-finding-v2"})(criterion)!.status,"supported","Unrelated files cannot invent new buyer obligations.");
});

test("known saved v1 facts remain exact while v2 is an explicit new report projection",async()=>{
 const saved=JSON.parse(await readFile(new URL("./fixtures/noodle-v90-positive-export.json",import.meta.url),"utf8")).core;
 const q={id:saved.project.id,language:saved.project.language,summary:saved.project.summary,workflow:"proof-v1",status:"approved",aiMode:"demo",paymentMode:"demo",proof:{demoRoleplay:true,project:saved.project.spec,criteria:saved.project.criteria,delivery:saved.delivery,scopeClarifications:saved.project.scopeClarifications,paymentState:"unfunded",audit:[],collaboration:{stage:"submitted",feedback:[]}}}as unknown as ProofQuote;
 const scope=await resolveAssessmentScopeContext(q,saved.delivery.assessment),input={files:saved.delivery.files,coverage:saved.delivery.assessment.coverage,language:q.language,businessSteps:getBusinessCheckPlan(q),scope};
 const defaultCheck=createAssessmentSourceFindingCheck(input),v1=createAssessmentSourceFindingCheck({...input,version:"source-finding-v1"}),v2=createAssessmentSourceFindingCheck({...input,version:"source-finding-v2"});
 for(const c of q.proof.criteria){const old=saved.delivery.assessment.items.find((i:any)=>i.criterionId===c.id)?.sourceFinding;assert.deepEqual(defaultCheck(c),old);assert.deepEqual(v1(c),old);const next=v2(c);if(next){assert.equal(next.version,"source-finding-v2");assert.deepEqual({...next,version:"source-finding-v1"},old);}}
});
