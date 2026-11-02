"use client";

import { useId } from "react";
import { CheckCheck, ChevronDown, FileText } from "lucide-react";
import type { Language, RequirementCoverage, RequirementCoverageUnit } from "@/lib/contracts";

export type CoverageDraftDecision = { id: string; disposition: "include" | "exclude" | "pending"; reason?: string };

type Props = {
  language: Language;
  units: RequirementCoverageUnit[];
  decisions: CoverageDraftDecision[];
  confirmed: boolean;
  disabled: boolean;
  onDecisionChange: (decision: CoverageDraftDecision) => void;
  onConfirmChange: (confirmed: boolean) => void;
};

/** Displays exact source fragments; it does not claim semantic extraction. */
export function RequirementCoveragePanel({language, units, decisions, confirmed, disabled, onDecisionChange, onConfirmChange}: Props) {
  const id = useId();
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const rows = units.map(unit => ({unit, decision: decisions.find(item => item.id === unit.id) ?? {id: unit.id, disposition: "include" as const}}));
  const unresolved = rows.some(({decision}) => decision.disposition === "pending" || decision.disposition === "exclude" && !decision.reason?.trim());
  const included = rows.filter(({decision}) => decision.disposition === "include").length;
  return <section className="requirement-coverage" aria-labelledby={`${id}-title`}>
    <div className="requirement-coverage-heading"><h3 id={`${id}-title`}><CheckCheck size={15} aria-hidden="true"/>{tr("逐条确认原始需求", "Account for every source requirement")}</h3><span>{tr(`${included} 条纳入验收`, `${included} included for acceptance`)}</span></div>
    <p className="requirement-coverage-help" id={`${id}-help`}>{tr("以下按标点整理原文，未调用 AI。纳入的每条会成为独立人工验收项；一条包含多个要求时，需要全部满足。可回上一步用换行拆得更细。", "These are punctuation-based source fragments, without an AI call. Each included row becomes its own human acceptance check; every requirement within that row must be met. Go back and add line breaks to split a compound row further.")}</p>
    <ol className="requirement-coverage-list" aria-describedby={`${id}-help`}>{rows.map(({unit,decision}, index) => <li key={unit.id} className={`coverage-${decision.disposition}`}>
      <div className="requirement-coverage-row"><span className="requirement-coverage-number" aria-hidden="true">{index + 1}</span><blockquote>{unit.text}</blockquote></div>
      <label htmlFor={`${id}-${unit.id}`}>{tr("这条要求的处理方式", "How this requirement is handled")}</label>
      <select id={`${id}-${unit.id}`} value={decision.disposition} disabled={disabled} onChange={event => onDecisionChange({...decision, disposition: event.target.value as CoverageDraftDecision["disposition"]})}>
        <option value="include">{tr("纳入人工验收", "Include as a human check")}</option>
        <option value="pending">{tr("待澄清，暂不创建", "Clarify before creating")}</option>
        <option value="exclude">{tr("本次明确不做（需说明）", "Explicitly out of scope (give a reason)")}</option>
      </select>
      {decision.disposition === "exclude" && <><label htmlFor={`${id}-${unit.id}-reason`}>{tr("排除理由", "Reason for excluding")}</label><textarea id={`${id}-${unit.id}-reason`} value={decision.reason ?? ""} maxLength={300} rows={2} required disabled={disabled} placeholder={tr("例如：真实邮件发送由另一阶段单独验收。", "For example: email delivery will be accepted in a separate milestone.")} onChange={event => onDecisionChange({...decision, reason: event.target.value})}/></>}
      {decision.disposition === "pending" && <p className="requirement-coverage-warning">{tr("请先与卖家澄清，再选择纳入验收或明确排除。", "Clarify with the seller, then include this requirement or explicitly exclude it.")}</p>}
    </li>)}</ol>
    {!units.length && <p className="requirement-coverage-warning">{tr("先填写网站需求，才能确认每条要求。", "Enter website requirements before confirming coverage.")}</p>}
    <label className="requirement-coverage-confirm"><input type="checkbox" checked={confirmed} disabled={disabled || !units.length || unresolved} onChange={event => onConfirmChange(event.target.checked)}/><span>{tr("我已逐条核对。纳入的原文都要验收；排除的要求及理由将与约定一起保存。", "I reviewed every row. Included source requirements must be accepted; excluded requirements and their reasons will be saved with the agreement.")}</span></label>
    {unresolved && <p className="requirement-coverage-warning" role="status">{tr("还有待澄清的条目或未填写的排除理由。处理后才能确认并创建。", "Some rows need clarification or an exclusion reason. Resolve them before confirming and creating.")}</p>}
  </section>;
}

export function RequirementCoverageSource({coverage, language}: {coverage: RequirementCoverage; language: Language}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const included = coverage.decisions.filter(item => item.disposition === "include");
  const excluded = coverage.decisions.filter(item => item.disposition === "exclude");
  return <details className="requirement-coverage-saved">
    <summary><span><FileText size={14} aria-hidden="true"/>{tr("原始需求及本次范围", "Original requirements and agreed scope")}</span><span>{tr(`纳入 ${included.length} · 排除 ${excluded.length}`, `${included.length} included · ${excluded.length} excluded`)}</span><ChevronDown size={13} aria-hidden="true"/></summary>
    <div className="requirement-coverage-saved-body">
      <p className="requirement-coverage-help">{tr("买家确认的需求处理记录；不代表交付已经满足。", "The buyer's confirmed scope decisions; this does not mean the delivery meets them.")}</p>
      <details><summary>{tr("完整网站需求原文", "Complete original website requirements")}</summary><pre tabIndex={0}>{coverage.sourceText}</pre></details>
      <ol className="requirement-coverage-list">{coverage.decisions.map(item => <li key={item.id} className={`coverage-${item.disposition}`}><blockquote>{item.text}</blockquote><p><strong>{item.disposition === "include" ? tr("纳入验收", "Included for acceptance") : tr("本次明确排除", "Explicitly excluded from this scope")}</strong>{item.disposition === "include" && item.criterionId && <span> · {item.criterionId}</span>}</p>{item.disposition === "exclude" && <p>{tr("理由：", "Reason: ")}{item.reason}</p>}</li>)}</ol>
      <p className="requirement-coverage-help">{tr("范围确认记录时间", "Scope confirmation recorded at")}: <time dateTime={coverage.confirmedAt}>{coverage.confirmedAt.slice(0,19).replace("T"," ")} UTC</time></p>
    </div>
  </details>;
}
