import "./journey.css";

// This is a trusted, fixed fictional website. No uploaded seller script runs.
const scenarios=["fixed","cancel-credit","move-loss","retry-duplicate","fake-success","wrong-party"] as const;
type Scenario=typeof scenarios[number];
const query=new URLSearchParams(location.search),runId=query.get("run")??"",scenario=query.get("scenario")??"fixed",language=query.get("lang")==="en"?"en":"zh";
const tr=(zh:string,en:string)=>language==="zh"?zh:en;
const app=document.querySelector<HTMLDivElement>("#fixture-app")!;
const validRun=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(runId);
const selected=scenarios.includes(scenario as Scenario)?scenario as Scenario:"fixed";
const backend=selected==="fake-success"||selected==="wrong-party"?"fixed":selected;
const base=`/journey-api/${backend}/pbp/`,slots={a:"2099-01-01T10:00:00Z",b:"2099-01-01T11:00:00Z",c:"2099-01-01T12:00:00Z"};
type Receipt={id:string;slot:string;partySize:number;status:string;idempotencyKey:string;[key:string]:unknown};
type Trace={method:string;path:string;key?:string;status?:number;request?:unknown;response?:unknown;error?:string};
type ActionRecord={actionId:string;status:"success"|"error"|"unknown";message:string;fields:Record<string,string>;receipt?:unknown;requests:Trace[]};
let sequence=0,busy=false,pending:{body:Record<string,unknown>;key:string}|undefined;
const receipts=new Map<string,Receipt>();
function append(parent:Node,...children:Node[]){for(const child of children)parent.appendChild(child);}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K]{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function label(text:string,control:Node){const l=el("label");append(l,el("span",text),control);return l;}
function select(id:string,options:[string,string][]){const s=el("select");s.id=id;for(const[value,text]of options){const o=el("option",text);o.value=value;append(s,o);}return s;}
function submit(text:string,id:string){const b=el("button",text,"primary");b.type="submit";b.id=id;return b;}
function textButton(text:string,id:string){const b=el("button",text);b.type="button";b.id=id;return b;}
function row(){return el("div",undefined,"form-grid");}
function form(id:string,title:string){const f=el("form",undefined,"fixture-form");f.id=id;append(f,el("h2",title));return f;}
function field(id:string,value=""){const i=el("input");i.id=id;i.value=value;return i;}
function isReceipt(value:unknown):value is Receipt{return !!value&&typeof value==="object"&&!Array.isArray(value)&&typeof(value as Receipt).id==="string"&&/^[a-f0-9-]{36}$/u.test((value as Receipt).id)&&typeof(value as Receipt).partySize==="number";}
function remember(value:unknown){if(isReceipt(value)){receipts.set(value.id,value);syncReceiptOptions();}}
async function request(method:string,path:string,requestBody?:unknown,key?:string):Promise<{trace:Trace;status?:number;body?:unknown}>{
  const trace:Trace={method,path:base+path,...(key?{key}:{}),...(requestBody===undefined?{}:{request:structuredClone(requestBody)})};
  try{
    const response=await fetch(base+path,{method,headers:{Accept:"application/json",...(requestBody===undefined?{}:{"Content-Type":"application/json"}),...(key?{"Idempotency-Key":key}:{})},...(requestBody===undefined?{}:{body:JSON.stringify(requestBody)}),credentials:"omit",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
    trace.status=response.status;
    if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("non_json_response");
    const reader=response.body?.getReader();if(!reader)throw new Error("missing_response");let size=0;const parts:Uint8Array[]=[];
    try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>16384){await reader.cancel();throw new Error("response_too_large");}parts.push(p.value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
    const body:unknown=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));trace.response=body;return{trace,status:response.status,body};
  }catch(error){trace.error=error instanceof Error?error.name==="TimeoutError"?"request_timeout":error.message:"network_unavailable";return{trace};}
}
const shell=el("main",undefined,"fixture-shell"),heading=el("header",undefined,"fixture-heading");
append(heading,el("h1",tr("面馆预约测试网站","Fictional noodle-shop booking")),el("p",tr("这是一份固定、可操作的实验交付。不是上传文件预览，也不是实际卖家部署。","This is a fixed interactive lab delivery, separate from uploaded-file preview and actual seller deployments.")));
append(shell,heading);
const rules=el("div",undefined,"fixture-rule");append(rules,el("span",tr("每笔最多6人","Maximum6 per booking")),el("span",tr("每时段合计最多8人","Capacity8 per slot")),el("span",tr("仅2099年虚构时段","Fictional2099 slots only")));append(shell,rules);
const status=el("div",tr("等待本次真实表单操作。","Waiting for a real form action."),"fixture-result");status.id="fixture-status";status.setAttribute("role","status");status.dataset.status="unknown";
const create=form("create-form",tr("创建预约","Create a booking")),createGrid=row();
const operation=select("create-key",[["cancel-create",tr("首次5人预约","Initial5 guests")],["cancel-five",tr("取消后重新预约5人","Rebook5 after cancellation")],["cancel-three",tr("补入3人","Fill3 guests")],["cancel-extra",tr("满额后新增1人","One guest above capacity")],["source-create",tr("B时段预约2人","Create2 in slot B")],["loss-create",tr("已提交但响应失败的1人预约","One guest with a committed response failure")]]);
const createSlot=select("create-slot",Object.entries(slots).map(([k,v])=>[v,`${k.toUpperCase()} · ${v}`])),party=field("create-party","5");party.type="number";party.min="1";party.max="6";party.step="1";
append(createGrid,label(tr("测试操作","Test operation"),operation),label(tr("时间段","Slot"),createSlot),label(tr("预约人数","Party size"),party),submit(tr("提交预约","Submit booking"),"create-submit"));append(create,createGrid);
const cancel=form("cancel-form",tr("取消预约","Cancel a booking")),cancelGrid=row(),cancelReceipt=select("cancel-id",[["",tr("先创建一笔预约","Create a booking first")]]),cancelKey=select("cancel-key",[["cancel-first",tr("首次取消","First cancellation")],["cancel-repeat",tr("再次取消同一笔","Repeat the same cancellation")]]);
append(cancelGrid,label(tr("预约编号","Booking ID"),cancelReceipt),label(tr("取消操作","Cancellation operation"),cancelKey),submit(tr("取消这笔预约","Cancel this booking"),"cancel-submit"));append(cancel,cancelGrid);
const move=form("move-form",tr("修改预约时段","Move a booking")),moveGrid=row(),moveReceipt=select("move-id",[["",tr("先创建一笔预约","Create a booking first")]]),moveSlot=select("move-slot",Object.entries(slots).map(([k,v])=>[v,`${k.toUpperCase()} · ${v}`])),moveKey=select("move-key",[["move-full",tr("移到已满时段","Move into a full slot")],["move-free",tr("移到空闲时段","Move into a free slot")]]);
append(moveGrid,label(tr("预约编号","Booking ID"),moveReceipt),label(tr("目标时间段","Destination slot"),moveSlot),label(tr("改期操作","Move operation"),moveKey),submit(tr("提交改期","Move this booking"),"move-submit"));append(move,moveGrid);
const retry=textButton(tr("用原请求编号重试","Retry the original request"),"retry-submit");retry.disabled=true;
const retryNote=el("p",tr("响应失败不能证明没有写入。重试会保留原来的请求编号和表单数据。","A failed response does not establish that no booking was stored. Retry retains the original request key and form data."),"journal-note");
const details=el("details",undefined,"fixture-technical"),record=el("pre","{}");record.id="operation-record";append(details,el("summary",tr("查看本次表单请求记录","Inspect this form action’s request record")),record);
const session=el("p",`${tr("虚构运行","Fictional run")}: ${runId} · ${tr("声明的后端","Declared backend")}: ${backend}`,"fixture-technical");
append(shell,create,cancel,move,status,retry,retryNote,details,session);append(app,shell);
function syncReceiptOptions(){for(const control of[cancelReceipt,moveReceipt]){const selectedValue=control.value;control.replaceChildren();for(const receipt of receipts.values()){const option=el("option",`${receipt.id.slice(0,8)}… · ${receipt.partySize} · ${receipt.status}`);option.value=receipt.id;append(control,option);}if(receipts.has(selectedValue))control.value=selectedValue;else if(control.options.length)control.value=control.options[control.options.length-1].value;}}
function setBusy(value:boolean){busy=value;document.body.dataset.busy=String(value);for(const control of Array.from(document.querySelectorAll("input,select,button")) as unknown as Array<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>)control.disabled=value;retry.disabled=value||!pending;}
async function perform(actionId:string,fields:Record<string,string>,execute:()=>Promise<ActionRecord>){
  if(busy||!validRun)return;setBusy(true);status.textContent=tr("正在发送表单请求…","Sending the form request…");
  let result:ActionRecord;try{result=await execute();}catch{result={actionId,status:"unknown",message:tr("操作没有取得完整结果；请独立核查记录。","The action has no complete result. Independently inspect the stored records."),fields,requests:[]};}
  result.actionId=actionId;result.fields=fields;sequence++;record.textContent=JSON.stringify(result,null,2);status.textContent=result.message;status.dataset.status=result.status;document.body.dataset.sequence=String(sequence);setBusy(false);
}
function responseRecord(actionId:string,fields:Record<string,string>,result:{trace:Trace;status?:number;body?:unknown}):ActionRecord{
  const ok=result.status!==undefined&&result.status>=200&&result.status<300;
  if(ok)remember(result.body);
  const unknown=result.status===undefined||result.status===504;
  const code=result.body&&typeof result.body==="object"&&"code"in result.body?String((result.body as{code:unknown}).code):"";
  return{actionId,status:ok?"success":unknown?"unknown":"error",message:ok?`${tr("操作已返回成功","Action returned success")} · HTTP ${result.status}${isReceipt(result.body)?` · ${result.body.id}`:""}`:unknown?tr("未取得成功响应，是否写入仍需独立查询。","No successful response was received; storage must be checked independently."):`${tr("操作被拒绝","Action rejected")} · HTTP ${result.status} · ${code}`,fields,...(isReceipt(result.body)?{receipt:result.body}:{}),requests:[result.trace]};
}
create.addEventListener("submit",event=>{event.preventDefault();const actionId=({"cancel-create":"create","cancel-five":"rebook","cancel-three":"fill","cancel-extra":"reject_extra","source-create":"source_create","loss-create":"response_loss_create"} as Record<string,string>)[operation.value],fields={operation:"create",requestOperation:operation.value,slot:createSlot.value,partySize:party.value},key=`pbp-${runId}-lifecycle-${operation.value}`;
  void perform(actionId,fields,async()=>{
    const body={testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:createSlot.value,partySize:Number(party.value)};
    if(selected==="fake-success"&&operation.value==="cancel-create"){
      const fake={...body,id:crypto.randomUUID(),status:"active",revision:"lifecycle-fixed-v1",idempotencyKey:key};remember(fake);return{actionId:"create",status:"success",message:tr("页面显示预约成功，但本缺陷没有发出请求。","The page displays success, but this controlled defect sent no request."),fields,receipt:fake,requests:[]};
    }
    if(selected==="wrong-party"&&operation.value==="cancel-create")body.partySize=1;
    const result=await request("POST","bookings",body,key);
    if(result.status===504||result.status===undefined)pending={body:structuredClone(body),key};
    else pending=undefined;
    return responseRecord("create",fields,result);
  });
});
cancel.addEventListener("submit",event=>{event.preventDefault();const fields={bookingId:cancelReceipt.value,operation:"cancel",requestOperation:cancelKey.value,partySize:String(receipts.get(cancelReceipt.value)?.partySize??""),slot:String(receipts.get(cancelReceipt.value)?.slot??"")};void perform(cancelKey.value==="cancel-repeat"?"cancel_repeat":"cancel",fields,async()=>responseRecord("cancel",fields,await request("POST",`bookings/${encodeURIComponent(cancelReceipt.value)}/cancel`,{testRunId:runId,marker:`PBP-${runId}`},`pbp-${runId}-lifecycle-${cancelKey.value}`)));});
move.addEventListener("submit",event=>{event.preventDefault();const fields={bookingId:moveReceipt.value,slot:moveSlot.value,operation:"move",requestOperation:moveKey.value,partySize:String(receipts.get(moveReceipt.value)?.partySize??"")};void perform(moveKey.value==="move-full"?"move_full":"move_free",fields,async()=>responseRecord("move",fields,await request("POST",`bookings/${encodeURIComponent(moveReceipt.value)}/move`,{testRunId:runId,marker:`PBP-${runId}`,slot:moveSlot.value},`pbp-${runId}-lifecycle-${moveKey.value}`)));});
retry.addEventListener("click",()=>{if(!pending)return;const original=structuredClone(pending),fields={operation:"create",requestOperation:"loss-create",slot:String(original.body.slot),partySize:String(original.body.partySize)};void perform("response_loss_retry",fields,async()=>{const result=await request("POST","bookings",original.body,original.key);if(result.status!==undefined&&result.status>=200&&result.status<300)pending=undefined;return responseRecord("retry",fields,result);});});
if(!validRun||!scenarios.includes(scenario as Scenario)){status.textContent=tr("请从流程检验页面创建一个新的虚构测试。","Start a fresh fictional run from the journey verification page.");setBusy(true);document.body.dataset.ready="invalid";}else{document.body.dataset.ready="true";document.body.dataset.sequence="0";document.body.dataset.busy="false";document.documentElement.lang=language==="zh"?"zh-CN":"en";}
