// Isolated integration fixture only. Never import from the application worker.
// Its administration routes operate only on this fresh synthetic D1 database;
// all outbound traffic stays blocked and provider calls are separately counted.
import {wrapSandboxTestWorker} from "./sandbox-provider-worker.mjs";
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,"0")).join("");
export function wrapModelArchiveTestWorker(app){
 const observations=[],backups=new Map();
 const raw=async(db,id)=>db.prepare("SELECT * FROM quotes WHERE id = ?").bind(id).first();
 async function state(db,id){
  const quote=await raw(db,id);if(!quote)throw new Error("Synthetic project missing.");
  return{quote,objects:(await db.prepare("SELECT * FROM model_report_objects WHERE quote_id = ? ORDER BY created_at,id").bind(id).all()).results??[],versions:(await db.prepare("SELECT * FROM proof_versions WHERE quote_id = ? ORDER BY archived_at,id").bind(id).all()).results??[]};
 }
 async function admin(request,env){
  if(!["127.0.0.1","localhost","[::1]"].includes(new URL(request.url).hostname))return Response.json({error:"Loopback fixture only."},{status:403});
  const input=await request.json(),id=input.projectId;
  if(!ID.test(id))return Response.json({error:"Synthetic UUID required."},{status:400});
  const row=await raw(env.DB,id),quote=row&&JSON.parse(row.payload);
  if(!quote||!quote.title.startsWith("Synthetic project journey")||!row.owner_id.startsWith("model-archive-buyer-"))return Response.json({error:"Fresh synthetic project required."},{status:403});
  if(input.action==="inspect")return Response.json(await state(env.DB,id));
  if(input.action==="install-cas-miss"){
   await env.DB.prepare(`CREATE TRIGGER synthetic_model_archive_cas_miss BEFORE UPDATE OF payload ON quotes WHEN NEW.id='${id}' AND json_extract(NEW.payload,'$.proof.delivery.modelRun.id') IS NOT NULL BEGIN SELECT RAISE(IGNORE); END`).run();
   return Response.json({installed:true,scope:"inject zero-row quote CAS before model admission, no external state"});
  }
  if(input.action==="remove-cas-miss"){
   await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_model_archive_cas_miss").run();return Response.json({removed:true});
  }
  if(input.action==="poison-next-object"){
   const delivery=quote.proof.delivery,report=delivery?.modelHistory?.[0]??delivery?.modelReport;
   if(!report||delivery.modelArchiveRefs?.length)throw new Error("Poison fixture expects four inline reports and no archive refs.");
   const payload=JSON.stringify(report)+" ",objectId=`${id}:${delivery.id}:${report.id}`;
   await env.DB.prepare("INSERT INTO model_report_objects (id,quote_id,delivery_id,report_id,run_id,payload,payload_sha256,payload_bytes,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(objectId,id,delivery.id,report.id,report.runId,payload,await digest(payload),new TextEncoder().encode(payload).byteLength,new Date().toISOString()).run();
   return Response.json({objectId});
  }
  if(input.action==="remove-poison"){
   if(typeof input.objectId!=="string"||!input.objectId.startsWith(id+":"))throw new Error("Wrong synthetic object.");
   await env.DB.prepare("DELETE FROM model_report_objects WHERE id=? AND quote_id=?").bind(input.objectId,id).run();return Response.json({removed:true});
  }
  if(input.action==="corrupt-object"){
   const current=(await state(env.DB,id)).objects[0];if(!current||backups.has(id))throw new Error("A saved synthetic object is required.");backups.set(id,current);
   if(input.kind==="missing")await env.DB.prepare("DELETE FROM model_report_objects WHERE id=?").bind(current.id).run();
   else if(input.kind==="payload")await env.DB.prepare("UPDATE model_report_objects SET payload=? WHERE id=?").bind(current.payload+" ",current.id).run();
   else if(input.kind==="foreign")await env.DB.prepare("UPDATE model_report_objects SET quote_id=? WHERE id=?").bind("00000000-0000-4000-8000-000000000000",current.id).run();
   else throw new Error("Unknown corruption fixture.");
   return Response.json({corrupted:input.kind,objectId:current.id});
  }
  if(input.action==="restore-object"){
   const prior=backups.get(id);if(!prior)throw new Error("No synthetic backup.");
   await env.DB.prepare("INSERT OR REPLACE INTO model_report_objects (id,quote_id,delivery_id,report_id,run_id,payload,payload_sha256,payload_bytes,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(prior.id,prior.quote_id,prior.delivery_id,prior.report_id,prior.run_id,prior.payload,prior.payload_sha256,prior.payload_bytes,prior.created_at).run();
   backups.delete(id);return Response.json({restored:true});
  }
  return Response.json({error:"Unknown fixture action."},{status:400});
 }
 return wrapSandboxTestWorker({async fetch(request,env,context){
  const pathname=new URL(request.url).pathname;
  if(pathname==="/api/__synthetic_model_archive_test_mode")return Response.json({outboundFetch:"blocked",observations,checkpointBeforeIo:observations.every(o=>o.lease&&o.reservation&&o.checkpoint),backendAttempts:observations.length});
  if(pathname==="/api/__synthetic_model_archive_admin"&&request.method==="POST")return admin(request,env);
  const blocked=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
   const url=new URL(typeof input==="string"||input instanceof URL?input:input.url);
   if(url.origin!=="https://seller-journey.synthetic.example")return blocked(input,init);
   const stored=await env.DB.prepare("SELECT payload FROM quotes WHERE json_extract(payload,'$.proof.delivery.modelRun.id') IS NOT NULL").all();
   const quote=(stored.results??[]).map(row=>JSON.parse(row.payload)).find(q=>q.proof.delivery.modelRun.registration.backendBaseUrl==="https://seller-journey.synthetic.example/pbp/");
   const delivery=quote?.proof.delivery,run=delivery?.modelRun,method=init.method??"GET";
   const row={method,path:url.pathname,lease:!!run?.id,reservation:delivery?.modelEvidenceReservation?.runId===run?.id,checkpoint:!!run?.trace.some(o=>o.completedOrdinal===null),runId:run?.id??null};observations.push(row);
   if(!row.lease||!row.reservation||!row.checkpoint)throw new Error("Synthetic I/O preceded durable model lease.");
   // Actual metadata is deliberately unavailable. This is an explicit local
   //503 response, not success evidence, and cannot authorize a synthetic POST.
   if(method!=="GET"||url.pathname!=="/pbp/meta")throw new Error("No model POST is allowed in this archive integration suite.");
   await new Promise(resolve=>setTimeout(resolve,80));
   return Response.json({error:"synthetic_metadata_unavailable"},{status:503});
  };
  return app.fetch(request,env,context);
 }});
}
