import assert from "node:assert/strict";
import test from "node:test";
import type { ProofQuote } from "../lib/contracts.ts";
import { DomainError } from "../lib/domain.ts";
import { createLayoutReport, getLayoutFiles, LAYOUT_HEIGHT, LAYOUT_WIDTHS } from "../lib/layout-report.ts";
import { validateAcceptance } from "../lib/proof-domain.ts";
import { createProofDelivery } from "../lib/proof-evidence.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";

const html = "<!doctype html><html><head><title>Delivered page</title></head><body><main>Content</main></body></html>";
const now = "2026-10-30T00:00:00.000Z";
function agreement(): ProofQuote {
  const parsed = parseStaticProject({ title: "Layout test", summary: "Check saved HTML", amount: "125.50", requiredPages: ["index.html", "contact.html"], manualRequirements: ["Client approves the design."] }, "en");
  const delivery = createUploadedDelivery({ "index.html": html, "contact.html": html, "extra.HTML": html, "styles.css": "body {color: #123}" }, parsed.project, "en", 1);
  return {
    id: "layout-test", reference: "PBP-LAYOUT", workflow: "proof-v1", title: parsed.title, summary: parsed.summary, brief: parsed.summary,
    clientName: "Client", currency: "AUD", language: "en", hourlyRateCents: parsed.totalCents, totalCents: parsed.totalCents,
    lineItems: [{ id: "site", description: parsed.title, quantity: 1, unitPriceCents: parsed.totalCents }], timelineDays: 1, assumptions: [], questions: [],
    status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: now,
    proof: { project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery,
      review: { deliveryId: delivery.id, reviewedAt: now, mode: "demo", summary: "Reviewed saved source" } },
  };
}
function input(quote: ProofQuote): Record<string, unknown> {
  return { deliveryId: quote.proof.delivery!.id, previousReportId: quote.proof.delivery!.layoutReport?.id ?? null,
    readings: getLayoutFiles(quote).flatMap(({ file, exists }) => LAYOUT_WIDTHS.map(viewportWidth => exists
      ? { file, viewportWidth, status: "measured", clientWidth: viewportWidth, scrollWidth: viewportWidth }
      : { file, viewportWidth, status: "unavailable", reason: "missing_file" })) };
}
function rows(value: Record<string, unknown>) { return value.readings as Record<string, unknown>[]; }
const invalid = (operation: () => unknown) => assert.throws(operation, DomainError);

test("layout file coverage is a sorted exact-name union of required pages and saved HTML", () => {
  const quote = agreement();
  quote.proof.project!.requiredPages = ["index.html", "missing.html", "index.html"];
  assert.deepEqual(getLayoutFiles(quote), [
    { file: "contact.html", exists: true }, { file: "extra.HTML", exists: true }, { file: "index.html", exists: true }, { file: "missing.html", exists: false },
  ]);
  quote.proof.project = undefined;
  assert.deepEqual(getLayoutFiles(quote), [
    { file: "contact.html", exists: true }, { file: "extra.HTML", exists: true }, { file: "index.html", exists: true }, { file: "services.html", exists: false },
  ]);
  assert.deepEqual(LAYOUT_WIDTHS, [375, 900]);
  assert.equal(LAYOUT_HEIGHT, 800);
});

test("a legacy delivery without its exact snapshot cannot borrow demo fixture content", () => {
  const quote = agreement();
  quote.proof.delivery!.variant = "fixed";
  quote.proof.delivery!.files = undefined;
  invalid(() => getLayoutFiles(quote));
  quote.proof.delivery!.files = {};
  invalid(() => getLayoutFiles(quote));
  quote.proof.delivery = undefined;
  invalid(() => getLayoutFiles(quote));
});

