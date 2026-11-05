/** Independent synthetic native service; no checker or expected-verdict imports. */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const PROFILES=['fixed','fake-success','wrong-fields','duplicate-retry'];
const TTL=60*60*1000;
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function config(env){if(!env.DB||!PROFILES.includes(env.ENQUIRY_PROFILE)||typeof env.ENQUIRY_REVISION!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/u.test(env.ENQUIRY_REVISION))throw new Error('configuration_unavailable');return{db:env.DB,profile:env.ENQUIRY_PROFILE,revision:env.ENQUIRY_REVISION};}
async function first(c,sql,...args){return c.db.prepare(sql).bind(...args).first();}
async function all(c,sql,...args){const r=await c.db.prepare(sql).bind(...args).all();if(r.success===false||!Array.isArray(r.results))throw new Error('storage_unavailable');return r.results;}
async function write(c,sql,...args){const r=await c.db.prepare(sql).bind(...args).run();if(r.success===false)throw new Error('storage_unavailable');return r;}
async function requestBody(request){if(request.headers.get('content-type')?.split(';',1)[0].trim()!=='application/json'||!request.body)throw new Error('invalid_enquiry');const reader=request.body.getReader(),chunks=[];let total=0;try{for(;;){const r=await reader.read();if(r.done)break;total+=r.value.byteLength;if(total>2048)throw new Error('invalid_enquiry');chunks.push(r.value);}const bytes=new Uint8Array(total);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}}
function validBody(b,key){if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).sort().join(',')!=='email,marker,message,name,subject,testRunId'||typeof b.testRunId!=='string'||!UUID.test(b.testRunId)||b.marker!==`PBP-${b.testRunId}`||b.name!=='PBP synthetic'||b.email!=='pbp-test@example.invalid'||b.subject!=='Website enquiry'||typeof b.message!=='string'||!b.message.trim()||b.message.length>500||/[\u0000-\u001f\u007f]/u.test(b.message)||typeof key!=='string'||!['normal','loss','invalid'].some(s=>key===`pbp-${b.testRunId}-enquiry-${s}`))throw new Error('invalid_enquiry');return b;}
function receipt(r){return{id:r.id,testRunId:r.test_run_id,marker:`PBP-${r.test_run_id}`,name:r.name,email:r.email,subject:r.subject,message:r.message,revision:r.revision,idempotencyKey:r.creation_key,status:'received'};}
export async function handleEnquiryRequest(request,env){
 try{
  const c=config(env),url=new URL(request.url),at=new Date().toISOString();
  if(request.headers.has('authorization')||request.headers.has('cookie')||request.headers.has('origin')&&request.headers.get('origin')!==url.origin)return response({code:'credentials_or_foreign_origin_rejected'},403);
  if(url.search||url.hash||/[\\%]/u.test(request.url)||url.pathname.includes('//'))return response({code:'unsupported_path'},400);
  if(url.pathname==='/pbp/meta'){if(request.method!=='GET')return response({code:'method_not_allowed'},405);await first(c,'SELECT id FROM enquiry_receipts LIMIT 1');return response({protocol:'enquiry-http-v1',revision:c.revision,syntheticOnly:true,emailDelivery:false});}
  const query=/^\/pbp\/runs\/([a-f0-9-]{36})$/u.exec(url.pathname),one=/^\/pbp\/enquiries\/([a-f0-9-]{36})$/u.exec(url.pathname);
  if(query||one){if(request.method!=='GET')return response({code:'method_not_allowed'},405);const id=(query??one)[1];if(!UUID.test(id))return response({code:'not_found'},404);
   if(query){const rows=await all(c,'SELECT * FROM enquiry_receipts WHERE namespace=? AND expires_at>? ORDER BY created_at,id LIMIT 9',`${c.revision}:${id}`,at);if(rows.length>8)return response({code:'readback_limit'},503);return response({testRunId:id,revision:c.revision,enquiries:rows.map(receipt)});}
   const row=await first(c,'SELECT * FROM enquiry_receipts WHERE revision=? AND id=? AND expires_at>?',c.revision,id,at);return row?response(receipt(row)):response({code:'not_found'},404);
  }
  if(url.pathname!=='/pbp/enquiries')return response({code:'not_found'},404);if(request.method!=='POST')return response({code:'method_not_allowed'},405);
  let b;const key=request.headers.get('idempotency-key');try{b=validBody(await requestBody(request),key);}catch{return response({code:'invalid_enquiry'},400);}
  const namespace=`${c.revision}:${b.testRunId}`,fingerprint=JSON.stringify([b.name,b.email,b.subject,b.message]),old=await first(c,'SELECT * FROM enquiry_commands WHERE namespace=? AND creation_key=? AND expires_at>?',namespace,key,at);
  if(old){if(old.fingerprint!==fingerprint)return response({code:'idempotency_conflict'},409);let row=await first(c,'SELECT * FROM enquiry_receipts WHERE namespace=? AND id=? AND expires_at>?',namespace,old.enquiry_id,at);if(!row)throw new Error('storage_unavailable');
   if(c.profile==='duplicate-retry'&&key.endsWith('-loss')){const count=await first(c,'SELECT COUNT(*) AS n FROM enquiry_receipts');if(count.n>=500)return response({code:'staging_limit'},503);const id=crypto.randomUUID();await write(c,'INSERT INTO enquiry_receipts(id,namespace,test_run_id,revision,creation_key,name,email,subject,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,namespace,b.testRunId,c.revision,key,b.name,b.email,b.subject,b.message,at,new Date(Date.parse(at)+TTL).toISOString());row=await first(c,'SELECT * FROM enquiry_receipts WHERE id=?',id);}
   return response(receipt(row));
  }
  // Bounded cleanup does not renew or delete active successful command keys.
  await write(c,'DELETE FROM enquiry_commands WHERE namespace=? AND creation_key=? AND expires_at<=?',namespace,key,at);
  for(const table of ['enquiry_commands','enquiry_receipts'])await write(c,`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE expires_at<=? ORDER BY expires_at,id LIMIT 100)`,at);
  const op=crypto.randomUUID(),id=crypto.randomUUID(),expires=new Date(Date.parse(at)+TTL).toISOString();
  if(c.profile==='fake-success')return response({id,...b,revision:c.revision,idempotencyKey:key,status:'received'},201);
  const savedMessage=c.profile==='wrong-fields'?'A different message was really persisted.':b.message;
  await write(c,'INSERT OR IGNORE INTO enquiry_commands(id,namespace,creation_key,fingerprint,enquiry_id,test_run_id,revision,name,email,subject,message,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',op,namespace,key,fingerprint,id,b.testRunId,c.revision,b.name,b.email,b.subject,savedMessage,at,expires);
  const saved=await first(c,'SELECT * FROM enquiry_commands WHERE namespace=? AND creation_key=? AND expires_at>?',namespace,key,at);if(!saved)throw new Error('storage_unavailable');if(saved.fingerprint!==fingerprint)return response({code:'idempotency_conflict'},409);
  const row=await first(c,'SELECT * FROM enquiry_receipts WHERE namespace=? AND id=? AND expires_at>?',namespace,saved.enquiry_id,at);if(!row)throw new Error('storage_unavailable');
  if(saved.id===op&&key.endsWith('-loss'))return response({code:'response_lost_after_commit'},504);
  return response(receipt(row),saved.id===op?201:200);
 }catch(error){return response({code:error instanceof Error&&error.message==='configuration_unavailable'?'configuration_unavailable':error instanceof Error&&error.message.includes('enquiry_staging_limit')?'staging_limit':'storage_unavailable'},503);}
}
