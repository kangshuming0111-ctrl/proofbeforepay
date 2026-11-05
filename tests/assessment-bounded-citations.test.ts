import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import type {ProofQuote} from "../lib/contracts.ts";
import {assessDelivery,AssessmentResponseError} from "../lib/delivery-assessment.ts";
import type {AssessmentCitationCatalog} from "../lib/assessment-citation-catalog.ts";
import {projectQuote,validateProjectCorpus,type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const TOOL="submit_source_assessment_v3",env={DEEPSEEK_API_KEY:"offline-bounded-citation-fixture"};
type Slots=Record<string,unknown>;
type Item={criterionId:string;status:string;explanation:string;citations:unknown};
type Risk={title:string;explanation:string;suggestion:string;citations:unknown};
type Output={catalogId:string;items:Item[];risks:Risk[];limitations:string[]};
type Packet={criteria:{id:string}[];citationEncoding:string;citationCatalog:AssessmentCitationCatalog;files:Record<string,string>};
type Schema={type?:string;properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean;enum?:string[];items?:Schema};
type RequestBody={tool_choice:{function:{name:string}};tools:{function:{strict:boolean;parameters:Schema}}[];messages:{content:string}[]};
type Envelope={choices:{finish_reason:string;message:{content:string|null;tool_calls:{type:string;function:{name:string;arguments:string}}[]}}[]};
const slots=(ids:readonly string[],maximum:number):Slots=>Object.fromEntries(Array.from({length:maximum},(_,i)=>[`c${i+1}`,ids[i]??""]));
function quote():ProofQuote{
 const texts=Array.from({length:6},(_,i)=>`The page content must include fact ${i+1}`),summary=texts.join("\n");
 const source="<!doctype html><html><head><title>Fixed-slot source fixture</title></head><body>"+texts.map((_,i)=>`<p>Fact ${i+1}</p>`).join("")+"<p>Repeated 🍜 source</p><p>Repeated 🍜 source</p></body></html>";
 const project:EvaluationProject={id:"fixed-slot-source-fixture",stratum:"boundary",language:"en",title:"Fixed-slot source fixture",summary,
  files:{"index.html":source,"about.html":source,"site.css":"p{font-family:sans-serif}"},criteria:texts.map((source,i)=>({id:`coverage-${i+1}`,title:`Original requirement ${i+1}`,source,
   reference:{expectedStatus:"insufficient_evidence",rationale:"Controlled transport fixture only, not model accuracy or an executed website.",relevantFiles:["index.html"],requiresSemanticReview:true}}))};
 return projectQuote(project);
}
function controlled(change:(out:Output,packet:Packet,envelope:Envelope,request:RequestBody)=>void=()=>{},q=quote()){
 const state={calls:0},before=structuredClone(q);
 const promise=assessDelivery(q,env,async(url,init)=>{
  state.calls++;assert.equal(String(url),"https://api.deepseek.com/beta/chat/completions");
  const request=JSON.parse(String(init?.body)) as RequestBody,packet=JSON.parse(request.messages[1].content) as Packet;
  assert.equal(request.tool_choice.function.name,TOOL);assert.equal(packet.citationEncoding,"catalog_slots");
  const id=packet.citationCatalog.entries.find(e=>e.excerpt.trim())!.id;
  const out:Output={catalogId:packet.citationCatalog.catalogId,items:packet.criteria.map(c=>({criterionId:c.id,status:"insufficient_evidence",explanation:"Controlled fixed-slot fixture, not a model-quality result.",citations:slots([id],6)})),risks:[],limitations:["No website, model or payment was executed."]};
  const envelope:Envelope={choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{type:"function",function:{name:TOOL,arguments:""}}]}}]};
  change(out,packet,envelope,request);
  if(envelope.choices[0].message.tool_calls.length&&!envelope.choices[0].message.tool_calls[0].function.arguments)envelope.choices[0].message.tool_calls[0].function.arguments=JSON.stringify(out);
  return Response.json(envelope);
 });
 return{promise,state,q,before};
}
async function rejected(change:Parameters<typeof controlled>[0],reason:string){
 const c=controlled(change);
 await assert.rejects(c.promise,error=>error instanceof AssessmentResponseError&&error.reason===reason);
 assert.equal(c.state.calls,1);assert.deepEqual(c.q,c.before);
}

test("active V3 strict schema expresses item-six and risk-three as fixed required slot objects",async()=>{
 const c=controlled((_out,p,_e,request)=>{
  const schema=request.tools[0].function.parameters;assert.equal(request.tools[0].function.strict,true);
  assert.deepEqual(schema.properties!.catalogId.enum,[p.citationCatalog.catalogId]);
  const item=schema.properties!.items.items!.properties!.citations,risk=schema.properties!.risks.items!.properties!.citations;
  for(const [candidate,maximum] of [[item,6],[risk,3]] as const){
   const keys=Array.from({length:maximum},(_,i)=>`c${i+1}`);
   assert.equal(candidate.type,"object");assert.equal(candidate.additionalProperties,false);
   assert.deepEqual(Object.keys(candidate.properties!),keys);assert.deepEqual(candidate.required,keys);
   assert.equal(candidate.items,undefined);
   for(const key of keys){assert.equal(candidate.properties![key].type,"string");assert.ok(candidate.properties![key].enum!.includes(p.citationCatalog.entries[0].id));}
  }
  assert.ok(item.properties!.c1.enum!.includes(""));assert.equal(risk.properties!.c1.enum!.includes(""),false);
  assert.ok(risk.properties!.c2.enum!.includes(""));assert.ok(risk.properties!.c3.enum!.includes(""));
 });
 await c.promise;assert.equal(c.state.calls,1);assert.deepEqual(c.q,c.before);
});

