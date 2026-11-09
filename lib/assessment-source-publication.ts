import {parse,type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation,ProofAssessmentItem,ProofAssessmentSourceFinding,ProofCriterion,ProofEvidence,ProofAssessmentPublicationBasis} from "./contracts.ts";
import {assessmentEvidenceScope} from "./assessment-evidence-scope.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";
import {createAssessmentSourceFindingCheck,sourceFindingVersionForPublication,type SourceFindingInputs,type SourcePublicationSchema} from "./assessment-source-findings.ts";
import {createSourceBusinessEvidenceCheck,createIndependentSourceBusinessFactCheck,assessSourceBusinessCitationWitness} from "./source-business-evidence.ts";
import {createAssessmentLabelSourceFactsCheck} from "./assessment-label-citations.ts";
import {parseSourceLiteralDirective} from "./source-literal-directive.ts";
import {createMenuDomSourceBusinessFactCheckV2} from "./menu-dom-source-v2.ts";
import {createMenuDomSourceBusinessFactCheckV3, createStrictMenuPriceEvidenceCheckV3} from "./menu-dom-source-v3.ts";
import {assessMenuPricePublicationAdmissionV2, assessMenuPricePublicationAdmissionV3} from "./menu-source-publication-v2.ts";
import {staticFileKind} from "./static-resources.ts";
import {BILINGUAL_MENU_PRICE_COMPLETENESS,isOriginalBilingualMenuPriceStep,priceOnlyOriginalForVersion,type RequirementCompletenessVersion} from "./assessment-requirement-completeness.ts";

export type SourcePublicationGuardReason="locked_price_mismatch"|"confirmed_form_label_absence"|"locked_price_match";
export type SourcePublicationCandidate={
  rawStatus:ProofAssessmentItem["status"];
  rawCitations:readonly ProofAssessmentCitation[];
  guardedStatus:ProofAssessmentItem["status"];
  /** Set only at the actual matching legacy downgrade branch in production.
   * Offline consistency replay also independently reproduces that premise. */
  guardReason?:SourcePublicationGuardReason;
};
export type SourcePublicationDecision={
  publicationBasis:ProofAssessmentPublicationBasis;
  status:"changes_suggested"|"supported";
  explanation:string;citations:ProofAssessmentCitation[];sourceFinding:ProofAssessmentSourceFinding;
};
export type SourcePublicationInputs=Omit<SourceFindingInputs,"version">&{ruleEvidence:readonly Pick<ProofEvidence,"criterionId"|"finding">[];requirementCompletenessVersion?:RequirementCompletenessVersion;publicationSchema?:SourcePublicationSchema};

/** Extra conservative admission for the NEW affirmative exception only.
 * It is not CSS/rendering analysis. Unfamiliar styling remains unknown. */
function plainPositivePriceOwners(files:Record<string,string>,citations:readonly ProofAssessmentCitation[]):boolean{
 for(const[file,source]of Object.entries(files))if(staticFileKind(file)==="css"){
  const css=source.replace(/[\t\n\f\r ]/gu,"");
  if(css!==""&&!/^body\{font-family:system-ui;?\}$/u.test(css))return false;
 }
 type Node=DefaultTreeAdapterTypes.Node;type Element=DefaultTreeAdapterTypes.Element;
 const element=(n:Node):n is Element=>"tagName"in n;
 for(const file of new Set(citations.map(c=>c.file))){
  let invalid=false,visits=0;const document=parse(files[file],{sourceCodeLocationInfo:true,scriptingEnabled:true,onParseError:e=>{if(e.code!=="missing-doctype")invalid=true;}});
  if(invalid)return false;const found=new Set<number>(),stack:{node:Node;body:boolean;depth:number}[]=[{node:document,body:false,depth:0}];
  while(stack.length){const{node,body,depth}=stack.pop()!;if(++visits>50000||depth>512)return false;let inside=body;
   if(element(node)){
    if(node.namespaceURI!=="http://www.w3.org/1999/xhtml")return false;
    // A plain template is inert. Declarative shadow DOM/attributes are not
    // covered by this narrow affirmative rule; its content is never borrowed.
    if(node.tagName==="template"){if(node.attrs.length)return false;continue;}
    // Default-hidden/interactive/foreign containers and navigation metadata
    // are outside this affirmative exception. A finite static tag set avoids
    // inferring safety from an ever-growing blacklist of native elements.
    if(!["html","head","title","meta","body","main","section","article","header","footer","nav","div","p","ul","ol","li","h1","h2","h3","h4","h5","h6","br","hr"].includes(node.tagName))return false;
    if(node.tagName==="meta"&&(node.attrs.length!==1||node.attrs[0].name!=="charset"))return false;
    // Unknown attributes can change default display/interaction (for example
    // popover). Only this finite inert metadata set is admitted; this is not a
    // growing list of hidden-state spellings or a CSS/browser evaluator.
    if(node.tagName!=="meta"&&node.attrs.some(a=>!!a.namespace||!["id","title","lang"].includes(a.name)))return false;
    inside ||= node.tagName==="body";
    if(inside&&["p","li"].includes(node.tagName)&&node.childNodes.length===1&&node.childNodes[0].nodeName==="#text"){
     const at=node.sourceCodeLocation;
     for(const[index,c]of citations.entries())if(c.file===file&&at?.startTag&&at.endTag&&at.startOffset===c.start&&at.endOffset===c.end&&files[file].slice(c.start,c.end)===c.excerpt)found.add(index);
    }
   }
   if("childNodes"in node)for(const child of node.childNodes)stack.push({node:child,body:inside,depth:depth+1});
  }
  if(citations.some((c,index)=>c.file===file&&!found.has(index)))return false;
 }
 return true;
}

