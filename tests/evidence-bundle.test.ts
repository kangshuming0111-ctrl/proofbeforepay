import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {createEvidenceBundle,verifyEvidenceBundle,evidenceBundleSha256,assertEvidenceBundleBudget,EVIDENCE_BUNDLE_BYTE_LIMIT} from "../lib/evidence-bundle.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {buildSupplementalEvidenceCatalog,createSupplementalEvidenceObject,supplementalSha} from "../lib/supplemental-evidence.ts";
import {DEFAULT_TIME_PLAN,timePolicyCases,type TimePolicySession} from "../lib/time-policy.ts";
import {createEvidenceFollowup,appendFollowupEvent,followupObservation,evidenceFollowupHead} from "../lib/evidence-followup.ts";
import {createEvidenceViewerController} from "../app/guest-lab/evidence-controller.ts";
import {bundleFixture,bundleAt,acceptBundleQuote} from "./evidence-bundle-fixtures.ts";
const failed=(report:Awaited<ReturnType<typeof verifyEvidenceBundle>>,id:string)=>report.checks.some(c=>c.id===id&&c.status==="inconsistent");
const make=async(artifacts=false)=>{const f=await bundleFixture({artifacts});return{...f,bundle:await createEvidenceBundle(acceptBundleQuote(f.quote,f.catalog),{catalog:f.catalog,objects:f.objects,artifactManifests:f.manifest?[f.manifest]:[]})};};

test("three-family unified export round-trips exact reports and acceptance while retaining the unchanged v1 verifier",async()=>{
 const f=await make(),before=structuredClone(f.bundle),report=await verifyEvidenceBundle(JSON.parse(JSON.stringify(f.bundle)));
 assert.equal(report.consistency,"consistent");for(const id of ["supplemental-objects","supplemental-bindings","supplemental-catalog","supplemental-acceptance"])assert.ok(report.checks.some(c=>c.id===id&&c.status==="consistent"));
 assert.equal((await verifyEvidenceExport(f.bundle.core)).consistency,"consistent");assert.equal((await verifyEvidenceExport(f.bundle)).consistency,"unsupported");assert.equal((await verifyEvidenceBundle(f.bundle.core)).consistency,"consistent");assert.deepEqual(f.bundle,before);assert.equal(f.bundle.supplemental.objects.length,3);assert.equal(f.bundle.supplemental.acceptance[0].decision!.entries.length,3);
 assert.equal(JSON.stringify(f.bundle).includes("PRIVATE-"),false);assert.equal((f.bundle.supplemental.objects.find(o=>o.ref.family==="time-policy")!.record as TimePolicySession).createdBy,"participant-withheld");assert.equal(report.limits.networkRequests,0);
});

test("public wrapper refuses original actors or ignored HTTP response fields beside a sanitized public hash",async()=>{
 const f=await make();for(const mutate of [(v:typeof f.bundle)=>{(v.supplemental.objects.find(o=>o.ref.family==="deployment-source")!.record as typeof f.deployment).createdBy="PRIVATE-ACTOR";},(v:typeof f.bundle)=>{const r=v.supplemental.objects.find(o=>o.ref.family==="time-policy")!.record as TimePolicySession;(r.trace[0].body as Record<string,unknown>).private="PRIVATE-CANARY";}]){const b=structuredClone(f.bundle);mutate(b);assert.ok(failed(await verifyEvidenceBundle(b),"supplemental-objects"));}
});

test("payload changes, wrong conclusions, identity conflicts, foreign projects and dangling refs fail closed",async()=>{
 const f=await make(),foreign=await bundleFixture({projectId:"other-project"});
 for(const [id,mutate]of [
  ["supplemental-objects",(v:typeof f.bundle)=>{v.supplemental.objects[0].ref.payloadSha256="f".repeat(64);}],
  ["supplemental-objects",(v:typeof f.bundle)=>{v.supplemental.objects.push(structuredClone(v.supplemental.objects[0]));}],
  ["supplemental-objects",(v:typeof f.bundle)=>{v.supplemental.objects[0]=foreign.objects[0];}],
  ["supplemental-catalog",(v:typeof f.bundle)=>{v.supplemental.objects.pop();}],
  ["supplemental-acceptance",(v:typeof f.bundle)=>{v.supplemental.acceptance[0].decision!.entries[0].ref.payloadSha256="c".repeat(64);}],
  ["supplemental-acceptance",(v:typeof f.bundle)=>{v.supplemental.acceptance[0].snapshotSha256="b".repeat(64);}],
  ["supplemental-acceptance",(v:typeof f.bundle)=>{v.supplemental.acceptance[0].decision=null;}],
  ["supplemental-objects",(v:typeof f.bundle)=>{(v.supplemental.objects.find(o=>o.ref.family==="time-policy")!.record as TimePolicySession).results![0].outcome="observed";}],
 ]as const){const b=structuredClone(f.bundle);mutate(b);assert.ok(failed(await verifyEvidenceBundle(b),id),id);}
});

