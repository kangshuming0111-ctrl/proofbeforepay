"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ClipboardCheck, LoaderCircle, Plus, Square } from "lucide-react";
import type { Currency, Language, ProofBusinessCheck, ProofBusinessCheckReport, ProofBusinessExpected, RequirementCoverageUnit } from "@/lib/contracts";
import type { CoverageDraftDecision } from "./RequirementCoveragePanel";

export type BusinessCheckDraft = { key: string; criterionId: string; file: string; kind: "visible_copy" | "item_price"; text: string; label: string; amount: string; currency: Currency };
export function businessDraftReady(rows: BusinessCheckDraft[], units: RequirementCoverageUnit[], decisions: CoverageDraftDecision[], pages: string[]): boolean {
  return rows.length <= 8 && rows.every(row => units.some(unit => unit.id === row.criterionId && decisions.some(decision => decision.id === unit.id && decision.disposition === "include"))
    && pages.includes(row.file) && (row.kind === "visible_copy" ? !!row.text.trim() && row.text.trim().length <= 160
      : !!row.label.trim() && row.label.trim().length <= 80 && /^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/u.test(row.amount.trim()) && Number(row.amount) >= 0));
}
export function businessDraftItems(rows: BusinessCheckDraft[], units: RequirementCoverageUnit[]): ProofBusinessCheck[] {
  return rows.map((row, index) => {
    const unit = units.find(value => value.id === row.criterionId)!;
    return {id: `business-${index + 1}`, criterionId: row.criterionId, file: row.file, source: {start: unit.start, end: unit.end, excerpt: unit.text},
      expected: row.kind === "visible_copy" ? {kind: "visible_copy", text: row.text.trim()} : {kind: "item_price", label: row.label.trim(), amountMinor: Math.round(Number(row.amount) * 100), currency: row.currency}};
  });
}
export function businessExpectedLabel(expected: ProofBusinessExpected): string {
  return expected.kind === "visible_copy" ? expected.text : `${expected.label} — ${expected.currency} ${(expected.amountMinor / 100).toFixed(2)}`;
}


/** Translate only known deterministic report messages; persisted evidence and
 * observations stay unchanged. Unknown future explanations remain verbatim. */
function businessExplanation(reading: ProofBusinessCheckReport["readings"][number], language: Language): string {
  if (language !== "zh") return reading.explanation;
  if (reading.status === "unavailable") {
    const reasons: Record<string, string> = {
      missing_file: "约定页面尚未交付，无法核对其业务内容。",
      load_failed: "页面或必要样式未能加载，本次没有可用的文字观察。",
      snapshot_mismatch: "响应与保存的交付版本不一致，本次观察不能用于核对。",
      access_denied: "浏览器无法读取当前交付预览。",
      timeout: "本次文字观察超时，请重试或人工核对。",
      navigation_changed: "页面离开了当前保存的交付目标，本次观察不能使用。",
      ambiguous_link: "页面导航目标不明确，本次未完成核对。",
      unsupported_target: "此页面包含不支持的导航或资源目标，本次未完成核对。",
      resource_limit: "页面资源超出本次检查范围，未计为符合约定。",
      ambiguous_content: "无法可靠确定局部文字的可见性或归属，请人工核对。",
      text_limit: "页面文字超出本次可核对的范围，未计为符合约定。",
    };
    return reasons[reading.reason] ?? reading.explanation;
  }
  const messages: Record<string, string> = {
    "The expected literal copy was observed in a supplied visible text block.": "本次上报的可见文字条目包含约定文案。",
    "The expected literal copy was not observed in the supplied visible text blocks.": "本次上报的可见文字条目中未观察到约定文案；不代表已检查图片文字或同义改写。",
    "The expected item label was not observed in a supplied visible text block.": "本次上报的可见文字条目中未观察到约定菜名。",
    "The item block does not provide an unambiguous standalone amount with explicit AUD or USD currency.": "该菜品条目没有明确、唯一的金额及 AUD／USD 币种，仍需人工核对。",
    "The item label is associated with conflicting amounts or currencies in the supplied visible blocks.": "本次上报中，同一菜名对应了互相冲突的金额或币种，无法判定符合约定。",
    "The item label and expected ISO currency/amount were observed together in an unambiguous visible block.": "本次观察在同一明确的可见条目中发现了约定菜名、币种和金额。",
  };
  const price = /^The item block reports (AUD|USD) (\d+\.\d{2}), which differs from the buyer-confirmed currency or amount\.$/u.exec(reading.explanation);
  return price ? `本次菜品条目显示 ${price[1]} ${price[2]}，与买家确认的币种或金额不符。` : messages[reading.explanation] ?? reading.explanation;
}

