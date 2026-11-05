import type {Language, ProofCriterion} from "./contracts.ts";
import {assessmentEvidenceScope} from "./assessment-evidence-scope.ts";
import {exactCopyLiteral} from "./exact-copy-directive.ts";
import {sourceLiteralDirective} from "./source-literal-directive.ts";
import {staticMarkupDirective} from "./static-markup-directive.ts";

export type AssessmentObligationKind = "submission" | "email_delivery" | "durable_write" | "readback" | "restart_readback" | "source_content" | "unclassified";
export type AssessmentObligationState = "execution_not_verified" | "source_review_required" | "needs_clarification";
export type AssessmentObligations = {
  schema: "source-obligations-v1";
  coverage: "bounded_detection";
  sourceLength: number;
  clauses: {start: number; end: number; excerpt: string}[];
  items: {id: string; kind: AssessmentObligationKind; clauseIndex: number; state: AssessmentObligationState}[];
};
const LIMIT = 12;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SUBMISSION = /\bsubmi(?:t|ts|tted|tting|ssion|ssions)\b|提交/u;
const EMAIL = /\b(?:send(?:s|ing)?|sent|deliver(?:s|ed|ing)?|receiv(?:e[sd]?|ing)|guarantee(?:s|d|ing)?)\b[^。；;\n]{0,100}\b(?:e-?mails?|mail\s+(?:messages?|confirmations?))\b|\b(?:e-?mails?)\b[^。；;\n]{0,80}\b(?:deliver(?:ed|y)|sent|received|receipts?)\b|\be-?mail(?:s|ed|ing)?\s+(?:the|our|each|every|an?)\s+(?:owner|customer|buyer|seller|user|recipient)s?\b|(?:发(?:送|出)?|收(?:到|取)?|送达|投递|寄送)[^。；;\n]{0,60}(?:邮件|电子信件)|(?:邮件|电子信件)[^。；;\n]{0,60}(?:送达|发送|投递|收到)/iu;
const WRITE = /\b(?:sav(?:e[sd]?|ing)|stor(?:e[sd]?|ing)|record(?:s|ed|ing)?|writ(?:e[sd]?|ten|ing)|preserv(?:e[sd]?|ing)|retain(?:s|ed|ing)?|archiv(?:e[sd]?|ing))\b[^。；;\n]{0,100}\b(?:receipts?|records?|requests?|enquir(?:y|ies)|inquir(?:y|ies)|data|submissions?|database|storage|confirmations?)\b|\b(?:receipts?|records?|requests?|enquir(?:y|ies)|inquir(?:y|ies)|data|submissions?)\b[^。；;\n]{0,100}\b(?:saved|stored|recorded|written|preserved|retained|archived|persist(?:s|ed|ing|ence)?)\b|\bpersist(?:s|ed|ing|ence)?\b|保存|持久|落库|写入|存储|留存/iu;
const READBACK = /\b(?:read\s*back|retriev(?:e[sd]?|able|ing)|quer(?:y|ies|ied|ying)|re-?load(?:s|ed|ing)?|refresh(?:es|ed|ing)?)\b|回读|重新读取|可查询|重新加载|刷新/iu;
const RESTART = /\b(?:re-?start(?:s|ed|ing)?|reboot(?:s|ed|ing)?)\b|重启|重新启动/iu;
const RECORD_CONTEXT = /\b(?:receipts?|records?|data|database|enquir(?:y|ies)|inquir(?:y|ies)|submissions?)\b|回执|记录|数据|保存|落库/iu;
const SOURCE_ACTION = /\b(?:page|website|source|copy|text|content|HTML)\b[^。；;\n]{0,100}\b(?:list|state|say|include|show|display|contain|identify)\b|(?:页面|网页|网站|源码|文案|文本|文字)[^。；;\n]{0,60}(?:显示|列出|包含|写明|说明|注明)/iu;

