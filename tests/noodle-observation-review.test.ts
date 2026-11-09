import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAcceptanceEvidence, ProofAssessment, ProofAssessmentItem, ProofCriterion, ProofDelivery, ProofEvidence, ProofReview} from "../lib/contracts.ts";
import {deliveryOverview} from "../lib/delivery-overview.ts";
import {deliveryResultFocus, deliveryResultStatus, type DeliveryResultInput} from "../lib/delivery-result-focus.ts";
import {noodleObservationReview} from "../lib/noodle-observation-review.ts";

const at = "2026-11-07T05:00:00Z";
const criteria: ProofCriterion[] = [
  {id:"coverage-1",title:"Navigation",source:"网站包含首页、菜单页 menu.html 和联系页 contact.html，首页可打开菜单页和联系页。"},
  {id:"mobile",title:"Mobile usability",source:"所有交付页面都必须能在手机屏幕上正常使用；必须由人实际检查。"},
  {id:"coverage-4",title:"Three-page mobile check",source:"首页、菜单页和联系页在手机上均可用，正文与导航可阅读及操作，无需横向滚动。"},
];
const evidence: ProofEvidence[] = criteria.map(({id})=>({id:`rule-${id}`,criterionId:id,finding:"needs_human",file:"index.html",excerpt:"Static source only.",explanation:"Inspect the delivered pages."}));
const items: ProofAssessmentItem[] = criteria.map(({id},index)=>({criterionId:id,status:"insufficient_evidence",explanation:"Original source-only result.",citations:[],ruleEvidenceIds:[`rule-${id}`],
  evidenceNeed:{schema:"source-evidence-need-v1",reason:index===0?"requirement_clarification":index===1?"browser_observation":"direct_observation",targetFiles:[]}}));
const review: ProofReview = {deliveryId:"v2",reviewedAt:at,mode:"demo",summary:"Controlled rule review"};
const report: ProofAssessment = {id:"report-v2",deliveryId:"v2",mode:"live",model:"controlled-test",method:"source-ai-v1",assessedAt:at,items,risks:[],limitations:[],coverage:{includedFiles:[],omittedFiles:[],truncatedFiles:[]}};
const manualChecks = criteria.map(row=>row.id);
const snapshot: ProofAcceptanceEvidence = {id:"snapshot-v2",deliveryId:"v2",at,browserReportId:null,layoutReportId:null,assessmentId:report.id,criteria,evidence,manualChecks,review,assessment:report,riskReviews:[]};
const baseline={deliveryId:"v2",report,criteria,evidence,review,mobileCriterionIds:["mobile","coverage-4"]};

test("draft and accepted evidence close only the confirmed original observations and keep the original assessment intact",()=>{
  const before=structuredClone({report,snapshot});
  const draft=noodleObservationReview({...baseline,selectedChecks:["mobile","coverage-4"]});
  assert.equal(draft?.state,"draft");
  assert.deepEqual(draft?.items,[{criterionId:"mobile",kind:"mobile"},{criterionId:"coverage-4",kind:"mobile"}]);
  assert.equal(noodleObservationReview(baseline),undefined);
  assert.deepEqual(noodleObservationReview({...baseline,snapshot}),{state:"saved",items:[{criterionId:"coverage-1",kind:"navigation"},...draft!.items]});
  assert.deepEqual({report,snapshot},before);
});

test("older or unreferenced reports, rule failures, and unresolved scope stay actionable",()=>{
  for(const change of [{report:{...report,id:"different-same-version-report"}},{report:{...report,deliveryId:"v1"}},{review:{...review,deliveryId:"v1"}},{snapshot:{...snapshot,assessmentId:null}}]){
    assert.equal(noodleObservationReview({...baseline,snapshot,...change}),undefined);
  }
  const changed=structuredClone(baseline);
  changed.evidence[0].finding="fail";
  changed.report.items[1].modelJudgment={status:"changes_suggested",explanation:"Real disagreement remains.",citations:[]};
  changed.report.items[2].evidenceNeed!.reason="page_scope";
  assert.equal(noodleObservationReview({...changed,selectedChecks:manualChecks}),undefined);
});

test("overview keeps historical counts and only removes covered observations from current attention",()=>{
  const delivery: ProofDelivery={id:"v2",variant:"upload",sequence:2,label:"Fictional v2",submittedAt:at,evidence,assessment:report};
  const input: DeliveryResultInput={delivery,overview:deliveryOverview({delivery,criteria,review,manualChecks}),layout:{state:"current",measured:6,total:6,overflow:0,unavailable:0},model:{state:"none",acceptance:"not_accepted"},language:"zh"};
  assert.equal(deliveryResultFocus(input).reason,"ai_insufficient");
  const selected=noodleObservationReview({...baseline,selectedChecks:manualChecks});
  const withDraft={...input,observationReview:selected};
  assert.equal(deliveryResultFocus(withDraft).reason,"observations_selected");
  assert.equal(deliveryResultStatus(withDraft).find(row=>row.id==="ai")?.attention,false);
  assert.match(deliveryResultStatus(withDraft).find(row=>row.id==="buyer-observation")!.text,/待随验收保存/u);
  assert.equal(input.overview.aiInsufficient,3);
});
