import assert from "node:assert/strict";
import test from "node:test";
import {SELLER_BRIDGE_PROTOCOL,validateSellerBridgeCommand,validateSellerBridgeObservation,validateSellerBridgeReady,type SellerBridgeCommand} from "../lib/seller-journey-bridge.ts";
import {createSellerJourneyDriver} from "../lib/seller-journey-driver.ts";
import {installSellerBridge} from "../examples/seller-lifecycle-staging/frontend/bridge.mjs";
import worker from "../examples/seller-lifecycle-staging/worker/index.mjs";

const origin="https://seller.example",parentOrigin="https://buyer.example",runId="12345678-1234-4234-8234-123456789abc",sessionNonce="a".repeat(64),session={runId,sessionNonce};
const ready=(extra:Record<string,unknown>={})=>({protocol:SELLER_BRIDGE_PROTOCOL,type:"ready",...session,sequence:0,frontendRevision:"seller-reference-v1",backendBasePath:"/pbp/",syntheticOnly:true,deploymentAttestation:false,...extra});
const command:SellerBridgeCommand={sequence:1,actionId:"create",action:{type:"create",requestOperation:"cancel-create",partySize:5,slot:"2099-01-01T10:00:00Z"}};
const observation=(extra:Record<string,unknown>={})=>({protocol:SELLER_BRIDGE_PROTOCOL,type:"observation",...session,sequence:1,actionId:"create",ui:{actionId:"create",status:"success",message:"Client-declared result",fields:{operation:"create",partySize:"5",slot:"2099-01-01T10:00:00Z"}},requests:[{method:"POST",path:"/pbp/bookings",key:`pbp-${runId}-lifecycle-cancel-create`,status:201,request:{testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:"2099-01-01T10:00:00Z",partySize:5},response:{id:"receipt-1"}}],...extra});
test("bridge accepts bounded named synthetic actions, not arbitrary instructions or ambiguous fields",()=>{
 assert.deepEqual(validateSellerBridgeCommand(command),command);
 for(const value of[{...command,sequence:0},{...command,sequence:12},{...command,actionId:"meta"},{...command,url:"https://foreign.example"},{...command,action:{...command.action,selector:"#anything"}},{...command,action:{...command.action,requestOperation:"loss-create"}},{...command,action:{...command.action,partySize:7}},{...command,action:{...command.action,slot:"today"}}])assert.throws(()=>validateSellerBridgeCommand(value));
 assert.deepEqual(validateSellerBridgeCommand({sequence:11,actionId:"response_loss_retry",action:{type:"retry-original"}}),{sequence:11,actionId:"response_loss_retry",action:{type:"retry-original"}});
});
test("ready and observations bind exact session/run/action and reject oversized or non-JSON evidence",()=>{
 assert.deepEqual(validateSellerBridgeReady(ready(),session),ready());assert.deepEqual(validateSellerBridgeObservation(observation(),{...session,sequence:1,actionId:"create"}),observation());
 for(const value of[ready({runId:crypto.randomUUID()}),ready({backendBasePath:"//foreign/"}),ready({deploymentAttestation:true}),ready({frontendRevision:"x\n"}),ready({sequence:1})])assert.throws(()=>validateSellerBridgeReady(value,session));
 for(const value of[observation({runId:crypto.randomUUID()}),observation({sessionNonce:"b".repeat(64)}),observation({sequence:2}),observation({actionId:"cancel"}),observation({extra:"ignored?"}),observation({requests:[{method:"POST",path:"https://foreign.example/pbp/bookings"}]}),observation({requests:[{method:"GET",path:"/pbp/bookings"}]}),observation({requests:[{method:"POST",path:"/pbp/bookings?secret=x"}]}),observation({requests:[{method:"POST",path:"/pbp/bookings",response:{large:"x".repeat(16384)}}]}),observation({requests:[{method:"POST",path:"/pbp/bookings",response:new Date()}]}),observation({requests:[{method:"POST",path:"/pbp/bookings",response:{x:undefined}}]})])assert.throws(()=>validateSellerBridgeObservation(value,{...session,sequence:1,actionId:"create"}));
});
function fixture(timeoutMs=1000){
 const listeners=new Set<(event:MessageEvent)=>void>(),loads=new Set<()=>void>(),sent:Array<{message:Record<string,unknown>;target:string}>=[];
 const contentWindow={postMessage(message:Record<string,unknown>,target:string){sent.push({message,target});}},attributes=new Map<string,string>();
 const host={location:{origin:parentOrigin},crypto,addEventListener(type:string,listener:(event:MessageEvent)=>void){if(type==="message")listeners.add(listener);},removeEventListener(type:string,listener:(event:MessageEvent)=>void){if(type==="message")listeners.delete(listener);}};
 const frame={contentWindow,src:"",referrerPolicy:"",setAttribute(name:string,value:string){attributes.set(name,value);},addEventListener(type:string,listener:()=>void){if(type==="load")loads.add(listener);},removeEventListener(type:string,listener:()=>void){if(type==="load")loads.delete(listener);}};
 const emit=(message:unknown,eventOrigin=origin,source:unknown=contentWindow)=>{for(const listener of [...listeners])listener({data:message,origin:eventOrigin,source}as MessageEvent);};
 const load=()=>{for(const listener of [...loads])listener();};
 const options={frame:frame as unknown as HTMLIFrameElement,frontendEntryUrl:origin+"/index.html",allowedOrigin:origin,runId,timeoutMs,hostWindow:host as unknown as Window};
 const driver=createSellerJourneyDriver(options);
 async function connect(){const promise=driver.connect();load();const init=sent[0].message;emit(ready({sessionNonce:init.sessionNonce}));await promise;return init;}
 return{driver,host,frame,sent,attributes,emit,load,connect,options,listeners,loads};
}
test("driver navigates only cross-origin pinned HTTPS, sets sandbox/referrer policy and fills unique run query",async()=>{
 const f=fixture();await f.connect();assert.equal(f.frame.src,origin+"/index.html?run="+runId);assert.equal(f.frame.referrerPolicy,"no-referrer");assert.equal(f.attributes.get("sandbox"),"allow-scripts allow-same-origin allow-forms");assert.equal(f.sent[0].target,origin);assert.match(String(f.sent[0].message.sessionNonce),/^[a-f0-9]{64}$/u);assert.notEqual(f.sent[0].message.sessionNonce,sessionNonce);f.driver.dispose();assert.equal(f.listeners.size,0);assert.equal(f.loads.size,0);
 for(const change of[{frontendEntryUrl:"http://seller.example/"},{frontendEntryUrl:parentOrigin+"/",allowedOrigin:parentOrigin},{frontendEntryUrl:origin+"/?run=bad"},{frontendEntryUrl:origin+"/?x=y"},{frontendEntryUrl:origin+"/#fragment"},{allowedOrigin:origin+"/"},{frontendEntryUrl:origin+"/index.html?run="+runId+"&run="+runId}])assert.throws(()=>createSellerJourneyDriver({...f.options,...change}));
});
test("driver ignores foreign origin/source/session noise and accepts only its pending matching action",async()=>{
 const f=fixture(),promise=f.driver.connect();f.load();const init=f.sent[0].message,correct=ready({sessionNonce:init.sessionNonce});f.emit(correct,"https://attacker.example");f.emit(correct,origin,{});f.emit(ready());f.emit({...correct,runId:crypto.randomUUID()});f.emit(correct);await promise;
 const action=f.driver.perform(command);assert.equal(f.sent[1].target,origin);assert.equal(f.sent[1].message.type,"execute");f.emit(observation({sessionNonce:init.sessionNonce}),"https://attacker.example");f.emit(observation({sessionNonce:init.sessionNonce}));const actual=await action;assert.equal(actual.sequence,1);assert.equal(actual.actionId,"create");
 await assert.rejects(f.driver.perform(command),/out_of_order/);f.driver.dispose();
});
test("replay, navigation, abort and timeout fail closed without retrying an external write",async()=>{
 {const f=fixture(),init=await f.connect();f.emit(ready({sessionNonce:init.sessionNonce}));await assert.rejects(f.driver.perform(command),/out_of_order/);assert.equal(f.sent.length,1);}
 {const f=fixture(),init=await f.connect(),p=f.driver.perform(command);const rejected=assert.rejects(p,/invalid_current_message/);f.emit(observation({sessionNonce:init.sessionNonce,sequence:2}));await rejected;assert.equal(f.sent.length,2);}
 {const f=fixture();await f.connect();const p=f.driver.perform(command),rejected=assert.rejects(p,/navigation/);f.load();await rejected;assert.equal(f.sent.length,2);}
 {const f=fixture(3);await f.connect();await assert.rejects(f.driver.perform(command),/timeout_external_outcome_unknown/);assert.equal(f.sent.length,2);}
 {const f=fixture(),controller=new AbortController(),driver=createSellerJourneyDriver({...f.options,signal:controller.signal}),p=driver.connect(),rejected=assert.rejects(p,/stopped_external_outcome_unknown/);controller.abort();await rejected;assert.equal(f.sent.length,0);}
});
test("standalone seller adapter performs once, validates parent/source/nonce and refuses replay or changed operation",async()=>{
 const listeners=new Set<(event:unknown)=>Promise<void>>(),sent:Record<string,unknown>[]=[],calls:unknown[]=[],parent={postMessage(message:Record<string,unknown>,target:string){assert.equal(target,parentOrigin);sent.push(message);}};
 const host={parent,location:{origin},addEventListener(_type:string,listener:(event:unknown)=>Promise<void>){listeners.add(listener);},removeEventListener(_type:string,listener:(event:unknown)=>Promise<void>){listeners.delete(listener);}};
 const stop=installSellerBridge({config:{allowedParentOrigins:[parentOrigin],frontendRevision:"ref-v1",backendBasePath:"/pbp/"},runId,host:host as unknown as typeof window,execute:async(value:unknown)=>{calls.push(value);return{ui:observation().ui,requests:observation().requests};}});
 const emit=async(data:unknown,eventOrigin=parentOrigin,source:unknown=parent)=>{for(const listener of [...listeners])await listener({data,origin:eventOrigin,source});};
 const init={protocol:SELLER_BRIDGE_PROTOCOL,type:"init",...session,sequence:0};await emit(init,origin);await emit(init,parentOrigin,{});assert.equal(sent.length,0);await emit(init);assert.equal(sent[0].type,"ready");
 const execute={protocol:SELLER_BRIDGE_PROTOCOL,type:"execute",...session,...command};await emit({...execute,sessionNonce:"b".repeat(64)});await emit({...execute,action:{...command.action,requestOperation:"loss-create"}});assert.equal(calls.length,0);await emit(execute);await emit(execute);assert.equal(calls.length,1);assert.equal(sent.length,2);assert.equal(sent[1].type,"observation");stop();assert.equal(listeners.size,0);
});
test("standalone hosting route guards writes and applies separate-origin frame CSP to seller assets",async()=>{
 const response=await worker.fetch(new Request(origin+"/index.html?run="+runId),{ASSETS:{fetch:async()=>new Response("reference")}});assert.equal(await response.text(),"reference");assert.match(response.headers.get("content-security-policy")!,/frame-ancestors https:\/\/briefpay-kang-lab\.blueheron8\.chatgpt\.site/);assert.match(response.headers.get("content-security-policy")!,/connect-src 'self'/);assert.equal(response.headers.get("referrer-policy"),"no-referrer");
 const rejected=await worker.fetch(new Request(origin+"/pbp/bookings",{method:"POST"}),{});assert.equal(rejected.status,403);assert.deepEqual(await rejected.json(),{code:"same_origin_required"});
});
test("standalone adapter admits loopback parents only with the operator flag and a bounded real IPv4 loopback port",async()=>{
 for(const[enabled,eventOrigin,expected]of[[false,"http://127.0.0.1:5173",false],[true,"http://127.0.0.1:5173",true],[true,"http://127.0.0.1:65535",true],[true,"http://127.0.0.1:99999",false],[true,"http://localhost:5173",false],[true,"https://127.0.0.1:5173",false],[true,"http://127.0.0.1.evil.example:5173",false]]as const){
  const listeners=new Set<(event:unknown)=>Promise<void>>(),sent:unknown[]=[],parent={postMessage(message:unknown){sent.push(message);}},host={parent,location:{origin},addEventListener(_t:string,listener:(event:unknown)=>Promise<void>){listeners.add(listener);},removeEventListener(_t:string,listener:(event:unknown)=>Promise<void>){listeners.delete(listener);}};
  const stop=installSellerBridge({config:{allowedParentOrigins:[parentOrigin],allowLoopbackParent:enabled,frontendRevision:"ref",backendBasePath:"/pbp/"},runId,host:host as unknown as typeof window,execute:async()=>({ui:{},requests:[]})});
  for(const listener of listeners)await listener({data:{protocol:SELLER_BRIDGE_PROTOCOL,type:"init",...session,sequence:0},origin:eventOrigin,source:parent});assert.equal(sent.length,expected?1:0);stop();
 }
});
