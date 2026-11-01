"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, ChevronDown, FileText, LoaderCircle, Sparkles, Upload } from "lucide-react";
import type { Language, RequirementDraft, RequirementSource } from "@/lib/contracts";

export type RequirementsIntakeProps = {
  language: Language;
  busy: boolean;
  aiMode?: "live" | "demo";
  initialDraft?: RequirementDraft;
  onAnalyze: (input: { sourceText: string; sourceName?: string }) => Promise<RequirementDraft>;
  onApply: (draft: RequirementDraft) => void;
  onClear: () => void;
};

const MAX_CHARS = 12000;
const MAX_BYTES = 48 * 1024;
const example = {
  zh: "交付 index.html、services.html 和 contact.html。\nindex.html 的链接文字为“Book a call”，目标为 contact.html#booking。\n页面在手机上应清晰可读，颜色和排版需要买家检查确认。\n所有页面使用买家提供的最终文案。",
  en: 'Deliver index.html, services.html and contact.html;\nindex.html contains a link labelled "Book a call" pointing to contact.html#booking;\nThe pages must be readable on a phone; the buyer will check the colors and typography;\nUse the final copy supplied by the buyer on all pages.',
};

function SourceExcerpt({ source, language }: { source: RequirementSource; language: Language }) {
  const zh = language === "zh";
  return <details className="requirements-excerpt">
    <summary>{zh ? "查看原文引用" : "View source excerpt"}<ChevronDown size={12} aria-hidden="true" /></summary>
    <blockquote>{source.excerpt}</blockquote>
  </details>;
}

