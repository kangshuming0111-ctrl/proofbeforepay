import {appendCooperativeStageReport,cooperativeStageContext,validateCooperativeStageReports} from '@/lib/cooperative-stage-evidence';
import {proofActor,proofResponse,readProofCase,saveProofCase} from '@/lib/proof-store';
import {body,handle,HttpError,json} from '@/lib/server';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 return handle(async()=>{
  const actor=proofActor(request,true);if(!actor.authenticated)throw new HttpError(401,'Sign in to save cooperative reports.');
  const{id}=await context.params,record=await readProofCase(id,actor),input=await body(request,70*1024);
  const next=await appendCooperativeStageReport(record.quote,record.role,input);
  if(next===record.quote)return json(proofResponse(record));
  try{await saveProofCase(record,next);}
  catch(error){
   if(!(error instanceof HttpError)||error.status!==409)throw error;
   // Read-only reconciliation of a concurrent identical append. Never retry a
   // mutation or return a report attached to another delivery after replacement.
   const fresh=await readProofCase(id,actor),binding=await cooperativeStageContext(fresh.quote);
   if(binding.deliveryId!==input.deliveryId||binding.deliveryDigest!==input.deliveryDigest)throw error;
   const rows=await validateCooperativeStageReports(fresh.quote.proof.delivery?.cooperativeStageReports,binding);
   const submitted=next.proof.delivery!.cooperativeStageReports!.at(-1)!.report.digest;
   if(!rows.some(row=>row.report.digest===submitted))throw error;
   return json(proofResponse(fresh));
  }
  return json(proofResponse(record));
 });
}
