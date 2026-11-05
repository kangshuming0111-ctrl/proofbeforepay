// Zero-network regression replay. Every retained input is explicitly named by
// the caller; importing or testing this module never reads an ignored output.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT,ASSESSMENT_RISK_CITATION_LIMIT} from "../lib/assessment-limits.ts";
import {assessmentCompletionText,assessmentReportJson} from "../lib/assessment-completion.ts";
import {assessmentCitationSelection} from "../lib/assessment-citation-selection.ts";
import {resolveCatalogCitations} from "../lib/assessment-citation-catalog.ts";
import {canonicalAssessmentRisk} from "../lib/assessment-risk-fields.ts";
import {recordRiskReview} from "../lib/risk-reviews.ts";
import {isAssessmentObligations} from "../lib/assessment-obligations.ts";
import {prepareProjectEvaluation,projectQuote,validateProjectCorpus} from "./run-project-assessment-evaluation.ts";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const hashEvidenceReplay=value=>createHash("sha256").update(value).digest("hex");
const EVIDENCE_REASONS=new Set(["browser_observation","direct_observation","financial_execution","record_readback","requirement_clarification","manual_interpretation","page_scope","page_citations","field_relationship","source_ambiguity","no_citations","model_unresolved"]);
const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const canonical=value=>JSON.stringify(value,(_key,entry)=>object(entry)?Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b,"en"))):entry);
const same=(a,b)=>canonical(a)===canonical(b);
const hash=hashEvidenceReplay;
const statuses=report=>report.items.map(({criterionId,status})=>({criterionId,status}));

