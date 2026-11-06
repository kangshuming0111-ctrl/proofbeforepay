import type {ProofAssessmentCitation,ProofAssessmentItem,ProofAssessmentSourceFinding,ProofCriterion,ProofEvidence} from "./contracts.ts";
import {assessmentEvidenceScope} from "./assessment-evidence-scope.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";
import {createAssessmentSourceFindingCheck,type SourceFindingInputs} from "./assessment-source-findings.ts";
import {createSourceBusinessEvidenceCheck,createIndependentSourceBusinessFactCheck} from "./source-business-evidence.ts";
import {createAssessmentLabelSourceFactsCheck} from "./assessment-label-citations.ts";
import {parseSourceLiteralDirective} from "./source-literal-directive.ts";
import {staticFileKind} from "./static-resources.ts";

export type SourcePublicationGuardReason="locked_price_mismatch"|"confirmed_form_label_absence";
export type SourcePublicationCandidate={
  rawStatus:ProofAssessmentItem["status"];
  rawCitations:readonly ProofAssessmentCitation[];
  guardedStatus:ProofAssessmentItem["status"];
  /** Set only at the actual matching legacy downgrade branch in production.
   * Offline consistency replay also independently reproduces that premise. */
  guardReason?:SourcePublicationGuardReason;
};
export type SourcePublicationDecision={
  publicationBasis:{schema:"source-publication-v1";reason:SourcePublicationGuardReason};
  status:"changes_suggested";
  explanation:string;citations:ProofAssessmentCitation[];sourceFinding:ProofAssessmentSourceFinding;
};
export type SourcePublicationInputs=SourceFindingInputs&{ruleEvidence:readonly Pick<ProofEvidence,"criterionId"|"finding">[]};

/** A bounded source-based publication restoration, never a model correction.
 * The strict checker stays unchanged. Only its two reproduced negative
 * downgrade families can use complete independently proved source mismatch.
 * No raw unknown/supported, runtime, ambiguity or citation subset is promoted. */
export function createSourcePublicationCheck(input:SourcePublicationInputs){
 const files={...input.files},coverage=structuredClone(input.coverage),steps=structuredClone(input.businessSteps),scope=input.scope?structuredClone(input.scope):undefined;
 const rules=structuredClone(input.ruleEvidence);
 const sourceCheck=createAssessmentSourceFindingCheck({...input,files,coverage,businessSteps:steps,scope});
 const legacyPrice=createSourceBusinessEvidenceCheck(files,steps),priceFacts=createIndependentSourceBusinessFactCheck(files,steps);
 const legacyLabels=createAssessmentLabelSourceFactsCheck(files,coverage);
 const exact=(c:ProofAssessmentCitation)=>Object.hasOwn(files,c.file)&&Number.isSafeInteger(c.start)&&Number.isSafeInteger(c.end)&&c.start>=0&&c.end>c.start&&c.end<=files[c.file].length&&c.excerpt===files[c.file].slice(c.start,c.end)&&c.excerpt.length<=500;
 return(criterion:ProofCriterion,candidate:SourcePublicationCandidate):SourcePublicationDecision|undefined=>{
  if(candidate.rawStatus!=="changes_suggested"||candidate.guardedStatus!=="insufficient_evidence"||!candidate.guardReason
   ||!candidate.rawCitations.length||candidate.rawCitations.length>ASSESSMENT_ITEM_CITATION_LIMIT||!candidate.rawCitations.every(exact)
   ||assessmentEvidenceScope(criterion).category!=="source_text"||rules.some(r=>r.criterionId===criterion.id&&r.finding==="fail"))return;
  const html=Object.keys(files).filter(file=>staticFileKind(file)==="html");
  if(!html.length||coverage.truncatedFiles.length||coverage.omittedFiles.some(file=>staticFileKind(file)==="html")
   ||html.some(file=>!coverage.includedFiles.includes(file))
   ||coverage.includedFiles.some(file=>staticFileKind(file)==="html"&&!Object.hasOwn(files,file)))return;
  const fact=sourceCheck(criterion);
  if(!fact||fact.status!=="changes_suggested"||!fact.citations.length||fact.citations.length>ASSESSMENT_ITEM_CITATION_LIMIT||!fact.citations.every(exact))return;
  const selected=steps.filter(s=>s.criterionId===criterion.id);
  if(candidate.guardReason==="locked_price_mismatch"){
   if(fact.basis!=="locked_business_values"||!selected.length||selected.some(s=>s.expected.kind!=="item_price"))return;
   const legacy=legacyPrice(criterion.id),independent=priceFacts(criterion.id);
   if(legacy.kind!=="unknown"||!legacy.checks.some(c=>c.kind==="unknown")
    ||legacy.checks.some(c=>c.kind==="unknown"&&c.reason!=="dynamic_or_unsupported_source")
    ||independent.kind!=="mismatch"||independent.checks.some(c=>c.kind==="unknown"||!c.citation))return;
  }else if(candidate.guardReason==="confirmed_form_label_absence"){
   const descriptor=parseSourceLiteralDirective(criterion.source);
   if(selected.length||descriptor?.kind!=="html_labels"||descriptor.context!=="form"
    ||fact.basis!=="declared_html_labels"||fact.scopeBinding?.kind!=="form"||!fact.scopeBinding.formId)return;
   const old=legacyLabels(criterion,candidate.rawCitations,"changes_suggested");
   if(old.kind!=="unknown"||old.reason!=="source_disagrees_with_change")return;
  }else return;
  // Preserve the entire fact-citation set. Trimming would hide an unresolved
  // seven/eight-citation requirement behind a smaller publication budget.
  return{publicationBasis:{schema:"source-publication-v1",reason:candidate.guardReason},status:"changes_suggested",explanation:fact.explanation,citations:structuredClone(fact.citations),sourceFinding:fact};
 };
}
