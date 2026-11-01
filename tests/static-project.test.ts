import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../lib/domain.ts";
import { createUploadedDelivery, parseStaticProject, validateStaticFiles } from "../lib/static-project.ts";
import { validateAcceptance } from "../lib/proof-domain.ts";
import type { ProofQuote, StaticProjectSpec } from "../lib/contracts.ts";

const html = (body = "<main>Delivered content</main>", title = "Delivered page") => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
const input = () => ({ title: "Studio website", summary: "Three static website pages", amount: "125.50", requiredPages: ["index.html", "contact.html"], link: {from: "index.html", text: "Book a call", to: "contact.html#booking"}, manualRequirements: ["The client approves the colours."] });
const spec = (): StaticProjectSpec => parseStaticProject(input(), "en").project;
const files = () => ({"index.html": html('<a href="contact.html#booking">Book <strong>a</strong> call</a>'), "contact.html": html('<section id="booking">Contact us</section>'), "styles.css": "body { color: #123; }"});
const finding = (entries: ReturnType<typeof createUploadedDelivery>["evidence"], id: string) => entries.find(entry => entry.criterionId === id)?.finding;
const invalid = (operation: () => unknown) => assert.throws(operation, DomainError);

test("project money uses exact decimal-string cents and stable bilingual criterion ids", () => {
  for (const language of ["zh", "en"] as const) {
    const parsed = parseStaticProject(input(), language);
    assert.equal(parsed.totalCents, 12550);
    assert.deepEqual(parsed.criteria.map(entry => entry.id), ["page-1", "page-2", "link", "mobile", "manual-1"]);
    assert.equal(parsed.project.manualRequirements[0], input().manualRequirements[0]);
    assert.ok(parsed.criteria[0].source.includes("index.html"));
  }
  for (const [amount, cents] of [["0.01", 1], ["0.29", 29], ["12.5", 1250], ["10000.00", 1000000]] as const) {
    assert.equal(parseStaticProject({...input(), amount}, "en").totalCents, cents);
  }
  for (const amount of [125.5, "0", "0.001", "10000.01", "10001", "1e2", "-1", ".5", " 1.00", "01.00", "1.", "NaN"]) invalid(() => parseStaticProject({...input(), amount}, "en"));
});

test("project limits and canonical relative filenames are validated before agreement creation", () => {
  for (const overrides of [
    {title: ""}, {title: "x".repeat(121)}, {summary: "x".repeat(1001)},
    {requiredPages: []}, {requiredPages: Array.from({length: 11}, (_, n) => `p${n}.html`)},
    {requiredPages: ["index.html", "INDEX.HTML"]}, {requiredPages: ["../index.html"]},
    {requiredPages: ["index.css"]}, {manualRequirements: Array(6).fill("A check")},
    {manualRequirements: ["x".repeat(301)]}, {manualRequirements: [""]},
    {link: {from: "index.html", text: "Book", to: "https://example.test/#booking"}},
    {link: {from: "index.html", text: "Book", to: "contact.html"}},
    {link: {from: "./index.html", text: "Book", to: "contact.html#booking"}},
  ]) invalid(() => parseStaticProject({...input(), ...overrides}, "en"));
  const largest = parseStaticProject({...input(), requiredPages: Array.from({length: 10}, (_, n) => `p${n}.html`), manualRequirements: Array(5).fill("Manual check")}, "en");
  assert.equal(largest.criteria.length, 17);
});

