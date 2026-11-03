import assert from "node:assert/strict";
import test from "node:test";
import {DomainError} from "../lib/domain.ts";
import {ProviderError,type Fetcher} from "../lib/providers.ts";
import {modelFixture,completeModel,modelConsent} from "./model-check-fixture.ts";
import {modelEvidenceContext,parseModelEvidenceProposal,saveModelEvidenceExplanation,currentModelEvidenceExplanation,validateModelEvidenceExplanation,MODEL_EXPLANATION_BYTES} from "../lib/model-evidence-explanation.ts";
import {explainModelEvidence} from "../lib/model-evidence-provider.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {acceptDelivery,prepareReplacement} from "../lib/proof-workflow.ts";
import {createUploadedDelivery} from "../lib/static-project.ts";
import {acceptanceBasis} from "../lib/acceptance-basis.ts";

const env={DEEPSEEK_API_KEY:"synthetic-no-network-key",DEEPSEEK_MODEL:"synthetic-model"};
async function fixture(){const f=await modelFixture(),quote=completeModel(f.quote,f.digest,f.registration,4,"violated"),report=quote.proof.delivery!.modelReport!,input={confirm:true,deliveryId:report.deliveryId,reportId:report.id,previousExplanationId:null};return{...f,quote,report,input};}
const proposal=(ids:string[])=>({findings:[{findingIds:[ids[0]],explanation:"The saved synthetic observations show a state difference; no source-code root cause is established.",retest:"After a repair, explicitly authorize a fresh isolated experiment and reconcile the saved receipts."}],limitations:["Seller-controlled readbacks do not attest deployed source or all-site correctness."]});
const fake=(value:unknown,inspect?:(url:string,init:RequestInit)=>void)=>(async(url:string|URL|Request,init?:RequestInit)=>{inspect?.(String(url),init!);return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:100,completion_tokens:70}});})as Fetcher;

