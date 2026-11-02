import type { ProofAcceptanceEvidence, ProofDelivery, ProofQuote } from "./contracts.ts";
import { DomainError } from "./domain.ts";

export const EVIDENCE_HISTORY_BYTE_LIMIT = 256 * 1024;
export const DELIVERY_EVIDENCE_BYTE_LIMIT = 2 * 1024 * 1024;
export const RUNTIME_REPORT_RESERVATION_BYTES = 48 * 1024;
const MAX_ACCEPTANCES = 20;
const MAX_PROTOCOL_STEPS = 18;
const ID_RESERVE = "r".repeat(80);
const EXCEPTION_RESERVE = "\u0000".repeat(500); // JSON escapes use the maximum six bytes per UTF-16 character.

type Reservation = NonNullable<ProofDelivery["evidenceReservation"]>;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function reference(value: string | undefined): string { return value && bytes(value) > bytes(ID_RESERVE) ? value : ID_RESERVE; }
function full(): never {
  throw new DomainError("This delivery's saved evidence history is full. Existing records were retained; reserve space by starting a new delivery version before another backend run.", 409);
}

/** Count each genuinely saved report once, including legacy latest-only records
 * that must be retained in history when acceptance is saved. No report is evicted. */
function retained<T extends {id: string; deliveryId: string}>(delivery: ProofDelivery, history: T[] | undefined, latest?: T): T[] {
  if (history !== undefined && !Array.isArray(history)) throw new DomainError("The saved evidence history is invalid.", 409);
  const result: T[] = [];
  for (const item of [...(history ?? []), ...(latest ? [latest] : [])]) {
    if (!item || item.deliveryId !== delivery.id || typeof item.id !== "string" || !item.id) throw new DomainError("The saved evidence history does not match this delivery.", 409);
    const prior = result.find(row => row.id === item.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item)) throw new DomainError("A saved evidence report cannot be rewritten.", 409);
    if (!prior) result.push(item);
  }
  return result;
}
function histories(delivery: ProofDelivery) {
  return {
    runtime: retained(delivery, delivery.runtimeHistory, delivery.runtimeReport),
    business: retained(delivery, delivery.businessCheckHistory, delivery.businessChecks),
    browser: retained(delivery, delivery.browserCheckHistory, delivery.browserChecks),
    layout: retained(delivery, delivery.layoutHistory, delivery.layoutReport),
    acceptance: delivery.acceptanceEvidence ?? [],
  };
}
function reservation(delivery: ProofDelivery): Reservation | undefined {
  const value = delivery.evidenceReservation;
  if (!value) return;
  if (Object.keys(value).some(key => !["runtimeRunId", "reportBytes", "acceptanceBytes"].includes(key))
    || !Number.isSafeInteger(value.reportBytes) || value.reportBytes < 0 || value.reportBytes > RUNTIME_REPORT_RESERVATION_BYTES
    || !Number.isSafeInteger(value.acceptanceBytes) || value.acceptanceBytes < 0 || value.acceptanceBytes > EVIDENCE_HISTORY_BYTE_LIMIT
    || value.reportBytes > 0 && (!value.runtimeRunId || value.runtimeRunId !== delivery.runtimeRun?.id)
    || value.reportBytes === 0 && value.runtimeRunId !== undefined) {
    throw new DomainError("The saved evidence reservation is inconsistent. Existing evidence was retained.", 409);
  }
  return value;
}

export function evidenceHistoryBytes(delivery: ProofDelivery): number { return bytes(histories(delivery)); }

/** Room for one actual current acceptance, with bounded worst-case identifiers,
 * exception explanations and all protocol acknowledgements. The copied source,
 * assessment and reviews are measured verbatim rather than guessed by a ratio. */
