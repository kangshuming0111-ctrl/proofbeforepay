import {ProviderError} from "./providers.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";

export type AssessmentFailureReason = "structure" | "output_limit" | "incomplete" | "citation" | "missing_items" | "duplicate_items" | "unknown_items" | "risk_fields";
export type AssessmentCoverageDiagnostic = {
  expectedCriterionIds: readonly string[];
  missingCriterionIds: readonly string[];
  duplicateCriterionIds: readonly string[];
  unknownCriterionCount: number;
};
const MESSAGES: Record<AssessmentFailureReason, string> = {
  structure: "AI returned an invalid response structure.",
  output_limit: "AI output reached the configured response limit and is incomplete.",
  incomplete: "AI returned an incomplete response.",
  citation: "AI source citation validation failed; a quotation or file was not found in the supplied source.",
  missing_items: "AI omitted one or more required criterion responses.",
  duplicate_items: "AI repeated one or more criterion responses.",
  unknown_items: "AI returned responses for criteria outside the confirmed checklist.",
  risk_fields: "An AI risk entry has missing or invalid detail fields.",
};
/** Safe machine-readable diagnostics only. Unknown model IDs and model text are
 * never attached; known IDs come exclusively from the validated locked input. */
export class AssessmentResponseError extends ProviderError {
  readonly reason: AssessmentFailureReason;
  readonly coverage?: AssessmentCoverageDiagnostic;
  constructor(reason: AssessmentFailureReason, coverage?: AssessmentCoverageDiagnostic) {
    super(`${MESSAGES[reason]} The saved rules and buyer decisions remain unchanged.`);
    this.reason = reason;
    if (coverage) this.coverage = Object.freeze({
      expectedCriterionIds: Object.freeze([...coverage.expectedCriterionIds]),
      missingCriterionIds: Object.freeze([...coverage.missingCriterionIds]),
      duplicateCriterionIds: Object.freeze([...coverage.duplicateCriterionIds]),
      unknownCriterionCount: coverage.unknownCriterionCount,
    });
  }
}
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,80}$/u;
const ITEM_KEYS = ["criterionId", "status", "explanation", "citations"] as const;
function fail(): never {throw new AssessmentResponseError("structure");}
function shell(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const r = value as Record<string, unknown>;
  if (Reflect.ownKeys(r).length !== ITEM_KEYS.length || ITEM_KEYS.some(key => !Object.hasOwn(r, key)) || Reflect.ownKeys(r).some(key => typeof key !== "string" || !ITEM_KEYS.includes(key as typeof ITEM_KEYS[number]) || !("value" in Object.getOwnPropertyDescriptor(r, key)!))) fail();
  if (typeof r.criterionId !== "string" || !r.criterionId.trim() || r.criterionId.length > 80 || CONTROL.test(r.criterionId)
    || typeof r.status !== "string" || !["supported", "changes_suggested", "insufficient_evidence"].includes(r.status)
    || typeof r.explanation !== "string" || !r.explanation.trim() || r.explanation.length > 600 || CONTROL.test(r.explanation)
    || !Array.isArray(r.citations) || r.citations.length > ASSESSMENT_ITEM_CITATION_LIMIT) fail();
  return r;
}

/** Coverage classification follows valid item shells and ID uniqueness. This
 * rejects the complete response; it does not salvage or fabricate partial items. */
export function requireAssessmentItemCoverage(value: unknown, trustedExpectedIds: readonly string[]): Record<string, unknown>[] {
  if (!Array.isArray(trustedExpectedIds) || !trustedExpectedIds.length || trustedExpectedIds.length > 33 || trustedExpectedIds.some(id => typeof id !== "string" || !IDENTIFIER.test(id)) || new Set(trustedExpectedIds).size !== trustedExpectedIds.length || !Array.isArray(value) || value.length > 33) fail();
  const items = value.map(shell), known = new Set(trustedExpectedIds), counts = new Map<string, number>(); let unknown = 0;
  for (const item of items) {const id = item.criterionId as string; if (known.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1); else unknown++;}
  const coverage: AssessmentCoverageDiagnostic = {
    expectedCriterionIds: [...trustedExpectedIds],
    missingCriterionIds: trustedExpectedIds.filter(id => !counts.has(id)),
    duplicateCriterionIds: trustedExpectedIds.filter(id => (counts.get(id) ?? 0) > 1),
    unknownCriterionCount: unknown,
  };
  if (coverage.duplicateCriterionIds.length) throw new AssessmentResponseError("duplicate_items", coverage);
  if (unknown) throw new AssessmentResponseError("unknown_items", coverage);
  if (coverage.missingCriterionIds.length) throw new AssessmentResponseError("missing_items", coverage);
  return items;
}
