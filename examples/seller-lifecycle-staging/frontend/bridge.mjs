/** Standalone cooperative adapter. No checker/evaluator code is imported.
 * The seller controls these observations; they are not independent attestation. */
const PROTOCOL="pbp-seller-bridge-v1",UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u,NONCE=/^[a-f0-9]{64}$/u;
const actions={create:["create","cancel-create"],cancel:["cancel","cancel-first"],rebook:["create","cancel-five"],fill:["create","cancel-three"],cancel_repeat:["cancel","cancel-repeat"],reject_extra:["create","cancel-extra"],source_create:["create","source-create"],move_full:["move","move-full"],move_free:["move","move-free"],response_loss_create:["create","loss-create"],response_loss_retry:["retry-original"]};
const slots=["2099-01-01T10:00:00Z","2099-01-01T11:00:00Z","2099-01-01T12:00:00Z"];
const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
function commandValid(data){
 if(!exact(data,["protocol","type","sessionNonce","runId","sequence","actionId","action"])||!Object.hasOwn(actions,data.actionId)||!Number.isInteger(data.sequence)||data.sequence<1||data.sequence>11)return false;
 const a=data.action,definition=actions[data.actionId];if(!object(a)||a.type!==definition[0])return false;
 if(a.type==="retry-original")return exact(a,["type"]);
 if(a.requestOperation!==definition[1])return false;
 if(a.type==="create")return exact(a,["type","requestOperation","partySize","slot"])&&Number.isInteger(a.partySize)&&a.partySize>=1&&a.partySize<=6&&slots.includes(a.slot);
 if(typeof a.bookingId!=="string"||!/^[-A-Za-z0-9_]{1,100}$/u.test(a.bookingId))return false;
 return a.type==="cancel"?exact(a,["type","requestOperation","bookingId"]):exact(a,["type","requestOperation","bookingId","slot"])&&slots.includes(a.slot);
}
export function installSellerBridge({config,runId,execute,onSession=()=>{},host=window}){
 let session,parentOrigin,sequence=0,busy=false,closed=false;
 const send=message=>host.parent.postMessage(message,parentOrigin);
 const listener=async event=>{
  const loopback=/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/u.exec(event.origin);
  const approvedParent=config.allowedParentOrigins.includes(event.origin)||config.allowLoopbackParent===true&&!!loopback&&Number(loopback[1])<=65535;
  if(closed||event.source!==host.parent||!approvedParent||event.origin===host.location.origin)return;
  const d=event.data;if(!object(d)||d.protocol!==PROTOCOL||d.runId!==runId||!UUID.test(d.runId)||typeof d.sessionNonce!=="string"||!NONCE.test(d.sessionNonce))return;
  try{if(new TextEncoder().encode(JSON.stringify(d)).byteLength>4096)return;}catch{return;}
  if(d.type==="init"){
   if(session||!exact(d,["protocol","type","sessionNonce","runId","sequence"])||d.sequence!==0)return;
   session=d.sessionNonce;parentOrigin=event.origin;onSession?.();send({protocol:PROTOCOL,type:"ready",sessionNonce:session,runId,sequence:0,frontendRevision:config.frontendRevision,backendBasePath:config.backendBasePath,syntheticOnly:true,deploymentAttestation:false});return;
  }
  if(!session||d.sessionNonce!==session||event.origin!==parentOrigin||d.type!=="execute"||busy||d.sequence!==sequence+1||!commandValid(d))return;
  busy=true;
  try{
   const result=await execute({sequence:d.sequence,actionId:d.actionId,action:structuredClone(d.action)});
   if(closed)return;sequence=d.sequence;send({protocol:PROTOCOL,type:"observation",sessionNonce:session,runId,sequence,actionId:d.actionId,ui:result.ui,requests:result.requests});
  }catch{
   // Executed writes are never automatically retried after an unknown outcome.
   closed=true;
  }finally{busy=false;}
 };
 host.addEventListener("message",listener);return()=>{closed=true;host.removeEventListener("message",listener);};
}
