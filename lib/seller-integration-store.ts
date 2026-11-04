import {env} from "cloudflare:workers";
import type {ProofActor,ProofRecord} from "./proof-store";
import {DomainError} from "./domain.ts";
import {changeIntegrationDelegation,integrationReviewerChoices,integrationTargetEnabled} from "./integration-delegation.ts";
import {canReviewIntegration,INTEGRATION_REQUEST_LIMIT,integrationDelivery,newIntegrationRequest,parseOperatorIds,reviewIntegrationRequest,validateIntegrationRequest,type SellerIntegrationRequest} from "./seller-integration.ts";

function database(){if(!env.DB)throw new DomainError("Integration request storage is unavailable.",503);return env.DB;}
type Stored={id:string;quote_id:string;delivery_id:string;delivery_digest:string;submitted_by:string;payload:string;version:number;created_at:string;updated_at:string};
export function integrationOperatorIds(){return parseOperatorIds((env as unknown as Record<string,unknown>).PBP_OPERATOR_IDS);}
async function decode(row:Stored){let value:unknown;try{value=JSON.parse(row.payload);}catch{throw new DomainError("Saved integration application needs operator review.",503);}const item=await validateIntegrationRequest(value);if(item.id!==row.id||item.projectId!==row.quote_id||item.deliveryId!==row.delivery_id||item.deliveryDigest!==row.delivery_digest||item.submittedBy!==row.submitted_by||item.revision!==row.version||item.submittedAt!==row.created_at||item.updatedAt!==row.updated_at)throw new DomainError("Integration application metadata differs from its saved history.",503);return item;}
export async function listIntegrationRequests(projectId:string){const result=await database().prepare("SELECT * FROM seller_integration_requests WHERE quote_id = ? ORDER BY created_at DESC, id DESC LIMIT ?").bind(projectId,INTEGRATION_REQUEST_LIMIT+1).all<Stored>();if(result.results.length>INTEGRATION_REQUEST_LIMIT)throw new DomainError("Integration request history exceeds its retained bound.",503);return Promise.all(result.results.map(decode));}
export async function approvedIntegrationRegistrations(projectId:string){const requests=await listIntegrationRequests(projectId);return requests.filter(integrationTargetEnabled).map(item=>item.registration!);}
export async function integrationRequestsView(record:ProofRecord,actor:ProofActor,now=Date.now()){
 const delivery=record.quote.proof.delivery,binding=delivery?.variant==="upload"&&delivery.files?await integrationDelivery(record.quote,delivery.id):undefined,requests=await listIntegrationRequests(record.quote.id),ids=integrationOperatorIds();
 const choices=record.role==="buyer"?await integrationReviewerChoices(ids,record.buyerId,record.sellerId):[];
 return{canDelegate:actor.authenticated&&record.role==="buyer"&&actor.id===record.buyerId,reviewers:choices.map(({key,label})=>({key,label})),requests:requests.map(item=>({...item,stale:!binding||item.deliveryId!==binding.deliveryId||item.deliveryDigest!==binding.deliveryDigest,expired:!!item.registration&&Date.parse(item.registration.expiresAt)<=now})),currentDeliveryId:binding?.deliveryId??null,currentDeliveryDigest:binding?.deliveryDigest??null,canSubmit:actor.authenticated&&record.role==="seller"&&!!binding&&requests.length<INTEGRATION_REQUEST_LIMIT&&!requests.some(item=>item.status==="requested"&&item.delegation?.active!==false&&item.deliveryId===binding.deliveryId&&item.deliveryDigest===binding.deliveryDigest),canReview:actor.authenticated&&canReviewIntegration(actor.id,record.buyerId,record.role,ids),requestLimit:INTEGRATION_REQUEST_LIMIT,limits:{networkRequests:0,approvalIsDeclaration:true,deploymentAttestation:false}};
}
function quoteStillCurrentSQL(){return"EXISTS (SELECT 1 FROM quotes q WHERE q.id = ? AND q.version = ? AND (q.owner_id = ? OR q.seller_id = ?))";}
export async function submitIntegrationRequest(record:ProofRecord,actor:ProofActor,input:Record<string,unknown>){
 const current=await listIntegrationRequests(record.quote.id),previous=input.previousRequestId===undefined?undefined:current.find(item=>item.id===input.previousRequestId),item=await newIntegrationRequest(record.quote,record.role,actor.id,input,previous);
 const result=await database().prepare(`INSERT INTO seller_integration_requests (id,quote_id,delivery_id,delivery_digest,submitted_by,payload,version,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${quoteStillCurrentSQL()} AND (SELECT count(*) FROM seller_integration_requests WHERE quote_id = ?) < ? AND NOT EXISTS (SELECT 1 FROM seller_integration_requests WHERE quote_id = ? AND delivery_id = ? AND delivery_digest = ? AND json_extract(payload, '$.status') = 'requested' AND COALESCE(json_extract(payload, '$.delegation.active'), 1) != 0)`).bind(item.id,item.projectId,item.deliveryId,item.deliveryDigest,item.submittedBy,JSON.stringify(item),item.revision,item.submittedAt,item.updatedAt,record.quote.id,record.version,actor.id,actor.id,record.quote.id,INTEGRATION_REQUEST_LIMIT,record.quote.id,item.deliveryId,item.deliveryDigest).run();
 if(result.meta.changes!==1)throw new DomainError("The project or request list changed, an application is already pending, or the request limit was reached. Refresh before submitting.",409);return item;
}
export async function decideIntegrationRequest(record:ProofRecord,actor:ProofActor,input:Record<string,unknown>){
 // Check authority before revealing whether a request identifier exists.
 const operators=integrationOperatorIds();if(!canReviewIntegration(actor.id,record.buyerId,record.role,operators))throw new DomainError("Only a configured operator who owns this project can review staging requests.",403);
 const current=(await listIntegrationRequests(record.quote.id)).find(item=>item.id===input.requestId);if(!current)throw new DomainError("Integration request not found.",404);
 const next=await reviewIntegrationRequest(record.quote,current,actor.id,record.buyerId,record.role,operators,input);
 const result=await database().prepare(`UPDATE seller_integration_requests SET payload = ?, version = ?, updated_at = ? WHERE id = ? AND quote_id = ? AND version = ? AND payload = ? AND ${quoteStillCurrentSQL()}`).bind(JSON.stringify(next),next.revision,next.updatedAt,next.id,next.projectId,current.revision,JSON.stringify(current),record.quote.id,record.version,actor.id,actor.id).run();
 if(result.meta.changes!==1)throw new DomainError("The project or integration decision changed. Refresh before reviewing.",409);return next;
}

