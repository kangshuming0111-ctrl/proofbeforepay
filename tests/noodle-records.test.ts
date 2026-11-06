import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const base=new URL('../public/benchmarks/noodle-core-2026-11-06/',import.meta.url);
const read=async(file:string)=>JSON.parse(await readFile(new URL(file,base),'utf8'));
test("noodle public record manifest preserves every bounded artifact byte",async()=>{
 const manifest=await read('manifest.json');assert.ok(manifest.files.length>=19);assert.equal(new Set(manifest.files.map((f:any)=>f.file)).size,manifest.files.length);
 for(const item of manifest.files){assert.match(item.file,/^[A-Za-z0-9-]+\.json$/u);const bytes=await readFile(new URL(item.file,base));assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.ok(bytes.length<25*1024*1024);}
});
test("first live under-admission and later zero-call correction remain distinct, exact raw remains immutable",async()=>{
 const first=await read('first-live.json'),replay=await read('corrective-zero-call-replay.json'),latest=await read('latest.json');
 assert.equal(first.summary.effectiveSourceOrPublishedMatches,8);assert.equal(replay.summary.effectiveSourceMatches,9);assert.equal(first.summary.focusedCriteria,9);assert.equal(first.summary.providerExpectedIds,13);
 assert.equal(latest.firstEvaluation.rawStatusMatches,9);assert.equal(latest.correctiveReplay.additionalProviderCalls,0);assert.equal(replay.summary.blockedNetworkAttempts,0);
 for(const row of first.results){const corrected=replay.results.find((r:any)=>r.id===row.id);assert.equal(createHash('sha256').update(row.raw.bodyText).digest('hex'),corrected.firstRawProviderSha256);assert.deepEqual(corrected.firstApplicationUnchanged,row.application);for(const item of corrected.correctiveApplication.items){const original=row.application.items.find((i:any)=>i.criterionId===item.criterionId);assert.deepEqual(item.modelJudgment,original.modelJudgment);assert.equal(item.status,original.status);}}
 assert.equal(latest.provenance.realCustomers,0);assert.equal(latest.provenance.independentThirdPartyRepositories,0);
});
test("precall reference correction, gold-free provider inputs, owner/source quotes and runtime evidence remain checkable",async()=>{
 const corpus=await read('authored-corpus.json'),seal=await read('case-seal.json'),correction=await read('precall-reference-correction.json'),freeze=await read('first-request-freeze.json'),replay=await read('corrective-zero-call-replay.json');
 const bytes=await readFile(new URL('authored-corpus.json',base));assert.equal(createHash('sha256').update(bytes).digest('hex'),seal.corpusSha256);assert.equal(correction.providerCalls,0);assert.equal(corpus.projects.reduce((n:number,p:any)=>n+p.criteria.length,0),9);
 for(const row of freeze.snapshot.cases){assert.equal(createHash('sha256').update(row.requestBody).digest('hex'),row.requestSha256);assert.doesNotMatch(row.requestBody,/"(?:expectedStatus|sourceFindingReference|reference|rationale)"\s*:/u);}
 for(const row of replay.results){const original=freeze.snapshot.cases.find((c:any)=>c.id===row.id);for(const item of row.correctiveApplication.items)for(const cite of item.sourceFinding?.citations??[])assert.equal(original.quote.proof.delivery.files[cite.file].slice(cite.start,cite.end),cite.excerpt);}
 const runtime=replay.results.find((r:any)=>r.id==='f1-sealed-runtime-insufficient');for(const id of ['coverage-2','coverage-3']){const item=runtime.correctiveApplication.items.find((i:any)=>i.criterionId===id);assert.equal(item.status,'insufficient_evidence');assert.equal(item.evidenceNeed.reason,'record_readback');}
});
