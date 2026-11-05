import {env} from "cloudflare:workers";
import type {ProofActor,ProofRecord} from "./proof-store";
import {listProofVersions,readProofVersion} from "./proof-store";
import {exportEvidenceBundle} from "./evidence-bundle-store";
import {createEvidenceExport} from "./evidence-export.ts";
import {archivedRevisionQuote,createRevisionAudit,REVISION_AUDIT_VERSION_LIMIT,type RevisionAuditInput} from "./revision-audit.ts";
import {DomainError} from "./domain.ts";

export function revisionAuditSelection(values:unknown):string[]|undefined{
 if(values===undefined)return;
 if(!Array.isArray(values)||values.length<2||values.length>REVISION_AUDIT_VERSION_LIMIT||values.some(v=>typeof v!=="string"||v.length===0||v.length>100||/[\u0000-\u001f\u007f]/u.test(v))||new Set(values).size!==values.length)throw new DomainError("Select two to five unique saved delivery identifiers.");
 return values as string[];
}
/** Reads the persisted archive rows, never the metadata-only version list as
 * source evidence. No records or project state are written by this operation. */
export async function exportRevisionAudit(record:ProofRecord,actor:ProofActor,selected?:string[]){
 if(!actor.authenticated||!["buyer","seller"].includes(record.role))throw new DomainError("Only authenticated project participants may export revision evidence.",403);
 if(!env.DB)throw new DomainError("Revision evidence storage is unavailable.",503);
 const current=record.quote.proof.delivery;if(!current)throw new DomainError("Save a current delivery and at least one replacement before downloading a revision audit.",409);
 let ids=revisionAuditSelection(selected);
 if(!ids){const versions=await listProofVersions(record),prior=versions.filter(v=>v.delivery.id!==current.id&&(v.delivery.sequence??1)<(current.sequence??1)).sort((a,b)=>(b.delivery.sequence??1)-(a.delivery.sequence??1))[0];if(!prior)throw new DomainError("A revision audit needs a current delivery and a retained previous version. Submit a replacement version first; no previous version was invented.",409);ids=[prior.delivery.id,current.id];}
 if(!ids.includes(current.id))throw new DomainError("Include the exact current delivery in the selected revision audit.",409);
 const versions=await Promise.all(ids.map(id=>readProofVersion(record,id)));versions.sort((a,b)=>(a.delivery.sequence??1)-(b.delivery.sequence??1));
 const entries:RevisionAuditInput[]=[];
 for(const v of versions){if(v.delivery.id===current.id)continue;if(!v.delivery.files||!Object.keys(v.delivery.files).length)throw new DomainError("A selected historical delivery has no retained full source. Download its original record for inspection; no source was reconstructed.",409);try{entries.push({retainedAt:v.archivedAt,isCurrent:false,scope:"archived-core",evidence:await createEvidenceExport(archivedRevisionQuote(record.quote,v))});}catch{throw new DomainError("A historical revision cannot produce a consistent source-and-report export. Its missing or incompatible history was not rebuilt or silently omitted.",409);}}
 const currentVersion=versions.find(v=>v.delivery.id===current.id);if(!currentVersion)throw new DomainError("The exact current version is unavailable.",409);
 entries.push({retainedAt:currentVersion.archivedAt,isCurrent:true,scope:"current-full",evidence:await exportEvidenceBundle(record,actor)});
 let audit;try{audit=await createRevisionAudit({versions:entries});}catch{throw new DomainError("The complete selected revision evidence is inconsistent or exceeds 8 MiB. No revision was dropped. Choose fewer versions or inspect the original retained records.",409);}
 const guard=record.supplementalGuard;
 const unchanged=await env.DB.prepare(`SELECT id FROM quotes WHERE id = ? AND version = ? AND (owner_id = ? OR seller_id = ?)${guard?` AND (${guard.sql})`:""}`).bind(record.quote.id,record.version,actor.id,actor.id,...(guard?.bindings??[])).first<{id:string}>();
 if(!unchanged)throw new DomainError("The project, membership or evidence changed while exporting revisions. Refresh and try again; no mixed-version audit was produced.",409);
 return audit;
}
