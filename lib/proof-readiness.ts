import type {ProofQuote,ProofRole} from "./contracts.ts";
import {acceptanceBasis} from "./acceptance-basis.ts";
import {assertAcceptedEvidenceReference} from "./acceptance-evidence.ts";

/** Shared with the payment controls. An unfinished observation lease never
 * becomes permission to authorize/capture, even after an earlier acceptance. */
export function hasPendingEvidenceRun(quote:ProofQuote):boolean{return !!(quote.proof.delivery?.runtimeRun||quote.proof.delivery?.journeyRun||quote.proof.delivery?.modelRun);}
export function hasFrozenCaptureEvidence(quote:ProofQuote):boolean{
 const delivery=quote.proof.delivery,id=quote.proof.acceptedEvidenceSnapshotId??quote.proof.collaboration?.acceptance?.evidenceSnapshotId;
 if(!id||!delivery?.acceptanceEvidence?.some(row=>row.id===id&&row.deliveryId===delivery.id))return false;
 try{assertAcceptedEvidenceReference(quote);return true;}catch{return false;}
}
/** First single-user consent has a current basis. Every accepted/pending path
 * instead needs its retained snapshot, including legacy non-pending records. */
export function captureEvidenceReady(quote:ProofQuote):boolean{
 const needsSnapshot=!!(quote.proof.acceptedEvidenceSnapshotId||quote.proof.collaboration?.stage==="accepted"||quote.proof.paymentOperation==="capture");
 return !needsSnapshot||hasFrozenCaptureEvidence(quote);
}
const reportKeys=["browserReportId","layoutReportId","assessmentId","businessReportId","runtimeReportId","journeyReportId","modelReportId"] as const;
export function proofReadiness(quote:ProofQuote,role:ProofRole,now=Date.now()){
 const delivery=quote.proof.delivery,basis=delivery?acceptanceBasis(quote):null;
 const snapshotId=quote.proof.collaboration?.acceptance?.evidenceSnapshotId??quote.proof.acceptedEvidenceSnapshotId;
 const snapshot=delivery?.acceptanceEvidence?.find(row=>row.id===snapshotId&&row.deliveryId===delivery.id);
 const frozenValid=hasFrozenCaptureEvidence(quote);
 const differences=basis&&snapshot?reportKeys.filter(key=>(snapshot[key]??null)!==basis[key]).map(kind=>({kind,acceptedReportId:snapshot[kind]??null,currentReportId:basis[kind]})):[];
 const manualIds=new Set(delivery?.evidence.filter(row=>row.finding==="needs_human").map(row=>row.criterionId)??[]);
 const manualItems=quote.proof.criteria.filter(row=>manualIds.has(row.id)).map(row=>({criterionId:row.id,title:row.title,source:row.source,confirmationRecorded:frozenValid&&!!snapshot?.manualChecks.includes(row.id)}));
 const running=hasPendingEvidenceRun(quote),pending=quote.proof.paymentOperation??null;
 const deadline=quote.proof.authorizationExpiresAt??null,windowExpired=!!deadline&&Number.isFinite(Date.parse(deadline))&&Date.parse(deadline)<=now;
 const blockers:{code:string;phase:"acceptance"|"payment"}[]=[];
 if(running)blockers.push({code:"checks_running",phase:"acceptance"},{code:"checks_running",phase:"payment"});
 if(!delivery)blockers.push({code:"delivery_missing",phase:"acceptance"});
 if(delivery&&quote.proof.review?.deliveryId!==delivery.id)blockers.push({code:"review_missing",phase:"acceptance"});
 if(delivery?.evidence.some(row=>row.finding==="fail"))blockers.push({code:"requirements_failed",phase:"acceptance"});
 if(quote.proof.collaboration&&quote.proof.collaboration.stage!=="accepted")blockers.push({code:"acceptance_required",phase:"payment"});
 if((snapshotId||pending==="capture"||quote.proof.collaboration?.stage==="accepted")&&!frozenValid)blockers.push({code:"frozen_evidence_inconsistent",phase:"payment"});
 if(windowExpired&&!pending)blockers.push({code:"authorization_window_ended",phase:"payment"});
 if(role!=="buyer")blockers.push({code:"buyer_action_required",phase:"payment"});
 return {projectId:quote.id,deliveryId:delivery?.id??null,paymentMode:quote.paymentMode,currentBasis:basis,
  frozenAcceptance:snapshot?{snapshotId:snapshot.id,deliveryId:snapshot.deliveryId,at:snapshot.at,valid:frozenValid,...Object.fromEntries(reportKeys.map(key=>[key,snapshot[key]??null])) as Record<typeof reportKeys[number],string|null>}:null,
  supplementalDifferences:differences,manualItems,blockers,financialActionsBlockedByRun:running,
  payment:{state:quote.proof.paymentState,pendingOperation:pending,authorizationDeadline:deadline,localWindowExpired:windowExpired,
   canRetryOriginalOperation:role==="buyer"&&!!pending&&!running&&(pending!=="capture"||frozenValid),canRequestReconciliation:role==="buyer"&&quote.paymentMode==="sandbox"&&!!pending&&quote.proof.paymentState==="authorized"},
  limits:{providerQueried:false,automaticConsent:false,sellerSettlement:false}};
}
export type ProofReadiness=ReturnType<typeof proofReadiness>;