/** Include the tool's own imports, not only the production assessment closure. */
export async function evidenceReplayImplementationSnapshot(root=ROOT){
 const pending=["scripts/replay-evidence-actions-2026-11-06.mjs","package.json","pnpm-lock.yaml"],seen=new Set(),rows=[];
 while(pending.length){
  const file=pending.pop();if(file===undefined)throw new Error("Empty runtime import queue.");if(seen.has(file))continue;seen.add(file);
  assert.ok(!file.startsWith("../")&&!path.isAbsolute(file)&&!file.split("/").includes("outputs"));
  const bytes=await readFile(path.join(root,file));rows.push({file,bytes:bytes.length,sha256:hash(bytes)});
  if(!/\.(?:ts|mjs)$/u.test(file))continue;
  for(const match of bytes.toString("utf8").matchAll(/(?:from\s*|import\s*\()(["'])(\.[^"']+)\1/gu)){
   const imported=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[2]));
   assert.ok(!imported.startsWith("../")&&!path.isAbsolute(imported));
   if(/\.(?:ts|mjs|json)$/u.test(imported))pending.push(imported);
  }
 }
 return rows.sort((a,b)=>a.file.localeCompare(b.file,"en"));
}

// Replay is not a newly saved report. Pin the two generated identity values
// rather than silently dropping id/time from the full-field comparison.
async function withRetainedReportIdentity(previous,operation){
 assert.ok(typeof previous.id==="string"&&previous.id.length>0&&Number.isFinite(Date.parse(previous.assessedAt)));
 const OriginalDate=globalThis.Date,originalUuid=globalThis.crypto.randomUUID;
 globalThis.Date=new Proxy(OriginalDate,{construct(target,args,newTarget){return args.length?Reflect.construct(target,args,newTarget):new target(previous.assessedAt);}});
 globalThis.crypto.randomUUID=()=>previous.id;
 try{return await operation();}finally{globalThis.Date=OriginalDate;globalThis.crypto.randomUUID=originalUuid;}
}

/** This narrow allowlist cannot hide an explanation, status or citation change. */
export function stripEvidenceActionMetadata(report){
 const copy=structuredClone(report);
 for(const item of copy.items)delete item.evidenceNeed;
 // The bounded risk-quarantine extension, when present, is checked separately.
 delete copy.withheldRisks;
 return copy;
}

/** The later additive obligation record is admitted only after exact original
 * wording validation on BOTH sides. This does not ignore any verdict, quote,
 * explanation or an arbitrary new item field. Historical status deltas still
 * fail the unchanged baseline gate above/below this metadata comparison. */
export function verifyAdditiveObligationsBaseline(report,previous,criteria){
 assert.deepEqual(report.items.map(item=>item.criterionId),criteria.map(c=>c.id));
 assert.deepEqual(previous.items.map(item=>item.criterionId),criteria.map(c=>c.id));
 const current=stripEvidenceActionMetadata(report),baseline=stripEvidenceActionMetadata(previous);
 let additions=0,retained=0;
 for(let index=0;index<criteria.length;index++){
  const item=report.items[index],old=previous.items[index],criterion=criteria[index];
  assert.ok(Object.hasOwn(item,"obligations")&&isAssessmentObligations(item.obligations,criterion),"Current additive obligation metadata does not bind to the exact locked wording.");
  if(Object.hasOwn(old,"obligations")){
   assert.ok(isAssessmentObligations(old.obligations,criterion),"Baseline obligation metadata is invalid; it cannot be stripped or repaired.");
   assert.ok(same(item.obligations,old.obligations),"A previously saved obligation record changed.");retained++;
  }else additions++;
  delete current.items[index].obligations;delete baseline.items[index].obligations;
 }
 assert.ok(same(current,baseline),"A field other than evidenceNeed/withheldRisks/exact validated additive obligations changed from the published baseline.");
 return{validated:criteria.length,additions,alreadyRetainedUnchanged:retained,exactLockedWording:true,publishedCoreFieldsUnchanged:true};
}

function verifyCitations(report,files,criteria){
 assert.ok(object(report)&&Array.isArray(report.items)&&Array.isArray(report.risks)&&Array.isArray(report.limitations));
 assert.deepEqual(report.items.map(item=>item.criterionId),criteria.map(item=>item.id));
 const counts={itemCitations:0,riskCitations:0};
 for(const [kind,maximum,count]of[["items",ASSESSMENT_ITEM_CITATION_LIMIT,"itemCitations"],["risks",ASSESSMENT_RISK_CITATION_LIMIT,"riskCitations"]]){
  for(const row of report[kind]){
   assert.ok(Array.isArray(row.citations)&&row.citations.length<=maximum);
   for(const citation of row.citations){
    assert.ok(Object.hasOwn(files,citation.file));
    assert.ok(Number.isSafeInteger(citation.start)&&Number.isSafeInteger(citation.end)&&citation.start>=0&&citation.end>citation.start&&citation.end<=files[citation.file].length);
    assert.equal(files[citation.file].slice(citation.start,citation.end),citation.excerpt);
    counts[count]++;
   }
  }
 }
 return{...counts,exactUtf16SourceSpans:true};
}

function evidenceNeeds(report,files){
 return report.items.filter(item=>item.status==="insufficient_evidence").map(item=>{
  const value=item.evidenceNeed;
  if(value!==undefined){
   assert.ok(object(value));assert.deepEqual(Object.keys(value).sort(),["reason","schema","targetFiles"]);
   assert.equal(value.schema,"source-evidence-need-v1");assert.ok(EVIDENCE_REASONS.has(value.reason));
   assert.ok(Array.isArray(value.targetFiles)&&value.targetFiles.length<=40&&new Set(value.targetFiles).size===value.targetFiles.length);
   for(const file of value.targetFiles)assert.ok(typeof file==="string"&&file.length<=300&&Object.hasOwn(files,file)&&/\.(?:html|css)$/iu.test(file));
  }
  return{criterionId:item.criterionId,status:item.status,evidenceNeed:value??null,hasActionableReason:value!==undefined};
 });
}

/** The unsigned exported ledger cannot itself prove original model statuses.
 * Here the retained original wire body provides that independent premise. */
export function verifyAdjustedCriteriaLineage(wireItems,criteria,report,required=false){
 const validStatuses=new Set(["supported","changes_suggested","insufficient_evidence"]);
 assert.ok(Array.isArray(wireItems));assert.equal(wireItems.length,criteria.length);
 const original=new Map();
 for(const item of wireItems){
  assert.ok(object(item)&&typeof item.criterionId==="string"&&validStatuses.has(item.status));
  assert.ok(!original.has(item.criterionId),"Original wire items duplicate a criterion.");original.set(item.criterionId,item.status);
 }
 assert.deepEqual(report.items.map(item=>item.criterionId),criteria.map(item=>item.id));
 const originalStatuses=criteria.map(criterion=>{assert.ok(original.has(criterion.id),"Original wire item scope differs from the agreed criteria.");return{criterionId:criterion.id,status:original.get(criterion.id)};});
 const publishedStatuses=report.items.map(item=>{assert.ok(validStatuses.has(item.status));return{criterionId:item.criterionId,status:item.status};});
 const adjustedCriteria=publishedStatuses.filter((item,index)=>item.status!==originalStatuses[index].status).map(item=>({criterionId:item.criterionId,originalStatus:original.get(item.criterionId),publishedStatus:item.status}));
 const metadata=report.withheldRisks;
 if(metadata!==undefined){
  assert.ok(object(metadata));assert.deepEqual(metadata.adjustedCriteria,adjustedCriteria,"The quarantine ledger must contain every original-wire/final status difference in agreed criterion order, with exact from/to values.");
 }else assert.ok(!required||adjustedCriteria.length===0,"A changed item lacks its original-wire status ledger.");
 return{source:"retained_original_provider_body",rawWireItems:wireItems.length,originalStatuses,publishedStatuses,adjustedCriteria,
  allAgreedCriteriaCompared:true,ledgerVerified:metadata!==undefined||adjustedCriteria.length===0};
}

function retainedRiskLineage(old,packet,report,required){
 const decoded=assessmentReportJson(assessmentCompletionText(old.raw.providerBody,"catalog_slots")).value;
 assert.equal(decoded.catalogId,packet.citationCatalog.catalogId);assert.ok(same(decoded.items,old.raw.items));
 const statusLineage=verifyAdjustedCriteriaLineage(decoded.items,packet.criteria,report,required);
 const risks=decoded.risks.map((entry,originalRiskIndex)=>{
  const {fields:risk}=canonicalAssessmentRisk(entry);
  const resolved={title:risk.title.trim(),explanation:risk.explanation.trim(),suggestion:risk.suggestion.trim(),
   citations:resolveCatalogCitations(assessmentCitationSelection(risk.citations,ASSESSMENT_RISK_CITATION_LIMIT,"catalog_slots"),packet.citationCatalog,ASSESSMENT_RISK_CITATION_LIMIT)};
  assert.ok(same(resolved,old.application.report.risks[originalRiskIndex]),"The retained original risk does not match its provider slots/source catalog.");
  return{originalRiskIndex,risk:resolved,providerRiskSha256:hash(canonical(entry)),resolvedRiskSha256:hash(canonical(resolved))};
 });
 assert.equal(risks.length,old.application.report.risks.length);
 return{statusLineage,adjustedCriteria:statusLineage.adjustedCriteria,candidates:statusLineage.adjustedCriteria.length?risks:[]};
}

export function verifyWithheldRiskLineage(report,lineage,files,criteria,required=false){
 const metadata=report.withheldRisks,expected=lineage.candidates;
 let exactCitations=0;
 for(const entry of expected)exactCitations+=verifyCitations({...report,risks:[entry.risk]},files,criteria).riskCitations;
 if(metadata===undefined){assert.ok(!required,"Every new V3 report must explicitly record its risk-publication disposition.");return{expectedEntries:expected.length,expectedCitations:exactCitations,present:false,disposition:null,lineageVerified:false,entries:expected};}
 assert.deepEqual(Object.keys(metadata).sort(),["adjustedCriteria","entries","reason","version"]);
 const adjusted=lineage.adjustedCriteria.length>0;
 assert.equal(metadata.version,1);assert.equal(metadata.reason,adjusted?"item_status_adjusted":"not_withheld");
 assert.ok(same(metadata.adjustedCriteria,lineage.adjustedCriteria));
 assert.ok(Array.isArray(metadata.entries)&&metadata.entries.length<=5);assert.equal(metadata.entries.length,expected.length);
 for(let index=0;index<metadata.entries.length;index++){
  const entry=metadata.entries[index];assert.deepEqual(Object.keys(entry).sort(),["originalRiskIndex","risk"]);assert.equal(entry.originalRiskIndex,index);
  assert.ok(same(entry.risk,expected[index].risk),"A quarantined risk differs from its retained provider/source lineage.");
  assert.deepEqual(Object.keys(entry.risk).sort(),["citations","explanation","suggestion","title"]);
  for(const [key,maximum]of[["title",120],["explanation",600],["suggestion",400]])assert.ok(typeof entry.risk[key]==="string"&&entry.risk[key].trim().length>0&&entry.risk[key].length<=maximum);
  assert.ok(entry.risk.citations.length>=1&&entry.risk.citations.length<=3);
 }
 if(adjusted)assert.equal(report.risks.length,0,"Quarantined risks must never be appended to the active pool.");
 return{expectedEntries:expected.length,expectedCitations:exactCitations,present:true,disposition:metadata.reason,lineageVerified:true,entries:expected};
}

function verifyReviewNamespace(quote,report){
 const input=structuredClone(quote);input.proof.delivery.assessment=structuredClone(report);
 // Local state-transition counterexample, never a real or simulated payment.
 input.status="paid";input.captureId="controlled-existing-capture";input.proof.paymentState="captured";input.proof.acceptedDeliveryId=input.proof.delivery.id;input.proof.acceptedAt="2026-11-06T00:00:00.000Z";
 const before=structuredClone(input),base={deliveryId:report.deliveryId,assessmentId:report.id,riskIndex:0,decision:"needs_evidence",reason:"Controlled namespace review; source claim remains unverified."};
 const withheld=report.withheldRisks?.entries??[];
 if(withheld.length){
  const after=recordRiskReview(input,"buyer",{...base,riskOrigin:"withheld"},"2026-11-06T00:00:00.000Z");
  assert.equal(after.proof.delivery.riskReviews.at(-1).riskOrigin,"withheld");
  assert.ok(same(after.proof.delivery.assessment,report));assert.deepEqual(input,before);
  assert.equal(after.proof.acceptedDeliveryId,before.proof.acceptedDeliveryId);assert.equal(after.proof.acceptedAt,before.proof.acceptedAt);assert.equal(after.captureId,before.captureId);assert.equal(after.proof.paymentState,"captured");assert.equal(after.status,"paid");
  assert.throws(()=>recordRiskReview(input,"buyer",base));
  assert.throws(()=>recordRiskReview(input,"buyer",{...base,riskOrigin:"withheld",riskIndex:withheld.length}));
  assert.throws(()=>recordRiskReview(input,"buyer",{...base,riskOrigin:"withheld",assessmentId:"stale-report"}));
  assert.throws(()=>recordRiskReview(input,"buyer",{...base,riskOrigin:"withheld",deliveryId:"stale-delivery"}));
 }else if(report.risks.length){
  const after=recordRiskReview(input,"buyer",base,"2026-11-06T00:00:00.000Z");assert.equal(after.proof.delivery.riskReviews.at(-1).riskOrigin,undefined);
  assert.deepEqual(input,before);assert.throws(()=>recordRiskReview(input,"buyer",{...base,riskOrigin:"withheld"}));
 }
 return{checked:withheld.length>0||report.risks.length>0,noRiskPools:withheld.length===0&&report.risks.length===0,withheldPoolSize:withheld.length,publishedPoolSize:report.risks.length,defaultNamespace:"published",withheldNamespace:"withheld",reportAndAcceptanceAndPaymentUnchanged:true};
}

async function inputFile(file){
 assert.ok(typeof file==="string"&&path.isAbsolute(file)&&file.endsWith(".json"),"Inputs must be explicit absolute JSON file names.");
 const bytes=await readFile(file);return{file,bytes,sha256:hash(bytes),value:JSON.parse(bytes)};
}

async function readGroup(group){
 assert.ok(object(group)&&typeof group.label==="string"&&group.label.length>0);
 const inputs=await Promise.all([inputFile(group.corpus),inputFile(group.live),inputFile(group.freeze)]);
 const [corpusInput,liveInput,freezeInput]=inputs,corpus=validateProjectCorpus(corpusInput.value),live=liveInput.value,frozen=freezeInput.value;
 assert.equal(frozen.schema,"proofbeforepay-project-evaluation-freeze-v1");
 assert.equal(frozen.snapshotSha256,hash(canonical(frozen.snapshot)));
 assert.equal(live.freezeSha256,frozen.snapshotSha256);assert.ok(same(live.snapshot,frozen.snapshot));
 assert.equal(frozen.snapshot.corpusSha256,corpusInput.sha256);assert.equal(frozen.snapshot.corpusEncoding,"exact-file-utf8");
 assert.equal(live.model,frozen.snapshot.model);
 assert.deepEqual(live.results.map(row=>row.id),corpus.projects.map(project=>project.id));
 assert.deepEqual(frozen.snapshot.projects.map(row=>row.id),corpus.projects.map(project=>project.id));
 for(const project of corpus.projects){
  const old=live.results.find(row=>row.id===project.id),source=frozen.snapshot.projects.find(row=>row.id===project.id);
  assert.ok(old.attempted&&old.networkAttempted&&old.raw?.bodyComplete&&old.raw.bodyByteCountIsComplete&&old.raw.utf8Valid&&typeof old.raw.bodyText==="string");
  assert.equal(hash(source.requestBody),source.plan.requestSha256);
  assert.deepEqual(source.files.map(row=>row.file).sort(),Object.keys(project.files).sort());
  for(const row of source.files)assert.equal(hash(project.files[row.file]),row.sha256);
  assert.equal(Buffer.byteLength(old.raw.bodyText),old.raw.bodyUtf8Bytes);
  assert.ok(same(JSON.parse(old.raw.bodyText),old.raw.providerBody));
 }
 return{label:group.label,corpus,live,frozen,corpusText:corpusInput.bytes.toString("utf8"),inputs};
}

/** All source/response paths are supplied by the caller, including a baseline
 * publication replay. The global network capability is removed while running. */
export async function replayEvidenceActions({groups,baseline,stage="16",requireEvidenceNeeds=false}){
 assert.ok(Array.isArray(groups)&&groups.length>0&&groups.length<=12);
 assert.ok(["16","17","18"].includes(stage));
 const base=await inputFile(baseline),loaded=await Promise.all(groups.map(readGroup));
 const toolClosure=await evidenceReplayImplementationSnapshot();
 assert.equal(base.value.mode,"controlled_application_replay");assert.equal(base.value.apiCalls,0);assert.equal(base.value.modelCalls,0);assert.equal(base.value.networkCalls,0);
 const expectedIds=loaded.flatMap(group=>group.corpus.projects.map(project=>project.id));
 assert.equal(new Set(expectedIds).size,expectedIds.length);assert.deepEqual(base.value.rows.map(row=>row.id),expectedIds);
 assert.equal(base.value.projects,expectedIds.length);assert.equal(base.value.criteria,loaded.reduce((n,group)=>n+group.corpus.projects.reduce((sum,p)=>sum+p.criteria.length,0),0));
 const rows=[],implementations=[],allInputs=[base,...loaded.flatMap(group=>group.inputs)];
 const originalFetch=globalThis.fetch;let blockedNetworkAttempts=0,interceptedRequests=0,preparedRequestBodies=0;
 globalThis.fetch=async()=>{blockedNetworkAttempts++;throw new Error("All external networking is disabled during retained replay.");};
 try{
  for(const group of loaded){
   const prepared=await prepareProjectEvaluation(group.corpus,{corpusText:group.corpusText,env:{DEEPSEEK_MODEL:group.live.model}});
   preparedRequestBodies+=prepared.prepared.length;
   implementations.push({group:group.label,snapshotSha256:prepared.snapshotSha256,files:prepared.snapshot.implementation,
    closureSha256:hash(canonical(prepared.snapshot.implementation))});
   for(const project of group.corpus.projects){
    const old=group.live.results.find(row=>row.id===project.id),source=group.frozen.snapshot.projects.find(row=>row.id===project.id);
    const prior=base.value.rows.find(row=>row.id===project.id),current=prepared.prepared.find(row=>row.project.id===project.id),currentSource=prepared.snapshot.projects.find(row=>row.id===project.id);
    assert.ok(prior.currentApplication.accepted&&prior.currentApplication.report&&old.application.accepted);
    assert.equal(prior.originalRequestSha256,source.plan.requestSha256);assert.equal(prior.originalProviderBodySha256,hash(old.raw.bodyText));
    assert.equal(currentSource.quoteSha256,source.quoteSha256);assert.equal(current.body,source.requestBody);assert.equal(current.plan.requestSha256,source.plan.requestSha256);
    const packet=JSON.parse(JSON.parse(source.requestBody).messages[1].content);assert.equal(packet.citationEncoding,"catalog_slots");
    assert.deepEqual(packet.criteria,project.criteria.map(({id,title,source})=>({id,title,source})));
    const previous=prior.currentApplication.report,quote=projectQuote(project),before=structuredClone(quote);let intercepts=0,requestSha256;
    const report=await withRetainedReportIdentity(previous,()=>assessDelivery(quote,{DEEPSEEK_API_KEY:"controlled-offline-no-network-replay",DEEPSEEK_MODEL:group.live.model},async(url,init)=>{
     assert.equal(intercepts,0,"A retained replay must never retry.");intercepts++;interceptedRequests++;
     assert.equal(String(url),"https://api.deepseek.com/beta/chat/completions");assert.equal(init?.method,"POST");
     const body=String(init?.body??"");assert.equal(body,source.requestBody);requestSha256=hash(body);
     return new Response(old.raw.bodyText,{status:old.raw.httpStatus,headers:{"Content-Type":"application/json"}});
    }));
    assert.equal(intercepts,1);assert.deepEqual(quote,before,"A read-only assessment mutated the quote, acceptance or payment.");
    assert.deepEqual(statuses(report),statuses(previous));
    const obligationsComparison=verifyAdditiveObligationsBaseline(report,previous,packet.criteria);
    for(const item of report.items)if(item.status!=="insufficient_evidence")assert.equal(item.evidenceNeed,undefined);
    const needs=evidenceNeeds(report,project.files);
    if(requireEvidenceNeeds)assert.ok(needs.every(row=>row.hasActionableReason),"An unknown lacks structured evidence-needed metadata.");
    const citations=verifyCitations(report,project.files,packet.criteria);
    const lineage=retainedRiskLineage(old,packet,report,stage!=="16"),withheldRisks=verifyWithheldRiskLineage(report,lineage,project.files,packet.criteria,stage!=="16");
    const reviewNamespace=stage==="18"?verifyReviewNamespace(quote,report):{checked:false,reason:"Risk annotation namespace belongs to cycle18, not this stage."};
    rows.push({group:group.label,id:project.id,criterionCount:project.criteria.length,originalProviderBodySha256:hash(old.raw.bodyText),originalRequestSha256:source.plan.requestSha256,replayRequestSha256:requestSha256,
     originalFreezeSha256:group.frozen.snapshotSha256,sourceFiles:source.files,quoteSha256:source.quoteSha256,quoteUnchanged:true,acceptanceAndPaymentUnchanged:true,
     requestBytesUnchanged:true,completeCriteria:true,itemStatusesUnchanged:true,publishedFieldsUnchanged:true,evidenceNeeds:needs,
     citationVerification:citations,obligationsComparison,statusLineage:lineage.statusLineage,withheldRisks,reviewNamespace,baselineApplication:prior.currentApplication,currentApplication:{accepted:true,report,error:null}});
   }
  }
 }finally{globalThis.fetch=originalFetch;}
 assert.equal(blockedNetworkAttempts,0);
 for(const input of allInputs)assert.equal(hash(await readFile(input.file)),input.sha256,"A retained input changed during replay.");
 assert.ok(same(toolClosure,await evidenceReplayImplementationSnapshot()),"The runtime implementation changed during replay.");
 const harnessBytes=await readFile(fileURLToPath(import.meta.url));
 return{schema:"pbp-evidence-actions-retained-replay-v1",createdAt:new Date().toISOString(),stage,mode:"controlled_application_replay",apiCalls:0,modelCalls:0,networkCalls:0,blockedNetworkAttempts,
  interceptedRequests,preparedRequestBodies,projects:rows.length,criteria:rows.reduce((sum,row)=>sum+row.criterionCount,0),
  harness:{file:"scripts/replay-evidence-actions-2026-11-06.mjs",sha256:hash(harnessBytes)},runtime:{node:process.version,platform:process.platform,reportIdentityMode:"frozen_baseline_clock_and_uuid"},
  inputs:allInputs.map(({file,bytes,sha256})=>({file,bytes:bytes.length,sha256})),currentImplementations:implementations,
  toolImplementation:toolClosure,runtimeClosureSha256:hash(canonical(toolClosure)),rows,
  totals:{unknowns:rows.reduce((n,row)=>n+row.evidenceNeeds.length,0),unknownsWithEvidenceNeed:rows.reduce((n,row)=>n+row.evidenceNeeds.filter(x=>x.hasActionableReason).length,0),
   itemCitations:rows.reduce((n,row)=>n+row.citationVerification.itemCitations,0),activeRiskCitations:rows.reduce((n,row)=>n+row.citationVerification.riskCitations,0),
   retainedWithheldEntries:rows.reduce((n,row)=>n+row.withheldRisks.expectedEntries,0),retainedWithheldCitations:rows.reduce((n,row)=>n+row.withheldRisks.expectedCitations,0),
   quarantinedEntriesVerified:rows.reduce((n,row)=>n+(row.withheldRisks.lineageVerified?row.withheldRisks.expectedEntries:0),0),namespaceReportsChecked:rows.filter(row=>row.reviewNamespace.checked).length,
   statusLineageReportsChecked:rows.filter(row=>row.statusLineage.allAgreedCriteriaCompared).length,statusLineageLedgersVerified:rows.filter(row=>row.statusLineage.ledgerVerified).length,originalToPublishedStatusAdjustments:rows.reduce((n,row)=>n+row.statusLineage.adjustedCriteria.length,0)},
  limits:["Retained original HTTP bodies and byte-identical requests, not new model inference or a prompt experiment.","The baseline is the previous publication replay, not the unprocessed R15 response. Only explicitly allowed new evidence-action metadata may differ.",
   "Original raw responses, source files, frozen references, item statuses, active risks and report explanations remain unchanged; input hashes are checked again after replay. New obligation directions are a separately counted additive change and must exactly rederive from each locked criterion; baseline directions, when present, must also validate and remain unchanged.",
   "Evidence requests and quarantined AI leads do not establish a defect, resolution, acceptance or payment. Replaying synthetic or public templates is not a customer test."]};
}

export async function writeEvidenceReplay(output,report){
 assert.ok(typeof output==="string"&&path.isAbsolute(output)&&output.endsWith(".json"));
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
}

async function main(args){
 const flags=new Map();
 for(let i=0;i<args.length;i++){
  if(!["--manifest","--baseline","--output","--stage","--require-evidence-needs"].includes(args[i])||flags.has(args[i])||!args[i+1]||args[i+1].startsWith("--"))throw new Error("Supply --manifest, --baseline, --output and optional --stage 16|17|18 / --require-evidence-needs true.");
  flags.set(args[i],args[++i]);
 }
 const manifest=await inputFile(flags.get("--manifest"));assert.equal(manifest.value.schema,"pbp-evidence-actions-replay-inputs-v1");
 assert.ok(!flags.has("--require-evidence-needs")||flags.get("--require-evidence-needs")==="true");
 const report=await replayEvidenceActions({groups:manifest.value.groups,baseline:flags.get("--baseline"),stage:flags.get("--stage")??"16",requireEvidenceNeeds:flags.get("--require-evidence-needs")==="true"});
 report.manifest={file:manifest.file,sha256:manifest.sha256};await writeEvidenceReplay(flags.get("--output"),report);
 console.log(JSON.stringify({output:flags.get("--output"),stage:report.stage,apiCalls:0,modelCalls:0,networkCalls:0,projects:report.projects,criteria:report.criteria,...report.totals}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main(process.argv.slice(2)).catch(error=>{console.error(`Evidence-actions replay stopped: ${error.message}. No provider request or overwrite was allowed.`);process.exitCode=1;});}
