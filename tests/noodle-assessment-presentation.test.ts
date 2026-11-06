import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {assessmentComponentModule} from "./assessment-component-harness.ts";
import {buildAssessmentFeedbackDraft} from "../app/components/assessment-feedback.ts";
import type {ProofAssessment, ProofAssessmentItem, ProofBusinessCheckStep} from "../lib/contracts.ts";
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

test("a positive locked-price publication uses price provenance and offers no repair with feedback enabled",async()=>{
 const price={id:"price",title:"Locked beef-noodle price",source:"menu-en.html must list Beef noodles at AUD18."},markup='<article><h2>Beef noodles</h2><p>AUD18.00</p></article>',citation={file:"menu-en.html",start:0,end:markup.length,excerpt:markup};
 const item:ProofAssessmentItem={criterionId:price.id,status:"supported",explanation:"Canonical saved positive price publication.",citations:[citation],ruleEvidenceIds:[],publicationBasis:{schema:"source-publication-v1",reason:"locked_price_match"},modelJudgment:{status:"supported",explanation:"Original model supports the exact beef-noodle price card.",citations:[citation]},sourceFinding:{version:"source-finding-v1",status:"supported",basis:"locked_business_values",explanation:"The active locked beef-noodle source price is AUD18.",citations:[citation],files:["menu-en.html"]}};
 const before=structuredClone(item),calls:unknown[]=[],{Component,cleanup}=await assessmentComponentModule();try{for(const language of["zh","en"]as const){
  const html=renderToStaticMarkup(createElement(Component,{report:report(item),criteria:[price],language,readOnly:false,onPrepareFeedback:(value:unknown)=>calls.push(value)}));
  assert.match(html,language==="zh"?/源码核验发布：支持/u:/Source-check publication: supported/u);assert.match(html,language==="zh"?/已锁定菜品与价格/u:/locked item and price/u);
  assert.doesNotMatch(html,/双方确认的表单范围|form confirmed by both parties|class="assessment-feedback-button"|class="assessment-evidence-need"/u);
  assert.ok(html.includes(item.modelJudgment!.explanation));assert.deepEqual(calls,[]);
 }assert.deepEqual(item,before);}finally{await cleanup();}
});

const compoundPriceCriterion={id:"coverage-1",title:"Original requirement 1",source:"菜单的牛肉面和Beef noodles标价必须为AUD18且营业时间必须为上午11点到晚上8点。"};
function priceSteps(source=compoundPriceCriterion.source):ProofBusinessCheckStep[]{return["牛肉面","Beef noodles"].map((label,index)=>({stepId:`step-${index}`,checkId:`price-${index}`,criterionId:"coverage-1",file:"menu.html",viewportWidth:375,source:{start:0,end:source.length,excerpt:source},expected:{kind:"item_price",label,currency:"AUD",amountMinor:1800}}));}
function partialPriceItem():ProofAssessmentItem{return{...structuredClone(base),explanation:"The complete original still includes unverified opening hours.",evidenceNeed:{schema:"source-evidence-need-v1",reason:"requirement_clarification",targetFiles:["menu.html"]},sourceFinding:{version:"source-finding-v1",status:"supported",basis:"locked_business_values",explanation:"The two locked price subfacts have source support only.",citations:[],files:["menu.html"]}};}
const completenessPolicy={schema:"requirement-completeness-v1",version:"bounded-original-zh-v1"} as const;

test("new-policy incomplete whole requirement keeps price subfact support separate and an unsent whole-item evidence draft actionable",async()=>{
 const {Component,cleanup}=await assessmentComponentModule(true);try{for(const language of["zh","en"]as const){
  const item=partialPriceItem(),saved={...report(item),requirementCompletenessPolicy:completenessPolicy},before=structuredClone(saved),calls:unknown[]=[];
  const tree=Component({report:saved,criteria:[compoundPriceCriterion],scopeSteps:priceSteps(),language,onPrepareFeedback:(value:unknown)=>calls.push(value)}),html=renderToStaticMarkup(tree);
  assert.match(html,language==="zh"?/已核业务值有支持，整条要求仍待核对/u:/Checked business values have support; the whole requirement still needs review/u);
  assert.match(html,language==="zh"?/>请求补充证据</u:/>Draft an evidence request</u);
  const nodes: {props?:{className?:string;children?:unknown;onClick?:()=>void}}[]=[];
  function walk(value:unknown):void{if(Array.isArray(value)){value.forEach(walk);return;}if(value&&typeof value==="object"&&"props" in value){const node=value as typeof nodes[number];nodes.push(node);walk(node.props?.children);}}
  walk(tree);const button=nodes.find(node=>node.props?.className==="assessment-feedback-button");assert.ok(button?.props?.onClick);assert.deepEqual(calls,[]);button.props.onClick();
  assert.equal(calls.length,1);const feedback=calls[0]as{criterionId:string;comment:string};assert.equal(feedback.criterionId,compoundPriceCriterion.id);assert.ok(feedback.comment.includes(compoundPriceCriterion.source));assert.ok(feedback.comment.includes(item.explanation));assert.ok(!feedback.comment.includes(item.sourceFinding!.explanation));assert.ok(feedback.comment.length<=1000);assert.deepEqual(saved,before);
 }}finally{await cleanup();}
});

