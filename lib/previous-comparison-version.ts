import type {ProofDelivery,ProofDeliveryVersion,ProofRole} from "./contracts.ts";
import {isOlderDelivery} from "./delivery-comparison.ts";
import {DomainError} from "./domain.ts";

export type PreviousComparisonContext={projectId:string;currentDelivery:ProofDelivery;previousSummary:ProofDeliveryVersion;role:ProofRole};
export type ReadComparisonVersion=(path:string,signal:AbortSignal)=>Promise<unknown>;
export function comparisonVersionKey(context:PreviousComparisonContext):string{
  const old=context.previousSummary;
  return JSON.stringify([context.projectId,context.currentDelivery.id,context.role,old.delivery.id,old.delivery.sequence??null,old.delivery.submittedAt,old.archivedAt]);
}
function plain(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function requireValue(condition:unknown,message:string):asserts condition{if(!condition)throw new DomainError(message);}
function active(signal:AbortSignal,isCurrent:()=>boolean):void{if(signal.aborted||!isCurrent())throw new DOMException("The comparison context changed.","AbortError");}
export function comparisonVersionSummaries(value:unknown):ProofDeliveryVersion[]{
  requireValue(plain(value)&&Array.isArray(value.versions)&&value.versions.length<=51,"The version summary response is invalid.");
  for(const row of value.versions)requireValue(plain(row)&&plain(row.delivery)&&typeof row.delivery.id==="string"&&typeof row.delivery.submittedAt==="string"&&typeof row.archivedAt==="string"&&Array.isArray(row.feedback),"A version summary is invalid.");
  return value.versions as ProofDeliveryVersion[];
}

/** Resolve one summary through the existing member-scoped archive endpoint.
 * The caller supplies its authenticated/role-aware reader. No list is expanded,
 * no other project endpoint is tried, and a viewer modal is not a data source. */
export async function loadPreviousComparisonVersion(context:PreviousComparisonContext,read:ReadComparisonVersion,signal:AbortSignal,isCurrent:()=>boolean=()=>true):Promise<ProofDeliveryVersion>{
  const snapshot=structuredClone(context),summary=snapshot.previousSummary;
  active(signal,isCurrent);
  requireValue(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(snapshot.projectId)&&["buyer","seller"].includes(snapshot.role),"A scoped project and role are required for comparison.");
  requireValue(isOlderDelivery(summary,snapshot.currentDelivery),"The selected summary is not an older delivery.");
  const path=`/api/proofs/${encodeURIComponent(snapshot.projectId)}/versions/${encodeURIComponent(summary.delivery.id)}`;
  const response=await read(path,signal);
  active(signal,isCurrent);
  requireValue(plain(response)&&plain(response.version)&&plain(response.version.delivery),"The archived version response is invalid.");
  const version=response.version as unknown as ProofDeliveryVersion,delivery=version.delivery;
  requireValue(delivery.id===summary.delivery.id&&delivery.sequence===summary.delivery.sequence&&delivery.submittedAt===summary.delivery.submittedAt&&version.archivedAt===summary.archivedAt&&isOlderDelivery(version,snapshot.currentDelivery),"The returned archive does not match the requested older delivery.");
  requireValue(Array.isArray(version.feedback)&&version.feedback.length<=200&&Array.isArray(delivery.evidence),"The archived version metadata is invalid.");
  requireValue(plain(delivery.files)&&Object.keys(delivery.files).length>0&&Object.keys(delivery.files).length<=40&&Object.values(delivery.files).every(value=>typeof value==="string"),"The archive response did not contain its saved delivery files.");
  for(const registration of [delivery.runtimeRegistration,delivery.runtimeReport?.target.registration]){
    requireValue(!registration||registration.projectId===snapshot.projectId,"The archived backend registration belongs to another project.");
  }
  // Membership is enforced by the requested project route. The immutable summary
  // ID/order and any available registration project pin are independently bound.
  active(signal,isCurrent);return structuredClone(version);
}
