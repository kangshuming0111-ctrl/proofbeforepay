import {resolveScopeClarifications,resolveAssessmentScopeContext,scopeConfirmationMode,assessmentHistoryFor,type ScopeClarification,type ScopeConfirmationMode} from "./scope-clarifications.ts";
import {validateCooperativeStageReports} from "./cooperative-stage-evidence.ts";
import {validateSavedEnquiryEvidence,validateEnquiryReportDecision,projectEnquiryReportsFor} from "./project-enquiry.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT, ASSESSMENT_RISK_CITATION_LIMIT} from "./assessment-limits.ts";
import {ASSESSMENT_EVIDENCE_NEED_REASONS} from "./assessment-evidence-needs.ts";
import {isAssessmentObligations} from "./assessment-obligations.ts";
import {BILINGUAL_MENU_PRICE_COMPLETENESS,createRequirementCompletenessCheck,originalBilingualMenuPriceSteps} from "./assessment-requirement-completeness.ts";
import {finiteContactPresenceScopeCriterionIds,observationOnlyCustomScopeCriterionIds,type ObservationScopeContext} from "./assessment-publication-policy.ts";
import {staticFileKind} from "./static-resources.ts";
import type {Language, ProofAssessment, ProofAssessmentItem, ProofCriterion, ProofDelivery, ProofEvidence, ProofQuote, ProofFeedback, StaticProjectSpec} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {createUploadedDelivery, parseStaticProject, validateStaticFiles} from "./static-project.ts";
import {getProofFixture, inspectProofFiles, proofCriteria} from "./proof-evidence.ts";
import {runtimeDeliveryDigest, runtimeReportsFor, deliveryRuntimeTarget, savedRuntimePlan} from "./runtime-project.ts";
import {runtimeIdentifier,validateRuntimeReport} from "./runtime-checks.ts";
import {savedProjectJourneyPlan,projectJourneyReportsFor,validateProjectJourneyPlan,validateStoredProjectJourneyReport,evaluateStoredProjectJourneyReport,sameJourneyRegistration} from "./project-journey.ts";
import {validateSavedJourneySuggestions,validateSavedJourneyAdoption} from "./journey-plan-adoption.ts";
import {modelEvidenceBinding,validateModelEvidenceExplanation} from "./model-evidence-explanation.ts";
import {modelDiagnosisExplanationPacket} from "./model-diagnostics.ts";
import {validateJourneyEvidenceExplanation} from "./journey-evidence-explanation.ts";
import {sameRuntimeRegistration} from "./runtime-registration.ts";
import {browserReportsFor, businessReportsFor, layoutReportsFor} from "./acceptance-evidence.ts";
import {validateSavedCoverage} from "./requirement-coverage.ts";
import {createBrowserCheckReport} from "./browser-check-report.ts";
import {createBusinessCheckReport,getBusinessCheckPlan} from "./business-checks.ts";
import {createAssessmentSourceFindingCheck,sourceFindingVersionForPublication} from "./assessment-source-findings.ts";
import {assessMenuPricePublicationAdmissionV2,assessMenuPricePublicationAdmissionV3} from "./menu-source-publication-v2.ts";
import {createStrictMenuPriceEvidenceCheckV3,UNCONFIRMED_MENU_CARD_OWNER} from "./menu-dom-source-v3.ts";
import {assessScopedLabelPublication} from "./scoped-label-publication.ts";
import {createLayoutReport} from "./layout-report.ts";
import {assertModelAcceptanceReference,modelReportsFor} from "./model-check-actions.ts";
import {MODEL_SPEC_DIGEST,modelCheckReportFromTrace,validateStoredModelCheckReport} from "./model-checks.ts";
import {validateRiskRepairRecords,type RiskRepairEvent} from "./risk-repairs.ts";
import {validateModelArchive} from "./model-report-archive.ts";
import {createSourcePublicationCheck} from "./assessment-source-publication.ts";

export const EVIDENCE_EXPORT_SCHEMA = "proofbeforepay-evidence-export-v1";
export const EVIDENCE_EXPORT_RULES = "pbp-static-source-v2";
export const EVIDENCE_EXPORT_BYTE_LIMIT = 4 * 1024 * 1024;
const DELIVERY_KEYS = ["cooperativeStageReports","id","variant","sequence","label","submittedAt","files","evidence","resources","layoutReport","layoutHistory","browserChecks","browserCheckHistory","businessChecks","businessCheckHistory","assessment","assessmentHistory","riskReviews","acceptanceEvidence","backendTargetId","runtimeDeliveryDigest","runtimeRegistration","runtimeReport","runtimeHistory","runtimeRun","journeyPlan","journeyReport","journeyHistory","journeyPlanSuggestions","journeyPlanAdoption","journeyExplanation","modelRun","modelReport","modelHistory","modelArchiveRefs","modelArchive","modelExplanation","enquiryPlan","enquiryRun","enquiryReport","enquiryHistory"] as const;
const SNAPSHOT_KEYS = ["id","deliveryId","at","browserReportId","layoutReportId","assessmentId","businessReportId","businessExceptionReason","runtimeReportId","runtimeExceptionReason","runtimeAcknowledgedSteps","runtimeDeliveryDigest","runtimeTargetId","runtimeRegistration","journeyReportId","journeyDeliveryDigest","journeyPlanDigest","journeyRegistration","journeyExceptionReason","journeyAcknowledgedSteps","journeyClientObservationAcknowledged","modelReportId","modelSpecDigest","modelDeliveryDigest","modelDecision","enquiryReportId","enquiryDeliveryDigest","enquiryDecision","criteria","evidence","manualChecks","review","assessment","riskReviews"];
type AcceptanceReference = {kind:"delivery-acceptance"|"capture-consent";deliveryId:string;evidenceSnapshotId:string|null};
export type EvidenceExport = {
  schema:typeof EVIDENCE_EXPORT_SCHEMA; verificationRules:typeof EVIDENCE_EXPORT_RULES; scope:"current-delivery-only";
  project:{id:string;reference:string;title:string;summary:string;language:Language;criteria:ProofCriterion[];scopeClarifications?:ScopeClarification[];scopeConfirmationMode?:ScopeConfirmationMode;spec?:StaticProjectSpec;requirements?:{sourceText:string;sourceRefs:{criterionId:string;source:{start:number;end:number;excerpt:string}}[]}};
  delivery:ProofDelivery; fileDigest:string; acceptanceReferences:AcceptanceReference[];
  riskRepairs?:{schema:"pbp-risk-repairs-v1";feedback:ProofFeedback[];events:RiskRepairEvent[]};
};
export type EvidenceVerification = {
  schema:"proofbeforepay-evidence-verification-v1";consistency:"consistent"|"inconsistent"|"unsupported";
  checks:{id:string;status:"consistent"|"inconsistent";message:string}[];
  limits:{scope:"current-delivery-only";authenticity:"not-proven";backendExecution:"not-proven";modelJudgment:"not-proven";payment:"not-proven";previousVersions:"not-included";networkRequests:0};
};
const limits = {scope:"current-delivery-only",authenticity:"not-proven",backendExecution:"not-proven",modelJudgment:"not-proven",payment:"not-proven",previousVersions:"not-included",networkRequests:0} as const;

