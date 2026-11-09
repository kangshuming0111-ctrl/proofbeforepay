import type { ProofAcceptanceEvidence } from "./contracts.ts";
import { deliveryOverview, type DeliveryOverviewInput } from "./delivery-overview.ts";
import { withheldAssessmentRisks } from "./assessment-display.ts";

export function frozenDeliveryAssessment(snapshot: ProofAcceptanceEvidence, deliveryId: string) {
  if (snapshot.deliveryId !== deliveryId || !snapshot.assessmentId
    || snapshot.assessment?.id !== snapshot.assessmentId || snapshot.assessment.deliveryId !== deliveryId) return undefined;
  return snapshot.assessment;
}

function summarize(input: DeliveryOverviewInput, frozen: boolean) {
  const assessment = input.delivery.assessment;
  const withheld = assessment?.deliveryId === input.delivery.id && assessment.risks.length === 0
    ? withheldAssessmentRisks(assessment, input.criteria) : undefined;
  const withheldRiskCount = withheld && withheld.reason !== "not_withheld" && withheld.entries.length <= 5
    && withheld.entries.every((entry, index) => entry?.originalRiskIndex === index && entry.risk) ? withheld.entries.length : 0;
  return {kind: "ready" as const, frozen, ...deliveryOverview(input), withheldRiskCount};
}

/** Read-only display. Never mix later checks into the evidence the buyer accepted. */
export function plainDeliverySummary(input: DeliveryOverviewInput & { accepted: boolean; snapshot?: ProofAcceptanceEvidence }) {
  if (input.accepted) {
    const snapshot = input.snapshot;
    if (!snapshot || snapshot.deliveryId !== input.delivery.id) return { kind: "unavailable" as const };
    const assessment = frozenDeliveryAssessment(snapshot, input.delivery.id);
    return summarize({
      delivery: { ...input.delivery, evidence: snapshot.evidence, assessment, riskReviews: snapshot.riskReviews },
      criteria: snapshot.criteria, review: snapshot.review, manualChecks: snapshot.manualChecks,
    }, true);
  }
  return summarize(input, false);
}

export type PlainDeliverySummary = ReturnType<typeof plainDeliverySummary>;
