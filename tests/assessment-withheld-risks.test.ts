import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessmentItem,ProofAssessmentRisk,ProofAssessmentWithheldRisks,ProofQuote} from "../lib/contracts.ts";
import {publishSourceAssessmentNotes} from "../lib/assessment-publication-policy.ts";
import {assessDelivery,assessDeliveryLegacyReplay,assessDeliveryCatalogReplay} from "../lib/delivery-assessment.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";

const at="2026-11-06T00:00:00.000Z",html="<!doctype html><html><head><title>Shop</title></head><body><p>Home</p></body></html>";
const item=(id="manual-1",status:ProofAssessmentItem["status"]="insufficient_evidence"):ProofAssessmentItem=>({criterionId:id,status,explanation:"A source-only controlled item.",citations:[],ruleEvidenceIds:[]});
const risk=():ProofAssessmentRisk=>({title:"Inspect source",explanation:"This source detail is an unverified AI lead.",suggestion:"Inspect the cited original source.",citations:[{file:"index.html",start:0,end:html.length,excerpt:html}]});
const metadata=():ProofAssessmentWithheldRisks=>({version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:"manual-1",originalStatus:"supported",publishedStatus:"insufficient_evidence"}],entries:[{originalRiskIndex:0,risk:risk()}]});
function fixture():ProofQuote{
 const summary="Deliver the page source for manual inspection.",p=parseStaticProject({title:"Withheld source lead",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en"),d=createUploadedDelivery({"index.html":html},p.project,"en",1);
 return{id:"withheld-export-project",reference:"PBP-WITHHELD",workflow:"proof-v1",title:p.title,summary,brief:summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Website",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:p.project,criteria:p.criteria,paymentState:"unfunded",audit:[],delivery:d,review:{deliveryId:d.id,reviewedAt:at,mode:"demo",summary:"Source checked"},collaboration:{stage:"submitted",submission:{deliveryId:d.id,at,note:"Synthetic delivery"},feedback:[]}}};
}
function annotated(){const q=fixture(),d=q.proof.delivery!;d.assessment={id:"withheld-assessment",deliveryId:d.id,method:"source-ai-v1",mode:"live",model:"synthetic-no-call",assessedAt:at,items:q.proof.criteria.map(c=>({...item(c.id),ruleEvidenceIds:d.evidence.filter(e=>e.criterionId===c.id).map(e=>e.id)})),risks:[],limitations:["No model truth or execution is established."],coverage:{includedFiles:["index.html"],truncatedFiles:[],omittedFiles:[]},withheldRisks:metadata()};d.assessment.withheldRisks!.adjustedCriteria[0].criterionId=d.assessment.items[0].criterionId;return q;}
const aiRejected=(r:Awaited<ReturnType<typeof verifyEvidenceExport>>)=>r.checks.some(c=>c.id==="ai-source-citations"&&c.status==="inconsistent");

test("publication retains deep independent validated leads and exact status transitions outside active risks",()=>{
 const items=[item(),item("manual-2","changes_suggested")],original=new Map([["manual-1","supported"],["manual-2","changes_suggested"]]),risks=[risk()],before=structuredClone({items,original,risks});
 const result=publishSourceAssessmentNotes("en",items,original,risks,1,{"index.html":html});assert.deepEqual(result.risks,[]);assert.deepEqual(result.withheldRisks,metadata());
 assert.deepEqual({items,original,risks},before);result.withheldRisks!.entries[0].risk.citations[0].excerpt="later UI mutation";result.withheldRisks!.adjustedCriteria[0].originalStatus="changes_suggested";assert.deepEqual({items,original,risks},before);
});

test("adjusted zero-risk reports retain a true empty pool, while unchanged reports record not-withheld",()=>{
 const empty=publishSourceAssessmentNotes("zh",[item()],new Map([["manual-1","supported"]]),[],0,{"index.html":html});assert.equal(empty.withheldRisks!.entries.length,0);assert.equal(empty.withheldRisks!.adjustedCriteria.length,1);assert.match(empty.limitations[2],/0 条未复核风险/);
 const unchanged=publishSourceAssessmentNotes("en",[item()],new Map([["manual-1","insufficient_evidence"]]),[risk()],0,{"index.html":html});assert.deepEqual(unchanged.withheldRisks,{version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]});assert.deepEqual(unchanged.risks,[risk()]);
});

test("bounded withheld metadata round-trips current and historical assessments without proving AI truth",async()=>{
 const q=annotated(),before=structuredClone(q),d=q.proof.delivery!,saved=acceptDelivery(q,{confirm:true,deliveryId:d.id,manualChecks:d.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId)},at),bundle=await createEvidenceExport(saved);
 assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual(bundle.delivery.assessment!.withheldRisks,q.proof.delivery!.assessment!.withheldRisks);assert.deepEqual(bundle.delivery.acceptanceEvidence![0].assessment!.withheldRisks,bundle.delivery.assessment!.withheldRisks);assert.deepEqual(q,before);
 assert.equal((await verifyEvidenceExport(bundle)).limits.modelJudgment,"not-proven");
});

test("withheld dispositions reject malformed versions, reasons, scopes, status bindings and original order",async()=>{
 const base=await createEvidenceExport(annotated()),m=base.delivery.assessment!.withheldRisks!,transition=m.adjustedCriteria[0];
 const invalid:unknown[]=[null,{}, {...m,version:2},{...m,reason:"model_decision"},{...m,extra:"not allowed"},{...m,adjustedCriteria:[]},{...m,adjustedCriteria:[transition,transition]},{...m,adjustedCriteria:Array(34).fill(transition)}, {...m,adjustedCriteria:[{...transition,criterionId:"not-agreed"}]},{...m,adjustedCriteria:[{...transition,originalStatus:transition.publishedStatus}]},{...m,adjustedCriteria:[{...transition,originalStatus:"unverified"}]},{...m,adjustedCriteria:[{...transition,publishedStatus:"supported"}]},{...m,adjustedCriteria:[{...transition,extra:true}]},{...m,entries:Array(6).fill(m.entries[0])},{...m,entries:[{...m.entries[0],originalRiskIndex:1}]},{...m,entries:[{...m.entries[0],originalRiskIndex:0.5}]},{...m,entries:[{...m.entries[0],extra:"no"}]},{...m,reason:"not_withheld"}];
 for(const metadata of invalid){const changed=structuredClone(base);Object.assign(changed.delivery.assessment!,{withheldRisks:metadata});assert.ok(aiRejected(await verifyEvidenceExport(changed)),JSON.stringify(metadata));}
 const active=structuredClone(base);active.delivery.assessment!.risks=[risk()];assert.ok(aiRejected(await verifyEvidenceExport(active)));
});

test("all newly retained risks preserve strict field, source and citation bounds without legacy relaxation",async()=>{
 const base=await createEvidenceExport(annotated()),valid=risk(),missingSuggestion={title:valid.title,explanation:valid.explanation,citations:valid.citations};
 const invalid:unknown[]=[missingSuggestion,{...valid,title:"x".repeat(121)},{...valid,explanation:"x".repeat(601)},{...valid,suggestion:"x".repeat(401)},{...valid,title:" "},{...valid,extra:null},{...valid,citations:[]},{...valid,citations:Array(4).fill(valid.citations[0])},{...valid,citations:[{...valid.citations[0],file:"missing.html"}]},{...valid,citations:[{...valid.citations[0],start:1}]},{...valid,citations:[{...valid.citations[0],end:html.length+1}]},{...valid,citations:[{...valid.citations[0],excerpt:"not the supplied source"}]}];
 for(const value of invalid){const changed=structuredClone(base);Object.assign(changed.delivery.assessment!.withheldRisks!.entries[0],{risk:value});assert.ok(aiRejected(await verifyEvidenceExport(changed)),JSON.stringify(value));}
 const maximum=structuredClone(base),source=maximum.delivery.files!["index.html"],parts=["<title>Shop</title>","<p>Home</p>","<!doctype html>"],citations=parts.map(excerpt=>({file:"index.html",start:source.indexOf(excerpt),end:source.indexOf(excerpt)+excerpt.length,excerpt}));
 maximum.delivery.assessment!.withheldRisks!.entries=Array.from({length:5},(_,originalRiskIndex)=>({originalRiskIndex,risk:{title:"x".repeat(120),explanation:"x".repeat(600),suggestion:"x".repeat(400),citations:structuredClone(citations)}}));assert.equal((await verifyEvidenceExport(maximum)).consistency,"consistent");
});

test("not-withheld new reports explicitly retain no quarantined entries while legacy absence is preserved",async()=>{
 const q=annotated(),report=q.proof.delivery!.assessment!;report.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};report.risks=[risk()];const bundle=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
 for(const change of ["adjustment","entry","active-limit","active-empty-citation"]){const changed=structuredClone(bundle),r=changed.delivery.assessment!;if(change==="adjustment")r.withheldRisks!.adjustedCriteria=metadata().adjustedCriteria;if(change==="entry")r.withheldRisks!.entries=metadata().entries;if(change==="active-limit")r.risks=Array.from({length:6},risk);if(change==="active-empty-citation")r.risks[0].citations=[];assert.ok(aiRejected(await verifyEvidenceExport(changed)),change);}
 delete report.withheldRisks;report.risks[0].citations=[];const legacy=await createEvidenceExport(q);assert.equal(Object.hasOwn(legacy.delivery.assessment!,"withheldRisks"),false);assert.equal((await verifyEvidenceExport(legacy)).consistency,"consistent");
});

