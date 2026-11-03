import {acceptDeliveryWithBasis as acceptDelivery} from "./acceptance-client.ts";
import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote } from "../lib/contracts.ts";
import { parseStaticProject, createUploadedDelivery } from "../lib/static-project.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { getLayoutFiles, recordLayoutReport } from "../lib/layout-report.ts";
import { beginRuntimeRun, finishRuntimeRun } from "../lib/runtime-actions.ts";
import { runtimeDeliveryDigest, savedRuntimePlan, RUNTIME_TARGETS } from "../lib/runtime-project.ts";
import { executeRuntimeCheck } from "../lib/runtime-runner.ts";

import { createAcceptanceEvidence } from "../lib/acceptance-evidence.ts";
import { acceptanceSnapshotReservationBytes, assertQuoteEvidenceBudget, evidenceHistoryBytes, EVIDENCE_HISTORY_BYTE_LIMIT, RUNTIME_REPORT_RESERVATION_BYTES } from "../lib/evidence-budget.ts";

const at = new Date().toISOString();
const summary = "The booking backend must retain a booking for independent readback and idempotent submission.";
const target = RUNTIME_TARGETS.find(row => row.id === "lab-fixed")!;
async function fixture(pages = 1): Promise<ProofQuote> {
  const units = summaryCoverageUnits(summary);
  const parsed = parseStaticProject({title: "Synthetic evidence budget", summary, amount: "1.00", requiredPages: ["index.html"], manualRequirements: [],
    coverage: {version: 1, sourceText: summary, confirmed: true, decisions: units.map(row => ({id: row.id, disposition: "include"}))},
    runtimeCheck: {protocol: "booking-http-v1", criterionId: units[0].id, confirmed: true}}, "en");
  const html = "<!doctype html><html><head><title>Synthetic</title></head><body>Budget fixture only.</body></html>";
  const files: Record<string, string> = {"index.html": html};
  for (let n = 1; n < pages; n++) files[`p${n}${"x".repeat(36)}.html`] = html;
  const delivery = createUploadedDelivery(files, parsed.project, "en", 1);
  delivery.backendTargetId = target.id; delivery.runtimeDeliveryDigest = await runtimeDeliveryDigest(files);
  return {id: "budget-fixture", reference: "PBP-BUDGET", workflow: "proof-v1", title: parsed.title, summary, brief: summary, clientName: "Synthetic", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100,
    lineItems: [{id: "site", description: "Synthetic", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: at,
    proof: {project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery,
      review: {deliveryId: delivery.id, reviewedAt: at, mode: "demo", summary: "Static rule check"},
      collaboration: {stage: "submitted", submission: {deliveryId: delivery.id, at, note: "Synthetic review"}, feedback: []}}};
}
function start(quote: ProofQuote) {
  return beginRuntimeRun(quote, "buyer", {deliveryId: quote.proof.delivery!.id, previousReportId: quote.proof.delivery!.runtimeReport?.id ?? null, confirm: true}, quote.proof.delivery!.runtimeDeliveryDigest!);
}
function layout(quote: ProofQuote): ProofQuote {
  const delivery = quote.proof.delivery!;
  const readings = getLayoutFiles(quote).flatMap(({file}) => [375, 900].map(viewportWidth => ({file, viewportWidth, status: "measured", clientWidth: viewportWidth, scrollWidth: viewportWidth})));
  return recordLayoutReport(quote, "buyer", {deliveryId: delivery.id, previousReportId: delivery.layoutReport?.id ?? null, readings}, at);
}
function fillAvailableLayoutSpace(quote: ProofQuote): ProofQuote {
  for (let n = 0; n < 100; n++) {
    try { quote = layout(quote); }
    catch (error) { assert.match((error as Error).message, /history is full/); return quote; }
  }
  throw new Error("Fixture did not reach the byte budget before the report count limit.");
}
async function unavailableReport(quote: ProofQuote) {
  const delivery = quote.proof.delivery!, run = delivery.runtimeRun!;
  return executeRuntimeCheck({deliveryId: delivery.id, deliveryDigest: delivery.runtimeDeliveryDigest!, runId: run.id, startedAt: run.startedAt, plan: savedRuntimePlan(quote)!, target}, {fetch: async () => { throw new Error("Synthetic no-network test"); }});
}
function consent(quote: ProofQuote) {
  const delivery = quote.proof.delivery!, report = delivery.runtimeReport!;
  return {deliveryId: delivery.id, confirm: true, manualChecks: [...new Set(delivery.evidence.filter(row => row.finding === "needs_human").map(row => row.criterionId))],
    runtimeDecision: {reportId: report.id, exceptionReason: "Buyer explicitly accepts every documented unavailable step in this synthetic fixture", acknowledgedSteps: report.steps.map(row => row.id)}};
}

test("a nearly full valid history rejects a backend run before a lease or external request", async () => {
  const quote = fillAvailableLayoutSpace(await fixture(30)), before = structuredClone(quote);
  assert.ok(evidenceHistoryBytes(quote.proof.delivery!) <= EVIDENCE_HISTORY_BYTE_LIMIT);
  let fetches = 0;
  await assert.rejects(async () => {
    const pending = start(quote), run = pending.proof.delivery!.runtimeRun!;
    await executeRuntimeCheck({deliveryId: run.deliveryId, deliveryDigest: run.deliveryDigest, runId: run.id, plan: savedRuntimePlan(pending)!, target}, {fetch: async () => { fetches++; return Response.json({}); }});
  }, /history is full/);
  assert.equal(fetches, 0); assert.deepEqual(quote, before); assert.equal(quote.proof.delivery!.runtimeRun, undefined);
});

test("observation writers retain expired-run reservations and a completed report still leaves one acceptance", async () => {
  let pending = start(await fixture(30));
  pending.proof.delivery!.runtimeRun!.expiresAt = "2000-01-01T00:00:00.000Z";
  pending = fillAvailableLayoutSpace(pending);
  const run = structuredClone(pending.proof.delivery!.runtimeRun!), savedLayouts = structuredClone(pending.proof.delivery!.layoutHistory);
  const reserve = pending.proof.delivery!.evidenceReservation!;
  assert.equal(reserve.reportBytes, RUNTIME_REPORT_RESERVATION_BYTES);
  assert.ok(evidenceHistoryBytes(pending.proof.delivery!) + reserve.reportBytes + reserve.acceptanceBytes <= EVIDENCE_HISTORY_BYTE_LIMIT);
  const completed = finishRuntimeRun(pending, await unavailableReport(pending));
  assert.equal(completed.proof.delivery!.runtimeRun, undefined); assert.equal(completed.proof.delivery!.runtimeReport!.id, run.id);
  assert.deepEqual(completed.proof.delivery!.layoutHistory, savedLayouts);
  assert.equal(completed.proof.delivery!.evidenceReservation!.reportBytes, 0);
  assert.ok(completed.proof.delivery!.evidenceReservation!.acceptanceBytes > 0);
  // Supplemental observations after completion cannot consume that acceptance room either.
  const filled = fillAvailableLayoutSpace(completed), before = structuredClone(filled);
  const unreserved = structuredClone(filled); delete unreserved.proof.delivery!.evidenceReservation;
  const candidateWithoutReserve = layout(unreserved);
  assert.ok(evidenceHistoryBytes(candidateWithoutReserve.proof.delivery!) <= EVIDENCE_HISTORY_BYTE_LIMIT);
  assert.ok(evidenceHistoryBytes(candidateWithoutReserve.proof.delivery!) + acceptanceSnapshotReservationBytes(filled) > EVIDENCE_HISTORY_BYTE_LIMIT);
  assert.throws(() => layout(filled), /history is full/);
  const accepted = acceptDelivery(filled, consent(filled), at);
  assert.deepEqual(filled, before); assert.equal(accepted.proof.delivery!.evidenceReservation, undefined);
  assert.equal(accepted.proof.delivery!.acceptanceEvidence!.length, 1);
  assert.equal(accepted.proof.delivery!.acceptanceEvidence![0].runtimeReportId, run.id);
  assert.ok(evidenceHistoryBytes(accepted.proof.delivery!) <= EVIDENCE_HISTORY_BYTE_LIMIT);
});

test("a report larger than its reserved bound cannot clear the lease or overwrite history", async () => {
  const pending = start(await fixture()), report = await unavailableReport(pending), before = structuredClone(pending);
  for (const step of report.steps) step.actual = "界".repeat(2000);
  assert.ok(Buffer.byteLength(JSON.stringify(report)) > RUNTIME_REPORT_RESERVATION_BYTES);
  assert.throws(() => finishRuntimeRun(pending, report), /exceeds its saved evidence reservation/);
  assert.deepEqual(pending, before); assert.ok(pending.proof.delivery!.runtimeRun); assert.equal(pending.proof.delivery!.runtimeReport, undefined);
});

test("the central mutation guard remeasures acceptance data changed by assessment or risk review", async () => {
  const pending = fillAvailableLayoutSpace(start(await fixture(30))), before = structuredClone(pending);
  const enlarged = structuredClone(pending);
  enlarged.proof.delivery!.assessment = {id: "synthetic-assessment", deliveryId: enlarged.proof.delivery!.id, method: "source-ai-v1", mode: "live", model: "fixture-no-network", assessedAt: at,
    items: [], risks: [], limitations: ["Synthetic source explanation ".repeat(3000)], coverage: {includedFiles: ["index.html"], truncatedFiles: [], omittedFiles: []}};
  assert.throws(() => assertQuoteEvidenceBudget(enlarged), /history is full/);
  assert.deepEqual(pending, before);
});

test("acceptance estimate covers verbatim current evidence and worst-case escaped exception text", async () => {
  let quote = start(await fixture()); quote = finishRuntimeRun(quote, await unavailableReport(quote));
  const input = consent(quote);
  const snapshot = createAcceptanceEvidence(quote, input.manualChecks, at, undefined, {...input.runtimeDecision, exceptionReason: "\u0000".repeat(500)});
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= acceptanceSnapshotReservationBytes(quote));
  const estimate = acceptanceSnapshotReservationBytes(quote);
  quote.proof.review!.summary += "界".repeat(1000) + '"quote"\\path\n\r\t\u0000'.repeat(500);
  assert.ok(acceptanceSnapshotReservationBytes(quote) >= estimate + 3000);
  const escapedSnapshot = createAcceptanceEvidence(quote, input.manualChecks, at, undefined, input.runtimeDecision);
  assert.ok(Buffer.byteLength(JSON.stringify(escapedSnapshot)) <= acceptanceSnapshotReservationBytes(quote));
  // Snapshot objects remain nested objects, not a stringified JSON payload;
  // enclosing them in the history array adds brackets, not another escape pass.
  assert.equal(Buffer.byteLength(JSON.stringify([escapedSnapshot])) - Buffer.byteLength(JSON.stringify(escapedSnapshot)), 2);
  quote = layout(quote);
  // New IDs are UUIDs, but older stored observations have no declared length
  // bound. Estimate the real retained reference instead of assuming80 bytes.
  quote.proof.delivery!.layoutReport!.id = `legacy-${"L".repeat(20_000)}`;
  const legacySnapshot = createAcceptanceEvidence(quote, input.manualChecks, at, undefined, input.runtimeDecision);
  assert.ok(Buffer.byteLength(JSON.stringify(legacySnapshot)) <= acceptanceSnapshotReservationBytes(quote));
});

test("legacy latest-only reports count toward reservation and invalid overfull histories remain unchanged", async () => {
  let quote = layout(await fixture(30));
  const measured = evidenceHistoryBytes(quote.proof.delivery!);
  delete quote.proof.delivery!.layoutHistory;
  assert.equal(evidenceHistoryBytes(quote.proof.delivery!), measured);
  quote.proof.delivery!.layoutHistory = Array.from({length: 100}, (_, n) => ({...structuredClone(quote.proof.delivery!.layoutReport!), id: `historical-${n}`}));
  const before = structuredClone(quote);
  assert.throws(() => assertQuoteEvidenceBudget(quote), /history is full/);
  assert.throws(() => start(quote), /history is full/);
  assert.deepEqual(quote, before);
});
