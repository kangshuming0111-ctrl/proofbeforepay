import assert from "node:assert/strict";
import test from "node:test";
import type {ProofAssessmentCitation, ProofBusinessExpected, ProofQuote} from "../lib/contracts.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {assessSourceBusinessCitationWitness, createSourceBusinessEvidenceCheck, sourceBusinessCitationWitnessExplanation, sourceBusinessEvidenceExplanation, type SourceBusinessEvidence} from "../lib/source-business-evidence.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";
import {STATIC_RESOURCE_LIMITS} from "../lib/static-resources.ts";

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

test("duplicate labels, compound SKUs, unsupported tables, split blocks and inline structures abstain rather than allege a wrong price", () => {
  for (const body of [
    "<p>Beef noodles AUD16</p><p>Beef noodles AUD18</p>",
    "<h2>Beef noodles</h2><p>Beef noodles AUD16</p>",
    "<p hidden>Beef noodles AUD18</p><p>Beef noodles AUD16</p>",
    "<p>Beef noodles large AUD16</p>", "<p>Beef noodles AUD16 / AUD18</p>",
    "<p>Beef noodles</p><p>AUD16</p>", "<p>Beef noodles <span>AUD16</span></p>",
    "<table><tr><td><p>Beef noodles AUD16</p></td></tr></table>",
    "<li><p>Beef noodles AUD16</p><p>Dessert AUD10</p></li>",
    "<p>Large Beef noodles AUD16</p>", "<p>Beef noodles AUD16 per serving</p>",
    "<p hidden>Beef noodles AUD16</p>", "<div inert><p>Beef noodles AUD16</p></div>", "<p aria-hidden=\"true\">Beef noodles AUD16</p>",
  ]) assert.equal(evaluate(html(body)).kind, "unknown", body);
});

test("a source-only two-cell table binds a unique label to its own explicit ISO price", () => {
  for (const cells of [["td", "td"], ["th", "td"], ["th", "th"]]) {
    const row = `<tr><${cells[0]}>Beef noodles</${cells[0]}><${cells[1]}>AUD18</${cells[1]}></tr>`;
    for (const body of [`<table>${row}</table>`, `<table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody>${row}</tbody></table>`]) {
      const source = html(body), evidence = evaluate(source);
      assert.equal(evidence.kind, "unchanged", body);
      assert.equal(evidence.checks[0].citation?.excerpt, row);
      const citation = evidence.checks[0].citation!;
      assert.equal(source.slice(citation.start, citation.end), row);
      assert.equal(assessSourceBusinessCitationWitness(evidence, [citation]).kind, "covered");
    }
  }
});

