import {parse, type DefaultTreeAdapterMap} from "parse5";

/** Offline preparation only. These declarations neither register a deployment
 * nor prove that native handlers, framework state or backend records work. */
export const SELLER_ONBOARDING_SCHEMA = "pbp-seller-onboarding-v1";
export const SELLER_ONBOARDING_PROTOCOL = "booking-lifecycle-http-v1";
const GROUPS = {create:["partySize","slot","requestOperation","submit"],cancel:["bookingId","requestOperation","submit"],move:["bookingId","slot","requestOperation","submit"],retry:["submit"]} as const;
type Group = keyof typeof GROUPS;
export type SellerOnboardingConfig = {
 schema:typeof SELLER_ONBOARDING_SCHEMA; protocol:typeof SELLER_ONBOARDING_PROTOCOL;
 parentOrigin:string; backendBasePath:string; frontendRevision:string;
 forms:{create:{partySize:string;slot:string;requestOperation:string;submit:string};cancel:{bookingId:string;requestOperation:string;submit:string};move:{bookingId:string;slot:string;requestOperation:string;submit:string};retry:{submit:string}};
 result:string;
};
export type OnboardingCheck = {key:string;status:"ok"|"issue"|"unknown";code:string;matches?:number};
export type OnboardingReport = {schema:"pbp-seller-onboarding-check-v1";configurationValid:boolean;staticMarkupReady:boolean;checks:OnboardingCheck[];runtimeVerified:false;backendVerified:false};
export type OnboardingFile = {name:string;content:string;type:string};
export const ONBOARDING_SELECTOR_FIELDS = Object.entries(GROUPS).flatMap(([group,keys])=>keys.map(key=>`${group}.${key}`)).concat("result");
const CONTROL=/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
const SECRET=/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsk-[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/iu;
function fail(code:string):never{throw new Error(code);}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail("configuration_shape");for(const key of keys)if(!("value"in Object.getOwnPropertyDescriptor(value,key)!))fail("configuration_shape");return value as Record<string,unknown>;}
type Compound={tag?:string;id?:string;classes:string[];attrs:{name:string;value?:string}[]};
type Selector={parts:Compound[];relations:("child"|"descendant")[]};
/** Intentional CSS subset shared by browser and CLI: tag, #id, .class,
 * [attribute], [attribute=value], descendant and child combinators. No pseudo
 * classes, escapes, lists, wildcard or sibling selectors are guessed. */
