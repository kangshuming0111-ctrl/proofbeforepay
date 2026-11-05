import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {freezeProjectEvaluation,runProjectEvaluation,validateProjectCorpus,captureProjectAssessmentResponse} from "../scripts/run-project-assessment-evaluation.ts";

const slots = (ids: readonly unknown[], maximum = 6) => Object.fromEntries(Array.from({length: Math.max(maximum, ids.length)}, (_, i) => [`c${i + 1}`, ids[i] ?? ""]));
const corpus=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-reliability-corpus-2026-11-05.json",import.meta.url),"utf8")));
const input={...corpus,projects:[corpus.projects[1]]};
async function run(change:(envelope:Record<string,unknown>)=>void=()=>{}){
 const frozen=await freezeProjectEvaluation(input);let requests=0;
 const report=await runProjectEvaluation(input,{live:true,maxCalls:1,maxUsd:.1,frozen,env:{DEEPSEEK_API_KEY:"controlled-no-network",DEEPSEEK_MODEL:"deepseek-flash"},fetcher:async(url,init)=>{
  requests++;assert.equal(String(url),"https://api.deepseek.com/beta/chat/completions");
  const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.messages[1].content);
  assert.equal(request.tools[0].function.strict,true);assert.equal(request.tool_choice.function.name,"submit_source_assessment_v3");
  const output={catalogId:packet.citationCatalog.catalogId,items:packet.criteria.map((c:{id:string})=>({criterionId:c.id,status:input.projects[0].criteria.find(row=>row.id===c.id)!.reference.expectedStatus,explanation:"Controlled transport fixture, not model truth.",citations:slots([packet.citationCatalog.entries[0].id])})),risks:[],limitations:["No network or actual model execution."]};
  const envelope:Record<string,unknown>={model:"controlled-strict-fixture",choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"controlled-call",type:"function",function:{name:"submit_source_assessment_v3",arguments:JSON.stringify(output)}}]}}],usage:{prompt_tokens:1000,completion_tokens:100,total_tokens:1100}};
  change(envelope);return Response.json(envelope);
 }});return{report,requests};
}

test("evaluator retains actual strict arguments and finish reason while counting complete responses on all attempts",async()=>{
 const{report,requests}=await run(),result=report.results[0],structure=report.summary.overall.rawItemStructure;
 assert.equal(requests,1);assert.equal(result.raw!.transport,"strict_tool");assert.equal(result.raw!.finishReason,"tool_calls");assert.equal(result.rawDiagnostics!.finishReason,"tool_calls");assert.equal(result.application!.accepted,true);
 assert.equal(result.raw!.citationEncoding,"catalog_slots");
 const original=result.raw!.items as {citations:Record<string,string>}[];assert.deepEqual(Object.keys(original[0].citations),["c1","c2","c3","c4","c5","c6"]);assert.equal(original[0].citations.c2,"");
 assert.ok(result.criteria[0].rawCitations.every(c=>c.valid));assert.ok(result.criteria[0].applicationCitations.every(c=>c.valid));
 assert.equal(result.rawDiagnostics!.completeItemCoverage,true);assert.equal(result.criteria.length,8);
 assert.deepEqual(structure.firstCompletedItemProjects,{count:1,total:1,fraction:1});assert.deepEqual(structure.firstStoppedCompleteItemProjects,structure.firstCompletedItemProjects);
 assert.equal(structure.strictToolResponseProjects,1);assert.equal(structure.legacyJsonResponseProjects,0);
});

test("evaluator never derives a complete ID profile from wrong or multiple tool calls and makes no fallback request",async()=>{
 for(const mode of ["wrong-name","two-tools"]){
  const{report,requests}=await run(envelope=>{
   const choice=(envelope.choices as {message:{tool_calls:{function:{name:string}}[]}}[])[0];
   if(mode==="wrong-name")choice.message.tool_calls[0].function.name="UPSTREAM-UNTRUSTED-FUNCTION";
   else choice.message.tool_calls.push(structuredClone(choice.message.tool_calls[0]));
  }),r=report.results[0];
  assert.equal(requests,1);assert.equal(r.application!.accepted,false);assert.equal(r.raw!.transport,null);assert.equal(r.rawDiagnostics!.idProfileParsed,false);
  assert.equal(report.summary.overall.rawItemStructure.firstCompletedItemProjects.count,0);assert.ok(!JSON.stringify(r.rawDiagnostics).includes("UPSTREAM"));assert.ok(r.criteria.every(c=>c.applicationStatus==="error"));
 }
});

test("strict output limit remains an incomplete attempt with its original raw envelope retained",async()=>{
 const{report,requests}=await run(envelope=>{(envelope.choices as {finish_reason:string}[])[0].finish_reason="length";}),r=report.results[0];
 assert.equal(requests,1);assert.equal(r.application!.failureReason,"output_limit");assert.equal(r.raw!.finishReason,"length");assert.equal(r.rawDiagnostics!.finishReason,"length");assert.ok(r.raw!.bodyText!.includes("submit_source_assessment_v3"));
 assert.equal(report.summary.overall.rawItemStructure.firstCompletedItemProjects.count,0);assert.equal(report.summary.overall.rawItemStructure.outputLimitedProjects,1);
});

