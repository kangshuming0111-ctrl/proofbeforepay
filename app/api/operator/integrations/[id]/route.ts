import {proofActor} from "@/lib/proof-store";
import {body,handle,HttpError,json} from "@/lib/server";
import {decideAssignedIntegration} from "@/lib/integration-operator-store";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=proofActor(request,true),{id}=await context.params,input=await body(request,4096);if(input.requestId!==id)throw new HttpError(400,"Review the exact assigned application.");return json(await decideAssignedIntegration(actor,id,input));});}
