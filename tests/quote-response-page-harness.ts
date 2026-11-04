import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {createQuoteResponseFence,quoteResponseContext,sameQuoteResponseView} from "../lib/quote-response-fence.ts";
export type Quote={id:string;createdAt:string;proof:{delivery?:{id:string};catalog:string;riskReviews:string[];heads:string[];collaboration?:{stage:string};demoRoleplay?:boolean}};
export const makeQuote=(patch:Partial<Quote>={},proof:Partial<Quote["proof"]>={}):Quote=>({id:"project-1",createdAt:"2026-11-05T00:00:00Z",proof:{delivery:{id:"delivery-1"},catalog:"initial",riskReviews:[],heads:[],...proof},...patch});
export const pageSource=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
function section(start:string,end:string){const a=pageSource.indexOf(start),b=pageSource.indexOf(end,a);assert.ok(a>=0&&b>a);const part=pageSource.slice(a,b);assert.ok(part.length<11000,"Only bounded actual handlers enter this source scheduling test.");return part;}
const init=section("  const currentQuoteView = useRef", "  const currentDelivery = useRef");
const publish=section("  function publishQuoteResponseView(","  let coverageUnits:");
const raw=section("  function apply(next:","  function clearReturnContext()");
const writes=section("  async function run(name:","  async function inviteSeller(");
const clear=section("  function startCase()", "  function showCaseAddress(");
const open=section("  async function openCase(", "  function startCase()");
const changeRole=section("  function switchWorkspaceRole(", "  function fillNoodleBusinessExample()");
function deferred(){let resolve!:(value:{quote:Quote;role?:"buyer"|"seller"})=>void,reject!:(error:Error)=>void;const promise=new Promise<{quote:Quote;role?:"buyer"|"seller"}>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
export function pageHarness(initial=makeQuote(),mutateSource?:(source:string)=>string,initialRole:"buyer"|"seller"="buyer"){
 let screen:Quote|null=initial,records:Quote[]=[initial];const requests:Array<ReturnType<typeof deferred>&{path:string;method:string;role?:string}>=[],errors:string[]=[],notices:string[]=[],quoteApplyRevision={current:0},currentBrowserContext={current:"project-1:delivery-1:buyer"};
 const invoke=(path:string,method="GET",_body?:unknown,transportRole?:string)=>{if(method==="GET")assert.equal(path,`/api/quotes/${encodeURIComponent(initial.id)}`,"Refresh must use the existing quote-detail HTTP endpoint.");const d={...deferred(),path,method,role:transportRole};requests.push(d);return d.promise;};
 const code=[init,`currentQuoteView.current={projectId:quote.id,deliveryId:quote.proof.delivery?.id??null,role:initialRole};`,publish,raw,writes,clear,changeRole,open].join("\n"),deps:Record<string,unknown>={};
 for(const setter of code.matchAll(/\b(set[A-Z]\w*)\(/gu))deps[setter[1]]=()=>{};
 Object.assign(deps,{createQuoteResponseFence,quoteResponseContext,sameQuoteResponseView,initialRole,quote:initial,delivery:initial.proof.delivery,workspaceRole:initialRole,role:"buyer",collaboration:initial.proof.collaboration,roleplay:initial.proof.demoRoleplay===true,quoteApplyRevision,currentBrowserContext,useRef:(value:unknown)=>({current:value}),isProof:(value:Quote)=>!!value?.id&&!!value.proof,busy:"",operationLock:{current:false},layoutController:{current:null},browserCheckController:{current:null},businessCheckController:{current:null},tr:(_zh:string,en:string)=>en,setQuote:(value:Quote|null)=>{screen=value;},setRecords:(fn:(old:Quote[])=>Quote[])=>{records=fn(records);},setError:(value:string)=>errors.push(value),setNotice:(value:string)=>notices.push(value),apiRequest:invoke,request:invoke,clearReturnContext:()=>{},showCaseAddress:()=>{},updateProjectSummary:()=>{},workspaceRef:{current:null},DEFAULT_PAGES:"index.html",fileInputRef:{current:null},folderInputRef:{current:null},window:{requestAnimationFrame:()=>{}}});
 const before=`const {${Object.keys(deps).join(",")}}=deps;\n`;
 const script=stripTypeScriptTypes((mutateSource??(s=>s))(code));
 // The ticket is intentionally captured before any response. It models callbacks
 // retained by a child from the render that started its pending request.
 const ticket=`const renderedQuoteResponseTicket={view:{projectId:quote.id,deliveryId:quote.proof.delivery?.id??null,role:initialRole},revision:quoteApplyRevision.current};`;
 const create=new Function("deps",`${before}\n${ticket}\n${script}\nreturn {apply,publishQuoteResponseView,refreshEvidenceCatalog,onConcurrentQuote,saveRiskReview,mutate,run,refreshCase,startCase,switchWorkspaceRole,openCase,currentQuoteView,quoteResponseFence};`);
 const handlers=create(deps) as {apply:(quote:Quote,role?:"buyer"|"seller")=>void;publishQuoteResponseView:(view:{projectId:string|null;deliveryId:string|null;role:"buyer"|"seller"})=>void;refreshEvidenceCatalog:()=>Promise<void>;onConcurrentQuote:(quote:Quote,role?:"buyer"|"seller")=>Promise<void>;saveRiskReview:(input:unknown)=>Promise<boolean>;mutate:(action:string,body?:unknown,message?:string)=>Promise<void>;run:(name:string,action:()=>Promise<void>,refresh?:boolean)=>Promise<void>;refreshCase:()=>Promise<void>;startCase:()=>void;switchWorkspaceRole:(role:"buyer"|"seller")=>void;openCase:(quote:Quote)=>Promise<void>;currentQuoteView:{current:{projectId:string|null;deliveryId:string|null;role:"buyer"|"seller"}};quoteResponseFence:{current:ReturnType<typeof createQuoteResponseFence<Quote>>}};
 return{...handlers,requests,errors,notices,quoteApplyRevision,currentBrowserContext,get screen(){return screen!;},get records(){return records;}};
}
export const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
