"use client";

import { useId } from "react";
import { CheckCheck, ChevronDown, FileText } from "lucide-react";
import type { Language, RequirementCoverage, RequirementCoverageUnit } from "@/lib/contracts";

export type CoverageDraftDecision = { id: string; disposition: "include" | "exclude" | "pending"; reason?: string };

type Props = {
  language: Language;
  version: RequirementCoverage["version"];
  units: RequirementCoverageUnit[];
  decisions: CoverageDraftDecision[];
  confirmed: boolean;
  disabled: boolean;
  onDecisionChange: (decision: CoverageDraftDecision) => void;
  onConfirmChange: (confirmed: boolean) => void;
};

/** Displays exact source fragments; it does not claim semantic extraction. */
export function RequirementCoveragePanel({language, version, units, decisions, confirmed, disabled, onDecisionChange, onConfirmChange}: Props) {
  const id = useId();
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const rows = units.map(unit => ({unit, decision: decisions.find(item => item.id === unit.id) ?? {id: unit.id, disposition: "include" as const}}));
  const unresolved = rows.some(({decision}) => decision.disposition === "pending" || decision.disposition === "exclude" && !decision.reason?.trim());
  const included = rows.filter(({decision}) => decision.disposition === "include").length;
  return <section className="requirement-coverage" aria-labelledby={`${id}-title`}>
    <div className="requirement-coverage-heading"><h3 id={`${id}-title`}><CheckCheck size={15} aria-hidden="true"/>{tr("确认这次要做什么", "Confirm what the seller should deliver")}</h3><span>{tr(`要做 ${included} 条`, `${included} to deliver`)}</span></div>
    <p className="requirement-coverage-help" id={`${id}-help`}>
      {version === 2
        ? tr("你写的每一行都列在下面。", "Each line you wrote is listed below.")
        : tr("你的要求已按标点分开。要自己分条，可以返回上一步，一行写一件事。", "Your requirements are split at punctuation. Go back and write one thing per line if you want to group them yourself.")}
      {" "}{tr("选了「这次要做」的内容，交付后会逐条检查。一条里写了几件事，就要全部做到。", "Everything marked ‘Include’ will be checked after delivery. If you put several things on one line, all of them need to be done.")}
    </p>
    <ol className="requirement-coverage-list" aria-describedby={`${id}-help`}>{rows.map(({unit,decision}, index) => <li key={unit.id} className={`coverage-${decision.disposition}`}>
      <div className="requirement-coverage-row"><span className="requirement-coverage-number" aria-hidden="true">{index + 1}</span><blockquote>{unit.text}</blockquote></div>
      <label htmlFor={`${id}-${unit.id}`}>{tr("这次要做吗？", "Include this requirement?")}</label>
      <select id={`${id}-${unit.id}`} value={decision.disposition} disabled={disabled} onChange={event => onDecisionChange({...decision, disposition: event.target.value as CoverageDraftDecision["disposition"]})}>
        <option value="include">{tr("这次要做", "Include")}</option>
        <option value="pending">{tr("还要和卖家商量", "Discuss with the seller first")}</option>
        <option value="exclude">{tr("这次不做（请写原因）", "Leave out (give a reason)")}</option>
      </select>
      {decision.disposition === "exclude" && <><label htmlFor={`${id}-${unit.id}-reason`}>{tr("为什么这次不做？", "Why are you leaving it out?")}</label><textarea id={`${id}-${unit.id}-reason`} value={decision.reason ?? ""} maxLength={300} rows={2} required disabled={disabled} placeholder={tr("例如：这次先把菜单做好，下次再加预约。", "For example: we’ll finish the menu now and add bookings next time.")} onChange={event => onDecisionChange({...decision, reason: event.target.value})}/></>}
      {decision.disposition === "pending" && <p className="requirement-coverage-warning">{tr("请先和卖家说清楚，然后选「这次要做」或「这次不做」。", "Agree on this with the seller first, then choose whether to include it.")}</p>}
    </li>)}</ol>
    {!units.length && <p className="requirement-coverage-warning">{tr("先填写网站需求，才能确认每条要求。", "Enter website requirements before confirming coverage.")}</p>}
    <label className="requirement-coverage-confirm"><input type="checkbox" checked={confirmed} disabled={disabled || !units.length || unresolved} onChange={event => onConfirmChange(event.target.checked)}/><span>{tr("我确认上面哪些要做、哪些不做。双方都能查看这份记录。", "I’ve confirmed what’s included and what’s left out. Both sides can see this record.")}</span></label>
    {unresolved && <p className="requirement-coverage-warning" role="status">{tr("请先决定哪些要做，并为不做的项目写明原因。", "Decide what to include and add a reason for anything you leave out before continuing.")}</p>}
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
