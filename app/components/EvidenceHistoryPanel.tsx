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
import {PROJECT_JOURNEY_AGREEMENT,evaluateStoredProjectJourneyReport,projectJourneyReportsFor,sameJourneyRegistration,validateProjectJourneyPlan,validateStoredProjectJourneyReport,type ProjectJourneyPlan,type ProjectJourneyReport} from "@/lib/project-journey";

type Props = {delivery: ProofDelivery; language: Language; acceptedSnapshotId?: string};
const displayTime = (value: string) => Number.isFinite(Date.parse(value)) ? `${new Date(value).toISOString().slice(0,19).replace("T"," ")} UTC` : value;

function LayoutReadings({report, language}: {report: ProofLayoutReport; language: Language}) {
  const zh = language === "zh";
  return <div className="evidence-history-layout"><p>{zh ? "客户端上报的布局观察，未由服务器独立验证。" : "Client-reported layout observations, not independently verified by the server."}</p><p>{zh ? "上报身份" : "Reporting role"}: {report.reportedByRole === "buyer" ? zh ? "买家" : "Buyer" : report.reportedByRole === "seller" ? zh ? "卖家" : "Seller" : zh ? "未记录" : "Not recorded"}</p><ul>{report.readings.map(row => <li key={`${row.file}-${row.viewportWidth}`}><strong>{row.file} · {row.viewportWidth}px</strong><span>{row.status === "measured" ? `${zh ? "横向溢出" : "Horizontal overflow"}: ${row.overflowPx}px` : `${zh ? "未验证" : "Unverified"}: ${row.reason}`}</span></li>)}</ul></div>;
}

export function JourneyAgreementReadings({plan,language}:{plan:ProjectJourneyPlan;language:Language}){
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  try{const saved=validateProjectJourneyPlan(plan);return <details className="evidence-history-source"><summary>{tr("查看此版本单独确认的可选技术约定","View this delivery’s separately confirmed optional agreement")}</summary><p>{tr("这是买家另行采纳的技术约定，不是 AI 从原始合同自动推断的条款。","This technical agreement was separately adopted by the buyer, not inferred automatically from an original contract.")}</p><p>{tr("确认时间","Confirmed at")}: {displayTime(saved.confirmedAt)}</p><p>{tr("每笔最多 6 人；每时段总容量 8 人。包括取消只释放一次、失败改期保留原单、先查单后原键重试。","Maximum 6 guests per booking and 8 per slot; includes one-time cancellation release, preservation after a failed move, and read-before-original-key-retry.")}</p><pre>{PROJECT_JOURNEY_AGREEMENT}</pre><code>{saved.recipe}</code><code>{saved.planDigest}</code></details>;}catch{return <p className="evidence-history-warning">{tr("保存的可选技术约定无法校验，未替换成当前约定。","The saved optional agreement could not be validated; the current agreement was not substituted.")}</p>;}
}

/** Read only. A report selected by its saved ID is never replaced by the latest
 * report, and these details cannot navigate to or operate the seller site. */
