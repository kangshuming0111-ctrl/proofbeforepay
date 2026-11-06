import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessmentItem,ProofBusinessCheckStep,ProofCriterion,ProofQuote} from "../lib/contracts.ts";
import {assessmentFeedbackScopeSteps,buildAssessmentFeedbackDraft,needsAssessmentScopeClarification} from "../app/components/assessment-feedback.ts";
import {parseStaticProject} from "../lib/static-project.ts";
import {createElement,isValidElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {assessmentComponentModule} from "./assessment-component-harness.ts";

const criterion:ProofCriterion={id:"coverage-1",title:"Original requirement 1",source:'Signup source labels must include "Enter your name:" and "Enter your age:".'};
const item:ProofAssessmentItem={criterionId:criterion.id,status:"changes_suggested",explanation:"Confirm which file is agreed; if index.html is the signup page, add the missing name field.",citations:[],ruleEvidenceIds:[]};

test("unmapped role aliases draft only scope questions and never copy conditional page repair advice",()=>{
 for(const language of["zh","en"] as const)for(const status of["changes_suggested","insufficient_evidence"] as const){
  const before=structuredClone({criterion,item}),draft=buildAssessmentFeedbackDraft(criterion,{...item,status},language)!;
  assert.equal(draft.intent,"scope_clarification");assert.ok(draft.comment.includes(criterion.source));
  assert.ok(!draft.comment.includes("index.html"));assert.ok(!draft.comment.includes(item.explanation));
  assert.match(draft.comment,language==="zh"?/^范围澄清草稿/u:/^Scope clarification draft/u);
  assert.match(draft.comment,language==="zh"?/先确认适用的文件/u:/First confirm the applicable file/u);
  assert.match(draft.comment,language==="zh"?/尚未发送/u:/not sent/u);assert.ok(draft.comment.length<=1000);assert.deepEqual({criterion,item},before);
 }
});
test("native explicit file source keeps useful change intent and a source-literal Visible is only data",()=>{
 const explicit={...criterion,source:'The form source in signup.html must include "Visible" and "Enter your age:" as label text.'};
 assert.equal(needsAssessmentScopeClarification(explicit,item),false);
 const draft=buildAssessmentFeedbackDraft(explicit,item,"en")!;assert.equal(draft.intent,undefined);assert.match(draft.comment,/^Change request draft/u);assert.ok(draft.comment.includes(explicit.source));
 const literal={...criterion,source:'Signup source labels must include "Visible" and "Submit order".'};
 const scope=buildAssessmentFeedbackDraft(literal,item,"en")!;assert.equal(scope.intent,"scope_clarification");assert.ok(scope.comment.includes('"Visible"'));assert.ok(scope.comment.includes('"Submit order"'));
});
test("missing or different criterion identity cannot borrow source, and supported items have no clarification intent",()=>{
 for(const c of[undefined,{...criterion,id:"coverage-2"}]){assert.equal(needsAssessmentScopeClarification(c,item),false);assert.equal(buildAssessmentFeedbackDraft(c,item,"en"),undefined);}
 assert.equal(needsAssessmentScopeClarification(criterion,{...item,status:"supported"}),false);
});
test("filename hints, malformed paths and unrelated locked steps do not establish this alias target",()=>{
 const fake=(file:string,id=criterion.id)=>({criterionId:id,file} as ProofBusinessCheckStep);
 for(const steps of[[fake("index.html","coverage-2")],[fake("../signup.html")],[fake("https://wrong.example/signup.html")]])assert.equal(needsAssessmentScopeClarification(criterion,item,steps),true);
 assert.equal(needsAssessmentScopeClarification(criterion,item,[fake("real-signup.html")]),false);
});
function mappedQuote():ProofQuote{
 const summary=criterion.source;
 const parsed=parseStaticProject({title:"Synthetic signup",summary,amount:"1.00",requiredPages:["index.html"],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:"coverage-1",disposition:"include"}]},businessChecks:{confirmed:true,items:[{id:"business-1",criterionId:"coverage-1",file:"index.html",source:{start:0,end:summary.length,excerpt:summary},expected:{kind:"visible_copy",text:"Enter your name:"}}]}},"en");
 return{summary,proof:{project:parsed.project,criteria:parsed.criteria}} as ProofQuote;
}
test("the current saved agreement validates actual mappings while stale summary, source, page and criterion refuse them",()=>{
 const q=mappedQuote(),steps=assessmentFeedbackScopeSteps(q);assert.equal(steps.length,2);
 assert.equal(needsAssessmentScopeClarification(criterion,item,steps),false);
 assert.match(buildAssessmentFeedbackDraft(criterion,item,"en",steps)!.comment,/^Change request draft/u);
 for(const alter of[(q:ProofQuote)=>{q.summary+=" stale";},(q:ProofQuote)=>{q.proof.criteria=q.proof.criteria.filter(c=>c.id!==criterion.id);},(q:ProofQuote)=>{q.proof.project!.businessChecks![0].file="unknown.html";},(q:ProofQuote)=>{q.proof.project!.businessChecks![0].source.excerpt="forged";}]){
  const broken=structuredClone(q);alter(broken);assert.deepEqual(assessmentFeedbackScopeSteps(broken),[]);assert.equal(needsAssessmentScopeClarification(criterion,item,assessmentFeedbackScopeSteps(broken)),true);
 }
 assert.deepEqual(assessmentFeedbackScopeSteps(undefined),[]);
});
test("long quoted labels retain literal data and complete clarification guidance within UTF16 budget",()=>{
 const source=`Signup source labels must include ${Array.from({length:6},(_,i)=>JSON.stringify(`${i}${"😀".repeat(57)}`)).join(" and ")}.`;
 for(const language of["zh","en"] as const){const d=buildAssessmentFeedbackDraft({...criterion,source},{...item,explanation:"unsafe ".repeat(80)},language)!;
  assert.equal(d.intent,"scope_clarification");assert.ok(d.comment.length<=1000);assert.ok(d.comment.isWellFormed());assert.equal(d.explanationExcerpted,false);assert.ok(!d.comment.includes("unsafe"));assert.match(d.comment,language==="zh"?/尚未发送，也不是验收结论。$/u:/not sent and is not an acceptance decision\.$/u);if(d.sourceExcerpted)assert.match(d.comment,language==="zh"?/原文节选/u:/source excerpt/u);
 }
});
const report={id:"scope-assessment",deliveryId:"scope-delivery",method:"source-ai-v1",mode:"live",model:"synthetic",assessedAt:"2026-11-06T00:00:00Z",items:[item],risks:[],limitations:[],coverage:{includedFiles:["index.html","signup.html"],truncatedFiles:[],omittedFiles:[]}};
test("actual bilingual component asks for scope, while validated targets keep change and existing action gates",async()=>{
 const {Component,cleanup}=await assessmentComponentModule();try{
  for(const language of["zh","en"] as const){
   const props={report,criteria:[criterion],language,onPrepareFeedback:()=>{}};
   const html=renderToStaticMarkup(createElement(Component,props));assert.match(html,language==="zh"?/先澄清页面归属/u:/Clarify page scope/u);
   const bound=renderToStaticMarkup(createElement(Component,{...props,scopeSteps:assessmentFeedbackScopeSteps(mappedQuote())}));assert.match(bound,language==="zh"?/加入修改草稿/u:/Add to change draft/u);
   const busy=renderToStaticMarkup(createElement(Component,{...props,busy:true}));assert.match(busy,/class="assessment-feedback-button" disabled=""/u);
   for(const patch of[{readOnly:true},{report:{...report,items:[{...item,status:"supported"}]}}]){const gated=renderToStaticMarkup(createElement(Component,{...props,...patch}));assert.ok(!gated.includes('class="assessment-feedback-button"'));}
  }
 }finally{await cleanup();}
});
test("controlled actual item callback fills exactly this delivery and criterion with an unsent scope question",async()=>{
 const {Component,cleanup}=await assessmentComponentModule(true);try{
  const calls:unknown[]=[];const tree=Component({report,criteria:[criterion],language:"en",onPrepareFeedback:(input:unknown)=>calls.push(input)});
  let click:(()=>void)|undefined;function visit(node:unknown){if(Array.isArray(node)){node.forEach(visit);return;}if(!isValidElement(node))return;const p=node.props as Record<string,unknown>;
   if(node.type==="button"&&p.className==="assessment-feedback-button"){assert.equal(p.disabled,false);click=p.onClick as()=>void;}visit(p.children);
  }visit(tree);assert.ok(click);assert.deepEqual(calls,[]);click();assert.equal(calls.length,1);
  const value=calls[0] as{deliveryId:string;criterionId:string;comment:string};assert.equal(value.deliveryId,report.deliveryId);assert.equal(value.criterionId,item.criterionId);assert.match(value.comment,/^Scope clarification draft/u);assert.ok(value.comment.includes(criterion.source));assert.ok(!value.comment.includes("index.html"));assert.match(value.comment,/not sent/u);
 }finally{await cleanup();}
});
