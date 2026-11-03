import assert from "node:assert/strict";
import test from "node:test";
import {register} from "node:module";
import type {ProofQuote} from "../lib/contracts.ts";
import {DomainError} from "../lib/domain.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import type {RuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";

const stubUrl="data:text/javascript,export const env = {}";
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(specifier,context,nextResolve){return specifier==="cloudflare:workers"?{url:${JSON.stringify(stubUrl)},shortCircuit:true}:nextResolve(specifier,context);}`)}`,import.meta.url);
const {preflightRuntimeDelivery}=await import("../lib/server-runtime-preflight.ts");
const at="2026-11-03T00:00:00.000Z";

async function fixture(){
  const summary="Each booking accepts at most 6 people.";
  const parsed=parseStaticProject({title:"Connection-only staging",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:"coverage-1",disposition:"include"}]},runtimeCheck:{protocol:"booking-http-v2",criterionId:"coverage-1",confirmed:true,policy:suggestBookingPolicy({start:0,end:summary.length,excerpt:summary})}},"en");
  const delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Saved source</title></head><body><main>private source is not sent to preflight</main></body></html>"},parsed.project,"en",1),digest=await runtimeDeliveryDigest(delivery.files);
  const registration:RuntimeRegistrationSnapshot={id:"seller-preflight",label:"Seller preflight",projectId:"preflight-project",registrationRevision:"review-1",protocol:"booking-http-v2",baseUrl:"https://seller.example.org/pbp/",deploymentRevision:"seller-build-1",frontendBundleDigest:digest,expiresAt:"2036-11-03T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
  delivery.backendTargetId=registration.id;delivery.runtimeDeliveryDigest=digest;delivery.runtimeRegistration=structuredClone(registration);
  const quote:ProofQuote={id:registration.projectId,reference:"PBP-PREFLIGHT",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Saved site",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery}};
  return{quote,registration};
}
const status=(code:number)=>(error:unknown)=>error instanceof DomainError&&error.status===code;

test("server preflight preserves the complete quote and sends only GET meta for its exact approved registration",async()=>{
  const {quote,registration}=await fixture(),before=structuredClone(quote);let calls=0;
  const result=await preflightRuntimeDelivery(quote,{deliveryId:quote.proof.delivery!.id},{registrations:[registration],fetch:async(url,init)=>{
    calls++;assert.equal(url,registration.baseUrl+"meta");assert.equal(init.method,"GET");assert.equal(init.body,undefined);
    return Response.json({revision:registration.deploymentRevision,protocol:registration.protocol,projectId:registration.projectId,registrationRevision:registration.registrationRevision,frontendBundleDigest:registration.frontendBundleDigest,privateDetails:"do not retain"});
  }});
  assert.equal(calls,1);assert.equal(result.status,"matched");assert.deepEqual(quote,before);
  assert.equal(Object.hasOwn(quote.proof.delivery!,"runtimeRun"),false);assert.equal(Object.hasOwn(quote.proof.delivery!,"runtimeReport"),false);assert.equal(quote.proof.audit.length,0);
  assert.equal(JSON.stringify(result).includes("private source"),false);assert.equal(JSON.stringify(result).includes("do not retain"),false);
});

test("stale caller identity, URLs, client metadata, changed files and closed workflow are rejected before any GET",async()=>{
  const {quote,registration}=await fixture();let calls=0;
  const options={registrations:[registration],fetch:async()=>{calls++;throw new Error("must not request");}};
  for(const input of [{deliveryId:"stale-delivery"},{deliveryId:quote.proof.delivery!.id,url:"https://other.example.org/"},{deliveryId:quote.proof.delivery!.id,metadata:{revision:"caller-claim"}}])await assert.rejects(()=>preflightRuntimeDelivery(quote,input,options));
  const changed=structuredClone(quote);changed.proof.delivery!.files!["index.html"]+="changed";
  await assert.rejects(()=>preflightRuntimeDelivery(changed,{deliveryId:changed.proof.delivery!.id},options),status(409));
  const closed=structuredClone(quote);closed.proof.paymentState="captured";
  await assert.rejects(()=>preflightRuntimeDelivery(closed,{deliveryId:closed.proof.delivery!.id},options),status(409));
  assert.equal(calls,0);
});

test("current project, digest, protocol, expiry and entire saved registration fingerprint are required before any GET",async()=>{
  const {quote,registration}=await fixture();let calls=0;const fetcher=async()=>{calls++;throw new Error("must not request");};
  const entries=[[],[{...registration,projectId:"other-project"}],[{...registration,frontendBundleDigest:"d".repeat(64)}],[{...registration,protocol:"booking-http-v1" as const}],[{...registration,expiresAt:"2000-01-01T00:00:00.000Z"}],[{...registration,baseUrl:"https://other.example.org/pbp/"}],[{...registration,registrationRevision:"review-2"}]];
  for(const registrations of entries)await assert.rejects(()=>preflightRuntimeDelivery(quote,{deliveryId:quote.proof.delivery!.id},{registrations,fetch:fetcher}),status(409));
  assert.equal(calls,0);
});
