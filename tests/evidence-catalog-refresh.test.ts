import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeQuote,pageHarness} from "./quote-response-page-harness.ts";
const detailRouteSource=readFileSync(new URL("../app/api/quotes/[id]/route.ts",import.meta.url),"utf8");
assert.match(detailRouteSource,/export\s+async\s+function\s+GET\s*\(/u);
test("late catalog GET cannot overwrite a newly applied accepted state on the same delivery",async()=>{
 const h=pageHarness(),pending=h.refreshEvidenceCatalog();h.apply(makeQuote({}, {catalog:"newer-accepted",collaboration:{stage:"accepted"}}));h.requests[0].resolve({quote:makeQuote({}, {catalog:"older"})});await pending;assert.equal(h.screen.proof.catalog,"newer-accepted");assert.equal(h.records[0].proof.catalog,"newer-accepted");assert.equal(h.quoteApplyRevision.current,1);
});
test("only the latest catalog refresh may apply in either response-completion order",async()=>{
 for(const order of[[0,1],[1,0]]){const h=pageHarness(),pending=[h.refreshEvidenceCatalog(),h.refreshEvidenceCatalog()];for(const index of order){h.requests[index].resolve({quote:makeQuote({}, {catalog:index===0?"older":"latest"})});await pending[index];if(index===0&&order[0]===0)assert.equal(h.screen.proof.catalog,"initial");}assert.equal(h.screen.proof.catalog,"latest");}
});
test("a current catalog refresh uses the actual detail route and replaces screen plus records",async()=>{
 const h=pageHarness(),pending=h.refreshEvidenceCatalog();assert.equal(h.requests[0].path,"/api/quotes/project-1");h.requests[0].resolve({quote:makeQuote({}, {catalog:"current"})});await pending;assert.equal(h.screen.proof.catalog,"current");assert.equal(h.records[0].proof.catalog,"current");assert.deepEqual(h.errors,[]);
});
test("changed project/delivery/role and stale catalog errors are discarded",async()=>{
 for(const view of[{projectId:"other",deliveryId:"delivery-1",role:"buyer" as const},{projectId:"project-1",deliveryId:"new",role:"buyer" as const},{projectId:"project-1",deliveryId:"delivery-1",role:"seller" as const}]){const h=pageHarness(),pending=h.refreshEvidenceCatalog();h.publishQuoteResponseView(view);h.requests[0].resolve({quote:makeQuote({}, {catalog:"wrong"})});await pending;assert.equal(h.screen.proof.catalog,"initial");}
 const h=pageHarness(),pending=h.refreshEvidenceCatalog();h.apply(makeQuote({}, {catalog:"accepted"}));h.requests[0].reject(Error("stale failure"));await pending;assert.deepEqual(h.errors,[]);
});
test("the finite request double rejects a regression to a nonexistent proof-detail GET",async()=>{
 const h=pageHarness(undefined,source=>{const changed=source.replace('/api/quotes/${encodeURIComponent(view.projectId!)}','/api/proofs/${view.projectId!}');assert.notEqual(changed,source);return changed;}),pending=h.refreshEvidenceCatalog();await pending;assert.equal(h.requests.length,0);assert.match(h.errors[0],/existing quote-detail HTTP endpoint/u);
});
