"use client";

import { useId, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, GitCompareArrows } from "lucide-react";
import type { Language, ProofCriterion, ProofDelivery, ProofDeliveryVersion, ProofFeedback, ProofLayoutUnavailableReason, ProofReview } from "@/lib/contracts";
import { buildDeliveryComparison, type ComparisonUnavailableReason, type CriterionVersionEvidence } from "@/lib/delivery-comparison";
import "../delivery-comparison.css";

export type DeliveryComparisonProps = {
  delivery: ProofDelivery;
  review?: ProofReview;
  criteria: ProofCriterion[];
  previousVersion?: ProofDeliveryVersion;
  feedback?: ProofFeedback[];
  language: Language;
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
};
function displayTime(value: string) {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? `${time.toISOString().slice(0, 16).replace("T", " ")} UTC` : value;
}

export function DeliveryComparison({ delivery, review, criteria, previousVersion, feedback, language, onInspectCurrent }: DeliveryComparisonProps) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const id = useId();
  const [selected, setSelected] = useState("");
  const comparison = useMemo(() => buildDeliveryComparison({ delivery, review, criteria, previousVersion, feedback }), [delivery, review, criteria, previousVersion, feedback]);
  const row = comparison.rows.find(item => item.criterion.id === selected) ?? comparison.rows[0];
  const reason = (value: ComparisonUnavailableReason) => <p className="comparison-unavailable">{tr(...reasonLabels[value])}</p>;

  function renderEvidence(value: CriterionVersionEvidence) {
    const { rules, ai, browser } = value;
    return <>
      <section className="comparison-check"><h4>{tr("规则证据", "Rule evidence")}</h4>{rules.state === "unavailable" ? reason(rules.reason) : <>
        <p className="comparison-meta"><time dateTime={rules.data.reviewedAt}>{displayTime(rules.data.reviewedAt)}</time></p>
        {rules.data.evidence.map(item => <details className="comparison-source" key={item.id}><summary><span className={`comparison-finding comparison-finding-${item.finding}`}>{item.finding === "pass" ? tr("规则支持", "Rule supports") : item.finding === "fail" ? tr("规则不符", "Rule mismatch") : tr("需人工确认", "Human check required")}</span><code>{item.file}</code><ChevronDown size={12} aria-hidden="true" /></summary><p>{item.explanation}</p><pre><code>{item.excerpt}</code></pre></details>)}
      </>}</section>
      <section className="comparison-check"><h4>{tr("AI 源码建议", "AI source advice")}</h4>{ai.state === "unavailable" ? reason(ai.reason) : <>
        <span className={`comparison-finding comparison-ai-${ai.data.item.status}`}>{ai.data.item.status === "supported" ? tr("建议符合", "Suggested support") : ai.data.item.status === "changes_suggested" ? tr("建议修改", "Suggested changes") : tr("证据不足", "Insufficient evidence")}</span>
        <p className="comparison-text">{ai.data.item.explanation}</p>
        <details className="comparison-source"><summary>{tr(`已保存引用（${ai.data.item.citations.length}）`, `Saved citations (${ai.data.item.citations.length})`)}<ChevronDown size={12} aria-hidden="true" /></summary>{ai.data.item.citations.length ? ai.data.item.citations.map((citation, index) => <div key={`${citation.file}-${citation.start}-${index}`}><div className="comparison-meta"><code>{citation.file}</code><span>{tr("字符区间", "Character range")} [{citation.start}, {citation.end})</span></div><pre><code>{citation.excerpt}</code></pre></div>) : <p className="comparison-unavailable">{tr("没有源码引用，不能据此确认符合。", "No source citations; compliance cannot be confirmed from this.")}</p>}</details>
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
      {comparison.previous.state === "unavailable" && reason(comparison.previous.reason)}
      {row ? <>
        <label className="comparison-select-label" htmlFor={`${id}-criterion`}>{tr("选择验收要求", "Choose a requirement")}</label><select id={`${id}-criterion`} value={row.criterion.id} onChange={event => setSelected(event.target.value)}>{comparison.rows.map((item, index) => <option key={item.criterion.id} value={item.criterion.id}>{index + 1}/{comparison.rows.length} · {item.criterion.title}</option>)}</select>
        <div className="comparison-agreement"><strong>{tr("已确认的原始要求", "Original agreed requirement")}</strong><blockquote>{row.criterion.source}</blockquote></div>
        <section className="comparison-buyer-feedback"><h4>{tr("买家对旧版的修改意见", "Buyer feedback on the earlier version")}</h4>{row.previousFeedback.length ? row.previousFeedback.map(item => <div key={item.id}><blockquote>{item.comment}</blockquote><p className="comparison-meta"><time dateTime={item.at}>{displayTime(item.at)}</time></p></div>) : <p className="comparison-unavailable">{tr("未加载与此要求、旧版交付匹配的买家反馈。", "No loaded buyer feedback matches this requirement and earlier delivery.")}</p>}</section>
        <div className="comparison-columns">
          <section className="comparison-version"><header><h3>{tr("旧版", "Earlier version")}{comparison.previous.state === "available" && comparison.previous.data.sequence ? ` v${comparison.previous.data.sequence}` : ""}</h3>{comparison.previous.state === "available" && <><p>{comparison.previous.data.label}</p><code>{comparison.previous.data.id}</code></>}</header>{row.previous ? renderEvidence(row.previous) : <p className="comparison-unavailable">{tr("没有可用旧版，未借用当前记录。", "No earlier version is available; current records are not substituted.")}</p>}</section>
          <section className="comparison-version"><header><h3>{tr("当前版", "Current version")}{comparison.current.sequence ? ` v${comparison.current.sequence}` : ""}</h3><p>{comparison.current.label}</p><code>{comparison.current.id}</code></header>{renderEvidence(row.current)}</section>
        </div>
        {onInspectCurrent && <button className="comparison-inspect no-print" type="button" onClick={() => onInspectCurrent(row.criterion.id)}>{tr("打开当前版逐项证据", "Open current criterion evidence")}<ArrowUpRight size={13} aria-hidden="true" /></button>}
      </> : <p className="comparison-unavailable">{tr("没有可对照的验收要求。", "No acceptance requirements are available for comparison.")}</p>}
      <p className="comparison-limits">{tr("规则、源码 AI 建议和客户端上报的浏览器观测分别记录。宽度读数不证明手机可用；AI 未运行脚本或后台。本页不判断已修复、不自动验收，也不发起付款。", "Rules, source AI advice and client-reported browser observations are recorded separately. Width readings do not establish mobile usability; AI did not run scripts or a backend. This view does not verify a fix, accept work or initiate payment.")}</p>
    </div>
  </details>;
}

export default DeliveryComparison;
