import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parse} from 'parse5';
import {readFile} from 'node:fs/promises';
import type {ProofAssessment,ProofQuote} from '../lib/contracts.ts';
import {parseStaticProject,createUploadedDelivery} from '../lib/static-project.ts';
import {publishSourceAssessmentNotes} from '../lib/assessment-publication-policy.ts';
import {createEvidenceExport,verifyEvidenceExport} from '../lib/evidence-export.ts';
import {recordRiskReview} from '../lib/risk-reviews.ts';
import {snapshotRiskFeedbackSource} from '../lib/risk-repairs.ts';
import {requestChanges} from '../lib/proof-workflow.ts';
import {observationScopeFixture,observationFixtureAt as at} from './assessment-observation-fixture.ts';
import {assessmentComponentModule} from './assessment-component-harness.ts';
import {assessDelivery} from '../lib/delivery-assessment.ts';
import {projectQuote,type EvaluationProject} from '../scripts/run-project-assessment-evaluation.ts';
import {canonicalAssessmentRisk} from '../lib/assessment-risk-fields.ts';
import {assessmentCitationSelection} from '../lib/assessment-citation-selection.ts';
import {resolveCatalogCitations} from '../lib/assessment-citation-catalog.ts';
import {ASSESSMENT_RISK_CITATION_LIMIT} from '../lib/assessment-limits.ts';

function fixture(language:'en'|'zh'='en'):ProofQuote{
 const requirements=['Contact source labels must include "Name:" and "E-mail:".','The page content in index.html must list the shop address.'];
 const p=parseStaticProject({title:'Controlled unbound proposals',summary:requirements.join('\n'),amount:'1.00',requiredPages:['index.html'],manualRequirements:requirements},language);
 const source='<!doctype html><html><head><title>Controlled source</title></head><body><form><label>Name:</label><input type="email" name="mail"></form><p>7 Example Road</p></body></html>';
 const delivery=createUploadedDelivery({'index.html':source},p.project,language,1),citation={file:'index.html',start:0,end:source.length,excerpt:source};
 const items:ProofAssessment['items']=p.criteria.map(c=>({criterionId:c.id,status:c.id==='mobile'?'insufficient_evidence':c.id==='manual-1'?'changes_suggested':'supported',explanation:'Controlled source-only item.',citations:c.id==='mobile'?[]:[{...citation}],ruleEvidenceIds:delivery.evidence.filter(e=>e.criterionId===c.id).map(e=>e.id)}));
 const risks:ProofAssessment['risks']=[{title:'Signup form lacks a visible E-mail label',explanation:'The model calls this fragment Signup without an agreed page mapping.',suggestion:'If index.html is the Signup page, add the E-mail label.',citations:[{...citation}]},{title:'Remove this partial form',explanation:'The model proposal is not an independent agreed obligation.',suggestion:'Confirm where the labels belong and remove this fragment.',citations:[{...citation}]}];
 const publication=publishSourceAssessmentNotes(language,items,new Map(items.map(i=>[i.criterionId,i.status])),risks,0,delivery.files!,p.criteria,{hasBusinessChecks:false});
 delivery.assessment={id:'controlled-unbound-report',deliveryId:delivery.id,method:'source-ai-v1',mode:'live',model:'controlled-no-provider',assessedAt:at,items,risks:publication.risks,withheldRisks:publication.withheldRisks,limitations:publication.limitations,coverage:{includedFiles:['index.html'],truncatedFiles:[],omittedFiles:[]}};
 const q=observationScopeFixture(language);
 return{...q,title:p.title,summary:p.summary,proof:{...q.proof,project:p.project,criteria:p.criteria,delivery,review:{deliveryId:delivery.id,mode:'demo',summary:'Controlled fixture, no provider or browser.',reviewedAt:at},collaboration:{stage:'submitted',submission:{deliveryId:delivery.id,note:'Controlled fixture',at},feedback:[]}}};
}

test('v4 retains every unbound original lead and exact indices without changing informative item findings',()=>{
 const q=fixture(),d=q.proof.delivery!,a=d.assessment!,pool=a.withheldRisks!;
 assert.equal(pool.version,4);assert.equal(pool.reason,'optional_source_leads_unverified');assert.deepEqual(pool.adjustedCriteria,[]);assert.equal(Object.hasOwn(pool,'scopeCriterionIds'),false);assert.deepEqual(a.risks,[]);assert.deepEqual(pool.entries.map(e=>e.originalRiskIndex),[0,1]);
 const risks=pool.entries.map(e=>structuredClone(e.risk)),items=structuredClone(a.items),original=new Map(items.map(i=>[i.criterionId,i.status]));
 for(const context of[undefined,{hasBusinessChecks:false},{hasBusinessChecks:true}]){
  const result=publishSourceAssessmentNotes('en',items,original,risks,0,d.files!,q.proof.criteria,context);
  assert.equal(result.withheldRisks?.version,4);assert.equal(result.statusAdjustedCount,0);assert.deepEqual(result.withheldRisks!.entries.map(e=>e.risk),risks);assert.deepEqual(items,a.items);assert.deepEqual(result.risks,[]);
 }
 const result=publishSourceAssessmentNotes('en',items,original,risks,0,d.files!);result.withheldRisks!.entries[0].risk.title='Changed presentation copy';assert.notEqual(result.withheldRisks!.entries[0].risk.title,risks[0].title);
 assert.ok(items.some(i=>i.status==='supported'));assert.ok(items.some(i=>i.status==='changes_suggested'));
 assert.equal(publishSourceAssessmentNotes('en',items,original,[],0,d.files!).withheldRisks?.reason,'not_withheld');
 original.set(items[0].criterionId,'insufficient_evidence');assert.equal(publishSourceAssessmentNotes('en',items,original,risks,0,d.files!).withheldRisks?.version,1);
});

