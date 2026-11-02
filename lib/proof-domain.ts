import type { ProofPaymentReconciliation, ProofQuote, Quote } from "./contracts.ts";
import { DomainError, quoteTotal } from "./domain.ts";
import { assertCoverageForAcceptance } from "./requirement-coverage.ts";
import { validateBusinessDecision } from "./business-decision.ts";
import { assertAcceptedEvidenceReference } from "./acceptance-evidence.ts";

export function requireProof(quote: Quote): asserts quote is ProofQuote {
  if (quote.workflow !== "proof-v1" || !quote.proof) throw new DomainError("This record is not a ProofBeforePay agreement.");
  if (quoteTotal(quote.lineItems) !== quote.totalCents) throw new DomainError("The agreement amount is inconsistent.");
}

export function requireActiveAuthorization(quote: ProofQuote, now = Date.now()) {
  if (quote.status !== "approved" || quote.proof.paymentState !== "authorized" || !quote.proof.authorizationId) {
    throw new DomainError("A confirmed authorization is required before this action.");
  }
  if (!quote.proof.authorizationExpiresAt || !Number.isFinite(Date.parse(quote.proof.authorizationExpiresAt)) || (Date.parse(quote.proof.authorizationExpiresAt) <= now && quote.proof.paymentOperation !== "capture")) {
    throw new DomainError("This short-term authorization window has expired. Create a new agreement.");
  }
}

export function validateAcceptance(quote: ProofQuote, input: Record<string, unknown>) {
  requireActiveAuthorization(quote);
  assertCoverageForAcceptance(quote);
  if (quote.proof.collaboration || quote.proof.acceptedEvidenceSnapshotId) assertAcceptedEvidenceReference(quote);
  else validateBusinessDecision(quote, input.businessDecision);
  const { delivery, review, criteria } = quote.proof;
  if (input.confirm !== true) throw new DomainError("Explicit confirmation is required to accept delivery and capture payment.");
  if (!delivery || !review || review.deliveryId !== delivery.id || input.deliveryId !== delivery.id) throw new DomainError("Review the current delivery version before accepting it.");
  const evidence = delivery.evidence;
  if (!criteria.length || criteria.some(c => !evidence.some(e => e.criterionId === c.id))) throw new DomainError("The review does not cover every agreed requirement.");
  if (evidence.some(e => e.finding === "fail")) throw new DomainError("Resolve the failed requirements before accepting this delivery.");
  const required = [...new Set(evidence.filter(e => e.finding === "needs_human").map(e => e.criterionId))];
  if (!Array.isArray(input.manualChecks) || input.manualChecks.some(v => typeof v !== "string") || required.some(id => !(input.manualChecks as string[]).includes(id))) {
    throw new DomainError("Confirm each requirement that needs a human check.");
  }
  return required;
}


/** Apply only a verified provider outcome to the frozen operation; uncertainty never unlocks it. */
export function applyPaymentReconciliation(quote: ProofQuote, result: ProofPaymentReconciliation): ProofQuote {
  requireProof(quote);
  if (quote.status !== "approved" || quote.proof.paymentState !== "authorized" || !quote.proof.authorizationId || !quote.proof.paymentOperation) {
    throw new DomainError("Only a pending authorized payment can be reconciled.");
  }
  if (result.kind === "unresolved") return quote;
  if (!Number.isFinite(Date.parse(result.verifiedAt))) throw new DomainError("The payment verification time is invalid.");
  if (quote.captureId || quote.paidAt) throw new DomainError("The saved payment history needs manual reconciliation.");
  const audit = [...quote.proof.audit];
  if (result.kind === "captured") {
    const { acceptedDeliveryId, acceptedAt, delivery, manualChecks, authorizationExpiresAt } = quote.proof;
    if (quote.proof.paymentOperation !== "capture" || !acceptedAt || !Number.isFinite(Date.parse(acceptedAt))
      || !authorizationExpiresAt || Date.parse(acceptedAt) > Date.parse(authorizationExpiresAt)
      || Date.parse(acceptedAt) > Date.parse(result.verifiedAt)
      || acceptedDeliveryId !== delivery?.id) {
      throw new DomainError("PayPal found a capture, but the saved delivery acceptance needs manual reconciliation.");
    }
    validateAcceptance(quote, { confirm: true, deliveryId: acceptedDeliveryId, manualChecks });
    audit.push({ kind: "captured", at: result.verifiedAt, deliveryId: acceptedDeliveryId });
    audit.push({ kind: "payment_reconciled", at: result.verifiedAt, deliveryId: acceptedDeliveryId });
    return { ...quote, status: "paid", paidAt: result.verifiedAt, captureId: result.captureId,
      proof: { ...quote.proof, paymentState: "captured", paymentOperation: undefined, audit } };
  }
  audit.push({ kind: result.kind === "voided" ? "voided" : "payment_closed", at: result.verifiedAt });
  audit.push({ kind: "payment_reconciled", at: result.verifiedAt });
  return { ...quote, proof: { ...quote.proof, paymentState: result.kind, paymentOperation: undefined,
    ...(result.kind === "closed_unpaid" ? { paymentClosure: { reason: result.reason, verifiedAt: result.verifiedAt } } : {}), audit } };
}
