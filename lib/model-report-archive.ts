import type {ProofDelivery, ProofQuote} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {MODEL_HISTORY_LIMIT, MODEL_REPORT_BYTES, validateStoredModelCheckReport, type ModelCheckReport} from "./model-checks.ts";
import {runtimeDeliveryDigest} from "./runtime-project.ts";
import {validateProjectJourneyPlan} from "./project-journey.ts";

export const MODEL_ARCHIVE_LIMIT = 16;
export const MODEL_TOTAL_REPORT_LIMIT = MODEL_HISTORY_LIMIT + MODEL_ARCHIVE_LIMIT;
export type ModelArchiveRef = {reportId:string;runId:string;deliveryId:string;payloadSha256:string;payloadBytes:number};
/** Exact original JSON bytes, hydrated only after an authorized store read. */
export type ModelArchiveObject = {ref:ModelArchiveRef;payload:string};
export type ModelStorageCapacity = {
  schema:"model-storage-capacity-v1";canRun:boolean;reasons:string[];
  limits:{inlineReports:4;archivedReports:16;totalReports:20;inlineEvidenceBytes:262144;hydratedDeliveryBytes:2097152};
  saved:{inlineReports:number;archivedReports:number;totalReports:number;inlineEvidenceBytes:number;archivedPayloadBytes:number;hydratedDeliveryBytes:number};
  next:{archiveMoves:number;reportReservationBytes:32768;acceptanceReservationBytes:number;projectedInlineEvidenceBytes:number;projectedHydratedDeliveryBytes:number};
};
const bytes=(value:string)=>new TextEncoder().encode(value).byteLength;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function fail(message:string):never{throw new DomainError(message,409);}
function exact(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail("The model archive metadata is invalid.");
  const row=value as Record<string,unknown>;if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key)))fail("The model archive metadata contains unsupported fields.");return row;
}
export function modelArchiveRefs(delivery:ProofDelivery):ModelArchiveRef[]{
  if(delivery.modelArchiveRefs===undefined)return[];
  if(!Array.isArray(delivery.modelArchiveRefs)||delivery.modelArchiveRefs.length>MODEL_ARCHIVE_LIMIT)fail("The model archive reference allowance is full or invalid.");
  const result:ModelArchiveRef[]=[];
  for(const value of delivery.modelArchiveRefs){
    const r=exact(value,["reportId","runId","deliveryId","payloadSha256","payloadBytes"]);
    if(typeof r.reportId!=="string"||!r.reportId||r.reportId.length>80||typeof r.runId!=="string"||!r.runId||r.runId.length>80||r.deliveryId!==delivery.id||typeof r.payloadSha256!=="string"||!/^[a-f0-9]{64}$/u.test(r.payloadSha256)||!Number.isSafeInteger(r.payloadBytes)||Number(r.payloadBytes)<1||Number(r.payloadBytes)>MODEL_REPORT_BYTES)fail("The model archive reference does not match this delivery.");
    if(result.some(prior=>prior.reportId===r.reportId||prior.runId===r.runId))fail("A model archive report or run identity is duplicated.");result.push(structuredClone(r) as ModelArchiveRef);
  }
  return result;
}
export function inlineModelReportsFor(delivery:ProofDelivery):ModelCheckReport[]{
  if(delivery.modelHistory!==undefined&&!Array.isArray(delivery.modelHistory))fail("The saved model history is invalid.");
  const result:ModelCheckReport[]=[];
  for(const value of [...(delivery.modelHistory??[]),...(delivery.modelReport?[delivery.modelReport]:[])]){
    const report=validateStoredModelCheckReport(value,{deliveryId:delivery.id});const prior=result.find(row=>row.id===report.id);
    if(prior&&!same(prior,report))fail("An immutable model report identifier cannot be rewritten.");
    if(result.some(row=>row.runId===report.runId&&row.id!==report.id))fail("A model run cannot have multiple report identities.");if(!prior)result.push(report);
  }
  if(result.length>MODEL_HISTORY_LIMIT)fail("The inline model report window exceeds four reports.");return result;
}
/** Structural/identity validation is pure. SHA validation occurs at the async
 * store/export boundary; a self-consistent hash is not execution attestation. */
