import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessment,ProofQuote} from "../lib/contracts.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {createEvidenceExport,verifyEvidenceExport,type EvidenceExport} from "../lib/evidence-export.ts";
import {createAssessmentSourceFindingCheck} from "../lib/assessment-source-findings.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {resolveAssessmentScopeContext} from "../lib/scope-clarifications.ts";
import {verifyAssessmentProvenanceMetadata} from "../scripts/replay-evidence-actions-2026-11-06.mjs";

const at="2026-11-07T00:00:00.000Z";
const html=(body:string)=>`<!doctype html><html><head><title>Menu</title></head><body>${body}</body></html>`;
const card=(label:string,price="AUD18")=>`<div class="menu-item"><h3>${label}</h3><p class="price">${price}</p></div>`;
async function run({body=card("牛肉面")+card("Beef noodles"),css="body{font-family:system-ui}",compound=false,raw="supported"}:{body?:string;css?:string;compound?:boolean;raw?:ProofAssessment["items"][number]["status"]}={}){
 const summary="菜单的牛肉面和Beef noodles标价必须为AUD18"+(compound?"且营业时间必须为上午11点到晚上8点。":"。"),units=summaryCoverageUnits(summary),unit=units[0];assert.equal(units.length,1);
 const parsed=parseStaticProject({title:"Controlled menu DOM",summary,amount:"1.00",requiredPages:["index.html","menu.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(u=>({id:u.id,disposition:"include"}))},businessChecks:{confirmed:true,items:["牛肉面","Beef noodles"].map((label,i)=>({id:`business-${i+1}`,criterionId:"coverage-1",file:"menu.html",source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:"item_price",label,amountMinor:1800,currency:"AUD"}}))}},"zh");
 const files={"index.html":html("<p>Home</p>"),"menu.html":html(body),"site.css":css},delivery=createUploadedDelivery(files,parsed.project,"zh",1);
 const quote:ProofQuote={id:"controlled-dom-project",reference:"PBP-CONTROLLED-DOM",title:parsed.title,summary,brief:summary,language:"zh",workflow:"proof-v1",status:"approved",aiMode:"demo",paymentMode:"demo",clientName:"Fictional local fixture",currency:"AUD",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,createdAt:at,proof:{demoRoleplay:true,project:parsed.project,criteria:parsed.criteria,delivery,paymentState:"unfunded",audit:[],review:{deliveryId:delivery.id,mode:"demo",reviewedAt:at,summary:"Controlled source checks"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Controlled fictional source"},feedback:[]}}};
 let packet:any,wire:any,callbacks=0;const before=structuredClone(quote);
 const report=await assessDelivery(quote,{DEEPSEEK_API_KEY:"controlled-no-provider",DEEPSEEK_MODEL:"deepseek-flash"},async(_url,init)=>{callbacks++;const request=JSON.parse(String(init?.body));packet=JSON.parse(request.messages[1].content);const whole=packet.citationCatalog.entries.find((e:{file:string;start:number;end:number})=>e.file==="menu.html"&&e.start===0&&e.end===files["menu.html"].length);assert.ok(whole);
  wire=packet.criteria.map((c:{id:string})=>({criterionId:c.id,status:c.id==="coverage-1"?raw:"insufficient_evidence",explanation:"Controlled response only, not an AI inference evaluation.",citations:{c1:whole.id,c2:"",c3:"",c4:"",c5:"",c6:""}}));
  return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:request.tools[0].function.name,arguments:JSON.stringify({catalogId:packet.citationCatalog.catalogId,items:wire,risks:[],limitations:["Fictional intercepted response, no provider call."]})}}]}}]});
 });assert.equal(callbacks,1);assert.deepEqual(quote,before);quote.proof.delivery!.assessment=report;
 return{quote,report,packet,wire,item:report.items.find(i=>i.criterionId==="coverage-1")!,bundle:await createEvidenceExport(quote)};
}
const check=async(bundle:EvidenceExport)=>(await verifyEvidenceExport(bundle)).checks.find(c=>c.id==="ai-source-citations")!.status;
const affirm=(bundle:EvidenceExport)=>{const report=bundle.delivery.assessment!,item=report.items.find(i=>i.criterionId==="coverage-1")!;item.status="supported";delete item.evidenceNeed;report.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};};

test("schema2 inline/card reports export exact full owners and separate raw/model/source layers",async()=>{
 for(const body of[card("牛肉面")+card("Beef noodles"),"<p><strong>牛肉面</strong> <span>AUD18</span></p><p><span>Beef noodles</span> <strong>AUD18</strong></p>"]){
  const{quote,report,item,bundle}=await run({body});assert.equal(report.publicationPolicy!.schema,"source-publication-v2");assert.equal(item.sourceFinding!.version,"source-finding-v2");assert.equal(item.sourceFinding!.status,"supported");assert.equal(item.status,"supported");assert.equal(item.publicationBasis!.schema,"source-publication-v2");
  assert.ok(item.citations.every(c=>c.excerpt===quote.proof.delivery!.files![c.file].slice(c.start,c.end)));assert.deepEqual(item.citations,item.sourceFinding!.citations);assert.equal(await check(bundle),"consistent");assert.equal(quote.proof.acceptedDeliveryId,undefined);assert.equal(quote.proof.paymentState,"unfunded");
 }
});

