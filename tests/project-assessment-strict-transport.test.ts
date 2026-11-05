import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {freezeProjectEvaluation,runProjectEvaluation,validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";

const corpus=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-reliability-corpus-2026-11-05.json",import.meta.url),"utf8")));
const input={...corpus,projects:[corpus.projects[1]]};
async function run(change:(envelope:Record<string,unknown>)=>void=()=>{}){
 const frozen=await freezeProjectEvaluation(input);let requests=0;
 const report=await runProjectEvaluation(input,{live:true,maxCalls:1,maxUsd:.1,frozen,env:{DEEPSEEK_API_KEY:"controlled-no-network",DEEPSEEK_MODEL:"deepseek-flash"},fetcher:async(url,init)=>{
  requests++;assert.equal(String(url),"https://api.deepseek.com/beta/chat/completions");
  const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.messages[1].content),[file,source]=Object.entries(packet.files)[0] as [string,string];
  assert.equal(request.tools[0].function.strict,true);assert.equal(request.tool_choice.function.name,"submit_source_assessment");
  const output={items:packet.criteria.map((c:{id:string})=>({criterionId:c.id,status:input.projects[0].criteria.find(row=>row.id===c.id)!.reference.expectedStatus,explanation:"Controlled transport fixture, not model truth.",citations:[{file,excerpt:source.slice(0,80)}]})),risks:[],limitations:["No network or actual model execution."]};
  const envelope:Record<string,unknown>={model:"controlled-strict-fixture",choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"controlled-call",type:"function",function:{name:"submit_source_assessment",arguments:JSON.stringify(output)}}]}}],usage:{prompt_tokens:1000,completion_tokens:100,total_tokens:1100}};
  change(envelope);return Response.json(envelope);
 }});return{report,requests};
}

test("evaluator retains actual strict arguments and finish reason while counting complete responses on all attempts",async()=>{
 const{report,requests}=await run(),result=report.results[0],structure=report.summary.overall.rawItemStructure;
 assert.equal(requests,1);assert.equal(result.raw!.transport,"strict_tool");assert.equal(result.raw!.finishReason,"tool_calls");assert.equal(result.rawDiagnostics!.finishReason,"tool_calls");assert.equal(result.application!.accepted,true);
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
 assert.equal(requests,1);assert.equal(r.application!.failureReason,"output_limit");assert.equal(r.raw!.finishReason,"length");assert.equal(r.rawDiagnostics!.finishReason,"length");assert.ok(r.raw!.bodyText!.includes("submit_source_assessment"));
 assert.equal(report.summary.overall.rawItemStructure.firstCompletedItemProjects.count,0);assert.equal(report.summary.overall.rawItemStructure.outputLimitedProjects,1);
});

test("evaluator explicitly retains malformed original arguments alongside syntax-normalized claims",async()=>{
 const{report,requests}=await run(envelope=>{
  const fn=(envelope.choices as {message:{tool_calls:{function:{arguments:string}}[]}}[])[0].message.tool_calls[0].function;
  fn.arguments+="}";
 }),r=report.results[0];
 assert.equal(requests,1);assert.equal(r.application!.accepted,true);assert.equal(r.raw!.originalJsonValid,false);assert.equal(r.raw!.contentNormalization,"one_trailing_brace");
 assert.equal(r.rawDiagnostics!.profileSource,"normalized_strict_arguments");assert.equal(report.summary.overall.rawItemStructure.normalizedIdProfileProjects,1);
 assert.equal(r.raw!.originalContentText,r.raw!.contentText+"}");assert.ok(r.raw!.bodyText!.includes("submit_source_assessment"));
 assert.equal(report.summary.overall.rawItemStructure.syntaxNormalizedProjects,1);assert.equal(report.summary.overall.rawItemStructure.firstCompletedItemProjects.count,1);
});
