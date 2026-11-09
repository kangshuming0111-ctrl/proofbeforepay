import type {Language, ProofAssessment, ProofAssessmentItem, ProofBrowserCheckReport, ProofCriterion} from "../../lib/contracts.ts";
import {isAssessmentEvidenceNeed} from "../../lib/assessment-evidence-needs.ts";
import {noodleNavigationTargets, type NoodleObservationReview} from "../../lib/noodle-observation-review.ts";
import {BILINGUAL_MENU_PRICE_COMPLETENESS, bilingualMenuPriceOriginal} from "../../lib/assessment-requirement-completeness.ts";
import {NOODLE_BROWSER_METHOD} from "../../lib/browser-check-report.ts";

export type MobileAssessmentObservation = {
  requiredPages: readonly string[];
  criterionIds?: readonly string[];
  onOpen?: () => void;
  disabled?: boolean;
};

export function mobileObservationPages(criterionId: string | undefined, observation?: MobileAssessmentObservation) {
  if (!criterionId || !observation) return;
  const {requiredPages, criterionIds} = observation;
  if (criterionId !== "mobile" && !criterionIds?.includes(criterionId)) return;
  if (requiredPages.length && requiredPages.every(file => typeof file === "string" && file.length > 0)) return requiredPages;
}

/** Current locked-clause reports carry a server-verified source publication.
 * Temporary source expectations are not saved as browser business checks. */
export function hasPublishedBilingualPriceSupport(criterion: ProofCriterion | undefined, item: ProofAssessmentItem | undefined, policy: ProofAssessment["requirementCompletenessPolicy"]) {
  return !!criterion && !!bilingualMenuPriceOriginal(criterion.source) && item?.criterionId === criterion.id
    && policy?.version === BILINGUAL_MENU_PRICE_COMPLETENESS && item.status === "supported"
    && item.sourceFinding?.status === "supported" && item.publicationBasis?.schema === "source-publication-v3"
    && item.publicationBasis.reason === "locked_price_match";
}

export function isUnresolvedBilingualPrice(criterion: ProofCriterion | undefined, item: ProofAssessmentItem | undefined, policy: ProofAssessment["requirementCompletenessPolicy"]) {
  return !!criterion && !!bilingualMenuPriceOriginal(criterion.source) && item?.criterionId === criterion.id
    && policy?.version === BILINGUAL_MENU_PRICE_COMPLETENESS && item.status === "insufficient_evidence";
}

export function noodleObservationMessage(review: NoodleObservationReview | undefined, criterionId: string, language: Language) {
  const kind = review?.items.find(item => item.criterionId === criterionId)?.kind;
  if (!review || !kind) return;
  const saved = review.state === "saved";
  if (language === "zh") return {
    title: saved ? "人工证据已写入本版验收记录" : "已勾选人工核对，待随本版验收保存",
    detail: kind === "navigation"
      ? "买家已确认从首页分别到达菜单页和联系页。"
      : "买家已确认本版约定页面的手机显示与导航。",
  };
  return {
    title: saved ? "Human check saved in this delivery’s acceptance" : "Human check selected, to be saved with acceptance",
    detail: kind === "navigation"
      ? "The buyer confirmed that both homepage links reach the menu and contact pages."
      : "The buyer confirmed mobile display and navigation on the agreed pages in this delivery.",
  };
}

export function hasSavedNoodleNavigation(criterion: ProofCriterion | undefined, report?: ProofBrowserCheckReport) {
  const routes = criterion && noodleNavigationTargets(criterion);
  return !!routes && report?.method === NOODLE_BROWSER_METHOD && routes.every(target => [375, 900].every(width => report.readings.some(reading =>
    reading.status === "observed" && reading.kind === "link" && reading.viewportWidth === width && reading.file === "index.html"
    && reading.target === target && reading.outcome === "expected_observation" && !!reading.clickedLabel && reading.reachedTarget === target)));
}

/** Wording and actions come from the locked requirement and the recorded
 * evidence reason. Model explanations never supply page names or missing facts. */
