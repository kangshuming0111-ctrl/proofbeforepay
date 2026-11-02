import type { ProofBrowserCheckReading, ProofBrowserCheckReason, ProofBrowserCheckReport, ProofBrowserCheckStep, ProofQuote, ProofRole } from "./contracts.ts";
import { DomainError } from "./domain.ts";
import { getLayoutFiles, LAYOUT_HEIGHT, LAYOUT_WIDTHS } from "./layout-report.ts";
import { assertStaticPath, staticFileKind } from "./static-resources.ts";
import { withBrowserReport } from "./acceptance-evidence.ts";

const REASONS = new Set<ProofBrowserCheckReason>(["missing_file", "load_failed", "snapshot_mismatch", "access_denied", "timeout", "navigation_changed", "ambiguous_link", "unsupported_target", "resource_limit"]);
export const BROWSER_RESOURCE_LIMIT = 100;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DomainError("Browser observations must be plain objects.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new DomainError("Browser observations contain an unsupported field.");
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > BROWSER_RESOURCE_LIMIT) throw new DomainError("Browser resource counts must be bounded integers.");
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new DomainError("Browser action observations must use boolean flags.");
  return value;
}
/** The saved agreement determines the action; a client cannot add an arbitrary URL or test. */
export function getBrowserCheckPlan(quote: ProofQuote): ProofBrowserCheckStep[] {
  const pages = getLayoutFiles(quote);
  const steps: ProofBrowserCheckStep[] = pages.flatMap(({file}) => LAYOUT_WIDTHS.map(viewportWidth => ({stepId: `page:${viewportWidth}:${file}`, kind: "page" as const, file, viewportWidth})));
  const project = quote.proof.project;
  if (project?.link && project.links !== undefined) throw new DomainError("The saved agreement has conflicting link requirements.", 409);
  const links = project?.links ?? (project?.link ? [project.link] : !project && quote.proof.criteria.some(item => item.id === "booking")
    ? [{from: "index.html", text: "Book a call", to: "contact.html#booking"}] : []);
  if (!Array.isArray(links) || links.length > 5) throw new DomainError("The saved agreement may check up to five local links.", 409);
  const seenLinks = new Set<string>();
  for (const [index, link] of links.entries()) {
    if (!link || typeof link !== "object" || Array.isArray(link) || typeof link.to !== "string" || typeof link.from !== "string") throw new DomainError("The saved local-link requirement is invalid.", 409);
    const from = assertStaticPath(link.from);
    const [targetFile, fragment, extra] = link.to.split("#");
    const target = targetFile ? assertStaticPath(targetFile) : from;
    if (staticFileKind(from) !== "html" || staticFileKind(target) !== "html" || extra !== undefined
      || fragment !== undefined && !/^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/u.test(fragment)
      || typeof link.text !== "string" || !link.text.trim() || link.text.length > 120) throw new DomainError("The saved local-link requirement cannot be checked safely.", 409);
    const identity = `${from}\n${link.text.replace(/\s+/gu, " ").trim()}`;
    if (seenLinks.has(identity)) throw new DomainError("Each local-link step must identify a distinct source and link label.", 409);
    seenLinks.add(identity);
    for (const viewportWidth of LAYOUT_WIDTHS) steps.push({stepId: `link:${viewportWidth}${index ? `:${index + 1}` : ""}`, kind: "link", file: from, viewportWidth, label: link.text, target: `${target}${fragment ? `#${fragment}` : ""}`});
  }
  return steps;
}
/** Validates a complete client observation set. This does not independently verify browser claims. */
export function createBrowserCheckReport(quote: ProofQuote, value: unknown, receivedAt = new Date().toISOString()): ProofBrowserCheckReport {
  const input = record(value); keys(input, ["deliveryId", "previousReportId", "readings"]);
  const delivery = quote.proof.delivery;
  if (!delivery || input.deliveryId !== delivery.id) throw new DomainError("Browser checks must use the current delivery version.", 409);
  if (!Object.hasOwn(input, "previousReportId") || input.previousReportId !== (delivery.browserChecks?.id ?? null)) throw new DomainError("Browser observations changed. Refresh before saving a new run.", 409);
  const plan = getBrowserCheckPlan(quote);
  if (!Array.isArray(input.readings) || input.readings.length !== plan.length) throw new DomainError("Browser observations must cover each planned step and width exactly once.");
  const remaining = new Map(plan.map(step => [step.stepId, step]));
  const rows = new Map<string, ProofBrowserCheckReport["readings"][number]>();
  for (const raw of input.readings) {
    const row = record(raw), step = typeof row.stepId === "string" ? remaining.get(row.stepId) : undefined;
    if (!step) throw new DomainError("Unexpected or duplicate browser observation step.");
    remaining.delete(step.stepId);
    let reading: ProofBrowserCheckReading;
    let outcome: "expected_observation" | "mismatch" | "unavailable";
    if (row.status === "unavailable") {
      keys(row, ["stepId", "status", "reason"]);
      if (typeof row.reason !== "string" || !REASONS.has(row.reason as ProofBrowserCheckReason)) throw new DomainError("Unknown browser unavailability reason.");
      reading = {stepId: step.stepId, status: "unavailable", reason: row.reason as ProofBrowserCheckReason}; outcome = "unavailable";
    } else if (row.status === "observed" && row.kind === step.kind) {
      if (!Object.hasOwn(delivery.files ?? {}, step.file)) throw new DomainError("Missing pages cannot have successful browser observations.");
      if (step.kind === "page") {
        keys(row, ["stepId", "status", "kind", "stylesExpected", "stylesLoaded", "imagesExpected", "imagesLoaded"]);
        const stylesExpected = count(row.stylesExpected), stylesLoaded = count(row.stylesLoaded), imagesExpected = count(row.imagesExpected), imagesLoaded = count(row.imagesLoaded);
        if (stylesLoaded > stylesExpected || imagesLoaded > imagesExpected) throw new DomainError("Loaded resource counts cannot exceed observed totals.");
        reading = {stepId: step.stepId, status: "observed", kind: "page", stylesExpected, stylesLoaded, imagesExpected, imagesLoaded};
        outcome = stylesExpected === stylesLoaded && imagesExpected === imagesLoaded ? "expected_observation" : "mismatch";
      } else {
        keys(row, ["stepId", "status", "kind", "sourceVisible", "sourceHitTarget", "activated", "destinationMatched", "targetVisible"]);
        const sourceVisible = flag(row.sourceVisible), sourceHitTarget = flag(row.sourceHitTarget), activated = flag(row.activated), destinationMatched = flag(row.destinationMatched), targetVisible = flag(row.targetVisible);
        if (!sourceVisible && sourceHitTarget || (!sourceVisible || !sourceHitTarget) && activated || !activated && (destinationMatched || targetVisible) || !destinationMatched && targetVisible) throw new DomainError("Browser action flags describe an impossible observation sequence.");
        if (destinationMatched && !Object.hasOwn(delivery.files ?? {}, step.target!.split("#")[0])) throw new DomainError("A missing target page cannot be reported as reached.");
        reading = {stepId: step.stepId, status: "observed", kind: "link", sourceVisible, sourceHitTarget, activated, destinationMatched, targetVisible};
        outcome = sourceVisible && sourceHitTarget && activated && destinationMatched && targetVisible ? "expected_observation" : "mismatch";
      }
    } else throw new DomainError("Browser observations need a supported status and matching step kind.");
    rows.set(step.stepId, {...step, ...reading, outcome});
  }
  if (typeof receivedAt !== "string" || !Number.isFinite(Date.parse(receivedAt))) throw new DomainError("Invalid browser observation receipt time.");
  const readings = plan.map(step => rows.get(step.stepId)!);
  return {id: crypto.randomUUID(), deliveryId: delivery.id, method: "client-browser-checks-v1", receivedAt, viewportHeight: LAYOUT_HEIGHT, readings,
    summary: {steps: readings.length, observed: readings.filter(row => row.status === "observed").length, issues: readings.filter(row => row.outcome === "mismatch").length, unavailable: readings.filter(row => row.status === "unavailable").length}};
}
/** Members may append observations to the current snapshot, including an accepted/paid snapshot. */
export function recordBrowserChecks(quote: ProofQuote, role: ProofRole, value: unknown, receivedAt?: string): ProofQuote {
  if (role !== "buyer" && role !== "seller") throw new DomainError("Only project members may save browser observations.", 403);
  if (quote.status === "draft" || quote.proof.paymentOperation) throw new DomainError("Lock the scope and finish any pending payment action before saving browser observations.", 409);
  const browserChecks = createBrowserCheckReport(quote, value, receivedAt);
  const next = structuredClone(quote);
  next.proof.delivery = withBrowserReport(next.proof.delivery!, {...browserChecks, reportedByRole: role});
  next.proof.audit.push({kind: "browser_checked", at: browserChecks.receivedAt, deliveryId: browserChecks.deliveryId, reportId: browserChecks.id});
  return next;
}
