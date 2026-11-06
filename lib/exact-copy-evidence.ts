import { parse, type DefaultTreeAdapterTypes } from "parse5";
import type { Language, ProofCriterion } from "./contracts.ts";
import {exactCopyLiteral, normalizeExactCopyWhitespace as normalized} from "./exact-copy-directive.ts";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
export type ExactCopyEvidence = { kind: "not_applicable" } | {
  kind: "present" | "missing" | "unknown";
  literal: string;
};
const BLOCKS = new Set(["address", "article", "aside", "blockquote", "body", "caption", "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"]);
const INERT_TEXT = new Set(["head", "title", "script", "style", "template", "noscript", "textarea", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
const DYNAMIC_OR_UNSUPPORTED = new Set(["template", "noscript", "textarea", "xmp", "iframe", "frame", "frameset", "object", "embed", "slot", "noembed", "noframes", "plaintext"]);
const element = (node: Node): node is Element => "tagName" in node;
const attr = (node: Element, name: string) => node.attrs.find(row => row.name === name)?.value;
const generatedCss = (source: string) => /(?:\bcontent\s*:|@import\b|\\)/iu.test(source);

/** Snapshot static body-copy segments once. This deliberately does not render,
 * follow URLs, run scripts or establish that any text is visible. */
function bodyCopy(files: [string, string][], allowPlainInertTemplate = false): { segments: string[]; uncertain: boolean } {
  const members = new Map(files), html = files.filter(([file]) => file.endsWith(".html"));
  if (!html.length || files.length > 40 || files.reduce((sum, [, value]) => sum + value.length, 0) > 262_144) return { segments: [], uncertain: true };
  let uncertain = files.some(([file, source]) => file.endsWith(".css") && generatedCss(source)), visited = 0;
  const segments: string[] = [];
  for (const [file, source] of html) {
    let parseIssue = false;
    const document = parse(source, { scriptingEnabled: true, onParseError: error => { if (error.code !== "missing-doctype") parseIssue = true; } });
    uncertain ||= parseIssue;
    const chunks: string[] = [], stack: { node: Node; insideBody: boolean; depth: number; exit?: boolean }[] = [{ node: document, insideBody: false, depth: 0 }];
    while (stack.length) {
      if (++visited > 50_000) return { segments: [], uncertain: true };
      const { node, insideBody, depth, exit } = stack.pop()!;
      if (depth > 512) return { segments: [], uncertain: true };
      if (exit) { chunks.push("\u0000"); continue; }
      if (node.nodeName === "#text") { if (insideBody) chunks.push((node as DefaultTreeAdapterTypes.TextNode).value); continue; }
      let body = insideBody;
      if (element(node)) {
        body ||= node.tagName === "body";
        if (node.namespaceURI !== "http://www.w3.org/1999/xhtml") { uncertain = true; if (body) chunks.push("\u0000"); continue; }
        if (node.tagName === "script" && !["application/json", "application/ld+json"].includes((attr(node, "type") ?? "").trim().toLowerCase())) uncertain = true;
        if (DYNAMIC_OR_UNSUPPORTED.has(node.tagName) && !(allowPlainInertTemplate && node.tagName === "template"
          && !node.attrs.some(row => ["shadowrootmode", "shadowroot"].includes(row.name)))) uncertain = true;
        if (node.attrs.some(row => /^on/iu.test(row.name)) || generatedCss(attr(node, "style") ?? "")) uncertain = true;
        if (node.tagName === "style" && "childNodes" in node && generatedCss(node.childNodes.map(child => child.nodeName === "#text" ? (child as DefaultTreeAdapterTypes.TextNode).value : "").join(""))) uncertain = true;
        if (node.tagName === "link" && (attr(node, "rel") ?? "").toLowerCase().split(/\s+/u).includes("stylesheet")) {
          try {
            const url = new URL(attr(node, "href") ?? "", `https://proof.invalid/${file}`);
            if (url.origin !== "https://proof.invalid" || url.pathname.includes("%") || !members.has(url.pathname.slice(1)) || !url.pathname.endsWith(".css")) uncertain = true;
          } catch { uncertain = true; }
        }
        // Input attributes may become displayed text; unlike ordinary img alt,
        // their absence from body text cannot establish missing page copy.
        if (node.tagName === "input" && (attr(node, "value") || attr(node, "placeholder"))) uncertain = true;
        if (INERT_TEXT.has(node.tagName)) {
          // Head still needs traversal for script and style uncertainty.
          if (node.tagName !== "head") { if (body) chunks.push("\u0000"); continue; }
        }
        if (body && node.tagName === "br") chunks.push(" ");
        if (body && BLOCKS.has(node.tagName)) { chunks.push("\u0000"); stack.push({ node, insideBody: body, depth, exit: true }); }
      }
      if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({ node: node.childNodes[i], insideBody: body, depth: depth + 1 });
    }
    segments.push(...chunks.join("").split("\u0000").map(normalized).filter(Boolean));
  }
  return { segments, uncertain };
}

/** Shared uncertainty gate only; no invented exact-copy requirement and no
 * claim about presence, visibility or execution. */
export function hasUncertainSourceBodyCopy(files: Record<string, string>): boolean {
  return bodyCopy(Object.entries(files)).uncertain;
}

/** For a check explicitly bound to one saved HTML file, other pages do not
 * change that file's source-copy scope. Include only its directly linked local
 * stylesheets; imports and missing/external/unsupported sources stay uncertain.
 * This does not render the page or establish that a value is visible. */
function uncertainSourceBodyCopyAtFile(files: Record<string, string>, file: string, allowPlainInertTemplate: boolean): boolean {
  const entries = Object.entries(files);
  if (!Object.hasOwn(files, file) || !file.endsWith(".html") || entries.length > 40
    || entries.reduce((sum, [, value]) => sum + value.length, 0) > 262_144) return true;
  const members = new Map<string, string>([[file, files[file]]]);
  const document = parse(files[file], {scriptingEnabled: true});
  const stack: {node: Node; depth: number}[] = [{node: document, depth: 0}];
  let visited = 0;
  while (stack.length) {
    const {node, depth} = stack.pop()!;
    if (++visited > 50_000 || depth > 512) return true;
    if (element(node)) {
      // A base URL can change relative resource resolution. Do not silently
      // resolve against the saved path when another base was declared.
      if (node.tagName === "base" && attr(node, "href") !== undefined) return true;
      if (node.tagName === "link" && (attr(node, "rel") ?? "").toLowerCase().split(/\s+/u).includes("stylesheet")) {
        try {
          const url = new URL(attr(node, "href") ?? "", `https://proof.invalid/${file}`);
          const target = url.pathname.slice(1);
          if (url.origin !== "https://proof.invalid" || url.pathname.includes("%") || !target.endsWith(".css") || !Object.hasOwn(files, target)) return true;
          members.set(target, files[target]);
        } catch { return true; }
      }
    }
    if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push({node: node.childNodes[i], depth: depth + 1});
  }
  return bodyCopy([...members], allowPlainInertTemplate).uncertain;
}

/** Existing publication/copy guard remains conservative, including templates. */
export function hasUncertainSourceBodyCopyAtFile(files: Record<string, string>, file: string): boolean {
  return uncertainSourceBodyCopyAtFile(files, file, false);
}
/** Source-PRICE facts alone may ignore a plain inert template's declarations.
 * Script, handlers, generated CSS, parse errors and declarative shadow DOM
 * remain uncertain. No bytes are removed, rendered or used as active content. */
export function hasUncertainDeclaredPriceSourceAtFile(files: Record<string, string>, file: string): boolean {
  return uncertainSourceBodyCopyAtFile(files, file, true);
}

/** A negative-only guard. Presence leaves a model suggestion unchanged; it never
 * establishes entailment, rendered visibility, acceptance or a new obligation. */
export function createExactCopyEvidenceCheck(files: Record<string, string>): (criterion: ProofCriterion) => ExactCopyEvidence {
  const snapshot = Object.entries(files);
  let copy: ReturnType<typeof bodyCopy> | undefined;
  return criterion => {
    const literal = exactCopyLiteral(criterion.source);
    if (!literal) return { kind: "not_applicable" };
    copy ??= bodyCopy(snapshot);
    const present = copy.segments.some(segment => segment.includes(literal));
    // Separate blocks cannot establish one phrase, but CSS might arrange them
    // together. Keep that ambiguous rather than inventing presence or absence.
    const acrossBoundaries = normalized(copy.segments.join(" ")).includes(literal) || copy.segments.join("").includes(literal);
    return { kind: present ? "present" : copy.uncertain || acrossBoundaries ? "unknown" : "missing", literal };
  };
}

export function exactCopyEvidenceExplanation(evidence: Extract<ExactCopyEvidence, { literal: string }>, language: Language): string {
  if (evidence.kind === "unknown") return language === "zh"
    ? `本项要求逐字包含“${evidence.literal}”。未在可确定的静态正文中找到该文字，但脚本、模板、其他内容来源或解析边界使缺失结论无法成立；需要补充运行或人工核对证据。`
    : `This criterion requires the exact wording "${evidence.literal}". It was not found in determinable static body text, but scripts, templates, other content sources or parsing limits prevent a missing-copy conclusion. Runtime or human evidence is needed.`;
  return language === "zh"
    ? `未在所提供 HTML 的静态正文中找到约定的逐字文案“${evidence.literal}”。这是源码文案差异，不是对实际可见性或运行结果的判断。`
    : `The agreed exact wording "${evidence.literal}" was not found in static body text of the supplied HTML. This is a source-copy mismatch, not a rendered-visibility or runtime result.`;
}