test("new completeness presentation leaves legacy, unsupported policy and complete price-only source support unchanged",async()=>{
 const {Component,cleanup}=await assessmentComponentModule();try{for(const policy of[undefined,{schema:"requirement-completeness-v1",version:"future-v2"}]){
  const item=partialPriceItem(),saved={...report(item),...(policy?{requirementCompletenessPolicy:policy}:{})}as ProofAssessment,before=structuredClone(saved);
  const html=renderToStaticMarkup(createElement(Component,{report:saved,criteria:[compoundPriceCriterion],scopeSteps:priceSteps(),language:"en",onPrepareFeedback:()=>{}}));assert.doesNotMatch(html,/whole requirement still needs review|class="assessment-feedback-button"/u);assert.match(html,/Source relation supported/u);assert.deepEqual(saved,before);
 }
 const complete={...compoundPriceCriterion,source:"菜单的牛肉面和Beef noodles标价必须为AUD18。"},saved={...report(partialPriceItem()),requirementCompletenessPolicy:completenessPolicy};
 const html=renderToStaticMarkup(createElement(Component,{report:saved,criteria:[complete],scopeSteps:priceSteps(complete.source),language:"en",onPrepareFeedback:()=>{}}));assert.doesNotMatch(html,/whole requirement still needs review|class="assessment-feedback-button"/u);
 const readonly=renderToStaticMarkup(createElement(Component,{report:{...report(partialPriceItem()),requirementCompletenessPolicy:completenessPolicy},criteria:[compoundPriceCriterion],scopeSteps:priceSteps(),language:"en",readOnly:true,onPrepareFeedback:()=>{}}));assert.match(readonly,/whole requirement still needs review/u);assert.doesNotMatch(readonly,/class="assessment-feedback-button"/u);
 }finally{await cleanup();}
});

test("a negative independent source finding retains its repair action under the completeness policy",async()=>{
 const item=partialPriceItem();item.sourceFinding!.status="changes_suggested";item.sourceFinding!.explanation="The locked price actually differs.";
 const {Component,cleanup}=await assessmentComponentModule();try{const html=renderToStaticMarkup(createElement(Component,{report:{...report(item),requirementCompletenessPolicy:completenessPolicy},criteria:[compoundPriceCriterion],scopeSteps:priceSteps(),language:"en",onPrepareFeedback:()=>{}}));assert.match(html,/Source difference found|Add to change draft/u);assert.doesNotMatch(html,/whole requirement still needs review/u);}finally{await cleanup();}
});

test("an incomplete untyped item without source facts gets full-wording evidence guidance without rewriting saved cause, body or raw model",async()=>{
 const original={...criterion,source:"The page content must show the restaurant name and opening hours."},calls:unknown[]=[],{Component,cleanup}=await assessmentComponentModule(true);
 try{for(const raw of["supported","changes_suggested","insufficient_evidence"]as const)for(const language of["zh","en"]as const){
  const item:ProofAssessmentItem={...structuredClone(base),sourceFinding:undefined,explanation:"Exact saved whole-item unknown wording.",modelJudgment:{status:raw,explanation:"Exact original model wording.",citations:[]},evidenceNeed:{schema:"source-evidence-need-v1",reason:"requirement_clarification",targetFiles:[]}},saved={...report(item),requirementCompletenessPolicy:completenessPolicy},before=structuredClone(saved);
  const tree=Component({report:saved,criteria:[original],scopeSteps:[],language,onPrepareFeedback:(value:unknown)=>calls.push(value)}),html=renderToStaticMarkup(tree);
  assert.match(html,language==="zh"?/整条要求仍待核对/u:/The whole requirement still needs review/u);assert.match(html,language==="zh"?/逐项明确检查方法与材料/u:/Agree how each condition will be checked/u);assert.match(html,language==="zh"?/>请求补充证据</u:/>Draft an evidence request</u);
  assert.doesNotMatch(html,/尚未定位具体文件|No exact target file was recorded|已核业务值有支持|Checked business values have support|assessment-source-finding/u);assert.ok(html.includes(item.explanation));assert.ok(html.includes(item.modelJudgment!.explanation));assert.deepEqual(saved,before);
  const buttons:{props?:{className?:string;children?:unknown;onClick?:()=>void}}[]=[];function walk(v:unknown):void{if(Array.isArray(v)){v.forEach(walk);return;}if(v&&typeof v==="object"&&"props"in v){const n=v as typeof buttons[number];buttons.push(n);walk(n.props?.children);}}walk(tree);
  const button=buttons.find(n=>n.props?.className==="assessment-feedback-button");assert.ok(button?.props?.onClick);const count=calls.length;button.props.onClick();assert.equal(calls.length,count+1);const draft=calls.at(-1)as{comment:string};assert.ok(draft.comment.includes(original.source));assert.ok(draft.comment.includes(item.explanation));assert.ok(draft.comment.length<=1000);assert.deepEqual(saved,before);
 }}finally{await cleanup();}
});

