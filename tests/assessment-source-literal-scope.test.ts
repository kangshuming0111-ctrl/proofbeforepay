import assert from "node:assert/strict";
import test from "node:test";
import {assessmentEvidenceScope} from "../lib/assessment-evidence-scope.ts";
import {assessDeliveryLegacyReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote, type EvaluationProject, type EvaluationStatus} from "../scripts/run-project-assessment-evaluation.ts";

const directive = (source: string, title = "Required source text", id = "manual-1") => ({id, title, source});
const labels = [
  "Contact form source content must label Full name, Email address, Phone number, and Message.",
  "Login page source content must include the labels Username or email * and Password *.",
  "Dashboard page source copy must include the exact table headings Payment Mode and Payment Status.",
];
const notice = "Contact page source copy must include the exact notice: Form submission successful!";

test("complete source-label lists and an exact source notice admit text evidence without claiming operation", () => {
  for (const source of [...labels, notice]) {
    assert.deepEqual(assessmentEvidenceScope(directive(source)), {category: "source_text", reason: "literal_content"}, source);
    assert.deepEqual(assessmentEvidenceScope(directive(source, source)), {category: "source_text", reason: "literal_content"}, `Repeated title: ${source}`);
  }
});

test("source-only label and notice allowances reject appended or embedded operational clauses", () => {
  for (const source of [
    labels[0] + " Then send a real email.",
    labels[1] + " Actual authentication must reject the wrong password.",
    labels[2] + " Also charge the card.",
    labels[2].replace(".", " and actually charge the card."),
    labels[0].replace("Message.", "Message and store transaction records."),
    labels[0].replace("Message.", "Message and persist customer data."),
    labels[0].replace("Message.", "Message and Archive enquiries."),
    labels[0].replace("Message.", "Message; save the request."),
    labels[0].replace("Message.", "Message and guarantee email delivery."),
    notice + " Then charge $9.",
    notice.replace("successful!", "successful after email delivery!"),
    notice.replace("successful!", "successful and save the enquiry!"),
  ]) assert.equal(assessmentEvidenceScope(directive(source)).category, "requires_observation", source);
  for (const title of ["Payment functionality", "Login authentication", "Mobile layout", "Save transaction records"])
    for (const source of [...labels, notice]) assert.equal(assessmentEvidenceScope(directive(source, title)).category, "requires_observation", `${title}: ${source}`);
  assert.equal(assessmentEvidenceScope(directive(labels[2], "Source text", "mobile")).reason, "mobile");
});

test("unrecognised, empty, overlong or excessive label lists remain conservative", () => {
  for (const source of [
    "Contact form source content must label .",
    "Contact form source content must label Name,, Email.",
    "Contact form source content must label One, Two, Three, Four, Five, Six and Seven.",
    "Dashboard page source copy must include the labels One, Two, Three, Four, Five, Six and Seven.",
    `Contact form source content must label ${"A".repeat(81)}.`,
    "Contact form source content must label Name\nand execute a payment.",
    "Contact form must be useful, include Full name and send email.",
    "Contact page source copy must include the exact notice: Complete. Then charge $9.",
  ]) assert.equal(assessmentEvidenceScope(directive(source)).category, "requires_observation", source);
});

test("explicit HTML title content and bounded Chinese wording instructions admit source-only advice", () => {
  for (const source of [
    "HTML title content must be Personal - Start Bootstrap Theme.",
    "Each page's HTML title content must identify Personal rather than Modern Business.",
    "about.html 的文字须说明咖啡馆由 Hernandez brothers 于 1987 年创立。",
  ]) assert.equal(assessmentEvidenceScope(directive(source)).category, "source_text", source);
  for (const source of [
    "HTML title content must be Personal and the form must send an email.",
    "Each page's HTML title content must identify Personal rather than Modern Business and send an email.",
    "Each page's HTML title content must identify Personal rather than Modern Business. Actually process a refund.",
    "about.html 的文字须说明创立年份，同时实际处理退款。",
    "about.html 的文字须说明创立年份，并保存可查询的交易记录。",
  ]) assert.equal(assessmentEvidenceScope(directive(source)).category, "requires_observation", source);
});

