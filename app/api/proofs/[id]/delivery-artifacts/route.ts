import {proofActor,readProofCase} from "@/lib/proof-store";
import {body,handle,HttpError,json} from "@/lib/server";
import {deliveryArtifactsView,saveDeliveryArtifacts} from "@/lib/delivery-artifacts-store";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=proofActor(request);if(!actor.authenticated)throw new HttpError(401,"Sign in to inspect build artifact declarations.");const{id}=await context.params;return json(await deliveryArtifactsView(await readProofCase(id,actor)));});}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=proofActor(request,true);if(!actor.authenticated)throw new HttpError(401,"Sign in to save build artifact declarations.");const{id}=await context.params,record=await readProofCase(id,actor),input=await body(request,16384);await saveDeliveryArtifacts(record,actor,input);return json(await deliveryArtifactsView(await readProofCase(id,actor)),201);});}
