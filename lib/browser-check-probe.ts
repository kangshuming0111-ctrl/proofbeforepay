import type { ProofBrowserCheckMethod, ProofBrowserCheckReading, ProofBrowserCheckReport, ProofBrowserCheckStep, ProofQuote } from "./contracts.ts";
import { BROWSER_RESOURCE_LIMIT, browserCheckMethodFor, browserLinkLabel, getBrowserCheckPlan, matchesNoodleLinkLabel, NOODLE_BROWSER_METHOD } from "./browser-check-report.ts";
import { deliveryFileUrl } from "./delivery-upload.ts";
import { staticFileKind } from "./static-resources.ts";
import { Unavailable, cancelled, bounded, snapshot, verifyTextFile, visible, moveIntoView, savedBrowserFile } from "./saved-page-observation.ts";
export { savedBrowserFile } from "./saved-page-observation.ts";

export type BrowserCheckInput = {deliveryId: string; previousReportId: string | null; method: ProofBrowserCheckMethod; readings: ProofBrowserCheckReading[]};
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
async function observeLink(quote: ProofQuote, step: ProofBrowserCheckStep, signal: AbortSignal, noodle = false, archived = false): Promise<ProofBrowserCheckReading> {
  return snapshot(quote, step.file, step.viewportWidth, signal, async ({frame, doc, url, assertCurrent, verifyStyles}) => {
    const styles = await verifyStyles();
    if (styles.loaded !== styles.expected) throw new Unavailable("load_failed");
    const anchors = [...doc.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(anchor => noodle
      ? matchesNoodleLinkLabel(anchor.textContent ?? "", step.label)
      : browserLinkLabel(anchor.textContent ?? "") === browserLinkLabel(step.label!));
    if (anchors.length !== 1) throw new Unavailable("ambiguous_link");
    const anchor = anchors[0], [targetFile, fragment] = step.target!.split("#");
    const targetUrl = new URL(deliveryFileUrl(quote.id, quote.proof.delivery!.id, targetFile, archived), url.origin);
    if (fragment) targetUrl.hash = fragment;
    // Use the browser-resolved URL, including any <base href>. Never activate a
    // raw relative href whose actual destination leaves the saved snapshot.
    const actualUrl = new URL(anchor.href);
    const targetName = anchor.getAttribute("target") || doc.querySelector("base[target]")?.getAttribute("target") || "_self";
    if (!Object.hasOwn(quote.proof.delivery!.files!, targetFile) && actualUrl.href === targetUrl.href) throw new Unavailable("missing_file");
    const actualFile = savedBrowserFile(quote, actualUrl, url.origin, archived);
    if (targetName.toLowerCase() !== "_self" || anchor.hasAttribute("download") || !actualFile || staticFileKind(actualFile) !== "html"
      || (noodle ? actualUrl.href !== new URL(deliveryFileUrl(quote.id, quote.proof.delivery!.id, actualFile, archived), url.origin).href : actualUrl.href !== targetUrl.href)) throw new Unavailable("unsupported_target");
    const targetSource = await verifyTextFile(quote, actualUrl, "html", signal, archived);
    const targetDocument = new DOMParser().parseFromString(targetSource.replace(/^\uFEFF/u, ""), "text/html");
    if ([...targetDocument.querySelectorAll('meta[http-equiv]')].some(meta => meta.getAttribute("http-equiv")?.toLowerCase() === "refresh")) throw new Unavailable("unsupported_target");
    const win = frame.contentWindow!;
    moveIntoView(anchor, win);
    const clickedLabel = browserLinkLabel(anchor.innerText ?? "");
    const sourceVisible = visible(anchor, win) && (!noodle || matchesNoodleLinkLabel(clickedLabel, step.label));
    const sourceHitTarget = sourceVisible && hitTarget(anchor, doc, win);
    assertCurrent();
    if (!sourceVisible || !sourceHitTarget) return {stepId: step.stepId, status: "observed", kind: "link", sourceVisible, sourceHitTarget, activated: false, destinationMatched: false, targetVisible: false};
    anchor.click();
    const activation = {stepId: step.stepId, status: "observed" as const, kind: "link" as const, sourceVisible, sourceHitTarget, activated: true, clickedLabel};
    const withoutArrival = {...activation, destinationMatched: false, targetVisible: false};
    try {await bounded(new Promise<void>((resolve, reject) => {
      const tick = () => {
        try {
          cancelled(signal);
          const current = frame.contentDocument;
          if (frame.contentWindow?.location.href === actualUrl.href && current?.readyState === "complete" && (!noodle || current !== doc)
            && current.title === targetDocument.title && current.body?.textContent === targetDocument.body.textContent) {resolve(); return;}
          if (frame.contentWindow?.location.href !== url.href && frame.contentWindow?.location.href !== actualUrl.href) {reject(new Unavailable("navigation_changed")); return;}
          timer = setTimeout(tick, 40);
        } catch (error) {reject(error);}
      };
      let timer: ReturnType<typeof setTimeout>;
      const stop = () => {clearTimeout(timer); reject(signal.reason);};
      signal.addEventListener("abort", stop, {once: true});
      // The bounded outer operation ends this loop by aborting the per-step signal on completion.
      tick();
    }), signal, 3500);} catch (error) {
      cancelled(signal);
      if (!noodle) throw error;
      return withoutArrival;
    }
    const targetDoc = frame.contentDocument;
    const checkTarget = () => {
      cancelled(signal);
      if (frame.contentDocument !== targetDoc || frame.contentWindow?.location.href !== actualUrl.href || !targetDoc?.body
        || targetDoc.contentType !== "text/html" || targetDoc.title !== targetDocument.title || targetDoc.body.textContent !== targetDocument.body.textContent) throw new Unavailable("snapshot_mismatch");
    };
    const destinationMatched = actualUrl.href === targetUrl.href;
    if (noodle) {
      try {checkTarget();} catch (error) {cancelled(signal); return withoutArrival;}
      const arrived = {...activation, reachedTarget: actualFile, destinationMatched, targetVisible: false};
      if (!destinationMatched) return arrived;
      try {await bounded(targetDoc!.fonts.ready, signal, 1500);} catch (error) {
        cancelled(signal);
        try {checkTarget();} catch {return withoutArrival;}
        return arrived;
      }
      try {checkTarget();} catch (error) {cancelled(signal); return withoutArrival;}
      moveIntoView(targetDoc!.body, frame.contentWindow!);
      return {...arrived, targetVisible: visible(targetDoc!.body, frame.contentWindow!)};
    }
    checkTarget();
    if (!targetDoc?.body) throw new Unavailable("snapshot_mismatch");
    await bounded(targetDoc.fonts.ready, signal, 1500);
    checkTarget();
    const matches = fragment ? [...targetDoc.querySelectorAll("[id]")].filter(element => element.id === fragment) : [targetDoc.body];
    if (matches.length !== 1) throw new Unavailable("ambiguous_link");
    moveIntoView(matches[0], frame.contentWindow!);
    return {stepId: step.stepId, status: "observed", kind: "link", sourceVisible, sourceHitTarget, activated: true, destinationMatched, targetVisible: visible(matches[0], frame.contentWindow!)};
  }, archived);
}

function unavailableReason(error: unknown, signal: AbortSignal) {
  return error instanceof Unavailable ? error.reason : signal.reason instanceof Unavailable ? signal.reason.reason : error instanceof DOMException && error.name === "SecurityError" ? "access_denied" : "load_failed";
}
/** Re-execute a saved step against exactly its version. Does not save or change acceptance. */
export async function replayNoodleNavigation(quote: ProofQuote, report: ProofBrowserCheckReport, stepId: string, signal: AbortSignal, archived = false): Promise<ProofBrowserCheckReading> {
  const row = report.readings.find(reading => reading.stepId === stepId);
  const step = report.method === NOODLE_BROWSER_METHOD && report.deliveryId === quote.proof.delivery?.id
    ? getBrowserCheckPlan(quote, report.method).find(reading => reading.stepId === stepId) : undefined;
  if (!row || step?.kind !== "link" || row.file !== step.file || row.label !== step.label || row.target !== step.target || row.viewportWidth !== step.viewportWidth) throw new Error("The recorded click does not match this delivery version.");
  const controller = new AbortController(), abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, {once: true}); if (signal.aborted) abort();
  const timeout = setTimeout(() => controller.abort(new Unavailable("timeout")), 7000);
  try {cancelled(controller.signal); return await observeLink(quote, step, controller.signal, true, archived);}
  catch (error) {cancelled(signal); return {stepId, status: "unavailable", reason: unavailableReason(error, controller.signal)};}
  finally {clearTimeout(timeout); signal.removeEventListener("abort", abort); controller.abort();}
}
/** Explicit, bounded browser observations. Scripts/forms stay disabled; no financial or acceptance action. */
export async function runBrowserChecks(quote: ProofQuote, signal: AbortSignal, onProgress: (value: {done: number; total: number}) => void): Promise<BrowserCheckInput> {
  const method = browserCheckMethodFor(quote), plan = getBrowserCheckPlan(quote, method), controller = new AbortController();
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
      try {readings.push(await (step.kind === "page" ? observePage(quote, step, local.signal) : observeLink(quote, step, local.signal, method === NOODLE_BROWSER_METHOD)));}
      catch (error) {
        cancelled(controller.signal);
        readings.push({stepId: step.stepId, status: "unavailable", reason: unavailableReason(error, local.signal)});
      } finally {clearTimeout(timeout); controller.signal.removeEventListener("abort", abort); local.abort();}
      onProgress({done: readings.length, total: plan.length});
    }
    cancelled(controller.signal);
    return {deliveryId: quote.proof.delivery!.id, previousReportId: quote.proof.delivery!.browserChecks?.id ?? null, method, readings};
  } finally {clearTimeout(overall); signal.removeEventListener("abort", cancel); controller.abort();}
}
