"use client";

import { ArrowRight, ClipboardList, ExternalLink, RefreshCw, SearchCheck } from "lucide-react";
import { useState } from "react";
import type { Language, ProofAssessmentItem, ProofQuote, ProofRole } from "@/lib/contracts";
import { buyerProjectTitle, criterionDisplayTitle, overviewFeedbackDraft } from "@/lib/delivery-overview";
import type { PlainDeliverySummary } from "@/lib/plain-delivery-summary";
import { BuyerRequirementText } from "./BuyerRequirementText";
import { DeliveryWebsiteLink } from "./DeliveryWebsiteLink";
import "../plain-delivery-workspace.css";

type Action = { label: string; run: () => void; disabled?: boolean };
type Props = {
  quote: ProofQuote; role: ProofRole; language: Language; version?: number; previewPath?: string;
  summary?: PlainDeliverySummary;
  navigation?: {count: number; accepted: boolean; open: () => void};
  handoffStatus: string; reportStatus?: string; accepted: boolean; busy: boolean; primary?: Action; secondary?: Action;
  onInspectCriterion?: (input: {deliveryId: string; criterionId: string; frozen: boolean}) => void;
  onPrepareFeedback?: (input: {deliveryId: string; criterionId: string; comment: string; startBlank?: true}) => void;
  assessmentAction?: Action; comparisonAction?: Action;
  reportAction?: Action; onDetails: () => void; onAgreement: () => void; onRefresh: () => void;
};

