import assert from "node:assert/strict";
import test from "node:test";
import {assessmentEvidenceScope} from "../lib/assessment-evidence-scope.ts";
import {assessDeliveryLegacyReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const exact = (source: string, title = "Required wording", id = "manual-1") => ({id, title, source});

test("a whole exact-copy directive treats runtime words inside its quotation as literal data", () => {
  for (const source of [
    'The page copy must include the exact wording "Payment complete".',
    'The website text must show the exact text "We record every enquiry durably".',
    'The site copy must contain the exact string "Automatically process a refund".',
    '页面文案必须逐字包含“预约成功”。',
    '网页文字须原样显示「已保存交易记录」。',
  ]) assert.deepEqual(assessmentEvidenceScope(exact(source)), {category: "source_text", reason: "literal_content"}, source);
});

test("an intake-derived title repeating the same complete exact directive does not revive its quoted runtime words", () => {
  for (const source of [
    'The page copy must include the exact wording "Payment complete".',
    'The website text must show the exact text "We record every enquiry durably".',
    '页面文案必须逐字包含“预约成功”。',
  ]) assert.deepEqual(assessmentEvidenceScope(exact(source, source)), {category: "source_text", reason: "literal_content"});
});

test("exact-copy wording cannot hide an additional runtime obligation or runtime title", () => {
  const base = 'The page copy must include the exact wording "Payment complete".';
  for (const source of [
    base + " The payment must actually complete.",
    base + " Also save a durable transaction record.",
    'The page copy must include the exact wording "Payment complete" and send a confirmation email.',
    '页面文案必须逐字包含“预约成功”。同时必须提交预约并写入后台。',
  ]) assert.equal(assessmentEvidenceScope(exact(source)).category, "requires_observation", source);
  for (const title of ["Payment functionality", "Automatically process a refund", "Mobile layout", "Save transaction records"])
    assert.equal(assessmentEvidenceScope(exact(base, title)).category, "requires_observation", title);
  assert.deepEqual(assessmentEvidenceScope(exact(base, "Required wording", "mobile")), {category: "requires_observation", reason: "mobile"});
  assert.equal(assessmentEvidenceScope(exact(base, 'The page copy must include the exact wording "Actual payment". Then send an email.')).category, "requires_observation");
});

function quote(source: string, body: string) {
  const other = "The page copy must include contact details.";
  const project: EvaluationProject = {
    id: "literal-scope-controlled", stratum: "boundary", language: "en", title: "Literal source scope fixture",
    summary: "Check exact page copy only. No runtime execution is asserted.",
    files: {
      "index.html": `<!doctype html><html><head><title>Copy fixture</title></head><body>${body}<p>Contact details: test@example.invalid</p></body></html>`,
      "about.html": "<!doctype html><html><head><title>About</title></head><body><p>Controlled test fixture.</p></body></html>",
      "style.css": "body { font-family: sans-serif; }",
    },
    criteria: [source, other].map((text, index) => ({id: `manual-${index + 1}`, title: index ? "Contact copy" : "Required wording", source: text,
      reference: {expectedStatus: "supported", rationale: "Controlled transport fixture only, not a real model result.", relevantFiles: ["index.html"], requiresSemanticReview: true}})),
  };
  return projectQuote(project);
}

test("actual assessment preserves source support for a quoted payment label without proving a payment", async () => {
  const q = quote('The page copy must include the exact wording "Payment complete".', "<p>Payment complete</p>");
  const before = structuredClone(q); let calls = 0;
  const result = await assessDelivery(q, {DEEPSEEK_API_KEY: "offline-controlled-no-network"}, async () => {
    calls++;
    return Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify({
      items: q.proof.criteria.map(c => ({criterionId: c.id, status: "supported", explanation: "The supplied source contains the required copy; no execution is established.",
        citations: [{file: "index.html", excerpt: c.id === "manual-1" ? "<p>Payment complete</p>" : "<p>Contact details: test@example.invalid</p>"}]})),
      risks: [], limitations: ["Controlled provider response; source copy is not a payment result."],
    })}}]});
  });
  assert.equal(calls, 1);
  assert.equal(result.items[0].status, "supported");
  assert.equal(q.proof.paymentState, "unfunded");
  assert.deepEqual(q, before);
});
