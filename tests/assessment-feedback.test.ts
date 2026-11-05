import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {createElement,isValidElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import type {Language,ProofAssessment,ProofAssessmentItem,ProofAssessmentWithheldRisks,ProofCriterion} from "../lib/contracts.ts";
import {ASSESSMENT_FEEDBACK_MAX_UTF16,assessmentCriterionSource,buildAssessmentFeedbackDraft} from "../app/components/assessment-feedback.ts";
import {ASSESSMENT_EVIDENCE_NEED_REASONS} from "../lib/assessment-evidence-needs.ts";
const root=path.resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
const criterion:ProofCriterion={id:"refund",title:"Refund handling",source:"Cancellation within 24 hours must refund the original card and preserve the refund record."};
const item:ProofAssessmentItem={criterionId:criterion.id,status:"insufficient_evidence",explanation:"Source-only review cannot establish the actual refund, card destination or saved record.",citations:[],ruleEvidenceIds:[]};
const report:ProofAssessment={id:"assessment-one",deliveryId:"delivery-one",mode:"live",model:"synthetic",method:"source-ai-v1",assessedAt:"2026-11-05T00:00:00Z",items:[item],risks:[],limitations:["Source-only synthetic fixture."],coverage:{includedFiles:["index.html"],truncatedFiles:[],omittedFiles:[]}};
const draft=(source=criterion.source,explanation=item.explanation,language:Language="en")=>buildAssessmentFeedbackDraft({...criterion,source},{...item,explanation},language)!;
test("every finite evidence action and language fits the feedback contract with a long complete target list",()=>{
 const targetFiles=Array.from({length:40},(_,index)=>`folder-${index}/${"p".repeat(55)}.html`);
 for(const language of["zh","en"] as const)for(const reason of ASSESSMENT_EVIDENCE_NEED_REASONS){
  const value={...item,explanation:"🔎".repeat(300),evidenceNeed:{schema:"source-evidence-need-v1" as const,reason,targetFiles}};
  const result=buildAssessmentFeedbackDraft({...criterion,source:"😀".repeat(1500)},value,language)!;
  assert.ok(result.comment.length<=1000,`${language}/${reason}`);assert.ok(result.comment.isWellFormed());
  assert.match(result.comment,language==="zh"?/未包含完整文件清单.*编辑补全后再发送/u:/omits the full list.*complete the draft before sending/u);
 }
});
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
async function componentModule(inspectKeys=false){
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-assessment-ui-")),file=(p:string)=>pathToFileURL(path.join(root,p)).href;
 const source=await readFile(path.join(root,"app/components/DeliveryAssessment.tsx"),"utf8");
 let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 output=output.replace('import "../assessment.css";','').replace(/import \{ AssessmentValidationPanel \} from "\.\/AssessmentValidationPanel";/u,'const AssessmentValidationPanel=()=>null;');
 if(inspectKeys)output=output.replace('import { useEffect, useId, useRef, useState } from "react";', 'const useEffect=()=>{};const useId=()=>"test-id";const useRef=()=>({current:null});const useState=value=>[value,()=>{}];');
 let reviewOutput=ts.transpileModule(await readFile(path.join(root,"app/components/RiskReviewPanel.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace("import '../risk-reviews.css';","");
 for(const name of["react","react/jsx-runtime"])reviewOutput=reviewOutput.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href)).replaceAll("'"+name+"'",JSON.stringify(pathToFileURL(require.resolve(name)).href));
 await writeFile(path.join(dir,"risk-review.mjs"),reviewOutput);output=output.replaceAll('"./RiskReviewPanel"','"./risk-review.mjs"');
 let obligationOutput=ts.transpileModule(await readFile(path.join(root,"app/components/AssessmentObligations.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const name of["react","react/jsx-runtime"])obligationOutput=obligationOutput.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
 obligationOutput=obligationOutput.replaceAll('"@/lib/assessment-obligations"',JSON.stringify(file("lib/assessment-obligations.ts")));
 await writeFile(path.join(dir,"assessment-obligations.mjs"),obligationOutput);output=output.replaceAll('"./AssessmentObligations"','"./assessment-obligations.mjs"');
 for(const name of["react","react/jsx-runtime","lucide-react"])output=output.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
 for(const name of["delivery-overview","assessment-display","assessment-evidence-needs"])output=output.replaceAll(JSON.stringify("@/lib/"+name),JSON.stringify(file("lib/"+name+".ts")));
 output=output.replaceAll('"./assessment-feedback"',JSON.stringify(file("app/components/assessment-feedback.ts")));
 let riskOutput=ts.transpileModule(await readFile(path.join(root,"app/components/RiskRepairPanel.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "../risk-repairs.css";','');
 for(const name of["react","react/jsx-runtime"])riskOutput=riskOutput.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
 riskOutput=riskOutput.replaceAll('"@/lib/risk-repairs"',JSON.stringify(file("lib/risk-repairs.ts")));
 await writeFile(path.join(dir,"risk-repair.mjs"),riskOutput);output=output.replaceAll('"./RiskRepairPanel"','"./risk-repair.mjs"');
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

test("structured evidence actions share bilingual wording and reserve their complete overhead before draft clipping",()=>{
 const targets=Array.from({length:40},(_,index)=>`folder-${index}/${"p".repeat(55)}.html`);
 const needed={...item,evidenceNeed:{schema:"source-evidence-need-v1" as const,reason:"record_readback" as const,targetFiles:targets}};
 for(const language of["zh","en"] as const){
  const before=structuredClone(needed),result=buildAssessmentFeedbackDraft({...criterion,source:"😀".repeat(1500)},{...needed,explanation:"🔎".repeat(300)},language)!;
  assert.ok(result.comment.length<=1000,`${language}: ${result.comment.length}`);assert.equal(result.comment.isWellFormed(),true);
  assert.equal(result.sourceExcerpted,true);assert.equal(result.explanationExcerpted,true);
  assert.match(result.comment,language==="zh"?/本短草稿未包含完整文件清单.*展开同一版本.*编辑补全后再发送.*没有截短文件名/u:/short draft omits the full list.*Expand this version.*complete the draft before sending.*filenames are not shortened/u);
  assert.match(result.comment,language==="zh"?/已有、经授权测试.*独立回读/u:/existing authorized-test write and independent readback/u);
  for(const target of targets)assert.ok(!result.comment.includes(target.slice(0,20)),"Do not publish partial paths as a complete list");
  assert.deepEqual(needed,before);
 }
 const short={...item,evidenceNeed:{schema:"source-evidence-need-v1" as const,reason:"field_relationship" as const,targetFiles:["index.html","menu.html"]}};
 assert.match(buildAssessmentFeedbackDraft(criterion,short,"en")!.comment,/Related source files \(complete\): index.html; menu.html/u);
});

test("rendered unknown items show saved deterministic actions and complete file paths, with a truthful legacy fallback",async()=>{
 const {Component,cleanup}=await componentModule();try{
  const targets=Array.from({length:40},(_,index)=>`source-${index}.html`),needed={...item,evidenceNeed:{schema:"source-evidence-need-v1" as const,reason:"page_citations" as const,targetFiles:targets}};
  for(const language of["zh","en"] as const){
   const html=renderToStaticMarkup(createElement(Component,{report:{...report,items:[needed]},criteria:[criterion],language,onPrepareFeedback:()=>{}}));
   assert.match(html,language==="zh"?/逐页来源证据尚不完整/u:/Per-page source evidence is incomplete/u);
   for(const target of targets)assert.ok(html.includes(`<code>${target}</code>`));
   assert.match(html,language==="zh"?/仅填入可编辑草稿，不会自动退回/u:/Adds an editable draft without sending/u);
  }
  const old=renderToStaticMarkup(createElement(Component,{report,criteria:[criterion],language:"en",readOnly:true}));
  assert.match(old,/No structured evidence-needed reason was recorded/u);assert.ok(!old.includes('class="assessment-feedback-button"'));
  const corrupt={...item,evidenceNeed:{schema:"wrong",reason:"injected",targetFiles:null}};
  const invalid=renderToStaticMarkup(createElement(Component,{report:{...report,items:[corrupt]},criteria:[criterion],language:"en"}));
  assert.match(invalid,/No structured evidence-needed reason was recorded/u);assert.ok(!invalid.includes("injected"));
 }finally{await cleanup();}
});

test("withheld originals preserve a compact separate pool and only editable current views offer namespaced human opinions",async()=>{
 const {Component,cleanup}=await componentModule();try{
  const withheld:ProofAssessmentWithheldRisks={version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:criterion.id,originalStatus:"supported",publishedStatus:"insufficient_evidence"}],entries:[
   {originalRiskIndex:0,risk:{title:'Original <script>neverExecute()</script> & title',explanation:'Unverified <b>model wording</b>',suggestion:'Original suggestion "inspect"',citations:[{file:"index.html",start:12,end:30,excerpt:'<p>Source & 😀</p>'}]}},
   {originalRiskIndex:3,risk:{title:"Another retained lead",explanation:"Possibly unrelated to the adjusted item.",suggestion:"Keep original advice.",citations:[]}},
  ]};
  const saved={...report,id:"retained-report",deliveryId:"retained-delivery",risks:[],withheldRisks:withheld},before=structuredClone(saved);
  for(const language of["zh","en"] as const)for(const readOnly of[false,true]){
   const html=renderToStaticMarkup(createElement(Component,{report:saved,criteria:[criterion],language,readOnly,onPrepareFeedback:()=>{},onSaveRiskReview:async()=>true,actorRole:"buyer"}));
   const start=html.indexOf('<details class="assessment-withheld-risks"'),end=html.indexOf('<details class="assessment-coverage"'),pool=html.slice(start,end);
   assert.ok(start>=0&&end>start);assert.ok(!pool.includes('<details class="assessment-withheld-risks" open'));
   assert.match(html,language==="zh"?/已发布、待核查的 AI 线索（0）/u:/Published AI indications to review \(0\)/u);
   assert.match(pool,language==="zh"?/已暂缓 AI 线索（2，待复核）/u:/Withheld AI indications \(2, awaiting review\)/u);
   assert.ok(pool.includes(escape(criterion.title)));assert.match(pool,language==="zh"?/建议符合.*→.*证据不足/u:/Suggestion: supported.*→.*Suggestion: insufficient evidence/u);
   assert.match(pool,language==="zh"?/不表示每条线索都由下列要求造成/u:/does not establish that every indication is caused by the items below/u);
   for(const entry of withheld.entries){assert.ok(pool.includes(escape(entry.risk.title)));assert.ok(pool.includes(escape(entry.risk.explanation)));assert.ok(pool.includes(escape(entry.risk.suggestion)));}
   assert.ok(pool.includes(escape(withheld.entries[0].risk.citations[0].excerpt)));assert.ok(pool.includes('[12, 30)'));
   assert.ok(pool.includes('data-original-risk-index="3"'));assert.ok(pool.includes('retained-delivery'));assert.ok(pool.includes('retained-report'));
   assert.ok(!pool.includes('<script>neverExecute()'));assert.ok(!pool.includes('class="risk-repair-draft"'));assert.ok(!pool.includes('risk-feedback-action'));
   assert.equal(pool.includes('class="risk-review-form'),!readOnly);
   if(readOnly){for(const action of["<button","<select","<textarea","<fieldset"])assert.ok(!pool.includes(action),action);}
   else{assert.match(pool,/data-risk-origin="withheld"/u);assert.match(pool,language==="zh"?/保存我的核对意见/u:/Save my human opinion/u);}
   assert.match(pool,language==="zh"?/不会解除暂缓、更改 AI 逐项结论、验收或付款/u:/does not release withheld indications, change AI item findings, accept work or make a payment/u);
  }
  assert.deepEqual(saved,before);
 }finally{await cleanup();}
});

test("new no-withholding and adjusted-zero records stay distinct from missing historical originals",async()=>{
 const {Component,cleanup}=await componentModule();try{
  const published={title:"Published lead",explanation:"Review this source indication.",suggestion:"Inspect the exact source.",citations:[]};
  const notWithheld:ProofAssessmentWithheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};
  for(const language of["zh","en"] as const){
   const current=renderToStaticMarkup(createElement(Component,{report:{...report,risks:[published],withheldRisks:notWithheld},criteria:[criterion],language}));
   assert.match(current,language==="zh"?/已发布、待核查的 AI 线索（1）/u:/Published AI indications to review \(1\)/u);
   assert.match(current,language==="zh"?/本次没有暂缓 AI 线索（0）/u:/No AI indications were withheld \(0\)/u);
   assert.ok(!current.includes('count notes cannot recover'));
   const zero:ProofAssessmentWithheldRisks={version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:criterion.id,originalStatus:"supported",publishedStatus:"insufficient_evidence"}],entries:[]};
   const adjusted=renderToStaticMarkup(createElement(Component,{report:{...report,withheldRisks:zero},criteria:[criterion],language,readOnly:true}));
   assert.match(adjusted,language==="zh"?/暂缓线索为 0 条/u:/there are 0 withheld indications/u);
   const legacy=renderToStaticMarkup(createElement(Component,{report:{...report,limitations:["999 optional risks were hidden in this unstructured model note."]},criteria:[criterion],language,readOnly:true}));
   const pool=legacy.slice(legacy.indexOf('<details class="assessment-withheld-risks"'),legacy.indexOf('<details class="assessment-coverage"'));
   assert.match(pool,language==="zh"?/没有结构化暂缓记录.*不能从数量说明恢复原件/u:/no structured withholding record.*count notes cannot recover/u);
   assert.ok(!pool.includes("999"));assert.ok(!pool.includes("旧报告"));
  }
 }finally{await cleanup();}
});

test("unsupported withholding metadata shows a record warning without guessing counts",async()=>{
 const {Component,cleanup}=await componentModule();try{
  const html=renderToStaticMarkup(createElement(Component,{report:{...report,withheldRisks:{version:99,reason:"invented",adjustedCriteria:[],entries:[]}},criteria:[criterion],language:"en",readOnly:true}));
  assert.match(html,/record format cannot be checked/u);assert.ok(!html.includes("invented"));
 }finally{await cleanup();}
});

test("v2 source-scope originals show their own reason without claiming an item status adjustment",async()=>{
 const {Component,cleanup}=await componentModule();try{
  const original={title:"Original extra-page lead",explanation:"An original, unverified model lead.",suggestion:"Inspect the locked scope before deciding.",citations:[{file:"index.html",start:0,end:4,excerpt:"Home"}]};
  const scope:ProofAssessmentWithheldRisks={version:2,reason:"source_scope_unestablished",scopeCriterionIds:[criterion.id],adjustedCriteria:[],entries:[{originalRiskIndex:0,risk:original}]};
  const saved={...report,items:[{...item,status:"supported" as const}],risks:[],withheldRisks:scope};
  for(const language of["zh","en"] as const)for(const readOnly of[false,true]){
   const html=renderToStaticMarkup(createElement(Component,{report:saved,criteria:[criterion],language,readOnly,actorRole:"buyer",onSaveRiskReview:async()=>true,onPrepareFeedback:()=>{}}));
   const pool=html.slice(html.indexOf('<details class="assessment-withheld-risks"'),html.indexOf('<details class="assessment-coverage"'));
   assert.match(pool,language==="zh"?/独立约定范围未建立 · 逐项状态未调整/u:/Agreed indication scope unestablished · item statuses unchanged/u);
   assert.match(pool,language==="zh"?/按电话／邮箱文字自定义范围单独暂缓/u:/under the custom phone\/email text scope/u);
   assert.match(pool,language==="zh"?/也不认定其他页面、链接或手机要求通过/u:/other page, link or mobile requirements are not declared passed/u);
   assert.match(pool,language==="zh"?/这里没有状态调整记录/u:/There is no status-adjustment record/u);
   assert.ok(pool.includes(escape(original.title)));assert.ok(pool.includes(escape(criterion.title)));
   assert.ok(!pool.includes('class="assessment-withheld-adjustments"'));assert.ok(!pool.includes('class="risk-repair-draft"'));
   assert.equal(pool.includes('class="risk-review-form'),!readOnly);
  }
  const invalid=structuredClone(saved);delete (invalid.withheldRisks as unknown as Record<string,unknown>).scopeCriterionIds;
  assert.match(renderToStaticMarkup(createElement(Component,{report:invalid,criteria:[criterion],language:"en"})),/withholding record format cannot be checked/u);
 }finally{await cleanup();}
});

test("delivery review panels use the original withheld index and remount drafts for a different origin or actor",async()=>{
 const {Component,cleanup}=await componentModule(true);try{
  const risk={title:"Synthetic indication",explanation:"Source lead only.",suggestion:"Inspect the source.",citations:[]};
  const withheld:ProofAssessmentWithheldRisks={version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:criterion.id,originalStatus:"supported",publishedStatus:"insufficient_evidence"}],entries:[{originalRiskIndex:0,risk},{originalRiskIndex:3,risk}]};
  const published={...report,risks:[risk],withheldRisks:{version:1 as const,reason:"not_withheld" as const,adjustedCriteria:[],entries:[]}},quarantined={...report,withheldRisks:withheld};
  const reviewElements=(node:unknown):{key:string|null;props:Record<string,unknown>}[]=>{
   if(Array.isArray(node))return node.flatMap(reviewElements);
   if(!isValidElement<{children?:unknown}>(node))return[];
   const own=typeof node.type==="function"&&node.type.name==="RiskReviewPanel"?[{key:node.key,props:node.props as Record<string,unknown>}]:[];
   return [...own,...reviewElements(node.props.children)];
  };
  const keys=new Set<string|null>();
  for(const actorRole of["buyer","seller"] as const){
   const props={criteria:[criterion],language:"en",actorRole,onSaveRiskReview:async()=>true};
   const [active]=reviewElements(Component({...props,report:published}));assert.ok(active);assert.equal(active.props.riskIndex,0);assert.equal(Object.hasOwn(active.props,"riskOrigin"),false);assert.ok(active.key?.includes(`-published-0-${actorRole}`));keys.add(active.key);
   const hidden=reviewElements(Component({...props,report:quarantined}));assert.equal(hidden.length,2);
   for(const [position,index] of[0,3].entries()){const panel=hidden[position];assert.equal(panel.props.riskOrigin,"withheld");assert.equal(panel.props.riskIndex,index);assert.equal(panel.props.role,actorRole);assert.ok(panel.key?.includes(`-withheld-${index}-${actorRole}`));keys.add(panel.key);}
  }
  assert.equal(keys.size,6);
 }finally{await cleanup();}
});