test("uploaded delivery saves independent exact files and real truncated source excerpts", () => {
  const original = files();
  const delivery = createUploadedDelivery(original, spec(), "en", 2);
  assert.equal(delivery.variant, "upload");
  assert.equal(delivery.sequence, 2);
  assert.match(delivery.id, /^[0-9a-f-]{36}$/u);
  assert.ok(Number.isFinite(Date.parse(delivery.submittedAt)));
  const snapshot: Record<string, string> = delivery.files!;
  assert.deepEqual(snapshot, original);
  assert.deepEqual(delivery.evidence.map(entry => [entry.criterionId, entry.finding]), [["page-1", "pass"], ["page-2", "pass"], ["link", "pass"], ["mobile", "needs_human"], ["manual-1", "needs_human"]]);
  for (const entry of delivery.evidence) {
    assert.ok(entry.excerpt.length <= 700);
    assert.ok((delivery.files as Record<string, string>)[entry.file].includes(entry.excerpt));
  }
  original["index.html"] = "changed later";
  assert.notEqual(delivery.files?.["index.html"], original["index.html"]);
  assert.deepEqual(JSON.parse(JSON.stringify(delivery)).files, delivery.files);
  invalid(() => createUploadedDelivery(files(), spec(), "en", 0));
});

test("required pages missing from a valid upload produce saved failures rather than losing the delivery", () => {
  const delivery = createUploadedDelivery({"index.html": html("<p>Home</p>")}, spec(), "zh", 1);
  assert.equal(finding(delivery.evidence, "page-1"), "pass");
  assert.equal(finding(delivery.evidence, "page-2"), "fail");
  assert.equal(finding(delivery.evidence, "link"), "fail");
  assert.equal(delivery.evidence.find(entry => entry.criterionId === "page-2")?.excerpt, "");
});

test("file validation rejects paths, prototypes, case collisions, accessors and non-text files", () => {
  const base = {"index.html": html()};
  for (const value of [null, [], "file", {}, {"styles.css": "body{}"}, {...base, "Index.HTML": html()}, {...base, "../page.html": html()}, {...base, "dir\\page.html": html()}, {...base, "page.html\n": html()}, {...base, "script.js": "alert(1)"}, {...base, "bad.html": "  "}, {...base, "bad.css": "a\0b"}, {...base, "bad.css": "\ud800"}, {...base, "bad.html": 123}, {...base, "bad.html": new Uint8Array([1])}, Object.create({"index.html": html()}), JSON.parse('{"__proto__":"bad","index.html":"hello"}')]) invalid(() => validateStaticFiles(value));
  const accessor = {...base};
  Object.defineProperty(accessor, "bad.html", {get() { throw new Error("must not invoke accessor"); }, enumerable: true});
  invalid(() => validateStaticFiles(accessor));
  invalid(() => validateStaticFiles({...base, [Symbol("extra")]: "bad"}));
  const nullPrototype = Object.assign(Object.create(null), base);
  assert.deepEqual(validateStaticFiles(nullPrototype), base);
  invalid(() => validateStaticFiles(Object.fromEntries([["index.html", html()], ...Array.from({length: 40}, (_, n) => [`p${n}.css`, "body{}"])])));
});

test("file limits count real UTF-8 bytes with exact per-file and total boundaries", () => {
  const base = {"index.html": html()};
  assert.equal(new TextEncoder().encode("汉").byteLength, 3);
  assert.ok(validateStaticFiles({...base, "a.css": "x".repeat(65536)}));
  invalid(() => validateStaticFiles({...base, "a.css": "x".repeat(65537)}));
  invalid(() => validateStaticFiles({...base, "a.css": "汉".repeat(21846)}));
  const indexBytes = new TextEncoder().encode(base["index.html"]).byteLength;
  const exact = {...base, "a.css": "x".repeat(65536), "b.css": "x".repeat(65536), "c.css": "x".repeat(65536), "d.css": "x".repeat(65536-indexBytes)};
  assert.ok(validateStaticFiles(exact));
  invalid(() => validateStaticFiles({...exact, "d.css": `${exact["d.css"]}x`}));
});

