import type { ProofQuote, ProofRole } from "./contracts.ts";
import { createBusinessCheckReport } from "./business-checks.ts";
import { withBusinessReport } from "./acceptance-evidence.ts";
import { DomainError } from "./domain.ts";

export function recordBusinessChecks(quote: ProofQuote, role: ProofRole, value: unknown, receivedAt?: string): ProofQuote {
  if (role !== "buyer" && role !== "seller") throw new DomainError("Only project members may save business-content observations.", 403);
  if (quote.status === "draft" || quote.proof.paymentOperation) throw new DomainError("Lock the scope and finish pending payment actions before checking business content.", 409);
  const report = {...createBusinessCheckReport(quote, value, receivedAt), reportedByRole: role};
  const next = structuredClone(quote);
  next.proof.delivery = withBusinessReport(next.proof.delivery!, report);
  next.proof.audit.push({kind: "business_checked", at: report.receivedAt, deliveryId: report.deliveryId, reportId: report.id});
  return next;
}
