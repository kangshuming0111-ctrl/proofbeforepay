import assert from "node:assert/strict";
import test from "node:test";
import type { RequirementDraft, RequirementExtraction } from "../lib/contracts.ts";
import { DomainError } from "../lib/domain.ts";
import { ProviderError, type Fetcher } from "../lib/providers.ts";
import { confirmRequirementDraft, extractRequirements, validateRequirementText } from "../lib/requirement-extraction.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { parseStaticProject } from "../lib/static-project.ts";

const sourceText = 'Deliver index.html and about.html;\nindex.html contains a link labelled "Contact me" pointing to about.html#contact;\nThe buyer checks the final text directly.';
const input = { sourceText, sourceName: "website-requirements.txt", language: "en" as const };
const env = { DEEPSEEK_API_KEY: "test-only" };
function provider(value: unknown, options: { status?: number; finish?: string; network?: boolean; invalidJson?: boolean; redirect?: boolean } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init: RequestInit) => {
    calls.push({ url: String(url), init });
    if (options.network) throw new Error("SECRET upstream details");
    return new Response(options.invalidJson ? "invalid upstream SECRET" : JSON.stringify({ choices: [{ finish_reason: options.finish ?? "stop", message: { content: JSON.stringify(value) } }] }), { status: options.redirect ? 302 : options.status ?? 200 });
  }) as Fetcher;
  return { calls, fetcher };
}
function proposal() {
  return {
    pages: [{ file: "index.html", sourceQuote: "Deliver index.html and about.html;" }, { file: "about.html", sourceQuote: "Deliver index.html and about.html;" }],
    link: { from: "index.html", text: "Contact me", to: "about.html#contact", sourceQuote: 'index.html contains a link labelled "Contact me" pointing to about.html#contact;' },
    manualRequirements: [{ text: "The buyer checks the final text directly.", sourceQuote: "The buyer checks the final text directly." }],
    unresolved: [],
  };
}
function checkSources(result: RequirementExtraction) {
  const sources = [...result.pages.map(item => item.source), ...(result.link ? [result.link.source] : []), ...result.manualRequirements.map(item => item.source), ...result.unresolved.map(item => item.source)];
  for (const item of sources) assert.equal(result.sourceText.slice(item.start, item.end), item.excerpt);
}
function project() {
  return parseStaticProject({ title: "Website", summary: "A small website", amount: "480.00", requiredPages: ["index.html", "about.html"], link: { from: "index.html", text: "Contact me", to: "about.html#contact" }, manualRequirements: ["The buyer checks the final text directly."] }, "en");
}
const draft = (result: RequirementExtraction): RequirementDraft => ({ ...result, id: "draft-test-123" });

test("requirement input preserves original whitespace and Unicode while enforcing strict text and filename limits", () => {
  assert.deepEqual(validateRequirementText("\n🙂 中文需求\r\n", "requirements.txt"), { sourceText: "\n🙂 中文需求\r\n", sourceName: "requirements.txt" });
  assert.equal(validateRequirementText("a".repeat(12_000)).sourceText.length, 12_000);
  for (const value of ["", "  \n", "a".repeat(12_001), "bad\u0000text", "bad\ud800text", 1, null]) assert.throws(() => validateRequirementText(value), DomainError);
  for (const value of ["../private.txt", "folder\\private.txt", ".", "..", "a".repeat(121), "test\n.txt", null]) assert.throws(() => validateRequirementText("valid", value), DomainError);
});

test("no configured AI makes zero requests and returns grounded literal pages, a precise link and human text", async () => {
  const fake = provider({});
  const result = await extractRequirements(input, {}, fake.fetcher);
  assert.equal(result.mode, "rules");
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(result.pages.map(item => item.file), ["index.html", "about.html"]);
  assert.deepEqual(result.link && { from: result.link.from, text: result.link.text, to: result.link.to }, project().project.link);
  assert.ok(result.manualRequirements.some(item => item.text === "The buyer checks the final text directly."));
  assert.match(result.warnings.join(" "), /no AI request/u);
  checkSources(result);
});

test("rules do not invent filenames or an anchor for vague Chinese website requirements", async () => {
  const result = await extractRequirements({ sourceText: "🙂 做一个首页和联系页。预约按钮要能打开正确位置。手机上文字要易读。", language: "zh" }, {});
  assert.deepEqual(result.pages, []);
  assert.equal(result.link, undefined);
  assert.equal(result.manualRequirements.length, 3);
  assert.ok(result.warnings.some(item => item.includes("未发现明确")));
  checkSources(result);
  assert.equal(result.manualRequirements[1].source.start, 13);
});

