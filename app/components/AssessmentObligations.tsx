import type {Language, ProofCriterion} from "@/lib/contracts";
import {assessmentObligationPresentation, isAssessmentObligations} from "@/lib/assessment-obligations";

/** Read-only saved decomposition. This is not a runtime progress indicator. */
export function AssessmentObligations({criterion, value, language}: {criterion: Pick<ProofCriterion, "source">; value: unknown; language: Language}) {
  if (value === undefined) return null;
  const zh = language === "zh";
  if (!isAssessmentObligations(value, criterion)) return <p className="assessment-no-citation">{zh ? "保存的分项计划与锁定原文不一致，暂不能使用；没有从旧说明重建。" : "The saved obligation plan does not match the locked wording and cannot be used. It was not reconstructed from old prose."}</p>;
  const unresolvedClauses = new Set(value.items.filter(item => item.kind === "unclassified").map(item => item.clauseIndex)).size;
  return <details className="assessment-locked-source assessment-obligations">
    <summary>{zh ? `分项补证计划 · ${value.items.length} 个检查方向 · ${unresolvedClauses} 段待澄清` : `Obligation evidence plan · ${value.items.length} check direction(s) · ${unresolvedClauses} clause(s) needing clarification`}</summary>
    <p>{zh ? "这是有限规则识别的检查方向，不是完整语义拆解。各项保留同一条约定中的原始条件；源码建议不证明运行成功，也不改变父项结论、验收或付款。完整原文仍需核对。" : "These directions come from a bounded detector, not an exhaustive semantic decomposition. Original conditions are retained. Source advice does not establish execution or change the parent verdict, acceptance or payment. Review the complete locked wording."}</p>
    <ol>{value.items.map(item => {
      const text = assessmentObligationPresentation(item.kind, item.state, language), clause = value.clauses[item.clauseIndex];
      return <li key={item.id} data-obligation-kind={item.kind}>
        <strong>{text.label}</strong><span> · {text.state}</span>
        <blockquote>{clause.excerpt}</blockquote>
        <small>{zh ? "原文字符区间" : "Original character range"} [{clause.start}, {clause.end})</small>
        <p>{text.nextStep}</p>
      </li>;
    })}</ol>
  </details>;
}
