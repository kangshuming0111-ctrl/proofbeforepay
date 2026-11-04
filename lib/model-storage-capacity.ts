import type {ProofQuote} from "./contracts.ts";
import {MODEL_REPORT_BYTES} from "./model-checks.ts";
import {inlineModelReportsFor,modelArchiveRefs,modelReportsFor,prepareModelRunStorage,type ModelStorageCapacity} from "./model-report-archive.ts";
import {assertQuoteEvidenceBudget,evidenceHistoryBytes,modelEvidenceBudgetProjection} from "./evidence-budget.ts";
import {savedProjectJourneyPlan} from "./project-journey.ts";

export async function modelStorageCapacity(quote:ProofQuote):Promise<ModelStorageCapacity>{
 const delivery=quote.proof.delivery;
 const limits={inlineReports:4,archivedReports:16,totalReports:20,inlineEvidenceBytes:262144,hydratedDeliveryBytes:2097152} as const;
 const capacity:ModelStorageCapacity={schema:"model-storage-capacity-v1",canRun:false,reasons:[],limits,saved:{inlineReports:0,archivedReports:0,totalReports:0,inlineEvidenceBytes:0,archivedPayloadBytes:0,hydratedDeliveryBytes:0},next:{archiveMoves:0,reportReservationBytes:32768,acceptanceReservationBytes:0,projectedInlineEvidenceBytes:0,projectedHydratedDeliveryBytes:0}};
 if(!delivery){capacity.reasons.push("Model storage needs a saved uploaded delivery.");return capacity;}
 capacity.saved={inlineReports:inlineModelReportsFor(delivery).length,archivedReports:modelArchiveRefs(delivery).length,totalReports:modelReportsFor(delivery).length,inlineEvidenceBytes:evidenceHistoryBytes(delivery),archivedPayloadBytes:modelArchiveRefs(delivery).reduce((n,row)=>n+row.payloadBytes,0),hydratedDeliveryBytes:new TextEncoder().encode(JSON.stringify(delivery)).byteLength};
 const baseline=modelEvidenceBudgetProjection(quote);
 capacity.next={archiveMoves:0,reportReservationBytes:32768,acceptanceReservationBytes:baseline.acceptanceBytes,projectedInlineEvidenceBytes:baseline.projectedInlineEvidenceBytes,projectedHydratedDeliveryBytes:baseline.projectedHydratedDeliveryBytes};
 if(quote.status!=="approved"||quote.proof.paymentOperation||["captured","voided","closed_unpaid"].includes(quote.proof.paymentState))capacity.reasons.push("This project is not open for additional model checks.");
 if(delivery.variant!=="upload"||!delivery.files)capacity.reasons.push("Model checks require a saved uploaded delivery.");
 try{if(!savedProjectJourneyPlan(quote))capacity.reasons.push("Confirm the original technical agreement before starting model checks.");}catch{capacity.reasons.push("The saved technical agreement is invalid. Review it before starting model checks.");}
 if(delivery.modelRun||delivery.runtimeRun||delivery.journeyRun||delivery.transferCompetitionRun)capacity.reasons.push("Finish the pending evidence run before starting another model check.");
 try{
   const prepared=await prepareModelRunStorage(quote),next=prepared.proof.delivery!,projection=modelEvidenceBudgetProjection(prepared);
   capacity.next={archiveMoves:modelArchiveRefs(next).length-capacity.saved.archivedReports,reportReservationBytes:MODEL_REPORT_BYTES as 32768,acceptanceReservationBytes:projection.acceptanceBytes,projectedInlineEvidenceBytes:projection.projectedInlineEvidenceBytes,projectedHydratedDeliveryBytes:projection.projectedHydratedDeliveryBytes};
   assertQuoteEvidenceBudget(prepared);
   if(!projection.acceptanceRoom)capacity.reasons.push("The acceptance snapshot upper bound is reached. Existing evidence was retained.");
   if(projection.projectedInlineEvidenceBytes>limits.inlineEvidenceBytes)capacity.reasons.push("The shared evidence history cannot reserve another bounded report and acceptance.");
   if(projection.projectedHydratedDeliveryBytes>limits.hydratedDeliveryBytes)capacity.reasons.push("The hydrated delivery envelope cannot reserve another bounded report and acceptance.");
 }catch(error){capacity.reasons.push(error instanceof Error?error.message:"The retained model evidence could not be validated.");}
 capacity.canRun=capacity.reasons.length===0;return capacity;
}
