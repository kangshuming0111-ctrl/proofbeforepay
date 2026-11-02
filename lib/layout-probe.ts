import { deliveryFileUrl } from "./delivery-upload.ts";
import type { ProofLayoutReading, ProofLayoutUnavailableReason, ProofLayoutWidth, ProofQuote } from "./contracts.ts";
import { getLayoutFiles, LAYOUT_HEIGHT, LAYOUT_WIDTHS } from "./layout-report.ts";

type Observation = Omit<Extract<ProofLayoutReading, {status: "measured"}>, "overflowPx" | "outcome"> | Extract<ProofLayoutReading, {status: "unavailable"}>;
export type LayoutProbeInput = { deliveryId: string; previousReportId: string | null; readings: Observation[] };

/** Match a resolved browser stylesheet URL against the exact version package,
 * never against the current HTML directory or an encoded whole relative path. */
export function findSavedLayoutStylesheet(files: Record<string, string>, quoteId: string, deliveryId: string, stylesheetUrl: URL, origin: string): string | undefined {
  if (stylesheetUrl.origin !== origin) return undefined;
  return Object.keys(files).find(name => name.toLowerCase().endsWith(".css")
    && new URL(deliveryFileUrl(quoteId, deliveryId, name), origin).pathname === stylesheetUrl.pathname);
}

class Unavailable extends Error {
  readonly reason: ProofLayoutUnavailableReason;
  constructor(reason: ProofLayoutUnavailableReason) { super(reason); this.reason = reason; }
}

async function exactSource(response: Response, source: string) {
  // Response.text() discards a UTF-8 BOM, while uploaded snapshots preserve it.
  const bytes = await response.arrayBuffer();
  try { return new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes) === source; }
  catch { return false; }
}

/** Identify the failed guard without retaining response content, headers or
 * identifiers. A successful header check still requires one exact byte read. */
export async function assertLayoutSnapshotResponse(response: Response, source: string, deliveryId: string, kind: "html" | "css"): Promise<void> {
  if (!response.headers.get("Content-Type")?.startsWith(kind === "html" ? "text/html" : "text/css")) throw new Unavailable("response_type_mismatch");
  if (response.headers.get("X-ProofBeforePay-Delivery") !== deliveryId) throw new Unavailable("response_identity_mismatch");
  if (!await exactSource(response, source)) throw new Unavailable("source_mismatch");
}

type RenderedSnapshot = {contentType: string; title: string; body: {textContent: string | null} | null};
/** Browser rendering must still match the saved title and body text. This does
 * not infer whether a difference came from the site, browser or an extension. */
export function assertRenderedLayoutSnapshot(actual: RenderedSnapshot, expected: RenderedSnapshot): void {
  if (actual.contentType !== "text/html" || !actual.body || !expected.body || actual.title !== expected.title
    || actual.body.textContent !== expected.body.textContent) throw new Unavailable("rendered_snapshot_mismatch");
}

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new DOMException("Measurement cancelled", "AbortError");
}

/** Waits are bounded and cancellation always removes their listeners. */
function bounded<T>(operation: PromiseLike<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (callback: () => void) => { clearTimeout(timer); signal.removeEventListener("abort", cancel); callback(); };
    const cancel = () => finish(() => reject(signal.reason ?? new DOMException("Measurement cancelled", "AbortError")));
    const timer = setTimeout(() => finish(() => reject(new Unavailable("timeout"))), milliseconds);
    signal.addEventListener("abort", cancel, {once: true});
    Promise.resolve(operation).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    if (signal.aborted) cancel();
  });
}

