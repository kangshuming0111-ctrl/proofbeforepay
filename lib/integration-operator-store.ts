import {env} from "cloudflare:workers";
import {DomainError} from "./domain.ts";
import type {ProofActor} from "./proof-store";
import type {ProofQuote} from "./contracts.ts";
import {requireProof} from "./proof-domain.ts";
import {integrationDelivery,reviewAssignedIntegrationRequest,validateIntegrationRequest,type SellerIntegrationRequest} from "./seller-integration.ts";
import {assertAssignedIntegrationOperator} from "./integration-delegation.ts";
import {integrationOperatorIds} from "./seller-integration-store";

type Stored={id:string;quote_id:string;delivery_id:string;delivery_digest:string;submitted_by:string;payload:string;version:number;created_at:string;updated_at:string;buyer_id:string;seller_id:string|null;quote_version:number;quote_payload:string};
const SELECT="SELECT r.*, q.owner_id AS buyer_id, q.seller_id AS seller_id, q.version AS quote_version, q.payload AS quote_payload FROM seller_integration_requests r JOIN quotes q ON q.id = r.quote_id";
function db(){if(!env.DB)throw new DomainError("Staging review storage is unavailable.",503);return env.DB;}
function operator(actor:ProofActor){if(!actor.authenticated)throw new DomainError("Sign in to open assigned staging reviews.",401);if(!integrationOperatorIds().includes(actor.id))throw new DomainError("This account is not a configured staging reviewer.",403);}
async function decode(row:Stored,actor:ProofActor){
 const item=await validateIntegrationRequest(JSON.parse(row.payload));
 assertAssignedIntegrationOperator(item,actor.id,row.buyer_id,row.seller_id,integrationOperatorIds());
 if(item.id!==row.id||item.projectId!==row.quote_id||item.deliveryId!==row.delivery_id||item.deliveryDigest!==row.delivery_digest||item.submittedBy!==row.submitted_by||item.revision!==row.version||item.submittedAt!==row.created_at||item.updatedAt!==row.updated_at)throw new DomainError("Saved staging application metadata is inconsistent.",503);
 const quote=JSON.parse(row.quote_payload)as ProofQuote;requireProof(quote);if(quote.id!==item.projectId)throw new DomainError("Staging project binding is inconsistent.",503);
 let stale=true;const delivery=quote.proof.delivery;if(delivery?.variant==="upload"&&delivery.files){const binding=await integrationDelivery(quote,delivery.id);stale=binding.deliveryId!==item.deliveryId||binding.deliveryDigest!==item.deliveryDigest;}
 return{item,quote,stale};
}
/** Explicit narrow projection: no contracts, sources, client identity, price or payment fields. */
function view(item:SellerIntegrationRequest,stale:boolean){return{id:item.id,projectId:item.projectId,deliveryId:item.deliveryId,deliveryDigest:item.deliveryDigest,manifestDigest:item.manifestDigest,manifest:item.manifest,status:item.status,revision:item.revision,submittedAt:item.submittedAt,updatedAt:item.updatedAt,stale,expired:!!item.registration&&Date.parse(item.registration.expiresAt)<=Date.now(),registration:item.registration,delegationRevision:item.delegation!.revision,history:item.history.map(({revision,status,at,reason})=>({revision,status,at,...(reason?{reason}:{})}))};}
export type IntegrationOperatorItem=ReturnType<typeof view>;
export async function listAssignedIntegrations(actor:ProofActor,cursor?:string){
 operator(actor);let beforeId:string|undefined;
 if(cursor!==undefined){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(cursor))throw new DomainError("Invalid staging-review cursor.",400);beforeId=cursor;}
 // Assignment, current configuration and separation of seller/buyer are checked
 // before retrieving a row. Decode repeats the checks against the full record.
 const filter="json_extract(r.payload, '$.delegation.active') = 1 AND json_extract(r.payload, '$.delegation.operatorId') = ? AND json_extract(r.payload, '$.delegation.buyerId') = q.owner_id AND q.owner_id != ? AND (q.seller_id IS NULL OR q.seller_id != ?)";
 const result=await db().prepare(`${SELECT} WHERE ${filter}${beforeId?" AND r.id < ?":""} ORDER BY r.id DESC LIMIT 21`).bind(actor.id,actor.id,actor.id,...(beforeId?[beforeId]:[])).all<Stored>();
 const rows=result.results.slice(0,20),items=[];for(const row of rows){const decoded=await decode(row,actor);items.push(view(decoded.item,decoded.stale));}
 return{items,nextCursor:result.results.length>20?rows.at(-1)!.id:null,limits:{networkRequests:0,projectMembership:false,sourceAccess:false,acceptance:false,payment:false}};
}
export async function decideAssignedIntegration(actor:ProofActor,requestId:string,input:Record<string,unknown>){
 operator(actor);const row=await db().prepare(`${SELECT} WHERE r.id = ? AND json_extract(r.payload, '$.delegation.active') = 1 AND json_extract(r.payload, '$.delegation.operatorId') = ? AND json_extract(r.payload, '$.delegation.buyerId') = q.owner_id AND q.owner_id != ? AND (q.seller_id IS NULL OR q.seller_id != ?)`).bind(requestId,actor.id,actor.id,actor.id).first<Stored>();
 if(!row)throw new DomainError("Assigned staging application not found.",404);
 const {item,quote,stale}=await decode(row,actor),next=await reviewAssignedIntegrationRequest(quote,item,actor.id,row.buyer_id,row.seller_id,integrationOperatorIds(),input);
 const result=await db().prepare("UPDATE seller_integration_requests SET payload = ?, version = ?, updated_at = ? WHERE id = ? AND version = ? AND payload = ? AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = ? AND q.owner_id = ? AND q.version = ? AND q.seller_id IS ?)").bind(JSON.stringify(next),next.revision,next.updatedAt,next.id,item.revision,row.payload,quote.id,row.buyer_id,row.quote_version,row.seller_id).run();
 if(result.meta.changes!==1)throw new DomainError("The project, application or review access changed. Refresh before deciding.",409);
 return view(next,stale);
}
