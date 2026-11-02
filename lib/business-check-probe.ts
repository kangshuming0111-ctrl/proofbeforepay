import type { ProofBusinessCheckReading, ProofBusinessCheckStep, ProofQuote } from "./contracts.ts";
import { containsBusinessText, getBusinessCheckPlan, normalizeBusinessText } from "./business-checks.ts";
import { Unavailable, bounded, cancelled, snapshot } from "./saved-page-observation.ts";

export type BusinessCheckInput = {deliveryId: string; previousReportId: string | null; readings: ProofBusinessCheckReading[]};
type ContentReason = "ambiguous_content" | "text_limit";
class ContentUnavailable extends Error {
  readonly reason: ContentReason;
  constructor(reason: ContentReason) {super(reason); this.reason = reason;}
}
const MAX_TEXT_NODES = 3000;
const MAX_BLOCKS = 1000;
const MAX_READING_BLOCKS = 12;
const MAX_BLOCK_LENGTH = 300;
const OMIT = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TEXTAREA", "SELECT", "OPTION", "SVG", "MATH"]);
const STRUCTURAL = new Set(["P", "LI", "TR", "DT", "DD", "ADDRESS", "FIGCAPTION", "H1", "H2", "H3", "H4", "H5", "H6"]);
const NO_PROMOTION = new Set(["HTML", "BODY", "MAIN", "SECTION", "HEADER", "FOOTER", "NAV", "FORM", "UL", "OL", "TABLE", "TBODY", "THEAD", "TFOOT"]);
const HEADING = /^H[1-6]$/u;
const WEEKDAYS = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/giu;
const STOPWORDS = new Set(["the", "and", "for", "with", "this", "that", "must", "should", "will", "are", "our", "your"]);
const MONEY = /(?:\b(?:AUD|USD)\b|A\$|US\$|\$)\s*\d/iu;
type Root = Element | Text;
type Piece = {node: Text; text: string; range: Range};

/** This is deliberately a bounded text observation, not OCR, a semantic page
 * judgment or proof that the full website is free of defects. */
