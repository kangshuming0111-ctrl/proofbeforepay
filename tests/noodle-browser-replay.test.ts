import assert from "node:assert/strict";
import test from "node:test";
import {acceptDeliveryWithBasis} from "./acceptance-client.ts";
import {withBrowserReport} from "../lib/acceptance-evidence.ts";
import {browserCheckMethodFor, createBrowserCheckReport, getBrowserCheckPlan, recordBrowserChecks} from "../lib/browser-check-report.ts";
import type {ProofBrowserCheckStep, ProofQuote} from "../lib/contracts.ts";
import {DomainError} from "../lib/domain.ts";
import {createEvidenceExport, verifyEvidenceExport} from "../lib/evidence-export.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";

const legacy = "client-browser-checks-v1" as const;
const replay = "client-browser-checks-noodle-v2" as const;
const at = "2026-11-07T06:00:00.000Z";
const later = "2026-11-07T06:01:00.000Z";
const navigation = "网站包含首页、菜单页 menu.html 和联系页 contact.html，首页可打开菜单页和联系页。";
const scope = [navigation,
  "菜单页同时展示中文「牛肉面」和英文「Beef noodles」，两种语言所示价格均为 AUD18。",
  "联系页展示营业时间为上午 11 点至晚上 8 点（11am–8pm）。",
  "首页、菜单页和联系页在手机上均可用，正文与导航可阅读及操作，无需横向滚动。"].join("\n");
const pages = ["index.html", "menu.html", "contact.html"];
const html = (title: string, body: string) => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

