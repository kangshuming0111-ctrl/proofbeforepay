import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {assessmentComponentModule} from "./assessment-component-harness.ts";
import {buildAssessmentFeedbackDraft} from "../app/components/assessment-feedback.ts";
import type {ProofAssessment, ProofAssessmentItem} from "../lib/contracts.ts";
const criterion={id:"coverage-1",title:"Original requirement",source:'The contact form source must contain HTML labels "Name" and "Email".'};
const base:ProofAssessmentItem={criterionId:criterion.id,status:"insufficient_evidence",explanation:"Published AI advice remains unknown.",citations:[],ruleEvidenceIds:[],modelJudgment:{status:"insufficient_evidence",explanation:"Original model could not decide.",citations:[]},sourceFinding:{version:"source-finding-v1",status:"changes_suggested",basis:"declared_html_labels",explanation:"The confirmed enquiry form lacks the Email label; another form cannot supply it.",citations:[{file:"visit.html",start:0,end:20,excerpt:'<form id="enquiry">x'}],files:["visit.html"],scopeBinding:{proposalId:"proposal-1",proposalDigest:"a".repeat(64),file:"visit.html",kind:"form",formId:"enquiry"}}};
const report=(item:ProofAssessmentItem):ProofAssessment=>({id:"report-1",deliveryId:"delivery-1",method:"source-ai-v1",mode:"live",model:"synthetic",assessedAt:"2026-11-06T10:00:00.000Z",items:[item],risks:[],limitations:["Synthetic rendering only."],coverage:{includedFiles:["visit.html"],truncatedFiles:[],omittedFiles:[]}});
test("grounded source difference and original AI uncertainty remain separately inspectable and produce a change action",async()=>{
 const {Component,cleanup}=await assessmentComponentModule();try{for(const language of["zh","en"] as const){const html=renderToStaticMarkup(createElement(Component,{report:report(base),criteria:[criterion],language,onPrepareFeedback:()=>{}}));assert.ok(html.includes(base.modelJudgment!.explanation));assert.ok(html.includes(base.sourceFinding!.explanation));assert.match(html,language==="zh"?/系统独立源码事实：.*发现源码差异/u:/Independent source finding:.*Source difference found/u);assert.match(html,language==="zh"?/>加入修改草稿</u:/>Add to change draft</u);assert.ok(!html.includes(language==="zh"?'>先澄清页面归属<':'>Clarify page scope<'));}}finally{await cleanup();}
});
test("source-based feedback identifies its independent basis and retains the exact original requirement without changing the saved report",()=>{
 const before=structuredClone(base),finding=base.sourceFinding!,input={...base,status:finding.status,explanation:finding.explanation,citations:finding.citations,evidenceNeed:undefined};
 for(const language of["zh","en"] as const){const draft=buildAssessmentFeedbackDraft(criterion,input,language,[],{basis:"independent_source",confirmedScope:true})!;assert.equal(draft.intent,undefined);assert.ok(draft.comment.includes(criterion.source));assert.ok(draft.comment.includes(finding.explanation));assert.match(draft.comment,language==="zh"?/独立源码事实（未运行验证）/u:/Independent source fact \(not verified by execution\)/u);assert.ok(draft.comment.length<=1000);}
 assert.deepEqual(base,before);
});
test("read-only historical reports retain source/model evidence while offering no change, run or risk-review write action",async()=>{
 const {Component,cleanup}=await assessmentComponentModule();try{const html=renderToStaticMarkup(createElement(Component,{report:report(base),criteria:[criterion],language:"en",readOnly:true,onPrepareFeedback:()=>{},onRun:()=>{}}));assert.ok(html.includes(base.sourceFinding!.explanation));assert.ok(html.includes(base.modelJudgment!.explanation));assert.ok(!html.includes('class="assessment-feedback-button"'));assert.ok(!html.includes('assessment-run-button'));}finally{await cleanup();}
});

test("a confirmed scope's source finding leads while the conflicting original publication and old evidence direction remain collapsed and unchanged",async()=>{
 const oldExplanation="Business page identity is unconfirmed; clarify scope before directing edits.",item:ProofAssessmentItem={...base,status:"insufficient_evidence",explanation:oldExplanation,evidenceNeed:{schema:"source-evidence-need-v1",reason:"page_scope",targetFiles:["visit.html"]}};
 const before=structuredClone(item),{Component,cleanup}=await assessmentComponentModule();try{for(const language of["zh","en"] as const){
  const html=renderToStaticMarkup(createElement(Component,{report:report(item),criteria:[criterion],language,onPrepareFeedback:()=>{}}));
  assert.match(html,/<details class="assessment-published-record">/u);assert.doesNotMatch(html,/<details class="assessment-published-record" open/u);
  const start=html.indexOf('<details class="assessment-published-record">'),end=html.indexOf('</details>',start),oldAt=html.indexOf(oldExplanation);
  assert.ok(oldAt>start&&oldAt<end);assert.ok(html.indexOf(item.sourceFinding!.explanation)<start);
  assert.match(html,language==="zh"?/不会撤销双方的范围确认/u:/does not revoke that agreement/u);assert.match(html,language==="zh"?/>加入修改草稿</u:/>Add to change draft</u);
  assert.ok(html.includes(item.modelJudgment!.explanation));
 }assert.deepEqual(item,before);}finally{await cleanup();}
});
test("a runtime unknown without independent facts keeps its evidence request visible and never claims confirmed source scope",async()=>{
 const item:ProofAssessmentItem={...base,sourceFinding:undefined,evidenceNeed:{schema:"source-evidence-need-v1",reason:"record_readback",targetFiles:["visit.html"]}};
 const {Component,cleanup}=await assessmentComponentModule();try{const html=renderToStaticMarkup(createElement(Component,{report:report(item),criteria:[{...criterion,source:"The submitted enquiry must persist after restart."}],language:"en",onPrepareFeedback:()=>{}}));assert.ok(!html.includes('class="assessment-published-record"'));assert.ok(html.includes('class="assessment-evidence-need"'));assert.match(html,/Draft an evidence request/u);assert.ok(!html.includes('does not revoke that agreement'));}finally{await cleanup();}
});