function visibleBlocks(doc: Document, win: Window, step: ProofBusinessCheckStep, signal: AbortSignal): string[] {
  const needle = step.expected.kind === "visible_copy" ? step.expected.text : step.expected.label;
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const styleFor = (element: Element) => {
    let style = styles.get(element);
    if (!style) {style = win.getComputedStyle(element); styles.set(element, style);}
    return style;
  };
  const hidden = (element: Element): boolean => {
    for (let current: Element | null = element; current; current = current.parentElement) {
      if (OMIT.has(current.tagName) || current.hasAttribute("inert") || current.hasAttribute("hidden")) return true;
      const style = styleFor(current);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse"
        || Number(style.opacity) < .1 || Number.parseFloat(style.fontSize) === 0
        || /(?:rgba\([^)]*,\s*0(?:\.0+)?\)|\/\s*0(?:\.0+)?\s*\))$/u.test(style.color)) return true;
    }
    return false;
  };
  const blockFor = (node: Text): Root => {
    let current = node.parentElement;
    while (current && current !== doc.body) {
      // A table's price and label can occupy separate cells in the same row.
      if (current.tagName === "TD" || current.tagName === "TH") return current.closest("tr") ?? current;
      const display = styleFor(current).display;
      if (STRUCTURAL.has(current.tagName) || !["inline", "inline-block", "inline-flex", "inline-grid", "contents"].includes(display)) return current;
      current = current.parentElement;
    }
    // Direct body text stays one text run: never concatenate the whole body.
    return node;
  };
  const promote = (root: Root): Root => {
    if (root.nodeType !== Node.ELEMENT_NODE) return root;
    const element = root as Element, parent = element.parentElement;
    if (!parent || NO_PROMOTION.has(parent.tagName) || hidden(parent) || MONEY.test(element.textContent ?? "")) return root;
    const display = styleFor(parent).display;
    if (!HEADING.test(element.tagName) && !["flex", "grid", "inline-flex", "inline-grid"].includes(display)) return root;
    // A single heading plus an adjacent price is a useful card/row. Multiple
    // headings/items, large sections and unrelated footer text cannot be joined.
    if (parent.children.length > 4 || parent.querySelectorAll("h1,h2,h3,h4,h5,h6").length > 1
      || parent.querySelector("li,tr,article,section,header,footer,nav,form")
      || normalizeBusinessText(parent.textContent ?? "").length > MAX_BLOCK_LENGTH) return root;
    const box = parent.getBoundingClientRect();
    if (box.height <= 0 || box.height > 180 || box.width > win.innerWidth + 1) return root;
    return parent;
  };

  const texts: Text[] = [], roots = new Set<Root>();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let visited = 0, current: Node | null;
  while ((current = walker.nextNode())) {
    cancelled(signal);
    if (++visited > MAX_TEXT_NODES) throw new ContentUnavailable("text_limit");
    const node = current as Text;
    if (!node.nodeValue || !node.parentElement || hidden(node.parentElement)) continue;
    texts.push(node);
    if (!node.nodeValue.trim()) continue;
    roots.add(promote(blockFor(node)));
    if (roots.size > MAX_BLOCKS) throw new ContentUnavailable("text_limit");
  }
  const piecesFor = (root: Root): Piece[] => texts.filter(node => root === node || root.contains(node)).map(node => {
    const range = doc.createRange(); range.selectNodeContents(node);
    return {node, text: node.nodeValue ?? "", range};
  });
  const joinPieces = (pieces: Piece[]): string => {
    let result = "", previous: DOMRect | undefined;
    for (const piece of pieces) {
      const rects = [...piece.range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
      const first = rects[0];
      // Preserve split inline words, while allowing a real row gap or line
      // break to separate a label from its adjacent price.
      if (first && previous && result && !/\s$/u.test(result) && !/^\s/u.test(piece.text)
        && (first.left - previous.right > 1 || first.top >= previous.bottom - 1)) result += " ";
      result += piece.text;
      if (rects.length) previous = rects[rects.length - 1];
    }
    return result.replace(/\s+/gu, " ").trim();
  };
  const localBlocks = [...roots].map(root => ({root, pieces: piecesFor(root)}))
    .map(value => ({...value, text: joinPieces(value.pieces)}));
  let candidates = localBlocks.filter(value => containsBusinessText(value.text, needle));
  if (!candidates.length && step.expected.kind === "visible_copy") {
    // A mismatch should show useful actual local copy, when a narrow shared
    // phone prefix or wording identifies context. This does not relax matching.
    const normalized = normalizeBusinessText(needle), digits = normalized.replace(/\D/gu, "");
    const words = [...normalized.matchAll(/[\p{L}][\p{L}\p{N}]{2,}/gu)].map(match => match[0]).filter(word => !STOPWORDS.has(word));
    const days = normalized.match(WEEKDAYS) ?? [];
    candidates = localBlocks.filter(value => {
      const actual = normalizeBusinessText(value.text);
      return digits.length >= 7 && actual.replace(/\D/gu, "").includes(digits.slice(0, 6))
        || words.filter(word => containsBusinessText(actual, word)).length >= Math.max(1, Math.min(2, words.length)) && words.length > 0
        || days.some(day => containsBusinessText(actual, day));
    });
  }
  // Only promoted local cards may absorb nested text blocks. Distinct matching
  // rows remain distinct, including duplicate/conflicting menu entries.
  const selected = candidates.filter(candidate => !candidates.some(other => other !== candidate
    && other.root.nodeType === Node.ELEMENT_NODE && other.root.contains(candidate.root)));
  if (selected.length > MAX_READING_BLOCKS) throw new ContentUnavailable("text_limit");
  const output: string[] = [];
  for (const candidate of selected) {
    cancelled(signal);
    if (candidate.text.length > MAX_BLOCK_LENGTH) throw new ContentUnavailable("text_limit");
    const element = candidate.root.nodeType === Node.ELEMENT_NODE ? candidate.root as Element : candidate.root.parentElement!;
    const before = element.getBoundingClientRect();
    win.scrollTo({top: Math.max(0, win.scrollY + before.top - 100), left: 0, behavior: "instant"});
    // Each full local block must fit on screen; never certify only the visible
    // first half of a clipped row or a value behind another element.
    for (const piece of candidate.pieces) {
      if (!piece.text.trim()) continue;
      const parent = piece.node.parentElement!;
      if (hidden(parent)) throw new ContentUnavailable("ambiguous_content");
      for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
        const style = styleFor(ancestor);
        const mask = style.getPropertyValue("mask-image") || style.getPropertyValue("-webkit-mask-image");
        if (style.clipPath !== "none" || style.clip !== "auto" || style.filter !== "none" || style.transform !== "none"
          || mask && mask !== "none" || style.animationName !== "none" || style.mixBlendMode !== "normal"
          || style.contentVisibility === "hidden" || style.textShadow !== "none") throw new ContentUnavailable("ambiguous_content");
        // Generated copy can contradict or visually replace DOM text. It is
        // outside this observer's evidence model, so it cannot silently pass.
        for (const pseudo of ["::before", "::after"]) {
          const generated = win.getComputedStyle(ancestor, pseudo);
          if (generated.display !== "none" && !["none", "normal", '""', "''", ""].includes(generated.content)) throw new ContentUnavailable("ambiguous_content");
        }
      }
      const foreground = styleFor(parent).color;
      const fill = styleFor(parent).getPropertyValue("-webkit-text-fill-color");
      if (fill === "transparent" || /rgba\([^)]*,\s*0(?:\.0+)?\)$/u.test(fill)) throw new ContentUnavailable("ambiguous_content");
      for (let background: Element | null = parent; background; background = background.parentElement) {
        const style = styleFor(background), color = style.backgroundColor;
        if (style.backgroundImage !== "none") break; // Pixel contrast over imagery is outside this DOM observation.
        if (color !== "transparent" && !/rgba\([^)]*,\s*0(?:\.0+)?\)$/u.test(color)) {
          if (color === foreground || color === fill) throw new ContentUnavailable("ambiguous_content");
          break;
        }
      }
      const range = doc.createRange();
      const leading = piece.text.length - piece.text.trimStart().length, trailing = piece.text.trimEnd().length;
      range.setStart(piece.node, leading); range.setEnd(piece.node, trailing);
      const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
      if (!rects.length) throw new ContentUnavailable("ambiguous_content");
      for (const rect of rects) {
        if (![rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)
          || rect.left < 0 || rect.right > win.innerWidth + 1 || rect.top < 0 || rect.bottom > win.innerHeight + 1) throw new ContentUnavailable("ambiguous_content");
        for (let ancestor: Element | null = parent; ancestor && ancestor !== doc.body; ancestor = ancestor.parentElement) {
          const style = styleFor(ancestor), box = ancestor.getBoundingClientRect();
          const clipsX = style.overflowX !== "visible";
          const clipsY = style.overflowY !== "visible";
          if (clipsX && (rect.left < box.left + ancestor.clientLeft - 1 || rect.right > box.left + ancestor.clientLeft + ancestor.clientWidth + 1)
            || clipsY && (rect.top < box.top + ancestor.clientTop - 1 || rect.bottom > box.top + ancestor.clientTop + ancestor.clientHeight + 1)) throw new ContentUnavailable("ambiguous_content");
        }
        for (const fraction of [.25, .5, .75]) {
          const target = doc.elementFromPoint(rect.left + rect.width * fraction, rect.top + rect.height * .5);
          let paintedParent: Element | null = parent;
          while (paintedParent && styleFor(paintedParent).display === "contents") paintedParent = paintedParent.parentElement;
          if (!target || target !== paintedParent) throw new ContentUnavailable("ambiguous_content");
        }
      }
    }
    const afterText = joinPieces(candidate.pieces);
    if (afterText !== candidate.text) throw new ContentUnavailable("ambiguous_content");
    output.push(candidate.text);
  }
  return output;
}

