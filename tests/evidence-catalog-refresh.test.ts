import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";

/** Exercise the actual small page handlers with deferred request doubles. This
 * checks scheduling and the actual repository HTTP route contract, not React
 * rendering or authenticated browser behavior. No network, DOM, provider or
 * user data is involved. */
const source=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
function section(start:string,end:string){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,"The named page handlers must remain available for this finite source test.");const part=source.slice(a,b);assert.ok(part.length<4000,"Only the two bounded handlers enter this test.");return part;}
// The request double accepts only the detail GET route that actually exists.
// It must never make a nonexistent /api/proofs/:id endpoint look successful.
const detailRouteSource=readFileSync(new URL("../app/api/quotes/[id]/route.ts",import.meta.url),"utf8");
assert.match(detailRouteSource,/export\s+async\s+function\s+GET\s*\(/u,"The expected quote-detail route must export GET.");
const expectedDetailPath=(projectId:string)=>`/api/quotes/${encodeURIComponent(projectId)}`;
const handlers=stripTypeScriptTypes(section("function apply(next:","  function clearReturnContext()"));
type Quote={id:string;createdAt:string;proof:{delivery:{id:string};collaboration:{stage:string};catalog:string}};
const makeQuote=(stage="submitted",catalog="initial"):Quote=>({id:"project-1",createdAt:"2026-11-04T00:00:00.000Z",proof:{delivery:{id:"delivery-1"},collaboration:{stage},catalog}});
function deferred(){let resolve!:(value:{quote:Quote})=>void,reject!:(reason:Error)=>void;const promise=new Promise<{quote:Quote}>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function harness(handlerCode=handlers){
 let screen=makeQuote(),records:Quote[]=[screen];const requests:ReturnType<typeof deferred>[]=[],errors:string[]=[],quoteApplyRevision={current:0},evidenceRefreshSequence={current:0},currentBrowserContext={current:"project-1:delivery-1:buyer"};
 const deps={quote:screen,displayRole:"buyer",quoteApplyRevision,evidenceRefreshSequence,currentBrowserContext,request:(path:string,method="GET",body?:unknown)=>{assert.equal(path,expectedDetailPath(screen.id),"Catalog refresh must use the existing quote-detail HTTP endpoint.");assert.equal(method,"GET");assert.equal(body,undefined);const d=deferred();requests.push(d);return d.promise;},isProof:(q:Quote)=>!!q?.proof?.delivery,tr:(zh:string,_en:string)=>zh,setQuote:(q:Quote)=>{screen=q;},setRole:()=>{},setRecordRoles:()=>{},setRecords:(fn:(old:Quote[])=>Quote[])=>{records=fn(records);},setError:(e:string)=>errors.push(e)};
 const factory=new Function("deps",`const {quote,displayRole,quoteApplyRevision,evidenceRefreshSequence,currentBrowserContext,request,isProof,tr,setQuote,setRole,setRecordRoles,setRecords,setError}=deps;\n${handlerCode}\nreturn {apply,refreshEvidenceCatalog};`);
 const bound=factory(deps)as{apply:(q:Quote)=>void;refreshEvidenceCatalog:()=>Promise<void>};return{...bound,requests,errors,currentBrowserContext,get screen(){return screen;},get records(){return records;},quoteApplyRevision};
}
test("late catalog GET cannot overwrite a newly applied accepted state on the same delivery",async()=>{
 const h=harness(),pending=h.refreshEvidenceCatalog();assert.equal(h.requests.length,1);h.apply(makeQuote("accepted","newer-accepted-catalog"));h.requests[0].resolve({quote:makeQuote("submitted","older-catalog")});await pending;assert.equal(h.screen.proof.collaboration.stage,"accepted");assert.equal(h.screen.proof.catalog,"newer-accepted-catalog");assert.equal(h.records[0].proof.collaboration.stage,"accepted");assert.equal(h.quoteApplyRevision.current,1);
});
test("only the latest refresh may apply, in either response-completion order",async()=>{
 for(const order of [[0,1],[1,0]]){const h=harness(),pending=[h.refreshEvidenceCatalog(),h.refreshEvidenceCatalog()];for(const index of order){h.requests[index].resolve({quote:makeQuote("submitted",index===0?"older":"latest")});await pending[index];if(index===0&&order[0]===0)assert.equal(h.screen.proof.catalog,"initial","An older response must be ignored even while the newer refresh is pending.");}assert.equal(h.screen.proof.catalog,"latest");assert.equal(h.quoteApplyRevision.current,1);}
});
test("a current refresh applies its returned catalog and updates the local record list",async()=>{
 const h=harness(),pending=h.refreshEvidenceCatalog();h.requests[0].resolve({quote:makeQuote("submitted","current")});await pending;assert.equal(h.screen.proof.catalog,"current");assert.equal(h.records[0].proof.catalog,"current");assert.equal(h.quoteApplyRevision.current,1);assert.deepEqual(h.errors,[]);
});
test("changed project/delivery/role and stale request errors do not overwrite the current workspace",async()=>{
 for(const context of ["project-2:delivery-1:buyer","project-1:delivery-2:buyer","project-1:delivery-1:seller"]){const h=harness(),pending=h.refreshEvidenceCatalog();h.currentBrowserContext.current=context;h.requests[0].resolve({quote:makeQuote("submitted","wrong-context")});await pending;assert.equal(h.screen.proof.catalog,"initial");assert.equal(h.quoteApplyRevision.current,0);}
 const h=harness(),pending=h.refreshEvidenceCatalog();h.apply(makeQuote("accepted","accepted"));h.requests[0].reject(Error("stale failure"));await pending;assert.deepEqual(h.errors,[]);assert.equal(h.screen.proof.collaboration.stage,"accepted");
});

test("the request double rejects a regression to the nonexistent proof-detail endpoint",async()=>{
 const wrongEndpoint=handlers.replace('/api/quotes/${encodeURIComponent(quote.id)}','/api/proofs/${quote.id}');assert.notEqual(wrongEndpoint,handlers,"The endpoint mutation must target the actual encoded quote-detail request.");
 const h=harness(wrongEndpoint);await h.refreshEvidenceCatalog();assert.equal(h.requests.length,0,"An invalid endpoint cannot receive an invented successful response.");assert.equal(h.screen.proof.catalog,"initial");assert.equal(h.quoteApplyRevision.current,0);assert.equal(h.errors.length,1);assert.match(h.errors[0],/existing quote-detail HTTP endpoint/u);
});
