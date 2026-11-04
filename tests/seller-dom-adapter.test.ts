import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createSellerDomExecutor} from "../public/sdk/seller-dom-adapter.mjs";
import type {DomCompletion} from "../public/sdk/seller-dom-adapter.mjs";
import {validateSellerBridgeObservation,type SellerBridgeCommand} from "../lib/seller-journey-bridge.ts";

const runId="12345678-1234-4234-8234-123456789abc",slot="2099-01-01T10:00:00Z";
const create=(sequence=1):SellerBridgeCommand=>({sequence,actionId:"create",action:{type:"create",requestOperation:"cancel-create",partySize:5,slot}});
class Control {
 tagName="INPUT";type="text";disabled=false;hidden=false;readOnly=false;internal="";dataset:Record<string,string>={};textContent="";events:string[]=[];onEvent?:()=>void;onClick=()=>{};form:undefined|{checkValidity():boolean};
 get value(){return this.internal;}set value(value:string){this.internal=value;}
 getClientRects(){return this.hidden?[]:[{}];}
 dispatchEvent(event:{type:string}){this.events.push(event.type);this.onEvent?.();return true;}
 click(){this.onClick();}
}
class Select extends Control { override tagName="SELECT"; override get value(){return this.internal;}override set value(value:string){this.internal=value;} }
class Textarea extends Control { override tagName="TEXTAREA"; override get value(){return this.internal;}override set value(value:string){this.internal=value;} }
class Button extends Control {override tagName="BUTTON";override type="submit";}
class LocalEvent {type:string;bubbles:boolean;constructor(type:string,{bubbles}:{bubbles:boolean}){this.type=type;this.bubbles=bubbles;}}
function fixture(timeoutMs=100){
 const nodes=new Map<string,Control[]>(),trace:string[]=[],inputs:Record<string,Control>={};
 const add=(selector:string,node:Control)=>{nodes.set(selector,[node]);return node;};
 for(const name of["party","slot","createOp","booking","cancelOp","moveOp","moveSlot"]){inputs[name]=add("#"+name,name==="party"?new Control():new Select());}
 const output=add("#result",new Control());output.tagName="OUTPUT";output.dataset={status:"unknown",pbpSequence:"0"};
 const buttons=Object.fromEntries(["create","cancel","move","retry"].map(kind=>[kind,add("#"+kind+"Button",new Button())]));
 const doc={querySelectorAll(selector:string){return nodes.get(selector)??[];},defaultView:{HTMLInputElement:Control,HTMLSelectElement:Select,HTMLTextAreaElement:Textarea,Event:LocalEvent}};
 let resolve:((value:DomCompletion)=>void)|undefined,current:SellerBridgeCommand|undefined,hold=false,completionOverride:((value:DomCompletion)=>unknown)|undefined;
 function complete(){assert.ok(current);output.dataset={status:"success",pbpSequence:String(current.sequence)};output.textContent="Reservation saved in the native form.";const c=current,a=c.action,payload={testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",partySize:Number(inputs.party.value),slot:inputs.slot.value};const body=a.type==="cancel"?{testRunId:runId,marker:`PBP-${runId}`}:a.type==="move"?{testRunId:runId,marker:`PBP-${runId}`,slot:a.slot}:payload;const wirePath=a.type==="cancel"?"/pbp/bookings/receipt-1/cancel":a.type==="move"?"/pbp/bookings/receipt-1/move":"/pbp/bookings";const completion={sequence:c.sequence,actionId:c.actionId,requests:[{method:"POST" as const,path:wirePath,status:201,key:`pbp-${runId}-lifecycle-${a.type==="retry-original"?"loss-create":a.requestOperation}`,request:body,response:{id:"receipt-1"}}],receipt:{id:"receipt-1"}};resolve?.((completionOverride?completionOverride(completion):completion)as DomCompletion);}
 for(const[k,b]of Object.entries(buttons))b.onClick=()=>{trace.push("click:"+k);if(!hold)complete();};
 const options={document:doc as unknown as Document,runId,forms:{create:{partySize:"#party",slot:"#slot",requestOperation:"#createOp",submit:"#createButton"},cancel:{bookingId:"#booking",requestOperation:"#cancelOp",submit:"#cancelButton"},move:{bookingId:"#booking",slot:"#moveSlot",requestOperation:"#moveOp",submit:"#moveButton"},retry:{submit:"#retryButton"}},result:"#result",timeoutMs,observe(c:SellerBridgeCommand){trace.push("subscribe:"+c.actionId);current=c;const promise=new Promise<DomCompletion>(ok=>{resolve=ok;});return{promise,cancel(){trace.push("cancel-subscription");}};}};
 return{executor:createSellerDomExecutor(options),options,nodes,inputs,output,buttons,trace,complete,setHold(value:boolean){hold=value;},setCompletion(fn:(value:DomCompletion)=>unknown){completionOverride=fn;}};
}
test("DOM executor fills actual native controls and subscribes before one form click; output fits existing bridge",async()=>{
 const f=fixture(),result=await f.executor.execute(create());
 assert.equal(f.inputs.party.value,"5");assert.equal(f.inputs.slot.value,slot);assert.equal(f.inputs.createOp.value,"cancel-create");assert.deepEqual(f.inputs.party.events,["input","change"]);
 assert.deepEqual(f.trace,["subscribe:create","click:create","cancel-subscription"]);assert.equal(result.ui.message,f.output.textContent);assert.equal(result.ui.status,"success");assert.equal(result.ui.fields.partySize,"5");
 const full={protocol:"pbp-seller-bridge-v1",type:"observation",sessionNonce:"a".repeat(64),runId,sequence:1,actionId:"create",...result};assert.deepEqual(validateSellerBridgeObservation(full,{runId,sessionNonce:"a".repeat(64),sequence:1,actionId:"create"}),full);
});
test("cancel, repeated cancel, move and explicit retry use distinct configured controls with no extra network executor",async()=>{
 const f=fixture();await f.executor.execute(create());
 await f.executor.execute({sequence:2,actionId:"cancel",action:{type:"cancel",requestOperation:"cancel-first",bookingId:"receipt-1"}});
 assert.equal(f.inputs.booking.value,"receipt-1");assert.equal(f.inputs.cancelOp.value,"cancel-first");
 await f.executor.execute({sequence:3,actionId:"cancel_repeat",action:{type:"cancel",requestOperation:"cancel-repeat",bookingId:"receipt-1"}});
 await f.executor.execute({sequence:4,actionId:"move_full",action:{type:"move",requestOperation:"move-full",bookingId:"receipt-1",slot:"2099-01-01T11:00:00Z"}});
 assert.equal(f.inputs.moveSlot.value,"2099-01-01T11:00:00Z");assert.equal(f.inputs.moveOp.value,"move-full");
 await f.executor.execute({sequence:5,actionId:"response_loss_retry",action:{type:"retry-original"}});
 assert.deepEqual(f.trace.filter(s=>s.startsWith("click:")),["click:create","click:cancel","click:cancel","click:move","click:retry"]);
 const sdk=readFileSync(new URL("../public/sdk/seller-dom-adapter.mjs",import.meta.url),"utf8");assert.doesNotMatch(sdk,/\bfetch\s*\(/u);assert.doesNotMatch(sdk,/\beval\s*\(|new\s+Function\s*\(/u);
});
test("selectors must be unique, available and native-valid before any submission",async()=>{
 for(const mutate of[(f:ReturnType<typeof fixture>)=>f.nodes.set("#party",[]),(f:ReturnType<typeof fixture>)=>f.nodes.set("#party",[new Control(),new Control()]),(f:ReturnType<typeof fixture>)=>{f.inputs.party.disabled=true;},(f:ReturnType<typeof fixture>)=>{f.inputs.party.hidden=true;},(f:ReturnType<typeof fixture>)=>{f.inputs.party.readOnly=true;},(f:ReturnType<typeof fixture>)=>{f.buttons.create.form={checkValidity:()=>false};}]){
  const f=fixture();mutate(f);await assert.rejects(f.executor.execute(create()));assert.deepEqual(f.trace,[]);await assert.rejects(f.executor.execute(create()),/session_unavailable/);
 }
});
test("framework-controlled value resets and selector command injection stop before the click",async()=>{
 {const f=fixture();f.inputs.party.onEvent=()=>{f.inputs.party.value="2";};await assert.rejects(f.executor.execute(create()),/control_value_not_retained/);assert.deepEqual(f.trace,[]);}
 {const f=fixture();f.inputs.slot.onEvent=()=>{f.inputs.party.value="2";};await assert.rejects(f.executor.execute(create()),/control_value_not_retained/);assert.deepEqual(f.trace,[]);}
 for(const value of[{...create(),url:"https://elsewhere.example"},{...create(),action:{...create().action,selector:"#private"}},{...create(),actionId:"constructor"},{...create(),action:{...create().action,partySize:7}},{...create(),action:{...create().action,requestOperation:"loss-create"}}]){const f=fixture();await assert.rejects(f.executor.execute(value as SellerBridgeCommand),/unsupported_command/);assert.deepEqual(f.trace,[]);}
});
test("stale DOM, changed completion identity or missing DOM stamp cannot become supporting evidence",async()=>{
 {const f=fixture();f.output.dataset.pbpSequence="1";await assert.rejects(f.executor.execute(create()),/stale_result/);assert.deepEqual(f.trace,[]);}
 for(const transform of[(c:DomCompletion)=>({...c,sequence:2}),(c:DomCompletion)=>({...c,actionId:"cancel"}),(c:DomCompletion)=>{const g={...c};delete(g as Partial<DomCompletion>).requests;return g;},(c:DomCompletion)=>({...c,requests:[{method:"POST",path:"https://elsewhere.example/bookings"}]})]){const f=fixture();f.setCompletion(transform);await assert.rejects(f.executor.execute(create()));assert.equal(f.trace.filter(s=>s.startsWith("click:")).length,1);await assert.rejects(f.executor.execute(create()),/session_unavailable/);}
 {const f=fixture();f.setCompletion(c=>{f.output.dataset.pbpSequence="0";return c;});await assert.rejects(f.executor.execute(create()),/result_not_bound_to_completion/);}
});
test("timeout, concurrent command and disposal never replay a potentially committed form operation",async()=>{
 {const f=fixture(5);f.setHold(true);const p=f.executor.execute(create());await assert.rejects(f.executor.execute(create()),/session_unavailable/);await assert.rejects(p,/timeout_external_outcome_unknown/);assert.equal(f.trace.filter(s=>s.startsWith("click:")).length,1);await assert.rejects(f.executor.execute(create()),/session_unavailable/);}
 {const f=fixture();f.setHold(true);const p=f.executor.execute(create());f.executor.dispose();await assert.rejects(p,/stopped_external_outcome_unknown/);assert.equal(f.trace.filter(s=>s.startsWith("click:")).length,1);}
});
test("bounded JSON journal rejects unsupported values and oversized evidence after exactly one click",async()=>{
 for(const transform of[(c:DomCompletion)=>({...c,receipt:{hidden:undefined}}),(c:DomCompletion)=>({...c,receipt:{x:"x".repeat(90*1024)}}),(c:DomCompletion)=>({...c,receipt:new Date()}),(c:DomCompletion)=>({...c,requests:new Array(5).fill(c.requests[0])})]){const f=fixture();f.setCompletion(transform);await assert.rejects(f.executor.execute(create()));assert.equal(f.trace.filter(s=>s.startsWith("click:")).length,1);}
});
test("native completion may share one receipt object, while a true cycle closes the session without retry",async()=>{
 {const f=fixture();f.setCompletion(c=>({...c,receipt:c.requests[0].response}));const result=await f.executor.execute(create());assert.equal(result.ui.status,"success");assert.deepEqual(result.ui.receipt,result.requests[0].response);assert.equal(f.trace.filter(s=>s.startsWith("click:")).length,1);}
 {const f=fixture();f.setCompletion(c=>{const receipt:Record<string,unknown>={id:"receipt-1"};receipt.self=receipt;return{...c,receipt};});await assert.rejects(f.executor.execute(create()),/journal_not_bounded_json/);assert.equal(f.trace.filter(s=>s.startsWith("click:")).length,1);await assert.rejects(f.executor.execute(create()),/session_unavailable/);assert.equal(f.trace.filter(s=>s.startsWith("click:")).length,1);}
});
test("journals for another run or real customer data are rejected before evidence can leave this executor",async()=>{
 for(const change of[{email:"real@example.com"},{customer:"Actual customer"},{testRunId:crypto.randomUUID()},{marker:"other"},{privateNote:"not synthetic"}]){
  const f=fixture();f.setCompletion(c=>({...c,requests:c.requests.map(row=>({...row,request:{...(row.request as Record<string,unknown>),...change}}))}));
  await assert.rejects(f.executor.execute(create()),/non_synthetic_journal/);assert.equal(f.trace.filter(s=>s.startsWith("click:")).length,1);
 }
});
test("deployment can reveal a panel before action; missing configuration fails at startup",async()=>{
 const f=fixture();f.inputs.party.hidden=true;const executor=createSellerDomExecutor({...f.options,beforeAction(){f.inputs.party.hidden=false;}});assert.equal((await executor.execute(create())).ui.status,"success");
 for(const override of[{timeoutMs:0},{timeoutMs:30001},{result:""},{forms:{...f.options.forms,create:{...f.options.forms.create,foreign:"#any"}}},{observe:null}])assert.throws(()=>createSellerDomExecutor({...f.options,...override}as never));
});
