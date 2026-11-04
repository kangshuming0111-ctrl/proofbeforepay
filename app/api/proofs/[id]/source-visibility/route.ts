import {proofActor,readProofCase} from "@/lib/proof-store";
import {body,handle,HttpError,json} from "@/lib/server";
import {saveSourceVisibility,sourceVisibilityView} from "@/lib/source-visibility-store";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=proofActor(request);if(!actor.authenticated)throw new HttpError(401,"Sign in to inspect citation observations.");const{id}=await context.params;return json(await sourceVisibilityView(await readProofCase(id,actor)));});}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=proofActor(request,true);if(!actor.authenticated)throw new HttpError(401,"Sign in to save citation observations.");const{id}=await context.params,record=await readProofCase(id,actor),report=await saveSourceVisibility(record,actor,await body(request,20000));return json({...await sourceVisibilityView(await readProofCase(id,actor)),report},201);});}
