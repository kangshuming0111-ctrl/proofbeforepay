import assert from "node:assert/strict";
import test from "node:test";
import type { ProofLayoutReading, ProofLayoutReport } from "../lib/contracts.ts";
import { deliveryLayoutSummary } from "../lib/delivery-layout-summary.ts";

const clean = (file: string, viewportWidth: 375 | 900): Extract<ProofLayoutReading, {status: "measured"}> => ({
  file, viewportWidth, status: "measured", clientWidth: viewportWidth, scrollWidth: viewportWidth, overflowPx: 0, outcome: "no_overflow",
});
function report(readings: ProofLayoutReading[], deliveryId = "v2"): ProofLayoutReport {
  return { id: "layout", deliveryId, method: "browser-observation-v1", receivedAt: "2026-11-02T00:00:00Z", viewportHeight: 800,
    readings, summary: { measured: 999, unavailable: 0, overflow: 0 } };
}

test("an absent report or one belonging to the replaced version never displays current readings", () => {
  assert.deepEqual(deliveryLayoutSummary({ id: "v2" }), { state: "unmeasured" });
  assert.deepEqual(deliveryLayoutSummary({ id: "v2", layoutReport: report([clean("index.html", 375)], "v1") }), { state: "stale" });
});

test("saved browser observations expose real widths without trusting a summary or outcome label", () => {
  const saved = report([
    { file: "contact.html", viewportWidth: 375, status: "unavailable", reason: "missing_file" },
    { ...clean("index.html", 375), scrollWidth: 640 },
    clean("index.html", 900),
  ]);
  const before = structuredClone(saved);
  const result = deliveryLayoutSummary({ id: "v2", layoutReport: saved });
  assert.deepEqual(result, { state: "current", measured: 2, unavailable: 1, overflow: 1, total: 3,
    firstIssue: { file: "index.html", width: 375, kind: "overflow", overflowPx: 265 } });
  assert.deepEqual(saved, before);
  if (result.state === "current" && result.firstIssue) result.firstIssue.file = "mutated.html";
  assert.deepEqual(saved, before);
});

test("unavailable readings stay uncovered even when the measured pages have no overflow", () => {
  assert.deepEqual(deliveryLayoutSummary({ id: "v2", layoutReport: report([
    clean("index.html", 375), clean("index.html", 900),
    { file: "contact.html", viewportWidth: 375, status: "unavailable", reason: "load_failed" },
  ]) }), { state: "current", measured: 2, unavailable: 1, overflow: 0, total: 3,
    firstIssue: { file: "contact.html", width: 375, kind: "unavailable", reason: "load_failed" } });
});

test("a fully unavailable report cannot become measured success and a one-pixel rounding difference is not overflow", () => {
  const unreadable = deliveryLayoutSummary({ id: "v2", layoutReport: report([
    { file: "index.html", viewportWidth: 375, status: "unavailable", reason: "access_denied" },
  ]) });
  assert.equal(unreadable.state, "current");
  if (unreadable.state === "current") { assert.equal(unreadable.measured, 0); assert.equal(unreadable.unavailable, 1); }
  const rounded = deliveryLayoutSummary({ id: "v2", layoutReport: report([{ ...clean("index.html", 375), scrollWidth: 376 }]) });
  assert.equal(rounded.state, "current");
  if (rounded.state === "current") { assert.equal(rounded.overflow, 0); assert.equal(rounded.firstIssue, undefined); }
});

test("ambiguous or malformed saved readings do not expose a misleading inspection target or success count", () => {
  for (const readings of [
    [],
    [clean("index.html", 375), clean("index.html", 375)],
    [clean("../outside.html", 375)],
    [{ ...clean("index.html", 375), clientWidth: 0 }],
    [{ ...clean("index.html", 375), scrollWidth: Number.NaN }],
  ]) assert.deepEqual(deliveryLayoutSummary({ id: "v2", layoutReport: report(readings) }), { state: "invalid" });
});
