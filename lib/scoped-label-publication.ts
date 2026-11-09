import type { ProofAssessmentCitation, ProofAssessmentItem, ProofAssessmentSourceFinding, ProofCriterion } from "./contracts.ts";
import type { SourceFindingScope } from "./assessment-source-findings.ts";
import { ASSESSMENT_ITEM_CITATION_LIMIT } from "./assessment-limits.ts";
import { parseSourceLiteralDirective } from "./source-literal-directive.ts";

type ScopedLabelPublication =
  | { kind: "not_applicable" }
  | { kind: "unresolved_scope" }
  | { kind: "unwitnessed"; file: string }
  | { kind: "witnessed"; explanation: string; citations: ProofAssessmentCitation[] };

function exactSourceSpan(files: Record<string, string>, citation: ProofAssessmentCitation): boolean {
  return Object.hasOwn(files, citation.file)
    && Number.isSafeInteger(citation.start) && Number.isSafeInteger(citation.end)
    && citation.start >= 0 && citation.end > citation.start && citation.end <= files[citation.file].length
    && files[citation.file].slice(citation.start, citation.end) === citation.excerpt;
}

/** The scope and source fact are server-derived. The original model must quote
 * every label span in the actual agreed owner before we publish a positive. */
export function assessScopedLabelPublication(
  criterion: ProofCriterion,
  scope: SourceFindingScope | undefined,
  fact: ProofAssessmentSourceFinding | undefined,
  raw: ProofAssessmentItem["modelJudgment"],
  files: Record<string, string>,
): ScopedLabelPublication {
  const directive = parseSourceLiteralDirective(criterion.source);
  const state = scope?.states.find(entry => entry.criterionId === criterion.id);
  if (directive?.kind !== "html_labels" || !state || state.status === "none") return { kind: "not_applicable" };

  const bindings = scope?.bindings.filter(entry => entry.criterionId === criterion.id && entry.criterionSource === criterion.source) ?? [];
  if (state.status !== "confirmed" || bindings.length !== 1) return { kind: "unresolved_scope" };
  const binding = bindings[0];
  const unwitnessed = { kind: "unwitnessed", file: binding.file } as const;
  const reference = fact?.scopeBinding;
  if (fact?.basis !== "declared_html_labels" || fact.status !== "supported"
    || reference?.proposalId !== binding.proposalId || reference.proposalDigest !== binding.proposalDigest
    || reference.file !== binding.file || reference.kind !== binding.kind || reference.formId !== binding.formId
    || fact.citations.length !== directive.labels.length || !fact.citations.length
    || fact.citations.length > ASSESSMENT_ITEM_CITATION_LIMIT) return unwitnessed;

  if (raw?.status !== "supported" || !raw.citations.length || raw.citations.length > ASSESSMENT_ITEM_CITATION_LIMIT
    || raw.citations.some(citation => !exactSourceSpan(files, citation))) return unwitnessed;
  const witnessed = fact.citations.every(span => span.file === binding.file && exactSourceSpan(files, span)
    && raw.citations.some(citation => citation.file === span.file && citation.start <= span.start && citation.end >= span.end));
  if (!witnessed) return unwitnessed;

  return { kind: "witnessed", explanation: fact.explanation, citations: structuredClone(fact.citations) };
}
