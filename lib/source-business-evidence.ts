import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {Language, ProofAssessmentCitation, ProofBusinessCheckStep} from "./contracts.ts";
import {hasUncertainSourceBodyCopyAtFile} from "./exact-copy-evidence.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
export type SourceBusinessCheckResult = {checkId: string; file: string; kind: "unchanged" | "mismatch" | "unknown"; reason: string; citation?: ProofAssessmentCitation; label?: string; expected?: string; actual?: string};
export type SourceBusinessEvidence = {kind: "not_applicable"} | {kind: "unchanged" | "mismatch" | "unknown"; checks: SourceBusinessCheckResult[]; citations: ProofAssessmentCitation[]};
type Leaf = {text: string; citation?: ProofAssessmentCitation};
type Source = {bodyText: string; leaves: Leaf[]};
const INERT = new Set(["head", "script", "style", "template", "noscript", "textarea", "xmp", "iframe", "frame", "frameset", "object", "embed", "noembed", "noframes", "plaintext"]);
const normalize = (text: string) => text.replace(/[\t\n\f\r \u00a0]+/gu, " ").trim();
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const element = (node: Node): node is Element => "tagName" in node;
function sourceFor(file: string, source: string): Source | undefined {
  if (!file.endsWith(".html")) return;
  const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true}), stack: {node: Node; body: boolean; depth: number; hidden: boolean}[] = [{node: document, body: false, depth: 0, hidden: false}];
  const bodyText: string[] = [], leaves: Leaf[] = []; let visited = 0;
  while (stack.length) {
    const {node, body, depth, hidden} = stack.pop()!;
    if (++visited > 50_000 || depth > 512) return;
    if (node.nodeName === "#text") {if (body) bodyText.push((node as DefaultTreeAdapterTypes.TextNode).value); continue;}
    let inside = body, unavailable = hidden;
    if (element(node)) {
      if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || INERT.has(node.tagName)) continue;
      inside ||= node.tagName === "body";
      unavailable ||= node.attrs.some(attr => ["hidden", "inert"].includes(attr.name) || attr.name === "aria-hidden" && attr.value === "true");
      if (inside && ["p", "li"].includes(node.tagName) && !unavailable && node.childNodes.length && node.childNodes.every(child => child.nodeName === "#text")) {
        const text = normalize(node.childNodes.map(child => (child as DefaultTreeAdapterTypes.TextNode).value).join("")), location = node.sourceCodeLocation;
        if (text) {
          const start = location?.startTag?.startOffset, end = location?.endTag?.endOffset;
          const excerpt = start === undefined || end === undefined ? "" : source.slice(start, end);
          leaves.push({text, ...(start !== undefined && end !== undefined && end > start && end - start <= 500 && !CONTROL.test(excerpt) ? {citation: {file, start, end, excerpt}} : {})});
        }
      }
    }
    if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({node: node.childNodes[i], body: inside, depth: depth + 1, hidden: unavailable || element(node) && ["table", "li"].includes(node.tagName)});
  }
  return {bodyText: normalize(bodyText.join(" ")), leaves};
}
function occurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0, at = 0;
  while ((at = text.indexOf(needle, at)) >= 0) {
    const before = text[at - 1] ?? "", after = text[at + needle.length] ?? "";
    if (!(/[A-Za-z0-9]/u.test(needle[0]) && /[A-Za-z0-9]/u.test(before)) && !(/[A-Za-z0-9]/u.test(needle.at(-1)!) && /[A-Za-z0-9]/u.test(after))) count++;
    at += needle.length;
  }
  return count;
}
function amount(text: string): {currency: "AUD" | "USD"; amountMinor: number} | undefined {
  const match = /^(AUD|USD) *(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u.exec(text);
  if (!match) return;
  const amountMinor = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(amountMinor)) return;
  return {currency: match[1] as "AUD" | "USD", amountMinor};
}
const money = (currency: string, minor: number) => `${currency} ${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;

/** Only getBusinessCheckPlan's already validated saved steps are accepted by
 * this internal seam. No prose extraction, currency inference or new scope. */
export function createSourceBusinessEvidenceCheck(files: Record<string, string>, savedSteps: readonly ProofBusinessCheckStep[]): (criterionId: string) => SourceBusinessEvidence {
  const snapshot = {...files}, steps = structuredClone(savedSteps), checks = steps.filter((step, index) => steps.findIndex(other => other.checkId === step.checkId) === index);
  const parsed = new Map<string, Source | undefined>(), uncertainty = new Map<string, boolean>();
  return criterionId => {
    const selected = checks.filter(check => check.criterionId === criterionId);
    if (!selected.length) return {kind: "not_applicable"};
    const results: SourceBusinessCheckResult[] = selected.map(check => {
      const unknown = (reason: string): SourceBusinessCheckResult => ({checkId: check.checkId, file: check.file, kind: "unknown", reason});
      if (!Object.hasOwn(snapshot, check.file)) return unknown("missing_file");
      if (!uncertainty.has(check.file)) uncertainty.set(check.file, hasUncertainSourceBodyCopyAtFile(snapshot, check.file));
      if (uncertainty.get(check.file)) return unknown("dynamic_or_unsupported_source");
      if (!parsed.has(check.file)) parsed.set(check.file, sourceFor(check.file, snapshot[check.file]));
      const source = parsed.get(check.file); if (!source) return unknown("parse_or_budget");
      if (check.expected.kind === "visible_copy") {
        const literal = normalize(check.expected.text), matching = source.leaves.filter(leaf => occurrences(leaf.text, literal) === 1);
        if (occurrences(source.bodyText, literal) !== 1 || matching.length !== 1) return unknown("literal_not_unique_or_not_located");
        if (!matching[0].citation) return unknown("source_span_unavailable_or_too_long");
        return {checkId: check.checkId, file: check.file, kind: "unchanged", reason: "literal_source_present", citation: matching[0].citation};
      }
      const label = normalize(check.expected.label);
      if (occurrences(source.bodyText, label) !== 1) return unknown("label_not_unique_or_not_located");
      const matching = source.leaves.filter(leaf => leaf.text.startsWith(label));
      if (matching.length !== 1) return unknown("complex_or_unlocated_item");
      const leaf = matching[0], tail = normalize(leaf.text.slice(label.length)), actual = amount(tail);
      if (!actual) return unknown("noncanonical_or_compound_price");
      if (!leaf.citation) return unknown("source_span_unavailable_or_too_long");
      const same = actual.currency === check.expected.currency && actual.amountMinor === check.expected.amountMinor;
      return {checkId: check.checkId, file: check.file, kind: same ? "unchanged" : "mismatch", reason: same ? "explicit_iso_price_equal" : "explicit_iso_price_differs", citation: leaf.citation, label, expected: money(check.expected.currency, check.expected.amountMinor), actual: money(actual.currency, actual.amountMinor)};
    });
    const mismatches = results.filter(result => result.kind === "mismatch"), kind = mismatches.length ? "mismatch" : results.some(result => result.kind === "unknown") ? "unknown" : "unchanged";
    const citations = mismatches.flatMap(result => result.citation ? [result.citation] : []).filter((citation, index, list) => list.findIndex(other => other.file === citation.file && other.start === citation.start && other.end === citation.end) === index).slice(0, 3);
    return {kind, checks: results, citations};
  };
}

export function sourceBusinessEvidenceExplanation(evidence: Exclude<SourceBusinessEvidence, {kind: "not_applicable"}>, language: Language): string {
  const mismatch = evidence.checks.find(check => check.kind === "mismatch");
  if (mismatch) return language === "zh"
    ? `已确认的业务检查要求“${mismatch.label}”为 ${mismatch.expected}，但 ${mismatch.file} 的唯一简单源码段写为 ${mismatch.actual}。这是带精确原文引用的有限源码差异，不是浏览器可见性或后台执行证明；同项共检查 ${evidence.checks.length} 个已确认项目，其他未知项仍需核对。`
    : `A confirmed business check expects "${mismatch.label}" at ${mismatch.expected}, but the unique simple source block in ${mismatch.file} states ${mismatch.actual}. This is a limited source mismatch with an exact quotation, not rendered visibility or backend execution. All ${evidence.checks.length} confirmed checks for this criterion were inspected; any unknowns still need review.`;
  return language === "zh"
    ? "本项已确认业务检查无法全部在有限的静态简单段落中可靠对应；重复或未定位内容、复杂格式或动态来源仍需其他证据。源码建议不能据此确认为符合，原始约定未改变。"
    : "Not all confirmed business checks can be reliably matched within the limited static simple-block format. Duplicate or unlocated content, complex markup or dynamic sources need other evidence. Source suggestions cannot establish compliance; the locked agreement is unchanged.";
}
