import type {Language, ProofQuote, ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {JOURNEY_SLOTS, type JourneyObservation, type JourneyStepId} from "./journey-checks.ts";
import {evaluateStoredProjectJourneyReport, savedProjectJourneyPlan, validateStoredProjectJourneyReport} from "./project-journey.ts";
import {runtimeDeliveryDigest} from "./runtime-project.ts";

export const JOURNEY_EXPLANATION_BYTES = 16 * 1024;
export type JourneyEvidenceFinding = {stepIds: JourneyStepId[]; priority: "high" | "medium" | "low"; explanation: string; retest: string};
export type JourneyEvidenceExplanation = {
  id: string; method: "ai-journey-evidence-explanation-v1"; mode: "live"; model: string; generatedAt: string;
  deliveryId: string; deliveryDigest: string; planDigest: string; reportId: string; stepIds: JourneyStepId[];
  findings: JourneyEvidenceFinding[]; limitations: string[]; usage?: {promptTokens: number; completionTokens: number};
};
export type JourneyEvidenceBinding = Pick<JourneyEvidenceExplanation, "deliveryId" | "deliveryDigest" | "planDigest" | "reportId" | "stepIds">;
export type JourneyEvidenceContext = {
  language: Language; binding: JourneyEvidenceBinding; previousExplanationId: string | null;
  evidence: {method: "saved-journey-observations-v1"; browserWritesAttested: false; serverReadbacks: true;
    deploymentAttestation: false; authenticatedRoles: false;
    steps: {stepId: JourneyStepId; outcome: "observed" | "mismatch" | "unavailable"; expected: string; actual: Record<string, unknown>}[]};
};
const CONTROL = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
function object(value: unknown, keys: readonly string[], required = keys): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DomainError("Journey explanation needs plain JSON objects.");
  for (const key of Reflect.ownKeys(value)) if (typeof key !== "string" || !keys.includes(key) || !("value" in Object.getOwnPropertyDescriptor(value, key)!)) throw new DomainError("Journey explanation contains an unsupported field.");
  if (required.some(key => !Object.hasOwn(value, key))) throw new DomainError("Journey explanation is missing a required field.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || CONTROL.test(value)) throw new DomainError("Journey explanation text is invalid or too long.");
  return value;
}
const plain = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) ? value as Record<string, unknown> : undefined;
const scalar = (value: unknown): unknown => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000 ? value : value === undefined ? "missing" : typeof value;
const slot = (value: unknown) => Object.entries(JOURNEY_SLOTS).find(([, expected]) => expected === value)?.[0] ?? (value === undefined ? "missing" : "other");
const state = (value: unknown) => ["active", "cancelled"].includes(value as string) ? value : "other";
const codes = new Set(["synthetic_validation_failed", "party_size_invalid", "party_size_exceeded", "slot_capacity_exceeded", "idempotency_conflict", "booking_state_conflict", "response_lost_after_commit"]);
const code = (value: unknown) => typeof value === "string" && codes.has(value) ? value : "other";
const httpStatus = (value: unknown) => Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599 ? value : "unavailable";

/** Never forward arbitrary seller text, endpoint URLs, customer fields, headers,
 * request keys or raw response objects. Preserve only bounded comparison facts. */
function compactObservation(observation: JourneyObservation, alias: (value: unknown) => string): Record<string, unknown> {
  const receipt = (value: unknown): Record<string, unknown> | undefined => {
    const row = plain(value); if (!row) return;
    return {id: alias(row.id), partySize: scalar(row.partySize), slot: slot(row.slot), status: state(row.status)};
  };
  const body = (value: unknown): Record<string, unknown> => {
    const row = plain(value); if (!row) return {shape: "not_object"};
    return {...(Object.hasOwn(row, "partySize") ? {partySize: scalar(row.partySize)} : {}), ...(Object.hasOwn(row, "slot") ? {slot: slot(row.slot)} : {}),
      ...(Object.hasOwn(row, "code") ? {code: code(row.code)} : {}), ...(Object.hasOwn(row, "id") ? {receipt: receipt(row)} : {})};
  };
  const result: Record<string, unknown> = {};
  if (observation.unavailableReason) result.unavailable = true;
  if (observation.ui) {
    const fields = observation.ui.fields ?? {};
    result.browser = {status: observation.ui.status, ...(fields.partySize !== undefined ? {partySize: /^-?\d+(?:\.\d+)?$/u.test(fields.partySize) ? scalar(Number(fields.partySize)) : "not_numeric"} : {}),
      ...(fields.slot !== undefined ? {slot: slot(fields.slot)} : {}), ...(observation.ui.receipt ? {receipt: receipt(observation.ui.receipt)} : {})};
  }
  if (observation.requests) result.requests = observation.requests.map(request => ({method: request.method, ...(request.status !== undefined ? {status: httpStatus(request.status)} : {}),
    ...(request.error ? {transportError: true} : {}), ...(request.request !== undefined ? {sent: body(request.request)} : {}), ...(request.response !== undefined ? {received: body(request.response)} : {})}));
  if (observation.receipt) result.receiptReadback = {status: httpStatus(observation.receipt.status), receipt: receipt(observation.receipt.body)};
  if (observation.merchant) {
    const merchant = plain(observation.merchant.body), rows = merchant && Array.isArray(merchant.bookings) ? merchant.bookings : undefined;
    result.merchantReadback = {status: httpStatus(observation.merchant.status), ...(rows && rows.length <= 24 ? {receipts: rows.map(receipt)} : {shape: "unsupported"})};
  }
  if (observation.occupancies) result.occupancies = observation.occupancies.map(reading => {
    const row = plain(reading.body);
    return {slot: reading.slot, status: httpStatus(reading.status), ...(row ? {guestCount: scalar(row.guestCount), bookingIds: Array.isArray(row.bookingIds) && row.bookingIds.length <= 24 ? row.bookingIds.map(alias) : "unsupported"} : {shape: "not_object"})};
  });
  return result;
}

