import assert from "node:assert/strict";
import test from "node:test";
import {readFile}from"node:fs/promises";
import{assessDeliveryCatalogReplay as assessDelivery}from"../lib/delivery-assessment.ts";
import{projectQuote,validateProjectCorpus}from"../scripts/run-project-assessment-evaluation.ts";
const corpus=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/citation-relations-scope-corpus-2026-11-05.json",import.meta.url),"utf8")));
async function controlled(index:number){
 const q=projectQuote(corpus.projects[index]);
 const before=structuredClone(q);let calls=0;
 const report=await assessDelivery(q,{DEEPSEEK_API_KEY:"controlled-no-network"},async(_url,init)=>{
  calls++;const p=JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
  return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:"submit_source_assessment_v2",arguments:JSON.stringify({catalogId:p.citationCatalog.catalogId,items:p.criteria.map((c:{id:string})=>({criterionId:c.id,status:"changes_suggested",explanation:"Controlled raw change allegation about uncertain price association.",citations:[p.citationCatalog.entries[0].id]})),risks:[],limitations:[]})}}]}}]});
 });assert.equal(calls,1);assert.deepEqual(q,before);return report.items[0];
}
test("an uncertain merged-row association cannot become a definite change demand",async()=>{const r=await controlled(5);assert.equal(r.status,"insufficient_evidence");assert.match(r.explanation,/confirmed business checks/);});
test("an independently located wrong price still permits a change suggestion",async()=>{assert.equal((await controlled(1)).status,"changes_suggested");});
