import assert from "node:assert/strict";
import test from "node:test";
import type {ProofBusinessExpected, ProofQuote} from "../lib/contracts.ts";
import {createSourceBusinessEvidenceCheck} from "../lib/source-business-evidence.ts";
import {getBusinessCheckPlan} from "../lib/business-checks.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";

const html = (body: string, head = "") => `<!doctype html><html><head><title>Source fixture</title>${head}</head><body>${body}</body></html>`;
const price: ProofBusinessExpected = {kind: "item_price", label: "Noodles", currency: "AUD", amountMinor: 1800};
function quote(extra: Record<string, string> = {}, targets = ["menu.html"]): ProofQuote {
  const summary = "Display the agreed menu prices.", unit = summaryCoverageUnits(summary)[0];
  const files = {"index.html": html("<p>Menu source fixture.</p>"), "menu.html": html("<p>Noodles AUD 19</p>"),
    "contact.html": html('<form><input placeholder="Name"></form>'), ...extra};
  const requiredPages = Object.keys(files).filter(file => file.endsWith(".html"));
  const parsed = parseStaticProject({title: "Bounded per-page source fixture", summary, amount: "1.00", requiredPages, manualRequirements: [],
    coverage: {version: 1, sourceText: summary, confirmed: true, decisions: [{id: unit.id, disposition: "include"}]},
    businessChecks: {confirmed: true, items: targets.map((file, index) => ({id: `business-${index + 1}`, criterionId: unit.id, file,
      source: {start: unit.start, end: unit.end, excerpt: unit.text}, expected: price}))}}, "en");
  const delivery = createUploadedDelivery(files, parsed.project, "en", 1), now = "2026-11-05T00:00:00.000Z";
  return {id: "source-business-scope", reference: "PBP-SYNTHETIC", title: parsed.title, summary, brief: summary, clientName: "Synthetic",
    currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100, lineItems: [{id: "test", description: "Synthetic", quantity: 1, unitPriceCents: 100}],
    assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: now, workflow: "proof-v1",
    proof: {project: parsed.project, criteria: parsed.criteria, delivery, paymentState: "unfunded", audit: [],
      review: {deliveryId: delivery.id, mode: "demo", summary: "Synthetic source-only fixture.", reviewedAt: now}}};
}
const check = (q: ProofQuote) => createSourceBusinessEvidenceCheck(q.proof.delivery!.files!, getBusinessCheckPlan(q))("coverage-1");

test("a confirmed page price is not made unknown by another page's form, script or unrelated generated stylesheet", () => {
  const cases: Record<string, string>[] = [
    {},
    {"contact.html": html('<script>document.body.textContent="contact"</script>')},
    {"unrelated.css": 'p::after {content:"AUD 18"}'},
  ];
  for (const extra of cases) {
    const q = quote(extra), before = structuredClone(q), result = check(q);
    assert.equal(result.kind, "mismatch");
    assert.deepEqual(result.citations.map(c => [c.file, c.excerpt]), [["menu.html", "<p>Noodles AUD 19</p>"]]);
    assert.deepEqual(q, before);
  }
});

test("target page uncertainty is preserved, including inputs, scripts, templates and unresolved stylesheets", () => {
  for (const source of [
    html('<p>Noodles AUD 19</p><input placeholder="Menu">'),
    html('<p>Noodles AUD 19</p><script>document.body.textContent="Noodles AUD 18"</script>'),
    html('<p>Noodles AUD 19</p><template><p>Noodles AUD 18</p></template>'),
    html('<p>Noodles AUD 19</p>', '<link rel="stylesheet" href="missing.css">'),
    html('<p>Noodles AUD 19</p>', '<link rel="stylesheet" href="https://example.invalid/site.css">'),
    html('<p>Noodles AUD 19</p>', '<base href="https://example.invalid/">'),
  ]) assert.equal(check(quote({"menu.html": source})).kind, "unknown", source);
});

test("target-linked local CSS uses parsed relative URLs and rel tokens but does not follow imports", () => {
  const source = html('<p>Noodles AUD 19</p>', '<link REL="alternate\tSTYLESHEET" href="assets/../menu.css?v=1#style">');
  assert.equal(check(quote({"menu.html": source, "menu.css": "p {font-size:16px}"})).kind, "mismatch");
  for (const css of ['p::after {content:"AUD 18"}', '@import "other.css";', 'p {co\\6cor:red}'])
    assert.equal(check(quote({"menu.html": source, "menu.css": css, "other.css": "p{}"})).kind, "unknown", css);
});

test("all same-criterion target pages retain their separate uncertainty and mismatch outcomes", () => {
  const q = quote({"second.html": html('<p>Noodles AUD 19</p><script>void 0</script>')}, ["menu.html", "second.html"]);
  const result = check(q);
  assert.equal(result.kind, "mismatch");
  assert.deepEqual(result.checks.map(c => [c.file, c.kind]), [["menu.html", "mismatch"], ["second.html", "unknown"]]);
});

test("actual assessment vetoes a wrong target-page price while leaving unrelated form behavior untested", async () => {
  for (const expectedStatus of ["changes_suggested", "supported"] as const) {
    const q = quote(expectedStatus === "supported" ? {"menu.html": html("<p>Noodles AUD 18</p>")} : {});
    const before = structuredClone(q), excerpt = expectedStatus === "supported" ? "<p>Noodles AUD 18</p>" : "<p>Noodles AUD 19</p>";
    let calls = 0;
    const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-offline-no-network"}, async () => {
      calls++;
      return Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify({
        items: q.proof.criteria.map(c => ({criterionId: c.id, status: "supported", explanation: "Controlled model source advice, not observed operation.", citations: [{file: "menu.html", excerpt}]})),
        risks: [], limitations: ["Controlled response; form operation was not observed."],
      })}}]});
    });
    assert.equal(calls, 1);
    assert.equal(report.items.find(c => c.criterionId === "coverage-1")!.status, expectedStatus);
    assert.equal(report.items.find(c => c.criterionId === "mobile")!.status, "insufficient_evidence");
    assert.equal(q.proof.paymentState, "unfunded");
    assert.deepEqual(q, before);
  }
});