async function boundReport(quote: ProofQuote) {
  const delivery = quote.proof.delivery, plan = savedProjectJourneyPlan(quote);
  if (quote.workflow !== "proof-v1" || !delivery || delivery.variant !== "upload" || !delivery.files || !plan || !delivery.journeyReport) throw new DomainError("Save this delivery's optional journey report before requesting an AI explanation.", 409);
  const digest = await runtimeDeliveryDigest(delivery.files);
  const report = validateStoredProjectJourneyReport(delivery.journeyReport, {deliveryId: delivery.id, deliveryDigest: digest, plan, projectId: quote.id});
  const evaluated = evaluateStoredProjectJourneyReport(report);
  return {delivery, report, evaluated, binding: {deliveryId: delivery.id, deliveryDigest: digest, planDigest: plan.planDigest, reportId: report.id, stepIds: evaluated.steps.map(step => step.id)} satisfies JourneyEvidenceBinding};
}

/** Called only after server membership resolution. Request data cannot supply a
 * report, observations, role, destination, verdict, acceptance or payment. */
export async function journeyEvidenceContext(quote: ProofQuote, role: ProofRole, value: unknown): Promise<JourneyEvidenceContext> {
  if (role !== "buyer" && role !== "seller") throw new DomainError("Only project members may request a journey explanation.", 403);
  const input = object(value, ["confirm", "deliveryId", "reportId", "previousExplanationId", "language"], ["confirm", "deliveryId", "reportId", "previousExplanationId"]);
  if (input.confirm !== true) throw new DomainError("Confirm sending the saved, compact journey evidence to AI.");
  if (input.language !== undefined && input.language !== "zh" && input.language !== "en") throw new DomainError("Language must be zh or en.");
  const {delivery, report, evaluated, binding} = await boundReport(quote);
  if (delivery.journeyRun) throw new DomainError("Finish the pending journey before explaining its saved evidence.", 409);
  if (input.deliveryId !== binding.deliveryId || input.reportId !== binding.reportId || input.previousExplanationId !== (delivery.journeyExplanation?.id ?? null)) throw new DomainError("The delivery, journey report or explanation changed. Refresh before requesting AI.", 409);
  const aliases = new Map<string, string>();
  const alias = (value: unknown) => {if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u.test(value)) return "missing_or_invalid"; if (!aliases.has(value)) aliases.set(value, `receipt-${aliases.size + 1}`); return aliases.get(value)!;};
  const context: JourneyEvidenceContext = {language: input.language as Language | undefined ?? quote.language, binding, previousExplanationId: input.previousExplanationId as string | null,
    evidence: {method: "saved-journey-observations-v1", browserWritesAttested: false, serverReadbacks: true, deploymentAttestation: false, authenticatedRoles: false,
      steps: evaluated.steps.map(step => ({stepId: step.id, outcome: step.outcome, expected: step.expected, actual: compactObservation(report.input.observations.find(row => row.id === step.id)!, alias)}))}};
  if (new TextEncoder().encode(JSON.stringify(context)).byteLength > 48 * 1024) throw new DomainError("Compact journey evidence exceeds the AI input limit. Review the saved report directly.", 409);
  return context;
}

