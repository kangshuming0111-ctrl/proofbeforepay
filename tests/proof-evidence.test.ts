import assert from "node:assert/strict";
import test from "node:test";
import { createProofDelivery, getProofFixture, inspectProofFiles, proofCriteria } from "../lib/proof-evidence.ts";

test("the fixed sample contract keeps the same criterion identifiers in both languages", () => {
  for (const language of ["en", "zh"] as const) {
    assert.deepEqual(proofCriteria(language).map((criterion) => criterion.id), ["pages", "mobile", "booking"]);
    assert.ok(proofCriteria(language).every((criterion) => criterion.source.length > 10));
  }
});

test("first delivery fails absent Contact page and booking destination; revised files satisfy those checks", () => {
  for (const language of ["en", "zh"] as const) {
    const first = createProofDelivery("flawed", language);
    const revised = createProofDelivery("fixed", language);
    assert.deepEqual(first.evidence.map((entry) => [entry.criterionId, entry.finding]), [
      ["pages", "fail"], ["mobile", "needs_human"], ["booking", "fail"],
    ]);
    assert.deepEqual(revised.evidence.map((entry) => [entry.criterionId, entry.finding]), [
      ["pages", "pass"], ["mobile", "needs_human"], ["booking", "pass"],
    ]);
    assert.notEqual(first.id, revised.id);
    assert.ok(Number.isFinite(Date.parse(revised.submittedAt)));
  }
});

test("findings use actual files, not fixture labels or a stale manifest", () => {
  const fixture = getProofFixture("fixed");
  delete fixture.files["contact.html"];
  const findings = inspectProofFiles(fixture.files, "en");
  assert.equal(findings.find((entry) => entry.criterionId === "pages")?.finding, "fail");
  assert.equal(findings.find((entry) => entry.criterionId === "booking")?.finding, "fail");
  assert.match(findings[0].explanation, /contact\.html/u);
});

test("a file named Contact is insufficient without the Contact document, and commented targets do not pass", () => {
  const fixture = getProofFixture("fixed");
  fixture.files["contact.html"] = fixture.files["contact.html"]
    .replace("<title>Contact", "<title>Services")
    .replace('<section id="booking" aria-labelledby="booking-heading">', '<!-- <section id="booking"> -->\n<section>');
  const findings = inspectProofFiles(fixture.files, "en");
  assert.equal(findings.find((entry) => entry.criterionId === "pages")?.finding, "fail");
  assert.equal(findings.find((entry) => entry.criterionId === "booking")?.finding, "fail");
});

test("breaking or moving the link destination changes the result without changing the variant", () => {
  const fixture = getProofFixture("fixed");
  fixture.files["index.html"] = fixture.files["index.html"].replace("contact.html#booking", "contact.html#missing");
  assert.equal(inspectProofFiles(fixture.files, "en").find((entry) => entry.criterionId === "booking")?.finding, "fail");
  fixture.files["contact.html"] += '\n<section id="missing">New local booking target</section>';
  assert.equal(inspectProofFiles(fixture.files, "en").find((entry) => entry.criterionId === "booking")?.finding, "pass");
  fixture.files["index.html"] = fixture.files["index.html"].replace("contact.html#missing", "https://example.test/#booking");
  assert.equal(inspectProofFiles(fixture.files, "en").find((entry) => entry.criterionId === "booking")?.finding, "fail");
});

test("every original finding cites an exact excerpt in an exported sample file", () => {
  for (const variant of ["flawed", "fixed"] as const) {
    const fixture = getProofFixture(variant);
    for (const entry of inspectProofFiles(fixture.files, "en")) {
      assert.ok(entry.excerpt.length > 0);
      assert.ok(fixture.files[entry.file]?.includes(entry.excerpt), `${entry.id} should cite existing source`);
    }
  }
});

test("mobile usability always remains a human decision, with and without responsive hints", () => {
  const fixture = getProofFixture("fixed");
  assert.equal(inspectProofFiles(fixture.files, "en").find((entry) => entry.criterionId === "mobile")?.finding, "needs_human");
  delete fixture.files["styles.css"];
  const mobile = inspectProofFiles(fixture.files, "en").find((entry) => entry.criterionId === "mobile");
  assert.equal(mobile?.finding, "needs_human");
  assert.match(mobile?.explanation || "", /not rendered usability/u);
});

