import type {ProofAssessmentRisk, ProofCriterion, ProofFeedback, ProofQuote, ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {isOwnerRoleplay, isSandboxCollaboration} from "./proof-demo.ts";

export const RISK_REPAIR_EVENT_LIMIT = 100;
export const RISK_REPAIR_BYTE_LIMIT = 256 * 1024;
export type RiskSourceInput = {assessmentId: string; riskIndex: number};
/** Copied by the server at formal return, never supplied as an editable model verdict. */
export type RiskFeedbackSource = RiskSourceInput & {deliveryId: string; criterion: ProofCriterion; risk: ProofAssessmentRisk};
export type RiskRepairOutcome = "repaired" | "still_needs_changes" | "exception";
type RiskRepairBase = {id: string; sequence: number; feedbackId: string; deliveryId: string; previousEventId: string | null; at: string; reason: string; reviewedAt: string};
export type RiskRepairEvent =
  | RiskRepairBase & {action: "propose"; actorRole: "seller"}
  | RiskRepairBase & {action: "review"; actorRole: "buyer"; proposalId: string; outcome: RiskRepairOutcome};
export type RiskRepairInput =
  | {action: "propose"; feedbackId: string; deliveryId: string; expectedEventId: string | null; reason: string}
  | {action: "review"; feedbackId: string; deliveryId: string; expectedEventId: string; reason: string; proposalId: string; outcome: RiskRepairOutcome};
export type RiskRepairTask = {feedbackId: string; criterionId: string; comment: string; at: string; source: RiskFeedbackSource; status: "open" | "proposed" | "repaired" | "exception"; events: RiskRepairEvent[]; proposal?: Extract<RiskRepairEvent, {action: "propose"}>; review?: Extract<RiskRepairEvent, {action: "review"}>};

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
function fail(message: string, status = 409): never {throw new DomainError(message, status);}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("Risk repair data must be plain objects.");
  const r = value as Record<string, unknown>;
  if (Reflect.ownKeys(r).some(key => typeof key !== "string" || !keys.includes(key) || !("value" in Object.getOwnPropertyDescriptor(r, key)!))) fail("Risk repair data contains unsupported fields.");
  return r;
}
function text(value: unknown, max = 200, min = 1): string {
  if (typeof value !== "string" || value.trim().length < min || value.length > max || CONTROL.test(value)) fail("Risk repair text is missing, too long or contains unsupported characters.");
  return value;
}
function time(value: unknown): string {const s = text(value, 40); if (!Number.isFinite(Date.parse(s))) fail("Invalid risk repair time."); return s;}
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = Object.keys(left), b = Object.keys(right);
  return a.length === b.length && a.every(key => Object.hasOwn(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

export function validateRiskFeedbackSource(value: unknown): RiskFeedbackSource {
  const r = record(value, ["deliveryId", "assessmentId", "riskIndex", "criterion", "risk"]);
  text(r.deliveryId); text(r.assessmentId);
  if (!Number.isSafeInteger(r.riskIndex) || Number(r.riskIndex) < 0 || Number(r.riskIndex) >= 5) fail("Invalid source risk index.");
  const criterion = record(r.criterion, ["id", "title", "source"]);
  text(criterion.id, 80); text(criterion.title, 500); text(criterion.source, 3000);
  const risk = record(r.risk, ["title", "explanation", "suggestion", "citations"]);
  text(risk.title, 120); text(risk.explanation, 600); text(risk.suggestion, 400);
  if (!Array.isArray(risk.citations) || risk.citations.length < 1 || risk.citations.length > 3) fail("A source risk must retain its exact citations.");
  for (const entry of risk.citations) {
    const citation = record(entry, ["file", "start", "end", "excerpt"]);
    text(citation.file, 160); const excerpt = text(citation.excerpt, 500);
    if (!Number.isSafeInteger(citation.start) || Number(citation.start) < 0 || !Number.isSafeInteger(citation.end) || Number(citation.end) - Number(citation.start) !== excerpt.length) fail("Invalid source risk citation offsets.");
  }
  return structuredClone(r) as RiskFeedbackSource;
}

/** Attach only an immutable current-report reference to an ordinary agreed criterion. */
export function snapshotRiskFeedbackSource(quote: ProofQuote, criterionId: string, value: unknown): RiskFeedbackSource {
  const input = record(value, ["assessmentId", "riskIndex"]), delivery = quote.proof.delivery, report = delivery?.assessment;
  const criterion = quote.proof.criteria.find(item => item.id === criterionId);
  if (!criterion || criterionId === "journey-agreement" || criterionId === "model-agreement") fail("A risk must be explicitly linked to an existing ordinary agreed criterion.");
  if (!delivery || !report || report.deliveryId !== delivery.id || input.assessmentId !== report.id) fail("The delivery or AI report changed. Refresh before returning it.");
  if (!Number.isSafeInteger(input.riskIndex) || Number(input.riskIndex) < 0 || Number(input.riskIndex) >= report.risks.length) fail("Choose an exact risk in the current AI report.");
  const source = validateRiskFeedbackSource({deliveryId: delivery.id, assessmentId: report.id, riskIndex: input.riskIndex, criterion, risk: report.risks[Number(input.riskIndex)]});
  for (const citation of source.risk.citations) {
    if (!delivery.files || !Object.hasOwn(delivery.files, citation.file) || delivery.files[citation.file].slice(citation.start, citation.end) !== citation.excerpt) fail("The risk citation no longer matches its saved delivery source.");
  }
  return source;
}

/** Rebuild human task state from bounded immutable feedback and append-only events.
 * This checks internal consistency, not model truth, human identity or old-file authenticity. */
export function replayRiskRepairs(feedback: readonly ProofFeedback[], values: readonly RiskRepairEvent[] = [], criteria?: readonly ProofCriterion[]): RiskRepairTask[] {
  if (!Array.isArray(feedback) || feedback.length > 200 || !Array.isArray(values) || values.length > RISK_REPAIR_EVENT_LIMIT) fail("Risk repair history exceeds its retained bound. Existing records were retained.");
  const tasks = new Map<string, RiskRepairTask>(), feedbackIds = new Set<string>();
  for (const item of feedback) {
    if (!item || typeof item !== "object") fail("Invalid retained feedback.");
    const feedbackId = text(item.id);
    if (feedbackIds.has(feedbackId)) fail("Feedback identifiers must be unique.");
    feedbackIds.add(feedbackId);
    if (item.riskSource === undefined) continue;
    const source = validateRiskFeedbackSource(item.riskSource);
    if (source.deliveryId !== item.deliveryId || source.criterion.id !== item.criterionId || item.journeyReportId !== undefined || item.modelReportId !== undefined) fail("Risk feedback is bound to another delivery, criterion or technical scope.");
    if (criteria && !criteria.some(criterion => same(criterion, source.criterion))) fail("Risk feedback differs from its locked agreed criterion.");
    tasks.set(feedbackId, {feedbackId, criterionId: source.criterion.id, comment: text(item.comment, 1000), at: time(item.at), source, status: "open", events: []});
  }
  const ids = new Set<string>(); let previousAt = "";
  for (const raw of values) {
    const r = record(raw, ["id", "sequence", "feedbackId", "deliveryId", "previousEventId", "at", "reason", "reviewedAt", "action", "actorRole", "proposalId", "outcome"]);
    const id = text(r.id), deliveryId = text(r.deliveryId), at = time(r.at), reviewedAt = time(r.reviewedAt);
    text(r.reason, 1000, 10);
    const task = tasks.get(text(r.feedbackId));
    if (!task || ids.has(id) || r.sequence !== ids.size + 1 || Date.parse(at) < Date.parse(previousAt || task.at) || Date.parse(at) < Date.parse(task.at) || Date.parse(reviewedAt) > Date.parse(at) || r.previousEventId !== (task.events.at(-1)?.id ?? null)) fail("Risk repair events are foreign, duplicated, stale or out of order.");
    if (task.status === "repaired" || task.status === "exception") fail("A reviewed risk repair is sealed; request a new scoped change instead.");
    if (r.action === "propose") {
      if (r.actorRole !== "seller" || deliveryId === task.source.deliveryId || r.proposalId !== undefined || r.outcome !== undefined) fail("A repair proposal must belong to the seller and a later delivery.");
      task.proposal = structuredClone(r) as Extract<RiskRepairEvent, {action: "propose"}>;
      task.review = undefined; task.status = "proposed";
    } else if (r.action === "review") {
      if (r.actorRole !== "buyer" || task.status !== "proposed" || !task.proposal || r.proposalId !== task.proposal.id || r.previousEventId !== task.proposal.id || deliveryId !== task.proposal.deliveryId || !["repaired", "still_needs_changes", "exception"].includes(r.outcome as string)) fail("The buyer must review the exact current proposal.");
      task.review = structuredClone(r) as Extract<RiskRepairEvent, {action: "review"}>;
      task.status = r.outcome === "still_needs_changes" ? "open" : r.outcome as "repaired" | "exception";
    } else fail("Unsupported risk repair action.");
    task.events.push(structuredClone(r) as RiskRepairEvent); ids.add(id); previousAt = at;
  }
  const retained = {feedback: feedback.filter(item => item.riskSource !== undefined), events: values};
  if (new TextEncoder().encode(JSON.stringify(retained)).byteLength > RISK_REPAIR_BYTE_LIMIT) fail("Risk repair history is full (256 KiB). Existing records were retained.");
  return [...tasks.values()];
}

export const validateRiskRepairRecords = replayRiskRepairs;

/** Role is provided by authenticated storage membership. No field changes acceptance or funds. */
export function recordRiskRepair(quote: ProofQuote, role: ProofRole, value: unknown, now = new Date().toISOString()): ProofQuote {
  if (role !== "buyer" && role !== "seller") fail("Project membership is required.", 403);
  if (quote.proof.sandboxCollaboration === true && !isSandboxCollaboration(quote) || quote.proof.demoRoleplay === true && !isOwnerRoleplay(quote)) fail("The saved workflow configuration is invalid.");
  const input = record(value, ["action", "feedbackId", "deliveryId", "expectedEventId", "reason", "proposalId", "outcome"]);
  const collaboration = quote.proof.collaboration, delivery = quote.proof.delivery;
  if (!quote.proof.project || !collaboration || !delivery || quote.status !== "approved" || quote.proof.acceptedDeliveryId || collaboration.stage === "accepted" || collaboration.acceptance || quote.proof.paymentOperation || ["captured", "voided", "closed_unpaid"].includes(quote.proof.paymentState)) fail("Risk repairs are view-only after acceptance, payment lock or closure.");
  if (delivery.runtimeRun || delivery.journeyRun || delivery.modelRun || delivery.transferCompetitionRun||delivery.enquiryRun) fail("Finish the pending check before changing a risk repair.");
  if (quote.proof.paymentState === "authorized") {
    const expires = Date.parse(quote.proof.authorizationExpiresAt ?? "");
    if (!quote.proof.authorizationId || !Number.isFinite(expires) || expires <= Date.now()) fail("The authorization acceptance window has expired or is invalid.");
  }
  if (input.deliveryId !== delivery.id || quote.proof.review?.deliveryId !== delivery.id) fail("Review the current delivery before updating a risk repair.");
  const events = collaboration.riskRepairEvents ?? [], tasks = replayRiskRepairs(collaboration.feedback, events, quote.proof.criteria);
  const task = tasks.find(item => item.feedbackId === input.feedbackId);
  if (!task || !Object.hasOwn(input, "expectedEventId") || input.expectedEventId !== (task.events.at(-1)?.id ?? null)) fail("The risk repair changed. Refresh before continuing.");
  if (events.length >= RISK_REPAIR_EVENT_LIMIT) fail("Risk repair history is full (100 events). Existing records were retained.");
  const at = time(now), base: RiskRepairBase = {id: crypto.randomUUID(), sequence: events.length + 1, feedbackId: task.feedbackId, deliveryId: delivery.id, previousEventId: task.events.at(-1)?.id ?? null, at, reason: text(input.reason, 1000, 10).trim(), reviewedAt: quote.proof.review.reviewedAt};
  let event: RiskRepairEvent;
  if (input.action === "propose") {
    if (role !== "seller") fail("Only the seller may propose repair evidence.", 403);
    if (!["in_progress", "changes_requested", "submitted"].includes(collaboration.stage) || delivery.id === task.source.deliveryId || input.proposalId !== undefined || input.outcome !== undefined) fail("Propose evidence on a different current delivery before acceptance.");
    event = {...base, action: "propose", actorRole: "seller"};
  } else if (input.action === "review") {
    if (role !== "buyer") fail("Only the buyer may review a repair proposal.", 403);
    if (collaboration.stage !== "submitted" || collaboration.submission?.deliveryId !== delivery.id || !task.proposal || task.status !== "proposed" || input.proposalId !== task.proposal.id || task.proposal.deliveryId !== delivery.id || !["repaired", "still_needs_changes", "exception"].includes(input.outcome as string)) fail("Review the exact seller proposal on the current submitted delivery.");
    event = {...base, action: "review", actorRole: "buyer", proposalId: task.proposal.id, outcome: input.outcome as RiskRepairOutcome};
  } else fail("Choose a supported risk repair action.");
  const nextEvents = [...events, event];
  replayRiskRepairs(collaboration.feedback, nextEvents, quote.proof.criteria);
  return {...quote, proof: {...quote.proof, collaboration: {...collaboration, riskRepairEvents: nextEvents}, audit: [...quote.proof.audit, {kind: event.action === "propose" ? "risk_repair_proposed" : "risk_repair_reviewed", at, deliveryId: delivery.id, reportId: task.source.assessmentId, feedbackId: task.feedbackId}]}};
}