export function BusinessCheckEditor({language, units, decisions, pages, rows, confirmed, disabled, onChange, onConfirm}: {
  language: Language; units: RequirementCoverageUnit[]; decisions: CoverageDraftDecision[]; pages: string[]; rows: BusinessCheckDraft[]; confirmed: boolean; disabled: boolean;
  onChange: (rows: BusinessCheckDraft[]) => void; onConfirm: (value: boolean) => void;
}) {
  const id = useId(), tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const included = units.filter(unit => decisions.some(row => row.id === unit.id && row.disposition === "include"));
  const validPages = [...new Set(pages)];
  const ready = businessDraftReady(rows, units, decisions, validPages);
  const update = (key: string, change: Partial<BusinessCheckDraft>) => onChange(rows.map(row => row.key === key ? {...row, ...change} : row));
  return <details className="business-check-editor">
    <summary><span><ClipboardCheck size={15}/>{tr("业务内容检查（选填）", "Business content checks (optional)")}</span><span>{rows.length ? tr(`${rows.length} 项 · ${confirmed ? "已确认" : "待确认"}`, `${rows.length} checks · ${confirmed ? "confirmed" : "confirm before creating"}`) : tr("价格、电话、营业时间", "Prices, contact details & hours")}</span><ChevronDown size={14}/></summary>
    <div className="business-check-editor-body">
      <p>{tr("把不能写错的内容单独约定。交付后会检查指定页面的可见文字，或同一菜单条目中的菜名、币种和价格。每项都保留对应需求原文。", "Agree the details that must be correct. After delivery, check visible copy on a chosen page, or the item, currency and price within one menu entry. Each check retains its original requirement.")}</p>
      <p className="business-check-help">{tr("例如：联系页应显示“03 9000 1234”；菜单页的“牛肉面”应为 AUD 18.00。未写明的细节请先回上一步补进需求。", "For example: Contact should display “03 9000 1234”; “Beef noodles” on Menu should cost AUD 18.00. Add any missing details to the original requirements first.")}</p>
      {rows.map((row, index) => <fieldset className="business-check-draft" key={row.key} disabled={disabled}>
        <div className="business-check-draft-heading"><strong>{tr(`检查 ${index + 1}`, `Check ${index + 1}`)}</strong><button type="button" className="text-button" onClick={() => onChange(rows.filter(item => item.key !== row.key))}>{tr("移除", "Remove")}</button></div>
        <label htmlFor={`${id}-${row.key}-source`}>{tr("对应哪条原始需求", "Original requirement")}</label>
        <select id={`${id}-${row.key}-source`} value={row.criterionId} onChange={event => update(row.key, {criterionId: event.target.value})}>
          {!included.some(unit => unit.id === row.criterionId) && <option value="">{tr("重新选择已纳入的需求", "Choose an included requirement")}</option>}
          {included.map(unit => <option key={unit.id} value={unit.id}>{unit.text}</option>)}
        </select>
        <div className="business-check-form-pair"><div><label htmlFor={`${id}-${row.key}-page`}>{tr("在哪个页面检查", "Page to check")}</label><select id={`${id}-${row.key}-page`} value={row.file} onChange={event => update(row.key, {file: event.target.value})}>
          {!validPages.includes(row.file) && <option value="">{tr("重新选择页面", "Choose a page")}</option>}{validPages.map(file => <option key={file}>{file}</option>)}
        </select></div><div><label htmlFor={`${id}-${row.key}-kind`}>{tr("检查内容", "What to check")}</label><select id={`${id}-${row.key}-kind`} value={row.kind} onChange={event => update(row.key, {kind: event.target.value as BusinessCheckDraft["kind"]})}><option value="visible_copy">{tr("指定文字可见", "Visible agreed copy")}</option><option value="item_price">{tr("菜品与价格", "Menu item & price")}</option></select></div></div>
        {row.kind === "visible_copy" ? <><label htmlFor={`${id}-${row.key}-text`}>{tr("应该显示的文字", "Copy that should be visible")}</label><input id={`${id}-${row.key}-text`} value={row.text} maxLength={160} placeholder={tr("例如：Monday to Friday, 11am–8pm", "e.g. Monday to Friday, 11am–8pm")} onChange={event => update(row.key, {text: event.target.value})}/><small>{tr("只归一空格、大小写和全角字符；同义改写仍需人工判断。", "Whitespace, case and full-width characters are normalized. Reworded meaning still needs human review.")}</small></>
          : <><label htmlFor={`${id}-${row.key}-label`}>{tr("菜单中的菜品名称", "Menu item name")}</label><input id={`${id}-${row.key}-label`} value={row.label} maxLength={80} placeholder={tr("牛肉面", "Beef noodles")} onChange={event => update(row.key, {label: event.target.value})}/><div className="business-check-form-pair"><div><label htmlFor={`${id}-${row.key}-currency`}>{tr("菜单币种", "Menu currency")}</label><select id={`${id}-${row.key}-currency`} value={row.currency} onChange={event => update(row.key, {currency: event.target.value as Currency})}><option>AUD</option><option>USD</option></select></div><div><label htmlFor={`${id}-${row.key}-amount`}>{tr("菜品价格", "Item price")}</label><input id={`${id}-${row.key}-amount`} value={row.amount} inputMode="decimal" placeholder="18.00" onChange={event => update(row.key, {amount: event.target.value})}/></div></div><small>{tr("需要在同一条目明确显示币种，如 AUD 18.00；此价格与项目制作费无关。", "The same entry must explicitly show the currency, such as AUD 18.00. This price is separate from the website project fee.")}</small></>}
      </fieldset>)}
      <button type="button" className="subtle-button" disabled={disabled || rows.length >= 8 || !included.length || !validPages.length} onClick={() => onChange([...rows, {key: crypto.randomUUID(), criterionId: included[0].id, file: validPages[0], kind: "visible_copy", text: "", label: "", amount: "", currency: "AUD"}])}><Plus size={13}/>{tr("添加业务内容检查", "Add a business content check")}</button>
      {rows.length > 0 && <><label className="business-check-confirm"><input type="checkbox" checked={confirmed} disabled={disabled || !ready} onChange={event => onConfirm(event.target.checked)}/><span>{tr("我确认这些页面和预期内容属于本次需求。锁定后按这些标准检查，不会根据卖家交付自动改写。", "I confirm these pages and expected values belong to this scope. They will be locked and will not be rewritten from the seller's delivery.")}</span></label>{!ready && <p className="business-check-warning" role="status">{tr("请补齐每项的来源、页面和预期内容，再确认。", "Complete each source, page and expected value before confirming.")}</p>}</>}
    </div>
  </details>;
}

