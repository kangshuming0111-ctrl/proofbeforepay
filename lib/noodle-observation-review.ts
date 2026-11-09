import type {ProofAcceptanceEvidence, ProofAssessment, ProofCriterion, ProofEvidence, ProofReview} from "./contracts.ts";
import {isAssessmentEvidenceNeed} from "./assessment-evidence-needs.ts";

const navigation = /^网站包含首页、菜单页 ([\w-]+\.html) 和联系页 ([\w-]+\.html)，首页可打开菜单页和联系页。$/u;

export function noodleNavigationTargets(criterion: ProofCriterion) {
  const match = navigation.exec(criterion.source.trim());
  if (match && match[1] !== match[2]) return [match[1], match[2]] as const;
}

export type NoodleObservationReview = {
  state: "draft" | "saved";
  items: {criterionId: string; kind: "navigation" | "mobile"}[];
};

type ObservationReviewInput = {
  deliveryId: string;
  report?: ProofAssessment;
  criteria: readonly ProofCriterion[];
  evidence: readonly ProofEvidence[];
  review?: ProofReview;
  mobileCriterionIds?: readonly string[];
  selectedChecks?: readonly string[];
  snapshot?: ProofAcceptanceEvidence;
};

/** Read-only projection of exact-version human evidence over source-only unknowns. */
export function noodleObservationReview({deliveryId, report, criteria, evidence, review, mobileCriterionIds, selectedChecks, snapshot}: ObservationReviewInput): NoodleObservationReview | undefined {
  if (!report || report.deliveryId !== deliveryId || review?.deliveryId !== deliveryId) return;
  if (snapshot && (snapshot.deliveryId !== deliveryId || snapshot.assessmentId !== report.id
    || snapshot.assessment?.id !== report.id || snapshot.assessment.deliveryId !== deliveryId
    || snapshot.review?.deliveryId !== deliveryId)) return;

  const confirmations = snapshot?.manualChecks ?? selectedChecks;
  if (!confirmations?.length) return;
  const rows = snapshot?.evidence ?? evidence;
  const lockedCriteria = snapshot?.criteria ?? criteria;
  const items: NoodleObservationReview["items"] = [];
  for (const item of report.items) {
    if (item.status !== "insufficient_evidence" || !confirmations.includes(item.criterionId)
      || item.sourceFinding?.status === "changes_suggested" || item.modelJudgment?.status === "changes_suggested") continue;
    const criterion = lockedCriteria.find(row => row.id === item.criterionId);
    if (!criterion || !isAssessmentEvidenceNeed(item.evidenceNeed)) continue;
    const {reason} = item.evidenceNeed;
    const kind = noodleNavigationTargets(criterion) && ["requirement_clarification", "direct_observation", "model_unresolved", "no_citations"].includes(reason)
      ? "navigation" : mobileCriterionIds?.includes(criterion.id) && ["browser_observation", "direct_observation"].includes(reason) ? "mobile" : undefined;
    const findings = rows.filter(row => row.criterionId === criterion.id);
    if (kind && findings.some(row => row.finding === "needs_human") && !findings.some(row => row.finding === "fail")) {
      items.push({criterionId: criterion.id, kind});
    }
  }
  if (items.length) return {state: snapshot ? "saved" : "draft", items};
}
