import type {Language, ProofBusinessCheckStep, ProofCriterion} from "./contracts.ts";
import {assertStaticPath, staticFileKind} from "./static-resources.ts";
import {parseSourceLiteralDirective} from "./source-literal-directive.ts";
import {staticMarkupDirective} from "./static-markup-directive.ts";

type TargetHint = {basis: "locked_business_files" | "explicit_own_source_file" | "conflicting_explicit_and_locked" | "alias_hint_only" | "unspecified"; establishedFiles: string[]; candidateFiles: string[]};
export type SourceTargetAssertion = {kind: "not_applicable"} | {kind: "unestablished" | "contradicted" | "conflicting_scope"; assertedFiles: string[]; establishedFiles: string[]; candidateFiles: string[]};
const FILE = "[A-Za-z0-9][A-Za-z0-9_./-]*\\.html";
const GLOBAL = /\b(?:every|each|all|both)\s+(?:delivered\s+)?(?:pages?|forms?|files?)\b|所有(?:页面|网页|表单|文件)|每(?:个|一)(?:页面|网页|表单|文件)/iu;
// Chinese uncertainty is recognised as a finite clause introduction, not a
// substring of unrelated words such as 若干 or a business name. This remains a
// conservative condition filter, not a general bilingual language parser.
const CONDITIONAL = /\b(?:if|unless|whether|might|could|perhaps|hypothetical|example|unclear|unknown|not\s+(?:true|sure)|does\s+not|doesn't)\b|(?:^|[。；，,;:：!?？!]\s*)(?:如果|倘若|假如|若(?:是|要|需|该|本|这|有|无|未|不|页面|文件|检查|要求|标准|目标)|是否|可能|假设|不确定|并非|不是)/iu;
const path = (value: string): boolean => {try {return assertStaticPath(value) === value && staticFileKind(value) === "html";} catch {return false;}};
const unique = (values: readonly string[]) => [...new Set(values)].sort();

/** Quoted source values never become file-role authority. An unfinished quote
 * stays masked rather than being repaired into a usable source directive. */
function outsideQuotes(text: string): string {
  let result = "", closing = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (closing) {result += " "; if (char === closing) closing = ""; continue;}
    if (char === '"' || char === "“" || char === "「" || char === "`" || char === "'" && !/[\p{L}\p{N}]/u.test(text[index - 1] ?? "")) {
      closing = char === "“" ? "”" : char === "「" ? "」" : char; result += " ";
    } else result += char;
  }
  return result;
}

/** Finite file-target syntax, not general natural-language scope extraction.
 * Multiple/global targets remain unclassified; merely mentioning a filename
 * later in a clause cannot establish it as the target. */
function explicitOwnFile(source: string): string | undefined {
  const text = outsideQuotes(source.trim());
  if (GLOBAL.test(text) || CONDITIONAL.test(text)) return;
  const mentioned = unique([...text.matchAll(new RegExp(FILE, "gu"))].map(match => match[0]).filter(path));
  if (mentioned.length !== 1) return;
  const prefixes = [
    new RegExp(`^(?:The )?page (?:content|copy|text) (?:in|on) (${FILE}) (?:must|should)\\b`, "iu"),
    new RegExp(`^(?:The )?(${FILE}) (?:page )?(?:source (?:content|copy|text)|(?:content|copy|text)) (?:must|should)\\b`, "iu"),
    new RegExp(`^(${FILE}) (?:must|should) (?:show|display|state|contain|include)\\b`, "iu"),
    new RegExp(`^(${FILE})\\s*(?:(?:页面|网页)(?:的)?)?(?:(?:文字内容|内容|文案|文字)(?:中)?)?(?:必须|应|须|需要)\\s*(?:显示|注明|列出|包含|提供|写明|说明)`, "u"),
    new RegExp(`^(?:页面|网页)\\s*(${FILE})\\s*(?:的)?(?:(?:文字内容|内容|文案|文字)(?:中)?)?(?:必须|应|须|需要)\\s*(?:显示|注明|列出|包含|提供|写明|说明)`, "u"),
  ];
  const selected = prefixes.map(pattern => pattern.exec(text)?.[1]).find(Boolean);
  return selected === mentioned[0] ? selected : undefined;
}

/** Only locked business-check files or a finite explicit target in THIS
 * criterion establish a file. A basename match is a search hint, never proof
 * that the corresponding business page lives there. No other criterion or
 * project summary is an input. */
export function criterionOwnSourceTargetHint(criterion: ProofCriterion, files: Record<string, string>, steps: readonly ProofBusinessCheckStep[] = []): TargetHint {
  const locked = unique(steps.filter(step => step.criterionId === criterion.id && path(step.file)).map(step => step.file));
  const explicit = explicitOwnFile(criterion.source);
  if (locked.length && explicit && !locked.includes(explicit)) {
    const combined = unique([...locked, explicit]);
    return {basis: "conflicting_explicit_and_locked", establishedFiles: combined, candidateFiles: combined.filter(file => Object.hasOwn(files, file))};
  }
  if (locked.length) return {basis: "locked_business_files", establishedFiles: locked, candidateFiles: locked.filter(file => Object.hasOwn(files, file))};
  if (explicit) return {basis: "explicit_own_source_file", establishedFiles: [explicit], candidateFiles: Object.hasOwn(files, explicit) ? [explicit] : []};
  // Reuse admission grammars before reading their named-context prefix. This
  // hint cannot expand source admission or become a canonical page mapping.
  const recognised = parseSourceLiteralDirective(criterion.source) || staticMarkupDirective(criterion.source);
  const name = recognised ? /^(?:In the delivered )?([A-Z][A-Za-z0-9-]{0,39})(?: (?:page|form))? (?:source|HTML)\b/u.exec(criterion.source.trim())?.[1] : undefined;
  const candidates = name ? Object.keys(files).filter(file => path(file) && file.split("/").at(-1)?.toLowerCase() === `${name.toLowerCase()}.html`) : [];
  return {basis: candidates.length ? "alias_hint_only" : "unspecified", establishedFiles: [], candidateFiles: unique(candidates)};
}

