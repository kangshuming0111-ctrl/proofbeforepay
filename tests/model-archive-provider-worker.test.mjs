import assert from "node:assert/strict";
import test from "node:test";
import {wrapModelArchiveTestWorker} from "./model-archive-provider-worker.mjs";
import {SYNTHETIC_SANDBOX_CLIENT,SYNTHETIC_SANDBOX_SECRET} from "./sandbox-provider-worker.mjs";
const config={PAYPAL_CLIENT_ID:SYNTHETIC_SANDBOX_CLIENT,PAYPAL_CLIENT_SECRET:SYNTHETIC_SANDBOX_SECRET,DEEPSEEK_API_KEY:""};

test("archive fixture returns explicit metadata503 only after a durable lease and retains zero provider calls",async()=>{
 const original=globalThis.fetch;
 try{
  const quote={proof:{delivery:{modelRun:{id:"synthetic-model-run",registration:{backendBaseUrl:"https://seller-journey.synthetic.example/pbp/"},trace:[{completedOrdinal:null}]},modelEvidenceReservation:{runId:"synthetic-model-run"}}}};
  const env={...config,DB:{prepare(sql){assert.match(sql,/modelRun/u);return{async all(){return{results:[{payload:JSON.stringify(quote)}]};}};}}};
  const worker=wrapModelArchiveTestWorker({async fetch(){const response=await fetch("https://seller-journey.synthetic.example/pbp/meta");assert.equal(response.status,503);return Response.json({local:true});}});
  await worker.fetch(new Request("http://127.0.0.1/api/test"),env,{});
  const marker=await(await worker.fetch(new Request("http://127.0.0.1/api/__synthetic_model_archive_test_mode"),env,{})).json();
  assert.equal(marker.backendAttempts,1);assert.equal(marker.checkpointBeforeIo,true);assert.equal(marker.observations[0].method,"GET");
  const provider=await(await worker.fetch(new Request("http://127.0.0.1/api/__synthetic_sandbox_test_mode"),env,{})).json();assert.equal(provider.syntheticCalls,0);
  await assert.rejects(fetch("https://outside.example/private"),/external network access is blocked/u);
 }finally{globalThis.fetch=original;}
});

test("archive fixture administration is unavailable without fixed synthetic env or outside loopback",async()=>{
 const original=globalThis.fetch;
 try{
  const worker=wrapModelArchiveTestWorker({fetch(){throw new Error("Must not enter app.");}});
  const request=()=>new Request("https://outside.example/api/__synthetic_model_archive_admin",{method:"POST",body:JSON.stringify({action:"inspect",projectId:"00000000-0000-4000-8000-000000000000"})});
  assert.equal((await worker.fetch(request(),{},{})).status,503);
  assert.equal((await worker.fetch(request(),config,{})).status,403);
 }finally{globalThis.fetch=original;}
});
