import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {Language, ProofAssessment, ProofAssessmentCitation, ProofCriterion} from "./contracts.ts";
import {parseSourceLiteralDirective} from "./source-literal-directive.ts";
import {normalizeExactCopyWhitespace as normalized} from "./exact-copy-directive.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";
import {staticFileKind} from "./static-resources.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
type Part = {start: number; end: number; value: string};
type Label = {text: string; form?: string; parts: Part[]};
export type LabelCitationCoverage = {kind: "not_applicable" | "covered"}
  | {kind: "incomplete"; context: "page" | "form"; missingLabels: string[]}
  | {kind: "unknown"; context: "page" | "form"};
const element = (node: Node): node is Element => "tagName" in node;
const INERT = new Set(["head", "script", "style", "template", "noscript", "textarea", "title", "iframe", "xmp", "noembed", "noframes", "plaintext"]);
const LABELABLE = new Set(["input", "button", "meter", "output", "progress", "select", "textarea"]);
const labelable = (node: Element) => LABELABLE.has(node.tagName)
  && !(node.tagName === "input" && node.attrs.find(attr => attr.name === "type")?.value.toLowerCase() === "hidden");

function labelsIn(source: string, absence?: {context: "page" | "form"; requiredLabels: readonly string[]}): Label[] | undefined {
  let issue = false, visits = 0;
  const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true,
    onParseError: error => {if (error.code !== "missing-doctype") issue = true;}});
  const labels: Label[] = [], links: {label: Label; target: string}[] = [];
  const implicit: {label: Label; controls: Element[]}[] = [];
  const controls = new Map<string, {form?: string; explicitForm?: string}[]>(), forms = new Map<string, string[]>(), ids = new Map<string, number>();
  const stack: {node: Node; form?: string; depth: number}[] = [{node: document, depth: 0}];
  while (stack.length) {
    const {node, form, depth} = stack.pop()!;
    if (++visits > 50_000 || depth > 512) return;
    let group = form;
    if (element(node)) {
      if (absence && node.namespaceURI !== "http://www.w3.org/1999/xhtml") {
        // The positive witness deliberately skips foreign namespaces. It may
        // not turn a skipped HTML island into evidence of whole-source absence.
        const pending: {node: Node; depth: number}[] = [{node, depth: 0}];
        while (pending.length) {
          const next = pending.pop()!;
          if (++visits > 50_000 || next.depth > 512) return;
          if (element(next.node) && next.node.namespaceURI === "http://www.w3.org/1999/xhtml" && next.node.tagName === "label") return;
          if ("childNodes" in next.node) for (const child of next.node.childNodes) pending.push({node: child, depth: next.depth + 1});
        }
      }
      if (absence && ["iframe", "object", "embed"].includes(node.tagName)) return;
      if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || INERT.has(node.tagName) && node.tagName !== "textarea") continue;
      const nodeId = node.attrs.find(attr => attr.name === "id")?.value;
      if (nodeId) ids.set(nodeId, (ids.get(nodeId) ?? 0) + 1);
      if (node.tagName === "form") {
        if (!Number.isSafeInteger(node.sourceCodeLocation?.startOffset)) return;
        group = String(node.sourceCodeLocation!.startOffset);
        const id = node.attrs.find(attr => attr.name === "id")?.value;
        if (id) forms.set(id, [...(forms.get(id) ?? []), group]);
      }
      if (labelable(node)) {
        const id = node.attrs.find(attr => attr.name === "id")?.value;
        if (id) controls.set(id, [...(controls.get(id) ?? []), {form: group, explicitForm: node.attrs.find(attr => attr.name === "form")?.value}]);
      }
      if (node.tagName === "label") {
        const parts: Part[] = [], nestedControls: Element[] = [], pending: {node: Node; depth: number}[] = [{node, depth: 0}];
        while (pending.length) {
          const next = pending.pop()!;
          if (++visits > 50_000 || next.depth > 512) return;
          if (element(next.node) && next.node.namespaceURI === "http://www.w3.org/1999/xhtml" && labelable(next.node)) nestedControls.push(next.node);
          if (next.node.nodeName === "#text") {
            const text = next.node as DefaultTreeAdapterTypes.TextNode, at = text.sourceCodeLocation;
            if (at) parts.push({start: at.startOffset, end: at.endOffset, value: text.value});
            else if (normalized(text.value)) return;
          } else if (element(next.node) && next.node.namespaceURI !== "http://www.w3.org/1999/xhtml") {
            // Foreign text inside an HTML label cannot be silently subtracted
            // from its declared text. Icons without text remain ignorable;
            // otherwise this finite witness leaves the owner unresolved.
            const foreign: {node: Node; depth: number}[] = [{node: next.node, depth: 0}];
            while (foreign.length) {
              const entry = foreign.pop()!;
              if (++visits > 50_000 || entry.depth > 512) return;
              if (entry.node.nodeName === "#text" && normalized((entry.node as DefaultTreeAdapterTypes.TextNode).value)) return;
              if ("childNodes" in entry.node) for (const child of entry.node.childNodes) foreign.push({node: child, depth: entry.depth + 1});
            }
            continue;
          } else if (element(next.node) && INERT.has(next.node.tagName)) continue;
          if ("childNodes" in next.node) for (let i = next.node.childNodes.length - 1; i >= 0; i--) pending.push({node: next.node.childNodes[i], depth: next.depth + 1});
        }
        const label: Label = {text: normalized(parts.map(p => p.value).join("")), ...(group ? {form: group} : {}), parts: parts.filter(p => normalized(p.value))};
        labels.push(label);
        const target = node.attrs.find(attr => attr.name === "for")?.value;
        if (target !== undefined) links.push({label, target});
        else if (nestedControls.length) implicit.push({label, controls: nestedControls});
      }
    }
    if (element(node) && node.tagName === "textarea") continue;
    if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({node: node.childNodes[i], form: group, depth: depth + 1});
  }
  for (const {label, target} of links) {
    const matches = controls.get(target) ?? [], control = matches.length === 1 ? matches[0] : undefined;
    const explicit = control?.explicitForm === undefined ? undefined : forms.get(control.explicitForm);
    const owner = control?.explicitForm === undefined ? control?.form : explicit?.length === 1 && ids.get(control.explicitForm) === 1 ? explicit[0] : undefined;
    // Page-label source makes no control-association promise. For a requested
    // common form, however, a for= target owned elsewhere cannot borrow its
    // label's ancestor form. Unresolved associations remain unestablished.
    if (!control || ids.get(target) !== 1 || owner !== label.form) {
      if (absence?.context === "form" && absence.requiredLabels.includes(label.text)) return;
      delete label.form;
    }
  }
  for (const {label, controls: nested} of implicit) {
    const explicit = nested.length === 1 ? nested[0].attrs.find(attr => attr.name === "form")?.value : undefined;
    if (nested.length === 1 && explicit === undefined) continue;
    const targets = explicit === undefined ? undefined : forms.get(explicit);
    const owner = targets?.length === 1 && ids.get(explicit!) === 1 ? targets[0] : undefined;
    if (nested.length !== 1 || !owner || owner !== label.form) {
      // The finite parser does not infer an external implicit control owner or
      // combine labels across DOM forms. Neither a positive witness nor a
      // whole-source absence claim may use that unresolved FORM association.
      if (absence?.context === "form" && absence.requiredLabels.includes(label.text)) return;
      delete label.form;
    }
  }
  return issue ? undefined : labels;
}

