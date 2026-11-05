import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {Language, ProofAssessmentCitation, ProofBusinessCheckStep, ProofCriterion} from "./contracts.ts";
import {assessmentEvidenceScope} from "./assessment-evidence-scope.ts";
import {assertStaticPath, STATIC_RESOURCE_LIMITS} from "./static-resources.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
export type PositiveLiteralSourceWitness =
  | {kind: "not_applicable"; reason: "non_source_scope" | "unsupported_directive" | "no_locked_check" | "inexact_locked_check"}
  | {kind: "unwitnessed"; reason: "source_unavailable_or_budget" | "unsafe_or_unlocated_owner" | "literal_missing_or_not_unique" | "model_owner_not_exact"}
  | {kind: "covered"; file: string; literal: string; citation: ProofAssessmentCitation};

const HTML = "http://www.w3.org/1999/xhtml";
const INERT = new Set(["head", "title", "script", "style", "template", "noscript", "textarea", "xmp", "iframe", "frame", "frameset", "object", "embed", "slot", "noembed", "noframes", "plaintext"]);
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
// This is a deliberately finite bare-phrase grammar, not natural-language
// extraction. Quotes, sentence punctuation and operation/condition tails do
// not inherit an exemption merely because a requested phrase occurs first.
const OPERATION = /\b(?:and|or|but|also|then|if|unless|when|while|after|before|not|never|without|must|shall|should|will|can|could|would|may|actual|actually|automatically|runtime|visible|visually|rendered|working|submit|submission|send|email|persist|store|save|restart|refund|charge|payment|every|hour)\b/iu;
const element = (node: Node): node is Element => "tagName" in node;
const trimHtmlSpace = (value: string) => value.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/gu, "");
const unavailable = (node: Element) => node.namespaceURI !== HTML || INERT.has(node.tagName)
  || node.attrs.some(attr => !!attr.namespace || ["hidden", "inert", "style", "contenteditable"].includes(attr.name)
    || attr.name === "aria-hidden" && attr.value.trim().toLowerCase() !== "false"
    || /^on|^(?:v-|x-|ng-|:|@)|^(?:data-bind|data-template|data-dynamic|data-content)$/u.test(attr.name)
    || attr.name === "class" && /(?:^|\s)(?:hidden|d-none|sr-only|visually-hidden|invisible|is-hidden)(?:\s|$)/u.test(attr.value));

function directive(source: string): {file?: string; literal: string} | undefined {
  const match = /^The (full menu|[A-Za-z0-9][A-Za-z0-9_./-]*\.html) page copy must include the literal phrase ([A-Za-z][A-Za-z0-9 '-]{0,119})$/u.exec(source.trim());
  if (!match || match[2] !== match[2].trim() || / {2}/u.test(match[2]) || OPERATION.test(match[2])) return;
  if (match[1] === "full menu") return {literal: match[2]};
  try {const file = assertStaticPath(match[1]); return file.endsWith(".html") ? {file, literal: match[2]} : undefined;} catch {return;}
}

function locateOwner(file: string, source: string, literal: string): PositiveLiteralSourceWitness {
  let parseIssue = false;
  const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true,
    onParseError: error => {if (error.code !== "missing-doctype") parseIssue = true;}});
  if (parseIssue) return {kind: "unwitnessed", reason: "unsafe_or_unlocated_owner"};
  const owners: ProofAssessmentCitation[] = [];
  const stack: {node: Node; body: boolean; unsafe: boolean; depth: number}[] = [{node: document, body: false, unsafe: false, depth: 0}];
  let visited = 0, occurrences = 0;
  while (stack.length) {
    const {node, body, unsafe: inherited, depth} = stack.pop()!;
    if (++visited > 50_000 || depth > 512) return {kind: "unwitnessed", reason: "source_unavailable_or_budget"};
    let inside = body, unsafe = inherited;
    if (element(node)) {
      inside ||= node.tagName === "body" && node.namespaceURI === HTML;
      unsafe ||= unavailable(node);
      // Inert/foreign text cannot supply either an owner or a positive count.
      if (node.namespaceURI !== HTML || INERT.has(node.tagName)) continue;
      if (inside && !unsafe && ["p", "li"].includes(node.tagName)
        && node.childNodes.length === 1 && node.childNodes[0].nodeName === "#text") {
        const at = node.sourceCodeLocation, text = (node.childNodes[0] as DefaultTreeAdapterTypes.TextNode).value;
        if (at?.startTag && at.endTag && at.endOffset > at.startOffset && at.endOffset - at.startOffset <= 500
          && trimHtmlSpace(text) === literal && trimHtmlSpace(source.slice(at.startTag.endOffset, at.endTag.startOffset)) === literal) {
          const excerpt = source.slice(at.startOffset, at.endOffset);
          if (!CONTROL.test(excerpt)) owners.push({file, start: at.startOffset, end: at.endOffset, excerpt});
        }
      }
    }
    if (inside && !unsafe && node.nodeName === "#text") {
      const text = (node as DefaultTreeAdapterTypes.TextNode).value;
      for (let at = text.indexOf(literal); at !== -1; at = text.indexOf(literal, at + literal.length)) occurrences++;
    }
    if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({node: node.childNodes[i], body: inside, unsafe, depth: depth + 1});
  }
  return owners.length === 1 && occurrences === 1 ? {kind: "covered", file, literal, citation: owners[0]}
    : {kind: "unwitnessed", reason: "literal_missing_or_not_unique"};
}

