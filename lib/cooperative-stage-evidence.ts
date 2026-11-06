import type {ProofQuote,ProofRole,ProofCriterion} from './contracts.ts';
import {DomainError} from './domain.ts';
import {runtimeDeliveryDigest} from './runtime-project.ts';
import {validateDeliveryStagePlan,validateDeliveryStageReport,type DeliveryStagePlan,type DeliveryStageReport} from './delivery-stage-evidence.ts';

export const COOPERATIVE_STAGE_LIMIT=3;
export const COOPERATIVE_STAGE_BYTES=96*1024;
export type CooperativeStageReport={id:string;receivedAt:string;reportedByRole:ProofRole;deliveryDigest:string;report:DeliveryStageReport};
export type CooperativeStageContext={projectId:string;deliveryId:string;deliveryDigest:string;criteria:ProofCriterion[]};
const sha=/^[a-f0-9]{64}$/u;
function demand(ok:unknown,message:string,status=400):asserts ok{if(!ok)throw new DomainError(message,status);}
function exact(value:unknown,keys:string[]):Record<string,unknown>{
 demand(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'Expected plain cooperative evidence.');
 const row=value as Record<string,unknown>;
 demand(Reflect.ownKeys(row).length===keys.length&&keys.every(k=>Object.hasOwn(row,k)),'Unsupported cooperative evidence fields.');
 for(const k of keys){const d=Object.getOwnPropertyDescriptor(row,k)!;demand('value'in d&&d.enumerable,'Cooperative evidence must contain data only.');}
 return row;
}
/** Exact UTF-8 aggregate, including wrappers/array punctuation. No eviction. */
export function assertCooperativeStageBounds(value:unknown):number{
 if(value===undefined)return 0;
 demand(Array.isArray(value)&&value.length<=COOPERATIVE_STAGE_LIMIT,'At most three cooperative reports may be retained for one delivery.',409);
 let nodes=0,chars=0;const ancestors=new Set<object>();
 function visit(v:unknown,depth:number):void{
  demand(++nodes<=12000&&depth<=16,'Cooperative evidence exceeds its structural limit.');
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='number'){demand(Number.isFinite(v),'Finite JSON values required.');return;}
  if(typeof v==='string'){chars+=v.length;demand(chars<=COOPERATIVE_STAGE_BYTES,'Cooperative evidence exceeds 96 KiB.',409);return;}
  demand(v&&typeof v==='object'&&!ancestors.has(v)&&(Array.isArray(v)||[Object.prototype,null].includes(Object.getPrototypeOf(v))),'Cooperative evidence must be acyclic JSON data.');
  if(Array.isArray(v))demand(Object.keys(v).length===v.length&&v.length<=100,'Dense bounded arrays required.');
  ancestors.add(v);
  for(const k of Reflect.ownKeys(v)){
   if(Array.isArray(v)&&k==='length')continue;
   const d=Object.getOwnPropertyDescriptor(v,k)!;
   demand(typeof k==='string'&&!['__proto__','constructor','prototype'].includes(k)&&d.enumerable&&'value'in d,'Cooperative evidence must contain data properties.');
   visit(d.value,depth+1);
  }
  ancestors.delete(v);
 }
 visit(value,0);
 const bytes=new TextEncoder().encode(JSON.stringify(value)).byteLength;
 demand(bytes<=COOPERATIVE_STAGE_BYTES,'Cooperative evidence exceeds 96 KiB; existing reports were retained.',409);
 return bytes;
}
export function assertCooperativeStageScope(report:DeliveryStageReport,context:CooperativeStageContext):void{
 const scope=report.plan.scope,criterion=context.criteria.find(c=>c.id===scope.criterionId);
 demand(scope.projectId===context.projectId&&scope.deliveryId===context.deliveryId&&criterion&&scope.requirement===criterion.source,'This report does not match the current project, delivery and original criterion.',409);
}
export async function validateCooperativeStageReports(value:unknown,context:CooperativeStageContext):Promise<CooperativeStageReport[]>{
 assertCooperativeStageBounds(value);
 const rows=(value??[]) as unknown[],ids=new Set<string>(),digests=new Set<string>();
 const result:CooperativeStageReport[]=[];
 for(const entry of rows){
  const row=exact(entry,['id','receivedAt','reportedByRole','deliveryDigest','report']);
  demand(typeof row.id==='string'&&/^[a-f0-9-]{36}$/u.test(row.id)&&!ids.has(row.id),'Invalid or duplicate cooperative report identity.');
  demand(typeof row.receivedAt==='string'&&Number.isFinite(Date.parse(row.receivedAt))&&new Date(row.receivedAt).toISOString()===row.receivedAt,'Invalid server receipt time.');
  demand(row.reportedByRole==='buyer'||row.reportedByRole==='seller','Invalid reporting role.');
  demand(row.deliveryDigest===context.deliveryDigest&&sha.test(String(row.deliveryDigest)),'Cooperative report file binding differs.',409);
  const report=await validateDeliveryStageReport(row.report);assertCooperativeStageScope(report,context);
  demand(!digests.has(report.digest),'Duplicate cooperative report content.');ids.add(row.id);digests.add(report.digest);
  result.push({...row,report} as CooperativeStageReport);
 }
 return structuredClone(result);
}
export async function cooperativeStageContext(quote:ProofQuote):Promise<CooperativeStageContext>{
 const delivery=quote.proof.delivery;
 demand(delivery?.files,'A saved delivery with files is required.',409);
 return{projectId:quote.id,deliveryId:delivery.id,deliveryDigest:await runtimeDeliveryDigest(delivery.files),criteria:quote.proof.criteria};
}
export async function createCooperativeStagePlan(quote:ProofQuote,input:{criterionId:string;runId:string;sourceRevision:string;payloadDigest:string;emailCoverage:'adapter'|'manual'|'unsupported'}):Promise<DeliveryStagePlan>{
 const context=await cooperativeStageContext(quote),criterion=context.criteria.find(c=>c.id===input.criterionId);
 demand(criterion,'Choose an existing criterion.');
 return validateDeliveryStagePlan({schema:'pbp-delivery-stage-plan-v1',runId:input.runId,syntheticOnly:true,scope:{projectId:quote.id,deliveryId:context.deliveryId,criterionId:criterion.id,sourceRevision:input.sourceRevision,requirement:criterion.source},payloadDigest:input.payloadDigest,stages:[{stage:'submit',coverage:'adapter'},{stage:'stored_record',coverage:'adapter'},{stage:'fresh_readback',coverage:'adapter'},{stage:'email_receipt',coverage:input.emailCoverage}]});
}
export async function appendCooperativeStageReport(quote:ProofQuote,role:ProofRole,input:unknown,at=new Date().toISOString()):Promise<ProofQuote>{
 demand(role==='buyer'||role==='seller','Only project participants may save a cooperative report.',403);
 const data=exact(input,['deliveryId','deliveryDigest','report']),delivery=quote.proof.delivery,context=await cooperativeStageContext(quote);
 demand(data.deliveryId===context.deliveryId&&data.deliveryDigest===context.deliveryDigest,'This delivery changed. Refresh before saving this report.',409);
 let report:DeliveryStageReport;try{report=await validateDeliveryStageReport(data.report);}catch{throw new DomainError('The cooperative stage report is invalid.');}assertCooperativeStageScope(report,context);
 const existing=await validateCooperativeStageReports(delivery?.cooperativeStageReports,context);
 if(existing.some(row=>row.report.digest===report.digest))return quote;
 demand(!quote.proof.paymentOperation&&!delivery?.runtimeRun&&!delivery?.journeyRun&&!delivery?.modelRun&&!delivery?.transferCompetitionRun&&!delivery?.enquiryRun,'Finish the current operation, then explicitly save the report again.',409);
 const row:CooperativeStageReport={id:crypto.randomUUID(),receivedAt:at,reportedByRole:role,deliveryDigest:context.deliveryDigest,report};
 const rows=await validateCooperativeStageReports([...existing,row],context),next=structuredClone(quote);
 next.proof.delivery!.cooperativeStageReports=rows;
 return next;
}
