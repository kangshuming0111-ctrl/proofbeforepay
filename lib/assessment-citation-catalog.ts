import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {AssessmentResponseError} from "./assessment-response.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";
import {assertStaticPath, staticFileKind, STATIC_RESOURCE_LIMITS} from "./static-resources.ts";

export type AssessmentCitationCatalogEntry = ProofAssessmentCitation & {id: string};
export type AssessmentCitationCatalog = {
  version: "source-citation-catalog-v1";
  catalogId: string;
  entries: AssessmentCitationCatalogEntry[];
};
export type Catalog = AssessmentCitationCatalog;
export const ASSESSMENT_CITATION_CATALOG_LIMITS = {
  windowUnits: 400, excerptUnits: 500, entries: 1_536, serializedBytes: 384 * 1024,
} as const;
const VERSION = "source-citation-catalog-v1" as const;
// Additional raw-address candidates keep common dish rows, field wrappers and
// individual controls intact across fixed-window boundaries. A candidate does
// not assert that its contents belong together semantically or were rendered.
const SEMANTIC_ELEMENTS = new Set(["h1", "h2", "h3", "title", "label", "p", "li", "tr", "td", "th", "div", "span", "input"]);
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const encoder = new TextEncoder();
function invalid(): never {throw new DomainError("The source citation catalog input must contain bounded validated source and JSON binding data.", 409);}
function tooLarge(): never {
  throw new DomainError("The complete source citation catalog exceeds the bounded AI request size. No source was truncated or sent.", 413, "ASSESSMENT_CONTEXT_LIMIT");
}
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Snapshot plain JSON before asynchronous hashing. Object property insertion
 * order does not change the binding; accessors, custom serialization and cycles
 * are not interpreted. No binding value is included in a caller-facing error. */
function bindingJson(value: unknown): string {
  const ancestors = new Set<object>(); let visits = 0;
  const encode = (value: unknown, depth: number): string => {
    if (++visits > 100_000 || depth > 64) return invalid();
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : invalid();
    if (!value || typeof value !== "object" || ancestors.has(value)) return invalid();
    ancestors.add(value);
    let result: string;
    if (Array.isArray(value)) {
      if (value.length > 100_000) return invalid();
      if (Reflect.ownKeys(value).length !== value.length + 1) return invalid();
      result = `[${Array.from({length: value.length}, (_, i) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        return descriptor && "value" in descriptor ? encode(descriptor.value, depth + 1) : invalid();
      }).join(",")}]`;
    } else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
      const keys = Reflect.ownKeys(value);
      if (keys.some(key => typeof key !== "string")) return invalid();
      result = `{${(keys as string[]).sort(order).map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        return "value" in descriptor ? `${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}` : invalid();
      }).join(",")}}`;
    }
    ancestors.delete(value);
    return result;
  };
  return encode(value, 0);
}

function sourceSnapshot(files: Record<string, string>): [string, string][] {
  if (!files || typeof files !== "object" || Array.isArray(files) || ![Object.prototype, null].includes(Object.getPrototypeOf(files))) return invalid();
  const keys = Reflect.ownKeys(files);
  if (!keys.length || keys.length > STATIC_RESOURCE_LIMITS.maxFiles) return invalid();
  const seen = new Set<string>(); let total = 0;
  return keys.map(key => {
    assertStaticPath(key);
    const file = key as string, descriptor = Object.getOwnPropertyDescriptor(files, file)!;
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string" || !["html", "css"].includes(staticFileKind(file) ?? "")) return invalid();
    const source = descriptor.value as string, bytes = encoder.encode(source).byteLength;
    if (!source.trim() || CONTROL.test(source) || [...source].some(character => {const point = character.codePointAt(0)!; return point >= 0xd800 && point <= 0xdfff;})
      || bytes > STATIC_RESOURCE_LIMITS.textFileBytes || seen.has(file.toLowerCase())) return invalid();
    seen.add(file.toLowerCase()); total += bytes;
    if (total > STATIC_RESOURCE_LIMITS.textTotalBytes) return invalid();
    return [file, source] as [string, string];
  }).sort(([a], [b]) => order(a, b));
}

