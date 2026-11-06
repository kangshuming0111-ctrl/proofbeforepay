"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileSearch, LoaderCircle, Quote, TriangleAlert } from "lucide-react";
import type { Language, ProofAssessment, ProofAssessmentCitation, ProofBusinessCheckStep, ProofCriterion, ProofRiskReview, ProofRole } from "@/lib/contracts";
import { criterionDisplayTitle } from "@/lib/delivery-overview";
import "../assessment.css";
import { RiskReviewPanel } from "./RiskReviewPanel";
import {RiskFeedbackAction, type RiskFeedbackDraft} from "./RiskRepairPanel";
import { AssessmentValidationPanel } from "./AssessmentValidationPanel";
import { assessmentCriterionSource, buildAssessmentFeedbackDraft } from "./assessment-feedback";
import type { RiskReviewInput } from "@/lib/risk-reviews";
import { assessmentCoverageGroups, assessmentReviewSummary, assessmentRiskPresentation } from "@/lib/assessment-display";
import {assessmentEvidenceNeedPresentation} from "@/lib/assessment-evidence-needs";
import {AssessmentObligations} from "./AssessmentObligations";

export type DeliveryAssessmentProps = {
  report?: ProofAssessment;
  criteria: ProofCriterion[];
  scopeSteps?: ProofBusinessCheckStep[];
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

export function DeliveryAssessment({ report, criteria, scopeSteps = [], language, selectedCriterionId, enabled = false, busy = false, configured = false, onRun, onPrepareFeedback, readOnly = false, riskReviews, actorRole, onSaveRiskReview }: DeliveryAssessmentProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const id = useId();
  const panelRef = useRef<HTMLDetailsElement>(null);
  const [initiallyExpanded] = useState(!readOnly);
  const selectedItem = selectedCriterionId ? report?.items.find(item => item.criterionId === selectedCriterionId) : report?.items[0];
  const otherItems = report?.items.filter(item => item !== selectedItem) ?? [];
  const reviewSummary = report ? assessmentReviewSummary(report, riskReviews) : undefined;
  const coverage = report ? assessmentCoverageGroups(report) : undefined;
  const poolMarker = report?.withheldRisks as {version?:unknown;reason?:unknown}|undefined;
  const unboundNamespace = poolMarker?.version === 4 || poolMarker?.reason === "optional_source_leads_unverified";
  const publishedRiskCount = unboundNamespace ? 0 : report?.risks.length ?? 0;
  const withheld = report?.withheldRisks && Array.isArray(report.withheldRisks.adjustedCriteria) && Array.isArray(report.withheldRisks.entries)
    && (report.withheldRisks.version === 1 && ["item_status_adjusted", "not_withheld"].includes(report.withheldRisks.reason)
    || (report.withheldRisks.version === 2 && report.withheldRisks.reason === "source_scope_unestablished" || report.withheldRisks.version === 3 && report.withheldRisks.reason === "custom_scope_requires_observation")
      && Array.isArray(report.withheldRisks.scopeCriterionIds)
      && (report.withheldRisks.version!==3 || report.withheldRisks.entries.length<=5 && report.withheldRisks.scopeCriterionIds.every(criterionId=>report.items.some(item=>item.criterionId===criterionId&&item.status==='insufficient_evidence'))) && report.withheldRisks.scopeCriterionIds.length > 0 && report.withheldRisks.scopeCriterionIds.length <= 17
      && new Set(report.withheldRisks.scopeCriterionIds).size === report.withheldRisks.scopeCriterionIds.length && report.withheldRisks.scopeCriterionIds.every(criterionId => typeof criterionId === "string" && criteria.some(criterion => criterion.id === criterionId))
      && report.withheldRisks.adjustedCriteria.length === 0 && report.withheldRisks.entries.length > 0 && report.risks.length === 0
    || report.withheldRisks.version === 4 && report.withheldRisks.reason === "optional_source_leads_unverified"
      && report.method === "source-ai-v1" && report.mode === "live" && report.risks.length === 0
      && Object.keys(report.withheldRisks).sort().join(",") === "adjustedCriteria,entries,reason,version"
      && report.withheldRisks.adjustedCriteria.length === 0 && report.withheldRisks.entries.length > 0 && report.withheldRisks.entries.length <= 5
      && report.withheldRisks.entries.every((entry, index) => entry && entry.originalRiskIndex === index && entry.risk))
    ? report.withheldRisks : undefined;
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
    const canPrepareFeedback = !readOnly && !!onPrepareFeedback && item.status !== "supported";
    const insufficient = item.status === "insufficient_evidence";
    const criterion = criteria.find(criterion => criterion.id === item.criterionId);
    const lockedSource = assessmentCriterionSource(criterion, item.criterionId);
    const draft = canPrepareFeedback ? buildAssessmentFeedbackDraft(criterion, item, language, scopeSteps) : undefined;
    const evidenceNeed = insufficient ? assessmentEvidenceNeedPresentation(item.evidenceNeed, language) : undefined;
    return <article className={`assessment-item${selected ? " assessment-item-selected" : ""}`} key={item.criterionId}>
      <div className="assessment-item-heading"><h4>{titleFor(item.criterionId)}</h4><span className={`assessment-status assessment-status-${item.status}`}>{statusLabel(item.status)}</span></div>
      {lockedSource !== undefined ? <details className="assessment-locked-source">
        <summary><Quote size={12} aria-hidden="true" />{tr("查看完整锁定原文", "Inspect complete locked wording")}<ChevronDown size={13} aria-hidden="true" /></summary>
        <p>{tr("原样保留的验收要求；界面语言切换不会翻译或缩写这段原文。", "The agreed wording is preserved exactly. Changing interface language does not translate or shorten this source.")}</p>
        <blockquote>{lockedSource}</blockquote>
      </details> : <p className="assessment-source-unavailable">{tr("尚未取得此项的锁定原文，暂不能生成带要求的补证草稿。请重新载入当前交付后核对。", "This criterion’s locked wording is unavailable, so an evidence request cannot be prepared. Reload the current delivery and check again.")}</p>}
      <p className="assessment-explanation">{item.explanation}</p>
      {criterion && <AssessmentObligations criterion={criterion} value={item.obligations} language={language}/>}
      {evidenceNeed && <section className="assessment-evidence-need" aria-label={tr("补证方向", "Evidence needed")}>
        <strong>{evidenceNeed.reason}</strong><p>{evidenceNeed.nextStep}</p>
        {evidenceNeed.targetFiles.length > 0 && <details className="assessment-evidence-need-files"><summary>{tr(`相关源码文件（${evidenceNeed.targetFiles.length}）`, `Related source files (${evidenceNeed.targetFiles.length})`)}</summary>
          <ul>{evidenceNeed.targetFiles.map(file => <li key={file}><code>{file}</code></li>)}</ul>
        </details>}
        {!evidenceNeed.legacy && !evidenceNeed.targetFiles.length && <p>{tr("尚未定位具体文件，请先按锁定要求确认范围。", "No exact target file was recorded; confirm the scope against the locked requirement.")}</p>}
      </section>}
      <Citations citations={item.citations} language={language} />
      {item.ruleEvidenceIds.length > 0 && <p className="assessment-rule-refs">{tr("已关联此要求的规则证据，可与下方核查结果对照。", "Linked to this requirement’s rule evidence; compare it with the rule findings below.")}</p>}
      {canPrepareFeedback && <div className="assessment-feedback-action no-print"><button type="button" className="assessment-feedback-button" disabled={busy || !draft} onClick={() => {
        if (!report || !draft) return;
        onPrepareFeedback?.({ deliveryId: report.deliveryId, criterionId: item.criterionId, comment: draft.comment });
      }}>{draft?.intent === "scope_clarification" ? tr("先澄清页面归属", "Clarify page scope") : insufficient ? tr("请求补充证据", "Draft an evidence request") : tr("加入修改草稿", "Add to change draft")}</button><span>{tr("仅填入可编辑草稿，不会自动退回。", "Adds an editable draft without sending a change request.")}</span>{draft && (draft.sourceExcerpted || draft.explanationExcerpted) && <p className="assessment-draft-excerpt-note">{tr("草稿上限为 1000 字符，超长部分会明确标为节选。请展开完整锁定原文核对后再编辑发送。", "The draft has a 1000-character limit. Shortened sections are labelled as excerpts. Inspect the complete locked wording before editing and sending.")}</p>}</div>}
    </article>;
  }

  return <details className="delivery-assessment" ref={panelRef} open={initiallyExpanded} data-has-report={report ? "true" : "false"}>
    <summary className="assessment-heading" id={`${id}-heading`}>
      <span className="assessment-title"><FileSearch size={16} aria-hidden="true" />{tr("AI 逐条交付评估", "AI delivery assessment")}</span>
      <span className="assessment-state">{busy ? tr("评估中", "Assessing") : report ? tr("已保存的 AI 建议", "Saved AI suggestions") : readOnly ? tr("未保存评估", "No saved assessment") : tr("按需运行", "Run when needed")}</span>
      <ChevronDown className="assessment-chevron" size={15} aria-hidden="true" />
    </summary>

    <div className="assessment-body" aria-labelledby={`${id}-heading`}>
      <p className="assessment-purpose">{tr("逐条比较已确认的要求与卖家源码；与规则检查、浏览器测量分开记录。请结合引用原文核对每条建议。", "Compares confirmed requirements with the seller's source files. Recorded separately from rule checks and browser measurements. Check each suggestion against the quoted source.")}</p>
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
        <div className="assessment-findings" role="region" aria-label={tr("AI 逐项内容评估", "AI criterion assessments")}>
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
          {withheld?.reason === "optional_source_leads_unverified" && <small>{tr("未建立独立约定与观察依据 · 逐项状态未调整", "Independent scope and observations unestablished · item statuses unchanged")}</small>}
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
                    ? tr("这些可选源码模型提议没有独立绑定约定要求、页面归属或实际观察，因此不作为已发现问题或可执行返工依据。下方仅按编号保留未核验原文；其中的页面名称、可见性与修改建议均不是系统认定。逐项结论保持不变，人工意见不能解除暂缓、验收或付款。", "These optional source-model proposals lack independent bindings to agreed obligations, page identity or actual observations. They are not established findings or authority for repair work. Numbered records retain unverified original wording; their page names, visibility claims and suggestions are not system determinations. Item findings are unchanged, and human opinions do not release the gate, accept work or make a payment.")
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
