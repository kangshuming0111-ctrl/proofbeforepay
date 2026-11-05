import type { Language, ProofAssessment, ProofAssessmentRisk, ProofRiskReview, ProofRole } from "./contracts.ts";

const roles = ["buyer", "seller"] as const;

/** Display each participant's latest position; a review is not a resolved defect or acceptance. */
export function assessmentReviewSummary(report: ProofAssessment, reviews: ProofRiskReview[] = []) {
  const counts = () => ({ confirmed: 0, rejected: 0, needsEvidence: 0, unreviewed: 0 });
  const participants: Record<ProofRole, ReturnType<typeof counts>> = { buyer: counts(), seller: counts() };
  let unreviewed = 0, differingPositions = 0;
  for (let riskIndex = 0; riskIndex < report.risks.length; riskIndex++) {
    const positions = roles.map(role => reviews.findLast(review => review.deliveryId === report.deliveryId
      && review.assessmentId === report.id && review.riskOrigin === undefined && review.riskIndex === riskIndex && review.actorRole === role));
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

/** A conservative reading aid, never a replacement for the saved model answer.
 * A missing pixel observation must not be presented as an observed image defect.
 * Other source indications remain unverified even when their quotations match.
 * This does not infer semantic correctness, resolve a risk or change acceptance. */
export function assessmentRiskPresentation(report: ProofAssessment, risk: ProofAssessmentRisk, language: Language) {
  const zh = language === "zh";
  const content = `${risk.title}\n${risk.explanation}\n${risk.suggestion}`;
  const hasRasterExclusion = assessmentCoverageGroups(report).rasterFiles.length > 0;
  const quotesImage = risk.citations.some(citation => /<img\b|(?:background(?:-image)?\s*:)[^;}]*\.(?:png|jpe?g|webp)\b/iu.test(citation.excerpt));
  const aboutImageSubject = /\b(?:image|photo|picture|poster|pixels?|subject)\b|图片|图像|照片|像素/iu.test(content);
  const asksForObservation = /\b(?:inspect|verify|confirm|check)\b[^.\n]{0,100}\b(?:pixels?|subject|whether\s+it\s+shows)\b|(?:核对|检查|确认|查看)[^。\n]{0,60}(?:像素|图片内容|图片主体)|(?:像素|图片主体)[^。\n]{0,50}(?:未验证|未核验|无法确认)/iu.test(content);
  const imageEvidenceGap = hasRasterExclusion && quotesImage && aboutImageSubject && asksForObservation;
  return {
    kind: imageEvidenceGap ? "image_evidence_gap" as const : "unverified_source_indication" as const,
    label: imageEvidenceGap ? (zh ? "待补证据" : "Evidence needed") : (zh ? "尚未证实的源码线索" : "Unverified source indication"),
    title: imageEvidenceGap ? (zh ? "图片主体尚未验证" : "Image subject has not been verified") : risk.title,
    explanation: imageEvidenceGap
      ? (zh ? "模型没有看到图片像素。这条记录提示补充实际图片观察，不计为已发现的视觉缺陷；原始模型措辞保留在下方。" : "The model did not receive image pixels. This entry calls for an image observation and is not an observed visual defect. The original model wording is retained below.")
      : (zh ? "源码引文可核对，但问题是否成立仍需验证。双方意见另行记录，不会自动改变验收或付款。" : "The source quotation is inspectable; the alleged problem still needs verification. Participant positions are recorded separately and do not decide acceptance or payment."),
    nextStep: imageEvidenceGap
      ? (zh ? "查看对应图片和实际页面，记录是否符合约定的主体；再确认、驳回或请求更多证据。" : "Inspect the supplied image and rendered page against the agreed subject, then record a position or request more evidence.")
      : risk.suggestion,
    originalTitle: risk.title,
  };
}
