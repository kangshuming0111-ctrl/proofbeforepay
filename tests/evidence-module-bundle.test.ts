import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {createEvidenceBundle,verifyEvidenceBundle,EVIDENCE_BUNDLE_RULES,EVIDENCE_BUNDLE_MODULE_RULES} from "../lib/evidence-bundle.ts";
import {createDeliveryArtifactManifest} from "../lib/delivery-artifacts.ts";
import {getModuleDependencyFindings} from "../lib/module-dependencies.ts";
import {buildSupplementalEvidenceCatalog,supplementalSha} from "../lib/supplemental-evidence.ts";
import {createEvidenceFollowup,appendFollowupEvent,followupObservation,evidenceFollowupHead} from "../lib/evidence-followup.ts";
import {createEvidenceViewerController} from "../app/guest-lab/evidence-controller.ts";
import type {DeploymentSourceSession} from "../lib/deployment-source.ts";
import {bundleFixture,bundleAt,acceptBundleQuote} from "./evidence-bundle-fixtures.ts";

const html=(extra="")=>`<!doctype html><html><head><title>Noodle shop</title>${extra}</head><body><p>Open 11–20</p><script type="module" src="./app.mjs"></script></body></html>`;
async function moduleBundle(modules:Record<string,string>,extra=""){
 const f=await bundleFixture({modules,html:html(extra)});
 const bundle=await createEvidenceBundle(acceptBundleQuote(f.quote,f.catalog),{catalog:f.catalog,objects:f.objects,artifactManifests:[f.manifest!]});
 return{...f,bundle};
}
const failed=(report:Awaited<ReturnType<typeof verifyEvidenceBundle>>,id:string)=>report.checks.some(c=>c.id===id&&c.status==="inconsistent");
const deployment=(b:Awaited<ReturnType<typeof moduleBundle>>["bundle"])=>b.supplemental.objects.find(o=>o.ref.family==="deployment-source")!.record as DeploymentSourceSession;

test("named module rule revision binds actual fetched byte observations without embedding or executing JS",async()=>{
 const canary="PBP_MODULE_SOURCE_MUST_NOT_EXECUTE",app=`import './menu.mjs';\nglobalThis.${canary}=true;`,f=await moduleBundle({"app.mjs":app,"menu.mjs":"export const menu = ['noodles'];"});
 assert.equal(f.bundle.verificationRules,EVIDENCE_BUNDLE_MODULE_RULES);assert.equal(f.deployment.plan.version,3);
 assert.deepEqual(f.requestedFiles,["app.mjs","index.html","menu.mjs"]);
 const findings=getModuleDependencyFindings(f.deployment);assert.equal(findings.find(v=>v.file==="app.mjs")!.outcome,"supported");assert.equal(findings.find(v=>v.file==="app.mjs")!.reachableModules,2);
 const result=await verifyEvidenceBundle(JSON.parse(JSON.stringify(f.bundle)));assert.equal(result.consistency,"consistent");assert.ok(result.checks.some(c=>c.id==="module-observations"&&c.status==="consistent"&&c.message.includes("Original JS is absent")));assert.equal(result.limits.networkRequests,0);
 assert.equal(JSON.stringify(f.bundle).includes(canary),false);assert.equal((globalThis as Record<string,unknown>)[canary],undefined);
});

test("missing module remains an observed mismatch, does not trigger an undeclared fetch and does not invalidate an honest bundle",async()=>{
 const f=await moduleBundle({"app.mjs":"import './not-delivered.mjs'; export const ready = true;"});
 assert.deepEqual(f.requestedFiles,["app.mjs","index.html"]);const finding=getModuleDependencyFindings(f.deployment)[0];assert.equal(finding.outcome,"mismatch");assert.equal(finding.missing,1);assert.ok(finding.details.some(d=>d.target==="not-delivered.mjs"));
 assert.equal((await verifyEvidenceBundle(f.bundle)).consistency,"consistent");
});