export function RequirementsIntake({ language, busy, aiMode = "demo", initialDraft, onAnalyze, onApply, onClear }: RequirementsIntakeProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const id = useId();
  const [text, setText] = useState(initialDraft?.sourceText ?? "");
  const [sourceName, setSourceName] = useState<string | undefined>(initialDraft?.sourceName);
  const [draft, setDraft] = useState<RequirementDraft | undefined>(initialDraft);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const revision = useRef(0);
  const fileRevision = useRef(0);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const byteLength = new TextEncoder().encode(text).length;
  const overLimit = text.length > MAX_CHARS || byteLength > MAX_BYTES;
  const disabled = busy || analyzing || readingFile;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; revision.current += 1; fileRevision.current += 1; };
  }, []);

  function replaceText(value: string, name?: string) {
    revision.current += 1;
    fileRevision.current += 1;
    setText(value);
    setSourceName(name);
    setDraft(undefined);
    setError("");
    setNotice("");
    onClear();
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    const file = files?.[0];
    const fileCount = files?.length ?? 0;
    event.target.value = "";
    if (!file || disabled) return;
    setError("");
    if (fileCount !== 1 || !file.name.endsWith(".txt") || file.webkitRelativePath) {
      setError(tr("请选择一个扩展名为 .txt 的 UTF-8 文本文件；暂不支持 PDF、Word 或文件夹。", "Choose one UTF-8 text file ending in .txt. PDF, Word, and folders are not supported yet."));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(tr("文件超过 48 KiB。请缩短内容后重试；现有文字已保留。", "The file exceeds 48 KiB. Shorten it and try again; your current text has been kept."));
      return;
    }
    const request = ++fileRevision.current;
    setReadingFile(true);
    try {
      const value = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (!mounted.current || fileRevision.current !== request) return;
      if (value.length > MAX_CHARS || new TextEncoder().encode(value).length > MAX_BYTES) {
        setError(tr("文件内容超过 12000 字符或 48 KiB。请缩短后重试；现有文字已保留。", "The text exceeds 12,000 characters or 48 KiB. Shorten it and try again; your current text has been kept."));
        return;
      }
      if (!value.trim() || value.includes("\0")) {
        setError(tr("文件为空或包含非文本内容。请选择有效的 UTF-8 需求文字。", "The file is empty or contains non-text data. Choose valid UTF-8 requirement text."));
        return;
      }
      replaceText(value, file.name);
    } catch {
      if (mounted.current && fileRevision.current === request) setError(tr("无法读取 UTF-8 文本。请把文件保存为 UTF-8 .txt 后再上传；现有文字已保留。", "Could not read UTF-8 text. Save it as a UTF-8 .txt file and try again; your current text has been kept."));
    } finally {
      if (mounted.current) setReadingFile(false);
    }
  }

  async function analyze() {
    if (disabled || !text.trim() || overLimit) return;
    const request = revision.current;
    const sourceText = text;
    setError("");
    setNotice("");
    setDraft(undefined);
    onClear();
    setAnalyzing(true);
    try {
      const result = await onAnalyze({ sourceText, ...(sourceName ? { sourceName } : {}) });
      if (!mounted.current) return;
      if (revision.current !== request || result.sourceText !== sourceText) {
        setNotice(tr("需求内容已变化，本次结果未采用。请重新整理当前文字。", "The requirements changed, so this result was not used. Analyze the current text again."));
        return;
      }
      setDraft(result);
    } catch (cause) {
      if (mounted.current && revision.current === request) {
        const message = cause instanceof Error ? cause.message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 600) : "";
        setError(message || tr("暂时未能整理需求。文字已保留，请重试。", "Could not organize these requirements. Your text has been kept; please try again."));
      }
    } finally {
      if (mounted.current) setAnalyzing(false);
    }
  }

  function clear() {
    if (disabled) return;
    replaceText("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function apply() {
    if (!draft || disabled || draft.sourceText !== text) return;
    onApply(draft);
    setNotice(tr("已采用为可编辑的验收清单。请核对内容、补充未明确项，并单独填写金额。", "Added an editable acceptance checklist. Check it, clarify unresolved items, and enter the amount separately."));
    if (details.current) details.current.open = false;
  }

  return <details className="requirements-intake" ref={details}>
    <summary className="requirements-heading"><span><FileText size={14} aria-hidden="true" />{tr("添加合同辅助整理（选填）", "Add an agreement (optional)")}</span><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="requirements-intake-body">
      <p className="requirements-help">{tr("没有合同也可以直接填写需求并创建项目。需要辅助时，可粘贴合同或补充需求、上传 TXT，再核对整理结果。", "You can create a project directly without a contract. Optionally paste an agreement or extra requirements, or upload TXT, then check the extracted suggestions.")}</p>
      <label className="requirements-input-label" htmlFor={`${id}-text`}>{tr("合同／需求原文", "Original agreement or requirements")}</label>
      <textarea id={`${id}-text`} value={text} onChange={event => replaceText(event.target.value)} disabled={disabled} rows={4} spellCheck={false} aria-describedby={`${id}-limits ${id}-privacy`} aria-invalid={overLimit || undefined} placeholder={tr("例如：交付 index.html 和 contact.html；首页的 Book a call 按钮指向 contact.html#booking…", "For example: deliver index.html and contact.html; the home page's Book a call button links to contact.html#booking…")} />
      <div className="requirements-input-meta" id={`${id}-limits`}><span className={overLimit ? "requirements-error-text" : ""}>{text.length.toLocaleString("en-US")} / 12,000 {tr("字符", "characters")} · {tr("最多 48 KiB", "48 KiB max")}</span>{sourceName && <span title={sourceName}>{sourceName}</span>}</div>
      <div className="requirements-input-actions">
        <label className={`requirements-file-label${disabled ? " requirements-disabled" : ""}`} htmlFor={`${id}-file`}><Upload size={12} aria-hidden="true" />{readingFile ? tr("读取中…", "Reading…") : tr("上传 TXT", "Upload TXT")}</label>
        <input ref={fileInput} className="requirements-file-input" id={`${id}-file`} type="file" accept=".txt,text/plain" disabled={disabled} onChange={chooseFile} aria-describedby={`${id}-limits`} />
        <button type="button" className="requirements-text-button" disabled={disabled} onClick={() => replaceText(example[language])}>{tr("填入示例需求", "Use example requirements")}</button>
        <button type="button" className="requirements-text-button" disabled={disabled || (!text && !draft)} onClick={clear}>{tr("清除来源", "Clear source")}</button>
      </div>
      <p className="requirements-provider-note" id={`${id}-privacy`}>{aiMode === "live" ? tr("点击整理会把原文发送给 DeepSeek 生成建议。AI 只提供建议，金额单独填写，最终要求由买家确认。", "Analyzing sends the original text to DeepSeek for suggestions. AI provides suggestions only; enter the amount separately, and have the buyer confirm the final requirements.") : tr("当前未配置模型密钥，将使用规则整理，不会调用 AI。金额单独填写，最终要求由买家确认。", "No model key is configured, so this uses rule-based extraction without calling AI. Enter the amount separately, and have the buyer confirm the final requirements.")}</p>
      {overLimit && <p className="requirements-alert" role="alert">{tr("内容超过限制，请缩短至 12000 字符且不超过 48 KiB 后再整理。", "Shorten this to 12,000 characters and no more than 48 KiB before analyzing.")}</p>}
      {error && <p className="requirements-alert" role="alert">{error}</p>}
      <button className="requirements-button requirements-analyze" type="button" disabled={disabled || !text.trim() || overLimit} onClick={analyze}>{analyzing ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}{analyzing ? tr("正在整理…", "Analyzing…") : aiMode === "live" ? tr("用 AI 整理验收清单", "Suggest a checklist with AI") : tr("用规则整理验收清单", "Extract a checklist with rules")}</button>

      {draft && <section className="requirements-results" aria-labelledby={`${id}-results`}>
        <div className="requirements-result-heading"><h4 id={`${id}-results`}>{tr("待核对的验收建议", "Suggested checklist to verify")}</h4><span className={`requirements-mode requirements-mode-${draft.mode}`}>{draft.mode === "live" ? tr("AI 建议", "AI suggestion") : tr("规则整理 · 未调用 AI", "Rules · no AI call")}</span></div>
        <div className="requirements-result-scroll">
          <section className="requirements-result-group"><h5>{tr("必须交付的页面", "Required pages")} <span>{draft.pages.length}</span></h5>{draft.pages.length ? <ul>{draft.pages.map((page, index) => <li key={`${page.file}-${index}`}><code>{page.file}</code><SourceExcerpt source={page.source} language={language} /></li>)}</ul> : <p className="requirements-warning-text">{tr("原文没有明确可核查的 HTML 文件名。采用后请在页面清单中补充。", "No checkable HTML filenames were identified. Add them to the page list after adopting this draft.")}</p>}</section>
          {draft.link && <section className="requirements-result-group"><h5>{tr("需要核对的本地链接", "Local link to check")}</h5><p className="requirements-link-flow"><code>{draft.link.from}</code><span> → </span><code>{draft.link.to}</code></p><p className="requirements-help">{tr("链接文字：", "Link text: ")}<strong>{draft.link.text}</strong></p><SourceExcerpt source={draft.link.source} language={language} /></section>}
          <section className="requirements-result-group"><h5>{tr("买家人工核对项", "Buyer checks")} <span>{draft.manualRequirements.length}</span></h5>{draft.manualRequirements.length ? <ul>{draft.manualRequirements.map((item, index) => <li key={index}><p>{item.text}</p><SourceExcerpt source={item.source} language={language} /></li>)}</ul> : <p className="requirements-help">{tr("未从原文整理出人工核对项；你仍可自行补充。", "No buyer checks were extracted; you can still add your own.")}</p>}</section>
          {(draft.unresolved.length > 0 || draft.warnings.length > 0) && <section className="requirements-unresolved"><h5><AlertTriangle size={13} aria-hidden="true" />{tr("采用前需要澄清", "Clarify before confirming")}</h5>{draft.warnings.length > 0 && <ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}{draft.unresolved.map((item, index) => <div className="requirements-unresolved-item" key={index}><p>{item.reason}</p><SourceExcerpt source={item.source} language={language} /></div>)}<p className="requirements-help">{tr("这些内容不会自动变成“验收通过”。请和卖家确认，或在验收清单中补充具体要求。", "These items do not count as passed. Clarify them with the seller or add specific requirements to the checklist.")}</p></section>}
        </div>
        <p className="requirements-help">{tr("采用后仍可修改；以你随后确认的清单为准，不会自动创建项目或付款。", "You can edit after adopting this draft. The checklist you confirm next is the agreed scope. This does not create a project or make a payment.")}</p>
        <button className="requirements-button" type="button" disabled={disabled} onClick={apply}>{draft.pages.length ? tr("采用并编辑验收清单", "Use and edit this checklist") : tr("采用并补充页面清单", "Use draft and add required pages")}</button>
      </section>}
    </div>
    <span className="requirements-live-notice" role="status" aria-live="polite">{notice}</span>
  </details>;
}
