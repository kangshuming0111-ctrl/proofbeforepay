import type {ProofDelivery} from "./contracts.ts";
import {validateProjectJourneyPlan} from "./project-journey.ts";
import {diagnoseModelReport,type ModelDiagnosis} from "./model-diagnostics.ts";
import {validateStoredModelCheckReport} from "./model-checks.ts";
import {modelReportsFor,validateModelReportDecision} from "./model-check-actions.ts";

export type ModelSpotlight = {
  state:"none"|"pending"|"checking"|"invalid"|"ready";
  diagnosis?:ModelDiagnosis;
  acceptance:"not_accepted"|"accepted_report"|"supplemental"|"unavailable";
  referenceReportId?:string;
};
export type ModelSpotlightOptions={projectId?:string;acceptedSnapshotId?:string;accepted?:boolean;deliveryDigest?:string;digestPending?:boolean};

/** Read-only presentation of saved evidence. The actual file-map digest is
 * supplied by the caller; an unverified report is never a reassuring result.
 * Only an explicit retained snapshot may establish the acceptance reference. */
export function buildModelSpotlight(delivery:ProofDelivery,options:ModelSpotlightOptions={}):ModelSpotlight{
 const accepted=options.accepted===true||!!options.acceptedSnapshotId;
 const base:ModelSpotlight={state:"none",acceptance:accepted?"unavailable":"not_accepted"};
 const report=delivery.modelReport,run=delivery.modelRun;
 if(!report&&!run)return base;
 if(options.digestPending)return{...base,state:run?"pending":"checking"};
 if(!options.deliveryDigest||!delivery.files)return{...base,state:"invalid"};
 try{
  if(!delivery.journeyPlan)throw new Error("The model evidence requires its saved technical agreement.");
  const plan=validateProjectJourneyPlan(delivery.journeyPlan);
  if(run){
   if(run.deliveryId!==delivery.id||run.deliveryDigest!==options.deliveryDigest||run.journeyPlanDigest!==plan.planDigest||options.projectId!==undefined&&run.registration.projectId!==options.projectId)throw new Error("The saved run belongs to another delivery.");
   return{...base,state:"pending"};
  }
  const diagnosis=diagnoseModelReport(report,{deliveryId:delivery.id,deliveryDigest:options.deliveryDigest,journeyPlanDigest:plan.planDigest,...(options.projectId?{projectId:options.projectId}:{})});
  if(!accepted)return{state:"ready",diagnosis,acceptance:"not_accepted"};
  const snapshot=options.acceptedSnapshotId?delivery.acceptanceEvidence?.find(item=>item.id===options.acceptedSnapshotId&&item.deliveryId===delivery.id):undefined;
  if(!snapshot)return{state:"ready",diagnosis,acceptance:"unavailable"};
  try{
   if(!snapshot.modelReportId){
    if(snapshot.modelSpecDigest!==undefined||snapshot.modelDeliveryDigest!==undefined||snapshot.modelDecision!==undefined)throw new Error("The historical model reference is inconsistent.");
    return{state:"ready",diagnosis,acceptance:"supplemental"};
   }
   const frozen=modelReportsFor(delivery).find(item=>item.id===snapshot.modelReportId);
   if(!frozen)throw new Error("The originally referenced report is unavailable.");
   validateStoredModelCheckReport(frozen,{deliveryId:delivery.id,deliveryDigest:options.deliveryDigest,journeyPlanDigest:plan.planDigest,...(options.projectId?{projectId:options.projectId}:{})});
   if(snapshot.modelDeliveryDigest!==frozen.deliveryDigest||snapshot.modelSpecDigest!==frozen.modelSpecDigest||snapshot.journeyPlanDigest!==frozen.journeyPlanDigest)throw new Error("The original model digests changed.");
   validateModelReportDecision(frozen,snapshot.modelDecision);
   return{state:"ready",diagnosis,acceptance:frozen.id===diagnosis.reportId?"accepted_report":"supplemental",referenceReportId:frozen.id};
  }catch{return{state:"ready",diagnosis,acceptance:"unavailable"};}
 }catch{return{...base,state:"invalid"};}
}
