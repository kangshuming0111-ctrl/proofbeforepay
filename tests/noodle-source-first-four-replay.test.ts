import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import type {ProofQuote,ProofAssessment} from "../lib/contracts.ts";

test("four immutable first replies preserve old7/9 records while exactly two proved source negatives receive auditable publication",async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/noodle-f1-first-four-replay.json',import.meta.url),'utf8'));
 assert.equal(fixture.firstLiveSummary.publishedStatusMatches,7);
 let sourceMatches=0,publishedMatches=0,rawMatches=0,focused=0;
 for(const entry of fixture.cases){
  assert.equal(createHash('sha256').update(entry.rawProviderBodyText).digest('hex'),entry.rawProviderSha256);
  const q=entry.quote as ProofQuote,before=structuredClone(q);let calls=0;
  const result=await assessDelivery(q,{DEEPSEEK_API_KEY:'controlled-offline-no-network',DEEPSEEK_MODEL:'deepseek-flash'},async(_url,init)=>{
   calls++;assert.equal(String(init?.body),entry.requestBody);return new Response(entry.rawProviderBodyText,{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(calls,1);assert.deepEqual(q,before);
  const expectedReason=entry.id==='f1-sealed-wrong-object'?'locked_price_mismatch':entry.id==='f1-sealed-wrong-page'?'confirmed_form_label_absence':undefined;
  const restoredId=entry.id==='f1-sealed-wrong-object'?'coverage-1':entry.id==='f1-sealed-wrong-page'?'coverage-2':undefined;
  for(const item of result.items){
   const old=(entry.originalApplication as ProofAssessment).items.find(i=>i.criterionId===item.criterionId)!;assert.deepEqual(item.modelJudgment,old.modelJudgment);
   if(item.criterionId===restoredId){
    assert.equal(old.status,'insufficient_evidence');assert.equal(item.status,'changes_suggested');
    assert.deepEqual(item.publicationBasis,{schema:'source-publication-v3',reason:expectedReason});
    assert.equal(item.explanation,item.sourceFinding!.explanation);assert.deepEqual(item.citations,item.sourceFinding!.citations);assert.equal(item.evidenceNeed,undefined);
   }else{assert.equal(item.status,old.status);assert.equal(item.publicationBasis,undefined);}
  }
  assert.deepEqual(result.publicationPolicy,{schema:'source-publication-v3',reconciledCriterionIds:restoredId?[restoredId]:[]});
  assert.equal(result.risks.length,0);
  if(restoredId){assert.equal(result.withheldRisks?.reason,'optional_source_leads_unverified');assert.deepEqual(result.withheldRisks!.entries,entry.originalApplication.withheldRisks.entries);}
  for(const ref of entry.reference){const item=result.items.find(i=>i.criterionId===ref.criterionId)!;focused++;rawMatches+=Number(item.modelJudgment?.status===ref.expectedStatus);publishedMatches+=Number(item.status===ref.expectedStatus);sourceMatches+=Number((item.sourceFinding?.status??item.status)===ref.expectedStatus);}
  if(entry.id==='f1-sealed-wrong-object'){
   const item=result.items.find(i=>i.criterionId==='coverage-1')!;assert.equal(item.status,'changes_suggested');assert.equal(item.sourceFinding?.status,'changes_suggested');assert.equal(entry.originalApplication.items.find((i:any)=>i.criterionId===item.criterionId).sourceFinding.status,'insufficient_evidence');
  }
  if(entry.id==='f1-sealed-runtime-insufficient')for(const id of ['coverage-2','coverage-3']){const item=result.items.find(i=>i.criterionId===id)!;assert.equal(item.status,'insufficient_evidence');assert.equal(item.evidenceNeed!.reason,'record_readback');assert.equal(item.sourceFinding,undefined);}
 }
 assert.deepEqual({focused,rawMatches,publishedMatches,sourceMatches},{focused:9,rawMatches:9,publishedMatches:9,sourceMatches:9});
});
