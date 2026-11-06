import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {assessmentEvidenceScope} from "../lib/assessment-evidence-scope.ts";
import {hasUnestablishedVerbatimObjection} from "../lib/assessment-unestablished-verbatim.ts";
import {createAssessmentLabelCitationCheck} from "../lib/assessment-label-citations.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const c = (source: string, title = "Source facts") => ({id: "manual-1", title, source});
const html = (body: string) => `<!doctype html><html><head><title>Source</title></head><body>${body}</body></html>`;
const citation = (source: string, excerpt: string, file = "index.html") => {const start = source.indexOf(excerpt); assert.ok(start >= 0); return {file, start, end: start + excerpt.length, excerpt};};

test("the same declared-label descriptor witnesses quoted punctuation without promoting template or cross-page data", () => {
  const criterion = c('Contact source labels must include "Name:" and "E-mail:" and "Message:".');
  assert.equal(assessmentEvidenceScope(criterion).category, "source_text");
  const complete = '<form><label>Name:</label><label>E-mail:</label><label>Message:</label></form>';
  const source = html(complete);
  assert.equal(createAssessmentLabelCitationCheck({"index.html": source})(criterion, [citation(source, complete)]).kind, "covered");
  for (const fake of ['<template><label>E-mail:</label></template>', '<!-- <label>E-mail:</label> -->', '<script type="application/json">"<label>E-mail:</label>"</script>']) {
    const body = '<form><label>Name:</label><label>Message:</label></form>' + fake, file = html(body);
    assert.equal(createAssessmentLabelCitationCheck({"index.html": file})(criterion, [citation(file, body)]).kind, "incomplete");
  }
  const one = html('<label>Name:</label><label>Message:</label>'), two = html('<label>E-mail:</label>');
  assert.equal(createAssessmentLabelCitationCheck({"index.html": one, "other.html": two})(criterion,
    [citation(one, '<label>Name:</label><label>Message:</label>'), citation(two, '<label>E-mail:</label>', "other.html")]).kind, "incomplete");
});

test("page labels do not invent a same-form condition; quoted form labels retain that condition and actual for targets", () => {
  const body = '<form id="one"><label for="first">Name:</label><input id="first"></form><form id="two"><label for="last">E-mail:</label><input id="last"></form>', source = html(body);
  const quote = [citation(source, body)], check = createAssessmentLabelCitationCheck({"index.html": source});
  assert.equal(check(c('Contact source labels must include "Name:" and "E-mail:".'), quote).kind, "covered");
  assert.equal(check(c('Contact form source content must label "Name:" and "E-mail:".'), quote).kind, "incomplete");
  const retargeted = html('<form id="one"><label for="first">Name:</label><input id="first"><label for="last">E-mail:</label><input id="last" form="two"></form><form id="two"></form>');
  assert.equal(createAssessmentLabelCitationCheck({"index.html": retargeted})(c('Contact form source content must label "Name:" and "E-mail:".'), [citation(retargeted, retargeted)]).kind, "incomplete");
  const duplicate = html('<div id="mail"></div><form><label for="name">Name:</label><input id="name"><label for="mail">E-mail:</label><input id="mail"></form>');
  assert.equal(createAssessmentLabelCitationCheck({"index.html": duplicate})(c('Contact form source content must label "Name:" and "E-mail:".'), [citation(duplicate, duplicate)]).kind, "incomplete");
});

test("closed quoted labels remain literal data while suffixes, runtime titles and mobile still require observation", () => {
  const source = 'Contact form source content must label "Send payment:" and "Save transaction records:".';
  assert.equal(assessmentEvidenceScope(c(source)).category, "source_text");
  assert.equal(assessmentEvidenceScope(c(source, source)).category, "source_text");
  for (const suffix of [" Then actually charge the card.", " The form must persist customer data after restart.", " Also submit the form successfully."])
    assert.equal(assessmentEvidenceScope(c(source + suffix)).category, "requires_observation");
  assert.equal(assessmentEvidenceScope(c(source, "Working form submission")).category, "requires_observation");
  assert.equal(assessmentEvidenceScope({...c(source), id: "mobile"}).category, "requires_observation");
  for (const suffix of [". Persist orders.", ". Submit payment.", ". Send confirmation emails."])
    assert.equal(assessmentEvidenceScope(c("Contact source labels must include Name and E-mail" + suffix)).category, "requires_observation");
  assert.equal(assessmentEvidenceScope(c("Contact source labels must include Name and E-mail; Submit payment.")).category, "requires_observation");
  assert.equal(assessmentEvidenceScope(c('Contact source labels must include "Name" and "Send confirmation emails".')).category, "source_text");
  assert.equal(assessmentEvidenceScope(c("Contact source labels must include Name Send and E-mail.")).category, "source_text");
  assert.equal(assessmentEvidenceScope(c('Contact source labels must include "Name" and "E-mail", then actually charge the card.')).category, "requires_observation");
});

