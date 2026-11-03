import type {ProofQuote} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {deliveryRuntimeTarget,runtimeDeliveryDigest,savedRuntimePlan} from "./runtime-project.ts";
import {requireCurrentRuntimeRegistration} from "./server-runtime-targets.ts";
import type {RuntimeRegistrationSnapshot} from "./runtime-registration.ts";
import {runRuntimePreflight,type RuntimePreflightFetch} from "./runtime-preflight.ts";

/** Reads only. The route obtains membership and CSRF validation, and neither
 * this helper nor the executor can write an audit event, lease or report. */
export async function preflightRuntimeDelivery(quote:ProofQuote,input:Record<string,unknown>,options:{registrations?:readonly RuntimeRegistrationSnapshot[];fetch?:RuntimePreflightFetch;signal?:AbortSignal;timeoutMs?:number}={}){
  if(Object.keys(input).some(key=>key!=="deliveryId"))throw new DomainError("Connection checks accept only the saved delivery identity, not URLs or metadata.");
  const delivery=quote.proof.delivery,plan=savedRuntimePlan(quote);
  if(!delivery||!plan||input.deliveryId!==delivery.id)throw new DomainError("Connection checks need the current saved upload and agreed protocol.",409);
  if(quote.status!=="approved"||quote.proof.paymentOperation||["captured","voided","closed_unpaid"].includes(quote.proof.paymentState))throw new DomainError("This workflow is not open for a new connection check.",409);
  const digest=await runtimeDeliveryDigest(delivery.files);
  if(delivery.runtimeDeliveryDigest!==digest)throw new DomainError("The saved upload digest changed. Reload before checking its connection.",409);
  const registration=requireCurrentRuntimeRegistration(quote,digest,options.registrations),target=deliveryRuntimeTarget(delivery);
  if((target.protocol??"booking-http-v1")!==plan.protocol)throw new DomainError("The target does not support the agreed protocol.",409);
  return runRuntimePreflight({deliveryId:delivery.id,target,protocol:plan.protocol,...(registration?{registration}:{})},options);
}