export function noodleEvidenceGuide(criterion: ProofCriterion | undefined, item: ProofAssessmentItem | undefined, language: Language, navigationReport?: ProofBrowserCheckReport) {
  if (!criterion || item?.criterionId !== criterion.id || item.status !== "insufficient_evidence"
    || !isAssessmentEvidenceNeed(item.evidenceNeed)) return;
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const {reason, targetFiles} = item.evidenceNeed;
  const routes = noodleNavigationTargets(criterion);
  if (routes && ["requirement_clarification", "direct_observation", "model_unresolved", "no_citations"].includes(reason)) {
    if (hasSavedNoodleNavigation(criterion, navigationReport)) return {
      title: tr("两条首页链接已保存点击证据", "Both homepage clicks have saved evidence"),
      actor: tr("买家", "Buyer"),
      instructions: tr("查看「首页导航回放证据」中的两条实际到达记录。核对后，勾选本项人工核对。", "Review both arrival records under Homepage navigation replay evidence, then select the human confirmation for this requirement."),
    };
    return {
      title: tr("还需核对首页的两条跳转", "Both homepage links still need testing"),
      actor: tr("买家", "Buyer"),
      instructions: tr(
        `打开「交付预览」并选首页，分别点击菜单和联系链接，核对是否到达 ${routes[0]} 和 ${routes[1]}。两条都点通后，勾选本项人工核对。如果有失败，把链接和实际结果写入修改意见。`,
        `Open Delivery preview and select the homepage. Click Menu and Contact separately and check that they reach ${routes[0]} and ${routes[1]}. If both work, select the human confirmation for this item. If either fails, include the link and observed result in your feedback.`,
      ),
    };
  }

  const price = bilingualMenuPriceOriginal(criterion.source);
  if (!price || !["page_scope", "page_citations", "field_relationship", "no_citations", "source_ambiguity", "requirement_clarification", "model_unresolved"].includes(reason)) return;
  const [first, second] = price.labels;
  const amount = `${price.currency} ${(price.amountMinor / 100).toFixed(price.amountMinor % 100 === 0 ? 0 : 2)}`;
  const file = targetFiles.length === 1 && reason !== "page_scope" ? targetFiles[0] : undefined;
  if (!file) return {
    title: tr("先确认验收所指的菜单文件", "Confirm the agreed menu file"),
    actor: tr("买卖双方", "Buyer and seller"),
    instructions: tr(
      `这份报告没有绑定唯一的菜单文件。请卖家指出约定中的菜单页文件，由买家确认。再在该页分别核对「${first}」和「${second}」各自对应 ${amount}。`,
      `This report has no single bound menu file. Ask the seller to identify the menu file in the agreement and confirm it. Then check that “${first}” and “${second}” each have their own ${amount} price on that page.`,
    ),
  };
  const title = reason === "model_unresolved"
    ? tr("模型与源码检查尚未形成一致结论", "The model and source check have not reached the same conclusion")
    : reason === "source_ambiguity"
    ? tr("菜单内容或结构仍待核对", "The menu content or structure still needs review")
    : reason === "page_citations" || reason === "no_citations"
    ? tr("缺少指定菜单页的可核对引文", "Verifiable citations from the agreed menu page are missing")
    : tr("还缺两种菜名各自对应价格的完整证据", "Each dish name needs its own price evidence");
  return {
    title,
    actor: tr("买家核对，必要时请卖家补证", "Buyer checks and asks the seller for evidence if needed"),
    instructions: tr(
      `打开「交付预览」里的 ${file}，分别核对「${first}」和「${second}」旁各自显示 ${amount}。若看不到其中一项，请卖家补该项在本版的菜名与价格位置；页面另一处相同金额不能代替。`,
      `Open ${file} in Delivery preview and check that “${first}” and “${second}” each show ${amount} next to their own name. If one is unavailable, ask the seller to point to that name and price in this version. A matching amount elsewhere on the page does not establish the pair.`,
    ),
  };
}
