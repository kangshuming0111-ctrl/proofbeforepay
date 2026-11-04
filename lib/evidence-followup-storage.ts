import {env} from "cloudflare:workers";
import {followupHeadsGuard} from "./evidence-followup-sql.ts";
export {followupHeadsGuard} from "./evidence-followup-sql.ts";
import {DomainError} from "./domain.ts";
import {FOLLOWUP_LIMIT,evidenceFollowupHead,validateEvidenceFollowup,type EvidenceFollowup} from "./evidence-followup.ts";
export function followupDatabase(){if(!env.DB)throw new DomainError("Repair task storage is unavailable.",503);return env.DB;}
type Row={id:string;quote_id:string;source_delivery_id:string;version:number;payload:string;created_at:string;updated_at:string};
export async function loadProjectEvidenceFollowups(projectId:string){const rows=await followupDatabase().prepare("SELECT * FROM evidence_followups WHERE quote_id = ? ORDER BY created_at,id LIMIT ?").bind(projectId,FOLLOWUP_LIMIT+1).all<Row>();if(rows.results.length>FOLLOWUP_LIMIT)throw new DomainError("Repair task history exceeds its retained bound.",503);return rows.results.map(r=>{let raw:unknown;try{raw=JSON.parse(r.payload);}catch{throw new DomainError("Repair task history is unreadable.",503);}const t=validateEvidenceFollowup(raw);if(t.id!==r.id||t.projectId!==r.quote_id||t.source.ref.deliveryId!==r.source_delivery_id||t.version!==r.version||t.createdAt!==r.created_at||t.updatedAt!==r.updated_at)throw new DomainError("Repair task metadata differs from its event history.",503);return t;});}
export async function loadEvidenceFollowups(record:{quote:{id:string}}){return loadProjectEvidenceFollowups(record.quote.id);}
export async function followupCatalogContext(projectId:string){const tasks=await loadProjectEvidenceFollowups(projectId);return{tasks,heads:await Promise.all(tasks.map(evidenceFollowupHead)),guard:followupHeadsGuard(projectId,tasks)};}
