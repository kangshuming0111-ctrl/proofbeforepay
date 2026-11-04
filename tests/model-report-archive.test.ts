import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {DomainError} from "../lib/domain.ts";
import {acceptDelivery,prepareReplacement,snapshotVersion} from "../lib/proof-workflow.ts";
import {assertAcceptedEvidenceReference} from "../lib/acceptance-evidence.ts";
import {createUploadedDelivery} from "../lib/static-project.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {beginProjectJourneyRun,finishProjectJourneyRun} from "../lib/project-journey-actions.ts";
import {encodeRasterDataUrl,STATIC_RESOURCE_LIMITS} from "../lib/static-resources.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {beginModelCheckRun,finishModelCheckRun,closeExpiredModelCheckRun,recordModelCheckCheckpoint} from "../lib/model-check-actions.ts";
import {modelCheckReportFromTrace} from "../lib/model-checks.ts";
import {dehydrateModelDelivery,dehydrateModelQuote,modelArchiveRefs,modelPayloadSha256,modelReportsFor,prepareModelRunStorage,validateModelArchive} from "../lib/model-report-archive.ts";
import {modelStorageCapacity} from "../lib/model-storage-capacity.ts";
import {modelConsent,modelFixture,modelInput,modelTrace} from "./model-check-fixture.ts";

async function append(q:ProofQuote,f:Awaited<ReturnType<typeof modelFixture>>,seed:number,padded=false){
 const prepared=await prepareModelRunStorage(q),pending=beginModelCheckRun(prepared,"seller",modelInput(prepared,f.registration.id,seed),f.digest,f.registration),run=pending.proof.delivery!.modelRun!,trace=modelTrace(run);
 if(padded){
  const initial=modelCheckReportFromTrace(run,trace,new Date().toISOString()),room=Math.floor((30_000-new TextEncoder().encode(JSON.stringify(initial)).byteLength-100)/2);
  assert.ok(room>0);trace[0].body={...(trace[0].body as object),syntheticNonAuthoritativePadding:'"'.repeat(room)};
 }
 return finishModelCheckRun(pending,run.id,modelCheckReportFromTrace(run,trace,new Date().toISOString()));
}
async function archivedAccepted(){const f=await modelFixture();let q=await append(f.quote,f,1);q=acceptDelivery(q,modelConsent(q));for(let i=2;i<=6;i++)q=await append(q,f,i);return{f,q};}

test("legacy latest-only A moves to immutable exact bytes on the fifth prepared run, while acceptance A stays unchanged",async()=>{
 const f=await modelFixture();let q=await append(f.quote,f,1);delete q.proof.delivery!.modelHistory;
 const a=JSON.stringify(q.proof.delivery!.modelReport);q=acceptDelivery(q,modelConsent(q));const accepted=JSON.stringify(q.proof.delivery!.acceptanceEvidence);
 for(let i=2;i<=4;i++)q=await append(q,f,i);
 const before=structuredClone(q),prepared=await prepareModelRunStorage(q);
 assert.deepEqual(q,before);assert.equal(modelArchiveRefs(prepared.proof.delivery!).length,1);assert.equal(prepared.proof.delivery!.modelArchive![0].payload,a);
 assert.equal(prepared.proof.delivery!.modelArchive![0].ref.payloadSha256,await modelPayloadSha256(a));
 q=await append(q,f,5);assert.equal(modelReportsFor(q.proof.delivery!).length,5);assert.equal(q.proof.delivery!.modelHistory!.length,4);
 assert.equal(JSON.stringify(q.proof.delivery!.acceptanceEvidence),accepted);assert.doesNotThrow(()=>assertAcceptedEvidenceReference(q));
 const stored=dehydrateModelQuote(q);assert.equal(stored.proof.delivery!.modelArchive,undefined);assert.deepEqual(stored.proof.delivery!.modelArchiveRefs,q.proof.delivery!.modelArchiveRefs);
 assert.equal(dehydrateModelDelivery(snapshotVersion(q).delivery).modelArchive,undefined);
});

