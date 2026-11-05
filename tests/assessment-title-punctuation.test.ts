import assert from "node:assert/strict";
import test from "node:test";
import {assessDeliveryLegacyReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote,type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

test("nonverbatim title advice and the existing exact-string guard remain separate without changing source punctuation",async()=>{
 const excerpt="<h1>Explore the coast, and discover the harbour</h1>",sources=[
  "The post page content must contain the article title Explore the coast and discover the harbour.",
  'The page copy must include the exact wording "Explore the coast and discover the harbour".',
 ];
 const p:EvaluationProject={id:"title-punctuation-controlled",stratum:"boundary",language:"en",title:"Article wording fixture",summary:"Inspect title source text only; exact wording is separately stated.",
  files:{"index.html":`<!doctype html><html><head><title>Article</title></head><body>${excerpt}</body></html>`,"post.html":"<!doctype html><html><head><title>Post</title></head><body><p>Controlled source fixture.</p></body></html>","site.css":"body {margin:0}"},
  criteria:sources.map((source,i)=>({id:`manual-${i+1}`,title:i?"Exact wording":"Article title",source,reference:{expectedStatus:i?"changes_suggested":"supported",rationale:"Controlled post-parse contrast, not a real model measurement.",relevantFiles:["index.html"],requiresSemanticReview:true}}))};
 for(const rawStatus of ["supported","insufficient_evidence"]){
  const quote=projectQuote(p),before=structuredClone(quote);let calls=0;
  const report=await assessDelivery(quote,{DEEPSEEK_API_KEY:"controlled-no-network"},async()=>{calls++;return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"controlled",type:"function",function:{name:"submit_source_assessment",arguments:JSON.stringify({items:quote.proof.criteria.map(c=>({criterionId:c.id,status:rawStatus,explanation:"Controlled source advice; citation punctuation stays original.",citations:[{file:"index.html",excerpt}]})),risks:[],limitations:["Controlled transport, not model accuracy."]})}}]}}]});});
  assert.equal(calls,1);assert.equal(report.items[0].status,rawStatus);
  assert.equal(report.items[1].status,rawStatus==="supported"?"changes_suggested":"insufficient_evidence");
  assert.equal(report.items[0].citations[0].excerpt,excerpt);assert.deepEqual(quote,before);assert.equal(quote.proof.paymentState,"unfunded");
 }
});
