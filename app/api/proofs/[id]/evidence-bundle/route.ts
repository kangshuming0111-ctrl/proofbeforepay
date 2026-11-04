import {proofActor,readProofCase} from "@/lib/proof-store";
import {exportEvidenceBundle} from "@/lib/evidence-bundle-store";
import {handle,HttpError,json} from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
 const actor=proofActor(request);if(!actor.authenticated)throw new HttpError(401,"Sign in to download delivery evidence.");
 const {id}=await context.params,record=await readProofCase(id,actor);
 return json(await exportEvidenceBundle(record,actor));
});}
