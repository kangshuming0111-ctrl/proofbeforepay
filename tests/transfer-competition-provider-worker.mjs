// Owned local API fixture only. Every outbound request is intercepted; these
// declared metadata/empty reads and uncertain writes are not native execution.
import {wrapSandboxTestWorker} from "./sandbox-provider-worker.mjs";
export function wrapTransferCompetitionTestWorker(app){
 const attempts=[];
 return wrapSandboxTestWorker({async fetch(request,env,context){
  if(new URL(request.url).pathname==="/api/__synthetic_transfer_test_mode")return Response.json({outboundFetch:"blocked",attempts,checkpointBeforeIo:attempts.every(row=>row.quoteLease&&row.sessionRow&&row.checkpoint)});
  const blocked=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
   const url=new URL(typeof input==="string"||input instanceof URL?input:input.url);
   if(url.origin!=="https://independent-seller.synthetic.example")return blocked(input,init);
   const stored=await env.DB.prepare("SELECT payload FROM quotes WHERE json_extract(payload,'$.proof.delivery.transferCompetitionRun.id') IS NOT NULL").all(),quote=(stored.results??[]).map(r=>JSON.parse(r.payload)).find(q=>q.proof.delivery.transferCompetitionRun.registration.backendBaseUrl==="https://independent-seller.synthetic.example/pbp/"),lease=quote?.proof.delivery?.transferCompetitionRun;
   const row=lease?await env.DB.prepare("SELECT payload FROM transfer_competition_sessions WHERE id = ?").bind(lease.id).first():null,session=row?JSON.parse(row.payload):null,method=init.method??"GET";
   attempts.push({runId:lease?.id??null,method,path:url.pathname,quoteLease:!!lease,sessionRow:session?.id===lease?.id,checkpoint:!!session?.trace?.some(o=>o.path===url.pathname&&o.method===method&&o.completedOrdinal===null)});
   if(!lease||!session)throw new Error("No durable quote and standalone session claim before synthetic I/O.");
   const revision=lease.registration.bridgeRevision??lease.registration.deploymentRevision,runId=lease.id;
   if(method==="POST"){
    // A bounded window allows the API test to inspect pending finance guards
    // and then interrupt/restart its owned Worker before a completion exists.
    await new Promise(resolve=>setTimeout(resolve,1500));
    return Response.json({code:"synthetic_post_commit_outcome_unknown"},{status:504});
   }
   if(url.pathname==="/pbp/meta"){await new Promise(resolve=>setTimeout(resolve,200));return Response.json({protocol:"booking-lifecycle-http-v1",revision,nativeRevision:lease.registration.deploymentRevision,maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false,supportedModels:["transfer-competition-v1"]});}
   if(url.pathname===`/pbp/merchant/${runId}`)return Response.json({testRunId:runId,revision,bookings:[]});
   const slot=/^\/pbp\/occupancy\/[a-f0-9-]{36}\/([abc])$/u.exec(url.pathname);
   if(slot)return Response.json({testRunId:runId,revision,slot:{a:"2099-01-01T10:00:00Z",b:"2099-01-01T11:00:00Z",c:"2099-01-01T12:00:00Z"}[slot[1]],guestCount:0,bookingIds:[]});
   throw new Error("Unsupported synthetic transfer fixture request.");
  };
  return app.fetch(request,env,context);
 }});
}
