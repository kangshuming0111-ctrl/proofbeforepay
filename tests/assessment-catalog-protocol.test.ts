import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessDeliveryCatalogReplay as assessDelivery,AssessmentResponseError} from "../lib/delivery-assessment.ts";
import {projectQuote,validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";
import type {AssessmentCitationCatalog} from "../lib/assessment-citation-catalog.ts";
const corpus=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-project-corpus-2026-11-04.json",import.meta.url),"utf8")));
const env={DEEPSEEK_API_KEY:"controlled-offline-no-network"};
type Packet={criteria:{id:string}[];citationCatalog:AssessmentCitationCatalog;files:Record<string,string>};
type Output={catalogId:string;items:{criterionId:string;status:string;explanation:string;citations:unknown[]}[];risks:unknown[];limitations:string[]};
type Envelope={choices:{finish_reason:string;message:{content:string|null;tool_calls:{type:string;function:{name:string;arguments:string}}[]}}[]};
async function controlled(change:(out:Output,packet:Packet,envelope:Envelope)=>void=()=>{}, q=projectQuote(corpus.projects[0])){
 let calls=0;
 const report=await assessDelivery(q,env,async(_url,init)=>{
  calls++;const request=JSON.parse(String(init?.body)),p:Packet=JSON.parse(request.messages[1].content),catalog=p.citationCatalog;
  assert.equal(request.tool_choice.function.name,"submit_source_assessment_v2");assert.equal(request.tools[0].function.strict,true);
  assert.deepEqual(request.tools[0].function.parameters.properties.catalogId.enum,[catalog.catalogId]);
  const output:Output={catalogId:catalog.catalogId,items:p.criteria.map(c=>({criterionId:c.id,status:"insufficient_evidence",explanation:"Controlled protocol fixture, not model accuracy.",citations:[catalog.entries[0].id]})),risks:[],limitations:["No browser, payment or model execution."]};
  const envelope:Envelope={choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{type:"function",function:{name:"submit_source_assessment_v2",arguments:""}}]}}]};
  change(output,p,envelope);if(envelope.choices[0].message.tool_calls.length && !envelope.choices[0].message.tool_calls[0].function.arguments)envelope.choices[0].message.tool_calls[0].function.arguments=JSON.stringify(output);
  return Response.json(envelope);
 });return{report,calls};
}
const reason=(expected:string)=>(e:unknown)=>e instanceof AssessmentResponseError&&e.reason===expected;
test("active catalog report restores server-owned source and records actual catalog protocol",async()=>{
 const{report,calls}=await controlled();assert.equal(calls,1);assert.equal(report.items.length,2);
 for(const item of report.items)for(const cite of item.citations)assert.equal(corpus.projects[0].files[cite.file].slice(cite.start,cite.end),cite.excerpt);
 assert.ok(report.limitations.some(x=>x.includes("source-citation-catalog-v1")));
});
for(const mutation of ["wrong-catalog","unknown-id","duplicate-id","mixed-quote"]){
 test(`active catalog rejects ${mutation} without retry`,async()=>{await assert.rejects(controlled((out)=>{
  if(mutation==="wrong-catalog")out.catalogId="0".repeat(64);
  if(mutation==="unknown-id")out.items[0].citations=["s999999"];
  if(mutation==="duplicate-id")out.items[0].citations.push(out.items[0].citations[0]);
  if(mutation==="mixed-quote")out.items[0].citations=[{file:"index.html",excerpt:"<html>"}];
 }),reason("citation"));});
}
test("active V2 rejects old named tools and content-only legacy output",async()=>{
 for(const kind of ["old-tool","legacy-content"]){await assert.rejects(controlled((out,p,e)=>{
  const m=e.choices[0].message;
  if(kind==="old-tool")m.tool_calls[0].function.name="submit_source_assessment";
  else{e.choices[0].finish_reason="stop";m.content=JSON.stringify(out);m.tool_calls=[];}
 }),reason("structure"));}
});
test("active V2 complete criterion coverage still rejects missing final answer",async()=>{
 await assert.rejects(controlled(out=>out.items.pop()),reason("missing_items"));
});
test("active catalog allows separate references to distinct identical source spans",async()=>{
 const project=structuredClone(corpus.projects[0]),file="index.html",excerpt="<p>Tea & Coffee 🍜</p>";
 project.files[file]=project.files[file].replace("</body>",excerpt+excerpt+"</body>");
 const source=project.files[file],first=source.indexOf(excerpt),second=source.indexOf(excerpt,first+1);
 assert.ok(first>=0&&second>first);
 const{report}=await controlled((out,p)=>{const a=p.citationCatalog.entries.find(e=>e.file===file&&e.start===second&&e.excerpt===excerpt)!;assert.ok(a);out.items[0].citations=[a.id];},projectQuote(project));
 assert.deepEqual(report.items[0].citations,[{file,start:second,end:second+excerpt.length,excerpt}]);
});

test("short IDs cannot bypass the expanded 30000-unit report budget",async()=>{
 const reliability=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-reliability-corpus-2026-11-05.json",import.meta.url),"utf8"))),project=structuredClone(reliability.projects[2]);
 const file=Object.keys(project.files).find(f=>f.endsWith(".html"))!;
 project.files[file]=project.files[file].replace("</body>","<p>"+"x".repeat(6000)+"</p></body>");
 let calls=0;
 await assert.rejects(assessDelivery(projectQuote(project),env,async(_url,init)=>{
  calls++;const p:Packet=JSON.parse(JSON.parse(String(init?.body)).messages[1].content),ids=p.citationCatalog.entries.filter(e=>e.end-e.start>=390).slice(0,6).map(e=>e.id);
  assert.equal(ids.length,6);
  const out={catalogId:p.citationCatalog.catalogId,items:p.criteria.map(c=>({criterionId:c.id,status:"insufficient_evidence",explanation:"Budget control.",citations:ids})),risks:[],limitations:[]};
  assert.ok(JSON.stringify(out).length<30000);
  return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:"submit_source_assessment_v2",arguments:JSON.stringify(out)}}]}}]});
 }),reason("output_limit"));assert.equal(calls,1);
});
