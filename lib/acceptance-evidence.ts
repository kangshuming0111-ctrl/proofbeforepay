import type { ProofAcceptanceEvidence, ProofBrowserCheckReport, ProofBusinessCheckReport, ProofDelivery, ProofLayoutReport, ProofQuote } from "./contracts.ts";
import { validateBusinessDecision, type BusinessDecision } from "./business-decision.ts";
import { getBusinessCheckPlan } from "./business-checks.ts";
import { DomainError } from "./domain.ts";
import { savedRuntimePlan,validateRuntimeDecision,runtimeReportsFor } from "./runtime-project.ts";
import { assertDeliveryEvidenceBudget, consumeAcceptanceReservation } from "./evidence-budget.ts";
import {savedProjectJourneyPlan, projectJourneyReportsFor, validateProjectJourneyDecision, evaluateStoredProjectJourneyReport} from "./project-journey.ts";
import {sameRuntimeRegistration} from "./runtime-registration.ts";
export { EVIDENCE_HISTORY_BYTE_LIMIT } from "./evidence-budget.ts";

export const OBSERVATION_HISTORY_LIMIT = 100;
export const ACCEPTANCE_HISTORY_LIMIT = 20;

type Observation = ProofBrowserCheckReport | ProofLayoutReport | ProofBusinessCheckReport;
function sameRegistration(left: unknown, right: unknown): boolean {
  return left === undefined && right === undefined || sameRuntimeRegistration(left, right);
}
/** Include only genuinely saved reports. A legacy latest reading is the first
 * known report, never evidence of earlier runs or of what a past buyer saw. */
function reports<T extends Observation>(delivery: ProofDelivery, history: T[] | undefined, latest: T | undefined): T[] {
  if (history !== undefined && !Array.isArray(history)) throw new DomainError("The saved observation history is invalid.", 409);
  const result: T[] = [];
  for (const report of [...(history ?? []), ...(latest ? [latest] : [])]) {
    if (!report || report.deliveryId !== delivery.id || typeof report.id !== "string" || !report.id) throw new DomainError("The saved observation history does not match this delivery.", 409);
    const previous = result.find(item => item.id === report.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(report)) throw new DomainError("A saved report identifier has conflicting observation contents.", 409);
    if (!previous) result.push(report);
  }
  if (result.length > OBSERVATION_HISTORY_LIMIT) throw new DomainError("This delivery has reached its observation history limit. Existing reports are retained.", 409);
  return result;
}

export function browserReportsFor(delivery: ProofDelivery): ProofBrowserCheckReport[] {
  return structuredClone(reports(delivery, delivery.browserCheckHistory, delivery.browserChecks));
}
export function layoutReportsFor(delivery: ProofDelivery): ProofLayoutReport[] {
  return structuredClone(reports(delivery, delivery.layoutHistory, delivery.layoutReport));
}

export function businessReportsFor(delivery: ProofDelivery): ProofBusinessCheckReport[] {
  return structuredClone(reports(delivery, delivery.businessCheckHistory, delivery.businessChecks));
}
export function withBusinessReport(delivery: ProofDelivery, report: ProofBusinessCheckReport): ProofDelivery {
  const next = structuredClone(delivery);
  if (businessReportsFor(delivery).some(previous => previous.id === report.id)) throw new DomainError("A saved business-content report cannot be replaced or replayed as a new run.", 409);
  next.businessCheckHistory = reports(delivery, businessReportsFor(delivery), report);
  next.businessChecks = structuredClone(report);
  return boundedHistory(next);
}

function boundedHistory(delivery: ProofDelivery): ProofDelivery {
  assertDeliveryEvidenceBudget(delivery);
  return delivery;
}

export function withBrowserReport(delivery: ProofDelivery, report: ProofBrowserCheckReport): ProofDelivery {
  const next = structuredClone(delivery);
  if (browserReportsFor(delivery).some(previous => previous.id === report.id)) throw new DomainError("A saved browser report cannot be replaced or replayed as a new run.", 409);
  next.browserCheckHistory = reports(delivery, browserReportsFor(delivery), report);
  next.browserChecks = structuredClone(report);
  return boundedHistory(next);
}

export function withLayoutReport(delivery: ProofDelivery, report: ProofLayoutReport): ProofDelivery {
  const next = structuredClone(delivery);
  if (layoutReportsFor(delivery).some(previous => previous.id === report.id)) throw new DomainError("A saved layout report cannot be replaced or replayed as a new run.", 409);
  next.layoutHistory = reports(delivery, layoutReportsFor(delivery), report);
  next.layoutReport = structuredClone(report);
  return boundedHistory(next);
}