test("external sensitive specifiers, dynamic expressions and import maps remain unknown without retaining unsafe raw strings",async()=>{
 const f=await moduleBundle({"app.mjs":"import('https://outside.invalid/private?token=PRIVATE_IMPORT_CANARY'); import(moduleName);"});
 const finding=getModuleDependencyFindings(f.deployment)[0];assert.equal(finding.outcome,"unknown");assert.equal(finding.unknown,2);assert.equal(JSON.stringify(f.bundle).includes("PRIVATE_IMPORT_CANARY"),false);assert.deepEqual(f.requestedFiles,["app.mjs","index.html"]);
 const map=await moduleBundle({"app.mjs":"import './menu.mjs';","menu.mjs":"export default 1;"},'<script type="importmap">{"imports":{"./menu.mjs":"https://outside.invalid/private"}}</script>');
 assert.ok(getModuleDependencyFindings(map.deployment)[0].details.some(d=>d.reason==="import_map_unsupported"));assert.equal((await verifyEvidenceBundle(map.bundle)).consistency,"consistent");
});

test("old named rules cannot carry module observations and new named rules cannot silently reinterpret old-only packages",async()=>{
 const f=await moduleBundle({"app.mjs":"export const ready = true;"}),downgrade=structuredClone(f.bundle);downgrade.verificationRules=EVIDENCE_BUNDLE_RULES;assert.ok(failed(await verifyEvidenceBundle(downgrade),"module-observation-rules"));
 const legacy=await bundleFixture({artifacts:true}),old=await createEvidenceBundle(legacy.quote,{catalog:legacy.catalog,objects:legacy.objects,artifactManifests:[legacy.manifest!]});assert.equal(old.verificationRules,EVIDENCE_BUNDLE_RULES);old.verificationRules=EVIDENCE_BUNDLE_MODULE_RULES;assert.ok(failed(await verifyEvidenceBundle(old),"module-observation-rules"));
});

test("missing analysis, altered resolution/hash and unordered observations are rejected despite rehashed public payloads",async()=>{
 const f=await moduleBundle({"app.mjs":"import './menu.mjs'; import './price.mjs';","menu.mjs":"export default 1;","price.mjs":"export default 2;"});
 for(const mutate of [(r:DeploymentSourceSession)=>{delete r.readings[0].moduleAnalysis;},(r:DeploymentSourceSession)=>{r.readings[0].moduleAnalysis!.sourceSha256="f".repeat(64);},(r:DeploymentSourceSession)=>{r.readings[0].moduleAnalysis!.imports[0].target="not-this-module.mjs";},(r:DeploymentSourceSession)=>{r.readings[0].moduleAnalysis!.imports.reverse();}]){
  const b=structuredClone(f.bundle),obj=b.supplemental.objects.find(o=>o.ref.family==="deployment-source")!;mutate(obj.record as DeploymentSourceSession);obj.ref.payloadSha256=await supplementalSha(obj.record);assert.ok(failed(await verifyEvidenceBundle(b),"supplemental-objects"));
 }
});

test("module context is replayed from the actual exported HTML, and JSON object key order remains irrelevant",async()=>{
 const f=await moduleBundle({"app.mjs":"export default 1;"}),b=structuredClone(f.bundle),r=deployment(b);assert.equal(r.plan.version,3);if(r.plan.version!==3)return;r.plan.moduleContext.importMapPresent=true;const{planDigest:_,...body}=r.plan;r.plan.planDigest=await supplementalSha(body);const object=b.supplemental.objects.find(o=>o.ref.family==="deployment-source")!;object.ref.payloadSha256=await supplementalSha(object.record);assert.ok(failed(await verifyEvidenceBundle(b),"supplemental-bindings"));
 const reverse=(v:unknown):unknown=>Array.isArray(v)?v.map(reverse):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).reverse().map(([k,e])=>[k,reverse(e)])):v;assert.equal((await verifyEvidenceBundle(reverse(f.bundle))).consistency,"consistent");
});