test("a page must contain an unambiguous real HTML doctype, nonempty title and body", () => {
  for (const content of ["<p>not a document</p>", html().replace("<!doctype html>", ""), html().replace("Delivered page", " "), html().replace("<main>Delivered content</main>", ""), `<!--${html()}-->`, `<script>${html()}</script>`, `<template>${html()}</template>`, html().replace("</body>", ""), html().replace("</main>", "</section>"), html().replace("<body>", "<body><body>"), `<!doctype html>${html()}`]) {
    const result = createUploadedDelivery({"index.html": content}, spec(), "en", 1);
    assert.equal(finding(result.evidence, "page-1"), "fail", content);
  }
  const minimal = "<!doctype html><title>Home</title><body><p>Content</p></body>";
  assert.equal(finding(createUploadedDelivery({"index.html": minimal}, spec(), "en", 1).evidence, "page-1"), "pass");
});

test("comments and raw/inert containers cannot supply a fake anchor or destination", () => {
  const anchor = '<a href="contact.html#booking">Book a call</a>';
  const target = '<section id="booking">Booking</section>';
  for (const wrap of [(s:string) => `<!--${s}-->`, (s:string) => `<script>${s}</script>`, (s:string) => `<style>${s}</style>`, (s:string) => `<template>${s}</template>`, (s:string) => `<template><template>${s}</template></template>`, (s:string) => `<textarea>${s}</textarea>`, (s:string) => `<svg>${s}</svg>`]) {
    assert.equal(finding(createUploadedDelivery({...files(), "index.html": html(`<p>Home</p>${wrap(anchor)}`)}, spec(), "en", 1).evidence, "link"), "fail");
    assert.equal(finding(createUploadedDelivery({...files(), "contact.html": html(`<p>Contact</p>${wrap(target)}`)}, spec(), "en", 1).evidence, "link"), "fail");
  }
});

test("link checks require exact attributes, one matching label and a unique real target", () => {
  for (const body of [
    '<div data-href="contact.html#booking">Book a call</div>',
    '<a data-href="contact.html#booking">Book a call</a>',
    '<a href="https://example.test/contact.html#booking">Book a call</a>',
    '<a href="javascript:alert(1)">Book a call</a>',
    '<a href="contact.html#missing">Book a call</a>',
    '<a href="contact.html#booking" href="elsewhere.html#booking">Book a call</a>',
    '<a hidden href="contact.html#booking">Book a call</a>',
    '<a href="contact.html#booking">Book a call</a><a href="contact.html#booking">Book a call</a>',
    '<p data-fake="<a href=contact.html#booking>Book a call</a>">Home</p>',
  ]) assert.equal(finding(createUploadedDelivery({...files(), "index.html": html(body)}, spec(), "en", 1).evidence, "link"), "fail", body);
  for (const body of ['<section data-id="booking">Contact</section>', '<section id="booking">One</section><div id="booking">Two</div>', '<section id="booking" id="other">Contact</section>']) assert.equal(finding(createUploadedDelivery({...files(), "contact.html": html(body)}, spec(), "en", 1).evidence, "link"), "fail");
});

test("safe relative/same-page links, nested text and supported entities are inspected without fetching", () => {
  const relative = {...files(), "index.html": html('<a data-note="1 > 0" href="./contact.html#booking">Book&nbsp;<strong>a</strong>\ncall</a>')};
  assert.equal(finding(createUploadedDelivery(relative, spec(), "en", 1).evidence, "link"), "pass");
  const samePage = {...spec(), link: {from: "index.html", text: "Book a call", to: "index.html#booking"}};
  const sameFiles = {"index.html": html('<a href="#booking">Book a call</a><section id="booking">Here</section>')};
  assert.equal(finding(createUploadedDelivery(sameFiles, samePage, "en", 1).evidence, "link"), "pass");
  assert.equal(finding(createUploadedDelivery({...relative, "index.html": relative["index.html"].replace("<head>", '<head><base href="https://example.test/">')}, spec(), "en", 1).evidence, "link"), "fail");
});

