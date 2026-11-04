import assert from "node:assert/strict";
import test from "node:test";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {DomainError} from "../lib/domain.ts";
import {ProviderError,type Fetcher} from "../lib/providers.ts";
import {assertStaticPath,STATIC_RESOURCE_LIMITS} from "../lib/static-resources.ts";
import {caseQuote,runEvaluation,type EvaluationCase} from "../scripts/run-assessment-evaluation.ts";

const env={DEEPSEEK_API_KEY:"synthetic-path-test",DEEPSEEK_MODEL:"deepseek-flash"};
const excerpt="<p>Visitor address: 47 Elm Parade, Carlton VIC 3053.</p>";
const contents=`<!doctype html><html><head><title>Visitor information</title></head><body>🌿${excerpt}</body></html>`;
const home="<!doctype html><html><head><title>Lantern Studio</title></head><body><h1>Lantern Studio</h1><p>See the visitor information page.</p></body></html>";
function pathOfLength(length:number){const prefix=`${"a".repeat(60)}/${"b".repeat(40)}/`;return`${prefix}${"v".repeat(length-prefix.length-5)}.html`;}
function fixture(file:string):EvaluationCase{return{id:"citation-path",category:"source-path-contract",language:"en",criterion:{id:"manual-1",title:"Published visitor address",source:"The page copy must publish the visitor address 47 Elm Parade, Carlton VIC 3053."},files:{"index.html":home,[file]:contents,"theme.css":"body{font:16px system-ui}"},evaluationStratum:"complete-literal",reference:{expectedStatus:"supported",rationale:"Private scorer: exact visitor address occurs on the supplied page.",requiresHumanSemanticReview:true}};}
function response(file:string){return{items:[{criterionId:"manual-1",status:"supported",explanation:"The supplied visitor page states the required address.",citations:[{file,excerpt}]}],risks:[{title:"Optional source-copy review",explanation:"The source contains the visitor address; no rendered or runtime claim is made.",suggestion:"A person can inspect this exact address copy against the agreement.",citations:[{file,excerpt}]}],limitations:["Controlled source fixture; no actual browser, backend or payment was checked."]};}
function controlled(output:unknown){let calls=0;const fetcher:Fetcher=async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:1000,completion_tokens:100,total_tokens:1100}}),{headers:{"Content-Type":"application/json"}});};return{fetcher,get calls(){return calls;}};}

test("legal 120/121/132/160-character paths retain exact item and risk citations without altering the quote",async()=>{
 assert.equal(STATIC_RESOURCE_LIMITS.maxPathLength,160);
 for(const length of [120,121,132,160]){
  const file=pathOfLength(length);assert.equal(file.length,length);assert.equal(assertStaticPath(file),file);
  const q=caseQuote(fixture(file)),before=structuredClone(q),fake=controlled(response(file)),report=await assessDelivery(q,env,fake.fetcher);
  assert.equal(fake.calls,1);assert.equal(report.items[0].status,"supported");
  for(const citation of [report.items[0].citations[0],report.risks[0].citations[0]]){
   assert.equal(citation.file,file);assert.equal(citation.start,contents.indexOf(excerpt));assert.equal(citation.end,citation.start+excerpt.length);assert.equal(contents.slice(citation.start,citation.end),excerpt);
  }
  assert.deepEqual(q,before);assert.equal(q.proof.paymentState,"unfunded");assert.equal(q.proof.acceptedDeliveryId,undefined);
 }
});

test("raw single-case scoring shares the valid upload path contract instead of labelling long exact citations invalid",async()=>{
 for(const length of [120,121,132,160]){
  const file=pathOfLength(length),input=fixture(file),before=structuredClone(input),fake=controlled(response(file));
  const report=await runEvaluation([input],{live:true,maxCalls:1,maxUsd:.1,env,fetcher:fake.fetcher}),result=report.results[0];
  assert.equal(fake.calls,1);assert.equal(result.raw?.citationValidity,"valid");assert.equal(result.raw?.citations[0].file,file);assert.equal(result.application?.status,"supported");assert.equal(result.application?.citations[0].file,file);assert.deepEqual(input,before);
 }
});

test("invalid delivery paths are rejected before a provider request, with no quote side effects",async()=>{
 for(const file of [pathOfLength(161),`${"x".repeat(65)}/terms.html`,"../terms.html"]){
  assert.throws(()=>assertStaticPath(file),DomainError);
  const q=caseQuote(fixture("terms.html"));q.proof.delivery!.files![file]=contents;
  const before=structuredClone(q),fake=controlled(response("terms.html"));
  await assert.rejects(()=>assessDelivery(q,env,fake.fetcher),DomainError);assert.equal(fake.calls,0);assert.deepEqual(q,before);
 }
});

test("long-path support cannot admit oversized, noncanonical, unsent or invented item/risk citations",async()=>{
 const file=pathOfLength(160);
 const mutations=[
  (c:{file:string;excerpt:string})=>{c.file=pathOfLength(161);},
  (c:{file:string;excerpt:string})=>{c.file=`${"x".repeat(65)}/terms.html`;},
  (c:{file:string;excerpt:string})=>{c.file="../terms.html";},
  (c:{file:string;excerpt:string})=>{c.file="not-delivered.html";},
  (c:{file:string;excerpt:string})=>{c.excerpt="<p>Visitor address: 99 Invented Street.</p>";},
 ];
 for(const target of ["item","risk"]as const)for(const mutate of mutations){
  const q=caseQuote(fixture(file)),before=structuredClone(q),output=response(file);mutate(target==="item"?output.items[0].citations[0]:output.risks[0].citations[0]);
  const fake=controlled(output);await assert.rejects(()=>assessDelivery(q,env,fake.fetcher),ProviderError);assert.equal(fake.calls,1);assert.deepEqual(q,before);
 }
});
