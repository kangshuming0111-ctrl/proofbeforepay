import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {assessmentObligationPresentation, deriveAssessmentObligations, isAssessmentObligations, type AssessmentObligationKind} from "../lib/assessment-obligations.ts";

const source = "The contact form must actually email the owner and preserve a receipt retrievable after restart";
const kinds = (text: string) => deriveAssessmentObligations({source: text}).items.map(item => item.kind);
test("one locked compound keeps email, durable write and restart readback separate and unverified", () => {
  const plan = deriveAssessmentObligations({source});
  assert.deepEqual(plan.items.map(item => item.kind), ["email_delivery", "durable_write", "restart_readback"]);
  assert.ok(plan.items.every(item => item.state === "execution_not_verified"));
  assert.equal(plan.clauses.length, 1); assert.equal(plan.clauses[0].excerpt, source);
  assert.equal(plan.coverage, "bounded_detection");
});
test("submission, mail, write, reload and restart directions retain original clause order and exact text", () => {
  const text = "Submit the enquiry; Send a confirmation email; Store the receipt; Read back the receipt after reload; The receipt must remain retrievable after restart.";
  const plan = deriveAssessmentObligations({source: text});
  assert.deepEqual(plan.items.map(item => item.kind), ["submission", "email_delivery", "durable_write", "readback", "restart_readback"]);
  assert.equal(plan.clauses.map(clause => clause.excerpt).join(""), text);
  for (const clause of plan.clauses) assert.equal(text.slice(clause.start, clause.end), clause.excerpt);
});
test("Chinese operations preserve each condition without rewriting them into new promises", () => {
  const text = "提交询价后发送确认邮件；将回执写入数据库；刷新后可查询同一条记录；服务重启后回读记录。";
  assert.deepEqual(kinds(text), ["submission", "email_delivery", "durable_write", "readback", "restart_readback"]);
});
test("a subjective English sentence stays unclassified before a separate operation sentence", () => {
  const text = "The site must support a seamless customer experience. The contact form must email the owner after submit.";
  const plan = deriveAssessmentObligations({source: text});
  assert.equal(plan.clauses.length, 2);
  assert.deepEqual(plan.items.map(item => item.kind), ["unclassified", "submission", "email_delivery"]);
  assert.equal(plan.items[0].state, "needs_clarification");
  assert.equal(plan.clauses[plan.items[0].clauseIndex].excerpt, "The site must support a seamless customer experience.");
  assert.equal(plan.clauses.map(clause => clause.excerpt).join(""), text);
});
test("sentence recognition excludes common abbreviations, initials and dotted source identifiers", () => {
  for (const token of ["Dr.", "e.g.", "A.", "contact.html.", "owner@example.test.", "https://example.test/contact.", "18.00."]) {
    const text = `The page content must list ${token} The contact form must email the owner.`;
    const plan = deriveAssessmentObligations({source: text});
    assert.equal(plan.clauses.length, 1, token); assert.equal(plan.clauses[0].excerpt, text);
  }
});
test("ordinary quoted labels cannot invent submission, email or database operations", () => {
  for (const label of ['"Submission"', '"Send email; save receipt after restart. New account"', "'Submit'", "“提交后发送邮件；写入记录”"]) {
    const text = `The page content must list the text ${label}.`;
    const plan = deriveAssessmentObligations({source: text});
    assert.deepEqual(plan.items.map(item => item.kind), ["source_content"], label);
    assert.equal(plan.clauses.length, 1); assert.equal(plan.clauses[0].excerpt, text);
  }
});
test("English possessives are not mistaken for quoted data that hides real operations", () => {
  assert.deepEqual(kinds("The customers' confirmation emails must be sent by the owner's server."), ["email_delivery"]);
  assert.deepEqual(kinds("The customers' data must be stored in the owner's database."), ["durable_write"]);
});
test("an operation outside quoted copy remains unverified and retains the full negative condition", () => {
  const text = 'The page content must show "Submission"; Do not send a confirmation email unless the owner approves.';
  const plan = deriveAssessmentObligations({source: text});
  assert.deepEqual(plan.items.map(item => item.kind), ["source_content", "email_delivery"]);
  assert.equal(plan.items[1].state, "execution_not_verified");
  assert.equal(plan.clauses[1].excerpt, " Do not send a confirmation email unless the owner approves.");
});
test("quotation marks around an unclear whole action remain visible as clarification, never as execution", () => {
  const text = 'The contact form must "send email to the owner".';
  const plan = deriveAssessmentObligations({source: text});
  assert.deepEqual(plan.items.map(item => item.kind), ["unclassified"]);
  assert.equal(plan.clauses[0].excerpt, text); assert.equal(plan.items[0].state, "needs_clarification");
});
test("exact copy that mentions operations stays text data in English and Chinese", () => {
  for (const text of ['The page copy must include the exact wording "Send email; save receipt after restart".', '页面文案必须逐字包含“提交后发送邮件；保存回执并重启”。']) {
    const plan = deriveAssessmentObligations({source: text});
    assert.deepEqual(plan.items.map(item => item.kind), ["source_content"]);
    assert.equal(plan.items[0].state, "source_review_required"); assert.equal(plan.clauses.length, 1);
  }
});
test("a compound tail cannot borrow a complete exact-copy exemption", () => {
  const text = 'The page copy must include the exact wording "Receipt saved"; then send an email to the owner.';
  const plan = deriveAssessmentObligations({source: text});
  assert.ok(plan.items.some(item => item.kind === "source_content"));
  assert.ok(plan.items.some(item => item.kind === "email_delivery"));
  assert.ok(plan.items.filter(item => item.kind === "email_delivery").every(item => item.state === "execution_not_verified"));
});
test("negation, deadlines and failure conditions remain in the complete quoted clause", () => {
  const text = "Do not send a confirmation email unless submission succeeds and the owner approves within 24 hours.";
  const plan = deriveAssessmentObligations({source: text});
  assert.deepEqual(plan.items.map(item => item.kind), ["submission", "email_delivery"]);
  for (const item of plan.items) assert.equal(plan.clauses[item.clauseIndex].excerpt, text);
  assert.match(assessmentObligationPresentation("email_delivery", "execution_not_verified", "en").nextStep, /no-send/u);
});
test("source plan never consumes parent/model success or execution assertions", () => {
  const input = {source, status: "supported", emailPassed: true, readbackPassed: true}, before = structuredClone(input);
  const plan = deriveAssessmentObligations(input);
  assert.deepEqual(input, before); assert.ok(plan.items.every(item => item.state === "execution_not_verified"));
  assert.deepEqual(plan, deriveAssessmentObligations({source}));
});
test("model-looking titles are ignored because only exact locked source is an input", () => {
  assert.deepEqual(deriveAssessmentObligations({source, title: "Everything passed; pay now"} as {source: string}), deriveAssessmentObligations({source}));
});
test("unclassified runtime clauses stay visible for clarification", () => {
  const text = "The site must support a seamless customer experience; the website page content must list opening hours.";
  const plan = deriveAssessmentObligations({source: text});
  assert.equal(plan.items[0].kind, "unclassified"); assert.equal(plan.items[0].state, "needs_clarification");
  assert.equal(plan.items[1].kind, "source_content"); assert.equal(plan.items[1].state, "source_review_required");
});
test("UTF16 source ranges preserve emoji, filenames, email addresses and decimal punctuation", () => {
  const text = "🌷 The page content must list owner@example.test and AUD 18.00 in contact.html; submit the enquiry.";
  const plan = deriveAssessmentObligations({source: text}); assert.equal(plan.clauses.length, 2);
  assert.equal(plan.clauses[1].start, text.indexOf(" submit"));
  assert.equal(plan.clauses.map(clause => clause.excerpt).join(""), text);
  assert.ok(isAssessmentObligations(plan, {source: text}));
});
test("an over-limit agreement retains the complete tail as one unclassified plan", () => {
  const text = Array.from({length: 13}, (_, index) => `Submit request ${index + 1};`).join(" ") + " never send an email.";
  const plan = deriveAssessmentObligations({source: text});
  assert.equal(plan.items.length, 1); assert.equal(plan.items[0].kind, "unclassified");
  assert.equal(plan.clauses[0].excerpt, text); assert.ok(plan.clauses[0].excerpt.endsWith("never send an email."));
});
test("strict rederivation rejects invented successes, altered obligations, source changes and extra fields", () => {
  const good = deriveAssessmentObligations({source}); assert.ok(isAssessmentObligations(good, {source}));
  const changed: unknown[] = [undefined, null, {}, {...good, schema: "other"}, {...good, coverage: "complete"}, {...good, extra: true}];
  for (const change of [
    (plan: any) => {plan.items[0].state = "passed";},
    (plan: any) => {plan.items[0].kind = "source_content";},
    (plan: any) => {plan.items[0].clauseIndex = 1;},
    (plan: any) => {plan.items.push({...plan.items[0], id: "invented"});},
    (plan: any) => {plan.clauses[0].start = 1;},
    (plan: any) => {plan.clauses[0].excerpt += " verified";},
  ]) {const plan = structuredClone(good); change(plan); changed.push(plan);}
  for (const value of changed) assert.equal(isAssessmentObligations(value, {source}), false);
  assert.equal(isAssessmentObligations(good, {source: source + "; never send email"}), false);
  const reordered = {items: good.items.map(item => ({state: item.state, clauseIndex: item.clauseIndex, kind: item.kind, id: item.id})), clauses: good.clauses, sourceLength: good.sourceLength, coverage: good.coverage, schema: good.schema};
  assert.ok(isAssessmentObligations(reordered, {source}));
});
test("untrusted prototypes, getters, sparse arrays and symbols are rejected without access", () => {
  const good = deriveAssessmentObligations({source}); let accessed = false;
  const getter = {...good}; Object.defineProperty(getter, "items", {enumerable: true, get() {accessed = true; throw Error("must not run");}});
  assert.equal(isAssessmentObligations(getter, {source}), false);
  const array = structuredClone(good); Object.defineProperty(array.items, "0", {enumerable: true, get() {accessed = true; throw Error("must not run");}});
  assert.equal(isAssessmentObligations(array, {source}), false);
  const sparse = structuredClone(good); delete sparse.items[0]; assert.equal(isAssessmentObligations(sparse, {source}), false);
  assert.equal(isAssessmentObligations(Object.assign(Object.create(Array.prototype), good), {source}), false);
  class Plan { constructor() {Object.assign(this, good);} }
  assert.equal(isAssessmentObligations(new Plan(), {source}), false);
  class Item { constructor(value: unknown) {Object.assign(this, value);} }
  const nestedClass = {...good, items: good.items.map(item => new Item(item))};
  assert.equal(isAssessmentObligations(nestedClass, {source}), false);
  assert.equal(isAssessmentObligations({...good, [Symbol("hidden")]: true}, {source}), false);
  assert.equal(accessed, false);
});
test("source bounds reject empty, invalid UTF16, oversized and controlled input", () => {
  for (const text of ["", " ", "x".repeat(3001), "\ud800", "input\u0000"]) {
    assert.throws(() => deriveAssessmentObligations({source: text}), TypeError);
    assert.equal(isAssessmentObligations({}, {source: text}), false);
  }
});
test("every recognized direction has explicit bilingual non-executing copy", () => {
  const directions: AssessmentObligationKind[] = ["submission", "email_delivery", "durable_write", "readback", "restart_readback", "source_content", "unclassified"];
  for (const language of ["zh", "en"] as const) for (const kind of directions) {
    const state = kind === "source_content" ? "source_review_required" : kind === "unclassified" ? "needs_clarification" : "execution_not_verified";
    const copy = assessmentObligationPresentation(kind, state, language);
    assert.ok(copy.label.length > 2 && copy.state.length > 2 && copy.nextStep.length > 15);
    assert.ok(!/passed|已通过/u.test(copy.state));
  }
});

