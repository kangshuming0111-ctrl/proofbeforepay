import {beginRuntimeRun,finishRuntimeRun} from "@/lib/runtime-actions";
import {runtimeDeliveryDigest,deliveryRuntimeTarget,savedRuntimePlan} from "@/lib/runtime-project";
import {authorizeRuntimeExecution} from "@/lib/server-runtime-targets";
import {executeRuntimeCheck} from "@/lib/runtime-runner";
import {proofActor,proofResponse,readProofCase,saveProofCase} from "@/lib/proof-store";
import {body,handle,json,HttpError} from "@/lib/server";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  return handle(async()=>{
    const actor=proofActor(request,true),{id}=await context.params,input=await body(request,4096);
    if(Object.keys(input).some(key=>!["deliveryId","previousReportId","confirm"].includes(key)))throw new HttpError(400,"Backend checks do not accept URLs, scripts or client reports.");
    const stored=await readProofCase(id,actor),digest=await runtimeDeliveryDigest(stored.quote.proof.delivery?.files);
    const now=Date.now(),execution=authorizeRuntimeExecution(stored.quote,digest,undefined,now);
    const leased=beginRuntimeRun(stored.quote,stored.role,input,digest,now);
    await saveProofCase(stored,leased); // CAS before any external write.
    const delivery=leased.proof.delivery!,run=delivery.runtimeRun!;
    const report=await executeRuntimeCheck({deliveryId:delivery.id,deliveryDigest:digest,runId:run.id,plan:savedRuntimePlan(leased)!,target:deliveryRuntimeTarget(delivery),startedAt:run.startedAt,...(delivery.runtimeRegistration?{registration:delivery.runtimeRegistration}:{})},execution);
    const fresh=await readProofCase(id,actor);
    if(await runtimeDeliveryDigest(fresh.quote.proof.delivery?.files)!==digest)throw new HttpError(409,"The delivery files changed while the backend test ran.");
    const next=finishRuntimeRun(fresh.quote,report);
    await saveProofCase(fresh,next);
    return json(proofResponse(fresh,next));
  });
}