function fail(message:string):never {throw new DomainError(message);}
function requireValue(condition:unknown,message:string):asserts condition {if(!condition)fail(message);}
function object(value:unknown,allowed:readonly string[],label:string):Record<string,unknown>{
  requireValue(!!value&&typeof value==="object"&&!Array.isArray(value),`${label} must be an object.`);
  const record=value as Record<string,unknown>;
  requireValue(Object.keys(record).every(key=>allowed.includes(key)),`${label} contains unsupported fields.`);
  return record;
}
function text(value:unknown,max=3000):string {requireValue(typeof value==="string"&&value.trim().length>0&&value.length<=max,"A bounded nonempty text value is required.");return value;}
function array(value:unknown,max:number,label:string):unknown[]{requireValue(Array.isArray(value)&&value.length<=max,`${label} must be a bounded array.`);return value;}
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(!value||typeof value!=="object")return value;
  const keys=Object.keys(value),record=value as Record<string,unknown>;
  // Source spans keep the existing domain helpers' field order; all other
  // metadata keys sort consistently. Arrays and source-file strings stay exact.
  const ordered=keys.length===3&&["start","end","excerpt"].every(key=>keys.includes(key))?["start","end","excerpt"]:keys.sort((a,b)=>a.localeCompare(b,"en"));
  return Object.fromEntries(ordered.map(key=>[key,canonical(record[key])]));
}
function same(left:unknown,right:unknown):boolean {return JSON.stringify(canonical(left))===JSON.stringify(canonical(right));}
function immutableIds(records:unknown[]):void{
  const byId=new Map<string,unknown>();
  for(const entry of records){const id=text((entry as Record<string,unknown>).id,100);requireValue(!byId.has(id)||same(byId.get(id),entry),"An immutable identifier has conflicting contents.");byId.set(id,entry);}
}
function pick<T extends object>(value:T,keys:readonly string[]):Record<string,unknown>{return Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)&&(value as Record<string,unknown>)[key]!==undefined).map(key=>[key,(value as Record<string,unknown>)[key]]));}
function exportFiles(delivery:ProofDelivery,custom:boolean):Record<string,string>{
  if(custom||delivery.variant==="upload")return validateStaticFiles(delivery.files);
  requireValue(delivery.variant==="flawed"||delivery.variant==="fixed","Unknown built-in delivery.");
  const expected=getProofFixture(delivery.variant).files,names=Object.keys(expected);
  const files=object(delivery.files,names,"Built-in files");requireValue(Object.keys(files).length===names.length,"Built-in file inventory is incomplete.");
  const name="delivery-manifest.json",source=text(files[name],2048);requireValue(new TextEncoder().encode(source).byteLength<=2048,"Built-in manifest exceeds its byte limit.");
  const manifest=object(JSON.parse(source),["sample","label","htmlPages"],"Built-in manifest"),expectedManifest=JSON.parse(expected[name]);
  requireValue(manifest.sample===true&&manifest.label===expectedManifest.label&&same(manifest.htmlPages,expectedManifest.htmlPages),"Built-in manifest differs from its controlled inventory.");
  const content=validateStaticFiles(Object.fromEntries(Object.entries(files).filter(([file])=>file!==name)));
  return {...content,[name]:source}; // Include original manifest bytes in the full-map digest.
}

/** Reject getters, prototypes, cycles and oversized/deep structures before any
 * serialization or domain helper can inspect an untrusted import. */
function boundedJson(value:unknown):void {
  const ancestors=new Set<object>();let nodes=0,characters=0;
  const visit=(entry:unknown,depth:number)=>{
    requireValue(++nodes<=60000&&depth<=32,"Evidence exceeds the structural budget.");
    if(typeof entry==="string"){characters+=entry.length;requireValue(characters<=EVIDENCE_EXPORT_BYTE_LIMIT,"Evidence exceeds the character budget.");return;}
    if(entry===null||typeof entry==="boolean")return;
    if(typeof entry==="number"){requireValue(Number.isFinite(entry),"Evidence numbers must be finite.");return;}
    requireValue(!!entry&&typeof entry==="object"&&(Array.isArray(entry)||[Object.prototype,null].includes(Object.getPrototypeOf(entry))),"Evidence must contain plain JSON data.");
    if(Array.isArray(entry))requireValue(entry.length<=60000&&Object.keys(entry).length===entry.length,"Evidence arrays must be bounded and dense.");
    requireValue(!ancestors.has(entry),"Evidence cannot contain cycles.");ancestors.add(entry);
    for(const key of Reflect.ownKeys(entry)){
      if(Array.isArray(entry)&&key==="length")continue;
      const descriptor=Object.getOwnPropertyDescriptor(entry,key)!;
      requireValue(typeof key==="string"&&!['__proto__','prototype','constructor'].includes(key)&&"value" in descriptor&&descriptor.enumerable,"Evidence must contain ordinary JSON fields.");
      characters+=key.length;requireValue(characters<=EVIDENCE_EXPORT_BYTE_LIMIT,"Evidence exceeds the character budget.");
      visit(descriptor.value,depth+1);
    }
    ancestors.delete(entry);
  };
  visit(value,0);
  requireValue(new TextEncoder().encode(JSON.stringify(value)).byteLength<=EVIDENCE_EXPORT_BYTE_LIMIT,"Evidence exceeds the byte budget.");
}

/** Reject unknown nested metadata instead of exporting accidental private fields. */
function dataShapes(bundle:EvidenceExport):void{
  const {spec,requirements}=bundle.project,delivery=bundle.delivery;
  if(spec){object(spec,["requiredPages","link","links","manualRequirements","coverage","businessChecks","runtimeCheck"],"Locked project");for(const link of [...(spec.link?[spec.link]:[]),...array(spec.links??[],5,"Local links")])object(link,["from","text","to"],"Local link");}
  if(requirements){object(requirements,["sourceText","sourceRefs"],"Original requirements");for(const entry of array(requirements.sourceRefs,66,"Original references")){const row=object(entry,["criterionId","source"],"Original reference");sourceReference(row.source,requirements.sourceText);}}
  const riskReviews=(value:unknown)=>{for(const entry of array(value??[],100,"Risk reviews"))object(entry,["id","deliveryId","assessmentId","riskIndex","riskOrigin","decision","reason","actorRole","reviewedAt"],"Risk review");};
  const review=(value:unknown)=>{if(value!==undefined)object(value,["deliveryId","reviewedAt","mode","summary"],"Rule review");};
  for(const key of ["browserChecks","browserCheckHistory","businessChecks","businessCheckHistory","layoutReport","layoutHistory"] as const){
    const value=delivery[key];if(value===undefined)continue;
    for(const entry of Array.isArray(value)?array(value,100,"Observation history"):[value]){
      const report=object(entry,["id","deliveryId","method","receivedAt","reportedByRole","viewportHeight","readings","summary"],"Observation report");
      for(const reading of array(report.readings,100,"Observation readings")){
        const row=object(reading,["stepId","status","kind","file","viewportWidth","label","target","stylesExpected","stylesLoaded","imagesExpected","imagesLoaded","sourceVisible","sourceHitTarget","activated","destinationMatched","targetVisible",...(report.method==="client-browser-checks-noodle-v2"?["clickedLabel","reachedTarget"]:[]),"checkId","criterionId","source","expected","blocks","explanation","clientWidth","scrollWidth","overflowPx","outcome","reason"],"Observation reading");
        if(row.source)sourceReference(row.source,bundle.project.summary.trim());
        if(row.expected)object(row.expected,["kind","text","label","amountMinor","currency"],"Business expectation");
      }
      object(report.summary,["steps","observed","issues","unavailable","measured","overflow"],"Observation summary");
    }
  }
  if(delivery.resources){object(delivery.resources,["method","checked","findings"],"Resource report");for(const value of array(delivery.resources.findings,401,"Resource findings"))object(value,["from","reference","target","kind"],"Resource finding");}
  if(delivery.runtimeRun)object(delivery.runtimeRun,["id","deliveryId","deliveryDigest","targetId","startedAt","expiresAt"],"Pending runtime run");
  if(delivery.modelRun)object(delivery.modelRun,["id","deliveryId","deliveryDigest","journeyPlanDigest","modelSpecDigest","seed","registration","startedAt","expiresAt","startedByRole","trace"],"Pending model run");
  if(delivery.journeyPlan)validateProjectJourneyPlan(delivery.journeyPlan);
  riskReviews(delivery.riskReviews);
  for(const value of array(delivery.acceptanceEvidence??[],20,"Acceptance history")){const snapshot=object(value,SNAPSHOT_KEYS,"Acceptance snapshot");review(snapshot.review);riskReviews(snapshot.riskReviews);if(snapshot.modelDecision)object(snapshot.modelDecision,["reportId","acknowledgeServerCheck","exceptionReason"],"Model acceptance decision");}
}

/** A local, allowlisted copy; no membership, client identity, payment identifiers,
 * provider settings or unrelated audit fields enter this envelope. Source files
 * and original requirements are deliberately included and can contain user text. */