export function archivedModelReportsFor(delivery:ProofDelivery):ModelCheckReport[]{
  const refs=modelArchiveRefs(delivery),objects=delivery.modelArchive??[];
  if(!Array.isArray(objects)||objects.length!==refs.length)fail("A retained model archive object is missing or unreferenced.");
  return refs.map(ref=>{
    const matches=objects.filter(value=>value?.ref?.reportId===ref.reportId);if(matches.length!==1)fail("The model archive object mapping is incomplete or duplicated.");
    const value=exact(matches[0],["ref","payload"]);if(!same(value.ref,ref)||typeof value.payload!=="string"||bytes(value.payload)!==ref.payloadBytes)fail("The model archive bytes or metadata differ from their reference.");
    let parsed:unknown;try{parsed=JSON.parse(value.payload);}catch{fail("The retained model archive is not valid JSON.");}
    const report=validateStoredModelCheckReport(parsed,{deliveryId:delivery.id});if(report.id!==ref.reportId||report.runId!==ref.runId)fail("The model archive object belongs to another report or run.");return report;
  });
}
export function modelReportsFor(delivery:ProofDelivery):ModelCheckReport[]{
  const archived=archivedModelReportsFor(delivery),inline=inlineModelReportsFor(delivery),all=[...archived,...inline];
  if(new Set(all.map(row=>row.id)).size!==all.length||new Set(all.map(row=>row.runId)).size!==all.length||all.length>MODEL_TOTAL_REPORT_LIMIT)fail("A retained model report is duplicated or exceeds the total allowance.");return structuredClone(all);
}
export async function modelPayloadSha256(payload:string):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload)))].map(v=>v.toString(16).padStart(2,"0")).join("");}
export async function validateModelArchive(delivery:ProofDelivery,projectId:string):Promise<void>{
  const reports=modelReportsFor(delivery);
  if(reports.length){
    if(!delivery.files||!delivery.journeyPlan)fail("Retained model evidence needs its exact files and original technical agreement.");
    const deliveryDigest=await runtimeDeliveryDigest(delivery.files),plan=validateProjectJourneyPlan(delivery.journeyPlan);
    for(const report of reports)validateStoredModelCheckReport(report,{deliveryId:delivery.id,deliveryDigest,journeyPlanDigest:plan.planDigest,projectId});
  }
  for(const object of delivery.modelArchive??[])if(await modelPayloadSha256(object.payload)!==object.ref.payloadSha256)fail("The retained model archive SHA-256 does not match its exact payload bytes.");
}
/** Pure preparation plus hashing: no database mutation and no external I/O.
 * Objects become durable only in the same transaction as the consented lease. */
export async function prepareModelRunStorage(quote:ProofQuote):Promise<ProofQuote>{
  const next=structuredClone(quote),delivery=next.proof.delivery;if(!delivery)fail("Model storage needs a saved delivery.");await validateModelArchive(delivery,quote.id);
  const all=modelReportsFor(delivery);if(all.length>=MODEL_TOTAL_REPORT_LIMIT)fail("The retained model report upper bound is reached. Existing evidence was retained.");
  const inline=inlineModelReportsFor(delivery);if(inline.length<MODEL_HISTORY_LIMIT)return next;
  const refs=modelArchiveRefs(delivery);if(refs.length>=MODEL_ARCHIVE_LIMIT)fail("The model archive upper bound is reached. Existing evidence was retained.");
  const oldest=inline.find(row=>row.id!==delivery.modelReport?.id);if(!oldest)fail("The current model report cannot be removed from the inline window.");
  const payload=JSON.stringify(oldest),ref:ModelArchiveRef={reportId:oldest.id,runId:oldest.runId,deliveryId:delivery.id,payloadSha256:await modelPayloadSha256(payload),payloadBytes:bytes(payload)};
  delivery.modelArchiveRefs=[...refs,ref];delivery.modelArchive=[...(delivery.modelArchive??[]),{ref:structuredClone(ref),payload}];delivery.modelHistory=inline.filter(row=>row.id!==oldest.id);await validateModelArchive(delivery,quote.id);return next;
}
export function dehydrateModelDelivery(delivery:ProofDelivery):ProofDelivery{const copy=structuredClone(delivery);delete copy.modelArchive;return copy;}
export function dehydrateModelQuote(quote:ProofQuote):ProofQuote{const copy=structuredClone(quote);if(copy.proof.delivery)copy.proof.delivery=dehydrateModelDelivery(copy.proof.delivery);return copy;}
