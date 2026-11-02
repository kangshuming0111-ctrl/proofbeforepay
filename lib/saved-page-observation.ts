import type { ProofBrowserCheckReason, ProofQuote } from "./contracts.ts";
import { BROWSER_RESOURCE_LIMIT } from "./browser-check-report.ts";
import { deliveryFileUrl } from "./delivery-upload.ts";
import { findSavedLayoutStylesheet } from "./layout-probe.ts";
import { LAYOUT_HEIGHT } from "./layout-report.ts";
import { staticFileKind } from "./static-resources.ts";

export class Unavailable extends Error {
  readonly reason: ProofBrowserCheckReason;
  constructor(reason: ProofBrowserCheckReason) {super(reason); this.reason = reason;}
}
export function cancelled(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new DOMException("Browser check cancelled", "AbortError");
}
export function bounded<T>(operation: PromiseLike<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (callback: () => void) => {clearTimeout(timer); signal.removeEventListener("abort", cancel); callback();};
    const cancel = () => finish(() => reject(signal.reason ?? new DOMException("Cancelled", "AbortError")));
    const timer = setTimeout(() => finish(() => reject(new Unavailable("timeout"))), milliseconds);
    signal.addEventListener("abort", cancel, {once: true});
    Promise.resolve(operation).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    if (signal.aborted) cancel();
  });
}
async function exactText(response: Response, source: string) {
  return new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(await response.arrayBuffer()) === source;
}
/** Only a canonical saved file URL can be fetched or activated by this probe. */
export function savedBrowserFile(quote: ProofQuote, url: URL, origin: string): string | undefined {
  if (url.origin !== origin || url.search || url.username || url.password) return undefined;
  return Object.keys(quote.proof.delivery?.files ?? {}).find(file => new URL(deliveryFileUrl(quote.id, quote.proof.delivery!.id, file), origin).pathname === url.pathname);
}
export type Snapshot = {frame: HTMLIFrameElement; doc: Document; url: URL; assertCurrent: () => void; verifyStyles: () => Promise<{expected: number; loaded: number}>};
export async function verifyTextFile(quote: ProofQuote, url: URL, kind: "html" | "css", signal: AbortSignal) {
  const delivery = quote.proof.delivery!, file = savedBrowserFile(quote, url, window.location.origin);
  if (!file || staticFileKind(file) !== kind) throw new Unavailable("unsupported_target");
  const response = await fetch(url, {credentials: "same-origin", redirect: "error", cache: "no-store", signal});
  if (!response.ok) throw new Unavailable(response.status === 401 || response.status === 403 ? "access_denied" : "load_failed");
  if (!response.headers.get("Content-Type")?.startsWith(kind === "html" ? "text/html" : "text/css")
    || response.headers.get("X-ProofBeforePay-Delivery") !== delivery.id || !await exactText(response, delivery.files![file])) throw new Unavailable("snapshot_mismatch");
  return delivery.files![file];
}
export async function snapshot<T>(quote: ProofQuote, file: string, width: number, signal: AbortSignal, inspect: (value: Snapshot) => Promise<T>): Promise<T> {
  if (!Object.hasOwn(quote.proof.delivery?.files ?? {}, file)) throw new Unavailable("missing_file");
  const url = new URL(deliveryFileUrl(quote.id, quote.proof.delivery!.id, file), window.location.origin);
  const source = await verifyTextFile(quote, url, "html", signal);
  const expected = new DOMParser().parseFromString(source.replace(/^\uFEFF/u, ""), "text/html");
  if ([...expected.querySelectorAll('meta[http-equiv]')].some(meta => meta.getAttribute("http-equiv")?.toLowerCase() === "refresh")) throw new Unavailable("unsupported_target");
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin"); frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1;
  frame.title = "Temporary isolated browser observation";
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${LAYOUT_HEIGHT}px;opacity:0;pointer-events:none;border:0;`;
  try {
    const loaded = new Promise<void>((resolve, reject) => {frame.onload = () => resolve(); frame.onerror = () => reject(new Unavailable("load_failed"));});
    frame.src = url.href; document.body.appendChild(frame);
    await bounded(loaded, signal, 4000);
    const doc = frame.contentDocument;
    if (!doc) throw new Unavailable("access_denied");
    const assertCurrent = () => {
      cancelled(signal);
      if (frame.contentDocument !== doc || frame.contentWindow?.location.href !== url.href) throw new Unavailable("navigation_changed");
      if (doc.contentType !== "text/html" || !doc.body || doc.title !== expected.title || doc.body.textContent !== expected.body.textContent) throw new Unavailable("snapshot_mismatch");
    };
    assertCurrent();
    await bounded(doc.fonts.ready, signal, 1500); assertCurrent();
    const verifyStyles = async () => {
      const verified = new Set<string>();
      const verifySheet = async (sheet: CSSStyleSheet): Promise<boolean> => {
        assertCurrent();
        if (sheet.href) {
          if (verified.has(sheet.href)) return true;
          verified.add(sheet.href);
          if (verified.size > BROWSER_RESOURCE_LIMIT) throw new Unavailable("resource_limit");
          const cssUrl = new URL(sheet.href, url);
          if (!findSavedLayoutStylesheet(quote.proof.delivery!.files!, quote.id, quote.proof.delivery!.id, cssUrl, url.origin)) return false;
          try {await verifyTextFile(quote, cssUrl, "css", signal);} catch (error) {if (error instanceof Unavailable && error.reason === "load_failed") return false; throw error;}
        }
        let rules: CSSRuleList;
        try {rules = sheet.cssRules;} catch {return false;}
        for (const rule of rules) if (rule.type === CSSRule.IMPORT_RULE) {
          const imported = rule as CSSImportRule;
          if (imported.media.mediaText && !frame.contentWindow!.matchMedia(imported.media.mediaText).matches) continue;
          if (!imported.styleSheet || !await verifySheet(imported.styleSheet)) return false;
        }
        return true;
      };
      const sheets: (CSSStyleSheet | null)[] = [];
      for (const element of doc.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel~="stylesheet"],style')) {
        if (element.tagName.toLowerCase() === "link" && (element as HTMLLinkElement).disabled) continue;
        if (element.media && !frame.contentWindow!.matchMedia(element.media).matches) continue;
        sheets.push(element.sheet as CSSStyleSheet | null);
      }
      if (sheets.length > BROWSER_RESOURCE_LIMIT) throw new Unavailable("resource_limit");
      let loaded = 0;
      for (const sheet of sheets) if (sheet && await verifySheet(sheet)) loaded++;
      assertCurrent(); return {expected: sheets.length, loaded};
    };
    return await inspect({frame, doc, url, assertCurrent, verifyStyles});
  } finally {frame.onload = null; frame.onerror = null; frame.remove();}
}
export function visible(element: Element, win: Window): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= win.innerHeight || rect.left >= win.innerWidth) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = win.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0 || current.hasAttribute("inert")) return false;
  }
  return true;
}
export function moveIntoView(element: Element, win: Window) {
  const rect = element.getBoundingClientRect();
  win.scrollTo({top: Math.max(0, win.scrollY + rect.top - 100), left: 0, behavior: "instant"});
}
