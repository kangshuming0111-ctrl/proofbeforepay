"use client";

import { ArrowRight, ChevronDown, FileCheck2, History, MessageSquarePlus, ScanLine } from "lucide-react";
import type { Language, ProofCollaboration, ProofCriterion, ProofDelivery, ProofDeliveryVersion, ProofLayoutWidth, ProofReview, ProofRole } from "@/lib/contracts";
import { criterionDisplayTitle, deliveryOverview, overviewFeedbackDraft, overviewRowLabel } from "@/lib/delivery-overview";
import { deliveryLayoutSummary } from "@/lib/delivery-layout-summary";
import { buildBusinessSpotlight } from "@/lib/business-spotlight";
import { BusinessSpotlight } from "./BusinessSpotlight";
import {runtimeReportSummary} from "@/lib/runtime-checks";
import "../delivery-overview.css";

export type DeliveryOverviewProps = {
  delivery: ProofDelivery;
  criteria: ProofCriterion[];
  review?: ProofReview;
  manualChecks: string[];
  language: Language;
  role: ProofRole;
  stage?: ProofCollaboration["stage"];
  previousVersion?: ProofDeliveryVersion;
  busy?: boolean;
  onInspect: (criterionId: string) => void;
  onPrepareFeedback?: (input: { deliveryId: string; criterionId: string; comment: string }) => void;
  onViewHistory?: () => void;
  onOpenLayout?: () => void;
  onOpenBusiness?: () => void;
  onOpenRuntime?: () => void;
  onInspectLayout?: (file: string, width: ProofLayoutWidth) => void;
};

