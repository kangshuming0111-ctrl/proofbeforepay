/** Independent synthetic capacity service. Only the documented wire contract
 * is shared with the checker; this module imports no checker/fixture responses
 * and performs no outbound network, email, model or payment operation. */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
const REVISION=/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u;
const DIGEST=/^[a-f0-9]{64}$/u;
const COMMIT=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const POLICIES=new Set(["fixed","overbook","underlimit"]);
const SUFFIXES=new Set(["above","race-a","race-b","fill","extra","slot-b"]);
const SLOTS={a:"2099-01-01T10:00:00Z",b:"2099-01-01T11:00:00Z"};
const EXPANDED_SUFFIXES=new Set([...SUFFIXES,"missing-slot","invalid-email","zero","fraction","negative","string","same-key","one","below"]);
const EXPANDED_SLOTS={...SLOTS,c:"2099-01-01T12:00:00Z",d:"2099-01-01T13:00:00Z",e:"2099-01-01T14:00:00Z"};
const FIELDS=["testRunId","marker","customer","email","slot","partySize"];
const BODY_BYTES=4096,TTL_MS=3600_000;
class InputError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
class ConfigurationError extends Error{}

function reply(value,status=200,headers={}){return Response.json(value,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",...headers}});}
function configuration(env){
  const projectId=env?.CAPACITY_PROJECT_ID,registrationRevision=env?.CAPACITY_REGISTRATION_REVISION,frontendBundleDigest=env?.CAPACITY_FRONTEND_BUNDLE_DIGEST;
  const deploymentRevision=env?.CAPACITY_DEPLOYMENT_REVISION,policyId=env?.CAPACITY_POLICY_ID,db=env?.CAPACITY_DB;
  const backendArtifactDigest=env?.CAPACITY_BACKEND_ARTIFACT_DIGEST,backendSourceCommit=env?.CAPACITY_BACKEND_SOURCE_COMMIT;
  const protocol=env?.CAPACITY_PROTOCOL??"booking-http-v3",validationProfile=env?.CAPACITY_VALIDATION_PROFILE??"strict";
  if(typeof projectId!=="string"||!IDENTIFIER.test(projectId)||typeof registrationRevision!=="string"||!IDENTIFIER.test(registrationRevision)
    ||typeof frontendBundleDigest!=="string"||!DIGEST.test(frontendBundleDigest)||typeof deploymentRevision!=="string"||!REVISION.test(deploymentRevision)
    ||typeof policyId!=="string"||!POLICIES.has(policyId)||!db||typeof db.prepare!=="function"
    ||!["booking-http-v3","booking-http-v4"].includes(protocol)||!["strict","email-gap"].includes(validationProfile)
    ||validationProfile==="email-gap"&&policyId!=="fixed"
    ||backendArtifactDigest!==undefined&&(typeof backendArtifactDigest!=="string"||!DIGEST.test(backendArtifactDigest))
    ||backendSourceCommit!==undefined&&(typeof backendSourceCommit!=="string"||!COMMIT.test(backendSourceCommit)))throw new ConfigurationError();
  // Existing v3 deployments retain their exact historical table and manifest.
  // Expanded recipes use append-only tables whose namespace also pins protocol
  // and the operator-selected controlled validation profile.
  const expanded=protocol==="booking-http-v4"||validationProfile!=="strict";
  return{projectId,registrationRevision,frontendBundleDigest,deploymentRevision,policyId,db,backendArtifactDigest,backendSourceCommit,protocol,validationProfile,expanded,
    receipts:expanded?"seller_capacity_expanded_receipts":"seller_capacity_receipts",policies:expanded?"seller_capacity_expanded_policy":"seller_capacity_policy",
    manifestNamespace:`${projectId}:${registrationRevision}:${deploymentRevision}:${frontendBundleDigest}:${policyId}${expanded?`:${protocol}:${validationProfile}`:""}`};
}
async function jsonBody(request){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type")?.trim()??""))throw new InputError(415,"json_required");
  const length=request.headers.get("content-length");if(length!==null&&(!/^\d+$/u.test(length)||Number(length)>BODY_BYTES))throw new InputError(413,"body_too_large");
  const reader=request.body?.getReader();if(!reader)throw new InputError(400,"synthetic_validation_failed");
  const chunks=[];let size=0;
  try{while(true){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>BODY_BYTES){await reader.cancel();throw new InputError(413,"body_too_large");}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw new InputError(400,"synthetic_validation_failed");}
}
function syntheticInput(value,key,config){
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==FIELDS.length||Object.keys(value).some(field=>!FIELDS.includes(field))
    ||typeof value.testRunId!=="string"||!UUID.test(value.testRunId)||value.marker!==`PBP-${value.testRunId}`||value.customer!=="PBP synthetic"
    ||value.email!=="pbp-test@example.invalid"&&!(config.validationProfile==="email-gap"&&value.email==="not-an-email")
    ||!Object.values(config.protocol==="booking-http-v4"?EXPANDED_SLOTS:SLOTS).includes(value.slot))throw new InputError(400,"synthetic_validation_failed");
  const prefix=`pbp-${value.testRunId}-capacity-`;
  if(typeof key!=="string"||!key.startsWith(prefix)||!(config.protocol==="booking-http-v4"?EXPANDED_SUFFIXES:SUFFIXES).has(key.slice(prefix.length)))throw new InputError(400,"synthetic_validation_failed");
  if(!Number.isInteger(value.partySize)||value.partySize<1)throw new InputError(422,"party_size_invalid");
  if(value.partySize>13)throw new InputError(400,"synthetic_validation_failed");
  return value;
}
async function policy(config){
  const row=await config.db.prepare(`SELECT max_party_size,max_guests_per_slot,enforce_capacity${config.expanded?",enforce_email":""} FROM ${config.policies} WHERE policy_id = ?${config.expanded?" AND validation_profile = ?":""}`)
    .bind(config.policyId,...(config.expanded?[config.validationProfile]:[])).first();
  if(!row||!Number.isInteger(row.max_party_size)||row.max_party_size<2||row.max_party_size>12||!Number.isInteger(row.max_guests_per_slot)
    ||row.max_guests_per_slot<3||row.max_guests_per_slot>12||![0,1].includes(row.enforce_capacity)
    ||config.expanded&&![0,1].includes(row.enforce_email))throw new Error("capacity_policy_unavailable");
  return row;
}
const namespace=(config,runId)=>`${config.manifestNamespace}:${runId}`;
function receipt(row){return{id:row.id,testRunId:row.test_run_id,marker:row.marker,customer:row.customer,email:row.email,slot:row.slot,partySize:row.party_size,revision:row.deployment_revision,createdAt:row.created_at,expiresAt:row.expires_at};}
function same(row,input){return row.test_run_id===input.testRunId&&row.marker===input.marker&&row.customer===input.customer&&row.email===input.email&&row.slot===input.slot&&row.party_size===input.partySize;}
const replay=(row,input)=>same(row,input)?reply(receipt(row)):reply({code:"idempotency_conflict"},409);
async function existing(config,runId,key,at){return config.db.prepare(`SELECT * FROM ${config.receipts} WHERE namespace = ? AND idempotency_key = ? AND expires_at > ?`).bind(namespace(config,runId),key,at).first();}

/** Explicit operator bindings only. Native policy, not the request or checker
 * plan, determines admission. Test-run namespaces isolate disposable scenarios;
 * this does not claim capacity across real production customer traffic. */
export async function handleCapacityRequest(request,env){
  try{
    const config=configuration(env),url=new URL(request.url);
    if(request.headers.has("origin")||request.headers.has("authorization")||request.headers.has("cookie"))return reply({code:"credentials_and_browser_origins_not_accepted"},403);
    if(/[?#]/u.test(request.url))return reply({code:"query_and_fragment_not_accepted"},400);
    if(url.pathname==="/pbp/meta"){
      if(request.method!=="GET")return reply({code:"method_not_allowed"},405,{Allow:"GET"});
      const native=await policy(config);
      return reply({protocol:config.protocol,revision:config.deploymentRevision,projectId:config.projectId,registrationRevision:config.registrationRevision,frontendBundleDigest:config.frontendBundleDigest,
        ...(config.backendArtifactDigest===undefined?{}:{backendArtifactDigest:config.backendArtifactDigest}),...(config.backendSourceCommit===undefined?{}:{backendSourceCommit:config.backendSourceCommit}),
        maxPartySize:native.max_party_size,maxGuestsPerSlot:native.max_guests_per_slot,syntheticOnly:true,ttlSeconds:TTL_MS/1000,deploymentAttestation:false,emailDelivery:false,payments:false});
    }
    const occupancy=/^\/pbp\/occupancy\/([a-f0-9-]{36})\/(a|b|c|d|e)$/u.exec(url.pathname);
    if(occupancy){
      if(request.method!=="GET")return reply({code:"method_not_allowed"},405,{Allow:"GET"});
      const runId=occupancy[1],slot=(config.protocol==="booking-http-v4"?EXPANDED_SLOTS:SLOTS)[occupancy[2]];if(!UUID.test(runId)||!slot)return reply({code:"not_found"},404);
      // A single SQL snapshot derives both aggregate seats and original IDs.
      // LIMIT25 detects oversized output; it never returns truncated evidence.
      const result=await config.db.prepare(`SELECT id,SUM(party_size) OVER () AS guest_count,COUNT(*) OVER () AS booking_count
        FROM ${config.receipts} WHERE namespace = ? AND slot = ? AND expires_at > ? ORDER BY id LIMIT 25`)
        .bind(namespace(config,runId),slot,new Date().toISOString()).all();
      const rows=result.results;if(result.success===false||!Array.isArray(rows))throw new Error("capacity_occupancy_unavailable");
      const guestCount=rows[0]?.guest_count??0,bookingCount=rows[0]?.booking_count??0;
      if(rows.length>24||bookingCount!==rows.length||!Number.isSafeInteger(guestCount)||guestCount<0||guestCount>1000
        ||rows.some(row=>!UUID.test(row.id)||row.guest_count!==guestCount||row.booking_count!==bookingCount)||new Set(rows.map(row=>row.id)).size!==rows.length)return reply({code:"occupancy_limit_exceeded"},503);
      return reply({testRunId:runId,slot,revision:config.deploymentRevision,guestCount,bookingIds:rows.map(row=>row.id)});
    }
    const byId=/^\/pbp\/bookings\/([a-f0-9-]{36})$/u.exec(url.pathname);
    if(byId){
      if(request.method!=="GET")return reply({code:"method_not_allowed"},405,{Allow:"GET"});
      if(!UUID.test(byId[1]))return reply({code:"not_found"},404);
      const row=await config.db.prepare(`SELECT * FROM ${config.receipts} WHERE manifest_namespace = ? AND id = ? AND expires_at > ?`).bind(config.manifestNamespace,byId[1],new Date().toISOString()).first();
      return row?reply(receipt(row)):reply({code:"not_found"},404);
    }
    if(url.pathname!=="/pbp/bookings")return reply({code:"not_found"},404);
    if(request.method!=="POST")return reply({code:"method_not_allowed"},405,{Allow:"POST"});
    const input=syntheticInput(await jsonBody(request),request.headers.get("idempotency-key"),config),key=request.headers.get("idempotency-key"),at=new Date().toISOString();
    const saved=await existing(config,input.testRunId,key,at);if(saved)return replay(saved,input);
    const native=await policy(config);
    if(input.partySize>native.max_party_size){const raced=await existing(config,input.testRunId,key,at);return raced?replay(raced,input):reply({code:"party_size_exceeded"},422);}
    // Prioritise this expired key within the same100-row cleanup bound. A large
    // expired backlog must not permanently block recreation of this exact key.
    const deleted=await config.db.prepare(`DELETE FROM ${config.receipts} WHERE namespace = ? AND idempotency_key = ? AND expires_at <= ?`).bind(namespace(config,input.testRunId),key,at).run();
    if(deleted.success===false||![0,1].includes(deleted.meta?.changes))throw new Error("capacity_cleanup_unavailable");
    await config.db.prepare(`DELETE FROM ${config.receipts} WHERE id IN (SELECT id FROM ${config.receipts} WHERE expires_at <= ? ORDER BY expires_at,id LIMIT ?)`).bind(at,100-deleted.meta.changes).run();
    const id=crypto.randomUUID(),expires=new Date(Date.parse(at)+TTL_MS).toISOString();let inserted;
    try{
      inserted=await config.db.prepare(`INSERT OR IGNORE INTO ${config.receipts}
        (id,namespace,manifest_namespace,project_id,registration_revision,deployment_revision,frontend_bundle_digest,policy_id,test_run_id,marker,customer,email,slot,party_size,idempotency_key,created_at,expires_at${config.expanded?",protocol,validation_profile":""})
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?${config.expanded?",?,?":""})`).bind(id,namespace(config,input.testRunId),config.manifestNamespace,config.projectId,config.registrationRevision,config.deploymentRevision,config.frontendBundleDigest,config.policyId,
        input.testRunId,input.marker,input.customer,input.email,input.slot,input.partySize,key,at,expires,...(config.expanded?[config.protocol,config.validationProfile]:[])).run();
    }catch(error){
      const message=error instanceof Error?error.message:"";
      if(!message.includes("seller_capacity_party_exceeded")&&!message.includes("seller_slot_capacity_exceeded"))throw error;
      const raced=await existing(config,input.testRunId,key,at);if(raced)return replay(raced,input);
      return message.includes("seller_capacity_party_exceeded")?reply({code:"party_size_exceeded"},422):reply({code:"slot_capacity_exceeded"},409);
    }
    if(inserted.success===false||![0,1].includes(inserted.meta?.changes))throw new Error("capacity_insert_unavailable");
    const row=await existing(config,input.testRunId,key,at);if(!row)return reply({code:"staging_capacity_reached"},503);
    if(!same(row,input))return reply({code:"idempotency_conflict"},409);
    return reply(receipt(row),inserted.meta.changes===1?201:200);
  }catch(error){
    if(error instanceof InputError)return reply({code:error.code},error.status);
    if(error instanceof ConfigurationError)return reply({code:"configuration_unavailable"},503);
    return reply({code:"storage_unavailable"},503);
  }
}