test('v4 export verifies complete exclusive source records and rejects forged pools while legacy imports stay readable',async()=>{
 const q=fixture(),base=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(base)).consistency,'consistent');
 const mutations:((b:any)=>void)[]=[b=>{b.delivery.assessment.withheldRisks.reason='not_withheld';},b=>{b.delivery.assessment.withheldRisks.version=3;},b=>{b.delivery.assessment.withheldRisks.scopeCriterionIds=[];},b=>{b.delivery.assessment.withheldRisks.adjustedCriteria=[{criterionId:'manual-1',originalStatus:'supported',publishedStatus:'changes_suggested'}];},b=>{b.delivery.assessment.withheldRisks.entries=[];},b=>{b.delivery.assessment.withheldRisks.entries[0].originalRiskIndex=1;},b=>{b.delivery.assessment.withheldRisks.entries.reverse();},b=>{b.delivery.assessment.risks=[b.delivery.assessment.withheldRisks.entries[0].risk];},b=>{delete b.delivery.assessment.withheldRisks.entries[0].risk.suggestion;},b=>{b.delivery.assessment.withheldRisks.entries[0].risk.citations[0].excerpt='Different source';},b=>{b.delivery.assessment.mode='demo';},b=>{b.delivery.assessment.method='browser-ai';}];
 for(const mutate of mutations){const b=structuredClone(base);mutate(b);assert.equal((await verifyEvidenceExport(b)).checks.find(c=>c.id==='ai-source-citations')?.status,'inconsistent');}
 const legacy=structuredClone(base),a=legacy.delivery.assessment!;a.risks=a.withheldRisks!.entries.map(e=>e.risk);a.withheldRisks={version:1,reason:'not_withheld',adjustedCriteria:[],entries:[]};assert.equal((await verifyEvidenceExport(legacy)).consistency,'consistent');
});

test('v4 exact withheld comments append without release; origin, report, entry and source forgeries fail closed',async()=>{
 const q=fixture(),d=q.proof.delivery!,a=d.assessment!,before=structuredClone(q),input={deliveryId:d.id,assessmentId:a.id,riskIndex:0,riskOrigin:'withheld' as const,decision:'confirmed' as const,reason:'Human opinion only; page scope still requires agreement.'};
 for(const role of['buyer','seller']as const){const next=recordRiskReview(q,role,input,at);assert.deepEqual(q,before);assert.deepEqual(next.proof.delivery!.assessment,a);assert.equal(next.proof.paymentState,'unfunded');assert.equal(next.proof.acceptedDeliveryId,undefined);assert.equal(next.proof.delivery!.riskReviews![0].riskOrigin,'withheld');assert.equal(recordRiskReview(next,role,input,at),next);assert.equal((await verifyEvidenceExport(await createEvidenceExport(next))).consistency,'consistent');
  for(const criterionId of['manual-1','manual-2'])assert.throws(()=>requestChanges(next,{deliveryId:d.id,feedback:[{criterionId,comment:'A confirmed opinion must not authorize this repair.',riskSource:{assessmentId:a.id,riskIndex:0}}]},at),/cannot authorize linked repair/u);
 }
 for(const patch of[{deliveryId:'old'},{assessmentId:'old'},{riskIndex:2},{riskOrigin:'published'}])assert.throws(()=>recordRiskReview(q,'buyer',{...input,...patch},at));
 const mutations:((q:any)=>void)[]=[q=>{q.proof.delivery.assessment.risks=[q.proof.delivery.assessment.withheldRisks.entries[0].risk];},q=>{q.proof.delivery.assessment.withheldRisks.scopeCriterionIds=[];},q=>{q.proof.delivery.assessment.withheldRisks.entries[0].originalRiskIndex=1;},q=>{q.proof.delivery.assessment.withheldRisks.entries[0].risk={};},q=>{q.proof.delivery.assessment.withheldRisks.entries[0].risk.citations[0].excerpt='changed';}];
 for(const mutate of mutations){const forged=structuredClone(q);mutate(forged);assert.throws(()=>recordRiskReview(forged,'buyer',input,at));const {riskOrigin,...published}=input;assert.throws(()=>recordRiskReview(forged,'buyer',published,at));}
});