test("CLI and browser controller accept module reports offline and retain the explicit no-reparse limitation",async()=>{
 const f=await moduleBundle({"app.mjs":"import './menu.mjs';","menu.mjs":"export default 1;"}),dir=await mkdtemp(join(tmpdir(),"pbp-module-bundle-"));let calls=0;const prior=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error("No offline network");};
 try{const file=join(dir,"evidence.json");await writeFile(file,JSON.stringify(f.bundle));const run=spawnSync(process.execPath,["--experimental-strip-types","scripts/verify-evidence-export.mjs",file],{cwd:process.cwd(),encoding:"utf8",env:{PATH:process.env.PATH??"",NODE_ENV:"test"}});assert.equal(run.status,0,run.stderr+run.stdout);assert.equal(JSON.parse(run.stdout).consistency,"consistent");
  const controller=createEvidenceViewerController(),bytes=new TextEncoder().encode(JSON.stringify(f.bundle));await controller.openFile({size:bytes.length,name:"module-bundle.json",arrayBuffer:async()=>bytes.buffer});const state=controller.getState();assert.equal(state.phase,"ready");if(state.phase==="ready"){assert.equal(state.verification.consistency,"consistent");assert.ok(state.verification.checks.some(c=>c.id==="module-observations"&&c.message.includes("lexer")));assert.ok(state.supplemental?.objects.some(o=>o.ref.family==="deployment-source"&&(o.record as DeploymentSourceSession).plan.version===3));}assert.equal(calls,0);
 }finally{globalThis.fetch=prior;await rm(dir,{recursive:true,force:true});}
});

async function manifestFor(f:Awaited<ReturnType<typeof bundleFixture>>,at=bundleAt){return createDeliveryArtifactManifest({projectId:f.quote.id,deliveryId:f.quote.proof.delivery!.id,deliveryDigest:f.digest,files:[{file:"app.mjs",bytes:15,sha256:"a".repeat(64)}]},{at});}

test("legacy contextless repair of a currently retained v1 manifest-change diagnostic exports using its verified catalog",async()=>{
 const f=await bundleFixture(),manifest=await manifestFor(f),context={artifactManifest:{id:manifest.id,manifestDigest:manifest.manifestDigest}},before=await buildSupplementalEvidenceCatalog(f.quote.proof.delivery!.id,f.digest,f.objects,context),row=before.rows.find(r=>r.ref.family==="deployment-source")!;
 const task=createEvidenceFollowup({id:"legacy-manifest-repair",projectId:f.quote.id,criterionId:"supplemental:deployment-source",source:followupObservation(row,"artifact_manifest_changed"),note:"Please recheck the build declaration after this static-only record.",at:bundleAt}),catalog=await buildSupplementalEvidenceCatalog(f.quote.proof.delivery!.id,f.digest,f.objects,{...context,followupHeads:[await evidenceFollowupHead(task)]});
 const b=await createEvidenceBundle(f.quote,{catalog,objects:f.objects,artifactManifests:[manifest],followups:[task]});assert.equal(b.verificationRules,EVIDENCE_BUNDLE_RULES);assert.equal((await verifyEvidenceBundle(b)).consistency,"consistent");assert.equal(b.followups!.tasks[0].source.context,undefined);
});