function fixture(source: string, body: string) {
  const sources = [source, "The page copy must list contact details."], project: EvaluationProject = {
    id: "source-literal-controlled", stratum: "boundary", language: "en", title: "Source-literal admission fixture",
    summary: "Inspect literal source content only; do not infer working behaviour.",
    files: {"index.html": `<!doctype html><html><head><title>Source fixture</title></head><body>${body}<p>Contact details</p></body></html>`,
      "about.html": "<!doctype html><html><head><title>About</title></head><body><p>Fixture</p></body></html>", "site.css": "body {font-family:sans-serif}"},
    criteria: sources.map((text, i) => ({id: `manual-${i + 1}`, title: "Required source text", source: text,
      reference: {expectedStatus: "supported", rationale: "Controlled provider-transport test, not real model execution.", relevantFiles: ["index.html"], requiresSemanticReview: true}})),
  };
  return projectQuote(project);
}

test("actual assessment preserves grounded source-label advice and never promotes a raw unknown", async () => {
  for (const [source, body] of [
    [labels[0], "<form><label>Full name</label><label>Email address</label><label>Phone number</label><label>Message</label></form>"],
    [labels[1], "<form><label>Username or email *</label><label>Password *</label></form>"],
    [labels[2], "<table><tr><th>Payment Mode</th><th>Payment Status</th></tr></table>"],
    [notice, '<div class="d-none">Form submission successful!</div>'],
  ]) for (const rawStatus of ["supported", "insufficient_evidence"] satisfies EvaluationStatus[]) {
    const q = fixture(source, body), before = structuredClone(q); let calls = 0;
    const result = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-offline-no-network"}, async () => {
      calls++;
      return Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify({items: q.proof.criteria.map(c => ({
        criterionId: c.id, status: rawStatus, explanation: "Controlled source-only advice, not a working form or payment result.",
        citations: [{file: "index.html", excerpt: c.id === "manual-1" ? body : "<p>Contact details</p>"}],
      })), risks: [], limitations: ["No browser, payment or authentication was executed."]})}}]});
    });
    assert.equal(calls, 1); assert.equal(result.items[0].status, rawStatus);
    assert.deepEqual(q, before); assert.equal(q.proof.paymentState, "unfunded");
  }
});

const operational = [
  "The page copy must include the contact details and guarantee email delivery.",
  "The page copy must list prices and customer data must survive a reboot.",
  "The page copy must list prices and deduct the fee from the card.",
];

test("explicit email-delivery, reboot-retention and card-debit obligations cannot borrow a copy allowance", async () => {
  const results: {source: string; scope: string; status: string}[] = [];
  for (const source of operational) {
    const body = "<p>Contact details and prices are source copy only.</p>", q = fixture(source, body), before = structuredClone(q);
    const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-offline-no-network"}, async () => Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify({
      items: q.proof.criteria.map(c => ({criterionId: c.id, status: "supported", explanation: "Deliberately overconfident controlled response to exercise the server boundary.", citations: [{file: "index.html", excerpt: body}]})),
      risks: [], limitations: ["No operation was actually executed."],
    })}}]}));
    results.push({source, scope: assessmentEvidenceScope(directive(source)).category, status: report.items[0].status});
    assert.deepEqual(q, before);
  }
  assert.deepEqual(results, operational.map(source => ({source, scope: "requires_observation", status: "insufficient_evidence"})));
  for (const action of ["debit the fee from the card", "withdraw the fee from the account", "debit the card for the fee"])
    assert.equal(assessmentEvidenceScope(directive(`The page copy must list prices and ${action}.`)).category, "requires_observation", action);
});

test("the same operational words inside one exact quoted string remain literal data", () => {
  for (const text of operational) {
    const source = `The page copy must include the exact wording "${text}".`;
    assert.equal(assessmentEvidenceScope(directive(source)).category, "source_text", source);
    for (const title of ["Guarantee email delivery", "Customer data must survive a reboot", "Deduct the fee from the card"])
      assert.equal(assessmentEvidenceScope(directive(source, title)).category, "requires_observation", title);
  }
});