/** This is a raw-source address catalog, not a visibility or semantic verifier.
 * Complete fixed windows preserve all supplied text, including comments, script
 * text, later contradictions and malformed markup. Extra parse5 spans are exact
 * original slices, never HTML serialization or decoded/normalized text. If the
 * complete set exceeds either budget, no partial catalog is returned. */
export async function createAssessmentCitationCatalog(files: Record<string, string>, binding: unknown): Promise<AssessmentCitationCatalog> {
  const snapshot = sourceSnapshot(files), bound = bindingJson(binding);
  const spans: Omit<AssessmentCitationCatalogEntry, "id">[] = [], seen = new Set<string>();
  const add = (file: string, source: string, start: number, end: number) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > source.length
      || end - start > ASSESSMENT_CITATION_CATALOG_LIMITS.excerptUnits) return;
    const key = `${file}\u0000${start}\u0000${end}`;
    if (seen.has(key)) return;
    seen.add(key); spans.push({file, start, end, excerpt: source.slice(start, end)});
    if (spans.length > ASSESSMENT_CITATION_CATALOG_LIMITS.entries) tooLarge();
  };
  for (const [file, source] of snapshot) {
    for (let start = 0; start < source.length;) {
      let end = Math.min(start + ASSESSMENT_CITATION_CATALOG_LIMITS.windowUnits, source.length);
      // A UTF-16 window never separates a valid surrogate pair.
      if (end < source.length && source.charCodeAt(end - 1) >= 0xd800 && source.charCodeAt(end - 1) <= 0xdbff
        && source.charCodeAt(end) >= 0xdc00 && source.charCodeAt(end) <= 0xdfff) end--;
      add(file, source, start, end); start = end;
    }
    if (staticFileKind(file) !== "html") continue;
    const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true});
    const pending: DefaultTreeAdapterTypes.Node[] = [document];
    while (pending.length) {
      const node = pending.pop()!;
      if ("tagName" in node && node.namespaceURI === "http://www.w3.org/1999/xhtml" && SEMANTIC_ELEMENTS.has(node.tagName)) {
        const at = node.sourceCodeLocation;
        if (at) add(file, source, at.startOffset, at.endOffset);
      }
      if ("childNodes" in node) for (let i = node.childNodes.length - 1; i >= 0; i--) pending.push(node.childNodes[i]);
    }
  }
  spans.sort((a, b) => order(a.file, b.file) || a.start - b.start || a.end - b.end);
  const entries = spans.map((span, index) => ({id: `s${index + 1}`, ...span}));
  const budgetShape = {version: VERSION, catalogId: "0".repeat(64), entries};
  if (encoder.encode(JSON.stringify(budgetShape)).byteLength > ASSESSMENT_CITATION_CATALOG_LIMITS.serializedBytes) tooLarge();
  const payload = `[${JSON.stringify(VERSION)},${bound},${JSON.stringify(snapshot)},${JSON.stringify(entries)}]`;
  const catalogId = [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(payload)))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  for (const entry of entries) Object.freeze(entry);
  Object.freeze(entries);
  return Object.freeze({version: VERSION, catalogId, entries});
}

/** A selector is data only. Preserve the server-selected occurrence directly;
 * never use indexOf, repair an unknown selector, or accept a model quotation.
 * The caller checks the top-level catalog binding and expanded report budget. */
export function resolveCatalogCitations(value: unknown, catalog: AssessmentCitationCatalog, maximum: number): ProofAssessmentCitation[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > ASSESSMENT_ITEM_CITATION_LIMIT || !Array.isArray(value) || value.length > maximum)
    throw new AssessmentResponseError("structure");
  const entries = new Map(catalog.entries.map(entry => [entry.id, entry]));
  if (entries.size !== catalog.entries.length) throw new AssessmentResponseError("citation");
  const selected = new Set<string>();
  return value.map(id => {
    if (typeof id !== "string" || selected.has(id)) throw new AssessmentResponseError("citation");
    const entry = entries.get(id);
    if (!entry || !entry.excerpt.trim()) throw new AssessmentResponseError("citation");
    selected.add(id);
    return {file: entry.file, start: entry.start, end: entry.end, excerpt: entry.excerpt};
  });
}
