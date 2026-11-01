import type { ProofBrowserCheckReading, ProofBrowserCheckReason, ProofBrowserCheckStep, ProofQuote } from "./contracts.ts";
import { BROWSER_RESOURCE_LIMIT, getBrowserCheckPlan } from "./browser-check-report.ts";
import { deliveryFileUrl } from "./delivery-upload.ts";
import { findSavedLayoutStylesheet } from "./layout-probe.ts";
import { LAYOUT_HEIGHT } from "./layout-report.ts";
import { staticFileKind } from "./static-resources.ts";

export type BrowserCheckInput = {deliveryId: string; previousReportId: string | null; readings: ProofBrowserCheckReading[]};
class Unavailable extends Error {
  readonly reason: ProofBrowserCheckReason;
  constructor(reason: ProofBrowserCheckReason) {super(reason); this.reason = reason;}
}
function cancelled(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new DOMException("Browser check cancelled", "AbortError");
}
function bounded<T>(operation: PromiseLike<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
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
type Snapshot = {frame: HTMLIFrameElement; doc: Document; url: URL; assertCurrent: () => void; verifyStyles: () => Promise<{expected: number; loaded: number}>};
async function verifyTextFile(quote: ProofQuote, url: URL, kind: "html" | "css", signal: AbortSignal) {
  const delivery = quote.proof.delivery!, file = savedBrowserFile(quote, url, window.location.origin);
  if (!file || staticFileKind(file) !== kind) throw new Unavailable("unsupported_target");
  const response = await fetch(url, {credentials: "same-origin", redirect: "error", cache: "no-store", signal});
  if (!response.ok) throw new Unavailable(response.status === 401 || response.status === 403 ? "access_denied" : "load_failed");
  if (!response.headers.get("Content-Type")?.startsWith(kind === "html" ? "text/html" : "text/css")
    || response.headers.get("X-ProofBeforePay-Delivery") !== delivery.id || !await exactText(response, delivery.files![file])) throw new Unavailable("snapshot_mismatch");
  return delivery.files![file];
}
async function snapshot<T>(quote: ProofQuote, file: string, width: number, signal: AbortSignal, inspect: (value: Snapshot) => Promise<T>): Promise<T> {
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
function visible(element: Element, win: Window): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= win.innerHeight || rect.left >= win.innerWidth) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = win.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0 || current.hasAttribute("inert")) return false;
  }
  return true;
}
function moveIntoView(element: Element, win: Window) {
  const rect = element.getBoundingClientRect();
  win.scrollTo({top: Math.max(0, win.scrollY + rect.top - 100), left: 0, behavior: "instant"});
}
function hitTarget(anchor: HTMLAnchorElement, doc: Document, win: Window) {
  const r = anchor.getBoundingClientRect(), left = Math.max(0, r.left), right = Math.min(win.innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(win.innerHeight, r.bottom);
  if (right <= left || bottom <= top) return false;
  for (const [fx, fy] of [[.5,.5],[.25,.25],[.75,.75]]) {
    const target = doc.elementFromPoint(left + (right-left)*fx, top + (bottom-top)*fy);
    if (target && (target === anchor || anchor.contains(target))) return true;
  }
  return false;
}
async function observePage(quote: ProofQuote, step: ProofBrowserCheckStep, signal: AbortSignal): Promise<ProofBrowserCheckReading> {
  return snapshot(quote, step.file, step.viewportWidth, signal, async ({doc, url, assertCurrent, verifyStyles}) => {
    const styles = await verifyStyles(), images = [...doc.images];
    if (images.length > BROWSER_RESOURCE_LIMIT) throw new Unavailable("resource_limit");
    // A separate resource-loading observation, not a claim that a user scrolled to every image.
    for (const image of images) image.loading = "eager";
    const loaded = await bounded(Promise.all(images.map(async image => {
      const imageUrl = new URL(image.currentSrc || image.src, url);
      const name = savedBrowserFile(quote, imageUrl, url.origin);
      if (!name || !["png", "jpeg", "webp"].includes(staticFileKind(name) ?? "")) return false;
      try {await image.decode(); return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;} catch {return false;}
    })), signal, 2500);
    assertCurrent();
    return {stepId: step.stepId, status: "observed", kind: "page", stylesExpected: styles.expected, stylesLoaded: styles.loaded, imagesExpected: images.length, imagesLoaded: loaded.filter(Boolean).length};
  });
}
async function observeLink(quote: ProofQuote, step: ProofBrowserCheckStep, signal: AbortSignal): Promise<ProofBrowserCheckReading> {
  return snapshot(quote, step.file, step.viewportWidth, signal, async ({frame, doc, url, assertCurrent, verifyStyles}) => {
    const styles = await verifyStyles();
    if (styles.loaded !== styles.expected) throw new Unavailable("load_failed");
    const normalized = (value: string) => value.replace(/\s+/gu, " ").trim();
    const anchors = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(anchor => normalized(anchor.textContent ?? "") === normalized(step.label!));
    if (anchors.length !== 1) throw new Unavailable("ambiguous_link");
    const anchor = anchors[0], [targetFile, fragment] = step.target!.split("#");
    const targetUrl = new URL(deliveryFileUrl(quote.id, quote.proof.delivery!.id, targetFile), url.origin);
    if (fragment) targetUrl.hash = fragment;
    // Use the browser-resolved URL, including any <base href>. Never activate a
    // raw relative href whose actual destination leaves the saved snapshot.
    const actualUrl = new URL(anchor.href);
    const targetName = anchor.getAttribute("target") || doc.querySelector("base[target]")?.getAttribute("target") || "_self";
    if (targetName.toLowerCase() !== "_self" || anchor.hasAttribute("download") || actualUrl.href !== targetUrl.href || !savedBrowserFile(quote, actualUrl, url.origin)) throw new Unavailable("unsupported_target");
    if (!Object.hasOwn(quote.proof.delivery!.files!, targetFile)) throw new Unavailable("missing_file");
    const targetSource = await verifyTextFile(quote, targetUrl, "html", signal);
    const targetDocument = new DOMParser().parseFromString(targetSource.replace(/^\uFEFF/u, ""), "text/html");
    if ([...targetDocument.querySelectorAll('meta[http-equiv]')].some(meta => meta.getAttribute("http-equiv")?.toLowerCase() === "refresh")) throw new Unavailable("unsupported_target");
    const win = frame.contentWindow!;
    moveIntoView(anchor, win);
    const sourceVisible = visible(anchor, win), sourceHitTarget = sourceVisible && hitTarget(anchor, doc, win);
    assertCurrent();
    if (!sourceVisible || !sourceHitTarget) return {stepId: step.stepId, status: "observed", kind: "link", sourceVisible, sourceHitTarget, activated: false, destinationMatched: false, targetVisible: false};
    anchor.click();
    await bounded(new Promise<void>((resolve, reject) => {
      const tick = () => {
        try {
          cancelled(signal);
          const current = frame.contentDocument;
          if (frame.contentWindow?.location.href === targetUrl.href && current?.readyState === "complete"
            && current.title === targetDocument.title && current.body?.textContent === targetDocument.body.textContent) {resolve(); return;}
          if (frame.contentWindow?.location.href !== url.href && frame.contentWindow?.location.href !== targetUrl.href) {reject(new Unavailable("navigation_changed")); return;}
          timer = setTimeout(tick, 40);
        } catch (error) {reject(error);}
      };
      let timer: ReturnType<typeof setTimeout>;
      const stop = () => {clearTimeout(timer); reject(signal.reason);};
      signal.addEventListener("abort", stop, {once: true});
      // The bounded outer operation ends this loop by aborting the per-step signal on completion.
      tick();
    }), signal, 3500);
    const targetDoc = frame.contentDocument;
    if (!targetDoc?.body || targetDoc.title !== targetDocument.title || targetDoc.body.textContent !== targetDocument.body.textContent) throw new Unavailable("snapshot_mismatch");
    await bounded(targetDoc.fonts.ready, signal, 1500);
    const matches = fragment ? [...targetDoc.querySelectorAll("[id]")].filter(element => element.id === fragment) : [targetDoc.body];
    if (matches.length !== 1) throw new Unavailable("ambiguous_link");
    moveIntoView(matches[0], frame.contentWindow!);
    return {stepId: step.stepId, status: "observed", kind: "link", sourceVisible, sourceHitTarget, activated: true, destinationMatched: true, targetVisible: visible(matches[0], frame.contentWindow!)};
  });
}
/** Explicit, bounded browser observations. Scripts/forms stay disabled; no financial or acceptance action. */
export async function runBrowserChecks(quote: ProofQuote, signal: AbortSignal, onProgress: (value: {done: number; total: number}) => void): Promise<BrowserCheckInput> {
  const plan = getBrowserCheckPlan(quote), controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, {once: true}); if (signal.aborted) cancel();
  const overall = setTimeout(() => controller.abort(new Error("Browser checks exceeded 60 seconds. No partial report was saved. / 浏览器检查超过 60 秒，本次部分结果未保存。")), 60_000);
  const readings: ProofBrowserCheckReading[] = [];
  onProgress({done: 0, total: plan.length});
  try {
    for (const step of plan) {
      cancelled(controller.signal);
      const local = new AbortController(), abort = () => local.abort(controller.signal.reason);
      controller.signal.addEventListener("abort", abort, {once: true});
      const timeout = setTimeout(() => local.abort(new Unavailable("timeout")), 7000);
      try {readings.push(await (step.kind === "page" ? observePage : observeLink)(quote, step, local.signal));}
      catch (error) {
        cancelled(controller.signal);
        readings.push({stepId: step.stepId, status: "unavailable", reason: error instanceof Unavailable ? error.reason : local.signal.reason instanceof Unavailable ? local.signal.reason.reason : error instanceof DOMException && error.name === "SecurityError" ? "access_denied" : "load_failed"});
      } finally {clearTimeout(timeout); controller.signal.removeEventListener("abort", abort); local.abort();}
      onProgress({done: readings.length, total: plan.length});
    }
    cancelled(controller.signal);
    return {deliveryId: quote.proof.delivery!.id, previousReportId: quote.proof.delivery!.browserChecks?.id ?? null, readings};
  } finally {clearTimeout(overall); signal.removeEventListener("abort", cancel); controller.abort();}
}
