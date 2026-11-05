import {env} from "cloudflare:workers";
import {proofActor,proofResponse,readProofCase,saveProofCase,type ProofRecord} from "@/lib/proof-store";
import {body,handle,json,HttpError} from "@/lib/server";
import {runtimeDeliveryDigest} from "@/lib/runtime-project";
import {availableEnquiryTargets,executeProjectEnquiryStep,parseEnquiryRegistrations,resolveEnquiryTarget} from "@/lib/server-enquiry-targets";
import {beginProjectEnquiryRun,beginProjectEnquiryStep,confirmProjectEnquiryPlan,finishProjectEnquiryRun,finishProjectEnquiryStep} from "@/lib/project-enquiry-actions";
import {ENQUIRY_AGREEMENT,evaluateProjectEnquiryReport,type EnquiryDelivery} from "@/lib/project-enquiry";
export const dynamic="force-dynamic";
const entries=()=>parseEnquiryRegistrations((env as unknown as Record<string,unknown>).PBP_ENQUIRY_TARGETS);
async function view(record:ProofRecord){const d=record.quote.proof.delivery as EnquiryDelivery|undefined,digest=d?.files?await runtimeDeliveryDigest(d.files):undefined;let targets:ReturnType<typeof availableEnquiryTargets>=[],registryUnavailable=false;try{targets=digest?availableEnquiryTargets(record.quote,digest,entries()):[];}catch{registryUnavailable=true;}return{agreement:ENQUIRY_AGREEMENT,plan:d?.enquiryPlan??null,targets,registryUnavailable,run:d?.enquiryRun??null,report:d?.enquiryReport??null,evaluation:d?.enquiryReport?evaluateProjectEnquiryReport(d.enquiryReport):null};}
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const{id}=await context.params,record=await readProofCase(id,proofActor(request));return json(await view(record));});}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
 const actor=proofActor(request,true),{id}=await context.params,input=await body(request,2048),record=await readProofCase(id,actor);
 if(input.action==="confirm-plan")await saveProofCase(record,await confirmProjectEnquiryPlan(record.quote,record.role,input));
 else if(input.action==="start"){
  const digest=await runtimeDeliveryDigest(record.quote.proof.delivery?.files),target=resolveEnquiryTarget(record.quote,input.targetId,digest,entries());if(new URL(target.baseUrl).origin===new URL(request.url).origin)throw new HttpError(409,"Enquiry checks require a separately approved disposable seller staging origin.");await saveProofCase(record,await beginProjectEnquiryRun(record.quote,record.role,input,target));
 }else if(input.action==="advance"){
  const old=(record.quote.proof.delivery as EnquiryDelivery|undefined)?.enquiryRun;if(!old)throw new HttpError(409,"No active enquiry run.");const digest=await runtimeDeliveryDigest(record.quote.proof.delivery?.files),target=resolveEnquiryTarget(record.quote,old.registration.id,digest,entries());if(JSON.stringify(target)!==JSON.stringify(old.registration))throw new HttpError(409,"Enquiry staging approval changed. Close this run without further requests.");
  const begun=beginProjectEnquiryStep(record.quote,record.role,input);await saveProofCase(record,begun.quote);
  const observed=await executeProjectEnquiryStep(begun.run,begun.stepId),fresh=await readProofCase(id,actor);if(await runtimeDeliveryDigest(fresh.quote.proof.delivery?.files)!==begun.run.deliveryDigest)throw new HttpError(409,"Delivery changed while enquiry checks ran; prior write outcome may be unknown.");
  await saveProofCase(fresh,finishProjectEnquiryStep(fresh.quote,begun.run.id,begun.leaseId,observed));record.quote=fresh.quote;record.version=fresh.version;
 }else if(input.action==="finish"||input.action==="abort")await saveProofCase(record,finishProjectEnquiryRun(record.quote,record.role,input));
 else throw new HttpError(400,"Choose a supported enquiry action.");
 return json({...proofResponse(record),enquiry:await view(record)});
});}
