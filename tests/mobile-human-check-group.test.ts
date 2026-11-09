import assert from "node:assert/strict";
import test from "node:test";
import type { Language, ProofQuote } from "../lib/contracts.ts";
import { mobileHumanCheckGroup, selectMobileHumanChecks } from "../lib/mobile-human-check-group.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { applyScopeClarification } from "../lib/scope-clarifications.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import { acceptDeliveryWithBasis as acceptDelivery } from "./acceptance-client.ts";

const at = "2026-11-07T02:00:00.000Z";
const clause = "首页、菜单页和联系页在手机上均可用，正文与导航可阅读及操作，无需横向滚动。";
const requiredPages = ["index.html", "menu.html", "contact.html"];
const html = "<!doctype html><html><head><title>Noodle shop</title></head><body><main>Noodles</main></body></html>";

function fixture({
  mobileClause = clause, version = 2, language = "zh", pages = requiredPages,
  deliveredPages = pages, excludeMobile = false,
}: {
  mobileClause?: string; version?: 1 | 2; language?: Language;
  pages?: string[]; deliveredPages?: string[]; excludeMobile?: boolean;
} = {}): ProofQuote {
  const summary = [
    "网站包含首页、菜单页 menu.html 和联系页 contact.html，首页可打开菜单页和联系页。",
    "菜单页同时展示中文「牛肉面」和英文「Beef noodles」，两种语言所示价格均为 AUD18。",
    "联系页展示营业时间为上午 11 点至晚上 8 点（11am–8pm）。",
    mobileClause,
  ].join("\n");
  const coverage = {
    version, sourceText: summary, confirmed: true,
    decisions: summaryCoverageUnits(summary, version).map(row => excludeMobile && row.text === mobileClause
      ? {id: row.id, disposition: "exclude", reason: "Buyer excluded this requirement from the milestone."}
      : {id: row.id, disposition: "include"}),
  };
  const parsed = parseStaticProject({title: "Noodle shop", summary, amount: "1.00", requiredPages: pages, manualRequirements: [], coverage}, language);
  const files = {...Object.fromEntries(deliveredPages.map(file => [file, html])), "site.css": "main { display: block; }"};
  const delivery = createUploadedDelivery(files, parsed.project, language, 1);
  return {
    id: "noodle-mobile", reference: "PBP-NOODLE", workflow: "proof-v1", title: parsed.title,
    summary, brief: summary, clientName: "Synthetic", currency: "AUD", language,
    hourlyRateCents: 100, totalCents: 100, lineItems: [{id: "site", description: "Test", quantity: 1, unitPriceCents: 100}],
    assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: at,
    proof: {
      project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery,
      review: {deliveryId: delivery.id, mode: "demo", reviewedAt: at, summary: "Rules only"},
      collaboration: {stage: "submitted", submission: {deliveryId: delivery.id, note: "Ready for review", at}, feedback: []},
    },
  };
}

test("the exact locked clause shares a check with the built-in mobile row in both UI languages", () => {
  for (const language of ["zh", "en"] as const) {
    const quote = fixture({language, pages: ["contact.html", "menu.html", "index.html"]});
    assert.deepEqual(mobileHumanCheckGroup(quote), ["mobile", "coverage-4"]);
    assert.equal(quote.proof.criteria.find(criterion => criterion.id === "coverage-4")?.source, clause);
  }
});

test("altered, split, excluded or duplicated scope keeps separate checks", () => {
  for (const quote of [
    fixture({mobileClause: `${clause}另需提供暗色主题。`}),
    fixture({mobileClause: `仅菜单页在手机上可用，正文与导航可阅读及操作，无需横向滚动。`}),
    fixture({mobileClause: `${clause}\n${clause}`}),
    fixture({version: 1}),
    fixture({excludeMobile: true}),
    fixture({pages: [...requiredPages, "about.html"]}),
    fixture({deliveredPages: [...requiredPages, "specials.HTML"]}),
    fixture({deliveredPages: ["index.html", "menu.html"]}),
  ]) assert.equal(mobileHumanCheckGroup(quote), undefined);
});