/** Freeze the evidence that actually exists at this explicit acceptance. The
 * references point to retained reports; absent older evidence stays absent. */
export function createAcceptanceEvidence(quote: ProofQuote, manualChecks: string[], at: string, businessDecision?: BusinessDecision, runtimeInput?: unknown, journeyInput?: unknown): ProofAcceptanceEvidence {
  const delivery = quote.proof.delivery;
  if (!delivery || !Number.isFinite(Date.parse(at))) throw new DomainError("Acceptance evidence needs the exact current delivery and a valid time.", 409);
  const decision = validateBusinessDecision(quote, businessDecision);
  const runtimeDecision=validateRuntimeDecision(quote,runtimeInput),runtime=delivery.runtimeReport;
  const journeyDecision = validateProjectJourneyDecision(quote, journeyInput), journey = delivery.journeyReport;
  const browser = delivery.browserChecks;
  const layout = delivery.layoutReport;
  const assessment = delivery.assessment;
  if (browser && browser.deliveryId !== delivery.id || layout && layout.deliveryId !== delivery.id || assessment && assessment.deliveryId !== delivery.id) throw new DomainError("Acceptance evidence contains a report from a different delivery.", 409);
  return structuredClone({id: crypto.randomUUID(), deliveryId: delivery.id, at,
    businessReportId: decision?.reportId ?? null, ...(decision?.exceptionReason ? {businessExceptionReason: decision.exceptionReason} : {}),
    ...(runtimeDecision && runtime ? {runtimeReportId:runtimeDecision.reportId,runtimeDeliveryDigest:runtime.deliveryDigest,runtimeTargetId:runtime.target.id,...(runtime.target.registration?{runtimeRegistration:runtime.target.registration}:{}),...(runtimeDecision.exceptionReason?{runtimeExceptionReason:runtimeDecision.exceptionReason,runtimeAcknowledgedSteps:runtimeDecision.acknowledgedSteps}:{})} : {}),
    ...(journeyDecision && journey ? {journeyReportId:journey.id, journeyDeliveryDigest:journey.deliveryDigest,
      journeyPlanDigest:journey.planDigest, journeyRegistration:journey.registration, journeyClientObservationAcknowledged:true as const,
      ...(journeyDecision.exceptionReason ? {journeyExceptionReason:journeyDecision.exceptionReason,journeyAcknowledgedSteps:journeyDecision.acknowledgedSteps}: {})} : {}),
    browserReportId: browser?.id ?? null, layoutReportId: layout?.id ?? null, assessmentId: assessment?.id ?? null,
    manualChecks, criteria: quote.proof.criteria, evidence: delivery.evidence,
    ...(quote.proof.review?.deliveryId === delivery.id ? {review: quote.proof.review} : {}),
    ...(assessment ? {assessment} : {}),
    riskReviews: (delivery.riskReviews ?? []).filter(review => review.deliveryId === delivery.id && review.assessmentId === assessment?.id),
  });
}

