import assert from "node:assert/strict";
import test from "node:test";
import {createAssessmentCitationCatalog, resolveCatalogCitations} from "../lib/assessment-citation-catalog.ts";
import {ASSESSMENT_CITATION_CATALOG_LIMITS} from "../lib/assessment-citation-catalog.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {DomainError} from "../lib/domain.ts";

const html = (body: string) => `<!doctype html><html><head><title>Exact source</title></head><body>${body}</body></html>`;

test("catalog fixed windows cover every original source unit without normalization", async () => {
  const files = {"index.html": html("<p>Coffees & Teas</p>\r\n<label>Owner&#39;s</label>" + "z".repeat(900)), "site.css": "p::before{content:'&amp;'}\r\n"};
  const before = structuredClone(files), catalog = await createAssessmentCitationCatalog(files, {deliveryId: "delivery-one", criteria: []});
  assert.equal(catalog.version, "source-citation-catalog-v1"); assert.match(catalog.catalogId, /^[a-f0-9]{64}$/u);
  assert.deepEqual(files, before);
  for (const [file, source] of Object.entries(files)) {
    const covered = new Set<number>();
    for (const entry of catalog.entries.filter(entry => entry.file === file)) {
      assert.equal(source.slice(entry.start, entry.end), entry.excerpt); assert.ok(entry.excerpt.length <= 500);
      for (let i = entry.start; i < entry.end; i++) covered.add(i);
    }
    assert.equal(covered.size, source.length);
  }
  assert.ok(catalog.entries.some(entry => entry.excerpt === "<p>Coffees & Teas</p>"));
  assert.ok(catalog.entries.some(entry => entry.excerpt === "<label>Owner&#39;s</label>"));
});

test("selecting the second repeated element preserves that exact UTF-16 occurrence", async () => {
  const excerpt = "<h1>Same heading</h1>", source = html(`${excerpt}<p>🙂 Other section</p>${excerpt}`);
  const catalog = await createAssessmentCitationCatalog({"index.html": source}, {deliveryId: "repeated-heading"});
  const matches = catalog.entries.filter(entry => entry.excerpt === excerpt);
  assert.equal(matches.length, 2); assert.notEqual(matches[0].id, matches[1].id);
  const citations = resolveCatalogCitations([matches[1].id], catalog, 6);
  assert.deepEqual(citations, [{file: "index.html", start: source.lastIndexOf(excerpt), end: source.lastIndexOf(excerpt) + excerpt.length, excerpt}]);
  assert.ok(!Object.hasOwn(citations[0], "id"));
});

test("unknown and duplicate selectors reject without fixing model text", async () => {
  const catalog = await createAssessmentCitationCatalog({"index.html": html("<p>Exact & raw</p>")}, {}), id = catalog.entries[0].id;
  for (const value of [["unknown"], [id, id], [{file: "index.html", excerpt: "Exact &amp; raw"}], [id + " "]])
    assert.throws(() => resolveCatalogCitations(value, catalog, 6), /citation|structure/iu);
});

test("fixed windows are at most 400 UTF-16 units and never cut an astral character", async () => {
  const source = "x".repeat(399) + "🙂" + "中".repeat(799) + "😀tail", catalog = await createAssessmentCitationCatalog({"index.html": source}, null);
  let start = 0;
  while (start < source.length) {
    let end = Math.min(start + 400, source.length);
    if (end < source.length && /[\ud800-\udbff]/u.test(source[end - 1]) && /[\udc00-\udfff]/u.test(source[end])) end--;
    const window = catalog.entries.find(entry => entry.start === start && entry.end === end);
    assert.ok(window, `missing complete window ${start}..${end}`); assert.ok(window.excerpt.length <= 400);
    assert.ok(!/[\ud800-\udbff]$/u.test(window.excerpt)); assert.ok(!/^[\udc00-\udfff]/u.test(window.excerpt));
    start = end;
  }
});

