"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, FileSearch, LoaderCircle, Quote, TriangleAlert } from "lucide-react";
import type { Language, ProofAssessment, ProofAssessmentCitation, ProofCriterion } from "@/lib/contracts";
import { criterionDisplayTitle } from "@/lib/delivery-overview";
import "../assessment.css";

export type DeliveryAssessmentProps = {
  report?: ProofAssessment;
  criteria: ProofCriterion[];
  language: Language;
  selectedCriterionId?: string;
  enabled?: boolean;
  busy?: boolean;
  configured?: boolean;
  onRun?: () => void;
  onPrepareFeedback?: (input: { deliveryId: string; criterionId: string; comment: string }) => void;
  readOnly?: boolean;
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

export function DeliveryAssessment({ report, criteria, language, selectedCriterionId, enabled = false, busy = false, configured = false, onRun, onPrepareFeedback, readOnly = false }: DeliveryAssessmentProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const id = useId();
  const panelRef = useRef<HTMLDetailsElement>(null);
  const [initiallyExpanded] = useState(!readOnly);
  const selectedItem = selectedCriterionId ? report?.items.find(item => item.criterionId === selectedCriterionId) : report?.items[0];
  const otherItems = report?.items.filter(item => item !== selectedItem) ?? [];
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
    return <article className={`assessment-item${selected ? " assessment-item-selected" : ""}`} key={item.criterionId}>
      <div className="assessment-item-heading"><h4>{titleFor(item.criterionId)}</h4><span className={`assessment-status assessment-status-${item.status}`}>{statusLabel(item.status)}</span></div>
      <p className="assessment-explanation">{item.explanation}</p>
      <Citations citations={item.citations} language={language} />
      {item.ruleEvidenceIds.length > 0 && <p className="assessment-rule-refs">{tr("已关联此要求的规则证据，可与下方核查结果对照。", "Linked to this requirement’s rule evidence; compare it with the rule findings below.")}</p>}
      {canPrepareFeedback && <div className="assessment-feedback-action no-print"><button type="button" className="assessment-feedback-button" disabled={busy} onClick={() => {
        if (!report) return;
        const introduction = insufficient
          ? tr("证据不足（AI 建议，待买家核对）：请补充可复查的交付证据。\n", "Insufficient evidence (AI suggestion for buyer review): please provide verifiable delivery evidence.\n")
          : tr("AI 修改建议（待买家核对）：\n", "AI change suggestion (for buyer review):\n");
        const comment = `${introduction}${item.explanation}`.slice(0, 1000).replace(/[\uD800-\uDBFF]$/u, "");
        onPrepareFeedback?.({ deliveryId: report.deliveryId, criterionId: item.criterionId, comment });
      }}>{insufficient ? tr("请求补充证据", "Draft an evidence request") : tr("加入修改草稿", "Add to change draft")}</button><span>{tr("仅填入可编辑草稿，不会自动退回。", "Adds an editable draft without sending a change request.")}</span></div>}
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

      {!report ? <>
        {readOnly ? <p className="assessment-empty">{tr("此交付快照没有保存 AI 内容评估。", "No AI delivery assessment was saved with this delivery snapshot.")}</p> : <>
          <p className="assessment-consent" id={`${id}-consent`}>{tr("点击后，将把当前验收标准和交付源码发送给 DeepSeek 分析。可以直接填写要求，无需添加合同。", "When you click, the current acceptance criteria and delivery source files will be sent to DeepSeek for analysis. You can enter requirements directly; a contract is optional.")}</p>
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
        <details className="assessment-risks"><summary><TriangleAlert size={13} aria-hidden="true" />{tr(`源码中的潜在问题（${report.risks.length}）`, `Potential source issues (${report.risks.length})`)}<ChevronDown size={13} aria-hidden="true" /></summary>
          <div className="assessment-risk-body">{report.risks.length ? <><p className="assessment-risk-notice">{tr("源码线索尚未运行验证，需要复现后确认。", "Source-level indications have not been verified by execution. Reproduce them before drawing a conclusion.")}</p>{report.risks.slice(0, 5).map((risk, index) => <article className="assessment-risk" key={`${risk.title}-${index}`}><h4>{risk.title}</h4><p>{risk.explanation}</p><p className="assessment-risk-suggestion">{tr("建议核对：", "Suggested check: ")}{risk.suggestion}</p><Citations citations={risk.citations} language={language} /></article>)}{report.risks.length > 5 && <p className="assessment-risk-notice">{tr("此处展示前 5 项；完整报告保留在交付记录中。", "Showing the first 5 issues; the full report remains in the delivery record.")}</p>}</> : <p className="assessment-empty">{tr("此报告没有列出潜在问题，不代表网站没有缺陷。", "This report lists no potential issues. This does not establish that the website is free of defects.")}</p>}</div>
        </details>
        <details className="assessment-coverage"><summary>{tr("分析范围与局限", "Coverage and limitations")}<ChevronDown size={13} aria-hidden="true" /></summary><div className="assessment-coverage-body">
          <dl>{([
            [tr("已纳入文件", "Included files"), report.coverage.includedFiles],
            [tr("仅分析部分内容", "Partially included files"), report.coverage.truncatedFiles],
            [tr("未纳入文件", "Omitted files"), report.coverage.omittedFiles],
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