export function acceptanceSnapshotReservationBytes(quote: ProofQuote): number {
  const delivery = quote.proof.delivery;
  if (!delivery) throw new DomainError("An evidence reservation needs the current delivery.", 409);
  const assessment = delivery.assessment;
  const estimate: ProofAcceptanceEvidence = {
    id: ID_RESERVE, deliveryId: delivery.id, at: "2099-01-01T00:00:00.000Z",
    businessReportId: reference(delivery.businessChecks?.id), businessExceptionReason: EXCEPTION_RESERVE,
    runtimeReportId: reference(delivery.runtimeReport?.id), runtimeDeliveryDigest: "a".repeat(64), runtimeTargetId: reference(delivery.runtimeReport?.target.id ?? delivery.backendTargetId),
    ...(delivery.runtimeRegistration ? {runtimeRegistration: delivery.runtimeRegistration} : {}),
    runtimeExceptionReason: EXCEPTION_RESERVE,
    runtimeAcknowledgedSteps: Array.from({length: MAX_PROTOCOL_STEPS}, () => ID_RESERVE),
    browserReportId: reference(delivery.browserChecks?.id), layoutReportId: reference(delivery.layoutReport?.id), assessmentId: reference(assessment?.id),
    manualChecks: [...new Set(delivery.evidence.filter(item => item.finding === "needs_human").map(item => item.criterionId))],
    criteria: quote.proof.criteria, evidence: delivery.evidence,
    ...(quote.proof.review?.deliveryId === delivery.id ? {review: quote.proof.review} : {}),
    ...(assessment ? {assessment} : {}),
    riskReviews: (delivery.riskReviews ?? []).filter(item => item.deliveryId === delivery.id && item.assessmentId === assessment?.id),
  };
  return bytes(estimate) + 64; // Array comma/brackets and JSON-property overhead when first materialized.
}
function needsAcceptanceSnapshot(quote: ProofQuote): boolean {
  const delivery = quote.proof.delivery;
  const id = quote.proof.acceptedEvidenceSnapshotId ?? quote.proof.collaboration?.acceptance?.evidenceSnapshotId;
  return !id || !delivery?.acceptanceEvidence?.some(row => row.id === id && row.deliveryId === delivery.id);
}
function check(delivery: ProofDelivery, acceptanceBytes?: number): void {
  const saved = reservation(delivery), reportReserve = saved?.reportBytes ?? 0;
  const acceptanceReserve = acceptanceBytes ?? saved?.acceptanceBytes ?? 0;
  const retainedHistory = histories(delivery);
  if (bytes(retainedHistory) + reportReserve + acceptanceReserve > EVIDENCE_HISTORY_BYTE_LIMIT) full();
  // A runtime report is also stored in the latest slot. Materialize legacy
  // histories here so reserving them cannot fail only after a network write.
  const normalized = {...delivery, runtimeHistory: retainedHistory.runtime, businessCheckHistory: retainedHistory.business,
    browserCheckHistory: retainedHistory.browser, layoutHistory: retainedHistory.layout, acceptanceEvidence: retainedHistory.acceptance};
  if (bytes(normalized) + 2 * reportReserve + acceptanceReserve > DELIVERY_EVIDENCE_BYTE_LIMIT) full();
}

/** Every observation writer uses this even when a run lease has expired. Only
 * finishing that same run can consume the report portion of its reservation. */
export function assertDeliveryEvidenceBudget(delivery: ProofDelivery): void { check(delivery); }

/** Storage calls this on every mutation, including assessment and risk-review
 * writes that change the contents of the next acceptance snapshot. */
export function assertQuoteEvidenceBudget(quote: ProofQuote): void {
  const delivery = quote.proof.delivery;
  if (!delivery) return;
  const saved = reservation(delivery);
  const acceptance = saved && needsAcceptanceSnapshot(quote)
    ? Math.max(saved.acceptanceBytes, acceptanceSnapshotReservationBytes(quote)) : saved?.acceptanceBytes;
  check(delivery, acceptance);
}

/** Called before the run lease CAS and thus before any external HTTP request. */
export function reserveRuntimeEvidence(quote: ProofQuote, runId: string): ProofQuote {
  const delivery = quote.proof.delivery;
  if (!delivery || delivery.runtimeRun?.id !== runId) throw new DomainError("Reserve evidence only for the saved backend run identity.", 409);
  if (needsAcceptanceSnapshot(quote) && (delivery.acceptanceEvidence?.length ?? 0) >= MAX_ACCEPTANCES) full();
  const next = structuredClone(quote);
  next.proof.delivery!.evidenceReservation = {runtimeRunId: runId, reportBytes: RUNTIME_REPORT_RESERVATION_BYTES,
    acceptanceBytes: needsAcceptanceSnapshot(quote) ? acceptanceSnapshotReservationBytes(quote) : 0};
  assertQuoteEvidenceBudget(next);
  return next;
}

/** The caller has already validated the report and appended its immutable
 * history. Consume only that run's bounded report allowance; retain acceptance
 * room for subsequent observations and release it at explicit acceptance. */
export function finishRuntimeEvidenceReservation(quote: ProofQuote, runId: string, report: unknown): ProofQuote {
  const delivery = quote.proof.delivery;
  if (!delivery) throw new DomainError("The backend evidence reservation is unavailable.", 409);
  // The run has just been removed on the cloned completion; inspect its saved
  // reservation without the pending-lease consistency check used by writers.
  const saved = delivery.evidenceReservation;
  if (!saved || saved.runtimeRunId !== runId || saved.reportBytes !== RUNTIME_REPORT_RESERVATION_BYTES || bytes(report) > saved.reportBytes) {
    throw new DomainError("The backend report exceeds its saved evidence reservation. Prior evidence and the pending run were retained.", 409);
  }
  const next = structuredClone(quote);
  next.proof.delivery!.evidenceReservation = {reportBytes: 0,
    acceptanceBytes: needsAcceptanceSnapshot(quote) ? Math.max(saved.acceptanceBytes, acceptanceSnapshotReservationBytes(quote)) : 0};
  assertQuoteEvidenceBudget(next);
  return next;
}

export function consumeAcceptanceReservation(delivery: ProofDelivery): ProofDelivery {
  const saved = reservation(delivery);
  if (saved?.reportBytes || delivery.runtimeRun) throw new DomainError("Finish the pending backend run before accepting its evidence.", 409);
  const next = structuredClone(delivery);
  delete next.evidenceReservation;
  assertDeliveryEvidenceBudget(next);
  return next;
}