function selector(value:unknown):Selector{
 if(typeof value!=="string"||!value.trim()||value.length>200||CONTROL.test(value)||SECRET.test(value))fail("selector_invalid");
 const text=value.trim();let at=0;const parts:Compound[]=[],relations:Selector["relations"]=[];
 while(at<text.length){
  const item:Compound={classes:[],attrs:[]};let used=false;
  const tag=/^[A-Za-z][A-Za-z0-9-]*/u.exec(text.slice(at));if(tag){item.tag=tag[0].toLowerCase();at+=tag[0].length;used=true;}
  while(at<text.length){
   const rest=text.slice(at),id=/^#([A-Za-z_][A-Za-z0-9_-]*)/u.exec(rest),cls=/^\.([A-Za-z_][A-Za-z0-9_-]*)/u.exec(rest);
   if(id){if(item.id)fail("selector_unsupported");item.id=id[1];at+=id[0].length;used=true;continue;}
   if(cls){item.classes.push(cls[1]);at+=cls[0].length;used=true;continue;}
   const attr=/^\[([A-Za-z_][A-Za-z0-9:_-]*)(?:=(?:"([^"\\\]\r\n]*)"|'([^'\\\]\r\n]*)'|([A-Za-z0-9_:/.-]+)))?\]/u.exec(rest);
   if(attr){item.attrs.push({name:attr[1].toLowerCase(),...(attr[2]!==undefined||attr[3]!==undefined||attr[4]!==undefined?{value:attr[2]??attr[3]??attr[4]}:{})});at+=attr[0].length;used=true;continue;}
   break;
  }
  if(!used||parts.length>=4)fail("selector_unsupported");parts.push(item);
  const spaces=/^ +/u.exec(text.slice(at));if(spaces)at+=spaces[0].length;if(at===text.length)break;
  if(text[at]===">"){at++;const more=/^ +/u.exec(text.slice(at));if(more)at+=more[0].length;relations.push("child");}
  else if(spaces)relations.push("descendant");else fail("selector_unsupported");
  if(at===text.length)fail("selector_unsupported");
 }
 return{parts,relations};
}
export function defaultSellerOnboardingConfig():SellerOnboardingConfig{return{schema:SELLER_ONBOARDING_SCHEMA,protocol:SELLER_ONBOARDING_PROTOCOL,parentOrigin:"https://briefpay-kang-lab.blueheron8.chatgpt.site",backendBasePath:"/pbp/",frontendRevision:"my-staging-v1",forms:{create:{partySize:"[name=guests]",slot:"[name=arrival]",requestOperation:"[name=create-purpose]",submit:"[data-booking-form] button[type=submit]"},cancel:{bookingId:"[name=saved-reservation]",requestOperation:"[name=cancel-purpose]",submit:"[data-cancel-form] button[type=submit]"},move:{bookingId:"[name=saved-reservation]",slot:"[name=new-arrival]",requestOperation:"[name=move-purpose]",submit:"[data-move-form] button[type=submit]"},retry:{submit:"#retry"}},result:"#reservation-update"};}
export function validateSellerOnboardingConfig(value:unknown):SellerOnboardingConfig{
 const v=object(value,["schema","protocol","parentOrigin","backendBasePath","frontendRevision","forms","result"]);
 if(v.schema!==SELLER_ONBOARDING_SCHEMA||v.protocol!==SELLER_ONBOARDING_PROTOCOL)fail("protocol_unsupported");
 if(typeof v.parentOrigin!=="string"||v.parentOrigin.length>200||CONTROL.test(v.parentOrigin)||SECRET.test(v.parentOrigin))fail("parent_origin_invalid");
 let origin:URL;try{origin=new URL(v.parentOrigin);}catch{fail("parent_origin_invalid");}
 if(origin.protocol!=="https:"||origin.origin!==v.parentOrigin||origin.username||origin.password||origin.search||origin.hash||/^(?:localhost|127\.|\[::1\])|(?:^|\.)(?:example\.(?:com|org|net)|invalid|test)$/iu.test(origin.hostname))fail("parent_origin_invalid");
 if(typeof v.backendBasePath!=="string"||v.backendBasePath.length>160||!/^\/(?:[A-Za-z0-9_-]+\/)+$/u.test(v.backendBasePath))fail("backend_path_invalid");
 if(typeof v.frontendRevision!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(v.frontendRevision)||SECRET.test(v.frontendRevision))fail("revision_invalid");
 const f=object(v.forms,Object.keys(GROUPS));for(const[group,keys]of Object.entries(GROUPS)){const row=object(f[group],keys);for(const key of keys)selector(row[key]);}selector(v.result);
 return structuredClone(value) as SellerOnboardingConfig;
}
type Node=DefaultTreeAdapterMap["node"];type Element=DefaultTreeAdapterMap["element"];
function isElement(n:Node):n is Element{return"tagName"in n;}
function attr(n:Element,name:string){return n.attrs.find(a=>a.name===name)?.value;}
function parent(n:Node):Element|undefined{const p="parentNode"in n?n.parentNode:undefined;return p&&isElement(p)?p:undefined;}
function matches(n:Element,p:Compound){return(!p.tag||n.tagName===p.tag)&&(!p.id||attr(n,"id")===p.id)&&p.classes.every(c=>(attr(n,"class")??"").split(/\s+/u).includes(c))&&p.attrs.every(a=>attr(n,a.name)!==undefined&&(a.value===undefined||attr(n,a.name)===a.value));}
function matchChain(n:Element,s:Selector,index=s.parts.length-1):boolean{if(!matches(n,s.parts[index]))return false;if(!index)return true;let p=parent(n);if(s.relations[index-1]==="child")return!!p&&matchChain(p,s,index-1);while(p){if(matchChain(p,s,index-1))return true;p=parent(p);}return false;}
function ancestry(n:Element,predicate:(e:Element)=>boolean){let p:Element|undefined=n;while(p){if(predicate(p))return true;p=parent(p);}return false;}
function selectorValue(c:SellerOnboardingConfig,key:string){if(key==="result")return c.result;const[group,field]=key.split(".");return(c.forms[group as Group]as Record<string,string>)[field];}
export function checkSellerOnboarding(value:unknown,html?:string):OnboardingReport{
 const report:OnboardingReport={schema:"pbp-seller-onboarding-check-v1",configurationValid:false,staticMarkupReady:false,checks:[],runtimeVerified:false,backendVerified:false};let c:SellerOnboardingConfig;
 try{c=validateSellerOnboardingConfig(value);report.configurationValid=true;report.checks.push({key:"configuration",status:"ok",code:"configuration_valid"});}catch(error){report.checks.push({key:"configuration",status:"issue",code:error instanceof Error?error.message:"configuration_invalid"});return report;}
 if(html===undefined){report.checks.push({key:"markup",status:"unknown",code:"html_not_supplied"});return report;}
 if(typeof html!=="string"||new TextEncoder().encode(html).byteLength>256*1024||html.includes("\0")){report.checks.push({key:"markup",status:"issue",code:"html_size_or_encoding"});return report;}
 const tree=parse(html),nodes:Element[]=[];function walk(n:Node){if(isElement(n))nodes.push(n);if("childNodes"in n)for(const child of n.childNodes)walk(child);}walk(tree);
 for(const key of ONBOARDING_SELECTOR_FIELDS){
  const found=nodes.filter(n=>matchChain(n,selector(selectorValue(c,key))));let code="selector_matches",status:OnboardingCheck["status"]="ok";
  if(found.length!==1){code=found.length?"selector_ambiguous":"selector_missing";status="issue";}
  else{const el=found[0],submit=key.endsWith(".submit"),result=key==="result";
   if(!result&&(submit?!(el.tagName==="button"||el.tagName==="input"&&["submit","button"].includes(attr(el,"type")??"text")):!["input","select","textarea"].includes(el.tagName))){code="control_type_invalid";status="issue";}
   else if(!result&&((attr(el,"readonly")!==undefined&&!submit)||ancestry(el,e=>attr(e,"hidden")!==undefined||e.tagName==="fieldset"&&attr(e,"disabled")!==undefined)||attr(el,"disabled")!==undefined||el.tagName==="input"&&attr(el,"type")?.toLowerCase()==="hidden")){code="control_statically_unavailable";status="unknown";}
   else if(!result&&el.tagName==="input"&&["checkbox","radio","file","image","reset","submit","button","range","color","date","datetime-local","month","week","time"].includes((attr(el,"type")??"text").toLowerCase())&&!submit){code="input_type_not_compatible";status="issue";}
   else if(!result&&key.endsWith(".requestOperation")&&el.tagName==="select"){
    const required=key.startsWith("create.")?["cancel-create","cancel-five","cancel-three","cancel-extra","source-create","loss-create"]:key.startsWith("cancel.")?["cancel-first","cancel-repeat"]:["move-full","move-free"];
    const values=nodes.filter(n=>n.tagName==="option"&&ancestry(n,e=>e===el)).map(n=>attr(n,"value"));if(required.some(v=>!values.includes(v))){code="operation_options_missing";status="issue";}
   }
  }
  report.checks.push({key,status,code,matches:found.length});
 }
 report.staticMarkupReady=!report.checks.some(c=>c.status!=="ok");
 report.checks.push({key:"native-and-backend",status:"unknown",code:"runtime_and_backend_not_executed"});return report;
}
export function buildSellerOnboardingFiles(value:unknown):OnboardingFile[]{
 const c=validateSellerOnboardingConfig(value),config=JSON.stringify(c,null,2);
 const connector=`// Generated preparation for a seller-owned synthetic staging page.\n// Native handlers and the fixed backend protocol still need real integration.\nimport {createSellerDomExecutor} from "./seller-dom-adapter.mjs";\nimport {installSellerBridge} from "./bridge.mjs";\nconst configuration=${config};\nlet pending;\nexport function getPendingProofCommand(){return pending?structuredClone(pending.command):undefined;}\n// Call only after the native form operation finishes. Supply its actual journal.\n// Do not call this from a click listener before the operation has completed.\nexport function completeProofOperation({command,requests,receipt,status,message}){\n if(!pending)throw new Error("No ProofBeforePay operation is waiting.");\n if(pending.completed||!command||JSON.stringify(command)!==JSON.stringify(pending.command))throw new Error("Native completion does not match the captured ProofBeforePay command.");\n if(!Array.isArray(requests)||requests.length>4||!["success","error","unknown"].includes(status)||typeof message!=="string"||!message.trim()||message.length>2000)throw new Error("Invalid native completion.");\n const outputs=document.querySelectorAll(configuration.result);if(outputs.length!==1)throw new Error("Result selector must match exactly one element.");\n const output=outputs[0],entry=pending;entry.completed=true;output.textContent=message;output.dataset.status=status;output.dataset.pbpSequence=String(entry.command.sequence);\n entry.resolve({sequence:entry.command.sequence,actionId:entry.command.actionId,requests,...(receipt===undefined?{}:{receipt})});\n}\nconst query=new URLSearchParams(location.search),runId=query.get("run");\nif(runId&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(runId)&&query.getAll("run").length===1&&[...query.keys()].every(key=>key==="run")){\n const executor=createSellerDomExecutor({document,runId,forms:configuration.forms,result:configuration.result,\n  beforeAction(command){const kind=command.action.type==="retry-original"?"retry":command.action.type;for(const selected of Object.values(configuration.forms[kind]))for(const element of document.querySelectorAll(selected)){let parent=element.parentElement;while(parent){if(parent.tagName==="DETAILS")parent.open=true;parent=parent.parentElement;}}},\n  observe(command){if(pending)throw new Error("Native operation already pending.");let resolve;const promise=new Promise(ok=>{resolve=ok;});const entry={command,resolve};pending=entry;return{promise,cancel(){if(pending===entry)pending=undefined;}};}\n });\n const stop=installSellerBridge({config:{allowedParentOrigins:[configuration.parentOrigin],allowLoopbackParent:false,backendBasePath:configuration.backendBasePath,frontendRevision:configuration.frontendRevision},runId,execute:command=>executor.execute(command)});\n window.addEventListener("pagehide",()=>{executor.dispose();stop();},{once:true});\n}\n`;
 const setup=`# Seller staging preparation\n\nThis package contains configuration and a completion connector, not a working backend or a registered target. No website was executed by generating it. No account, project membership, acceptance or payment is granted.\n\n1. Use a dedicated synthetic staging page with no real customer data. Copy seller-dom-adapter.mjs from public/sdk and bridge.mjs from examples/seller-lifecycle-staging/frontend in the ProofBeforePay source repository next to pbp-connect.mjs.\n2. Keep the page's existing native create/cancel/move/retry handlers. Load pbp-connect.mjs as an ES module. The configured controls must be visible, enabled and retain the exact protocol values when events fire. If panels need opening or React state needs special handling, modify the generated connector deliberately and test it in a browser.\n3. Import getPendingProofCommand and completeProofOperation in native handlers. Capture const command=getPendingProofCommand() synchronously BEFORE your native asynchronous request. After that actual request completes call completeProofOperation({command,requests:[actualTrace],receipt,status,message}) with the captured command and its actual synthetic journal. A late completion for another command is rejected. Do not look up a new pending command after waiting. A lost response remains unknown; never invent a receipt or replay a write automatically.\n4. Implement the fixed same-origin backend protocol at ${c.backendBasePath}. Map native fields to the protocol in the backend adapter, not by declaring success here. See pbp-protocol-checklist.md and the complete seller-lifecycle-staging reference.\n5. Run the local static check from the repository root:\n\n    node --experimental-strip-types scripts/seller-onboarding-preflight.mjs /absolute/path/pbp-onboarding.json /absolute/path/index.html\n\nThe CLI reads only those two local files. It never executes page scripts or contacts a URL. Static matches cannot establish layout, actual visibility, React state, handlers, datastore writes or backend authenticity.\n6. Submit the exact staging manifest through your seller workspace and request the authorised operator's review. Generated files do not approve/register a deployment. Run the separately approved browser and server checks before treating it as tested.\n\nSupported selector subset: tag, #id, .class, [attribute], [attribute=value], descendant and child combinators; at most four compound parts. Pseudo classes, lists, escapes, wildcards and siblings are unsupported and must be mapped to stable IDs/data attributes.\n\nYour selected selectors, parent origin, path and revision are included in these files. Never enter secrets or private customer information.\n`;
 const protocol=`# Fixed backend and native-completion checklist\n\nProtocol declaration: ${c.protocol}\nSame-origin base path: ${c.backendBasePath}\nFrontend revision declaration: ${c.frontendRevision}\n\nThis is a checklist, not a protocol certification. Use examples/seller-lifecycle-staging/README.md and its worker source as the normative runnable reference.\n\n- Declare synthetic-only lifecycle metadata with the approved frontend bundle digest, backend revision and supported protocol.\n- POST bookings accepts testRunId, marker PBP-{runId}, customer PBP synthetic, email pbp-test@example.invalid, partySize and one of the three lifecycle slots. Preserve Idempotency-Key.\n- POST bookings/{id}/cancel accepts testRunId and marker. Repeat cancellation must not release capacity twice.\n- POST bookings/{id}/move accepts testRunId, marker and slot. Rejecting a move must retain its original booking.\n- GET receipt/merchant/occupancy routes follow the fixed reference contract. Read real native stored records; do not fabricate a parallel 'passed' result from the command.\n- Native completion returns the actual sequence/action identity and POST journal with method, same-origin path, key, request, status/response or bounded error.\n- Lost-response retry uses the exact original payload/key only after independent readback, under the existing issued action.\n- Fixed recipe limits remain six guests per reservation and eight per slot; this connector does not turn arbitrary business rules into supported tests.\n- Journals and server reads remain seller-controlled. Hash consistency is not trusted deployment or backend-source attestation.\n`;
 return[{name:"pbp-onboarding.json",content:config+"\n",type:"application/json"},{name:"pbp-connect.mjs",content:connector,type:"text/javascript"},{name:"PBP-SETUP.md",content:setup,type:"text/markdown"},{name:"pbp-protocol-checklist.md",content:protocol,type:"text/markdown"}];
}