test("rehashed deployment expectations cannot substitute an unexported file map",async()=>{
 const f=await make(),b=structuredClone(f.bundle),obj=b.supplemental.objects.find(o=>o.ref.family==="deployment-source")!,record=obj.record as typeof f.deployment;
 record.plan.files[0].sha256="b".repeat(64);record.readings[0].sha256="b".repeat(64);const {planDigest:_,...body}=record.plan;record.plan.planDigest=await supplementalSha(body);Object.assign(obj,await createSupplementalEvidenceObject("deployment-source",record));
 assert.ok(failed(await verifyEvidenceBundle(b),"supplemental-bindings"));
});

test("source target paths are replayed against complete files even without an older AI assessment",async()=>{
 const f=await make(),b=structuredClone(f.bundle),obj=b.supplemental.objects.find(o=>o.ref.family==="source-visibility")!,record=structuredClone(f.visibility);record.assessmentId="not-inline-old-assessment";record.plan.assessmentId=record.assessmentId;record.plan.citations[0].target!.path=[99];Object.assign(obj,await createSupplementalEvidenceObject("source-visibility",record));assert.ok(failed(await verifyEvidenceBundle(b),"supplemental-bindings"));
});

test("excluded planned versions remain exactly resolvable after their live session advances",async()=>{
 const f=await bundleFixture(),planned:TimePolicySession={id:f.time.id,projectId:f.quote.id,deliveryId:f.quote.proof.delivery!.id,deliveryDigest:f.digest,createdBy:"actor-private",createdAt:bundleAt,updatedAt:bundleAt,version:1,status:"planned",plan:structuredClone(DEFAULT_TIME_PLAN),cases:timePolicyCases(DEFAULT_TIME_PLAN),trace:[]};
 const old=await createSupplementalEvidenceObject("time-policy",planned),oldObjects=[...f.objects.filter(o=>o.ref.family!=="time-policy"),old],oldCatalog=await buildSupplementalEvidenceCatalog(f.quote.proof.delivery!.id,f.digest,oldObjects),q=acceptBundleQuote(f.quote,oldCatalog);
 const b=await createEvidenceBundle(q,{catalog:f.catalog,objects:[...f.objects,old]});assert.equal((await verifyEvidenceBundle(b)).consistency,"consistent");assert.equal(b.supplemental.objects.filter(o=>o.ref.id===f.time.id).length,2);
 const missing=structuredClone(b);missing.supplemental.objects=missing.supplemental.objects.filter(o=>o.ref.version!==1||o.ref.family!=="time-policy");assert.ok(failed(await verifyEvidenceBundle(missing),"supplemental-acceptance"));
});

test("v2 JavaScript byte manifests are complete, cross-bound, immutable and never execute source",async()=>{
 const f=await make(true);assert.equal((f.bundle.supplemental.objects.find(o=>o.ref.family==="deployment-source")!.record as typeof f.deployment).plan.version,2);assert.equal(f.bundle.supplemental.artifactManifests.length,1);assert.equal((await verifyEvidenceBundle(f.bundle)).consistency,"consistent");
 for(const mutate of [(v:typeof f.bundle)=>{v.supplemental.artifactManifests=[];},(v:typeof f.bundle)=>{v.supplemental.artifactManifests[0].files[0].sha256="d".repeat(64);},(v:typeof f.bundle)=>{v.supplemental.artifactManifests.push(structuredClone(v.supplemental.artifactManifests[0]));}]){const b=structuredClone(f.bundle);mutate(b);assert.ok(failed(await verifyEvidenceBundle(b),"supplemental-bindings"));}
});

test("strict catalog context, budget, getter, sparse-array and nonfinite defenses run before property reads",async()=>{
 const f=await make(),b=structuredClone(f.bundle);Object.assign(b.supplemental.catalog.context,{unknownPrivate:"CANARY"});assert.ok(failed(await verifyEvidenceBundle(b),"bundle-structure"));
 let reads=0;const getter=Object.defineProperty({},"schema",{enumerable:true,get(){reads++;return "x";}});assert.ok(failed(await verifyEvidenceBundle(getter),"bounded-json"));assert.equal(reads,0);
 for(const bad of [new Array(1000000),{n:Infinity},{s:"界".repeat(Math.floor(EVIDENCE_BUNDLE_BYTE_LIMIT/3)+1)}])assert.throws(()=>assertEvidenceBundleBudget(bad));
 const cyclic:{x?:unknown}={};cyclic.x=cyclic;assert.ok(failed(await verifyEvidenceBundle(cyclic),"bounded-json"));
});

