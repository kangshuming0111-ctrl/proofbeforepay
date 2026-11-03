/** Independent disposable booking lifecycle handler. It imports no checker,
 * browser controller or expected outcomes, and makes no outbound/provider calls.
 * Controlled fault policies change real SQL state; readbacks do not fake totals. */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const PROFILES=new Set(['fixed','cancel-credit','move-loss','retry-duplicate']);
const SLOTS={a:'2099-01-01T10:00:00Z',b:'2099-01-01T11:00:00Z',c:'2099-01-01T12:00:00Z'};
const SUFFIXES={create:new Set(['cancel-create','cancel-five','cancel-three','cancel-extra','source-create','loss-create']),cancel:new Set(['cancel-first','cancel-repeat']),move:new Set(['move-full','move-free'])};
const TTL=3600_000,MAX_BODY=4096;
class InputError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const reply=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}});
function configuration(env){
  if(!env?.DB||typeof env.DB.prepare!=='function'||!PROFILES.has(env.LIFECYCLE_PROFILE))throw new Error('configuration_unavailable');
  const profile=env.LIFECYCLE_PROFILE,revision=`lifecycle-${profile}-v1`;
  return{db:env.DB,profile,revision,namespace:runId=>`${revision}:${runId}`};
}
function exact(value,keys){return!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function runId(value){if(typeof value!=='string'||!UUID.test(value))throw new InputError(400,'synthetic_validation_failed');return value;}
async function body(request){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('content-type')?.trim()??''))throw new InputError(415,'json_required');
  const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/u.test(declared)||Number(declared)>MAX_BODY))throw new InputError(413,'body_too_large');
  const reader=request.body?.getReader();if(!reader)throw new InputError(400,'synthetic_validation_failed');
  const chunks=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY){await reader.cancel();throw new InputError(413,'body_too_large');}chunks.push(value);}}finally{reader.releaseLock();}
  const all=new Uint8Array(length);let offset=0;for(const part of chunks){all.set(part,offset);offset+=part.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{throw new InputError(400,'synthetic_validation_failed');}
}
function input(value,action,key){
  const fields=action==='create'?['testRunId','marker','customer','email','slot','partySize']:action==='move'?['testRunId','marker','slot']:['testRunId','marker'];
  if(!exact(value,fields))throw new InputError(400,'synthetic_validation_failed');
  const id=runId(value.testRunId);if(value.marker!==`PBP-${id}`)throw new InputError(400,'synthetic_validation_failed');
  if(action==='create'&&(value.customer!=='PBP synthetic'||value.email!=='pbp-test@example.invalid'))throw new InputError(400,'synthetic_validation_failed');
  if(action!=='cancel'&&!Object.values(SLOTS).includes(value.slot))throw new InputError(400,'synthetic_validation_failed');
  if(action==='create'&&(!Number.isInteger(value.partySize)||value.partySize<1||value.partySize>6))throw new InputError(422,'party_size_invalid');
  const prefix=`pbp-${id}-lifecycle-`;if(typeof key!=='string'||!key.startsWith(prefix)||!SUFFIXES[action].has(key.slice(prefix.length)))throw new InputError(400,'synthetic_validation_failed');
  return value;
}
function receipt(row){return{id:row.id,testRunId:row.test_run_id,marker:`PBP-${row.test_run_id}`,customer:'PBP synthetic',email:'pbp-test@example.invalid',slot:row.slot,partySize:row.party_size,status:row.status,revision:row.revision,idempotencyKey:row.idempotency_key};}
async function first(config,sql,...args){return config.db.prepare(sql).bind(...args).first();}
async function all(config,sql,...args){const result=await config.db.prepare(sql).bind(...args).all();if(result.success===false||!Array.isArray(result.results))throw new Error('storage_unavailable');return result.results;}
async function run(config,sql,...args){const result=await config.db.prepare(sql).bind(...args).run();if(result.success===false||!Number.isSafeInteger(result.meta?.changes)||result.meta.changes<0)throw new Error('storage_unavailable');return result.meta.changes;}
async function current(config,id,namespace,at){return first(config,'SELECT * FROM seller_lifecycle_bookings WHERE namespace=? AND id=? AND expires_at>?',namespace,id,at);}
async function operation(config,namespace,key,at){return first(config,'SELECT * FROM seller_lifecycle_operations WHERE namespace=? AND idempotency_key=? AND expires_at>?',namespace,key,at);}
function storageError(error){
  const message=error instanceof Error?error.message:'';
  if(message.includes('lifecycle_slot_capacity_exceeded'))return new InputError(409,'slot_capacity_exceeded');
  if(message.includes('lifecycle_not_found'))return new InputError(404,'not_found');
  if(message.includes('lifecycle_state_conflict'))return new InputError(409,'booking_state_conflict');
  if(message.includes('lifecycle_staging_limit'))return new InputError(503,'staging_limit_reached');
  return error;
}
async function cleanup(config,at){
  for(const table of ['seller_lifecycle_operations','seller_lifecycle_cancel_credits','seller_lifecycle_bookings'])await run(config,`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE expires_at<=? ORDER BY expires_at,id LIMIT 100)`,at);
}
/** Same-origin browser callers and credential-free operator requests may use
 * this synthetic-only service. The hosting route additionally requires Origin
 * on writes. No personal email, arbitrary slot, fault flag or clock is accepted. */