test("new repair context survives later manifests and a replacement delivery without inventing old source files",async()=>{
 const old=await bundleFixture({deliverySequence:1}),fresh=await bundleFixture({artifacts:true,deliverySequence:2}),manifest=await manifestFor(old),later=await manifestFor(old,"2026-11-04T14:00:00.000Z"),oldContext={artifactManifest:{id:manifest.id,manifestDigest:manifest.manifestDigest}},oldCatalog=await buildSupplementalEvidenceCatalog(old.quote.proof.delivery!.id,old.digest,old.objects,oldContext),oldRow=oldCatalog.rows.find(r=>r.ref.family==="deployment-source")!;
 const task=createEvidenceFollowup({id:"contextual-manifest-repair",projectId:fresh.quote.id,criterionId:"supplemental:deployment-source",source:followupObservation(oldRow,"artifact_manifest_changed",oldContext),note:"Recheck the revised script declaration against the original static report.",at:bundleAt}),freshRow=fresh.catalog.rows.find(r=>r.ref.family==="deployment-source")!;
 const proposed=appendFollowupEvent(task,{action:"propose",actorRole:"seller",at:bundleAt,note:"A replacement delivery now includes a declared build-file check.",observation:followupObservation(freshRow,"dependency_graph_unchecked",fresh.catalog.context)}),catalog=await buildSupplementalEvidenceCatalog(fresh.quote.proof.delivery!.id,fresh.digest,fresh.objects,{...fresh.catalog.context,followupHeads:[await evidenceFollowupHead(proposed)]});
 const b=await createEvidenceBundle(acceptBundleQuote(fresh.quote,catalog),{catalog,objects:[...old.objects,...fresh.objects],artifactManifests:[manifest,later,fresh.manifest!],followups:[proposed]});assert.equal(b.verificationRules,EVIDENCE_BUNDLE_MODULE_RULES);assert.equal((await verifyEvidenceBundle(b)).consistency,"consistent");assert.deepEqual(new Set(b.supplemental.artifactManifests.map(m=>m.id)),new Set([manifest.id,fresh.manifest!.id]));assert.equal(b.scope,"current-delivery-only");
 const missing=structuredClone(b);missing.supplemental.artifactManifests=missing.supplemental.artifactManifests.filter(m=>m.id!==manifest.id);assert.ok(failed(await verifyEvidenceBundle(missing),"supplemental-bindings"));
 const downgraded=structuredClone(b);downgraded.verificationRules=EVIDENCE_BUNDLE_RULES;assert.ok(failed(await verifyEvidenceBundle(downgraded),"module-observation-rules"));
});

test("a missing legacy historical context stays unverifiable and a future manifest cannot serve as an earlier event's context",async()=>{
 const old=await bundleFixture({deliverySequence:1}),fresh=await bundleFixture({deliverySequence:2}),manifest=await manifestFor(old),ctx={artifactManifest:{id:manifest.id,manifestDigest:manifest.manifestDigest}},oldCatalog=await buildSupplementalEvidenceCatalog(old.quote.proof.delivery!.id,old.digest,old.objects,ctx),row=oldCatalog.rows.find(r=>r.ref.family==="deployment-source")!;
 const legacy=createEvidenceFollowup({id:"legacy-missing-context",projectId:fresh.quote.id,criterionId:"supplemental:deployment-source",source:followupObservation(row,"artifact_manifest_changed"),note:"Historical source lacks the manifest context that made it true.",at:bundleAt}),catalog=await buildSupplementalEvidenceCatalog(fresh.quote.proof.delivery!.id,fresh.digest,fresh.objects,{artifactManifest:null,followupHeads:[await evidenceFollowupHead(legacy)]});
 await assert.rejects(()=>createEvidenceBundle(fresh.quote,{catalog,objects:[...old.objects,...fresh.objects],artifactManifests:[manifest],followups:[legacy]}),/followup-bindings/u);
 const future=await manifestFor(old,"2026-11-04T15:00:00.000Z"),futureContext={artifactManifest:{id:future.id,manifestDigest:future.manifestDigest}},futureCatalog=await buildSupplementalEvidenceCatalog(old.quote.proof.delivery!.id,old.digest,old.objects,futureContext),futureTask=createEvidenceFollowup({id:"future-context",projectId:old.quote.id,criterionId:"supplemental:deployment-source",source:followupObservation(futureCatalog.rows.find(r=>r.ref.family==="deployment-source")!,"artifact_manifest_changed",futureContext),note:"This earlier event must not cite a future declaration as context.",at:bundleAt}),futureHeads=await buildSupplementalEvidenceCatalog(old.quote.proof.delivery!.id,old.digest,old.objects,{...futureContext,followupHeads:[await evidenceFollowupHead(futureTask)]});
 await assert.rejects(()=>createEvidenceBundle(old.quote,{catalog:futureHeads,objects:old.objects,artifactManifests:[future],followups:[futureTask]}),/supplemental-bindings/u);
});