export async function createEvidenceExport(quote:ProofQuote):Promise<EvidenceExport>{
  boundedJson(quote);
  requireValue(quote.workflow==="proof-v1"&&quote.proof?.delivery,"A current proof delivery is required.");
  const delivery=structuredClone(pick(quote.proof.delivery,DELIVERY_KEYS)) as ProofDelivery;
  await validateModelArchive(delivery,quote.id);
  const requirements=quote.proof.requirements;
  const acceptanceReferences:AcceptanceReference[]=[];
  const acceptance=quote.proof.collaboration?.acceptance;
  if(acceptance)acceptanceReferences.push({kind:"delivery-acceptance",deliveryId:acceptance.deliveryId,evidenceSnapshotId:acceptance.evidenceSnapshotId??null});
  if(quote.proof.acceptedDeliveryId)acceptanceReferences.push({kind:"capture-consent",deliveryId:quote.proof.acceptedDeliveryId,evidenceSnapshotId:quote.proof.acceptedEvidenceSnapshotId??null});
  const result:EvidenceExport={schema:EVIDENCE_EXPORT_SCHEMA,verificationRules:EVIDENCE_EXPORT_RULES,scope:"current-delivery-only",
    project:{id:quote.id,reference:quote.reference,title:quote.title,summary:quote.summary,language:quote.language,criteria:structuredClone(quote.proof.criteria),
      ...(quote.proof.scopeClarifications?{scopeClarifications:structuredClone(quote.proof.scopeClarifications),scopeConfirmationMode:scopeConfirmationMode(quote)}:{}),
      ...(quote.proof.project?{spec:structuredClone(quote.proof.project)}:{}),...(requirements?{requirements:structuredClone({sourceText:requirements.sourceText,sourceRefs:requirements.sourceRefs})}:{})},
    delivery,fileDigest:await runtimeDeliveryDigest(exportFiles(delivery,!!quote.proof.project)),acceptanceReferences,
    ...(quote.proof.collaboration?.feedback.some(row=>row.riskSource)?{riskRepairs:{schema:"pbp-risk-repairs-v1" as const,feedback:structuredClone(quote.proof.collaboration.feedback.filter(row=>row.riskSource)),events:structuredClone(quote.proof.collaboration.riskRepairEvents??[])}}:{})};
  boundedJson(result);dataShapes(result);
  const verification=await verifyEvidenceExport(result);
  requireValue(verification.consistency==="consistent",`This record cannot produce a consistent versioned evidence export (${verification.checks.filter(row=>row.status==="inconsistent").map(row=>row.id).join(", ")}). Retain the original record for inspection; missing historical evidence is not reconstructed.`);
  return result;
}