async function measure(quote: ProofQuote, file: string, viewportWidth: ProofLayoutWidth, signal: AbortSignal): Promise<Observation> {
  const delivery = quote.proof.delivery!;
  const source = delivery.files![file];
  const url = new URL(deliveryFileUrl(quote.id,delivery.id,file), window.location.origin);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "Temporary delivery layout measurement";
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${viewportWidth}px;height:${LAYOUT_HEIGHT}px;visibility:hidden;pointer-events:none;border:0;`;
  const local = new AbortController();
  const cancel = () => local.abort(signal.reason);
  signal.addEventListener("abort", cancel, {once: true});
  if (signal.aborted) cancel();
  const limit = setTimeout(() => local.abort(new Unavailable("timeout")), 5000);
  try {
    aborted(local.signal);
    // Do not mistake an authentication/error response or stale snapshot for the delivery.
    const response = await fetch(url, {credentials: "same-origin", redirect: "error", cache: "no-store", signal: local.signal});
    if (!response.ok) throw new Unavailable(response.status === 401 || response.status === 403 ? "access_denied" : "load_failed");
    await assertLayoutSnapshotResponse(response, source, delivery.id, "html");
    const loaded = new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Unavailable("load_failed"));
    });
    frame.src = url.href;
    document.body.appendChild(frame);
    await bounded(loaded, local.signal, 4000);
    const doc = frame.contentDocument;
    if (!doc) throw new Unavailable("access_denied");
    const expected = new DOMParser().parseFromString(source.replace(/^\uFEFF/u, ""), "text/html");
    const assertCurrent = () => {
      aborted(local.signal);
      if (frame.contentDocument !== doc || frame.contentWindow?.location.href !== url.href) throw new Unavailable("navigation_changed");
      assertRenderedLayoutSnapshot(doc, expected);
    };
    assertCurrent();
    await bounded(doc.fonts.ready, local.signal, 2000);
    assertCurrent();
    // A missing/blocked linked stylesheet must not produce a deceptively clean width reading.
    const verifiedStyles = new Set<string>();
    const verifySheet = async (sheet: CSSStyleSheet) => {
      assertCurrent();
      if (sheet.href) {
        const styleUrl = new URL(sheet.href, url);
        if (!verifiedStyles.has(styleUrl.href)) {
          verifiedStyles.add(styleUrl.href);
          const filename = findSavedLayoutStylesheet(delivery.files!, quote.id, delivery.id, styleUrl, url.origin);
          if (!filename) throw new Unavailable("load_failed");
          const css = await fetch(styleUrl, {credentials: "same-origin", redirect: "error", cache: "no-store", signal: local.signal});
          if (!css.ok) throw new Unavailable("load_failed");
          await assertLayoutSnapshotResponse(css, delivery.files![filename], delivery.id, "css");
          assertCurrent();
        } else return;
      }
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { throw new Unavailable("access_denied"); }
      for (const rule of rules) if (rule.type === CSSRule.IMPORT_RULE) {
        const imported = rule as CSSImportRule;
        if (imported.media.mediaText && !frame.contentWindow!.matchMedia(imported.media.mediaText).matches) continue;
        if (!imported.styleSheet) throw new Unavailable("load_failed");
        await verifySheet(imported.styleSheet);
      }
    };
    for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')) {
      if (link.disabled || link.media && !frame.contentWindow!.matchMedia(link.media).matches) continue;
      if (!link.sheet) throw new Unavailable("load_failed");
      try { void link.sheet.cssRules; } catch { throw new Unavailable("access_denied"); }
    }
    for (const sheet of doc.styleSheets) {
      if (sheet.disabled || sheet.media.mediaText && !frame.contentWindow!.matchMedia(sheet.media.mediaText).matches) continue;
      await verifySheet(sheet);
    }
    assertCurrent();
    const dimensions = () => {
      assertCurrent();
      const clientWidth = doc.documentElement.clientWidth;
      const scrollWidth = Math.max(clientWidth, doc.documentElement.scrollWidth, doc.body.scrollWidth);
      assertCurrent();
      if (!Number.isSafeInteger(clientWidth) || clientWidth <= 0 || clientWidth > viewportWidth
        || !Number.isSafeInteger(scrollWidth) || scrollWidth > 1_000_000) throw new Unavailable("unstable_layout");
      return {clientWidth, scrollWidth};
    };
    let previous = dimensions();
    for (let attempt = 0; attempt < 5; attempt++) {
      await bounded(new Promise<void>(resolve => setTimeout(resolve, 100)), local.signal, 500);
      const current = dimensions();
      if (current.clientWidth === previous.clientWidth && current.scrollWidth === previous.scrollWidth) {
        return {file, viewportWidth, status: "measured", ...current};
      }
      previous = current;
    }
    throw new Unavailable("unstable_layout");
  } catch (error) {
    aborted(signal);
    const reason = local.signal.aborted && local.signal.reason instanceof Unavailable ? local.signal.reason.reason
      : error instanceof Unavailable ? error.reason : error instanceof DOMException && error.name === "SecurityError" ? "access_denied" : "load_failed";
    return {file, viewportWidth, status: "unavailable", reason};
  } finally {
    clearTimeout(limit);
    signal.removeEventListener("abort", cancel);
    frame.onload = null;
    frame.onerror = null;
    frame.remove();
    local.abort();
  }
}

/** Supplemental observations of the protected static preview, never an acceptance or payment decision. */
export async function runLayoutProbe(quote: ProofQuote, signal: AbortSignal, onProgress: (value: {done: number; total: number}) => void): Promise<LayoutProbeInput> {
  const files = getLayoutFiles(quote);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, {once: true});
  if (signal.aborted) cancel();
  const limit = setTimeout(() => controller.abort(new Error("布局检查超过 45 秒，本次结果未保存。请减少页面数量后重试。 / Layout check exceeded 45 seconds; this run was not saved. Try fewer pages.")), 45_000);
  const readings: Observation[] = [];
  const total = files.length * LAYOUT_WIDTHS.length;
  onProgress({done: 0, total});
  try {
    for (const {file, exists} of files) for (const viewportWidth of LAYOUT_WIDTHS) {
      aborted(controller.signal);
      readings.push(exists ? await measure(quote, file, viewportWidth, controller.signal) : {file, viewportWidth, status: "unavailable", reason: "missing_file"});
      onProgress({done: readings.length, total});
    }
    aborted(controller.signal);
    return {deliveryId: quote.proof.delivery!.id, previousReportId: quote.proof.delivery!.layoutReport?.id ?? null, readings};
  } finally {
    clearTimeout(limit);
    signal.removeEventListener("abort", cancel);
  }
}
