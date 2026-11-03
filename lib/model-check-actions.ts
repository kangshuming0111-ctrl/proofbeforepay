import type {ProofAcceptanceEvidence, ProofDelivery, ProofQuote, ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {journeyKeys, journeyObject, savedProjectJourneyPlan, sameJourneyRegistration, validateJourneyRegistration, type JourneyRegistrationSnapshot} from "./project-journey.ts";
import {MODEL_HISTORY_LIMIT, MODEL_REPORT_BYTES, MODEL_SPEC_DIGEST, modelCheckReportFromTrace, validateStoredModelCheckReport, type ModelCheckReport, type ModelHttpObservation} from "./model-checks.ts";
import {assertQuoteEvidenceBudget, finishModelEvidenceReservation, reserveModelEvidence} from "./evidence-budget.ts";

export type ModelCheckRun = {id:string;deliveryId:string;deliveryDigest:string;journeyPlanDigest:string;modelSpecDigest:string;seed:number;registration:JourneyRegistrationSnapshot;startedAt:string;expiresAt:string;startedByRole:ProofRole;trace:ModelHttpObservation[]};
export type ModelDecision = {reportId:string;acknowledgeServerCheck:true;exceptionReason?:string};
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function conflict(message:string):never{throw new DomainError(message,409);}
function member(role:ProofRole){if(role!=="buyer"&&role!=="seller")throw new DomainError("Only project members may run additional model checks.",403);}
function current(quote:ProofQuote,id:unknown){const delivery=quote.proof.delivery;if(!delivery||delivery.variant!=="upload"||!delivery.files||id!==delivery.id)conflict("Model checks require the exact current uploaded delivery.");return delivery;}
function mutable(quote:ProofQuote){if(quote.status!=="approved"||quote.proof.paymentOperation||["captured","voided","closed_unpaid"].includes(quote.proof.paymentState))conflict("This project is not open for new model checks.");}

export function modelReportsFor(delivery:ProofDelivery):ModelCheckReport[]{
  if(delivery.modelHistory!==undefined&&!Array.isArray(delivery.modelHistory))conflict("The saved model history is invalid.");
  const result:ModelCheckReport[]=[];
  for(const report of [...(delivery.modelHistory??[]),...(delivery.modelReport?[delivery.modelReport]:[])]){
    if(!report||!report.id||report.deliveryId!==delivery.id)conflict("The saved model report belongs to another delivery.");
    const prior=result.find(item=>item.id===report.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(report))conflict("A saved model report identifier cannot be rewritten.");
    if(result.some(item=>item.runId===report.runId&&item.id!==report.id))conflict("A model run cannot have multiple completed report identities.");
    if(!prior)result.push(report);
  }
  if(result.length>MODEL_HISTORY_LIMIT)conflict("Model report history is full. Existing evidence was retained.");
  return structuredClone(result);
}

export function beginModelCheckRun(quote:ProofQuote,role:ProofRole,input:Record<string,unknown>,digest:string,registration:JourneyRegistrationSnapshot,now=Date.now()):ProofQuote{
  member(role);journeyKeys(input,["action","deliveryId","previousReportId","targetId","seed","confirm"]);mutable(quote);const delivery=current(quote,input.deliveryId),plan=savedProjectJourneyPlan(quote),pin=validateJourneyRegistration(registration);
  if(input.action!=="run"||input.confirm!==true||!plan)throw new DomainError("Confirm the fixed technical agreement and explicitly authorize this server-direct synthetic model check.",409);
  if(delivery.runtimeRun||delivery.journeyRun||delivery.modelRun)conflict("Finish the pending evidence run before starting model checks.");
  if(input.previousReportId!==(delivery.modelReport?.id??null))conflict("The current model report changed. Refresh before running again.");
  if(!Number.isInteger(input.seed)||Number(input.seed)<0||Number(input.seed)>0xffffffff)throw new DomainError("Model checks need an unsigned 32-bit integer seed.");
  if(!Number.isFinite(now)||!/^[a-f0-9]{64}$/u.test(digest)||pin.projectId!==quote.id||pin.id!==input.targetId||pin.frontendBundleDigest!==digest||Date.parse(pin.expiresAt)<=now)conflict("The approved model target does not match this exact uploaded delivery or approval window.");
  if(modelReportsFor(delivery).length>=MODEL_HISTORY_LIMIT)conflict("This delivery has reached four model reports. Prior evidence was retained.");
  const next=structuredClone(quote),id=crypto.randomUUID();next.proof.delivery!.modelRun={id,deliveryId:delivery.id,deliveryDigest:digest,journeyPlanDigest:plan.planDigest,modelSpecDigest:MODEL_SPEC_DIGEST,seed:Number(input.seed),registration:pin,startedAt:new Date(now).toISOString(),expiresAt:new Date(now+30_000).toISOString(),startedByRole:role,trace:[]};
  return reserveModelEvidence(next,id);
}
function runFor(quote:ProofQuote,runId:string):ModelCheckRun{
  const delivery=quote.proof.delivery,run=delivery?.modelRun,plan=savedProjectJourneyPlan(quote);
  if(!delivery||!run||run.id!==runId||run.deliveryId!==delivery.id||!plan||run.journeyPlanDigest!==plan.planDigest||run.modelSpecDigest!==MODEL_SPEC_DIGEST||run.registration.projectId!==quote.id||run.registration.frontendBundleDigest!==run.deliveryDigest)conflict("The model run lease no longer belongs to this exact delivery and agreement.");
  return run;
}
function extendsTrace(prior:ModelHttpObservation[],next:ModelHttpObservation[]):boolean{
  return next.length>=prior.length&&prior.every((row,index)=>{
    const current=next[index];if(row.completedOrdinal!==null)return JSON.stringify(row)===JSON.stringify(current);
    return Object.entries(row).every(([key,value])=>key==="completedOrdinal"||JSON.stringify((current as unknown as Record<string,unknown>)[key])===JSON.stringify(value));
  });
}

export function recordModelCheckCheckpoint(quote:ProofQuote,runId:string,trace:ModelHttpObservation[]):ProofQuote{
  const run=runFor(quote,runId);
  if(!Array.isArray(trace)||trace.length>24||bytes(trace)>MODEL_REPORT_BYTES-8192)throw new DomainError("The model checkpoint exceeds its bounded trace allowance.",413);
  // Validate the supplied server transcript through the same canonical report
  // parser used at completion. This is not a client observations endpoint.
  modelCheckReportFromTrace(run,trace,new Date().toISOString(),"checkpoint_incomplete");
  if(!extendsTrace(run.trace,trace))conflict("A completed model checkpoint cannot be removed or rewritten.");
  const next=structuredClone(quote);next.proof.delivery!.modelRun!.trace=structuredClone(trace);assertQuoteEvidenceBudget(next);return next;
}

export function finishModelCheckRun(quote:ProofQuote,runId:string,value:ModelCheckReport):ProofQuote{
  const run=runFor(quote,runId),report=validateStoredModelCheckReport(value,{deliveryId:run.deliveryId,deliveryDigest:run.deliveryDigest,journeyPlanDigest:run.journeyPlanDigest,projectId:quote.id});
  if(report.runId!==run.id||report.seed!==run.seed||report.startedAt!==run.startedAt||!sameJourneyRegistration(report.registration,run.registration)||!extendsTrace(run.trace,report.trace))conflict("The final model report does not match its reserved run and saved checkpoints.");
  const delivery=quote.proof.delivery!;if(modelReportsFor(delivery).some(row=>row.id===report.id||row.runId===report.runId))conflict("A model run cannot complete twice or replace an existing report.");
  const next=structuredClone(quote);next.proof.delivery!.modelHistory=[...modelReportsFor(delivery),report];next.proof.delivery!.modelReport=report;delete next.proof.delivery!.modelRun;
  return finishModelEvidenceReservation(next,runId,report);
}

export function closeExpiredModelCheckRun(quote:ProofQuote,role:ProofRole,input:Record<string,unknown>,now=Date.now()):ProofQuote{
  member(role);journeyKeys(input,["action","deliveryId","runId"]);const delivery=current(quote,input.deliveryId),run=runFor(quote,String(input.runId));
  if(input.action!=="close"||!Number.isFinite(now)||Date.parse(run.expiresAt)>now)conflict("Only an expired model run may be closed without further network requests.");
  if(delivery.runtimeRun||delivery.journeyRun)conflict("The exclusive model run state is inconsistent.");
  return finishModelCheckRun(quote,run.id,modelCheckReportFromTrace(run,run.trace,new Date(now).toISOString(),"expired_run_closed_without_network; unknown writes may have committed"));
}

function reportForQuote(quote:ProofQuote,report:ModelCheckReport):ModelCheckReport{
  const delivery=quote.proof.delivery!,plan=savedProjectJourneyPlan(quote);if(!plan)conflict("Model evidence requires its original technical agreement.");
  return validateStoredModelCheckReport(report,{deliveryId:delivery.id,deliveryDigest:report.deliveryDigest,journeyPlanDigest:plan.planDigest,projectId:quote.id});
}
export function validateModelDecision(quote:ProofQuote,value:unknown):ModelDecision|undefined{
  const delivery=quote.proof.delivery,report=delivery?.modelReport;
  if(!report){if(value!==undefined)throw new DomainError("There is no current model report to acknowledge.");return;}
  if(delivery?.modelRun)conflict("Finish the pending model check before accepting its evidence.");
  reportForQuote(quote,report);
  return validateModelReportDecision(report,value);
}
export function validateModelReportDecision(report:ModelCheckReport,value:unknown):ModelDecision{
  const input=journeyObject(value,"Model evidence decision");journeyKeys(input,["reportId","acknowledgeServerCheck","exceptionReason"]);
  if(input.reportId!==report.id||input.acknowledgeServerCheck!==true)conflict("Acknowledge the exact model report and its server-direct observation limits.");
  const reason=input.exceptionReason;if(reason!==undefined&&(typeof reason!=="string"||reason.trim().length<10||reason.trim().length>500)||report.result.outcome!=="compatible"&&typeof reason!=="string")conflict("Explain explicit acceptance of a violated or inconclusive model check using 10–500 characters.");
  return{reportId:report.id,acknowledgeServerCheck:true,...(typeof reason==="string"?{exceptionReason:reason.trim()}:{})};
}

/** An accepted A remains bound to its retained report even after supplement B.
 * A historical snapshot with no model field stays explicitly unchanged. */
export function assertModelAcceptanceReference(quote:ProofQuote,snapshot:ProofAcceptanceEvidence):void{
  if(!snapshot.modelReportId){if(snapshot.modelSpecDigest!==undefined||snapshot.modelDeliveryDigest!==undefined||snapshot.modelDecision!==undefined)conflict("Model acceptance metadata requires its retained report.");return;}
  const delivery=quote.proof.delivery,report=delivery&&modelReportsFor(delivery).find(row=>row.id===snapshot.modelReportId);
  if(!report)conflict("The model report accepted for this payment is unavailable.");reportForQuote(quote,report);
  const decision=snapshot.modelDecision;
  if(snapshot.modelSpecDigest!==report.modelSpecDigest||snapshot.modelDeliveryDigest!==report.deliveryDigest||!decision||decision.reportId!==report.id||decision.acknowledgeServerCheck!==true)conflict("The retained model acceptance differs from its original report.");
  const reason=decision.exceptionReason;if(reason!==undefined&&(typeof reason!=="string"||reason.trim().length<10||reason.trim().length>500)||report.result.outcome!=="compatible"&&typeof reason!=="string")conflict("The retained model exception acknowledgement is missing or invalid.");
  validateModelReportDecision(report,decision);
}
