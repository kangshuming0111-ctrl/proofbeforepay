import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {Language, ProofAssessmentCitation, ProofCriterion} from "./contracts.ts";
import {parseSourceLiteralDirective} from "./source-literal-directive.ts";
import {normalizeExactCopyWhitespace as normalized} from "./exact-copy-directive.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
type Part = {start: number; end: number; value: string};
type Label = {text: string; form?: string; parts: Part[]};
export type LabelCitationCoverage = {kind: "not_applicable" | "covered"}
  | {kind: "incomplete"; context: "page" | "form"; missingLabels: string[]}
  | {kind: "unknown"; context: "page" | "form"};
const element = (node: Node): node is Element => "tagName" in node;
const INERT = new Set(["head", "script", "style", "template", "noscript", "textarea", "title", "iframe", "xmp", "noembed", "noframes", "plaintext"]);

function labelsIn(source: string): Label[] | undefined {
  let issue = false, visits = 0;
  const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true,
    onParseError: error => {if (error.code !== "missing-doctype") issue = true;}});
  const labels: Label[] = [], links: {label: Label; target: string}[] = [];
  const controls = new Map<string, {form?: string; explicitForm?: string}[]>(), forms = new Map<string, string[]>(), ids = new Map<string, number>();
  const stack: {node: Node; form?: string; depth: number}[] = [{node: document, depth: 0}];
  while (stack.length) {
    const {node, form, depth} = stack.pop()!;
    if (++visits > 50_000 || depth > 512) return;
    let group = form;
    if (element(node)) {
      if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || INERT.has(node.tagName) && node.tagName !== "textarea") continue;
      const nodeId = node.attrs.find(attr => attr.name === "id")?.value;
      if (nodeId) ids.set(nodeId, (ids.get(nodeId) ?? 0) + 1);
      if (node.tagName === "form") {
        group = String(node.sourceCodeLocation?.startOffset ?? "unlocated");
        const id = node.attrs.find(attr => attr.name === "id")?.value;
        if (id) forms.set(id, [...(forms.get(id) ?? []), group]);
      }
      if (["input", "button", "meter", "output", "progress", "select", "textarea"].includes(node.tagName)
        && !(node.tagName === "input" && node.attrs.find(attr => attr.name === "type")?.value.toLowerCase() === "hidden")) {
        const id = node.attrs.find(attr => attr.name === "id")?.value;
        if (id) controls.set(id, [...(controls.get(id) ?? []), {form: group, explicitForm: node.attrs.find(attr => attr.name === "form")?.value}]);
      }
      if (node.tagName === "label") {
        const parts: Part[] = [], pending: {node: Node; depth: number}[] = [{node, depth: 0}];
        while (pending.length) {
          const next = pending.pop()!;
          if (++visits > 50_000 || next.depth > 512) return;
          if (next.node.nodeName === "#text") {
            const text = next.node as DefaultTreeAdapterTypes.TextNode, at = text.sourceCodeLocation;
            if (at) parts.push({start: at.startOffset, end: at.endOffset, value: text.value});
            else if (normalized(text.value)) return;
          } else if (element(next.node) && (next.node.namespaceURI !== "http://www.w3.org/1999/xhtml" || INERT.has(next.node.tagName))) continue;
          if ("childNodes" in next.node) for (let i = next.node.childNodes.length - 1; i >= 0; i--) pending.push({node: next.node.childNodes[i], depth: next.depth + 1});
        }
        const label: Label = {text: normalized(parts.map(p => p.value).join("")), ...(group ? {form: group} : {}), parts: parts.filter(p => normalized(p.value))};
        labels.push(label);
        const target = node.attrs.find(attr => attr.name === "for")?.value;
        if (target !== undefined) links.push({label, target});
      }
    }
    if (element(node) && node.tagName === "textarea") continue;
    if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({node: node.childNodes[i], form: group, depth: depth + 1});
  }
  for (const {label, target} of links) {
    const matches = controls.get(target) ?? [], control = matches.length === 1 ? matches[0] : undefined;
    const explicit = control?.explicitForm === undefined ? undefined : forms.get(control.explicitForm);
    const owner = control?.explicitForm === undefined ? control?.form : explicit?.length === 1 ? explicit[0] : undefined;
    // Page-label source makes no control-association promise. For a requested
    // common form, however, a for= target owned elsewhere cannot borrow its
    // label's ancestor form. Unresolved associations remain unestablished.
    if (!control || ids.get(target) !== 1 || owner !== label.form) delete label.form;
  }
  return issue ? undefined : labels;
}

