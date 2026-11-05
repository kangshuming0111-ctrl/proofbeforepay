import type { ProofAcceptanceEvidence, ProofDelivery, ProofQuote } from "./contracts.ts";
import { DomainError } from "./domain.ts";
import {inlineModelReportsFor,modelArchiveRefs,modelReportsFor} from "./model-report-archive.ts";

export const EVIDENCE_HISTORY_BYTE_LIMIT = 256 * 1024;
export const DELIVERY_EVIDENCE_BYTE_LIMIT = 2 * 1024 * 1024;
export const RUNTIME_REPORT_RESERVATION_BYTES = 48 * 1024;
export const EXPANDED_RUNTIME_REPORT_RESERVATION_BYTES = 96 * 1024;
export const JOURNEY_REPORT_RESERVATION_BYTES = 64 * 1024;
export const MODEL_REPORT_RESERVATION_BYTES = 32 * 1024;
const MAX_ACCEPTANCES = 20;
const MAX_PROTOCOL_STEPS = 18;
const EXPANDED_PROTOCOL_STEPS = 31;
function expanded(quote: ProofQuote): boolean { return quote.proof.project?.runtimeCheck?.protocol === "booking-http-v4"; }
export function runtimeReportReservationBytes(quote: ProofQuote): number { return expanded(quote) ? EXPANDED_RUNTIME_REPORT_RESERVATION_BYTES : RUNTIME_REPORT_RESERVATION_BYTES; }
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
    enquiry: retained(delivery, delivery.enquiryHistory, delivery.enquiryReport),
    journey: retained(delivery, delivery.journeyHistory, delivery.journeyReport),
    model: inlineModelReportsFor(delivery),
    modelArchiveRefs:modelArchiveRefs(delivery),
    business: retained(delivery, delivery.businessCheckHistory, delivery.businessChecks),
    browser: retained(delivery, delivery.browserCheckHistory, delivery.browserChecks),
    layout: retained(delivery, delivery.layoutHistory, delivery.layoutReport),
    acceptance: delivery.acceptanceEvidence ?? [],
    planning: {suggestions: delivery.journeyPlanSuggestions, adoption: delivery.journeyPlanAdoption, explanation: delivery.journeyExplanation, modelExplanation: delivery.modelExplanation},
  };
}
function reservation(delivery: ProofDelivery): Reservation | undefined {
  const value = delivery.evidenceReservation;
  if (!value) return;
  if (Object.keys(value).some(key => !["runtimeRunId", "reportBytes", "acceptanceBytes"].includes(key))
    || !Number.isSafeInteger(value.reportBytes) || value.reportBytes < 0 || value.reportBytes > EXPANDED_RUNTIME_REPORT_RESERVATION_BYTES
    || !Number.isSafeInteger(value.acceptanceBytes) || value.acceptanceBytes < 0 || value.acceptanceBytes > EVIDENCE_HISTORY_BYTE_LIMIT
    || value.reportBytes > 0 && (!value.runtimeRunId || value.runtimeRunId !== delivery.runtimeRun?.id)
    || value.reportBytes === 0 && value.runtimeRunId !== undefined) {
    throw new DomainError("The saved evidence reservation is inconsistent. Existing evidence was retained.", 409);
  }
  return value;
}

function journeyReservation(delivery: ProofDelivery) {
  const value = delivery.journeyEvidenceReservation;
  if (!value) return;
  if (Object.keys(value).some(key => !["runId", "reportBytes", "acceptanceBytes"].includes(key))
    || !Number.isSafeInteger(value.reportBytes) || value.reportBytes < 0 || value.reportBytes > JOURNEY_REPORT_RESERVATION_BYTES
    || !Number.isSafeInteger(value.acceptanceBytes) || value.acceptanceBytes < 0 || value.acceptanceBytes > EVIDENCE_HISTORY_BYTE_LIMIT
    || value.reportBytes > 0 && (!value.runId || value.runId !== delivery.journeyRun?.id)
    || value.reportBytes === 0 && value.runId !== undefined) {
    throw new DomainError("The saved journey evidence reservation is inconsistent. Existing evidence was retained.", 409);
  }
  return value;
}
function modelReservation(delivery: ProofDelivery) {
  const value=delivery.modelEvidenceReservation;
  if(!value){if(delivery.modelRun)throw new DomainError("The pending model run has no saved evidence reservation.",409);return;}
  if(Object.keys(value).some(key=>!["runId","reportBytes","acceptanceBytes"].includes(key))
    ||!Number.isSafeInteger(value.reportBytes)||value.reportBytes<0||value.reportBytes>MODEL_REPORT_RESERVATION_BYTES
    ||!Number.isSafeInteger(value.acceptanceBytes)||value.acceptanceBytes<0||value.acceptanceBytes>EVIDENCE_HISTORY_BYTE_LIMIT
    ||value.reportBytes>0&&(!value.runId||value.runId!==delivery.modelRun?.id)
    ||value.reportBytes===0&&value.runId!==undefined)throw new DomainError("The saved model evidence reservation is inconsistent.",409);
  return value;
}