test("actual controlled demo snapshots accept their JSON metadata but measure only saved HTML", () => {
  for (const variant of ["flawed", "fixed"] as const) {
    const quote = agreement();
    quote.proof.project = undefined;
    quote.proof.delivery = createProofDelivery(variant, "en");
    quote.proof.review = undefined;
    assert.ok(Object.hasOwn(quote.proof.delivery.files!, "delivery-manifest.json"));
    const expected = ["contact.html", "index.html", "services.html"];
    assert.deepEqual(getLayoutFiles(quote), expected.map(file => ({ file, exists: variant === "fixed" || file !== "contact.html" })));
    const report = createLayoutReport(quote, input(quote), now);
    assert.equal(report.readings.length, 6);
    assert.deepEqual(report.summary, variant === "fixed" ? { measured: 6, unavailable: 0, overflow: 0 } : { measured: 4, unavailable: 2, overflow: 0 });
    if (variant === "flawed") {
      assert.deepEqual(report.readings.slice(0, 2), LAYOUT_WIDTHS.map(viewportWidth => ({ file: "contact.html", viewportWidth, status: "unavailable", reason: "missing_file" })));
    }
    assert.ok(report.readings.every(reading => reading.file.endsWith(".html")));
    const forged = input(quote);
    rows(forged)[0].file = "delivery-manifest.json";
    invalid(() => createLayoutReport(quote, forged, now));
    quote.proof.delivery.files!["delivery-manifest.json"] = '{"htmlPages":["invented.html"]}';
    assert.deepEqual(getLayoutFiles(quote).map(entry => entry.file), expected, "metadata contents cannot invent measured pages");
  }
  const custom = agreement();
  invalid(() => createUploadedDelivery({ "index.html": html, "delivery-manifest.json": "{}" }, custom.proof.project!, "en", 1));
});

test("unsafe required or saved filenames and oversized coverage are rejected", () => {
  for (const name of ["../index.html", "dir/../index.html", "dir\\index.html", "/index.html", "page.html?x=1", "page.html\n", "dir/%2e%2e/index.html", "../metadata.json", "script.js"]) {
    const required = agreement();
    required.proof.project!.requiredPages = [name];
    invalid(() => getLayoutFiles(required));
    const saved = agreement();
    saved.proof.delivery!.files![name] = html;
    invalid(() => getLayoutFiles(saved));
  }
  const quote = agreement();
  quote.proof.delivery!.files!["INDEX.HTML"] = html;
  invalid(() => getLayoutFiles(quote));
  delete quote.proof.delivery!.files!["INDEX.HTML"];
  quote.proof.project!.requiredPages = Array.from({ length: 31 }, (_, i) => `required-${i}.html`);
  invalid(() => getLayoutFiles(quote));
  const accessor = agreement();
  Object.defineProperty(accessor.proof.delivery!.files, "bad.html", { enumerable: true, get() { throw new Error("must not run"); } });
  invalid(() => getLayoutFiles(accessor));
});

test("layout coverage accepts canonical directory packages while excluding raster and stylesheet assets from readings", () => {
  const quote = agreement();
  quote.proof.project!.requiredPages = ["index.html", "pages/contact.html", "pages/missing.html"];
  quote.proof.delivery!.files = {
    "index.html": html, "pages/contact.html": html, "assets/css/main.css": "body{color:#123}",
    "assets/images/shop.png": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNIm1meNrOcAUIBACiyBdnemS6wAAAAAElFTkSuQmCC",
  };
  const before = structuredClone(quote);
  assert.deepEqual(getLayoutFiles(quote), [
    { file: "index.html", exists: true }, { file: "pages/contact.html", exists: true }, { file: "pages/missing.html", exists: false },
  ]);
  const report = createLayoutReport(quote, input(quote), now);
  assert.deepEqual(report.summary, { measured: 4, unavailable: 2, overflow: 0 });
  assert.equal(report.deliveryId, quote.proof.delivery!.id);
  assert.ok(report.readings.every(reading => reading.file.endsWith(".html")));
  for (const file of ["assets/css/main.css", "assets/images/shop.png"]) {
    const forged = input(quote); rows(forged)[0].file = file;
    invalid(() => createLayoutReport(quote, forged, now));
  }
  assert.deepEqual(quote, before);
});

test("directory layout snapshots retain collision and unsupported-type checks", () => {
  for (const extra of [
    { "assets/main.css": "body{}", "ASSETS/MAIN.CSS": "body{}" },
    { "assets.css": "body{}", "assets.css/nested.html": html },
    { "images/photo.svg": "<svg></svg>" },
    { "assets/private.json": "{}" },
  ]) {
    const quote = agreement(); Object.assign(quote.proof.delivery!.files!, extra);
    invalid(() => getLayoutFiles(quote));
  }
});

test("the largest allowed page union produces exactly sixty readings", () => {
  const quote = agreement();
  quote.proof.delivery!.files = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i === 0 ? "index.html" : `extra-${i}.html`, html]));
  quote.proof.project!.requiredPages = Array.from({ length: 10 }, (_, i) => `missing-${i}.html`);
  assert.equal(getLayoutFiles(quote).length, 30);
  const report = createLayoutReport(quote, input(quote), now);
  assert.equal(report.readings.length, 60);
  assert.deepEqual(report.summary, { measured: 40, unavailable: 20, overflow: 0 });
});