export function DeliveryOverview({ delivery, criteria, review, manualChecks, language, role, stage, previousVersion, busy = false, onInspect, onPrepareFeedback, onViewHistory, onOpenLayout, onOpenBusiness, onOpenRuntime, onInspectLayout }: DeliveryOverviewProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const overview = deliveryOverview({ delivery, criteria, review, manualChecks, previousVersion });
  const layout = deliveryLayoutSummary(delivery);
  const business = buildBusinessSpotlight(delivery, previousVersion);
  const runtime=delivery.runtimeReport?.deliveryId===delivery.id?delivery.runtimeReport:undefined;
  const runtimeSummary=runtime?runtimeReportSummary(runtime.steps):undefined;
  const createStep=runtime?.steps.find(step=>step.id==="create"),readbackStep=runtime?.steps.find(step=>step.id==="readback");
  const layoutIssue = layout.state === "current" ? layout.firstIssue : undefined;
  const firstRows = overview.rows.slice(0, 3);
  const primaryNeedsAttention = firstRows[0] && (firstRows[0].rule === "fail" || firstRows[0].rule === "unreviewed"
    || firstRows[0].humanPending || firstRows[0].ai?.status === "changes_suggested" || firstRows[0].ai?.status === "insufficient_evidence" && !firstRows[0].humanConfirmed);
  const showPrimary = !business || firstRows[0]?.rule === "fail" || firstRows[0]?.rule === "unreviewed" || firstRows[0]?.ai?.status === "changes_suggested";
  const showDraft = role === "buyer" && stage === "submitted" && !!onPrepareFeedback;
  const title = stage === "accepted" ? tr("买家已接受当前交付", "The buyer accepted this delivery")
    : !overview.reviewCurrent ? tr("先核查当前交付版本", "Check this delivery version first")
    : overview.ruleFailures ? tr("有交付要求尚未符合", "Some delivery requirements are unmet")
    : runtimeSummary && (runtimeSummary.issues || runtimeSummary.unavailable) ? tr("预约后端仍有不符或未确定步骤", "Booking backend steps differ or remain uncertain")
    : business && business.issues > 0 ? tr("约定的业务内容存在差异", "Agreed business content differs")
    : business && business.unavailable > 0 ? tr("部分业务内容仍需核对", "Some business content needs inspection")
    : overview.aiChanges ? tr("AI 提出了修改建议，请核对", "AI suggests changes for you to review")
    : business?.groups.some(group => group.row.state === "now_matches") ? tr("对照这次修改，再完成验收", "Review the revision before accepting")
    : overview.unreviewed ? tr("有要求尚无规则证据", "Some requirements have no rule evidence")
    : overview.humanRemaining ? tr("还有要求需要你亲自确认", "Some requirements need your direct check")
    : !overview.assessmentCurrent ? tr("规则已核查，AI 尚未运行", "Rules checked; AI has not run")
    : tr("本版检查已保存，验收由买家决定", "Checks saved; the buyer decides acceptance");

  const rowLabel = (row: (typeof overview.rows)[number]) => overviewRowLabel(row, language);

  const ruleComparison = overview.previous?.ruleFailures !== undefined && overview.ruleFailures !== undefined;
  const aiComparison = overview.previous?.aiChanges !== undefined && overview.aiChanges !== undefined;

  return <section className="delivery-overview" aria-label={tr("当前交付结果", "Current delivery results")}>
    <header className="delivery-overview-heading"><FileCheck2 size={16} aria-hidden="true"/><h3>{title}</h3><span>{delivery.sequence ? `v${delivery.sequence}` : tr("当前版", "Current")}</span></header>
    {business && <BusinessSpotlight delivery={delivery} previousVersion={previousVersion} language={language} busy={busy} onInspect={onOpenBusiness ?? onOpenLayout ?? (() => {})} onPrepareFeedback={showDraft ? onPrepareFeedback : undefined}/>}
    {runtime&&runtimeSummary&&<div className="delivery-overview-layout"><div className="delivery-overview-layout-heading"><strong>{tr("预约接口实测","Booking HTTP check")}: {runtimeSummary.observed}/{runtimeSummary.steps} {tr("步有预期观测支持","steps with expected observations")}</strong>{onOpenRuntime&&<button type="button" disabled={busy} onClick={onOpenRuntime}>{tr("查看八步证据","Inspect eight-step evidence")}<ArrowRight size={12}/></button>}</div><p className="delivery-overview-layout-note">{tr("创建请求","Create request")} {createStep?.status??"—"} · {tr("独立回读","Independent readback")} {readbackStep?.status??"—"} · {tr("不符","Mismatched")} {runtimeSummary.issues} · {tr("未确定","Unavailable")} {runtimeSummary.unavailable}</p></div>}
    <div className="delivery-overview-metrics" aria-label={tr("分别记录的检查结果", "Separately recorded check results")}>
      <span className={overview.ruleFailures ? "overview-attention" : ""}>{tr("规则不符", "Rule mismatches")} <strong>{overview.ruleFailures ?? "—"}</strong></span>
      <span className={overview.aiChanges ? "overview-attention" : ""}>{tr("AI 建议修改", "AI change suggestions")} <strong>{overview.aiChanges ?? tr("未运行", "Not run")}</strong></span>
      {overview.risks && overview.risks.total > 0 && <span>{tr("模型潜在线索", "Potential AI issues")} <strong>{overview.risks.total}</strong></span>}
      {overview.humanRequired && overview.humanRemaining === 0
        ? <span>{tr("人工已确认", "Human-confirmed")} <strong>{overview.humanConfirmed}/{overview.humanRequired}</strong></span>
        : <span>{tr("人工待确认", "Human checks left")} <strong>{overview.humanRemaining ?? "—"}</strong></span>}
    </div>
    {delivery.businessChecks && !business && <p className="delivery-overview-note">{tr("业务观察报告无法可靠读取，请打开报告重新核对。", "The business observation report could not be reliably read. Open the report and check again.")}{(onOpenBusiness || onOpenLayout) && <button type="button" disabled={busy} onClick={onOpenBusiness ?? onOpenLayout}>{tr("查看业务报告", "View business report")}</button>}</p>}
    {business && stage === "accepted" && <p className="delivery-overview-note">{tr("以下为当前观察，不改写买家当时接受的版本和证据。", "These are current observations; they do not revise the version or evidence accepted by the buyer.")}</p>}
    {!overview.reviewCurrent && <p className="delivery-overview-note">{tr("此版本尚未核查，不作通过判断。", "This version has not been checked; no pass is claimed.")}</p>}
    {overview.reviewCurrent && !!overview.unreviewed && <p className="delivery-overview-note">{tr(`另有 ${overview.unreviewed} 项尚无完整规则证据。`, `${overview.unreviewed} requirements still lack rule evidence.`)}</p>}
    {!!overview.aiInsufficient && !!overview.humanConfirmed && <p className="delivery-overview-note">{tr(`AI 有 ${overview.aiInsufficient} 项无法独立判断；人工确认另有记录，原始 AI 建议保留。`, `AI could not independently determine ${overview.aiInsufficient} requirement${overview.aiInsufficient === 1 ? "" : "s"}. Human confirmations and the original AI advice are recorded separately.`)}</p>}
    {overview.risks && overview.risks.total > 0 && <p className="delivery-overview-note">{tr(`潜在线索中 ${overview.risks.unreviewed} 条尚无人工复核记录；双方最新意见可在 AI 评估中查看。复核不代表问题已解决。`, `Potential issues without a human review record: ${overview.risks.unreviewed}. Inspect each participant’s latest position in the AI assessment; a review does not establish resolution.`)}</p>}
    {showPrimary && firstRows[0] && <div className="delivery-overview-primary"><span>{rowLabel(firstRows[0])}</span><strong>{criterionDisplayTitle(firstRows[0].criterion, language)}</strong><button type="button" disabled={busy} onClick={() => onInspect(firstRows[0].criterion.id)}>{tr("查看证据", "Inspect")}<ArrowRight size={12} aria-hidden="true"/></button></div>}
    {showPrimary && primaryNeedsAttention && firstRows[0]?.explanation && <p className="delivery-overview-primary-explanation" title={firstRows[0].explanation}>{firstRows[0].explanation}</p>}
    <div className="delivery-overview-layout" aria-label={tr("当前版本浏览器观测", "Browser observations for this version")}>
      <div className="delivery-overview-layout-heading"><span><ScanLine size={12} aria-hidden="true"/>{tr("浏览器观测", "Browser observations")}</span>{onOpenLayout && <button type="button" disabled={busy} onClick={onOpenLayout}>{layout.state === "current" ? tr("查看测量", "View readings") : tr("前往测量", "Open measurements")}<ArrowRight size={12} aria-hidden="true"/></button>}</div>
      {layout.state === "current" ? <>
        <p className="delivery-overview-layout-counts"><span>{tr("实际测量", "Measured")} <strong>{layout.measured}/{layout.total}</strong></span><span className={layout.overflow ? "overview-attention" : ""}>{tr("横向溢出", "Overflow")} <strong>{layout.overflow}</strong></span><span className={layout.unavailable ? "overview-attention" : ""}>{tr("不可测", "Unavailable")} <strong>{layout.unavailable}</strong></span></p>
        {layoutIssue && <p className="delivery-overview-layout-issue">{layoutIssue.kind === "overflow" ? tr(`横向多出 ${layoutIssue.overflowPx}px`, `${layoutIssue.overflowPx}px horizontal overflow`) : tr("此页面没有可靠读数", "No reliable reading for this page")}{" · "}{onInspectLayout ? <button type="button" disabled={busy} onClick={() => onInspectLayout(layoutIssue.file, layoutIssue.width)}>{layoutIssue.file} · {layoutIssue.width}px<ArrowRight size={12} aria-hidden="true"/></button> : <span>{layoutIssue.file} · {layoutIssue.width}px</span>}</p>}
        {!layout.overflow && layout.measured > 0 && <p className="delivery-overview-layout-note">{layout.unavailable ? tr("已测项未见横向溢出；不可测项仍未覆盖。", "No horizontal overflow in measured items; unavailable items remain uncovered.") : tr("已测文档未见横向溢出，不代表手机可用。", "No document overflow observed; mobile usability is not established.")}</p>}
      </> : <p className="delivery-overview-layout-note">{layout.state === "stale" ? tr("旧版观测不适用于当前交付，需重新测量。", "Older observations do not apply to this delivery. Measure again.") : layout.state === "invalid" ? tr("当前报告没有可靠读数，需重新测量。", "This report has no reliable readings. Measure again.") : tr("尚未测量，不作运行或手机体验判断。", "Not measured. Runtime behavior and mobile usability remain unverified.")}</p>}
      {layout.state === "current" && <p className="delivery-overview-layout-source">{tr("当前版本的客户端上报读数，非服务器独立验证。", "Client-reported readings for this version; not independently verified by the server.")}</p>}
    </div>
    <details className="delivery-overview-details">
      <summary>{tr("展开原因与修改建议", "Reasons & change suggestions")}<ChevronDown size={13} aria-hidden="true"/></summary>
      <ol className="delivery-overview-rows">{firstRows.map(row => <li key={row.criterion.id}>
        <div className="delivery-overview-row-copy"><span className={`delivery-overview-origin overview-${row.rule === "fail" ? "fail" : row.ai?.status === "changes_suggested" ? "suggestion" : "neutral"}`}>{rowLabel(row)}</span><strong title={row.criterion.source}>{criterionDisplayTitle(row.criterion, language)}</strong>{row.explanation && <p>{row.explanation}</p>}</div>
        <div className="delivery-overview-row-actions"><button type="button" disabled={busy} onClick={() => onInspect(row.criterion.id)}>{tr("查看证据", "Inspect")}<ArrowRight size={12} aria-hidden="true"/></button>{showDraft && (row.rule === "fail" || row.ai?.status === "changes_suggested") && <button type="button" disabled={busy} onClick={() => onPrepareFeedback?.(overviewFeedbackDraft(row, delivery.id, language))}><MessageSquarePlus size={12} aria-hidden="true"/>{tr("修改草稿", "Draft changes")}</button>}</div>
      </li>)}</ol>
      {overview.rows.length > 3 && <p className="delivery-overview-more">{tr(`共 ${overview.rows.length} 项要求；其余项目可在逐项核查中查看。`, `${overview.rows.length} requirements in total; inspect the rest in Evidence checks.`)}</p>}
    </details>
    <footer className="delivery-overview-footer"><span>{tr("各类结果分别记录；AI 建议不代替人工验收。", "Results remain separate; AI advice does not replace buyer acceptance.")}</span>{onViewHistory && delivery.sequence !== 1 && <button type="button" disabled={busy} onClick={onViewHistory}><History size={12} aria-hidden="true"/>{tr("版本对照", "Version history")}</button>}</footer>
    {(ruleComparison || aiComparison) && <p className="delivery-overview-comparison">{tr("已加载历史版", "Loaded historical version")}{overview.previous?.sequence ? ` v${overview.previous.sequence}` : ""} → {delivery.sequence ? `v${delivery.sequence}` : tr("当前版", "current")}{ruleComparison && <span>{tr("规则不符", "Rule mismatches")} {overview.previous?.ruleFailures} → {overview.ruleFailures}</span>}{aiComparison && <span>{tr("AI 修改建议", "AI change suggestions")} {overview.previous?.aiChanges} → {overview.aiChanges}</span>}</p>}
  </section>;
}