test("evaluator explicitly retains malformed original arguments alongside syntax-normalized claims",async()=>{
 const{report,requests}=await run(envelope=>{
  const fn=(envelope.choices as {message:{tool_calls:{function:{arguments:string}}[]}}[])[0].message.tool_calls[0].function;
  fn.arguments+="}";
 }),r=report.results[0];
 assert.equal(requests,1);assert.equal(r.application!.accepted,true);assert.equal(r.raw!.originalJsonValid,false);assert.equal(r.raw!.contentNormalization,"one_trailing_brace");
 assert.equal(r.rawDiagnostics!.profileSource,"normalized_strict_arguments");assert.equal(report.summary.overall.rawItemStructure.normalizedIdProfileProjects,1);
 assert.equal(r.raw!.originalContentText,r.raw!.contentText+"}");assert.ok(r.raw!.bodyText!.includes("submit_source_assessment_v3"));
 assert.equal(report.summary.overall.rawItemStructure.syntaxNormalizedProjects,1);assert.equal(report.summary.overall.rawItemStructure.firstCompletedItemProjects.count,1);
});

test("invalid V3 slot shapes are recorded as invalid items rather than missing criterion IDs",async()=>{
 for(const mode of ["missing-key","gap","duplicate","unknown-id"]){
  const{report,requests}=await run(envelope=>{
   const fn=(envelope.choices as {message:{tool_calls:{function:{arguments:string}}[]}}[])[0].message.tool_calls[0].function;
   const output=JSON.parse(fn.arguments),selected=output.items[0].citations as Record<string,string>,id=selected.c1;
   if(mode==="missing-key")delete selected.c6;
   if(mode==="gap"){selected.c1="";selected.c2=id;}
   if(mode==="duplicate")selected.c2=id;
   if(mode==="unknown-id")selected.c1="s999999";
   fn.arguments=JSON.stringify(output);
  }),r=report.results[0],diagnostic=r.rawDiagnostics!;
  assert.equal(requests,1);assert.equal(r.application!.accepted,false);assert.equal(r.raw!.citationEncoding,"catalog_slots");
  assert.deepEqual(diagnostic.missingCriterionIds,[]);assert.deepEqual(diagnostic.duplicateCriterionIds,[]);assert.equal(diagnostic.returnedKnownCriterionIds.length,8);
  assert.equal(diagnostic.invalidItemCount,mode==="unknown-id"?0:1);assert.equal(diagnostic.completeItemCoverage,mode==="unknown-id");
  assert.equal(r.criteria[0].rawCitationValidity,"invalid");assert.equal(r.application!.failureReason,mode==="missing-key"||mode==="gap"?"structure":"citation");
  const original=(r.raw!.items as {citations:Record<string,string>}[])[0].citations;
  if(mode==="missing-key")assert.equal(Object.hasOwn(original,"c6"),false);
  if(mode==="gap")assert.equal(original.c1,"");
  if(mode==="duplicate")assert.equal(original.c1,original.c2);
  if(mode==="unknown-id")assert.equal(original.c1,"s999999");
 }
});

test("an extra fourth risk slot is refused without affecting complete criterion-ID diagnostics",async()=>{
 const{report,requests}=await run(envelope=>{
  const fn=(envelope.choices as {message:{tool_calls:{function:{arguments:string}}[]}}[])[0].message.tool_calls[0].function,output=JSON.parse(fn.arguments),id=output.items[0].citations.c1;
  output.risks=[{title:"Controlled risk",explanation:"Controlled source finding",suggestion:"Inspect exact source",citations:{c1:id,c2:"",c3:"",c4:id}}];fn.arguments=JSON.stringify(output);
 }),r=report.results[0];
 assert.equal(requests,1);assert.equal(r.application!.failureReason,"risk_fields");assert.equal(r.rawDiagnostics!.completeItemCoverage,true);
 assert.deepEqual(r.rawDiagnostics!.missingCriterionIds,[]);assert.ok(r.raw!.riskCitationChecks[0].some(c=>!c.valid));
 assert.equal((r.raw!.risks as {citations:Record<string,string>}[])[0].citations.c4,(r.raw!.items as {citations:Record<string,string>}[])[0].citations.c1);
});

test("explicit historical capture keeps V2 ID arrays and legacy quotations without rewriting original raw data",async()=>{
 const frozen=await freezeProjectEvaluation(input),packet=JSON.parse(JSON.parse(frozen.snapshot.projects[0].requestBody).messages[1].content) as Parameters<typeof captureProjectAssessmentResponse>[1];
 delete packet.citationEncoding;
 const span=packet.citationCatalog!.entries[0],item={criterionId:packet.criteria[0].id,status:"insufficient_evidence",explanation:"Controlled historical data",citations:[span.id]},output={catalogId:packet.citationCatalog!.catalogId,items:[item],risks:[],limitations:[]};
 const v2=await captureProjectAssessmentResponse(Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{name:"submit_source_assessment_v2",arguments:JSON.stringify(output)}}]}}]}),packet);
 assert.equal(v2.citationEncoding,"catalog_ids");assert.equal(v2.catalogIdValid,true);assert.deepEqual(v2.items,[item]);assert.deepEqual(JSON.parse(v2.originalContentText!),output);
 const historical={...packet};delete historical.citationCatalog;
 const oldItem={...item,citations:[{file:span.file,excerpt:span.excerpt}]},oldOutput={items:[oldItem],risks:[],limitations:[]};
 const old=await captureProjectAssessmentResponse(Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(oldOutput)}}]}),historical);
 assert.equal(old.transport,"legacy_json");assert.equal(old.citationEncoding,"legacy_quotes");assert.deepEqual(old.items,[oldItem]);assert.deepEqual(JSON.parse(old.originalContentText!),oldOutput);
});
