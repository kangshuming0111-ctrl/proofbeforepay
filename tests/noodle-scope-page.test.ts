import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {setImmediate} from "node:timers/promises";
import ts from "typescript";
import {createQuoteResponseFence, sameQuoteResponseView, type QuoteResponseView} from "../lib/quote-response-fence.ts";

type Quote = {id: string; proof: {delivery: {id: string}; scopeClarifications: {id: string}[]}};
type ScopeResult = {quote: Quote; role: "buyer" | "seller"; scopeContext: {label: string}; candidates: unknown[]};
type Load = {key: string; status: string; result?: ScopeResult};
const quote = (scope = "before", id = "project-1"): Quote => ({id, proof: {delivery: {id: "delivery-1"}, scopeClarifications: [{id: scope}]}});
const result = (scope = "before"): ScopeResult => ({quote: quote(scope), role: "buyer", scopeContext: {label: scope}, candidates: []});
function deferred<T>() {let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}

const page = (async () => {
  const text = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const declarations = new Map<string, string>();
  let effect = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && ["scopeViewKey", "saveScope"].includes(node.name.text)) declarations.set(node.name.text, node.getText(source));
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect" && node.arguments[0]) {
      const body = node.arguments[0].getText(source);
      if (body.includes("/scope-clarifications") && body.includes("setScopeLoad")) effect = body;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(effect, "Extract the actual scope-loading effect, not a copied implementation");
  assert.ok(declarations.has("scopeViewKey")); assert.ok(declarations.has("saveScope"));
  return {effect, declarations};
})();
/** Execute only the selected local function/effect with explicit zero-network test bindings. */
function compile<T>(source: string, bindings: Record<string, unknown>): T {
  const js = ts.transpileModule(`export default (${source});`, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  return new Function("exports", ...Object.keys(bindings), `${js}\nreturn exports.default;`)({}, ...Object.values(bindings)) as T;
}
async function harness() {
  const fragments = await page;
  const scopeViewKey = compile<(q: Quote, role: string) => string>(fragments.declarations.get("scopeViewKey")!, {});
  let currentQuote = quote(), role: "buyer" | "seller" = "buyer", revision = 0;
  const view = (): QuoteResponseView => ({projectId: currentQuote.id, deliveryId: currentQuote.proof.delivery.id, role});
  const currentQuoteView = {current: view()};
  const ticket = {view: view(), revision};
  const loads: (Load | undefined)[] = [], notices: string[] = [], requests: {path: string; method: string; body: unknown}[] = [];
  const response = deferred<ScopeResult>();
  let freshQuote = result("fresh"), refreshes = 0, reloads = 0;
  const fence = createQuoteResponseFence<Quote>({read: () => ({view: view(), revision}), isQuote: (value): value is Quote => !!value && typeof value === "object" && "id" in value && "proof" in value, apply: value => {currentQuote = value.quote; revision++; currentQuoteView.current = view();}, load: async () => {refreshes++; return freshQuote;}});
  const bindings = {
    quote: currentQuote, delivery: currentQuote.proof.delivery, custom: true,
    scopeKey: scopeViewKey(currentQuote, role), renderedQuoteResponseTicket: ticket,
    AbortController, window: {setTimeout: () => 1, clearTimeout: () => {}},
    setScopeLoad: (value: Load | undefined) => loads.push(value),
    apiRequest: (path: string, method: string, body: unknown) => {requests.push({path, method, body}); return response.promise;},
    request: (path: string, method: string, body: unknown) => {requests.push({path, method, body}); return response.promise;},
    displayRole: role, sameQuoteResponseView, currentQuoteView, scopeViewKey,
    getQuoteResponseFence: () => fence,
    run: async (_name: string, action: () => Promise<void>) => {await action();},
    setNotice: (value: string) => notices.push(value),
    setScopeReload: (update: (value: number) => number) => {reloads = update(reloads);},
    tr: (_zh: string, en: string) => en,
  };
  const startRead = () => compile<() => (() => void) | undefined>(fragments.effect, bindings)();
  const save = compile<(action: string, input: unknown) => Promise<boolean>>(fragments.declarations.get("saveScope")!, bindings);
  return {loads, notices, requests, response, startRead, save, scopeViewKey, current: () => currentQuote, refreshes: () => refreshes, reloads: () => reloads,
    change: (next: Quote, nextRole: "buyer" | "seller" = role) => {currentQuote = next; role = nextRole; revision++; currentQuoteView.current = view();},
    refreshWith: (value: ScopeResult) => {freshQuote = value;},
  };
}
async function settle() {for (let i = 0; i < 4; i++) await setImmediate();}

test("actual scope read accepts a partner’s newer history in the same view instead of hanging loading", async () => {
  const h = await harness(), cleanup = h.startRead();
  assert.equal(h.loads.at(-1)?.status, "loading");
  h.response.resolve(result("partner-new-proposal")); await settle();
  assert.equal(h.current().proof.scopeClarifications[0].id, "partner-new-proposal");
  assert.equal(h.loads.at(-1)?.status, "ready");
  assert.equal(h.loads.at(-1)?.key, h.scopeViewKey(h.current(), "buyer"));
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].method, "GET");
  cleanup?.();
});

