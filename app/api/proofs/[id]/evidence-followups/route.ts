import {proofActor,proofResponse,readProofCase} from "@/lib/proof-store";
import {body,handle,HttpError,json} from "@/lib/server";
import {loadEvidenceFollowups,mutateEvidenceFollowup} from "@/lib/evidence-followup-store";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=proofActor(request);if(!actor.authenticated)throw new HttpError(401,"Sign in to inspect repair tasks.");const{id}=await context.params,record=await readProofCase(id,actor);return json({tasks:await loadEvidenceFollowups(record),...proofResponse(record)});});}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=proofActor(request,true);if(!actor.authenticated)throw new HttpError(401,"Sign in to edit repair tasks.");const{id}=await context.params,record=await readProofCase(id,actor);await mutateEvidenceFollowup(record,actor,await body(request,8000));const fresh=await readProofCase(id,actor);return json({tasks:await loadEvidenceFollowups(fresh),...proofResponse(fresh)});});}
