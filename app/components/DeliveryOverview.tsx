"use client";

import { ArrowRight, ChevronDown, FileCheck2, History, MessageSquarePlus, ScanLine } from "lucide-react";
import {useRef} from "react";
import type { Language, ProofCollaboration, ProofCriterion, ProofDelivery, ProofDeliveryVersion, ProofLayoutWidth, ProofReview, ProofRole } from "@/lib/contracts";
import { criterionDisplayTitle, deliveryOverview, overviewFeedbackDraft, overviewRowLabel } from "@/lib/delivery-overview";
import { deliveryLayoutSummary } from "@/lib/delivery-layout-summary";
import { buildBusinessSpotlight } from "@/lib/business-spotlight";
import { BusinessSpotlight } from "./BusinessSpotlight";
import {evaluateStoredProjectJourneyReport,validateStoredProjectJourneyReport,type ProjectJourneyEvaluation} from "@/lib/project-journey";
import {runtimeReportSummary} from "@/lib/runtime-checks";
import {runtimeOverviewRows} from "@/lib/runtime-overview";
import {RuntimeCoverageSummary} from "./RuntimeCoverageSummary";
import {useModelDiagnosis} from "./useModelDiagnosis";
import {ModelSpotlight} from "./ModelSpotlight";
import {ModelDiagnosticComparison} from "./ModelDiagnosticComparison";
import {deliveryResultEnquiry,deliveryResultFocus,deliveryResultInspection,deliveryResultStatus} from "@/lib/delivery-result-focus";
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
  previousVersionLoading?: boolean;
  busy?: boolean;
  onInspect: (criterionId: string) => void;
  onPrepareFeedback?: (input: { deliveryId: string; criterionId: string; comment: string }) => void;
  onViewHistory?: () => void;
  onOpenLayout?: () => void;
  onOpenBusiness?: () => void;
  onOpenRuntime?: () => void;
  onOpenEnquiry?: () => void;
  onOpenTransfer?: () => void;
  onOpenJourney?: () => void;
  onOpenModel?: () => void;
  projectId?: string;
  acceptedSnapshotId?: string;
  onInspectLayout?: (file: string, width: ProofLayoutWidth) => void;
};

