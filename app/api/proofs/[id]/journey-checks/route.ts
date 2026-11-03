import {proofActor,proofResponse,readProofCase,saveProofCase,type ProofRecord} from "@/lib/proof-store";
import {body,handle,json,HttpError} from "@/lib/server";
import {runtimeDeliveryDigest} from "@/lib/runtime-project";
import {beginProjectJourneyRun,beginProjectJourneyStep,confirmProjectJourneyPlan,finishProjectJourneyRun,finishProjectJourneyStep} from "@/lib/project-journey-actions";
import {evaluateStoredProjectJourneyReport,PROJECT_JOURNEY_AGREEMENT,savedProjectJourneyPlan} from "@/lib/project-journey";
import {availableJourneyTargets,assertSeparateJourneyOrigin,operatorJourneyRegistrations,readProjectJourneyStep,requireCurrentJourneyRegistration,resolveJourneyTarget} from "@/lib/server-journey-targets";
export const dynamic="force-dynamic";
async function journeyView(record:ProofRecord){const delivery=record.quote.proof.delivery,digest=delivery?.files?await runtimeDeliveryDigest(delivery.files):undefined;return{plan:savedProjectJourneyPlan(record.quote)??null,agreement:PROJECT_JOURNEY_AGREEMENT,targets:digest?availableJourneyTargets(record.quote,digest):[],run:delivery?.journeyRun??null,report:delivery?.journeyReport??null,evaluation:delivery?.journeyReport?evaluateStoredProjectJourneyReport(delivery.journeyReport):null};}
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const{id}=await context.params,record=await readProofCase(id,proofActor(request));return json(await journeyView(record));});}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
 const actor=proofActor(request,true),{id}=await context.params,input=await body(request,16*1024),record=await readProofCase(id,actor);
 if(input.action==="confirm-plan")await saveProofCase(record,confirmProjectJourneyPlan(record.quote,record.role,input));
 else if(input.action==="start"){
  const digest=await runtimeDeliveryDigest(record.quote.proof.delivery?.files),registration=resolveJourneyTarget(record.quote,input.targetId,digest);assertSeparateJourneyOrigin(registration,new URL(request.url).origin);await saveProofCase(record,beginProjectJourneyRun(record.quote,record.role,input,digest,registration));
 }else if(input.action==="observe"){
  const digest=await runtimeDeliveryDigest(record.quote.proof.delivery?.files);requireCurrentJourneyRegistration(record.quote,digest);const begun=beginProjectJourneyStep(record.quote,record.role,input);await saveProofCase(record,begun.quote);
  const run=record.quote.proof.delivery!.journeyRun!,observed=await readProjectJourneyStep(run,begun.observation),fresh=await readProofCase(id,actor);
  if(await runtimeDeliveryDigest(fresh.quote.proof.delivery?.files)!==run.deliveryDigest)throw new HttpError(409,"Delivery files changed while journey readbacks ran.");
  await saveProofCase(fresh,finishProjectJourneyStep(fresh.quote,run.id,begun.leaseId,observed.observation,observed.metadata));record.quote=fresh.quote;record.version=fresh.version;
 }else if(input.action==="finish"||input.action==="abort")await saveProofCase(record,finishProjectJourneyRun(record.quote,record.role,input,new Date().toISOString(),input.action==="abort"));
 else throw new HttpError(400,"Choose a supported journey action.");
 return json({...proofResponse(record),journey:await journeyView(record)});
});}
