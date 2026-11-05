import assert from "node:assert/strict";
import test from "node:test";
import type {ProofBusinessExpected, ProofQuote} from "../lib/contracts.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {createSourceBusinessEvidenceCheck, sourceBusinessEvidenceExplanation} from "../lib/source-business-evidence.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";

const html = (body: string, head = "") => `<!doctype html><html><head><title>Menu</title>${head}</head><body>${body}</body></html>`;
const price: ProofBusinessExpected = {kind: "item_price", label: "Beef noodles", currency: "AUD", amountMinor: 1800};
function savedPlan(expectations: {expected: ProofBusinessExpected; file?: string}[] = [{expected: price}]) {
  const summary = "Display the agreed menu prices and phone text.";
  const unit = summaryCoverageUnits(summary)[0], pages = [...new Set(["index.html", ...expectations.map(row => row.file ?? "index.html")])];
  const parsed = parseStaticProject({title: "Synthetic menu", summary, amount: "1.00", requiredPages: pages, manualRequirements: [],
    coverage: {version: 1, sourceText: summary, confirmed: true, decisions: [{id: unit.id, disposition: "include"}]},
    businessChecks: {confirmed: true, items: expectations.map((row, index) => ({id: `business-${index + 1}`, criterionId: unit.id,
      file: row.file ?? "index.html", source: {start: unit.start, end: unit.end, excerpt: unit.text}, expected: row.expected}))}}, "en");
  const delivery = createUploadedDelivery(Object.fromEntries(pages.map(file => [file, html("<p>Source fixture</p>")])), parsed.project, "en", 1);
  const quote: ProofQuote = {id: "source-business", reference: "PBP-SYNTHETIC", title: parsed.title, summary, brief: summary, clientName: "Synthetic", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100,
    lineItems: [{id: "test", description: "Synthetic", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: "2026-11-05T00:00:00.000Z", workflow: "proof-v1",
    proof: {project: parsed.project, criteria: parsed.criteria, delivery, paymentState: "unfunded", audit: []}};
  return getBusinessCheckPlan(quote);
}
function evaluate(source: string, expectations = [{expected: price}], extra: Record<string, string> = {}) {
  return createSourceBusinessEvidenceCheck({"index.html": source, ...extra}, savedPlan(expectations))("coverage-1");
}

test("confirmed explicit ISO amount/currency differences own exact source citations without changing saved expectations", () => {
  for (const observed of ["AUD 16", "AUD 18.01", "USD 18"]) {
    const source = html(`🍜<p>Beef noodles ${observed}</p>`), plan = savedPlan(), before = structuredClone(plan);
    const evidence = createSourceBusinessEvidenceCheck({"index.html": source}, plan)("coverage-1");
    assert.equal(evidence.kind, "mismatch");
    assert.equal(evidence.checks.length, 1); assert.equal(evidence.checks[0].reason, "explicit_iso_price_differs");
    assert.equal(evidence.citations.length, 1);
    const citation = evidence.citations[0]; assert.equal(citation.excerpt, `<p>Beef noodles ${observed}</p>`);
    assert.equal(source.slice(citation.start, citation.end), citation.excerpt); assert.deepEqual(plan, before);
    assert.match(sourceBusinessEvidenceExplanation(evidence, "en"), /limited source mismatch/);
    assert.match(sourceBusinessEvidenceExplanation(evidence, "zh"), /有限源码差异/);
  }
});

test("matching simple source is only unchanged and does not infer decimal formatting or language commitments", () => {
  for (const observed of ["AUD18", "AUD 18", "AUD 18.0", "AUD 18.00"]) assert.equal(evaluate(html(`<p>Beef noodles ${observed}</p>`)).kind, "unchanged", observed);
  assert.equal(createSourceBusinessEvidenceCheck({"index.html": html("<p>Beef noodles AUD16</p>")}, [])("coverage-1").kind, "not_applicable");
  assert.equal(createSourceBusinessEvidenceCheck({"index.html": html("<p>Beef noodles AUD16</p>")}, savedPlan())("manual-99").kind, "not_applicable");
});

test("every confirmed same-criterion check is inspected once across viewport duplicates", () => {
  const expectations = [{expected: price}, {expected: price, file: "menu.html"}, {expected: {kind: "visible_copy", text: "+61 3 1234 5678"} as ProofBusinessExpected}];
  const files = {"index.html": html("<p>Beef noodles AUD18</p><p>Phone: +61 3 1234 5678</p>"), "menu.html": html("<li>Beef noodles AUD16</li>")};
  const evidence = createSourceBusinessEvidenceCheck(files, savedPlan(expectations))("coverage-1");
  assert.equal(evidence.kind, "mismatch");
  assert.deepEqual(evidence.checks.map(row => row.kind), ["unchanged", "mismatch", "unchanged"]);
  assert.deepEqual(evidence.citations.map(row => row.file), ["menu.html"]);
  const missingCopy = {...files, "index.html": html("<p>Beef noodles AUD18</p>")};
  const unknown = createSourceBusinessEvidenceCheck(missingCopy, savedPlan(expectations))("coverage-1");
  assert.equal(unknown.kind, "mismatch");
  assert.deepEqual(unknown.checks.map(row => row.kind), ["unchanged", "mismatch", "unknown"]);
  assert.equal(createSourceBusinessEvidenceCheck({...missingCopy, "menu.html": html("<p>Beef noodles AUD18</p>")}, savedPlan(expectations))("coverage-1").kind, "unknown");
});

test("literal confirmed copy is checked without silently skipping it or claiming rendered visibility", () => {
  const expectations = [{expected: {kind: "visible_copy", text: "Phone +61 3 1234 5678"} as ProofBusinessExpected}];
  assert.equal(evaluate(html("<p>Phone +61 3 1234 5678</p>"), expectations).kind, "unchanged");
  for (const body of ["<p>Different phone</p>", "<p>Phone <span>+61 3 1234 5678</span></p>", "<p>Phone +61 3 1234 5678</p><p>Phone +61 3 1234 5678</p>", "<div>Phone +61 3 1234 5678</div>"]) assert.equal(evaluate(html(body), expectations).kind, "unknown", body);
});

test("duplicate labels, compound SKUs, tables, split blocks and inline structures abstain rather than allege a wrong price", () => {
  for (const body of [
    "<p>Beef noodles AUD16</p><p>Beef noodles AUD18</p>",
    "<h2>Beef noodles</h2><p>Beef noodles AUD16</p>",
    "<p hidden>Beef noodles AUD18</p><p>Beef noodles AUD16</p>",
    "<p>Beef noodles large AUD16</p>", "<p>Beef noodles AUD16 / AUD18</p>",
    "<p>Beef noodles</p><p>AUD16</p>", "<p>Beef noodles <span>AUD16</span></p>",
    "<table><tr><td>Beef noodles</td><td>AUD16</td></tr></table>",
    "<table><tr><td><p>Beef noodles AUD16</p></td></tr></table>",
    "<li><p>Beef noodles AUD16</p><p>Dessert AUD10</p></li>",
    "<p>Large Beef noodles AUD16</p>", "<p>Beef noodles AUD16 per serving</p>",
    "<p hidden>Beef noodles AUD16</p>", "<div inert><p>Beef noodles AUD16</p></div>", "<p aria-hidden=\"true\">Beef noodles AUD16</p>",
  ]) assert.equal(evaluate(html(body)).kind, "unknown", body);
});

test("noncanonical, inferred or unsafe monetary forms remain unknown", () => {
  for (const value of ["$16", "16 AUD", "AUD 016", "AUD -16", "AUD +16", "AUD 1,600", "AUD16.000", "AUD 16.", "AUD16 USD18", "aud16", "ＡＵＤ１６", "￥５９９", "AUD 9007199254740991", "EUR16"]) assert.equal(evaluate(html(`<p>Beef noodles ${value}</p>`)).kind, "unknown", value);
});

test("dynamic, generated, unresolved or unsupported source uncertainty vetoes every source interpretation", () => {
  for (const source of [
    html("<p>Beef noodles AUD16</p><script>document.body.textContent='x'</script>"),
    html("<p>Beef noodles AUD16</p><template><p>Menu</p></template>"),
    html("<p>Beef noodles AUD16</p><iframe src='frame.html'></iframe>"),
    html("<p onclick='x()'>Beef noodles AUD16</p>"),
    html("<p>Beef noodles AUD16</p>", "<link rel='stylesheet' href='missing.css'>"),
    html("<p>Beef noodles AUD16</p>", "<link rel='stylesheet' href='https://example.invalid/a.css'>"),
    html("<p>Beef noodles AUD16</p>", "<style>p:after {content:'AUD18'}</style>"),
    html("<p>Beef noodles AUD16</p>", "<style>@import 'other.css';</style>"),
    html("<p>Beef noodles AUD16</p>", "<style>p{co\\6cor:red}</style>"),
  ]) assert.equal(evaluate(source).kind, "unknown", source);
  assert.equal(evaluate(html("<p>Beef noodles AUD16</p>"), [{expected: price}], {"site.css": "p:after{content:'AUD18'}"}).kind, "unknown");
  assert.equal(createSourceBusinessEvidenceCheck({}, savedPlan())("coverage-1").kind, "unknown");
});

test("source span bounds, invalid parsing and deep traversal budgets fail conservatively", () => {
  assert.equal(evaluate(html(`<p${" ".repeat(500)}>Beef noodles AUD16</p>`)).kind, "unknown");
  assert.equal(evaluate(html("<p>Beef noodles AUD16")).kind, "unknown");
  assert.equal(evaluate(html(`${"<div>".repeat(514)}<p>Beef noodles AUD16</p>${"</div>".repeat(514)}`)).kind, "unknown");
  assert.equal(evaluate(html(`<p>Beef noodles AUD16</p><!--${"x".repeat(262_144)}-->`)).kind, "unknown");
  assert.equal(createSourceBusinessEvidenceCheck(Object.fromEntries(Array.from({length: 41}, (_, i) => [i ? `file-${i}.css` : "index.html", i ? "p{}" : html("<p>Beef noodles AUD16</p>")])), savedPlan())("coverage-1").kind, "unknown");
});

test("entity-decoded labels retain exact raw UTF-16 citation offsets and checker snapshots its inputs", () => {
  const expected: ProofBusinessExpected = {kind: "item_price", label: "Noodles & soup", currency: "AUD", amountMinor: 1800};
  const source = html("🍜<p>Noodles &amp; soup AUD16</p>"), files = {"index.html": source}, plan = savedPlan([{expected}]);
  const check = createSourceBusinessEvidenceCheck(files, plan);
  files["index.html"] = html("<p>Noodles &amp; soup AUD18</p>");
  plan[0].expected = {kind: "visible_copy", text: "changed"};
  const evidence = check("coverage-1"); assert.equal(evidence.kind, "mismatch");
 
  assert.equal(evidence.citations[0].excerpt, "<p>Noodles &amp; soup AUD16</p>");
  assert.equal(source.slice(evidence.citations[0].start, evidence.citations[0].end), evidence.citations[0].excerpt);
  assert.equal(evidence.citations[0].start, source.indexOf("<p>"));
});

test("all eight confirmed entries remain inspected while contradiction citations are explicitly bounded to three", () => {
  const expectations = Array.from({length: 8}, (_, i) => ({expected: {...price, label: `Dish ${i}`} as ProofBusinessExpected, file: "index.html"}));
  const source = html(expectations.map((row, i) => `<p>Dish ${i} AUD16</p>`).join(""));
  const evidence = createSourceBusinessEvidenceCheck({"index.html": source}, savedPlan(expectations))("coverage-1");
  assert.equal(evidence.kind, "mismatch");
  assert.equal(evidence.checks.length, 8); assert.ok(evidence.checks.every(row => row.kind === "mismatch")); assert.equal(evidence.citations.length, 3);
});

test("maximum confirmed label and file bounds keep generated explanation within the existing assessment bound", () => {
  const label = "x".repeat(80), file = `${"p".repeat(64)}/${"p".repeat(64)}/${"q".repeat(25)}.html`, expected: ProofBusinessExpected = {kind: "item_price", label, currency: "AUD", amountMinor: Number.MAX_SAFE_INTEGER};
  const evidence = createSourceBusinessEvidenceCheck({[file]: html(`<p>${label} AUD16</p>`)}, savedPlan([{expected, file}]))("coverage-1");
  assert.equal(evidence.kind, "mismatch");
  for (const language of ["en", "zh"] as const) assert.ok(sourceBusinessEvidenceExplanation(evidence, language).length <= 600);
});