async function observeBusinessCheck(quote: ProofQuote, step: ProofBusinessCheckStep, signal: AbortSignal): Promise<ProofBusinessCheckReading> {
  return snapshot(quote, step.file, step.viewportWidth, signal, async ({frame, doc, assertCurrent, verifyStyles}) => {
    const styles = await verifyStyles();
    if (styles.expected !== styles.loaded) throw new Unavailable("load_failed");
    const blocks = visibleBlocks(doc, frame.contentWindow!, step, signal);
    assertCurrent();
    return {stepId: step.stepId, status: "observed", blocks};
  });
}

/** No arbitrary navigation, scripts, forms, acceptance or payment. Aborting
 * discards the entire run; all temporary frames/listeners are removed. */
export async function runBusinessChecks(quote: ProofQuote, signal: AbortSignal, onProgress: (value: {done: number; total: number}) => void): Promise<BusinessCheckInput> {
  const plan = getBusinessCheckPlan(quote), controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, {once: true}); if (signal.aborted) cancel();
  const overall = setTimeout(() => controller.abort(new Error("Content checks exceeded 60 seconds. No partial report was saved. / 内容检查超过 60 秒，本次部分结果未保存。")), 60_000);
  const readings: ProofBusinessCheckReading[] = [];
  try {
    onProgress({done: 0, total: plan.length});
    for (const step of plan) {
      cancelled(controller.signal);
      const local = new AbortController(), abort = () => local.abort(controller.signal.reason);
      controller.signal.addEventListener("abort", abort, {once: true});
      const timeout = setTimeout(() => local.abort(new Unavailable("timeout")), 7000);
      try {readings.push(await bounded(observeBusinessCheck(quote, step, local.signal), local.signal, 7000));}
      catch (error) {
        cancelled(controller.signal);
        readings.push({stepId: step.stepId, status: "unavailable", reason: error instanceof Unavailable || error instanceof ContentUnavailable ? error.reason
          : local.signal.reason instanceof Unavailable ? local.signal.reason.reason : error instanceof DOMException && error.name === "SecurityError" ? "access_denied" : "load_failed"});
      } finally {clearTimeout(timeout); controller.signal.removeEventListener("abort", abort); local.abort();}
      onProgress({done: readings.length, total: plan.length});
    }
    cancelled(controller.signal);
    return {deliveryId: quote.proof.delivery!.id, previousReportId: quote.proof.delivery!.businessChecks?.id ?? null, readings};
  } finally {clearTimeout(overall); signal.removeEventListener("abort", cancel); controller.abort();}
}
