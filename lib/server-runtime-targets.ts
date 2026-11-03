import {env} from "cloudflare:workers";
import type {ProofQuote} from "./contracts.ts";
import type {RuntimeCheckTarget} from "./runtime-checks.ts";
import {DomainError} from "./domain.ts";
import {RUNTIME_TARGETS,deliveryRuntimeTarget,runtimeTarget,savedRuntimePlan} from "./runtime-project.ts";
import {approvedRuntimeRegistration,parseRuntimeRegistrations,registrationTarget,safeRuntimeTargetDescriptor,sameRuntimeRegistration,
  type RuntimeRegistrationDescriptor,type RuntimeRegistrationSnapshot} from "./runtime-registration.ts";

export type RuntimeTargetDescriptor = RuntimeRegistrationDescriptor | {
  id:string;label:string;protocol:"booking-http-v1"|"booking-http-v2"|"booking-http-v3"|"booking-http-v4";revision:string;kind:"fixture";
};

/** Server-only configuration: no registry JSON, endpoint URL, backend artifact
 * metadata or future auth material is imported into the client bundle. */
export function operatorRuntimeRegistrations():RuntimeRegistrationSnapshot[]{
  const raw=(env as unknown as Record<string,unknown>).PBP_RUNTIME_TARGETS;
  if(raw!==undefined&&typeof raw!=="string")throw new DomainError("Test backend registry configuration needs operator review.",503);
  try{return parseRuntimeRegistrations(raw as string|undefined);}
  catch{throw new DomainError("Test backend registry configuration needs operator review.",503);}
}

/** The optional entries seam lets isolated route tests supply only synthetic
 * approved declarations. Production callers omit it and use server config. */
export function availableRuntimeTargets(quote:ProofQuote,entries?:readonly RuntimeRegistrationSnapshot[],now=Date.now()):RuntimeTargetDescriptor[]{
  const plan=savedRuntimePlan(quote);if(!plan)return[];
  const registered=entries??operatorRuntimeRegistrations();
  const fixtures:RuntimeTargetDescriptor[]=RUNTIME_TARGETS.filter(target=>(target.protocol??"booking-http-v1")===plan.protocol)
    .map(target=>({id:target.id,label:target.label,protocol:target.protocol??"booking-http-v1",revision:target.revision,kind:"fixture"}));
  const approved=registered.filter(item=>item.projectId===quote.id&&item.protocol===plan.protocol&&Date.parse(item.expiresAt)>now)
    .map(item=>safeRuntimeTargetDescriptor(approvedRuntimeRegistration(registered,quote.id,item.id,plan.protocol,undefined,now)));
  return[...fixtures,...approved];
}

/** Upload is the only time a target association can enter a new delivery. Its
 * frontend digest is computed from saved files by the route, not the client. */
export function resolveUploadRuntimeTarget(quote:ProofQuote,targetId:unknown,digest:string,entries?:readonly RuntimeRegistrationSnapshot[],now=Date.now()):{target:RuntimeCheckTarget;registration?:RuntimeRegistrationSnapshot}{
  const plan=savedRuntimePlan(quote);if(!plan)throw new DomainError("A backend target needs a buyer-confirmed protocol.");
  if(RUNTIME_TARGETS.some(item=>item.id===targetId)){
    const target=runtimeTarget(targetId);
    if((target.protocol??"booking-http-v1")!==plan.protocol)throw new DomainError("Choose a test backend matching the agreed protocol.");
    return{target};
  }
  let registration:RuntimeRegistrationSnapshot;
  try{registration=approvedRuntimeRegistration(entries??operatorRuntimeRegistrations(),quote.id,targetId,plan.protocol,digest,now);}
  catch(error){
    // Preserve the upload API's existing unknown-target400 without disclosing
    // whether the same ID is approved for a different project.
    if(error instanceof DomainError&&error.status===404)throw new DomainError("Choose an approved test backend for this project.");
    throw error;
  }
  return{target:registrationTarget(registration),registration};
}

/** Only NEW outbound work consults current approval. Revocation, expiry or any
 * fingerprint change refuses the run before its lease or HTTP writes. Saved
 * reports may still be read and explicitly accepted against their old pin. */
export function requireCurrentRuntimeRegistration(quote:ProofQuote,digest:string,entries?:readonly RuntimeRegistrationSnapshot[],now=Date.now()):RuntimeRegistrationSnapshot|undefined{
  const delivery=quote.proof.delivery,plan=savedRuntimePlan(quote);
  if(!delivery||!plan)throw new DomainError("A backend run needs the current upload and confirmed protocol.",409);
  deliveryRuntimeTarget(delivery);
  const pinned=delivery.runtimeRegistration;
  if(!pinned)return;
  let current:RuntimeRegistrationSnapshot;
  try{current=approvedRuntimeRegistration(entries??operatorRuntimeRegistrations(),quote.id,pinned.id,plan.protocol,digest,now);}
  catch(error){if(error instanceof DomainError&&error.status===503)throw error;throw new DomainError("This backend registration is no longer approved for a new run. Ask the operator to review it or submit a newly approved delivery.",409);}
  if(!sameRuntimeRegistration(pinned,current))throw new DomainError("The backend registration changed after this upload. Submit a new delivery with the approved registration before testing.",409);
  return current;
}

/** A lost worker result must not strand the delivery after operator approval
 * expires or is revoked. Only an already-expired, exactly bound persisted run
 * may be closed with zero-network unavailable observations. This is evidence
 * recovery, not permission to resume HTTP, cancellation or an external rollback.
 * The route still obtains its CAS lease through beginRuntimeRun before running.
 */
export function authorizeRuntimeExecution(quote:ProofQuote,digest:string,entries?:readonly RuntimeRegistrationSnapshot[],now=Date.now()):{resuming:boolean;noNetworkReason?:"registration_no_longer_approved"}{
  const delivery=quote.proof.delivery,run=delivery?.runtimeRun;
  const leaseExpiry=run?Date.parse(run.expiresAt):NaN;
  if(run&&(!Number.isFinite(leaseExpiry)||leaseExpiry>now))throw new DomainError("A backend run is already pending. Refresh after it finishes.",409);
  const resuming=!!run&&Number.isFinite(leaseExpiry)&&leaseExpiry<=now;
  try{requireCurrentRuntimeRegistration(quote,digest,entries,now);return{resuming};}
  catch(error){
    if(!resuming||!delivery?.runtimeRegistration||!(error instanceof DomainError)||![409,503].includes(error.status))throw error;
    const plan=savedRuntimePlan(quote),target=deliveryRuntimeTarget(delivery);
    if(!run||!plan||delivery.runtimeRegistration.projectId!==quote.id||run.deliveryId!==delivery.id||run.targetId!==delivery.backendTargetId||run.deliveryDigest!==digest||delivery.runtimeDeliveryDigest!==digest||(target.protocol??"booking-http-v1")!==plan.protocol)throw new DomainError("The expired backend run no longer matches its frozen delivery binding.",409);
    return{resuming:true,noNetworkReason:"registration_no_longer_approved"};
  }
}
