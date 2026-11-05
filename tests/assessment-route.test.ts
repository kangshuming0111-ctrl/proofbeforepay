import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, readFile, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";
import type {Language, ProofQuote} from "../lib/contracts.ts";
import {parseStaticProject} from "../lib/static-project.ts";
import {projectQuote, validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";
import type {assessmentFailureResponse} from "../lib/assessment-failure-presentation.ts";

type HarnessState = {quote: ProofQuote; version: number; saves: number; fetches: number; responseBody: string};
type FailureResult = ReturnType<typeof assessmentFailureResponse>;
const globalKey = "__pbpAssessmentRouteTestOnly";
async function savedInputs() {
  const base = new URL("../public/benchmarks/five-remediation-2026-11-05/", import.meta.url);
  const corpus = validateProjectCorpus(JSON.parse(await readFile(new URL("known-regression-corpus.json", base), "utf8")));
  const saved = JSON.parse(await readFile(new URL("known-retest.json", base), "utf8"));
  const project = corpus.projects.find(project => project.id === "little-light-photographs")!;
  const original = saved.results.find((row: {id: string}) => row.id === project.id);
  const complete = saved.results.find((row: {id: string}) => row.id === "little-light-exact-present-regression");
  return {project, originalBody: original.raw.bodyText as string, completeBody: complete.raw.bodyText as string};
}

/** Real action route and all assessment/workflow guards; only storage/gateway
 * and environment adapters are isolated. The provider is a saved-response
 * stand-in: no API key, outbound request, real login or payment is tested. */
async function routeHarness(language: Language = "zh", changedBody?: (body: string) => string) {
  const saved = await savedInputs(), quote = projectQuote(saved.project);
  const project = parseStaticProject({title: saved.project.title, summary: saved.project.summary, amount: "1.00", requiredPages: ["index.html"], manualRequirements: saved.project.criteria.map(criterion => criterion.source)}, saved.project.language);
  // Keep the exact two locked assessment criteria/evidence from the retained
  // corpus, while exercising the real custom-project collaboration guards.
  quote.language = language; quote.proof.project = project.project;
  quote.proof.collaboration = {stage: "submitted", submission: {deliveryId: quote.proof.delivery!.id, at: quote.createdAt, note: "Synthetic route fixture only"}, feedback: []};
  const dir = await mkdtemp(path.join(tmpdir(), "pbp-assessment-route-")), globals = globalThis as unknown as Record<string, unknown>;
  const state: HarnessState = {quote, version: 1, saves: 0, fetches: 0, responseBody: changedBody ? changedBody(saved.completeBody) : saved.originalBody};
  globals[globalKey] = state;
  const mocks: Record<string, string> = {
    "@/lib/proof-store": `
      const state=()=>globalThis.${globalKey};
      export function proofActor(request){return{id:request.headers.get('x-test-actor')||'outsider'};}
      export async function readProofCase(id,actor){const s=state();if(id!==s.quote.id||!['buyer','seller'].includes(actor.id)){const error=new Error('Project not found.');error.status=404;throw error;}return{quote:structuredClone(s.quote),version:s.version,role:actor.id,buyerId:'buyer',sellerId:'seller'};}
      export async function saveProofCase(record,next){const s=state();if(record.version!==s.version){const error=new Error('CAS conflict');error.status=409;throw error;}s.quote=structuredClone(next);s.version++;s.saves++;record.quote=structuredClone(s.quote);record.version=s.version;}
      export function proofResponse(record,quote=record.quote){return{quote,role:record.role};}
      export async function issueInvitation(){throw new Error('Invitation must not run in an assessment test.');}
    `,
    "@/lib/server": `
      export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
      export async function handle(action){try{return await action();}catch(error){return Response.json({error:error.message},{status:error.status||500});}}
      export function json(value,status=200){return Response.json(value,{status});}
      export function providerEnv(){return{DEEPSEEK_API_KEY:'synthetic-route-key-not-a-credential',DEEPSEEK_MODEL:'deepseek-flash'};}
      export async function body(request,limit){const text=await request.text();if(new TextEncoder().encode(text).byteLength>limit)throw new HttpError(413,'Request body limit.');const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Expected an object.');return value;}
    `,
    "@/lib/server-runtime-targets": `export async function resolveUploadRuntimeTarget(){throw new Error('Runtime target resolution must not run in an assessment test.');}`,
  };
  const originalFetch = globalThis.fetch;
  try {
    let source = ts.transpileModule(await readFile(new URL("../app/api/proofs/[id]/[action]/route.ts", import.meta.url), "utf8"), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
    for (const [index, [name, code]] of Object.entries(mocks).entries()) {
      const file = path.join(dir, `adapter-${index}.mjs`); await writeFile(file, code);
      source = source.replaceAll(JSON.stringify(name), JSON.stringify(pathToFileURL(file).href));
    }
    source = source.replace(/"@\/lib\/([^"]+)"/gu, (_all, name: string) => JSON.stringify(new URL(`../lib/${name}.ts`, import.meta.url).href));
    const file = path.join(dir, "route.mjs"); await writeFile(file, source);
    const route = await import(pathToFileURL(file).href) as {POST: (request: Request, context: unknown) => Promise<Response>};
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      state.fetches++;
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      assert.equal(url.href, "https://api.deepseek.com/chat/completions", "all other outbound requests are forbidden");
      assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "manual");
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(state.responseBody, {status: 200, headers: {"Content-Type": "application/json"}});
    }) as typeof fetch;
    async function call(overrides: Record<string, unknown> = {}, actor = "buyer") {
      const request = new Request(`https://application.example.org/api/proofs/${quote.id}/assess`, {method: "POST", headers: {"Content-Type": "application/json", "x-test-actor": actor}, body: JSON.stringify({deliveryId: state.quote.proof.delivery!.id, confirm: true, ...overrides})});
      return route.POST(request, {params: Promise.resolve({id: quote.id, action: "assess"})});
    }
    return {state, call, async close() {globalThis.fetch = originalFetch; delete globals[globalKey]; await rm(dir, {recursive: true, force: true});}};
  } catch (error) {globalThis.fetch = originalFetch; delete globals[globalKey]; await rm(dir, {recursive: true, force: true}); throw error;}
}

