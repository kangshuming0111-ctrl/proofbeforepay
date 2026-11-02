import type { ProofQuote } from "./contracts.ts";
import { getBusinessCheckPlan } from "./business-checks.ts";
import { DomainError } from "./domain.ts";

export type BusinessDecision = { reportId: string; exceptionReason?: string };

/** A human acknowledges the exact saved run; browser observations never accept work. */
export function validateBusinessDecision(quote: ProofQuote, value: unknown): BusinessDecision | undefined {
  const plan = getBusinessCheckPlan(quote);
  if (!plan.length) return undefined;
  const report = quote.proof.delivery?.businessChecks;
  if (!report || report.deliveryId !== quote.proof.delivery?.id) throw new DomainError("Run the agreed business-content checks for this delivery before accepting it.", 409);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("Confirm the exact business-content report before accepting this delivery.", 409);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["reportId", "exceptionReason"].includes(key)) || input.reportId !== report.id) throw new DomainError("The business-content report changed. Review the latest report before accepting.", 409);
  if (input.exceptionReason !== undefined && (typeof input.exceptionReason !== "string" || input.exceptionReason.trim().length > 500)) throw new DomainError("The business-content exception reason must be text of at most 500 characters.");
  const exceptionReason = typeof input.exceptionReason === "string" ? input.exceptionReason.trim() : "";
  if ((report.summary.issues || report.summary.unavailable) && exceptionReason.length < 10) throw new DomainError("Request a revision or explain why you explicitly accept the mismatched or unverified business content.", 409);
  return {reportId: report.id, ...(exceptionReason ? {exceptionReason} : {})};
}

