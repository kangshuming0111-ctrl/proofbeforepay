import type { ProofDelivery, ProofLayoutUnavailableReason, ProofLayoutWidth } from "./contracts.ts";

export type DeliveryLayoutIssue = {
  file: string;
  width: ProofLayoutWidth;
  kind: "overflow" | "unavailable";
  overflowPx?: number;
  reason?: ProofLayoutUnavailableReason;
};

export type DeliveryLayoutSummary =
  | { state: "unmeasured" | "stale" | "invalid" }
  | {
    state: "current";
    measured: number;
    unavailable: number;
    overflow: number;
    total: number;
    firstIssue?: DeliveryLayoutIssue;
  };

const HTML_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/iu;
const REASONS = new Set<ProofLayoutUnavailableReason>([
  "missing_file", "load_failed", "navigation_changed", "access_denied", "timeout", "unstable_layout", "snapshot_mismatch",
  "response_type_mismatch", "response_identity_mismatch", "source_mismatch", "rendered_snapshot_mismatch",
]);

/** Display browser-reported observations only; never infer a criterion pass or buyer acceptance. */
export function deliveryLayoutSummary(delivery: Pick<ProofDelivery, "id" | "layoutReport">): DeliveryLayoutSummary {
  const report = delivery.layoutReport;
  if (!report) return { state: "unmeasured" };
  if (!delivery.id || report.deliveryId !== delivery.id) return { state: "stale" };
  if (report.method !== "browser-observation-v1" || !Array.isArray(report.readings) || !report.readings.length) return { state: "invalid" };

  let measured = 0;
  let unavailable = 0;
  let overflow = 0;
  let firstOverflow: DeliveryLayoutIssue | undefined;
  let firstUnavailable: DeliveryLayoutIssue | undefined;
  const seen = new Set<string>();
  for (const reading of report.readings) {
    if (!reading || !HTML_FILE.test(reading.file) || (reading.viewportWidth !== 375 && reading.viewportWidth !== 900)) return { state: "invalid" };
    const key = `${reading.file}:${reading.viewportWidth}`;
    if (seen.has(key)) return { state: "invalid" };
    seen.add(key);
    if (reading.status === "unavailable") {
      if (!REASONS.has(reading.reason)) return { state: "invalid" };
      unavailable++;
      firstUnavailable ??= { file: reading.file, width: reading.viewportWidth, kind: "unavailable", reason: reading.reason };
    } else if (reading.status === "measured") {
      if (!Number.isSafeInteger(reading.clientWidth) || reading.clientWidth < 1 || reading.clientWidth > reading.viewportWidth
        || !Number.isSafeInteger(reading.scrollWidth) || reading.scrollWidth < reading.clientWidth || reading.scrollWidth > 1_000_000) return { state: "invalid" };
      measured++;
      const overflowPx = reading.scrollWidth - reading.clientWidth;
      if (overflowPx > 1) {
        overflow++;
        firstOverflow ??= { file: reading.file, width: reading.viewportWidth, kind: "overflow", overflowPx };
      }
    } else return { state: "invalid" };
  }
  return { state: "current", measured, unavailable, overflow, total: report.readings.length, firstIssue: firstOverflow ?? firstUnavailable };
}