test("complete small structural elements are exact original spans and span IDs are unique", async () => {
  const excerpts = ["<title>Exact source</title>", "<h1>A &amp; B</h1>", "<label>A<span>&#39;</span>B</label>", "<p>Price AUD 18</p>", "<li>Second item</li>", "<tr><td>Tea</td><td>AUD 18</td></tr>"];
  const source = html(excerpts.slice(1, 4).join("") + `<ul>${excerpts[4]}</ul><table>${excerpts[5]}</table>`);
  const catalog = await createAssessmentCitationCatalog({"index.html": source}, {id: "small-elements"});
  for (const excerpt of excerpts) assert.equal(catalog.entries.filter(entry => entry.excerpt === excerpt).length, 1, excerpt);
  assert.equal(new Set(catalog.entries.map(entry => `${entry.file}:${entry.start}:${entry.end}`)).size, catalog.entries.length);
  assert.deepEqual(catalog.entries.map(entry => entry.id), catalog.entries.map((_, i) => `s${i + 1}`));
});

test("whole dish rows, field wrappers and void controls retain their raw HTML across base windows", async () => {
  const input = "<input id='customer-email' type='email' value='a&amp;b' />";
  const wrapper = `<div class='field'><label for='customer-email'>Email</label>${input}</div>`;
  const dish = "<div class='dish'><span class='name'>Tea<span class='tag'>V</span></span><span class='price'>AUD 18</span></div>";
  const excerpts = [input, wrapper, dish, "<span class='name'>Tea<span class='tag'>V</span></span>", "<span class='tag'>V</span>", "<span class='price'>AUD 18</span>",
    "<h2 data-note='raw'>A &amp; B</h2>", "<h3>Fields</h3>", "<th scope='row'>Tea</th>", "<td>AUD 18</td>"];
  const prefix = html("").indexOf("</body>");
  const source = html("x".repeat(390 - prefix - wrapper.indexOf(input)) + wrapper + dish + excerpts[6] + excerpts[7] + `<table><tr>${excerpts[8]}${excerpts[9]}</tr></table>`);
  assert.equal(source.indexOf(input), 390);
  assert.ok(source.indexOf(input) < 400 && source.indexOf(input) + input.length > 400);
  const files = {"index.html": source}, before = structuredClone(files), catalog = await createAssessmentCitationCatalog(files, {id: "raw-groups-and-controls"});
  assert.deepEqual(files, before);
  for (const excerpt of excerpts) {
    const matches = catalog.entries.filter(entry => entry.excerpt === excerpt);
    assert.equal(matches.length, 1, excerpt);
    assert.equal(matches[0].start, source.indexOf(excerpt));
    assert.equal(matches[0].end, source.indexOf(excerpt) + excerpt.length);
    assert.deepEqual(resolveCatalogCitations([matches[0].id], catalog, 6), [{file: "index.html", start: matches[0].start, end: matches[0].end, excerpt}]);
  }
  assert.ok(catalog.entries.some(entry => entry.start === 0 && entry.end === 400));
});

test("nested and repeated span candidates keep distinct addresses without collapsing shared text", async () => {
  const nested = "<span class='outer'><span>Same</span></span>", inner = "<span>Same</span>";
  const boundary = `<div>${"x".repeat(489)}</div>`, overBoundary = `<div>${"y".repeat(490)}</div>`;
  assert.equal(boundary.length, 500); assert.equal(overBoundary.length, 501);
  const source = html(nested + "<p>between</p>" + nested + boundary + overBoundary);
  const catalog = await createAssessmentCitationCatalog({"index.html": source}, {id: "nested-addresses"});
  const parents = catalog.entries.filter(entry => entry.excerpt === nested), children = catalog.entries.filter(entry => entry.excerpt === inner);
  assert.equal(parents.length, 2); assert.equal(children.length, 2);
  assert.equal(new Set([...parents, ...children].map(entry => entry.id)).size, 4);
  for (let i = 0; i < parents.length; i++) {
    assert.ok(parents[i].start < children[i].start && parents[i].end > children[i].end);
    assert.equal(source.slice(children[i].start, children[i].end), inner);
  }
  assert.equal(children[1].start, source.lastIndexOf(inner));
  assert.equal(catalog.entries.filter(entry => entry.excerpt === boundary).length, 1);
  assert.ok(!catalog.entries.some(entry => entry.excerpt === overBoundary));
  // Omitting an oversized extra candidate never removes its original units.
  const covered = new Set<number>();
  for (const entry of catalog.entries) for (let at = entry.start; at < entry.end; at++) covered.add(at);
  assert.equal(covered.size, source.length);
});

