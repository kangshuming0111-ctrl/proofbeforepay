import type {ProofDelivery} from "./contracts";
import {DomainError} from "./domain";
import {modelArchiveRefs,modelReportsFor,validateModelArchive} from "./model-report-archive";

/** Called only after the enclosing project/version membership check. */
export async function hydrateModelDelivery(db:D1Database,projectId:string,delivery:ProofDelivery):Promise<ProofDelivery>{
 const copy=structuredClone(delivery),refs=modelArchiveRefs(copy);
 if(copy.modelArchive!==undefined)throw new DomainError("Persisted delivery records cannot contain hydrated model archive payloads.",409);
 if(refs.length){
   copy.modelArchive=[];
   for(const ref of refs){
     const row=await db.prepare("SELECT id,quote_id,delivery_id,report_id,run_id,payload,payload_sha256,payload_bytes FROM model_report_objects WHERE id = ? AND quote_id = ? AND delivery_id = ? AND report_id = ?").bind(`${projectId}:${delivery.id}:${ref.reportId}`,projectId,delivery.id,ref.reportId).first<Record<string,unknown>>();
     if(!row||row.id!==`${projectId}:${delivery.id}:${ref.reportId}`||row.quote_id!==projectId||row.delivery_id!==delivery.id||row.report_id!==ref.reportId||row.run_id!==ref.runId||row.payload_sha256!==ref.payloadSha256||row.payload_bytes!==ref.payloadBytes||typeof row.payload!=="string")throw new DomainError("A retained model archive object is missing or belongs to another project, delivery or report.",409);
     copy.modelArchive.push({ref:structuredClone(ref),payload:row.payload});
   }
 }
 await validateModelArchive(copy,projectId);return copy;
}

/** Execute after the quote CAS in the SAME D1 batch. The exact new payload
 * guard prevents stale/failed CAS from manufacturing detached archive rows.
 * An inconsistent same-ID object forces a SQL constraint error, rolling back
 * the quote update as well; JavaScript's post-commit checks are insufficient. */
export async function newModelArchiveStatements(db:D1Database,projectId:string,delivery:ProofDelivery|undefined,previous:ProofDelivery|undefined,guard:{ownerId:string;version:number;payload:string},at:string):Promise<D1PreparedStatement[]>{
 if(!delivery)return[];await validateModelArchive(delivery,projectId);
 const previousRefs=previous?modelArchiveRefs(previous):[],statements:D1PreparedStatement[]=[];
 if(previous?.id===delivery.id){
  const refs=modelArchiveRefs(delivery),reports=modelReportsFor(delivery);
  for(const ref of previousRefs)if(!refs.some(row=>JSON.stringify(row)===JSON.stringify(ref)))throw new DomainError("An existing model archive reference cannot be removed or rewritten.",409);
  for(const report of modelReportsFor(previous))if(!reports.some(row=>row.id===report.id&&JSON.stringify(row)===JSON.stringify(report)))throw new DomainError("Existing model report evidence cannot be removed or rewritten.",409);
 }
 for(const object of delivery.modelArchive??[]){
  const ref=object.ref,prior=previousRefs.find(row=>row.reportId===ref.reportId&&row.deliveryId===ref.deliveryId);
  if(prior){if(JSON.stringify(prior)!==JSON.stringify(ref))throw new DomainError("An immutable model archive reference cannot be rewritten.",409);continue;}
  statements.push(db.prepare(`INSERT INTO model_report_objects (id,quote_id,delivery_id,report_id,run_id,payload,payload_sha256,payload_bytes,created_at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM quotes WHERE id = ? AND owner_id = ? AND version = ? AND payload = ?)
   ON CONFLICT(id) DO UPDATE SET payload = CASE WHEN model_report_objects.quote_id = excluded.quote_id AND model_report_objects.delivery_id = excluded.delivery_id AND model_report_objects.report_id = excluded.report_id AND model_report_objects.run_id = excluded.run_id AND model_report_objects.payload_sha256 = excluded.payload_sha256 AND model_report_objects.payload_bytes = excluded.payload_bytes AND model_report_objects.payload = excluded.payload THEN model_report_objects.payload ELSE NULL END`)
   .bind(`${projectId}:${delivery.id}:${ref.reportId}`,projectId,delivery.id,ref.reportId,ref.runId,object.payload,ref.payloadSha256,ref.payloadBytes,at,projectId,guard.ownerId,guard.version,guard.payload));
 }
 return statements;
}