test("model evidence context is exact-bound, readonly and omits source/payment/customer/raw wire values",async()=>{
 const f=await fixture(),before=structuredClone(f.quote),context=await modelEvidenceContext(f.quote,"buyer",{...f.input,language:"zh"}),packet=JSON.stringify(context);
 assert.equal(context.binding.reportId,f.report.id);assert.equal(context.binding.deliveryDigest,f.digest);assert.ok(context.binding.findingIds.includes("original_booking_status"));assert.equal(context.evidence.outcome,"violated");assert.equal(context.evidence.scope.acceptance,false);assert.equal(context.evidence.scope.payment,false);
 for(const forbidden of[f.registration.backendBaseUrl,"native-x","pbp-test@example.invalid","idempotencyKey","<html>","authorizationId"])assert.ok(!packet.includes(forbidden),forbidden);
 assert.deepEqual(f.quote,before);
});
test("consent, member role, report/previous explanation and actual file/plan bindings reject before model I/O",async()=>{
 const f=await fixture();await assert.rejects(()=>modelEvidenceContext(f.quote,"intruder"as"buyer",f.input),(e:unknown)=>e instanceof DomainError&&e.status===403);
 for(const change of[{confirm:false},{deliveryId:"old"},{reportId:"old"},{previousExplanationId:"other"},{language:"fr"},{report:f.report},{accepted:true}])await assert.rejects(()=>modelEvidenceContext(f.quote,"buyer",{...f.input,...change}),DomainError);
 const changed=structuredClone(f.quote);changed.proof.delivery!.files!["index.html"]+="changed";await assert.rejects(()=>modelEvidenceContext(changed,"buyer",f.input),DomainError);
 const plan=structuredClone(f.quote);plan.proof.delivery!.journeyPlan!.planDigest="e".repeat(64);await assert.rejects(()=>modelEvidenceContext(plan,"buyer",f.input),DomainError);
 for(const key of["modelRun","journeyRun","runtimeRun"]as const){const pending=structuredClone(f.quote);pending.proof.delivery![key]={}as never;await assert.rejects(()=>modelEvidenceContext(pending,"buyer",f.input),/pending evidence/);}
});
test("AI groups cite only derived diagnostic IDs and cannot attach verdict, priority, acceptance or payment fields",async()=>{
 const f=await fixture(),c=await modelEvidenceContext(f.quote,"seller",f.input),p=proposal(c.binding.findingIds);
 assert.deepEqual(parseModelEvidenceProposal(p,c.binding),p);
 for(const value of[{...p,verdict:"compatible"},{...p,payment:"capture"},{...p,findings:[{...p.findings[0],priority:"high"}]},{...p,findings:[{...p.findings[0],findingIds:["invented"]}]},{...p,findings:[{...p.findings[0],findingIds:[c.binding.findingIds[0],c.binding.findingIds[0]]}]},{...p,findings:[{...p.findings[0],explanation:"x".repeat(501)}]},{...p,limitations:[]},{...p,findings:[]}])assert.throws(()=>parseModelEvidenceProposal(value,c.binding),DomainError);
});
test("one mocked provider call saves exact evidence explanation without changing review, verdict or financial state",async()=>{
 const f=await fixture(),c=await modelEvidenceContext(f.quote,"buyer",{...f.input,language:"zh"}),before=structuredClone(f.quote);let calls=0;
 const result=await explainModelEvidence(c,env,fake(proposal(c.binding.findingIds),(url,init)=>{calls++;assert.equal(url,"https://api.deepseek.com/chat/completions");assert.equal(init.redirect,"manual");const sent=JSON.parse(init.body as string);assert.match(sent.messages[0].content,/UNTRUSTED DATA/);assert.match(sent.messages[0].content,/Simplified Chinese/);assert.deepEqual(JSON.parse(sent.messages[1].content).binding,c.binding);}));
 assert.equal(calls,1);assert.equal(result.mode,"live");assert.ok(Buffer.byteLength(JSON.stringify(result))<=MODEL_EXPLANATION_BYTES);
 const saved=await saveModelEvidenceExplanation(f.quote,"buyer",f.input,result);assert.deepEqual(await currentModelEvidenceExplanation(saved),result);const restored=structuredClone(saved);delete restored.proof.delivery!.modelExplanation;assert.deepEqual(restored,before);assert.deepEqual(acceptanceBasis(saved),acceptanceBasis(before));
 await assert.rejects(()=>saveModelEvidenceExplanation(saved,"buyer",f.input,result),/explanation changed/);
 const newer=completeModel(saved,f.digest,f.registration,0);assert.equal(await currentModelEvidenceExplanation(newer),undefined);await assert.rejects(()=>saveModelEvidenceExplanation(newer,"buyer",f.input,result),DomainError);
});
test("no key and invalid, redirected or failed model responses leave the saved verdict unchanged",async()=>{
 const f=await fixture(),before=structuredClone(f.quote),c=await modelEvidenceContext(f.quote,"buyer",f.input);let calls=0;
 await assert.rejects(()=>explainModelEvidence(c,{},fake(proposal(c.binding.findingIds),()=>{calls++;})),(e:unknown)=>e instanceof DomainError&&e.code==="MODEL_EXPLANATION_UNAVAILABLE");assert.equal(calls,0);
 for(const reply of[{choices:[]},{choices:[{finish_reason:"length",message:{content:JSON.stringify(proposal(c.binding.findingIds))}}]},{choices:[{finish_reason:"stop",message:{content:"not json"}}]}])await assert.rejects(()=>explainModelEvidence(c,env,(async()=>Response.json(reply))as Fetcher),ProviderError);
 for(const status of[302,429,500])await assert.rejects(()=>explainModelEvidence(c,env,(async()=>Response.json({private:"not disclosed"},{status}))as Fetcher),ProviderError);
 assert.deepEqual(f.quote,before);
});
test("stored explanations validate binding/version/inventory and exports resolve retained A instead of current B",async()=>{
 const f=await fixture(),c=await modelEvidenceContext(f.quote,"buyer",f.input),result=await explainModelEvidence(c,env,fake(proposal(c.binding.findingIds)));
 for(const change of[{reportId:"other"},{diagnosisRevision:"future"},{findingIds:[]},{deliveryDigest:"e".repeat(64)},{modelSpecDigest:"e".repeat(64)},{usage:{promptTokens:-1,completionTokens:0}},{generatedAt:"invalid"},{accepted:true}])assert.throws(()=>validateModelEvidenceExplanation({...result,...change},c.binding),DomainError);
 const saved=await saveModelEvidenceExplanation(f.quote,"buyer",f.input,result),bundle=await createEvidenceExport(saved);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
 const newer=completeModel(saved,f.digest,f.registration,0);const nextBundle=await createEvidenceExport(newer);assert.equal((await verifyEvidenceExport(nextBundle)).consistency,"consistent");assert.equal(nextBundle.delivery.modelExplanation!.reportId,f.report.id);
 const bad=structuredClone(nextBundle);bad.delivery.modelExplanation!.reportId=newer.proof.delivery!.modelReport!.id;assert.equal((await verifyEvidenceExport(bad)).consistency,"inconsistent");
});
test("post-acceptance explanatory advice preserves frozen A, and a replacement has no inherited current explanation",async()=>{
 const f=await fixture(),accepted=acceptDelivery(f.quote,modelConsent(f.quote)),snapshot=structuredClone(accepted.proof.delivery!.acceptanceEvidence),basis=acceptanceBasis(accepted),c=await modelEvidenceContext(accepted,"seller",f.input),explanation=await explainModelEvidence(c,env,fake(proposal(c.binding.findingIds))),saved=await saveModelEvidenceExplanation(accepted,"seller",f.input,explanation);
 assert.deepEqual(saved.proof.delivery!.acceptanceEvidence,snapshot);assert.deepEqual(acceptanceBasis(saved),basis);assert.equal(saved.proof.paymentState,accepted.proof.paymentState);
 // Normal replacement is tested while seller edits a returned, unpaid version.
 const returned=structuredClone(saved);returned.proof.collaboration!.stage="changes_requested";const replacement=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Revised</title></head><body>Revised</body></html>"},returned.proof.project!,"en",2);replacement.modelExplanation=explanation;const replacing=prepareReplacement(returned,replacement);assert.equal(replacing.proof.delivery!.modelExplanation,undefined);
});
