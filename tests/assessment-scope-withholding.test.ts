import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessment, ProofAssessmentItem, ProofAssessmentRisk, ProofCriterion, ProofQuote} from "../lib/contracts.ts";
import {finiteContactPresenceScopeCriterionIds, publishSourceAssessmentNotes} from "../lib/assessment-publication-policy.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";
import {createEvidenceExport, verifyEvidenceExport} from "../lib/evidence-export.ts";
import {recordRiskReview} from "../lib/risk-reviews.ts";
import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";
import {snapshotRiskFeedbackSource} from "../lib/risk-repairs.ts";
import {sourceVisibilityPlan} from "../lib/source-visibility.ts";

const at = "2026-11-06T00:00:00.000Z", phone = "The page content must list the shop phone number.";
const html = '<!doctype html><html><head><title>Contact scope</title></head><body><p>Phone: +61 3 7010 2244</p><address>Email: orders@maple.example.test</address></body></html>';
const contact = '<!doctype html><html><head><title>About</title></head><body><p>Fictional shop description.</p></body></html>';
function risk(title = "Original optional source lead"): ProofAssessmentRisk {
  const excerpt = "<p>Phone: +61 3 7010 2244</p>", start = html.indexOf(excerpt);
  return {title, explanation: "Retained model wording, not an independently established delivery defect.", suggestion: "Inspect this original source lead against the actual agreement.", citations: [{file: "index.html", start, end: start + excerpt.length, excerpt}]};
}
function fixture(language: "en" | "zh" = "en", manualRequirements = [phone]): ProofQuote {
  const parsed = parseStaticProject({title: "Contact scope gate", summary: "A fictional website delivery for source-copy review.", amount: "1.00", requiredPages: ["index.html", "contact.html"], manualRequirements, links: [{from: "index.html", text: "About", to: "contact.html"}]}, language);
  const source = html.replace("</body>", '<a href="contact.html">About</a></body>');
  const delivery = createUploadedDelivery({"index.html": source, "contact.html": contact, "site.css": "body{font-family:serif}"}, parsed.project, language, 1);
  const items: ProofAssessmentItem[] = parsed.criteria.map(c => ({criterionId: c.id, status: c.id === "mobile" ? "insufficient_evidence" : "supported", explanation: "Controlled source-only finding.", citations: [], ruleEvidenceIds: delivery.evidence.filter(row => row.criterionId === c.id).map(row => row.id)}));
  const original = new Map(items.map(item => [item.criterionId, item.status]));
  const notes = publishSourceAssessmentNotes(language, items, original, [risk(), risk("Second original lead")], 0, delivery.files!, parsed.criteria);
  delivery.assessment = {id: "scope-v2-assessment", deliveryId: delivery.id, method: "source-ai-v1", mode: "live", model: "controlled-no-call", assessedAt: at, items, risks: notes.risks, withheldRisks: notes.withheldRisks, limitations: notes.limitations, coverage: {includedFiles: Object.keys(delivery.files!), truncatedFiles: [], omittedFiles: []}};
  return {id: "scope-gate-project", reference: "PBP-SCOPE-GATE", workflow: "proof-v1", title: parsed.title, summary: parsed.summary, brief: parsed.summary, clientName: "Fictional", currency: "AUD", language, hourlyRateCents: 100, totalCents: 100, lineItems: [{id: "site", description: "Website", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: at, proof: {project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery, review: {deliveryId: delivery.id, reviewedAt: at, mode: "demo", summary: "Controlled rule check"}, collaboration: {stage: "submitted", submission: {deliveryId: delivery.id, at, note: "Synthetic delivery"}, feedback: []}}};
}
const reviewInput = (q: ProofQuote, riskIndex = 0) => ({deliveryId: q.proof.delivery!.id, assessmentId: q.proof.delivery!.assessment!.id, riskIndex, riskOrigin: "withheld" as const, decision: "needs_evidence" as const, reason: "Independent human opinion only; original scope uncertainty remains."});
const annotate = (q: ProofQuote) => recordRiskReview(q, "buyer", reviewInput(q), at);

test("full production page/link/mobile criteria accompany a finite custom contact scope without passing structural items", () => {
  for (const language of ["en", "zh"] as const) {
    const q = fixture(language), a = q.proof.delivery!.assessment!;
    assert.deepEqual(q.proof.criteria.map(c => c.id), ["page-1", "page-2", "link", "mobile", "manual-1"]);
    assert.deepEqual(finiteContactPresenceScopeCriterionIds(q.proof.criteria, a.items, q.proof.delivery!.files!), ["manual-1"]);
    assert.equal(a.withheldRisks!.version, 2); assert.equal(a.withheldRisks!.reason, "source_scope_unestablished");
    if (a.withheldRisks!.version !== 2) throw Error("Expected scope gate");
    assert.deepEqual(a.withheldRisks!.scopeCriterionIds, ["manual-1"]);
    assert.deepEqual(a.withheldRisks!.adjustedCriteria, []); assert.deepEqual(a.risks, []);
    assert.equal(a.items.find(i => i.criterionId === "mobile")!.status, "insufficient_evidence");
    assert.match(a.limitations[2], language === "en" ? /other page, link or mobile requirements are not declared passed/u : /未认定其他页面、链接或手机要求通过/u);
  }
});
test("publication retains independent original copies and never mutates item states or invents adjustments", () => {
  const q = fixture(), d = q.proof.delivery!, a = d.assessment!, modelRisks = [risk()], before = structuredClone({items: a.items, modelRisks, criteria: q.proof.criteria});
  const result = publishSourceAssessmentNotes("en", a.items, new Map(a.items.map(i => [i.criterionId, i.status])), modelRisks, 0, d.files!, q.proof.criteria);
  assert.equal(result.statusAdjustedCount, 0); assert.deepEqual(result.withheldRisks!.adjustedCriteria, []); assert.equal(result.withheldRisks!.entries[0].originalRiskIndex, 0);
  assert.deepEqual({items: a.items, modelRisks, criteria: q.proof.criteria}, before);
  result.withheldRisks!.entries[0].risk.citations[0].excerpt = "mutated copy";
  assert.deepEqual(modelRisks, before.modelRisks);
});
test("existing status-adjustment v1 takes priority and zero-risk or absent-criteria behavior remains v1", () => {
  const q = fixture(), d = q.proof.delivery!, a = d.assessment!, originals = new Map(a.items.map(i => [i.criterionId, i.status])); originals.set("manual-1", "changes_suggested");
  const result = publishSourceAssessmentNotes("en", a.items, originals, [risk()], 0, d.files!, q.proof.criteria);
  assert.equal(result.withheldRisks!.version, 1); assert.equal(result.withheldRisks!.reason, "item_status_adjusted");
  assert.deepEqual(result.withheldRisks!.adjustedCriteria, [{criterionId: "manual-1", originalStatus: "changes_suggested", publishedStatus: "supported"}]);
  const unchanged = new Map(a.items.map(i => [i.criterionId, i.status]));
  for (const result of [publishSourceAssessmentNotes("en", a.items, unchanged, [], 0, d.files!, q.proof.criteria), publishSourceAssessmentNotes("en", a.items, unchanged, [risk()], 0, d.files!)]) assert.deepEqual(result.withheldRisks, {version: 1, reason: "not_withheld", adjustedCriteria: [], entries: []});
});
test("mixed custom price/runtime requirements and mismatched IDs cannot borrow contact scope", () => {
  for (const source of ["The page content must list Tea at AUD 18.", "The form must email the owner."]) {
    const q = fixture("en", [phone, source]), a = q.proof.delivery!.assessment!;
    assert.equal(finiteContactPresenceScopeCriterionIds(q.proof.criteria, a.items, q.proof.delivery!.files!), undefined);
    assert.equal(a.withheldRisks!.version, 1); assert.equal(a.withheldRisks!.reason, "not_withheld"); assert.equal(a.risks.length, 2);
  }
  const q = fixture(), a = q.proof.delivery!.assessment!, ids = structuredClone(a.items); ids[0].criterionId = "foreign";
  assert.equal(finiteContactPresenceScopeCriterionIds(q.proof.criteria, ids, q.proof.delivery!.files!), undefined);
});
test("structural-looking IDs require the exact supported source grammar, not arbitrary operational wording", () => {
  const q = fixture(), d = q.proof.delivery!, a = d.assessment!;
  for (const patch of [{id: "mobile", source: "The form must send email."}, {id: "page-1", source: q.proof.criteria[0].source + " Then charge the customer."}, {id: "link", source: 'index.html contains a link labelled “About” pointing to https://example.test/.'}, {id: "unknown-1", source: phone}]) {
    const criteria = structuredClone(q.proof.criteria), at = criteria.findIndex(c => c.id === patch.id);
    if (at >= 0) criteria[at] = {...criteria[at], source: patch.source}; else {criteria[0].id = patch.id; criteria[0].source = patch.source;}
    const items = criteria.map((c, index) => ({...a.items[index], criterionId: c.id}));
    assert.equal(finiteContactPresenceScopeCriterionIds(criteria, items, d.files!), undefined, patch.id);
  }
  const structuralOnly = q.proof.criteria.filter(c => c.id !== "manual-1"), items = a.items.filter(i => i.criterionId !== "manual-1");
  assert.equal(finiteContactPresenceScopeCriterionIds(structuralOnly, items, d.files!), undefined);
});
test("contact scope identifiers retain exact custom order for multiple finite requirements", () => {
  const q = fixture("en", [phone, "The website content must include the shop email address."]), a = q.proof.delivery!.assessment!;
  assert.deepEqual(finiteContactPresenceScopeCriterionIds(q.proof.criteria, a.items, q.proof.delivery!.files!), ["manual-1", "manual-2"]);
  assert.equal(a.withheldRisks!.version, 2);
});
test("v2 current evidence export and unified bundle verify without asserting model or execution truth", async () => {
  const q = fixture(), before = structuredClone(q), bundle = await createEvidenceExport(q);
  assert.equal((await verifyEvidenceExport(bundle)).consistency, "consistent"); assert.deepEqual(q, before);
  assert.deepEqual(bundle.delivery.assessment!.withheldRisks, q.proof.delivery!.assessment!.withheldRisks);
  assert.equal((await verifyEvidenceExport(bundle)).limits.modelJudgment, "not-proven");
  const {createEvidenceBundle, verifyEvidenceBundle} = await import("../lib/evidence-bundle.ts");
  const {buildSupplementalCatalog} = await import("../lib/supplemental-evidence.ts");
  assert.equal((await verifyEvidenceBundle(await createEvidenceBundle(q, {catalog: await buildSupplementalCatalog(q, []), objects: []}))).consistency, "consistent");
});
test("v2 scope IDs, empty ledger, original order, active pool and exact quotes are enforced on import", async () => {
  const base = await createEvidenceExport(fixture("en", [phone, "The website content must include the shop email address."]));
  for (const change of [
    (pool: any) => {pool.scopeCriterionIds = ["manual-2", "manual-1"];},
    (pool: any) => {pool.scopeCriterionIds = ["manual-1"];},
    (pool: any) => {pool.scopeCriterionIds = ["mobile"];},
    (pool: any) => {pool.scopeCriterionIds = ["manual-1", "manual-1"];},
    (pool: any) => {delete pool.scopeCriterionIds;},
    (pool: any) => {pool.scopeCriterionIds = "manual-1";},
    (pool: any) => {pool.adjustedCriteria = [{criterionId: "manual-1", originalStatus: "changes_suggested", publishedStatus: "supported"}];},
    (pool: any) => {pool.entries = [];},
    (pool: any) => {pool.entries[0].originalRiskIndex = 1;},
    (pool: any) => {pool.entries[0].risk.citations[0].excerpt = "not original";},
    (pool: any) => {pool.reason = "item_status_adjusted";},
    (pool: any) => {pool.version = 3;},
  ]) {const changed = structuredClone(base); change(changed.delivery.assessment!.withheldRisks); assert.equal((await verifyEvidenceExport(changed)).consistency, "inconsistent");}
  const active = structuredClone(base); active.delivery.assessment!.risks = [risk()]; assert.equal((await verifyEvidenceExport(active)).consistency, "inconsistent");
  const legacy = structuredClone(base); (legacy.delivery.assessment!.withheldRisks as any) = {version: 1, reason: "not_withheld", scopeCriterionIds: ["manual-1"], adjustedCriteria: [], entries: []}; assert.equal((await verifyEvidenceExport(legacy)).consistency, "inconsistent");
});
test("v2 human opinions preserve report, scope, frozen acceptance and payment while enforcing both namespaces", async () => {
  const original = fixture(), baselineVisibility = await sourceVisibilityPlan(original);
  for (const role of ["buyer", "seller"] as const) for (const index of [0, 1]) {
    const q = structuredClone(original); q.status = "paid"; q.captureId = "controlled-existing-capture"; q.proof.paymentState = "captured"; q.proof.acceptedDeliveryId = q.proof.delivery!.id; q.proof.acceptedAt = at;
    const before = structuredClone(q), next = recordRiskReview(q, role, reviewInput(q, index), at);
    assert.deepEqual(q, before); assert.deepEqual(next.proof.delivery!.assessment, q.proof.delivery!.assessment); assert.equal(next.captureId, q.captureId); assert.equal(next.proof.paymentState, "captured"); assert.equal(next.proof.acceptedAt, at);
    assert.equal(next.proof.delivery!.riskReviews!.at(-1)!.riskOrigin, "withheld");
    assert.equal(recordRiskReview(next, role, reviewInput(q, index), at), next);
    const noOrigin = {...reviewInput(q, index)}; delete (noOrigin as any).riskOrigin; assert.throws(() => recordRiskReview(q, role, noOrigin, at));
    for (const change of [{riskIndex: 2}, {assessmentId: "stale"}, {deliveryId: "stale"}]) assert.throws(() => recordRiskReview(q, role, {...reviewInput(q, index), ...change}, at));
  }
  const reviewed = annotate(original); assert.deepEqual(await sourceVisibilityPlan(reviewed), baselineVisibility);
  assert.throws(() => snapshotRiskFeedbackSource(reviewed, "manual-1", {assessmentId: reviewed.proof.delivery!.assessment!.id, riskIndex: 0}));
  const malformed = fixture(); if (malformed.proof.delivery!.assessment!.withheldRisks!.version !== 2) throw Error("v2 expected"); malformed.proof.delivery!.assessment!.withheldRisks!.scopeCriterionIds = ["mobile"];
  assert.throws(() => recordRiskReview(malformed, "buyer", reviewInput(malformed), at));
});
test("v2 scope and origin survive historical acceptance and historical tampering is rejected", async () => {
  const reviewed = annotate(fixture()), d = reviewed.proof.delivery!;
  const saved = acceptDelivery(reviewed, {confirm: true, deliveryId: d.id, manualChecks: d.evidence.filter(e => e.finding === "needs_human").map(e => e.criterionId)}, at);
  const old = saved.proof.delivery!.acceptanceEvidence![0].assessment!;
  saved.proof.delivery!.assessment = {...structuredClone(old), id: "later-source-report"}; delete saved.proof.delivery!.riskReviews;
  const bundle = await createEvidenceExport(saved); assert.equal((await verifyEvidenceExport(bundle)).consistency, "consistent");
  const badScope = structuredClone(bundle); (badScope.delivery.acceptanceEvidence![0].assessment!.withheldRisks as any).scopeCriterionIds = ["mobile"];
  assert.equal((await verifyEvidenceExport(badScope)).consistency, "inconsistent");
  const badOrigin = structuredClone(bundle); delete badOrigin.delivery.acceptanceEvidence![0].riskReviews[0].riskOrigin;
  assert.equal((await verifyEvidenceExport(badOrigin)).consistency, "inconsistent");
});
