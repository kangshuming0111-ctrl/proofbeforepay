import type { ProofLayoutReading, ProofLayoutReport, ProofLayoutUnavailableReason, ProofLayoutWidth, ProofQuote } from "./contracts.ts";
import { DomainError } from "./domain.ts";

export const LAYOUT_WIDTHS = [375, 900] as const;
export const LAYOUT_HEIGHT = 800;

// Controlled demo snapshots also contain a JSON manifest; it is never a measured page.
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:html|css|json)$/iu;
const HTML_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/iu;
const DEMO_PAGES = ["index.html", "services.html", "contact.html"] as const;
const UNAVAILABLE_REASONS = new Set<ProofLayoutUnavailableReason>([
  "missing_file", "load_failed", "navigation_changed", "access_denied", "timeout", "unstable_layout", "snapshot_mismatch",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new DomainError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function safeName(value: unknown, htmlOnly: boolean): string {
  if (typeof value !== "string" || value.length > 120 || !(htmlOnly ? HTML_NAME : FILE_NAME).test(value)) {
    throw new DomainError("Layout snapshots must use root-level HTML/CSS/JSON filenames; required pages must be HTML.");
  }
  return value;
}

/** Enumerate only the current saved snapshot; never replace absent legacy files with fixtures. */
export function getLayoutFiles(quote: ProofQuote): { file: string; exists: boolean }[] {
  const delivery = quote.proof.delivery;
  if (!delivery?.files) throw new DomainError("This delivery has no saved file snapshot to check.", 409);
  const files = record(delivery.files, "Delivery files");
  const names = new Set<string>();
  const actualNames = new Set<string>();
  const keys = Reflect.ownKeys(files);
  if (!keys.length) throw new DomainError("This delivery has no saved file snapshot to check.", 409);
  for (const key of keys) {
    const name = safeName(key, false);
    const descriptor = Object.getOwnPropertyDescriptor(files, name);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") {
      throw new DomainError("Layout files must contain saved text without property accessors.");
    }
    const canonical = name.toLowerCase();
    if (actualNames.has(canonical)) throw new DomainError("Saved file names must not collide when letter case is ignored.");
    actualNames.add(canonical);
    if (HTML_NAME.test(name)) names.add(name);
  }
  if (quote.proof.project) {
    if (!Array.isArray(quote.proof.project.requiredPages)) throw new DomainError("Required layout pages must be a list.");
    for (const file of quote.proof.project.requiredPages) names.add(safeName(file, true));
  } else {
    // The fixed demo contract requires these pages, independently of its optional manifest.
    for (const file of DEMO_PAGES) names.add(file);
  }
  if (!names.size || names.size * LAYOUT_WIDTHS.length > 60) {
    throw new DomainError("Layout observations must cover between 1 and 30 HTML files.");
  }
  return [...names].sort().map(file => ({ file, exists: Object.hasOwn(files, file) }));
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new DomainError(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

/** Browser-reported observations are supplemental; they never establish human acceptance. */
export function createLayoutReport(quote: ProofQuote, value: Record<string, unknown>, receivedAt?: string): ProofLayoutReport {
  const input = record(value, "Layout report");
  const delivery = quote.proof.delivery;
  if (!delivery || input.deliveryId !== delivery.id) throw new DomainError("Layout observations must use the current delivery version.", 409);
  if (!Object.hasOwn(input, "previousReportId") || input.previousReportId !== (delivery.layoutReport?.id ?? null)) {
    throw new DomainError("The layout report has changed. Reload before saving new observations.", 409);
  }
  const files = getLayoutFiles(quote);
  if (!Array.isArray(input.readings) || input.readings.length !== files.length * LAYOUT_WIDTHS.length) {
    throw new DomainError("Layout observations must cover every delivery page at both viewport widths exactly once.");
  }
  const available = new Map(files.map(entry => [entry.file, entry.exists]));
  const readings = new Map<string, ProofLayoutReading>();
  for (const value of input.readings) {
    const reading = record(value, "Layout reading");
    if (typeof reading.file !== "string" || !available.has(reading.file)
      || !LAYOUT_WIDTHS.includes(reading.viewportWidth as ProofLayoutWidth)) {
      throw new DomainError("Layout observations contain an unexpected file or viewport width.");
    }
    const file = reading.file;
    const viewportWidth = reading.viewportWidth as ProofLayoutWidth;
    const key = `${file}:${viewportWidth}`;
    if (readings.has(key)) throw new DomainError("Layout observations contain a duplicate file and viewport width.");
    const exists = available.get(file)!;
    if (reading.status === "measured") {
      if (!exists) throw new DomainError("Missing delivery files must be reported as unavailable with reason missing_file.");
      const clientWidth = integer(reading.clientWidth, "Client width", 1, viewportWidth);
      const scrollWidth = integer(reading.scrollWidth, "Scroll width", clientWidth, 1_000_000);
      const overflowPx = Math.max(0, scrollWidth - clientWidth);
      readings.set(key, { file, viewportWidth, status: "measured", clientWidth, scrollWidth, overflowPx, outcome: overflowPx > 1 ? "overflow" : "no_overflow" });
    } else if (reading.status === "unavailable") {
      if (typeof reading.reason !== "string" || !UNAVAILABLE_REASONS.has(reading.reason as ProofLayoutUnavailableReason)
        || !exists && reading.reason !== "missing_file" || exists && reading.reason === "missing_file") {
        throw new DomainError("Layout unavailability must use an applicable supported reason.");
      }
      readings.set(key, { file, viewportWidth, status: "unavailable", reason: reading.reason as ProofLayoutUnavailableReason });
    } else {
      throw new DomainError("Layout reading status must be measured or unavailable.");
    }
  }
  const timestamp = receivedAt === undefined ? new Date().toISOString() : receivedAt;
  if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) throw new DomainError("The layout receipt time is invalid.");
  const ordered = files.flatMap(({ file }) => LAYOUT_WIDTHS.map(width => readings.get(`${file}:${width}`)!));
  const measured = ordered.filter(reading => reading.status === "measured");
  return {
    id: crypto.randomUUID(), deliveryId: delivery.id, method: "browser-observation-v1", receivedAt: timestamp,
    viewportHeight: LAYOUT_HEIGHT, readings: ordered,
    summary: { measured: measured.length, unavailable: ordered.length - measured.length, overflow: measured.filter(reading => reading.outcome === "overflow").length },
  };
}
