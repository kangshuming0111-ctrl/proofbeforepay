import type {Language,ProofAssessmentItem,ProofCriterion} from "../../lib/contracts.ts";
import {assessmentEvidenceNeedPresentation} from "../../lib/assessment-evidence-needs.ts";

export const ASSESSMENT_FEEDBACK_MAX_UTF16=1000;
export type AssessmentFeedbackDraft={comment:string;sourceExcerpted:boolean;explanationExcerpted:boolean};
/** Only the exact, matching agreed wording can supply requirement context. */
export function assessmentCriterionSource(criterion:ProofCriterion|undefined,criterionId:string):string|undefined{
 return criterion?.id===criterionId&&typeof criterion.source==="string"&&criterion.source.trim()?criterion.source:undefined;
}
/** UTF-16 is the existing feedback field's length unit; never split an astral character. */
function prefix(value:string,budget:number):string{
 const clipped=value.slice(0,Math.max(0,budget));
 return /[\uD800-\uDBFF]$/u.test(clipped)?clipped.slice(0,-1):clipped;
}
/** A labelled, editable request, not a finding, a runtime result or a sent mutation.
 * This reads the saved item explanation only; raw provider responses are not an input. */
export function buildAssessmentFeedbackDraft(criterion:ProofCriterion|undefined,item:ProofAssessmentItem,language:Language):AssessmentFeedbackDraft|undefined{
 const source=assessmentCriterionSource(criterion,item.criterionId);if(source===undefined)return undefined;
 const zh=language==="zh",explanation=item.explanation,insufficient=item.status==="insufficient_evidence";
 const need=insufficient?assessmentEvidenceNeedPresentation(item.evidenceNeed,language):undefined;
 let evidenceAction="";
 if(need&&!need.legacy){
  const fullFiles=need.targetFiles.join("; ");
  const files=fullFiles.length<=180
   ?(fullFiles?(zh?`相关源码文件（完整）：${fullFiles}`:`Related source files (complete): ${fullFiles}`):"")
   :(zh?`相关文件共 ${need.targetFiles.length} 个；本短草稿未包含完整文件清单。请先展开同一版本的补证提示核对，编辑补全后再发送。本草稿没有截短文件名。`:`There are ${need.targetFiles.length} related files; this short draft omits the full list. Expand this version's evidence-needed file list, check and complete the draft before sending; filenames are not shortened here.`);
  evidenceAction=`${zh?"补证下一步：":"Next evidence step: "}${need.nextStep}${files?`\n${files}`:""}\n\n`;
 }
 function compose(sourceText:string,explanationText:string,sourceExcerpted:boolean,explanationExcerpted:boolean){
  const intro=insufficient
   ?(zh?"补证草稿（AI 建议，待买家核对）：":"Evidence request draft (AI suggestion for buyer review):")
   :(zh?"修改草稿（AI 建议，待买家核对）：":"Change request draft (AI suggestion for buyer review):");
  const sourceLabel=sourceExcerpted?(zh?"锁定要求（原文节选；请查看完整约定）：":"Locked requirement (source excerpt; inspect the complete agreed wording):"):(zh?"锁定要求（完整原文）：":"Locked requirement (complete source):");
  const explanationLabel=explanationExcerpted?(zh?"当前 AI 说明（节选；未运行验证）：":"Current AI explanation (excerpt; not verified by execution):"):(zh?"当前 AI 说明（未运行验证）：":"Current AI explanation (not verified by execution):");
  const next=insufficient
   ?(zh?"请补充可复查的交付证据，并逐项对照完整锁定原文。此草稿尚未发送，也不是验收结论。":"Please provide verifiable delivery evidence against the full locked wording. This draft is not sent and is not an acceptance decision.")
   :(zh?"请核对完整约定与证据后修改或说明；AI 建议本身不认定违约。此草稿尚未发送，也不是验收结论。":"Review the full agreement and evidence, then correct or explain the issue. An AI suggestion alone does not establish a breach. This draft is not sent and is not an acceptance decision.");
  return `${intro}\n${sourceLabel}\n${sourceText}\n\n${explanationLabel}\n${explanationText}\n\n${evidenceAction}${next}`;
 }
 const complete=compose(source,explanation,false,false);
 if(complete.length<=ASSESSMENT_FEEDBACK_MAX_UTF16)return{comment:complete,sourceExcerpted:false,explanationExcerpted:false};
 // Reserve the longer labels and the entire action/limit notice first. Source
 // gets priority; short sections donate unused room to the other section.
 const available=ASSESSMENT_FEEDBACK_MAX_UTF16-compose("","",true,true).length;
 let sourceBudget=Math.min(source.length,Math.floor(available*.65));
 const explanationBudget=Math.min(explanation.length,available-sourceBudget);
 sourceBudget+=Math.min(source.length-sourceBudget,available-sourceBudget-explanationBudget);
 const sourceText=prefix(source,sourceBudget),explanationText=prefix(explanation,explanationBudget);
 const sourceExcerpted=sourceText.length<source.length,explanationExcerpted=explanationText.length<explanation.length;
 return{comment:compose(sourceText,explanationText,sourceExcerpted,explanationExcerpted),sourceExcerpted,explanationExcerpted};
}
