"use client";

import { useId, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, GitCompareArrows } from "lucide-react";
import type { Language, ProofAssessmentCitation, ProofAssessmentItem, ProofCriterion, ProofDelivery, ProofDeliveryVersion, ProofFeedback, ProofLayoutUnavailableReason, ProofReview } from "@/lib/contracts";
import { buildDeliveryComparison, type ComparisonUnavailableReason, type CriterionVersionEvidence, type DeliveryComparisonResult } from "@/lib/delivery-comparison";
import "../delivery-comparison.css";
import { BusinessRevisionComparison } from "./BusinessRevisionComparison";
import { RuntimeComparison } from "./RuntimeComparison";
import type { RuntimeCheckPlan } from "@/lib/runtime-checks";

export type DeliveryComparisonProps = {
  delivery: ProofDelivery;
  review?: ProofReview;
  criteria: ProofCriterion[];
  previousVersion?: ProofDeliveryVersion;
  feedback?: ProofFeedback[];
  language: Language;
  acceptance?: {snapshotId: string; assessmentId?: string};
  runtimePlan?: RuntimeCheckPlan;
  projectId?: string;
  onInspectCurrent?: (criterionId: string) => void;
};

const reasonLabels: Record<ComparisonUnavailableReason, [string, string]> = {
  no_previous: ["尚未加载可对照的旧版本。", "No earlier version has been loaded for comparison."],
  not_older: ["所选记录无法确认为更早的交付，未用作旧版。", "The selected record cannot be confirmed as an earlier delivery and is not used as history."],
  no_report: ["此版本没有保存这类检查记录。", "No record of this check was saved for this version."],
  different_delivery: ["记录属于其他交付版本，此处不可用。", "The record belongs to a different delivery and is unavailable here."],
  no_criterion_evidence: ["此报告未覆盖当前要求，不能视为通过。", "This report does not cover this requirement; it cannot count as a pass."],
  invalid_report: ["此记录缺少可靠或唯一的读数，暂不可用于对照。", "This record has unreliable or ambiguous entries and is unavailable for comparison."],
  no_file_readings: ["此要求涉及的文件没有保存布局读数。", "No layout readings were saved for the files referenced by this requirement."],
};
const browserReasons: Record<ProofLayoutUnavailableReason, [string, string]> = {
  missing_file: ["缺少文件", "Missing file"], load_failed: ["未能加载", "Load failed"], navigation_changed: ["页面已离开交付", "Navigation changed"],
  access_denied: ["不可读取", "Access denied"], timeout: ["超时", "Timed out"], unstable_layout: ["布局不稳定", "Unstable layout"], snapshot_mismatch: ["快照不匹配", "Snapshot mismatch"],
  response_type_mismatch: ["响应类型不匹配", "Response type mismatch"], response_identity_mismatch: ["交付响应标识不匹配", "Delivery response identity mismatch"],
  source_mismatch: ["返回源码不匹配", "Returned source mismatch"], rendered_snapshot_mismatch: ["呈现快照不匹配", "Rendered snapshot mismatch"],
};
function displayTime(value: string) {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? `${time.toISOString().slice(0, 16).replace("T", " ")} UTC` : value;
}

export type ComparisonSelection = { deliveryId: string; previousDeliveryId?: string; criterionId?: string };
/** A first history response may arrive after a deliberate choice. A different
 * known pair starts a new choice context; a transient loading gap does not. */
export function reconcileComparisonSelection(selection: ComparisonSelection, deliveryId: string, previousDeliveryId?: string): ComparisonSelection {
  if (selection.deliveryId !== deliveryId || previousDeliveryId && selection.previousDeliveryId && selection.previousDeliveryId !== previousDeliveryId) {
    return {deliveryId, previousDeliveryId};
  }
  if (previousDeliveryId && !selection.previousDeliveryId) return {...selection, previousDeliveryId};
  return selection;
}
export function selectedComparisonRow(rows: DeliveryComparisonResult["rows"], criterionId?: string) {
  return rows.find(item => item.criterion.id === criterionId) ?? rows.find(item => item.previousFeedback.length > 0) ?? rows[0];
}

