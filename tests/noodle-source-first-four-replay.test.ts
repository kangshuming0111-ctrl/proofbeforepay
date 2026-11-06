import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import type {ProofQuote,ProofAssessment} from "../lib/contracts.ts";

test("all four immutable real first replies replay without calls: separate source facts close inert-decoy abstention, raw and published status remain auditable",async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/noodle-f1-first-four-replay.json',import.meta.url),'utf8'));
 let sourceMatches=0,publishedMatches=0,rawMatches=0,focused=0;
 for(const entry of fixture.cases){
  assert.equal(createHash('sha256').update(entry.rawProviderBodyText).digest('hex'),entry.rawProviderSha256);
  const q=entry.quote as ProofQuote,before=structuredClone(q);let calls=0;
  const result=await assessDelivery(q,{DEEPSEEK_API_KEY:'controlled-offline-no-network',DEEPSEEK_MODEL:'deepseek-flash'},async(_url,init)=>{
   calls++;assert.equal(String(init?.body),entry.requestBody);return new Response(entry.rawProviderBodyText,{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(calls,1);assert.deepEqual(q,before);
  for(const item of result.items){const old=(entry.originalApplication as ProofAssessment).items.find(i=>i.criterionId===item.criterionId)!;assert.deepEqual(item.modelJudgment,old.modelJudgment);assert.equal(item.status,old.status);}
  for(const ref of entry.reference){const item=result.items.find(i=>i.criterionId===ref.criterionId)!;focused++;rawMatches+=Number(item.modelJudgment?.status===ref.expectedStatus);publishedMatches+=Number(item.status===ref.expectedStatus);sourceMatches+=Number((item.sourceFinding?.status??item.status)===ref.expectedStatus);}
  if(entry.id==='f1-sealed-wrong-object'){
   const item=result.items.find(i=>i.criterionId==='coverage-1')!;assert.equal(item.status,'insufficient_evidence');assert.equal(item.sourceFinding?.status,'changes_suggested');assert.equal(entry.originalApplication.items.find((i:any)=>i.criterionId===item.criterionId).sourceFinding.status,'insufficient_evidence');
  }
  if(entry.id==='f1-sealed-runtime-insufficient')for(const id of ['coverage-2','coverage-3']){const item=result.items.find(i=>i.criterionId===id)!;assert.equal(item.status,'insufficient_evidence');assert.equal(item.evidenceNeed!.reason,'record_readback');assert.equal(item.sourceFinding,undefined);}
 }
 assert.deepEqual({focused,rawMatches,publishedMatches,sourceMatches},{focused:9,rawMatches:9,publishedMatches:7,sourceMatches:9});
});
