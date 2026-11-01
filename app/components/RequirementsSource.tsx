"use client";

import { useId } from "react";
import { AlertTriangle, ChevronDown, FileText } from "lucide-react";
import type { Language, ProofCriterion, RequirementAgreement, RequirementDraft, RequirementSource } from "@/lib/contracts";

export type RequirementsSourceProps = {
  agreement: RequirementAgreement;
  language: Language;
  criteria: ProofCriterion[];
};

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : value;
}

export function RequirementsSource({ agreement, language, criteria }: RequirementsSourceProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const id = useId();
  return <details className="requirements-source">
    <summary className="requirements-heading"><span><FileText size={14} aria-hidden="true" />{tr("原始需求与核对依据", "Original requirements and source references")}</span><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="requirements-source-body">
      <div className="requirements-source-meta"><span className={`requirements-mode requirements-mode-${agreement.mode}`}>{agreement.mode === "live" ? tr("AI 整理后由买家确认", "AI draft confirmed by buyer") : tr("规则整理 · 未调用 AI", "Rules · no AI call")}</span>{agreement.sourceName && <span>{agreement.sourceName}</span>}</div>
      <p className="requirements-help">{tr("买家确认于", "Buyer confirmed on")} <time dateTime={agreement.confirmedAt}>{timestamp(agreement.confirmedAt)}</time>{tr("。原文供双方核对，具体交付以已锁定的验收清单为准。", ". Both sides can consult this source. The locked acceptance checklist defines the agreed delivery.")}</p>
      <details className="requirements-original"><summary>{tr("查看完整原文", "Read the complete source")}<ChevronDown size={12} aria-hidden="true" /></summary><pre tabIndex={0} aria-label={tr("完整需求原文", "Complete requirements source")}>{agreement.sourceText}</pre></details>
      <section className="requirements-reference-section" aria-labelledby={`${id}-references`}><h4 id={`${id}-references`}>{tr("验收条目对应的原文", "Source references for the checklist")}</h4><ol className="requirements-reference-list">{criteria.map(criterion => {
        const refs = agreement.sourceRefs.filter(ref => ref.criterionId === criterion.id);
        return <li key={criterion.id}><strong>{criterion.title}</strong>{refs.length ? refs.map((ref, index) => <blockquote key={index}>{ref.source.excerpt}</blockquote>) : <p className="requirements-help">{tr("买家确认／系统检查项；没有对应的合同原文引用。", "Buyer-confirmed or system check; no matching source excerpt is attached.")}</p>}</li>;
      })}</ol></section>
      {(agreement.unresolved.length > 0 || agreement.warnings.length > 0) && <section className="requirements-unresolved" aria-labelledby={`${id}-unresolved`}><h4 id={`${id}-unresolved`}><AlertTriangle size={13} aria-hidden="true" />{tr("原文中仍需澄清的内容", "Source items that still need clarification")}</h4>{agreement.warnings.length > 0 && <ul>{agreement.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}{agreement.unresolved.map((item, index) => <div className="requirements-unresolved-item" key={index}><p>{item.reason}</p><blockquote>{item.source.excerpt}</blockquote></div>)}<p className="requirements-help">{tr("保留提醒，不代表验收通过；需要双方按约定进一步确认。", "Kept as a reminder, not a passed check. Both sides need to clarify these against the agreement.")}</p></section>}
    </div>
  </details>;
}

function DraftExcerpt({ source, language }: { source: RequirementSource; language: Language }) {
  return <details className="requirements-excerpt"><summary>{language === "zh" ? "查看原文引用" : "View source excerpt"}<ChevronDown size={12} aria-hidden="true" /></summary><blockquote>{source.excerpt}</blockquote></details>;
}

/** A proposal preview only: no confirmed-time or criterion mapping is invented. */
export function RequirementsDraftSource({ draft, language }: { draft: RequirementDraft; language: Language }) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const id = useId();
  return <details className="requirements-source requirements-draft-source">
    <summary className="requirements-heading"><span><FileText size={14} aria-hidden="true" />{tr("核对原文与提取建议", "Review the source and extraction draft")}</span><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="requirements-source-body">
      <div className="requirements-source-meta"><span className={`requirements-mode requirements-mode-${draft.mode}`}>{draft.mode === "live" ? tr("AI 建议 · 待确认", "AI suggestion · unconfirmed") : tr("规则整理 · 未调用 AI", "Rules · no AI call")}</span>{draft.sourceName && <span>{draft.sourceName}</span>}</div>
      <p className="requirements-help">{tr("下方是原始提取建议，供你与可编辑清单逐项对照；最终以你确认的清单为准。", "Compare this original extraction with the editable checklist. The checklist you confirm will define the agreed requirements.")}</p>
      <details className="requirements-original"><summary>{tr("查看完整原文", "Read the complete source")}<ChevronDown size={12} aria-hidden="true" /></summary><pre tabIndex={0} aria-label={tr("待确认的完整需求原文", "Complete requirements source awaiting confirmation")}>{draft.sourceText}</pre></details>
      <section className="requirements-result-group" aria-labelledby={`${id}-pages`}><h5 id={`${id}-pages`}>{tr("建议页面", "Suggested pages")} <span>{draft.pages.length}</span></h5>{draft.pages.length ? <ul>{draft.pages.map((item, index) => <li key={`${item.file}-${index}`}><code>{item.file}</code><DraftExcerpt source={item.source} language={language} /></li>)}</ul> : <p className="requirements-warning-text">{tr("没有明确页面文件名，请在验收清单中补充。", "No explicit filenames were identified. Add required pages to the editable checklist.")}</p>}</section>
      {draft.link && <section className="requirements-result-group" aria-labelledby={`${id}-link`}><h5 id={`${id}-link`}>{tr("建议本地链接检查", "Suggested local-link check")}</h5><p className="requirements-link-flow"><code>{draft.link.from}</code><span> → </span><code>{draft.link.to}</code></p><p className="requirements-help">{tr("链接文字：", "Link text: ")}<strong>{draft.link.text}</strong></p><DraftExcerpt source={draft.link.source} language={language} /></section>}
      <section className="requirements-result-group" aria-labelledby={`${id}-manual`}><h5 id={`${id}-manual`}>{tr("建议人工核对项", "Suggested human checks")} <span>{draft.manualRequirements.length}</span></h5>{draft.manualRequirements.length ? <ul>{draft.manualRequirements.map((item, index) => <li key={index}><p>{item.text}</p><DraftExcerpt source={item.source} language={language} /></li>)}</ul> : <p className="requirements-help">{tr("未提取人工项，你可以在清单中自行补充。", "No human checks were extracted. You can add your own to the checklist.")}</p>}</section>
      {(draft.unresolved.length > 0 || draft.warnings.length > 0) && <section className="requirements-unresolved"><h5><AlertTriangle size={13} aria-hidden="true" />{tr("需要核对与澄清", "Review and clarify")}</h5>{draft.warnings.length > 0 && <ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}{draft.unresolved.map((item, index) => <div className="requirements-unresolved-item" key={index}><p>{item.reason}</p><blockquote>{item.source.excerpt}</blockquote></div>)}<p className="requirements-help">{tr("未明确项不会自动变成通过项，请在确认前补充或与卖家澄清。", "Unresolved clauses do not become passed checks. Add specific requirements or clarify them with the seller before confirming.")}</p></section>}
    </div>
  </details>;
}