test("mobile and manual decisions never auto-pass even with convincing markup", () => {
  const source = {...files(), "index.html": html('<meta name="viewport" content="width=device-width"><p>Approved colours and perfect mobile layout</p>')};
  const evidence = createUploadedDelivery(source, spec(), "zh", 1).evidence;
  assert.equal(finding(evidence, "mobile"), "needs_human");
  assert.equal(finding(evidence, "manual-1"), "needs_human");
});

function customAgreement(): ProofQuote {
  const parsed = parseStaticProject(input(), "en");
  const delivery = createUploadedDelivery(files(), parsed.project, "en", 1);
  return {
    id: "custom-test", reference: "PBP-CUSTOM", workflow: "proof-v1",
    title: parsed.title, summary: parsed.summary, brief: parsed.summary,
    clientName: "Client", currency: "AUD", language: "en", hourlyRateCents: parsed.totalCents,
    totalCents: parsed.totalCents, lineItems: [{id: "static-site", description: parsed.title, quantity: 1, unitPriceCents: parsed.totalCents}],
    timelineDays: 1, assumptions: [], questions: [], status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: new Date().toISOString(),
    proof: {project: parsed.project, criteria: parsed.criteria, paymentState: "unfunded", audit: [], delivery,
      review: {deliveryId: delivery.id, reviewedAt: new Date().toISOString(), mode: "demo", summary: "Static source review only"}},
  };
}

test("a reviewed custom upload still needs active authorization and every mobile/manual confirmation", () => {
  const quote = customAgreement();
  const accepted = {confirm: true, deliveryId: quote.proof.delivery!.id, manualChecks: ["mobile", "manual-1"]};
  assert.throws(() => validateAcceptance(quote, accepted), /confirmed authorization/u);
  quote.proof.paymentState = "authorized";
  quote.proof.authorizationId = "AUTH-CUSTOM";
  quote.proof.authorizedAt = new Date().toISOString();
  quote.proof.authorizationExpiresAt = new Date(Date.now() + 600_000).toISOString();
  for (const manualChecks of [[], ["mobile"], ["manual-1"]]) {
    assert.throws(() => validateAcceptance(quote, {...accepted, manualChecks}), /human check/u);
  }
  assert.deepEqual(validateAcceptance(quote, accepted), ["mobile", "manual-1"]);
  assert.throws(() => validateAcceptance(quote, {...accepted, confirm: false}), /Explicit confirmation/u);
});

test("a replacement custom upload invalidates the old review and old accepted delivery id", () => {
  const quote = customAgreement();
  quote.proof.paymentState = "authorized";
  quote.proof.authorizationId = "AUTH-CUSTOM";
  quote.proof.authorizationExpiresAt = new Date(Date.now() + 600_000).toISOString();
  const oldId = quote.proof.delivery!.id;
  const newDelivery = createUploadedDelivery(files(), quote.proof.project!, "en", 2);
  quote.proof.delivery = newDelivery;
  const newAcceptance = {confirm: true, deliveryId: newDelivery.id, manualChecks: ["mobile", "manual-1"]};
  assert.throws(() => validateAcceptance(quote, newAcceptance), /current delivery version/u);
  assert.throws(() => validateAcceptance(quote, {...newAcceptance, deliveryId: oldId}), /current delivery version/u);
  quote.proof.review = {deliveryId: newDelivery.id, reviewedAt: new Date().toISOString(), mode: "demo", summary: "New version checked"};
  assert.throws(() => validateAcceptance(quote, {...newAcceptance, deliveryId: oldId}), /current delivery version/u);
  assert.deepEqual(validateAcceptance(quote, newAcceptance), ["mobile", "manual-1"]);
  const missingPage = createUploadedDelivery({"index.html": html()}, quote.proof.project!, "en", 3);
  quote.proof.delivery = missingPage;
  quote.proof.review = {...quote.proof.review, deliveryId: missingPage.id};
  assert.throws(() => validateAcceptance(quote, {...newAcceptance, deliveryId: missingPage.id}), /failed requirements/u);
});
