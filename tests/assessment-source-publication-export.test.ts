import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import type {ProofAssessment,ProofQuote} from "../lib/contracts.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {applyScopeClarification,resolveScopeClarifications} from "../lib/scope-clarifications.ts";
import {createEvidenceExport,verifyEvidenceExport,type EvidenceExport} from "../lib/evidence-export.ts";
import {createEvidenceBundle} from "../lib/evidence-bundle.ts";
import {buildSupplementalEvidenceCatalog} from "../lib/supplemental-evidence.ts";
import {createRevisionAudit,verifyRevisionAudit} from "../lib/revision-audit.ts";
const at="2026-11-06T00:00:00.000Z";
const cases=JSON.parse(await readFile(new URL("./fixtures/noodle-f1-first-four-replay.json",import.meta.url),"utf8")).cases;
async function quote(kind:"price"|"form"|"runtime"="price"):Promise<ProofQuote>{
 const old=cases.find((c:{id:string})=>c.id===`f1-sealed-${kind==="price"?"wrong-object":kind==="form"?"wrong-page":"runtime-insufficient"}`).quote as ProofQuote,spec=old.proof.project!;
 const p=parseStaticProject({title:old.title,summary:old.summary,amount:"1.00",requiredPages:spec.requiredPages,manualRequirements:spec.manualRequirements,
  ...(spec.coverage?{coverage:{version:1,sourceText:spec.coverage.sourceText,confirmed:true,decisions:spec.coverage.decisions.map(d=>({id:d.id,disposition:d.disposition,...(d.reason?{reason:d.reason}:{})}))}}:{}),
  ...(spec.businessChecks?{businessChecks:{confirmed:true,items:spec.businessChecks}}:{})},old.language);
 const d=createUploadedDelivery(old.proof.delivery!.files,p.project,old.language,1);
 let q:ProofQuote={...structuredClone(old),id:`source-publication-${kind}`,reference:"PBP-SOURCE-PUBLICATION",totalCents:100,lineItems:[{id:"controlled",description:"Controlled site",quantity:1,unitPriceCents:100}],status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,
  proof:{demoRoleplay:true,project:p.project,criteria:p.criteria,paymentState:"unfunded",audit:[],delivery:d,review:{deliveryId:d.id,mode:"demo",reviewedAt:at,summary:"Controlled source checks"},collaboration:{stage:"submitted",submission:{deliveryId:d.id,at,note:"Controlled delivery"},feedback:[]}}};
 if(kind==="form"){
  const c=q.proof.criteria.find(c=>c.id==="coverage-2")!;q=await applyScopeClarification(q,"buyer",{action:"propose",deliveryId:d.id,criterionId:c.id,criterionSource:c.source,expectedLatestId:null,target:{kind:"form",file:"contact.html",formId:"contact"},basisNote:"Controlled original contact-form scope."},at);const proposal=q.proof.scopeClarifications![0];
  for(const role of["buyer","seller"]as const)q=await applyScopeClarification(q,role,{action:"confirm",deliveryId:d.id,proposalId:proposal.id,proposalDigest:proposal.digest,confirm:true,basisNote:"Explicitly confirm this same target; not delivery acceptance."},at);
 }return q;
}
async function assessment(q:ProofQuote,rawStatus:"changes_suggested"|"insufficient_evidence"="changes_suggested"):Promise<ProofAssessment>{
 let calls=0;const report=await assessDelivery(q,{DEEPSEEK_API_KEY:"controlled-offline-no-provider",DEEPSEEK_MODEL:"deepseek-flash"},async(_url,init)=>{
  calls++;const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.messages[1].content);
  const slots=(file:string)=>{const entry=packet.citationCatalog.entries.find((e:{file:string})=>e.file===file);assert.ok(entry);return{c1:entry.id,c2:"",c3:"",c4:"",c5:"",c6:""};};
  const items=packet.criteria.map((c:{id:string})=>({criterionId:c.id,status:c.id.startsWith("coverage-")?rawStatus:"insufficient_evidence",explanation:"Controlled raw item before guards; no provider call.",citations:slots(c.id==="coverage-2"?"contact.html":"menu.html")}));
  const response={catalogId:packet.citationCatalog.catalogId,items,risks:[{title:"Controlled unverified optional lead",explanation:"A retained source proposal with no independent risk binding.",suggestion:"Inspect the original source before acting.",citations:{...slots("menu.html"),c4:undefined,c5:undefined,c6:undefined}}],limitations:["Controlled fixture, not model inference."]};
  return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:request.tools[0].function.name,arguments:JSON.stringify(response)}}]}}]});
 });assert.equal(calls,1);return report;
}
async function fixture(kind:"price"|"form"="price"){
 const q=await quote(kind),before=structuredClone(q),report=await assessment(q);assert.deepEqual(q,before);q.proof.delivery!.assessment=report;const bundle=await createEvidenceExport(q);return{q,report,bundle,id:kind==="price"?"coverage-1":"coverage-2"};
}
const bad=async(b:EvidenceExport)=>assert.equal((await verifyEvidenceExport(b)).checks.find(c=>c.id==="ai-source-citations")?.status,"inconsistent");
test("price/form source-publication policy exports with exact canonical evidence and no risk/acceptance release",async()=>{
 for(const kind of["price","form"]as const){const{q,report,bundle,id}=await fixture(kind),item=report.items.find(i=>i.criterionId===id)!;
  assert.equal(item.publicationBasis?.reason,kind==="price"?"locked_price_mismatch":"confirmed_form_label_absence");assert.equal(item.modelJudgment?.status,"changes_suggested");assert.equal(item.status,"changes_suggested");assert.equal(item.explanation,item.sourceFinding!.explanation);assert.deepEqual(item.citations,item.sourceFinding!.citations);assert.equal(item.evidenceNeed,undefined);
  assert.deepEqual(report.publicationPolicy,{schema:"source-publication-v1",reconciledCriterionIds:[id]});assert.equal((await verifyEvidenceExport(JSON.parse(JSON.stringify(bundle)))).consistency,"consistent");assert.deepEqual(bundle.delivery.assessment,report);
  assert.deepEqual(report.risks,[]);assert.equal(report.withheldRisks!.version,4);assert.equal(report.withheldRisks!.entries.length,1);assert.equal(q.proof.acceptedDeliveryId,undefined);assert.equal(q.proof.collaboration!.stage,"submitted");assert.equal(q.proof.paymentState,"unfunded");
 }
});
test("marker/list deletion, extra keys, fake reasons, order and source adoption mutations fail strict export replay",async()=>{
 for(const kind of["price","form"]as const){const{bundle,id}=await fixture(kind);
  const mutations:((b:EvidenceExport)=>void)[]=[b=>{delete b.delivery.assessment!.items.find(i=>i.criterionId===id)!.publicationBasis;},b=>{b.delivery.assessment!.publicationPolicy!.reconciledCriterionIds=[];},b=>{b.delivery.assessment!.publicationPolicy!.reconciledCriterionIds.push(id);},b=>{b.delivery.assessment!.publicationPolicy!.reconciledCriterionIds.push("page-1");},b=>{delete b.delivery.assessment!.publicationPolicy;},b=>{Object.assign(b.delivery.assessment!.publicationPolicy!,{extra:true});},b=>{Object.assign(b.delivery.assessment!.items.find(i=>i.criterionId===id)!.publicationBasis!,{extra:true});},b=>{b.delivery.assessment!.items.find(i=>i.criterionId===id)!.publicationBasis!.reason=kind==="price"?"confirmed_form_label_absence":"locked_price_mismatch";},b=>{b.delivery.assessment!.items.find(i=>i.criterionId===id)!.modelJudgment!.status="insufficient_evidence";},b=>{b.delivery.assessment!.items.find(i=>i.criterionId===id)!.modelJudgment!.status="supported";},b=>{b.delivery.assessment!.items.find(i=>i.criterionId===id)!.modelJudgment!.citations=[];},b=>{b.delivery.assessment!.items.find(i=>i.criterionId===id)!.explanation="Changed canonical adoption";},b=>{b.delivery.assessment!.items.find(i=>i.criterionId===id)!.citations.reverse();b.delivery.assessment!.items.find(i=>i.criterionId===id)!.citations[0].excerpt+="changed";},b=>{b.delivery.assessment!.items.find(i=>i.criterionId===id)!.sourceFinding!.status="supported";},b=>{b.delivery.assessment!.items.find(i=>i.criterionId===id)!.evidenceNeed={schema:"source-evidence-need-v1",reason:"model_unresolved",targetFiles:[]};}];
  for(const mutate of mutations){const b=structuredClone(bundle);mutate(b);await bad(b);}
 }
});
test("new empty policy accepts raw unknowns without source reconciliation or marker requirement",async()=>{
 const q=await quote("price"),report=await assessment(q,"insufficient_evidence");q.proof.delivery!.assessment=report;assert.deepEqual(report.publicationPolicy,{schema:"source-publication-v1",reconciledCriterionIds:[]});assert.ok(report.items.every(i=>i.publicationBasis===undefined));assert.equal((await verifyEvidenceExport(await createEvidenceExport(q))).consistency,"consistent");
});
test("two independent reconciliations require exact original criterion order and reject fake scope references",async()=>{
 let q=await quote("form");const files={...q.proof.delivery!.files!};files["menu.html"]=files["menu.html"].replace("</body>",'<template><p>牛肉面 AUD18</p></template></body>');q.proof.delivery=createUploadedDelivery(files,q.proof.project!,q.language,1);delete q.proof.scopeClarifications;q.proof.review!.deliveryId=q.proof.delivery.id;q.proof.collaboration!.submission!.deliveryId=q.proof.delivery.id;
 const c=q.proof.criteria.find(c=>c.id==="coverage-2")!;q=await applyScopeClarification(q,"buyer",{action:"propose",deliveryId:q.proof.delivery.id,criterionId:c.id,criterionSource:c.source,expectedLatestId:null,target:{kind:"form",file:"contact.html",formId:"contact"},basisNote:"Exact form target."},at);const p=q.proof.scopeClarifications![0];for(const role of["buyer","seller"]as const)q=await applyScopeClarification(q,role,{action:"confirm",deliveryId:q.proof.delivery!.id,proposalId:p.id,proposalDigest:p.digest,confirm:true,basisNote:"Explicit same target confirmation."},at);
 q.proof.delivery!.assessment=await assessment(q);const bundle=await createEvidenceExport(q);assert.deepEqual(bundle.delivery.assessment!.publicationPolicy!.reconciledCriterionIds,["coverage-1","coverage-2"]);
 const swapped=structuredClone(bundle);swapped.delivery.assessment!.publicationPolicy!.reconciledCriterionIds.reverse();await bad(swapped);
 for(const mutation of["scope_file","scope_digest","report_scope"]){const b=structuredClone(bundle),item=b.delivery.assessment!.items.find(i=>i.criterionId==="coverage-2")!;if(mutation==="scope_file")item.sourceFinding!.scopeBinding!.file="index.html";if(mutation==="scope_digest")item.sourceFinding!.scopeBinding!.proposalDigest="0".repeat(64);if(mutation==="report_scope")b.delivery.assessment!.scopeContext!.digest="0".repeat(64);await bad(b);}
});
test("unconfirmed scope cannot borrow a previous bilateral decision, while historical marked report stays replayable",async()=>{
 const{q,report,id}=await fixture("form"),old=structuredClone(report),c=q.proof.criteria.find(c=>c.id===id)!,p=q.proof.scopeClarifications!.at(-1)!;
 const next=await applyScopeClarification(q,"seller",{action:"propose",deliveryId:q.proof.delivery!.id,criterionId:id,criterionSource:c.source,expectedLatestId:p.id,target:{kind:"form",file:"index.html",formId:"other"},basisNote:"New unconfirmed target proposal."});
 assert.equal(next.proof.delivery!.assessment,undefined);assert.deepEqual(next.proof.delivery!.assessmentHistory,[old]);assert.equal((await verifyEvidenceExport(await createEvidenceExport(next))).consistency,"consistent");
 const claimed=structuredClone(next),ctx=await resolveScopeClarifications(claimed);delete claimed.proof.delivery!.assessmentHistory;claimed.proof.delivery!.assessment={...structuredClone(old),scopeContext:{digest:ctx.contextDigest,...ctx.stamp}};await assert.rejects(createEvidenceExport(claimed));
});
test("legacy conservative report remains unchanged alongside new marker in the same-version history",async()=>{
 const{q,report,id}=await fixture("form"),legacy=structuredClone(report);legacy.id="legacy-conservative-report";delete legacy.publicationPolicy;const item=legacy.items.find(i=>i.criterionId===id)!;delete item.publicationBasis;item.status="insufficient_evidence";item.explanation="Retained old conservative relationship finding.";item.evidenceNeed={schema:"source-evidence-need-v1",reason:"manual_interpretation",targetFiles:[]};legacy.withheldRisks={version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:id,originalStatus:"changes_suggested",publishedStatus:"insufficient_evidence"}],entries:structuredClone(report.withheldRisks!.entries)};
 q.proof.delivery!.assessmentHistory=[legacy];const before=structuredClone(q),bundle=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual(bundle.delivery.assessmentHistory,[legacy]);assert.deepEqual(q,before);
});
test("runtime saving/readback items cannot gain publication markers from static source evidence",async()=>{
 const q=await quote("runtime"),report=await assessment(q);q.proof.delivery!.assessment=report;const bundle=await createEvidenceExport(q);
 for(const id of["coverage-2","coverage-3"]){const b=structuredClone(bundle),item=b.delivery.assessment!.items.find(i=>i.criterionId===id)!;assert.equal(item.status,"insufficient_evidence");item.status="changes_suggested";item.publicationBasis={schema:"source-publication-v1",reason:"locked_price_mismatch"};item.sourceFinding={...structuredClone(b.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!.sourceFinding!),status:"changes_suggested"};delete item.evidenceNeed;b.delivery.assessment!.publicationPolicy!.reconciledCriterionIds=[id];await bad(b);}
});
test("selected-revision verification retains a marked archived report and rejects transplanted publication metadata",async()=>{
 const{q,report,bundle}=await fixture("price"),current=structuredClone(q);current.proof.delivery=createUploadedDelivery(q.proof.delivery!.files,q.proof.project!,q.language,2);current.proof.review!.deliveryId=current.proof.delivery.id;current.proof.collaboration!.submission!.deliveryId=current.proof.delivery.id;current.proof.delivery.assessment=await assessment(current);
 const core=await createEvidenceExport(current),catalog=await buildSupplementalEvidenceCatalog(current.proof.delivery.id,core.fileDigest,[]),full=await createEvidenceBundle(current,{catalog,objects:[]});
 const audit=await createRevisionAudit({versions:[{retainedAt:at,isCurrent:false,scope:"archived-core",evidence:bundle},{retainedAt:at,isCurrent:true,scope:"current-full",evidence:full}]});assert.equal((await verifyRevisionAudit(audit)).consistency,"consistent");assert.deepEqual((audit.versions[0].evidence as EvidenceExport).delivery.assessment,report);
 const altered=structuredClone(audit);delete(altered.versions[0].evidence as EvidenceExport).delivery.assessment!.items.find(i=>i.publicationBasis)!.publicationBasis;assert.equal((await verifyRevisionAudit(altered)).consistency,"inconsistent");
});
