import {DomainError} from "./domain.ts";
import type {SellerIntegrationRequest} from "./seller-integration.ts";

export const DELEGATION_EVENT_LIMIT=8;
export type DelegationEvent={revision:number;action:"grant"|"revoke";operatorId:string;buyerId:string;at:string};
export type IntegrationDelegation={revision:number;active:boolean;operatorId:string;buyerId:string;events:DelegationEvent[]};
function fail(message="Saved review delegation needs review.",status=409):never{throw new DomainError(message,status);}
function plain(value:unknown,fields:string[],status=409):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length)fail(undefined,status);
 for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=="string"||!fields.includes(key)||!d||!("value"in d))fail(undefined,status);}return value as Record<string,unknown>;
}
function identity(value:unknown){if(typeof value!=="string"||!value||value.length>200||/[\s\u0000-\u001f\u007f]/u.test(value))fail();return value;}
export function validateIntegrationDelegation(value:unknown,submittedAt:string,sellerId:string):IntegrationDelegation{
 const x=plain(value,["revision","active","operatorId","buyerId","events"]);identity(x.operatorId);identity(x.buyerId);
 if(typeof x.active!=="boolean"||!Number.isInteger(x.revision)||!Array.isArray(x.events)||x.events.length!==x.revision||x.events.length<1||x.events.length>DELEGATION_EVENT_LIMIT)fail();
 let previous=Date.parse(submittedAt),active=false;let operatorId="",buyerId="";
 for(let i=0;i<x.events.length;i++){
  const e=plain(x.events[i],["revision","action","operatorId","buyerId","at"]);identity(e.operatorId);identity(e.buyerId);
  if(typeof e.at!=="string"||!Number.isFinite(Date.parse(e.at))||new Date(e.at).toISOString()!==e.at||Date.parse(e.at)<previous||e.revision!==i+1||e.operatorId===e.buyerId||e.operatorId===sellerId||i>0&&e.buyerId!==buyerId)fail();
  if(e.action==="grant"){if(active)fail();active=true;operatorId=e.operatorId as string;buyerId=e.buyerId as string;}
  else if(e.action==="revoke"){if(!active||e.operatorId!==operatorId)fail();active=false;}else fail();previous=Date.parse(e.at);
 }
 if(x.active!==active||x.operatorId!==operatorId||x.buyerId!==buyerId)fail();return structuredClone(x)as IntegrationDelegation;
}
/** Opaque stable choice keys identify configured reviewers without publishing account IDs. */
export async function integrationReviewerChoices(operatorIds:readonly string[],buyerId:string,sellerId:string|null){
 const rows=[];for(const id of operatorIds){if(id===buyerId||id===sellerId)continue;
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`pbp-integration-reviewer-v1:${id}`));
  rows.push({key:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join(""),label:`Platform reviewer ${rows.length+1}`,id});
 }return rows;
}
export async function changeIntegrationDelegation(request:SellerIntegrationRequest,actorId:string,buyerId:string,sellerId:string|null,operatorIds:readonly string[],value:Record<string,unknown>,now=Date.now()):Promise<SellerIntegrationRequest>{
 if(actorId!==buyerId)fail("Only the project buyer can share or withdraw this staging application.",403);
 const x=plain(value,["action","requestId","expectedRevision","expectedDelegationRevision","reviewerKey","confirm"],400);
 if(!["grant-review","revoke-review"].includes(String(x.action))||x.requestId!==request.id||x.expectedRevision!==request.revision||x.expectedDelegationRevision!==(request.delegation?.revision??0))fail("The application or review access changed. Refresh before sharing.");
 if(x.confirm!==true)fail("Explicitly confirm the limited staging-manifest disclosure.",400);
 const existing=request.delegation;if(existing)validateIntegrationDelegation(existing,request.submittedAt,request.submittedBy);
 if(existing&&existing.buyerId!==buyerId)fail();
 if((existing?.events.length??0)>=DELEGATION_EVENT_LIMIT)fail("This application's review-access history is full. Submit a new application.");
 let operatorId:string,active:boolean;
 if(x.action==="grant-review"){
  if(request.status!=="requested"||existing?.active)fail("Share a pending application with one reviewer; withdraw current access before choosing another.");
  const choices=await integrationReviewerChoices(operatorIds,buyerId,sellerId),choice=choices.find(row=>row.key===x.reviewerKey);if(!choice)fail("Choose a configured independent platform reviewer.",400);operatorId=choice.id;active=true;
 }else{if(!existing?.active||x.reviewerKey!==null)fail("No active review access can be withdrawn.");operatorId=existing.operatorId;active=false;}
 const revision=(existing?.revision??0)+1,at=new Date(now).toISOString();
 const delegation:IntegrationDelegation={revision,active,operatorId,buyerId,events:[...(existing?.events??[]),{revision,action:active?"grant":"revoke",operatorId,buyerId,at}]};
 validateIntegrationDelegation(delegation,request.submittedAt,request.submittedBy);return{...structuredClone(request),delegation};
}
export function assertAssignedIntegrationOperator(request:SellerIntegrationRequest,actorId:string,buyerId:string,sellerId:string|null,operatorIds:readonly string[]){
 const d=request.delegation;
 if(!d?.active||d.operatorId!==actorId||d.buyerId!==buyerId||actorId===buyerId||actorId===sellerId||!operatorIds.includes(actorId))fail("Assigned staging application not found.",404);
 validateIntegrationDelegation(d,request.submittedAt,request.submittedBy);
}
export function integrationTargetEnabled(request:SellerIntegrationRequest){return request.status==="approved"&&(!request.delegation||request.delegation.active);}