function validSource(source: unknown): source is string {
  return typeof source === "string" && !!source.trim() && source.length <= 3000 && !CONTROL.test(source)
    && ![...source].some(char => {const point = char.codePointAt(0)!; return point >= 0xd800 && point <= 0xdfff;});
}
function state(kind: AssessmentObligationKind): AssessmentObligationState {
  return kind === "source_content" ? "source_review_required" : kind === "unclassified" ? "needs_clarification" : "execution_not_verified";
}
function atomicCopy(source: string): boolean {
  return exactCopyLiteral(source) !== undefined || sourceLiteralDirective(source) !== undefined || staticMarkupDirective(source) !== undefined;
}
function withoutQuotedData(source: string): string {
  const output = source.split("");
  const pairs: Record<string, string> = {'"': '"', "'": "'", "“": "”", "「": "」"};
  for (let index = 0; index < source.length; index++) {
    const close = pairs[source[index]];
    if (!close || source[index] === "'" && /[\p{L}\p{N}]/u.test(source[index - 1] ?? "")) continue;
    let end = index + 1;
    for (; end < source.length; end++) {
      if (source[end] !== close) continue;
      let slashes = 0; for (let previous = end - 1; previous > index && source[previous] === "\\"; previous--) slashes++;
      if (slashes % 2 === 0) break;
    }
    if (end === source.length) continue;
    for (let cursor = index; cursor <= end; cursor++) output[cursor] = " ";
    index = end;
  }
  return output.join("");
}
function englishSentenceEnd(source: string, index: number): boolean {
  if (source[index] !== "." || !/^\s+[A-Z]/u.test(source.slice(index + 1))) return false;
  const token = /[^\s]+$/u.exec(source.slice(0, index + 1))?.[0] ?? "";
  const bare = token.replace(/^[([{]+/u, "").replace(/\.$/u, "");
  if (/^(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|no|fig|inc|ltd|co|u\.s|u\.k|a\.m|p\.m|approx|dept|ref|vol|ed|rev|est)$/iu.test(bare) || /^[A-Z]$/u.test(bare)) return false;
  // Dotted numbers/identifiers, email addresses and URLs are not sentence
  // witnesses. Unfamiliar punctuation remains joined and explicitly bounded.
  if (/[.@/\\]/u.test(bare) || /\d[.,]\d/u.test(bare)) return false;
  return true;
}
function clausesFor(source: string): AssessmentObligations["clauses"] {
  if (atomicCopy(source)) return [{start: 0, end: source.length, excerpt: source}];
  const result: AssessmentObligations["clauses"] = [];
  let start = 0;
  const detected = withoutQuotedData(source);
  // Split a finite English sentence form, while retaining complete original
  // sentences, negations/conditions and exact UTF-16 spans. Quoted data and
  // conjunctions/commas are not clause delimiters.
  for (let end = 1; end <= source.length; end++) {
    if (end !== source.length && !/[;；。\n]/u.test(detected[end - 1]) && !englishSentenceEnd(detected, end - 1)) continue;
    if (source.slice(start, end).trim()) result.push({start, end, excerpt: source.slice(start, end)});
    else if (result.length) {result[result.length - 1].end = end; result[result.length - 1].excerpt = source.slice(result[result.length - 1].start, end);}
    start = end;
  }
  if (result.length && result[0].start > 0) {result[0].start = 0; result[0].excerpt = source.slice(0, result[0].end);}
  return result;
}
function kindsFor(source: string): AssessmentObligationKind[] {
  if (atomicCopy(source)) return ["source_content"];
  const detected = withoutQuotedData(source);
  const kinds: AssessmentObligationKind[] = [];
  if (SUBMISSION.test(detected.toLowerCase())) kinds.push("submission");
  if (EMAIL.test(detected)) kinds.push("email_delivery");
  if (WRITE.test(detected)) kinds.push("durable_write");
  const restart = RESTART.test(detected) && RECORD_CONTEXT.test(detected);
  if (READBACK.test(detected) && !restart) kinds.push("readback");
  if (restart) kinds.push("restart_readback");
  if (kinds.length && SOURCE_ACTION.test(detected)) kinds.push("source_content");
  if (!kinds.length) kinds.push(assessmentEvidenceScope({id: "coverage-1", title: "Original requirement", source: detected}).category === "source_text" ? "source_content" : "unclassified");
  return kinds;
}

/** Frozen v1 finite detector. It neither rewrites the locked parent nor judges
 * whether any operation succeeded. New execution/report mappings need a new
 * named schema; do not retrofit inferred successes into these source records.
 * Titles and model prose are intentionally not inputs. */
export function deriveAssessmentObligations(criterion: Pick<ProofCriterion, "source">): AssessmentObligations {
  const source = criterion.source;
  if (!validSource(source)) throw new TypeError("A bounded complete locked requirement is required.");
  let clauses = clausesFor(source);
  let entries = clauses.flatMap((clause, clauseIndex) => kindsFor(clause.excerpt).map(kind => ({kind, clauseIndex})));
  if (clauses.length > LIMIT || entries.length > LIMIT) {
    // Keep all original bytes and ask for clarification, rather than silently
    // dropping an operation or an over-limit tail of the agreement.
    clauses = [{start: 0, end: source.length, excerpt: source}];
    entries = [{kind: "unclassified", clauseIndex: 0}];
  }
  return {schema: "source-obligations-v1", coverage: "bounded_detection", sourceLength: source.length, clauses,
    items: entries.map((entry, index) => ({id: `obligation-${index + 1}`, ...entry, state: state(entry.kind)}))};
}

function plainData(value: unknown): boolean {
  let nodes = 0, characters = 0;
  const ancestors = new Set<object>();
  const visit = (entry: unknown, depth: number): boolean => {
    if (++nodes > 600 || depth > 7) return false;
    if (typeof entry === "string") return (characters += entry.length) <= 16000;
    if (typeof entry === "number") return Number.isSafeInteger(entry);
    if (!entry || typeof entry !== "object" || ancestors.has(entry)) return false;
    const keys = Reflect.ownKeys(entry), array = Array.isArray(entry), prototype = Object.getPrototypeOf(entry);
    if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) return false;
    if (array && (entry.length > 50 || keys.length !== entry.length + 1)) return false;
    ancestors.add(entry);
    for (const key of keys) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key)!;
      if (typeof key !== "string" || ["__proto__", "prototype", "constructor"].includes(key) || !("value" in descriptor) || !descriptor.enumerable
        || array && !/^(?:0|[1-9]\d*)$/u.test(key) || !visit(descriptor.value, depth + 1)) return false;
    }
    ancestors.delete(entry); return true;
  };
  return visit(value, 0);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Import/current/history validator. Invalid values are rejected, not repaired.
 * Re-derivation establishes binding to the supplied original wording only;
 * it does not prove an exhaustive parse, model judgment or runtime execution. */
export function isAssessmentObligations(value: unknown, criterion: Pick<ProofCriterion, "source">): value is AssessmentObligations {
  if (!plainData(value)) return false;
  try {return canonical(value) === canonical(deriveAssessmentObligations(criterion));} catch {return false;}
}

const COPY: Record<AssessmentObligationKind, {zh: [string, string]; en: [string, string]}> = {
  submission: {zh: ["提交及错误条件", "按原文核对已有提交、响应与错误记录；成功文案本身不能证明请求执行。"], en: ["Submission and error conditions", "Inspect existing submission, response and error records against the original condition. A success message alone does not prove execution."]},
  email_delivery: {zh: ["邮件执行条件", "按原文核对发送、禁止发送或送达条件及相应收件端证据；不自动发送邮件。"], en: ["Email operation conditions", "Check the required send, no-send or delivery conditions and recipient-side evidence. No email is sent automatically."]},
  durable_write: {zh: ["记录写入与留存", "按原文核对已有写入或禁止写入记录及对应数据；不把提交成功当作持久化。"], en: ["Record write and retention", "Check existing write or no-write records and the corresponding data against the original condition. Submission success does not establish persistence."]},
  readback: {zh: ["独立读取或刷新", "核对原文要求的独立读取或刷新后结果，并关联同一条数据；不自动读写后端。"], en: ["Independent readback or reload", "Inspect the required independent readback or post-reload result and bind it to the same data. No backend read or write is started automatically."]},
  restart_readback: {zh: ["重启后的记录回读", "核对原文要求的重启条件与同一记录的回读证据；源码描述不证明重启后数据仍在。"], en: ["Record readback after restart", "Inspect the required restart condition and independent readback of the same record. Source descriptions do not prove data survived a restart."]},
  source_content: {zh: ["文字或源码内容", "对照本分句原文与父项保存的源码引用核对；此分项没有独立运行或通过结论。"], en: ["Text or source content", "Compare this original clause with the parent's retained source citations. This direction has no independent execution or pass verdict."]},
  unclassified: {zh: ["尚需澄清的要求", "双方核对这段完整原文，确认检查方法与所需证据；系统没有替它补写承诺。"], en: ["Requirement needing clarification", "Review this complete original wording together and agree the check and evidence needed. No additional promise was inferred."]},
};
export function assessmentObligationPresentation(kind: AssessmentObligationKind, currentState: AssessmentObligationState, language: Language): {label: string; state: string; nextStep: string} {
  const [label, nextStep] = COPY[kind][language];
  const status = currentState === "execution_not_verified" ? ["运行尚未验证", "Execution not verified"] : currentState === "source_review_required" ? ["需核对源码建议", "Source review required"] : ["需澄清", "Clarification needed"];
  return {label, nextStep, state: status[language === "zh" ? 0 : 1]};
}