/** Only witnesses the recognised literal HTML-label family. It does not infer
 * semantic page identity, accessibility associations, visibility or operation.
 * Exact saved source spans prevent comments/attributes or other files from
 * masquerading as quoted label text. No citation or model field is rewritten. */
export function createAssessmentLabelCitationCheck(files: Record<string, string>) {
  const snapshot = {...files}, parsed = new Map<string, Label[] | undefined>();
  return (criterion: ProofCriterion, citations: readonly ProofAssessmentCitation[]): LabelCitationCoverage => {
    const descriptor = parseSourceLiteralDirective(criterion.source);
    if (!descriptor || descriptor.kind !== "html_labels") return {kind: "not_applicable"};
    const labels = descriptor.labels.map(normalized), context = descriptor.context;
    if (new Set(labels).size !== labels.length || citations.length > ASSESSMENT_ITEM_CITATION_LIMIT) return {kind: "unknown", context};
    if (Object.keys(snapshot).length > 40 || Object.values(snapshot).reduce((sum, value) => sum + value.length, 0) > 262_144) return {kind: "unknown", context};
    if (citations.some(c => !Object.hasOwn(snapshot, c.file) || !Number.isSafeInteger(c.start) || !Number.isSafeInteger(c.end) || c.start < 0 || c.end <= c.start || c.end > snapshot[c.file].length || snapshot[c.file].slice(c.start, c.end) !== c.excerpt)) return {kind: "unknown", context};
    const groups = new Map<string, Set<string>>();
    for (const file of [...new Set(citations.map(c => c.file))].sort()) {
      if (!file.endsWith(".html")) continue;
      if (!parsed.has(file)) parsed.set(file, labelsIn(snapshot[file]));
      for (const label of parsed.get(file) ?? []) {
        if (!labels.includes(label.text) || !label.parts.length || context === "form" && !label.form) continue;
        const key = context === "form" ? `${file}\u0000${label.form}` : file;
        if (!groups.has(key)) groups.set(key, new Set());
        const witnessed = label.parts.every(part => {
          const raw = snapshot[file].slice(part.start, part.end);
          const leading = /^[\t\n\f\r \u00a0]*/u.exec(raw)![0].length, trailing = /[\t\n\f\r \u00a0]*$/u.exec(raw)![0].length;
          // Require the whole non-whitespace source span, including every byte
          // of an entity. A cut-off '&' cannot witness an encoded '&amp;'.
          const start = part.start + leading, end = part.end - trailing;
          return citations.some(c => c.file === file && c.start <= start && c.end >= end);
        });
        if (witnessed) groups.get(key)!.add(label.text);
      }
    }
    const complete = [...groups.values()].filter(group => labels.every(label => group.has(label)));
    if (complete.length === 1) return {kind: "covered"};
    if (complete.length > 1) return {kind: "unknown", context};
    const best = [...groups.values()].sort((a, b) => b.size - a.size)[0] ?? new Set<string>();
    return {kind: "incomplete", context, missingLabels: labels.filter(label => !best.has(label))};
  };
}

export function labelCitationCoverageExplanation(result: Extract<LabelCitationCoverage, {context: string}>, language: Language): string {
  const context = result.context === "form" ? language === "zh" ? "同一 HTML 表单" : "one HTML form" : language === "zh" ? "同一 HTML 页面" : "one HTML page";
  if (result.kind === "unknown") return language === "zh"
    ? `源码引文无法唯一对应${context}的标签清单，需补充明确引文。这是引用覆盖不确定，不代表交付缺少字段；原始要求未改变。`
    : `The citations cannot uniquely witness the label list in ${context}. Add clear source evidence; this is uncertain citation coverage, not proof of missing delivery fields.`;
  const shown = result.missingLabels.slice(0, 3).join("; "), remaining = result.missingLabels.length - 3;
  return language === "zh"
    ? `源码引文尚未在${context}覆盖标签：${shown}${remaining > 0 ? `（另 ${remaining} 项）` : ""}。请补充引文；这是引用缺口，不代表交付缺少字段。`
    : `Source citations do not cover these labels in ${context}: ${shown}${remaining > 0 ? ` (+${remaining} more)` : ""}. Add citations; this is an evidence gap, not proof of missing delivery fields.`;
}