export function parseJourneyEvidenceProposal(value: unknown, binding: JourneyEvidenceBinding): Pick<JourneyEvidenceExplanation, "findings" | "limitations"> {
  const input = object(value, ["findings", "limitations"]);
  if (!Array.isArray(input.findings) || input.findings.length < 1 || input.findings.length > 8 || !Array.isArray(input.limitations) || input.limitations.length < 1 || input.limitations.length > 5) throw new DomainError("Journey explanation exceeds its supported limits.");
  const seen = new Set<string>();
  const findings = input.findings.map(value => {
    const row = object(value, ["stepIds", "priority", "explanation", "retest"]);
    if (!Array.isArray(row.stepIds) || !row.stepIds.length || row.stepIds.length > 20 || new Set(row.stepIds).size !== row.stepIds.length || row.stepIds.some(id => !binding.stepIds.includes(id as JourneyStepId)) || !["high", "medium", "low"].includes(row.priority as string)) throw new DomainError("Every AI finding must cite only existing journey step IDs and a supported priority.");
    const identity = [...row.stepIds].sort().join(","); if (seen.has(identity)) throw new DomainError("Duplicate AI journey findings are unsupported."); seen.add(identity);
    return {stepIds: [...row.stepIds] as JourneyStepId[], priority: row.priority as JourneyEvidenceFinding["priority"], explanation: text(row.explanation, 500), retest: text(row.retest, 350)};
  });
  const result = {findings, limitations: input.limitations.map(value => text(value, 300))};
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > JOURNEY_EXPLANATION_BYTES - 2048) throw new DomainError("Journey explanation exceeds its saved byte limit.");
  return result;
}

export function validateJourneyEvidenceExplanation(value: unknown, binding: JourneyEvidenceBinding): JourneyEvidenceExplanation {
  const x = object(value, ["id", "method", "mode", "model", "generatedAt", "deliveryId", "deliveryDigest", "planDigest", "reportId", "stepIds", "findings", "limitations", "usage"], ["id", "method", "mode", "model", "generatedAt", "deliveryId", "deliveryDigest", "planDigest", "reportId", "stepIds", "findings", "limitations"]);
  if (typeof x.id !== "string" || !ID.test(x.id) || x.method !== "ai-journey-evidence-explanation-v1" || x.mode !== "live" || typeof x.generatedAt !== "string" || !Number.isFinite(Date.parse(x.generatedAt)) || new Date(x.generatedAt).toISOString() !== x.generatedAt) throw new DomainError("Saved journey explanation identity is invalid.", 409);
  for (const key of ["deliveryId", "deliveryDigest", "planDigest", "reportId"] as const) if (x[key] !== binding[key]) throw new DomainError("AI explanation belongs to a different delivery, agreement or journey report.", 409);
  if (!DIGEST.test(binding.deliveryDigest) || !DIGEST.test(binding.planDigest) || JSON.stringify(x.stepIds) !== JSON.stringify(binding.stepIds)) throw new DomainError("AI explanation step inventory changed.", 409);
  text(x.model, 120); parseJourneyEvidenceProposal({findings: x.findings, limitations: x.limitations}, binding);
  if (x.usage !== undefined) {const usage = object(x.usage, ["promptTokens", "completionTokens"]); if (Object.values(usage).some(value => !Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 1_000_000)) throw new DomainError("AI explanation usage is invalid.");}
  if (new TextEncoder().encode(JSON.stringify(x)).byteLength > JOURNEY_EXPLANATION_BYTES) throw new DomainError("Saved journey explanation is too large.", 409);
  return structuredClone(x) as JourneyEvidenceExplanation;
}

/** Re-read and validate after the provider returns, then let saveProofCase do
 * the database version CAS. No verdict, review, acceptance or payment is set. */
export async function saveJourneyEvidenceExplanation(quote: ProofQuote, role: ProofRole, request: unknown, explanation: JourneyEvidenceExplanation): Promise<ProofQuote> {
  const context = await journeyEvidenceContext(quote, role, request);
  const checked = validateJourneyEvidenceExplanation(explanation, context.binding), next = structuredClone(quote);
  next.proof.delivery!.journeyExplanation = checked;
  return next;
}

export async function currentJourneyEvidenceExplanation(quote: ProofQuote): Promise<JourneyEvidenceExplanation | undefined> {
  if (!quote.proof.delivery?.journeyExplanation) return;
  const {binding} = await boundReport(quote);
  // A retained explanation of report A remains available to the offline export
  // after report B is saved, but must not be presented as explaining B.
  if (quote.proof.delivery.journeyExplanation.reportId !== binding.reportId) return;
  return validateJourneyEvidenceExplanation(quote.proof.delivery.journeyExplanation, binding);
}
