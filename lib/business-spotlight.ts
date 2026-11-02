import type { Language, ProofDelivery, ProofDeliveryVersion } from "./contracts.ts";
import { compareBusinessRevision, type BusinessRevisionRow } from "./business-revision.ts";

export type BusinessSpotlightGroup = {
  row: BusinessRevisionRow;
  widths: number[];
  /** Earlier text is displayable only for a validated older, same-plan reading. */
  previousComparable: boolean;
};
export type BusinessSpotlightData = {
  reportId: string;
  previousReportId?: string;
  groups: BusinessSpotlightGroup[];
  checkCount: number;
  observations: number;
  issues: number;
  unavailable: number;
  matching: number;
};

function previousComparable(row: BusinessRevisionRow): boolean {
  return row.state !== "plan_changed" && row.previous?.status === "observed";
}
function fingerprint(row: BusinessRevisionRow): string {
  return JSON.stringify([
    row.step.checkId, row.step.criterionId, row.step.file, row.step.source, row.step.expected,
    row.current.status, row.current.outcome,
    row.current.status === "observed" ? row.current.blocks : row.current.reason,
    row.state,
    previousComparable(row) ? [row.previous!.status, row.previous!.outcome, row.previous!.status === "observed" ? row.previous!.blocks : undefined] : undefined,
  ]);
}
function priority(group: BusinessSpotlightGroup): number {
  if (group.row.current.outcome === "mismatch") return 0;
  if (group.row.current.outcome === "unavailable" || ["uncertain", "plan_changed"].includes(group.row.state)) return 1;
  if (group.row.state === "now_matches") return 2;
  return 3;
}

/** A display projection of narrowly revalidated saved observations. Counters are
 * recomputed per width; neither a smaller count nor a matching row verifies a fix.
 * This helper never accepts work, pays, changes a plan or writes a report. */
export function businessSpotlight(delivery: ProofDelivery, previousVersion?: ProofDeliveryVersion): BusinessSpotlightData | undefined {
  try {
    const comparison = compareBusinessRevision(delivery, previousVersion);
    if (!comparison.rows.length || !comparison.currentReportId?.trim()) return;
    const groups = new Map<string, BusinessSpotlightGroup>();
    for (const row of comparison.rows) {
      const key = fingerprint(row);
      const grouped = groups.get(key);
      if (grouped) grouped.widths.push(row.step.viewportWidth);
      else groups.set(key, { row, widths: [row.step.viewportWidth], previousComparable: previousComparable(row) });
    }
    return {
      reportId: comparison.currentReportId,
      ...(comparison.previousReportId ? {previousReportId: comparison.previousReportId} : {}),
      groups: [...groups.values()].map(group => ({...group, widths: group.widths.sort((a,b) => a-b)})).sort((a,b) => priority(a)-priority(b)),
      checkCount: new Set(comparison.rows.map(row => row.step.checkId)).size,
      observations: comparison.rows.length,
      issues: comparison.rows.filter(row => row.current.outcome === "mismatch").length,
      unavailable: comparison.rows.filter(row => row.current.outcome === "unavailable").length,
      matching: comparison.rows.filter(row => row.current.outcome === "expected_observation").length,
    };
  } catch {
    // Corrupt history must not become a reassuring spotlight or a guessed delta.
    return;
  }
}

/** Explicit builder name for callers that already use build-style projections. */
export const buildBusinessSpotlight = businessSpotlight;

function expectedText(group: BusinessSpotlightGroup): string {
  const expected = group.row.step.expected;
  return expected.kind === "visible_copy" ? expected.text : `${expected.label} — ${expected.currency} ${(expected.amountMinor/100).toFixed(2)}`;
}

/** This prepares editable text only. The parent separately checks actor, stage,
 * exact delivery and explicit submission; this function never sends feedback. */
export function businessSpotlightFeedback(deliveryId: string, group: BusinessSpotlightGroup, language: Language): {deliveryId: string; criterionId: string; comment: string} {
  const zh = language === "zh", row = group.row;
  const observed = row.current.status === "observed" ? row.current.blocks.join(" | ") : "";
  const comment = `${zh ? "请核对当前交付与约定的差异（草稿，待买家确认）：" : "Please inspect this delivery against the agreement (draft for buyer review):"}\n${row.step.source.excerpt}\n${row.step.file}: ${zh ? "约定" : "Agreed"} ${expectedText(group)}. ${observed ? `${zh ? "本次观察" : "Current observation"}: ${observed}. ` : ""}${zh ? "请修改后重新提交，或提供可核查的说明。" : "Revise and resubmit, or provide a verifiable explanation."}`;
  return {deliveryId, criterionId: row.step.criterionId, comment: comment.slice(0,1000).replace(/[\uD800-\uDBFF]$/u, "")};
}