test("finite verbatim objection guard preserves actual copy, business expectations and ordinary mismatches", () => {
  const explanation = 'The exact statement "A is B" does not appear in the page content.';
  assert.equal(hasUnestablishedVerbatimObjection(c("The page content must say A is B."), explanation), true);
  for (const source of ['The page copy must include the exact wording "A is B".', 'The page content must include the VERBATIM sentence "A is B".', 'The page content must list literal wording.'])
    assert.equal(hasUnestablishedVerbatimObjection(c(source), explanation), false, source);
  assert.equal(hasUnestablishedVerbatimObjection(c("The page content must say A is B."), explanation, true), false);
  for (const text of ['The price is 12 instead of the agreed 10.', 'The source contains "the exact statement is missing" as data.', 'The exact statement is present.', 'The exact statement is not missing, but the price is incorrect.', 'The exact statement is present, while the agreed value is missing.'])
    assert.equal(hasUnestablishedVerbatimObjection(c("The page content must say A is B."), text), false, text);
});

test("retained real first answers replay against unchanged catalogs: false template support and invented exact sentence cannot publish actionable verdicts", async () => {
  const context = JSON.parse(await readFile(new URL("./fixtures/three-gaps-cycle35-replay-context.json", import.meta.url), "utf8"));
  for (const entry of context.cases) {
    const quote = projectQuote(entry.project as EvaluationProject), before = structuredClone(quote), raw = structuredClone(entry.raw); let calls = 0;
    const report = await assessDelivery(quote, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
      calls++; const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
      assert.equal(packet.citationCatalog.catalogId, raw.catalogId);
      return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: request.tools[0].function.name, arguments: JSON.stringify(raw)}}]}}]});
    });
    assert.equal(calls, 1); assert.deepEqual(quote, before); assert.deepEqual(raw, entry.raw);
    const item = report.items.find(i => i.criterionId === (entry.project.id.includes("inert") ? "coverage-1" : "coverage-2"))!;
    assert.equal(item.status, "insufficient_evidence"); assert.notEqual(item.explanation, raw.items.find((i: any) => i.criterionId === item.criterionId).explanation);
    if (!entry.project.id.includes("inert")) assert.match(item.explanation, /additional verbatim-copy condition/u);
    assert.equal(report.risks.length, 0); assert.equal(report.withheldRisks?.reason, "item_status_adjusted");
    for (const selected of report.items.flatMap(i => i.citations)) assert.equal(entry.project.files[selected.file].slice(selected.start, selected.end), selected.excerpt);
    assert.equal(quote.proof.paymentState, "unfunded"); assert.equal(quote.proof.acceptedAt, undefined);
  }
});

test("retained native declared-fact replies are admitted only with their actual unchanged owner citations, never promoting raw unknown", async () => {
  const context = JSON.parse(await readFile(new URL("./fixtures/three-gaps-cycle35-replay-context.json", import.meta.url), "utf8"));
  for (const entry of context.knownNativeCases) {
    for (const unknown of [false, true]) {
      const quote = projectQuote(entry.project as EvaluationProject), before = structuredClone(quote), raw = structuredClone(entry.raw); let calls = 0;
      if (unknown) for (const item of raw.items) item.status = "insufficient_evidence";
      const report = await assessDelivery(quote, {DEEPSEEK_API_KEY: "controlled-no-network"}, async (_url, init) => {
        calls++; const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
        assert.equal(packet.citationCatalog.catalogId, raw.catalogId);
        return Response.json({choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: request.tools[0].function.name, arguments: JSON.stringify(raw)}}]}}]});
      });
      assert.equal(calls, 1); assert.deepEqual(quote, before);
      for (const item of report.items) {
        const expected = unknown ? "insufficient_evidence" : entry.project.criteria.find((i: any) => i.id === item.criterionId).reference.expectedStatus;
        assert.equal(item.status, expected, `${entry.project.id}/${item.criterionId}`);
      }
    }
  }
});