export function PlainDeliveryWorkspace({quote, role, language, version, previewPath, summary, navigation, handoffStatus, reportStatus, accepted, busy, primary, secondary, reportAction, assessmentAction, comparisonAction, onInspectCriterion, onPrepareFeedback, onDetails, onAgreement, onRefresh}: Props) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const buyer = role === "buyer";
  const submission = quote.proof.collaboration?.submission;
  const deliveryNote = quote.proof.demoExample && submission?.deliveryId === quote.proof.delivery?.id ? submission?.note : undefined;
  const checks = summary?.kind === "ready" ? summary : undefined;
  const currentChecks = !!checks && checks.deliveryId === quote.proof.delivery?.id;
  const canInspect = currentChecks && (!accepted || checks?.frozen) && !!onInspectCriterion;
  const canPrepareFeedback = currentChecks && buyer && !accepted && !checks?.frozen && !busy && !!onPrepareFeedback
    && quote.proof.collaboration?.stage === "submitted" && submission?.deliveryId === checks?.deliveryId;
  const [mobileSection, setMobileSection] = useState<"handoff" | "checks" | "requirements">(buyer && !version ? "requirements" : "handoff");
  const checkTitle = checks?.assessmentCurrent ? tr("AI 检查结果", "AI check results") : tr("检查结果", "Check results");
  const attention = checks?.rows.filter(row => row.rule === "fail" || row.rule === "unreviewed" || row.humanPending
    || row.ai?.status === "changes_suggested" || row.ai?.status === "insufficient_evidence" && !row.humanConfirmed
    || row.ai?.modelJudgment && row.ai.modelJudgment.status !== row.ai.status) ?? [];
  const remaining = checks?.rows.filter(row => !attention.includes(row)) ?? [];
  const isBuyerBrief = (id: string) => /^coverage-[1-9]\d*$/u.test(id);
  // Keep every attention item visible; routine checks remain available in one disclosure.
  const routine = [...remaining.filter(row => isBuyerBrief(row.criterion.id)), ...remaining.filter(row => !isBuyerBrief(row.criterion.id))];
  const canOpenAssessment = !!assessmentAction && !accepted && !checks?.frozen;
  const hasMoreChecks = canOpenAssessment || comparisonAction || reportAction;

  const statusText = (status: ProofAssessmentItem["status"]) => status === "supported" ? tr("找到依据", "evidence found")
    : status === "changes_suggested" ? tr("建议修改", "change suggested") : tr("无法判断", "cannot determine");

  const renderRow = (row: NonNullable<typeof checks>["rows"][number]) => {
    const sourcePublication = ["source-publication-v1", "source-publication-v2", "source-publication-v3"].includes(row.ai?.publicationBasis?.schema ?? "");
    const originalModel = row.ai?.modelJudgment?.status;
    const originalDiffers = originalModel && originalModel !== row.ai?.status;
    const ruleLabel = row.rule === "fail" ? tr("和约定不符", "Does not match the agreement") : row.rule === "pass" ? tr("找到依据", "Evidence found")
      : row.rule === "unreviewed" ? tr("还没检查", "Not checked")
      : row.humanConfirmed ? (checks?.frozen ? tr("买家已核对", "Checked by buyer") : tr("已勾选，未保存", "Selected, not saved"))
      : buyer ? tr("需要你看一下", "Check this yourself") : tr("等买家核对", "Waiting for buyer");
    const tone = row.rule === "fail" ? "changes_suggested" : row.humanConfirmed ? "confirmed" : row.rule === "pass" ? "supported" : "insufficient_evidence";
    const needsFeedback = row.rule === "fail" || row.rule === "unreviewed" || row.humanPending
      || row.ai?.status === "changes_suggested" || row.ai?.status === "insufficient_evidence" && !row.humanConfirmed;
    const title = criterionDisplayTitle(row.criterion, language);
    return <li key={row.criterion.id}>
      <details className="plain-criterion-details">
      <summary data-criterion-id={row.criterion.id}>
      <span className="plain-criterion-title">{title}<span className="plain-criterion-hint"><span className="plain-criterion-hint-text">{tr("看这项依据", "View evidence")}</span><span className="plain-criterion-toggle" aria-hidden="true"/></span></span>
      <span className="plain-check-findings">
        {!(row.rule === "pass" && row.ai?.status === "supported") && <strong className={`plain-check-badge plain-check-${tone}`}>{ruleLabel}</strong>}
        {row.ai && <span className={`plain-check-badge plain-check-${row.ai.status}`}>{sourcePublication ? tr("文件：", "Files: ") : originalDiffers ? tr("复核：", "Reviewed: ") : "AI: "}{statusText(row.ai.status)}</span>}
        {originalDiffers && <span className="plain-original-note">{tr("AI 最初：", "AI first: ")}{statusText(originalModel)}</span>}
      </span>
      </summary>
      <div className="plain-criterion-evidence">
        <p className="plain-criterion-caption">{tr("约定原文", "Agreed wording")}</p>
        <blockquote>{row.criterion.source}</blockquote>
        {row.explanation && <p>{row.explanation}</p>}
        {row.ai && row.ai.explanation !== row.explanation && <p><strong>{sourcePublication ? tr("文件核验说明：", "Source-check note: ") : originalDiffers ? tr("发布的复核说明：", "Published review note: ") : tr("AI 说明：", "AI explanation: ")}</strong>{row.ai.explanation}</p>}
        {originalDiffers && <details className="plain-original-judgment"><summary>{tr("AI 最初怎么说", "What AI first said")}</summary><span>{statusText(originalModel)}</span><p>{row.ai?.modelJudgment?.explanation}</p></details>}
        <div className="plain-criterion-actions">
          {canInspect && <button type="button" className="text-button" disabled={busy} data-criterion-id={row.criterion.id} onClick={() => {
            if (!busy && checks && canInspect) onInspectCriterion?.({deliveryId: checks.deliveryId, criterionId: row.criterion.id, frozen: checks.frozen});
          }}>{checks?.frozen ? tr("查看这项验收依据", "Open this item’s saved evidence") : tr("查看这项完整依据", "Open this item’s full evidence")} <ArrowRight size={13} aria-hidden="true"/></button>}
          {canPrepareFeedback && <button type="button" className="text-button plain-criterion-feedback" data-criterion-id={row.criterion.id} onClick={() => {
            if (checks && canPrepareFeedback) onPrepareFeedback?.(needsFeedback ? overviewFeedbackDraft(row, checks.deliveryId, language)
              : {deliveryId: checks.deliveryId, criterionId: row.criterion.id, comment: "", startBlank: true});
          }}>{needsFeedback ? tr("起草这项反馈", "Draft feedback for this item") : tr("针对这项写意见", "Write feedback for this item")}</button>}
        </div>
        {canPrepareFeedback && <p className="plain-card-help">{tr("先填写草稿，确认后再发送给卖家。", "You can edit the draft before sending it to the seller.")}</p>}
      </div>
      </details>
    </li>;
  };

  return <section id="workspace-overview" className="plain-workspace no-print" aria-label={tr("项目概览", "Project overview")} tabIndex={-1}>
    <div className="plain-workspace-top">
      <div><span className="plain-workspace-role">{buyer ? tr("买家端", "Buyer view") : tr("卖家端", "Seller view")}{quote.proof.demoSampleProject && tr(" · 示例", " · Example")}</span><h2>{buyerProjectTitle(quote, language)}</h2></div>
      <div className="plain-workspace-tools">
        <button type="button" className="text-button" onClick={onRefresh} disabled={busy} aria-label={tr("刷新项目", "Refresh project")}><RefreshCw size={15} aria-hidden="true"/></button>
        <button type="button" className="subtle-button" onClick={onDetails}>{tr("更多操作", "More actions")}</button>
      </div>
    </div>
    <div className="plain-mobile-status">
      <p>{version ? tr(`第 ${version} 版 · `, `Version ${version} · `) : ""}{handoffStatus}{checks?.frozen && tr(" · 验收时的记录", " · Saved at acceptance")}</p>
      {checks && !accepted && mobileSection !== "checks" && (!!checks.ruleFailures || !!checks.aiChanges || !!checks.humanRemaining || !!checks.aiInsufficient || !!checks.risks?.total || !!checks.withheldRiskCount || !!checks.unreviewed) &&
        <button type="button" className="text-button" onClick={() => setMobileSection("checks")}>{tr("有项目要看一下", "Some items need your attention")}</button>}
    </div>
    <div className="plain-mobile-nav" role="group" aria-label={tr("选择概览内容", "Choose overview section")}>
      {(["requirements", "handoff", "checks"] as const).map(section => <button key={section} type="button" aria-pressed={mobileSection === section} aria-controls={`plain-${section}-panel`} onClick={() => setMobileSection(section)}>{section === "handoff" ? tr("卖家网站", "Website") : section === "checks" ? tr("检查结果", "Checks") : buyer ? tr("我的需求", "My requirements") : tr("买家需求", "Requirements")}</button>)}
    </div>
    <div className="plain-workspace-grid">
      <article id="plain-requirements-panel" className={`plain-workspace-card plain-requirements${mobileSection === "requirements" ? " is-mobile-selected" : ""}`} aria-labelledby="plain-requirements-heading">
        <h3 id="plain-requirements-heading"><ClipboardList size={19} aria-hidden="true"/>{buyer ? tr("我的需求", "My requirements") : tr("买家需求", "Buyer’s requirements")}</h3>
        <BuyerRequirementText quote={quote} language={language} coverage={quote.proof.project?.coverage}/>
        <button type="button" className="text-button plain-card-detail" onClick={onAgreement}>{tr("看完整需求和验收清单", "See the full brief and checklist")} <ArrowRight size={13} aria-hidden="true"/></button>
      </article>
      <article id="plain-handoff-panel" className={`plain-workspace-card plain-handoff${mobileSection === "handoff" ? " is-mobile-selected" : ""}`} aria-labelledby="plain-handoff-heading">
        <h3 id="plain-handoff-heading"><ExternalLink size={19} aria-hidden="true"/>{tr("卖家交付的网站", "Website from the seller")}</h3>
        <div className="plain-handoff-state">{version && <strong>{tr(`第 ${version} 版`, `Version ${version}`)}</strong>}<span>{handoffStatus}</span></div>
        {version && !previewPath ? <p className="plain-report-origin">{tr("这一版没有可打开的网站预览。", "This version has no website preview to open.")}</p>
          : <DeliveryWebsiteLink previewPath={previewPath} language={language} />}
        {version && deliveryNote && <details className="buyer-original-requirements">
          <summary>{tr("卖家的交付说明", "Seller’s delivery note")}</summary>
          <p>{deliveryNote}</p>
        </details>}
      </article>
      <article id="plain-checks-panel" className={`plain-workspace-card plain-checks${mobileSection === "checks" ? " is-mobile-selected" : ""}`} aria-labelledby="plain-checks-heading" aria-busy={busy}>
        <h3 id="plain-checks-heading"><SearchCheck size={19} aria-hidden="true"/>{checkTitle}</h3>
        {checks && <p className={`plain-report-origin${checks.assessmentCurrent && !checks.frozen ? " plain-secondary-help" : ""}`}>{checks.frozen ? tr("这是验收时保存的结果。", "These results were saved at acceptance.")
          : checks.assessmentCurrent ? tr("看看哪里有依据、哪里还需要核对。", "See what has evidence and what still needs a look.") : tr("文件与人工检查；还没有 AI 报告。", "File and buyer checks; no AI report yet.")}</p>}
        {navigation && <button type="button" className="text-button plain-card-detail plain-report-link" disabled={busy} onClick={() => {if (!busy) navigation.open();}}>{navigation.accepted ? tr(`验收报告：重放 ${navigation.count} 条导航`, `Acceptance report: replay ${navigation.count} links`) : tr(`重放 ${navigation.count} 条导航`, `Replay ${navigation.count} links`)} <ArrowRight size={13} aria-hidden="true"/></button>}
        {checks ? <>
          {!!attention.length && <ul className="plain-check-list">{attention.map(renderRow)}</ul>}
          {!!routine.length && <details className="plain-more-checks">
            <summary>{attention.length ? tr(`再看 ${routine.length} 项检查结果`, `See ${routine.length} more check results`) : tr(`查看已记录的 ${routine.length} 项结果`, `View ${routine.length} recorded check results`)}</summary>
            <ul className="plain-check-list">{routine.map(renderRow)}</ul>
          </details>}
        </> : <p className="plain-report-origin">{summary?.kind === "unavailable" ? tr("这份验收记录没能打开。请刷新，或到历史版本找。", "This acceptance record couldn’t be opened. Refresh or look in version history.") : reportStatus ?? tr("卖家提交后，就可以检查网站。", "Check the website after the seller submits it.")}</p>}
        {!!checks?.risks?.total && <p id="plain-published-risks" tabIndex={-1} className="plain-extra-risks">{tr(`AI 另外发现 ${checks.risks.total} 个地方需要看看`, `${checks.risks.total} additional AI risk indications to verify`)}{checks.risks.differingPositions > 0 && tr(`，其中 ${checks.risks.differingPositions} 条双方意见不同`, `; participants disagree on ${checks.risks.differingPositions}`)}{tr("。请先看依据，再决定是否需要修改；记录意见不等于问题已解决。", ". Read the evidence before deciding what to change; recording a view does not resolve the finding.")}</p>}
        {!!checks?.withheldRiskCount && <p id="plain-withheld-risks" tabIndex={-1} className="plain-extra-risks">{tr(`还有 ${checks.withheldRiskCount} 条 AI 提醒没有足够依据，先不当成问题。`, `${checks.withheldRiskCount} unverified AI indications are withheld from the risk list.`)}</p>}
        {checks && !accepted && <p className="plain-card-help plain-secondary-help">{tr("请打开网站看一遍，再决定是否验收。", "Evidence is not approval. Look at the site before accepting it.")}</p>}
        {hasMoreChecks && <details className="plain-more-check-actions">
          <summary>{tr("更多检查", "More checks")}</summary>
          {canOpenAssessment && assessmentAction && <button type="button" className="text-button plain-card-detail" disabled={busy || assessmentAction.disabled} onClick={() => {if (!busy && !assessmentAction.disabled) assessmentAction.run();}}>{assessmentAction.label} <ArrowRight size={13} aria-hidden="true"/></button>}
          {comparisonAction && <button type="button" className="text-button plain-card-detail" disabled={busy || comparisonAction.disabled} onClick={() => {if (!busy && !comparisonAction.disabled) comparisonAction.run();}}>{comparisonAction.label} <ArrowRight size={13} aria-hidden="true"/></button>}
          {reportAction && <button type="button" className="text-button plain-card-detail" disabled={busy || reportAction.disabled} onClick={() => {if (!busy && !reportAction.disabled) reportAction.run();}}>{reportAction.label} <ArrowRight size={13} aria-hidden="true"/></button>}
        </details>}

      </article>
    </div>
    {(primary || secondary || accepted) && <div className="plain-workspace-next">
      <p>{accepted ? tr("交付已验收。付款另行确认。", "The delivery is accepted. Payment is confirmed separately.") : buyer ? tr("由你决定是否验收。", "You decide whether to accept.") : tr("由你提交网站，买家负责验收。", "You submit the website; the buyer decides whether to accept.")}</p>
      <div>{secondary && <button type="button" className="subtle-button" disabled={secondary.disabled} onClick={secondary.run}>{secondary.label}</button>}
      {primary && <button type="button" className="button primary" disabled={primary.disabled} onClick={primary.run}>{primary.label}<ArrowRight size={15} aria-hidden="true"/></button>}</div>
    </div>}
  </section>;
}