test("historical-only quarantines are checked without borrowing a newer report and getters never execute",async()=>{
 const q=annotated(),d=q.proof.delivery!,saved=acceptDelivery(q,{confirm:true,deliveryId:d.id,manualChecks:d.evidence.filter(e=>e.finding==="needs_human").map(e=>e.criterionId)},at);saved.proof.delivery!.assessment={...structuredClone(d.assessment!),id:"newer-assessment"};delete saved.proof.delivery!.assessment.withheldRisks;
 const bundle=await createEvidenceExport(saved);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");const changed=structuredClone(bundle);changed.delivery.acceptanceEvidence![0].assessment!.withheldRisks!.entries[0].risk.citations[0].start=1;assert.ok(aiRejected(await verifyEvidenceExport(changed)));
 const accessor=structuredClone(bundle);let ran=false;Object.defineProperty(accessor.delivery.acceptanceEvidence![0].assessment!.withheldRisks!,"reason",{enumerable:true,get(){ran=true;return "item_status_adjusted";}});assert.equal((await verifyEvidenceExport(accessor)).consistency,"inconsistent");assert.equal(ran,false);
});

test("publication bounds transitions and cannot invent a missing or invalid original status",()=>{
 const items=Array.from({length:33},(_,i)=>item(`criterion-${i}`)),original=new Map(items.map(i=>[i.criterionId,"supported"]));const result=publishSourceAssessmentNotes("en",items,original,[risk()],0,{"index.html":html});assert.equal(result.withheldRisks!.adjustedCriteria.length,33);
 for(const [values,statuses] of [[items.concat(item("extra")),new Map([...original,["extra","supported"]])],[[item(),item()],new Map([["manual-1","supported"]])],[[item()],new Map()],[[item()],new Map([["manual-1","not-a-status"]])]] as [ProofAssessmentItem[],Map<string,string>][])assert.throws(()=>publishSourceAssessmentNotes("en",values,statuses,[risk()],0,{"index.html":html}),TypeError);
 for(const originalStatus of ["supported",item().status])assert.throws(()=>publishSourceAssessmentNotes("en",[item()],new Map([["manual-1",originalStatus]]),Array.from({length:6},risk),0,{"index.html":html}),TypeError);
});