function criteria(value:unknown):ProofCriterion[]{
  const result=array(value,33,"Criteria").map(entry=>{const row=object(entry,["id","title","source"],"Criterion");text(row.id,80);text(row.title,500);text(row.source,3000);return row as ProofCriterion;});
  requireValue(result.length>0&&new Set(result.map(row=>row.id)).size===result.length,"Criteria identifiers must be unique.");return result;
}
function evidence(value:unknown,files:Record<string,string>,agreed:ProofCriterion[]):ProofEvidence[]{
  const rows=array(value,66,"Rule evidence").map(entry=>{
    const row=object(entry,["id","criterionId","file","excerpt","finding","explanation"],"Rule evidence");
    text(row.id,100);text(row.criterionId,80);text(row.file,200);text(row.explanation,5000);
    requireValue(agreed.some(item=>item.id===row.criterionId)&&["pass","fail","needs_human"].includes(row.finding as string)&&typeof row.excerpt==="string"&&row.excerpt.length<=2000,"Rule evidence is invalid.");
    requireValue(Object.hasOwn(files,row.file as string)?files[row.file as string].includes(row.excerpt):row.excerpt===""&&row.finding==="fail","A rule excerpt is not in the exported source.");
    return row as ProofEvidence;
  });
  requireValue(new Set(rows.map(row=>row.id)).size===rows.length&&agreed.every(criterion=>rows.some(row=>row.criterionId===criterion.id)),"Rule evidence is incomplete or duplicated.");return rows;
}
function sourceReference(value:unknown,source:string):void{
  const row=object(value,["start","end","excerpt"],"Source reference");
  requireValue(Number.isSafeInteger(row.start)&&Number.isSafeInteger(row.end)&&(row.start as number)>=0&&(row.end as number)>(row.start as number)&&(row.end as number)<=source.length&&typeof row.excerpt==="string"&&row.excerpt===source.slice(row.start as number,row.end as number),"A source reference does not match its exact UTF-16 span.");
}
function assessment(value:unknown,delivery:ProofDelivery,agreed:ProofCriterion[],observationContext?:ObservationScopeContext):void{
  const row=object(value,["id","deliveryId","method","mode","model","assessedAt","items","risks","limitations","coverage","usage","withheldRisks","scopeContext","publicationPolicy","requirementCompletenessPolicy"],"AI assessment");
  text(row.id,100);text(row.model,200);requireValue(row.deliveryId===delivery.id&&row.method==="source-ai-v1"&&row.mode==="live"&&typeof row.assessedAt==="string"&&Number.isFinite(Date.parse(row.assessedAt)),"AI assessment binding is invalid.");
  const cite=(value:unknown,limit:number)=>array(value,limit,"AI citations").forEach(entry=>{
    const citation=object(entry,["file","start","end","excerpt"],"AI citation"),file=text(citation.file,200);
    requireValue(Object.hasOwn(delivery.files!,file),"AI citation file is missing.");sourceReference(pick(citation,["start","end","excerpt"]),delivery.files![file]);
  });
  const items=array(row.items,33,"AI items");
  for(const item of items){
    const result=object(item,["criterionId","status","explanation","citations","ruleEvidenceIds","evidenceNeed","obligations","modelJudgment","sourceFinding","publicationBasis"],"AI item");
    requireValue(agreed.some(criterion=>criterion.id===result.criterionId)&&["supported","changes_suggested","insufficient_evidence"].includes(result.status as string),"AI criterion reference is invalid.");
    text(result.explanation,3000);cite(result.citations,ASSESSMENT_ITEM_CITATION_LIMIT);
    if(result.modelJudgment!==undefined){
      const original=object(result.modelJudgment,["status","explanation","citations"],"Original AI item");
      requireValue(["supported","changes_suggested","insufficient_evidence"].includes(original.status as string),"The original AI status is invalid.");
      text(original.explanation,600);cite(original.citations,ASSESSMENT_ITEM_CITATION_LIMIT);
    }
    if(result.sourceFinding!==undefined){
      requireValue(result.modelJudgment!==undefined,"A new independent source finding must retain the separate decoded model item.");
      const source=object(result.sourceFinding,["version","status","basis","explanation","citations","files","scopeBinding"],"Independent source finding");
      const version=sourceFindingVersionForPublication((row.publicationPolicy as ProofAssessment["publicationPolicy"])?.schema);
      requireValue(source.version===version&&["supported","changes_suggested","insufficient_evidence"].includes(source.status as string)&&["declared_html_labels","locked_business_values"].includes(source.basis as string),"The independent source finding schema must match its saved report policy.");
      text(source.explanation,3000);cite(source.citations,8);
      const files=array(source.files,40,"Independent checked files");
      requireValue(new Set(files).size===files.length,"Independent source files must be unique.");
      for(const value of files){const file=text(value,300);requireValue(Object.hasOwn(delivery.files!,file)&&staticFileKind(file)==="html","An independent source file is not supplied HTML.");}
      if(source.scopeBinding!==undefined){
        const binding=object(source.scopeBinding,["proposalId","proposalDigest","file","kind","formId"],"Independent scope reference");
        text(binding.proposalId,100);requireValue(typeof binding.proposalDigest==="string"&&/^[a-f0-9]{64}$/u.test(binding.proposalDigest),"The independent scope digest is invalid.");text(binding.file,300);
        requireValue(binding.kind==="page"&&!Object.hasOwn(binding,"formId")||binding.kind==="form"&&typeof binding.formId==="string","The independent scope target is invalid.");if(binding.formId!==undefined)text(binding.formId,120);
      }
    }
    if(result.publicationBasis!==undefined){
      const basis=object(result.publicationBasis,["schema","reason"],"Source publication basis");
      requireValue(["source-publication-v1","source-publication-v2","source-publication-v3"].includes(basis.schema as string)&&basis.schema===(row.publicationPolicy as ProofAssessment["publicationPolicy"])?.schema&&["locked_price_mismatch","confirmed_form_label_absence","locked_price_match"].includes(basis.reason as string),"The source publication reason or saved report schema is unsupported.");
      const expectedStatus=basis.reason==="locked_price_match"?"supported":"changes_suggested";
      requireValue(result.status===expectedStatus&&(result.modelJudgment as ProofAssessmentItem["modelJudgment"])?.status===expectedStatus&&(result.sourceFinding as ProofAssessmentItem["sourceFinding"])?.status===expectedStatus,"Source reconciliation must preserve the matching raw status and separate exact source fact.");
    }
    if(result.obligations!==undefined)requireValue(isAssessmentObligations(result.obligations,agreed.find(c=>c.id===result.criterionId)!),"AI obligation directions do not match the exact locked wording and named rules.");
    if(result.evidenceNeed!==undefined){
      const need=object(result.evidenceNeed,["schema","reason","targetFiles"],"AI evidence need");
      requireValue(result.status==="insufficient_evidence"&&need.schema==="source-evidence-need-v1"&&ASSESSMENT_EVIDENCE_NEED_REASONS.some(reason=>reason===need.reason),"AI evidence-need schema, reason or item status is invalid.");
      const targets=array(need.targetFiles,40,"AI evidence-need targets");
      requireValue(new Set(targets).size===targets.length,"AI evidence-need targets must be unique.");
      for(const value of targets){const file=text(value,300);requireValue(Object.hasOwn(delivery.files!,file)&&["html","css"].includes(staticFileKind(file)??""),"AI evidence-need target is not an exact provided HTML/CSS file.");}
    }
    for(const id of array(result.ruleEvidenceIds,66,"AI rule references"))requireValue(delivery.evidence.some(entry=>entry.id===id&&entry.criterionId===result.criterionId),"AI rule reference is missing or belongs to a different criterion.");
  }
  requireValue(new Set(items.map(item=>(item as Record<string,unknown>).criterionId)).size===items.length,"AI criterion references are duplicated.");
  requireValue(items.length===agreed.length&&agreed.every(criterion=>items.some(item=>(item as Record<string,unknown>).criterionId===criterion.id)),"AI assessment must include every agreed criterion exactly once.");
  const markedIds=agreed.filter(c=>items.some(item=>(item as ProofAssessmentItem).criterionId===c.id&&(item as ProofAssessmentItem).publicationBasis!==undefined)).map(c=>c.id);
  if(row.publicationPolicy!==undefined){
    const policy=object(row.publicationPolicy,["schema","reconciledCriterionIds"],"Source publication policy"),ids=array(policy.reconciledCriterionIds,33,"Reconciled criteria");
    requireValue(["source-publication-v1","source-publication-v2","source-publication-v3"].includes(policy.schema as string)&&same(ids,markedIds),"The publication policy must list exactly the marked criteria in agreed order.");
    if(policy.schema!=="source-publication-v1")requireValue(row.requirementCompletenessPolicy!==undefined&&items.every(item=>(item as ProofAssessmentItem).modelJudgment!==undefined),"This source policy must retain its whole-original policy and every original decoded model item.");
    if(policy.schema==="source-publication-v3")object(row.scopeContext,["digest","proposalCount","confirmationCounts"],"Version3 historical scope context");
  }else requireValue(markedIds.length===0,"A source publication basis requires its explicit report policy.");
  if(row.requirementCompletenessPolicy!==undefined){
    const policy=object(row.requirementCompletenessPolicy,["schema","version"],"Whole-original publication policy");
    const version3=(row.publicationPolicy as ProofAssessment["publicationPolicy"])?.schema==="source-publication-v3";
    const allowedVersions=version3?["bilingual-bounded-v3",BILINGUAL_MENU_PRICE_COMPLETENESS]:["bounded-original-zh-v1","bilingual-bounded-v2"];
    requireValue(policy.schema==="requirement-completeness-v1"&&allowedVersions.includes(policy.version as string),"Unsupported whole-original publication policy for this source publication version.");
    requireValue(items.every(item=>(item as ProofAssessmentItem).modelJudgment!==undefined),"A current whole-original policy must retain every original decoded model item.");
  }
  const validateRisk=(value:unknown,strict:boolean)=>{
    const risk=object(value,["title","explanation","suggestion","citations"],"AI risk");
    text(risk.title,strict?120:500);text(risk.explanation,strict?600:3000);text(risk.suggestion,strict?400:3000);
    const citations=array(risk.citations,ASSESSMENT_RISK_CITATION_LIMIT,"AI risk citations");
    if(strict){requireValue(citations.length>0,"A retained AI lead needs its exact source citations.");for(const entry of citations)text((entry as Record<string,unknown>)?.excerpt,500);}
    cite(citations,ASSESSMENT_RISK_CITATION_LIMIT);
  };
  const activeRisks=array(row.risks,row.withheldRisks===undefined?20:5,"AI risks");
  for(const risk of activeRisks)validateRisk(risk,row.withheldRisks!==undefined);
  if(row.withheldRisks!==undefined){
    const pool=object(row.withheldRisks,["version","reason","scopeCriterionIds","adjustedCriteria","entries"],"AI withheld-risk disposition");
    const scopeWithheld=pool.version===2&&pool.reason==="source_scope_unestablished",observationWithheld=pool.version===3&&pool.reason==="custom_scope_requires_observation",scoped=scopeWithheld||observationWithheld;
    const unboundWithheld=pool.version===4&&pool.reason==="optional_source_leads_unverified";
    requireValue(pool.version===1&&["item_status_adjusted","not_withheld"].includes(pool.reason as string)||scoped||unboundWithheld,"Unsupported AI withheld-risk disposition.");
    const adjustments=array(pool.adjustedCriteria,33,"AI status adjustments"),entries=array(pool.entries,5,"Withheld AI leads"),ids=new Set<string>();
    if(scopeWithheld){
      const scopeIds=array(pool.scopeCriterionIds,17,"AI custom contact scope"),expected=finiteContactPresenceScopeCriterionIds(agreed,items.map(value=>({criterionId:(value as Record<string,unknown>).criterionId as string})),delivery.files!);
      requireValue(adjustments.length===0&&activeRisks.length===0&&entries.length>0&&expected&&same(scopeIds,expected),"A source-scope disposition needs exact finite custom contact criteria, original leads, no invented adjustments and no active risks.");
    }
    else if(observationWithheld){
      const scopeIds=array(pool.scopeCriterionIds,17,"AI custom observation scope"),expected=observationOnlyCustomScopeCriterionIds(agreed,items.map(value=>({criterionId:(value as ProofAssessmentItem).criterionId,status:(value as ProofAssessmentItem).status})),observationContext);
      requireValue(adjustments.length===0&&activeRisks.length===0&&entries.length>0&&expected&&same(scopeIds,expected),"An observation-scope disposition needs exact insufficient custom requirements, explicit no-business context, original leads, no adjustments and no active risks.");
    }
    else requireValue(!Object.hasOwn(pool,"scopeCriterionIds"),"A non-scoped withholding disposition cannot claim source-scope metadata.");
    if(unboundWithheld)requireValue(adjustments.length===0&&activeRisks.length===0&&entries.length>0,"An unverified source-lead disposition needs complete original leads, no invented adjustments and no active risks.");
    else if(!scoped&&pool.reason==="not_withheld")requireValue(adjustments.length===0&&entries.length===0,"A not-withheld disposition cannot retain adjustments or withheld leads.");
    else if(!scoped)requireValue(adjustments.length>0&&activeRisks.length===0,"A status-adjusted disposition needs an adjustment and no active risks.");
    for(const value of adjustments){
      const adjustment=object(value,["criterionId","originalStatus","publishedStatus"],"AI status adjustment"),id=text(adjustment.criterionId,80),item=items.find(value=>(value as Record<string,unknown>).criterionId===id) as Record<string,unknown>|undefined;
      requireValue(!ids.has(id)&&item&&["supported","changes_suggested","insufficient_evidence"].includes(adjustment.originalStatus as string)&&adjustment.originalStatus!==adjustment.publishedStatus&&adjustment.publishedStatus===item.status,"An AI status adjustment has a duplicated, foreign or conflicting criterion/status binding.");ids.add(id);
    }
    entries.forEach((value,index)=>{const entry=object(value,["originalRiskIndex","risk"],"Withheld AI lead");requireValue(entry.originalRiskIndex===index,"Withheld AI lead indices must retain the contiguous original order.");validateRisk(entry.risk,true);});
  }
  array(row.limitations,30,"AI limitations").forEach(item=>text(item,3000));
  const coverage=object(row.coverage,["includedFiles","truncatedFiles","omittedFiles"],"AI source coverage");
  for(const values of Object.values(coverage))for(const file of array(values,40,"AI source inventory"))requireValue(typeof file==="string"&&Object.hasOwn(delivery.files!,file),"AI source inventory references a missing file.");
  if(row.usage){const usage=object(row.usage,["promptTokens","completionTokens"],"AI token usage");requireValue(Object.values(usage).every(value=>Number.isSafeInteger(value)&&(value as number)>=0),"AI token usage is invalid.");}
}
function riskBindings(value:unknown,deliveryId:string,reports:ProofAssessment[]):void{
  const ids=new Set<string>();
  for(const entry of array(value??[],100,"Risk annotations")){
    const row=object(entry,["id","deliveryId","assessmentId","riskIndex","riskOrigin","decision","reason","actorRole","reviewedAt"],"Risk annotation"),id=text(row.id,100),report=reports.find(report=>report.id===row.assessmentId),withheld=Object.hasOwn(row,"riskOrigin");
    requireValue(!withheld||row.riskOrigin==="withheld","Unsupported risk annotation origin.");
    requireValue(!ids.has(id)&&row.deliveryId===deliveryId&&report&&Number.isSafeInteger(row.riskIndex)&&(row.riskIndex as number)>=0,"Risk annotation references another delivery, report or risk.");ids.add(id);
    const index=row.riskIndex as number;
    if(withheld){const pool=report.withheldRisks,eligible=pool&&(pool.version===1&&pool.reason==="item_status_adjusted"||(pool.version===2&&pool.reason==="source_scope_unestablished"||pool.version===3&&pool.reason==="custom_scope_requires_observation"||pool.version===4&&pool.reason==="optional_source_leads_unverified")&&pool.adjustedCriteria.length===0&&pool.entries.length>0&&report.risks.length===0);requireValue(eligible&&pool?.entries[index]?.originalRiskIndex===index&&pool.entries[index]?.risk,"Risk annotation references a missing or unbound withheld lead.");}
    else requireValue(index<report.risks.length,"Risk annotation references a missing published risk.");
    requireValue(["confirmed","rejected","needs_evidence"].includes(row.decision as string)&&["buyer","seller"].includes(row.actorRole as string)&&typeof row.reviewedAt==="string"&&Number.isFinite(Date.parse(row.reviewedAt)),"Risk annotation fields are invalid.");text(row.reason,1000);
  }
}

