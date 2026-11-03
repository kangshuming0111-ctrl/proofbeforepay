import {sellerConfig as config} from "./config.mjs";
import {installSellerBridge} from "./bridge.mjs";
const runId=new URLSearchParams(location.search).get("run")??"",validRun=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(runId),receipts=new Map();
const $=id=>document.getElementById(id),result=$("result"),record=$("operation-record"),retry=$("retry-submit");
let busy=false,sessionStarted=false,pending,actionWaiter;
const setBusy=value=>{busy=value;document.body.dataset.busy=String(value);for(const control of document.querySelectorAll("input,select,button"))control.disabled=value||!sessionStarted;retry.disabled=value||!pending||!sessionStarted;};
function finishAction(waiter,error,observation){
 if(actionWaiter!==waiter)return;actionWaiter=undefined;clearTimeout(waiter.timer);
 if(error)waiter.reject(error);else waiter.resolve(observation);
}
function clickAndObserve(actionId,button){
 let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
 const waiter={actionId,started:false,resolve,reject,timer:undefined};actionWaiter=waiter;
 // One bounded fallback, never a completion poll. A finished form resolves
 // directly even when background-page timers have not been scheduled.
 waiter.timer=setTimeout(()=>finishAction(waiter,new Error("action_timeout_external_outcome_unknown")),10000);
 try{button.click();if(!waiter.started)finishAction(waiter,new Error("action_submit_not_started"));}
 catch{finishAction(waiter,new Error("action_submit_not_started"));}
 return promise;
}
function remember(receipt){if(!receipt||typeof receipt.id!=="string")return;receipts.set(receipt.id,receipt);for(const id of["cancel-id","move-id"]){const select=$(id),old=select.value;select.replaceChildren();for(const value of receipts.values()){const option=document.createElement("option");option.value=value.id;option.textContent=`${value.id.slice(0,8)}… · ${value.partySize} guests · ${value.status}`;select.append(option);}if(receipts.has(old))select.value=old;else select.value=receipt.id;}}
async function request(path,body,key){
 const trace={method:"POST",path:config.backendBasePath+path,key,request:structuredClone(body)};
 try{
  const response=await fetch(trace.path,{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(body),credentials:"omit",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});trace.status=response.status;
  if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("non_json_response");
  const reader=response.body?.getReader();if(!reader)throw new Error("missing_response");const parts=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){await reader.cancel();throw new Error("response_too_large");}parts.push(part.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}trace.response=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 }catch(error){trace.error=error instanceof Error?error.name==="TimeoutError"?"request_timeout":error.message.slice(0,160):"network_unavailable";}
 return trace;
}
async function perform(actionId,fields,body,path,key){
 if(busy||!validRun||!sessionStarted)return;
 const waiter=actionWaiter;if(waiter&&(waiter.started||waiter.actionId!==actionId)){finishAction(waiter,new Error("action_identity_changed"));return;}
 if(waiter)waiter.started=true;
 let observation,failure;setBusy(true);result.textContent="Sending the booking request…";
 try{
  const trace=await request(path,body,key),success=trace.status>=200&&trace.status<300&&!trace.error,unknown=trace.status===undefined||trace.status===504||!!trace.error;
  if(success)remember(trace.response);
  if(fields.operation==="create"){if(unknown)pending={body:structuredClone(body),key};else pending=undefined;}
  const status=success?"success":unknown?"unknown":"error",message=success?`Booking action returned HTTP ${trace.status}. ${trace.response?.id??""}`:unknown?"The response does not establish whether the booking was stored. Check the separate readback.":`Booking action rejected: HTTP ${trace.status} · ${trace.response?.code??"unknown"}`;
  observation={ui:{actionId,status,message,fields,...(success&&trace.response?.id?{receipt:trace.response}:{})},requests:[trace]};record.textContent=JSON.stringify(observation,null,2);result.textContent=message;result.dataset.status=status;
  observation=structuredClone(observation);
 }catch{failure=new Error("action_observation_unavailable_external_outcome_unknown");result.textContent="The action may have been sent. Read the saved booking separately before deciding what to do next.";}
 finally{setBusy(false);if(waiter)finishAction(waiter,failure,observation);}
}
const createIds={"cancel-create":"create","cancel-five":"rebook","cancel-three":"fill","cancel-extra":"reject_extra","source-create":"source_create","loss-create":"response_loss_create"};
$("create-form").addEventListener("submit",event=>{event.preventDefault();const op=$("create-operation").value,fields={operation:"create",requestOperation:op,partySize:$("create-party").value,slot:$("create-slot").value},body={testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:fields.slot,partySize:Number(fields.partySize)};void perform(createIds[op],fields,body,"bookings",`pbp-${runId}-lifecycle-${op}`);});
$("cancel-form").addEventListener("submit",event=>{event.preventDefault();const op=$("cancel-operation").value,id=$("cancel-id").value;void perform(op==="cancel-first"?"cancel":"cancel_repeat",{operation:"cancel",requestOperation:op,bookingId:id},{testRunId:runId,marker:`PBP-${runId}`},`bookings/${encodeURIComponent(id)}/cancel`,`pbp-${runId}-lifecycle-${op}`);});
$("move-form").addEventListener("submit",event=>{event.preventDefault();const op=$("move-operation").value,id=$("move-id").value,slot=$("move-slot").value;void perform(op==="move-full"?"move_full":"move_free",{operation:"move",requestOperation:op,bookingId:id,slot},{testRunId:runId,marker:`PBP-${runId}`,slot},`bookings/${encodeURIComponent(id)}/move`,`pbp-${runId}-lifecycle-${op}`);});
retry.addEventListener("click",()=>{if(!pending)return;const original=structuredClone(pending);void perform("response_loss_retry",{operation:"create",requestOperation:"loss-create",partySize:String(original.body.partySize),slot:original.body.slot},original.body,"bookings",original.key);});
function fill(id,value){const control=$(id);control.value=value;control.dispatchEvent(new Event("input",{bubbles:true}));control.dispatchEvent(new Event("change",{bubbles:true}));if(control.value!==value)throw new Error("control_value_unavailable");}
async function execute({actionId,action}){
 if(busy||actionWaiter)throw new Error("action_unavailable");let button;
 if(action.type==="create"){fill("create-operation",action.requestOperation);fill("create-party",String(action.partySize));fill("create-slot",action.slot);button=$("create-submit");}
 else if(action.type==="cancel"){fill("cancel-operation",action.requestOperation);fill("cancel-id",action.bookingId);button=$("cancel-submit");}
 else if(action.type==="move"){fill("move-operation",action.requestOperation);fill("move-id",action.bookingId);fill("move-slot",action.slot);button=$("move-submit");}
 else button=retry;
 if(button.disabled)throw new Error("action_unavailable");
 if(button.form&&!button.form.checkValidity())throw new Error("action_native_validation_failed");
 return clickAndObserve(actionId,button);
}
setBusy(false);
if(validRun&&new URLSearchParams(location.search).getAll("run").length===1&&[...new URLSearchParams(location.search).keys()].every(key=>key==="run"))installSellerBridge({config,runId,execute,onSession:()=>{sessionStarted=true;$("bridge-status").textContent="Connected to this synthetic project run.";setBusy(false);}});
