import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {openingHoursEvidenceGuide} from "../app/components/noodle-hours-guidance.ts";
import {assessmentComponentModule} from "./assessment-component-harness.ts";
import type {ProofAssessment, ProofAssessmentItem, ProofBusinessCheckStep, ProofCriterion} from "../lib/contracts.ts";

const criterion: ProofCriterion = {id:"coverage-3",title:"Original requirement 3",source:"菜单的牛肉面和Beef noodles标价必须为AUD18且营业时间必须为上午11点到晚上8点。"};
const policy = {schema:"requirement-completeness-v1",version:"bilingual-bounded-v2"} as const;
const price = {file:"menu.html",start:0,end:26,excerpt:"<p>Beef noodles AUD18</p>"};
const steps: ProofBusinessCheckStep[] = ["牛肉面","Beef noodles"].map((label,index)=>({
  stepId:`step-${index}`,checkId:`price-${index}`,criterionId:criterion.id,file:"menu.html",viewportWidth:375,
  source:{start:0,end:criterion.source.length,excerpt:criterion.source},expected:{kind:"item_price",label,amountMinor:1800,currency:"AUD"},
}));
const item: ProofAssessmentItem = {criterionId:criterion.id,status:"insufficient_evidence",explanation:"The hours are missing from menu.html (a model inference).",
  citations:[price],ruleEvidenceIds:[],evidenceNeed:{schema:"source-evidence-need-v1",reason:"model_unresolved",targetFiles:[]},
  modelJudgment:{status:"insufficient_evidence",explanation:"Original model text, kept separately.",citations:[price]},
  sourceFinding:{version:"source-finding-v2",status:"supported",basis:"locked_business_values",explanation:"Locked prices supported only.",citations:[price],files:["menu.html"]}};
const report: ProofAssessment = {id:"assessment",deliveryId:"noodle-v2",method:"source-ai-v1",mode:"live",model:"synthetic-no-provider-call",assessedAt:"2026-11-07T00:00:00Z",
  items:[item],risks:[],limitations:[],coverage:{includedFiles:["menu.html"],omittedFiles:[],truncatedFiles:[]},requirementCompletenessPolicy:policy};

test("exact bilingual price/hours originals identify the remaining duty without assigning an hours page or importing AI prose",()=>{
  const english = {...criterion,source:"The menu must list 牛肉面 and Beef noodles at AUD18 and opening hours must be from 11 am to 8 pm."};
  for (const [clause,expected] of [[criterion,"营业时间必须为上午11点到晚上8点"],[english,"opening hours must be from 11 am to 8 pm"]] as const) {
    for (const language of ["zh","en"] as const) {
      const guide=openingHoursEvidenceGuide(clause,item,steps,policy,language);
      assert.ok(guide);
      assert.ok(guide.instructions.includes(expected));
      assert.ok(guide.draft.endsWith(clause.source));
      assert.ok(guide.draft.length<=1000);
      assert.doesNotMatch(guide.draft,/menu\.html|model inference|missing from/u);
    }
  }
});

test("wrong or missing typed price scope and extra/conditional/quoted hours keep the prior conservative fallback",()=>{
  for(const source of [criterion.source+"并必须显示电话。",criterion.source.replace("必须为上午","不得为上午"),criterion.source.replace("11点","13点"),
    'The menu must list "Beef noodles and opening hours" at AUD18.',criterion.source.replace("AUD18","AUD28")]) {
    assert.equal(openingHoursEvidenceGuide({...criterion,source},item,steps,policy,"en"),undefined);
  }
  for(const variant of [{...item,criterionId:"other"},{...item,status:"changes_suggested" as const},{...item,sourceFinding:undefined}]) {
    assert.equal(openingHoursEvidenceGuide(criterion,variant,steps,policy,"en"),undefined);
  }
  assert.equal(openingHoursEvidenceGuide(criterion,item,steps.slice(0,1),policy,"en"),undefined);
  assert.equal(openingHoursEvidenceGuide(criterion,item,steps,undefined,"en"),undefined);
});

function button(tree:any,label:string):any {
  if(Array.isArray(tree))return tree.map(child=>button(child,label)).find(Boolean);
  if(!tree?.props)return;
  if(tree.type==="button"&&tree.props.children===label)return tree;
  return button(tree.props.children,label);
}

test("actual assessment renders the missing hours action and creates only an editable current-version draft; history and confirmation keep existing presentation",async()=>{
  const {Component,cleanup}=await assessmentComponentModule(true);
  try{
    const before=structuredClone(report),calls:unknown[]=[];
    const props={report,criteria:[criterion],scopeSteps:steps,language:"en",onPrepareFeedback:(draft:unknown)=>calls.push(draft),onRun:()=>assert.fail("should not run the model")};
    const tree=Component(props),html=renderToStaticMarkup(tree),label="Draft an opening-hours evidence request";
    assert.match(html,/Opening hours still need review/u);
    assert.match(html,/Original model text, kept separately/u);
    assert.match(html,/The whole requirement still needs review/u);
    assert.deepEqual(calls,[]);
    const action=button(tree,label);assert.ok(action);
    action.props.onClick();
    assert.deepEqual(calls,[{deliveryId:report.deliveryId,criterionId:criterion.id,comment:openingHoursEvidenceGuide(criterion,item,steps,policy,"en")!.draft}]);
    assert.deepEqual(report,before);
    for(const variant of [{readOnly:true},{confirmedCriteria:[criterion.id]}]) {
      const rendered=Component({...props,...variant});assert.equal(button(rendered,label),undefined);
      assert.doesNotMatch(renderToStaticMarkup(rendered),/Opening hours still need review/u);
    }
  }finally{await cleanup();}
});