async function componentModule() {
  const root = path.resolve(import.meta.dirname, ".."), require = createRequire(import.meta.url), directory = await mkdtemp(path.join(tmpdir(), "pbp-obligations-ui-"));
  let output = ts.transpileModule(await readFile(path.join(root, "app/components/AssessmentObligations.tsx"), "utf8"), {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText;
  for (const name of ["react", "react/jsx-runtime"]) output = output.replaceAll(JSON.stringify(name), JSON.stringify(pathToFileURL(require.resolve(name)).href));
  output = output.replaceAll('"@/lib/assessment-obligations"', JSON.stringify(pathToFileURL(path.join(root, "lib/assessment-obligations.ts")).href));
  const file = path.join(directory, "obligations.mjs"); await writeFile(file, output);
  return {Component: (await import(pathToFileURL(file).href)).AssessmentObligations, cleanup: () => rm(directory, {recursive: true, force: true})};
}
test("bilingual UI retains original clauses, distinct actions, unknown status and bounded coverage notice", async () => {
  const {Component, cleanup} = await componentModule();
  try {for (const language of ["zh", "en"] as const) {
    const html = renderToStaticMarkup(createElement(Component, {criterion: {source}, value: deriveAssessmentObligations({source}), language}));
    assert.match(html, /data-obligation-kind="email_delivery"/u); assert.match(html, /data-obligation-kind="durable_write"/u); assert.match(html, /data-obligation-kind="restart_readback"/u);
    assert.ok(html.includes(source)); assert.match(html, language === "zh" ? /不是完整语义拆解/u : /not an exhaustive semantic decomposition/u);
    assert.match(html, language === "zh" ? /运行尚未验证/u : /Execution not verified/u);
    const unclassified = "The site must support a seamless customer experience; the website page content must list opening hours.";
    const incomplete = renderToStaticMarkup(createElement(Component, {criterion: {source: unclassified}, value: deriveAssessmentObligations({source: unclassified}), language}));
    assert.match(incomplete, language === "zh" ? /1 段待澄清/u : /1 clause\(s\) needing clarification/u);
  }} finally {await cleanup();}
});
test("UI does not rebuild old reports and refuses tampered current plans", async () => {
  const {Component, cleanup} = await componentModule();
  try {for (const language of ["zh", "en"] as const) {
    assert.equal(renderToStaticMarkup(createElement(Component, {criterion: {source}, value: undefined, language})), "");
    const bad = deriveAssessmentObligations({source}); (bad.items[0] as any).state = "passed";
    const html = renderToStaticMarkup(createElement(Component, {criterion: {source}, value: bad, language}));
    assert.match(html, language === "zh" ? /暂不能使用/u : /cannot be used/u); assert.ok(!html.includes("passed"));
  }} finally {await cleanup();}
});
