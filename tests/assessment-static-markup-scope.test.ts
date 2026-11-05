import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessmentEvidenceScope} from "../lib/assessment-evidence-scope.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote, validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";

const corpus = validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/real-project-long-checklist-corpus-2026-11-05.json", import.meta.url), "utf8")));
const sourceCriterion = (source: string, title = "Source inspection", id = "manual-1") => ({id, title, source});
const staticCriteria = corpus.projects[0].criteria.filter(c => c.reference.expectedStatus !== "insufficient_evidence");

test("the real sixteen-item source checklist distinguishes twelve static assertions from four runtime requirements", () => {
  const actual = corpus.projects[0].criteria.map(c => ({source: c.source, category: assessmentEvidenceScope(c).category}));
  const expected = corpus.projects[0].criteria.map(c => ({source: c.source, category: c.reference.expectedStatus === "insufficient_evidence" ? "requires_observation" : "source_text"}));
  assert.equal(staticCriteria.length, 12); assert.deepEqual(actual, expected);
});

test("atomic source inspections cannot carry an appended operation or a separate runtime title", () => {
  for (const criterion of staticCriteria) {
    for (const suffix of [" The form must send a real email.", " Then actually charge the card.", " Also save a durable transaction record."])
      assert.equal(assessmentEvidenceScope(sourceCriterion(criterion.source + suffix)).category, "requires_observation", criterion.source + suffix);
    for (const title of ["Working login functionality", "Actual payment", "Mobile layout", "Save transaction records"])
      assert.equal(assessmentEvidenceScope({...criterion, title}).category, "requires_observation", `${title}: ${criterion.source}`);
    assert.equal(assessmentEvidenceScope({...criterion, id: "mobile"}).reason, "mobile");
  }
});

test("bounded quoted attribute values and literal text remain data, not operations", () => {
  for (const source of [
    'The delivered cinema HTML document title must be "After Hours" rather than "Action Camera".',
    'In the delivered shop HTML the primary submit button text must read "Action Camera" rather than "Working search".',
    'In the delivered login HTML the input immediately under "After Hours" must use type="password" rather than type="text".',
    'Dashboard source text must not contain "Actually charge the card".',
    'Login source labels must include "After Hours" and "Action Camera".',
    'Register source Terms & Conditions link href must be "terms.html".',
  ]) assert.equal(assessmentEvidenceScope(sourceCriterion(source)).category, "source_text", source);
  for (const source of [
    'The delivered cinema HTML document title must be "After Hours" rather than "Action Camera" and actually charge the card.',
    'In the delivered login HTML the input immediately under "After Hours" must use type="password" and work as a login.',
    'Dashboard source text must not contain "Actually charge the card". Then submit an enquiry.',
    "The source must provide a working search and shopping cart.",
    "Login source labels must include One, Two, Three, Four, Five, Six and Seven.",
    'Login source labels must include "After Hours and Password.',
  ]) assert.equal(assessmentEvidenceScope(sourceCriterion(source)).category, "requires_observation", source);
});

test("working days and hours describe bounded response-time copy, while working capability stays unverified", () => {
  for (const source of [
    "Contact page copy must state that a reply is normally provided within two working days.",
    "The page copy must state that a reply takes 8 working hours.",
  ]) assert.equal(assessmentEvidenceScope(sourceCriterion(source)).category, "source_text", source);
  for (const source of [
    "Contact page copy must state that a reply is normally provided within two working days. The form must actually work.",
    "Contact page copy must state that a reply is normally provided within two working days and provide a working search.",
    "The page copy must list working search functionality.",
  ]) assert.equal(assessmentEvidenceScope(sourceCriterion(source)).category, "requires_observation", source);
});

test("an explicitly prohibited template-brand name is source text, while brand appearance remains subjective", () => {
  const source = "The website content must not advertise the template brand Start Bootstrap anywhere in current page copy";
  for (const text of [source, source + "."])
    assert.equal(assessmentEvidenceScope(sourceCriterion(text)).category, "source_text", text);
  for (const text of [source + " and the contact form must work.", "The website content must match the brand design and look professional."])
    assert.equal(assessmentEvidenceScope(sourceCriterion(text)).category, "requires_observation", text);
  assert.equal(assessmentEvidenceScope(sourceCriterion(source, "Modern brand appearance")).category, "requires_observation");
});

test("a complete source-only inspection allowance never promotes sixteen raw unknowns or changes the original agreement", async () => {
  const q = projectQuote(corpus.projects[0]), before = structuredClone(q); let calls = 0;
  const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-offline-no-network"}, async () => {
    calls++;
    return Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify({
      items: q.proof.criteria.map(c => ({criterionId: c.id, status: "insufficient_evidence", explanation: "Controlled unknown; source truth has not been inferred by this response.", citations: []})),
      risks: [], limitations: ["Controlled provider response, no actual API call or runtime operation."],
    })}}]});
  });
  assert.equal(calls, 1); assert.equal(report.items.length, 16); assert.ok(report.items.every(c => c.status === "insufficient_evidence"));
  assert.deepEqual(q, before); assert.equal(q.proof.paymentState, "unfunded");
});
