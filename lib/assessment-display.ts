import type { ProofAssessment, ProofRiskReview, ProofRole } from "./contracts.ts";

const roles = ["buyer", "seller"] as const;

/** Display each participant's latest position; a review is not a resolved defect or acceptance. */
export function assessmentReviewSummary(report: ProofAssessment, reviews: ProofRiskReview[] = []) {
  const counts = () => ({ confirmed: 0, rejected: 0, needsEvidence: 0, unreviewed: 0 });
  const participants: Record<ProofRole, ReturnType<typeof counts>> = { buyer: counts(), seller: counts() };
  let unreviewed = 0, differingPositions = 0;
  for (let riskIndex = 0; riskIndex < report.risks.length; riskIndex++) {
    const positions = roles.map(role => reviews.findLast(review => review.deliveryId === report.deliveryId
      && review.assessmentId === report.id && review.riskIndex === riskIndex && review.actorRole === role));
    if (positions.every(position => !position)) unreviewed++;
    if (positions[0] && positions[1] && positions[0].decision !== positions[1].decision) differingPositions++;
    roles.forEach((role, index) => {
      const position = positions[index];
      if (!position) participants[role].unreviewed++;
      else if (position.decision === "confirmed") participants[role].confirmed++;
      else if (position.decision === "rejected") participants[role].rejected++;
      else participants[role].needsEvidence++;
    });
  }
  return { total: report.risks.length, unreviewed, differingPositions, participants };
}

/** Historical coverage stays intact; intentionally excluded image pixels are not missing text. */
export function assessmentCoverageGroups(report: ProofAssessment) {
  const raster = (file: string) => /\.(?:png|jpe?g|webp)$/iu.test(file);
  return {
    includedFiles: report.coverage.includedFiles,
    truncatedFiles: report.coverage.truncatedFiles,
    omittedTextFiles: report.coverage.omittedFiles.filter(file => !raster(file)),
    rasterFiles: report.coverage.omittedFiles.filter(raster),
  };
}
