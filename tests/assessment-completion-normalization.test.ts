import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessmentReportJson} from "../lib/assessment-completion.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote,validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";

test("strict syntax compatibility removes only one orphan brace after an otherwise complete JSON object",()=>{
 const original={items:[],risks:[],limitations:["A quoted } character remains unchanged."]},valid=JSON.stringify(original);
 const clean=assessmentReportJson({text:valid,transport:"strict_tool"});assert.equal(clean.repairedTrailingBrace,false);assert.equal(clean.canonicalText,valid);
 const repaired=assessmentReportJson({text:valid+"}",transport:"strict_tool"});assert.equal(repaired.repairedTrailingBrace,true);assert.equal(repaired.canonicalText,valid);assert.deepEqual(repaired.value,original);
 for(const text of [valid+"}}",valid+"{}",valid+" trailing text",valid.slice(0,-2),"[]}",'"text"}',"null}"," ".repeat(30_001)])
  assert.throws(()=>assessmentReportJson({text,transport:"strict_tool"}),error=>error instanceof AssessmentResponseError&&error.reason==="structure");
 assert.throws(()=>assessmentReportJson({text:valid+"}",transport:"legacy_json"}),error=>error instanceof AssessmentResponseError&&error.reason==="structure");
});

test("actual assessment marks syntax-only compatibility, keeps all full validators and never makes a second request",async()=>{
 const corpus=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-reliability-corpus-2026-11-05.json",import.meta.url),"utf8")));
 for(const mode of ["complete","missing-advice","bad-citation"]){
  const quote=projectQuote(corpus.projects[0]),before=structuredClone(quote),risk:Record<string,unknown>={title:"Controlled source concern",explanation:"Controlled source-only parse test.",suggestion:"Inspect the cited source.",citations:[{file:"index.html",excerpt:"not in the actual source"}]};
  if(mode==="missing-advice")delete risk.suggestion;
  const output={items:quote.proof.criteria.map(c=>({criterionId:c.id,status:"insufficient_evidence",explanation:"Controlled response, not actual model evidence.",citations:[]})),risks:mode==="complete"?[]:[risk],limitations:["Controlled transport test only."]};let calls=0;
  const action=()=>assessDelivery(quote,{DEEPSEEK_API_KEY:"controlled-no-network"},async()=>{calls++;return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"controlled",type:"function",function:{name:"submit_source_assessment",arguments:JSON.stringify(output)+"}"}}]}}]});});
  if(mode==="complete"){const report=await action();assert.equal(report.items.length,quote.proof.criteria.length);assert.ok(report.limitations.some(s=>s.includes("orphan closing brace")||s.includes("多出一个闭合符")));}
  else await assert.rejects(action,error=>error instanceof AssessmentResponseError&&error.reason===(mode==="missing-advice"?"risk_fields":"citation"));
  assert.equal(calls,1);assert.deepEqual(quote,before);
 }
});