test("async hashing uses a captured plain-data snapshot even if the caller later inserts a getter",async()=>{
 const f=await make(),pending=verifyEvidenceBundle(f.bundle);let reads=0;Object.defineProperty(f.bundle.supplemental.objects[0],"record",{enumerable:true,get(){reads++;throw new Error("caller mutation must not execute");}});assert.equal((await pending).consistency,"consistent");assert.equal(reads,0);
});

test("metadata key order is irrelevant while array order and exact bytes remain significant",async()=>{
 const f=await make(true),reverse=(v:unknown):unknown=>Array.isArray(v)?v.map(reverse):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).reverse().map(([k,e])=>[k,reverse(e)])):v;
 assert.equal((await verifyEvidenceBundle(reverse(f.bundle))).consistency,"consistent");
 const altered=structuredClone(f.bundle);(altered.supplemental.objects.find(o=>o.ref.family==="time-policy")!.record as TimePolicySession).cases.reverse();assert.ok(failed(await verifyEvidenceBundle(altered),"supplemental-objects"));
});

test("CLI and browser verifier accept a JSON round trip without network or source execution",async()=>{
 const f=await make(true),dir=await mkdtemp(join(tmpdir(),"pbp-unified-evidence-"));let calls=0;const prior=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error("offline test forbids network");};
 try{const filename=join(dir,"bundle.json");await writeFile(filename,JSON.stringify(f.bundle));const run=spawnSync(process.execPath,["--experimental-strip-types","scripts/verify-evidence-export.mjs",filename],{cwd:process.cwd(),encoding:"utf8",env:{PATH:process.env.PATH??"",NODE_ENV:"test"}});assert.equal(run.status,0,run.stderr+run.stdout);assert.equal(JSON.parse(run.stdout).consistency,"consistent");
  const controller=createEvidenceViewerController(),bytes=new TextEncoder().encode(JSON.stringify(f.bundle));await controller.openFile({name:"bundle.json",size:bytes.length,arrayBuffer:async()=>bytes.buffer});const state=controller.getState();assert.equal(state.phase,"ready");if(state.phase==="ready"){assert.equal(state.verification.consistency,"consistent");assert.deepEqual(state.packet,f.bundle.core);assert.equal(state.supplemental?.objects.length,3);}assert.equal(calls,0);
 }finally{globalThis.fetch=prior;await rm(dir,{recursive:true,force:true});}
});

test("task events resolve exact old/current report findings and frozen historical heads replay after new events",async()=>{
 const old=await bundleFixture({deliverySequence:1}),fresh=await bundleFixture({deliverySequence:2});
 const oldTime=old.catalog.rows.find(r=>r.ref.family==="time-policy")!,freshTime=fresh.catalog.rows.find(r=>r.ref.family==="time-policy")!;
 const requested=createEvidenceFollowup({id:"followup-exact",projectId:fresh.quote.id,criterionId:fresh.quote.proof.criteria[0].id,source:followupObservation(oldTime,oldTime.findings[0].key),note:"Please retest the exact unknown calendar rule.",at:bundleAt});
 const task=appendFollowupEvent(requested,{actorRole:"seller",action:"propose",note:"New delivery retains the exact same time-policy agreement.",at:bundleAt,observation:followupObservation(freshTime,freshTime.findings[0].key)});
 const acceptedCatalog=await buildSupplementalEvidenceCatalog(fresh.quote.proof.delivery!.id,fresh.digest,fresh.objects,{artifactManifest:null,followupHeads:[await evidenceFollowupHead(requested)]});
 const q=acceptBundleQuote(fresh.quote,acceptedCatalog),catalog=await buildSupplementalEvidenceCatalog(fresh.quote.proof.delivery!.id,fresh.digest,fresh.objects,{artifactManifest:null,followupHeads:[await evidenceFollowupHead(task)]});
 const b=await createEvidenceBundle(q,{catalog,objects:[...old.objects,...fresh.objects],followups:[task]});assert.equal((await verifyEvidenceBundle(b)).consistency,"consistent");assert.equal(b.supplemental.objects.length,4);assert.ok(b.supplemental.objects.some(o=>o.ref.deliveryId===old.quote.proof.delivery!.id));
 const missing=structuredClone(b);missing.followups!.tasks=[];assert.ok(failed(await verifyEvidenceBundle(missing),"supplemental-objects")||failed(await verifyEvidenceBundle(missing),"followup-bindings"));
 const altered=structuredClone(b);altered.followups!.tasks[0].events[0].note="A rewritten note that must not match the frozen historical head.";assert.ok(failed(await verifyEvidenceBundle(altered),"followup-bindings"));
 const finding=structuredClone(b);finding.followups!.tasks[0].source.finding.label="Changed original finding";finding.followups!.tasks[0].events[0].observation!.finding.label="Changed original finding";assert.ok(failed(await verifyEvidenceBundle(finding),"followup-bindings"));
});
