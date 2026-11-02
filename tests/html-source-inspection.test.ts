import assert from "node:assert/strict";
import test from "node:test";
import { inspectHtmlSource } from "../lib/html-source-inspection.ts";
import { createUploadedDelivery, inspectStaticResources, parseStaticProject } from "../lib/static-project.ts";

const html = (body: string, title = "Café website") => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
const project = (text = "Book a call") => parseStaticProject({ title: "Café website", summary: "A real uploaded café website", amount: "10.00", requiredPages: ["index.html", "contact.html"], link: { from: "index.html", text, to: "contact.html#booking" }, manualRequirements: [] }, "en").project;
const files = (source: string) => ({ "index.html": source, "contact.html": html('<section id="booking">Contact the café</section>') });
const result = (source: string, text = "Book a call") => createUploadedDelivery(files(source), project(text), "en", 1);

test("standard named references are decoded once while evidence retains exact original source", () => {
  const source = html('<a href="contact.html#book&#105;ng">Caf&eacute; &copy; &mdash; Book</a>', "Caf&eacute; &copy; &mdash; Melbourne");
  const delivery = result(source, "Café © — Book");
  assert.deepEqual(delivery.evidence.slice(0, 3).map(row => row.finding), ["pass", "pass", "pass"]);
  for (const row of delivery.evidence) assert.ok(delivery.files![row.file].includes(row.excerpt));
  assert.equal(delivery.evidence[0].excerpt, "<title>Caf&eacute; &copy; &mdash; Melbourne</title>");
  const inspection = inspectHtmlSource(html('<a href="contact.html#booking">&amp;lt;strong&amp;gt;</a>', "Café &lt;3"));
  assert.equal(inspection.finding, "pass");
  assert.equal(inspection.anchors[0].text, "&lt;strong&gt;");
  assert.equal(inspection.elements.some(row => row.tag.name === "strong"), false);
});

test("standards-valid optional list, paragraph, table and document tags do not fail delivery", () => {
  for (const source of [
    html("<ul><li>Noodles<li>Tea</ul>"),
    html("<p>Fresh noodles<p>Open every day"),
    html("<dl><dt>Phone<dd>123<dt>Address<dd>Melbourne</dl>"),
    html("<table><thead><tr><th>Item<th>Price<tbody><tr><td>Noodles<td>AUD 12<tr><td>Tea<td>AUD 3</table>"),
    "<!doctype html><title>Caf&eacute; menu</title><p>Noodles",
    html("<p>Noodles</p>").replace("</body>", "").replace("</html>", ""),
  ]) assert.equal(inspectHtmlSource(source).finding, "pass", source);
  const source = "<!doctype html><title>Caf&eacute;</title><ul><li>Menu<li><a href=contact.html#booking>Book a call</a></ul>";
  assert.equal(result(source).evidence.find(row => row.criterionId === "link")!.finding, "pass");
});

test("parser correction is explicit uncertainty rather than evidence of valid supplied structure", () => {
  for (const source of [
    html("<main>Noodles"), html("<main>Noodles</section>"), html("<div/>Noodles"),
    html("<p>Noodles</p>").replace("<body>", "<body><body>"),
    html("<p>Noodles</p></aside>"), `<!doctype html>${html("<p>Noodles</p>")}`,
    html('<a href="contact.html#booking">Book a call'),
    html('<p><a href="contact.html#booking">Book a call<p>Contact'),
  ]) assert.equal(inspectHtmlSource(source).finding, "needs_human", source);
  const delivery = result(html('<a href="contact.html#booking">Book a call'));
  assert.equal(delivery.evidence[0].finding, "needs_human");
  assert.equal(delivery.evidence.find(row => row.criterionId === "link")!.finding, "needs_human");
  assert.ok(delivery.resources!.findings.some(row => row.kind === "uninspectable"));
});