export type LabelSourceFact = {kind: "not_applicable"}
  | {kind: "unknown"; context: "page" | "form"; reason: "citation_witness" | "incomplete_source" | "unresolved_parse_or_owner" | "source_disagrees_with_change"}
  | {kind: "declared"; context: "page" | "form"; file: string; labelCount: number}
  | {kind: "no_complete_group"; context: "page" | "form"; files: string[]; labelCount: number};

/** Finite source facts for presentation, not a rendering/visibility detector.
 * Positive facts require the unchanged exact citation witness. A negative fact
 * scans ALL complete sent HTML; the citation check's `incomplete` is never used
 * as absence evidence. Callers must still preserve raw unknowns and business
 * checks. Historical reports and original citations are never rewritten. */
export function createAssessmentLabelSourceFactsCheck(files: Record<string, string>, coverage?: ProofAssessment["coverage"]) {
  const snapshot = {...files}, observedCoverage = coverage ? structuredClone(coverage) : undefined;
  const cited = createAssessmentLabelCitationCheck(snapshot), parsed = new Map<string, Label[] | undefined>();
  return (criterion: ProofCriterion, citations: readonly ProofAssessmentCitation[], status: "supported" | "changes_suggested"): LabelSourceFact => {
    const descriptor = parseSourceLiteralDirective(criterion.source);
    if (!descriptor || descriptor.kind !== "html_labels") return {kind: "not_applicable"};
    const labels = descriptor.labels.map(normalized), context = descriptor.context;
    if (status === "supported") {
      if (cited(criterion, citations).kind !== "covered") return {kind: "unknown", context, reason: "citation_witness"};
      const owners = [...new Set(citations.map(c => c.file))].filter(file => cited(criterion, citations.filter(c => c.file === file)).kind === "covered");
      return owners.length === 1 ? {kind: "declared", context, file: owners[0], labelCount: labels.length}
        : {kind: "unknown", context, reason: "citation_witness"};
    }
    const html = Object.keys(snapshot).filter(file => staticFileKind(file) === "html").sort();
    if (!observedCoverage || !html.length || Object.keys(snapshot).length > 40 || Object.values(snapshot).reduce((n, source) => n + source.length, 0) > 262_144
      || observedCoverage.truncatedFiles.length > 0 || observedCoverage.omittedFiles.some(file => staticFileKind(file) === "html")
      || html.some(file => !observedCoverage.includedFiles.includes(file))
      || observedCoverage.includedFiles.some(file => staticFileKind(file) === "html" && !Object.hasOwn(snapshot, file))
      || new Set(labels).size !== labels.length) return {kind: "unknown", context, reason: "incomplete_source"};
    for (const file of html) {
      const key = `${context}\u0000${labels.join("\u0000")}\u0000${file}`;
      if (!parsed.has(key)) parsed.set(key, labelsIn(snapshot[file], {context, requiredLabels: labels}));
      const all = parsed.get(key);
      if (!all) return {kind: "unknown", context, reason: "unresolved_parse_or_owner"};
      const groups = new Map<string, Set<string>>();
      for (const label of all) {
        if (!labels.includes(label.text) || context === "form" && !label.form) continue;
        const owner = context === "form" ? label.form! : file;
        if (!groups.has(owner)) groups.set(owner, new Set());
        groups.get(owner)!.add(label.text);
      }
      if ([...groups.values()].some(group => labels.every(label => group.has(label))))
        return {kind: "unknown", context, reason: "source_disagrees_with_change"};
    }
    return {kind: "no_complete_group", context, files: html, labelCount: labels.length};
  };
}

