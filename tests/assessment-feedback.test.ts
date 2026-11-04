import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import type {Language,ProofAssessment,ProofAssessmentItem,ProofCriterion} from "../lib/contracts.ts";
import {ASSESSMENT_FEEDBACK_MAX_UTF16,assessmentCriterionSource,buildAssessmentFeedbackDraft} from "../app/components/assessment-feedback.ts";
const root=path.resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
const criterion:ProofCriterion={id:"refund",title:"Refund handling",source:"Cancellation within 24 hours must refund the original card and preserve the refund record."};
const item:ProofAssessmentItem={criterionId:criterion.id,status:"insufficient_evidence",explanation:"Source-only review cannot establish the actual refund, card destination or saved record.",citations:[],ruleEvidenceIds:[]};
const report:ProofAssessment={id:"assessment-one",deliveryId:"delivery-one",mode:"live",model:"synthetic",method:"source-ai-v1",assessedAt:"2026-11-05T00:00:00Z",items:[item],risks:[],limitations:["Source-only synthetic fixture."],coverage:{includedFiles:["index.html"],truncatedFiles:[],omittedFiles:[]}};
const draft=(source=criterion.source,explanation=item.explanation,language:Language="en")=>buildAssessmentFeedbackDraft({...criterion,source},{...item,explanation},language)!;
test("a short evidence request retains the precise locked 24-hour/original-card/record requirement and the saved explanation",()=>{
 for(const language of["zh","en"] as const){const before=structuredClone({criterion,item}),result=buildAssessmentFeedbackDraft(criterion,item,language)!;
  assert.ok(result.comment.includes(criterion.source));assert.ok(result.comment.includes(item.explanation));assert.equal(result.sourceExcerpted,false);assert.equal(result.explanationExcerpted,false);assert.ok(result.comment.length<=1000);
  assert.match(result.comment,language==="zh"?/未运行验证/u:/not verified by execution/u);assert.match(result.comment,language==="zh"?/尚未发送.*不是验收结论/u:/not sent.*not an acceptance decision/u);assert.deepEqual({criterion,item},before);
 }
});
test("missing, blank and mismatched locked sources cannot produce a request based on an unrelated criterion",()=>{
 for(const absent of[undefined,{...criterion,source:""},{...criterion,source:" \n "},{...criterion,id:"other"}]){assert.equal(assessmentCriterionSource(absent,item.criterionId),undefined);assert.equal(buildAssessmentFeedbackDraft(absent,item,"en"),undefined);}
 const original=" \nExact locked line.\n原卡退款。 \n";assert.equal(assessmentCriterionSource({...criterion,source:original},criterion.id),original);assert.ok(draft(original).comment.includes(original));
});
test("a 3000-unit source is visibly an excerpt in a bounded draft, never silently truncated at the end",()=>{
 const tail="TAIL: refund to the original card and retain the record.",source="Agreed requirement: "+"x".repeat(3000-tail.length-20)+tail;assert.equal(source.length,3000);
 for(const language of["zh","en"] as const){const result=draft(source,"Review needs verifiable delivery evidence.",language);assert.ok(result.comment.length<=ASSESSMENT_FEEDBACK_MAX_UTF16);assert.equal(result.sourceExcerpted,true);assert.equal(result.explanationExcerpted,false);assert.ok(!result.comment.includes(tail));assert.match(result.comment,language==="zh"?/原文节选；请查看完整约定/u:/source excerpt; inspect the complete agreed wording/u);assert.match(result.comment,language==="zh"?/逐项对照完整锁定原文/u:/against the full locked wording/u);}
});
test("both shortened sections are labelled, with complete short sections retaining their own full label",()=>{
 for(const language of["zh","en"] as const){const both=draft("甲".repeat(3000),"乙".repeat(600),language);assert.equal(both.sourceExcerpted,true);assert.equal(both.explanationExcerpted,true);assert.match(both.comment,language==="zh"?/当前 AI 说明（节选；未运行验证）/u:/Current AI explanation \(excerpt; not verified by execution\)/u);
  const shortSource=draft("Exact short requirement.","乙".repeat(1000),language);assert.equal(shortSource.sourceExcerpted,false);assert.equal(shortSource.explanationExcerpted,true);assert.match(shortSource.comment,language==="zh"?/锁定要求（完整原文）/u:/Locked requirement \(complete source\)/u);assert.ok(shortSource.comment.includes("Exact short requirement."));
 }
});
test("drafts remain within the existing UTF-16 limit without splitting surrogate pairs at every tested boundary",()=>{
 for(const language of["zh","en"] as const)for(let n=0;n<=1500;n+=17){const source=("😀".repeat(n)+"尾部关键要求").slice(0,3000),explanation="🔎".repeat(300),result=draft(source,explanation,language);assert.ok(result.comment.length<=1000,`${language}/${n}: ${result.comment.length}`);assert.equal(result.comment.isWellFormed(),true,`${language}/${n}`);assert.ok(result.comment.endsWith(language==="zh"?"此草稿尚未发送，也不是验收结论。":"This draft is not sent and is not an acceptance decision."));}
});
test("the exact 1000-unit boundary is complete; one unit over is explicitly excerpted",()=>{
 for(const language of["zh","en"] as const){const base=draft("x","",language).comment.length;const source="x".repeat(1000-base+1),full=draft(source,"",language);assert.equal(full.comment.length,1000);assert.equal(full.sourceExcerpted,false);assert.equal(draft(source+"y","",language).sourceExcerpted,true);}
});
test("the helper retains only the provided saved explanation as an unverified explanation; no raw-provider input is consumed",()=>{
 const explanation="The current report needs execution evidence.",result=buildAssessmentFeedbackDraft(criterion,{...item,explanation,rawProviderText:"UNTRUSTED RUNTIME CLAIM"} as ProofAssessmentItem,"en")!;
 assert.ok(result.comment.includes(explanation));assert.ok(!result.comment.includes("UNTRUSTED RUNTIME CLAIM"));assert.match(result.comment,/Current AI explanation \(not verified by execution\)/u);
});
async function componentModule(){
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-assessment-ui-")),file=(p:string)=>pathToFileURL(path.join(root,p)).href;
 const source=await readFile(path.join(root,"app/components/DeliveryAssessment.tsx"),"utf8");
 let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 output=output.replace('import "../assessment.css";','').replace(/import \{ RiskReviewPanel \} from "\.\/RiskReviewPanel";/u,'const RiskReviewPanel=()=>null;').replace(/import \{ AssessmentValidationPanel \} from "\.\/AssessmentValidationPanel";/u,'const AssessmentValidationPanel=()=>null;');
 for(const name of["react","react/jsx-runtime","lucide-react"])output=output.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
 for(const name of["delivery-overview","assessment-display"])output=output.replaceAll(JSON.stringify("@/lib/"+name),JSON.stringify(file("lib/"+name+".ts")));
 output=output.replaceAll('"./assessment-feedback"',JSON.stringify(file("app/components/assessment-feedback.ts")));
 const modulePath=path.join(dir,"assessment.mjs");await writeFile(modulePath,output);
 const loadedModule=await import(pathToFileURL(modulePath).href);return{Component:loadedModule.DeliveryAssessment,cleanup:()=>rm(dir,{recursive:true,force:true})};
}
const escape=(text:string)=>text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#x27;");
test("bilingual rendered items preserve the complete 3000-unit locked source as escaped plain text, including its tail",async()=>{
 const {Component,cleanup}=await componentModule();try{
  const tail="TAIL 原卡 record <script>neverExecute()</script>",source=" \n"+"x".repeat(3000-tail.length-2)+tail;
  for(const language of["zh","en"] as const){const html=renderToStaticMarkup(createElement(Component,{report,criteria:[{...criterion,source}],language,onPrepareFeedback:()=>{}}));assert.ok(html.includes(`<blockquote>${escape(source)}</blockquote>`));assert.ok(!html.includes("<script>neverExecute()"));assert.match(html,language==="zh"?/查看完整锁定原文/u:/Inspect complete locked wording/u);assert.match(html,language==="zh"?/明确标为节选/u:/labelled as excerpts/u);assert.match(html,/<details class="assessment-locked-source">/u);}
 }finally{await cleanup();}
});
test("rendered draft action retains missing-source, supported, read-only and busy boundaries",async()=>{
 const {Component,cleanup}=await componentModule();try{
  const props={report,criteria:[criterion],language:"en",onPrepareFeedback:()=>{}};
  const normal=renderToStaticMarkup(createElement(Component,props));assert.match(normal,/class="assessment-feedback-button"[^>]*>Draft an evidence request/u);assert.ok(!normal.includes('class="assessment-feedback-button" disabled'));
  const missing=renderToStaticMarkup(createElement(Component,{...props,criteria:[]}));assert.match(missing,/locked wording is unavailable/u);assert.match(missing,/class="assessment-feedback-button" disabled=""/u);
  const busy=renderToStaticMarkup(createElement(Component,{...props,busy:true}));assert.match(busy,/class="assessment-feedback-button" disabled=""/u);
  const readOnly=renderToStaticMarkup(createElement(Component,{...props,readOnly:true}));assert.ok(!readOnly.includes('class="assessment-feedback-button"'));assert.ok(readOnly.includes(escape(criterion.source)));
  const supported=renderToStaticMarkup(createElement(Component,{...props,report:{...report,items:[{...item,status:"supported"}]}}));assert.ok(!supported.includes('class="assessment-feedback-button"'));
 }finally{await cleanup();}
});

