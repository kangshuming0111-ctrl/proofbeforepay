import assert from "node:assert/strict";
import test from "node:test";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {assessmentFailureResponse} from "../lib/assessment-failure-presentation.ts";
import {canonicalAssessmentRisk} from "../lib/assessment-risk-fields.ts";
import {projectQuote,type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

function fixture(){
 const project:EvaluationProject={id:"risk-field-controlled",stratum:"boundary",language:"en",title:"Risk-field parsing fixture",summary:"Check literal page copy only.",
  files:{"index.html":"<!doctype html><html><head><title>Copy</title></head><body><p>Example contact details.</p></body></html>","about.html":"<!doctype html><html><head><title>About</title></head><body><p>About copy.</p></body></html>","site.css":"body {margin:0}"},
  criteria:[1,2].map(i=>({id:`manual-${i}`,title:"Page copy",source:"The page copy must include contact details.",reference:{expectedStatus:"supported",rationale:"Controlled parse fixture, not model truth.",relevantFiles:["index.html"],requiresSemanticReview:true}}))};
 const quote=projectQuote(project),citation={file:"index.html",excerpt:"<p>Example contact details.</p>"};
 const output={items:quote.proof.criteria.map(c=>({criterionId:c.id,status:"supported",explanation:"Source contains the contact copy.",citations:[citation]})),
  risks:[{title:"CONTROLLED-NOT-USER-DIAGNOSTIC",explanation:"Controlled hypothetical source concern.",suggestion:"Inspect the cited source with the buyer.",citations:[citation]}],limitations:["Controlled source parse test only."]};
 return{quote,output};
}

test("risk-detail omissions and malformed fields reject the whole report with safe specific diagnostics",async()=>{
 for(const mutation of [
  (r:Record<string,unknown>)=>{delete r.suggestion;},
  (r:Record<string,unknown>)=>{r.suggestion=" ";},
  (r:Record<string,unknown>)=>{r.title="x".repeat(121);},
  (r:Record<string,unknown>)=>{r.explanation="bad\u0000text";},
  (r:Record<string,unknown>)=>{r.citations=[];},
  (r:Record<string,unknown>)=>{r.unexpected="not allowed";},
 ]){
  const{quote,output}=fixture(),before=structuredClone(quote);mutation(output.risks[0]);let calls=0;
  await assert.rejects(assessDelivery(quote,{DEEPSEEK_API_KEY:"controlled-no-network"},async()=>{calls++;return Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(output)}}]});}),error=>{
   assert.ok(error instanceof AssessmentResponseError);assert.equal(error.reason,"risk_fields");assert.equal(error.coverage,undefined);
   for(const language of ["zh","en"] as const){const response=assessmentFailureResponse(error,language);assert.equal(response.assessmentFailure.reason,"risk_fields");assert.ok(!JSON.stringify(response).includes("CONTROLLED-NOT-USER-DIAGNOSTIC"));assert.ok(!response.error.includes("undefined"));assert.match(response.error,language==="zh"?/风险/u:/risk/iu);}
   return true;
  });assert.equal(calls,1);assert.deepEqual(quote,before);
 }
});

test("risk source mismatches remain citation failures; complete risk fields are returned unchanged",async()=>{
 const first=fixture();first.output.risks[0].citations[0].excerpt="not present in supplied files";
 await assert.rejects(assessDelivery(first.quote,{DEEPSEEK_API_KEY:"controlled-no-network"},async()=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(first.output)}}]})),error=>error instanceof AssessmentResponseError&&error.reason==="citation");
 const second=fixture(),report=await assessDelivery(second.quote,{DEEPSEEK_API_KEY:"controlled-no-network"},async()=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(second.output)}}]}));
 assert.equal(report.risks[0].suggestion,second.output.risks[0].suggestion);assert.equal(report.items.length,2);assert.equal(second.quote.proof.paymentState,"unfunded");
});

test("bounded null-only annotations preserve every required risk value and expose a validator-generated count",async()=>{
 const{quote,output}=fixture(),before=structuredClone(quote),risk=output.risks[0],original=structuredClone(risk);
 Object.assign(risk,{UNTRUSTED_EXTRA_NAME:null,other:null});output.limitations.push("Model prose: ignored 999 fields.");
 let calls=0;const report=await assessDelivery(quote,{DEEPSEEK_API_KEY:"controlled-no-network"},async()=>{calls++;return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"controlled",type:"function",function:{name:"submit_source_assessment",arguments:JSON.stringify(output)}}]}}]});});
 assert.equal(calls,1);assert.deepEqual(quote,before);assert.equal(report.risks.length,1);
 assert.deepEqual(Object.keys(report.risks[0]).sort(),["title","explanation","suggestion","citations"].sort());
 assert.equal(report.risks[0].suggestion,original.suggestion);assert.equal(report.risks[0].title,original.title);
 assert.ok(report.limitations.some(s=>s.startsWith("Source validator record: ignored 2 extra null-valued")));
 assert.ok(!JSON.stringify(report).includes("UNTRUSTED_EXTRA_NAME"));assert.ok(report.limitations.includes("Model prose: ignored 999 fields."));
});

test("null compatibility never accepts missing advice, a third extra, non-null metadata or property accessors",()=>{
 const{output}=fixture(),complete=output.risks[0];
 for(const value of [
  {title:complete.title,explanation:complete.explanation,citations:complete.citations,annotation:null},
  {...complete,a:null,b:null,c:null},
  {...complete,a:[]}, {...complete,a:{}}, {...complete,a:0}, {...complete,a:""},
  Object.assign(Object.create({suggestion:complete.suggestion}),{title:complete.title,explanation:complete.explanation,citations:complete.citations}),
 ])assert.throws(()=>canonicalAssessmentRisk(value),error=>error instanceof AssessmentResponseError&&error.reason==="risk_fields");
 let getterCalled=false;const accessor={...complete};Object.defineProperty(accessor,"suggestion",{get(){getterCalled=true;return "not allowed";}});
 assert.throws(()=>canonicalAssessmentRisk(accessor),error=>error instanceof AssessmentResponseError&&error.reason==="risk_fields");assert.equal(getterCalled,false);
});