export function BusinessChecksSource({checks, language}: {checks?: ProofBusinessCheck[]; language: Language}) {
  if (!checks?.length) return null;
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  return <details className="business-check-saved"><summary><span><ClipboardCheck size={14}/>{tr("已约定的业务内容检查", "Agreed business content checks")}</span><span>{checks.length}</span><ChevronDown size={14}/></summary><ul>{checks.map(check => <li key={check.id}><strong>{businessExpectedLabel(check.expected)}</strong><span>{check.file}</span><blockquote>{check.source.excerpt}</blockquote></li>)}</ul></details>;
}


/** Collapse only identical observations of the same agreed check. Different
 * widths retain separate cards whenever any observed result differs. */
function groupedBusinessReadings(report: ProofBusinessCheckReport | undefined): {reading: ProofBusinessCheckReport["readings"][number]; widths: number[]}[] {
  if (!report) return [];
  const checks = new Map<string, ProofBusinessCheckReport["readings"]>();
  for (const reading of report.readings) {
    const rows = checks.get(reading.checkId) ?? [];
    rows.push(reading); checks.set(reading.checkId, rows);
  }
  const comparable = (reading: ProofBusinessCheckReport["readings"][number]) => JSON.stringify({checkId: reading.checkId, criterionId: reading.criterionId, file: reading.file, source: reading.source, expected: reading.expected, status: reading.status, outcome: reading.outcome, explanation: reading.explanation, ...(reading.status === "observed" ? {blocks: reading.blocks} : {reason: reading.reason})});
  return [...checks.values()].flatMap(rows => rows.every(row => comparable(row) === comparable(rows[0]))
    ? [{reading: rows[0], widths: rows.map(row => row.viewportWidth)}]
    : rows.map(reading => ({reading, widths: [reading.viewportWidth]})));
}

