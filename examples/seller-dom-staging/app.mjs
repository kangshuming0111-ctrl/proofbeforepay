import {config} from "./config.mjs";
import {installSellerBridge} from "./bridge.mjs";
import {createSellerDomExecutor} from "./seller-dom-adapter.mjs";

const $=selector=>document.querySelector(selector),params=new URLSearchParams(location.search),runId=params.get("run")??"";
const validRun=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(runId)&&params.getAll("run").length===1&&[...params.keys()].every(k=>k==="run");
const update=$("#reservation-update"),saved=new Map(),purposeActions={"cancel-create":"create","cancel-five":"rebook","cancel-three":"fill","cancel-extra":"reject_extra","source-create":"source_create","loss-create":"response_loss_create"};
let busy=false,waiting,manualSequence=0,pending;
function lock(value){busy=value;for(const el of document.querySelectorAll("form input,form select,form button,[name=saved-reservation]"))el.disabled=value||!validRun;for(const el of document.querySelectorAll("[data-move-form] button,[data-cancel-form] button"))el.disabled=value||!validRun||saved.size===0;$("#retry").disabled=value||!validRun||!pending;$("#roster").disabled=value||!validRun;}
function remember(row){if(!row||typeof row.id!=="string")return;saved.set(row.id,row);const select=$("[name=saved-reservation]"),prior=select.value;select.replaceChildren();for(const item of saved.values()){const option=document.createElement("option");option.value=item.id;option.textContent=`${item.partySize} guests, ${item.slot.slice(11,16)}, ${item.status}`;select.append(option);}select.value=saved.has(prior)?prior:row.id;}
async function post(path,body,key){
 const trace={method:"POST",path:config.backendBasePath+path,key,request:structuredClone(body)};
 try{const response=await fetch(trace.path,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(body),credentials:"omit",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});trace.status=response.status;
  if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("non_json_response");const reader=response.body?.getReader();if(!reader)throw new Error("missing_response");const chunks=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();throw new Error("response_too_large");}chunks.push(part.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}trace.response=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 }catch(error){trace.error=error?.name==="TimeoutError"?"request_timeout":"network_or_response_unavailable";}return trace;
}
async function nativeSubmit(actionId,path,body,key){
 if(busy||!validRun)return;
 const observer=waiting;if(observer&&observer.command.actionId!==actionId){observer.reject(new Error("native_action_identity_changed"));return;}
 const sequence=observer?.command.sequence??++manualSequence;lock(true);update.textContent="Sending reservation…";update.dataset.status="unknown";
 try{
  const trace=await post(path,body,key),success=trace.status>=200&&trace.status<300&&!trace.error,unknown=trace.status===undefined||trace.status===504||!!trace.error;
  if(success)remember(trace.response);if(path==="bookings")pending=unknown?{path,body:structuredClone(body),key}:undefined;
  update.textContent=success?`Saved. Your reservation is ${trace.response.status}, for ${trace.response.partySize} guests at ${trace.response.slot.slice(11,16)}.`:unknown?"The response was lost. The reservation may already be saved; read the saved reservations before retrying.":`Reservation not accepted (${trace.response?.code??trace.status}).`;
  update.dataset.status=success?"success":unknown?"unknown":"error";update.dataset.pbpSequence=String(sequence);
  const completion={sequence,actionId,requests:[trace],...(success?{receipt:trace.response}:{})};$("#journal").textContent=JSON.stringify(completion,null,2);observer?.resolve(completion);
 }catch{observer?.reject(new Error("native_completion_unavailable_external_outcome_unknown"));update.textContent="The saved outcome is unknown. Do not submit again before reading the saved reservations.";update.dataset.status="unknown";update.dataset.pbpSequence=String(sequence);}
 finally{if(waiting===observer)waiting=undefined;lock(false);}
}
const marker=()=>({testRunId:runId,marker:`PBP-${runId}`}),key=suffix=>`pbp-${runId}-lifecycle-${suffix}`;
$("[data-booking-form]").addEventListener("submit",event=>{event.preventDefault();const suffix=$("[name=create-purpose]").value;void nativeSubmit(purposeActions[suffix],"bookings",{...marker(),customer:"PBP synthetic",email:"pbp-test@example.invalid",partySize:Number($("[name=guests]").value),slot:$("[name=arrival]").value},key(suffix));});
$("[data-cancel-form]").addEventListener("submit",event=>{event.preventDefault();const suffix=$("[name=cancel-purpose]").value,id=$("[name=saved-reservation]").value;if(!id)return;void nativeSubmit(suffix==="cancel-first"?"cancel":"cancel_repeat",`bookings/${id}/cancel`,marker(),key(suffix));});
$("[data-move-form]").addEventListener("submit",event=>{event.preventDefault();const suffix=$("[name=move-purpose]").value,id=$("[name=saved-reservation]").value;if(!id)return;void nativeSubmit(suffix==="move-full"?"move_full":"move_free",`bookings/${id}/move`,{...marker(),slot:$("[name=new-arrival]").value},key(suffix));});
$("#retry").addEventListener("click",()=>{if(pending){const original=structuredClone(pending);void nativeSubmit("response_loss_retry",original.path,original.body,original.key);}});
$("#fresh").addEventListener("click",()=>{location.href=location.pathname+"?run="+crypto.randomUUID();});
$("#roster").addEventListener("click",async()=>{if(busy||!validRun)return;lock(true);const target=$("#saved-rows");target.textContent="Reading saved reservations…";try{const response=await fetch(config.backendBasePath+"merchant/"+runId,{credentials:"omit",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});const body=await response.json();if(!response.ok||!Array.isArray(body.bookings)||body.bookings.length>24)throw new Error();target.replaceChildren();if(!body.bookings.length)target.textContent="No reservation is saved in this session.";for(const row of body.bookings){remember(row);const p=document.createElement("p");p.textContent=`${row.partySize} guests · ${row.status} · ${row.id}`;target.append(p);}}catch{target.textContent="Saved reservations could not be read; the outcome remains unknown.";}finally{lock(false);}});

// Integration configuration is the ONLY part coupled to this page's DOM. A
// different framework can keep its existing forms/handlers and map selectors.
const executor=createSellerDomExecutor({document,runId:validRun?runId:"00000000-0000-4000-8000-000000000000",forms:{
 create:{partySize:"[name=guests]",slot:"[name=arrival]",requestOperation:"[name=create-purpose]",submit:"[data-booking-form] button[type=submit]"},
 cancel:{bookingId:"[name=saved-reservation]",requestOperation:"[name=cancel-purpose]",submit:"[data-cancel-form] button[type=submit]"},
 move:{bookingId:"[name=saved-reservation]",slot:"[name=new-arrival]",requestOperation:"[name=move-purpose]",submit:"[data-move-form] button[type=submit]"},retry:{submit:"#retry"}},result:"#reservation-update",
 beforeAction(){for(const details of document.querySelectorAll("form details"))details.open=true;},
 observe(command){if(waiting||busy)throw new Error("native_observation_busy");let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});const entry={command,resolve,reject};waiting=entry;return{promise,cancel(){if(waiting===entry)waiting=undefined;}};}
});
if(validRun)installSellerBridge({config,runId,execute:command=>executor.execute(command),onSession:()=>{$("#connection").textContent="Connected to this approved ProofBeforePay session.";}});
$("#connection").textContent=validRun?"Synthetic session ready. Use these forms manually, or connect an approved ProofBeforePay project.":"Start a fresh practice session to enable the forms.";lock(false);
window.addEventListener("pagehide",()=>executor.dispose(),{once:true});