function fixture({summary = scope, requiredPages = pages, excludeNavigation = false, wrongMenu = false, menuLabel = "Menu", contactLabel = "Contact"} = {}): ProofQuote {
  const parsed = parseStaticProject({title: "面馆网站交付演练", summary, amount: "1.00", requiredPages, manualRequirements: [],
    coverage: {version: 2, sourceText: summary, confirmed: true, decisions: summaryCoverageUnits(summary, 2).map(({id, text}) =>
      excludeNavigation && text === navigation ? {id, disposition: "exclude", reason: "这个交付明确排除首页导航检查。"} : {id, disposition: "include"})}}, "zh", {requireCoverage: true});
  const delivery = createUploadedDelivery({
    "index.html": html("Noodle shop", `<nav><a href="${wrongMenu ? "contact.html" : "menu.html"}">${menuLabel}</a><a href="contact.html">${contactLabel}</a></nav>`),
    "menu.html": html("Menu", "<p>牛肉面 AUD18</p><p>Beef noodles AUD 18</p>"),
    "contact.html": html("Contact", "<p>营业时间：上午11点到晚上8点。</p>"),
  }, parsed.project, "zh", 2);
  return {id: "noodle-browser-replay", reference: "PBP-NOODLE-REPLAY", title: parsed.title, summary, brief: summary,
    clientName: "Synthetic", currency: "AUD", language: "zh", hourlyRateCents: 100, totalCents: 100,
    lineItems: [{id: "test", description: "Synthetic", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [],
    timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: at, workflow: "proof-v1",
    proof: {project: parsed.project, criteria: parsed.criteria, delivery, paymentState: "unfunded", audit: [],
      review: {deliveryId: delivery.id, reviewedAt: at, mode: "demo", summary: "Controlled source review"},
      collaboration: {stage: "submitted", submission: {deliveryId: delivery.id, at, note: "Synthetic delivery"}, feedback: []}}};
}

// These client readings model protocol inputs; no browser is run by this suite.
function pageReading(step: ProofBrowserCheckStep) {
  return {stepId: step.stepId, status: "observed", kind: "page", stylesExpected: 0, stylesLoaded: 0, imagesExpected: 0, imagesLoaded: 0};
}
function input(q: ProofQuote, makeLink = (step: ProofBrowserCheckStep): Record<string, unknown> => ({
  stepId: step.stepId, status: "observed", kind: "link", sourceVisible: true, sourceHitTarget: true, activated: true,
  clickedLabel: step.label, reachedTarget: step.target, destinationMatched: true, targetVisible: true,
})) {
  return {deliveryId: q.proof.delivery!.id, previousReportId: q.proof.delivery!.browserChecks?.id ?? null, method: replay,
    readings: getBrowserCheckPlan(q).map(step => step.kind === "page" ? pageReading(step) : makeLink(step))};
}
function legacyInput(q: ProofQuote) {
  return {deliveryId: q.proof.delivery!.id, previousReportId: q.proof.delivery!.browserChecks?.id ?? null,
    readings: getBrowserCheckPlan(q, legacy).map(pageReading)};
}
function accept(q: ProofQuote) {
  return acceptDeliveryWithBasis(q, {confirm: true, deliveryId: q.proof.delivery!.id,
    manualChecks: q.proof.delivery!.evidence.filter(row => row.finding === "needs_human").map(row => row.criterionId)}, at);
}

test("only the original included noodle navigation and exact locked pages get the two implicit replay paths", () => {
  const q = fixture(), steps = getBrowserCheckPlan(q);
  assert.equal(browserCheckMethodFor(q), replay);
  assert.equal(steps.filter(step => step.kind === "page").length, 6);
  const links = steps.filter(step => step.kind === "link");
  assert.equal(new Set(links.map(step => step.stepId)).size, 4);
  assert.deepEqual(links.map(step => [step.file, step.label, step.target, step.viewportWidth]), [
    ["index.html", "Menu", "menu.html", 375], ["index.html", "Menu", "menu.html", 900],
    ["index.html", "Contact", "contact.html", 375], ["index.html", "Contact", "contact.html", 900],
  ]);
  assert.equal(getBrowserCheckPlan(q, legacy).filter(step => step.kind === "link").length, 0);
  for (const other of [fixture({excludeNavigation: true}), fixture({summary: scope.replace("可打开", "展示")}), fixture({requiredPages: pages.slice(0, 2)})]) {
    assert.equal(browserCheckMethodFor(other), legacy);
    assert.ok(getBrowserCheckPlan(other).every(step => step.kind === "page"));
    assert.throws(() => createBrowserCheckReport(other, input(other), at), DomainError);
  }
  q.proof.project!.links = [{from: "index.html", text: "Contact", to: "contact.html"}];
  assert.equal(browserCheckMethodFor(q), legacy);
  assert.deepEqual(getBrowserCheckPlan(q).filter(step => step.kind === "link").map(step => step.target), ["contact.html", "contact.html"]);
});

test("replay binds to the delivery and keeps actual destination separate from the agreed path", () => {
  const q = fixture({wrongMenu: true, menuLabel: "菜单", contactLabel: "联系我们"});
  const run = input(q, step => ({stepId: step.stepId, status: "observed", kind: "link",
    sourceVisible: true, sourceHitTarget: true, activated: true, clickedLabel: step.label === "Menu" ? "菜单" : "联系我们", reachedTarget: "contact.html",
    destinationMatched: step.target === "contact.html", targetVisible: step.target === "contact.html"}));
  const report = createBrowserCheckReport(q, run, at);
  assert.equal(report.deliveryId, q.proof.delivery!.id);
  assert.equal(report.method, replay);
  const observations = report.readings.filter(row => row.kind === "link" && row.status === "observed");
  assert.deepEqual(observations.map(row => [row.clickedLabel, row.target, row.reachedTarget, row.destinationMatched, row.outcome]), [
    ["菜单", "menu.html", "contact.html", false, "mismatch"], ["菜单", "menu.html", "contact.html", false, "mismatch"],
    ["联系我们", "contact.html", "contact.html", true, "expected_observation"], ["联系我们", "contact.html", "contact.html", true, "expected_observation"],
  ]);
  assert.equal(report.summary.issues, 2);
  assert.throws(() => recordBrowserChecks(q, "buyer", {...run, deliveryId: "another-version"}, at), DomainError);
  assert.throws(() => recordBrowserChecks(q, "buyer", legacyInput(q), at), DomainError);
  const saved = recordBrowserChecks(q, "seller", run, at);
  assert.equal(saved.proof.delivery!.browserChecks?.reportedByRole, "seller");
  assert.equal(saved.proof.paymentState, "unfunded");
  assert.equal(saved.proof.collaboration!.acceptance, undefined);
  assert.throws(() => recordBrowserChecks(saved, "buyer", run, later), DomainError);
});

test("blocked, ambiguous and unsafe reports cannot claim an actual landing", () => {
  const q = fixture(), value = input(q), firstLink = getBrowserCheckPlan(q).findIndex(step => step.kind === "link");
  const row = value.readings[firstLink];
  const patch = (change: Record<string, unknown>) => ({...value, readings: value.readings.map((item, i) => i === firstLink ? {...row, ...change} : item)});
  for (const change of [
    {reachedTarget: "https://example.test/menu.html"}, {reachedTarget: "missing.html"}, {reachedTarget: "../menu.html"},
    {activated: false}, {clickedLabel: "Unknown"}, {destinationMatched: false, targetVisible: false}, {outcome: "expected_observation"},
  ]) assert.throws(() => createBrowserCheckReport(q, patch(change), at), DomainError, JSON.stringify(change));
  const unavailable = {...value, readings: value.readings.map((item, i) => i === firstLink ? {stepId: row.stepId, status: "unavailable", reason: "ambiguous_link"} : item)};
  const report = createBrowserCheckReport(q, unavailable, at);
  assert.equal(report.readings[firstLink].outcome, "unavailable");
  assert.equal("reachedTarget" in report.readings[firstLink], false);
  const noLanding = {...value, readings: value.readings.map((item, i) => i === firstLink ? {
    stepId: row.stepId, status: "observed", kind: "link", sourceVisible: true, sourceHitTarget: true, activated: true,
    clickedLabel: "Menu", destinationMatched: false, targetVisible: false,
  } : item)};
  const attempted = createBrowserCheckReport(q, noLanding, at).readings[firstLink];
  assert.equal(attempted.outcome, "mismatch");
  assert.equal("reachedTarget" in attempted, false);
});

test("legacy page-only export still verifies, and a new report cannot replace the accepted replay", async () => {
  const q = fixture(), d = q.proof.delivery!;
  const old = createBrowserCheckReport(q, legacyInput(q), at);
  assert.equal(old.method, legacy);
  assert.equal(old.readings.length, 6);
  q.proof.delivery = withBrowserReport(d, old);
  const previous = await createEvidenceExport(accept(q));
  assert.equal((await verifyEvidenceExport(previous)).consistency, "consistent");
  const beforeAcceptance = recordBrowserChecks(q, "buyer", input(q), at);
  const reportA = beforeAcceptance.proof.delivery!.browserChecks!;
  const accepted = accept(beforeAcceptance);
  const frozen = accepted.proof.delivery!.acceptanceEvidence![0];
  assert.equal(frozen.browserReportId, reportA.id);
  const rechecked = recordBrowserChecks(accepted, "seller", input(accepted), later);
  const reportB = rechecked.proof.delivery!.browserChecks!;
  assert.notEqual(reportA.id, reportB.id);
  assert.deepEqual(rechecked.proof.delivery!.acceptanceEvidence![0], frozen);
  const bundle = await createEvidenceExport(rechecked);
  assert.equal((await verifyEvidenceExport(bundle)).consistency, "consistent");
  assert.deepEqual(bundle.delivery.browserCheckHistory!.map(row => row.id), [old.id, reportA.id, reportB.id]);
  assert.equal(bundle.delivery.acceptanceEvidence![0].browserReportId, reportA.id);
  const tampered = structuredClone(bundle);
  const row = tampered.delivery.browserCheckHistory![1].readings.find(reading => reading.kind === "link")!;
  Object.assign(row, {reachedTarget: "contact.html"});
  const checked = await verifyEvidenceExport(tampered);
  assert.equal(checked.checks.find(row => row.id === "reported-observation-consistency")?.status, "inconsistent");
});
