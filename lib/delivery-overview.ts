import type { Language, ProofAssessmentItem, ProofCriterion, ProofDelivery, ProofDeliveryVersion, ProofEvidence, ProofReview } from "./contracts.ts";

export type OverviewRuleFinding = ProofEvidence["finding"] | "unreviewed";
export type DeliveryOverviewRow = {
  criterion: ProofCriterion;
  rule: OverviewRuleFinding;
  ai?: ProofAssessmentItem;
  humanPending: boolean;
  explanation: string;
};
export type DeliveryOverviewInput = {
  delivery: ProofDelivery;
  criteria: ProofCriterion[];
  review?: ProofReview;
  manualChecks: string[];
  previousVersion?: ProofDeliveryVersion;
};

/** Display only: never rewrite the agreed requirement or its stored source reference. */
export function criterionDisplayTitle(criterion: ProofCriterion, language: Language): string {
  if (!/^(?:人工要求\s*\d+|Manual requirement\s*\d+)$/iu.test(criterion.title.trim())) return criterion.title;
  const source = criterion.source.replace(/\s+/gu, " ").trim();
  if (!source) return language === "zh" ? "已确认的要求" : "Agreed requirement";
  const characters = Array.from(source);
  return characters.length > 56 ? `${characters.slice(0, 55).join("")}…` : source;
}

function rowsFor(input: DeliveryOverviewInput): DeliveryOverviewRow[] {
  const reviewCurrent = input.review?.deliveryId === input.delivery.id;
  const assessment = input.delivery.assessment?.deliveryId === input.delivery.id ? input.delivery.assessment : undefined;
  const confirmed = new Set(input.manualChecks);
  return input.criteria.map(criterion => {
    const evidence = reviewCurrent ? input.delivery.evidence.filter(item => item.criterionId === criterion.id) : [];
    const rule: OverviewRuleFinding = evidence.some(item => item.finding === "fail") ? "fail"
      : evidence.some(item => item.finding === "needs_human") ? "needs_human"
      : evidence.length ? "pass" : "unreviewed";
    const ai = assessment?.items.find(item => item.criterionId === criterion.id);
    const explanation = rule === "fail" ? evidence.find(item => item.finding === "fail")!.explanation
      : ai?.status === "changes_suggested" ? ai.explanation
      : ai?.status === "insufficient_evidence" ? ai.explanation
      : evidence[0]?.explanation ?? "";
    return { criterion, rule, ai, humanPending: rule === "needs_human" && !confirmed.has(criterion.id), explanation };
  });
}

function metrics(input: DeliveryOverviewInput, rows: DeliveryOverviewRow[]) {
  const reviewCurrent = input.review?.deliveryId === input.delivery.id;
  const assessmentCurrent = input.delivery.assessment?.deliveryId === input.delivery.id;
  return {
    reviewCurrent,
    assessmentCurrent,
    ruleFailures: reviewCurrent ? rows.filter(row => row.rule === "fail").length : undefined,
    aiChanges: assessmentCurrent ? rows.filter(row => row.ai?.status === "changes_suggested").length : undefined,
    humanRemaining: reviewCurrent ? rows.filter(row => row.humanPending).length : undefined,
    unreviewed: rows.filter(row => row.rule === "unreviewed").length,
    aiInsufficient: assessmentCurrent ? rows.filter(row => row.ai?.status === "insufficient_evidence").length : undefined,
  };
}

/** All metrics stay separate: a single requirement may need attention in several categories. */
export function deliveryOverview(input: DeliveryOverviewInput) {
  const rows = rowsFor(input);
  const current = metrics(input, rows);
  const priority = (row: DeliveryOverviewRow) => row.rule === "fail" ? 0
    : row.ai?.status === "changes_suggested" ? 1 : row.humanPending ? 2
    : row.rule === "unreviewed" ? 3 : row.ai?.status === "insufficient_evidence" ? 4 : 5;
  const ordered = rows.map((row, index) => ({ row, index })).sort((a, b) => priority(a.row) - priority(b.row) || a.index - b.index).map(item => item.row);
  const previous = input.previousVersion;
  const previousSequence = previous?.delivery.sequence;
  const currentSequence = input.delivery.sequence;
  const older = previous && previous.isCurrent !== true && previous.delivery.id !== input.delivery.id
    && (previousSequence !== undefined && currentSequence !== undefined
      ? previousSequence < currentSequence
      : Date.parse(previous.delivery.submittedAt) < Date.parse(input.delivery.submittedAt));
  const previousInput = older ? { delivery: previous.delivery, criteria: input.criteria, review: previous.review, manualChecks: [] } : undefined;
  const previousMetrics = previousInput ? metrics(previousInput, rowsFor(previousInput)) : undefined;
  return {
    ...current,
    rows: ordered,
    previous: previousMetrics ? {
      sequence: previousSequence,
      // Only compare equivalent, saved checks bound to each exact delivery version.
      ruleFailures: previousMetrics.reviewCurrent && current.reviewCurrent ? previousMetrics.ruleFailures : undefined,
      aiChanges: previousMetrics.assessmentCurrent && current.assessmentCurrent ? previousMetrics.aiChanges : undefined,
    } : undefined,
  };
}

/** A draft is advice for the buyer to edit; calling this never sends a change request. */
export function overviewFeedbackDraft(row: DeliveryOverviewRow, deliveryId: string, language: Language) {
  const zh = language === "zh";
  const introduction = row.rule === "fail"
    ? zh ? "规则核查发现不符，请按已确认的要求修改：\n" : "Rule checks found a mismatch. Please revise against the agreed requirement:\n"
    : row.ai?.status === "changes_suggested"
      ? zh ? "AI 修改建议（待买家核对）：\n" : "AI change suggestion (for buyer review):\n"
      : zh ? "请补充可复查的交付证据（待买家核对）：\n" : "Please supply verifiable delivery evidence (for buyer review):\n";
  const comment = `${introduction}${row.criterion.source}\n${row.explanation}`.slice(0, 1000).replace(/[\uD800-\uDBFF]$/u, "");
  return { deliveryId, criterionId: row.criterion.id, comment };
}
