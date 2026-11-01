import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanJudgeEnvironment, judgeConfig, prepareJudgeSource, validateNode, verifyJudgeReady } from "../scripts/judge-demo.mjs";

test("the isolated snapshot excludes caller env files and hosting identity without an archive subprocess", async () => {
  const root=await mkdtemp(path.join(tmpdir(),'pbp-judge-copy-test-')), source=path.join(root,'input'), run=path.join(root,'run');
  await mkdir(path.join(source,'.openai'),{recursive:true});await mkdir(path.join(source,'lib'));await mkdir(run);
  await writeFile(path.join(source,'README.md'),'# Synthetic source');await writeFile(path.join(source,'package.json'),'{}');await writeFile(path.join(source,'lib','main.ts'),'export const safe = true;');
  await writeFile(path.join(source,'.env'),'PRIVATE_ENV=not-copied');await writeFile(path.join(source,'.dev.vars'),'DEEPSEEK_API_KEY=not-copied');await writeFile(path.join(source,'.openai','hosting.json'),'{"project_id":"private-site","d1":"PRIVATE_DB"}');
  const copy=await prepareJudgeSource(source,run);
  assert.equal(copy.files,4);assert.deepEqual(JSON.parse(await readFile(path.join(copy.sourceDirectory,'.openai','hosting.json'),'utf8')),{d1:'DB',r2:null});
  assert.deepEqual((await readdir(copy.sourceDirectory)).sort(),['.openai','README.md','lib','package.json']);
  const manifestText=await readFile(path.join(run,'source-manifest.json'),'utf8');
  assert.doesNotMatch(manifestText,/PRIVATE_|private-site|not-copied/);
  const manifest=JSON.parse(manifestText);
  assert.deepEqual(manifest.files.map(entry=>entry.file).sort(),['.openai/hosting.json','README.md','lib/main.ts','package.json']);
  for(const entry of manifest.files){const bytes=await readFile(path.join(copy.sourceDirectory,entry.file));assert.equal(entry.bytes,bytes.length);assert.equal(entry.sha256,createHash('sha256').update(bytes).digest('hex'));}
  await assert.rejects(prepareJudgeSource(source,run),error=>error.code==='EEXIST');
});

test("judge subprocesses receive no caller provider, preload, auth or npm configuration", () => {
  const original = { PATH:"/usr/bin", LANG:"en_AU.UTF-8", HOME:"/private/home", DEEPSEEK_API_KEY:"caller-key", PAYPAL_CLIENT_SECRET:"caller-secret", CLOUDFLARE_API_TOKEN:"caller-token", NODE_OPTIONS:"--import=/caller/preload.js", NPM_CONFIG_USERCONFIG:"/caller/private.npmrc", HTTPS_PROXY:"https://private.example.test" };
  const before = structuredClone(original), env = cleanJudgeEnvironment(original, "/isolated/run", "/node/bin/node");
  assert.deepEqual(original,before);
  assert.equal(env.DEEPSEEK_API_KEY, ""); assert.equal(env.PAYPAL_CLIENT_SECRET, "");
  for (const name of ["HOME", "NODE_OPTIONS", "CLOUDFLARE_API_TOKEN", "HTTPS_PROXY"]) assert.equal(Object.hasOwn(env,name),false);
  assert.equal(env.NPM_CONFIG_USERCONFIG,"/isolated/run/empty.npmrc");
  assert.equal(env.NPM_CONFIG_REGISTRY,"https://registry.npmjs.org/");
  assert.equal(env.XDG_CONFIG_HOME,"/isolated/run/tool-config");
});

test("Node minimum is explicit before setup", () => {
  for (const version of ["20.19.0","22.12.0","unknown"]) assert.throws(()=>validateNode(version),/22.13/);
  for (const version of ["22.13.0","24.22.1","26.0.0"]) assert.doesNotThrow(()=>validateNode(version));
});