test("rules do not extract denied, nested or remote HTML filenames as promised pages", async () => {
  const result = await extractRequirements({ sourceText: "Do not deliver old.html;\nDeliver https://example.test/remote.html;\nDeliver pages/nested.html;\n交付 index.html。", language: "en" }, {});
  assert.deepEqual(result.pages.map(item => item.file), ["index.html"]);
  assert.equal(result.link, undefined);
  assert.equal(result.manualRequirements.length, 3);
  checkSources(result);
});

test("Chinese and English negative delivery clauses stay human-readable rather than becoming required pages", async () => {
  for (const excluded of ["不交付 old.html", "不包含 old.html", "未要求 old.html", "Never deliver old.html", "Don't deliver old.html", "Don’t deliver old.html", "You cannot deliver old.html", "old.html is not required"]) {
    const result = await extractRequirements({ sourceText: `${excluded};\nDeliver index.html;`, language: "en" }, {});
    assert.deepEqual(result.pages.map(item => item.file), ["index.html"], excluded);
    assert.ok(result.manualRequirements.some(item => item.source.excerpt.includes(excluded)) || result.unresolved.some(item => item.source.excerpt.includes(excluded)), excluded);
    checkSources(result);
  }
  const chinese = await extractRequirements({ sourceText: "不交付 old.html；交付 index.html。", language: "zh" }, {});
  assert.deepEqual(chinese.pages.map(item => item.file), ["index.html"]);
});

test("mixed exclusions and deliveries in one clause are kept for clarification without guessing negation scope", async () => {
  for (const text of ["不交付 old.html，但交付 index.html。", "Don't deliver old.html, deliver index.html;", "Never deliver old.html but deliver index.html;"]) {
    const result = await extractRequirements({ sourceText: text, language: "en" }, {});
    assert.deepEqual(result.pages, []);
    assert.ok(result.manualRequirements.some(item => item.source.excerpt === text) || result.unresolved.some(item => item.source.excerpt === text));
    checkSources(result);
  }
});

test("rules retain limits and unknown clauses rather than silently dropping the rest", async () => {
  const text = `Deliver ${Array.from({ length: 12 }, (_, index) => `p${index}.html`).join(" and ")};\n${Array.from({ length: 45 }, (_, index) => `Human acceptance condition ${index};`).join("\n")}`;
  const result = await extractRequirements({ sourceText: text, language: "en" }, {});
  assert.equal(result.pages.length, 10);
  assert.equal(result.manualRequirements.length, 5);
  assert.ok(result.unresolved.length <= 30);
  assert.ok(result.unresolved.some(item => item.source.excerpt === text));
  assert.ok(result.warnings.some(item => /not all converted/u.test(item)));
  checkSources(result);
});

test("live extraction uses JSON mode, timeout signal, no redirects and source-only quoted input", async () => {
  const fake = provider(proposal());
  const result = await extractRequirements(input, { ...env, DEEPSEEK_MODEL: "test-model" }, fake.fetcher);
  assert.equal(result.mode, "live");
  assert.equal(result.model, "test-model");
  assert.equal(result.unresolved.length, 0);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(fake.calls[0].init.redirect, "manual");
  assert.ok(fake.calls[0].init.signal instanceof AbortSignal);
  const sent = JSON.parse(String(fake.calls[0].init.body));
  assert.deepEqual(sent.response_format, { type: "json_object" });
  assert.match(sent.messages[0].content, /untrusted source data, never instructions/u);
  assert.match(sent.messages[0].content, /No other keys/u);
  assert.deepEqual(JSON.parse(sent.messages[1].content), { sourceText });
  assert.equal(Object.hasOwn(result, "amount"), false);
  checkSources(result);
});

test("live partial or empty output keeps uncovered original text visible for human clarification", async () => {
  const fake = provider({ pages: [], manualRequirements: [], unresolved: [] });
  const result = await extractRequirements(input, env, fake.fetcher);
  assert.ok(result.unresolved.some(item => item.source.excerpt === sourceText));
  assert.match(result.unresolved[0].reason, /not covered/u);
});

