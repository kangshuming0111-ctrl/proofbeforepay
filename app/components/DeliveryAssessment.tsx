"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileSearch, LoaderCircle, Quote, TriangleAlert } from "lucide-react";
import type { Language, ProofAssessment, ProofAssessmentCitation, ProofBrowserCheckReport, ProofBusinessCheckStep, ProofCriterion, ProofQuote, ProofRiskReview, ProofRole } from "@/lib/contracts";
import { criterionDisplayTitle } from "@/lib/delivery-overview";
import "../assessment.css";
import { RiskReviewPanel } from "./RiskReviewPanel";
import {RiskFeedbackAction, type RiskFeedbackDraft} from "./RiskRepairPanel";
import { AssessmentValidationPanel } from "./AssessmentValidationPanel";
import { assessmentCriterionSource, buildAssessmentFeedbackDraft } from "./assessment-feedback";
import type { RiskReviewInput } from "@/lib/risk-reviews";
import { assessmentCoverageGroups, assessmentReviewSummary, assessmentRiskPresentation, withheldAssessmentRisks } from "@/lib/assessment-display";
import {assessmentEvidenceNeedPresentation, isAssessmentEvidenceNeed} from "@/lib/assessment-evidence-needs";
import {AssessmentObligations} from "./AssessmentObligations";
import {BILINGUAL_MENU_PRICE_COMPLETENESS, createRequirementCompletenessCheck, requirementCompletenessExplanation} from "@/lib/assessment-requirement-completeness";
import {openingHoursEvidenceGuide} from "./noodle-hours-guidance";
import {hasPublishedBilingualPriceSupport, hasSavedNoodleNavigation, isUnresolvedBilingualPrice, mobileObservationPages, noodleEvidenceGuide, noodleObservationMessage, type MobileAssessmentObservation} from "./noodle-evidence-guidance";
import type {NoodleObservationReview} from "@/lib/noodle-observation-review";
import {browserCheckMethodFor, NOODLE_BROWSER_METHOD} from "@/lib/browser-check-report";
import {NavigationReplayEvidence} from "./NavigationReplayEvidence";

export type DeliveryAssessmentProps = {
  report?: ProofAssessment;
  criteria: ProofCriterion[];
  scopeSteps?: ProofBusinessCheckStep[];
  confirmedCriteria?: readonly string[];
  language: Language;
  selectedCriterionId?: string;
  enabled?: boolean;
  busy?: boolean;
  configured?: boolean;
  onRun?: () => void;
  onPrepareFeedback?: (input: { deliveryId: string; criterionId: string; comment: string } | RiskFeedbackDraft) => void;
  readOnly?: boolean;
  riskReviews?: ProofRiskReview[];
  actorRole?: ProofRole;
  onSaveRiskReview?: (value: RiskReviewInput) => Promise<boolean>;
  mobileObservation?: MobileAssessmentObservation;
  observationReview?: NoodleObservationReview;
  navigationReport?: ProofBrowserCheckReport;
  navigationQuote?: ProofQuote;
  navigationArchived?: boolean;
  navigationAccepted?: boolean;
  onOpenNavigationChecks?: () => void;
  navigationChecksDisabled?: boolean;
};

function displayTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : value;
}

function Citations({ citations, language }: { citations: ProofAssessmentCitation[]; language: Language }) {
  const zh = language === "zh";
  if (!citations.length) return <p className="assessment-no-citation">{zh ? "没有可核对的源码引用。" : "No source citation is available to inspect."}</p>;
  return <details className="assessment-citations">
    <summary><Quote size={12} aria-hidden="true" />{zh ? `查看源码引用（${citations.length}）` : `Inspect source citations (${citations.length})`}<ChevronDown size={13} aria-hidden="true" /></summary>
    <ol>{citations.map((citation, index) => <li key={`${citation.file}-${citation.start}-${citation.end}-${index}`}>
      <div className="assessment-citation-location"><code>{citation.file}</code><span>{zh ? "字符区间" : "Character range"} [{citation.start}, {citation.end})</span></div>
      <pre><code>{citation.excerpt}</code></pre>
    </li>)}</ol>
  </details>;
}

