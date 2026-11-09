"use client";

import { ArrowRight, ClipboardList, ExternalLink, RefreshCw, SearchCheck } from "lucide-react";
import { useState } from "react";
import type { Language, ProofAssessmentItem, ProofQuote, ProofRole } from "@/lib/contracts";
import { buyerProjectTitle, buyerRequirementLines, criterionDisplayTitle } from "@/lib/delivery-overview";
import type { PlainDeliverySummary } from "@/lib/plain-delivery-summary";
import { DeliveryWebsiteLink } from "./DeliveryWebsiteLink";
import "../plain-delivery-workspace.css";

type Action = { label: string; run: () => void; disabled?: boolean };
type Props = {
  quote: ProofQuote; role: ProofRole; language: Language; version?: number; previewPath?: string;
  summary?: PlainDeliverySummary;
  navigation?: {count: number; accepted: boolean; open: () => void};
  handoffStatus: string; reportStatus?: string; accepted: boolean; busy: boolean; primary?: Action; secondary?: Action;
  reportAction?: Action; onDetails: () => void; onAgreement: () => void; onRefresh: () => void;
};

export function PlainDeliveryWorkspace({quote, role, language, version, previewPath, summary, navigation, handoffStatus, reportStatus, accepted, busy, primary, secondary, reportAction, onDetails, onAgreement, onRefresh}: Props) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const buyer = role === "buyer";
  const requirements = buyerRequirementLines(quote, language);
  const checks = summary?.kind === "ready" ? summary : undefined;
  const originalDifferences = checks?.rows.filter(row => row.ai?.modelJudgment && row.ai.modelJudgment.status !== row.ai.status).length ?? 0;
  const [mobileSection, setMobileSection] = useState<"handoff" | "checks" | "requirements">("handoff");
  const openCheckEvidence = (targetId: string) => {
    setMobileSection("checks");
    requestAnimationFrame(() => document.getElementById(targetId)?.focus());
  };
  const statusText = (status: ProofAssessmentItem["status"]) => status === "supported" ? tr("找到依据", "evidence found")
    : status === "changes_suggested" ? tr("建议修改", "change suggested") : tr("无法判断", "cannot determine");

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
      {checks ? <div className="plain-mobile-counts">
        <span>{checks.reviewCurrent ? tr(`规则不符 ${checks.ruleFailures}`, `Rule mismatches: ${checks.ruleFailures}`) : tr("规则尚未核查", "Rules not checked")}</span>
        {!!checks.humanRemaining && <span>{tr(`人工待核对 ${checks.humanRemaining}`, `Human checks left: ${checks.humanRemaining}`)}</span>}
        {!!checks.unreviewed && <span>{tr(`未检查 ${checks.unreviewed}`, `Unchecked: ${checks.unreviewed}`)}</span>}
        {!checks.assessmentCurrent ? <span>{tr("暂无 AI 报告", "No AI report")}</span> : <span>{tr(`公布结果：建议修改 ${checks.aiChanges ?? 0} · 无法判断 ${checks.aiInsufficient ?? 0}`, `Published results: changes ${checks.aiChanges ?? 0} · unknown ${checks.aiInsufficient ?? 0}`)}</span>}
        {!!originalDifferences && <button type="button" onClick={() => openCheckEvidence(`plain-original-${checks.rows.find(row => row.ai?.modelJudgment && row.ai.modelJudgment.status !== row.ai.status)!.criterion.id}`)}>{tr(`与原始 AI 判断不同 ${originalDifferences} 条`, `${originalDifferences} differ from the original AI judgment`)}</button>}
        {!!checks.risks?.total && <button type="button" onClick={() => openCheckEvidence("plain-published-risks")}>{tr(`待核实风险 ${checks.risks.total}`, `Unverified risks: ${checks.risks.total}`)}{!!checks.risks.differingPositions && tr(` · 分歧 ${checks.risks.differingPositions}`, ` · Disagreements: ${checks.risks.differingPositions}`)}</button>}
        {!!checks.withheldRiskCount && <button type="button" onClick={() => openCheckEvidence("plain-withheld-risks")}>{tr(`暂缓公布的 AI 提醒 ${checks.withheldRiskCount}`, `Withheld AI indications: ${checks.withheldRiskCount}`)}</button>}
      </div> : <p>{summary?.kind === "unavailable" ? tr("验收记录不可用，请刷新或查看历史。", "Acceptance evidence unavailable. Refresh or inspect history.") : reportStatus ?? tr("交付后可检查结果。", "Results are available after delivery.")}</p>}
    </div>
    <div className="plain-mobile-nav" role="group" aria-label={tr("选择概览内容", "Choose overview section")}>
      {(["handoff", "checks", "requirements"] as const).map(section => <button key={section} type="button" aria-pressed={mobileSection === section} aria-controls={`plain-${section}-panel`} onClick={() => setMobileSection(section)}>{section === "handoff" ? tr("网站交付", "Website") : section === "checks" ? tr("检查结果", "Checks") : tr("买家需求", "Requirements")}</button>)}
    </div>
    <div className="plain-workspace-grid">
      <article id="plain-requirements-panel" className={`plain-workspace-card plain-requirements${mobileSection === "requirements" ? " is-mobile-selected" : ""}`} aria-labelledby="plain-requirements-heading">
        <h3 id="plain-requirements-heading"><ClipboardList size={19} aria-hidden="true"/>{tr("买家需求", "Buyer’s requirements")}</h3>
        <ul className="plain-requirements-list">{requirements.map((line, index) => <li key={index}>{line}</li>)}</ul>
        <button type="button" className="text-button plain-card-detail" onClick={onAgreement}>{tr("查看完整约定", "View full agreement")} <ArrowRight size={13} aria-hidden="true"/></button>
      </article>
      <article id="plain-handoff-panel" className={`plain-workspace-card plain-handoff${mobileSection === "handoff" ? " is-mobile-selected" : ""}`} aria-labelledby="plain-handoff-heading">
        <h3 id="plain-handoff-heading"><ExternalLink size={19} aria-hidden="true"/>{tr("卖家交付的网站", "Website from the seller")}</h3>
        <div className="plain-handoff-state">{version && <strong>{tr(`第 ${version} 版`, `Version ${version}`)}</strong>}<span>{handoffStatus}</span></div>
        {version && !previewPath ? <p className="plain-report-origin">{tr("这一版没有可打开的网站预览。", "This version has no website preview to open.")}</p>
          : <DeliveryWebsiteLink previewPath={previewPath} language={language} />}
      </article>
      <article id="plain-checks-panel" className={`plain-workspace-card plain-checks${mobileSection === "checks" ? " is-mobile-selected" : ""}`} aria-labelledby="plain-checks-heading" aria-busy={busy}>
        <h3 id="plain-checks-heading"><SearchCheck size={19} aria-hidden="true"/>{tr("检查结果", "Check results")}</h3>
        {checks && <p className="plain-report-origin">{checks.frozen ? tr("验收时保存的记录。后续补查另行保留。", "Saved at acceptance. Later checks are kept separately.") : tr("规则、AI 和你的核对分别显示。", "Rules, AI and your checks are shown separately.")}</p>}
        {checks ? <ul className="plain-check-list">{checks.rows.map(row => {
          const sourcePublication = ["source-publication-v1", "source-publication-v2", "source-publication-v3"].includes(row.ai?.publicationBasis?.schema ?? "");
          const originalModel = row.ai?.modelJudgment?.status;
          const originalDiffers = originalModel && originalModel !== row.ai?.status;
          return <li key={row.criterion.id}>
          <span>{criterionDisplayTitle(row.criterion, language)}</span>
          <span className="plain-check-findings">
            <strong className={`plain-check-badge plain-check-${row.rule === "fail" ? "changes_suggested" : row.rule === "pass" ? "supported" : "insufficient_evidence"}`}>{row.rule === "fail" ? tr("规则：需要修改", "Rules: mismatch") : row.rule === "pass" ? tr("规则：有依据", "Rules: evidence found") : row.rule === "unreviewed" ? tr("规则：尚未检查", "Rules: not checked") : row.humanConfirmed ? tr("人工核对", "Human check") : tr("需要人工核对", "Human check needed")}</strong>
            {row.ai && <span className={`plain-check-badge plain-check-${row.ai.status}`}>{sourcePublication ? tr("源码核验：", "Source check: ") : originalDiffers ? tr("公布结果：", "Published result: ") : "AI: "}{statusText(row.ai.status)}</span>}
            {originalDiffers && <span id={`plain-original-${row.criterion.id}`} tabIndex={-1} className={`plain-check-badge plain-check-${originalModel}`}>{tr("AI 原判断：", "Original AI: ")}{statusText(originalModel)}</span>}
            {row.humanConfirmed && <span className="plain-check-badge plain-check-confirmed">{checks.frozen ? tr("买家已确认", "Buyer confirmed") : tr("已勾选，未保存", "Selected, not saved")}</span>}
          </span>
        </li>;
        })}</ul> : <p className="plain-report-origin">{summary?.kind === "unavailable" ? tr("未能读取验收时的记录，请刷新或查看历史版本。", "Acceptance evidence is unavailable. Refresh or inspect version history.") : reportStatus ?? tr("卖家提交后，就可以检查网站。", "Check the website after the seller submits it.")}</p>}
        {checks && !checks.assessmentCurrent && <p className="plain-card-help">{tr("这版没有 AI 结果；上方仅显示规则和人工核对。", "No AI report for this version. The results above are rules and human checks only.")}</p>}
        {!!checks?.risks?.total && <p id="plain-published-risks" tabIndex={-1} className="plain-extra-risks">{tr(`另有 ${checks.risks.total} 条 AI 风险线索待核实`, `${checks.risks.total} additional AI risk indications to verify`)}{checks.risks.differingPositions > 0 && tr(`，其中 ${checks.risks.differingPositions} 条双方意见不同`, `; participants disagree on ${checks.risks.differingPositions}`)}{tr("。查看依据后再判断，记录意见不代表问题已解决。", ". Inspect the evidence; recording a position does not resolve a finding.")}</p>}
        {!!checks?.withheldRiskCount && <p id="plain-withheld-risks" tabIndex={-1} className="plain-extra-risks">{tr(`${checks.withheldRiskCount} 条 AI 提醒尚未核实，已暂缓列入风险。`, `${checks.withheldRiskCount} unverified AI indications are withheld from the risk list.`)}</p>}
        {checks && !accepted && <p className="plain-card-help">{tr("有依据不等于通过；请先看网站，再决定是否验收。", "Evidence is not approval. Look at the site before accepting it.")}</p>}
        {reportAction && <button type="button" className="text-button plain-card-detail" disabled={reportAction.disabled} onClick={reportAction.run}>{reportAction.label} <ArrowRight size={13} aria-hidden="true"/></button>}
        {navigation && <button type="button" className="text-button plain-card-detail" onClick={navigation.open}>{navigation.accepted ? tr(`验收报告：重放 ${navigation.count} 条导航`, `Acceptance report: replay ${navigation.count} links`) : tr(`重放 ${navigation.count} 条导航`, `Replay ${navigation.count} links`)} <ArrowRight size={13} aria-hidden="true"/></button>}
      </article>
    </div>
    {(primary || secondary || accepted) && <div className="plain-workspace-next">
      <p>{accepted ? tr("交付已验收。付款另行确认。", "The delivery is accepted. Payment is confirmed separately.") : buyer ? tr("买家决定是否验收。", "The buyer decides whether to accept.") : tr("由你提交网站，买家负责验收。", "You submit the website; the buyer decides whether to accept.")}</p>
      <div>{secondary && <button type="button" className="subtle-button" disabled={secondary.disabled} onClick={secondary.run}>{secondary.label}</button>}
      {primary && <button type="button" className="button primary" disabled={primary.disabled} onClick={primary.run}>{primary.label}<ArrowRight size={15} aria-hidden="true"/></button>}</div>
    </div>}
  </section>;
}
