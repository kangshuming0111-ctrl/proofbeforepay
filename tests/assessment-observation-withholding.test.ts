import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ProofAssessmentWithheldRisks,ProofCriterion} from '../lib/contracts.ts';
import {observationOnlyCustomScopeCriterionIds,publishSourceAssessmentNotes} from '../lib/assessment-publication-policy.ts';
import {createEvidenceExport,verifyEvidenceExport} from '../lib/evidence-export.ts';
import {recordRiskReview} from '../lib/risk-reviews.ts';
import {snapshotRiskFeedbackSource} from '../lib/risk-repairs.ts';
import {acceptDeliveryWithBasis as acceptDelivery} from './acceptance-client.ts';
import {observationScopeFixture,observationFixtureAt as at} from './assessment-observation-fixture.ts';
import {assessmentComponentModule} from './assessment-component-harness.ts';
const context={hasBusinessChecks:false};
test('v3 explicitly scopes only unchanged insufficient custom observation requirements beside canonical page/mobile',()=>{
 for(const language of['en','zh']as const){const q=observationScopeFixture(language),a=q.proof.delivery!.assessment!,pool=a.withheldRisks!;
 assert.deepEqual(observationOnlyCustomScopeCriterionIds(q.proof.criteria,a.items,context),['manual-1','manual-2']);assert.equal(pool.version,3);assert.equal(pool.reason,'custom_scope_requires_observation');assert.deepEqual(pool.adjustedCriteria,[]);assert.equal(pool.entries.length,2);assert.deepEqual(a.risks,[]);assert.ok(a.items.filter(i=>i.criterionId.startsWith('manual-')).every(i=>i.status==='insufficient_evidence'));
 }
});
test('missing or business-positive context, any link/other obligation, source-text custom item and forged canonical criteria disable newv3',()=>{
 const q=observationScopeFixture(),a=q.proof.delivery!.assessment!;
 for(const supplied of[undefined,{hasBusinessChecks:true},{hasBusinessChecks:'false'}as never,{}as never])assert.equal(observationOnlyCustomScopeCriterionIds(q.proof.criteria,a.items,supplied),undefined);
 for(const c of[{id:'link',title:'Link',source:'index.html contains a link labelled “Contact” pointing to contact.html.'},{id:'business-1',title:'Business',source:'The form must save a record.'},{id:'manual-6',title:'Other',source:'The form must save a record.'},{id:'coverage-13',title:'Other',source:'The form must send email.'}])assert.equal(observationOnlyCustomScopeCriterionIds([...q.proof.criteria,c],[...a.items,{criterionId:c.id,status:'insufficient_evidence'}],context),undefined,c.id);
 const staticCriteria=q.proof.criteria.map(c=>c.id==='manual-2'?{...c,source:'The page content must list the shop phone number.'}:c);assert.equal(observationOnlyCustomScopeCriterionIds(staticCriteria,a.items,context),undefined);
 for(const id of['page-1','mobile']){const criteria=q.proof.criteria.map(c=>c.id===id?{...c,source:'The form must send email.'}:c);assert.equal(observationOnlyCustomScopeCriterionIds(criteria,a.items,context),undefined,id);}
});
test('exact identity/order/cardinality, bounded IDs, custom status and at least one custom criterion are required',()=>{
 const q=observationScopeFixture(),a=q.proof.delivery!.assessment!;
 assert.equal(observationOnlyCustomScopeCriterionIds(q.proof.criteria,[...a.items].reverse(),context),undefined);assert.equal(observationOnlyCustomScopeCriterionIds(q.proof.criteria,a.items.slice(1),context),undefined);
 assert.equal(observationOnlyCustomScopeCriterionIds([q.proof.criteria[0],q.proof.criteria[0]],[a.items[0],a.items[0]],context),undefined);
 assert.equal(observationOnlyCustomScopeCriterionIds(q.proof.criteria,a.items.map(i=>i.criterionId==='manual-1'?{...i,status:'supported'}:i),context),undefined);
 const only=q.proof.criteria.filter(c=>!c.id.startsWith('manual-'));assert.equal(observationOnlyCustomScopeCriterionIds(only,a.items.filter(i=>!i.criterionId.startsWith('manual-')),context),undefined);
});
test('v3 preserves original risk bytes independently without inventing adjusted states; zero risks and v1/v2 priority remain unchanged',()=>{
 const q=observationScopeFixture(),d=q.proof.delivery!,a=d.assessment!,risks=a.withheldRisks!.entries.map(e=>structuredClone(e.risk)),before=structuredClone({items:a.items,risks});
 const original=new Map(a.items.map(i=>[i.criterionId,i.status])),result=publishSourceAssessmentNotes('en',a.items,original,risks,0,d.files!,q.proof.criteria,context);
 assert.equal(result.statusAdjustedCount,0);assert.equal(JSON.stringify(result.withheldRisks!.entries.map(e=>e.risk)),JSON.stringify(risks));assert.deepEqual(result.withheldRisks!.entries.map(e=>e.originalRiskIndex),[0,1]);result.withheldRisks!.entries[0].risk.suggestion='Presentation edit';assert.deepEqual({items:a.items,risks},before);
 const noRisk=publishSourceAssessmentNotes('en',a.items,original,[],0,d.files!,q.proof.criteria,context);assert.equal(noRisk.withheldRisks!.version,1);assert.equal(noRisk.withheldRisks!.reason,'not_withheld');
 original.set('manual-1','supported');const adjusted=publishSourceAssessmentNotes('en',a.items,original,risks,0,d.files!,q.proof.criteria,context);assert.equal(adjusted.withheldRisks!.reason,'item_status_adjusted');assert.equal(adjusted.withheldRisks!.version,1);
 const phone:ProofCriterion={id:'manual-1',title:'Phone copy',source:'The page content must list the shop phone number.'};const item={...a.items.at(-1)!,criterionId:phone.id};const old=publishSourceAssessmentNotes('en',[item],new Map([[phone.id,item.status]]),risks,0,d.files!,[phone],context);assert.equal(old.withheldRisks!.version,2);
});
test('v3 exports replay scopes and reject invented metadata, state adjustments, source/category changes and non-empty business metadata',async()=>{
 const q=observationScopeFixture(),base=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(base)).consistency,'consistent');
 const failed=async(b:typeof base)=>assert.equal((await verifyEvidenceExport(b)).checks.find(c=>c.id==='ai-source-citations')?.status,'inconsistent');
 for(const kind of['order','missing-id','foreign-id','duplicate-id','ledger','empty-pool','risk-index','active-risk','reason','version','source','status','business-plan']){
  const b=structuredClone(base),a=b.delivery.assessment!,pool=a.withheldRisks as Extract<ProofAssessmentWithheldRisks,{version:3}>;
  if(kind==='order')pool.scopeCriterionIds.reverse();if(kind==='missing-id')pool.scopeCriterionIds.pop();if(kind==='foreign-id')pool.scopeCriterionIds[0]='mobile';if(kind==='duplicate-id')pool.scopeCriterionIds[1]=pool.scopeCriterionIds[0];if(kind==='ledger')pool.adjustedCriteria=[{criterionId:'manual-1',originalStatus:'supported',publishedStatus:'insufficient_evidence'}];if(kind==='empty-pool')pool.entries=[];if(kind==='risk-index')pool.entries[0].originalRiskIndex=1;if(kind==='active-risk')a.risks=[structuredClone(pool.entries[0].risk)];if(kind==='reason')Object.assign(pool,{reason:'source_scope_unestablished'});if(kind==='version')Object.assign(pool,{version:1});if(kind==='source')b.project.criteria.find(c=>c.id==='manual-1')!.source='The page content must list the shop phone number.';if(kind==='status')a.items.find(i=>i.criterionId==='manual-1')!.status='supported';if(kind==='business-plan')Object.assign(b.project.spec!,{businessChecks:[{}]});await failed(b);
 }
});
test('an explicit empty business list retains the no-business v3 scope while a non-empty list disables it',async()=>{
 const base=await createEvidenceExport(observationScopeFixture()),empty=structuredClone(base);Object.assign(empty.project.spec!,{businessChecks:[]});
 const result=await verifyEvidenceExport(empty);assert.equal(result.checks.find(c=>c.id==='ai-source-citations')?.status,'consistent');
 const present=structuredClone(base);Object.assign(present.project.spec!,{businessChecks:[{}]});assert.equal((await verifyEvidenceExport(present)).checks.find(c=>c.id==='ai-source-citations')?.status,'inconsistent');
});
test('v3 human comments stay in withheld namespace and cannot release original leads or create linked repairs',async()=>{
 const q=observationScopeFixture(),d=q.proof.delivery!,a=d.assessment!,before=structuredClone(q);
 for(const role of['buyer','seller']as const){const input={deliveryId:d.id,assessmentId:a.id,riskIndex:0,riskOrigin:'withheld' as const,decision:'confirmed' as const,reason:'Controlled human opinion only.'},n=recordRiskReview(q,role,input,at);assert.deepEqual(q,before);assert.deepEqual(n.proof.delivery!.assessment,a);assert.equal(n.proof.paymentState,'unfunded');assert.equal(n.proof.delivery!.riskReviews![0].riskOrigin,'withheld');assert.equal(recordRiskReview(n,role,input,at),n);const published={...input};delete(published as {riskOrigin?:unknown}).riskOrigin;assert.throws(()=>recordRiskReview(q,role,published,at));assert.throws(()=>snapshotRiskFeedbackSource(n,'manual-1',{assessmentId:a.id,riskIndex:0}));assert.equal((await verifyEvidenceExport(await createEvidenceExport(n))).consistency,'consistent');}
 const forged=structuredClone(q);Object.assign(forged.proof.delivery!.assessment!.withheldRisks!,{scopeCriterionIds:['mobile']});assert.throws(()=>recordRiskReview(forged,'buyer',{deliveryId:d.id,assessmentId:a.id,riskIndex:0,riskOrigin:'withheld',decision:'needs_evidence',reason:'Controlled'},at));
});
test('frozen v3 historical assessment and comment origins survive later reports and reject historical tampering',async()=>{
 const q=observationScopeFixture(),d=q.proof.delivery!,a=d.assessment!,reviewed=recordRiskReview(q,'seller',{deliveryId:d.id,assessmentId:a.id,riskIndex:1,riskOrigin:'withheld',decision:'needs_evidence',reason:'Controlled historical opinion.'},at);
 const saved=acceptDelivery(reviewed,{confirm:true,deliveryId:d.id,manualChecks:d.evidence.filter(e=>e.finding==='needs_human').map(e=>e.criterionId)},at);saved.proof.delivery!.assessment={...structuredClone(a),id:'newer-controlled-report'};delete saved.proof.delivery!.riskReviews;
 const bundle=await createEvidenceExport(saved);assert.equal((await verifyEvidenceExport(bundle)).consistency,'consistent');const changed=structuredClone(bundle);delete changed.delivery.acceptanceEvidence![0].riskReviews[0].riskOrigin;assert.equal((await verifyEvidenceExport(changed)).consistency,'inconsistent');
});
test('actual bilingual component renders v3 original leads and comments separately with no linked repair actions',async()=>{
 const {Component,cleanup}=await assessmentComponentModule();try{for(const language of['en','zh']as const){const q=observationScopeFixture(language),a=q.proof.delivery!.assessment!,html=renderToStaticMarkup(createElement(Component,{report:a,criteria:q.proof.criteria,language,actorRole:'buyer',onSaveRiskReview:async()=>{},onPrepareFeedback:()=>{}}));assert.match(html,language==='en'?/Custom requirements need observation.*item statuses unchanged/u:/自定义要求待观察.*逐项状态未调整/u);const from=html.indexOf('class="assessment-withheld-body"'),to=html.indexOf('class="assessment-coverage"',from),body=html.slice(from,to);assert.ok(body.includes('Inspect storage outcome'));assert.match(body,language==='en'?/This section offers no linked repair actions/u:/本区不提供关联返工操作/u);assert.doesNotMatch(body,/risk-feedback-button|Prepare linked repair/u);assert.match(body,language==='en'?/Save my human opinion/u:/保存我的核对意见/u);assert.doesNotMatch(body,/Some item statuses changed/u);}}
 finally{await cleanup();}
});