test("twenty is an upper bound with sixteen archived and four inline reports; preflight refuses a twenty-first without mutation",async()=>{
 const f=await modelFixture();let q=f.quote;for(let i=0;i<20;i++)q=await append(q,f,i);
 assert.equal(modelReportsFor(q.proof.delivery!).length,20);assert.equal(modelArchiveRefs(q.proof.delivery!).length,16);assert.equal(q.proof.delivery!.modelHistory!.length,4);
 const before=structuredClone(q),capacity=await modelStorageCapacity(q);assert.equal(capacity.canRun,false);assert.equal(capacity.saved.totalReports,20);assert.match(capacity.reasons.join(" "),/upper bound/);
 await assert.rejects(()=>prepareModelRunStorage(q),DomainError);assert.deepEqual(q,before);
});

test("archive manifests reject missing, extra, duplicate, foreign and tampered objects, including self-consistent foreign hashes",async()=>{
 const {q}=await archivedAccepted();await validateModelArchive(q.proof.delivery!,q.id);
 const mutate=[
  (x:ProofQuote)=>{delete x.proof.delivery!.modelArchive;},
  (x:ProofQuote)=>{x.proof.delivery!.modelArchive![0].payload+=' ';},
  (x:ProofQuote)=>{x.proof.delivery!.modelArchiveRefs!.pop();},
  (x:ProofQuote)=>{x.proof.delivery!.modelArchiveRefs!.push(structuredClone(x.proof.delivery!.modelArchiveRefs![0]));},
  (x:ProofQuote)=>{x.proof.delivery!.modelArchiveRefs![0].runId=crypto.randomUUID();},
  (x:ProofQuote)=>{x.proof.delivery!.modelHistory!.push(JSON.parse(x.proof.delivery!.modelArchive![0].payload));},
  (x:ProofQuote)=>{x.proof.delivery!.files!["index.html"]+='\n';},
 ];
 for(const change of mutate){const x=structuredClone(q);change(x);await assert.rejects(()=>validateModelArchive(x.proof.delivery!,x.id),DomainError);}
 const foreign=structuredClone(q),object=foreign.proof.delivery!.modelArchive![0],report=JSON.parse(object.payload);report.registration.projectId="another-synthetic-project";object.payload=JSON.stringify(report);object.ref.payloadBytes=new TextEncoder().encode(object.payload).byteLength;object.ref.payloadSha256=await modelPayloadSha256(object.payload);foreign.proof.delivery!.modelArchiveRefs![0]=structuredClone(object.ref);
 await assert.rejects(()=>validateModelArchive(foreign.proof.delivery!,foreign.id),DomainError);
});

test("offline export carries exact archived bytes and frozen A, and fails closed for omitted or corrupted archive mappings",async()=>{
 const {q}=await archivedAccepted(),a=structuredClone(q.proof.delivery!.acceptanceEvidence),bundle=await createEvidenceExport(q);
 assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual(bundle.delivery.modelArchive,q.proof.delivery!.modelArchive);assert.deepEqual(bundle.delivery.acceptanceEvidence,a);
 for(const mutate of [(x:typeof bundle)=>{delete x.delivery.modelArchive;},(x:typeof bundle)=>{x.delivery.modelArchive![0].payload+=' ';},(x:typeof bundle)=>{x.delivery.modelArchiveRefs!.shift();},(x:typeof bundle)=>{x.project.id="another-synthetic-project";}]){
  const x=structuredClone(bundle);mutate(x);assert.equal((await verifyEvidenceExport(x)).consistency,"inconsistent");
 }
});

test("a replacement starts with no archive references while the saved previous snapshot retains a verifiable A",async()=>{
 const {q}=await archivedAccepted(),old=snapshotVersion(q),replacement=createUploadedDelivery(q.proof.delivery!.files,q.proof.project!,"en",2);
 // A seller is explicitly allowed to replace after a buyer requests revision.
 q.proof.collaboration!.stage="changes_requested";
 const next=prepareReplacement(q,replacement);assert.equal(next.proof.delivery!.modelArchive,undefined);assert.equal(next.proof.delivery!.modelArchiveRefs,undefined);
 await validateModelArchive(old.delivery,q.id);assert.ok(modelReportsFor(old.delivery).some(r=>r.id===old.delivery.acceptanceEvidence![0].modelReportId));
});