function enquiryReservation(delivery:ProofDelivery){
 const value=delivery.enquiryEvidenceReservation;
 if(!value){if(delivery.enquiryRun)throw new DomainError("The pending enquiry run has no evidence reservation.",409);return;}
 if(Object.keys(value).some(key=>!["runId","reportBytes","acceptanceBytes"].includes(key))||value.runId!==delivery.enquiryRun?.id||value.reportBytes!==24576||value.acceptanceBytes!==26624)throw new DomainError("The saved enquiry evidence reservation is inconsistent.",409);
 return value;
}

export function evidenceHistoryBytes(delivery: ProofDelivery): number { return bytes(histories(delivery)); }

/** Room for one actual current acceptance, with bounded worst-case identifiers,
 * exception explanations and all protocol acknowledgements. The copied source,
 * assessment and reviews are measured verbatim rather than guessed by a ratio. */
export function acceptanceSnapshotReservationBytes(quote: ProofQuote, modelExpected = false): number {
  const delivery = quote.proof.delivery;
  if (!delivery) throw new DomainError("An evidence reservation needs the current delivery.", 409);
  const assessment = delivery.assessment;
  const estimate: ProofAcceptanceEvidence = {
    id: ID_RESERVE, deliveryId: delivery.id, at: "2099-01-01T00:00:00.000Z",
    businessReportId: reference(delivery.businessChecks?.id), businessExceptionReason: EXCEPTION_RESERVE,
    runtimeReportId: reference(delivery.runtimeReport?.id), runtimeDeliveryDigest: "a".repeat(64), runtimeTargetId: reference(delivery.runtimeReport?.target.id ?? delivery.backendTargetId),
    ...(delivery.runtimeRegistration ? {runtimeRegistration: delivery.runtimeRegistration} : {}),
    runtimeExceptionReason: EXCEPTION_RESERVE,
    runtimeAcknowledgedSteps: Array.from({length: expanded(quote) ? EXPANDED_PROTOCOL_STEPS : MAX_PROTOCOL_STEPS}, () => ID_RESERVE),
    ...(delivery.journeyPlan ? {
      journeyReportId: reference(delivery.journeyReport?.id), journeyDeliveryDigest: "a".repeat(64),
      journeyPlanDigest: "a".repeat(64), journeyRegistration: delivery.journeyReport?.registration ?? delivery.journeyRun?.registration,
      journeyExceptionReason: EXCEPTION_RESERVE, journeyAcknowledgedSteps: Array.from({length:20}, () => ID_RESERVE),
      journeyClientObservationAcknowledged: true as const,
    } : {}),
    ...(modelExpected||delivery.modelReport||delivery.modelRun?{
      modelReportId:reference(delivery.modelReport?.id??delivery.modelRun?.id),modelSpecDigest:"a".repeat(64),modelDeliveryDigest:"a".repeat(64),
      modelDecision:{reportId:reference(delivery.modelReport?.id??delivery.modelRun?.id),acknowledgeServerCheck:true as const,exceptionReason:EXCEPTION_RESERVE},
    }:{}),
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
  for (const [value, limit] of [[delivery.journeyPlanSuggestions, 32 * 1024], [delivery.journeyPlanAdoption, 32 * 1024], [delivery.journeyExplanation, 16 * 1024], [delivery.modelExplanation, 16 * 1024]] as const) {
    if (value !== undefined && bytes(value) > limit) throw new DomainError("The saved journey planning or explanation record exceeds its bounded evidence allowance.", 409);
  }
  const saved = reservation(delivery), journey = journeyReservation(delivery), model=modelReservation(delivery),enquiry=enquiryReservation(delivery);
  const reportReserve = (saved?.reportBytes ?? 0) + (journey?.reportBytes ?? 0)+(model?.reportBytes??0)+(enquiry?.reportBytes??0);
  const acceptanceReserve = Math.max(acceptanceBytes ?? 0, saved?.acceptanceBytes ?? 0, journey?.acceptanceBytes ?? 0,model?.acceptanceBytes??0,enquiry?.acceptanceBytes??0);
  const retainedHistory = histories(delivery);
  modelReportsFor(delivery);
  if(retainedHistory.model.length>4||retainedHistory.model.some(report=>bytes(report)>MODEL_REPORT_RESERVATION_BYTES))throw new DomainError("Model reports exceed their four-record or 32 KiB bounds.",409);
  if (bytes(retainedHistory) + reportReserve + acceptanceReserve > EVIDENCE_HISTORY_BYTE_LIMIT) full();
  // A runtime report is also stored in the latest slot. Materialize legacy
  // histories here so reserving them cannot fail only after a network write.
  const normalized = {...delivery, runtimeHistory: retainedHistory.runtime, enquiryHistory:retainedHistory.enquiry,journeyHistory: retainedHistory.journey, modelHistory:retainedHistory.model,businessCheckHistory: retainedHistory.business,
    browserCheckHistory: retainedHistory.browser, layoutHistory: retainedHistory.layout, acceptanceEvidence: retainedHistory.acceptance};
  if (bytes(normalized) + 2 * reportReserve + acceptanceReserve > DELIVERY_EVIDENCE_BYTE_LIMIT) full();
}

/** The same reservation arithmetic as check(), without creating a run lease.
 * It measures the hydrated envelope separately from the small persisted window. */
export function modelEvidenceBudgetProjection(quote:ProofQuote){
  const delivery=quote.proof.delivery;if(!delivery)throw new DomainError("Model storage needs a saved delivery.",409);
  const retainedHistory=histories(delivery),saved=reservation(delivery),journey=journeyReservation(delivery),model=modelReservation(delivery),enquiry=enquiryReservation(delivery);
  const acceptanceBytes=Math.max(needsAcceptanceSnapshot(quote)?acceptanceSnapshotReservationBytes(quote,true):0,saved?.acceptanceBytes??0,journey?.acceptanceBytes??0,model?.acceptanceBytes??0,enquiry?.acceptanceBytes??0);
  const reportBytes=MODEL_REPORT_RESERVATION_BYTES+(saved?.reportBytes??0)+(journey?.reportBytes??0)+(model?.reportBytes??0)+(enquiry?.reportBytes??0);
  const normalized={...delivery,runtimeHistory:retainedHistory.runtime,enquiryHistory:retainedHistory.enquiry,journeyHistory:retainedHistory.journey,modelHistory:retainedHistory.model,businessCheckHistory:retainedHistory.business,browserCheckHistory:retainedHistory.browser,layoutHistory:retainedHistory.layout,acceptanceEvidence:retainedHistory.acceptance};
  const inlineEvidenceBytes=bytes(retainedHistory),hydratedDeliveryBytes=bytes(normalized);
  return{inlineEvidenceBytes,hydratedDeliveryBytes,acceptanceBytes,projectedInlineEvidenceBytes:inlineEvidenceBytes+reportBytes+acceptanceBytes,projectedHydratedDeliveryBytes:hydratedDeliveryBytes+2*reportBytes+acceptanceBytes,acceptanceRoom:!needsAcceptanceSnapshot(quote)||(delivery.acceptanceEvidence?.length??0)<MAX_ACCEPTANCES};
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
  const journey = journeyReservation(delivery);
  const model=modelReservation(delivery),enquiry=enquiryReservation(delivery);
  const acceptance = (saved || journey || model || enquiry) && needsAcceptanceSnapshot(quote)
    ? Math.max(saved?.acceptanceBytes ?? 0, journey?.acceptanceBytes ?? 0,model?.acceptanceBytes??0,enquiry?.acceptanceBytes??0, acceptanceSnapshotReservationBytes(quote)) : Math.max(saved?.acceptanceBytes ?? 0, journey?.acceptanceBytes ?? 0,model?.acceptanceBytes??0,enquiry?.acceptanceBytes??0);
  check(delivery, acceptance);
}

/** Called before the run lease CAS and thus before any external HTTP request. */
export function reserveRuntimeEvidence(quote: ProofQuote, runId: string): ProofQuote {
  const delivery = quote.proof.delivery;
  if (!delivery || delivery.runtimeRun?.id !== runId) throw new DomainError("Reserve evidence only for the saved backend run identity.", 409);
  if (delivery.journeyRun||delivery.modelRun||delivery.transferCompetitionRun||delivery.enquiryRun) throw new DomainError("Finish the current journey or model run before another backend test.", 409);
  if (needsAcceptanceSnapshot(quote) && (delivery.acceptanceEvidence?.length ?? 0) >= MAX_ACCEPTANCES) full();
  const next = structuredClone(quote);
  next.proof.delivery!.evidenceReservation = {runtimeRunId: runId, reportBytes: runtimeReportReservationBytes(quote),
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
  if (!saved || saved.runtimeRunId !== runId || saved.reportBytes !== runtimeReportReservationBytes(quote) || bytes(report) > saved.reportBytes) {
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
  const journey = journeyReservation(delivery);
  const model=modelReservation(delivery);
  if (saved?.reportBytes || delivery.runtimeRun || journey?.reportBytes || delivery.journeyRun||model?.reportBytes||delivery.modelRun||delivery.transferCompetitionRun||delivery.enquiryRun) throw new DomainError("Finish the pending evidence run before accepting its evidence.", 409);
  const next = structuredClone(delivery);
  delete next.evidenceReservation;
  delete next.journeyEvidenceReservation;
  delete next.modelEvidenceReservation;
  delete next.enquiryEvidenceReservation;
  assertDeliveryEvidenceBudget(next);
  return next;
}

/** Reserve before persisting the run ticket, which precedes any seller write. */
export function reserveJourneyEvidence(quote: ProofQuote, runId: string): ProofQuote {
  const delivery = quote.proof.delivery;
  if (!delivery || delivery.journeyRun?.id !== runId || delivery.runtimeRun||delivery.modelRun||delivery.transferCompetitionRun||delivery.enquiryRun) throw new DomainError("Reserve evidence only for the current exclusive journey run.", 409);
  if (needsAcceptanceSnapshot(quote) && (delivery.acceptanceEvidence?.length ?? 0) >= MAX_ACCEPTANCES) full();
  const next = structuredClone(quote);
  next.proof.delivery!.journeyEvidenceReservation = {runId, reportBytes: JOURNEY_REPORT_RESERVATION_BYTES,
    acceptanceBytes: needsAcceptanceSnapshot(quote) ? acceptanceSnapshotReservationBytes(quote) : 0};
  assertQuoteEvidenceBudget(next);
  return next;
}

export function finishJourneyEvidenceReservation(quote: ProofQuote, runId: string, report: unknown): ProofQuote {
  const delivery = quote.proof.delivery, saved = delivery?.journeyEvidenceReservation;
  if (!delivery || !saved || saved.runId !== runId || saved.reportBytes !== JOURNEY_REPORT_RESERVATION_BYTES || bytes(report) > saved.reportBytes) {
    throw new DomainError("The journey report exceeds its saved reservation. Prior evidence and the pending run were retained.", 409);
  }
  const next = structuredClone(quote);
  next.proof.delivery!.journeyEvidenceReservation = {reportBytes: 0,
    acceptanceBytes: needsAcceptanceSnapshot(quote) ? Math.max(saved.acceptanceBytes, acceptanceSnapshotReservationBytes(quote)) : 0};
  assertQuoteEvidenceBudget(next);
  return next;
}

export function reserveModelEvidence(quote:ProofQuote,runId:string):ProofQuote{
  const delivery=quote.proof.delivery;if(!delivery||delivery.modelRun?.id!==runId||delivery.runtimeRun||delivery.journeyRun||delivery.transferCompetitionRun||delivery.enquiryRun)throw new DomainError("Reserve evidence only for the current exclusive model run.",409);
  if(needsAcceptanceSnapshot(quote)&&(delivery.acceptanceEvidence?.length??0)>=MAX_ACCEPTANCES)full();
  const next=structuredClone(quote);next.proof.delivery!.modelEvidenceReservation={runId,reportBytes:MODEL_REPORT_RESERVATION_BYTES,acceptanceBytes:needsAcceptanceSnapshot(quote)?acceptanceSnapshotReservationBytes(quote):0};assertQuoteEvidenceBudget(next);return next;
}
export function finishModelEvidenceReservation(quote:ProofQuote,runId:string,report:unknown):ProofQuote{
  const delivery=quote.proof.delivery,saved=delivery?.modelEvidenceReservation;
  if(!delivery||!saved||saved.runId!==runId||saved.reportBytes!==MODEL_REPORT_RESERVATION_BYTES||bytes(report)>saved.reportBytes)throw new DomainError("The model report exceeds its saved reservation. Existing evidence and lease were retained.",409);
  const next=structuredClone(quote);next.proof.delivery!.modelEvidenceReservation={reportBytes:0,acceptanceBytes:needsAcceptanceSnapshot(quote)?Math.max(saved.acceptanceBytes,acceptanceSnapshotReservationBytes(quote)):0};assertQuoteEvidenceBudget(next);return next;
}
