// Controlled application replay of retained provider responses. No network or
// new model execution; prompt changes are recorded, not claimed to be tested.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {assessDeliveryLegacyReplay as assessDelivery} from '../lib/delivery-assessment.ts';
import {projectQuote, validateProjectCorpus} from './run-project-assessment-evaluation.ts';

const [corpusPath, reportPath, outputPath] = process.argv.slice(2);
if (![corpusPath, reportPath, outputPath].every(p => typeof p === 'string' && path.isAbsolute(p) && p.endsWith('.json'))) throw new Error('Three absolute JSON paths required.');
const hash = value => createHash('sha256').update(value).digest('hex');
const corpusBytes = await readFile(corpusPath), reportBytes = await readFile(reportPath);
const corpus = validateProjectCorpus(JSON.parse(corpusBytes)), prior = JSON.parse(reportBytes);
assert.equal(prior.snapshot.corpusSha256, hash(corpusBytes));
const rows = []; let interceptedRequests = 0;
for (const p of corpus.projects) {
  const old = prior.results.find(row => row.id === p.id);
  const frozen = prior.snapshot.projects.find(row => row.id === p.id);
  assert.ok(old?.networkAttempted && old.raw?.bodyComplete && typeof old.raw.bodyText === 'string' && frozen);
  for (const file of frozen.files) assert.equal(hash(p.files[file.file]), file.sha256);
  const originalRequest = JSON.parse(frozen.requestBody), quote = projectQuote(p), before = structuredClone(quote);
  let requestSha256;
  const result = await assessDelivery(quote, {DEEPSEEK_API_KEY:'controlled-offline-no-network', DEEPSEEK_MODEL:prior.model}, async (_url, init) => {
    interceptedRequests++;
    const body = String(init?.body), packet = JSON.parse(JSON.parse(body).messages[1].content);
    const originalPacket = JSON.parse(originalRequest.messages[1].content);
    assert.deepEqual(packet.criteria, originalPacket.criteria);
    assert.deepEqual(packet.files, originalPacket.files);
    assert.equal(JSON.stringify(packet).includes('expectedStatus'), false);
    requestSha256 = hash(body);
    return new Response(old.raw.bodyText, {status:old.raw.httpStatus, headers:{'Content-Type':'application/json'}});
  });
  assert.deepEqual(quote, before);
  rows.push({id:p.id, retainedResponseSha256:hash(old.raw.bodyText), originalRequestSha256:hash(frozen.requestBody), replayRequestSha256:requestSha256,
    criteria:p.criteria.map(c => ({id:c.id, reference:c.reference.expectedStatus, raw:old.criteria.find(row => row.id === c.id).rawStatus,
      previousApplication:old.criteria.find(row => row.id === c.id).applicationStatus, replayApplication:result.items.find(row => row.criterionId === c.id).status})),
    report:result});
}
const criteria = rows.flatMap(row => row.criteria);
const output = {schema:'pbp-real-project-controlled-replay-v1', createdAt:new Date().toISOString(), corpusSha256:hash(corpusBytes), priorReportSha256:hash(reportBytes),
  networkRequests:0, modelCalls:0, interceptedRequests, criterionCount:criteria.length,
  previousApplicationAgreement:criteria.filter(c => c.previousApplication === c.reference).length,
  replayApplicationAgreement:criteria.filter(c => c.replayApplication === c.reference).length,
  rows, limits:['Exact retained provider responses, not new model behavior or a prompt regression test.','Changed prompt bytes are recorded; unchanged source and criteria are asserted.','Reference agreement is not complete-answer correctness, execution, customer acceptance or payment.']};
await writeFile(outputPath, JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({outputPath,networkRequests:0,modelCalls:0,criteria:criteria.length,previous:output.previousApplicationAgreement,replay:output.replayApplicationAgreement}));