test("change suggestions keep the existing change-draft intent while insufficient evidence requests remain neutral in both languages",()=>{
 for(const language of["zh","en"] as const){const change=buildAssessmentFeedbackDraft(criterion,{...item,status:"changes_suggested"},language)!,unknown=buildAssessmentFeedbackDraft(criterion,item,language)!;
  assert.match(change.comment,language==="zh"?/^修改草稿/u:/^Change request draft/u);assert.match(unknown.comment,language==="zh"?/^补证草稿/u:/^Evidence request draft/u);assert.match(change.comment,language==="zh"?/核对完整约定与证据后修改或说明/u:/Review the full agreement and evidence, then correct or explain/u);assert.match(change.comment,language==="zh"?/AI 建议本身不认定违约/u:/An AI suggestion alone does not establish a breach/u);
  assert.ok(change.comment.includes(criterion.source));assert.ok(change.comment.includes(item.explanation));assert.ok(change.comment.length<=1000);assert.match(change.comment,language==="zh"?/未运行验证/u:/not verified by execution/u);
  const long=buildAssessmentFeedbackDraft({...criterion,source:"😀".repeat(1500)},{...item,status:"changes_suggested",explanation:"🔎".repeat(300)},language)!;assert.ok(long.comment.length<=1000);assert.equal(long.comment.isWellFormed(),true);assert.equal(long.sourceExcerpted,true);assert.equal(long.explanationExcerpted,true);
 }
});
test("fitting source text above the initial allocation stays complete with nonempty short explanations",()=>{
 for(const language of["zh","en"] as const){const framing=draft("x","y",language).comment.length-2;
  for(const sourceLength of[450,550,650,750])for(const explanationLength of[1,14,50]){
   const source="s".repeat(sourceLength),explanation="e".repeat(explanationLength),result=draft(source,explanation,language);
   if(framing+sourceLength+explanationLength<=1000){assert.equal(result.sourceExcerpted,false);assert.equal(result.explanationExcerpted,false);assert.ok(result.comment.includes(source));assert.ok(result.comment.includes(explanation));}
  }
 }
});