export function JourneyEvidenceReadings({report,deliveryId,language}:{report:ProjectJourneyReport;deliveryId:string;language:Language}){
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  try{
    validateStoredProjectJourneyReport(report,{deliveryId,deliveryDigest:report.deliveryDigest});
    const evaluated=evaluateStoredProjectJourneyReport(report);
    return <section className="evidence-history-source"><p><strong>{tr("本版本业务旅程记录","Business journey for this delivery")}</strong>: {tr(`${evaluated.summary.observed}/20 项有观测支持，${evaluated.summary.issues} 项不符，${evaluated.summary.unavailable} 项未确定。`,`${evaluated.summary.observed}/20 supported, ${evaluated.summary.issues} mismatched, ${evaluated.summary.unavailable} unavailable.`)}</p><p>{tr("报告编号","Report ID")}: <code>{report.id}</code></p><p>{tr("交付文件摘要","Delivery digest")}: <code>{report.deliveryDigest}</code></p><p>{tr("登记测试站","Registered staging target")}: {report.registration.label} · {report.registration.registrationRevision}</p><p>{tr("保存时间","Saved at")}: {displayTime(report.receivedAt)}</p><JourneyAgreementReadings plan={report.plan} language={language}/><p className="evidence-history-note">{tr("表单操作和请求记录由卖家页面的客户端提供；主站服务器另行读取登记接口。二者一致仍不证明数据库诚实、实际浏览器操作、部署源码来源或整站无缺陷。只读历史不会重新请求卖家网站，也不接受交付或付款。","Form actions and request traces are client supplied by the seller page; the main server separately read the registered endpoints. Agreement does not prove database honesty, actual browser actions, deployed-source provenance or absence of all bugs. This history view makes no new seller requests, accepts no work and makes no payment.")}</p><ol>{evaluated.steps.map(step=>{const raw=report.input.observations.find(o=>o.id===step.id);return <li key={step.id}><details><summary><strong>{step.label}</strong> · {step.id} · {step.outcome==="observed"?tr("观测支持","Observed support"):step.outcome==="mismatch"?tr("不符","Mismatch"):tr("未确定","Unavailable")}</summary><p>{tr("预期","Expected")}: {step.expected}</p>{step.reason&&<p>{tr("原因","Reason")}: {step.reason}</p>}<pre>{raw?JSON.stringify(raw,null,2):tr("没有保存本步骤的观测；不算通过。","No observation was saved for this step; it is not a pass.")}</pre></details></li>;})}</ol></section>;
  }catch{return <p className="evidence-history-warning">{tr("所引用的业务旅程记录无法校验或不属于此版本，未使用最新报告替代。","The referenced journey could not be validated or belongs to another delivery; the latest report was not substituted.")}</p>;}
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
  const journeyData=useMemo(()=>{try{const reports=projectJourneyReportsFor(delivery);for(const report of reports)validateStoredProjectJourneyReport(report,{deliveryId:delivery.id,deliveryDigest:report.deliveryDigest});return{reports,error:false};}catch{return{reports:[],error:true};}},[delivery]);
  const snapshots = (delivery.acceptanceEvidence ?? []).filter(item => item.deliveryId === delivery.id);
  const currentAcceptance = snapshots.find(item => item.id === acceptedSnapshotId);
  const rows = [
    ...journeyData.reports.map(report=>({key:`journey:${report.id}`,kind:"journey" as const,report,at:report.receivedAt})),
    ...data.runtime.map(report=>({key:`runtime:${report.id}`,kind:"runtime" as const,report,at:report.finishedAt})),
    ...data.business.map(report => ({key: `business:${report.id}`, kind: "business" as const, report, at: report.receivedAt})),
    ...data.browser.map(report => ({key: `browser:${report.id}`, kind: "browser" as const, report, at: report.receivedAt})),
    ...data.layout.map(report => ({key: `layout:${report.id}`, kind: "layout" as const, report, at: report.receivedAt})),
  ].sort((a,b) => Date.parse(b.at) - Date.parse(a.at));
  const active = rows.find(row => row.key === selected);
  return <details className="evidence-history-panel">
    <summary><span><FileClock size={15} aria-hidden="true"/>{tr("检查历史与验收时证据", "Check history & acceptance evidence")}</span><span>{tr(`${data.browser.length + data.layout.length + data.business.length + data.runtime.length + journeyData.reports.length} 次检查 · ${snapshots.length} 份验收快照`, `${data.browser.length + data.layout.length + data.business.length + data.runtime.length + journeyData.reports.length} checks · ${snapshots.length} acceptance snapshots`)}</span><ChevronDown size={14} aria-hidden="true"/></summary>
    <div className="evidence-history-body">
      <p>{tr("这里保留实际保存的检查。验收时记录绑定当时的报告；后续检查只作补充，不改写当时的依据。", "These are genuinely saved runs. An acceptance record names the reports available at that time; later checks are supplements and do not rewrite that evidence.")}</p>
      {data.error && <p role="status">{tr("保存的检查历史暂时无法读取，请刷新后重试。没有用最新结果补作历史证明。", "The saved check history could not be read. Refresh and retry; latest results have not been substituted for historical evidence.")}</p>}
      {journeyData.error&&<p className="evidence-history-warning">{tr("业务旅程历史无法完整校验，未把其他版本或最新检查补作历史证明。其他类型的历史继续独立显示。","Journey history could not be fully validated. No other delivery or latest run was substituted; other check histories remain separately visible.")}</p>}
      {acceptedSnapshotId && !currentAcceptance && <p className="evidence-history-warning">{tr("当前验收引用的证据快照无法读取，不能用最近一次检查替代。", "The current acceptance's evidence snapshot is unavailable; a newer check cannot replace it.")}</p>}
      {!snapshots.length && <p className="evidence-history-empty">{tr("此版本尚无保存的验收时证据快照。旧版本的验收不会事后补记；后续检查也不能证明当时看到了什么。", "No acceptance-time evidence snapshot was saved for this version. Older acceptances are not reconstructed after the fact, and later checks do not establish what was seen then.")}</p>}
      {snapshots.map(snapshot => {
        const business = data.business.find(report => report.id === snapshot.businessReportId);
        const runtime = data.runtime.find(report => report.id === snapshot.runtimeReportId);
        const journey=journeyData.reports.find(report=>report.id===snapshot.journeyReportId);
        const frozenJourneyMatches=!!journey&&journey.deliveryDigest===snapshot.journeyDeliveryDigest&&journey.planDigest===snapshot.journeyPlanDigest&&sameJourneyRegistration(journey.registration,snapshot.journeyRegistration);
        const browser = data.browser.find(report => report.id === snapshot.browserReportId);
        const layout = data.layout.find(report => report.id === snapshot.layoutReportId);
        return <details key={snapshot.id} className="evidence-history-snapshot">
          <summary aria-label={`${snapshot.id === acceptedSnapshotId ? tr("当前验收时证据", "Evidence at the current acceptance") : tr("已保存的验收时证据", "Saved acceptance-time evidence")} ${displayTime(snapshot.at)} ${snapshot.id}`}><span>{snapshot.id === acceptedSnapshotId ? tr("当前验收时证据", "Evidence at the current acceptance") : tr("已保存的验收时证据", "Saved acceptance-time evidence")} · {displayTime(snapshot.at)} <span title={snapshot.id}>#{snapshot.id.slice(0,8)}</span></span><ChevronDown size={13} aria-hidden="true"/></summary>
          <div>
            <p><strong>{tr("证据快照编号", "Evidence snapshot ID")}</strong><code>{snapshot.id}</code></p>
            <p>{tr(`当时人工明确确认 ${snapshot.manualChecks.length} 项。`, `${snapshot.manualChecks.length} human checks were explicitly confirmed then.`)}</p>
            <ul>{snapshot.criteria.map(criterion => <li key={criterion.id}><strong>{criterion.title}</strong><p>{criterion.source}</p><small>{snapshot.manualChecks.includes(criterion.id) ? tr("验收时已人工确认", "Human-confirmed at acceptance") : tr("验收时的规则证据", "Rule evidence at acceptance")}: {snapshot.evidence.filter(item => item.criterionId === criterion.id).map(item => item.finding).join(", ")}</small></li>)}</ul>
            <details className="evidence-history-source"><summary>{tr("查看当时保存的规则原文证据", "View the rule-source evidence saved then")}</summary><ul>{snapshot.evidence.map((item,index) => <li key={`${item.id}-${index}`}><strong>{item.criterionId} · {item.file}</strong><pre>{item.excerpt}</pre><p>{item.explanation}</p></li>)}</ul></details>
            {snapshot.runtimeReportId&&<section><p>{tr("验收时的预约接口报告","Booking report at acceptance")}: <code>{snapshot.runtimeReportId}</code></p>{snapshot.runtimeExceptionReason&&<p>{tr("接受例外的原因","Acceptance exception")}: {snapshot.runtimeExceptionReason}</p>}{runtime?<RuntimeCheckPanel language={language} deliveryId={delivery.id} deliveryDigest={snapshot.runtimeDeliveryDigest} plan={runtime.plan} targetId={snapshot.runtimeTargetId} report={runtime} enabled={false} onRun={()=>{}}/>:<p className="evidence-history-warning">{tr("原报告不可读取，未用最新报告替代。","The original report is unavailable; the latest is not a substitute.")}</p>}</section>}
            {snapshot.journeyReportId?<section><p><strong>{tr("验收时冻结的业务旅程报告","Journey report frozen at acceptance")}</strong>: <code>{snapshot.journeyReportId}</code></p><p>{snapshot.journeyClientObservationAcknowledged?tr("买家当时已明确确认客户端观测边界。","The buyer explicitly acknowledged the client-observation limits then."):tr("当时没有记录客户端观测边界确认，不能事后补记。","No acknowledgement of the client-observation limits was recorded then; it cannot be added retrospectively.")}</p>{snapshot.journeyExceptionReason&&<p className="evidence-history-warning">{tr("当时接受例外的原始原因","Original acceptance exception")}: {snapshot.journeyExceptionReason}</p>}{snapshot.journeyAcknowledgedSteps?.length?<p>{tr("当时明确确认的不符或未知步骤","Mismatched or unavailable steps acknowledged then")}: {snapshot.journeyAcknowledgedSteps.join(", ")}</p>:null}{journey&&frozenJourneyMatches?<JourneyEvidenceReadings report={journey} deliveryId={delivery.id} language={language}/>:<p className="evidence-history-warning">{tr("冻结报告不存在或与验收保存的摘要、约定和登记不一致。未使用之后的补充报告替代。","The frozen report is missing or differs from the saved digest, agreement or registration. A later supplemental report was not substituted.")}</p>}</section>:<p className="evidence-history-note">{tr("此验收快照未引用业务旅程报告；之后保存的旅程检查只作补充。","This acceptance snapshot did not reference a journey report; later journey checks are supplementary.")}</p>}
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
      {!rows.length && !data.error && !journeyData.error && <p>{tr("还没有保存的检查记录。", "No check run has been saved yet.")}</p>}
      <ul className="evidence-history-runs">{rows.map(row => <li key={row.key}><button type="button" aria-pressed={selected === row.key} aria-expanded={selected === row.key} aria-controls={detailId} onClick={() => setSelected(selected === row.key ? "" : row.key)}><span>{row.kind === "journey" ? tr("业务旅程", "Business journey") : row.kind === "runtime" ? tr("预约接口实测", "Booking HTTP") : row.kind === "business" ? tr("业务内容", "Business content") : row.kind === "browser" ? tr("链接和资源", "Links & resources") : tr("页面布局", "Page layout")}</span><time dateTime={row.at}>{displayTime(row.at)}</time><span>{row.kind === "runtime" ? tr("服务端 HTTP 执行", "Server HTTP execution") : row.kind==="journey"?tr("客户端记录 + 服务端读回","Client claims + server readbacks"):row.report.reportedByRole === "buyer" ? tr("买家", "Buyer") : row.report.reportedByRole === "seller" ? tr("卖家", "Seller") : tr("上报身份未记录", "Reporting role not recorded")}</span>{row.kind==="journey"&&<><span title={row.report.id}>#{row.report.id.slice(0,8)}</span><span>{currentAcceptance?.journeyReportId===row.report.id?tr("当前验收引用此报告","Referenced by current acceptance"):snapshots.some(s=>s.journeyReportId===row.report.id)?tr("被历史验收快照引用","Referenced by a saved acceptance"):tr("补充检查，未被验收快照引用","Supplemental; not referenced by acceptance")}</span></>}</button></li>)}</ul>
      <div id={detailId}>
        {active?.kind === "runtime" && <RuntimeCheckPanel key={active.key} language={language} deliveryId={delivery.id} deliveryDigest={delivery.runtimeDeliveryDigest} plan={active.report.plan} targetId={delivery.backendTargetId} registration={delivery.runtimeRegistration} report={active.report} enabled={false} onRun={()=>{}}/>}
        {active?.kind === "journey"&&<JourneyEvidenceReadings key={active.key} report={active.report} deliveryId={delivery.id} language={language}/>}
        {active?.kind === "business" && <BusinessChecksPanel key={active.key} language={language} report={active.report} count={active.report.summary.steps / 2} readOnly enabled={false} busy={false} onRun={() => {}} onCancel={() => {}}/>}
        {active?.kind === "browser" && <BrowserCheckPanel key={active.key} language={language} report={active.report} readOnly enabled={false} busy={false} onRun={() => {}} onCancel={() => {}}/>}
        {active?.kind === "layout" && <LayoutReadings report={active.report} language={language}/>}
      </div>
      <p className="evidence-history-note">{tr("首次升级前只保留了最近一次检查；这里不会补造更早的检查记录。浏览器、布局、业务内容和接口检查每类最多 100 次；业务旅程最多 20 次，并受总保存量限制。达到上限会明确拒绝新增，已有记录不会自动删去。", "Earlier runs that were never retained are not invented. Browser, layout, content and HTTP checks allow up to 100 runs per type; journeys allow 20, subject to a total storage limit. New saves are explicitly rejected at the limit; existing records are not silently removed.")}</p>
    </div>
  </details>;
}