test("both marked publication reasons identify system source authority while preserving the original model and report",async()=>{
 const {Component,cleanup}=await assessmentComponentModule();try{for(const reason of["locked_price_mismatch","confirmed_form_label_absence"]as const)for(const language of["zh","en"]as const){
  const item:ProofAssessmentItem={...structuredClone(base),status:"changes_suggested",explanation:"Canonical saved source-check publication.",publicationBasis:{schema:"source-publication-v1",reason},modelJudgment:{status:"changes_suggested",explanation:"Exact retained original model judgment.",citations:[]}};
  if(reason==="locked_price_mismatch"){item.sourceFinding!.basis="locked_business_values";delete item.sourceFinding!.scopeBinding;}
  const before=structuredClone(item),html=renderToStaticMarkup(createElement(Component,{report:report(item),criteria:[criterion],language,onPrepareFeedback:()=>{}}));
  assert.match(html,language==="zh"?/源码核验发布：不符/u:/Source-check publication: mismatch/u);
  assert.match(html,language==="zh"?/已保存的发布结论/u:/Saved publication findings/u);
  assert.match(html,language==="zh"?/其余保留原发布建议/u:/other items retain their original publication advice/u);
  assert.match(html,reason==="locked_price_mismatch"?(language==="zh"?/已锁定菜品与价格/u:/locked item and price/u):(language==="zh"?/双方确认的表单范围/u:/form confirmed by both parties/u));
  assert.match(html,language==="zh"?/查看本次发布说明（源码核验）/u:/Inspect this publication’s source-check explanation/u);
  assert.ok(html.includes(item.modelJudgment!.explanation));assert.ok(html.includes(item.explanation));
  assert.match(html,language==="zh"?/不证明页面可见、实际保存或交付已验收/u:/does not prove visibility, actual storage or accepted delivery/u);
  assert.deepEqual(item,before);
 }}finally{await cleanup();}
});

test("a marked publication does not confuse optional model-lead withholding with its source publication status",async()=>{
 const {Component,cleanup}=await assessmentComponentModule();try{for(const marked of[false,true]){
  const item:ProofAssessmentItem={...structuredClone(base),status:"changes_suggested",...(marked?{publicationBasis:{schema:"source-publication-v1" as const,reason:"confirmed_form_label_absence" as const}}:{})},saved=report(item);
  saved.withheldRisks={version:4,reason:"optional_source_leads_unverified",adjustedCriteria:[],entries:[{originalRiskIndex:0,risk:{title:"Original optional lead",explanation:"Unverified original model wording",suggestion:"Needs independent evidence",citations:[]}}]};const before=structuredClone(saved);
  const html=renderToStaticMarkup(createElement(Component,{report:saved,criteria:[criterion],language:"en",readOnly:true}));
  assert.match(html,marked?/withholding does not change published item findings/u:/Independent scope and observations unestablished · item statuses unchanged/u);assert.ok(html.includes('Unverified original model wording'));assert.deepEqual(saved,before);
 }}finally{await cleanup();}
});

test("unmarked legacy source findings retain the v89 AI labels and original publication disclosure",async()=>{
 const {Component,cleanup}=await assessmentComponentModule();const before=structuredClone(base);try{for(const language of["zh","en"]as const){
  const html=renderToStaticMarkup(createElement(Component,{report:report(base),criteria:[criterion],language,readOnly:true}));
  assert.match(html,language==="zh"?/AI 逐条交付评估/u:/AI delivery assessment/u);assert.match(html,language==="zh"?/已保存的 AI 建议/u:/Saved AI suggestions/u);
  assert.match(html,language==="zh"?/查看发布层原说明（独立保留）/u:/Inspect the published explanation \(retained separately\)/u);
  assert.doesNotMatch(html,/class="assessment-publication-basis"|Source-check publication:|源码核验发布：/u);
 }assert.deepEqual(base,before);}finally{await cleanup();}
});