test("table amounts never come from a neighboring row or another same-page block", () => {
  for (const value of ["AUD16", "USD18"]) {
    const row = `<tr><td>Beef noodles</td><td>${value}</td></tr>`;
    const source = html(`<table>${row}<tr><td>Tea</td><td>AUD18</td></tr></table>`), evidence = evaluate(source);
    assert.equal(evidence.kind, "mismatch");
    assert.equal(evidence.citations[0].excerpt, row);
    assert.equal(evidence.checks[0].actual, value === "AUD16" ? "AUD 16.00" : "USD 18.00");
  }
  const row = "<tr><td>Beef noodles</td><td>AUD18</td></tr>", neighbor = "<tr><td>Tea</td><td>AUD18</td></tr>";
  const files = {"index.html": html(`<table>${row}${neighbor}</table>`)}, evidence = evaluate(files["index.html"]);
  assert.equal(evidence.kind, "unchanged");
  assert.equal(assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", neighbor)]).kind, "unknown");
  assert.equal(assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", row)]).kind, "covered");
  assert.equal(evaluate(html("<table><tr><td>Beef noodles</td><td>Price on request</td></tr><tr><td>Tea</td><td>AUD18</td></tr></table>")).kind, "unknown");
});

test("ambiguous table structure or ownership abstains without stitching cells, rows or nested text", () => {
  const row = "<tr><td>Beef noodles</td><td>AUD16</td></tr>";
  for (const body of [
    "<table><tr><td>Beef noodles</td><td>$16</td></tr></table>",
    "<table><tr><td>Beef noodles</td><td>16 AUD</td></tr></table>",
    "<table><tr><td>Beef noodles</td><td>AUD</td><td>16</td></tr></table>",
    "<table><tr><td>Beef noodles</td><td><span>AUD16</span></td></tr></table>",
    "<table><tr><td>Beef noodles</ignored></td><td>AUD16</td></tr></table>",
    "<table><tr><td><p>Beef noodles AUD16</p></td><td>AUD16</td></tr></table>",
    "<table><tr><td>Beef noodles</td><td>AUD16</tr></table>",
    "<table><tr><td>Beef noodles</td><td>AUD16</td></table>",
    `<table>${row}<tr><td colspan='1'>Tea</td><td>AUD18</td></tr></table>`,
    `<table>${row}<tr><td>Tea</td><td rowspan='2'>AUD18</td></tr></table>`,
    `<table>${row}<tr><td>Tea</td><td><table><tr><td>Water</td><td>AUD2</td></tr></table></td></tr></table>`,
    `<table hidden>${row}</table>`, `<table><tbody inert>${row}</tbody></table>`,
    `<table>${row}<tr aria-hidden='true'><td>Tea</td><td>AUD18</td></tr></table>`,
    `<table>${row}<tr><td style='display:none'>Tea</td><td>AUD18</td></tr></table>`,
    `<table><svg><text>ignored</text></svg>${row}</table>`,
    `<table><div hidden>ignored</div>${row}</table>`,
    `<table>${row}<tr><td>Beef noodles</td><td>AUD18</td></tr></table>`,
    `<table><thead><tr><th>Beef noodles</th><th>Price</th></tr></thead><tbody>${row}</tbody></table>`,
  ]) assert.equal(evaluate(html(body)).kind, "unknown", body);
});

test("table source scope retains dynamic and omitted-style uncertainty and does not extend visible-copy matching", () => {
  const table = "<table><tr><td>Beef noodles</td><td>AUD16</td></tr></table>";
  for (const source of [
    html(`${table}<script>document.body.textContent='updated'</script>`),
    html(`${table}<template><p>Menu</p></template>`),
    html(table, "<link rel='stylesheet' href='missing.css'>"),
    html(table, "<link rel='stylesheet' href='https://example.invalid/site.css'>"),
  ]) assert.equal(evaluate(source).kind, "unknown", source);
  const copy: ProofBusinessExpected = {kind: "visible_copy", text: "Beef noodles AUD16"};
  assert.equal(evaluate(html(table), [{expected: copy}]).kind, "unknown");
});

test("table row citations keep raw entities and UTF-16 offsets, with a bounded explicit row owner", () => {
  const expected: ProofBusinessExpected = {kind: "item_price", label: "Noodles & soup", currency: "AUD", amountMinor: 1800};
  const row = "<tr><td>Noodles &amp; soup</td><td>AUD18</td></tr>";
  const source = html(`🍜<table>${row}<tr><td>Tea</td><td>AUD2</td></tr></table>`), files = {"index.html": source};
  const evidence = evaluate(source, [{expected}]);
  assert.equal(evidence.kind, "unchanged");
  const citation = evidence.checks[0].citation!;
  assert.deepEqual(citation, quoteSpan(files, "index.html", row));
  assert.equal(citation.start, source.indexOf("<tr>"));
  assert.equal(assessSourceBusinessCitationWitness(evidence, [citation]).kind, "covered");
  assert.equal(assessSourceBusinessCitationWitness(evidence, [{...citation, excerpt: citation.excerpt.replace("&amp;", "&"), end: citation.end - 4}]).kind, "unknown");
  assert.equal(evaluate(html(`<table><tr${" ".repeat(500)}><td>Beef noodles</td><td>AUD16</td></tr></table>`)).kind, "unknown");
  const largeTable = `<table>${Array.from({length: 25}, (_, index) => `<tr><td>Other ${index}</td><td>AUD1</td></tr>`).join("")}<tr><td>Beef noodles</td><td>AUD18</td></tr></table>`;
  assert.ok(largeTable.length > 500); assert.equal(evaluate(html(largeTable)).kind, "unchanged");
});

test("noncanonical, inferred or unsafe monetary forms remain unknown", () => {
  for (const value of ["$16", "16 AUD", "AUD 016", "AUD -16", "AUD +16", "AUD 1,600", "AUD16.000", "AUD 16.", "AUD16 USD18", "aud16", "ＡＵＤ１６", "￥５９９", "AUD 9007199254740991", "EUR16"]) assert.equal(evaluate(html(`<p>Beef noodles ${value}</p>`)).kind, "unknown", value);
});

test("dynamic, generated, unresolved or unsupported source uncertainty vetoes its bound page interpretation", () => {
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
  assert.equal(evaluate(html("<p>Beef noodles AUD16</p>", "<link rel='stylesheet' href='site.css'>"), [{expected: price}], {"site.css": "p:after{content:'AUD18'}"}).kind, "unknown");
  assert.equal(evaluate(html("<p>Beef noodles AUD16</p>"), [{expected: price}], {"site.css": "p:after{content:'AUD18'}"}).kind, "mismatch");
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
  const label = "x".repeat(80), file = `${"p".repeat(64)}/${"p".repeat(64)}/${"q".repeat(STATIC_RESOURCE_LIMITS.maxPathLength - 135)}.html`;
  assert.equal(file.length, STATIC_RESOURCE_LIMITS.maxPathLength);
  const expected: ProofBusinessExpected = {kind: "item_price", label, currency: "AUD", amountMinor: Number.MAX_SAFE_INTEGER};
  const actualMinor = Number.MAX_SAFE_INTEGER - 1, actualPrice = `AUD ${Math.trunc(actualMinor / 100)}.${String(actualMinor % 100).padStart(2, "0")}`;
  const source = html(`<p>${label} ${actualPrice}</p>`), plan = savedPlan([{expected, file}]);
  const evidence = createSourceBusinessEvidenceCheck({[file]: source}, plan)("coverage-1"), before = structuredClone(evidence);
  assert.equal(evidence.kind, "mismatch");
  assert.equal(evidence.citations[0].file, file); assert.equal(source.slice(evidence.citations[0].start, evidence.citations[0].end), evidence.citations[0].excerpt);
  assert.equal(plan[0].file, file); assert.equal(plan[0].expected.kind, "item_price");
  for (const language of ["en", "zh"] as const) {
    const explanation = sourceBusinessEvidenceExplanation(evidence, language);
    assert.ok(explanation.length <= 600, `${language} explanation has ${explanation.length} UTF-16 units`);
    assert.ok(explanation.includes(label));
    assert.ok(!explanation.includes(file));
    assert.match(explanation, language === "zh" ? /锁定目标文件/u : /locked target file/u);
  }
  assert.deepEqual(evidence, before);
});

function quoteSpan(files: Record<string, string>, file: string, excerpt: string, start = files[file].indexOf(excerpt)): ProofAssessmentCitation {
  assert.ok(start >= 0); assert.equal(files[file].slice(start, start + excerpt.length), excerpt);
  return {file, start, end: start + excerpt.length, excerpt};
}

test("confirmed source requires citations from the locked file even when another page has identical text", () => {
  const files = {"index.html": html("<p>Home</p>"), "menu.html": html("<p>Beef noodles AUD18</p>"), "about.html": html("<p>Beef noodles AUD18</p>")};
  const evidence = createSourceBusinessEvidenceCheck(files, savedPlan([{expected: price, file: "menu.html"}]))("coverage-1");
  assert.equal(evidence.kind, "unchanged");
  const before = structuredClone(evidence), quotes = [quoteSpan(files, "about.html", "<p>Beef noodles AUD18</p>")], quotedBefore = structuredClone(quotes);
  const witness = assessSourceBusinessCitationWitness(evidence, quotes);
  assert.equal(witness.kind, "unknown");
  assert.deepEqual(witness.checks, [{checkId: "business-1", file: "menu.html", kind: "unknown", reason: "target_file_not_cited"}]);
  assert.deepEqual(evidence, before); assert.deepEqual(quotes, quotedBefore);
  for (const language of ["zh", "en"] as const) {
    const explanation = sourceBusinessCitationWitnessExplanation(witness, language);
    assert.match(explanation, language === "zh" ? /引用范围缺口/u : /citation-scope gap/u);
    assert.match(explanation, /menu\.html/u); assert.ok(explanation.length <= 600);
  }
});

test("a correct amount in a different same-page block or a page heading is not the target witness", () => {
  const files = {"index.html": html("<h1>Menu</h1><p>Beef noodles AUD18</p><p>Tea AUD18</p>")}, evidence = createSourceBusinessEvidenceCheck(files, savedPlan())("coverage-1");
  assert.equal(evidence.kind, "unchanged");
  for (const excerpt of ["<h1>Menu</h1>", "<p>Tea AUD18</p>", "AUD18"]) {
    const witness = assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", excerpt)]);
    assert.equal(witness.kind, "unknown", excerpt);
    assert.equal(witness.checks[0].reason, "target_source_span_not_cited");
  }
});

test("all confirmed fields need witnesses and a single enclosing source quote can cover both", () => {
  const body = "<section><p>Beef noodles AUD18</p><p>Phone 000</p></section>", files = {"index.html": html(body)};
  const evidence = createSourceBusinessEvidenceCheck(files, savedPlan([{expected: price}, {expected: {kind: "visible_copy", text: "Phone 000"}}]))("coverage-1");
  assert.equal(evidence.kind, "unchanged");
  const priceOnly = assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", "<p>Beef noodles AUD18</p>")]);
  assert.equal(priceOnly.kind, "unknown");
  assert.deepEqual(priceOnly.checks.map(row => [row.checkId, row.kind, row.reason]), [["business-1", "covered", "complete_source_span_cited"], ["business-2", "unknown", "target_source_span_not_cited"]]);
  assert.equal(assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", body)]).kind, "covered");
  assert.equal(assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", "<p>Beef noodles AUD18</p>"), quoteSpan(files, "index.html", "<p>Phone 000</p>")]).kind, "covered");
});

test("every locked page needs its own witness even when their price text is identical", () => {
  const files = {"index.html": html("<p>Beef noodles AUD18</p>"), "menu.html": html("<p>Beef noodles AUD18</p>")};
  const evidence = createSourceBusinessEvidenceCheck(files, savedPlan([{expected: price}, {expected: price, file: "menu.html"}]))("coverage-1");
  assert.equal(evidence.kind, "unchanged");
  const firstOnly = assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", "<p>Beef noodles AUD18</p>")]);
  assert.equal(firstOnly.kind, "unknown");
  assert.deepEqual(firstOnly.checks.map(row => row.kind), ["covered", "unknown"]);
  assert.equal(assessSourceBusinessCitationWitness(evidence, Object.keys(files).map(file => quoteSpan(files, file, "<p>Beef noodles AUD18</p>"))).kind, "covered");
});

test("identical text at an inert source occurrence cannot replace the actual AST block", () => {
  const block = "<p>Beef noodles AUD18</p>", files = {"index.html": html(`<!--${block}-->${block}`)};
  const evidence = createSourceBusinessEvidenceCheck(files, savedPlan())("coverage-1");
  assert.equal(evidence.kind, "unchanged");
  assert.equal(assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", block)]).kind, "unknown");
  assert.equal(assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", block, files["index.html"].lastIndexOf(block))]).kind, "covered");
});

test("complete raw source spans retain entities and non-BMP UTF-16 offsets", () => {
  const block = "<p>Noodles &amp; soup AUD18</p>", files = {"index.html": html(`🍜${block}`)};
  const expected: ProofBusinessExpected = {kind: "item_price", label: "Noodles & soup", amountMinor: 1800, currency: "AUD"};
  const evidence = createSourceBusinessEvidenceCheck(files, savedPlan([{expected}]))("coverage-1"), cited = quoteSpan(files, "index.html", block);
  assert.equal(evidence.kind, "unchanged"); assert.equal(assessSourceBusinessCitationWitness(evidence, [cited]).kind, "covered");
  const rewritten = {...cited, excerpt: "<p>Noodles & soup AUD18</p>"};
  assert.equal(assessSourceBusinessCitationWitness(evidence, [rewritten]).kind, "unknown");
  assert.equal(files["index.html"].slice(cited.start, cited.end), block);
});

test("separate fragments do not silently count as a single complete server owner span", () => {
  const block = "<p>Beef noodles AUD18</p>", files = {"index.html": html(block)}, evidence = createSourceBusinessEvidenceCheck(files, savedPlan())("coverage-1");
  const fragments = ["<p>Beef noodles ", "AUD18</p>"].map(excerpt => quoteSpan(files, "index.html", excerpt));
  assert.equal(assessSourceBusinessCitationWitness(evidence, fragments).kind, "unknown");
  assert.equal(assessSourceBusinessCitationWitness(evidence, [quoteSpan(files, "index.html", block)]).kind, "covered");
});

test("citation witness does not replace mismatch, uncertain source or unlinked check decisions", () => {
  const values: SourceBusinessEvidence[] = [evaluate(html("<p>Beef noodles AUD16</p>")), evaluate(html("<p>Beef noodles</p><p>AUD18</p>")), {kind: "not_applicable"}];
  assert.deepEqual(values.map(value => value.kind), ["mismatch", "unknown", "not_applicable"]);
  for (const value of values) {
    const before = structuredClone(value);
    assert.deepEqual(assessSourceBusinessCitationWitness(value, []), {kind: "not_applicable"}); assert.deepEqual(value, before);
  }
  const empty: SourceBusinessEvidence = {kind: "unchanged", checks: [], citations: []};
  assert.equal(assessSourceBusinessCitationWitness(empty, []).kind, "unknown");
});

test("missing internal source spans remain unknown and diagnostic text stays within report bounds", () => {
  const label = "x".repeat(80), file = `${"p".repeat(64)}/${"p".repeat(64)}/${"q".repeat(25)}.html`, expected: ProofBusinessExpected = {...price, label};
  const evidence = createSourceBusinessEvidenceCheck({[file]: html(`<p>${label} AUD18</p>`)}, savedPlan([{expected, file}]))("coverage-1");
  assert.equal(evidence.kind, "unchanged");
  const witness = assessSourceBusinessCitationWitness(evidence, []); assert.ok(witness.kind !== "not_applicable");
  const longIdentity = structuredClone(witness); longIdentity.checks[0].file = "f".repeat(300); longIdentity.checks[0].checkId = "b".repeat(80);
  const retained = structuredClone(longIdentity);
  for (const language of ["en", "zh"] as const) {
    assert.ok(sourceBusinessCitationWitnessExplanation(witness, language).length <= 600);
    const explanation = sourceBusinessCitationWitnessExplanation(longIdentity, language);
    assert.ok(explanation.length <= 600); assert.ok(!explanation.includes("f".repeat(81)));
    assert.match(explanation, language === "zh" ? /锁定目标文件/u : /locked target file/u);
  }
  assert.deepEqual(longIdentity, retained);
  const unavailable = structuredClone(evidence); delete unavailable.checks[0].citation;
  const missing = assessSourceBusinessCitationWitness(unavailable, []); assert.ok(missing.kind !== "not_applicable");
  assert.equal(missing.kind, "unknown"); assert.equal(missing.checks[0].reason, "source_span_unavailable");
});
