"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, FileClock } from "lucide-react";
import type { Language, ProofDelivery, ProofLayoutReport } from "@/lib/contracts";
import { browserReportsFor, layoutReportsFor, businessReportsFor } from "@/lib/acceptance-evidence";
import { BusinessChecksPanel } from "./BusinessChecksPanel";
import { BrowserCheckPanel } from "./BrowserCheckPanel";
import { DeliveryAssessment } from "./DeliveryAssessment";
import "../evidence-history.css";
import {runtimeReportsFor} from "@/lib/runtime-project";
import {RuntimeCheckPanel} from "./RuntimeCheckPanel";

type Props = {delivery: ProofDelivery; language: Language; acceptedSnapshotId?: string};
const displayTime = (value: string) => Number.isFinite(Date.parse(value)) ? `${new Date(value).toISOString().slice(0,19).replace("T"," ")} UTC` : value;

function LayoutReadings({report, language}: {report: ProofLayoutReport; language: Language}) {
  const zh = language === "zh";
  return <div className="evidence-history-layout"><p>{zh ? "客户端上报的布局观察，未由服务器独立验证。" : "Client-reported layout observations, not independently verified by the server."}</p><p>{zh ? "上报身份" : "Reporting role"}: {report.reportedByRole === "buyer" ? zh ? "买家" : "Buyer" : report.reportedByRole === "seller" ? zh ? "卖家" : "Seller" : zh ? "未记录" : "Not recorded"}</p><ul>{report.readings.map(row => <li key={`${row.file}-${row.viewportWidth}`}><strong>{row.file} · {row.viewportWidth}px</strong><span>{row.status === "measured" ? `${zh ? "横向溢出" : "Horizontal overflow"}: ${row.overflowPx}px` : `${zh ? "未验证" : "Unverified"}: ${row.reason}`}</span></li>)}</ul></div>;
}

/** Read-only evidence from the exact delivery. A later run never substitutes
 * for the report referenced by an earlier explicit acceptance. */
