import {parse, parseFragment, type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation, ProofCriterion} from "./contracts.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";
import {assertStaticPath, staticFileKind, STATIC_RESOURCE_LIMITS} from "./static-resources.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
type Range = {start: number; end: number};
type Mapped = {value: string; range: Range};
type Run = {text: string; ranges: Range[][]};
type Parsed = {targets: Map<string, {node: Element; depth: number}[]>; idCounts: Map<string, number>; visits: number};
export type UniversalSourceListEvidence = {kind: "not_applicable" | "covered" | "unknown"; reason?: string};
const HTML = "http://www.w3.org/1999/xhtml";
const INERT = new Set(["head", "title", "script", "style", "template", "noscript", "textarea", "xmp", "iframe", "frame", "frameset", "object", "embed", "noembed", "noframes", "plaintext"]);
const GROUP = new Set(["a", "button", "label", "p", "li", "div", "nav", "ul", "ol", "section", "header", "footer", "main", "article", "aside", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "tr", "form", "fieldset", "legend"]);
const COUNTS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const ACTION = /\b(?:actually|actual|automatically|then|also|after|before|when|while|unless|if|without|must|shall|should|will|can|could|would|may|needs?|send|sent|charge|refund|save|record|store|persist|retain|execute|process|submit|click|authenticate|deliver|guarantee|visible|visually|working|runtime)\b/iu;
const SPACE = /^[\t\n\f\r \u00a0]$/u;
const WORD = /[\p{L}\p{N}_]/u;
const ENTITY = /&(?:#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/uy;
const element = (node: Node): node is Element => "tagName" in node;
// Conservative agreement with the related source-tag witness. These explicit
// hints withhold a source witness; they are not arbitrary CSS/media analysis or
// proof that a submitted label was rendered, hidden or dynamically changed.
const unavailable = (node: Element) => node.namespaceURI !== HTML || INERT.has(node.tagName)
  || node.attrs.some(attr => !!attr.namespace || ["hidden", "inert", "style", "contenteditable"].includes(attr.name)
    || attr.name === "aria-hidden" && attr.value.trim().toLowerCase() !== "false"
    || /^on|^(?:v-|x-|ng-|:|@)|^(?:data-bind|data-template|data-dynamic|data-content)$/u.test(attr.name)
    || attr.name === "class" && /(?:^|\s)(?:hidden|d-none|sr-only|visually-hidden|invisible|is-hidden)(?:\s|$)/u.test(attr.value));

function directive(source: string): {id: string; count: number; labels: string[]} | undefined {
  const text = source.trim(); if (text.length > 800 || /[\r\n]/u.test(text)) return;
  const match = /^Text content in ([A-Za-z0-9_-]{1,80}) on all (1|2|3|4|5|6|7|8|9|10|one|two|three|four|five|six|seven|eight|nine|ten) pages must include (.+?)\.?$/u.exec(text);
  if (!match) return;
  const labels = match[3].split(" and ").map(value => value.trim());
  if (!labels.length || labels.length > 6 || new Set(labels).size !== labels.length
    || labels.some(label => !/^[\p{L}\p{N}\p{So}][\p{L}\p{N}\p{So} &'’()_./?-]{0,79}$/u.test(label) || ACTION.test(label))) return;
  return {id: match[1], count: /^\d+$/u.test(match[2]) ? Number(match[2]) : COUNTS.indexOf(match[2]) + 1, labels};
}

function parsedSource(source: string): Parsed | undefined {
  let error = false, visits = 0;
  const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true, onParseError: () => {error = true;}});
  const targets = new Map<string, {node: Element; depth: number}[]>(), idCounts = new Map<string, number>();
  const stack: {node: Node; body: boolean; unsafe: boolean; depth: number}[] = [{node: document, body: false, unsafe: false, depth: 0}];
  while (stack.length) {
    const {node, body, depth, unsafe: inherited} = stack.pop()!; if (++visits > 50_000 || depth > 512) return;
    let inside = body, unsafe = inherited;
    if (element(node)) {
      unsafe ||= unavailable(node);
      inside ||= node.tagName === "body";
      const id = node.attrs.find(attr => attr.name === "id")?.value;
      if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      if (inside && !unsafe && id) {const found = targets.get(id) ?? []; found.push({node, depth}); targets.set(id, found);}
    }
    // Template contents are a separate inert DocumentFragment, not childNodes.
    // Count all actual document element IDs, including hidden/head/foreign
    // owners, while never treating their text as active body evidence.
    if ("childNodes" in node) for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push({node: node.childNodes[index], body: inside, unsafe, depth: depth + 1});
  }
  return error ? undefined : {targets, idCounts, visits};
}

/** Map each decoded code point to its complete original source interval.
 * Entity bytes and surrogate pairs are indivisible witnesses: a truncated
 * '&amp' or half an emoji never substitutes for the decoded character. */
function mappedText(source: string, node: DefaultTreeAdapterTypes.TextNode, entities: Map<string, string>): Mapped[] | undefined {
  const at = node.sourceCodeLocation; if (!at) return node.value.trim() ? undefined : [];
  const raw = source.slice(at.startOffset, at.endOffset), mapped: Mapped[] = []; let decoded = "";
  for (let index = 0; index < raw.length;) {
    let width = 1, value = raw[index];
    if (value === "&") {
      ENTITY.lastIndex = index; const entity = ENTITY.exec(raw)?.[0];
      if (entity) {
        let decodedEntity = entities.get(entity);
        if (decodedEntity === undefined) {
          if (entities.size >= 2_048) return;
          const fragment = parseFragment(entity);
          if (fragment.childNodes.some(child => child.nodeName !== "#text")) return;
          decodedEntity = fragment.childNodes.map(child => (child as DefaultTreeAdapterTypes.TextNode).value).join(""); entities.set(entity, decodedEntity);
        }
        value = decodedEntity; width = entity.length;
      }
    } else if (value === "\r") {value = "\n"; if (raw[index + 1] === "\n") width = 2;}
    else {value = String.fromCodePoint(raw.codePointAt(index)!); width = value.length;}
    const range = {start: at.startOffset + index, end: at.startOffset + index + width};
    for (const character of value) mapped.push({value: character, range});
    decoded += value; index += width;
  }
  return decoded === node.value ? mapped : undefined;
}
function normalizedRun(parts: Mapped[]): Run {
  let text = ""; const ranges: Range[][] = [], pending: Range[] = [];
  for (const part of parts) {
    if (SPACE.test(part.value)) {pending.push(part.range); continue;}
    if (text && pending.length) {text += " "; ranges.push([...pending]);}
    pending.length = 0; text += part.value;
    for (let index = 0; index < part.value.length; index++) ranges.push([part.range]);
  }
  return {text, ranges};
}
function targetRuns(source: string, target: {node: Element; depth: number}, initialVisits: number): Run[] | undefined {
  const location = target.node.sourceCodeLocation;
  if (!location?.startTag || !location.endTag) return;
  const runs: Run[] = [], entities = new Map<string, string>(); let parts: Mapped[] = [], current: Node | undefined, visits = initialVisits;
  const flush = () => {if (parts.length) runs.push(normalizedRun(parts)); parts = []; current = undefined;};
  const stack: {node: Node; depth: number; group: Node; exit?: boolean}[] = [{node: target.node, depth: target.depth, group: target.node}];
  while (stack.length) {
    const frame = stack.pop()!, {node, depth} = frame;
    if (frame.exit) {flush(); continue;}
    if (++visits > 50_000 || depth > 512) return;
    if (node.nodeName === "#text") {
      const text = node as DefaultTreeAdapterTypes.TextNode, at = text.sourceCodeLocation;
      if (at && (at.startOffset < location.startTag.endOffset || at.endOffset > location.endTag.startOffset)) return;
      const mapped = mappedText(source, text, entities); if (!mapped) return;
      if (current !== frame.group) flush(); current = frame.group; parts.push(...mapped); continue;
    }
    let group = frame.group;
    if (element(node)) {
      if (unavailable(node) || ["br", "hr"].includes(node.tagName)) {flush(); continue;}
      if (GROUP.has(node.tagName) || node === target.node) {flush(); group = node; stack.push({...frame, exit: true});}
    }
    if ("childNodes" in node) for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push({node: node.childNodes[index], depth: depth + 1, group});
  }
  flush(); return runs;
}
function previousCodePoint(text: string, index: number): string {
  if (index <= 0) return "";
  const low = text.charCodeAt(index - 1), high = index > 1 ? text.charCodeAt(index - 2) : 0;
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? text.slice(index - 2, index) : text[index - 1];
}
function codePointAt(text: string, index: number): string {
  const point = text.codePointAt(index); return point === undefined ? "" : String.fromCodePoint(point);
}
function witnessed(run: Run, label: string, citations: readonly ProofAssessmentCitation[], file: string): boolean {
  const first = codePointAt(label, 0), last = previousCodePoint(label, label.length);
  for (let at = run.text.indexOf(label); at !== -1; at = run.text.indexOf(label, at + label.length)) {
    const before = previousCodePoint(run.text, at), after = codePointAt(run.text, at + label.length);
    if (WORD.test(first) && WORD.test(before) || WORD.test(last) && WORD.test(after)) continue;
    if (run.ranges.slice(at, at + label.length).every(ranges => ranges.every(range => citations.some(citation => citation.file === file && citation.start <= range.start && citation.end >= range.end)))) return true;
  }
  return false;
}

/** Negative-only witness for one finite universal source-list family. "All N"
 * binds every supplied HTML file only when its count and saved required-page
 * subset agree. It never guesses semantic roles or filenames, rewrites source,
 * upgrades unknown advice, or establishes visibility/navigation execution. */
export function createUniversalSourceListEvidenceCheck(files: Record<string, string>, requiredPages: readonly string[] = []) {
  const snapshot = {...files}, required = [...requiredPages], parsed = new Map<string, Parsed | undefined>();
  return (criterion: ProofCriterion, citations: readonly ProofAssessmentCitation[]): UniversalSourceListEvidence => {
    const text = criterion.source.trim(), expectation = directive(text);
    if (!expectation) return /^Text content in [A-Za-z0-9_-]{1,80} on all\b/u.test(text) ? {kind: "unknown", reason: "unsupported_list_requirement"} : {kind: "not_applicable"};
    const html = Object.keys(snapshot).filter(file => staticFileKind(file) === "html").sort();
    const unknown = (reason: string): UniversalSourceListEvidence => ({kind: "unknown", reason});
    try {for (const file of required) {assertStaticPath(file); if (staticFileKind(file) !== "html" || !Object.hasOwn(snapshot, file)) return unknown("unconfirmed_page_scope");}} catch {return unknown("unconfirmed_page_scope");}
    if (html.length !== expectation.count || required.some(file => !html.includes(file))) return unknown("unconfirmed_page_scope");
    if (Object.keys(snapshot).length > STATIC_RESOURCE_LIMITS.maxFiles || Object.values(snapshot).some(source => typeof source !== "string")
      || Object.values(snapshot).reduce((sum, source) => sum + new TextEncoder().encode(source).byteLength, 0) > STATIC_RESOURCE_LIMITS.textTotalBytes) return unknown("source_budget");
    try {for (const file of html) {assertStaticPath(file); if (new TextEncoder().encode(snapshot[file]).byteLength > STATIC_RESOURCE_LIMITS.textFileBytes) return unknown("source_budget");}} catch {return unknown("unconfirmed_page_scope");}
    if (citations.length > ASSESSMENT_ITEM_CITATION_LIMIT) return unknown("citation_limit");
    if (citations.some(citation => !Object.hasOwn(snapshot, citation.file) || !Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end)
      || citation.start < 0 || citation.end <= citation.start || citation.end > snapshot[citation.file].length || citation.end - citation.start > 500
      || snapshot[citation.file].slice(citation.start, citation.end) !== citation.excerpt)) return unknown("invalid_citation");
    for (const file of html) {
      if (!parsed.has(file)) parsed.set(file, parsedSource(snapshot[file]));
      const source = parsed.get(file); if (!source) return unknown("parse_or_budget");
      const targets = source.targets.get(expectation.id) ?? []; if (source.idCounts.get(expectation.id) !== 1 || targets.length !== 1) return unknown("target_not_unique_or_missing");
      const runs = targetRuns(snapshot[file], targets[0], source.visits); if (!runs) return unknown("parse_or_budget");
      if (!expectation.labels.every(label => runs.some(run => witnessed(run, label, citations, file)))) return unknown("literal_not_witnessed");
    }
    return {kind: "covered"};
  };
}