test("actual delayed scope read cannot publish a result after cleanup, role change or project change", async () => {
  for (const context of ["cleanup", "role", "project"] as const) {
    const h = await harness(), cleanup = h.startRead();
    if (context === "cleanup") cleanup?.();
    if (context === "role") h.change(quote(), "seller");
    if (context === "project") h.change(quote("before", "other-project"));
    h.response.resolve(result("late")); await settle();
    assert.equal(h.loads.some(row => row?.status === "ready"), false);
    assert.notEqual(h.current().proof.scopeClarifications[0].id, "late");
    cleanup?.();
  }
});

test("scope read rejection terminates loading with a recoverable error and no write retry", async () => {
  const h = await harness(), cleanup = h.startRead();
  h.response.reject(new Error("controlled offline failure")); await settle();
  assert.equal(h.loads.at(-1)?.status, "error"); assert.equal(h.requests.length, 1);
  cleanup?.();
});

test("an actual scope read from another role is rejected and releases its loading state", async () => {
  const h = await harness(), cleanup = h.startRead();
  h.response.resolve({...result("wrong-role"), role: "seller"}); await settle();
  assert.equal(h.loads.at(-1)?.status, "error");
  assert.equal(h.current().proof.scopeClarifications[0].id, "before");
  cleanup?.();
});

test("an applied refresh from a delayed scope GET never publishes the older response’s metadata", async () => {
  const h = await harness(), cleanup = h.startRead();
  h.change(quote("local-newer")); h.refreshWith(result("authoritative-latest"));
  h.response.resolve(result("older-scope-response")); await settle();
  assert.equal(h.refreshes(), 1); assert.equal(h.current().proof.scopeClarifications[0].id, "authoritative-latest");
  assert.equal(h.loads.some(row => row?.status === "ready" && row.result?.scopeContext.label === "older-scope-response"), false);
  assert.equal(h.reloads(), 1);
  assert.equal(h.requests.length, 1); cleanup?.();
});

test("actual scope save posts once and does not attach stale metadata when the response fence refreshed", async () => {
  const h = await harness();
  const pending = h.save("confirm", {deliveryId: "delivery-1", proposalId: "proposal-id", proposalDigest: "synthetic-digest", confirm: true, basisNote: "Scope only"});
  h.change(quote("local-newer")); h.refreshWith(result("authoritative-latest"));
  h.response.resolve(result("saved-but-superseded")); assert.equal(await pending, true);
  assert.equal(h.refreshes(), 1); assert.equal(h.current().proof.scopeClarifications[0].id, "authoritative-latest");
  assert.equal(h.loads.some(row => row?.status === "ready" && row.result?.scopeContext.label === "saved-but-superseded"), false);
  assert.equal(h.reloads(), 1);
  assert.equal(h.requests.length, 1); assert.equal(h.requests[0].method, "POST");
  assert.equal((h.requests[0].body as {action: string}).action, "confirm");
});
