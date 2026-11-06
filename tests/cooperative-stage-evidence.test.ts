import assert from 'node:assert/strict';
import test from 'node:test';
import type {ProofQuote,ProofRole} from '../lib/contracts.ts';
import {parseStaticProject,createUploadedDelivery} from '../lib/static-project.ts';
import {runtimeDeliveryDigest} from '../lib/runtime-project.ts';
import {createDeliveryStageReport,type DeliveryStagePlan} from '../lib/delivery-stage-evidence.ts';
import {appendCooperativeStageReport,validateCooperativeStageReports,cooperativeStageContext,assertCooperativeStageBounds,createCooperativeStagePlan} from '../lib/cooperative-stage-evidence.ts';
import {createEvidenceExport,verifyEvidenceExport} from '../lib/evidence-export.ts';
import {evidenceHistoryBytes,assertQuoteEvidenceBudget} from '../lib/evidence-budget.ts';
import {snapshotVersion} from '../lib/proof-workflow.ts';
const at='2026-11-06T00:00:00.000Z',sha='a'.repeat(64);
function fixture():ProofQuote{
 const parsed=parseStaticProject({title:'Synthetic cooperative report',summary:'Retain a synthetic record and read it after restart.',amount:'1.00',requiredPages:['index.html'],manualRequirements:['Retain a synthetic record and read it after restart.']},'en');
 const files={'index.html':'<!doctype html><html><head><title>Native scope</title></head><body>Controlled source, not an execution claim.</body></html>'},delivery=createUploadedDelivery(files,parsed.project,'en',1);
 return{id:'cooperative-test-project',reference:'PBP-COOP',workflow:'proof-v1',title:parsed.title,summary:parsed.summary,brief:parsed.summary,clientName:'Synthetic',currency:'AUD',language:'en',hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:'approved',aiMode:'demo',paymentMode:'demo',createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:'unfunded',audit:[],delivery,collaboration:{stage:'submitted',feedback:[],submission:{deliveryId:delivery.id,note:'Synthetic',at}},review:{deliveryId:delivery.id,mode:'demo',reviewedAt:at,summary:'Rules checked'}}};
}
async function report(q:ProofQuote,run='stage-test-1'){
 const p=await createCooperativeStagePlan(q,{criterionId:'manual-1',runId:run,sourceRevision:'upstream-v1',payloadDigest:sha,emailCoverage:'unsupported'}),base={outcome:'observed',runId:run,sourceRevision:p.scope.sourceRevision},record={recordId:'native-1',payloadDigest:sha};
 return createDeliveryStageReport(p,[{...base,stage:'submit',accepted:true,operationId:'native-create',record},{...base,stage:'stored_record',reader:'native_store',connectionId:'reader-before',record},{...base,stage:'fresh_readback',reader:'fresh_connection',connectionId:'reader-after',record},{outcome:'unsupported'}]);
}
async function input(q:ProofQuote,run?:string){return{deliveryId:q.proof.delivery!.id,deliveryDigest:await runtimeDeliveryDigest(q.proof.delivery!.files),report:await report(q,run)};}
test('append is participant supplied, immutable and leaves source, review, frozen acceptance and payment unchanged',async()=>{
 const q=fixture();q.proof.acceptedDeliveryId=q.proof.delivery!.id;q.proof.acceptedAt=at;q.proof.collaboration!.stage='accepted';
 const before=structuredClone(q),n=await appendCooperativeStageReport(q,'seller',await input(q),at),d=n.proof.delivery!;
 assert.deepEqual(q,before);assert.equal(d.cooperativeStageReports!.length,1);assert.equal(d.cooperativeStageReports![0].reportedByRole,'seller');assert.equal(d.cooperativeStageReports![0].receivedAt,at);
 assert.deepEqual(d.files,q.proof.delivery!.files);assert.deepEqual(n.proof.review,q.proof.review);assert.deepEqual(n.proof.collaboration,q.proof.collaboration);assert.equal(n.proof.acceptedAt,at);assert.equal(n.proof.paymentState,'unfunded');assert.equal(d.acceptanceEvidence,undefined);assert.equal(n.proof.audit.length,0);
 assert.deepEqual(d.cooperativeStageReports![0].report.summary,{matched:3,mismatch:0,unknown:0,unsupported:1});
});
test('same report is read-only idempotent while distinct buyer/seller reports preserve original role and order',async()=>{
 let q=fixture();const one=await input(q);q=await appendCooperativeStageReport(q,'seller',one,at);assert.equal(await appendCooperativeStageReport(q,'buyer',one,at),q);
 q=await appendCooperativeStageReport(q,'buyer',await input(q,'stage-test-2'),at);assert.deepEqual(q.proof.delivery!.cooperativeStageReports!.map(r=>r.reportedByRole),['seller','buyer']);
});
test('current project, delivery, file digest, criterion and exact original source bind every report',async()=>{
 const q=fixture(),base=await input(q),before=structuredClone(q);
 for(const patch of [{deliveryId:'old'},{deliveryDigest:'b'.repeat(64)},{actorRole:'buyer'}])await assert.rejects(appendCooperativeStageReport(q,'seller',{...base,...patch},at));
 for(const patch of [{projectId:'other'},{deliveryId:'old'},{criterionId:'unknown'},{requirement:'Different requirement'}]){
  const p=structuredClone(base.report.plan);Object.assign(p.scope,patch);const changed=await createDeliveryStageReport(p,base.report.rows.map(r=>r.observation));await assert.rejects(appendCooperativeStageReport(q,'buyer',{...base,report:changed},at),/match/);
 }
 await assert.rejects(appendCooperativeStageReport(q,'outsider' as ProofRole,base,at));assert.deepEqual(q,before);
});
test('all pending native, model and financial operations reject a new append without touching prior records',async()=>{
 const q=fixture(),base=await input(q);
 for(const key of ['runtimeRun','journeyRun','modelRun','transferCompetitionRun','enquiryRun']){const n=structuredClone(q);Object.assign(n.proof.delivery!,{[key]:{id:'pending'}});const before=structuredClone(n);await assert.rejects(appendCooperativeStageReport(n,'buyer',base,at),/Finish/);assert.deepEqual(n,before);}
 for(const op of ['capture','void'] as const){const n=structuredClone(q);n.proof.paymentOperation=op;await assert.rejects(appendCooperativeStageReport(n,'seller',base,at),/Finish/);}
});
test('three-record and exact multibyte UTF8 aggregate caps retain all existing evidence',async()=>{
 let q=fixture();for(let i=0;i<3;i++)q=await appendCooperativeStageReport(q,'buyer',await input(q,'stage-'+i),at);const before=structuredClone(q);
 await assert.rejects(appendCooperativeStageReport(q,'seller',await input(q,'stage-4'),at),/three/);assert.deepEqual(q,before);
 assert.equal(assertCooperativeStageBounds([{x:'a'.repeat(32000)},{x:'a'.repeat(32000)}]),new TextEncoder().encode(JSON.stringify([{x:'a'.repeat(32000)},{x:'a'.repeat(32000)}])).byteLength);
 assert.throws(()=>assertCooperativeStageBounds([{x:'界'.repeat(17000)},{x:'界'.repeat(17000)}]),/96 KiB/);
 let read=false;const hostile={};Object.defineProperty(hostile,'x',{enumerable:true,get(){read=true;return 'evil';}});assert.throws(()=>assertCooperativeStageBounds([hostile]));assert.equal(read,false);
});
test('cooperative bytes participate in existing global evidence history, with no reservation or acceptance relaxation',async()=>{
 const q=fixture(),before=evidenceHistoryBytes(q.proof.delivery!),n=await appendCooperativeStageReport(q,'seller',await input(q),at);assert.ok(evidenceHistoryBytes(n.proof.delivery!)>before);assertQuoteEvidenceBudget(n);
 const large=structuredClone(n);large.proof.delivery!.acceptanceEvidence=Array.from({length:20},()=>({padding:'x'.repeat(14000)})) as never;assert.throws(()=>assertQuoteEvidenceBudget(large),/full/);
});
test('replacement starts without reports and immutable archived snapshot retains the exact old appendix',async()=>{
 const q=fixture(),n=await appendCooperativeStageReport(q,'seller',await input(q),at),snapshot=snapshotVersion(n,at),next=structuredClone(n);
 next.proof.delivery=createUploadedDelivery({'index.html':'<!doctype html><html><head><title>New</title></head><body>New version</body></html>'},next.proof.project!,'en',2);
 assert.equal(next.proof.delivery.cooperativeStageReports,undefined);assert.deepEqual(snapshot.delivery.cooperativeStageReports,n.proof.delivery!.cooperativeStageReports);await assert.rejects(appendCooperativeStageReport(next,'seller',await input(n),at),/changed/);
});
test('strict saved metadata and duplicate content cannot be hidden in a valid-looking exported report',async()=>{
 const q=fixture(),n=await appendCooperativeStageReport(q,'seller',await input(q),at),ctx=await cooperativeStageContext(n);
 for(const patch of [{reportedByRole:'stranger'},{receivedAt:'yesterday'},{deliveryDigest:'b'.repeat(64)},{unexpected:true}]){const entries=structuredClone(n.proof.delivery!.cooperativeStageReports!);Object.assign(entries[0],patch);await assert.rejects(validateCooperativeStageReports(entries,ctx));}
 await assert.rejects(validateCooperativeStageReports([...n.proof.delivery!.cooperativeStageReports!,...n.proof.delivery!.cooperativeStageReports!],ctx));
});
test('new and legacy evidence exports verify, while stage payload, scope, receipt or file binding tampering fails',async()=>{
 const q=fixture();assert.equal((await verifyEvidenceExport(await createEvidenceExport(q))).consistency,'consistent');
 const n=await appendCooperativeStageReport(q,'seller',await input(q),at),bundle=await createEvidenceExport(n);assert.equal((await verifyEvidenceExport(bundle)).consistency,'consistent');assert.deepEqual(bundle.delivery.cooperativeStageReports,n.proof.delivery!.cooperativeStageReports);
 for(const kind of ['role','file','scope','digest']){const altered=structuredClone(bundle),entry=altered.delivery.cooperativeStageReports![0];if(kind==='role')Object.assign(entry,{reportedByRole:'stranger'});if(kind==='file')entry.deliveryDigest='b'.repeat(64);if(kind==='scope'){const p=structuredClone(entry.report.plan);p.scope.requirement='Different';entry.report=await createDeliveryStageReport(p,entry.report.rows.map(r=>r.observation));}if(kind==='digest')entry.report.digest='0'.repeat(64);assert.equal((await verifyEvidenceExport(altered)).checks.find(c=>c.id==='cooperative-stage-bindings')?.status,'inconsistent',kind);}
 assert.equal(bundle.delivery.acceptanceEvidence,undefined);
});
test('scope plan uses real IDs and original source, preserves declared revision and refuses invented criteria or invalid digest',async()=>{
 const q=fixture(),plan=await createCooperativeStagePlan(q,{criterionId:'manual-1',runId:'stage-explicit',sourceRevision:'native-v1',payloadDigest:sha,emailCoverage:'unsupported'});
 assert.equal(plan.scope.projectId,q.id);assert.equal(plan.scope.deliveryId,q.proof.delivery!.id);assert.equal(plan.scope.requirement,q.proof.criteria.find(c=>c.id==='manual-1')!.source);assert.equal(plan.scope.sourceRevision,'native-v1');
 for(const change of [{criterionId:'invented'},{sourceRevision:'contains spaces'},{payloadDigest:'abc'}])await assert.rejects(createCooperativeStagePlan(q,{criterionId:'manual-1',runId:'stage-explicit',sourceRevision:'native-v1',payloadDigest:sha,emailCoverage:'unsupported',...change}));
});
