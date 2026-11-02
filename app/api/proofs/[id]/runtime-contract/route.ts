import {proofActor,readProofCase} from "@/lib/proof-store";
import {buildRuntimeContract} from "@/lib/runtime-contract";
import {handle} from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  return handle(async()=>{
    const {id}=await context.params,record=await readProofCase(id,proofActor(request));
    return new Response(JSON.stringify(buildRuntimeContract(record.quote),null,2)+"\n",{headers:{
      "Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=ProofBeforePay-runtime-contract.json",
      "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
    }});
  });
}