/** A positive submitted-SOURCE fact only. It never decides a verdict or
 * visibility, replaces the model's citations, or bypasses other checks. The
 * caller must separately require raw supported + active catalog V3 + no
 * authoritative failure + only dynamic_or_unsupported_source business unknowns.
 * The one finite role phrase is bound by the exact saved typed file/text/source;
 * no role is inferred from filenames. Viewport repetition is the same check.
 * Unlike the older general business checker, this affirmative witness uses NO
 * entity/NBSP/case/internal-whitespace normalization and requires an EXACT model
 * citation of the complete safe p/li owner. All other cases retain the old path.
 */
export function createPositiveLiteralSourceWitnessCheck(files: Record<string, string>, savedSteps: readonly ProofBusinessCheckStep[]) {
  const descriptors = Object.getOwnPropertyDescriptors(files), snapshot: Record<string, string> = {};
  let valid = (Object.getPrototypeOf(files) === Object.prototype || Object.getPrototypeOf(files) === null)
    && Object.keys(descriptors).length <= STATIC_RESOURCE_LIMITS.maxFiles, bytes = 0;
  for (const [file, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || typeof descriptor.value !== "string") {valid = false; continue;}
    snapshot[file] = descriptor.value; bytes += new TextEncoder().encode(descriptor.value).byteLength;
  }
  valid &&= bytes <= STATIC_RESOURCE_LIMITS.textTotalBytes;
  const steps = structuredClone(savedSteps);
  return (criterion: ProofCriterion, citations: readonly ProofAssessmentCitation[]): PositiveLiteralSourceWitness => {
    if (assessmentEvidenceScope(criterion).category !== "source_text" || OPERATION.test(criterion.title)) return {kind: "not_applicable", reason: "non_source_scope"};
    const parsed = directive(criterion.source); if (!parsed) return {kind: "not_applicable", reason: "unsupported_directive"};
    const linked = steps.filter(step => step.criterionId === criterion.id);
    if (!linked.length) return {kind: "not_applicable", reason: "no_locked_check"};
    const first = linked[0], file = first.file;
    if (linked.length > 2 || new Set(linked.map(step => step.viewportWidth)).size !== linked.length || !first.checkId
      || linked.some(step => step.checkId !== first.checkId || step.file !== file || step.expected.kind !== "visible_copy"
        || step.expected.text !== parsed.literal || step.source.excerpt !== criterion.source
        || !Number.isSafeInteger(step.source.start) || !Number.isSafeInteger(step.source.end) || step.source.start < 0
        || step.source.end - step.source.start !== criterion.source.length
        || step.source.start !== first.source.start || step.source.end !== first.source.end)
      || parsed.file && parsed.file !== file) return {kind: "not_applicable", reason: "inexact_locked_check"};
    try {if (assertStaticPath(file) !== file || !file.endsWith(".html")) throw Error();} catch {return {kind: "not_applicable", reason: "inexact_locked_check"};}
    const source = snapshot[file];
    if (!valid || typeof source !== "string" || new TextEncoder().encode(source).byteLength > STATIC_RESOURCE_LIMITS.textFileBytes
      || CONTROL.test(source)) return {kind: "unwitnessed", reason: "source_unavailable_or_budget"};
    let owner: PositiveLiteralSourceWitness;
    try {owner = locateOwner(file, source, parsed.literal);} catch {return {kind: "unwitnessed", reason: "unsafe_or_unlocated_owner"};}
    if (owner.kind !== "covered") return owner;
    if (!Array.isArray(citations) || citations.length > 6 || !citations.some(c => c && c.file === file
      && c.start === owner.citation.start && c.end === owner.citation.end && c.excerpt === owner.citation.excerpt
      && source.slice(c.start, c.end) === c.excerpt)) return {kind: "unwitnessed", reason: "model_owner_not_exact"};
    return owner;
  };
}

export function positiveLiteralSourceWitnessExplanation(witness: Extract<PositiveLiteralSourceWitness, {kind: "covered"}>, language: Language): string {
  // Preserve the full identity in the citation rather than clipping a path
  // into a different apparent filename. This also keeps the prose <=600 UTF16.
  const file = witness.file.length <= 80 ? witness.file : language === "zh" ? "对应锁定文件" : "the locked target file";
  return language === "zh"
    ? `锁定文件 ${file} 的完整原文段确实包含“${witness.literal}”，当前引用与该源码段精确对应。这只确认已提交源码中的文案；页面可见性、是否实际更新及运行行为均未验证，不代表人工验收或付款。`
    : `The complete original source block in locked file ${file} contains "${witness.literal}", and the citation matches that exact block. This confirms submitted source copy only; rendered visibility, actual updates and runtime behavior are unverified. It does not accept work or trigger payment.`;
}
