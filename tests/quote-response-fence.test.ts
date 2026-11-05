import test from "node:test";
import assert from "node:assert/strict";
import {createQuoteResponseFence,type QuoteResponseView} from "../lib/quote-response-fence.ts";
import {flush,makeQuote,pageHarness,pageSource} from "./quote-response-page-harness.ts";

test("actual risk and independent task callbacks converge in both response orders without merging or retrying POST",async()=>{
 for(const first of["task","risk"]){const h=pageHarness(),risk=h.saveRiskReview({reason:"Synthetic source evidence."});assert.equal(h.requests[0].method,"POST");
  const riskQuote=makeQuote({}, {riskReviews:["review-1"]}),taskQuote=makeQuote({}, {catalog:"after-task",heads:["repair-1"]}),latest=makeQuote({}, {catalog:"server-latest",heads:["repair-1"],riskReviews:["review-1"]});
  if(first==="task"){await h.onConcurrentQuote(taskQuote);h.requests[0].resolve({quote:riskQuote,role:"buyer"});await flush();assert.equal(h.screen.proof.heads.length,1);assert.equal(h.requests[1].method,"GET");h.requests[1].resolve({quote:latest,role:"buyer"});assert.equal(await risk,true);}
  else{h.requests[0].resolve({quote:riskQuote,role:"buyer"});assert.equal(await risk,true);const pending=h.onConcurrentQuote(taskQuote);assert.deepEqual(h.screen.proof.riskReviews,["review-1"]);assert.equal(h.requests[1].method,"GET");h.requests[1].resolve({quote:latest,role:"buyer"});await pending;}
  assert.deepEqual(h.screen,latest);assert.deepEqual(h.records,[latest]);assert.equal(h.requests.filter(x=>x.method==="POST").length,1);assert.equal(h.requests.filter(x=>x.method==="GET").length,1);
 }
});
test("actual successful risk POST plus failed reconciliation returns saved true and a distinct refresh notice",async()=>{
 const h=pageHarness(),pending=h.saveRiskReview({reason:"Synthetic"});h.apply(makeQuote({}, {heads:["task"]}));h.requests[0].resolve({quote:makeQuote({}, {riskReviews:["review"]}),role:"buyer"});await flush();h.requests[1].reject(Error("read unavailable"));assert.equal(await pending,true);assert.deepEqual(h.screen.proof.heads,["task"]);assert.match(h.notices.at(-1)!,/Human review saved.*could not synchronize.*do not submit/u);assert.equal(h.requests.filter(x=>x.method==="POST").length,1);
});
test("actual old callbacks cannot restore immediately switched project, version, role or cleared view before React effects",async()=>{
 for(const change of["project","version","role","clear"]){const h=pageHarness(),pending=h.saveRiskReview({reason:"Synthetic"});
  if(change==="project")h.apply(makeQuote({id:"project-2"}));if(change==="version")h.apply(makeQuote({}, {delivery:{id:"delivery-2"}}));if(change==="role")h.publishQuoteResponseView({...h.currentQuoteView.current,role:"seller"});if(change==="clear")h.startCase();
  const before=structuredClone(h.screen),records=structuredClone(h.records),noticeCount=h.notices.length;h.requests[0].resolve({quote:makeQuote({}, {riskReviews:["old-review"]}),role:"buyer"});assert.equal(await pending,true);await h.onConcurrentQuote(makeQuote({}, {heads:["old-task"]}));assert.deepEqual(h.screen,before);assert.deepEqual(h.records,records);assert.equal(h.requests.length,1);assert.equal(h.notices.length,noticeCount);
 }
});
test("actual stale reconcile GET cannot undo a synchronous project/version/role/clear switch",async()=>{
 for(const change of["project","version","role","clear"]){const h=pageHarness(),pending=h.saveRiskReview({reason:"Synthetic"});h.apply(makeQuote({}, {heads:["task"]}));h.requests[0].resolve({quote:makeQuote({}, {riskReviews:["review"]}),role:"buyer"});await flush();assert.equal(h.requests.length,2);
  if(change==="project")h.apply(makeQuote({id:"project-2"}));if(change==="version")h.apply(makeQuote({}, {delivery:{id:"delivery-2"}}));if(change==="role")h.publishQuoteResponseView({...h.currentQuoteView.current,role:"seller"});if(change==="clear")h.startCase();const before=structuredClone(h.screen),records=structuredClone(h.records);h.requests[1].resolve({quote:makeQuote({}, {riskReviews:["old"]}),role:"buyer"});assert.equal(await pending,true);assert.deepEqual(h.screen,before);assert.deepEqual(h.records,records);
 }
});
test("actual generic delivery mutation may show its new version using the request's original context",async()=>{
 const h=pageHarness(),pending=h.mutate("delivery",{});h.requests[0].resolve({quote:makeQuote({}, {delivery:{id:"delivery-2"}}),role:"buyer"});await pending;assert.equal(h.screen.proof.delivery?.id,"delivery-2");assert.equal(h.currentBrowserContext.current,"project-1:delivery-2:buyer");assert.equal(h.requests.length,1);
});
test("actual root failure recovery GET cannot overwrite a newer apply or bring a cleared project back",async()=>{
 for(const clear of[false,true]){const h=pageHarness();let fail!:(error:Error)=>void;const wait=new Promise<void>((_,reject)=>{fail=reject;}),pending=h.run("uncertain",()=>wait);fail(Error("provider uncertain"));await flush();assert.equal(h.requests[0].method,"GET");if(clear)h.startCase();else h.apply(makeQuote({}, {catalog:"newer"}));const before=structuredClone(h.screen);h.requests[0].resolve({quote:makeQuote({}, {catalog:"old"}),role:"buyer"});await pending;assert.deepEqual(h.screen,before);}
});
test("actual invalid response does not assert successful refresh; root refresh failure stays distinct",async()=>{
 const h=pageHarness(),pending=h.saveRiskReview({reason:"Synthetic"});h.requests[0].resolve({quote:makeQuote({id:"wrong-project"}),role:"buyer"});assert.equal(await pending,true);assert.equal(h.screen.id,"project-1");assert.match(h.notices.at(-1)!,/saved.*could not synchronize/u);assert.ok(!h.notices.at(-1)!.includes("Project state refreshed"));
 const r=pageHarness(),refresh=r.refreshCase();r.requests[0].reject(Error("offline"));await refresh;assert.match(r.errors.at(-1)!,/Could not read the latest project state/u);assert.ok(!r.notices.some(x=>x.includes("Project state refreshed")));
});
test("shared fence validates quote/project/perspective, ignores unrelated contexts and never merges snapshots",async()=>{
 let revision=0,view:QuoteResponseView={projectId:"p",deliveryId:"v",role:"buyer"},applied=0,reads=0;const q={id:"p",proof:{delivery:{id:"v"}}};const fence=createQuoteResponseFence({read:()=>({view,revision}),isQuote:(v:unknown):v is typeof q=>!!v&&typeof v==="object"&&"proof"in v,apply:()=>{applied++;revision++;},load:async()=>{reads++;return{quote:q};}}),ticket=fence.capture();
 assert.equal((await fence.receive(ticket,{quote:{...q,id:"wrong"}})).kind,"invalid-response");assert.equal((await fence.receive(ticket,{quote:q,role:"seller"})).kind,"invalid-response");assert.equal(applied,0);view={...view,role:"seller"};assert.equal((await fence.receive(ticket,{quote:q})).kind,"ignored-context");assert.equal(reads,0);
});
test("page uses one persistent fence and all independent quote callbacks retain their render ticket",()=>{
 assert.equal((pageSource.match(/const quoteResponseFence = useRef/gu)??[]).length,1);assert.equal((pageSource.match(/onQuote=\{onConcurrentQuote\}/gu)??[]).length,3);assert.equal((pageSource.match(/onApply=\{onConcurrentQuote\}/gu)??[]).length,3);assert.match(pageSource,/const ticket=renderedQuoteResponseTicket;[\s\S]{0,150}await getQuoteResponseFence\(\).receive\(ticket/u);assert.match(pageSource,/currentBrowserContext.current = quoteResponseContext\(currentQuoteView.current\)/u);
});

test("actual workspace role commit synchronously invalidates an independent pending callback",async()=>{
 const h=pageHarness();h.apply(makeQuote({}, {heads:["new-task"]}));const pending=h.onConcurrentQuote(makeQuote({}, {catalog:"old-task"}));assert.equal(h.requests[0].method,"GET");h.switchWorkspaceRole("seller");assert.equal(h.currentQuoteView.current.role,"seller");assert.equal(h.currentBrowserContext.current,"project-1:delivery-1:seller");h.requests[0].resolve({quote:makeQuote({}, {catalog:"old-after-switch"})});await pending;assert.deepEqual(h.screen.proof.heads,["new-task"]);assert.equal(h.screen.proof.catalog,"initial");
});

test("actual single-tool seller workbench accepts owner-buyer transport responses and open resets workspace ref",async()=>{
 const h=pageHarness(makeQuote(),undefined,"seller");const pending=h.onConcurrentQuote(makeQuote({}, {catalog:"owner-updated"}),"buyer");await pending;assert.equal(h.screen.proof.catalog,"owner-updated");assert.equal(h.currentQuoteView.current.role,"seller");
 const opened=h.openCase(makeQuote());h.requests[0].resolve({quote:makeQuote(),role:"buyer"});await opened;assert.equal(h.currentQuoteView.current.role,"buyer");assert.equal(h.currentBrowserContext.current,"project-1:delivery-1:buyer");
});
test("actual owner-demo switch reads target projection after a task arrives first and never applies stale seller GET",async()=>{
 const h=pageHarness(makeQuote({}, {demoRoleplay:true}));h.switchWorkspaceRole("seller");assert.equal(h.requests[0].role,"seller");await h.onConcurrentQuote(makeQuote({}, {demoRoleplay:true,catalog:"with-task",heads:["task"]}),"buyer");h.requests[0].resolve({quote:makeQuote({}, {demoRoleplay:true,catalog:"before-task"}),role:"seller"});await flush();assert.equal(h.requests[1].role,"seller");assert.equal(h.screen.proof.catalog,"with-task");h.requests[1].resolve({quote:makeQuote({}, {demoRoleplay:true,catalog:"latest-seller",heads:["task"]}),role:"seller"});await flush();assert.equal(h.screen.proof.catalog,"latest-seller");assert.equal(h.currentQuoteView.current.role,"seller");assert.deepEqual(h.records,[h.screen]);assert.equal(h.requests.filter(x=>x.method==="POST").length,0);
});
test("actual owner-demo late buyer task refreshes current seller projection without restoring buyer or old payload",async()=>{
 const h=pageHarness(makeQuote({}, {demoRoleplay:true}));h.switchWorkspaceRole("seller");h.requests[0].resolve({quote:makeQuote({}, {demoRoleplay:true,catalog:"seller-before-task"}),role:"seller"});await flush();assert.equal(h.currentQuoteView.current.role,"seller");const task=h.onConcurrentQuote(makeQuote({}, {demoRoleplay:true,catalog:"old-buyer-task",heads:["task"]}),"buyer");await flush();assert.equal(h.requests[1].role,"seller");assert.equal(h.screen.proof.catalog,"seller-before-task");h.requests[1].resolve({quote:makeQuote({}, {demoRoleplay:true,catalog:"current-seller-with-task",heads:["task"]}),role:"seller"});await task;assert.equal(h.screen.proof.catalog,"current-seller-with-task");assert.equal(h.currentQuoteView.current.role,"seller");
});
test("actual owner-demo failed target read keeps the latest buyer view and does not switch",async()=>{
 const h=pageHarness(makeQuote({}, {demoRoleplay:true}));h.switchWorkspaceRole("seller");await h.onConcurrentQuote(makeQuote({}, {demoRoleplay:true,catalog:"new-task"}),"buyer");h.requests[0].resolve({quote:makeQuote({}, {demoRoleplay:true}),role:"seller"});await flush();h.requests[1].reject(Error("offline"));await flush();assert.equal(h.currentQuoteView.current.role,"buyer");assert.equal(h.screen.proof.catalog,"new-task");assert.match(h.notices.at(-1)!,/not switched/u);
});
