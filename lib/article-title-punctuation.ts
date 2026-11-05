import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation, ProofCriterion} from "./contracts.ts";
import {normalizeExactCopyWhitespace as normalized} from "./exact-copy-directive.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
const element = (node: Node): node is Element => "tagName" in node;
const INERT = new Set(["script", "style", "template", "noscript", "textarea", "iframe", "xmp", "noembed", "noframes", "plaintext"]);
// Only a complete unquoted, non-numeric content-title statement is admitted.
// Exact/verbatim directives, another obligation and unfamiliar grammar do not
// match. The generated metadata title must add no separate requirement.
const REQUIREMENT = /^The ([a-z][a-z0-9-]{0,39}) page content must contain the article title ([A-Za-z]+(?: [A-Za-z]+){2,39})\.?$/u;
const NEUTRAL_TITLE = /^(?:Manual requirement|Original requirement|人工要求|原始需求) [1-9]\d?$/u;

/** A negative guard only. A complete quoted direct-text h1 whose ASCII word
 * sequence differs solely by one ', and ' does not establish a definite
 * content defect. This never establishes compliance or semantic equivalence. */
export function hasUnestablishedArticleTitleCommaChange(criterion: ProofCriterion, files: Record<string, string>, citations: readonly ProofAssessmentCitation[]): boolean {
  const requirement = REQUIREMENT.exec(criterion.source.trim());
  if (!requirement || !NEUTRAL_TITLE.test(criterion.title.trim()) || citations.length !== 1) return false;
  const matching = Object.keys(files).filter(file => file.split("/").at(-1) === `${requirement[1]}.html`);
  if (matching.length !== 1 || citations[0].file !== matching[0]) return false;
  const file = matching[0], source = files[file], citation = citations[0];
  if (!Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end) || citation.start < 0 || citation.end > source.length
    || source.slice(citation.start, citation.end) !== citation.excerpt) return false;
  let issue = false, visits = 0;
  const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true,
    onParseError: error => {if (error.code !== "missing-doctype") issue = true;}});
  const headings: Element[] = [], stack: {node: Node; depth: number}[] = [{node: document, depth: 0}];
  while (stack.length) {
    const {node, depth} = stack.pop()!;
    if (++visits > 50_000 || depth > 512) return false;
    if (element(node)) {
      if (node.namespaceURI !== "http://www.w3.org/1999/xhtml" || INERT.has(node.tagName)) continue;
      if (node.tagName === "h1") headings.push(node);
    }
    if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({node: node.childNodes[i], depth: depth + 1});
  }
  if (issue || headings.length !== 1) return false;
  const heading = headings[0], location = heading.sourceCodeLocation;
  if (location?.startTag?.startOffset !== citation.start || location?.endTag?.endOffset !== citation.end
    || heading.childNodes.length !== 1 || heading.childNodes[0].nodeName !== "#text") return false;
  const text = heading.childNodes[0] as DefaultTreeAdapterTypes.TextNode, span = text.sourceCodeLocation;
  // Entity or inline variants remain outside this bounded rule; no rewriting
  // or reserialising source, quotation offsets or required wording occurs.
  if (!span || source.slice(span.startOffset, span.endOffset) !== text.value) return false;
  const actual = normalized(text.value), comma = actual.indexOf(", and ");
  return comma >= 0 && actual.indexOf(",") === comma && actual.lastIndexOf(",") === comma
    && actual.replace(", and ", " and ") === requirement[2];
}