test("the shortcut requires intact source binding and current human evidence for both rows", () => {
  const changedOriginal = fixture();
  changedOriginal.proof.criteria.find(criterion => criterion.id === "coverage-4")!.source += " 还须支持暗色主题。";
  const changedSystem = fixture();
  changedSystem.proof.criteria.find(criterion => criterion.id === "mobile")!.source += " 还须支持横屏。";
  const staleSource = fixture();
  staleSource.summary += "另需支持横屏。";
  const invalidSpan = fixture();
  invalidSpan.proof.project!.coverage!.decisions.at(-1)!.end--;
  const staleReview = fixture();
  staleReview.proof.review!.deliveryId = "old-version";
  const incomplete = fixture();
  incomplete.proof.delivery!.evidence = incomplete.proof.delivery!.evidence.filter(item => item.criterionId !== "mobile");
  const failed = fixture();
  failed.proof.delivery!.evidence.find(item => item.criterionId === "coverage-4")!.finding = "fail";
  const duplicate = fixture();
  duplicate.proof.delivery!.evidence.push(duplicate.proof.delivery!.evidence.find(item => item.criterionId === "mobile")!);
  for (const quote of [changedOriginal, changedSystem, staleSource, invalidSpan, staleReview, incomplete, failed, duplicate]) {
    assert.equal(mobileHumanCheckGroup(quote), undefined);
  }
});

test("a saved scope proposal for either grouped row disables the shortcut", async () => {
  const quote = fixture();
  for (const id of mobileHumanCheckGroup(quote)!) {
    const criterion = quote.proof.criteria.find(row => row.id === id)!;
    const changed = await applyScopeClarification(quote, "buyer", {
      action: "propose", deliveryId: quote.proof.delivery!.id, criterionId: id, criterionSource: criterion.source,
      expectedLatestId: null, target: {kind: "page", file: "index.html"}, basisNote: "Synthetic page clarification",
    }, at);
    assert.equal(mobileHumanCheckGroup(changed), undefined);
  }
});

test("confirming from either partial state adds only the missing ID and unchecking removes the pair", () => {
  const group = mobileHumanCheckGroup(fixture())!;
  for (const current of [[], [group[0]], [group[1]], [...group]]) {
    const partial = ["coverage-1", ...current, "coverage-2"];
    const checked = selectMobileHumanChecks(partial, group, true);
    assert.deepEqual(checked, [...partial, ...group.filter(id => !partial.includes(id))]);
    assert.deepEqual(selectMobileHumanChecks(checked, group, false), ["coverage-1", "coverage-2"]);
    assert.deepEqual(selectMobileHumanChecks(partial, group, false), ["coverage-1", "coverage-2"]);
  }
});

test("server acceptance still rejects either missing mobile ID and saves both IDs after grouped confirmation", () => {
  const quote = fixture();
  const delivery = quote.proof.delivery!;
  const group = mobileHumanCheckGroup(quote)!;
  const other = delivery.evidence.filter(row => row.finding === "needs_human" && !group.includes(row.criterionId)).map(row => row.criterionId);
  const consent = {confirm: true, deliveryId: delivery.id};
  for (const id of group) {
    assert.throws(() => acceptDelivery(quote, {...consent, manualChecks: [...other, id]}, at), /Confirm each requirement/);
  }
  const accepted = acceptDelivery(quote, {...consent, manualChecks: selectMobileHumanChecks(other, group, true)}, at);
  assert.deepEqual(accepted.proof.collaboration!.acceptance!.manualChecks, delivery.evidence.filter(row => row.finding === "needs_human").map(row => row.criterionId));
  assert.deepEqual(mobileHumanCheckGroup(accepted), group);
});
