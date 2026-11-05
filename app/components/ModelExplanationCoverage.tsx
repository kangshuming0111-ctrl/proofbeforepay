"use client";

import type { Language } from "@/lib/contracts";
import type { ModelDiagnosis, ModelDiagnosisExplanationPacket } from "@/lib/model-diagnostics";
import type { ModelEvidenceExplanation } from "@/lib/model-evidence-explanation";
import { modelExplanationCoverage, type ModelExplanationCoverageState } from "@/lib/model-explanation-coverage";

/** Derived disclosure only. It never calls AI, executes a retest or alters the
 * saved explanation, deterministic report, acceptance or payment. */
export function ModelExplanationCoverage({ diagnosis, packet, explanation, language }: {
  diagnosis: ModelDiagnosis; packet: ModelDiagnosisExplanationPacket; explanation?: ModelEvidenceExplanation; language: Language;
}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  let coverage;
  try { coverage = modelExplanationCoverage(diagnosis, packet, explanation); }
  catch { return <p className="journey-warning">{tr("无法核对该 AI 解释与本报告的关联，未将其计为已解释；请查看原有规则事实。", "This AI explanation could not be bound to the report and was not counted as explained. Inspect the existing deterministic facts.")}</p>; }
  const { criticalTotal, explained, providerOmission, packetLimit, notRequested } = coverage.summary;
  const missing = coverage.rows.filter(row => row.state !== "explained");
  const stateLabel = (state: ModelExplanationCoverageState) => ({
    explained: tr("AI 已引用此项；解释是否正确仍需核对。", "AI cited this item; its explanation still needs review."),
    provider_omission: tr("AI 未提供此项解释；以下是原报告的规则事实。", "AI did not explain this item. The facts below come from the original deterministic report."),
    packet_limit: tr("此项因输入上限未送交 AI，不记为模型漏答。", "This item was not sent because of the input limit; it is not a provider omission."),
    not_requested: tr("本报告尚无可用的 AI 解释，不记为模型漏答。", "No usable AI explanation is saved for this report; this is not counted as a provider omission."),
  })[state];
  if (!criticalTotal) return <p className="journey-saved-target">{tr("此报告没有列出需补充解释的问题或未知项；辅助解释不代表整站通过。", "This report lists no issue or unknown item needing an explanation. Advisory explanation is not an all-site pass.")}</p>;
  return <div className="model-explanation-coverage" aria-label={tr("AI 解释覆盖", "AI explanation coverage")}>
    <p className={providerOmission || packetLimit ? "journey-warning" : "journey-saved-target"}>{notRequested
      ? tr(`本报告尚无可用的 AI 解释：${criticalTotal} 项问题或未知项。`, `No usable AI explanation is saved for this report: ${criticalTotal} issue or unknown items.`)
      : tr(`AI 关键项引用覆盖：${explained} / ${criticalTotal}。未解释 ${providerOmission} 项；因输入上限未发送 ${packetLimit} 项。`, `AI critical-item citation coverage: ${explained} / ${criticalTotal}. Unexplained: ${providerOmission}; not sent because of the input limit: ${packetLimit}.`)}</p>
    <p><small>{tr("按诊断编号的引用统计，不证明解释正确，也不改变原规则判定。", "Counted by cited diagnostic IDs. This does not establish explanation correctness or change the deterministic verdict.")}</small></p>
    {missing.length > 0 && <details>
      <summary>{tr(`查看 ${missing.length} 项尚无 AI 解释的原有规则事实`, `Inspect existing deterministic facts for ${missing.length} items without AI explanation`)}</summary>
      <p>{tr("以下不是 AI 补答；保留原报告的预期、实际与复测要点，不会自动运行或授权新检查。", "The following is not generated AI completion. It preserves the report’s expected/actual facts and retest notes without running or authorizing another check.")}</p>
      {missing.map(({ finding, state }) => <article className={`model-diagnostic-finding model-diagnostic-${finding.severity}`} key={finding.id} data-explanation-state={state}>
        <strong>{finding.title[language]}</strong>
        <p>{stateLabel(state)}</p>
        <dl><div><dt>{tr("原报告预期", "Expected in the original report")}</dt><dd>{finding.expected[language]}</dd></div><div><dt>{tr("原报告实际", "Actual in the original report")}</dt><dd>{finding.actual[language]}</dd></div></dl>
        <p className="model-diagnostic-retest"><strong>{tr("原报告复测要点：", "Original retest notes: ")}</strong>{finding.retest[language]}</p>
      </article>)}
    </details>}
  </div>;
}
