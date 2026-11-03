import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import vm from "node:vm";

type Frontend="reference"|"workshop";
type Listener=(event:{type:string;preventDefault:()=>void})=>unknown;
type Command={actionId:string;action:{type:string;requestOperation?:string;partySize?:number;slot?:string}};
const runId="12345678-1234-4234-8234-123456789abc",slot="2099-01-01T10:00:00Z";
const create:Command={actionId:"create",action:{type:"create",requestOperation:"cancel-create",partySize:5,slot}};
const files={reference:"../examples/seller-lifecycle-staging/frontend/seller.mjs",workshop:"../examples/seller-workshop-python/workshop.mjs"};

class Element {
  value="";textContent="";disabled=false;hidden=false;dataset:Record<string,string>={};
  form?:Element;valid=true;nativeSubmitAllowed=true;clicks=0;validityChecks=0;children:Element[]=[];
  listeners=new Map<string,Listener[]>();
  readonly id:string;
  constructor(id:string){this.id=id;}
  addEventListener(type:string,listener:Listener){this.listeners.set(type,[...(this.listeners.get(type)??[]),listener]);}
  dispatchEvent(event:{type:string;preventDefault?:()=>void}){for(const listener of this.listeners.get(event.type)??[])listener({type:event.type,preventDefault:event.preventDefault??(()=>{})});return true;}
  checkValidity(){this.validityChecks++;return this.valid;}
  click(){if(this.disabled)return;this.clicks++;this.dispatchEvent({type:"click"});if(this.form&&this.form.valid&&this.form.nativeSubmitAllowed)this.form.dispatchEvent({type:"submit"});}
  replaceChildren(...children:Element[]){this.children=[...children];this.value=children[0]?.value??"";}
  append(...children:Element[]){this.children.push(...children);if(!this.value&&children[0]?.value)this.value=children[0].value;}
  setAttribute(name:string,value:string){if(name==="aria-selected")this.dataset.selected=value;}
}