export async function handleLifecycleRequest(request,env){
  try{
    const config=configuration(env),url=new URL(request.url),at=new Date().toISOString();
    if(request.headers.has('authorization')||request.headers.has('cookie')||request.headers.has('origin')&&request.headers.get('origin')!==url.origin)return reply({code:'credentials_or_foreign_origin_not_accepted'},403);
    if(/[?#]/u.test(request.url))return reply({code:'query_and_fragment_not_accepted'},400);
    if(url.pathname==='/pbp/meta'){
      if(request.method!=='GET')return reply({code:'method_not_allowed'},405,{Allow:'GET'});
      // Schema existence is observed rather than silently created on a request.
      await first(config,'SELECT id FROM seller_lifecycle_bookings LIMIT 1');
      return reply({protocol:'booking-lifecycle-http-v1',revision:config.revision,maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false});
    }
    const occupancy=/^\/pbp\/occupancy\/([a-f0-9-]{36})\/(a|b|c)$/u.exec(url.pathname);
    const merchant=/^\/pbp\/merchant\/([a-f0-9-]{36})$/u.exec(url.pathname);
    const booking=/^\/pbp\/bookings\/([a-f0-9-]{36})(?:\/(cancel|move))?$/u.exec(url.pathname);
    if(occupancy||merchant){
      if(request.method!=='GET')return reply({code:'method_not_allowed'},405,{Allow:'GET'});
      const id=runId((occupancy??merchant)[1]),namespace=config.namespace(id);
      if(occupancy){
        const slot=SLOTS[occupancy[2]],rows=await all(config,'SELECT id,party_size FROM seller_lifecycle_bookings WHERE namespace=? AND slot=? AND status=\'active\' AND expires_at>? ORDER BY id LIMIT 25',namespace,slot,at);
        if(rows.length>24)return reply({code:'readback_limit_exceeded'},503);
        return reply({testRunId:id,slot,revision:config.revision,guestCount:rows.reduce((n,row)=>n+row.party_size,0),bookingIds:rows.map(row=>row.id)});
      }
      const rows=await all(config,'SELECT * FROM seller_lifecycle_bookings WHERE namespace=? AND expires_at>? ORDER BY created_at,id LIMIT 25',namespace,at);
      if(rows.length>24)return reply({code:'readback_limit_exceeded'},503);
      return reply({testRunId:id,revision:config.revision,bookings:rows.map(receipt)});
    }
    if(booking&&!UUID.test(booking[1]))return reply({code:'not_found'},404);
    if(booking&&!booking[2]){
      if(request.method!=='GET')return reply({code:'method_not_allowed'},405,{Allow:'GET'});
      // Random receipt IDs are still restricted to this explicitly fictional
      // profile; this is not a real customer authentication/authorization model.
      const row=await first(config,'SELECT * FROM seller_lifecycle_bookings WHERE revision=? AND id=? AND expires_at>?',config.revision,booking[1],at);
      return row?reply(receipt(row)):reply({code:'not_found'},404);
    }
    const action=url.pathname==='/pbp/bookings'?'create':booking?.[2];
    if(!action)return reply({code:'not_found'},404);
    if(request.method!=='POST')return reply({code:'method_not_allowed'},405,{Allow:'POST'});
    const key=request.headers.get('idempotency-key'),value=input(await body(request),action,key),namespace=config.namespace(value.testRunId);
    const fingerprint=JSON.stringify({action,...(action==='create'?{slot:value.slot,partySize:value.partySize}:{bookingId:booking[1],...(action==='move'?{slot:value.slot}:{})})});
    const old=await operation(config,namespace,key,at);
    if(old){
      if(old.fingerprint!==fingerprint)return reply({code:'idempotency_conflict'},409);
      let row=await current(config,old.booking_id,namespace,at);if(!row)return reply({code:'storage_unavailable'},503);
      if(config.profile==='retry-duplicate'&&action==='create'&&key.endsWith('-loss-create')){
        // Deliberate actual persistence defect: replay creates another row with
        // the same original creation key, bypassing the successful command log.
        const id=crypto.randomUUID();await run(config,'INSERT INTO seller_lifecycle_bookings(id,namespace,profile,test_run_id,revision,idempotency_key,slot,party_size,status,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,namespace,config.profile,value.testRunId,config.revision,key,value.slot,value.partySize,'active',at,at,new Date(Date.parse(at)+TTL).toISOString());
        row=await current(config,id,namespace,at);if(!row)throw new Error('storage_unavailable');
      }
      return reply(receipt(row));
    }
    const target=action==='create'?undefined:await current(config,booking[1],namespace,at);
    if(action!=='create'&&!target)return reply({code:'not_found'},404);
    if(action==='move'&&target.status!=='active')return reply({code:'booking_state_conflict'},409);
    // An expired exact key must not remain blocked behind the bounded global
    // cleanup backlog. Historical active keys are never removed or renewed.
    await run(config,'DELETE FROM seller_lifecycle_operations WHERE namespace=? AND idempotency_key=? AND expires_at<=?',namespace,key,at);
    await cleanup(config,at);
    if(config.profile==='move-loss'&&action==='move'){
      const total=await first(config,'SELECT COALESCE(SUM(party_size),0) AS n FROM seller_lifecycle_bookings WHERE namespace=? AND id<>? AND slot=? AND status=\'active\' AND expires_at>?',namespace,target.id,value.slot,at);
      if(total.n+target.party_size>8)await run(config,'UPDATE seller_lifecycle_bookings SET status=\'cancelled\',updated_at=? WHERE namespace=? AND id=? AND status=\'active\'',at,namespace,target.id);
    }
    const opId=crypto.randomUUID(),id=action==='create'?crypto.randomUUID():target.id,expires=new Date(Date.parse(at)+TTL).toISOString();
    try{
      // A single successful command INSERT and its triggers commit together.
      // Concurrent same-key losers do not rerun the AFTER INSERT mutation.
      await run(config,'INSERT OR IGNORE INTO seller_lifecycle_operations(id,namespace,profile,test_run_id,revision,idempotency_key,fingerprint,action,booking_id,slot,party_size,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',opId,namespace,config.profile,value.testRunId,config.revision,key,fingerprint,action,id,value.slot??null,value.partySize??null,at,expires);
    }catch(error){throw storageError(error);}
    const saved=await operation(config,namespace,key,at);if(!saved)throw new Error('storage_unavailable');
    if(saved.fingerprint!==fingerprint)return reply({code:'idempotency_conflict'},409);
    const row=await current(config,saved.booking_id,namespace,at);if(!row)throw new Error('storage_unavailable');
    // Driver write counters may include trigger side effects. The saved unique
    // operation identity establishes which contender inserted the command.
    const fresh=saved.id===opId;
    if(action==='create'&&key.endsWith('-loss-create')&&fresh)return reply({code:'response_lost_after_commit'},504);
    return reply(receipt(row),action==='create'&&fresh?201:200);
  }catch(error){
    const mapped=storageError(error);if(mapped instanceof InputError)return reply({code:mapped.code},mapped.status);
    return reply({code:mapped instanceof Error&&mapped.message==='configuration_unavailable'?'configuration_unavailable':'storage_unavailable'},503);
  }
}
