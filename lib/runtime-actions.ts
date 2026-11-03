import type {ProofQuote,ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {savedRuntimePlan,deliveryRuntimeTarget,runtimeReportsFor} from "./runtime-project.ts";
import {validateRuntimeReport,type RuntimeCheckReport} from "./runtime-checks.ts";
import {finishRuntimeEvidenceReservation,reserveRuntimeEvidence} from "./evidence-budget.ts";

export function beginRuntimeRun(quote:ProofQuote,role:ProofRole,input:Record<string,unknown>,digest:string,now=Date.now()):ProofQuote {
  if(role!=="buyer"&&role!=="seller")throw new DomainError("Only project members can start backend checks.",403);
  const delivery=quote.proof.delivery,plan=savedRuntimePlan(quote);
  if(!plan||!delivery||input.deliveryId!==delivery.id||!delivery.backendTargetId||delivery.runtimeDeliveryDigest!==digest)throw new DomainError("Backend tests need the current upload, declared target and locked plan.",409);
  if(input.confirm!==true)throw new DomainError("Authorize synthetic writes to the controlled disposable test backend.");
  if(quote.status!=="approved"||quote.proof.paymentOperation||["captured","voided","closed_unpaid"].includes(quote.proof.paymentState))throw new DomainError("This workflow is not open for backend tests.",409);
  if(input.previousReportId!==(delivery.runtimeReport?.id??null))throw new DomainError("The backend report changed. Reload before starting.",409);
  if(runtimeReportsFor(delivery).length>=20)throw new DomainError("Backend report history is full; prior runs were preserved.",409);
  if(delivery.runtimeRegistration&&delivery.runtimeRegistration.projectId!==quote.id)throw new DomainError("The registered backend belongs to another project.",409);
  if((deliveryRuntimeTarget(delivery).protocol??"booking-http-v1")!==plan.protocol)throw new DomainError("The declared backend target does not support the locked test protocol.",409);
  if(delivery.journeyRun||delivery.modelRun)throw new DomainError("Finish the pending journey or model run before another backend check.",409);
  const pending=delivery.runtimeRun;
  if(pending && Date.parse(pending.expiresAt)>now)throw new DomainError("A backend run is already pending. Refresh after it finishes.",409);
  if(pending&&(pending.deliveryId!==delivery.id||pending.deliveryDigest!==digest||pending.targetId!==delivery.backendTargetId))throw new DomainError("The pending backend run binding is inconsistent.",409);
  const next=structuredClone(quote);
  next.proof.delivery!.runtimeRun={id:pending?.id??crypto.randomUUID(),deliveryId:delivery.id,deliveryDigest:digest,targetId:delivery.backendTargetId,startedAt:pending?.startedAt??new Date(now).toISOString(),expiresAt:new Date(now+45_000).toISOString()};
  return reserveRuntimeEvidence(next,next.proof.delivery!.runtimeRun!.id);
}
export function finishRuntimeRun(quote:ProofQuote,value:RuntimeCheckReport):ProofQuote {
  const delivery=quote.proof.delivery,run=delivery?.runtimeRun,plan=savedRuntimePlan(quote);
  if(!delivery||!run||!plan||run.deliveryId!==delivery.id||run.targetId!==delivery.backendTargetId||run.deliveryDigest!==delivery.runtimeDeliveryDigest)throw new DomainError("The backend run no longer matches the current upload.",409);
  if(delivery.runtimeRegistration&&delivery.runtimeRegistration.projectId!==quote.id)throw new DomainError("The registered backend belongs to another project.",409);
  const report=validateRuntimeReport(value,{deliveryId:delivery.id,deliveryDigest:run.deliveryDigest,runId:run.id,plan,target:deliveryRuntimeTarget(delivery),registration:delivery.runtimeRegistration});
  const history=runtimeReportsFor(delivery);
  if(history.some(row=>row.id===report.id))throw new DomainError("A backend run cannot replace a saved report.",409);
  const next=structuredClone(quote);
  next.proof.delivery!.runtimeReport=report;next.proof.delivery!.runtimeHistory=[...history,report];delete next.proof.delivery!.runtimeRun;
  return finishRuntimeEvidenceReservation(next,run.id,report);
}