export function withAcceptanceEvidence(delivery: ProofDelivery, snapshot: ProofAcceptanceEvidence): ProofDelivery {
  if (snapshot.deliveryId !== delivery.id) throw new DomainError("Acceptance evidence must use this delivery.", 409);
  const humanChecks = [...new Set(delivery.evidence.filter(item => item.finding === "needs_human").map(item => item.criterionId))];
  const currentReviews = (delivery.riskReviews ?? []).filter(item => item.deliveryId === delivery.id && item.assessmentId === delivery.assessment?.id);
  const business = delivery.businessChecks;
  const runtime=delivery.runtimeReport;
  const journey=delivery.journeyReport;
  if ((snapshot.journeyReportId ?? null) !== (journey?.id ?? null)
    || journey && (snapshot.journeyDeliveryDigest!==journey.deliveryDigest || snapshot.journeyPlanDigest!==journey.planDigest
      || snapshot.journeyClientObservationAcknowledged!==true || JSON.stringify(snapshot.journeyRegistration)!==JSON.stringify(journey.registration))) {
    throw new DomainError("Acceptance must retain the exact journey evidence and its observation limits.",409);
  }
  if (journey) {
    const exceptions=evaluateStoredProjectJourneyReport(journey).steps.filter(step=>step.outcome!=="observed");
    if (exceptions.length && ((snapshot.journeyExceptionReason?.trim().length ?? 0)<10 || exceptions.some(step=>!snapshot.journeyAcknowledgedSteps?.includes(step.id)))) throw new DomainError("Acknowledge every journey exception before acceptance.",409);
  }
  if((snapshot.runtimeReportId??null)!==(runtime?.id??null)||!sameRegistration(snapshot.runtimeRegistration,runtime?.target.registration)||runtime && (snapshot.runtimeDeliveryDigest!==runtime.deliveryDigest || snapshot.runtimeTargetId!==runtime.target.id || runtime.steps.some(step=>step.outcome!=="observed") && ((snapshot.runtimeExceptionReason?.trim().length??0)<10 || runtime.steps.filter(step=>step.outcome!=="observed").some(step=>!snapshot.runtimeAcknowledgedSteps?.includes(step.id)))))throw new DomainError("Acceptance must retain the exact backend evidence and explicit exceptions.",409);
  if ((snapshot.businessReportId ?? null) !== (business?.id ?? null)
    || (business && (business.summary.issues || business.summary.unavailable) && (snapshot.businessExceptionReason?.trim().length ?? 0) < 10)
    || snapshot.businessExceptionReason !== undefined && (typeof snapshot.businessExceptionReason !== "string" || snapshot.businessExceptionReason.trim().length > 500)
    || snapshot.browserReportId !== (delivery.browserChecks?.id ?? null) || snapshot.layoutReportId !== (delivery.layoutReport?.id ?? null)
    || snapshot.assessmentId !== (delivery.assessment?.id ?? null) || snapshot.assessmentId !== (snapshot.assessment?.id ?? null)
    || JSON.stringify(snapshot.evidence) !== JSON.stringify(delivery.evidence)
    || JSON.stringify(snapshot.assessment) !== JSON.stringify(delivery.assessment)
    || JSON.stringify(snapshot.riskReviews) !== JSON.stringify(currentReviews)
    || JSON.stringify(snapshot.manualChecks) !== JSON.stringify(humanChecks)
    || !snapshot.criteria.length || new Set(snapshot.criteria.map(item => item.id)).size !== snapshot.criteria.length
    || snapshot.criteria.some(item => !delivery.evidence.some(entry => entry.criterionId === item.id))) {
    throw new DomainError("New acceptance evidence must match the current delivery's reports, findings and human checks.", 409);
  }
  const next = structuredClone(delivery);
  const existing = next.acceptanceEvidence ?? [];
  if (!Array.isArray(existing) || existing.some(item => item.deliveryId !== delivery.id || !item.id)) throw new DomainError("The saved acceptance evidence history is invalid.", 409);
  if (existing.length >= ACCEPTANCE_HISTORY_LIMIT || existing.some(item => item.id === snapshot.id)) throw new DomainError("This delivery has reached its acceptance evidence limit, or that record already exists. Existing records were retained.", 409);
  // Preserve the genuinely saved latest observations even on the first upgrade
  // save. No acceptance snapshot is synthesized for an earlier acceptance.
  next.businessCheckHistory = businessReportsFor(delivery);
  next.browserCheckHistory = browserReportsFor(delivery);
  next.layoutHistory = layoutReportsFor(delivery);
  if(runtime) next.runtimeHistory=runtimeReportsFor(delivery);
  if(journey) next.journeyHistory=projectJourneyReportsFor(delivery);
  if (snapshot.businessReportId && !next.businessCheckHistory.some(report => report.id === snapshot.businessReportId)
    || snapshot.browserReportId && !next.browserCheckHistory.some(report => report.id === snapshot.browserReportId)
    || snapshot.layoutReportId && !next.layoutHistory.some(report => report.id === snapshot.layoutReportId)) throw new DomainError("Acceptance observations must be retained before they can be referenced.", 409);
  next.acceptanceEvidence = [...existing, structuredClone(snapshot)];
  return boundedHistory(consumeAcceptanceReservation(next));
}

/** Validate a stored binding without requiring it to equal the latest run.
 * A later supplemental report is intentionally allowed to differ. */
