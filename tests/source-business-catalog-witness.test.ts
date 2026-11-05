import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessDeliveryCatalogReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {projectQuote,validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";
import type {AssessmentCitationCatalog} from "../lib/assessment-citation-catalog.ts";
const corpus=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-project-corpus-2026-11-04.json",import.meta.url),"utf8")));
const html=(price=18)=>`<!doctype html><html><head><title>Tea</title></head><body><h1>Menu board</h1><p>Tea AUD ${price}</p><p>Coffee AUD 18</p></body></html>`;
function quote(price=18){
 const summary="Display the Tea price on both agreed menu pages.",u=summaryCoverageUnits(summary)[0];
 const parsed=parseStaticProject({title:"Scoped Tea menu",summary,amount:"1.00",requiredPages:["index.html","menu.html"],manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:[{id:u.id,disposition:"include"}]},businessChecks:{confirmed:true,items:["index.html","menu.html"].map((file,i)=>({id:`business-${i+1}`,criterionId:"coverage-1",file,source:{start:u.start,end:u.end,excerpt:u.text},expected:{kind:"item_price",label:"Tea",currency:"AUD",amountMinor:1800}}))}},"en");
 const q=projectQuote(corpus.projects[0]);q.language="en";q.summary=summary;q.proof.project=parsed.project;q.proof.criteria=parsed.criteria;
 q.proof.delivery=createUploadedDelivery({"index.html":html(),"menu.html":html(price),"about.html":html()},parsed.project,"en",1);
 q.proof.review={deliveryId:q.proof.delivery.id,reviewedAt:q.createdAt,mode:"demo",summary:"Controlled source rules."};return q;
}
async function evaluate(mode:"right"|"wrong-page"|"partial"|"wrong-field"|"header",raw="supported",price=18){
 const q=quote(price),before=structuredClone(q);let calls=0;
 const report=await assessDelivery(q,{DEEPSEEK_API_KEY:"offline-controlled-no-network"},async(_url,init)=>{
  calls++;const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content)as{citationCatalog:AssessmentCitationCatalog};
  const span=(file:string,text:string)=>{const s=p.citationCatalog.entries.find(e=>e.file===file&&e.excerpt===text);assert.ok(s);return s.id;};
  const ids=mode==="right"?[span("index.html","<p>Tea AUD 18</p>"),span("menu.html",`<p>Tea AUD ${price}</p>`)]:mode==="wrong-page"?[span("about.html","<p>Tea AUD 18</p>")]:mode==="partial"?[span("index.html","<p>Tea AUD 18</p>")]:mode==="wrong-field"?[span("index.html","<p>Coffee AUD 18</p>"),span("menu.html","<p>Coffee AUD 18</p>")]:[span("index.html","<h1>Menu board</h1>"),span("menu.html","<h1>Menu board</h1>")];
  const out={catalogId:p.citationCatalog.catalogId,items:q.proof.criteria.map(c=>({criterionId:c.id,status:raw,explanation:"Controlled model output.",citations:ids})),risks:[],limitations:[]};
  return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:"submit_source_assessment_v2",arguments:JSON.stringify(out)}}]}}]});
 });assert.equal(calls,1);assert.deepEqual(q,before);return report.items.find(c=>c.criterionId==="coverage-1")!;
}
for(const mode of ["wrong-page","partial","wrong-field","header"] as const)test(`valid catalog IDs do not support ${mode} evidence for every locked check`,async()=>{const r=await evaluate(mode);assert.equal(r.status,"insufficient_evidence");assert.match(r.explanation,/citation-scope gap/);});
test("every correct page and price owner remains supported",async()=>{assert.equal((await evaluate("right")).status,"supported");});
test("an actual target mismatch stays changes despite a correct value cited from another page",async()=>{const r=await evaluate("wrong-page","supported",16);assert.equal(r.status,"changes_suggested");assert.equal(r.citations[0].file,"menu.html");assert.equal(r.citations[0].excerpt,"<p>Tea AUD 16</p>");});
for(const raw of ["insufficient_evidence","changes_suggested"])test(`scope witness never upgrades raw ${raw}`,async()=>{assert.equal((await evaluate("right",raw)).status,raw);});