const slots=(id:string,maximum:number)=>Object.fromEntries(Array.from({length:maximum},(_,i)=>[`c${i+1}`,i===0?id:""]));
const env={DEEPSEEK_API_KEY:"controlled-offline-no-network"};
async function controlled(status="supported",patch?:(output:Record<string,unknown>,packet:Record<string,unknown>)=>void){const q=fixture(),before=structuredClone(q);let calls=0;const result=await assessDelivery(q,env,async(_url,init)=>{calls++;const packet=JSON.parse(JSON.parse(String(init!.body)).messages[1].content),id=packet.citationCatalog.entries[0].id,output={catalogId:packet.citationCatalog.catalogId,items:packet.criteria.map((c:{id:string})=>({criterionId:c.id,status,explanation:"Controlled original model wording.",citations:slots(id,6)})),risks:[{title:"Inspect source",explanation:"A potential source detail needs human review.",suggestion:"Inspect the original source.",citations:slots(id,3)}],limitations:["Controlled test, not real model output."]};patch?.(output,packet);return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"controlled",type:"function",function:{name:"submit_source_assessment_v3",arguments:JSON.stringify(output)}}]}}]});});return{q,before,result,calls};}

test("actual active assessor retains validated risks after adjustment with one controlled response and no domain mutation",async()=>{
 const {q,before,result,calls}=await controlled();assert.equal(calls,1);assert.deepEqual(q,before);assert.deepEqual(result.risks,[]);assert.equal(result.withheldRisks!.reason,"item_status_adjusted");assert.equal(result.withheldRisks!.entries.length,1);assert.ok(result.withheldRisks!.adjustedCriteria.length>0);assert.equal(result.withheldRisks!.entries[0].risk.title,"Inspect source");assert.equal(q.proof.paymentState,"unfunded");
 const unchanged=await controlled("insufficient_evidence");assert.deepEqual(unchanged.result.withheldRisks,{version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]});assert.equal(unchanged.result.risks.length,1);
});

