import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessmentEvidenceScope} from "../lib/assessment-evidence-scope.ts";
import {assessDeliveryLegacyReplay as assessDelivery} from "../lib/delivery-assessment.ts";
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

// These were disclosed only after the retained first-exposure replies. They
// are now known-source regressions, not a new blind evaluation or reference.
const staticRelations = [
  "The static HTML labels Name Password and Email on sign-up.html must each target its matching input through a for and id pair",
  "The forms.html source content must pair Fulltime Part time and Remote radio labels with values 1 2 and 3 under the same employment name",
  "The static Password control markup in both login.html and sign-up.html must use input type password",
  "The static Email control markup in sign-up.html must use input type email rather than text",
];

test("explicit bounded HTML associations and attributes admit source inspection without a runtime verdict", () => {
  for (const source of staticRelations) {
    const criterion = sourceCriterion(source), before = structuredClone(criterion);
    assert.deepEqual(assessmentEvidenceScope(criterion), {category: "source_text", reason: "literal_content"}, source);
    assert.equal(assessmentEvidenceScope(sourceCriterion(source + ".")).category, "source_text");
    assert.equal(assessmentEvidenceScope(sourceCriterion(source, source)).category, "source_text");
    assert.deepEqual(criterion, before);
  }
});

test("static association grammar cannot absorb operational, visual, auth or retention obligations", () => {
  for (const source of [
    "Actual sign in must reject invalid credentials and protect the dashboard from unauthenticated access",
    "The static Password control markup in login.html must be visually masked while typing",
    staticRelations[2] + " and actual sign in must reject invalid credentials",
    staticRelations[3] + " and the field must be visible at a 375px viewport",
    staticRelations[0] + " and focusing each label must activate the corresponding input",
    staticRelations[0] + ". After a reload the account record must remain stored",
    staticRelations[1] + " and clicking Remote must change the selected state",
    staticRelations[1] + ". The form must submit the selected employment value",
    staticRelations[2] + " and must prevent password leakage",
    staticRelations[3] + ". Then send a confirmation email",
    "The forms.html source content must pair Fulltime Part time and Remote radio labels with values 1 2 and 3 under the same employment name after a reload",
    "The static Password control markup in login.html must use input type password to guarantee security",
  ]) assert.equal(assessmentEvidenceScope(sourceCriterion(source)).category, "requires_observation", source);
  for (const title of ["Working login functionality", "Radio click interaction", "Mobile layout", "Password is visually masked", "Password security", "Save transaction records"])
    for (const source of staticRelations)
      assert.equal(assessmentEvidenceScope(sourceCriterion(source, title)).category, "requires_observation", `${title}: ${source}`);
  for (const source of staticRelations) assert.equal(assessmentEvidenceScope(sourceCriterion(source, "Static markup", "mobile")).reason, "mobile");
});

test("malformed static relation targets and incomplete tuple lists stay unclassified", () => {
  for (const source of [
    staticRelations[0].replace("sign-up.html", "../sign-up.html"),
    staticRelations[0].replace("sign-up.html", "https://example.invalid/sign-up.html"),
    staticRelations[0].replace("Name Password and Email", "Name Name and Email"),
    staticRelations[0].replace("Name Password and Email", "One Two Three Four Five Six and Seven"),
    staticRelations[1].replace("1 2 and 3", "1 and 2"),
    staticRelations[1].replace("1 2 and 3", "1 1 and 3"),
    staticRelations[1].replace("Fulltime Part time and Remote", "Fulltime and"),
    staticRelations[2].replace("both login.html and sign-up.html", "both login.html and login.html"),
    staticRelations[2].replace("input type password", "input type passwordish"),
    staticRelations[3].replace("input type email", 'input type "email'),
  ]) assert.equal(assessmentEvidenceScope(sourceCriterion(source)).category, "requires_observation", source);
});

test("new static relation scope never promotes a provider unknown or changes the locked requirements", async () => {
  const q = projectQuote({id: "known-static-relation-scope", stratum: "boundary", language: "en", title: "Controlled static relationship scope",
    summary: "Inspect the explicitly named static HTML associations and attributes only.",
    files: {"index.html": "<!doctype html><html><body><p>Static fixture</p></body></html>",
      "sign-up.html": '<!doctype html><html><body><label for="name">Name</label><input id="name"><label for="password">Password</label><input id="password" type="text"><label for="email">Email</label><input id="email" type="text"></body></html>',
      "login.html": '<!doctype html><html><body><label for="password">Password</label><input id="password" type="text"></body></html>',
      "forms.html": '<!doctype html><html><body><form><label>Fulltime<input type="radio" name="employment" value="1"></label></form></body></html>'},
    criteria: staticRelations.map((source, index) => ({id: `manual-${index + 1}`, title: `Manual requirement ${index + 1}`, source,
      reference: {expectedStatus: "insufficient_evidence", rationale: "Controlled raw unknown preservation; no actual provider call.", relevantFiles: ["index.html"], requiresSemanticReview: true}}))});
  const before = structuredClone(q); let calls = 0;
  const report = await assessDelivery(q, {DEEPSEEK_API_KEY: "controlled-offline-no-network"}, async () => {
    calls++;
    return Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify({items: q.proof.criteria.map(c => ({criterionId: c.id,
      status: "insufficient_evidence", explanation: "Controlled unknown; static scope is not a compliance verdict.", citations: []})),
      risks: [], limitations: ["No real provider, browser, authentication or storage was exercised."]})}}]});
  });
  assert.equal(calls, 1); assert.ok(report.items.every(item => item.status === "insufficient_evidence"));
  assert.deepEqual(q, before); assert.equal(q.proof.paymentState, "unfunded");
});