/** A bounded source-based publication restoration, never a model correction.
 * The strict checker stays unchanged. Two negative branches and one narrowly
 * witnessed plain-price positive branch use independently proved source facts.
 * No raw unknown, runtime, ambiguity or citation subset is promoted. */
export function createSourcePublicationCheck(input:SourcePublicationInputs){
 const files={...input.files},coverage=structuredClone(input.coverage),steps=structuredClone(input.businessSteps),scope=input.scope?structuredClone(input.scope):undefined;
 const schema=input.publicationSchema??"source-publication-v1";
 const rules=structuredClone(input.ruleEvidence),completenessVersion=input.requirementCompletenessVersion??"bounded-original-zh-v1";
 const sourceCheck=createAssessmentSourceFindingCheck({...input,files,coverage,businessSteps:steps,scope,version:sourceFindingVersionForPublication(schema)});
 const legacyPrice = (schema === "source-publication-v3" ? createStrictMenuPriceEvidenceCheckV3 : createSourceBusinessEvidenceCheck)(files, steps);
 const readPriceFacts = schema === "source-publication-v3" ? createMenuDomSourceBusinessFactCheckV3
   : schema === "source-publication-v2" ? createMenuDomSourceBusinessFactCheckV2
   : createIndependentSourceBusinessFactCheck;
 const priceFacts = readPriceFacts(files, steps);
 const restoreReasons = schema === "source-publication-v1" ? ["dynamic_or_unsupported_source"]
   : ["dynamic_or_unsupported_source", "complex_or_unlocated_item"];
 const admitPrice = schema === "source-publication-v3" ? assessMenuPricePublicationAdmissionV3
   : schema === "source-publication-v2" ? assessMenuPricePublicationAdmissionV2 : undefined;
 const legacyLabels=createAssessmentLabelSourceFactsCheck(files,coverage);
 const exact=(c:ProofAssessmentCitation)=>Object.hasOwn(files,c.file)&&Number.isSafeInteger(c.start)&&Number.isSafeInteger(c.end)&&c.start>=0&&c.end>c.start&&c.end<=files[c.file].length&&c.excerpt===files[c.file].slice(c.start,c.end)&&c.excerpt.length<=500;
 return(criterion:ProofCriterion,candidate:SourcePublicationCandidate):SourcePublicationDecision|undefined=>{
  const positive=candidate.guardReason==="locked_price_match",expectedStatus=positive?"supported":"changes_suggested";
  if(candidate.rawStatus!==expectedStatus||candidate.guardedStatus!=="insufficient_evidence"||!candidate.guardReason
   ||!candidate.rawCitations.length||candidate.rawCitations.length>ASSESSMENT_ITEM_CITATION_LIMIT||!candidate.rawCitations.every(exact)
   ||assessmentEvidenceScope(criterion).category!=="source_text"||rules.some(r=>r.criterionId===criterion.id&&r.finding==="fail"))return;
  const html=Object.keys(files).filter(file=>staticFileKind(file)==="html");
  if(!html.length||coverage.truncatedFiles.length||coverage.omittedFiles.some(file=>staticFileKind(file)==="html")
   ||html.some(file=>!coverage.includedFiles.includes(file))
   ||coverage.includedFiles.some(file=>staticFileKind(file)==="html"&&!Object.hasOwn(files,file)))return;
  const fact=sourceCheck(criterion);
  if(!fact||fact.status!==expectedStatus||!fact.citations.length||fact.citations.length>ASSESSMENT_ITEM_CITATION_LIMIT||!fact.citations.every(exact))return;
  const selected=steps.filter(s=>s.criterionId===criterion.id);
  if(candidate.guardReason==="locked_price_mismatch"||positive){
   if(fact.basis!=="locked_business_values"||!selected.length||selected.some(s=>s.expected.kind!=="item_price"))return;
   const legacy=legacyPrice(criterion.id),independent=priceFacts(criterion.id);
   if(schema==="source-publication-v3"&&completenessVersion===BILINGUAL_MENU_PRICE_COMPLETENESS&&selected.some(isOriginalBilingualMenuPriceStep)){
    if(!priceOnlyOriginalForVersion(criterion,selected,completenessVersion)||
     independent.kind!==(positive?"unchanged":"mismatch")||independent.checks.length!==2||independent.checks.some(check=>check.kind==="unknown"||!check.citation)||fact.citations.length!==2||
     !assessMenuPricePublicationAdmissionV3(files,fact,candidate.rawCitations,coverage,expectedStatus))return;
   }else if(positive){
    if(!priceOnlyOriginalForVersion(criterion,selected,completenessVersion))return;
    if(legacy.kind!=="unknown"||!legacy.checks.length||legacy.checks.some(c=>c.kind!=="unknown"||!restoreReasons.includes(c.reason))
     ||independent.kind!=="unchanged"||independent.checks.some(c=>c.kind!=="unchanged"||!c.citation)
     ||legacy.checks.length!==independent.checks.length||legacy.checks.some((c,i)=>c.checkId!==independent.checks[i].checkId||c.file!==independent.checks[i].file)
     ||assessSourceBusinessCitationWitness(independent,candidate.rawCitations).kind!=="covered"
     ||!(admitPrice ? admitPrice(files, fact, candidate.rawCitations, coverage) : plainPositivePriceOwners(files, fact.citations)))return;
   }else if(legacy.kind!=="unknown"||!legacy.checks.some(c=>c.kind==="unknown")
    ||legacy.checks.some(c=>c.kind==="unknown"&&!restoreReasons.includes(c.reason))
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
  return{publicationBasis:{schema,reason:candidate.guardReason},status:expectedStatus,explanation:fact.explanation,citations:structuredClone(fact.citations),sourceFinding:fact};
 };
}
