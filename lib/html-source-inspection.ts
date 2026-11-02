import { parse, type DefaultTreeAdapterTypes, type ParserError } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
export type HtmlSourceTag = { name: string; attributes: Map<string, string>; start: number; end: number; valid: boolean };
export type HtmlSourceElement = { tag: HtmlSourceTag; inBody: boolean; hidden: boolean };
export type HtmlSourceAnchor = { tag: HtmlSourceTag; end: number; text: string; valid: boolean };
export type HtmlSourceInspection = {
  valid: boolean; finding: "pass" | "fail" | "needs_human"; title?: string;
  anchors: HtmlSourceAnchor[]; elements: HtmlSourceElement[]; styles: string[]; ambiguous: boolean;
};

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
// These end tags may legally be omitted. Parser recovery for other unclosed
// elements is not evidence of a correctly supplied source document.
const OPTIONAL_END = new Set(["html", "head", "body", "li", "dt", "dd", "p", "rt", "rp", "optgroup", "option", "colgroup", "thead", "tbody", "tfoot", "tr", "td", "th"]);
const INERT = new Set(["template", "noscript"]);
const TEXT_ONLY = new Set(["script", "style", "textarea", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
const element = (node: Node): node is HtmlElement => "tagName" in node;

/**
 * Inspect an already bounded source file with the browser's HTML parsing rules.
 * This establishes document/anchor source presence, never full conformance,
 * rendered visibility, script behavior or the quality of a delivered website.
 */
export function inspectHtmlSource(source: string): HtmlSourceInspection {
  const errors: ParserError[] = [];
  const document = parse(source, { sourceCodeLocationInfo: true, scriptingEnabled: true, onParseError: error => errors.push(error) });
  const anchors: HtmlSourceAnchor[] = [], elements: HtmlSourceElement[] = [], styles: string[] = [];
  const represented: { start: number; end: number }[] = [], starts = new Set<number>();
  let ambiguous = errors.length > 0, title: string | undefined, titleCount = 0, nonemptyTitle = false, bodyFound = false, bodyContent = false, inertBodyContent = false;
  const span = (start: number, end: number) => { represented.push({ start, end }); };
  const textOf = (node: Node): string => {
    const pending = [node], values: string[] = [];
    while (pending.length) {
      const current = pending.pop()!;
      if (current.nodeName === "#text") { values.push((current as DefaultTreeAdapterTypes.TextNode).value); continue; }
      if (element(current) && (current.namespaceURI !== HTML_NAMESPACE || INERT.has(current.tagName) || TEXT_ONLY.has(current.tagName))) continue;
      if ("childNodes" in current) for (let index = current.childNodes.length - 1; index >= 0; index--) pending.push(current.childNodes[index]);
    }
    return values.join("");
  };
  // Iterative traversal bounds call-stack use for deeply nested uploaded files.
  const pending: { node: Node; inBody: boolean; hidden: boolean }[] = [{ node: document, inBody: false, hidden: false }];
  while (pending.length) {
    const { node, inBody, hidden } = pending.pop()!;
    const sourceLocation = node.sourceCodeLocation;
    if (!element(node)) {
      if (sourceLocation) span(sourceLocation.startOffset, sourceLocation.endOffset);
      if (node.nodeName === "#text" && inBody && (node as DefaultTreeAdapterTypes.TextNode).value.trim()) bodyContent = true;
      if ("childNodes" in node) for (let index = node.childNodes.length - 1; index >= 0; index--) pending.push({ node: node.childNodes[index], inBody, hidden });
      continue;
    }
    const name = node.tagName, location = node.sourceCodeLocation, start = location?.startTag;
    if (node.namespaceURI !== HTML_NAMESPACE || INERT.has(name)) {
      // Foreign/inert trees cannot supply HTML links, target IDs or resources.
      // Their exact source is still accounted for, so strings inside them do not
      // become fake markup or make an otherwise valid document malformed.
      if (location) span(location.startOffset, location.endOffset);
      if (start && !location?.endTag) ambiguous = true;
      if (inBody) inertBodyContent = true;
      continue;
    }
    if (start) {
      if (starts.has(start.startOffset)) ambiguous = true; // Parser-reconstructed formatting nodes.
      starts.add(start.startOffset);
      span(start.startOffset, start.endOffset);
      if (location.endTag) span(location.endTag.startOffset, location.endTag.endOffset);
      if (!VOID.has(name) && !OPTIONAL_END.has(name) && !location.endTag) ambiguous = true;
    }
    const nowInBody = inBody || name === "body";
    if (name === "body") bodyFound = true; // A standards-valid body can have omitted start/end tags.
    const attributes = new Map(node.attrs.filter(attr => !attr.namespace && !attr.prefix).map(attr => [attr.name, attr.value]));
    const tag: HtmlSourceTag | undefined = start ? {
      name, attributes, start: start.startOffset, end: start.endOffset,
      valid: !errors.some(error => error.startOffset >= start.startOffset && error.startOffset <= start.endOffset),
    } : undefined;
    const nowHidden = hidden || attributes.has("hidden") || attributes.has("inert");
    if (tag) elements.push({ tag, inBody, hidden: nowHidden });
    if (name === "base") ambiguous = true; // A base URL changes local reference meaning.
    if (name === "title") {
      titleCount++;
      nonemptyTitle ||= !!textOf(node).trim();
      if (location && start) title = source.slice(location.startOffset, location.endOffset);
      if (!textOf(node).trim() || inBody || !start || !location?.endTag) ambiguous = true;
      if (titleCount > 1) ambiguous = true;
    }
    if (name === "a" && inBody && tag) anchors.push({
      tag, end: location!.endOffset, text: textOf(node), valid: tag.valid && !!location?.endTag && !nowHidden,
    });
    if (TEXT_ONLY.has(name)) {
      if (location) span(location.startOffset, location.endOffset);
      if (inBody) inertBodyContent = true;
      if (name === "style" && start && location?.endTag) styles.push(source.slice(start.endOffset, location.endTag.startOffset));
      continue;
    }
    if (inBody && tag && name !== "title") bodyContent = true;
    if ("childNodes" in node) for (let index = node.childNodes.length - 1; index >= 0; index--) pending.push({ node: node.childNodes[index], inBody: nowInBody, hidden: nowHidden });
  }
  // Tree builders deliberately discard some malformed source (e.g. a second
  // body tag or an unmatched closing tag) without reporting a parse error.
  // Only token/text spans are covered, never a parent's whole subtree, so such
  // recovery becomes human review rather than a false source-document pass.
  represented.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  for (const range of represented) {
    if (range.start > cursor && source.slice(cursor, range.start).trim()) ambiguous = true;
    cursor = Math.max(cursor, range.end);
  }
  if (source.slice(cursor).trim()) ambiguous = true;
  const doctype = document.childNodes.filter(node => node.nodeName === "#documentType") as DefaultTreeAdapterTypes.DocumentType[];
  // Missing agreed parts are concrete failures. Unsupported/inert-only content
  // and parser recovery retain an explicit uncertainty instead of a false fail.
  const missing = doctype.length !== 1 || doctype[0].name !== "html" || titleCount === 0 || !nonemptyTitle || !bodyFound || (!bodyContent && !inertBodyContent);
  const finding = missing ? "fail" : ambiguous || !bodyContent ? "needs_human" : "pass";
  return { valid: finding === "pass", finding, title, anchors, elements, styles, ambiguous };
}
