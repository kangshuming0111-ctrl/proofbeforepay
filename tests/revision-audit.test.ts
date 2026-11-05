import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,writeFile,rm,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import type {ProofQuote,ProofDeliveryVersion} from "../lib/contracts.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {createEvidenceExport} from "../lib/evidence-export.ts";
import {createEvidenceBundle} from "../lib/evidence-bundle.ts";
import {buildSupplementalEvidenceCatalog} from "../lib/supplemental-evidence.ts";
import {archivedRevisionQuote,createRevisionAudit,verifyRevisionAudit,revisionAuditDigest,type RevisionAuditInput} from "../lib/revision-audit.ts";
import {ISSUED_REVISION_AUDIT_SCHEMA} from "../lib/issued-revision-audit.ts";
import {EVIDENCE_ISSUER_RECEIPT_SCHEMA} from "../lib/evidence-issuer.ts";
import {EVIDENCE_ISSUER_ORIGIN,EVIDENCE_ISSUER_KEY_ID} from "../lib/evidence-issuer-keys.ts";
const at="2026-11-06T00:00:00.000Z";
const html=(text:string)=>`<!doctype html><html><head><title>Revision fixture</title></head><body><p>${text}</p></body></html>`;
function quote(n:number,body=`Revision ${n}`,files:Record<string,string>={"index.html":html(body)}):ProofQuote{
 const summary="Deliver a one-page website.",p=parseStaticProject({title:"Revision evidence",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en"),delivery=createUploadedDelivery(files,p.project,"en",n);
 return{id:"revision-project",reference:"PBP-REVISIONS",workflow:"proof-v1",title:p.title,summary,brief:summary,clientName:"PRIVATE-CUSTOMER",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,paypalOrderId:"PRIVATE-ORDER",proof:{project:p.project,criteria:p.criteria,paymentState:"unfunded",audit:[],delivery,collaboration:{stage:"submitted",feedback:[],submission:{deliveryId:delivery.id,at,note:"PRIVATE-SUBMISSION"}}}};
}
async function input(n=2):Promise<{versions:RevisionAuditInput[]}>{
 const previous=await createEvidenceExport(quote(1)),q=quote(n),d=q.proof.delivery!,core=await createEvidenceExport(q),catalog=await buildSupplementalEvidenceCatalog(d.id,core.fileDigest,[]),current=await createEvidenceBundle(q,{catalog,objects:[]});
 return{versions:[{retainedAt:at,isCurrent:false,scope:"archived-core",evidence:previous},{retainedAt:at,isCurrent:true,scope:"current-full",evidence:current}]};
}
const bad=(r:Awaited<ReturnType<typeof verifyRevisionAudit>>,id:string)=>r.checks.some(c=>c.id===id&&c.status==="inconsistent");
test("two exact full source revisions replay independently and file changes do not imply a successful repair",async()=>{
 const v=await input(),before=structuredClone(v),audit=await createRevisionAudit(v),r=await verifyRevisionAudit(JSON.parse(JSON.stringify(audit)));
 assert.equal(r.consistency,"consistent");assert.equal(r.versions.length,2);assert.deepEqual(audit.differences[0].changed,["index.html"]);assert.deepEqual(audit.differences[0].added,[]);assert.equal(audit.versions[0].evidence.schema,"proofbeforepay-evidence-export-v1");assert.equal(audit.versions[1].scope,"current-full");assert.deepEqual(v,before);assert.ok(!JSON.stringify(audit).includes("PRIVATE-"));assert.equal(audit.limits.authenticity,"not-proven");
});
test("selected noncontiguous sequences remain explicitly selected-only and ordered by saved sequence",async()=>{
 const audit=await createRevisionAudit(await input(4));assert.equal((await verifyRevisionAudit(audit)).consistency,"consistent");assert.deepEqual(audit.versions.map(v=>v.sequence),[1,4]);assert.equal(audit.limits.selectedVersionsOnly,true);
});
test("added, removed and unchanged files use exact UTF-8 bytes and selected revisions retain their own inventory",async()=>{
 const q1=quote(1,"",{"index.html":html("第一版"),"old.css":"p{color:green}","same.css":"body{margin:0}"}),q2=quote(2,"",{"index.html":html("第二版"),"new.css":"p{color:blue}","same.css":"body{margin:0}"}),previous=await createEvidenceExport(q1),currentCore=await createEvidenceExport(q2),catalog=await buildSupplementalEvidenceCatalog(q2.proof.delivery!.id,currentCore.fileDigest,[]),current=await createEvidenceBundle(q2,{catalog,objects:[]}),audit=await createRevisionAudit({versions:[{retainedAt:at,isCurrent:false,scope:"archived-core",evidence:previous},{retainedAt:at,isCurrent:true,scope:"current-full",evidence:current}]});
 assert.equal((await verifyRevisionAudit(audit)).consistency,"consistent");assert.deepEqual(audit.differences[0].added,["new.css"]);assert.deepEqual(audit.differences[0].removed,["old.css"]);assert.deepEqual(audit.differences[0].changed,["index.html"]);assert.deepEqual(audit.differences[0].unchanged,["same.css"]);assert.equal(audit.versions[0].files.find(f=>f.file==="index.html")!.bytes,new TextEncoder().encode(q1.proof.delivery!.files!["index.html"]).byteLength);
});
test("five explicitly selected versions are supported without pretending skipped versions are included",async()=>{
 const versions=(await input(5)).versions;for(let n=2;n<=4;n++)versions.push({retainedAt:at,isCurrent:false,scope:"archived-core",evidence:await createEvidenceExport(quote(n))});versions.sort((a,b)=>{const get=(v:RevisionAuditInput)=>v.evidence.schema==="proofbeforepay-evidence-export-v1"?v.evidence.delivery.sequence!:v.evidence.core.delivery.sequence!;return get(a)-get(b);});const audit=await createRevisionAudit({versions});assert.equal(audit.versions.length,5);assert.equal(audit.differences.length,4);assert.equal((await verifyRevisionAudit(audit)).consistency,"consistent");
});
test("missing exact old source cannot be rebuilt from a fixture, hash or current version",async()=>{
 const v=await input();delete(v.versions[0].evidence as {delivery:{files?:unknown}}).delivery.files;await assert.rejects(createRevisionAudit(v));
});
test("the complete original project and requirement scope must match every selected version",async()=>{
 for(const mutation of ["project","criterion","source","spec"]){const v=await input(),e=v.versions[0].evidence as Awaited<ReturnType<typeof createEvidenceExport>>;if(mutation==="project")e.project.id="foreign";if(mutation==="criterion")e.project.criteria[0].source="Invented different original";if(mutation==="source")e.project.summary="Changed original scope";if(mutation==="spec")e.project.spec!.requiredPages.push("other.html");await assert.rejects(createRevisionAudit(v),Error,mutation);}
});
test("duplicate, unordered, missing current, wrong formats and invented sequence metadata reject",async()=>{
 for(const mutation of ["duplicate","order","current","scope","sequence","single","overlimit"]){const v=await input();if(mutation==="duplicate")v.versions[1]=structuredClone(v.versions[0]);if(mutation==="order")v.versions.reverse();if(mutation==="current")v.versions[1].isCurrent=false;if(mutation==="scope")v.versions[0].scope="current-full";if(mutation==="sequence")delete(v.versions[0].evidence as {delivery:{sequence?:unknown}}).delivery.sequence;if(mutation==="single")v.versions.pop();if(mutation==="overlimit")v.versions.push(...Array.from({length:4},()=>structuredClone(v.versions[0])));await assert.rejects(createRevisionAudit(v),Error,mutation);}
});
test("inventories, source bytes, report hashes, file digest and declared differences each fail closed",async()=>{
 const audit=await createRevisionAudit(await input());
 for(const mutation of ["file","hash","digest","inventory","diff","scope","field"]){const a=structuredClone(audit);if(mutation==="file")(a.versions[0].evidence as {delivery:{files:Record<string,string>}}).delivery.files["index.html"]+=" ";if(mutation==="hash")a.versions[0].evidenceSha256="f".repeat(64);if(mutation==="digest")a.versions[0].fileDigest="e".repeat(64);if(mutation==="inventory")a.versions[0].files[0].bytes++;if(mutation==="diff")a.differences[0].changed=[];if(mutation==="scope")(a.limits as unknown as {authenticity:string}).authenticity="proven";if(mutation==="field")Object.assign(a,{issuerReceipt:{key:"untrusted embedded key"}});assert.notEqual((await verifyRevisionAudit(a)).consistency,"consistent",mutation);}
});
test("a core report cannot be transplanted while updating only its outer record hash",async()=>{
 const audit=await createRevisionAudit(await input()),v=audit.versions[0],old=v.evidence as Awaited<ReturnType<typeof createEvidenceExport>>;old.delivery.evidence[0].finding="fail";const {evidenceBundleSha256}=await import("../lib/evidence-bundle.ts");v.evidenceSha256=await evidenceBundleSha256(old);const r=await verifyRevisionAudit(audit);assert.equal(r.consistency,"inconsistent");assert.equal(r.versions[0].verification.consistency,"inconsistent");
});
test("whole-package budgets reject getters, sparse arrays, cycles and nonfinite values before reading",async()=>{
 let reads=0;const badGetter=Object.defineProperty({},"schema",{enumerable:true,get(){reads++;throw Error("Must not read");}});assert.ok(bad(await verifyRevisionAudit(badGetter),"bounded-json"));assert.equal(reads,0);
 for(const raw of [new Array(500000),{a:Infinity},{a:"界".repeat(3_000_000)}])assert.ok(bad(await verifyRevisionAudit(raw),"bounded-json"));const cycle:{a?:unknown}={};cycle.a=cycle;assert.ok(bad(await verifyRevisionAudit(cycle),"bounded-json"));
});
test("async verification captures plain data before caller mutation and metadata order does not affect the digest",async()=>{
 const audit=await createRevisionAudit(await input()),digest=await revisionAuditDigest(audit),pending=verifyRevisionAudit(audit);let reads=0;Object.defineProperty(audit.versions[0],"evidence",{enumerable:true,get(){reads++;throw Error("Caller mutation");}});assert.equal((await pending).consistency,"consistent");assert.equal(reads,0);
 const a=await createRevisionAudit(await input()),reverse=(v:unknown):unknown=>Array.isArray(v)?v.map(reverse):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;const b=reverse(a)as typeof a;assert.equal((await verifyRevisionAudit(b)).consistency,"consistent");assert.equal(await revisionAuditDigest(a),await revisionAuditDigest(b));assert.match(digest,/^[a-f0-9]{64}$/u);
});
test("archived projection retains exact old files and report metadata without importing current decisions",()=>{
 const old=quote(1),fresh=quote(2),snapshot:ProofDeliveryVersion={delivery:structuredClone(old.proof.delivery!),feedback:[],archivedAt:at};fresh.proof.acceptedDeliveryId=fresh.proof.delivery!.id;fresh.proof.acceptedEvidenceSnapshotId="current-consent";fresh.proof.collaboration!.acceptance={deliveryId:fresh.proof.delivery!.id,at,manualChecks:[],evidenceSnapshotId:"current-acceptance"};const before=structuredClone({fresh,snapshot}),copy=archivedRevisionQuote(fresh,snapshot);assert.deepEqual(copy.proof.delivery!.files,old.proof.delivery!.files);assert.equal(copy.proof.acceptedDeliveryId,undefined);assert.equal(copy.proof.collaboration?.acceptance,undefined);assert.equal(copy.proof.delivery!.assessment,undefined);assert.deepEqual({fresh,snapshot},before);delete snapshot.delivery.files;assert.throws(()=>archivedRevisionQuote(fresh,snapshot));
});
test("the CLI independently verifies bounded JSON offline and rejects tampering or symlink input",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"pbp-revision-audit-"));let network=0;const prior=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error("No network");};
 try{const audit=await createRevisionAudit(await input()),file=join(dir,"audit.json"),run=(f:string)=>spawnSync(process.execPath,["--experimental-strip-types","scripts/verify-revision-audit.mjs",f],{cwd:process.cwd(),encoding:"utf8",env:{PATH:process.env.PATH??"",NODE_ENV:"test"}});await writeFile(file,JSON.stringify(audit));let r=run(file);assert.equal(r.status,0,r.stderr+r.stdout);assert.equal(JSON.parse(r.stdout).consistency,"consistent");audit.differences[0].changed=[];await writeFile(file,JSON.stringify(audit));r=run(file);assert.equal(r.status,1);const link=join(dir,"link.json");await symlink(file,link);assert.equal(run(link).status,2);assert.equal(network,0);}finally{globalThis.fetch=prior;await rm(dir,{recursive:true,force:true});}
});
test("CLI distinguishes unsigned cores from invalid issued envelopes and never downgrades missing or fake receipts",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"pbp-issued-revision-cli-"));
 try{const audit=await createRevisionAudit(await input()),filename=join(dir,"audit.json"),blocker=join(dir,"no-network.mjs");await writeFile(blocker,"globalThis.fetch=async()=>{process.stderr.write('NETWORK_ATTEMPT');throw Error('Network forbidden in CLI test');};");
  const run=()=>spawnSync(process.execPath,["--experimental-strip-types","--import",blocker,"scripts/verify-revision-audit.mjs",filename],{cwd:process.cwd(),encoding:"utf8",env:{PATH:process.env.PATH??"",NODE_ENV:"test"}});await writeFile(filename,JSON.stringify(audit));let response=run();assert.equal(response.status,0,response.stderr+response.stdout);assert.equal(JSON.parse(response.stdout).issuance.status,"unproven");assert.ok(!response.stderr.includes("NETWORK_ATTEMPT"));
  const receipt={schema:EVIDENCE_ISSUER_RECEIPT_SCHEMA,keyId:EVIDENCE_ISSUER_KEY_ID,issuer:EVIDENCE_ISSUER_ORIGIN,issuedAt:at,payloadSha256:await revisionAuditDigest(audit),signature:"A".repeat(86)};
  for(const [kind,reason] of [["unknown-key","unknown_key"],["fake-signature","signature_invalid"],["missing-receipt","invalid_receipt"],["disguised-schema","invalid_receipt"],["inconsistent-audit","audit_inconsistent"]]){const envelope:Record<string,unknown>={schema:ISSUED_REVISION_AUDIT_SCHEMA,audit,receipt:{...receipt,...(kind==="unknown-key"?{keyId:"isolated-untrusted-cli-key"}:{})}};if(kind==="missing-receipt")delete envelope.receipt;if(kind==="disguised-schema")envelope.schema="proofbeforepay-revision-audit-v1";if(kind==="inconsistent-audit"){const changed=structuredClone(audit);changed.differences[0].changed=[];envelope.audit=changed;}await writeFile(filename,JSON.stringify(envelope));response=run();assert.equal(response.status,1,kind+response.stderr+response.stdout);const report=JSON.parse(response.stdout);assert.equal(report.issuance.status,"invalid",kind);assert.equal(report.issuance.reason,reason,kind);assert.equal(report.audit,undefined,kind);assert.ok(!response.stderr.includes("NETWORK_ATTEMPT"),kind);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