test("only a unique local middleware marker can identify the ready session", async () => {
  let calls=0;
  assert.equal(await verifyJudgeReady("http://127.0.0.1:55321", "expected", 321, async()=>{calls++;return Response.json({session:"someone-else",pid:321,providerFree:true});}),false);
  assert.equal(calls,1);
  for (const origin of ["https://example.test", "http://localhost:55321", "http://127.0.0.1:55321/path", "http://user:pass@127.0.0.1:55321", "http://127.0.0.1:55321?x=1"]) {
    await assert.rejects(verifyJudgeReady(origin,"expected",321,async()=>{throw Error("must not fetch");}),/loopback/);
  }
  assert.equal(await verifyJudgeReady("http://127.0.0.1:55321", "expected", 321, async()=>Response.json({session:"expected",pid:999,providerFree:true})),false);
});

function fixture({live=false, badLogin=false, dbMissing=false}={}) {
  const calls=[];
  return {calls,fetcher:async(url,init)=>{
    calls.push({path:new URL(url).pathname,redirect:init.redirect,cookie:init.headers?.cookie});
    switch(new URL(url).pathname){
      case "/__proofbeforepay_judge_ready":return Response.json({session:"expected",pid:321,providerFree:true});
      case "/api/config":return Response.json({aiMode:live?"live":"demo",paymentMode:"demo"});
      case "/signin-with-chatgpt":return new Response(null,{status:302,headers:{location:badLogin?"https://elsewhere.test":"/","set-cookie":"local-test=1; HttpOnly; SameSite=Lax"}});
      case "/api/proofs":assert.equal(init.headers.cookie,"local-test=1");return Response.json(dbMissing?{error:"table missing"}:{quotes:[]},{status:dbMissing?500:200});
      default:throw Error("Unexpected route");
    }
  }};
}

test("readiness requires demo provider modes, existing local sign-in and working D1", async () => {
  const ok=fixture(); assert.equal(await verifyJudgeReady("http://127.0.0.1:55321","expected",321,ok.fetcher),true);
  assert.deepEqual(ok.calls.map(c=>c.path),["/__proofbeforepay_judge_ready","/api/config","/signin-with-chatgpt","/api/proofs"]);
  assert.ok(ok.calls.every(c=>c.redirect==="manual"));
  const live=fixture({live:true});await assert.rejects(verifyJudgeReady("http://127.0.0.1:55321","expected",321,live.fetcher),/unexpectedly enabled/);assert.equal(live.calls.length,2);
  const login=fixture({badLogin:true});assert.equal(await verifyJudgeReady("http://127.0.0.1:55321","expected",321,login.fetcher),false);assert.equal(login.calls.length,3);
  const db=fixture({dbMissing:true});assert.equal(await verifyJudgeReady("http://127.0.0.1:55321","expected",321,db.fetcher),false);
});

test("a warm-up HTML fallback or malformed JSON stays not-ready and records a safe diagnostic", async () => {
  for (const [response, expected] of [[new Response('<html>private content is not copied into diagnostics</html>',{status:200,headers:{'content-type':'text/html'}}),/non-JSON/],[new Response('{invalid',{status:200,headers:{'content-type':'application/json'}}),/invalid JSON/]]) {
    const messages=[];
    assert.equal(await verifyJudgeReady("http://127.0.0.1:55321","expected",321,async()=>response,message=>messages.push(message)),false);
    assert.match(messages.at(-1),expected);assert.doesNotMatch(messages.join(' '),/private content|invalid\{/);
  }
});

test("generated local readiness configuration preserves the real config and locks loopback/port", () => {
  const config=judgeConfig("12345678-1234-4234-8234-123456789abc",55321);
  assert.match(config,/import original from ".\/vite.original.config"/);
  assert.match(config,/host: "127.0.0.1", port: 55321, strictPort: true/);
  assert.match(config,/__proofbeforepay_judge_ready/);
  assert.match(config,/\.\.\.\(base.plugins \?\? \[\]\)/);
  assert.throws(()=>judgeConfig('"; unwanted();',55321),/Invalid/);
  for(const port of [0,-1,65536,1.5,NaN]) assert.throws(()=>judgeConfig("12345678-1234-4234-8234-123456789abc",port),/Invalid/);
});
