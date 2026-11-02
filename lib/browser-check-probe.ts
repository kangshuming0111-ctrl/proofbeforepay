import type { ProofBrowserCheckReading, ProofBrowserCheckStep, ProofQuote } from "./contracts.ts";
import { BROWSER_RESOURCE_LIMIT, getBrowserCheckPlan } from "./browser-check-report.ts";
import { deliveryFileUrl } from "./delivery-upload.ts";
import { staticFileKind } from "./static-resources.ts";
import { Unavailable, cancelled, bounded, snapshot, verifyTextFile, visible, moveIntoView, savedBrowserFile } from "./saved-page-observation.ts";
export { savedBrowserFile } from "./saved-page-observation.ts";

export type BrowserCheckInput = {deliveryId: string; previousReportId: string | null; readings: ProofBrowserCheckReading[]};
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