export function labelSourceFactExplanation(fact: Exclude<LabelSourceFact, {kind: "not_applicable"}>, language: Language): string {
  const context = fact.context === "form" ? language === "zh" ? "表单" : "form" : language === "zh" ? "页面" : "page";
  if (fact.kind === "declared") return language === "zh"
    ? `精确引文在 ${fact.file} 的同一${context}见证了全部 ${fact.labelCount} 个要求的 HTML 标签文字声明。这只核对所供源码；文件名是实际检查位置，不表示已经确认它对应约定中的业务页面身份。未观察渲染、可见性、无障碍或运行表现，原始要求和引文未改变。`
    : `Exact citations witness all ${fact.labelCount} required declared HTML label texts in one ${context} in ${fact.file}. This checks supplied source only. The filename is an inspected location, not a confirmed business-page identity. Rendering, visibility, accessibility and operation were not observed. The original requirement and citations are unchanged.`;
  if (fact.kind === "no_complete_group") return language === "zh"
    ? `已完整检查所供 ${fact.files.length} 个 HTML 文件，无 HTML 输入遗漏、截断或未解决的标签所属范围；没有任何单一${context}包含全部 ${fact.labelCount} 个要求的标签文字声明。这是有限源码差异，不是可见性或运行观察，也未确认业务页面身份。给具体页面下修改指令前仍应澄清适用范围；原始要求和引文未改变。`
    : `All ${fact.files.length} supplied HTML files were checked completely, without HTML omission, truncation or unresolved label ownership. No single ${context} contains all ${fact.labelCount} required declared label texts. This is a limited source discrepancy, not an observation of visibility or operation, or a confirmed business-page identity. Clarify the applicable scope before directing page edits. Original requirements and citations are unchanged.`;
  return language === "zh"
    ? `现有完整源码、引文或标签所属范围尚不能一致支持这条${context}标签结论，需人工核对原文与完整内容；不能以缺少引用推断缺少字段。未观察可见性或运行，也未确认业务页面身份。原始要求和引文未改变。`
    : `The complete source, citations or label ownership do not consistently establish this ${context}-label conclusion. Review the original wording and complete source; missing citations do not prove missing fields. Visibility, operation and business-page identity were not established. The original requirement and citations are unchanged.`;
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