test("invalid original risk fields or quotes reject the whole assessor response before quarantine",async()=>{
 for(const defect of ["missing-suggestion","unknown-citation","four-citation-slots","six-risks"]){await assert.rejects(controlled("supported",output=>{const risks=output.risks as Record<string,unknown>[];if(defect==="missing-suggestion")delete risks[0].suggestion;if(defect==="unknown-citation")risks[0].citations=slots("not-in-catalog",3);if(defect==="four-citation-slots")risks[0].citations=slots("not-in-catalog",4);if(defect==="six-risks")output.risks=Array.from({length:6},()=>structuredClone(risks[0]));}),e=>e instanceof AssessmentResponseError);}
});

test("explicit legacy response replay never synthesizes new withholding dispositions",async()=>{
 const q=fixture(),result=await assessDeliveryLegacyReplay(q,env,async()=>Response.json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({items:q.proof.criteria.map(c=>({criterionId:c.id,status:"supported",explanation:"Historical controlled response.",citations:[{file:"index.html",excerpt:html}]})),risks:[{title:"Historical risk",explanation:"Preserved historical wording.",suggestion:"Inspect source.",citations:[{file:"index.html",excerpt:html}]}],limitations:["Explicit historical replay."]})}}]}));assert.equal(Object.hasOwn(result,"withheldRisks"),false);assert.equal(result.risks.length,1);
});

test("retained lead citations use exact UTF-16 source positions and reject a 501-unit excerpt",async()=>{
 const q=annotated(),old=q.proof.delivery!,excerpt="🧪"+"x".repeat(497)+"Y",source=html.replace("Home","🧭 "+excerpt+"Z"),d=createUploadedDelivery({"index.html":source},q.proof.project!,"en",1);assert.equal(excerpt.length,500);
 d.assessment={...structuredClone(old.assessment!),deliveryId:d.id,items:old.assessment!.items.map(i=>({...i,ruleEvidenceIds:d.evidence.filter(e=>e.criterionId===i.criterionId).map(e=>e.id)}))};q.proof.delivery=d;q.proof.review!.deliveryId=d.id;const start=source.indexOf(excerpt);assert.ok([...source.slice(0,start)].length<start);
 d.assessment.withheldRisks!.entries[0].risk.citations=[{file:"index.html",start,end:start+excerpt.length,excerpt}];const bundle=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
 const tooLong=structuredClone(bundle),citation=tooLong.delivery.assessment!.withheldRisks!.entries[0].risk.citations[0];citation.excerpt+="Z";citation.end++;assert.ok(aiRejected(await verifyEvidenceExport(tooLong)));
 const shifted=structuredClone(bundle);shifted.delivery.assessment!.withheldRisks!.entries[0].risk.citations[0].start--;shifted.delivery.assessment!.withheldRisks!.entries[0].risk.citations[0].end--;assert.ok(aiRejected(await verifyEvidenceExport(shifted)));
});

test("explicit V2 catalog replay keeps its historical publication path without new metadata",async()=>{
 const q=fixture(),result=await assessDeliveryCatalogReplay(q,env,async(_url,init)=>{const packet=JSON.parse(JSON.parse(String(init!.body)).messages[1].content),id=packet.citationCatalog.entries[0].id;return Response.json({choices:[{finish_reason:"tool_calls",message:{content:null,tool_calls:[{id:"historical-controlled",type:"function",function:{name:"submit_source_assessment_v2",arguments:JSON.stringify({catalogId:packet.citationCatalog.catalogId,items:packet.criteria.map((c:{id:string})=>({criterionId:c.id,status:"supported",explanation:"Historical controlled V2 source advice.",citations:[id]})),risks:[{title:"Historical V2 risk",explanation:"Preserved historical wording.",suggestion:"Inspect source.",citations:[id]}],limitations:["Explicit historical V2 replay."]})}}]}}]});});assert.equal(Object.hasOwn(result,"withheldRisks"),false);assert.equal(result.risks.length,1);
});