/** A buyer shares one exact application; the reviewer is not a project member. */
export async function delegateIntegrationRequest(record:ProofRecord,actor:ProofActor,input:Record<string,unknown>){
 if(!actor.authenticated||record.role!=="buyer"||actor.id!==record.buyerId)throw new DomainError("Only this project's buyer can share staging review metadata.",403);
 const requests=await listIntegrationRequests(record.quote.id),current=requests.find(item=>item.id===input.requestId);if(!current)throw new DomainError("Integration request not found.",404);
 if(input.action==="grant-review"){const binding=await integrationDelivery(record.quote,current.deliveryId);if(binding.deliveryDigest!==current.deliveryDigest)throw new DomainError("Share only the exact current upload's staging application.",409);}
 const next=await changeIntegrationDelegation(current,actor.id,record.buyerId,record.sellerId,integrationOperatorIds(),input);
 const activePeerGuard=input.action==="grant-review"?" AND NOT EXISTS (SELECT 1 FROM seller_integration_requests peer WHERE peer.quote_id = ? AND peer.delivery_id = ? AND peer.delivery_digest = ? AND peer.id != ? AND json_extract(peer.payload, '$.status') = 'requested' AND COALESCE(json_extract(peer.payload, '$.delegation.active'), 1) != 0)":"";
 const result=await database().prepare(`UPDATE seller_integration_requests SET payload = ? WHERE id = ? AND quote_id = ? AND version = ? AND payload = ? AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = ? AND q.owner_id = ? AND q.version = ?)${activePeerGuard}`)
 .bind(JSON.stringify(next),next.id,next.projectId,current.revision,JSON.stringify(current),record.quote.id,actor.id,record.version,...(input.action==="grant-review"?[current.projectId,current.deliveryId,current.deliveryDigest,current.id]:[])).run();
 if(result.meta.changes!==1)throw new DomainError("The project, application or review access changed. Refresh before sharing.",409);return next;
}