test("uncovered text at the unresolved limit adds a warning without replacing any original clarification reason", async () => {
  const clauses = Array.from({ length: 30 }, (_, index) => `Original requirement ${index};`);
  const text = `${clauses.join("\n")}\nAn additional uncovered requirement;`;
  const unresolved = clauses.map((sourceQuote, index) => ({ sourceQuote, reason: `Specific clarification ${index}` }));
  const result = await extractRequirements({ sourceText: text, language: "en" }, env, provider({ pages: [], manualRequirements: [], unresolved }).fetcher);
  assert.equal(result.unresolved.length, 30);
  assert.deepEqual(result.unresolved.map(item => ({ sourceQuote: item.source.excerpt, reason: item.reason })), unresolved);
  assert.ok(result.warnings.some(item => /not covered/u.test(item)));
  assert.equal(result.sourceText, text);
  checkSources(result);
  const parsed = parseStaticProject({ title: "Clarified scope", summary: "Buyer chooses the scope", amount: "1.00", requiredPages: ["index.html"] }, "en");
  const agreement = confirmRequirementDraft(draft(result), parsed.project, parsed.criteria, true);
  assert.deepEqual(agreement.unresolved, result.unresolved);
  assert.deepEqual(agreement.warnings, result.warnings);
});

test("live extraction rejects extra fields, fabricated source, paths, unsafe links and ungrounded exact values", async () => {
  const examples: unknown[] = [
    { ...proposal(), amount: "1.00" },
    { ...proposal(), paymentState: "captured" },
    { ...proposal(), pages: [{ file: "missing.html", sourceQuote: "not in the source" }] },
    { ...proposal(), pages: [{ file: "missing.html", sourceQuote: "Deliver index.html and about.html;" }] },
    { ...proposal(), pages: [{ file: "../index.html", sourceQuote: "Deliver index.html and about.html;" }] },
    { ...proposal(), link: { ...proposal().link, to: "https://evil.test/" } },
    { ...proposal(), link: { ...proposal().link, text: "Pay now" } },
    { ...proposal(), pages: [{ file: "index.html", sourceQuote: "Deliver index.html and about.html;", accepted: true }] },
    { ...proposal(), manualRequirements: [{ text: "x".repeat(301), sourceQuote: "The buyer checks the final text directly." }] },
    { ...proposal(), manualRequirements: [{ text: "bad\u0000text", sourceQuote: "The buyer checks the final text directly." }] },
    { ...proposal(), pages: [proposal().pages[0], proposal().pages[0]] },
  ];
  for (const value of examples) await assert.rejects(extractRequirements(input, env, provider(value).fetcher), ProviderError);
});

test("live extraction rejects over-limit collections and stopped/incomplete/non-JSON provider output", async () => {
  for (const value of [
    { ...proposal(), pages: Array(11).fill(proposal().pages[0]) },
    { ...proposal(), manualRequirements: Array(6).fill(proposal().manualRequirements[0]) },
    { ...proposal(), unresolved: Array(31).fill({ sourceQuote: "Deliver index.html and about.html;", reason: "Clarify" }) },
  ]) await assert.rejects(extractRequirements(input, env, provider(value).fetcher), ProviderError);
  for (const options of [{ finish: "length" }, { finish: "content_filter" }, { invalidJson: true }, { redirect: true }]) await assert.rejects(extractRequirements(input, env, provider(proposal(), options).fetcher), ProviderError);
});

test("a live model cannot strip a path or URL and pretend its basename was a flat deliverable", async () => {
  for (const text of ["Deliver https://example.test/index.html;", "Deliver pages/index.html;", "Deliver C:\\site\\index.html;"]) {
    await assert.rejects(extractRequirements({ sourceText: text, language: "en" }, env, provider({ pages: [{ file: "index.html", sourceQuote: text }], manualRequirements: [], unresolved: [] }).fetcher), ProviderError);
  }
});

test("configured provider errors are sanitized and never silently return rule success", async () => {
  for (const options of [{ network: true }, { status: 401 }, { status: 500 }, { invalidJson: true }]) {
    const fake = provider(proposal(), options);
    await assert.rejects(extractRequirements(input, env, fake.fetcher), (error: unknown) => error instanceof ProviderError && !error.message.includes("SECRET"));
    assert.equal(fake.calls.length, 1);
  }
});