async function fixture(kind:Frontend){
  const elements=new Map<string,Element>(),element=(id:string)=>{let value=elements.get(id);if(!value){value=new Element(id);elements.set(id,value);}return value;};
  const spec=kind==="reference"?{button:"create-submit",form:"create-form",purpose:"create-operation",party:"create-party",slot:"create-slot",result:"result",details:"operation-record",retry:"retry-submit"}:{button:"enrol-submit",form:"enrol-form",purpose:"enrol-purpose",party:"seat-count",slot:"session-choice",result:"booking-result",details:"request-details",retry:"retry-original"};
  const controls=kind==="reference"?["create-operation","create-party","create-slot","create-submit","cancel-operation","cancel-id","cancel-submit","move-operation","move-id","move-slot","move-submit","retry-submit"]:["enrol-purpose","seat-count","session-choice","enrol-submit","enrolment-choice","transfer-purpose","transfer-session","transfer-submit","withdraw-purpose","withdraw-submit","read-roster"];
  controls.forEach(element);element(spec.button).form=element(spec.form);
  if(kind==="reference"){element("cancel-submit").form=element("cancel-form");element("move-submit").form=element("move-form");}
  else{element("transfer-submit").form=element("transfer-form");element("withdraw-submit").form=element("withdraw-form");}
  element(spec.purpose).value="cancel-create";element(spec.party).value="5";element(spec.slot).value=slot;
  const timers=new Map<number,{callback:()=>void;milliseconds:number}>(),scheduled:number[]=[],fetches:Array<{path:string;init:RequestInit}>=[],abortTimeouts:number[]=[];
  let nextTimer=0,resolveFetch:((value:Response)=>void)|undefined,rejectFetch:((error:Error)=>void)|undefined;
  const executeHolder:{execute?:(value:Command)=>Promise<unknown>}={};
  const window={parent:{postMessage(){}},location:{origin:"https://workshop.example"},addEventListener(){}};
  const context=vm.createContext({
    URLSearchParams,Map,Set,URL,TextEncoder,TextDecoder,structuredClone,crypto,console,window,location:{search:`?run=${runId}`,origin:"https://workshop.example"},
    document:{body:{dataset:{}},getElementById:element,createElement:()=>new Element("created"),createTextNode:(text:string)=>{const value=new Element("text");value.textContent=text;return value;},querySelectorAll:(selector:string)=>selector.includes("input")?controls.map(element):[]},
    Event:class{type:string;constructor(type:string,_options?:unknown){this.type=type;}},
    AbortSignal:{timeout(milliseconds:number){abortTimeouts.push(milliseconds);return{aborted:false};}},
    setTimeout(callback:()=>void,milliseconds:number){const id=++nextTimer;scheduled.push(milliseconds);timers.set(id,{callback,milliseconds});return id;},
    clearTimeout(id:number){timers.delete(id);},
    fetch(path:string,init:RequestInit){fetches.push({path,init});return new Promise<Response>((resolve,reject)=>{resolveFetch=resolve;rejectFetch=reject;});},
    installSellerBridge(options:{execute:(value:Command)=>Promise<unknown>;onSession:()=>void}){executeHolder.execute=options.execute;options.onSession();},
  });
  const source=await readFile(new URL(files[kind],import.meta.url),"utf8");
  const config={backendBasePath:"/pbp/",frontendRevision:"synthetic-test",allowedParentOrigins:["https://buyer.example"]};
  vm.runInContext(`const config=${JSON.stringify(config)};\n${source.replace(/^import[^\n]+\n/gmu,"")}\nglobalThis.__testExecute=${kind==="reference"?"execute":"perform"};`,context,{filename:files[kind]});
  const execute=(context as unknown as {__testExecute:(value:Command)=>Promise<any>}).__testExecute;
  const response=(status=201)=>new Response(JSON.stringify(status===504?{code:"response_lost_after_commit"}:status===409?{code:"slot_capacity_exceeded"}:{id:"enr_"+"a".repeat(32),slot,partySize:5,status:"active"}),{status,headers:{"Content-Type":"application/json"}});
  return{kind,element,spec,execute,timers,scheduled,fetches,abortTimeouts,complete(status=201){assert.ok(resolveFetch);resolveFetch(response(status));},fail(){assert.ok(rejectFetch);rejectFetch(new Error("Synthetic connection loss"));},fire(milliseconds:number){const timer=[...timers.entries()].find(([,timer])=>timer.milliseconds===milliseconds);assert.ok(timer,`No timer for ${milliseconds}`);timers.delete(timer[0]);timer[1].callback();}};
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

for(const kind of["reference","workshop"]as const){
  test(`${kind} form completion delivers its real observation while all page timers stay frozen`,async()=>{
    const f=await fixture(kind);let delivered:any,rejected:unknown;
    void f.execute(create).then(value=>{delivered=value;},error=>{rejected=error;});
    assert.equal(f.fetches.length,1);f.complete();await flush();
    assert.equal(rejected,undefined);assert.ok(delivered,"A completed form must deliver without a polling timer being scheduled");
    assert.equal(delivered.ui.actionId,"create");assert.equal(delivered.ui.status,"success");assert.equal(delivered.requests[0].status,201);
    assert.deepEqual(f.abortTimeouts,[8000]);assert.ok(f.scheduled.every(ms=>ms>=8000),"Only bounded watchdogs may be scheduled, never15/20ms polling");assert.equal(f.timers.size,0);
  });
  test(`${kind} native validation or a suppressed submit fails immediately without a request or timer wait`,async()=>{
    for(const nativeValidity of[false,true]){
      const f=await fixture(kind),form=f.element(f.spec.form);form.valid=nativeValidity;form.nativeSubmitAllowed=false;
      let rejected:unknown;void f.execute(create).catch(error=>{rejected=error;});await flush();
      assert.ok(rejected,"A click which cannot enter its submit handler must fail before a timeout");
      assert.match(String(rejected),/validation|submit_not_started/u);assert.equal(f.fetches.length,0);assert.equal(f.timers.size,0);
    }
  });
  test(`${kind} 409 and lost/failed responses settle once without automatically replaying a write`,async()=>{
    for(const status of[409,504,"network"]as const){
      const f=await fixture(kind);let delivered:any;
      void f.execute(create).then(value=>{delivered=value;});
      if(status==="network")f.fail();else f.complete(status);await flush();
      assert.ok(delivered);assert.equal(delivered.ui.status,status===409?"error":"unknown");assert.equal(f.fetches.length,1);assert.equal(f.timers.size,0);
      await flush();assert.equal(f.fetches.length,1,"Unknown/failed writes must not be automatically retried");
      if(status===504){
        const original=f.fetches[0];let retried:any;
        void f.execute({actionId:"response_loss_retry",action:{type:"retry-original"}}).then(value=>{retried=value;});
        assert.equal(f.fetches.length,2);assert.equal(f.fetches[1].init.body,original.init.body);assert.deepEqual(f.fetches[1].init.headers,original.init.headers);
        f.complete(200);await flush();assert.equal(retried.ui.actionId,"response_loss_retry");assert.equal(retried.requests[0].status,200);assert.equal(f.fetches.length,2);
      }
    }
  });
  test(`${kind} one-shot timeout rejects an unknown write and late completion cannot replay or resolve it again`,async()=>{
    const f=await fixture(kind);let settled=0,rejected:unknown;
    void f.execute(create).then(()=>{settled++;},error=>{settled++;rejected=error;});
    f.fire(10000);await flush();assert.equal(settled,1);assert.match(String(rejected),/timeout.*unknown/u);
    f.complete();await flush();assert.equal(settled,1);assert.equal(f.fetches.length,1);assert.equal(f.timers.size,0);
  });
  test(`${kind} ordinary manual form submission still uses the same completion path without a bridge waiter`,async()=>{
    const f=await fixture(kind);f.element(f.spec.button).click();assert.equal(f.fetches.length,1);f.complete();await flush();
    assert.match(f.element(f.spec.details).textContent,/"status": "success"/u);assert.equal(f.timers.size,0);
  });
}
