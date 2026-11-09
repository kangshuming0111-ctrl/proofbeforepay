import type { ProofAssessment, ProofAssessmentItem, ProofCriterion, ProofDelivery, ProofDeliveryVersion, ProofEvidence, ProofFeedback, ProofLayoutReading, ProofReview } from "./contracts.ts";
import { deliveryLayoutSummary } from "./delivery-layout-summary.ts";

export type ComparisonUnavailableReason = "no_previous" | "not_older" | "no_report" | "different_delivery" | "no_criterion_evidence" | "invalid_report" | "no_file_readings";
export type ComparisonSection<T> = { state: "available"; data: T } | { state: "unavailable"; reason: ComparisonUnavailableReason };
export type ComparedDelivery = Pick<ProofDelivery, "id" | "label" | "sequence" | "submittedAt">;
export type CriterionVersionEvidence = {
  rules: ComparisonSection<{ evidence: ProofEvidence[]; reviewedAt: string }>;
  ai: ComparisonSection<{ item: ProofAssessmentItem; reportId: string; model: string; assessedAt: string; coverage: ProofAssessment["coverage"]; limitations: string[] }>;
  browser: ComparisonSection<{ readings: ProofLayoutReading[]; relation: "referenced_files" | "delivery_wide"; receivedAt: string }>;
};
export type DeliveryComparisonInput = {
  delivery: ProofDelivery;
  review?: ProofReview;
  criteria: ProofCriterion[];
  previousVersion?: ProofDeliveryVersion;
  feedback?: ProofFeedback[];
};
export type DeliveryComparisonResult = {
  current: ComparedDelivery;
  previous: ComparisonSection<ComparedDelivery>;
  rows: { criterion: ProofCriterion; previousFeedback: ProofFeedback[]; previous?: CriterionVersionEvidence; current: CriterionVersionEvidence }[];
};

const unavailable = (reason: ComparisonUnavailableReason): { state: "unavailable"; reason: ComparisonUnavailableReason } => ({ state: "unavailable", reason });
const metadata = ({ id, label, sequence, submittedAt }: ProofDelivery): ComparedDelivery => ({ id, label, sequence, submittedAt });

/** Sequence establishes order only, never quality; contradictory timestamps are rejected. */
export function isOlderDelivery(previous: ProofDeliveryVersion, current: ProofDelivery): boolean {
  if (previous.isCurrent === true || !previous.delivery.id || !current.id || previous.delivery.id === current.id) return false;
  const oldSequence = previous.delivery.sequence, newSequence = current.sequence;
  const oldTime = Date.parse(previous.delivery.submittedAt), newTime = Date.parse(current.submittedAt);
  const timesKnown = Number.isFinite(oldTime) && Number.isFinite(newTime);
  if (Number.isSafeInteger(oldSequence) && Number(oldSequence) > 0 && Number.isSafeInteger(newSequence) && Number(newSequence) > 0) {
    return oldSequence! < newSequence! && (!timesKnown || oldTime <= newTime);
  }
  return timesKnown && oldTime < newTime;
}

function evidenceFor(delivery: ProofDelivery, review: ProofReview | undefined, criterionId: string): CriterionVersionEvidence {
  const evidence = delivery.evidence.filter(item => item.criterionId === criterionId);
  const rules: CriterionVersionEvidence["rules"] = !review ? unavailable("no_report")
    : review.deliveryId !== delivery.id ? unavailable("different_delivery")
    : !evidence.length ? unavailable("no_criterion_evidence")
    : { state: "available", data: { evidence, reviewedAt: review.reviewedAt } };
  const assessment = delivery.assessment;
  const items = assessment?.items.filter(item => item.criterionId === criterionId) ?? [];
  const ai: CriterionVersionEvidence["ai"] = !assessment ? unavailable("no_report")
    : assessment.deliveryId !== delivery.id ? unavailable("different_delivery")
    : items.length !== 1 ? unavailable(items.length ? "invalid_report" : "no_criterion_evidence")
    : { state: "available", data: { item: items[0], reportId: assessment.id, model: assessment.model, assessedAt: assessment.assessedAt, coverage: assessment.coverage, limitations: assessment.limitations } };

  // A file association does not establish that a layout reading verifies this criterion.
  const referencedFiles = new Set([
    ...(rules.state === "available" ? rules.data.evidence.map(item => item.file) : []),
    ...(ai.state === "available" ? ai.data.item.citations.map(item => item.file) : []),
  ].filter(file => /\.html$/iu.test(file)));
  const layout = deliveryLayoutSummary(delivery);
  let browser: CriterionVersionEvidence["browser"];
  if (layout.state !== "current") browser = unavailable(layout.state === "unmeasured" ? "no_report" : layout.state === "stale" ? "different_delivery" : "invalid_report");
  else {
    const report = delivery.layoutReport!;
    const readings = referencedFiles.size ? report.readings.filter(reading => referencedFiles.has(reading.file)) : report.readings;
    browser = readings.length
      ? { state: "available", data: { readings, relation: referencedFiles.size ? "referenced_files" : "delivery_wide", receivedAt: report.receivedAt } }
      : unavailable("no_file_readings");
  }
  return { rules, ai, browser };
}

/** Read-only projections. No aggregate improvement, acceptance or payment decision is inferred. */
export function buildDeliveryComparison(input: DeliveryComparisonInput): DeliveryComparisonResult {
  const previousVersion = input.previousVersion;
  const previous = previousVersion && isOlderDelivery(previousVersion, input.delivery) ? previousVersion : undefined;
  const rows = input.criteria.map(criterion => {
    const feedback = new Map<string, ProofFeedback>();
    // The immutable snapshot wins if a caller also supplies an overlapping feedback list.
    for (const item of [...(previous?.feedback ?? []), ...(input.feedback ?? [])]) {
      if (previous && item.deliveryId === previous.delivery.id && item.criterionId === criterion.id && !feedback.has(item.id)) feedback.set(item.id, item);
    }
    return {
      criterion,
      previousFeedback: [...feedback.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
      ...(previous ? { previous: evidenceFor(previous.delivery, previous.review, criterion.id) } : {}),
      current: evidenceFor(input.delivery, input.review, criterion.id),
    };
  });
  // Consumers may expand or annotate a projection without changing immutable source records.
  return structuredClone({
    current: metadata(input.delivery),
    previous: previous ? { state: "available", data: metadata(previous.delivery) } : unavailable(previousVersion ? "not_older" : "no_previous"),
    rows,
  });
}