test("the server derives overflow and its summary while stripping claimed results and metadata", () => {
  const quote = agreement();
  const value = input(quote);
  Object.assign(value, { id: "forged", method: "certified", receivedAt: "1900-01-01", viewportHeight: 1, summary: { measured: 999, unavailable: 0, overflow: 0 } });
  Object.assign(rows(value)[0], { scrollWidth: 376, overflowPx: 999, outcome: "overflow", reason: "fake", injected: true });
  Object.assign(rows(value)[1], { scrollWidth: 902, overflowPx: 0, outcome: "no_overflow" });
  const report = createLayoutReport(quote, value, now);
  assert.match(report.id, /^[0-9a-f-]{36}$/u);
  assert.notEqual(report.id, "forged");
  assert.equal(report.deliveryId, quote.proof.delivery!.id);
  assert.equal(report.receivedAt, now);
  assert.equal(report.viewportHeight, 800);
  assert.equal(report.method, "browser-observation-v1");
  assert.deepEqual(report.summary, { measured: 6, unavailable: 0, overflow: 1 });
  assert.deepEqual(report.readings[0], { file: "contact.html", viewportWidth: 375, status: "measured", clientWidth: 375, scrollWidth: 376, overflowPx: 1, outcome: "no_overflow" });
  assert.deepEqual(report.readings[1], { file: "contact.html", viewportWidth: 900, status: "measured", clientWidth: 900, scrollWidth: 902, overflowPx: 2, outcome: "overflow" });
  assert.deepEqual(Object.keys(report).sort(), ["deliveryId", "id", "method", "readings", "receivedAt", "summary", "viewportHeight"]);
});

test("reports require the current delivery and the exact prior report id", () => {
  const quote = agreement();
  invalid(() => createLayoutReport(quote, { ...input(quote), deliveryId: "old-delivery" }, now));
  const missingPrevious = input(quote);
  delete missingPrevious.previousReportId;
  invalid(() => createLayoutReport(quote, missingPrevious, now));
  invalid(() => createLayoutReport(quote, { ...input(quote), previousReportId: "unknown" }, now));
  const first = createLayoutReport(quote, input(quote), now);
  quote.proof.delivery!.layoutReport = first;
  assert.throws(() => createLayoutReport(quote, { ...input(quote), previousReportId: null }, now), { status: 409 });
  const next = createLayoutReport(quote, input(quote), now);
  assert.notEqual(next.id, first.id);
  assert.equal(quote.proof.delivery!.layoutReport, first, "creation never saves or replaces a report");
});

test("coverage rejects incomplete, duplicate, extra and foreign page or width readings", () => {
  const quote = agreement();
  for (const change of [
    (r: Record<string, unknown>[]) => r.pop(),
    (r: Record<string, unknown>[]) => r.push({ ...r[0] }),
    (r: Record<string, unknown>[]) => { r[1] = { ...r[0] }; },
    (r: Record<string, unknown>[]) => { r[0].file = "foreign.html"; },
    (r: Record<string, unknown>[]) => { r[0].file = "styles.css"; },
    (r: Record<string, unknown>[]) => { r[0].viewportWidth = 376; },
    (r: Record<string, unknown>[]) => { r[0].viewportWidth = "375"; },
    (r: Record<string, unknown>[]) => { r[0].status = "passed"; },
  ]) {
    const value = input(quote);
    change(rows(value));
    invalid(() => createLayoutReport(quote, value, now));
  }
  invalid(() => createLayoutReport(quote, { ...input(quote), readings: null }, now));
});

test("missing files require unavailable missing_file and cannot be claimed as measured", () => {
  const quote = agreement();
  delete quote.proof.delivery!.files!["contact.html"];
  const value = input(quote);
  const report = createLayoutReport(quote, value, now);
  assert.deepEqual(report.summary, { measured: 4, unavailable: 2, overflow: 0 });
  assert.deepEqual(report.readings[0], { file: "contact.html", viewportWidth: 375, status: "unavailable", reason: "missing_file" });
  for (const replacement of [
    { file: "contact.html", viewportWidth: 375, status: "measured", clientWidth: 375, scrollWidth: 375 },
    { file: "contact.html", viewportWidth: 375, status: "unavailable", reason: "timeout" },
  ]) invalid(() => createLayoutReport(quote, { ...value, readings: [replacement, ...rows(value).slice(1)] }, now));
  const existing = agreement();
  const falseMissing = input(existing);
  rows(falseMissing)[0] = { ...rows(falseMissing)[0], status: "unavailable", reason: "missing_file" };
  invalid(() => createLayoutReport(existing, falseMissing, now));
});

