import {proofActor,readProofCase} from "@/lib/proof-store";
import {preflightRuntimeDelivery} from "@/lib/server-runtime-preflight";
import {body,handle,json} from "@/lib/server";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  return handle(async()=>{
    const actor=proofActor(request,true),{id}=await context.params,input=await body(request,4096);
    const record=await readProofCase(id,actor);
    return json(await preflightRuntimeDelivery(record.quote,input,{signal:request.signal}));
  });
}
