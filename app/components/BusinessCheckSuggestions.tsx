"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, Plus, Sparkles } from "lucide-react";
import type { Language, RequirementCoverage } from "@/lib/contracts";
import type { BusinessCheckSuggestions as Suggestions } from "@/lib/business-check-suggestions";
import { businessExpectedLabel, type BusinessCheckDraft } from "./BusinessChecksPanel";
import type { CoverageDraftDecision } from "./RequirementCoveragePanel";
import "../business-suggestions.css";

export type BusinessSuggestionInput = {
  summary: string; requiredPages: string[]; language: Language;
  coverage: {version: RequirementCoverage["version"]; sourceText: string; confirmed: true; decisions: CoverageDraftDecision[]};
};
export type BusinessSuggestionCandidate = Suggestions["candidates"][number];
function canonicalDecisions(rows: CoverageDraftDecision[]): CoverageDraftDecision[] {
  return rows.map(row => ({id: row.id, disposition: row.disposition, ...(row.disposition === "exclude" ? {reason: row.reason?.trim()} : {})}));
}
function decisionKey(rows: CoverageDraftDecision[]): string {
  return JSON.stringify(rows.map(row => [row.id, row.disposition, row.disposition === "exclude" ? row.reason?.trim() ?? "" : ""]));
}
const normal = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
/** A matching manual draft is never overwritten or appended a second time. */
export function suggestionAlreadyDrafted(candidate: BusinessSuggestionCandidate, rows: BusinessCheckDraft[]): boolean {
  return rows.some(row => row.criterionId === candidate.criterionId && (!candidate.file || row.file === candidate.file)
    && row.kind === candidate.expected.kind && (candidate.expected.kind === "visible_copy"
      ? normal(row.text) === normal(candidate.expected.text)
      : normal(row.label) === normal(candidate.expected.label) && row.currency === candidate.expected.currency
        && /^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/u.test(row.amount.trim()) && Number.isFinite(Number(row.amount)) && Math.round(Number(row.amount) * 100) === candidate.expected.amountMinor));
}

