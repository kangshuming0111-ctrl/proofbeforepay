import {DomainError} from "./domain.ts";
import {supplementalCanonical,supplementalSha,validateSupplementalCatalogContext,type SupplementalCatalogContext,type SupplementalEvidenceRef,type SupplementalEvidenceRow} from "./supplemental-evidence.ts";

export const FOLLOWUP_LIMIT=12,FOLLOWUP_EVENT_LIMIT=20;
export type FollowupObservation={context?:Pick<SupplementalCatalogContext,"artifactManifest">;ref:SupplementalEvidenceRef;planKey:string;finding:{key:string;outcome:"supported"|"mismatch"|"unknown";label:string}};
export type FollowupEvent={version:number;at:string;actorRole:"buyer"|"seller";action:"request"|"propose"|"resolve"|"reopen";note:string;observation?:FollowupObservation;resolution?:"verified"|"exception"};
export type EvidenceFollowup={format:"pbp-evidence-followup-v1";id:string;projectId:string;criterionId:string;source:FollowupObservation;status:"open"|"proposed"|"resolved";version:number;createdAt:string;updatedAt:string;proposal?:FollowupObservation;resolution?:"verified"|"exception";events:FollowupEvent[]};
export type FollowupHead={id:string;version:number;payloadSha256:string;status:EvidenceFollowup["status"]};
const fail=(s:string):never=>{throw new DomainError(s,409);};
function object(v:unknown,keys:string[]){if(!v||typeof v!=="object"||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail("Follow-up data must be plain objects.");const r=v as Record<string,unknown>;if(Reflect.ownKeys(r).some(k=>typeof k!=="string"||!keys.includes(k)||!("value"in Object.getOwnPropertyDescriptor(r,k)!)))fail("Unexpected follow-up fields.");return r;}
function text(v:unknown,min=1,max=200){if(typeof v!=="string"||v.trim().length<min||v.length>max||/[\u0000-\u001f\u007f]/u.test(v))fail("Follow-up text is missing or too long.");return v as string;}
function timestamp(v:unknown){const s=text(v,1,30);if(!Number.isFinite(Date.parse(s))||new Date(s).toISOString()!==s)fail("Invalid follow-up time.");return s;}
function observation(v:unknown):FollowupObservation{const r=object(v,["ref","planKey","finding","context"]),ref=object(r.ref,["family","id","version","payloadSha256","deliveryId","deliveryDigest"]),f=object(r.finding,["key","outcome","label"]);if(!["source-visibility","deployment-source","time-policy"].includes(ref.family as string)||!Number.isSafeInteger(ref.version)||(ref.version as number)<1||!([ref.payloadSha256,ref.deliveryDigest,r.planKey].every(x=>typeof x==="string"&&/^[a-f0-9]{64}$/u.test(x)))||!["supported","mismatch","unknown"].includes(f.outcome as string))fail("Invalid exact report observation.");text(ref.id);text(ref.deliveryId);text(f.key);text(f.label);if(r.context!==undefined)validateSupplementalCatalogContext(object(r.context,["artifactManifest"]));return structuredClone(r)as unknown as FollowupObservation;}
export function followupObservation(row:SupplementalEvidenceRow,key:string,context?:SupplementalCatalogContext):FollowupObservation{const finding=row.findings.find(f=>f.key===key);if(!finding)fail("Choose a finding that exists in this exact report.");return{ref:structuredClone(row.ref),planKey:row.planKey,finding:structuredClone(finding!),...(context?{context:structuredClone({artifactManifest:context.artifactManifest})}:{})};}
export function followupSamePlan(task:EvidenceFollowup){return !!task.proposal&&task.source.ref.family===task.proposal.ref.family&&task.source.planKey===task.proposal.planKey&&task.source.finding.key===task.proposal.finding.key;}
function applyEvent(task:EvidenceFollowup,event:FollowupEvent):EvidenceFollowup{
 if(event.version!==task.version+1||event.at<task.updatedAt||task.events.length>=FOLLOWUP_EVENT_LIMIT)fail("Follow-up event order or retained limit is invalid.");
 const next={...task,version:event.version,updatedAt:event.at,events:[...task.events,event]};
 if(event.action==="propose"){
  if(event.actorRole!=="seller"||task.status==="resolved"||!event.observation||event.resolution||event.observation.ref.family!==task.source.ref.family||event.observation.ref.deliveryId===task.source.ref.deliveryId)fail("A seller must propose a new delivery's exact report; resolved tasks must be reopened first.");
  next.proposal=observation(event.observation);next.status="proposed";delete next.resolution;
 }else if(event.action==="resolve"){
  if(event.actorRole!=="buyer"||task.status!=="proposed"||!task.proposal||event.observation||!["verified","exception"].includes(event.resolution??""))fail("Only the buyer can confirm a proposed retest.");
  if(event.resolution==="verified"&&(!followupSamePlan(task)||task.proposal!.finding.outcome!=="supported"))fail("Changed scope, missing checks and exceptional outcomes cannot be marked verified.");
  next.status="resolved";next.resolution=event.resolution;
 }else if(event.action==="reopen"){
  if(event.actorRole!=="buyer"||task.status==="open"||event.observation||event.resolution)fail("Only the buyer can reopen a proposed or resolved task.");next.status="open";delete next.proposal;delete next.resolution;
 }else fail("A request cannot be appended to an existing follow-up.");
 return next;
}
export function createEvidenceFollowup(input:{id:string;projectId:string;criterionId:string;source:FollowupObservation;note:string;at:string}):EvidenceFollowup{
 const source=observation(input.source),at=timestamp(input.at),note=text(input.note,10,1000);text(input.id);text(input.projectId);text(input.criterionId);
 if(source.finding.outcome==="supported")fail("Create repair tasks for a mismatch or unknown finding.");
 return{format:"pbp-evidence-followup-v1",id:input.id,projectId:input.projectId,criterionId:input.criterionId,source,status:"open",version:1,createdAt:at,updatedAt:at,events:[{version:1,at,actorRole:"buyer",action:"request",note,observation:source}]};
}
export function appendFollowupEvent(task:EvidenceFollowup,input:Omit<FollowupEvent,"version">){const t=validateEvidenceFollowup(task),event={...structuredClone(input),version:t.version+1};text(event.note,10,1000);timestamp(event.at);return applyEvent(t,event);}
export function replayFollowupVersion(value:unknown,version:number):EvidenceFollowup{
 const r=object(value,["format","id","projectId","criterionId","source","status","version","createdAt","updatedAt","proposal","resolution","events"]);
 if(r.format!=="pbp-evidence-followup-v1"||!Array.isArray(r.events)||r.events.length<1||r.events.length>FOLLOWUP_EVENT_LIMIT||!Number.isSafeInteger(version)||version<1||version>r.events.length)fail("Invalid follow-up format or event version.");
 const events=(r.events as unknown[]).map(raw=>{const e=object(raw,["version","at","actorRole","action","note","observation","resolution"]);timestamp(e.at);text(e.note,10,1000);if(e.observation)observation(e.observation);return e as unknown as FollowupEvent;}),first=events[0];
 if(first.version!==1||first.action!=="request"||first.actorRole!=="buyer"||first.resolution||!first.observation||r.createdAt!==first.at||supplementalCanonical(r.source)!==supplementalCanonical(first.observation))fail("The original request was changed.");
 let result=createEvidenceFollowup({id:text(r.id),projectId:text(r.projectId),criterionId:text(r.criterionId),source:observation(r.source),note:first.note,at:first.at});
 for(const event of events.slice(1,version))result=applyEvent(result,event);
 return result;
}
export function validateEvidenceFollowup(value:unknown):EvidenceFollowup{const r=value as EvidenceFollowup,result=replayFollowupVersion(value,r?.version);if(supplementalCanonical(result)!==supplementalCanonical(value))fail("Follow-up state differs from its append-only event history.");return result;}
export async function evidenceFollowupHead(task:EvidenceFollowup):Promise<FollowupHead>{const t=validateEvidenceFollowup(task);return{id:t.id,version:t.version,payloadSha256:await supplementalSha(t),status:t.status};}
