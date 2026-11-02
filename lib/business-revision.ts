import type { ProofBusinessCheckReport, ProofBusinessCheckStep, ProofDelivery, ProofDeliveryVersion } from "./contracts.ts";
import { isOlderDelivery } from "./delivery-comparison.ts";
import { evaluateBusinessBlocks } from "./business-checks.ts";

type Reading = ProofBusinessCheckReport["readings"][number];
export type BusinessRevisionState = "now_matches" | "new_mismatch" | "still_mismatch" | "still_matches" | "uncertain" | "no_previous" | "plan_changed";
export type BusinessRevisionRow = {step: ProofBusinessCheckStep; current: Reading; previous?: Reading; state: BusinessRevisionState};
type Report = {report: ProofBusinessCheckReport; rows: Map<string, Reading>};

/** Recheck the narrow stored outcome. Never borrow another delivery's report,
 * trust summary counters, or turn an unavailable observation into a pass. */
function savedReport(delivery: ProofDelivery): Report | undefined {
  const report = delivery.businessChecks;
  if (!report || report.deliveryId !== delivery.id || report.method !== "client-business-content-v1" || !Array.isArray(report.readings) || !report.readings.length || report.readings.length > 16) return;
  const rows = new Map<string, Reading>();
  for (const row of report.readings) {
    if (!row || typeof row.checkId !== "string" || ![375,900].includes(row.viewportWidth) || row.stepId !== `business:${row.viewportWidth}:${row.checkId}` || rows.has(row.stepId)
      || !row.file || !row.criterionId || !row.source?.excerpt || !row.expected) return;
    if (row.status === "observed") {
      if (!Array.isArray(row.blocks) || row.blocks.length > 12 || row.blocks.some(block => typeof block !== "string" || !block.trim() || block.length > 300)) return;
      try {if (evaluateBusinessBlocks(row.expected,row.blocks).outcome !== row.outcome) return;} catch {return;}
    } else if (row.status !== "unavailable" || row.outcome !== "unavailable") return;
    rows.set(row.stepId,row);
  }
  // Both widths must refer to exactly the same saved expectation and source.
  for (const row of rows.values()) {
    const twin = rows.get(`business:${row.viewportWidth === 375 ? 900 : 375}:${row.checkId}`);
    if (!twin || signature(row) !== signature(twin)) return;
  }
  return {report,rows};
}
function signature(row: Reading): string {
  return JSON.stringify([row.checkId,row.criterionId,row.file,row.source.start,row.source.end,row.source.excerpt,row.expected]);
}

/** This compares recorded observations, not whether a fix or acceptance is verified. */
export function compareBusinessRevision(current: ProofDelivery, previousVersion?: ProofDeliveryVersion): {rows: BusinessRevisionRow[]; currentReportId?: string; previousReportId?: string; previousAvailable: boolean} {
  const latest = savedReport(current);
  const earlier = previousVersion && isOlderDelivery(previousVersion,current) ? savedReport(previousVersion.delivery) : undefined;
  if (!latest) return {rows:[],previousAvailable:!!earlier};
  const rows = [...latest.rows.values()].map(row => {
    const old = earlier?.rows.get(row.stepId);
    let state: BusinessRevisionState;
    if (!old) state="no_previous";
    else if (signature(old)!==signature(row)) state="plan_changed";
    else if (row.outcome==="unavailable" || old.outcome==="unavailable") state="uncertain";
    else if (row.outcome==="expected_observation") state=old.outcome==="mismatch" ? "now_matches" : "still_matches";
    else state=old.outcome==="expected_observation" ? "new_mismatch" : "still_mismatch";
    return {step: {stepId:row.stepId,checkId:row.checkId,criterionId:row.criterionId,file:row.file,viewportWidth:row.viewportWidth,source:row.source,expected:row.expected},current:row,...(old?{previous:old}:{}),state};
  });
  return structuredClone({rows,currentReportId:latest.report.id,...(earlier?{previousReportId:earlier.report.id}:{}),previousAvailable:!!earlier});
}