export function BusinessCheckSuggestions({language, summary, pages, coverageVersion, coverageRows, confirmed, scopeReady, aiAvailable, disabled, busy, drafts, onAnalyze, onAdopt, onOpenEditor}: {
  language: Language; summary: string; pages: string[]; coverageVersion: RequirementCoverage["version"]; coverageRows: CoverageDraftDecision[];
  confirmed: boolean; scopeReady: boolean; aiAvailable: boolean; disabled: boolean; busy: boolean; drafts: BusinessCheckDraft[];
  onAnalyze: (input: BusinessSuggestionInput) => Promise<Suggestions>;
  onAdopt: (candidate: BusinessSuggestionCandidate) => void; onOpenEditor: () => void;
}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const titleId = useId();
  const [saved, setSaved] = useState<{key: string; value: Suggestions}>();
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const revision = useRef(0), mounted = useRef(true), currentKey = useRef(""), requesting = useRef(false);
  const decisions = canonicalDecisions(coverageRows);
  const contextKey = JSON.stringify({summary: summary.trim(), pages, coverageVersion, decisions: decisionKey(decisions), confirmed, language});
  useLayoutEffect(() => {
    currentKey.current = contextKey;
    revision.current += 1;
    setSaved(undefined); setError(""); setSkipped([]); setNotice("");
  }, [contextKey]);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; revision.current += 1;};}, []);
  const result = saved?.key === contextKey ? saved.value : undefined;
  const canAnalyze = aiAvailable && confirmed && scopeReady && pages.length > 0 && !disabled;

  async function analyze() {
    if (!canAnalyze || requesting.current) return;
    requesting.current = true;
    const requestKey = contextKey, requestRevision = ++revision.current;
    setError(""); setNotice(""); setSaved(undefined); setSkipped([]);
    try {
      const suggestions = await onAnalyze({summary: summary.trim(), requiredPages: pages, language,
        coverage: {version: coverageVersion, sourceText: summary.trim(), confirmed: true, decisions}});
      if (!mounted.current || requestRevision !== revision.current || currentKey.current !== requestKey) return;
      // Bind the visible result to the exact request even if a later server
      // implementation accidentally responds with a different source context.
      if (suggestions.sourceText !== summary.trim() || JSON.stringify(suggestions.requiredPages) !== JSON.stringify(pages)
        || decisionKey(suggestions.coverageDecisions) !== decisionKey(decisions)) throw new Error(tr("AI 返回的需求范围与当前表单不一致，请重试。", "The AI result does not match this form's scope. Please retry."));
      setSaved({key: requestKey, value: suggestions}); setSkipped([]);
      setNotice(tr("建议已生成，尚未加入或确认任何检查。请逐项决定。", "Suggestions are ready. No checks were added or confirmed. Review each one."));
    } catch (cause) {
      if (!mounted.current || requestRevision !== revision.current || currentKey.current !== requestKey) return;
      setError(`${cause instanceof Error ? cause.message : tr("AI 暂时无法起草检查。", "AI suggestions are unavailable.")} ${tr("已有手工检查均已保留，可继续在下方填写。", "Your manual checks are retained; continue editing below.")}`);
    } finally {requesting.current = false;}
  }

  return <section className="business-suggestions" aria-labelledby={titleId} aria-busy={busy}>
    <div className="business-suggestions-heading"><h3 id={titleId}><Sparkles size={15}/>{tr("让 AI 起草可核对的业务细节", "Ask AI to draft checkable business details")}</h3><span>{tr("选填", "Optional")}</span></div>
    <p>{tr("从已确认的需求中提出菜单价格、电话或文案检查。你逐项加入、编辑和确认后，才会成为验收标准。", "Suggest menu prices, contact details or copy from the confirmed requirements. Only the items you add, edit and confirm become agreed checks.")}</p>
    <button type="button" className="button primary" disabled={!canAnalyze} onClick={analyze}>{busy ? <LoaderCircle size={15} className="spin"/> : <Sparkles size={15}/>} {busy ? tr("AI 正在起草检查…", "AI is drafting checks…") : result ? tr("重新起草业务检查", "Draft business checks again") : tr("用 AI 起草业务检查", "Draft business checks with AI")}</button>
    <p className="business-suggestions-help">{!aiAvailable ? tr("当前未配置 AI，仍可在下方手工添加检查。", "AI is not configured here. You can still add checks manually below.")
      : !confirmed || !scopeReady ? tr("先确认上方的原始需求和必交页面。", "First confirm the original requirements and list the required pages above.")
      : tr("点击即同意把当前需求、范围处理和页面名称发送给 DeepSeek，可能消耗 API 额度。不发送合同附件或交付文件。", "Clicking sends these requirements, scope decisions and page names to DeepSeek and may use API credit. Contract attachments and delivery files are not sent.")}</p>
    {busy && <p role="status">{tr("正在读取需求原文。已有检查不变，请等待本次返回。", "Reading the original requirements. Existing checks are retained; wait for this response.")}</p>}
    {error && <p className="business-suggestions-error" role="alert">{error}</p>}
    {notice && <p className="business-suggestions-notice" role="status">{notice}</p>}
    {result && <div className="business-suggestions-result">
      <p className="business-suggestions-help">{tr("本次真实模型建议", "Suggestions from this model call")}: {result.model} · <time dateTime={result.generatedAt}>{result.generatedAt.slice(0,19).replace("T"," ")} UTC</time></p>
      {!result.candidates.length && <p>{tr("没有生成可直接加入的检查。请查看待澄清项，或手工添加。", "No checks are ready to add. Review the unclear items or add checks manually.")}</p>}
      <ul>{result.candidates.map(candidate => {
        const drafted = suggestionAlreadyDrafted(candidate, drafts), ignored = skipped.includes(candidate.id), full = drafts.length >= 8;
        return <li key={candidate.id} className={ignored ? "business-suggestion-skipped" : ""}>
          <strong>{businessExpectedLabel(candidate.expected)}</strong>
          <p>{tr("检查页面", "Page to check")}: {candidate.file || tr("需要你选择页面", "Choose a page before confirming")}</p>
          <details><summary>{tr("对应的需求原文", "Original requirement")}<ChevronDown size={12}/></summary><blockquote>{candidate.source.excerpt}</blockquote></details>
          <div className="business-suggestion-actions"><button type="button" className="subtle-button" disabled={disabled || drafted || ignored || full} onClick={() => {onAdopt(candidate); setNotice(candidate.file ? tr("已加入下方的业务检查草稿。请编辑后确认，尚未锁定。", "Added to the draft below. Edit and confirm it; the scope is not locked.") : tr("已加入草稿，请在下方为它选择页面，再确认。", "Added to the draft. Choose its page below before confirming."));}}><Plus size={12}/>{drafted ? tr("已有相同检查", "Already in your draft") : tr("加入检查草稿", "Add to draft")}</button><button type="button" className="text-button" disabled={disabled || drafted} onClick={() => setSkipped(current => ignored ? current.filter(id => id !== candidate.id) : [...current, candidate.id])}>{ignored ? tr("恢复建议", "Restore suggestion") : tr("跳过此建议", "Skip suggestion")}</button></div>
          {full && !drafted && !ignored && <small>{tr("草稿已有 8 项，请先编辑或移除一项。", "Your draft has eight checks. Edit or remove one first.")}</small>}
        </li>;
      })}</ul>
      {!!drafts.length && <button type="button" className="subtle-button" disabled={disabled} onClick={onOpenEditor}>{tr("编辑并确认检查草稿", "Edit and confirm the draft")}</button>}
      {result.unresolved.length > 0 && <details className="business-suggestions-unresolved"><summary>{tr(`${result.unresolved.length} 项需要澄清或人工检查`, `${result.unresolved.length} items need clarification or human inspection`)}<ChevronDown size={13}/></summary><ul>{result.unresolved.map((item,index) => <li key={`${item.criterionId}-${index}`}><blockquote>{item.source.excerpt}</blockquote><p>{item.reason}</p></li>)}</ul></details>}
      {result.warnings.length > 0 && <details><summary>{tr("本次建议的限制", "Limits of these suggestions")}<ChevronDown size={12}/></summary><ul>{result.warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul></details>}
      <p className="business-suggestions-help">{tr("AI 建议不是交付检查结果。未加入的建议不影响验收；价格和文案以你最后确认的草稿为准，付款金额另行填写。", "Suggestions are not delivery results. Unadopted items do not affect acceptance. Your final confirmed draft defines the copy and item prices; the project fee is entered separately.")}</p>
    </div>}
  </section>;
}
