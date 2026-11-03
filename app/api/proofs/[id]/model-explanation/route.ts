import {currentModelEvidenceExplanation,modelEvidenceContext,saveModelEvidenceExplanation} from "@/lib/model-evidence-explanation";
import {explainModelEvidence} from "@/lib/model-evidence-provider";
import {proofActor,proofResponse,readProofCase,saveProofCase} from "@/lib/proof-store";
import {body,handle,HttpError,json,providerEnv} from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{const actor=proofActor(request);if(!actor.authenticated)throw new HttpError(401,"Sign in to read model evidence explanations.");const{id}=await context.params,record=await readProofCase(id,actor);return json({explanation:await currentModelEvidenceExplanation(record.quote)??null});});}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handle(async()=>{
 const actor=proofActor(request,true);if(!actor.authenticated)throw new HttpError(401,"Sign in to explain this project's saved model evidence.");
 const{id}=await context.params,input=await body(request,2048),record=await readProofCase(id,actor),evidence=await modelEvidenceContext(record.quote,record.role,input);
 const explanation=await explainModelEvidence(evidence,providerEnv());
 // Membership, current upload/report/diagnosis and capacity are rechecked after
 // the asynchronous provider call; saveProofCase applies the version CAS.
 const fresh=await readProofCase(id,actor);await saveProofCase(fresh,await saveModelEvidenceExplanation(fresh.quote,fresh.role,input,explanation));return json({...proofResponse(fresh),explanation},201);
});}
