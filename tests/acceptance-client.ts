import type {ProofQuote} from "../lib/contracts.ts";
import {acceptanceBasis} from "../lib/acceptance-basis.ts";
import {acceptDelivery as acceptDeliveryDomain} from "../lib/proof-workflow.ts";
import {validateAcceptance as validateAcceptanceDomain} from "../lib/proof-domain.ts";

/** Existing domain scenarios model a client looking at their current fixture.
 * Explicit caller tokens always win, so stale/malformed preconditions remain
 * testable; these helpers do not create or repair a saved acceptance snapshot. */
export function acceptDeliveryWithBasis(quote: ProofQuote, input: Record<string, unknown>, at?: string): ProofQuote {
  return acceptDeliveryDomain(quote, {expectedEvidence: acceptanceBasis(quote), ...input}, at);
}
export function validateAcceptanceWithBasis(quote: ProofQuote, input: Record<string, unknown>) {
  const frozen = quote.proof.acceptedEvidenceSnapshotId ?? quote.proof.collaboration?.acceptance?.evidenceSnapshotId;
  const precondition = quote.proof.collaboration || quote.proof.acceptedEvidenceSnapshotId || quote.proof.paymentOperation === "capture"
    ? {acceptedEvidenceSnapshotId: frozen}
    : {expectedEvidence: acceptanceBasis(quote)};
  return validateAcceptanceDomain(quote, {...precondition, ...input});
}
