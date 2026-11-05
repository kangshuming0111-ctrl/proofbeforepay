import type {ProofRole} from "./contracts.ts";
import type {EnquiryDelivery,ProjectEnquiryPlan,ProjectEnquiryReport,ProjectEnquiryRun} from "./project-enquiry.ts";

/** Stable saved evidence identity, independent of transient object references. */
export function enquiryPanelEvidenceIdentity(value:{enquiryPlan?:ProjectEnquiryPlan|null;enquiryRun?:ProjectEnquiryRun|null;enquiryReport?:ProjectEnquiryReport|null}){
 const run=value.enquiryRun,report=value.enquiryReport;
 const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])])):v;
 return JSON.stringify(canonical([value.enquiryPlan??null,run?{id:run.id,deliveryId:run.deliveryId,deliveryDigest:run.deliveryDigest,expiresAt:run.expiresAt,observations:run.observations,inFlight:run.inFlight??null}:null,report?{id:report.id,deliveryId:report.deliveryId,deliveryDigest:report.deliveryDigest,finishedAt:report.finishedAt}:null]));
}
export function enquiryPanelContext(projectId:string,delivery:EnquiryDelivery,role:ProofRole,viewRevision=0){return JSON.stringify([projectId,delivery.id,role,viewRevision,enquiryPanelEvidenceIdentity(delivery)]);}
export type EnquiryPanelTicket={context:string;epoch:number;sequence:number;kind:"read"|"write";operationToken:string};
/** Shared by effects and mutations. No network or React state lives here. */
export function createEnquiryPanelGuard(instance=crypto.randomUUID()){
 let mounted=false,context="",epoch=0,sequence=0,latestRead=0,write:EnquiryPanelTicket|undefined;
 const valid=(ticket:EnquiryPanelTicket)=>mounted&&ticket.context===context&&ticket.epoch===epoch;
 const close=()=>{const active=write;write=undefined;mounted=false;epoch++;latestRead=++sequence;return active?.operationToken;};
 return{
  activate(key:string){const old=close();mounted=true;context=key;return old;},
  deactivate:close,
  beginRead():EnquiryPanelTicket|undefined{if(!mounted||write)return;latestRead=++sequence;return{context,epoch,sequence:latestRead,kind:"read",operationToken:`${instance}:${epoch}:${latestRead}`};},
  currentRead(ticket:EnquiryPanelTicket){return ticket.kind==="read"&&valid(ticket)&&ticket.sequence===latestRead;},
  beginWrite():EnquiryPanelTicket|undefined{if(!mounted||write)return;latestRead=++sequence;write={context,epoch,sequence:++sequence,kind:"write",operationToken:`${instance}:${epoch}:${sequence}`};return write;},
  currentWrite(ticket:EnquiryPanelTicket){return ticket.kind==="write"&&valid(ticket)&&write?.operationToken===ticket.operationToken;},
  finishWrite(ticket:EnquiryPanelTicket){if(!write||write.operationToken!==ticket.operationToken||!valid(ticket))return false;write=undefined;return true;},
 };
}
