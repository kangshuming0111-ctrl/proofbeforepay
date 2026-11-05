import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {Language, ProofAssessmentCitation, ProofBusinessCheckStep} from "./contracts.ts";
import {hasUncertainSourceBodyCopyAtFile} from "./exact-copy-evidence.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
export type SourceBusinessCheckResult = {checkId: string; file: string; kind: "unchanged" | "mismatch" | "unknown"; reason: string; citation?: ProofAssessmentCitation; label?: string; expected?: string; actual?: string};
export type SourceBusinessEvidence = {kind: "not_applicable"} | {kind: "unchanged" | "mismatch" | "unknown"; checks: SourceBusinessCheckResult[]; citations: ProofAssessmentCitation[]};
export type SourceBusinessCitationWitnessCheck = {
  checkId: string; file: string; kind: "covered" | "unknown";
  reason: "complete_source_span_cited" | "target_file_not_cited" | "target_source_span_not_cited" | "source_span_unavailable" | "source_check_unavailable";
};
export type SourceBusinessCitationWitness = {kind: "not_applicable"}
  | {kind: "covered" | "unknown"; checks: SourceBusinessCitationWitnessCheck[]};
type Leaf = {text: string; label?: string; citation?: ProofAssessmentCitation};
type Source = {bodyText: string; leaves: Leaf[]; priceLeaves: Leaf[]};
const INERT = new Set(["head", "script", "style", "template", "noscript", "textarea", "xmp", "iframe", "frame", "frameset", "object", "embed", "noembed", "noframes", "plaintext"]);
const normalize = (text: string) => text.replace(/[\t\n\f\r \u00a0]+/gu, " ").trim();
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const element = (node: Node): node is Element => "tagName" in node;

/** A deliberately narrow table owner: direct two-cell rows, text-only cells,
 * and explicit raw row/cell boundaries. No neighboring-row or rendered-layout
 * inference. The whole owner is rejected if parsing moved unsupported markup
 * elsewhere, or any row is merged, hidden, nested or structurally ambiguous. */
function tablePriceLeaves(file: string, source: string, owner: Element, ownerDepth: number, withinBudget: () => boolean): Leaf[] {
  type Span = {start: number; end: number; text?: string};
  const leaves: Leaf[] = [];
  const read = (node: Element, parent: Node, depth: number): Span | undefined => {
    if (!withinBudget() || depth > 512 || node.parentNode !== parent || node.namespaceURI !== "http://www.w3.org/1999/xhtml") return;
    const tag = node.tagName;
    if (!["table", "thead", "tbody", "tfoot", "tr", "td", "th"].includes(tag) || tag === "table" && node !== owner) return;
    if (node.attrs.some(attr => attr.namespace || ["rowspan", "colspan", "hidden", "inert", "style"].includes(attr.name)
      || attr.name === "aria-hidden" && attr.value.trim().toLowerCase() === "true")) return;
    const location = node.sourceCodeLocation, implicitGroup = tag === "tbody" && !location;
    if (!implicitGroup && (!location?.startTag || !location.endTag)) return;
    const start = location?.startTag?.startOffset, contentStart = location?.startTag?.endOffset;
    const contentEnd = location?.endTag?.startOffset, end = location?.endTag?.endOffset;
    if (!implicitGroup && (start === undefined || end === undefined || contentStart === undefined || contentEnd === undefined
      || start < 0 || end > source.length || start >= contentStart || contentStart > contentEnd || contentEnd >= end)) return;
    if (tag === "td" || tag === "th") {
      // Ignored closing tags can disappear from parse5's child list. Text-only
      // means the original cell content also contains no markup introducer.
      if (source.slice(contentStart!, contentEnd!).includes("<")) return;
      let text = "";
      for (const child of node.childNodes) {
        if (!withinBudget() || depth + 1 > 512 || child.nodeName !== "#text") return;
        text += (child as DefaultTreeAdapterTypes.TextNode).value;
      }
      return {start: start!, end: end!, text: normalize(text)};
    }
    const children: {node: Element; span: Span}[] = [];
    for (const child of node.childNodes) {
      if (child.nodeName === "#text") {
        if (!withinBudget() || depth + 1 > 512 || normalize((child as DefaultTreeAdapterTypes.TextNode).value)) return;
        continue;
      }
      if (!element(child)) return;
      const allowed = tag === "table" ? ["thead", "tbody", "tfoot", "tr"]
        : ["thead", "tbody", "tfoot"].includes(tag) ? ["tr"] : ["td", "th"];
      if (!allowed.includes(child.tagName)) return;
      const span = read(child, node, depth + 1); if (!span) return;
      children.push({node: child, span});
    }
    if (implicitGroup && !children.length || tag === "tr" && children.length !== 2) return;
    // parse5 may foster-parent invalid table descendants outside this owner.
    // Require the located AST children to account for every nonblank source
    // byte between tags, rather than trusting the repaired tree alone.
    const from = implicitGroup ? children[0].span.start : contentStart!, to = implicitGroup ? children.at(-1)!.span.end : contentEnd!;
    let cursor = from;
    for (const {span} of children) {
      if (span.start < cursor || span.end > to || normalize(source.slice(cursor, span.start))) return;
      cursor = span.end;
    }
    if (normalize(source.slice(cursor, to))) return;
    if (tag === "tr") {
      const label = children[0].span.text!, value = children[1].span.text!, excerpt = source.slice(start!, end!);
      if (label && amount(value) && excerpt.length <= 500 && !CONTROL.test(excerpt)) leaves.push({label, text: `${label} ${value}`, citation: {file, start: start!, end: end!, excerpt}});
    }
    return {start: implicitGroup ? from : start!, end: implicitGroup ? to : end!};
  };
  return owner.parentNode && read(owner, owner.parentNode, ownerDepth) ? leaves : [];
}