test("marker/fact/report versions cannot independently select a wider owner reader",async()=>{
 const{bundle}=await run();
 for(const mutate of[(b:EvidenceExport)=>{b.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!.sourceFinding!.version="source-finding-v1";},(b:EvidenceExport)=>{b.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!.publicationBasis!.schema="source-publication-v1";},(b:EvidenceExport)=>{b.delivery.assessment!.publicationPolicy!.schema="source-publication-v1";},(b:EvidenceExport)=>{delete b.delivery.assessment!.publicationPolicy;},(b:EvidenceExport)=>{const r=b.delivery.assessment!;r.publicationPolicy!.schema="source-publication-v1";for(const i of r.items){if(i.sourceFinding)i.sourceFinding.version="source-finding-v1";if(i.publicationBasis)i.publicationBasis.schema="source-publication-v1";}}]){
  const changed=structuredClone(bundle);mutate(changed);assert.equal(await check(changed),"inconsistent");
 }
});

test("schema2 unknown or negative source cannot gain support from invented correct facts",async()=>{
 for(const input of[{raw:"insufficient_evidence"as const},{body:card("牛肉面","AUD28")+card("Beef noodles","AUD28"),raw:"changes_suggested"as const}]){
  const{bundle}=await run(input),changed=structuredClone(bundle),item=changed.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!;assert.notEqual(item.status,"supported");
  affirm(changed);item.sourceFinding!.status="supported";delete item.publicationBasis;changed.delivery.assessment!.publicationPolicy!.reconciledCriterionIds=[];assert.equal(await check(changed),"inconsistent");
 }
});

test("ordinary no-marker price paths reject partial CSS and unsafe CSS while retaining source subfacts",async()=>{
 const body="<p>牛肉面 AUD18</p><p>Beef noodles AUD18</p>",normal=await run({body});assert.equal(normal.item.status,"supported");assert.equal(normal.item.publicationBasis,undefined);
 for(const kind of["truncated","omitted"]){const changed=structuredClone(normal.bundle);if(kind==="truncated")changed.delivery.assessment!.coverage.truncatedFiles.push("site.css");else{changed.delivery.assessment!.coverage.omittedFiles.push("site.css");changed.delivery.assessment!.coverage.includedFiles=changed.delivery.assessment!.coverage.includedFiles.filter(f=>f!=="site.css");}assert.equal(changed.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!.sourceFinding!.status,"supported");assert.equal(await check(changed),"inconsistent");}
 for(const css of["p{display:none}","body{opacity:0}"]){const sample=await run({body,css});assert.equal(sample.item.status,"insufficient_evidence");assert.equal(sample.item.sourceFinding!.status,"supported");assert.equal(sample.item.publicationBasis,undefined);const fake=structuredClone(sample.bundle);affirm(fake);assert.equal(await check(fake),"inconsistent");}
});

test("schema2 cannot delete its whole-original policy to approve a compound ordinary requirement",async()=>{
 const{bundle,item}=await run({body:"<p>牛肉面 AUD18</p><p>Beef noodles AUD18</p>",compound:true});assert.equal(item.status,"insufficient_evidence");assert.equal(item.sourceFinding!.status,"supported");assert.equal(item.publicationBasis,undefined);
 const changed=structuredClone(bundle);affirm(changed);delete changed.delivery.assessment!.requirementCompletenessPolicy;assert.equal(await check(changed),"inconsistent");
});

test("a controlled v1 unknown remains immutable beside a new v2 card result",async()=>{
 const{quote,report}=await run(),legacy=structuredClone(report);legacy.id="controlled-prior-v1-card-unknown";legacy.publicationPolicy={schema:"source-publication-v1",reconciledCriterionIds:[]};
 const source=createAssessmentSourceFindingCheck({files:quote.proof.delivery!.files!,coverage:legacy.coverage,language:quote.language,businessSteps:getBusinessCheckPlan(quote),scope:await resolveAssessmentScopeContext(quote,legacy),version:"source-finding-v1"});
 for(const item of legacy.items){delete item.publicationBasis;const fact=source(quote.proof.criteria.find(c=>c.id===item.criterionId)!);if(fact)item.sourceFinding=fact;else delete item.sourceFinding;if(item.criterionId==="coverage-1"){item.status="insufficient_evidence";item.explanation="Controlled old policy cannot locate this owner; no saved provider execution is claimed.";item.evidenceNeed={schema:"source-evidence-need-v1",reason:"source_ambiguity",targetFiles:["menu.html"]};}}
 legacy.withheldRisks={version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:"coverage-1",originalStatus:"supported",publishedStatus:"insufficient_evidence"}],entries:[]};const before=structuredClone(legacy);quote.proof.delivery!.assessmentHistory=[legacy];const bundle=await createEvidenceExport(quote);assert.equal(await check(bundle),"consistent");assert.deepEqual(bundle.delivery.assessmentHistory,[before]);assert.deepEqual(legacy,before);
 const fake=structuredClone(bundle);fake.delivery.assessmentHistory![0].items.find(i=>i.criterionId==="coverage-1")!.sourceFinding=structuredClone(report.items.find(i=>i.criterionId==="coverage-1")!.sourceFinding);assert.equal(await check(fake),"inconsistent");
});

test("strict retained replay validates v2 admission without swallowing its real core changes",async()=>{
 const{quote,report,packet,wire}=await run();const same=await verifyAssessmentProvenanceMetadata(report,structuredClone(report),packet,quote,wire);assert.equal(same.accounting.publicationMarkersRecomputed,1);assert.equal(same.report.items.find((i:any)=>i.criterionId==="coverage-1").status,"supported");
 const malformed=structuredClone(report);malformed.items.find(i=>i.criterionId==="coverage-1")!.publicationBasis!.schema="source-publication-v1";await assert.rejects(verifyAssessmentProvenanceMetadata(malformed,report,packet,quote,wire));
});