export function EvidenceHistoryPanel({delivery, language, acceptedSnapshotId}: Props) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const [selected, setSelected] = useState("");
  const detailId = useId();
  const data = useMemo(() => {
    try {return {runtime:runtimeReportsFor(delivery),business: businessReportsFor(delivery), browser: browserReportsFor(delivery), layout: layoutReportsFor(delivery), error: false};}
    catch {return {runtime:[],business: [], browser: [], layout: [], error: true};}
  }, [delivery]);
  const snapshots = (delivery.acceptanceEvidence ?? []).filter(item => item.deliveryId === delivery.id);
  const currentAcceptance = snapshots.find(item => item.id === acceptedSnapshotId);
  const rows = [
    ...data.runtime.map(report=>({key:`runtime:${report.id}`,kind:"runtime" as const,report,at:report.finishedAt})),
    ...data.business.map(report => ({key: `business:${report.id}`, kind: "business" as const, report, at: report.receivedAt})),
    ...data.browser.map(report => ({key: `browser:${report.id}`, kind: "browser" as const, report, at: report.receivedAt})),
    ...data.layout.map(report => ({key: `layout:${report.id}`, kind: "layout" as const, report, at: report.receivedAt})),
  ].sort((a,b) => Date.parse(b.at) - Date.parse(a.at));
  const active = rows.find(row => row.key === selected);
  return <details className="evidence-history-panel">
    <summary><span><FileClock size={15} aria-hidden="true"/>{tr("检查历史与验收时证据", "Check history & acceptance evidence")}</span><span>{tr(`${data.browser.length + data.layout.length + data.business.length + data.runtime.length} 次检查 · ${snapshots.length} 份验收快照`, `${data.browser.length + data.layout.length + data.business.length + data.runtime.length} checks · ${snapshots.length} acceptance snapshots`)}</span><ChevronDown size={14} aria-hidden="true"/></summary>
    <div className="evidence-history-body">
      <p>{tr("这里保留实际保存的检查。验收时记录绑定当时的报告；后续检查只作补充，不改写当时的依据。", "These are genuinely saved runs. An acceptance record names the reports available at that time; later checks are supplements and do not rewrite that evidence.")}</p>
      {data.error && <p role="status">{tr("保存的检查历史暂时无法读取，请刷新后重试。没有用最新结果补作历史证明。", "The saved check history could not be read. Refresh and retry; latest results have not been substituted for historical evidence.")}</p>}
      {acceptedSnapshotId && !currentAcceptance && <p className="evidence-history-warning">{tr("当前验收引用的证据快照无法读取，不能用最近一次检查替代。", "The current acceptance's evidence snapshot is unavailable; a newer check cannot replace it.")}</p>}
      {!snapshots.length && <p className="evidence-history-empty">{tr("此版本尚无保存的验收时证据快照。旧版本的验收不会事后补记；后续检查也不能证明当时看到了什么。", "No acceptance-time evidence snapshot was saved for this version. Older acceptances are not reconstructed after the fact, and later checks do not establish what was seen then.")}</p>}
      {snapshots.map(snapshot => {
        const business = data.business.find(report => report.id === snapshot.businessReportId);
        const runtime = data.runtime.find(report => report.id === snapshot.runtimeReportId);
        const browser = data.browser.find(report => report.id === snapshot.browserReportId);
        const layout = data.layout.find(report => report.id === snapshot.layoutReportId);
        return <details key={snapshot.id} className="evidence-history-snapshot">
          <summary aria-label={`${snapshot.id === acceptedSnapshotId ? tr("当前验收时证据", "Evidence at the current acceptance") : tr("已保存的验收时证据", "Saved acceptance-time evidence")} ${displayTime(snapshot.at)} ${snapshot.id}`}><span>{snapshot.id === acceptedSnapshotId ? tr("当前验收时证据", "Evidence at the current acceptance") : tr("已保存的验收时证据", "Saved acceptance-time evidence")} · {displayTime(snapshot.at)} <span title={snapshot.id}>#{snapshot.id.slice(0,8)}</span></span><ChevronDown size={13} aria-hidden="true"/></summary>
          <div>
            <p><strong>{tr("证据快照编号", "Evidence snapshot ID")}</strong><code>{snapshot.id}</code></p>
            <p>{tr(`当时人工明确确认 ${snapshot.manualChecks.length} 项。`, `${snapshot.manualChecks.length} human checks were explicitly confirmed then.`)}</p>
            <ul>{snapshot.criteria.map(criterion => <li key={criterion.id}><strong>{criterion.title}</strong><p>{criterion.source}</p><small>{snapshot.manualChecks.includes(criterion.id) ? tr("验收时已人工确认", "Human-confirmed at acceptance") : tr("验收时的规则证据", "Rule evidence at acceptance")}: {snapshot.evidence.filter(item => item.criterionId === criterion.id).map(item => item.finding).join(", ")}</small></li>)}</ul>
            <details className="evidence-history-source"><summary>{tr("查看当时保存的规则原文证据", "View the rule-source evidence saved then")}</summary><ul>{snapshot.evidence.map((item,index) => <li key={`${item.id}-${index}`}><strong>{item.criterionId} · {item.file}</strong><pre>{item.excerpt}</pre><p>{item.explanation}</p></li>)}</ul></details>
            {snapshot.runtimeReportId&&<section><p>{tr("验收时的预约接口报告","Booking report at acceptance")}: <code>{snapshot.runtimeReportId}</code></p>{snapshot.runtimeExceptionReason&&<p>{tr("接受例外的原因","Acceptance exception")}: {snapshot.runtimeExceptionReason}</p>}{runtime?<RuntimeCheckPanel language={language} deliveryId={delivery.id} plan={runtime.plan} targetId={runtime.target.id} report={runtime} enabled={false} onRun={()=>{}}/>:<p className="evidence-history-warning">{tr("原报告不可读取，未用最新报告替代。","The original report is unavailable; the latest is not a substitute.")}</p>}</section>}
            <p>{tr("业务内容报告", "Business-content report")}: <code>{snapshot.businessReportId ?? tr("当时没有报告", "No report existed then")}</code></p>
            {snapshot.businessExceptionReason && <p className="evidence-history-warning">{tr("买家接受例外的原始原因", "Buyer's original acceptance exception")}: {snapshot.businessExceptionReason}</p>}
            {business ? <BusinessChecksPanel language={language} report={business} count={business.summary.steps / 2} readOnly enabled={false} busy={false} onRun={() => {}} onCancel={() => {}}/> : snapshot.businessReportId && <p className="evidence-history-warning">{tr("所引用的业务内容报告无法读取，不能替换为最新报告。", "The referenced business-content report is unavailable; the latest run cannot replace it.")}</p>}
            <p>{tr("浏览器行为报告", "Browser behavior report")}: <code>{snapshot.browserReportId ?? tr("当时没有报告", "No report existed then")}</code></p>
            {browser ? <BrowserCheckPanel language={language} report={browser} readOnly enabled={false} busy={false} onRun={() => {}} onCancel={() => {}}/> : snapshot.browserReportId && <p className="evidence-history-warning">{tr("所引用的历史报告无法读取，不能替换为最新报告。", "The referenced historical report is unavailable; the latest report is not a substitute.")}</p>}
            <p>{tr("布局报告", "Layout report")}: <code>{snapshot.layoutReportId ?? tr("当时没有报告", "No report existed then")}</code></p>
            {layout ? <LayoutReadings report={layout} language={language}/> : snapshot.layoutReportId && <p className="evidence-history-warning">{tr("所引用的布局历史无法读取。", "The referenced layout history is unavailable.")}</p>}
            <p>{tr("AI 报告", "AI report")}: <code>{snapshot.assessmentId ?? tr("当时没有报告", "No report existed then")}</code></p>
            {snapshot.assessment && <DeliveryAssessment report={snapshot.assessment} criteria={snapshot.criteria} language={language} riskReviews={snapshot.riskReviews} readOnly/>}
            <p className="evidence-history-note">{tr("证据记录不代表服务器独立验证、法律裁决或真实资金托管。", "An evidence record is not server-independent verification, a legal ruling or real escrow.")}</p>
          </div>
        </details>;
      })}
      <h4>{tr("已保存的检查记录", "Saved check runs")}</h4>
      {!rows.length && !data.error && <p>{tr("还没有保存的浏览器检查。", "No browser check has been saved yet.")}</p>}
      <ul className="evidence-history-runs">{rows.map(row => <li key={row.key}><button type="button" aria-pressed={selected === row.key} aria-expanded={selected === row.key} aria-controls={detailId} onClick={() => setSelected(selected === row.key ? "" : row.key)}><span>{row.kind === "runtime" ? tr("预约接口实测", "Booking HTTP") : row.kind === "business" ? tr("业务内容", "Business content") : row.kind === "browser" ? tr("链接和资源", "Links & resources") : tr("页面布局", "Page layout")}</span><time dateTime={row.at}>{displayTime(row.at)}</time><span>{row.kind === "runtime" ? tr("服务端 HTTP 执行", "Server HTTP execution") : row.report.reportedByRole === "buyer" ? tr("买家", "Buyer") : row.report.reportedByRole === "seller" ? tr("卖家", "Seller") : tr("上报身份未记录", "Reporting role not recorded")}</span></button></li>)}</ul>
      <div id={detailId}>
        {active?.kind === "runtime" && <RuntimeCheckPanel key={active.key} language={language} deliveryId={delivery.id} plan={active.report.plan} targetId={active.report.target.id} report={active.report} enabled={false} onRun={()=>{}}/>}
        {active?.kind === "business" && <BusinessChecksPanel key={active.key} language={language} report={active.report} count={active.report.summary.steps / 2} readOnly enabled={false} busy={false} onRun={() => {}} onCancel={() => {}}/>}
        {active?.kind === "browser" && <BrowserCheckPanel key={active.key} language={language} report={active.report} readOnly enabled={false} busy={false} onRun={() => {}} onCancel={() => {}}/>}
        {active?.kind === "layout" && <LayoutReadings report={active.report} language={language}/>}
      </div>
      <p className="evidence-history-note">{tr("首次升级前只保留了最近一次检查；这里不会补造更早的检查记录。每类最多保存 100 次检查，也有总保存量限制；达到上限会明确拒绝新增，已有记录不会被自动删去。", "Before this upgrade, only the latest run was retained; earlier runs are not invented here. Each check type allows up to 100 saved runs, subject to a total storage limit. New saves are explicitly rejected at the limit; existing records are not silently removed.")}</p>
    </div>
  </details>;
}