function sourceFor(file: string, source: string): Source | undefined {
  if (!file.endsWith(".html")) return;
  const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true}), stack: {node: Node; body: boolean; depth: number; hidden: boolean}[] = [{node: document, body: false, depth: 0, hidden: false}];
  const bodyText: string[] = [], leaves: Leaf[] = [], rows: Leaf[] = []; let visited = 0;
  while (stack.length) {
    const {node, body, depth, hidden} = stack.pop()!;
    if (++visited > 50_000 || depth > 512) return;
    if (node.nodeName === "#text") {if (body) bodyText.push((node as DefaultTreeAdapterTypes.TextNode).value); continue;}
    let inside = body, unavailable = hidden;
    if (element(node)) {
      if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || INERT.has(node.tagName)) continue;
      inside ||= node.tagName === "body";
      unavailable ||= node.attrs.some(attr => ["hidden", "inert"].includes(attr.name) || attr.name === "aria-hidden" && attr.value === "true");
      if (inside && node.tagName === "table" && !unavailable) {
        rows.push(...tablePriceLeaves(file, source, node, depth, () => ++visited <= 50_000));
        if (visited > 50_000) return;
      }
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
  return {bodyText: normalize(bodyText.join(" ")), leaves, priceLeaves: [...leaves, ...rows]};
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
      const matching = source.priceLeaves.filter(leaf => leaf.label === undefined ? leaf.text.startsWith(label) : leaf.label === label);
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

/** Witness the already locked file and complete server-located block, rather
 * than merely finding the same text somewhere else. Inputs are the internal
 * source-check result and source-validated model citations. A covered result is
 * not a new model verdict: callers may only use an unknown result to withhold
 * otherwise-supported advice. No citation, expectation or source is rewritten.
 * Mismatch and unknown source checks retain their existing decision path. */
export function assessSourceBusinessCitationWitness(evidence: SourceBusinessEvidence, citations: readonly ProofAssessmentCitation[]): SourceBusinessCitationWitness {
  if (evidence.kind !== "unchanged") return {kind: "not_applicable"};
  const checks: SourceBusinessCitationWitnessCheck[] = evidence.checks.map(check => {
    const result = (reason: SourceBusinessCitationWitnessCheck["reason"], kind: "covered" | "unknown" = "unknown"): SourceBusinessCitationWitnessCheck => ({checkId: check.checkId, file: check.file, kind, reason});
    if (check.kind !== "unchanged") return result("source_check_unavailable");
    const expected = check.citation;
    if (!expected || expected.file !== check.file || !Number.isSafeInteger(expected.start) || !Number.isSafeInteger(expected.end)
      || expected.start < 0 || expected.end <= expected.start || expected.end - expected.start !== expected.excerpt.length) return result("source_span_unavailable");
    const candidates = citations.filter(citation => citation.file === check.file);
    if (!candidates.length) return result("target_file_not_cited");
    const covered = candidates.some(citation => Number.isSafeInteger(citation.start) && Number.isSafeInteger(citation.end)
      && citation.start >= 0 && citation.end > citation.start && citation.end - citation.start === citation.excerpt.length
      && citation.start <= expected.start && citation.end >= expected.end
      && citation.excerpt.slice(expected.start - citation.start, expected.end - citation.start) === expected.excerpt);
    return covered ? result("complete_source_span_cited", "covered") : result("target_source_span_not_cited");
  });
  return {kind: checks.length && checks.every(check => check.kind === "covered") ? "covered" : "unknown", checks};
}

export function sourceBusinessCitationWitnessExplanation(witness: Extract<SourceBusinessCitationWitness, {checks: SourceBusinessCitationWitnessCheck[]}>, language: Language): string {
  const missing = witness.checks.filter(check => check.kind === "unknown"), first = missing[0];
  // Only the display label is bounded. Full file/check identities stay intact
  // in witness.checks; a clipped path would misleadingly name another file.
  const fileLabel = first && first.file.length <= 80 ? first.file : language === "zh" ? "锁定目标文件" : "the locked target file";
  const checkLabel = first && first.checkId.length <= 80 ? first.checkId : language === "zh" ? "已锁定的业务检查" : "a locked business check";
  const target = first ? `${checkLabel} (${fileLabel})` : language === "zh" ? "已锁定的业务检查" : "the locked business checks";
  return language === "zh"
    ? `已确认业务值的源码检查不能替代 AI 引用覆盖。当前引文尚未完整对应 ${target}${missing.length > 1 ? ` 等 ${missing.length} 项` : ""} 的同页原始源码段。请补充正确引文；这是引用范围缺口，不代表字段不存在、页面已显示或功能已运行。原始约定和引文未改变。`
    : `Source facts for the locked business checks do not replace AI citation coverage. The citations do not cover the complete same-file source span for ${target}${missing.length > 1 ? ` and ${missing.length - 1} other check(s)` : ""}. Add the correct source evidence. This is a citation-scope gap, not proof that fields are absent, visible or working. The agreement and original citations are unchanged.`;
}

export function sourceBusinessEvidenceExplanation(evidence: Exclude<SourceBusinessEvidence, {kind: "not_applicable"}>, language: Language): string {
  const mismatch = evidence.checks.find(check => check.kind === "mismatch");
  if (mismatch) {
    const fileLabel = mismatch.file.length <= 80 ? mismatch.file : language === "zh" ? "锁定目标文件" : "the locked target file";
    return language === "zh"
      ? `已确认的业务检查要求“${mismatch.label}”为 ${mismatch.expected}，但 ${fileLabel} 的唯一简单源码段写为 ${mismatch.actual}。这是带精确原文引用的有限源码差异，不是浏览器可见性或后台执行证明；同项共检查 ${evidence.checks.length} 个已确认项目，其他未知项仍需核对。`
      : `A confirmed business check expects "${mismatch.label}" at ${mismatch.expected}, but the unique simple source block in ${fileLabel} states ${mismatch.actual}. This is a limited source mismatch with an exact quotation, not rendered visibility or backend execution. All ${evidence.checks.length} confirmed checks for this criterion were inspected; any unknowns still need review.`;
  }
  return language === "zh"
    ? "本项已确认业务检查无法全部在有限的静态简单段落中可靠对应；重复或未定位内容、复杂格式或动态来源仍需其他证据。源码建议不能据此确认为符合，原始约定未改变。"
    : "Not all confirmed business checks can be reliably matched within the limited static simple-block format. Duplicate or unlocated content, complex markup or dynamic sources need other evidence. Source suggestions cannot establish compliance; the locked agreement is unchanged.";
}
