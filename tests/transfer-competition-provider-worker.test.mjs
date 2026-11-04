import assert from "node:assert/strict";
import test from "node:test";
import {wrapTransferCompetitionTestWorker} from "./transfer-competition-provider-worker.mjs";
import {SYNTHETIC_SANDBOX_CLIENT,SYNTHETIC_SANDBOX_SECRET} from "./sandbox-provider-worker.mjs";
test("local competing-transfer interceptor never permits real egress and reports its unexecuted scope",async()=>{
 const original=globalThis.fetch;try{const wrapped=wrapTransferCompetitionTestWorker({fetch:()=>new Response("app")}),request=new Request("http://127.0.0.1/api/__synthetic_transfer_test_mode");assert.equal((await wrapped.fetch(request,{},{})).status,503);const result=await wrapped.fetch(request,{PAYPAL_CLIENT_ID:SYNTHETIC_SANDBOX_CLIENT,PAYPAL_CLIENT_SECRET:SYNTHETIC_SANDBOX_SECRET},{});assert.deepEqual(await result.json(),{outboundFetch:"blocked",attempts:[],checkpointBeforeIo:true});await wrapped.fetch(new Request("http://127.0.0.1/"),{PAYPAL_CLIENT_ID:SYNTHETIC_SANDBOX_CLIENT,PAYPAL_CLIENT_SECRET:SYNTHETIC_SANDBOX_SECRET},{});await assert.rejects(fetch("https://arbitrary.example.org/"),/blocked/);}finally{globalThis.fetch=original;}
});
