import {proofActor,readProofCase} from "@/lib/proof-store";
import {proofReadiness} from "@/lib/proof-readiness";
import {handle,json} from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const{id}=await context.params,record=await readProofCase(id,proofActor(request));return json(proofReadiness(record.quote,record.role));});}