export function BusinessChecksPanel({language, report, count = 0, enabled = false, busy = false, progress, onRun = () => {}, onCancel = () => {}, onPrepareFeedback, readOnly = false}: {
  language: Language; report?: ProofBusinessCheckReport; count?: number; enabled?: boolean; busy?: boolean; progress?: {done: number; total: number}; onRun?: () => void; onCancel?: () => void; onPrepareFeedback?: (criterionId: string, comment: string) => void; readOnly?: boolean;
}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const details = useRef<HTMLDetailsElement>(null);
  const [initiallyExpanded] = useState(() => !report || !!report.summary.issues || !!report.summary.unavailable);
  const readingGroups = groupedBusinessReadings(report);
  useEffect(() => {if (busy && details.current) details.current.open = true;}, [busy]);
  if (!count && !report) return null;
  return <details ref={details} className="business-check-panel" open={initiallyExpanded}>
    <summary><span><ClipboardCheck size={16}/>{tr("业务内容验收", "Business content checks")}</span><span>{busy ? tr("核对中", "Checking") : report ? tr(`${report.summary.issues} 次观察不符 · ${report.summary.unavailable} 次未确定`, `${report.summary.issues} mismatched observations · ${report.summary.unavailable} uncertain`) : tr(`${count} 项约定待核对`, `${count} agreed checks to run`)}</span><ChevronDown size={14}/></summary>
    <div className="business-check-panel-body">
      <p>{tr("核对当前保存页面中的可见文字。菜单价格必须与菜品在同一局部条目内；其他位置的正确数字不能代替它。", "Checks visible copy in the currently saved pages. A menu price must belong to the same local entry as its item; a correct number elsewhere does not satisfy it.")}</p>
      {!readOnly && <div className="business-check-actions"><button type="button" className="button primary" disabled={!enabled || busy} onClick={onRun}>{busy ? <LoaderCircle size={15} className="spin"/> : <ClipboardCheck size={15}/>} {busy ? tr("正在核对当前版本…", "Checking this version…") : report ? tr("重新核对业务内容", "Check business content again") : tr("核对业务内容", "Check business content")}</button>{busy && <button type="button" className="subtle-button" onClick={onCancel}><Square size={13}/>{tr("取消", "Cancel")}</button>}</div>}
      {busy && <div role="status" aria-live="polite">{tr(`已核对 ${progress?.done ?? 0}/${progress?.total ?? "…"}`, `Checked ${progress?.done ?? 0}/${progress?.total ?? "…"}`)}<progress max={progress?.total ?? 1} value={progress?.done}/></div>}
      {report && <><p className="business-check-help">{tr("上报身份", "Reported by")}: {report.reportedByRole === "buyer" ? tr("买家", "Buyer") : report.reportedByRole === "seller" ? tr("卖家", "Seller") : tr("未记录", "Not recorded")} · <time dateTime={report.receivedAt}>{report.receivedAt.slice(0,19).replace("T", " ")} UTC</time>{busy ? tr("（上次保存的报告）", " (previous saved report)") : ""}</p>
        <ul className="business-check-results">{readingGroups.map(({reading, widths}) => <li key={reading.stepId} className={`business-result-${reading.outcome}`}>
          <div className="business-check-result-heading"><strong>{reading.outcome === "expected_observation" ? tr("本次观察符合约定", "Observed as agreed") : reading.outcome === "mismatch" ? tr("本次观察与约定不符", "Observation differs from agreement") : tr("无法确定，仍需人工核对", "Uncertain; inspect manually")}</strong><span>{reading.file} · {widths.map(width => `${width}px`).join(" / ")}</span></div>
          <dl><div><dt>{tr("预期", "Expected")}</dt><dd>{businessExpectedLabel(reading.expected)}</dd></div><div><dt>{tr("实际观察", "Observed")}</dt><dd>{reading.status === "observed" ? reading.blocks.length ? reading.blocks.map((block, index) => <blockquote key={index}>{block}</blockquote>) : tr("未找到符合范围的可见文字条目。图片中的文字未识别。", "No relevant visible text block was found. Text in images was not read.") : tr("本次未获得可用的文字观察。", "No usable text observation was obtained.")}</dd></div></dl>
          <p className="business-check-help">{businessExplanation(reading, language)}</p>
          {onPrepareFeedback && reading.outcome !== "expected_observation" && <button type="button" className="text-button" onClick={() => onPrepareFeedback(reading.criterionId, `${tr("请核对", "Please check")} ${reading.file}: ${tr("约定为", "agreed")} ${businessExpectedLabel(reading.expected)}. ${reading.status === "observed" && reading.blocks.length ? `${tr("本次观察", "Observed")}: ${reading.blocks.join(" | ").slice(0, 420)}. ` : ""}${tr("请修改后重新提交，或提供可核查的说明。", "Revise and resubmit, or provide a verifiable explanation.")}`)}>{tr("起草这一项的修改意见", "Draft feedback for this check")}</button>}
        </li>)}</ul></>}
      <p className="business-check-help">{tr("客户端上报的静态页面文字观察，使用 375px、900px 两种预览宽度，不是服务器独立认证或真机测试。复杂遮挡、图片文字、同义改写和后台行为可能无法确定。它不代替人工验收，也不会自动付款。", "Client-reported static-page text observations at 375px and 900px preview widths, not independent server certification or device tests. Complex occlusion, text in images, reworded meaning and backend behavior may remain uncertain. Human acceptance is required; no payment is automatic.")}</p>
    </div>
  </details>;
}