/** A negative-only guard for bounded, direct target assertions. It does not
 * judge all prose or infer a target from citations. Questions, conditions,
 * quoted prose, global/multi-page requirements and unrecognised paraphrases
 * deliberately receive no verdict. The caller never upgrades an item. */
export function checkSourceTargetAssertion(criterion: ProofCriterion, explanation: string, files: Record<string, string>, steps: readonly ProofBusinessCheckStep[] = []): SourceTargetAssertion {
  if (typeof explanation !== "string" || explanation.length > 600 || typeof criterion.source !== "string" || criterion.source.length > 3000) return {kind: "not_applicable"};
  const source = outsideQuotes(criterion.source), prose = outsideQuotes(explanation);
  if (GLOBAL.test(source) || CONDITIONAL.test(source) || CONDITIONAL.test(prose) || /[?？]/u.test(prose)) return {kind: "not_applicable"};
  const references = unique([...source.matchAll(new RegExp(FILE, "gu"))].map(match => match[0]).filter(path));
  if (references.length > 1) return {kind: "not_applicable"};
  const english = new RegExp(`(?:^|[.!;]\\s+|,\\s*(?:but|and)\\s+)(?:the|this) (?:check|criterion|requirement) targets? (${FILE})(?=[\\s.,;!]|$)`, "giu");
  const chinese = new RegExp(`(?:^|[。；，]\\s*)(?:本项|这项|该项)(?:检查|要求|标准)(?:的)?目标(?:页面|文件)(?:是|为)\\s*(${FILE})(?=[\\s。；，.]|$)`, "gu");
  const asserted = unique([...prose.matchAll(english), ...prose.matchAll(chinese)].map(match => match[1]).filter(path));
  if (!asserted.length) return {kind: "not_applicable"};
  const hint = criterionOwnSourceTargetHint(criterion, files, steps);
  if (hint.basis === "conflicting_explicit_and_locked") return {kind: "conflicting_scope", assertedFiles: asserted,
    establishedFiles: hint.establishedFiles, candidateFiles: hint.candidateFiles};
  // A multi-file locked plan cannot be reinterpreted as an exclusive target.
  if (hint.establishedFiles.length > 1) return {kind: "not_applicable"};
  if (hint.establishedFiles.length && asserted.every(file => hint.establishedFiles.includes(file))) return {kind: "not_applicable"};
  return {kind: hint.establishedFiles.length ? "contradicted" : "unestablished", assertedFiles: asserted,
    establishedFiles: hint.establishedFiles, candidateFiles: unique([...hint.candidateFiles, ...asserted.filter(file => Object.hasOwn(files, file))])};
}

export function sourceTargetAssertionExplanation(result: Exclude<SourceTargetAssertion, {kind: "not_applicable"}>, language: Language): string {
  if (result.kind === "conflicting_scope") return language === "zh"
    ? "本项原文明示的文件与关联的已锁定检查文件不一致，系统不能替双方选择其中一个作为唯一目标。原引用已保留，状态为证据不足。请先核对并澄清这两处已保存的范围，再决定如何复查；这不证明某页缺少内容，也不自动更改约定。"
    : "This criterion's explicit source file and its linked locked-check files disagree. The system cannot choose a sole target for the parties. Original citations are retained and the item is unresolved. Reconcile the two saved scopes before acting; no missing content, agreed winner or scope change is established.";
  if (result.kind === "contradicted") return language === "zh"
    ? "模型把本项指定到另一个页面，与本项原文或已锁定检查中的文件不一致。原引用已保留，状态为证据不足。请对照本项完整约定和对应文件复核，不能按这段模型说明向另一页添加字段；这不证明内容缺失，也不改变约定。"
    : "The model assigned this check to a different page from its own explicit source or locked check. Original citations are retained; the item is unresolved. Review this criterion and its exact file before acting. Do not add fields to another page based on this prose; absence and a scope change are not established.";
  return language === "zh"
    ? "模型断言本项指定某个页面，但本项原文与已锁定检查尚未建立该文件归属。相似文件名只供查找，不能替双方决定页面范围。原引用已保留，状态为证据不足；请确认本项适用文件后复核，暂不能据此要求向另一页添加字段或认定内容缺失。"
    : "The model asserted a target file that this criterion's own source and locked checks have not established. A matching basename is only a search hint. Original citations are retained and the item is unresolved. Confirm this criterion's file scope before acting; do not add fields to another page or infer missing content from this assertion.";
}
