import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {DomainError} from "../lib/domain.ts";
import {confirmCoverage, summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {JOURNEY_PLAN_CAPABILITIES, journeySuggestionContext, journeySuggestionDigest, parseJourneyPlanProposal, type JourneyPlanSuggestions} from "../lib/journey-plan-suggestions.ts";
import {adoptProjectJourneySuggestions, journeySuggestionState, prepareJourneySuggestionRequest, saveJourneySuggestions, validateSavedJourneyAdoption, validateSavedJourneySuggestions} from "../lib/journey-plan-adoption.ts";
import {confirmProjectJourneyPlan} from "../lib/project-journey-actions.ts";
import {PROJECT_JOURNEY_PLAN_DIGEST, newProjectJourneyPlan} from "../lib/project-journey.ts";

const at = "2026-11-03T00:00:00.000Z";
const clauses = ["Each booking accepts at most 6 people.", "Each time slot accepts at most 8 guests in total.",
  "Cancellation releases capacity once and repeated cancellation has no further effect.",
  "A rejected move preserves the original booking and a successful move changes the same booking atomically.",
  "After a lost response query the original booking and retry with the same key without creating another booking."];
function quote(sourceText = clauses.join("\n")): ProofQuote {
  const coverage = confirmCoverage(sourceText, {version: 1, sourceText, confirmed: true, decisions: summaryCoverageUnits(sourceText).map(row => ({id: row.id, disposition: "include"}))});
  return {id: "synthetic-journey-adoption", summary: sourceText, language: "en", status: "approved", paymentMode: "demo",
    proof: {project: {coverage, requiredPages: ["index.html"], manualRequirements: []}, criteria: coverage.decisions.map(row => ({id: row.criterionId!, title: row.id, source: row.text})),
      delivery: {id: "synthetic-upload-1", variant: "upload", label: "Synthetic upload", submittedAt: at, evidence: [], files: {"index.html": "<!doctype html><html><body>Synthetic booking</body></html>"}},
      paymentState: "unfunded", audit: [], collaboration: {stage: "in_progress", feedback: []}}} as unknown as ProofQuote;
}
async function advice(q: ProofQuote, count = 5): Promise<JourneyPlanSuggestions> {
  const context = journeySuggestionContext(q, "buyer", {confirm: true});
  const proposal = parseJourneyPlanProposal({candidates: JOURNEY_PLAN_CAPABILITIES.slice(0, count).map((capability, index) => ({criterionId: `coverage-${index + 1}`, capability, ...(index < 2 ? {value: index ? 8 : 6} : {})})), unresolved: []}, context);
  return {id: "12345678-1234-4234-8234-123456789abc", sourceText: context.sourceText, sourceDigest: await journeySuggestionDigest(context.sourceText), mode: "live", model: "synthetic-no-network", generatedAt: at,
    ...proposal, warnings: ["Unconfirmed source mapping; no website was executed and no acceptance or payment is authorized."]};
}
async function request(q: ProofQuote) {return {confirm: true, deliveryId: q.proof.delivery!.id, sourceDigest: await journeySuggestionDigest(q.summary), language: "en"};}
async function saved(q = quote(), count = 5) {return saveJourneySuggestions(q, "buyer", await request(q), await advice(q, count));}
function adopt(q: ProofQuote) {const value = q.proof.delivery!.journeyPlanSuggestions!;return {action: "adopt-suggestions", deliveryId: value.deliveryId, sourceDigest: value.sourceDigest, suggestionId: value.id, candidateIds: value.candidates.map(candidate => candidate.id), confirm: true};}
function persisted<T>(value: T): T {return JSON.parse(JSON.stringify(value));}
const conflict = (error: unknown) => error instanceof DomainError && error.status === 409;

test("saved AI suggestions survive reload with exact source and upload binding without confirming a plan", async () => {
  const original = quote(), before = structuredClone(original), result = await saved(original), restored = persisted(result);
  const state = await journeySuggestionState(restored);
  assert.deepEqual(original, before);assert.equal(state.deliveryId, original.proof.delivery!.id);assert.equal(state.suggestions!.sourceText, original.summary);
  assert.match(state.suggestions!.deliveryDigest, /^[a-f0-9]{64}$/u);assert.deepEqual(await validateSavedJourneySuggestions(restored), state.suggestions);
  assert.equal(restored.proof.delivery!.journeyPlan, undefined);assert.equal(state.adoption, null);assert.equal(restored.proof.paymentState, "unfunded");assert.deepEqual(restored.proof.audit, []);
});

test("generation preconditions reject seller, stale delivery, source digest and forged input before provider work", async () => {
  const q = quote(), input = await request(q);
  await assert.rejects(() => prepareJourneySuggestionRequest(q, "seller", input), (error: unknown) => error instanceof DomainError && error.status === 403);
  for (const value of [{...input, deliveryId: "old-delivery"}, {...input, sourceDigest: "a".repeat(64)}, {...input, sourceText: q.summary}, {...input, role: "buyer"}, {...input, confirm: false}, {confirm: true}]) await assert.rejects(() => prepareJourneySuggestionRequest(q, "buyer", value), DomainError);
  const changed = structuredClone(q);changed.summary += "Changed.";await assert.rejects(() => prepareJourneySuggestionRequest(changed, "buyer", input), conflict);
  for (const stage of ["accepted", "captured", "pending-run", "confirmed-plan"] as const) {
    const closed = structuredClone(q);
    if (stage === "accepted") closed.proof.collaboration!.stage = "accepted";
    if (stage === "captured") closed.proof.paymentState = "captured";
    if (stage === "pending-run") closed.proof.delivery!.journeyRun = {id: "pending"} as NonNullable<typeof closed.proof.delivery>["journeyRun"];
    if (stage === "confirmed-plan") closed.proof.delivery!.journeyPlan = newProjectJourneyPlan(at);
    await assert.rejects(() => prepareJourneySuggestionRequest(closed, "buyer", input), conflict);
  }
});

test("only an explicit current suggestion and five selected capabilities create the fixed plan and frozen mapping", async () => {
  const q = await saved(), before = structuredClone(q), input = adopt(q), result = persisted(await adoptProjectJourneySuggestions(q, "buyer", input, at));
  assert.deepEqual(q, before);assert.deepEqual(result.proof.delivery!.journeyPlan, newProjectJourneyPlan(at));assert.equal(result.proof.delivery!.journeyPlan!.planDigest, PROJECT_JOURNEY_PLAN_DIGEST);
  const adoption = await validateSavedJourneyAdoption(result);assert.ok(adoption);assert.equal(adoption.kind, "ai-source-mapping");
  if (adoption.kind !== "ai-source-mapping") throw new Error("Missing source mapping");
  assert.deepEqual(adoption.candidateIds, input.candidateIds);assert.equal(adoption.suggestionId, q.proof.delivery!.journeyPlanSuggestions!.id);
  for (const candidate of adoption.candidates) assert.equal(adoption.sourceText.slice(candidate.source.start, candidate.source.end), candidate.source.excerpt);
  assert.equal(result.proof.paymentState, "unfunded");assert.equal(result.proof.delivery!.journeyReport, undefined);assert.equal(result.proof.collaboration!.stage, "in_progress");
  await assert.rejects(() => adoptProjectJourneySuggestions(result, "buyer", input), conflict);
  await assert.rejects(() => saveJourneySuggestions(result, "buyer", {confirm: true, deliveryId: result.proof.delivery!.id, sourceDigest: input.sourceDigest}, result.proof.delivery!.journeyPlanSuggestions!), conflict);
});

test("partial, duplicated, nonexistent and stale selections cannot silently adopt the full twenty-step recipe", async () => {
  const q = await saved(), input = adopt(q), before = structuredClone(q);
  for (const value of [{...input, confirm: false}, {...input, suggestionId: "stale-suggestion"}, {...input, sourceDigest: "f".repeat(64)}, {...input, deliveryId: "old-upload"}, {...input, candidateIds: input.candidateIds.slice(0, 4)}, {...input, candidateIds: [...input.candidateIds.slice(0, 4), input.candidateIds[0]]}, {...input, candidateIds: [...input.candidateIds.slice(0, 4), "not-a-candidate"]}, {...input, source: {start: 0, end: 1}}]) await assert.rejects(() => adoptProjectJourneySuggestions(q, "buyer", value), DomainError);
  await assert.rejects(() => adoptProjectJourneySuggestions(q, "seller", input), (error: unknown) => error instanceof DomainError && error.status === 403);
  const partial = await saved(quote(), 2);assert.equal(partial.proof.delivery!.journeyPlanSuggestions!.recipeSuggestion, undefined);
  await assert.rejects(() => adoptProjectJourneySuggestions(partial, "buyer", adopt(partial)), conflict);assert.deepEqual(q, before);
});

test("unrelated unresolved original clauses remain visible without blocking a complete supported capability mapping", async () => {
  const q = await saved(quote([...clauses, "Show a photo of the restaurant."].join("\n"))), suggestions = q.proof.delivery!.journeyPlanSuggestions!;
  assert.equal(suggestions.unresolved.length, 1);assert.equal(suggestions.unresolved[0].source.excerpt, "Show a photo of the restaurant.");
  const result = await adoptProjectJourneySuggestions(q, "buyer", adopt(q), at);assert.equal(result.proof.delivery!.journeyPlan!.planDigest, PROJECT_JOURNEY_PLAN_DIGEST);
  assert.deepEqual(result.proof.delivery!.journeyPlanSuggestions!.unresolved, suggestions.unresolved);
});

test("restored mappings reject tampered source, capabilities, file bytes, timestamps and detached adoption snapshots", async () => {
  const q = await saved(), mutations: ((q: ProofQuote) => void)[] = [
    q => {q.proof.delivery!.journeyPlanSuggestions!.candidates[0].source.start++;},
    q => {q.proof.delivery!.journeyPlanSuggestions!.candidates[0].value = 7;},
    q => {q.proof.delivery!.journeyPlanSuggestions!.sourceDigest = "0".repeat(64);},
    q => {q.proof.delivery!.journeyPlanSuggestions!.deliveryId = "other-upload";},
    q => {q.proof.delivery!.files!["index.html"] += "changed";},
    q => {q.proof.delivery!.journeyPlanSuggestions!.generatedAt = "bad-time";},
  ];
  for (const mutate of mutations) {const changed = structuredClone(q);mutate(changed);await assert.rejects(() => validateSavedJourneySuggestions(changed), DomainError);}
  const adopted = await adoptProjectJourneySuggestions(q, "buyer", adopt(q), at), changed = structuredClone(adopted), mapping = changed.proof.delivery!.journeyPlanAdoption!;
  if (mapping.kind !== "ai-source-mapping") throw new Error("Missing mapping");mapping.candidates[0].criterionId = "coverage-2";
  await assert.rejects(() => validateSavedJourneyAdoption(changed), DomainError);
  const detached = structuredClone(adopted);delete detached.proof.delivery!.journeyPlanSuggestions;await assert.rejects(() => validateSavedJourneyAdoption(detached), conflict);
});

test("manual confirmation remains compatible and cannot falsely inherit saved AI source provenance", async () => {
  const q = await saved(), manual = confirmProjectJourneyPlan(q, "buyer", {action: "confirm-plan", deliveryId: q.proof.delivery!.id, confirm: true}, at), adoption = await validateSavedJourneyAdoption(manual);
  assert.deepEqual(manual.proof.delivery!.journeyPlan, newProjectJourneyPlan(at));assert.deepEqual(adoption, {kind: "manual-technical-agreement", deliveryId: q.proof.delivery!.id, planDigest: PROJECT_JOURNEY_PLAN_DIGEST, confirmedAt: at});
  await assert.rejects(() => adoptProjectJourneySuggestions(manual, "buyer", adopt(q)), conflict);
  const legacy = structuredClone(manual);delete legacy.proof.delivery!.journeyPlanAdoption;assert.equal(await validateSavedJourneyAdoption(legacy), undefined);
});

test("32 KiB limits reject oversized advice and adoption independently", async () => {
  const q = quote(), huge = await advice(q);huge.warnings = ["界".repeat(12 * 1024)];
  await assert.rejects(() => saveJourneySuggestions(q, "buyer", {confirm: true, deliveryId: q.proof.delivery!.id, sourceDigest: huge.sourceDigest}, huge), (error: unknown) => error instanceof DomainError && error.status === 413);
  const adopted = await saved().then(q => adoptProjectJourneySuggestions(q, "buyer", adopt(q), at));
  const oversized = {...adopted.proof.delivery!.journeyPlanAdoption, sourceText: "界".repeat(12 * 1024)};
  await assert.rejects(() => validateSavedJourneyAdoption(adopted, oversized), (error: unknown) => error instanceof DomainError && error.status === 413);
});