test("fixture callers cannot alter later submissions", () => {
  const fixture = getProofFixture("fixed");
  fixture.files["contact.html"] = "";
  const later = createProofDelivery("fixed", "en");
  assert.equal(later.evidence.find((entry) => entry.criterionId === "pages")?.finding, "pass");
  assert.equal(later.evidence.find((entry) => entry.criterionId === "booking")?.finding, "pass");
});

test("the delivery persists the exact files its evidence inspected, independent of other fixture copies", () => {
  const delivery = createProofDelivery("fixed", "en");
  assert.ok(delivery.files);
  for (const entry of delivery.evidence) {
    assert.ok(delivery.files[entry.file]?.includes(entry.excerpt));
  }
  const other = getProofFixture("fixed");
  other.files["contact.html"] = "Changed after submission";
  assert.match(delivery.files["contact.html"], /<section id="booking"/u);
  const serialized = JSON.parse(JSON.stringify(delivery));
  assert.deepEqual(serialized.files, delivery.files);
});

test("a data-id attribute is not a real booking destination", () => {
  const fixture = getProofFixture("fixed");
  fixture.files["contact.html"] = fixture.files["contact.html"].replace('id="booking"', 'data-id="booking"');
  assert.equal(inspectProofFiles(fixture.files, "en").find((entry) => entry.criterionId === "booking")?.finding, "fail");
});


test("page evidence cites delivered title tags directly and reports changed or missing titles", () => {
  const fixture = getProofFixture("fixed");
  const pages = inspectProofFiles(fixture.files, "en")[0];
  assert.equal(pages.file, "index.html");
  assert.equal(pages.excerpt, "<title>Home | Willow Studio sample</title>");
  for (const name of ["Home", "Services", "Contact"]) {
    assert.ok(pages.explanation.includes(`<title>${name} | Willow Studio sample</title>`));
  }
  assert.ok(!pages.excerpt.includes("pagesAvailable"));
  fixture.files["services.html"] = fixture.files["services.html"].replace("<title>Services", "<title>Wrong");
  delete fixture.files["contact.html"];
  const changed = inspectProofFiles(fixture.files, "en")[0];
  assert.equal(changed.finding, "fail");
  assert.match(changed.explanation, /services\.html: <title>Wrong/u);
  assert.match(changed.explanation, /contact\.html: file not delivered/u);
  assert.ok(!changed.explanation.includes("<title>Contact |"));
  assert.equal(changed.file, "index.html");
  assert.ok(fixture.files[changed.file].includes(changed.excerpt));
});

test("the showcase revision fixes the stated hours in actual source, not just its label", () => {
  const first = getProofFixture("flawed");
  const revised = getProofFixture("fixed");
  for (const file of ["index.html", "services.html"]) {
    assert.match(first.files[file], /Monday to Friday, 10am–6pm/u);
    assert.ok(!first.files[file].includes("Monday to Friday, 11am–8pm"));
  }
  for (const file of ["index.html", "services.html", "contact.html"]) {
    assert.match(revised.files[file], /Monday to Friday, 11am–8pm/u);
    assert.ok(!revised.files[file].includes("Monday to Friday, 10am–6pm"));
  }
});

test("all showcase HTML/CSS fits the source-assessment budget without pretending to run a booking service", () => {
  for (const variant of ["flawed", "fixed"] as const) {
    const files = Object.entries(getProofFixture(variant).files).filter(([name]) => /\.(?:html|css)$/u.test(name));
    assert.ok(files.every(([, contents]) => contents.length < 6000));
    assert.ok(files.reduce((sum, [, contents]) => sum + contents.length, 0) < 24000);
    for (const [name, contents] of files) {
      if (name.endsWith(".html")) {
        assert.match(contents, /Controlled sample delivery/u);
        assert.ok(!/<script\b|<iframe\b/iu.test(contents));
        assert.ok(!/(?:src|href)=["']https?:/iu.test(contents));
      }
    }
    if (variant === "fixed") assert.match(getProofFixture(variant).files["contact.html"], /No calendar, form submission or email service is connected/u);
  }
});