test("explicit source-publication v1 and v2 retain source authority for all three reasons, separate evidence layers and readonly boundaries",async()=>{
 const {Component,cleanup}=await assessmentComponentModule();try{for(const schema of["source-publication-v1","source-publication-v2"]as const)for(const reason of["locked_price_mismatch","locked_price_match","confirmed_form_label_absence"]as const)for(const readOnly of[false,true])for(const language of["zh","en"]as const){
  const positive=reason==="locked_price_match",isPrice=reason!=="confirmed_form_label_absence",status=positive?"supported":"changes_suggested",item:ProofAssessmentItem={...structuredClone(base),status,explanation:"Exact published source-check explanation.",publicationBasis:{schema,reason},modelJudgment:{status,explanation:"Exact retained original model explanation.",citations:[]}};
  item.sourceFinding!.version=schema==="source-publication-v2"?"source-finding-v2":"source-finding-v1";item.sourceFinding!.status=status;item.sourceFinding!.explanation="Exact independently checked source fact.";if(isPrice){item.sourceFinding!.basis="locked_business_values";delete item.sourceFinding!.scopeBinding;}
  const saved={...report(item),publicationPolicy:{schema,reconciledCriterionIds:[criterion.id]}},before=structuredClone(saved),calls:unknown[]=[],html=renderToStaticMarkup(createElement(Component,{report:saved,criteria:[criterion],language,readOnly,onRun:()=>calls.push("run"),onPrepareFeedback:()=>calls.push("feedback")}));
  assert.match(html,language==="zh"?/交付评估 · 含源码核验|已保存的发布结论/u:/Delivery assessment · includes source checks|Saved publication findings/u);assert.match(html,positive?(language==="zh"?/源码核验发布：支持/u:/Source-check publication: supported/u):(language==="zh"?/源码核验发布：不符/u:/Source-check publication: mismatch/u));
  assert.match(html,isPrice?(language==="zh"?/已锁定菜品与价格/u:/locked item and price/u):(language==="zh"?/双方确认的表单范围/u:/form confirmed by both parties/u));assert.ok(html.includes(item.explanation));assert.ok(html.includes(item.modelJudgment!.explanation));assert.ok(html.includes(item.sourceFinding!.explanation));assert.match(html,/class="assessment-published-record"|class="assessment-original-model"/u);
  if(isPrice)assert.doesNotMatch(html,/发布依据：双方确认的表单范围|Publication basis: agreed-label source/u);if(readOnly||positive)assert.doesNotMatch(html,/class="assessment-feedback-button"|class="assessment-run-button"/u);assert.deepEqual(calls,[]);assert.deepEqual(saved,before);
 }}finally{await cleanup();}
});

test("future source-publication schema is not silently labelled as an accepted source publication",async()=>{
 const item={...structuredClone(base),publicationBasis:{schema:"source-publication-future",reason:"locked_price_mismatch"}}as unknown as ProofAssessmentItem,before=structuredClone(item),{Component,cleanup}=await assessmentComponentModule();try{
  const html=renderToStaticMarkup(createElement(Component,{report:report(item),criteria:[criterion],language:"en",readOnly:true}));assert.match(html,/AI delivery assessment|Saved AI suggestions/u);assert.doesNotMatch(html,/Source-check publication:|class="assessment-publication-basis"/u);assert.ok(html.includes(item.modelJudgment!.explanation));assert.ok(html.includes(item.sourceFinding!.explanation));assert.deepEqual(item,before);
 }finally{await cleanup();}
});