test("long elements and malformed source remain complete fixed windows without rewritten markup", async () => {
  const source = html(`<p data-note='original'>${"q".repeat(800)}</p><p>implicit closing<p>last & raw`), catalog = await createAssessmentCitationCatalog({"index.html": source}, {});
  assert.ok(!catalog.entries.some(entry => entry.excerpt === `<p data-note='original'>${"q".repeat(800)}</p>`));
  const covered = new Set<number>();
  for (const entry of catalog.entries) {
    assert.equal(entry.excerpt, source.slice(entry.start, entry.end)); assert.ok(entry.excerpt.length <= 500);
    for (let at = entry.start; at < entry.end; at++) covered.add(at);
  }
  assert.equal(covered.size, source.length); assert.equal(source.endsWith("last & raw</body></html>"), true);
});

test("catalog identity is stable for equivalent binding and file key order", async () => {
  const first = await createAssessmentCitationCatalog({"site.css": "p{color:green}", "index.html": html("<p>A</p>")}, {delivery: "d1", scope: {b: [1, true, null], a: "copy"}});
  const second = await createAssessmentCitationCatalog({"index.html": html("<p>A</p>"), "site.css": "p{color:green}"}, {scope: {a: "copy", b: [1, true, null]}, delivery: "d1"});
  assert.deepEqual(first, second);
  assert.notEqual(first.catalogId, (await createAssessmentCitationCatalog({"index.html": html("<p>A</p>"), "site.css": "p{color:green}"}, {delivery: "d2", scope: {b: [1, true, null], a: "copy"}})).catalogId);
  assert.notEqual(first.catalogId, (await createAssessmentCitationCatalog({"index.html": html("<p>A</p>later-tail"), "site.css": "p{color:green}"}, {delivery: "d1", scope: {b: [1, true, null], a: "copy"}})).catalogId);
});

test("asynchronous hashing uses an independent immutable snapshot", async () => {
  const files = {"index.html": html("<p>Original</p>")}, binding = {deliveryId: "original"};
  const pending = createAssessmentCitationCatalog(files, binding);
  files["index.html"] = html("<p>Changed</p>"); binding.deliveryId = "changed";
  const catalog = await pending, original = await createAssessmentCitationCatalog({"index.html": html("<p>Original</p>")}, {deliveryId: "original"});
  assert.deepEqual(catalog, original); assert.ok(Object.isFrozen(catalog)); assert.ok(Object.isFrozen(catalog.entries)); assert.ok(catalog.entries.every(Object.isFrozen));
  assert.throws(() => {catalog.entries[0].excerpt = "forged";}, TypeError);
});

test("resolution preserves selection order and returns detached legacy citation objects", async () => {
  const catalog = await createAssessmentCitationCatalog({"index.html": html("<p>First</p><p>Second</p>")}, {});
  const first = catalog.entries.find(entry => entry.excerpt === "<p>First</p>")!, second = catalog.entries.find(entry => entry.excerpt === "<p>Second</p>")!;
  const resolved = resolveCatalogCitations([second.id, first.id], catalog, 6);
  assert.deepEqual(resolved.map(entry => entry.start), [second.start, first.start]);
  assert.deepEqual(Object.keys(resolved[0]).sort(), ["end", "excerpt", "file", "start"]);
  resolved[0].excerpt = "local mutation"; assert.equal(second.excerpt, "<p>Second</p>");
  assert.deepEqual(resolveCatalogCitations([], catalog, 6), []);
});

