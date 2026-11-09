import type { Language, QuoteDraft, RequirementCoverage } from "@/lib/contracts";
import { buyerRequirementSections } from "@/lib/requirement-display";

export function BuyerRequirementText({quote, language, coverage, full = false}: {
  quote: Pick<QuoteDraft, "summary">; language: Language; coverage?: RequirementCoverage; full?: boolean;
}) {
  const requirements = buyerRequirementSections(quote, language, coverage);
  const zh = language === "zh";
  return <div className="buyer-requirement-text">
    {requirements.confirmed && <p className="buyer-requirement-caption">{zh ? "这次要做" : "What’s included"}</p>}
    <ul className="plain-requirements-list">{requirements.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
    {!!requirements.excluded.length && <details className="buyer-excluded-requirements">
      <summary>{zh ? `这次不做（${requirements.excluded.length} 项）` : `Not included (${requirements.excluded.length})`}</summary>
      <ul>{requirements.excluded.map(row => <li key={row.id}><p>{row.text}</p>{row.reason && <small>{zh ? "原因：" : "Reason: "}{row.reason}</small>}</li>)}</ul>
    </details>}
    {full && (requirements.confirmed || requirements.lines.join("\n") !== requirements.original.trim()) && <details className="buyer-original-requirements">
      <summary>{zh ? "查看买家原话" : "Read the buyer’s original words"}</summary>
      <p>{requirements.original}</p>
    </details>}
  </div>;
}