export function BusinessAcceptanceDecision({language, report, reason, disabled, onReasonChange, onInspect}: {language: Language; report?: ProofBusinessCheckReport; reason: string; disabled: boolean; onReasonChange: (reason: string) => void; onInspect: () => void}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const id = useId(), exceptions = !!report && (report.summary.issues > 0 || report.summary.unavailable > 0);
  return <div className="business-acceptance-decision">
    {!report ? <><p>{tr("已约定业务内容检查，请先运行当前版本的核对，再决定验收。", "Business content checks were agreed. Run them on this version before deciding acceptance.")}</p><button type="button" className="subtle-button" disabled={disabled} onClick={onInspect}>{tr("前往核对业务内容", "Open business content checks")}</button></>
      : exceptions ? <><p>{tr("本次有不符或未确定的观察。可以退回修改；若仍决定接受，请说明原因。报告和你的理由会随验收保存，不会被标记成已修复。", "Some observations differ or remain uncertain. Request changes, or explain why you choose to accept. The report and your reason will be retained with acceptance, without marking the issues as fixed.")}</p><button type="button" className="text-button" disabled={disabled} onClick={onInspect}>{tr("查看业务核对报告", "Inspect the business report")}</button><label htmlFor={`${id}-reason`}>{tr("接受这些例外的原因", "Reason for accepting these exceptions")}</label><textarea id={`${id}-reason`} rows={2} value={reason} minLength={10} maxLength={500} disabled={disabled} placeholder={tr("至少 10 字：说明已人工核对的情况，以及为何仍接受。", "At least 10 characters: explain your inspection and why you accept.")} onChange={event => onReasonChange(event.target.value)}/></>
        : <p>{tr("当前业务核对报告符合预期；仍需要你的人工验收确认。", "The current business report matches the plan. Your explicit human acceptance is still required.")}</p>}
  </div>;
}
