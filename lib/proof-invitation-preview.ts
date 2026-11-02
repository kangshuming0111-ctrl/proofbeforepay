import type { ProofBusinessCheck, ProofQuote } from "./contracts.ts";
import { getBusinessCheckPlan } from "./business-checks.ts";
import { coverageCriteria, validateSavedCoverage } from "./requirement-coverage.ts";
import { DomainError } from "./domain.ts";

/** A member-scoped invitation preview includes the exact saved operational
 * expectations, not only their broader original requirement text. */
export function proofInvitationPreview(quote: ProofQuote) {
  const businessChecks: ProofBusinessCheck[] = getBusinessCheckPlan(quote)
    .filter(step => step.viewportWidth === 375)
    .map(({checkId, criterionId, file, source, expected}) => ({id: checkId, criterionId, file, source, expected}));
  const coverage = quote.proof.project?.coverage ? validateSavedCoverage(quote.proof.project.coverage) : undefined;
  if (coverage && (coverage.sourceText !== quote.summary.trim() || coverageCriteria(coverage, quote.language)
    .some(item => !quote.proof.criteria.some(criterion => criterion.id === item.id && criterion.source === item.source)))) {
    throw new DomainError("The saved scope changed. Review the exact requirements before joining.", 409);
  }
  return structuredClone({id: quote.id, reference: quote.reference, title: quote.title, summary: quote.summary,
    currency: quote.currency, totalCents: quote.totalCents, language: quote.language, paymentMode: quote.paymentMode,
    criteria: quote.proof.criteria, businessChecks, ...(coverage ? {coverage} : {})});
}
