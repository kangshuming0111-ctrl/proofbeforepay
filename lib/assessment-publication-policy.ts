import type {Language, ProofAssessment, ProofAssessmentItem} from "./contracts.ts";
import {staticFileKind} from "./static-resources.ts";

/** Semantic publication policy, after the caller has validated every model
 * item/risk field and exact citation. This is not malformed-response recovery:
 * it never supplies a missing risk field or relaxes an earlier rejection.
 * Model limitation prose is intentionally unavailable here: only its count may
 * inform a fixed system note, never become a verified detection fact. */
export function publishSourceAssessmentNotes(
  language: Language,
  items: readonly ProofAssessmentItem[],
  originalStatuses: ReadonlyMap<string, string>,
  risks: ProofAssessment["risks"],
  modelLimitationCount: number,
  files: Record<string, string>,
): {risks: ProofAssessment["risks"]; limitations: string[]; statusAdjustedCount: number} {
  if (!Number.isSafeInteger(modelLimitationCount) || modelLimitationCount < 0) throw new TypeError("Source publication needs a nonnegative model-limitation count.");
  const counts = {html: 0, css: 0, raster: 0};
  for (const file of Object.keys(files)) {
    const kind = staticFileKind(file);
    if (kind === "html" || kind === "css") counts[kind]++;
    else if (kind === "png" || kind === "jpeg" || kind === "webp") counts.raster++;
  }
  const zh = language === "zh";
  const limitations = [
    zh
      ? `已提供文件清单：HTML ${counts.html} 个、CSS ${counts.css} 个、栅格图片 ${counts.raster} 个。数量只说明文件已提供。本次源码评估未运行浏览器、脚本或后台，也未分析图片像素。`
      : `Supplied inventory: ${counts.html} HTML, ${counts.css} CSS and ${counts.raster} raster image file(s). Counts establish supplied files only. This source assessment did not run a browser, scripts or backend, or analyze image pixels.`,
    zh
      ? `模型提供了 ${modelLimitationCount} 条自述局限；其中事实未经独立核验，未作为检测事实发布。请以逐项证据和系统边界说明为准。`
      : `The model supplied ${modelLimitationCount} self-described limitations; their facts were not independently verified, so they are not published as detection findings. Use item evidence and system boundaries.`,
  ];
  const statusAdjustedCount = items.reduce((count, item) => count + Number(item.status !== originalStatuses.get(item.criterionId)), 0);
  if (statusAdjustedCount) {
    limitations.push(zh
      ? `${statusAdjustedCount} 项状态经系统调整，${risks.length} 条未复核风险暂不采纳，以逐项证据为准。这是发布范围限制，不代表验收、授权或付款。`
      : `${statusAdjustedCount} item status(es) were adjusted by system checks. ${risks.length} unreviewed optional AI risk(s) are temporarily withheld; use item-level evidence. This publication gate does not accept work, authorize or trigger payment.`);
    return {risks: [], limitations, statusAdjustedCount};
  }
  // Independent copies prevent later presentation edits from mutating the raw
  // validated response. Retained risks remain AI leads awaiting human review;
  // neither their presence nor this publication decision changes item status.
  return {risks: risks.map(risk => ({...risk, citations: risk.citations.map(citation => ({...citation}))})), limitations, statusAdjustedCount};
}
