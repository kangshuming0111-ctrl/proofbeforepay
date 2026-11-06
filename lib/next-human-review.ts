import type {ProofCriterion, ProofDelivery} from "./contracts.ts";

/** Navigation only. A current AI suggestion may choose which still-pending
 * human check to inspect first; it cannot confirm a check or decide acceptance.
 * Caller retains rule failures, running checks and financial state precedence. */
export function nextHumanReview(pending: readonly ProofCriterion[], delivery?: Pick<ProofDelivery, "id" | "assessment">): {
  criterion?: ProofCriterion; reason: "ai_change" | "checklist" | "complete";
} {
  if (!pending.length) return {reason: "complete"};
  const assessment = delivery?.assessment;
  if (assessment && assessment.deliveryId === delivery!.id) {
    const changes = new Set(assessment.items.filter(item => item.status === "changes_suggested").map(item => item.criterionId));
    const criterion = pending.find(item => changes.has(item.id));
    if (criterion) return {criterion, reason: "ai_change"};
  }
  return {criterion: pending[0], reason: "checklist"};
}