test("actual assess route returns a Chinese safe 502 missing diagnostic for the saved incomplete reply without saving", async () => {
  const h = await routeHarness();
  try {
    const before = structuredClone(h.state.quote), response = await h.call(), result = await response.json() as FailureResult;
    assert.equal(response.status, 502);
    assert.equal(result.assessmentFailure.reason, "missing_items");
    assert.deepEqual(result.assessmentFailure.coverage, {expectedCriterionIds: ["manual-1", "manual-2"], missingCriterionIds: ["manual-2"], duplicateCriterionIds: [], unknownCriterionCount: 0});
    assert.match(result.error, /AI 漏答 1 项要求（manual-2）/u); assert.match(result.error, /不会自动重试/u);
    assert.doesNotMatch(JSON.stringify(result), /Every family|Families|synthetic-route-key|index\.html/u);
    assert.equal(h.state.fetches, 1); assert.equal(h.state.saves, 0); assert.equal(h.state.version, 1); assert.deepEqual(h.state.quote, before);
  } finally {await h.close();}
});

test("actual assess route distinguishes duplicate and unknown IDs without echoing model IDs or saving a report", async () => {
  for (const kind of ["duplicate_items", "unknown_items"] as const) {
    const h = await routeHarness("en", body => {
      const envelope = JSON.parse(body), completion = JSON.parse(envelope.choices[0].message.content);
      completion.items[1].criterionId = kind === "duplicate_items" ? completion.items[0].criterionId : "PRIVATE_MODEL_ONLY_ID";
      envelope.choices[0].message.content = JSON.stringify(completion); return JSON.stringify(envelope);
    });
    try {
      const before = structuredClone(h.state.quote), response = await h.call(), result = await response.json() as FailureResult;
      assert.equal(response.status, 502); assert.equal(result.assessmentFailure.reason, kind);
      assert.ok(result.assessmentFailure.coverage);
      assert.deepEqual(result.assessmentFailure.coverage.expectedCriterionIds, ["manual-1", "manual-2"]);
      assert.deepEqual(result.assessmentFailure.coverage.missingCriterionIds, ["manual-2"]);
      assert.deepEqual(result.assessmentFailure.coverage.duplicateCriterionIds, kind === "duplicate_items" ? ["manual-1"] : []);
      assert.equal(result.assessmentFailure.coverage.unknownCriterionCount, kind === "unknown_items" ? 1 : 0);
      assert.match(result.error, kind === "duplicate_items" ? /repeated checklist items/u : /outside the confirmed checklist/u);
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_MODEL_ONLY_ID|synthetic-route-key|Every family/u);
      assert.equal(h.state.fetches, 1); assert.equal(h.state.saves, 0); assert.deepEqual(h.state.quote, before);
    } finally {await h.close();}
  }
});

test("actual assess route rejects an outsider, stale delivery and missing consent before any provider request", async () => {
  const h = await routeHarness();
  try {
    const before = structuredClone(h.state.quote);
    assert.equal((await h.call({}, "outsider")).status, 404);
    assert.equal((await h.call({deliveryId: "stale-delivery"})).status, 409);
    assert.equal((await h.call({confirm: false})).status, 400);
    assert.equal(h.state.fetches, 0); assert.equal(h.state.saves, 0); assert.deepEqual(h.state.quote, before);
  } finally {await h.close();}
});
