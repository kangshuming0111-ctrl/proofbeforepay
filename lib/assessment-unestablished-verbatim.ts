import type {Language, ProofCriterion} from "./contracts.ts";
import {exactCopyLiteral} from "./exact-copy-directive.ts";
import {parseSourceLiteralDirective} from "./source-literal-directive.ts";
import {parseNativeFormSourceDirective} from "./native-form-source.ts";

/** A bounded negative publication guard, not a source entailment checker.
 * It only recognises a model's explicit objection about absent contiguous copy
 * where the agreed source did not demand exact wording. It never establishes
 * the fact, changes a raw unknown, or reverses an explicit copy requirement. */
export function hasUnestablishedVerbatimObjection(criterion: ProofCriterion, explanation: string, hasLockedBusinessChecks = false): boolean {
  if (hasLockedBusinessChecks || exactCopyLiteral(criterion.source) !== undefined || parseSourceLiteralDirective(criterion.source)
    || parseNativeFormSourceDirective(criterion.source)) return false;
  if (/\b(?:exact|verbatim|literal|contiguous|word[ -]for[ -]word)\b|逐字|原样|完全一致|一字不差/iu.test(criterion.source)) return false;
  // Quotes are data; an auditor instruction inside one is not an assertion.
  const prose = explanation.replace(/"[^"\r\n]*"|“[^“”\r\n]*”|「[^「」\r\n]*」/gu, "[quoted value]");
  return /\b(?:the\s+)?(?:exact|literal|contiguous|verbatim)\s+(?:statement|sentence|phrase|string|wording|text)(?:\s+\[quoted value\])?\s+(?:does\s+not\s+(?:appear|occur|exist)|is\s+(?:not\s+(?:present|found)|missing|absent)|not\s+(?:present|found))\b/iu.test(prose)
    || /(?:逐字|完全一致的|连续的)(?:句子|语句|文字|表述)[^。！？\r\n]{0,120}(?:不存在|未出现|缺少|没有出现)/u.test(prose);
}

export function unestablishedVerbatimExplanation(language: Language): string {
  return language === "zh"
    ? "模型以缺少逐字连续句子要求修改，但本项约定未建立这种额外逐字要求。应人工核对原文含义与完整内容关系；当前暂不能确认符合或要求补写句子。这不是证明交付缺失，也不证明运行成功，原文与引文未改变。"
    : "The model objected to an absent exact contiguous sentence, but this criterion does not establish that additional verbatim-copy condition. Review the agreed meaning and complete source relationship manually. Neither compliance nor a demand to add that sentence is established. This is not proof of missing delivery or working behavior; the original requirement and citations are unchanged.";
}
