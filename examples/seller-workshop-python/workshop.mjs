import {workshopConfig as config} from "/config.mjs";

// A native workshop UI and a cooperative protocol adapter. No checker imported.
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),runId=params.get("run")??"";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const validRun=uuid.test(runId)&&params.getAll("run").length===1&&[...params.keys()].every(key=>key==="run");
const slots=["2099-01-01T10:00:00Z","2099-01-01T11:00:00Z","2099-01-01T12:00:00Z"],saved=new Map();
const purposeActions={"cancel-create":"create","cancel-five":"rebook","cancel-three":"fill","cancel-extra":"reject_extra","source-create":"source_create","loss-create":"response_loss_create"};
let busy=false,pending,actionWaiter;
function finishAction(waiter,error,observation){
 if(actionWaiter!==waiter)return;actionWaiter=undefined;clearTimeout(waiter.timer);
 if(error)waiter.reject(error);else waiter.resolve(observation);
}
function clickAndObserve(actionId,button){
 let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
 const waiter={actionId,started:false,resolve,reject,timer:undefined};actionWaiter=waiter;
 // Submission completion delivers the observation; this one-shot watchdog only
 // bounds a missing completion. No background-page polling timer is required.
 waiter.timer=setTimeout(()=>finishAction(waiter,new Error("workshop_action_timeout_unknown")),10000);
 try{button.click();if(!waiter.started)finishAction(waiter,new Error("workshop_submit_not_started"));}
 catch{finishAction(waiter,new Error("workshop_submit_not_started"));}
 return promise;
}
function tab(name){for(const button of document.querySelectorAll("[data-panel]"))button.setAttribute("aria-selected",String(button.dataset.panel===name));for(const panel of document.querySelectorAll(".panel"))panel.hidden=panel.id!==`panel-${name}`;}
for(const button of document.querySelectorAll("[data-panel]"))button.addEventListener("click",()=>tab(button.dataset.panel));
$("new-session").addEventListener("click",()=>{location.href=`/workshop.html?run=${crypto.randomUUID()}`;});
function lock(value){busy=value;for(const control of document.querySelectorAll(".panel input,.panel select,.panel button"))control.disabled=value||!validRun;$("retry-original").disabled=value||!validRun||!pending;}
function remember(value){
 if(!value||typeof value.id!=="string")return;saved.set(value.id,value);const select=$("enrolment-choice"),previous=select.value;select.replaceChildren();
 for(const row of saved.values()){const option=document.createElement("option");option.value=row.id;option.textContent=`${row.partySize} people · ${row.slot.slice(11,16)} · ${row.status} · ${row.id.slice(-6)}`;select.append(option);}
 select.value=saved.has(previous)?previous:value.id;
}
async function post(path,body,key){
 const trace={method:"POST",path:config.backendBasePath+path,key,request:structuredClone(body)};
 try{const response=await fetch(trace.path,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(body),credentials:"omit",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});trace.status=response.status;
  if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("non_json_response");
  const reader=response.body?.getReader();if(!reader)throw new Error("missing_response");const chunks=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384){await reader.cancel();throw new Error("response_too_large");}chunks.push(next.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}trace.response=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 }catch(error){trace.error=error?.name==="TimeoutError"?"request_timeout":"network_or_response_unavailable";}
 return trace;
}
async function submit(actionId,fields,body,path,key){
 if(busy||!validRun)return;
 const waiter=actionWaiter;if(waiter&&(waiter.started||waiter.actionId!==actionId)){finishAction(waiter,new Error("workshop_action_changed"));return;}
 if(waiter)waiter.started=true;
 let observation,failure;lock(true);$("booking-result").textContent="Sending your workshop request…";
 try{
  // Deliberately broken, startup-only developer profile. The native database
  // handler is unchanged. An independent browser witness should contradict
  // this visible success using the still-empty merchant and occupancy reads.
  // No request/query parameter can activate this profile on a normal server.
  if(config.browserMode==="no-save"&&fields.operation==="create"){
   const message=`Saved. Your booking is active, for ${body.partySize} people at ${body.slot.slice(11,16)}.`;
   observation={ui:{actionId,status:"success",message,fields},requests:[]};
   $("booking-result").textContent=message;$("booking-result").dataset.status="success";
   $("request-details").textContent=JSON.stringify(observation,null,2);return;
  }
  const trace=await post(path,body,key),success=trace.status>=200&&trace.status<300&&!trace.error,unknown=trace.status===504||trace.status===undefined||!!trace.error;
  if(success)remember(trace.response);
  if(fields.operation==="create")pending=unknown?{body:structuredClone(body),key}:undefined;
  const status=success?"success":unknown?"unknown":"error",message=success?`Saved. Your booking is ${trace.response.status}, for ${trace.response.partySize} people at ${trace.response.slot.slice(11,16)}.`:unknown?"The response was lost. Your places may already be saved; check the roster before retrying.":trace.response?.code==="slot_capacity_exceeded"?"That workshop is full. Check your saved booking before choosing another workshop.":`This request was not accepted (${trace.response?.code??trace.status??"unknown"}).`;
  observation={ui:{actionId,status,message,fields,...(success?{receipt:trace.response}:{})},requests:[trace]};
  $("booking-result").textContent=message;$("booking-result").dataset.status=status;$("request-details").textContent=JSON.stringify(observation,null,2);$("recovery-note").hidden=!pending;
  observation=structuredClone(observation);
 }catch{failure=new Error("workshop_observation_unavailable_external_outcome_unknown");$("booking-result").textContent="The action may have been sent. Read the saved roster before deciding what to do next.";}
 finally{lock(false);if(waiter)finishAction(waiter,failure,observation);}
}
const marker=()=>({testRunId:runId,marker:`PBP-${runId}`}),key=suffix=>`pbp-${runId}-lifecycle-${suffix}`;
$("enrol-form").addEventListener("submit",event=>{event.preventDefault();const op=$("enrol-purpose").value,slot=$("session-choice").value,partySize=$("seat-count").value;void submit(purposeActions[op],{operation:"create",requestOperation:op,slot,partySize},{...marker(),customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize:Number(partySize)},"bookings",key(op));});
$("withdraw-form").addEventListener("submit",event=>{event.preventDefault();const op=$("withdraw-purpose").value,id=$("enrolment-choice").value;void submit(op==="cancel-first"?"cancel":"cancel_repeat",{operation:"cancel",requestOperation:op,bookingId:id},marker(),`bookings/${id}/cancel`,key(op));});
$("transfer-form").addEventListener("submit",event=>{event.preventDefault();const op=$("transfer-purpose").value,id=$("enrolment-choice").value,slot=$("transfer-session").value;void submit(op==="move-full"?"move_full":"move_free",{operation:"move",requestOperation:op,bookingId:id,slot},{...marker(),slot},`bookings/${id}/move`,key(op));});
$("retry-original").addEventListener("click",()=>{if(!pending)return;const original=structuredClone(pending);void submit("response_loss_retry",{operation:"create",requestOperation:"loss-create",slot:original.body.slot,partySize:String(original.body.partySize)},original.body,"bookings",original.key);});
$("read-roster").addEventListener("click",async()=>{
 if(busy||!validRun)return;lock(true);const output=$("roster-results");output.textContent="Reading saved bookings…";
 try{const response=await fetch(`${config.backendBasePath}merchant/${runId}`,{credentials:"omit",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error();const body=await response.json();if(!Array.isArray(body.bookings)||body.bookings.length>24)throw new Error();output.replaceChildren();if(!body.bookings.length)output.textContent="No bookings are saved in this practice session.";
  for(const row of body.bookings){remember(row);const item=document.createElement("p");item.className="roster-row";const title=document.createElement("strong");title.textContent=`${row.partySize} people · ${row.slot.slice(11,16)} · ${row.status}`;item.append(title,document.createTextNode(row.id));output.append(item);}
 }catch{output.textContent="The roster could not be read. The saved outcome is still unknown.";}finally{lock(false);}
});
function fill(id,value){const element=$(id);element.value=value;element.dispatchEvent(new Event("input",{bubbles:true}));element.dispatchEvent(new Event("change",{bubbles:true}));if(element.value!==value)throw new Error("workshop_control_unavailable");}
async function perform(command){
 if(busy||actionWaiter)throw new Error("workshop_action_unavailable");const {actionId,action}=command;let button;
 if(action.type==="create"){tab("join");fill("enrol-purpose",action.requestOperation);fill("seat-count",String(action.partySize));fill("session-choice",action.slot);button=$("enrol-submit");}
 else if(action.type==="cancel"){tab("manage");fill("enrolment-choice",action.bookingId);fill("withdraw-purpose",action.requestOperation);button=$("withdraw-submit");}
 else if(action.type==="move"){tab("manage");fill("enrolment-choice",action.bookingId);fill("transfer-purpose",action.requestOperation);fill("transfer-session",action.slot);button=$("transfer-submit");}
 else button=$("retry-original");
 if(button.disabled)throw new Error("workshop_action_unavailable");
 if(button.form&&!button.form.checkValidity())throw new Error("workshop_native_validation_failed");
 return clickAndObserve(actionId,button);
}

// Independent, bounded cooperative bridge. This observes real native controls,
// but its client declarations do not attest browser or deployment authenticity.
const protocol="pbp-seller-bridge-v1",operations={create:["create","cancel-create"],cancel:["cancel","cancel-first"],rebook:["create","cancel-five"],fill:["create","cancel-three"],cancel_repeat:["cancel","cancel-repeat"],reject_extra:["create","cancel-extra"],source_create:["create","source-create"],move_full:["move","move-full"],move_free:["move","move-free"],response_loss_create:["create","loss-create"],response_loss_retry:["retry-original"]};
const plain=value=>value!==null&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(name=>Object.hasOwn(value,name));
function validCommand(data){
 if(!exact(data,["protocol","type","sessionNonce","runId","sequence","actionId","action"])||!Object.hasOwn(operations,data.actionId)||!Number.isInteger(data.sequence)||data.sequence<1||data.sequence>11)return false;
 const action=data.action,expected=operations[data.actionId];if(!plain(action)||action.type!==expected[0])return false;
 if(action.type==="retry-original")return exact(action,["type"]);
 if(action.requestOperation!==expected[1])return false;
 if(action.type==="create")return exact(action,["type","requestOperation","partySize","slot"])&&Number.isInteger(action.partySize)&&action.partySize>=1&&action.partySize<=6&&slots.includes(action.slot);
 if(typeof action.bookingId!=="string"||!/^enr_[a-f0-9]{32}$/u.test(action.bookingId))return false;
 return action.type==="cancel"?exact(action,["type","requestOperation","bookingId"]):exact(action,["type","requestOperation","bookingId","slot"])&&slots.includes(action.slot);
}
let bridgeSession,bridgeOrigin,bridgeSequence=0,bridgeBusy=false,bridgeClosed=false;
window.addEventListener("message",async event=>{
 if(!validRun||bridgeClosed||event.source!==window.parent||event.source===window||event.origin===location.origin||!config.allowedParentOrigins.includes(event.origin))return;
 const data=event.data;if(!plain(data)||data.protocol!==protocol||data.runId!==runId||typeof data.sessionNonce!=="string"||!/^[a-f0-9]{64}$/u.test(data.sessionNonce))return;
 try{if(new TextEncoder().encode(JSON.stringify(data)).length>4096)return;}catch{return;}
 if(data.type==="init"){
  if(bridgeSession||!exact(data,["protocol","type","sessionNonce","runId","sequence"])||data.sequence!==0)return;
  bridgeSession=data.sessionNonce;bridgeOrigin=event.origin;$("connection-status").textContent="Connected to this project’s fictional workshop exercise.";
  window.parent.postMessage({protocol,type:"ready",sessionNonce:bridgeSession,runId,sequence:0,frontendRevision:config.frontendRevision,backendBasePath:config.backendBasePath,syntheticOnly:true,deploymentAttestation:false},bridgeOrigin);return;
 }
 if(data.type!=="execute"||!bridgeSession||data.sessionNonce!==bridgeSession||event.origin!==bridgeOrigin||bridgeBusy||data.sequence!==bridgeSequence+1||!validCommand(data))return;
 bridgeBusy=true;
 try{const result=await perform({sequence:data.sequence,actionId:data.actionId,action:structuredClone(data.action)});bridgeSequence=data.sequence;window.parent.postMessage({protocol,type:"observation",sessionNonce:bridgeSession,runId,sequence:bridgeSequence,actionId:data.actionId,...result},bridgeOrigin);}
 catch{bridgeClosed=true;}finally{bridgeBusy=false;}
});
if(validRun)$("connection-status").textContent="Fictional workshop session ready. Book, move or cancel using the forms below.";
lock(false);