test('v4 source proposals cannot seed repair through either API namespace, even with a malformed active pool',()=>{
 const q=fixture(),d=q.proof.delivery!,a=d.assessment!,before=structuredClone(q),reference={assessmentId:a.id,riskIndex:0};
 for(const malformed of[false,true]){const supplied=structuredClone(q);if(malformed)supplied.proof.delivery!.assessment!.risks=[structuredClone(a.withheldRisks!.entries[0].risk)];assert.throws(()=>snapshotRiskFeedbackSource(supplied,'manual-1',reference),/cannot authorize linked repair/u);assert.throws(()=>requestChanges(supplied,{deliveryId:d.id,feedback:[{criterionId:'manual-1',comment:'Model proposal must not create this task.',riskSource:reference}]},at));}
 assert.deepEqual(q,before);
 const reasonOnly=structuredClone(q);Object.assign(reasonOnly.proof.delivery!.assessment!.withheldRisks!,{version:1});assert.throws(()=>snapshotRiskFeedbackSource(reasonOnly,'manual-1',reference),/cannot authorize linked repair/u);
});

test('actual bilingual v4 component keeps assertive raw wording and citations inside one unverified disclosure with no repair action',async()=>{
 const{Component,cleanup}=await assessmentComponentModule();try{for(const language of['en','zh']as const){const q=fixture(language),a=q.proof.delivery!.assessment!,html=renderToStaticMarkup(createElement(Component,{report:a,criteria:q.proof.criteria,language,actorRole:'buyer',onSaveRiskReview:async()=>{},onPrepareFeedback:()=>{}}));
 const tree=parse(html),nodes:any[]=[];const visit=(node:any)=>{nodes.push(node);for(const child of node.childNodes??[])visit(child);};visit(tree);
 const originals=nodes.filter(n=>n.tagName==='details'&&n.attrs.some((a:any)=>a.name==='data-unverified-original'&&a.value==='true'));assert.equal(originals.length,2);
 const text=(node:any):string=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(text).join('');
 for(const[index,entry]of a.withheldRisks!.entries.entries()){assert.ok(text(originals[index]).includes(entry.risk.title));assert.ok(text(originals[index]).includes(entry.risk.explanation));assert.ok(text(originals[index]).includes(entry.risk.suggestion));assert.ok(text(originals[index]).includes(entry.risk.citations[0].excerpt));}
 for(const node of nodes.filter(n=>n.tagName==='h4'))assert.ok(!a.withheldRisks!.entries.some(e=>text(node).includes(e.risk.title)));
 assert.doesNotMatch(html,/risk-feedback-button|Prepare linked repair/u);assert.match(html,language==='en'?/Unverified model proposal 1/u:/未核验模型提议 1/u);assert.match(html,language==='en'?/Save my human opinion/u:/保存我的核对意见/u);
 const forged=structuredClone(a);forged.risks=[structuredClone(a.withheldRisks!.entries[0].risk)];const malformed=renderToStaticMarkup(createElement(Component,{report:forged,criteria:q.proof.criteria,language,onPrepareFeedback:()=>{}}));assert.doesNotMatch(malformed,/risk-feedback-button|Signup form lacks/u);
 }}finally{await cleanup();}
});

test('all three retained first replies preserve every raw risk through explicit v4 publication with zero network',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/qualified-answers-three-replay.json',import.meta.url),'utf8'));assert.equal(fixture.cases.length,3);
 for(const entry of fixture.cases){
  const quote=projectQuote(entry.project as EvaluationProject),before=structuredClone(quote),raw=structuredClone(entry.raw);let calls=0,expectedRisks:unknown;
  const report=await assessDelivery(quote,{DEEPSEEK_API_KEY:'controlled-no-network'},async(_url,init)=>{
   calls++;const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.messages[1].content);assert.equal(packet.citationCatalog.catalogId,raw.catalogId);
   expectedRisks=raw.risks.map((risk:unknown)=>{const fields=canonicalAssessmentRisk(risk).fields;return{...fields,citations:resolveCatalogCitations(assessmentCitationSelection(fields.citations,ASSESSMENT_RISK_CITATION_LIMIT,'catalog_slots'),packet.citationCatalog,ASSESSMENT_RISK_CITATION_LIMIT)};});
   return Response.json({choices:[{finish_reason:'tool_calls',message:{tool_calls:[{type:'function',function:{name:request.tools[0].function.name,arguments:JSON.stringify(raw)}}]}}]});
  });
  assert.equal(calls,1);assert.deepEqual(quote,before);assert.deepEqual(raw,entry.raw);assert.equal(report.withheldRisks?.version,4,entry.project.id);assert.deepEqual(report.withheldRisks!.adjustedCriteria,[]);assert.deepEqual(report.risks,[]);assert.deepEqual(report.withheldRisks!.entries.map(e=>e.risk),expectedRisks);assert.deepEqual(report.withheldRisks!.entries.map(e=>e.originalRiskIndex),raw.risks.map((_:unknown,i:number)=>i));
  assert.deepEqual(report.items.map(i=>({criterionId:i.criterionId,status:i.status})),raw.items.map((i:any)=>({criterionId:i.criterionId,status:i.status})));assert.equal(quote.proof.paymentState,'unfunded');assert.equal(quote.proof.acceptedAt,undefined);
 }
});
