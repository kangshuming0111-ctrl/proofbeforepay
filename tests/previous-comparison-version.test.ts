import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import type {ProofDelivery,ProofDeliveryVersion} from "../lib/contracts.ts";
import {comparisonVersionKey,comparisonVersionSummaries,loadPreviousComparisonVersion,type PreviousComparisonContext} from "../lib/previous-comparison-version.ts";
import {isOlderDelivery} from "../lib/delivery-comparison.ts";
import {buildRuntimeComparison} from "../lib/runtime-comparison.ts";
import type {EvidenceExport} from "../lib/evidence-export.ts";

const delivery=(sequence:number):ProofDelivery=>({id:`delivery-${sequence}`,variant:"upload",sequence,label:`Version ${sequence}`,submittedAt:`2026-11-03T00:0${sequence}:00.000Z`,evidence:[],files:{"index.html":`<!doctype html><title>Version ${sequence}</title><p>Saved original ${sequence}</p>`}});
function fixture(){
  const full:ProofDeliveryVersion={delivery:delivery(1),feedback:[],archivedAt:"2026-11-03T00:02:00.000Z"};
  const summary=structuredClone(full);delete summary.delivery.files;
  const context:PreviousComparisonContext={projectId:"project-1",currentDelivery:delivery(2),previousSummary:summary,role:"seller"};return {full,context};
}
const isAbort=(cause:unknown)=>cause instanceof DOMException&&cause.name==="AbortError";

test("a lightweight list stays lightweight while exactly one project-scoped full archive is loaded",async()=>{
  const {full,context}=fixture(),before=structuredClone(context),controller=new AbortController();let calls=0;
  const loaded=await loadPreviousComparisonVersion(context,async(path,signal)=>{calls++;assert.equal(path,"/api/proofs/project-1/versions/delivery-1");assert.equal(signal,controller.signal);return {version:full};},controller.signal);
  assert.equal(calls,1);assert.ok(loaded.delivery.files);assert.deepEqual(context,before);assert.equal(context.previousSummary.delivery.files,undefined);
  loaded.delivery.files!["index.html"]="Changed projection";assert.notEqual(full.delivery.files!["index.html"],"Changed projection");
});

test("summary-only, wrong archive IDs and inconsistent ordering are refused without fallback",async()=>{
  const {full,context}=fixture();
  for(const value of [context.previousSummary,{...full,delivery:{...full.delivery,id:"wrong-delivery"}},{...full,isCurrent:true},{...full,archivedAt:"2026-11-03T00:03:00.000Z"},{...full,delivery:{...full.delivery,sequence:3}},{...full,delivery:{...full.delivery,submittedAt:"2099-01-01T00:00:00.000Z"}}]){
    let calls=0;await assert.rejects(loadPreviousComparisonVersion(context,async()=>{calls++;return {version:value};},new AbortController().signal));assert.equal(calls,1);
  }
});

test("an invalid/current summary causes no archive request",async()=>{
  const {context}=fixture();context.previousSummary.delivery=context.currentDelivery;let calls=0;
  await assert.rejects(loadPreviousComparisonVersion(context,async()=>{calls++;return {};},new AbortController().signal));assert.equal(calls,0);
});

test("a full runtime pin must retain the requested project identity",async()=>{
  const {full,context}=fixture();full.delivery.runtimeRegistration={id:"staging",label:"Staging",registrationRevision:"r1",projectId:"other-project",protocol:"booking-http-v1",baseUrl:"https://staging.example.org/",deploymentRevision:"d1",frontendBundleDigest:"a".repeat(64),expiresAt:"2099-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
  await assert.rejects(loadPreviousComparisonVersion(context,async()=>({version:full}),new AbortController().signal),/another project/u);
});

test("authorization failures are surfaced and never retried against another project or endpoint",async()=>{
  const {context}=fixture();let calls=0;const rejected=new Error("Member access denied");
  await assert.rejects(loadPreviousComparisonVersion(context,async()=>{calls++;throw rejected;},new AbortController().signal),cause=>cause===rejected);assert.equal(calls,1);
});

test("abort and superseded project/delivery context discard late responses even if the reader ignores cancellation",async()=>{
  for(const cancel of ["abort","context"]){
    const {full,context}=fixture(),controller=new AbortController();let release!:(value:unknown)=>void,current=true;
    const pending=loadPreviousComparisonVersion(context,()=>new Promise(resolve=>{release=resolve;}),controller.signal,()=>current);
    if(cancel==="abort")controller.abort();else current=false;release({version:full});await assert.rejects(pending,isAbort);
  }
});

test("keys isolate project, current delivery, role and selected archive; async request identity is snapshotted",async()=>{
  const {full,context}=fixture(),key=comparisonVersionKey(context);
  for(const changed of [{...context,projectId:"project-2"},{...context,role:"buyer" as const},{...context,currentDelivery:delivery(3)},{...context,previousSummary:{...context.previousSummary,delivery:{...context.previousSummary.delivery,id:"other-archive"}}}])assert.notEqual(comparisonVersionKey(changed),key);
  let release!:(value:unknown)=>void;const pending=loadPreviousComparisonVersion(context,()=>new Promise(resolve=>{release=resolve;}),new AbortController().signal);
  context.projectId="changed-after-start";context.previousSummary.delivery.id="changed-after-start";release({version:full});assert.equal((await pending).delivery.id,"delivery-1");
});

test("recorded v1/v2 observations survive lightweight list to one full archive fetch and exact runtime comparison",async()=>{
  // Actual saved observation packages, with a synthetic archive transport here.
  // This test does not execute the recorded backend or make HTTP requests.
  const old=JSON.parse(await readFile(new URL("./fixtures/recorded-seller-staging/v1-evidence.json",import.meta.url),"utf8")) as EvidenceExport;
  const current=JSON.parse(await readFile(new URL("./fixtures/recorded-seller-staging/v2-evidence.json",import.meta.url),"utf8")) as EvidenceExport;
  assert.equal(old.project.id,current.project.id);
  const full:ProofDeliveryVersion={delivery:old.delivery,feedback:[],archivedAt:current.delivery.submittedAt},light=structuredClone(full);delete light.delivery.files;
  const currentSummary:ProofDeliveryVersion={delivery:structuredClone(current.delivery),feedback:[],archivedAt:current.delivery.submittedAt,isCurrent:true};delete currentSummary.delivery.files;
  const summary=comparisonVersionSummaries({versions:[currentSummary,light]}).find(version=>isOlderDelivery(version,current.delivery))!;
  let calls=0;
  const loaded=await loadPreviousComparisonVersion({projectId:current.project.id,currentDelivery:current.delivery,previousSummary:summary,role:"buyer"},async(path)=>{calls++;assert.equal(path,`/api/proofs/${current.project.id}/versions/${old.delivery.id}`);return {version:full};},new AbortController().signal);
  const result=await buildRuntimeComparison({projectId:current.project.id,plan:current.project.spec!.runtimeCheck!,delivery:current.delivery,previousVersion:loaded});
  assert.equal(calls,1);assert.equal(summary.delivery.files,undefined);assert.equal(result.previous.state,"available");assert.equal(result.current.state,"available");
  if(result.previous.state==="available"&&result.current.state==="available"){
    assert.equal(result.previous.data.report.summary.observed,17);assert.equal(result.current.data.report.summary.observed,18);
    assert.equal(result.previous.data.boundary!.status,201);assert.equal(result.current.data.boundary!.status,422);
  }
});