test("active fixed slots restore exact server-owned spans and empty insufficient-evidence references",async()=>{
 let expected:{file:string;start:number;end:number;excerpt:string}|undefined;
 const c=controlled((out,p)=>{
  const repeated="<p>Repeated 🍜 source</p>",source=p.files["index.html"],entry=p.citationCatalog.entries.find(e=>e.file==="index.html"&&e.excerpt===repeated&&e.start===source.lastIndexOf(repeated))!;
  assert.ok(entry);const {id,...citation}=entry;expected=citation;
  out.items[0].citations=slots([id],6);out.items[1].citations=slots([],6);
 });
 const report=await c.promise;assert.equal(c.state.calls,1);assert.deepEqual(report.items[0].citations,[expected]);assert.deepEqual(report.items[1].citations,[]);
 assert.ok(!Object.hasOwn(report.items[0].citations[0],"id"));assert.deepEqual(c.q,c.before);
});

for(const kind of ["c7","missing-slot","gap","duplicate","unknown-id","mixed-object","old-array"] as const){
 test(`active V3 refuses ${kind} item citations without retry`,async()=>{
  await rejected((out,p)=>{
   const refs=out.items[0].citations as Slots,id=p.citationCatalog.entries[0].id;
   if(kind==="c7")refs.c7=id;
   if(kind==="missing-slot")delete refs.c6;
   if(kind==="gap"){refs.c1="";refs.c2=id;}
   if(kind==="duplicate")refs.c2=refs.c1;
   if(kind==="unknown-id")refs.c1="s999999999";
   if(kind==="mixed-object")refs.c1={file:"index.html",excerpt:"<html>"};
   if(kind==="old-array")out.items[0].citations=[id];
  },kind==="duplicate"||kind==="unknown-id"?"citation":"structure");
 });
}

for(const kind of ["c4","empty-first"] as const){
 test(`active V3 refuses ${kind} risk slots as incomplete risk fields without retry`,async()=>{
  await rejected((out,p)=>{
   const id=p.citationCatalog.entries[0].id,refs=slots([id],3);
   if(kind==="c4")refs.c4=id;else refs.c1="";
   out.risks=[{title:"Controlled source observation",explanation:"Source evidence only.",suggestion:"Ask for the remaining observation.",citations:refs}];
  },"risk_fields");
 });
}

test("active V3 refuses the old V2 named tool rather than falling back or retrying",async()=>{
 await rejected((_out,_p,e)=>{e.choices[0].message.tool_calls[0].function.name="submit_source_assessment_v2";},"structure");
});

test("complete item shells with fixed slots still diagnose omitted criteria as missing items",async()=>{
 await rejected(out=>{out.items.pop();},"missing_items");
});

test("six full item slots and three full risk slots remain admitted within complete bounded reports",async()=>{
 const c=controlled((out,p)=>{
  const ids=p.citationCatalog.entries.filter(e=>e.excerpt.startsWith("<p>Fact ")).slice(0,6).map(e=>e.id);assert.equal(ids.length,6);
  for(const item of out.items)item.citations=slots(ids,6);
  out.risks=Array.from({length:3},(_,i)=>({title:`Controlled source observation ${i+1}`,explanation:"These are recorded source facts only, without runtime assurance.",suggestion:"Check the remaining operation separately.",citations:slots(ids.slice(0,3),3)}));
 });
 const report=await c.promise;assert.equal(c.state.calls,1);assert.equal(report.items.length,6);assert.equal(report.risks.length,3);
 assert.ok(report.items.every(i=>i.citations.length===6));assert.ok(report.risks.every(r=>r.citations.length===3));assert.deepEqual(c.q,c.before);
});

test("fixed short slots cannot bypass the expanded 30000-unit report limit",async()=>{
 const corpus=validateProjectCorpus(JSON.parse(readFileSync(new URL("../scripts/assessment-reliability-corpus-2026-11-05.json",import.meta.url),"utf8"))),project=structuredClone(corpus.projects[2]);
 const file=Object.keys(project.files).find(f=>f.endsWith(".html"))!;project.files[file]=project.files[file].replace("</body>","<p>"+"x".repeat(6000)+"</p></body>");
 const c=controlled((out,p)=>{
  const ids=p.citationCatalog.entries.filter(e=>e.end-e.start>=390).slice(0,6).map(e=>e.id);assert.equal(ids.length,6);
  for(const item of out.items)item.citations=slots(ids,6);
  assert.ok(JSON.stringify(out).length<30_000);
 },projectQuote(project));
 await assert.rejects(c.promise,error=>error instanceof AssessmentResponseError&&error.reason==="output_limit");
 assert.equal(c.state.calls,1);assert.deepEqual(c.q,c.before);
});
