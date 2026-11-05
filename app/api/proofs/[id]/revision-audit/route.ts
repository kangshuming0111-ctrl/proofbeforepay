import {proofActor,readProofCase} from "@/lib/proof-store";
import {exportRevisionAudit,revisionAuditSelection} from "@/lib/revision-audit-store";
import {handle,HttpError,json} from "@/lib/server";
import {env} from "cloudflare:workers";
import {issueRevisionAudit} from "@/lib/issued-revision-audit";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
 const actor=proofActor(request);if(!actor.authenticated)throw new HttpError(401,"Sign in to download selected revision evidence.");
 const url=new URL(request.url);if([...url.searchParams.keys()].some(key=>key!=="deliveryId"))throw new HttpError(400,"Use only explicit deliveryId selections.");
 const values=url.searchParams.getAll("deliveryId"),selection=values.length?revisionAuditSelection(values):undefined;
 const {id}=await context.params,record=await readProofCase(id,actor);
 const key=(env as unknown as Record<string,unknown>).PBP_EVIDENCE_SIGNING_PKCS8;
 if(typeof key!=="string"||!key.trim())throw new HttpError(503,"Official revision issuance is not configured. No unsigned revision download was substituted.");
 return json(await issueRevisionAudit(await exportRevisionAudit(record,actor,selection),key));
});}
