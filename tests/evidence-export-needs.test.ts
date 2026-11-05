import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessmentItem, ProofQuote} from "../lib/contracts.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";

const at="2026-11-06T00:00:00.000Z";
const need=()=>({schema:"source-evidence-need-v1",reason:"browser_observation",targetFiles:["index.html","theme.css"]});
function fixture():ProofQuote{
  const summary="Deliver an index page and CSS source for manual inspection.",parsed=parseStaticProject({title:"Evidence-need export",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en");
  const delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Shop</title></head><body><p>Home</p></body></html>","theme.css":"body{color:black}"},parsed.project,"en",1);
  const items:ProofAssessmentItem[]=parsed.criteria.map(c=>({criterionId:c.id,status:"insufficient_evidence",explanation:"Source-only synthetic advice; no model, browser or backend was run.",citations:[],ruleEvidenceIds:delivery.evidence.filter(e=>e.criterionId===c.id).map(e=>e.id)}));
  delivery.assessment={id:"assessment-with-evidence-need",deliveryId:delivery.id,method:"source-ai-v1",mode:"live",model:"synthetic-no-call",assessedAt:at,items,risks:[],limitations:["This record cannot establish the truth of an evidence-need reason."],coverage:{includedFiles:["index.html","theme.css"],truncatedFiles:[],omittedFiles:[]}};
  return {id:"need-export-project",reference:"PBP-NEED-EXPORT",workflow:"proof-v1",title:parsed.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Website",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Source checked"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Synthetic delivery"},feedback:[]}}};
}
function item(q:ProofQuote):ProofAssessmentItem{return q.proof.delivery!.assessment!.items[0];}
function putNeed(value:ProofAssessmentItem,metadata:unknown):void{Object.assign(value,{evidenceNeed:metadata});}
const aiRejected=(report:Awaited<ReturnType<typeof verifyEvidenceExport>>)=>report.checks.some(c=>c.id==="ai-source-citations"&&c.status==="inconsistent");

test("valid optional evidence need survives exact current export without becoming a confirmed reason",async()=>{
  const quote=fixture();putNeed(item(quote),need());const before=structuredClone(quote),bundle=await createEvidenceExport(quote);
  assert.equal((await verifyEvidenceExport(JSON.parse(JSON.stringify(bundle)))).consistency,"consistent");
  assert.deepEqual((bundle.delivery.assessment!.items[0] as unknown as Record<string,unknown>).evidenceNeed,need());assert.deepEqual(quote,before);
  assert.equal(bundle.delivery.assessment!.items[0].status,"insufficient_evidence");assert.equal((await verifyEvidenceExport(bundle)).limits.modelJudgment,"not-proven");
});

test("optional evidence need is validated in a retained acceptance assessment as well as the current one",async()=>{
  const quote=fixture();putNeed(item(quote),need());const delivery=quote.proof.delivery!;
  const accepted=acceptDelivery(quote,{confirm:true,deliveryId:delivery.id,manualChecks:delivery.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId)},at);
  const old=accepted.proof.delivery!.acceptanceEvidence![0].assessment!;
  accepted.proof.delivery!.assessment={...structuredClone(old),id:"later-assessment"};delete (accepted.proof.delivery!.assessment.items[0] as unknown as Record<string,unknown>).evidenceNeed;
  const bundle=await createEvidenceExport(accepted);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
  const changed=structuredClone(bundle);putNeed(changed.delivery.acceptanceEvidence![0].assessment!.items[0],{...need(),targetFiles:["not-delivered.html"]});
  assert.ok(aiRejected(await verifyEvidenceExport(changed)));assert.deepEqual((old.items[0] as unknown as Record<string,unknown>).evidenceNeed,need());
});

test("legacy assessments with no evidence need remain byte-for-byte absent after export",async()=>{
  const quote=fixture(),before=structuredClone(quote.proof.delivery!.assessment),bundle=await createEvidenceExport(quote);
  assert.deepEqual(bundle.delivery.assessment,before);assert.ok(bundle.delivery.assessment!.items.every(i=>!Object.hasOwn(i,"evidenceNeed")));assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
});

test("evidence needs reject unsupported metadata and cannot attach to a conclusive item",async()=>{
  const base=await createEvidenceExport(fixture());
  const invalid:unknown[]=[null,[],{}, {...need(),schema:"source-evidence-need-v2"},{...need(),reason:"model_thinks_it_needs_more"},{...need(),targetFiles:undefined},{...need(),targetFiles:"index.html"},{...need(),extra:"not allowed"},{reason:need().reason,targetFiles:[]},{schema:need().schema,targetFiles:[]},{schema:need().schema,reason:need().reason}];
  for(const metadata of invalid){const changed=structuredClone(base);putNeed(changed.delivery.assessment!.items[0],metadata);assert.equal((await verifyEvidenceExport(changed)).consistency,"inconsistent",JSON.stringify(metadata));}
  for(const status of ["supported","changes_suggested"] as const){const changed=structuredClone(base),entry=changed.delivery.assessment!.items[0];entry.status=status;putNeed(entry,need());assert.ok(aiRejected(await verifyEvidenceExport(changed)),status);}
});

test("target files are exact unique provided HTML or CSS names rather than aliases or arbitrary data",async()=>{
  const quote=fixture();
  // Valid synthetic two-by-two PNG retained as a supplied raster, never a text target.
  quote.proof.delivery!.files!["shop.png"]="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNIm1meNrOcAUIBACiyBdnemS6wAAAAAElFTkSuQmCC";
  quote.proof.delivery=createUploadedDelivery(quote.proof.delivery!.files,quote.proof.project!,"en",1);
  const d=quote.proof.delivery;d.assessment={...fixture().proof.delivery!.assessment!,deliveryId:d.id,items:quote.proof.criteria.map(c=>({criterionId:c.id,status:"insufficient_evidence",explanation:"Unverified source need.",citations:[],ruleEvidenceIds:d.evidence.filter(e=>e.criterionId===c.id).map(e=>e.id)}))};quote.proof.review!.deliveryId=d.id;
  const base=await createEvidenceExport(quote);
  for(const targetFiles of [["index.html","index.html"],["INDEX.HTML"],["./index.html"],["index.html?copy"],["missing.css"],["shop.png"],["constructor"],["../index.html"],["x".repeat(301)], [1],Array(41).fill("index.html")]){
    const changed=structuredClone(base);putNeed(changed.delivery.assessment!.items[0],{...need(),targetFiles});assert.ok(aiRejected(await verifyEvidenceExport(changed)),JSON.stringify(targetFiles));
  }
  for(const targetFiles of [[],["index.html"],["theme.css"],["index.html","theme.css"]]){const changed=structuredClone(base);putNeed(changed.delivery.assessment!.items[0],{...need(),targetFiles});assert.equal((await verifyEvidenceExport(changed)).consistency,"consistent",JSON.stringify(targetFiles));}
});

test("all forty provided text targets fit the original inventory bound without truncation",async()=>{
  const quote=fixture(),files={...quote.proof.delivery!.files!};for(let i=0;i<38;i++)files[`page-${i}.html`]=files["index.html"];
  const delivery=createUploadedDelivery(files,quote.proof.project!,"en",1);delivery.assessment={...quote.proof.delivery!.assessment!,deliveryId:delivery.id};quote.proof.delivery=delivery;quote.proof.review!.deliveryId=delivery.id;
  const metadata={...need(),targetFiles:Object.keys(files)};assert.equal(metadata.targetFiles.length,40);putNeed(item(quote),metadata);
  const bundle=await createEvidenceExport(quote);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual((bundle.delivery.assessment!.items[0] as unknown as Record<string,unknown>).evidenceNeed,metadata);
});

test("conflicting immutable assessment metadata is rejected while unsupported accessors are never executed",async()=>{
  const quote=fixture();putNeed(item(quote),need());const d=quote.proof.delivery!;const saved=acceptDelivery(quote,{confirm:true,deliveryId:d.id,manualChecks:d.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId)},at);const bundle=await createEvidenceExport(saved);
  const changed=structuredClone(bundle);putNeed(changed.delivery.acceptanceEvidence![0].assessment!.items[0],{...need(),targetFiles:[]});assert.ok(aiRejected(await verifyEvidenceExport(changed)));
  const accessor=structuredClone(bundle);let executed=false;Object.defineProperty((accessor.delivery.assessment!.items[0] as unknown as Record<string,unknown>).evidenceNeed,"reason",{get(){executed=true;return need().reason;},enumerable:true});
  assert.equal((await verifyEvidenceExport(accessor)).consistency,"inconsistent");assert.equal(executed,false);
});

test('saved obligation metadata binds to original wording in current and frozen acceptance reports',async()=>{
 const {deriveAssessmentObligations}=await import('../lib/assessment-obligations.ts');
 const q=fixture();for(const entry of q.proof.delivery!.assessment!.items)entry.obligations=deriveAssessmentObligations(q.proof.criteria.find(c=>c.id===entry.criterionId)!);
 const before=structuredClone(q),bundle=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(bundle)).consistency,'consistent');assert.deepEqual(q,before);
 const changed=structuredClone(bundle);changed.delivery.assessment!.items[0].obligations!.items[0].state='execution_not_verified';assert.ok(aiRejected(await verifyEvidenceExport(changed)));
 const d=q.proof.delivery!,accepted=acceptDelivery(q,{confirm:true,deliveryId:d.id,manualChecks:d.evidence.filter(e=>e.finding==='needs_human').map(e=>e.criterionId)},at),frozen=await createEvidenceExport(accepted);
 assert.equal((await verifyEvidenceExport(frozen)).consistency,'consistent');frozen.delivery.acceptanceEvidence![0].assessment!.items[0].obligations!.clauses[0].excerpt+=' altered';assert.ok(aiRejected(await verifyEvidenceExport(frozen)));
});