test("item six and risk three boundaries remain local hard limits", async () => {
  const catalog = await createAssessmentCitationCatalog({"index.html": html(Array.from({length: 8}, (_, i) => `<p>Item ${i}</p>`).join(""))}, {});
  const ids = catalog.entries.filter(entry => /^<p>Item /u.test(entry.excerpt)).map(entry => entry.id);
  assert.equal(resolveCatalogCitations(ids.slice(0, 6), catalog, 6).length, 6);
  assert.equal(resolveCatalogCitations(ids.slice(0, 3), catalog, 3).length, 3);
  for (const [value, maximum] of [[ids.slice(0, 7), 6], [ids.slice(0, 4), 3], [null, 6], [[], 0], [[], 7], [[], 1.5]] as const)
    assert.throws(() => resolveCatalogCitations(value, catalog, maximum), error => error instanceof AssessmentResponseError && error.reason === "structure");
  for (const value of [[null], [1], ["s0"], ["s01"], [ids[0].toUpperCase()], [ids[0] + "\n"]])
    assert.throws(() => resolveCatalogCitations(value, catalog, 6), error => error instanceof AssessmentResponseError && error.reason === "citation" && !error.message.includes(String(value[0])));
});

test("whitespace source windows are retained for coverage but cannot be selected as evidence", async () => {
  const source = " ".repeat(800) + "p{color:blue}", catalog = await createAssessmentCitationCatalog({"site.css": source}, {}), blank = catalog.entries.find(entry => !entry.excerpt.trim())!;
  assert.ok(blank); assert.equal(blank.excerpt.length, 400);
  assert.throws(() => resolveCatalogCitations([blank.id], catalog, 6), error => error instanceof AssessmentResponseError && error.reason === "citation");
});

test("entry overflow rejects the whole complete set instead of dropping late elements", async () => {
  const source = html("<p>x</p>".repeat(1_600));
  await assert.rejects(createAssessmentCitationCatalog({"index.html": source}, {}), error => error instanceof DomainError && error.status === 413 && error.code === "ASSESSMENT_CONTEXT_LIMIT");
});

test("new short div and span candidates still reject the full catalog at the fixed entry cap", async () => {
  const source = html("<div><span>x</span></div>".repeat(800));
  assert.ok(Buffer.byteLength(source) < 64 * 1024);
  await assert.rejects(createAssessmentCitationCatalog({"index.html": source}, {id: "new-element-overflow"}), error => error instanceof DomainError && error.status === 413 && error.code === "ASSESSMENT_CONTEXT_LIMIT");
  assert.equal(ASSESSMENT_CITATION_CATALOG_LIMITS.windowUnits, 400);
  assert.equal(ASSESSMENT_CITATION_CATALOG_LIMITS.excerptUnits, 500);
  assert.equal(ASSESSMENT_CITATION_CATALOG_LIMITS.entries, 1_536);
  assert.equal(ASSESSMENT_CITATION_CATALOG_LIMITS.serializedBytes, 384 * 1024);
});

test("serialized catalog byte overflow rejects even when source and entry count fit", async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 4; i++) files[`${"a".repeat(60)}/${"b".repeat(60)}/${"c".repeat(28)}${i}.css`] = "a".repeat(64 * 1024);
  assert.equal(Object.values(files).reduce((n, source) => n + Buffer.byteLength(source), 0), 256 * 1024);
  await assert.rejects(createAssessmentCitationCatalog(files, {}), error => error instanceof DomainError && error.status === 413);
  assert.equal(ASSESSMENT_CITATION_CATALOG_LIMITS.entries, 1_536); assert.equal(ASSESSMENT_CITATION_CATALOG_LIMITS.serializedBytes, 384 * 1024);
});

test("invalid source or non-JSON bindings reject without executing accessors", async () => {
  let executed = false;
  const accessor = Object.defineProperty({}, "private", {get() {executed = true; return "hidden";}, enumerable: true});
  const cycle: {self?: unknown} = {}; cycle.self = cycle;
  for (const binding of [accessor, cycle, undefined, {x: undefined}, {x: Number.NaN}, new Date(), [1, , 3], {x: () => "not JSON"}])
    await assert.rejects(createAssessmentCitationCatalog({"index.html": html("<p>A</p>")}, binding), DomainError);
  const fileAccessor = Object.defineProperty({}, "index.html", {get() {executed = true; return html("<p>A</p>");}, enumerable: true});
  for (const files of [fileAccessor, {}, {"index.html": "\ud800"}, {"index.html": "x".repeat(64 * 1024 + 1)}, {"image.png": "not source"}, {"index.html": "one", "INDEX.html": "two"}])
    await assert.rejects(createAssessmentCitationCatalog(files, {}), DomainError);
  assert.equal(executed, false);
});
