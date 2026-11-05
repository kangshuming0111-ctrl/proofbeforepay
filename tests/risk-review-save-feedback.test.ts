import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import type {ProofRiskReview} from "../lib/contracts.ts";
import type {RiskReviewInput} from "../lib/risk-reviews.ts";
const source=await readFile(new URL("../app/components/RiskReviewPanel.tsx",import.meta.url),"utf8");
const a=source.indexOf("onSubmit={async e=>"),b=source.indexOf("}><label>",a);
assert.ok(a>=0&&b>a&&b-a<1500);
const submit=source.slice(a+"onSubmit={".length,b);
const submitHandler=(deps:Record<string,unknown>)=>new Function("deps",`const {busy,saving,onSave,deliveryId,assessmentId,riskIndex,riskOrigin,decision,reason,tr,setError,setSaving,setReason}=deps;return ${submit};`)(deps);
async function componentModule(){
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-risk-review-")),require=createRequire(import.meta.url);
 let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 output=output.replace("import '../risk-reviews.css';","");
 for(const name of["react","react/jsx-runtime"])output=output.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href)).replaceAll("'"+name+"'",JSON.stringify(pathToFileURL(require.resolve(name)).href));
 const file=path.join(dir,"risk.mjs");await writeFile(file,output);const loaded=await import(pathToFileURL(file).href);
 return{Component:loaded.RiskReviewPanel,cleanup:()=>rm(dir,{recursive:true,force:true})};
}
test("actual bilingual review submit preserves the published input shape and withheld origin through an uncertain save and retry",async()=>{
 for(const language of["zh","en"])for(const riskOrigin of[undefined,"withheld"] as const)for(const outcome of["false","throw","true"]){
  let reason="Fictional source reproduction.",error="",saving=false,calls=0;const inputs:RiskReviewInput[]=[];
  const handler=submitHandler({busy:false,saving:false,deliveryId:"v1",assessmentId:"a1",riskIndex:0,riskOrigin,decision:"needs_evidence",reason,
   tr:(zh:string,en:string)=>language==="zh"?zh:en,setError:(v:string)=>error=v,setSaving:(v:boolean)=>saving=v,setReason:(fn:(value:string)=>string)=>reason=fn(reason),
   onSave:async(input:RiskReviewInput)=>{calls++;inputs.push(input);if(calls===1&&outcome==="throw")throw Error("connection lost after possible commit");return calls>1||outcome==="true";}});
  await handler({preventDefault(){}});assert.equal(calls,1);assert.equal(saving,false);
  const expected={deliveryId:"v1",assessmentId:"a1",riskIndex:0,...(riskOrigin?{riskOrigin}:{}),decision:"needs_evidence",reason:"Fictional source reproduction."};
  assert.deepEqual(inputs[0],expected);assert.equal(Object.hasOwn(inputs[0],"riskOrigin"),riskOrigin==="withheld");
  if(outcome==="true"){assert.equal(reason,"");assert.equal(error,"");}
  else{assert.equal(reason,"Fictional source reproduction.");assert.match(error,language==="zh"?/尚未确认保存.*刷新核对后再决定是否重试/u:/Saving has not been confirmed.*Refresh to check.*before deciding whether to retry/u);assert.ok(!error.includes("Not saved"));
   await handler({preventDefault(){}});assert.equal(calls,2);assert.deepEqual(inputs[1],expected);assert.equal(reason,"");assert.equal(error,"");}
 }
});
test("the actual submit handler does not save a published or withheld opinion while busy or already saving",async()=>{
 for(const riskOrigin of[undefined,"withheld"] as const)for(const state of[{busy:true,saving:false},{busy:false,saving:true}]){
  let calls=0;const handler=submitHandler({...state,riskOrigin,onSave:async()=>{calls++;return true;},setError:()=>assert.fail("must not mutate"),setSaving:()=>assert.fail("must not mutate")});
  await handler({preventDefault(){}});assert.equal(calls,0);
 }
});
test("rendered bilingual human review preserves existing published wording and readonly and busy boundaries",async()=>{
 const {Component,cleanup}=await componentModule();try{
  for(const language of["zh","en"]){const props={deliveryId:"v1",assessmentId:"a1",riskIndex:0,language,onSave:async()=>true};
   const normal=renderToStaticMarkup(createElement(Component,props));assert.match(normal,/risk-review-form/u);assert.match(normal,language==="zh"?/此记录不代表验收或付款/u:/This record is not acceptance or payment/u);
   assert.match(normal,/data-risk-origin="published"/u);assert.ok(!normal.includes("Human opinion: issue confirmed"));
   assert.ok(!renderToStaticMarkup(createElement(Component,{...props,readOnly:true})).includes("risk-review-form"));
   const busy=renderToStaticMarkup(createElement(Component,{...props,busy:true}));assert.match(busy,/<select disabled=""/u);assert.match(busy,/<textarea[^>]*disabled=""/u);assert.match(busy,/<button[^>]*disabled=""/u);
  }
 }finally{await cleanup();}
});
test("published and withheld index zero have separate history and withheld opinions cannot release the gate",async()=>{
 const {Component,cleanup}=await componentModule();try{
  const base={deliveryId:"v1",assessmentId:"a1",riskIndex:0,decision:"confirmed" as const,actorRole:"buyer" as const,reviewedAt:"2026-11-06T00:00:00Z"};
  const reviews:ProofRiskReview[]=[{...base,id:"pub",reason:"PUBLISHED ONLY"},{...base,id:"withheld",riskOrigin:"withheld",reason:"WITHHELD ONLY <script>neverExecute()</script>"},{...base,id:"other-index",riskIndex:3,riskOrigin:"withheld",reason:"OTHER INDEX"},{...base,id:"other-assessment",assessmentId:"a2",riskOrigin:"withheld",reason:"OTHER ASSESSMENT"},{...base,id:"other-delivery",deliveryId:"v2",riskOrigin:"withheld",reason:"OTHER DELIVERY"}];
  const before=structuredClone(reviews);
  for(const language of["zh","en"]){
   const props={deliveryId:"v1",assessmentId:"a1",riskIndex:0,reviews,language,onSave:async()=>true};
   const published=renderToStaticMarkup(createElement(Component,props));assert.ok(published.includes("PUBLISHED ONLY"));assert.ok(!published.includes("WITHHELD ONLY"));
   for(const readOnly of[false,true]){const html=renderToStaticMarkup(createElement(Component,{...props,riskOrigin:"withheld",readOnly}));
    assert.match(html,/data-risk-origin="withheld"/u);assert.ok(html.includes("WITHHELD ONLY &lt;script&gt;neverExecute()&lt;/script&gt;"));assert.ok(!html.includes("PUBLISHED ONLY"));
    for(const absent of["OTHER INDEX","OTHER ASSESSMENT","OTHER DELIVERY","<script>neverExecute()"])assert.ok(!html.includes(absent));
    assert.match(html,language==="zh"?/不会解除暂缓、更改 AI 逐项结论、验收或付款/u:/does not release withheld indications, change AI item findings, accept work or make a payment/u);
    assert.match(html,language==="zh"?/人工意见：问题已核实/u:/Human opinion: issue confirmed/u);
    assert.equal(html.includes('class="risk-review-form'),!readOnly);assert.ok(!html.includes('risk-repair-draft'));
   }
   const noSave=renderToStaticMarkup(createElement(Component,{...props,riskOrigin:"withheld",onSave:undefined}));assert.ok(!noSave.includes('class="risk-review-form'));
   const busy=renderToStaticMarkup(createElement(Component,{...props,riskOrigin:"withheld",busy:true}));assert.match(busy,/<select disabled=""/u);assert.match(busy,/<textarea[^>]*disabled=""/u);
  }
  assert.deepEqual(reviews,before);
 }finally{await cleanup();}
});
