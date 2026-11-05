import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessDeliveryCatalogReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {parseStaticProject,createUploadedDelivery} from "../lib/static-project.ts";
import {projectQuote,validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";
import type {AssessmentCitationCatalog} from "../lib/assessment-citation-catalog.ts";
const corpus=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-project-corpus-2026-11-04.json",import.meta.url),"utf8")));
const row=(tag=true)=>`<div class="dish"><span class="dish-name">Chickpea bowl</span>${tag?'<span class="dish-tag">GF</span>':''}<span class="dish-price">£9</span></div>`;
const html=(body:string)=>`<!doctype html><html><head><title>Menu</title></head><body>${body}</body></html>`;
async function run(mode:"correct"|"missing"|"neighbour"|"fragments"|"unbound-role",raw="supported"){
 const requirement=mode==="unbound-role"?"The homepage and full menu source content must both attach the GF tag to Chickpea bowl":"index.html and menu.html source content must both attach the GF tag to Chickpea bowl";
 const requiredPages=mode==="unbound-role"?["index.html","terms.html"]:["index.html","menu.html"];
 const p=parseStaticProject({title:"Source association control",summary:"Static markup evidence test.",amount:"1.00",requiredPages,manualRequirements:[requirement]},"en");
 const files={"index.html":html(row()),"menu.html":html(row(mode==="correct"||mode==="fragments")+(mode==="neighbour"?'<div class="dish"><span>Other dish</span><span>GF</span></div>':"")),"terms.html":html(row())};
 const q=projectQuote(corpus.projects[0]);q.language="en";q.summary=p.summary;q.proof.project=p.project;q.proof.criteria=p.criteria;q.proof.delivery=createUploadedDelivery(files,p.project,"en",1);q.proof.review={deliveryId:q.proof.delivery.id,reviewedAt:q.createdAt,mode:"demo",summary:"Controlled source rules."};
 const before=structuredClone(q);let calls=0;
 const result=await assessDelivery(q,{DEEPSEEK_API_KEY:"controlled-offline-no-network"},async(_url,init)=>{
  calls++;const packet=JSON.parse(JSON.parse(String(init?.body)).messages[1].content)as{citationCatalog:AssessmentCitationCatalog};
  const targetFiles=mode==="unbound-role"?["index.html","terms.html"]:["index.html","menu.html"];
  const ids=targetFiles.flatMap(file=>{
   const entries=packet.citationCatalog.entries.filter(e=>e.file===file);
   if(mode==="fragments")return [entries.find(e=>e.excerpt==='<span class="dish-name">Chickpea bowl</span>')!.id,entries.find(e=>e.excerpt==='<span class="dish-tag">GF</span>')!.id];
   return [entries.find(e=>e.excerpt.startsWith('<div class="dish">')&&e.excerpt.includes("Chickpea bowl"))!.id];
  });
  const output={catalogId:packet.citationCatalog.catalogId,items:q.proof.criteria.map(c=>({criterionId:c.id,status:c.id==="manual-1"?raw:"insufficient_evidence",explanation:"Both named pages have the required tag.",citations:ids})),risks:[],limitations:[]};
  return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:"submit_source_assessment_v2",arguments:JSON.stringify(output)}}]}}]});
 });assert.equal(calls,1);assert.deepEqual(q,before);return result.items.find(i=>i.criterionId==="manual-1")!;
}
for(const mode of ["missing","neighbour","fragments","unbound-role"]as const)test(`a silent false-supported claim cannot pass ${mode} universal evidence`,async()=>{const item=await run(mode);assert.equal(item.status,"insufficient_evidence");assert.match(item.explanation,/insufficient relationship evidence/);});
test("explicit targets and complete correct same-owner citations preserve supported",async()=>{assert.equal((await run("correct")).status,"supported");});
for(const raw of ["insufficient_evidence","changes_suggested"])test(`universal evidence never upgrades raw ${raw}`,async()=>{assert.equal((await run("correct",raw)).status,raw);});
