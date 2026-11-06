import {applyScopeClarification,resolveScopeClarifications,scopeTargetCandidates} from '@/lib/scope-clarifications';
import {proofActor,proofResponse,readProofCase,saveProofCase} from '@/lib/proof-store';
import {body,handle,json} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 return handle(async()=>{const{id}=await context.params,record=await readProofCase(id,proofActor(request,true));return json({...proofResponse(record),scopeContext:await resolveScopeClarifications(record.quote),candidates:scopeTargetCandidates(record.quote)});});
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 return handle(async()=>{const{id}=await context.params,record=await readProofCase(id,proofActor(request,true)),next=await applyScopeClarification(record.quote,record.role,await body(request,8000));if(next!==record.quote)await saveProofCase(record,next);return json({...proofResponse(record,next),scopeContext:await resolveScopeClarifications(next),candidates:scopeTargetCandidates(next)});});
}
