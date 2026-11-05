import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessmentItem,ProofQuote} from "../lib/contracts.ts";
import type {AssessmentCitationCatalog} from "../lib/assessment-citation-catalog.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {createUniversalTagEvidenceCheck} from "../lib/universal-tag-evidence.ts";
import {createSourceBusinessEvidenceCheck} from "../lib/source-business-evidence.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {projectQuote,type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const owner=(tag="GF")=>`<div class="dish"><span class="name">Whipped cod roe</span><span class="tag">${tag}</span></div>`;
const html=(body:string)=>`<!doctype html><html><head><title>Source boundary</title></head><body>${body}</body></html>`;
const alias="The homepage and full menu source content must both attach the GF tag to Whipped cod roe";
const explicit=alias.replace("homepage and full menu","index.html and menu.html");
function fixture(source=alias,options:{missing?:boolean;businessPrice?:number;language?:"en"|"zh";manual?:boolean}={}):ProofQuote{
 const files:Record<string,string>={"index.html":html(owner()+"<p>Tea AUD 19</p>"),"terms.html":html(owner()),...(!options.missing?{"menu.html":html(owner("V"))}:{})},unit=summaryCoverageUnits(source)[0];
 const p:EvaluationProject={id:"controlled-negative-role-scope",stratum:"boundary",language:options.language??"en",title:"Negative source page-scope boundary",summary:source,requiredPages:["index.html",options.missing||source===explicit?"menu.html":"terms.html"],files,
 criteria:[{id:options.manual?"manual-1":"coverage-1",title:options.manual?"Manual requirement 1":options.language==="zh"?"原始需求 1":"Original requirement 1",source,reference:{expectedStatus:"insufficient_evidence",rationale:"Controlled behavior test; not a live model score.",relevantFiles:Object.keys(files),requiresSemanticReview:true}}],
 ...(options.businessPrice!==undefined?{businessChecks:{confirmed:true,items:[{id:"business-1",criterionId:"coverage-1",file:"index.html",source:{start:unit.start,end:unit.end,excerpt:unit.text},expected:{kind:"item_price",label:"Tea",currency:"AUD",amountMinor:options.businessPrice}}]}}:{})};
 return projectQuote(p);
}
async function run(q:ProofQuote,raw:ProofAssessmentItem["status"]="changes_suggested"){
 const before=structuredClone(q);let calls=0;const result=await assessDelivery(q,{DEEPSEEK_API_KEY:"controlled-offline-no-network"},async(_url,init)=>{
 calls++;const packet=JSON.parse(JSON.parse(String(init!.body)).messages[1].content) as {criteria:{id:string}[];citationCatalog:AssessmentCitationCatalog};
 const ids=Object.keys(q.proof.delivery!.files!).map(file=>packet.citationCatalog.entries.find(e=>e.file===file&&e.excerpt.startsWith('<div class="dish">'))!.id),slots=(maximum:number)=>Object.fromEntries(Array.from({length:maximum},(_,i)=>[`c${i+1}`,ids[i]??""]));
 return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"controlled-source-data",type:"function",function:{name:"submit_source_assessment_v3",arguments:JSON.stringify({catalogId:packet.citationCatalog.catalogId,items:packet.criteria.map(c=>({criterionId:c.id,status:raw,explanation:'The full menu best maps to menu.html, where the tag differs. This is controlled model prose, not a confirmed mapping.',citations:slots(6)})),risks:[{title:"Possible menu-tag issue",explanation:"The source alone leaves the business page role unconfirmed.",suggestion:"Ask the buyer to identify the intended full-menu file.",citations:slots(3)}],limitations:["Controlled response only."]})}}]}}]});
 });assert.equal(calls,1);assert.deepEqual(q,before);return result;
}

test("a negative model claim cannot assign a homepage/full-menu role by guessing a filename",async()=>{
 const q=fixture(),result=await run(q),item=result.items[0];assert.equal(item.status,"insufficient_evidence");assert.equal(item.evidenceNeed?.reason,"page_scope");assert.deepEqual(item.evidenceNeed?.targetFiles,[]);assert.ok(!item.explanation.includes("best maps"));assert.deepEqual(result.risks,[]);assert.equal(result.withheldRisks!.entries.length,1);assert.deepEqual(result.withheldRisks!.adjustedCriteria,[{criterionId:"coverage-1",originalStatus:"changes_suggested",publishedStatus:"insufficient_evidence"}]);
});

test("both languages give fixed scope clarification without guessing a target page",async()=>{
 const q=fixture(alias,{language:"zh"}),result=await run(q);assert.equal(result.items[0].status,"insufficient_evidence");assert.equal(result.items[0].evidenceNeed?.reason,"page_scope");assert.deepEqual(result.items[0].evidenceNeed?.targetFiles,[]);assert.match(result.items[0].explanation,/页面|范围/);assert.ok(!result.items[0].explanation.includes("menu.html"));
});

test("a related failed server rule keeps its changes priority even when the model page roles are unbound",async()=>{
 const q=fixture(alias,{manual:true});q.proof.delivery!.evidence[0].finding="fail";const result=await run(q);assert.equal(result.items[0].status,"changes_suggested");assert.equal(result.items[0].evidenceNeed,undefined);assert.match(result.items[0].explanation,/Server rules found/);
});

test("a confirmed typed business-price mismatch keeps canonical changes despite the unrelated role alias",async()=>{
 const q=fixture(alias,{businessPrice:1800});assert.equal(createSourceBusinessEvidenceCheck(q.proof.delivery!.files!,getBusinessCheckPlan(q))("coverage-1").kind,"mismatch");const result=await run(q);assert.equal(result.items[0].status,"changes_suggested");assert.equal(result.items[0].evidenceNeed,undefined);assert.match(result.items[0].explanation,/18\.00|19\.00/);assert.ok(result.items[0].citations.some(c=>c.excerpt==="<p>Tea AUD 19</p>"));
});

test("matching typed business evidence does not invent a homepage/full-menu mapping",async()=>{
 const q=fixture(alias,{businessPrice:1900});assert.equal(createSourceBusinessEvidenceCheck(q.proof.delivery!.files!,getBusinessCheckPlan(q))("coverage-1").kind,"unchanged");const result=await run(q);assert.equal(result.items[0].status,"insufficient_evidence");assert.equal(result.items[0].evidenceNeed?.reason,"page_scope");
});

test("explicit named-file wrong tags and missing file facts are not blanket-downgraded",async()=>{
 for(const missing of [false,true]){const q=fixture(explicit,{missing}),criterion=q.proof.criteria[0],citations=Object.entries(q.proof.delivery!.files!).map(([file,source])=>{const excerpt=source.match(/<div class="dish">.*?<\/div>/u)![0],start=source.indexOf(excerpt);return{file,start,end:start+excerpt.length,excerpt};}),tag=createUniversalTagEvidenceCheck(q.proof.delivery!.files!,q.proof.project!.requiredPages)(criterion,citations);assert.equal(tag.reason,missing?"unavailable_source":"owner_tag_unverified");const result=await run(q);assert.equal(result.items[0].status,"changes_suggested",String(missing));assert.equal(result.items[0].evidenceNeed,undefined);}
});

test("raw model unknown is never promoted or mislabelled as a newly established page-scope finding",async()=>{
 const q=fixture(),result=await run(q,"insufficient_evidence");assert.equal(result.items[0].status,"insufficient_evidence");assert.equal(result.items[0].evidenceNeed?.reason,"model_unresolved");assert.match(result.items[0].explanation,/controlled model prose/);assert.equal(result.withheldRisks!.reason,"not_withheld");
});