test("comments, raw text, template, noscript and foreign trees cannot invent anchors, IDs or resource evidence", () => {
  const anchor = '<a href="contact.html#booking">Book a call</a>', target = '<section id="booking">Contact</section>';
  for (const wrap of [
    (source: string) => `<!--${source}-->`, (source: string) => `<script>${source}</script>`,
    (source: string) => `<style>${source}</style>`, (source: string) => `<textarea>${source}</textarea>`,
    (source: string) => `<template>${source}</template>`, (source: string) => `<noscript>${source}</noscript>`,
    (source: string) => `<svg>${source}</svg>`, (source: string) => `<math>${source}</math>`,
    (source: string) => `<svg><foreignObject>${source}</foreignObject></svg>`,
  ]) {
    const source = html(`<p>Home</p>${wrap(anchor)}${wrap('<a href="absent.html">Hidden resource</a>')}`);
    assert.equal(result(source).evidence.find(row => row.criterionId === "link")!.finding, "fail", source);
    const delivery = createUploadedDelivery({ "index.html": html(anchor), "contact.html": html(`<p>Contact</p>${wrap(target)}`) }, project(), "en", 1);
    assert.equal(delivery.evidence.find(row => row.criterionId === "link")!.finding, "fail");
    assert.equal(inspectStaticResources({ "index.html": source }).checked, 0);
  }
});

test("untrusted attributes and definite broken links retain hard failures with the standards parser", () => {
  for (const body of [
    '<a href="contact.html#wrong">Book a call</a>', '<a href="other.html#booking">Book a call</a>',
    '<a href="contact.html#booking" href="other.html">Book a call</a>',
    '<a href="contact.html#booking">Book a call</a><a href="contact.html#booking">Book a call</a>',
    '<a href="javascript:alert(1)">Book a call</a>',
  ]) assert.equal(result(html(body)).evidence.find(row => row.criterionId === "link")!.finding, "fail", body);
  for (const target of ['<section id="booking" id="other">Contact</section>', '<i id="booking">One</i><i id="booking">Two</i>']) {
    const delivery = createUploadedDelivery({ "index.html": html('<a href="contact.html#booking">Book a call</a>'), "contact.html": html(target) }, project(), "en", 1);
    assert.equal(delivery.evidence.find(row => row.criterionId === "link")!.finding, "fail");
  }
  const missing = createUploadedDelivery({ "index.html": html('<a href="contact.html#booking">Book a call</a>') }, project(), "en", 1);
  assert.equal(missing.evidence[1].finding, "fail");
  assert.equal(missing.evidence.find(row => row.criterionId === "link")!.finding, "fail");
});

test("resource references use actual once-decoded attribute values and retain original byte snapshots", () => {
  const source = html('<p>Menu</p><link rel=stylesheet href="menu&#46;css"><img src="caf&eacute;.png"><a href="contact.html#booking">Book a call</a>');
  const report = inspectStaticResources({ "index.html": source, "menu.css": "p {color: black}", "contact.html": html("<p>Contact</p>") });
  assert.equal(report.checked, 3);
  assert.deepEqual(report.findings.map(row => [row.kind, row.reference]), [["blocked", "café.png"]]);
  assert.equal(source.includes("menu&#46;css"), true);
});

test("missing agreed document parts fail while inert-only body content abstains", () => {
  for (const source of [html("<p>Menu</p>").replace("<!doctype html>", ""), html("<p>Menu</p>", "  "), html("")]) assert.equal(inspectHtmlSource(source).finding, "fail");
  for (const source of [html("<template><p>Menu</p></template>"), html("<noscript><p>Menu</p></noscript>"), html('<svg><text>Menu</text></svg>'), html('<script>"Menu"</script>')]) assert.equal(inspectHtmlSource(source).finding, "needs_human");
});

test("bounded deeply nested real input is inspected without recursive extraction", () => {
  const source = html(`<a href="contact.html#booking">${"<span>".repeat(1500)}Book a call${"</span>".repeat(1500)}</a>`);
  assert.ok(new TextEncoder().encode(source).byteLength < 65536);
  assert.equal(result(source).evidence.find(row => row.criterionId === "link")!.finding, "pass");
});