test("an archived version can close a pending unknown write once without rewriting accepted evidence or issuing I/O",async()=>{
 const {f,q}=await archivedAccepted(),prepared=await prepareModelRunStorage(q),pending=beginModelCheckRun(prepared,"seller",modelInput(prepared,f.registration.id,88),f.digest,f.registration),run=pending.proof.delivery!.modelRun!,trace=modelTrace(run);
 const write=trace.find(r=>r.operationId==="create_x")!,intent={...write,completedOrdinal:null};delete intent.status;delete intent.body;
 const checkpoint=recordModelCheckCheckpoint(pending,run.id,[intent]),before=JSON.stringify(checkpoint.proof.delivery!.acceptanceEvidence);
 const closed=closeExpiredModelCheckRun(checkpoint,"buyer",{action:"close",deliveryId:run.deliveryId,runId:run.id},Date.parse(run.expiresAt)+1);
 assert.equal(closed.proof.delivery!.modelReport!.result.outcome,"inconclusive");assert.deepEqual(closed.proof.delivery!.modelReport!.trace,[intent]);assert.equal(JSON.stringify(closed.proof.delivery!.acceptanceEvidence),before);
 await validateModelArchive(closed.proof.delivery!,closed.id);assert.doesNotThrow(()=>assertAcceptedEvidenceReference(closed));
 assert.throws(()=>closeExpiredModelCheckRun(closed,"buyer",{action:"close",deliveryId:run.deliveryId,runId:run.id},Date.parse(run.expiresAt)+2),DomainError);
});

test("capacity requires the original confirmed technical agreement even before any model report exists",async()=>{
 const f=await modelFixture();delete f.quote.proof.delivery!.journeyPlan;const capacity=await modelStorageCapacity(f.quote);assert.equal(capacity.canRun,false);assert.match(capacity.reasons.join(" "),/technical agreement/);assert.equal(capacity.saved.totalReports,0);
});

test("valid large raster packages can exhaust the hydrated envelope before twenty reports; preflight retains every old report",async()=>{
 const f=await modelFixture();
 // Existing synthetic 2x2 JPEG; APP15 metadata padding preserves its raster.
 const original=Uint8Array.from(atob('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgAZFf/9k='),c=>c.charCodeAt(0));
 const raster=new Uint8Array(STATIC_RESOURCE_LIMITS.rasterFileBytes);raster.set(original.subarray(0,2));let offset=2,remaining=raster.length-original.length;
 while(remaining){let chunk=Math.min(65537,remaining);if(remaining>chunk&&remaining-chunk<4)chunk-=4;raster[offset]=255;raster[offset+1]=239;raster[offset+2]=(chunk-2)>>>8;raster[offset+3]=(chunk-2)&255;offset+=chunk;remaining-=chunk;}
 raster.set(original.subarray(2),offset);const image=encodeRasterDataUrl("a.jpg",raster),files={...f.quote.proof.delivery!.files,"a.jpg":image,"b.jpg":image,"c.jpg":image,"d.jpg":image};
 const delivery=createUploadedDelivery(files,f.quote.proof.project!,"en",1);delivery.journeyPlan=f.quote.proof.delivery!.journeyPlan;
 f.quote.proof.delivery=delivery;f.quote.proof.review!.deliveryId=delivery.id;f.quote.proof.collaboration!.submission!.deliveryId=delivery.id;f.digest=await runtimeDeliveryDigest(files);f.registration={...f.registration,frontendBundleDigest:f.digest};
 const started=beginProjectJourneyRun(f.quote,"buyer",{action:"start",deliveryId:delivery.id,previousReportId:null,targetId:f.registration.id,confirm:true},f.digest,f.registration);let q=finishProjectJourneyRun(started,"buyer",{action:"abort",deliveryId:delivery.id,runId:started.proof.delivery!.journeyRun!.id});
 let count=0;for(;count<20;count++){const capacity=await modelStorageCapacity(q);if(!capacity.canRun)break;q=await append(q,f,count,true);}
 assert.ok(count>4&&count<20,`expected a real byte limit before20, got ${count}`);const before=structuredClone(q),capacity=await modelStorageCapacity(q);
 assert.equal(capacity.canRun,false);assert.match(capacity.reasons.join(" "),/hydrated delivery envelope/);assert.equal(capacity.saved.totalReports,count);assert.equal(modelReportsFor(q.proof.delivery!).length,count);
 const prepared=await prepareModelRunStorage(q);assert.throws(()=>beginModelCheckRun(prepared,"seller",modelInput(prepared,f.registration.id,99),f.digest,f.registration),DomainError);assert.deepEqual(q,before);
});