test("valid failure reasons are retained without client-supplied dimensions or outcomes", () => {
  const quote = agreement();
  for (const reason of ["load_failed", "navigation_changed", "access_denied", "timeout", "unstable_layout", "snapshot_mismatch",
    "response_type_mismatch", "response_identity_mismatch", "source_mismatch", "rendered_snapshot_mismatch"]) {
    const value = input(quote);
    rows(value)[0] = { ...rows(value)[0], status: "unavailable", reason, outcome: "no_overflow" };
    const report = createLayoutReport(quote, value, now);
    assert.deepEqual(report.readings[0], { file: "contact.html", viewportWidth: 375, status: "unavailable", reason });
    assert.deepEqual(report.summary, { measured: 5, unavailable: 1, overflow: 0 });
  }
  const value = input(quote);
  rows(value)[0] = { ...rows(value)[0], status: "unavailable", reason: "other" };
  invalid(() => createLayoutReport(quote, value, now));
});

test("dimensions must be finite integer measurements within the documented bounds", () => {
  const quote = agreement();
  for (const change of [
    { clientWidth: 0 }, { clientWidth: -1 }, { clientWidth: 376 }, { clientWidth: 1.5 }, { clientWidth: NaN }, { clientWidth: Infinity }, { clientWidth: "375" },
    { scrollWidth: 0 }, { scrollWidth: 374 }, { scrollWidth: 375.5 }, { scrollWidth: NaN }, { scrollWidth: Infinity }, { scrollWidth: 1_000_001 }, { scrollWidth: "375" },
  ]) {
    const value = input(quote);
    Object.assign(rows(value)[0], change);
    invalid(() => createLayoutReport(quote, value, now));
  }
  const value = input(quote);
  Object.assign(rows(value)[0], { clientWidth: 1, scrollWidth: 1_000_000 });
  const report = createLayoutReport(quote, value, now);
  assert.equal(report.readings[0].status === "measured" && report.readings[0].overflowPx, 999_999);
  invalid(() => createLayoutReport(quote, input(quote), "not-a-date"));
  const before = Date.now();
  const timestamp = createLayoutReport(quote, input(quote)).receivedAt;
  assert.ok(Date.parse(timestamp) >= before && Date.parse(timestamp) <= Date.now(), "default receipt time comes from the server clock");
});

test("a report is an independent snapshot and leaves evidence, review, manual checks and capture guards untouched", () => {
  const quote = agreement();
  quote.proof.manualChecks = ["previous-human-decision"];
  const value = input(quote);
  const priorQuote = structuredClone(quote);
  const priorInput = structuredClone(value);
  const report = createLayoutReport(quote, value, now);
  assert.deepEqual(quote, priorQuote);
  assert.deepEqual(value, priorInput);
  rows(value)[0].scrollWidth = 999;
  assert.notEqual(report.readings[0].status === "measured" && report.readings[0].scrollWidth, 999);
  quote.proof.delivery!.layoutReport = report;
  const consent = { confirm: true, deliveryId: quote.proof.delivery!.id, manualChecks: ["mobile", "manual-1"] };
  assert.throws(() => validateAcceptance(quote, consent), /confirmed authorization/u);
  quote.proof.paymentState = "authorized";
  quote.proof.authorizationId = "AUTH-LAYOUT";
  quote.proof.authorizationExpiresAt = new Date(Date.now() + 60_000).toISOString();
  assert.throws(() => validateAcceptance(quote, { ...consent, manualChecks: [] }), /human check/u);
  assert.throws(() => validateAcceptance(quote, { ...consent, confirm: false }), /Explicit confirmation/u);
  assert.throws(() => validateAcceptance(quote, { ...consent, deliveryId: "old" }), /current delivery version/u);
  assert.deepEqual(validateAcceptance(quote, consent), ["mobile", "manual-1"]);
  assert.equal(quote.proof.delivery!.evidence.find(entry => entry.criterionId === "mobile")?.finding, "needs_human");
  quote.proof.delivery!.evidence[0].finding = "fail";
  assert.throws(() => validateAcceptance(quote, consent), /failed requirements/u);
});