export function DeliveryComparison({ delivery, review, criteria, previousVersion, feedback, language, acceptance, runtimePlan, projectId, onInspectCurrent }: DeliveryComparisonProps) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const id = useId();
  const [selection, setSelection] = useState<ComparisonSelection>({deliveryId: delivery.id, previousDeliveryId: previousVersion?.delivery.id});
  const activeSelection = reconcileComparisonSelection(selection, delivery.id, previousVersion?.delivery.id);
  if (activeSelection !== selection) setSelection(activeSelection);
  const comparison = useMemo(() => buildDeliveryComparison({ delivery, review, criteria, previousVersion, feedback }), [delivery, review, criteria, previousVersion, feedback]);
  const row = selectedComparisonRow(comparison.rows, activeSelection.criterionId);
  const reason = (value: ComparisonUnavailableReason) => <p className="comparison-unavailable">{tr(...reasonLabels[value])}</p>;
  const status = (value: ProofAssessmentItem["status"]) => value === "supported" ? tr("找到依据", "Evidence found") : value === "changes_suggested" ? tr("建议修改", "Changes suggested") : tr("证据不足", "Insufficient evidence");
  const badge = (value: ProofAssessmentItem["status"]) => <span className={`comparison-finding comparison-ai-${value}`}>{status(value)}</span>;

  function citations(items: ProofAssessmentCitation[], label: string) {
    return <details className="comparison-source"><summary>{label} ({items.length})<ChevronDown size={12} aria-hidden="true" /></summary>{items.length ? items.map((citation, index) => <div key={`${citation.file}-${citation.start}-${index}`}><div className="comparison-meta"><code>{citation.file}</code><span>{tr("字符区间", "Character range")} [{citation.start}, {citation.end})</span></div><pre><code>{citation.excerpt}</code></pre></div>) : <p className="comparison-unavailable">{tr("这一层没有保存源码引用，未借用其他层的引用。", "No source citation was saved for this layer. Citations from other layers are not substituted.")}</p>}</details>;
  }

  function assessmentLayers(item: ProofAssessmentItem) {
    const sourcePublication = ["source-publication-v1", "source-publication-v2", "source-publication-v3"].includes(item.publicationBasis?.schema ?? "") ? item.publicationBasis : undefined;
    const original = item.modelJudgment, source = item.sourceFinding;
    return <>
      <div className="comparison-assessment-layer" data-evidence-layer="published"><h5>{sourcePublication ? tr("发布结果 · 源码核验", "Published result · source checks") : tr("发布结果", "Published result")}</h5>{badge(item.status)}
        {sourcePublication && <p className="comparison-meta">{sourcePublication.reason === "locked_price_mismatch" || sourcePublication.reason === "locked_price_match" ? tr("发布依据：已锁定菜品与价格的源码核验。", "Publication basis: source checks against the locked item and price.") : tr("发布依据：双方确认的表单范围内，约定标签的源码核验。", "Publication basis: agreed-label source checks within the form confirmed by both parties.")} <code>{sourcePublication.schema}</code></p>}
        <p className="comparison-text">{item.explanation}</p>{citations(item.citations, tr("发布结果引用", "Published-result citations"))}
      </div>
      {original ? <details className="comparison-assessment-layer comparison-layer-details" data-evidence-layer="model"><summary><span>{tr("原始模型判断", "Original model judgment")}</span>{badge(original.status)}<ChevronDown size={12} aria-hidden="true" /></summary><p className="comparison-text">{original.explanation}</p>{citations(original.citations, tr("原始模型引用", "Original-model citations"))}</details>
        : <div className="comparison-assessment-layer" data-evidence-layer="model"><h5>{tr("原始模型判断", "Original model judgment")}</h5><p className="comparison-unavailable">{tr("此记录没有独立保存原始模型判断；发布结果不能代替模型原答。", "No original model judgment was separately saved in this record. The published result is not a substitute for the original answer.")}</p></div>}
      {source ? <details className="comparison-assessment-layer comparison-layer-details" data-evidence-layer="source"><summary><span>{tr("系统独立源码事实", "Independent system source finding")}</span>{badge(source.status)}<ChevronDown size={12} aria-hidden="true" /></summary>
        <p className="comparison-meta">{source.basis === "locked_business_values" ? tr("依据：已锁定业务值。", "Basis: locked business values.") : tr("依据：HTML 声明的标签。", "Basis: declared HTML labels.")}</p>
        {source.scopeBinding && <p className="comparison-meta">{tr("双方确认的范围：", "Scope confirmed by both parties: ")}<code>{source.scopeBinding.file}{source.scopeBinding.formId ? ` #${source.scopeBinding.formId}` : ""}</code></p>}
        <p className="comparison-text">{source.explanation}</p>{citations(source.citations, tr("独立源码事实引用", "Independent-source citations"))}
        <p className="comparison-unavailable">{tr("这里只记录已检查的源码条件；不证明整条要求满足、页面可见或实际运行。", "This records the checked source conditions, not fulfillment of the whole requirement, page visibility or execution.")}</p>
      </details> : <div className="comparison-assessment-layer" data-evidence-layer="source"><h5>{tr("系统独立源码事实", "Independent system source finding")}</h5><p className="comparison-unavailable">{tr("此记录未保存独立源码事实。", "No independent source finding was saved in this record.")}</p></div>}
    </>;
  }

  function renderEvidence(value: CriterionVersionEvidence) {
    const { rules, ai, browser } = value;
    return <>
      <section className="comparison-check"><h4>{tr("规则证据", "Rule evidence")}</h4>{rules.state === "unavailable" ? reason(rules.reason) : <>
        <p className="comparison-meta"><time dateTime={rules.data.reviewedAt}>{displayTime(rules.data.reviewedAt)}</time></p>
        {rules.data.evidence.map(item => <details className="comparison-source" key={item.id}><summary><span className={`comparison-finding comparison-finding-${item.finding}`}>{item.finding === "pass" ? tr("规则支持", "Rule supports") : item.finding === "fail" ? tr("规则不符", "Rule mismatch") : tr("需人工确认", "Human check required")}</span><code>{item.file}</code><ChevronDown size={12} aria-hidden="true" /></summary><p>{item.explanation}</p><pre><code>{item.excerpt}</code></pre></details>)}
      </>}</section>
      <section className="comparison-check"><h4>{tr("交付评估 · 按来源查看", "Delivery assessment · by source")}</h4>{ai.state === "unavailable" ? reason(ai.reason) : <>
        <p className="comparison-meta comparison-report-id">{tr("报告编号：", "Report ID: ")}<code>{ai.data.reportId}</code></p>
        {assessmentLayers(ai.data.item)}
        <details className="comparison-source"><summary>{tr("模型与分析范围", "Model and coverage")}<ChevronDown size={12} aria-hidden="true" /></summary><p className="comparison-meta">{ai.data.model} <time dateTime={ai.data.assessedAt}>{displayTime(ai.data.assessedAt)}</time></p><p className="comparison-text">{tr("已纳入：", "Included: ")}{ai.data.coverage.includedFiles.join(", ") || tr("无", "None")}</p>{ai.data.coverage.truncatedFiles.length > 0 && <p className="comparison-unavailable">{tr("仅部分内容：", "Partial content: ")}{ai.data.coverage.truncatedFiles.join(", ")}</p>}{ai.data.coverage.omittedFiles.length > 0 && <p className="comparison-unavailable">{tr("未纳入：", "Omitted: ")}{ai.data.coverage.omittedFiles.join(", ")}</p>}{ai.data.limitations.map((limit, index) => <p className="comparison-meta" key={`${index}-${limit}`}>{limit}</p>)}</details>
      </>}</section>
      <section className="comparison-check"><h4>{tr("浏览器宽度读数", "Browser width readings")}</h4>{browser.state === "unavailable" ? reason(browser.reason) : <>
        <p className="comparison-meta">{browser.data.relation === "referenced_files" ? tr("仅显示上述证据涉及文件的读数，不证明本条要求已达到。", "Readings for files referenced above; they do not establish that this requirement is met.") : tr("全版本读数；尚未自动关联到本条要求。", "Delivery-wide readings; not automatically linked to this requirement.")}</p>
        <details className="comparison-source"><summary>{tr(`查看 ${browser.data.readings.length} 条读数`, `Inspect ${browser.data.readings.length} readings`)}<ChevronDown size={12} aria-hidden="true" /></summary><ul className="comparison-readings">{browser.data.readings.map(reading => <li key={`${reading.file}-${reading.viewportWidth}`}><div><code>{reading.file}</code><span>{reading.viewportWidth}px</span></div>{reading.status === "unavailable" ? <p className="comparison-unavailable">{tr("不可测：", "Unavailable: ")}{tr(...browserReasons[reading.reason])}</p> : <p>{tr("文档宽度", "Document width")} {reading.clientWidth}px / {reading.scrollWidth}px · {reading.scrollWidth - reading.clientWidth > 1 ? tr(`横向溢出 ${reading.scrollWidth - reading.clientWidth}px`, `${reading.scrollWidth - reading.clientWidth}px horizontal overflow`) : tr("未见文档横向溢出", "No document overflow observed")}</p>}</li>)}</ul><p className="comparison-meta"><time dateTime={browser.data.receivedAt}>{displayTime(browser.data.receivedAt)}</time></p></details>
      </>}</section>
    </>;
  }

  return <details className="delivery-comparison">
    <summary className="comparison-heading"><span><GitCompareArrows size={15} aria-hidden="true" />{tr("逐项版本对照", "Compare each requirement")}</span><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="comparison-body">
      <p className="comparison-notice">{tr("保留同一份已确认要求，分别查看两版的记录。版本号更新或问题数量减少，不等于修复已被确认。", "Both versions use the same agreed requirement. A newer version or a smaller issue count does not establish that a fix is verified.")}</p>
      {acceptance && <div className="comparison-notice" data-comparison-acceptance>
        <p>{tr("这里对照每版当前保存的检查，并非验收冻结记录。后续检查不改写验收时的依据。", "This compares the checks currently saved for each version, not the frozen acceptance record. Later checks do not rewrite the evidence accepted then.")}</p>
        <p>{tr("验收快照编号：", "Acceptance snapshot ID: ")}<code>{acceptance.snapshotId}</code></p>
        <p>{tr("验收时冻结的 AI 报告：", "AI report frozen at acceptance: ")}<code>{acceptance.assessmentId ?? tr("当时没有 AI 报告", "No AI report existed then")}</code></p>
      </div>}
      {comparison.previous.state === "unavailable" && reason(comparison.previous.reason)}
      <BusinessRevisionComparison delivery={delivery} previousVersion={previousVersion} language={language}/>
      {runtimePlan&&<RuntimeComparison projectId={projectId} plan={runtimePlan} delivery={delivery} previousVersion={previousVersion} language={language}/>}
      {row ? <>
        <label className="comparison-select-label" htmlFor={`${id}-criterion`}>{tr("选择验收要求", "Choose a requirement")}</label><select id={`${id}-criterion`} value={row.criterion.id} onChange={event => setSelection({...activeSelection, criterionId: event.target.value})}>{comparison.rows.map((item, index) => <option key={item.criterion.id} value={item.criterion.id}>{index + 1}/{comparison.rows.length} · {item.criterion.title}{item.previousFeedback.length > 0 ? tr(" · 上次要求修改", " · Changes requested last time") : ""}</option>)}</select>
        <div className="comparison-agreement"><strong>{tr("已确认的原始要求", "Original agreed requirement")}</strong><blockquote>{row.criterion.source}</blockquote></div>
        <section className="comparison-buyer-feedback"><h4>{tr("买家对旧版的修改意见", "Buyer feedback on the earlier version")}</h4>{row.previousFeedback.length ? row.previousFeedback.map(item => <div key={item.id}><blockquote>{item.comment}</blockquote><p className="comparison-meta"><time dateTime={item.at}>{displayTime(item.at)}</time></p></div>) : <p className="comparison-unavailable">{tr("未加载与此要求、旧版交付匹配的买家反馈。", "No loaded buyer feedback matches this requirement and earlier delivery.")}</p>}</section>
        <div className="comparison-columns">
          <section className="comparison-version"><header><h3>{tr("旧版", "Earlier version")}{comparison.previous.state === "available" && comparison.previous.data.sequence ? ` v${comparison.previous.data.sequence}` : ""}</h3>{comparison.previous.state === "available" && <><p>{comparison.previous.data.label}</p><code>{comparison.previous.data.id}</code></>}</header>{row.previous ? renderEvidence(row.previous) : <p className="comparison-unavailable">{tr("没有可用旧版，未借用当前记录。", "No earlier version is available; current records are not substituted.")}</p>}</section>
          <section className="comparison-version"><header><h3>{tr("当前版", "Current version")}{comparison.current.sequence ? ` v${comparison.current.sequence}` : ""}</h3><p>{comparison.current.label}</p><code>{comparison.current.id}</code></header>{renderEvidence(row.current)}</section>
        </div>
        {onInspectCurrent && <button className="comparison-inspect no-print" type="button" onClick={() => onInspectCurrent(row.criterion.id)}>{tr("打开当前版逐项证据", "Open current criterion evidence")}<ArrowUpRight size={13} aria-hidden="true" /></button>}
      </> : <p className="comparison-unavailable">{tr("没有可对照的验收要求。", "No acceptance requirements are available for comparison.")}</p>}
      <p className="comparison-limits">{tr("规则、发布结果、原始模型判断、独立源码事实和浏览器观测分别保留。发布结果的变化不是模型准确率，也不证明问题已修复。宽度读数不证明手机可用；AI 未运行脚本或后台。本页不自动验收，也不发起付款。", "Rules, published results, original model judgments, independent source findings and browser observations are retained separately. A change in publication is not model accuracy or proof of a fix. Width readings do not establish mobile usability; AI did not run scripts or a backend. This view does not accept work or initiate payment.")}</p>
    </div>
  </details>;
}

export default DeliveryComparison;