function quoteFor(bundle:EvidenceExport):ProofQuote{
  return {id:bundle.project.id,reference:bundle.project.reference,title:bundle.project.title,summary:bundle.project.summary,brief:bundle.project.summary,language:bundle.project.language,workflow:"proof-v1",status:"approved",clientName:"Not exported",currency:"AUD",hourlyRateCents:0,totalCents:0,lineItems:[],assumptions:[],questions:[],timelineDays:1,aiMode:"demo",paymentMode:"demo",createdAt:bundle.delivery.submittedAt,
    proof:{criteria:bundle.project.criteria,project:bundle.project.spec,scopeClarifications:bundle.project.scopeClarifications,delivery:bundle.delivery,paymentState:"unfunded",audit:[]}};
}

/** Offline consistency only. No code, URL, browser, provider or payment is run.
 * An internally consistent forged envelope can still pass: there is no signature
 * or trusted external anchor. A mismatch is not a finding of fraud. */
export async function verifyEvidenceExport(input:unknown):Promise<EvidenceVerification>{
  const result:EvidenceVerification={schema:"proofbeforepay-evidence-verification-v1",consistency:"consistent",checks:[],limits:{...limits}};
  const check=async(id:string,action:()=>void|Promise<void>,message:string)=>{try{await action();result.checks.push({id,status:"consistent",message});}catch{result.consistency="inconsistent";result.checks.push({id,status:"inconsistent",message:`${id} could not be established from the supplied record.`});}};
  try{boundedJson(input);}catch{result.consistency="inconsistent";result.checks.push({id:"bounded-json",status:"inconsistent",message:"The input is not bounded plain JSON data."});return result;}
  if(!input||typeof input!=="object"||(input as Record<string,unknown>).schema!==EVIDENCE_EXPORT_SCHEMA||(input as Record<string,unknown>).verificationRules!==EVIDENCE_EXPORT_RULES){
    result.consistency="unsupported";result.checks.push({id:"schema",status:"inconsistent",message:"Unsupported export format or verification rules. Raw legacy quote JSON is not silently verified."});return result;
  }
  // Normalize only after plain-data validation. Reused domain helpers may use
  // JSON serialization internally; equivalent metadata key order must not fail.
  const bundle=canonical(input) as EvidenceExport;let structure=false;
  await check("structure",()=>{
    object(bundle,["schema","verificationRules","scope","project","delivery","fileDigest","acceptanceReferences","riskRepairs"],"Export");requireValue(bundle.scope==="current-delivery-only","Unsupported export scope.");
    object(bundle.project,["id","reference","title","summary","language","criteria","spec","requirements","scopeClarifications","scopeConfirmationMode"],"Project");
    text(bundle.project.id,100);text(bundle.project.reference,100);text(bundle.project.title,500);text(bundle.project.summary,3000);requireValue(["zh","en"].includes(bundle.project.language),"Unsupported language.");criteria(bundle.project.criteria);
    object(bundle.delivery,DELIVERY_KEYS,"Delivery");text(bundle.delivery.id,100);text(bundle.delivery.label,500);requireValue(["upload","flawed","fixed"].includes(bundle.delivery.variant)&&Number.isFinite(Date.parse(bundle.delivery.submittedAt)),"Delivery identity is invalid.");
    requireValue(/^[a-f0-9]{64}$/u.test(bundle.fileDigest),"A file digest is required.");exportFiles(bundle.delivery,!!bundle.project.spec);
    for(const reference of array(bundle.acceptanceReferences,2,"Acceptance references")){
      const row=object(reference,["kind","deliveryId","evidenceSnapshotId"],"Acceptance reference");requireValue(["delivery-acceptance","capture-consent"].includes(row.kind as string),"Unknown acceptance reference.");text(row.deliveryId,100);if(row.evidenceSnapshotId!==null)text(row.evidenceSnapshotId,100);
    }
    dataShapes(bundle);
    structure=true;
  },"The supported current-delivery envelope has a bounded structure.");
  if(!structure)return result;
  if(bundle.delivery.modelArchiveRefs!==undefined||bundle.delivery.modelArchive!==undefined)await check("model-archive-integrity",()=>validateModelArchive(bundle.delivery,bundle.project.id),"Archived model report payloads match their exact SHA-256 bytes and a complete project/delivery/report manifest; this is internal consistency, not an execution signature.");
  await check("file-digest",async()=>{requireValue(await runtimeDeliveryDigest(bundle.delivery.files)===bundle.fileDigest,"File digest mismatch.");if(bundle.delivery.runtimeDeliveryDigest!==undefined)requireValue(bundle.delivery.runtimeDeliveryDigest===bundle.fileDigest,"Runtime digest mismatch.");},"The file-map SHA-256 matches the exported files; this is not a trusted signature.");
  if(bundle.delivery.cooperativeStageReports!==undefined)await check("cooperative-stage-bindings",async()=>{await validateCooperativeStageReports(bundle.delivery.cooperativeStageReports,{projectId:bundle.project.id,deliveryId:bundle.delivery.id,deliveryDigest:bundle.fileDigest,criteria:bundle.project.criteria});},"Participant-supplied stage reports match the declared current files and original criterion. Reporter authenticity, native execution and acceptance are not proven.");
  await check("requirements",()=>{
    const {spec,requirements}=bundle.project;
    if(spec?.coverage){const coverage=validateSavedCoverage(spec.coverage);requireValue(coverage.sourceText===bundle.project.summary.trim(),"The original requirements differ.");}
    if(requirements){object(requirements,["sourceText","sourceRefs"],"Original requirements");const source=text(requirements.sourceText,12000);for(const value of array(requirements.sourceRefs,66,"Original source references")){
      const row=object(value,["criterionId","source"],"Original requirement reference");requireValue(bundle.project.criteria.some(criterion=>criterion.id===row.criterionId),"Unknown original criterion reference.");sourceReference(row.source,source);
    }}
  },"The supplied original requirement spans resolve within the exported source.");
  await check("source-rule-replay",()=>{
    const {spec,language}=bundle.project,delivery=bundle.delivery;
    const actual=evidence(delivery.evidence,delivery.files!,bundle.project.criteria);
    let replay:ProofEvidence[];
    if(spec){
      const coverage=spec.coverage;
      const reconstructed=parseStaticProject({title:bundle.project.title,summary:bundle.project.summary,amount:"1.00",requiredPages:spec.requiredPages,manualRequirements:spec.manualRequirements,
        ...(spec.link?{link:spec.link}:{}),...(spec.links?{links:spec.links}:{}),
        ...(coverage?{coverage:{version:coverage.version,sourceText:coverage.sourceText,confirmed:true,decisions:coverage.decisions.map(row=>pick(row,["id","disposition","reason"]))}}:{}),
        ...(spec.businessChecks?{businessChecks:{confirmed:true,items:spec.businessChecks}}:{}),...(spec.runtimeCheck?{runtimeCheck:{...spec.runtimeCheck,confirmed:true}}:{})},language);
      requireValue(same(reconstructed.criteria,bundle.project.criteria),"The locked criteria differ from the saved project.");
      const checked=createUploadedDelivery(delivery.files,spec,language,delivery.sequence??1);replay=checked.evidence;
      if(delivery.resources!==undefined)requireValue(same(delivery.resources,checked.resources),"Saved resource findings differ from source replay.");
    }else{requireValue(delivery.variant!=="upload"&&same(bundle.project.criteria,proofCriteria(language)),"A custom upload requires its locked project.");replay=inspectProofFiles(delivery.files!,language);}
    const values=(rows:ProofEvidence[])=>rows.map(row=>pick(row,["id","criterionId","file","excerpt","finding","explanation"]));
    requireValue(same(values(actual),values(replay)),"Saved source evidence differs from the current versioned rules.");
  },"Saved findings/excerpts match deterministic source replay with the named verifier rules. Rendering and human checks are not replayed.");
  await check("ai-source-citations",async()=>{
    const scopeQuote=quoteFor(bundle),mode=bundle.project.scopeConfirmationMode;
    requireValue((bundle.project.scopeClarifications===undefined)===(mode===undefined),"Scope mode and history must be present together.");
    if(mode!==undefined)requireValue(mode==="owner-roleplay"||mode==="authenticated-participants","Unknown scope confirmation mode.");
    await resolveScopeClarifications(scopeQuote,mode);
    const reports=[...assessmentHistoryFor(scopeQuote),bundle.delivery.assessment,...(bundle.delivery.acceptanceEvidence??[]).map(snapshot=>snapshot.assessment)].filter((report):report is ProofAssessment=>!!report);
    immutableIds(reports);
    immutableIds([...(bundle.delivery.riskReviews??[]),...(bundle.delivery.acceptanceEvidence??[]).flatMap(snapshot=>snapshot.riskReviews??[])]);
    for(const report of reports){const reportScope=await resolveAssessmentScopeContext(scopeQuote,report,mode);
      assessment(report,bundle.delivery,bundle.project.criteria,{hasBusinessChecks:bundle.project.spec?.businessChecks!==undefined&&(!Array.isArray(bundle.project.spec.businessChecks)||bundle.project.spec.businessChecks.length>0)});
      const savedSteps=getBusinessCheckPlan(scopeQuote);
      const originalPrice=report.requirementCompletenessPolicy?.version===BILINGUAL_MENU_PRICE_COMPLETENESS
        ? originalBilingualMenuPriceSteps(scopeQuote,savedSteps) : undefined;
      requireValue(!originalPrice||originalPrice.criterionIds.length>0,"The report's original-price policy has no matching locked original.");
      const businessSteps=[...savedSteps,...(originalPrice?.steps??[])];
      if(report.requirementCompletenessPolicy){
        const checkWholeOriginal=createRequirementCompletenessCheck({businessSteps,version:report.requirementCompletenessPolicy.version});
        for(const item of report.items)requireValue(item.status!=="supported"||checkWholeOriginal(bundle.project.criteria.find(c=>c.id===item.criterionId)!).kind!=="incomplete","A partial price/source fact cannot establish support for the complete locked original requirement.");
      }
      // New source facts are recomputed from current exported bytes and the
      // report's immutable historical scope prefix, never from model prose.
      const sourceFiles=Object.fromEntries(Object.entries(bundle.delivery.files!).filter(([file])=>["html","css"].includes(staticFileKind(file)??""))),publicationSchema=report.publicationPolicy?.schema??"source-publication-v1";
      const checkSource=createAssessmentSourceFindingCheck({files:sourceFiles,coverage:report.coverage,language:bundle.project.language,businessSteps,scope:reportScope,version:sourceFindingVersionForPublication(publicationSchema)});
      const checkPublication=createSourcePublicationCheck({files:sourceFiles,coverage:report.coverage,language:bundle.project.language,businessSteps,scope:reportScope,ruleEvidence:bundle.delivery.evidence,requirementCompletenessVersion:report.requirementCompletenessPolicy?.version??"bounded-original-zh-v1",publicationSchema});
      const priceAdmission=publicationSchema==="source-publication-v3"?assessMenuPricePublicationAdmissionV3:assessMenuPricePublicationAdmissionV2;
      const strictPrice=publicationSchema==="source-publication-v3"?createStrictMenuPriceEvidenceCheckV3(sourceFiles,businessSteps):undefined;
      for(const item of report.items)if(publicationSchema!=="source-publication-v1"||item.modelJudgment!==undefined||item.sourceFinding!==undefined){
        const criterion=bundle.project.criteria.find(c=>c.id===item.criterionId)!;
        const expected=checkSource(criterion);
        requireValue(same(item.sourceFinding??null,expected??null),"The independent source finding differs from exact source/scope replay.");
        if(originalPrice?.criterionIds.includes(criterion.id)&&item.status!=="insufficient_evidence"&&!bundle.delivery.evidence.some(row=>row.criterionId===item.criterionId&&row.finding==="fail"))
          requireValue(item.publicationBasis?.reason===(item.status==="supported"?"locked_price_match":"locked_price_mismatch"),"A whole bilingual-price decision needs an exact, replayable source publication.");
        if(publicationSchema!=="source-publication-v1"&&item.status==="supported"&&businessSteps.some(step=>step.criterionId===item.criterionId&&step.expected.kind==="item_price"))requireValue(item.modelJudgment?.status==="supported"&&priceAdmission(sourceFiles,expected,item.modelJudgment.citations,report.coverage),"Every affirmative price path under this policy needs complete source ownership, original citations and finite HTML/CSS eligibility.");
        if(publicationSchema==="source-publication-v3"&&item.status==="supported"){
          const scoped=assessScopedLabelPublication(criterion,reportScope,expected,item.modelJudgment,sourceFiles);
          requireValue(scoped.kind==="not_applicable"||scoped.kind==="witnessed"&&item.explanation===scoped.explanation&&same(item.citations,scoped.citations),"The positive label finding must use the agreed source owner and its original citation witness.");
        }
        if(strictPrice&&item.status==="changes_suggested"&&!bundle.delivery.evidence.some(row=>row.criterionId===item.criterionId&&row.finding==="fail")){
          const evidence=strictPrice(item.criterionId);
          requireValue(evidence.kind!=="unknown"||!evidence.checks.some(check=>check.reason===UNCONFIRMED_MENU_CARD_OWNER),"A negative price finding cannot be based on an unconfirmed card child.");
        }
        const adjustment=report.withheldRisks?.adjustedCriteria.find(row=>row.criterionId===item.criterionId);
        if(adjustment)requireValue(adjustment.originalStatus===item.modelJudgment?.status,"The retained original AI status conflicts with its adjustment ledger.");
        if(item.publicationBasis!==undefined){
          requireValue(item.modelJudgment&&report.publicationPolicy,"Source publication requires the retained model item and explicit report policy.");
          const decision=checkPublication(criterion,{rawStatus:item.modelJudgment.status,rawCitations:item.modelJudgment.citations,guardedStatus:"insufficient_evidence",guardReason:item.publicationBasis.reason});
          requireValue(decision&&same(item.publicationBasis,decision.publicationBasis)&&item.status===decision.status&&same(item.sourceFinding,decision.sourceFinding)&&item.explanation===decision.explanation&&same(item.citations,decision.citations)&&item.evidenceNeed===undefined,"The published source reconciliation differs from its original scope, legacy guard or canonical source evidence.");
        }
      }
    }
    riskBindings(bundle.delivery.riskReviews,bundle.delivery.id,reports);
  },"Included AI citations resolve to source; risk annotations, optional evidence-need metadata and withheld-risk dispositions have valid saved bindings. Model judgment, the asserted original statuses or cause of an evidence gap, human identity and provider execution are not proven.");
  if(bundle.riskRepairs)await check("risk-repair-chain",()=>{
    const records=object(bundle.riskRepairs,["schema","feedback","events"],"Risk repair chain");
    requireValue(records.schema==="pbp-risk-repairs-v1","Unsupported risk repair chain schema.");
    const feedback=array(records.feedback,200,"Risk-linked feedback");
    for(const item of feedback){const row=object(item,["id","deliveryId","criterionId","comment","at","riskSource"],"Risk feedback");requireValue(!!row.riskSource,"Every exported repair feedback needs its source snapshot.");}
    const tasks=validateRiskRepairRecords(feedback as ProofFeedback[],array(records.events,100,"Risk repair events") as RiskRepairEvent[],bundle.project.criteria);
    for(const task of tasks){
      if(task.source.deliveryId===bundle.delivery.id){
        const report=[bundle.delivery.assessment,...(bundle.delivery.assessmentHistory??[])].find(r=>r?.id===task.source.assessmentId);
        requireValue(report?.id===task.source.assessmentId&&same(report.risks[task.source.riskIndex],task.source.risk),"Current risk repair source differs from its saved report.");
      }
    }
  },"Risk feedback retains its exact agreed criterion and source report identity; event roles, sequence and explicit proposal reviews replay consistently. Old source files and human/model truth are not authenticated by this current-delivery bundle.");
  if(bundle.delivery.enquiryPlan||bundle.delivery.enquiryReport||bundle.delivery.enquiryRun||bundle.delivery.enquiryHistory)await check("enquiry-bindings",()=>{validateSavedEnquiryEvidence({...bundle.delivery,...(bundle.delivery.enquiryRun?{enquiryEvidenceReservation:{runId:bundle.delivery.enquiryRun.id,reportBytes:24576,acceptanceBytes:26624}}:{})},bundle.project.id,bundle.fileDigest);},"The optional enquiry agreement, backend observations and retained reports bind to this exact delivery; form operation, email delivery and backend authenticity are not proven.");
  const quote=quoteFor(bundle);
  if(bundle.delivery.journeyPlanSuggestions||bundle.delivery.journeyPlanAdoption||bundle.delivery.journeyExplanation)await check("journey-plan-source-mapping",async()=>{
    await validateSavedJourneySuggestions(quote);await validateSavedJourneyAdoption(quote);
    const explanation=bundle.delivery.journeyExplanation;
    if(explanation){
      const report=projectJourneyReportsFor(bundle.delivery).find(row=>row.id===explanation.reportId);
      requireValue(report,"The AI explanation must retain its exact journey report.");
      validateStoredProjectJourneyReport(report,{deliveryId:bundle.delivery.id,deliveryDigest:bundle.fileDigest,plan:savedProjectJourneyPlan(quote),projectId:bundle.project.id});
      validateJourneyEvidenceExplanation(explanation,{deliveryId:report.deliveryId,deliveryDigest:report.deliveryDigest,planDigest:report.planDigest,reportId:report.id,stepIds:evaluateStoredProjectJourneyReport(report).steps.map(step=>step.id)});
    }
  },"Saved advice and adopted mappings match the original source and exact uploaded delivery; this does not prove model execution or test success.");
  if(bundle.delivery.modelExplanation)await check("model-evidence-explanation",()=>{
    const explanation=bundle.delivery.modelExplanation!,report=modelReportsFor(bundle.delivery).find(row=>row.id===explanation.reportId);
    requireValue(report,"The AI model explanation must retain its exact model report.");
    const packet=modelDiagnosisExplanationPacket(report,{deliveryId:bundle.delivery.id,deliveryDigest:bundle.fileDigest,journeyPlanDigest:savedProjectJourneyPlan(quote)?.planDigest,projectId:bundle.project.id});
    validateModelEvidenceExplanation(explanation,modelEvidenceBinding(packet));
  },"Saved AI explanation binds to the original deterministic model diagnosis and retained report; it does not change verdicts, prove model judgement or establish payment.");
  let runtimeRows:ReturnType<typeof runtimeReportsFor>=[];
  await check("reported-observation-consistency",()=>{
    const delivery=bundle.delivery;
    const compare=(saved:object,replayed:object)=>requireValue(same(pick(saved,Object.keys(saved).filter(key=>!["id","reportedByRole"].includes(key))),pick(replayed,Object.keys(replayed).filter(key=>key!=="id"))),"Reported observation fields or derived counts differ.");
    const base=structuredClone(quote);delete base.proof.delivery!.browserChecks;delete base.proof.delivery!.businessChecks;delete base.proof.delivery!.layoutReport;
    for(const report of browserReportsFor(delivery))compare(report,createBrowserCheckReport(base,{deliveryId:delivery.id,previousReportId:null,method:report.method,readings:report.readings.map(row=>pick(row,row.status==="unavailable"?["stepId","status","reason"]:["stepId","status","kind","stylesExpected","stylesLoaded","imagesExpected","imagesLoaded","sourceVisible","sourceHitTarget","activated","destinationMatched","targetVisible","clickedLabel","reachedTarget"]))},report.receivedAt));
    for(const report of businessReportsFor(delivery))compare(report,createBusinessCheckReport(base,{deliveryId:delivery.id,previousReportId:null,readings:report.readings.map(row=>pick(row,["stepId","status","reason","blocks"]))},report.receivedAt));
    for(const report of layoutReportsFor(delivery))compare(report,createLayoutReport(base,{deliveryId:delivery.id,previousReportId:null,readings:report.readings.map(row=>pick(row,["file","viewportWidth","status","reason","clientWidth","scrollWidth"]))},report.receivedAt));
  },"Included client-report fields and derived outcomes are consistent with the locked plan; browser observations themselves are not independently proven.");
  await check("runtime-bindings",()=>{
    runtimeRows=runtimeReportsFor(bundle.delivery);const plan=savedRuntimePlan(quote);
    if(bundle.delivery.runtimeRegistration)requireValue(bundle.delivery.runtimeRegistration.projectId===bundle.project.id,"Registration belongs to another project.");
    if(bundle.delivery.backendTargetId||bundle.delivery.runtimeRegistration){requireValue(!!plan,"A runtime target requires a locked plan.");deliveryRuntimeTarget(bundle.delivery);}
    const pending=bundle.delivery.runtimeRun;
    if(pending){
      runtimeIdentifier(pending.id,"Pending runtime ID");
      requireValue(!runtimeRows.some(report=>report.id===pending.id||report.runId===pending.id),"A completed runtime report cannot also be pending.");
      requireValue(!!plan&&pending.deliveryId===bundle.delivery.id&&pending.deliveryDigest===bundle.fileDigest&&pending.targetId===bundle.delivery.backendTargetId,"Pending runtime binding differs from this delivery.");
      requireValue(typeof pending.startedAt==="string"&&typeof pending.expiresAt==="string"&&Number.isFinite(Date.parse(pending.startedAt))&&Number.isFinite(Date.parse(pending.expiresAt))&&Date.parse(pending.expiresAt)>Date.parse(pending.startedAt),"Pending runtime timestamps are invalid.");
    }
    requireValue(!runtimeRows.length||!!plan,"A runtime report requires its locked plan.");
    for(const report of runtimeRows){const target=deliveryRuntimeTarget(bundle.delivery);validateRuntimeReport(report,{deliveryId:bundle.delivery.id,deliveryDigest:bundle.fileDigest,plan:plan!,target,registration:bundle.delivery.runtimeRegistration});}
    const journeyPlan=savedProjectJourneyPlan(quote),journeyRows=projectJourneyReportsFor(bundle.delivery);
    requireValue(!journeyRows.length||!!journeyPlan,"Journey evidence requires a separately confirmed technical agreement.");
    for(const report of journeyRows)validateStoredProjectJourneyReport(report,{deliveryId:bundle.delivery.id,deliveryDigest:bundle.fileDigest,plan:journeyPlan!,projectId:bundle.project.id});
    const modelRows=modelReportsFor(bundle.delivery),pendingModel=bundle.delivery.modelRun;
    requireValue(!modelRows.length&&!pendingModel||!!journeyPlan,"Model evidence requires the original fixed technical agreement.");
    for(const report of modelRows)validateStoredModelCheckReport(report,{deliveryId:bundle.delivery.id,deliveryDigest:bundle.fileDigest,journeyPlanDigest:journeyPlan!.planDigest,projectId:bundle.project.id});
    if(pendingModel){
      requireValue(pendingModel.deliveryId===bundle.delivery.id&&pendingModel.deliveryDigest===bundle.fileDigest&&pendingModel.journeyPlanDigest===journeyPlan!.planDigest&&pendingModel.modelSpecDigest===MODEL_SPEC_DIGEST&&pendingModel.registration.projectId===bundle.project.id,"The pending model lease belongs to another delivery or agreement.");
      requireValue(["buyer","seller"].includes(pendingModel.startedByRole)&&typeof pendingModel.expiresAt==="string"&&Number.isFinite(Date.parse(pendingModel.expiresAt))&&Date.parse(pendingModel.expiresAt)>Date.parse(pendingModel.startedAt),"Pending model timestamps or initiating role are invalid.");
      requireValue(!modelRows.some(report=>report.id===pendingModel.id||report.runId===pendingModel.id),"A model run cannot be both pending and completed.");
      modelCheckReportFromTrace(pendingModel,pendingModel.trace,pendingModel.startedAt,"offline_pending_unknown; no network execution proven");
    }
  },"Included HTTP reports bind to the supplied delivery, file digest, plan and frozen target. No HTTP execution or present approval is proven.");
  await check("acceptance-references",()=>{
    const delivery=bundle.delivery,criteriaIds=bundle.project.criteria.map(row=>row.id);
    const journeyPlan=savedProjectJourneyPlan(quote),journeyRows=projectJourneyReportsFor(delivery);
    const runtimeRequired=!!savedRuntimePlan(quote),businessRequired=!!bundle.project.spec?.businessChecks?.length;
    const browser=browserReportsFor(delivery),business=businessReportsFor(delivery),layout=layoutReportsFor(delivery);
    const snapshots=array(delivery.acceptanceEvidence??[],20,"Acceptance snapshots");const ids=new Set<string>();
    for(const entry of snapshots){
      const snapshot=object(entry,SNAPSHOT_KEYS,"Acceptance snapshot");const id=text(snapshot.id,100);requireValue(!ids.has(id)&&snapshot.deliveryId===delivery.id&&Number.isFinite(Date.parse(snapshot.at as string)),"Acceptance identity is invalid.");ids.add(id);
      assertModelAcceptanceReference(quote,snapshot as unknown as import("./contracts.ts").ProofAcceptanceEvidence);
      // Optional metadata is still untrusted even when the retained report has
      // no exception. Never let an unused field carry arbitrary nested data.
      for(const key of ["businessExceptionReason","runtimeExceptionReason"] as const)if(snapshot[key]!==undefined)text(snapshot[key],500);
      if(snapshot.runtimeReportId!==undefined&&snapshot.runtimeReportId!==null)text(snapshot.runtimeReportId,100);
      requireValue(snapshot.businessExceptionReason===undefined||typeof snapshot.businessReportId==="string"&&!!snapshot.businessReportId,"A business exception reason requires its retained report.");
      requireValue(!!snapshot.runtimeReportId||["runtimeExceptionReason","runtimeAcknowledgedSteps","runtimeDeliveryDigest","runtimeTargetId","runtimeRegistration"].every(key=>snapshot[key]===undefined),"Runtime acceptance metadata requires its retained report.");
      requireValue(same(criteria(snapshot.criteria),bundle.project.criteria)&&same(snapshot.evidence,delivery.evidence),"Acceptance source evidence differs.");
      const checks=array(snapshot.manualChecks,33,"Manual checks");requireValue(new Set(checks).size===checks.length&&checks.every(id=>criteriaIds.includes(id as string))&&delivery.evidence.filter(row=>row.finding==="needs_human").every(row=>checks.includes(row.criterionId))&&!delivery.evidence.some(row=>row.finding==="fail"),"Acceptance human/source checks are invalid.");
      for(const [key,reports] of [["browserReportId",browser],["businessReportId",business],["layoutReportId",layout]] as const){const ref=snapshot[key];requireValue(ref===null||ref===undefined||reports.some(row=>row.id===ref),"A historical report reference is missing.");}
      requireValue(snapshot.assessmentId===(snapshot.assessment as ProofAssessment|undefined)?.id||snapshot.assessmentId===null&&snapshot.assessment===undefined,"Historical AI reference is invalid.");
      if(snapshot.enquiryReportId){const report=projectEnquiryReportsFor(delivery).find(row=>row.id===snapshot.enquiryReportId);requireValue(report&&snapshot.enquiryDeliveryDigest===bundle.fileDigest,"Frozen enquiry report is missing or has another file digest.");validateEnquiryReportDecision(report,snapshot.enquiryDecision);}else requireValue(!delivery.enquiryPlan&&snapshot.enquiryDeliveryDigest===undefined&&snapshot.enquiryDecision===undefined,"Acceptance omits its optional enquiry agreement/report.");
      if(snapshot.assessment)assessment(snapshot.assessment,delivery,bundle.project.criteria,{hasBusinessChecks:bundle.project.spec?.businessChecks!==undefined&&(!Array.isArray(bundle.project.spec.businessChecks)||bundle.project.spec.businessChecks.length>0)});
      riskBindings(snapshot.riskReviews,delivery.id,snapshot.assessment?[snapshot.assessment as ProofAssessment]:[]);
      if(snapshot.review){const review=snapshot.review as Record<string,unknown>;requireValue(review.deliveryId===snapshot.deliveryId&&["demo","live"].includes(review.mode as string)&&typeof review.reviewedAt==="string"&&Number.isFinite(Date.parse(review.reviewedAt)),"Historical rule review references another delivery.");text(review.summary,5000);}
      requireValue(!runtimeRequired||typeof snapshot.runtimeReportId==="string"&&!!snapshot.runtimeReportId,"A runtime-enabled acceptance must retain its original runtime report.");
      requireValue(!businessRequired||typeof snapshot.businessReportId==="string"&&!!snapshot.businessReportId,"A business-enabled acceptance must retain its original business report.");
      if(snapshot.runtimeReportId){
        const report=runtimeRows.find(row=>row.id===snapshot.runtimeReportId);requireValue(report&&snapshot.runtimeDeliveryDigest===bundle.fileDigest&&snapshot.runtimeTargetId===delivery.backendTargetId,"Historical runtime reference is missing or stale.");
        requireValue(snapshot.runtimeRegistration===undefined&&report.target.registration===undefined||sameRuntimeRegistration(snapshot.runtimeRegistration,report.target.registration),"Historical runtime registration differs.");
        if(snapshot.runtimeAcknowledgedSteps!==undefined){const acknowledged=array(snapshot.runtimeAcknowledgedSteps,report.steps.length,"Acknowledged runtime steps");requireValue(new Set(acknowledged).size===acknowledged.length&&acknowledged.every(id=>typeof id==="string"&&report.steps.some(step=>step.id===id)),"Acknowledged runtime steps must be unique supported step IDs.");}
        const exceptions=report.steps.filter(row=>row.outcome!=="observed");if(exceptions.length)requireValue(text(snapshot.runtimeExceptionReason,500).trim().length>=10&&exceptions.every(row=>array(snapshot.runtimeAcknowledgedSteps,report.steps.length,"Acknowledged runtime steps").includes(row.id)),"Runtime exceptions were not explicitly retained.");
      }
      requireValue(!journeyPlan||typeof snapshot.journeyReportId==="string","A journey-enabled acceptance must retain its journey evidence.");
      if(!snapshot.journeyReportId)requireValue(["journeyDeliveryDigest","journeyPlanDigest","journeyRegistration","journeyExceptionReason","journeyAcknowledgedSteps","journeyClientObservationAcknowledged"].every(key=>snapshot[key]===undefined),"Journey acceptance metadata requires its retained report.");
      if(snapshot.journeyReportId){
        const report=journeyRows.find(row=>row.id===snapshot.journeyReportId);
        requireValue(report&&snapshot.journeyDeliveryDigest===bundle.fileDigest&&snapshot.journeyPlanDigest===report.planDigest&&sameJourneyRegistration(snapshot.journeyRegistration,report.registration)&&snapshot.journeyClientObservationAcknowledged===true,"Historical journey reference is missing or stale.");
        const steps=evaluateStoredProjectJourneyReport(report).steps,exceptions=steps.filter(step=>step.outcome!=="observed");
        const acks=array(snapshot.journeyAcknowledgedSteps??[],20,"Acknowledged journey steps");
        requireValue(new Set(acks).size===acks.length&&acks.every(id=>steps.some(step=>step.id===id)),"Journey acknowledgements contain unsupported steps.");
        if(snapshot.journeyExceptionReason!==undefined)requireValue(text(snapshot.journeyExceptionReason,500).trim().length>=10,"Journey exception reason is invalid.");
        if(exceptions.length)requireValue(text(snapshot.journeyExceptionReason,500).trim().length>=10&&exceptions.every(step=>acks.includes(step.id)),"Journey exceptions were not explicitly retained.");
      }
      if(snapshot.businessReportId){const report=business.find(row=>row.id===snapshot.businessReportId)!;if(report.summary.issues||report.summary.unavailable)requireValue(text(snapshot.businessExceptionReason,500).trim().length>=10,"Business exceptions need their original reason.");}
    }
    const kinds=new Set<string>();for(const reference of bundle.acceptanceReferences){
      requireValue(!kinds.has(reference.kind)&&reference.deliveryId===delivery.id,"Acceptance reference is duplicated or belongs to another version.");kinds.add(reference.kind);
      requireValue(reference.evidenceSnapshotId!==null&&ids.has(reference.evidenceSnapshotId),"A legacy or missing acceptance snapshot cannot be reconstructed.");
    }
    requireValue(new Set(bundle.acceptanceReferences.map(row=>row.evidenceSnapshotId)).size<=1,"Acceptance and capture consent reference different snapshots.");
  },"Acceptance references resolve to their original retained snapshots, including historical reports; this does not prove identity, consent authenticity or payment.");
  return result;
}
