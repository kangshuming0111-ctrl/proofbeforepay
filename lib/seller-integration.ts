import type {ProofQuote,ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {checkJourneyIntegrationManifest,type JourneyIntegrationManifest} from "./journey-integration-preflight.ts";
import {validateJourneyRegistration,type JourneyRegistrationSnapshot} from "./project-journey.ts";
import type {JourneyScenario} from "./journey-checks.ts";
import {runtimeDeliveryDigest} from "./runtime-project.ts";

export const INTEGRATION_REQUEST_LIMIT=8;
export const INTEGRATION_HISTORY_LIMIT=8;
export type IntegrationStatus="requested"|"needs_changes"|"rejected"|"approved";
export type IntegrationEvent={revision:number;status:IntegrationStatus;at:string;actorId:string;actorRole:"seller"|"operator";reason?:string};
export type SellerIntegrationRequest={id:string;projectId:string;deliveryId:string;deliveryDigest:string;manifest:JourneyIntegrationManifest;manifestDigest:string;status:IntegrationStatus;revision:number;submittedAt:string;updatedAt:string;submittedBy:string;previousRequestId?:string;history:IntegrationEvent[];registration?:JourneyRegistrationSnapshot};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const STATUSES:IntegrationStatus[]=["requested","needs_changes","rejected","approved"];
function object(value:unknown,keys:string[],required=keys):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new DomainError("Integration input requires ordinary JSON.");
 for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=="string"||!keys.includes(key)||!d||!("value"in d))throw new DomainError("Integration input contains unsupported fields.");}
 if(required.some(k=>!Object.hasOwn(value,k)))throw new DomainError("Integration input is incomplete.");return value as Record<string,unknown>;
}
function text(value:unknown,label:string,min=1,max=200):string{if(typeof value!=="string"||value!==value.trim()||value.length<min||value.length>max||/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(value))throw new DomainError(`${label} is invalid.`);return value;}
function stamp(value:unknown){if(typeof value!=="string"||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw new DomainError("Integration timestamp is invalid.");return value;}
function canonical(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`;return JSON.stringify(value);}
export async function integrationManifest(value:unknown){
 const preflight=checkJourneyIntegrationManifest(value);if(!preflight.canRequestRegistration)throw new DomainError("Fix the manifest checks before submitting a registration request.");
 const manifest=structuredClone(value)as JourneyIntegrationManifest;
 if(!manifest.native.deploymentRevision)throw new DomainError("Declare the native deployment revision before submitting.");
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical(manifest)));
 return{manifest,manifestDigest:Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("")};
}
export function parseOperatorIds(value:unknown):string[]{
 if(value===undefined||value==="")return[];
 if(typeof value!=="string"||value.length>4096)throw new DomainError("Integration operator configuration needs review.",503);
 const ids=value.split(",").map(x=>x.trim());if(!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!id||id.length>200||/[\s\u0000-\u001f\u007f]/u.test(id)))throw new DomainError("Integration operator configuration needs review.",503);return ids;
}
export function canReviewIntegration(actorId:string,buyerId:string,role:ProofRole,operatorIds:readonly string[]){return role==="buyer"&&actorId===buyerId&&operatorIds.includes(actorId);}
export async function integrationDelivery(quote:ProofQuote,deliveryId:unknown){const delivery=quote.proof.delivery;if(quote.workflow!=="proof-v1"||!delivery||delivery.variant!=="upload"||!delivery.files||delivery.id!==deliveryId)throw new DomainError("Choose the exact current uploaded delivery before requesting integration.",409);return{deliveryId:delivery.id,deliveryDigest:await runtimeDeliveryDigest(delivery.files)};}
export async function newIntegrationRequest(quote:ProofQuote,role:ProofRole,actorId:string,value:unknown,previous?:SellerIntegrationRequest,now=Date.now()):Promise<SellerIntegrationRequest>{
 if(role!=="seller")throw new DomainError("Only this project's seller can submit a staging integration.",403);
 const input=object(value,["action","deliveryId","manifest","previousRequestId"],["action","deliveryId","manifest"]);if(input.action!=="submit")throw new DomainError("Choose submit for a new integration request.");
 const binding=await integrationDelivery(quote,input.deliveryId),parsed=await integrationManifest(input.manifest),at=new Date(now).toISOString();text(actorId,"Seller identity");
 if(input.previousRequestId!==undefined&&(!previous||previous.id!==input.previousRequestId||previous.projectId!==quote.id||!["needs_changes","rejected"].includes(previous.status)))throw new DomainError("Resubmit only against a retained request that needs changes or was rejected.",409);
 const id=crypto.randomUUID();return{id,projectId:quote.id,...binding,...parsed,status:"requested",revision:1,submittedAt:at,updatedAt:at,submittedBy:actorId,...(previous?{previousRequestId:previous.id}:{}),history:[{revision:1,status:"requested",at,actorId,actorRole:"seller"}]};
}
function approvedRegistration(request:SellerIntegrationRequest,approval:Record<string,unknown>,now:number):JourneyRegistrationSnapshot{
 object(approval,["label","scenario","expiresAt"]);const expiresAt=stamp(approval.expiresAt);if(Date.parse(expiresAt)<=now||Date.parse(expiresAt)>now+30*24*60*60*1000)throw new DomainError("Approve a future staging window of at most thirty days.");
 return validateJourneyRegistration({id:`onboard-${request.id}`,label:text(approval.label,"Target label",1,100),projectId:request.projectId,registrationRevision:`approval-${request.revision+1}`,protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:request.manifest.deployment.frontendEntryUrl,backendBaseUrl:request.manifest.deployment.backendBaseUrl,deploymentRevision:request.manifest.native.deploymentRevision,bridgeRevision:request.manifest.bridge.revision,frontendBundleDigest:request.deliveryDigest,scenario:approval.scenario as JourneyScenario,expiresAt,testOnly:true,provenance:"operator-approved-declaration"});
}
export async function reviewIntegrationRequest(quote:ProofQuote,request:SellerIntegrationRequest,actorId:string,buyerId:string,role:ProofRole,operatorIds:readonly string[],value:unknown,now=Date.now()):Promise<SellerIntegrationRequest>{
 if(!canReviewIntegration(actorId,buyerId,role,operatorIds))throw new DomainError("Only a configured operator who owns this project can review staging requests.",403);
 const input=object(value,["action","requestId","expectedRevision","status","reason","approval"],["action","requestId","expectedRevision","status","reason"]);
 if(input.action!=="review"||input.requestId!==request.id||input.expectedRevision!==request.revision)throw new DomainError("The integration request changed. Refresh before reviewing.",409);
 if(!["needs_changes","rejected","approved"].includes(String(input.status))||request.status!=="requested"&&!(request.status==="approved"&&input.status==="rejected"))throw new DomainError("This integration decision is final; submit a new corrected manifest when requested.",409);
 const reason=text(input.reason,"Review reason",10,500);if(input.status!=="approved"&&input.approval!==undefined)throw new DomainError("Only an approval may include registration fields.");
 if(request.projectId!==quote.id)throw new DomainError("The integration request belongs to another project.",409);
 if(input.status==="approved"){const binding=await integrationDelivery(quote,request.deliveryId);if(binding.deliveryDigest!==request.deliveryDigest)throw new DomainError("This request refers to a replaced upload. The seller must submit its current version.",409);}
 if(request.history.length>=INTEGRATION_HISTORY_LIMIT)throw new DomainError("Integration decision history is full.",409);
 const registration=input.status==="approved"?approvedRegistration(request,object(input.approval,["label","scenario","expiresAt"]),now):undefined;
 const at=new Date(now).toISOString(),revision=request.revision+1,next={...structuredClone(request),status:input.status as IntegrationStatus,revision,updatedAt:at,history:[...request.history,{revision,status:input.status as IntegrationStatus,at,actorId,actorRole:"operator"as const,reason}]};
 // Revocation retains the original approved declaration as historical evidence.
 return{...next,...(registration?{registration}:{})};
}
export async function validateIntegrationRequest(value:unknown):Promise<SellerIntegrationRequest>{
 const x=object(value,["id","projectId","deliveryId","deliveryDigest","manifest","manifestDigest","status","revision","submittedAt","updatedAt","submittedBy","previousRequestId","history","registration"],["id","projectId","deliveryId","deliveryDigest","manifest","manifestDigest","status","revision","submittedAt","updatedAt","submittedBy","history"]);
 if(typeof x.id!=="string"||!UUID.test(x.id)||typeof x.deliveryDigest!=="string"||!HASH.test(x.deliveryDigest)||!STATUSES.includes(x.status as IntegrationStatus)||!Number.isInteger(x.revision)||Number(x.revision)<1||Number(x.revision)>INTEGRATION_HISTORY_LIMIT)throw new DomainError("Saved integration identity is invalid.",409);
 text(x.projectId,"Project ID");text(x.deliveryId,"Delivery ID");text(x.submittedBy,"Seller identity");stamp(x.submittedAt);stamp(x.updatedAt);if(x.previousRequestId!==undefined&&(typeof x.previousRequestId!=="string"||!UUID.test(x.previousRequestId)))throw new DomainError("Saved integration predecessor is invalid.",409);
 const parsed=await integrationManifest(x.manifest);if(parsed.manifestDigest!==x.manifestDigest)throw new DomainError("Saved integration manifest digest changed.",409);
 if(!Array.isArray(x.history)||x.history.length!==x.revision)throw new DomainError("Saved integration decision history is invalid.",409);
 let previousTime=0;for(let i=0;i<x.history.length;i++){const e=object(x.history[i],["revision","status","at","actorId","actorRole","reason"],["revision","status","at","actorId","actorRole"]),time=Date.parse(stamp(e.at));text(e.actorId,"Decision identity");if(e.revision!==i+1||time<previousTime||i===0&&(e.status!=="requested"||e.actorRole!=="seller"||e.actorId!==x.submittedBy||e.at!==x.submittedAt||e.reason!==undefined)||i>0&&(e.actorRole!=="operator"||!["needs_changes","rejected","approved"].includes(String(e.status)))||i>1&&((x.history[i-1]as IntegrationEvent).status!=="approved"||e.status!=="rejected"))throw new DomainError("Saved integration decision sequence changed.",409);if(i>0)text(e.reason,"Decision reason",10,500);previousTime=time;}
 const last=x.history.at(-1)as IntegrationEvent;if(last.status!==x.status||last.at!==x.updatedAt)throw new DomainError("Saved integration current state differs from its history.",409);
 if(x.registration!==undefined){const registration=validateJourneyRegistration(x.registration),approved=x.history.find(e=>(e as IntegrationEvent).status==="approved")as IntegrationEvent|undefined;if(registration.id!==`onboard-${x.id}`||registration.projectId!==x.projectId||registration.frontendBundleDigest!==x.deliveryDigest||registration.frontendEntryUrl!==parsed.manifest.deployment.frontendEntryUrl||registration.backendBaseUrl!==parsed.manifest.deployment.backendBaseUrl||registration.deploymentRevision!==parsed.manifest.native.deploymentRevision||registration.bridgeRevision!==parsed.manifest.bridge.revision||!approved||registration.registrationRevision!==`approval-${approved.revision}`||Date.parse(registration.expiresAt)<=Date.parse(approved.at)||Date.parse(registration.expiresAt)>Date.parse(approved.at)+30*24*60*60*1000)throw new DomainError("Saved approved target differs from the reviewed manifest.",409);}else if(x.status==="approved"||x.history.some(e=>(e as IntegrationEvent).status==="approved"))throw new DomainError("Approved integration has no retained registration.",409);
 return structuredClone(x)as SellerIntegrationRequest;
}
