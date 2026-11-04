// Test-only transport. No original network fetch is retained; seller responses
// below are declared fixtures, not an operated browser or native datastore.
import {wrapSandboxTestWorker} from "./sandbox-provider-worker.mjs";
export function wrapBrowserWitnessTestWorker(app){const calls=[];return wrapSandboxTestWorker({async fetch(request,env,context){
 if(new URL(request.url).pathname==="/api/__synthetic_browser_witness_mode")return Response.json({outboundFetch:"blocked",browserOperated:false,calls});
 const blocked=globalThis.fetch;globalThis.fetch=async(input,init={})=>{const url=new URL(typeof input==="string"||input instanceof URL?input:input.url);if(url.origin!=="https://independent-seller.synthetic.example")return blocked(input,init);const rows=await env.DB.prepare("SELECT payload FROM browser_witness_sessions WHERE json_extract(payload,'$.status') = 'open'").all();const sessions=rows.results.map(row=>JSON.parse(row.payload)),session=sessions.find(s=>url.pathname.includes(s.runId))??(url.pathname==="/pbp/meta"?sessions.at(-1):undefined);calls.push({method:init.method??"GET",path:url.pathname,lease:!!session,version:session?.version??null});if(init.method!=="GET"||!session)throw new Error("Only a persisted fixture witness lease may read the synthetic target.");const revision=session.registration.bridgeRevision??session.registration.deploymentRevision;
 if(url.pathname==="/pbp/meta")return Response.json({protocol:"booking-lifecycle-http-v1",revision,nativeRevision:session.registration.deploymentRevision,maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false});
 if(url.pathname===`/pbp/merchant/${session.runId}`)return Response.json({testRunId:session.runId,revision,bookings:[]});
 if(url.pathname===`/pbp/occupancy/${session.runId}/a`)return Response.json({testRunId:session.runId,revision,slot:session.expected.slot,guestCount:0,bookingIds:[]});
 return Response.json({code:"not_found"},{status:404});};return app.fetch(request,env,context);
 }});}
