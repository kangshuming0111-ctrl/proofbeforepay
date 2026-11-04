import {DomainError} from "./domain.ts";
import type {ProofActor,ProofRecord} from "./proof-store";
import {appendFollowupEvent,createEvidenceFollowup,followupObservation,FOLLOWUP_LIMIT,type FollowupEvent} from "./evidence-followup.ts";
import {supplementalRefKey} from "./supplemental-evidence.ts";
import {loadSupplementalEvidence} from "./supplemental-evidence-store";
import {followupDatabase,loadEvidenceFollowups} from "./evidence-followup-storage";
export {loadEvidenceFollowups} from "./evidence-followup-storage";
function text(v:unknown){return typeof v==="string"?v:"";}
/** The report, finding and outcome are always selected from the server catalog.
 * No client-authored outcome, URL or report body is trusted. */
export async function mutateEvidenceFollowup(record:ProofRecord,actor:ProofActor,input:Record<string,unknown>){
 const q=record.quote,d=q.proof.delivery;if(!actor.authenticated||!["buyer","seller"].includes(record.role))throw new DomainError("Only authenticated project members may edit repair tasks.",403);
 if(!d||q.proof.acceptedDeliveryId||q.proof.collaboration?.stage==="accepted"||q.proof.paymentOperation||["captured","voided","closed_unpaid"].includes(q.proof.paymentState))throw new DomainError("Repair tasks for this project are view-only after acceptance or closure.",409);
 const {catalog,guard}=await loadSupplementalEvidence(record),tasks=await loadEvidenceFollowups(record);
 if(input.catalogDigest!==catalog.catalogDigest)throw new DomainError("Reports or repair tasks changed. Refresh before continuing.",409);
 const observation=()=>{const row=catalog.rows.find(r=>supplementalRefKey(r.ref)===input.reportKey);if(!row||["planned","running"].includes(row.status))throw new DomainError("Select an exact, completed current-delivery report.",409);return followupObservation(row,text(input.findingKey),catalog.context);};
 const at=new Date().toISOString();let next;
 const membership="EXISTS (SELECT 1 FROM quotes WHERE id = ? AND version = ? AND (owner_id = ? OR seller_id = ?))",guardSQL=`${membership} AND (${guard.sql})`,bindings=[q.id,record.version,actor.id,actor.id,...guard.bindings];
 if(input.action==="request"){
  if(record.role!=="buyer")throw new DomainError("Only the buyer can request a repair.",403);
  const source=observation(),criterionId=text(input.criterionId);if(!q.proof.criteria.some(c=>c.id===criterionId)&&criterionId!==`supplemental:${source.ref.family}`)throw new DomainError("Choose an agreed criterion or the explicitly supplemental technical scope.",409);
  if(tasks.length>=FOLLOWUP_LIMIT)throw new DomainError("Repair task history is full. Existing tasks were retained.",409);
  next=createEvidenceFollowup({id:crypto.randomUUID(),projectId:q.id,criterionId,source,note:text(input.note),at});
  const result=await followupDatabase().prepare(`INSERT INTO evidence_followups (id,quote_id,source_delivery_id,version,payload,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guardSQL} AND (SELECT count(*) FROM evidence_followups WHERE quote_id = ?) < ?`).bind(next.id,q.id,next.source.ref.deliveryId,next.version,JSON.stringify(next),next.createdAt,next.updatedAt,...bindings,q.id,FOLLOWUP_LIMIT).run();
  if(result.meta.changes!==1)throw new DomainError("The project or repair tasks changed. Refresh before requesting repair.",409);
 }else{
  const old=tasks.find(t=>t.id===input.id);if(!old||old.version!==input.version)throw new DomainError("The repair task changed. Refresh before continuing.",409);
  if(input.action!=="propose"&&input.action!=="resolve"&&input.action!=="reopen")throw new DomainError("Unsupported repair action.",400);
  if(input.action==="propose"?record.role!=="seller":record.role!=="buyer")throw new DomainError("This repair action belongs to the other participant.",403);
  if(input.action==="resolve"&&old.proposal){const row=catalog.rows.find(r=>supplementalRefKey(r.ref)===supplementalRefKey(old.proposal!.ref));if(!row||row.planKey!==old.proposal.planKey||!row.findings.some(f=>f.key===old.proposal!.finding.key&&f.outcome===old.proposal!.finding.outcome))throw new DomainError("The proposed retest is no longer the current delivery's exact evidence. Ask the seller to propose the current report.",409);}
  const event:Omit<FollowupEvent,"version">={at,actorRole:record.role,action:input.action,note:text(input.note),...(input.action==="propose"?{observation:observation()}:{}),...(input.action==="resolve"?{resolution:input.resolution as "verified"|"exception"}:{})};
  next=appendFollowupEvent(old,event);
  const result=await followupDatabase().prepare(`UPDATE evidence_followups SET version = ?,payload = ?,updated_at = ? WHERE id = ? AND quote_id = ? AND version = ? AND payload = ? AND ${guardSQL}`).bind(next.version,JSON.stringify(next),next.updatedAt,old.id,q.id,old.version,JSON.stringify(old),...bindings).run();
  if(result.meta.changes!==1)throw new DomainError("The project, report or repair history changed. Refresh before continuing.",409);
 }
 return next;
}
