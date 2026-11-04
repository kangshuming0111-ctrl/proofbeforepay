import {env} from "cloudflare:workers";
import type {ProofActor,ProofRecord} from "./proof-store";
import {DomainError} from "./domain.ts";
import {loadSupplementalEvidence,loadSupplementalEvidenceObjects} from "./supplemental-evidence-store";
import {listDeliveryArtifactManifests} from "./delivery-artifacts-store";
import {createEvidenceBundle,EvidenceBundleBudgetError} from "./evidence-bundle.ts";
import {loadEvidenceFollowups,followupHeadsGuard} from "./evidence-followup-storage";

/** Server-owned records only. The final bounded read guard prevents a mixed
 * export if membership, quote version, latest manifest, or report heads change
 * while archives are loaded and hashed. No caller-supplied records are used. */
export async function exportEvidenceBundle(record:ProofRecord,actor:ProofActor){
 if(!actor.authenticated||!["buyer","seller"].includes(record.role))throw new DomainError("Only authenticated project participants may export delivery evidence.",403);
 if(!record.quote.proof.delivery)throw new DomainError("Submit a delivery before exporting its evidence.",409);
 if(!env.DB)throw new DomainError("Evidence storage is unavailable.",503);
 const {catalog,guard}=await loadSupplementalEvidence(record);
 const objects=await loadSupplementalEvidenceObjects(record);
 const artifactManifests=await listDeliveryArtifactManifests(record.quote.id);
 const followups=await loadEvidenceFollowups(record);
 const tasksGuard=followupHeadsGuard(record.quote.id,followups);
 let bundle;try{bundle=await createEvidenceBundle(record.quote,{catalog,objects,artifactManifests,followups});}catch(error){
  if(error instanceof EvidenceBundleBudgetError)throw new DomainError("The complete evidence exceeds the bounded JSON or 8 MiB export limit. No report was omitted; inspect the retained records or export the original project record.",409);
  throw new DomainError("The complete evidence changed during export or contains an inconsistent retained reference. Refresh and inspect the retained records before downloading again; no report was silently omitted.",409);
 }
 const current=await env.DB.prepare(`SELECT id FROM quotes WHERE id = ? AND version = ? AND (owner_id = ? OR seller_id = ?) AND (${guard.sql}) AND (${tasksGuard.sql})`).bind(record.quote.id,record.version,actor.id,actor.id,...guard.bindings,...tasksGuard.bindings).first<{id:string}>();
 if(!current)throw new DomainError("The project or its evidence changed during export. Refresh and download again; no mixed evidence bundle was produced.",409);
 return bundle;
}
