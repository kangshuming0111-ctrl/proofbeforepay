import type {ProofDelivery, ProofQuote, ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {runtimeDeliveryDigest} from "./runtime-project.ts";
import {newProjectJourneyPlan, savedProjectJourneyPlan} from "./project-journey.ts";
import {JOURNEY_PLAN_CAPABILITIES, journeySuggestionContext, journeySuggestionDigest, parseJourneyPlanProposal, type JourneyPlanCandidate, type JourneyPlanSuggestions} from "./journey-plan-suggestions.ts";

/** The executable plan keeps its existing recipe digest. These separate
 * records describe how a buyer chose that plan; AI advice is never a report. */
export type SavedJourneyPlanSuggestions = JourneyPlanSuggestions & {deliveryId: string; deliveryDigest: string};
type AdoptionBase = {deliveryId: string; planDigest: string; confirmedAt: string};
export type JourneyPlanAdoption =
  | (AdoptionBase & {kind: "manual-technical-agreement"})
  | (AdoptionBase & {kind: "ai-source-mapping"; suggestionId: string; sourceText: string; sourceDigest: string; deliveryDigest: string; candidateIds: string[]; candidates: JourneyPlanCandidate[]});
export const JOURNEY_SUGGESTION_BYTES = 32 * 1024;
export const JOURNEY_ADOPTION_BYTES = 32 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
function reject(message: string): never {throw new DomainError(message, 409);}
function object(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DomainError("Journey suggestion records require plain JSON objects.");
  for (const key of Reflect.ownKeys(value)) if (typeof key !== "string" || !allowed.includes(key) || !("value" in Object.getOwnPropertyDescriptor(value, key)!)) throw new DomainError("Journey suggestion records contain unsupported fields.");
  if (required.some(key => !Object.hasOwn(value, key))) throw new DomainError("Journey suggestion records are missing required fields.");
  return value as Record<string, unknown>;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || CONTROL.test(value)) reject("Journey suggestion metadata is invalid.");
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) reject("Journey suggestion timestamps must use canonical UTC ISO values.");
  return value;
}
function bounded(value: unknown, max: number, label: string): void {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > max) throw new DomainError(`${label} exceeds its 32 KiB record limit.`, 413);
}
function current(quote: ProofQuote, deliveryId?: unknown): ProofDelivery {
  const delivery = quote.proof.delivery;
  if (!delivery || delivery.variant !== "upload" || !delivery.files || deliveryId !== undefined && deliveryId !== delivery.id) reject("Journey suggestions must use the exact current uploaded delivery.");
  return delivery;
}
function mutable(quote: ProofQuote, role: ProofRole): ProofDelivery {
  if (role !== "buyer") throw new DomainError("Only the buyer may generate or adopt journey-plan suggestions.", 403);
  const delivery = current(quote);
  if (quote.status !== "approved" || quote.proof.paymentOperation || ["captured", "voided", "closed_unpaid"].includes(quote.proof.paymentState)
    || quote.proof.collaboration?.stage === "accepted" || quote.proof.acceptedDeliveryId || delivery.runtimeRun || delivery.journeyRun || delivery.transferCompetitionRun || delivery.journeyPlan) reject("This delivery is no longer open for journey-plan suggestions or adoption.");
  return delivery;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const equal = (left: unknown, right: unknown): boolean => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

/** Validate a retained provider result against the complete current scope and
 * exact upload. Reparse the proposal to independently recover source offsets,
 * capability meaning, conflicts and the optional complete recipe. */
export async function validateSavedJourneySuggestions(quote: ProofQuote, value: unknown = quote.proof.delivery?.journeyPlanSuggestions): Promise<SavedJourneyPlanSuggestions | undefined> {
  if (value === undefined) return;
  bounded(value, JOURNEY_SUGGESTION_BYTES, "Journey suggestions");
  const saved = object(value, ["id", "sourceText", "sourceDigest", "mode", "model", "generatedAt", "candidates", "unresolved", "recipeSuggestion", "warnings", "usage", "deliveryId", "deliveryDigest"], ["id", "sourceText", "sourceDigest", "mode", "model", "generatedAt", "candidates", "unresolved", "warnings", "deliveryId", "deliveryDigest"]);
  const delivery = current(quote, saved.deliveryId), context = journeySuggestionContext(quote, "buyer", {confirm: true});
  if (saved.deliveryId !== delivery.id || typeof saved.id !== "string" || !UUID.test(saved.id) || saved.mode !== "live" || saved.sourceText !== context.sourceText || typeof saved.sourceDigest !== "string" || !DIGEST.test(saved.sourceDigest)
    || saved.sourceDigest !== await journeySuggestionDigest(context.sourceText) || typeof saved.deliveryDigest !== "string" || !DIGEST.test(saved.deliveryDigest) || saved.deliveryDigest !== await runtimeDeliveryDigest(delivery.files)) reject("The saved journey suggestions belong to another original scope or uploaded delivery.");
  text(saved.model, 120); timestamp(saved.generatedAt);
  if (!Array.isArray(saved.warnings) || saved.warnings.length < 1 || saved.warnings.length > 4) reject("Journey suggestions need bounded warning text.");
  saved.warnings.forEach(warning => text(warning, 2000));
  if (saved.usage !== undefined) {
    const usage = object(saved.usage, ["promptTokens", "completionTokens"]);
    if (!Number.isSafeInteger(usage.promptTokens) || !Number.isSafeInteger(usage.completionTokens) || Number(usage.promptTokens) < 0 || Number(usage.completionTokens) < 0) reject("Journey suggestion token metadata is invalid.");
  }
  if (!Array.isArray(saved.candidates) || saved.candidates.length > 12 || !Array.isArray(saved.unresolved) || saved.unresolved.length > 12) reject("Journey suggestions exceed the supported candidate limits.");
  const candidates = saved.candidates.map(value => {
    const candidate = object(value, ["id", "criterionId", "source", "capability", "value"], ["id", "criterionId", "source", "capability"]);
    return {criterionId: candidate.criterionId, capability: candidate.capability, ...(candidate.value !== undefined ? {value: candidate.value} : {})};
  });
  const unresolved = saved.unresolved.map(value => {
    const row = object(value, ["criterionId", "source", "reason"]);
    return {criterionId: row.criterionId, reason: row.reason};
  });
  const parsed = parseJourneyPlanProposal({candidates, unresolved}, context);
  if (!equal(parsed.candidates, saved.candidates) || !equal(parsed.unresolved, saved.unresolved) || !equal(parsed.recipeSuggestion, saved.recipeSuggestion)) reject("The saved journey suggestion source mapping or recipe changed.");
  return structuredClone(value) as SavedJourneyPlanSuggestions;
}

/** The request precondition is checked before provider I/O. Its payload cannot
 * submit alternate source text, capabilities, IDs or a client-confirmed plan. */
export async function prepareJourneySuggestionRequest(quote: ProofQuote, role: ProofRole, value: unknown): Promise<{confirm: true; language?: "zh" | "en"}> {
  const delivery = mutable(quote, role);
  const request = object(value, ["confirm", "language", "deliveryId", "sourceDigest"], ["confirm", "deliveryId", "sourceDigest"]);
  if (request.deliveryId !== delivery.id) reject("The uploaded delivery changed. Refresh before requesting journey suggestions.");
  const context = journeySuggestionContext(quote, role, {confirm: request.confirm, ...(request.language !== undefined ? {language: request.language} : {})});
  if (request.sourceDigest !== await journeySuggestionDigest(context.sourceText)) reject("The original requirement text changed. Refresh before requesting journey suggestions.");
  if (delivery.journeyPlanAdoption) reject("This delivery already has a retained journey-plan adoption.");
  return {confirm: true, ...(request.language !== undefined ? {language: request.language as "zh" | "en"} : {})};
}

export async function saveJourneySuggestions(quote: ProofQuote, role: ProofRole, request: unknown, suggestions: JourneyPlanSuggestions): Promise<ProofQuote> {
  await prepareJourneySuggestionRequest(quote, role, request);
  const delivery = current(quote), saved: SavedJourneyPlanSuggestions = {...structuredClone(suggestions), deliveryId: delivery.id, deliveryDigest: await runtimeDeliveryDigest(delivery.files)};
  await validateSavedJourneySuggestions(quote, saved);
  const next = structuredClone(quote); next.proof.delivery!.journeyPlanSuggestions = saved; return next;
}

function selectedCandidates(saved: SavedJourneyPlanSuggestions, value: unknown): JourneyPlanCandidate[] {
  if (!Array.isArray(value) || value.length !== JOURNEY_PLAN_CAPABILITIES.length || value.some(id => typeof id !== "string") || new Set(value).size !== value.length) reject("Explicitly select five unique supported journey candidates.");
  const selected = saved.candidates.filter(candidate => value.includes(candidate.id));
  if (!saved.recipeSuggestion || selected.length !== value.length || new Set(selected.map(candidate => candidate.capability)).size !== JOURNEY_PLAN_CAPABILITIES.length
    || !JOURNEY_PLAN_CAPABILITIES.every(capability => selected.some(candidate => candidate.capability === capability))) reject("The selected source mapping does not cover all five capabilities required by the fixed 20-step recipe.");
  return structuredClone(selected);
}

export async function adoptProjectJourneySuggestions(quote: ProofQuote, role: ProofRole, value: unknown, at = new Date().toISOString()): Promise<ProofQuote> {
  mutable(quote, role);
  const input = object(value, ["action", "deliveryId", "confirm", "suggestionId", "candidateIds", "sourceDigest"]);
  const delivery = current(quote, input.deliveryId);
  if (input.deliveryId !== delivery.id) reject("The uploaded delivery changed. Refresh before adopting journey suggestions.");
  if (input.action !== "adopt-suggestions" || input.confirm !== true) throw new DomainError("Explicitly confirm the selected source mapping and separate technical journey agreement.");
  const saved = await validateSavedJourneySuggestions(quote);
  if (!saved || input.suggestionId !== saved.id || input.sourceDigest !== saved.sourceDigest) reject("The journey suggestion changed. Refresh and review the exact saved suggestion before adopting it.");
  const selected = selectedCandidates(saved, input.candidateIds), plan = newProjectJourneyPlan(timestamp(at));
  const adoption: JourneyPlanAdoption = {kind: "ai-source-mapping", deliveryId: delivery.id, planDigest: plan.planDigest, confirmedAt: plan.confirmedAt,
    suggestionId: saved.id, sourceText: saved.sourceText, sourceDigest: saved.sourceDigest, deliveryDigest: saved.deliveryDigest, candidateIds: selected.map(candidate => candidate.id), candidates: selected};
  bounded(adoption, JOURNEY_ADOPTION_BYTES, "Journey-plan adoption");
  const next = structuredClone(quote); next.proof.delivery!.journeyPlan = plan; next.proof.delivery!.journeyPlanAdoption = adoption; return next;
}

/** Old plans may have no adoption record. A manual record carries no source
 * claim; a source-mapped record must retain the exact stored advice and choice. */
export async function validateSavedJourneyAdoption(quote: ProofQuote, value: unknown = quote.proof.delivery?.journeyPlanAdoption): Promise<JourneyPlanAdoption | undefined> {
  if (value === undefined) return;
  bounded(value, JOURNEY_ADOPTION_BYTES, "Journey-plan adoption");
  const raw = object(value, ["kind", "deliveryId", "planDigest", "confirmedAt", "suggestionId", "sourceText", "sourceDigest", "deliveryDigest", "candidateIds", "candidates"], ["kind", "deliveryId", "planDigest", "confirmedAt"]);
  const delivery = current(quote, raw.deliveryId), plan = savedProjectJourneyPlan(quote);
  if (raw.deliveryId !== delivery.id || !plan || raw.planDigest !== plan.planDigest || timestamp(raw.confirmedAt) !== plan.confirmedAt) reject("The saved journey adoption does not match this delivery's confirmed technical agreement.");
  if (raw.kind === "manual-technical-agreement") {
    object(value, ["kind", "deliveryId", "planDigest", "confirmedAt"]);
  } else if (raw.kind === "ai-source-mapping") {
    object(value, ["kind", "deliveryId", "planDigest", "confirmedAt", "suggestionId", "sourceText", "sourceDigest", "deliveryDigest", "candidateIds", "candidates"]);
    const saved = await validateSavedJourneySuggestions(quote);
    if (!saved || raw.suggestionId !== saved.id || raw.sourceText !== saved.sourceText || raw.sourceDigest !== saved.sourceDigest || raw.deliveryDigest !== saved.deliveryDigest) reject("The adopted journey source mapping no longer matches its retained suggestions.");
    const selected = selectedCandidates(saved, raw.candidateIds);
    if (!equal(raw.candidateIds, selected.map(candidate => candidate.id)) || !equal(raw.candidates, selected) || raw.deliveryId !== delivery.id) reject("The adopted journey candidates or their original source references changed.");
  } else reject("Unknown journey-plan adoption provenance.");
  return structuredClone(value) as JourneyPlanAdoption;
}

export async function journeySuggestionState(quote: ProofQuote): Promise<{suggestions: SavedJourneyPlanSuggestions | null; adoption: JourneyPlanAdoption | null; deliveryId: string | null; sourceDigest: string}> {
  return {suggestions: await validateSavedJourneySuggestions(quote) ?? null, adoption: await validateSavedJourneyAdoption(quote) ?? null,
    deliveryId: quote.proof.delivery?.id ?? null, sourceDigest: await journeySuggestionDigest(quote.summary.trim())};
}