export function assertAcceptedEvidenceReference(quote: ProofQuote): void {
  const delivery = quote.proof.delivery;
  const collaborationId = quote.proof.collaboration?.acceptance?.evidenceSnapshotId;
  const financialId = quote.proof.acceptedEvidenceSnapshotId;
  if (collaborationId && financialId && collaborationId !== financialId) throw new DomainError("The payment consent and delivery acceptance reference different evidence snapshots.", 409);
  const id = financialId ?? collaborationId;
  if (!id && (getBusinessCheckPlan(quote).length || savedRuntimePlan(quote) || savedProjectJourneyPlan(quote))) throw new DomainError("The accepted evidence snapshot is unavailable.", 409);
  if (!id) return; // Pre-upgrade acceptance remains explicitly unknown.
  const snapshot = delivery?.acceptanceEvidence?.find(item => item.id === id && item.deliveryId === delivery.id);
  if (!delivery || !snapshot) throw new DomainError("The saved acceptance evidence snapshot could not be found. Refresh before confirming payment.", 409);
  if(savedRuntimePlan(quote)) {
    const runtime=runtimeReportsFor(delivery).find(row=>row.id===snapshot.runtimeReportId);
    if(!runtime || runtime.deliveryDigest!==snapshot.runtimeDeliveryDigest || runtime.target.id!==snapshot.runtimeTargetId || runtime.deliveryDigest!==delivery.runtimeDeliveryDigest || !sameRegistration(snapshot.runtimeRegistration,runtime.target.registration) || !sameRegistration(delivery.runtimeRegistration,runtime.target.registration))throw new DomainError("The backend evidence accepted for payment is unavailable or has changed.",409);
  }
  if (savedProjectJourneyPlan(quote)) {
    const report=projectJourneyReportsFor(delivery).find(row=>row.id===snapshot.journeyReportId);
    if (!report || report.deliveryDigest!==snapshot.journeyDeliveryDigest || report.planDigest!==snapshot.journeyPlanDigest
      || report.planDigest!==savedProjectJourneyPlan(quote)!.planDigest || snapshot.journeyClientObservationAcknowledged!==true
      || JSON.stringify(report.registration)!==JSON.stringify(snapshot.journeyRegistration)) throw new DomainError("The journey evidence accepted for payment is missing or has changed.",409);
  }
  if (getBusinessCheckPlan(quote).length && !snapshot.businessReportId
    || snapshot.businessReportId && !businessReportsFor(delivery).some(item => item.id === snapshot.businessReportId)
    || snapshot.browserReportId && !browserReportsFor(delivery).some(item => item.id === snapshot.browserReportId)
    || snapshot.layoutReportId && !layoutReportsFor(delivery).some(item => item.id === snapshot.layoutReportId)
    || snapshot.assessmentId !== (snapshot.assessment?.id ?? null)) throw new DomainError("A report referenced by the saved acceptance evidence is unavailable.", 409);
}

/** Called only after normal financial-domain validation and before the provider.
 * A collaborative acceptance keeps its earlier snapshot, even if a later
 * browser run exists. Legacy collaborative acceptances stay explicitly unknown. */
export function recordCaptureConsent(quote: ProofQuote, manualChecks: string[], at: string, businessDecision?: BusinessDecision,runtimeInput?:unknown, journeyInput?:unknown): ProofQuote {
  const delivery = quote.proof.delivery;
  if (!delivery || !Number.isFinite(Date.parse(at))) throw new DomainError("Capture consent needs the current delivery and a valid time.", 409);
  if (quote.proof.paymentOperation) throw new DomainError("Capture consent was already saved; reuse the existing pending operation.", 409);
  if (quote.proof.collaboration || quote.proof.acceptedEvidenceSnapshotId) assertAcceptedEvidenceReference(quote);
  const next = structuredClone(quote);
  let snapshotId: string | undefined;
  if (quote.proof.collaboration) {
    const acceptance = quote.proof.collaboration.acceptance;
    if (acceptance?.deliveryId !== delivery.id) throw new DomainError("Accept this exact delivery before recording payment consent.", 409);
    snapshotId = acceptance.evidenceSnapshotId;
    if (snapshotId && !(delivery.acceptanceEvidence ?? []).some(item => item.id === snapshotId && item.deliveryId === delivery.id)) throw new DomainError("The accepted evidence snapshot could not be found. Refresh before confirming payment.", 409);
  } else {
    if (quote.proof.acceptedEvidenceSnapshotId) throw new DomainError("A saved capture consent has no pending operation. Reconcile this payment before recording another consent.", 409);
    const snapshot = createAcceptanceEvidence(quote, manualChecks, at, businessDecision,runtimeInput,journeyInput);
    next.proof.delivery = withAcceptanceEvidence(delivery, snapshot);
    snapshotId = snapshot.id;
  }
  next.proof.paymentOperation = "capture";
  next.proof.acceptedAt = at;
  next.proof.acceptedDeliveryId = delivery.id;
  next.proof.manualChecks = structuredClone(manualChecks);
  next.proof.acceptedEvidenceSnapshotId = snapshotId;
  next.proof.audit.push({kind: "accepted", at, deliveryId: delivery.id, ...(snapshotId ? {evidenceSnapshotId: snapshotId} : {})});
  return next;
}
