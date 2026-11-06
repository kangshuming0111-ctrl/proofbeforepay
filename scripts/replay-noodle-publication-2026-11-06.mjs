// Known noodle-shop regressions only. Reuse the four first provider replies;
// never fetch or retry a model, alter its prompt, or replace the old 7/9 record.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assessDelivery} from "../lib/delivery-assessment.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.argv[2];
if (!output || process.argv.length !== 3) throw new Error("Provide one new JSON output path; existing records are never overwritten.");
const sha = value => createHash("sha256").update(value).digest("hex");
const fixturePath = "tests/fixtures/noodle-f1-first-four-replay.json";
const fixtureBytes = await readFile(path.join(root, fixturePath));
const fixture = JSON.parse(fixtureBytes);
assert.equal(fixture.schema, "noodle-first-four-exact-replay-v1");
const permitted = new Map([
  ["f1-sealed-wrong-object/coverage-1", "locked_price_mismatch"],
  ["f1-sealed-wrong-page/coverage-2", "confirmed_form_label_absence"],
]);
const results = [];
let blockedNetworkAttempts = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { blockedNetworkAttempts++; throw new Error("External fetch is forbidden in retained-reply replay."); };
try {
  for (const entry of fixture.cases) {
    assert.equal(sha(entry.rawProviderBodyText), entry.rawProviderSha256);
    const quote = structuredClone(entry.quote), before = JSON.stringify(quote);
    let intercepted = 0;
    const report = await assessDelivery(quote, {DEEPSEEK_API_KEY: "offline-retained-reply-only", DEEPSEEK_MODEL: "deepseek-flash"}, async (url, init) => {
      assert.equal(++intercepted, 1, "No retry is permitted.");
      assert.equal(String(url), "https://api.deepseek.com/beta/chat/completions");
      assert.equal(String(init.body), entry.requestBody, "Original prompt bytes must be unchanged.");
      return new Response(entry.rawProviderBodyText, {status: 200, headers: {"content-type": "application/json"}});
    });
    assert.equal(intercepted, 1);
    assert.equal(JSON.stringify(quote), before, "Replay must not mutate source, locked requirements or scope history.");
    assert.equal(report.publicationPolicy.schema, "source-publication-v2", "Current replay must retain its named source-publication strategy.");
    const changed = [];
    for (const item of report.items) {
      const old = entry.originalApplication.items.find(row => row.criterionId === item.criterionId);
      assert.ok(old);
      assert.deepEqual(item.modelJudgment, old.modelJudgment, "Preserve the exact original model judgment.");
      const reason = permitted.get(`${entry.id}/${item.criterionId}`);
      if (reason) {
        assert.equal(old.status, "insufficient_evidence");
        assert.equal(item.status, "changes_suggested");
        assert.deepEqual(item.publicationBasis, {schema: "source-publication-v2", reason});
        assert.equal(item.explanation, item.sourceFinding.explanation);
        assert.deepEqual(item.citations, item.sourceFinding.citations);
        assert.equal(item.evidenceNeed, undefined);
        changed.push(item.criterionId);
      } else {
        assert.equal(item.status, old.status, "No other published status may change.");
        assert.equal(item.publicationBasis, undefined);
      }
    }
    assert.equal(report.risks.length, 0, "Unverified optional model risks must stay withheld.");
    assert.deepEqual(report.withheldRisks.entries, entry.originalApplication.withheldRisks.entries, "Optional risk originals are preserved.");
    const focused = entry.reference.map(ref => {
      const item = report.items.find(row => row.criterionId === ref.criterionId);
      const old = entry.originalApplication.items.find(row => row.criterionId === ref.criterionId);
      return {criterionId: ref.criterionId, reference: ref.expectedStatus, originalPublished: old.status,
        raw: item.modelJudgment.status, published: item.status, independentSource: item.sourceFinding?.status ?? null,
        publicationBasis: item.publicationBasis ?? null};
    });
    results.push({id: entry.id, retainedRawProviderSha256: entry.rawProviderSha256, requestSha256: sha(entry.requestBody),
      providerCalls: 0, interceptedRetainedReply: intercepted, changedPublishedCriterionIds: changed, focused, report});
  }
} finally { globalThis.fetch = originalFetch; }
const focused = results.flatMap(entry => entry.focused);
assert.equal(focused.length, 9);
assert.equal(focused.filter(item => item.originalPublished === item.reference).length, 7);
assert.equal(focused.filter(item => item.published === item.reference).length, 9);
assert.equal(results.flatMap(entry => entry.changedPublishedCriterionIds).length, 2);
assert.equal(blockedNetworkAttempts, 0);
const implementationFiles = ["lib/delivery-assessment.ts", "lib/assessment-source-publication.ts", "lib/assessment-publication-policy.ts", "lib/assessment-source-findings.ts", "lib/assessment-requirement-completeness.ts", "lib/menu-dom-source-v2.ts", "lib/menu-source-publication-v2.ts", "lib/contracts.ts", "lib/evidence-export.ts"];
const implementation = await Promise.all(implementationFiles.map(async file => ({file, sha256: sha(await readFile(path.join(root, file)))})));
const result = {schema: "noodle-negative-publication-replay-v1", createdAt: new Date().toISOString(),
  fixture: {file: fixturePath, sha256: sha(fixtureBytes), firstLiveFreezeSha256: fixture.firstLiveFreezeSha256}, implementation,
  summary: {knownFictionalProjects: 4, focusedCriteria: 9, providerCalls: 0, externalNetworkCalls: 0, blockedNetworkAttempts,
    rawStatusMatches: focused.filter(item => item.raw === item.reference).length, originalPublishedStatusMatches: 7,
    currentPublishedStatusMatches: 9, changedPublishedItems: 2, rawJudgmentsPreserved: true, originalRequestsPreserved: true,
    sourceRequirementsAndScopePreserved: true, optionalRiskOriginalsPreservedAndWithheld: true},
  limitations: ["Known authored fictional regression inputs; this is a zero-network replay, not a new model experiment or new real-merchant trial.",
    "9/9 describes these nine status references only, not whole-answer accuracy, browser behavior, backend persistence, security or general reliability.",
    "Old 7/9 reports and references remain unchanged. Current reports explicitly use source-publication-v2; historical schema1 records retain their original semantics. Runtime obligations remain unresolved; no automatic scope agreement, acceptance or payment."], results};
await writeFile(path.resolve(output), JSON.stringify(result, null, 2) + "\n", {flag: "wx"});
console.log(JSON.stringify(result.summary));
