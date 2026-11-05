import type { ProofDelivery, ProofDeliveryVersion, ProofEvent, ProofQuote, ProofRole } from "./contracts.ts";
import { DomainError } from "./domain.ts";
import { requireProof } from "./proof-domain.ts";
import { isSandboxCollaboration, isSandboxRehearsal } from "./proof-demo.ts";
import { validateBusinessDecision } from "./business-decision.ts";
import { createAcceptanceEvidence, withAcceptanceEvidence } from "./acceptance-evidence.ts";
import { assertCoverageForAcceptance } from "./requirement-coverage.ts";
import { savedProjectJourneyPlan, validateStoredProjectJourneyReport } from "./project-journey.ts";
import {assertAcceptanceBasis} from "./acceptance-basis.ts";
import {validateStoredModelCheckReport} from "./model-checks.ts";
import {snapshotRiskFeedbackSource, replayRiskRepairs} from "./risk-repairs.ts";

export type ProofWorkflowAction = "approve" | "checkout" | "authorize" | "delivery" | "review" | "assess" | "layout" | "capture" | "void" | "reconcile" | "return" | "accept_delivery" | "invite" | "submit_delivery";

const LEGACY_ACTIONS = new Set<ProofWorkflowAction>(["approve", "checkout", "authorize", "delivery", "review", "assess", "layout", "capture", "void", "reconcile"]);
const BUYER_ACTIONS = new Set<ProofWorkflowAction>(["approve", "checkout", "authorize", "review", "assess", "layout", "capture", "void", "reconcile", "return", "accept_delivery", "invite"]);
const SELLER_ACTIONS = new Set<ProofWorkflowAction>(["delivery", "submit_delivery", "review", "assess", "layout"]);
const PAYMENT_ACTIONS = new Set<ProofWorkflowAction>(["checkout", "authorize", "capture", "void", "reconcile"]);
const DELIVERY_ACTIONS = new Set<ProofWorkflowAction>(["delivery", "review", "assess", "layout", "submit_delivery", "return", "accept_delivery"]);
const STAGES = new Set(["awaiting_seller", "in_progress", "submitted", "changes_requested", "accepted"]);
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function conflict(message: string): never { throw new DomainError(message, 409); }

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DomainError(`${label} must be a plain object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || CONTROL.test(value)) {
    throw new DomainError(`${label} must contain 1–${max} characters without control characters.`);
  }
  return value.trim();
}

function timestamp(now?: string): string {
  const at = now === undefined ? new Date().toISOString() : now;
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) throw new DomainError("The workflow time is invalid.");
  return at;
}

function collaboration(quote: ProofQuote) {
  requireProof(quote);
  if (!quote.proof.project || !quote.proof.collaboration) conflict("Seller collaboration requires a custom agreement.");
  if (!STAGES.has(quote.proof.collaboration.stage)) conflict("The saved collaboration stage is invalid.");
  return quote.proof.collaboration;
}

/** Freeze deliverables while a payment is pending, terminal, or past its acceptance window. */
function requireUnlockedDelivery(quote: ProofQuote, approved = true) {
  if (quote.proof.delivery?.runtimeRun || quote.proof.delivery?.journeyRun||quote.proof.delivery?.modelRun||quote.proof.delivery?.transferCompetitionRun||quote.proof.delivery?.enquiryRun) conflict("Finish the pending backend run before changing delivery, acceptance or payment.");
  if (approved && quote.status !== "approved") conflict("Approve the exact scope before changing the delivery workflow.");
  if (quote.status === "paid" || ["captured", "voided", "closed_unpaid"].includes(quote.proof.paymentState)) conflict("This payment outcome has closed the delivery workflow.");
  if (quote.proof.paymentOperation) conflict("Finish the pending payment operation before changing the delivery workflow.");
  if (quote.proof.paymentState === "authorized") {
    const expires = Date.parse(quote.proof.authorizationExpiresAt ?? "");
    if (!quote.proof.authorizationId || !Number.isFinite(expires) || expires <= Date.now()) conflict("The authorization acceptance window has expired or is invalid.");
  }
}

function currentDelivery(quote: ProofQuote, input: Record<string, unknown>) {
  const delivery = quote.proof.delivery;
  if (!delivery || input.deliveryId !== delivery.id) conflict("This action must use the current delivery version.");
  return delivery;
}

/** Bind an upload to the delivery the caller actually saw, including an empty project. */
export function requireExpectedDelivery(quote: ProofQuote, input: Record<string, unknown>): void {
  const expected = input.expectedDeliveryId;
  if (!Object.hasOwn(input, "expectedDeliveryId") || (expected !== null && (typeof expected !== "string" || !expected))) {
    conflict("The delivery view is missing or invalid. Reload the project before uploading files.");
  }
  if (expected !== (quote.proof.delivery?.id ?? null)) {
    conflict("The delivery changed after you opened it. Reload the project before replacing files.");
  }
}

function log(quote: ProofQuote, kind: ProofEvent["kind"], at: string, deliveryId?: string): ProofQuote {
  quote.proof.audit.push({ kind, at, ...(deliveryId ? { deliveryId } : {}) });
  return quote;
}

/** Role comes from authenticated membership, never from a client-supplied payload. */
export function requireWorkflowAction(quote: ProofQuote, role: ProofRole, action: ProofWorkflowAction): void {
  requireProof(quote);
  if (quote.proof.sandboxCollaboration === true && !isSandboxCollaboration(quote)) conflict("The saved two-account Sandbox workflow is invalid.");
  if (role !== "buyer" && role !== "seller") throw new DomainError("This role cannot change the agreement.", 403);
  if (!quote.proof.collaboration) {
    if (role !== "buyer") throw new DomainError("Legacy agreements can only be changed by their buyer.", 403);
    if (!LEGACY_ACTIONS.has(action)) conflict("This action requires seller collaboration.");
    return; // Existing legacy routes keep their payment and delivery guards.
  }
  const state = collaboration(quote);
  if (!(role === "buyer" ? BUYER_ACTIONS : SELLER_ACTIONS).has(action)) throw new DomainError("This role is not allowed to perform this agreement action.", 403);
  if (state.stage === "awaiting_seller" && action !== "invite" && action !== "approve") conflict("Wait for the seller to join before continuing.");
  if (action === "invite" && state.stage !== "awaiting_seller") conflict("A seller has already joined this agreement.");
  if (PAYMENT_ACTIONS.has(action) && quote.paymentMode !== "demo" && !isSandboxRehearsal(quote) && !isSandboxCollaboration(quote)) conflict("Select a new two-account Sandbox project or use simulated payment; seller settlement is not integrated.");
  if ((isSandboxRehearsal(quote) || isSandboxCollaboration(quote)) && (action === "checkout" || action === "authorize")
    && (state.stage !== "accepted" || !quote.proof.delivery || state.acceptance?.deliveryId !== quote.proof.delivery.id)) {
    conflict("Accept the exact delivery before starting its PayPal Sandbox test payment.");
  }
  if (DELIVERY_ACTIONS.has(action)) requireUnlockedDelivery(quote);
  if (action === "delivery" || action === "submit_delivery") {
    if (state.stage !== "in_progress" && state.stage !== "changes_requested") conflict("The seller can change or send a delivery only while work is in progress or changes are requested.");
    if (action === "submit_delivery" && (!quote.proof.delivery || quote.proof.review?.deliveryId !== quote.proof.delivery.id)) conflict("Review the current delivery before sending it to the buyer.");
  }
  if (action === "review" || action === "assess" || action === "layout") {
    if (!["in_progress", "changes_requested", "submitted"].includes(state.stage)) conflict("This delivery is no longer open for updated checks.");
  }
  if (action === "return" || action === "accept_delivery") {
    if (state.stage !== "submitted" || !quote.proof.delivery || state.submission?.deliveryId !== quote.proof.delivery.id) conflict("Only the current submitted delivery can be returned or accepted.");
  }
  if (action === "capture" && (state.stage !== "accepted" || !quote.proof.delivery || state.acceptance?.deliveryId !== quote.proof.delivery.id)) {
    conflict("Accept the current delivery before confirming payment.");
  }
}

/** Invitation validation and private account membership are handled outside the quote payload. */
export function joinSeller(quote: ProofQuote, name: unknown, now?: string): ProofQuote {
  if (quote.proof.sandboxCollaboration === true && !isSandboxCollaboration(quote)) conflict("The saved two-account Sandbox workflow is invalid.");
  const state = collaboration(quote);
  if (state.stage !== "awaiting_seller") conflict("A seller has already joined this agreement.");
  requireUnlockedDelivery(quote);
  if ((quote.paymentMode !== "demo" && !isSandboxRehearsal(quote) && !isSandboxCollaboration(quote)) || quote.proof.paymentState !== "unfunded" || quote.paypalOrderId) {
    conflict("A seller can join only an unfunded demonstration or explicitly selected Sandbox workflow without an existing order.");
  }
  const sellerName = text(name, "Seller name", 100);
  const at = timestamp(now);
  const next = structuredClone(quote);
  next.proof.collaboration = { ...next.proof.collaboration!, stage: "in_progress", sellerName, sellerJoinedAt: at };
  return log(next, "seller_joined", at);
}

export function submitDelivery(quote: ProofQuote, value: Record<string, unknown>, now?: string): ProofQuote {
  requireWorkflowAction(quote, "seller", "submit_delivery");
  const input = record(value, "Delivery submission");
  const delivery = currentDelivery(quote, input);
  const note = text(input.note, "Submission note", 2000);
  const at = timestamp(now);
  const next = structuredClone(quote);
  next.proof.collaboration = { ...next.proof.collaboration!, stage: "submitted", submission: { deliveryId: delivery.id, note, at } };
  return log(next, "delivery_sent", at, delivery.id);
}

export function requestChanges(quote: ProofQuote, value: Record<string, unknown>, now?: string): ProofQuote {
  requireWorkflowAction(quote, "buyer", "return");
  const input = record(value, "Change request");
  const delivery = currentDelivery(quote, input);
  const state = quote.proof.collaboration!;
  const journeyPlan = savedProjectJourneyPlan(quote);
  if (!Array.isArray(input.feedback) || input.feedback.length < 1 || input.feedback.length > quote.proof.criteria.length + (journeyPlan ? 1 : 0)+(delivery.modelReport?1:0)) {
    throw new DomainError("Feedback must contain 1 entry per selected agreed requirement, without duplicates.");
  }
  if (!Array.isArray(state.feedback) || state.feedback.length + input.feedback.length > 200) throw new DomainError("An agreement supports at most 200 feedback entries.");
  const seen = new Set<string>();
  const at = timestamp(now);
  const feedback = input.feedback.map(value => {
    const entry = record(value, "Feedback");
    const technical = entry.criterionId === "journey-agreement";
    const modelTechnical=entry.criterionId==="model-agreement";
    if (technical && Object.keys(entry).some(key => !["criterionId", "comment", "journeyReportId"].includes(key))) throw new DomainError("Technical feedback contains unsupported fields; original source references cannot be attached to it.");
    if(modelTechnical&&Object.keys(entry).some(key=>!["criterionId","comment","modelReportId"].includes(key)))throw new DomainError("Model feedback cannot contain original-clause citations or journey-report fields.");
    if (typeof entry.criterionId !== "string" || !(technical ? journeyPlan : modelTechnical?delivery.modelReport:quote.proof.criteria.some(criterion => criterion.id === entry.criterionId)) || seen.has(entry.criterionId)) {
      throw new DomainError("Feedback must use unique agreed requirement identifiers.");
    }
    if (technical) {
      const report = delivery.journeyReport;
      if (!report || typeof entry.journeyReportId !== "string" || entry.journeyReportId !== report.id) throw new DomainError("Technical change requests must reference the current journey report. Review it again.", 409);
      validateStoredProjectJourneyReport(report, {deliveryId: delivery.id, deliveryDigest: report.deliveryDigest, plan: journeyPlan!, projectId: quote.id});
    } else if (entry.journeyReportId !== undefined) throw new DomainError("A journey report belongs to the additional technical agreement, not an original requirement.");
    if(modelTechnical){
      const report=delivery.modelReport;if(!report||!journeyPlan||entry.modelReportId!==report.id)throw new DomainError("Model change requests must reference this delivery's current model report.",409);
      validateStoredModelCheckReport(report,{deliveryId:delivery.id,deliveryDigest:report.deliveryDigest,journeyPlanDigest:journeyPlan.planDigest,projectId:quote.id});
    }else if(entry.modelReportId!==undefined)throw new DomainError("A model report belongs to the separate model agreement, not an original requirement or journey finding.");
    const riskSource = entry.riskSource === undefined ? undefined : snapshotRiskFeedbackSource(quote, entry.criterionId, entry.riskSource);
    seen.add(entry.criterionId);
    return { id: crypto.randomUUID(), deliveryId: delivery.id, criterionId: entry.criterionId, comment: text(entry.comment, "Feedback comment", 1000), at, ...(technical ? {journeyReportId: entry.journeyReportId as string} : {}),...(modelTechnical?{modelReportId:entry.modelReportId as string}:{}), ...(riskSource ? {riskSource} : {}) };
  });
  const next = structuredClone(quote);
  next.proof.collaboration = { ...next.proof.collaboration!, stage: "changes_requested", acceptance: undefined, feedback: [...next.proof.collaboration!.feedback, ...feedback] };
  if (next.proof.collaboration.feedback.some(item => item.riskSource !== undefined) || next.proof.collaboration.riskRepairEvents?.length) replayRiskRepairs(next.proof.collaboration.feedback, next.proof.collaboration.riskRepairEvents, next.proof.criteria);
  next.proof.acceptedDeliveryId = undefined;
  next.proof.acceptedAt = undefined;
  next.proof.acceptedEvidenceSnapshotId = undefined;
  next.proof.manualChecks = undefined;
  return log(next, "changes_requested", at, delivery.id);
}

/** Delivery acceptance is independent of authorizing or capturing any payment. */
export function acceptDelivery(quote: ProofQuote, value: Record<string, unknown>, now?: string): ProofQuote {
  requireWorkflowAction(quote, "buyer", "accept_delivery");
  const input = record(value, "Delivery acceptance");
  const delivery = currentDelivery(quote, input);
  if (input.confirm !== true) throw new DomainError("Explicit confirmation is required to accept this delivery.");
  assertCoverageForAcceptance(quote);
  if (quote.proof.review?.deliveryId !== delivery.id) conflict("Review the current delivery version before accepting it.");
  if (!quote.proof.criteria.length || quote.proof.criteria.some(criterion => !delivery.evidence.some(entry => entry.criterionId === criterion.id))) {
    conflict("The review must cover every agreed requirement.");
  }
  if (delivery.evidence.some(entry => entry.finding === "fail")) conflict("Resolve all failed requirements before accepting the delivery.");
  const required = [...new Set(delivery.evidence.filter(entry => entry.finding === "needs_human").map(entry => entry.criterionId))];
  if (!Array.isArray(input.manualChecks) || input.manualChecks.some(id => typeof id !== "string") || required.some(id => !(input.manualChecks as string[]).includes(id))) {
    throw new DomainError("Confirm each requirement that needs a human check.");
  }
  assertAcceptanceBasis(quote, input.expectedEvidence);
  const at = timestamp(now);
  const next = structuredClone(quote);
  const snapshot = createAcceptanceEvidence(quote, required, at, validateBusinessDecision(quote, input.businessDecision), input.runtimeDecision, input.journeyDecision,input.modelDecision,input.enquiryDecision);
  next.proof.delivery = withAcceptanceEvidence(delivery, snapshot);
  next.proof.collaboration = { ...next.proof.collaboration!, stage: "accepted", acceptance: { deliveryId: delivery.id, at, manualChecks: required, evidenceSnapshotId: snapshot.id } };
  next.proof.audit.push({kind: "delivery_accepted", at, deliveryId: delivery.id, evidenceSnapshotId: snapshot.id});
  return next;
}

/** The caller archives the previous snapshot and writes the replacement with its existing CAS. */
export function prepareReplacement(quote: ProofQuote, newDelivery: ProofDelivery): ProofQuote {
  requireWorkflowAction(quote, "seller", "delivery");
  if (!newDelivery || newDelivery.variant !== "upload" || typeof newDelivery.id !== "string" || !newDelivery.id || newDelivery.id === quote.proof.delivery?.id) {
    throw new DomainError("A replacement must be a newly validated custom upload with a new delivery identifier.");
  }
  const next = structuredClone(quote);
  next.proof.delivery = structuredClone(newDelivery);
  // A new upload never inherits an assessment, even from a future internal builder.
  delete next.proof.delivery.assessment;
  delete next.proof.delivery.layoutReport;
  delete next.proof.delivery.layoutHistory;
  delete next.proof.delivery.businessChecks;
  delete next.proof.delivery.businessCheckHistory;
  delete next.proof.delivery.browserChecks;
  delete next.proof.delivery.browserCheckHistory;
  delete next.proof.delivery.acceptanceEvidence;
  delete next.proof.delivery.riskReviews;
  delete next.proof.delivery.runtimeReport;
  delete next.proof.delivery.runtimeHistory;
  for(const key of ["enquiryPlan","enquiryRun","enquiryReport","enquiryHistory","enquiryEvidenceReservation"] as const)delete next.proof.delivery[key];
  delete next.proof.delivery.runtimeRun;
  delete next.proof.delivery.journeyRun;
  delete next.proof.delivery.journeyPlan;
  delete next.proof.delivery.journeyPlanSuggestions;
  delete next.proof.delivery.journeyPlanAdoption;
  delete next.proof.delivery.journeyExplanation;
  delete next.proof.delivery.modelExplanation;
  delete next.proof.delivery.journeyReport;
  delete next.proof.delivery.journeyHistory;
  delete next.proof.delivery.journeyEvidenceReservation;
  delete next.proof.delivery.modelRun;
  delete next.proof.delivery.transferCompetitionRun;
  delete next.proof.delivery.modelReport;
  delete next.proof.delivery.modelHistory;
  delete next.proof.delivery.modelArchiveRefs;
  delete next.proof.delivery.modelArchive;
  delete next.proof.delivery.modelEvidenceReservation;
  delete next.proof.delivery.evidenceReservation;
  next.proof.review = undefined;
  next.proof.acceptedDeliveryId = undefined;
  next.proof.acceptedAt = undefined;
  next.proof.acceptedEvidenceSnapshotId = undefined;
  next.proof.manualChecks = undefined;
  next.proof.collaboration = { ...next.proof.collaboration!, stage: "in_progress", submission: undefined, acceptance: undefined };
  return next;
}

export function snapshotVersion(quote: ProofQuote, now?: string): ProofDeliveryVersion {
  requireProof(quote);
  const delivery = quote.proof.delivery;
  if (!delivery) conflict("There is no saved delivery version to archive.");
  const review = quote.proof.review?.deliveryId === delivery.id ? quote.proof.review : undefined;
  const submission = quote.proof.collaboration?.submission?.deliveryId === delivery.id ? quote.proof.collaboration.submission : undefined;
  return structuredClone({ delivery, ...(review ? { review } : {}), ...(submission ? { submission } : {}),
    feedback: (quote.proof.collaboration?.feedback ?? []).filter(entry => entry.deliveryId === delivery.id), archivedAt: timestamp(now) });
}
