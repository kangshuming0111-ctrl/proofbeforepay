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