export function DeliveryOverview({ delivery, criteria, review, manualChecks, language, role, stage, previousVersion, previousVersionLoading=false, busy = false, onInspect, onPrepareFeedback, onViewHistory, onOpenLayout, onOpenBusiness, onOpenRuntime, onOpenEnquiry, onOpenTransfer, onOpenJourney, onOpenModel, projectId, acceptedSnapshotId, onInspectLayout }: DeliveryOverviewProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const overview = deliveryOverview({ delivery, criteria, review, manualChecks, previousVersion });
  const hasSourcePublication = delivery.assessment?.deliveryId === delivery.id && delivery.assessment.items.some(item => ["source-publication-v1", "source-publication-v2"].includes(item.publicationBasis?.schema ?? ""));
  const comparedSourcePublication = hasSourcePublication || !!previousVersion?.delivery.assessment?.items.some(item => ["source-publication-v1", "source-publication-v2"].includes(item.publicationBasis?.schema ?? ""));
  const layout = deliveryLayoutSummary(delivery);
  const model=useModelDiagnosis(delivery,{projectId,acceptedSnapshotId,accepted:stage==="accepted"});
  const business = buildBusinessSpotlight(delivery, previousVersion);
  const runtime=delivery.runtimeReport?.deliveryId===delivery.id?delivery.runtimeReport:undefined;
  const runtimeSummary=runtime?runtimeReportSummary(runtime.steps):undefined;
  let journey:ProjectJourneyEvaluation|undefined;
  try{if(delivery.journeyReport&&delivery.journeyPlan)journey=evaluateStoredProjectJourneyReport(validateStoredProjectJourneyReport(delivery.journeyReport,{deliveryId:delivery.id,deliveryDigest:delivery.journeyReport.deliveryDigest,plan:delivery.journeyPlan}));}catch{/* Never substitute a stale or malformed report. */}
  const runtimeRows=runtime?runtimeOverviewRows(runtime,language):[];
  const layoutIssue = layout.state === "current" ? layout.firstIssue : undefined;
  const firstRows = overview.rows.slice(0, 3);
  const primaryNeedsAttention = firstRows[0] && (firstRows[0].rule === "fail" || firstRows[0].rule === "unreviewed"
    || firstRows[0].humanPending || firstRows[0].ai?.status === "changes_suggested" || firstRows[0].ai?.status === "insufficient_evidence" && !firstRows[0].humanConfirmed);
  const showPrimary = !business || firstRows[0]?.rule === "fail" || firstRows[0]?.rule === "unreviewed" || firstRows[0]?.ai?.status === "changes_suggested";
  const showDraft = role === "buyer" && stage === "submitted" && !!onPrepareFeedback;
  const enquiry=deliveryResultEnquiry(delivery,projectId);
  const resultInput={delivery,overview,layout,model,business,journey,runtime:runtimeSummary,enquiry,language};
  const focus=deliveryResultFocus(resultInput),statuses=deliveryResultStatus(resultInput);
  const detailsRef=useRef<HTMLDetailsElement>(null);
  const title=stage==="accepted"?tr("买家已接受当前交付","The buyer accepted this delivery"):focus.title;
  const openDetails=()=>{if(detailsRef.current){detailsRef.current.open=true;detailsRef.current.querySelector<HTMLElement>("summary")?.focus();}};
  const inspect=deliveryResultInspection(focus,{criterion:onInspect,model:onOpenModel,business:onOpenBusiness??onOpenLayout,journey:onOpenJourney,runtime:onOpenRuntime,enquiry:onOpenEnquiry,transfer:onOpenTransfer??openDetails,layout:onOpenLayout,details:openDetails});

  const rowLabel = (row: (typeof overview.rows)[number]) => row.rule !== "fail" && row.ai?.status === "changes_suggested" && ["source-publication-v1", "source-publication-v2"].includes(row.ai.publicationBasis?.schema ?? "") ? tr("系统源码核验发布：不符", "System source-check publication: mismatch") : overviewRowLabel(row, language);

  const ruleComparison = overview.previous?.ruleFailures !== undefined && overview.ruleFailures !== undefined;
  const aiComparison = overview.previous?.aiChanges !== undefined && overview.aiChanges !== undefined;

  return <section className="delivery-overview" aria-label={tr("当前交付结果", "Current delivery results")}>
    <header className="delivery-overview-heading"><FileCheck2 size={16} aria-hidden="true"/><h3>{title}</h3><span>{delivery.sequence ? `v${delivery.sequence}` : tr("当前版", "Current")}</span></header>
    <div className="delivery-result-focus" data-result-reason={focus.reason}>
      <p>{focus.key}</p>{inspect&&<button type="button" disabled={busy} onClick={inspect}>{tr("查看这项证据","Inspect this evidence")}<ArrowRight size={12} aria-hidden="true"/></button>}
    </div>
    <ul className="delivery-result-status" aria-label={tr("各类结果与未覆盖项","Results and uncovered evidence by layer")}>{statuses.map(row=><li key={row.id} className={row.attention?"overview-attention":undefined}>{row.text}</li>)}</ul>
    {stage==="accepted"&&<p className="delivery-result-boundary">{tr("验收与付款保留当时冻结的版本和证据；后续检查不会改写原验收，也不会被补记为已接受。","Acceptance and payment retain the originally frozen version and evidence. Later checks do not rewrite acceptance or become retrospectively accepted.")}</p>}
    {stage==="accepted"&&model.state!=="none"&&model.acceptance!=="not_accepted"&&<p className="delivery-result-boundary">{model.acceptance==="accepted_report"?tr("并发报告由原验收快照引用。","The original acceptance snapshot references this concurrent report."):model.acceptance==="supplemental"?tr("当前并发报告属于补充检查，未被补记为原验收证据。","The current concurrent report is supplemental, not retrospectively accepted evidence."):tr("原并发验收报告关联暂无法确认；当前报告不能补作原验收证明。","The original concurrent-report reference could not be verified; the current report cannot replace historical acceptance evidence.")}</p>}
    <p className="delivery-result-boundary">{tr("各类数量分别记录；AI 建议或人工复核不代表问题已解决，验收与付款仍需分别确认。","Counts remain separate. AI advice or human review does not establish resolution; acceptance and payment need separate confirmation.")}</p>
    <details ref={detailsRef} className="delivery-result-reports">
    <summary>{tr("完整检查与版本证据（选看）","Full checks and version evidence (optional)")}</summary>
    <ModelSpotlight data={model} language={language} busy={busy} onInspect={onOpenModel}/>
    <ModelDiagnosticComparison delivery={delivery} previousVersion={previousVersion} loading={previousVersionLoading} projectId={projectId} language={language} onInspect={onOpenModel}/>
    {business && <BusinessSpotlight delivery={delivery} previousVersion={previousVersion} language={language} busy={busy} onInspect={onOpenBusiness ?? onOpenLayout ?? (() => {})} onPrepareFeedback={showDraft ? onPrepareFeedback : undefined}/>}
    {(delivery.enquiryPlan||delivery.enquiryReport||delivery.enquiryRun)&&<div className="delivery-overview-layout"><div className="delivery-overview-layout-heading"><strong>{tr("咨询提交与保存检查","Enquiry submission and persistence checks")}</strong>{onOpenEnquiry&&<button type="button" disabled={busy} onClick={onOpenEnquiry}>{tr("查看咨询后台证据","Inspect enquiry-backend evidence")}<ArrowRight size={12}/></button>}</div><p className="delivery-overview-layout-note">{delivery.enquiryRun?.deliveryId===delivery.id?tr("有未完成记录；以下为先前保存的报告，不代替本轮结果。","An unfinished record exists. Any counts below are from a previously saved report, not this run’s result."):""}{enquiry?tr(`${enquiry.summary.supported} 项支持，${enquiry.summary.mismatch} 项不符，${enquiry.summary.unknown} 项未知。`,`${enquiry.summary.supported} supported, ${enquiry.summary.mismatch} mismatched, ${enquiry.summary.unknown} unknown.`):tr("本版尚无可用报告，未作通过判断。","This version has no usable report; no pass is claimed.")}</p><p className="delivery-overview-layout-note">{tr("仅检查已约定的测试后台，不证明网站表单已连接、真实邮件已送达或整站无缺陷。","Covers the agreed test backend, not a connected website form, real email delivery or a defect-free site.")}</p></div>}
    {delivery.journeyPlan&&<div className="delivery-overview-layout"><div className="delivery-overview-layout-heading"><strong>{tr("本版业务旅程","This delivery’s business journey")}: {delivery.journeyRun?tr("运行尚未完成","Run incomplete"):journey?`${journey.summary.observed}/20 ${tr("项观测支持","supported observations")}`:tr("尚未检验","Not checked")}</strong>{onOpenJourney&&<button type="button" disabled={busy} onClick={onOpenJourney}>{tr("查看表单与服务端证据","Inspect form and server evidence")}<ArrowRight size={12}/></button>}</div>{journey&&<p className="delivery-overview-layout-note">{tr("不符","Mismatched")} {journey.summary.issues} · {tr("未确定","Unavailable")} {journey.summary.unavailable} · {tr("创建、取消、改期、响应丢失后原键重试与最终对账分别留证。","Creation, cancellation, moves, original-key retry after lost response, and final reconciliation are recorded separately.")}</p>}<p className="delivery-overview-layout-note">{tr("客户端表单记录＋主站独立读取卖家接口；按登记关联本版文件，不证明源码部署真实性，也不自动接受或付款。","Client form records plus separate server reads of seller endpoints. The operator links this upload; deployed-source provenance is not attested. No automatic acceptance or payment.")}</p></div>}
    {runtime&&runtimeSummary&&<div className="delivery-overview-layout"><div className="delivery-overview-layout-heading"><strong>{tr("预约接口实测","Booking HTTP check")}: {runtimeSummary.observed}/{runtimeSummary.steps} {tr("步有预期观测支持","steps with expected observations")}</strong>{onOpenRuntime&&<button type="button" disabled={busy} onClick={onOpenRuntime}>{tr(`查看 ${runtimeSummary.steps} 步证据`, `Inspect ${runtimeSummary.steps}-step evidence`)}<ArrowRight size={12}/></button>}</div>{runtimeRows.map(row=><p key={row.id} className="delivery-overview-layout-note"><strong>{row.label}</strong>: {row.detail}</p>)}<p className="delivery-overview-layout-note">{tr("不符","Mismatched")} {runtimeSummary.issues} · {tr("未确定","Unavailable")} {runtimeSummary.unavailable}</p><RuntimeCoverageSummary plan={runtime.plan} report={runtime} pending={!!delivery.runtimeRun} language={language}/></div>}
    <div className="delivery-overview-metrics" aria-label={tr("分别记录的检查结果", "Separately recorded check results")}>
      <span className={overview.ruleFailures ? "overview-attention" : ""}>{tr("规则不符", "Rule mismatches")} <strong>{overview.ruleFailures ?? "—"}</strong></span>
      <span className={overview.aiChanges ? "overview-attention" : ""}>{hasSourcePublication ? tr("发布结论需修改", "Published findings needing changes") : tr("AI 建议修改", "AI change suggestions")} <strong>{overview.aiChanges ?? tr("未运行", "Not run")}</strong></span>
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
    {delivery.supplementalCatalog&&delivery.supplementalCatalog.rows.length>0&&<div className="delivery-overview-layout"><strong>{tr("补充检验 · 分层证据","Supplemental checks · separate evidence layers")}</strong>{(["source-visibility","deployment-source","time-policy"] as const).map(family=>{const rows=delivery.supplementalCatalog!.rows.filter(r=>r.ref.family===family);if(!rows.length)return null;const counts={supported:0,mismatch:0,unknown:0};for(const r of rows)for(const f of r.findings)counts[f.outcome]++;return <p key={family}><span>{family==="source-visibility"?tr("文本可见性（客户端）","Text visibility (client)"):family==="deployment-source"?tr("部署字节（平台HTTP）","Deployment bytes (platform HTTP)"):tr("时间规则（适配器）","Time rules (adapter)")}</span>{" · "}{tr(`${counts.supported}项支持 / ${counts.mismatch}项不符 / ${counts.unknown}项未知`,`${counts.supported} supported / ${counts.mismatch} mismatch / ${counts.unknown} unknown`)}</p>;})}<p className="delivery-overview-layout-note">{delivery.supplementalDecision?.catalogDigest===delivery.supplementalCatalog.catalogDigest?tr("买家已核对当前目录；是否验收仍需单独确认。","The buyer reviewed the current catalog; delivery acceptance still requires separate confirmation."):tr("下一步：买家展开“补充证据”核对纳入／排除与每项例外，再继续验收。","Next: the buyer reviews included / excluded reports and every exception in Supplemental evidence, then continues acceptance.")}</p></div>}
    {delivery.supplementalCatalog&&delivery.supplementalCatalog.rows.length>0&&<details className="delivery-overview-details"><summary>{tr("逐项补充证据","Individual supplemental findings")}</summary><ul>{delivery.supplementalCatalog.rows.map(row=><li key={`${row.ref.family}:${row.ref.id}:${row.ref.version}`}><strong>{row.summary}</strong><ul>{row.findings.map(finding=><li key={finding.key}>{finding.outcome==="mismatch"?tr("不符：","Mismatch: "):finding.outcome==="unknown"?tr("未知：","Unknown: "):tr("观察支持：","Observed support: ")}{finding.label}</li>)}</ul></li>)}</ul></details>}
    <footer className="delivery-overview-footer"><span>{hasSourcePublication ? tr("发布结论包含系统源码核验；原模型判断另存，各类结果不代替人工验收。", "Published findings include system source checks. Original model judgments are separate; neither replaces buyer acceptance.") : tr("各类结果分别记录；AI 建议不代替人工验收。", "Results remain separate; AI advice does not replace buyer acceptance.")}</span>{onViewHistory && delivery.sequence !== 1 && <button type="button" disabled={busy} onClick={onViewHistory}><History size={12} aria-hidden="true"/>{tr("版本对照", "Version history")}</button>}</footer>
    {(ruleComparison || aiComparison) && <p className="delivery-overview-comparison">{tr("已加载历史版", "Loaded historical version")}{overview.previous?.sequence ? ` v${overview.previous.sequence}` : ""} → {delivery.sequence ? `v${delivery.sequence}` : tr("当前版", "current")}{ruleComparison && <span>{tr("规则不符", "Rule mismatches")} {overview.previous?.ruleFailures} → {overview.ruleFailures}</span>}{aiComparison && <span>{comparedSourcePublication ? tr("发布结论需修改", "Published findings needing changes") : tr("AI 修改建议", "AI change suggestions")} {overview.previous?.aiChanges} → {overview.aiChanges}</span>}</p>}
    </details>
  </section>;
}