export function DeliveryAssessment({ report, criteria, scopeSteps = [], confirmedCriteria = [], language, selectedCriterionId, enabled = false, busy = false, configured = false, onRun, onPrepareFeedback, readOnly = false, riskReviews, actorRole, onSaveRiskReview, mobileObservation, observationReview, navigationReport, navigationQuote, navigationArchived, navigationAccepted, onOpenNavigationChecks, navigationChecksDisabled }: DeliveryAssessmentProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const id = useId();
  const panelRef = useRef<HTMLDetailsElement>(null);
  const [initiallyExpanded] = useState(!readOnly);
  const navigationEvidence = navigationReport?.method === NOODLE_BROWSER_METHOD
    && navigationReport.deliveryId === (report?.deliveryId ?? navigationQuote?.proof.delivery?.id) ? navigationReport : undefined;
  const showNavigationCheck = !navigationEvidence && !navigationAccepted && !readOnly && !!onOpenNavigationChecks && navigationQuote
    && browserCheckMethodFor(navigationQuote) === NOODLE_BROWSER_METHOD;
  const selectedItem = selectedCriterionId ? report?.items.find(item => item.criterionId === selectedCriterionId) : report?.items[0];
  const otherItems = report?.items.filter(item => item !== selectedItem) ?? [];
  const remainingEvidence = report?.items.filter(item => item.status === "insufficient_evidence"
    && !observationReview?.items.some(row => row.criterionId === item.criterionId)).length;
  const reviewSummary = report ? assessmentReviewSummary(report, riskReviews) : undefined;
  const coverage = report ? assessmentCoverageGroups(report) : undefined;
  const poolMarker = report?.withheldRisks as {version?:unknown;reason?:unknown}|undefined;
  const unboundNamespace = poolMarker?.version === 4 || poolMarker?.reason === "optional_source_leads_unverified";
  const publishedRiskCount = unboundNamespace ? 0 : report?.risks.length ?? 0;
  const hasSourcePublication = !!report?.items.some(item => ["source-publication-v1", "source-publication-v2", "source-publication-v3"].includes(item.publicationBasis?.schema ?? ""));
  const withheld = withheldAssessmentRisks(report, criteria);
  const titleFor = (criterionId: string) => {
    const criterion = criteria.find(item => item.id === criterionId);
    return criterion ? criterionDisplayTitle(criterion, language) : criterionId;
  };
  const statusLabel = (status: ProofAssessment["items"][number]["status"]) => ({
    supported: tr("建议符合", "Suggestion: supported"),
    changes_suggested: tr("建议修改", "Suggestion: changes"),
    insufficient_evidence: tr("证据不足", "Suggestion: insufficient evidence"),
  })[status];

  useEffect(() => {
    if (busy && panelRef.current) panelRef.current.open = true;
  }, [busy]);

  function renderItem(item: ProofAssessment["items"][number], selected = false) {
    const sourcePublication = ["source-publication-v1", "source-publication-v2", "source-publication-v3"].includes(item.publicationBasis?.schema ?? "") ? item.publicationBasis : undefined;
    const sourceFinding=item.sourceFinding;
    const criterion = criteria.find(criterion => criterion.id === item.criterionId);
    const observation = noodleObservationMessage(observationReview, item.criterionId, language);
    const mobilePages = mobileObservationPages(criterion?.id, mobileObservation);
    const pairedMobile = !!mobilePages && (mobileObservation?.criterionIds?.length ?? 0) > 1;
    const mobileNeed = !!mobilePages && isAssessmentEvidenceNeed(item.evidenceNeed)
      && (item.evidenceNeed.reason === "browser_observation" || pairedMobile && item.evidenceNeed.reason === "direct_observation");
    const guide = noodleEvidenceGuide(criterion, item, language, navigationEvidence);
    const navigationObserved = hasSavedNoodleNavigation(criterion, navigationEvidence);
    const policy=report?.requirementCompletenessPolicy;
    const completeness=criterion&&policy?.schema==="requirement-completeness-v1"&&(policy.version==="bounded-original-zh-v1"||policy.version==="bilingual-bounded-v2"||policy.version==="bilingual-bounded-v3"||policy.version===BILINGUAL_MENU_PRICE_COMPLETENESS)
      ?createRequirementCompletenessCheck({businessSteps:scopeSteps,version:policy.version})(criterion):undefined;
    const incompleteSourceSupport=sourceFinding?.status==="supported"&&completeness?.kind==="incomplete"&&!hasPublishedBilingualPriceSupport(criterion,item,policy);
    const unresolvedPrice = isUnresolvedBilingualPrice(criterion,item,policy);
    const actionableSource=!incompleteSourceSupport&&!unresolvedPrice&&sourceFinding&&(sourceFinding.basis==="locked_business_values"||sourceFinding.scopeBinding)?sourceFinding:undefined;
    const feedbackItem=actionableSource?{...item,status:actionableSource.status,explanation:actionableSource.explanation,citations:actionableSource.citations,evidenceNeed:undefined}:item;
    const canPrepareFeedback = !observation && !(navigationObserved && feedbackItem.status === "insufficient_evidence")
      && !readOnly && !!onPrepareFeedback && feedbackItem.status !== "supported";
    const insufficient = item.status === "insufficient_evidence";
    const incompleteWholeRequirement=insufficient&&completeness?.kind==="incomplete"&&sourceFinding?.status!=="changes_suggested";
    const lockedSource = assessmentCriterionSource(criterion, item.criterionId);
    const hoursGuide = !readOnly && !confirmedCriteria.includes(item.criterionId) && incompleteWholeRequirement
      ? openingHoursEvidenceGuide(criterion, item, scopeSteps, policy, language) : undefined;
    const draft = canPrepareFeedback ? hoursGuide ? {comment:hoursGuide.draft, sourceExcerpted:false, explanationExcerpted:false, intent:undefined}
      : buildAssessmentFeedbackDraft(criterion, feedbackItem, language, scopeSteps, actionableSource?{basis:"independent_source",confirmedScope:!!actionableSource.scopeBinding}:undefined, guide?.instructions) : undefined;
    const evidenceNeed = insufficient ? assessmentEvidenceNeedPresentation(item.evidenceNeed, language) : undefined;
    const publishedDetails = observation ? <details className="assessment-published-record">
      <summary>{tr("查看当时的源码评估（证据不足）", "View the earlier source assessment (insufficient evidence)")}</summary>
      <p className="assessment-explanation">{item.explanation}</p>
      <Citations citations={item.citations} language={language} />
      {criterion && <AssessmentObligations criterion={criterion} value={item.obligations} language={language}/>}
    </details> : <>
      {guide ? !unresolvedPrice && <details className="assessment-published-record"><summary>{tr("查看报告原说明", "Inspect the report’s original explanation")}</summary><p className="assessment-explanation">{item.explanation}</p></details> : <p className="assessment-explanation">{item.explanation}</p>}
      {evidenceNeed && <section className="assessment-evidence-need" aria-label={tr("补证方向", "Evidence needed")}>
        <strong>{guide?.title ?? (incompleteWholeRequirement?tr("整条要求仍待核对", "The whole requirement still needs review"):evidenceNeed.reason)}</strong><p>{unresolvedPrice && guide ? item.explanation : guide?.instructions ?? (incompleteWholeRequirement&&completeness?requirementCompletenessExplanation(completeness,language):mobileNeed?tr("买家按下方已约定的全部页面逐页观察手机显示；缺页或无法观察时再请卖家补交。源码和宽度读数不能替代人工确认。", "The buyer inspects mobile presentation on every agreed page listed below. Ask the seller for missing or unobservable pages. Source and width readings do not replace human confirmation."):evidenceNeed.nextStep)}</p>
        {mobileNeed&&mobilePages&&<>
          <p><strong>{tr("约定的全部页面：", "All agreed pages: ")}</strong>{mobilePages.map((file,index)=><span key={`${index}-${file}`}>{index>0?" · ":""}<code>{file}</code></span>)}</p>
          {!readOnly&&mobileObservation?.onOpen&&<div className="assessment-feedback-action no-print"><button type="button" className="button primary" disabled={busy||!!mobileObservation.disabled} onClick={()=>{if(!busy&&!mobileObservation.disabled)mobileObservation.onOpen?.();}}>{tr("打开手机显示检查", "Open mobile checks")}</button><span>{tr("仅打开现有浏览器检查，不运行、确认、验收或付款。", "Opens existing checks only; does not run, confirm, accept or pay.")}</span></div>}
          <p>{tr("先用测量按钮记录各页宽度，再点结果中的 375px 查看；也可在现有预览中逐页选择 375px。预览停用脚本和外部资源，实际交互仍需另行验证。", "Use the measurement button to record page widths, then inspect their 375px results, or choose each page at 375px in the existing preview. Scripts and external resources are disabled; working interactions need separate verification.")}</p>
          {pairedMobile && <p>{tr("在 375px 下逐页核对正文可读、导航可操作且无需横向滚动。三页都核对后，勾选一次即可确认两项移动端要求。", "At 375px, check each page for readable text, usable navigation and no horizontal scrolling. After inspecting all three pages, confirm both mobile requirements with one checkbox.")}</p>}
        </>}
        {evidenceNeed.targetFiles.length > 0 && <details className="assessment-evidence-need-files"><summary>{tr(`相关源码文件（${evidenceNeed.targetFiles.length}）`, `Related source files (${evidenceNeed.targetFiles.length})`)}</summary>
          <ul>{evidenceNeed.targetFiles.map(file => <li key={file}><code>{file}</code></li>)}</ul>
        </details>}
        {!guide && !incompleteWholeRequirement && !mobileNeed && !evidenceNeed.legacy && !evidenceNeed.targetFiles.length && <p>{tr("尚未定位具体文件，请先按锁定要求确认范围。", "No exact target file was recorded; confirm the scope against the locked requirement.")}</p>}
      </section>}
      <Citations citations={item.citations} language={language} />
    </>;
    return <article className={`assessment-item${selected ? " assessment-item-selected" : ""}`} key={item.criterionId}>
      <div className="assessment-item-heading"><h4>{titleFor(item.criterionId)}</h4><span className={`assessment-status assessment-status-${observation ? "supported" : item.status}`}>{observation ? observation.title : sourcePublication ? item.status === "changes_suggested" ? tr("源码核验发布：不符", "Source-check publication: mismatch") : item.status === "supported" ? tr("源码核验发布：支持", "Source-check publication: supported") : tr("源码核验发布：未知", "Source-check publication: unknown") : statusLabel(item.status)}</span></div>
      {observation && <p className="assessment-explanation">{observation.detail}</p>}
      {sourcePublication && <p className="assessment-publication-basis">{sourcePublication.reason === "locked_price_mismatch" || sourcePublication.reason === "locked_price_match" ? tr("发布依据：已锁定菜品与价格的源码核验。", "Publication basis: source checks against the locked item and price.") : tr("发布依据：双方确认的表单范围内，约定标签的源码核验。", "Publication basis: agreed-label source checks within the form confirmed by both parties.")}{tr("原始模型判断独立保留；这不证明页面可见、实际保存或交付已验收。", " The original model judgment is retained separately. This does not prove visibility, actual storage or accepted delivery.")}</p>}
      {lockedSource !== undefined ? <details className="assessment-locked-source">
        <summary><Quote size={12} aria-hidden="true" />{tr("查看完整锁定原文", "Inspect complete locked wording")}<ChevronDown size={13} aria-hidden="true" /></summary>
        <p>{tr("原样保留的验收要求；界面语言切换不会翻译或缩写这段原文。", "The agreed wording is preserved exactly. Changing interface language does not translate or shorten this source.")}</p>
        <blockquote>{lockedSource}</blockquote>
      </details> : <p className="assessment-source-unavailable">{tr("尚未取得此项的锁定原文，暂不能生成带要求的补证草稿。请重新载入当前交付后核对。", "This criterion’s locked wording is unavailable, so an evidence request cannot be prepared. Reload the current delivery and check again.")}</p>}
      {sourceFinding&&<section className="assessment-source-finding" aria-label={tr("系统独立源码事实","Independent system source finding")}><strong>{tr("系统独立源码事实：","Independent source finding: ")}{incompleteSourceSupport?sourceFinding.basis==="locked_business_values"?tr("已核业务值有支持，整条要求仍待核对","Checked business values have support; the whole requirement still needs review"):tr("已核源码子条件有支持，整条要求仍待核对","Checked source subconditions have support; the whole requirement still needs review"):sourceFinding.status==="supported"?tr("源码关系支持","Source relation supported"):sourceFinding.status==="changes_suggested"?tr("发现源码差异","Source difference found"):tr("仅凭源码仍不确定","Source remains inconclusive")}</strong><p>{sourceFinding.explanation}</p><Citations citations={sourceFinding.citations} language={language}/></section>}
      {sourceFinding ? <details className="assessment-published-record"><summary>{sourcePublication ? tr("查看本次发布说明（源码核验）", "Inspect this publication’s source-check explanation") : tr("查看发布层原说明（独立保留）","Inspect the published explanation (retained separately)")}</summary>
        {sourceFinding.scopeBinding && <p className="assessment-record-basis">{sourcePublication ? tr("本次发布采用上方双方确认的表单范围和源码事实。范围确认不等于运行成功、验收或付款。", "This publication uses the confirmed form scope and source facts above. Scope confirmation does not establish execution, acceptance or payment.") : tr("这份报告的页面／表单范围依据见上方双方确认的源码事实。下方保留发布层原说明，不会撤销双方的范围确认；请按上方结论与下一步处理。","This report’s page/form scope is recorded in the two-sided source finding above. The original published explanation below does not revoke that agreement. Follow the source finding and next action above.")}</p>}
        {publishedDetails}
      </details> : publishedDetails}
      {item.modelJudgment&&<details className="assessment-original-model"><summary>{tr("查看原始模型判断（独立保留）","Inspect the original model judgment (retained separately)")}</summary><strong>{statusLabel(item.modelJudgment.status)}</strong><p>{item.modelJudgment.explanation}</p><Citations citations={item.modelJudgment.citations} language={language}/></details>}
      {!observation && hoursGuide && <section className="assessment-evidence-need" aria-label={hoursGuide.title}><strong>{hoursGuide.title}</strong><p>{hoursGuide.instructions}</p></section>}
      {!observation && criterion && <AssessmentObligations criterion={criterion} value={item.obligations} language={language}/>}
      {item.ruleEvidenceIds.length > 0 && <p className="assessment-rule-refs">{tr("已关联此要求的规则证据，可与下方核查结果对照。", "Linked to this requirement’s rule evidence; compare it with the rule findings below.")}</p>}
      {canPrepareFeedback && <div className="assessment-feedback-action no-print"><button type="button" className="assessment-feedback-button" disabled={busy || !draft} onClick={() => {
        if (!report || !draft) return;
        onPrepareFeedback?.({ deliveryId: report.deliveryId, criterionId: item.criterionId, comment: draft.comment });
      }}>{hoursGuide ? tr("起草营业时间补证请求", "Draft an opening-hours evidence request") : draft?.intent === "scope_clarification" ? tr("先澄清页面归属", "Clarify page scope") : feedbackItem.status === "insufficient_evidence" ? tr("请求补充证据", "Draft an evidence request") : tr("加入修改草稿", "Add to change draft")}</button><span>{tr("仅填入可编辑草稿，不会自动退回。", "Adds an editable draft without sending a change request.")}</span>{draft && (draft.sourceExcerpted || draft.explanationExcerpted) && <p className="assessment-draft-excerpt-note">{tr("草稿上限为 1000 字符，超长部分会明确标为节选。请展开完整锁定原文核对后再编辑发送。", "The draft has a 1000-character limit. Shortened sections are labelled as excerpts. Inspect the complete locked wording before editing and sending.")}</p>}</div>}
    </article>;
  }

  return <details className="delivery-assessment" ref={panelRef} open={initiallyExpanded} data-has-report={report ? "true" : "false"}>
    <summary className="assessment-heading" id={`${id}-heading`}>
      <span className="assessment-title"><FileSearch size={16} aria-hidden="true" />{hasSourcePublication ? tr("交付评估 · 含源码核验", "Delivery assessment · includes source checks") : tr("AI 逐条交付评估", "AI delivery assessment")}</span>
      <span className="assessment-state">{busy ? tr("评估中", "Assessing") : report ? hasSourcePublication ? tr("已保存的发布结论", "Saved publication findings") : tr("已保存的 AI 建议", "Saved AI suggestions") : readOnly ? tr("未保存评估", "No saved assessment") : tr("按需运行", "Run when needed")}</span>
      <ChevronDown className="assessment-chevron" size={15} aria-hidden="true" />
    </summary>

    <div className="assessment-body" aria-labelledby={`${id}-heading`}>
      <p className="assessment-purpose">{hasSourcePublication ? tr("标注“源码核验发布”的项目记录新增源码发布依据；其余保留原发布建议。模型原答另存，请逐项核对来源；这不是整站运行验证。", "Items marked as source-check publications record the added source basis; other items retain their original publication advice. Original model answers are separate. Inspect each item’s origin; this is not a whole-site execution check.") : tr("逐条比较已确认的要求与卖家源码；与规则检查、浏览器测量分开记录。请结合引用原文核对每条建议。", "Compares confirmed requirements with the seller's source files. Recorded separately from rule checks and browser measurements. Check each suggestion against the quoted source.")}</p>
      {navigationEvidence && <NavigationReplayEvidence report={navigationEvidence} quote={navigationQuote} language={language} archived={navigationArchived} accepted={navigationAccepted} deliveryLabel={navigationQuote?.proof.delivery?.label}/>}
      {showNavigationCheck && <div className="navigation-replay-prompt no-print">
        <p>{tr("保存首页两次点击的实际到达页，买卖双方可按交付版本核对。", "Save the arrival pages for both homepage clicks so each party can inspect them by delivery version.")}</p>
        <button type="button" className="button primary" onClick={onOpenNavigationChecks} disabled={busy || navigationChecksDisabled}>{tr("打开首页导航实测", "Open homepage navigation checks")}</button>
      </div>}
      {!readOnly&&<AssessmentValidationPanel language={language}/>}

      {!report ? <>
        {readOnly ? <p className="assessment-empty">{tr("此交付快照没有保存 AI 内容评估。", "No AI delivery assessment was saved with this delivery snapshot.")}</p> : <>
          <p className="assessment-consent" id={`${id}-consent`}>{tr("点击后，将把已确认的项目范围／简介、当前验收标准、交付文本源码和文件清单发送给 DeepSeek 分析，不发送图片像素。合同可选。", "When you click, the confirmed project scope/summary, current acceptance criteria, delivery text source and file inventory will be sent to DeepSeek. Image pixels are not sent. A contract is optional.")}</p>
          <button className="assessment-run no-print" type="button" onClick={onRun} disabled={!enabled || !configured || busy || !onRun} aria-describedby={`${id}-consent ${id}-limits`}>
            {busy ? <LoaderCircle className="assessment-spinner" size={14} aria-hidden="true" /> : <FileSearch size={14} aria-hidden="true" />}
            {busy ? tr("正在逐项评估…", "Assessing criteria…") : tr("用 DeepSeek 评估当前交付", "Assess current delivery with DeepSeek")}
          </button>
          {!configured && <p className="assessment-unavailable">{tr("尚未配置 DeepSeek 连接，暂不能运行 AI 评估。规则检查仍可使用。", "DeepSeek is not configured, so AI assessment is unavailable. Rule checks remain available.")}</p>}
          {configured && !enabled && !busy && <p className="assessment-unavailable">{tr("请先锁定标准、保存交付并核查当前版本；已验收或锁定的版本不能再运行。", "Lock the criteria, save the delivery and run its rule checks first. Accepted or locked versions cannot be assessed again.")}</p>}
        </>}
      </> : <>
        <div className="assessment-report-meta"><span>{tr("真实模型", "Live model")}: <code>{report.model}</code></span><span>{tr("评估于", "Assessed")} <time dateTime={report.assessedAt}>{displayTime(report.assessedAt)}</time></span></div>
        <p className="assessment-saved-note">{tr("显示此交付版本已保存的结果；查看不会再次调用模型。", "Showing the saved result for this delivery version. Viewing it does not call the model again.")}</p>
        {observationReview && <p className="assessment-saved-note" aria-live="polite">
          {observationReview.state === "saved"
            ? tr(`本版验收已记录 ${observationReview.items.length} 项人工补证`, `This delivery’s acceptance records ${observationReview.items.length} human checks`)
            : tr(`已勾选 ${observationReview.items.length} 项人工核对，待随本版验收保存`, `${observationReview.items.length} human checks selected, to be saved with acceptance`)}
          {" · "}{tr(`仍待补证 ${remainingEvidence} 项`, `${remainingEvidence} evidence requests left`)}
        </p>}
        <div className="assessment-findings" role="region" aria-label={hasSourcePublication ? tr("逐项发布结论与原始模型记录", "Published criterion findings and original model records") : tr("AI 逐项内容评估", "AI criterion assessments")}>
          {selectedItem ? renderItem(selectedItem, true) : <p className="assessment-empty">{selectedCriterionId ? tr("此报告没有当前所选标准的建议，不能据此视为通过。", "This report has no suggestion for the selected criterion; it cannot be treated as a pass.") : tr("此报告没有逐项建议。", "This report has no criterion suggestions.")}</p>}
          {otherItems.length > 0 && <details className="assessment-other-items"><summary>{tr(`查看其余 ${otherItems.length} 条要求`, `Inspect the other ${otherItems.length} criteria`)}<ChevronDown size={13} aria-hidden="true" /></summary><div>{otherItems.map(item => renderItem(item))}</div></details>}
        </div>
        <details className="assessment-risks"><summary><TriangleAlert size={13} aria-hidden="true" />{tr(`已发布、待核查的 AI 线索（${publishedRiskCount}）`, `Published AI indications to review (${publishedRiskCount})`)}<ChevronDown size={13} aria-hidden="true" /></summary>
          <div className="assessment-risk-body">{publishedRiskCount ? <><p className="assessment-risk-notice">{tr("源码线索尚未运行验证，需要复现后确认。", "Source-level indications have not been verified by execution. Reproduce them before drawing a conclusion.")}</p>
            {reviewSummary && <section className="assessment-review-summary" aria-label={tr("潜在线索的人工复核概览", "Human review summary for potential issues")}>
              <strong>{tr(`共 ${reviewSummary.total} 条线索，${reviewSummary.unreviewed} 条尚无人工记录`, `Potential issues: ${reviewSummary.total}; without any human record: ${reviewSummary.unreviewed}`)}</strong>
              <dl>{(["buyer", "seller"] as const).map(role => { const positions = reviewSummary.participants[role]; return <div key={role}><dt>{role === "buyer" ? tr("买家最新意见", "Buyer’s latest positions") : tr("卖家最新意见", "Seller’s latest positions")}</dt><dd>{tr(`核实 ${positions.confirmed} · 驳回 ${positions.rejected} · 仍需证据 ${positions.needsEvidence} · 未记录 ${positions.unreviewed}`, `Confirmed ${positions.confirmed} · Rejected ${positions.rejected} · Needs evidence ${positions.needsEvidence} · No record ${positions.unreviewed}`)}</dd></div>; })}</dl>
              {!!reviewSummary.differingPositions && <p className="assessment-review-difference" role="status">{tr(`双方在 ${reviewSummary.differingPositions} 条线索上的最新意见不同，请核对各自理由。`, `Issues with differing participant positions: ${reviewSummary.differingPositions}. Inspect both reasons.`)}</p>}
              <small>{tr("汇总记录双方意见，不认定问题已解决，也不改变原始 AI 报告或验收。", "This summarizes participant positions. It does not establish resolution, change the original AI report or decide acceptance.")}</small>
            </section>}
            {report.risks.slice(0, 5).map((risk, index) => {
              const reading = assessmentRiskPresentation(report, risk, language);
              return <article className="assessment-risk" key={`${risk.title}-${index}`} data-evidence-kind={reading.kind}>
                <span className="assessment-risk-basis">{reading.label}</span><h4>{reading.title}</h4><p className="assessment-risk-notice">{reading.explanation}</p>
                {reading.kind === "image_evidence_gap" ? <details className="assessment-original-risk"><summary>{tr("查看原始模型措辞", "Inspect original model wording")}</summary><strong>{risk.title}</strong><p>{risk.explanation}</p><p>{risk.suggestion}</p></details> : <p>{risk.explanation}</p>}
                <p className="assessment-risk-suggestion">{tr("下一步核对：", "Next check: ")}{reading.nextStep}</p><Citations citations={risk.citations} language={language} /><RiskReviewPanel key={`${report.deliveryId}-${report.id}-published-${index}-${actorRole ?? "buyer"}`} deliveryId={report.deliveryId} assessmentId={report.id} riskIndex={index} reviews={riskReviews} role={actorRole} language={language} busy={busy} readOnly={readOnly} onSave={onSaveRiskReview}/>{!readOnly && onPrepareFeedback && <RiskFeedbackAction report={report} index={index} criteria={criteria} language={language} disabled={busy} onPrepare={onPrepareFeedback}/>}
              </article>;
            })}{report.risks.length > 5 && <p className="assessment-risk-notice">{tr("此处展示前 5 项；完整报告保留在交付记录中。", "Showing the first 5 issues; the full report remains in the delivery record.")}</p>}</> : <p className="assessment-empty">{tr("此报告没有已发布的风险线索。请结合逐项结论与覆盖记录核对；这不代表网站没有缺陷。", "This report has no published risk indications. Inspect its criterion findings and coverage records; this does not establish that the website is free of defects.")}</p>}</div>
        </details>
        <details className="assessment-withheld-risks"><summary><TriangleAlert size={13} aria-hidden="true" />
          <span>{withheld ? withheld.reason === "not_withheld"
            ? tr("本次没有暂缓 AI 线索（0）", "No AI indications were withheld (0)")
            : withheld.version === 4
            ? tr(`未核验模型提议（${withheld.entries.length}）`, `Unverified model proposals (${withheld.entries.length})`)
            : tr(`已暂缓 AI 线索（${withheld.entries.length}，待复核）`, `Withheld AI indications (${withheld.entries.length}, awaiting review)`)
            : tr("暂缓 AI 线索记录（未保存）", "Withheld AI indication record (not saved)")}</span>
          {withheld?.reason === "item_status_adjusted" && <small>{tr(`${withheld.adjustedCriteria.length} 项状态调整后的统一暂缓`, `Report-wide gate after ${withheld.adjustedCriteria.length} item status adjustment(s)`)}</small>}
          {withheld?.reason === "source_scope_unestablished" && <small>{tr("独立约定范围未建立 · 逐项状态未调整", "Agreed indication scope unestablished · item statuses unchanged")}</small>}
          {withheld?.reason === "custom_scope_requires_observation" && <small>{tr("自定义要求待观察 · 逐项状态未调整", "Custom requirements need observation · item statuses unchanged")}</small>}
          {withheld?.reason === "optional_source_leads_unverified" && <small>{hasSourcePublication ? tr("可选模型线索未核验 · 本区暂缓不改逐项发布结论", "Optional model leads are unverified · withholding does not change published item findings") : tr("未建立独立约定与观察依据 · 逐项状态未调整", "Independent scope and observations unestablished · item statuses unchanged")}</small>}
          <ChevronDown size={13} aria-hidden="true" /></summary>
          <div className="assessment-withheld-body">
            {!withheld ? <p className="assessment-empty">{report.withheldRisks === undefined
              ? tr("此报告没有结构化暂缓记录；仅展示已发布部分，不能从数量说明恢复原件。", "This report has no structured withholding record. Only the published part is shown; count notes cannot recover the original indications.")
              : tr("暂缓记录格式无法核对，当前仅展示已发布部分；请重新载入此交付快照。", "The withholding record format cannot be checked. Only the published part is shown; reload this delivery snapshot.")}</p>
              : withheld.reason === "not_withheld" ? <p className="assessment-empty">{tr("本次没有暂缓 AI 线索。已发布线索仍需人工复核，不代表网站没有缺陷。", "No AI indications were withheld in this assessment. Published indications still need human review; this does not establish a defect-free website.")}</p>
                : <>
                  <p className="assessment-risk-notice">{withheld.reason === "source_scope_unestablished"
                    ? tr("这些可选模型线索尚未与独立、明确的约定范围建立依据，因此原件按电话／邮箱文字自定义范围单独暂缓。所有逐项结论保持不变，也不认定其他页面、链接或手机要求通过。这里没有状态调整记录，也不表示线索已证实、被驳回或问题已解决。", "These optional model indications have not established their own independent, explicit agreed scope, so originals are withheld under the custom phone/email text scope. All item findings are unchanged; other page, link or mobile requirements are not declared passed. There is no status-adjustment record, and the indications are not confirmed, rejected or resolved.")
                    : withheld.reason === "custom_scope_requires_observation"
                    ? tr("自定义要求的逐项结论仍为证据不足，并且独立范围检查确认仍需运行或人工观察，因此本报告的可选模型线索统一暂缓。原始线索与引文单独保留；没有改变逐项状态，也没有认定每条线索由某项要求造成。人工意见不解除暂缓，不代表问题已解决、验收或付款。", "The custom items remain insufficient, and an independent scope check requires execution or human observation, so this report’s optional model indications are withheld together. Original wording and citations are retained separately. Item statuses are unchanged; no per-lead causation, release, resolution, acceptance or payment is established by human opinions.")
                    : withheld.reason === "optional_source_leads_unverified"
                    ? hasSourcePublication ? tr("这些可选模型提议仍未核验，不作为已发现问题或返工依据；其页面名称、可见性与修改建议均不是系统认定。逐项发布结论按各自标注的依据另行核对，不由本区暂缓或人工意见改写，也不因此验收或付款。", "These optional model proposals remain unverified and are not established findings or repair authority. Their page names, visibility claims and suggestions are not system determinations. Published item findings retain their separately labelled bases; this withholding and human opinions do not rewrite them, accept work or pay.") : tr("这些可选源码模型提议没有独立绑定约定要求、页面归属或实际观察，因此不作为已发现问题或可执行返工依据。下方仅按编号保留未核验原文；其中的页面名称、可见性与修改建议均不是系统认定。逐项结论保持不变，人工意见不能解除暂缓、验收或付款。", "These optional source-model proposals lack independent bindings to agreed obligations, page identity or actual observations. They are not established findings or authority for repair work. Numbered records retain unverified original wording; their page names, visibility claims and suggestions are not system determinations. Item findings are unchanged, and human opinions do not release the gate, accept work or make a payment.")
                    : tr("部分逐项状态经规则或证据校验调整，因此本报告的全部可选 AI 线索统一暂缓。这不表示每条线索都由下列要求造成，也不表示线索已证实、被驳回或问题已解决。", "Some item statuses changed under rule or evidence checks, so this report's optional AI indications were withheld together. This does not establish that every indication is caused by the items below, confirm or reject a defect, or show that an issue was resolved.")}</p>
                  {withheld.reason === "item_status_adjusted" && <details className="assessment-withheld-adjustments"><summary>{tr(`查看状态调整的要求（${withheld.adjustedCriteria.length}）`, `Inspect adjusted requirements (${withheld.adjustedCriteria.length})`)}</summary>
                    <ul>{withheld.adjustedCriteria.map(adjustment => <li key={adjustment.criterionId}><strong>{titleFor(adjustment.criterionId)}</strong><span>{tr("原 AI 建议 → 发布状态：", "Original model suggestion → Published status: ")}{statusLabel(adjustment.originalStatus)} → {statusLabel(adjustment.publishedStatus)}</span></li>)}</ul>
                  </details>}
                  {withheld.version === 2 && <details className="assessment-withheld-scope"><summary>{tr(`查看自定义文字范围（${withheld.scopeCriterionIds.length}）`, `Inspect custom text scope (${withheld.scopeCriterionIds.length})`)}</summary><ul>{withheld.scopeCriterionIds.map(criterionId => <li key={criterionId}>{titleFor(criterionId)}</li>)}</ul></details>}
                  {withheld.version === 3 && <details className="assessment-withheld-scope"><summary>{tr(`查看待观察的自定义要求（${withheld.scopeCriterionIds.length}）`, `Inspect custom requirements needing observation (${withheld.scopeCriterionIds.length})`)}</summary><ul>{withheld.scopeCriterionIds.map(criterionId => <li key={criterionId}>{titleFor(criterionId)}</li>)}</ul></details>}
                  <p className="assessment-risk-notice">{tr("下列保留原模型线索原文与来源引用。人工核对意见单独追加保存，不计入上方已发布线索数量；本区不提供关联返工操作。", "The original model wording and source citations below are preserved. Human opinions are appended separately and excluded from the published indication count above. This section offers no linked repair actions.")}</p>
                  {withheld.entries.length ? withheld.entries.map(entry => <article className="assessment-risk assessment-withheld-risk" key={entry.originalRiskIndex} data-original-risk-index={entry.originalRiskIndex}>
                    <span className="assessment-risk-basis">{tr(`原模型线索 ${entry.originalRiskIndex + 1} · 暂缓，待复核`, `Original model indication ${entry.originalRiskIndex + 1} · Withheld, awaiting review`)}</span>
                    {withheld.version === 4 ? <>
                      <h4>{tr(`未核验模型提议 ${entry.originalRiskIndex + 1}`, `Unverified model proposal ${entry.originalRiskIndex + 1}`)}</h4>
                      <details className="assessment-original-risk" data-unverified-original="true"><summary>{tr("查看原模型措辞与引文（未核验）", "Inspect original model wording and citations (unverified)")}</summary>
                        <strong>{entry.risk.title}</strong><p>{entry.risk.explanation}</p><p className="assessment-risk-suggestion"><strong>{tr("模型原建议：", "Original model suggestion: ")}</strong>{entry.risk.suggestion}</p>
                        <Citations citations={entry.risk.citations} language={language} />
                      </details>
                    </> : <><h4>{entry.risk.title}</h4><p>{entry.risk.explanation}</p><p className="assessment-risk-suggestion"><strong>{tr("模型原建议：", "Original model suggestion: ")}</strong>{entry.risk.suggestion}</p><Citations citations={entry.risk.citations} language={language} /></>}
                    <RiskReviewPanel key={`${report.deliveryId}-${report.id}-withheld-${entry.originalRiskIndex}-${actorRole ?? "buyer"}`} deliveryId={report.deliveryId} assessmentId={report.id} riskIndex={entry.originalRiskIndex} riskOrigin="withheld" reviews={riskReviews} role={actorRole} language={language} busy={busy} readOnly={readOnly} onSave={onSaveRiskReview} />
                  </article>) : <p className="assessment-empty">{tr("本次有状态调整，但暂缓线索为 0 条；没有暂缓原件需要查看。", "Item statuses were adjusted, but there are 0 withheld indications and no quarantined originals to inspect.")}</p>}
                </>}
            {withheld && <p className="assessment-delivery-id">{tr("记录所属交付 / 评估：", "Recorded delivery / assessment: ")}<code>{report.deliveryId}</code> / <code>{report.id}</code></p>}
          </div>
        </details>
        <details className="assessment-coverage"><summary>{tr("分析范围与局限", "Coverage and limitations")}<ChevronDown size={13} aria-hidden="true" /></summary><div className="assessment-coverage-body">
          <dl>{([
            [tr("已纳入文本文件", "Included text files"), coverage!.includedFiles],
            [tr("仅分析部分文本", "Partially included text files"), coverage!.truncatedFiles],
            [tr("未纳入的文本文件", "Omitted text files"), coverage!.omittedTextFiles],
            [tr("已交付图片，像素未送交分析", "Delivered images; pixels excluded from analysis"), coverage!.rasterFiles],
          ] as const).map(([label, files]) => <div key={label}><dt>{label}</dt><dd>{files.length ? files.map(file => <code key={file}>{file}</code>) : tr("无", "None")}</dd></div>)}</dl>
          {report.limitations.length > 0 && <ul>{report.limitations.map((limit, index) => <li key={`${index}-${limit}`}>{limit}</li>)}</ul>}
          <p className="assessment-delivery-id">{tr("绑定交付：", "Delivery: ")}<code>{report.deliveryId}</code></p>
        </div></details>
      </>}

      <p className="assessment-limits" id={`${id}-limits`}>{tr("AI 仅依据纳入的源码提出建议，不运行脚本或验证后台，也不能确认网站没有 bug。证据不足不算通过；最终验收和付款由买家另行确认。", "AI provides suggestions from the included source only. It does not run scripts, verify the backend or establish that the website is bug-free. Insufficient evidence is not a pass. The buyer separately confirms acceptance and payment.")}</p>
      <span className="assessment-progress" role="status" aria-live="polite" aria-atomic="true">{busy ? tr("正在等待 DeepSeek 的源码评估结果，请勿重复提交。", "Waiting for DeepSeek's source assessment. Avoid submitting again.") : ""}</span>
    </div>
  </details>;
}

export default DeliveryAssessment;