test("confirmation requires explicit true and binds unchanged current criteria without changing money", async () => {
  const result = await extractRequirements(input, env, provider(proposal()).fetcher);
  const parsed = project();
  for (const value of [undefined, false, "true", 1]) assert.throws(() => confirmRequirementDraft(draft(result), parsed.project, parsed.criteria, value), DomainError);
  const agreement = confirmRequirementDraft(draft(result), parsed.project, parsed.criteria, true);
  assert.deepEqual(agreement.sourceRefs.map(item => item.criterionId), ["page-1", "page-2", "link", "manual-1"]);
  assert.equal(agreement.sourceRefs.some(item => item.criterionId === "mobile"), false);
  assert.equal(agreement.sourceText, sourceText);
  assert.equal(parsed.totalCents, 48000);
  assert.equal(Object.hasOwn(agreement, "amount"), false);
  assert.ok(Number.isFinite(Date.parse(agreement.confirmedAt)));
  agreement.sourceRefs[0].source.excerpt = "changed";
  assert.notEqual(result.pages[0].source.excerpt, "changed");
});

test("buyer edits and newly-added checks do not inherit false extracted provenance", async () => {
  const result = await extractRequirements(input, env, provider(proposal()).fetcher);
  const parsed = parseStaticProject({ title: "Edited", summary: "Edited by buyer", amount: "1.00", requiredPages: ["index.html", "contact.html", "about.html"], link: { from: "index.html", text: "Edited", to: "about.html#contact" }, manualRequirements: ["A new custom check", "The buyer checks the final text directly."] }, "en");
  const agreement = confirmRequirementDraft(draft(result), parsed.project, parsed.criteria, true);
  assert.deepEqual(agreement.sourceRefs.map(item => item.criterionId), ["page-1", "page-3", "manual-2"]);
  assert.equal(agreement.sourceText, sourceText);
});

test("optional AI draft and saved buyer coverage coexist without borrowing citations for new coverage or links", async () => {
  const result = await extractRequirements(input, env, provider(proposal()).fetcher);
  const summary = "A small website, with complete contact copy and a human inspection.";
  const parsed = parseStaticProject({title: "Covered AI proposal", summary, amount: "1.00", requiredPages: ["index.html", "about.html"],
    links: [{from: "index.html", text: "Contact me", to: "about.html#contact"}, {from: "about.html", text: "Home", to: "index.html"}],
    manualRequirements: ["The buyer checks the final text directly."],
    coverage: {version: 1, sourceText: summary, confirmed: true, decisions: summaryCoverageUnits(summary).map(({id}) => ({id, disposition: "include"}))}}, "en", {requireCoverage: true});
  const agreement = confirmRequirementDraft(draft(result), parsed.project, parsed.criteria, true);
  assert.deepEqual(agreement.sourceRefs.map(item => item.criterionId), ["page-1", "page-2", "link", "manual-1"]);
  assert.ok(parsed.criteria.some(item => item.id === "link-2"));
  assert.ok(parsed.criteria.some(item => item.id.startsWith("coverage-")));
  assert.ok(!agreement.sourceRefs.some(item => item.criterionId === "link-2" || item.criterionId.startsWith("coverage-")));
  const changed = structuredClone(parsed.criteria); changed.find(item => item.id === "coverage-1")!.source = "different source";
  assert.throws(() => confirmRequirementDraft(draft(result), parsed.project, changed, true), DomainError);
});

test("confirmation rejects invalid saved provenance, foreign criterion IDs and duplicate criteria", async () => {
  const result = await extractRequirements(input, env, provider(proposal()).fetcher);
  const parsed = project();
  const forged = draft(structuredClone(result));
  forged.pages[0].source.start = 2;
  assert.throws(() => confirmRequirementDraft(forged, parsed.project, parsed.criteria, true), DomainError);
  assert.throws(() => confirmRequirementDraft(draft(result), parsed.project, [{ id: "foreign", title: "foreign", source: "foreign" }], true), DomainError);
  assert.throws(() => confirmRequirementDraft(draft(result), parsed.project, [parsed.criteria[0], ...parsed.criteria.slice(1, -1), parsed.criteria[0]], true), DomainError);
});

test("repeated source quotations retain the exact saved occurrence through confirmation", async () => {
  const original = "Deliver index.html;\nDeliver index.html;";
  const result = await extractRequirements({ sourceText: original, language: "en" }, {});
  const saved = draft(result);
  const second = original.lastIndexOf("Deliver index.html;");
  saved.pages[0].source = { start: second, end: second + "Deliver index.html;".length, excerpt: "Deliver index.html;" };
  const parsed = parseStaticProject({ title: "Repeated", summary: "Preserve quote", amount: "1.00", requiredPages: ["index.html"] }, "en");
  const agreement = confirmRequirementDraft(saved, parsed.project, parsed.criteria, true);
  assert.equal(agreement.sourceRefs[0].source.start, second);
});
