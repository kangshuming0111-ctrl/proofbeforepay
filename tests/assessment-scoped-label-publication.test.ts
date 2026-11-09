import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assessDelivery } from "../lib/delivery-assessment.ts";
import { createEvidenceExport, verifyEvidenceExport } from "../lib/evidence-export.ts";
import { createAssessmentSourceFindingCheck } from "../lib/assessment-source-findings.ts";
import { getBusinessCheckPlan } from "../lib/business-checks.ts";
import { prepareReplacement, requestChanges, submitDelivery } from "../lib/proof-workflow.ts";
import { applyScopeClarification, resolveScopeClarifications } from "../lib/scope-clarifications.ts";
import { createUploadedDelivery } from "../lib/static-project.ts";
import type { ProofAssessmentCitation, ProofAssessmentItem, ProofQuote } from "../lib/contracts.ts";

const fixture = JSON.parse(await readFile(new URL("./fixtures/noodle-f1-first-four-replay.json", import.meta.url), "utf8"));
const original = fixture.cases.find((row: { id: string }) => row.id === "f1-sealed-wrong-page").quote as ProofQuote;
const criterionId = "coverage-2";
const contact = original.proof.delivery!.files!["contact.html"];
const corrected = contact.replace("</form>", "<label>邮箱<input></label></form>");
const decoy = '<form id="decoy"><label>姓名<input></label><label>邮箱<input></label></form>';
type CitationChoice = "index.html" | "contact.html" | "decoy" | "partial" | "none";

function replacement(source: string): ProofQuote {
  const deliveryId = original.proof.delivery!.id;
  const submitted = submitDelivery(original, { deliveryId, note: "Controlled submission." });
  const returned = requestChanges(submitted, { deliveryId, feedback: [{ criterionId, comment: "Review the same agreed form." }] });
  const files = { ...original.proof.delivery!.files!, "contact.html": source };
  const delivery = createUploadedDelivery(files, original.proof.project!, original.language, 2);
  const next = prepareReplacement(returned, delivery);
  next.proof.review = { ...original.proof.review!, deliveryId: delivery.id, reviewedAt: delivery.submittedAt };
  return JSON.parse(JSON.stringify(next)) as ProofQuote;
}

async function evaluate(
  quote: ProofQuote, choice: CitationChoice, rawStatus: ProofAssessmentItem["status"] = "supported",
  rawExplanation = "交付源码在同一个表单内包含姓名和邮箱标签。",
) {
  const untouched = structuredClone(quote);
  let callbacks = 0;
  const report = await assessDelivery(quote, { DEEPSEEK_API_KEY: "controlled-offline", DEEPSEEK_MODEL: "deepseek-flash" }, async (_url, init) => {
    callbacks++;
    const request = JSON.parse(String(init?.body));
    const packet = JSON.parse(request.messages[1].content);
    const catalog = packet.citationCatalog.entries as (ProofAssessmentCitation & { id: string })[];
    let selected: (ProofAssessmentCitation & { id: string })[] = [];
    if (choice === "index.html" || choice === "contact.html") {
      const whole = catalog.find(row => row.file === choice && row.start === 0 && row.excerpt.includes("姓名") && row.excerpt.includes("邮箱"));
      assert.ok(whole);
      selected = [whole];
    }
    if (choice === "decoy" || choice === "partial") {
      const start = choice === "decoy" ? packet.files["contact.html"].indexOf('id="decoy"') : 0;
      selected = (choice === "decoy" ? ["姓名", "邮箱"] : ["姓名"]).map(text => {
        const span = catalog.find(row => row.file === "contact.html" && row.start > start && row.excerpt === `<label>${text}<input></label>`);
        assert.ok(span);
        return span;
      });
    }
    const items = packet.criteria.map((criterion: { id: string }) => ({
      criterionId: criterion.id,
      status: criterion.id === criterionId ? rawStatus : "insufficient_evidence",
      explanation: criterion.id === criterionId ? rawExplanation : "Controlled unrelated criterion.",
      citations: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
        `c${index + 1}`, criterion.id === criterionId ? selected[index]?.id ?? "" : "",
      ])),
    }));
    return Response.json({ choices: [{ finish_reason: "tool_calls", message: { tool_calls: [{ type: "function", function: {
      name: request.tools[0].function.name,
      arguments: JSON.stringify({ catalogId: packet.citationCatalog.catalogId, items, risks: [], limitations: ["Controlled offline response."] }),
    } }] } }] });
  });
  assert.equal(callbacks, 1);
  assert.deepEqual(quote, untouched);
  const saved = structuredClone(quote);
  saved.proof.delivery!.assessment = report;
  const bundle = await createEvidenceExport(saved);
  return { item: report.items.find(row => row.criterionId === criterionId)!, bundle };
}

test("a complete form on another page cannot cover the confirmed contact form", async () => {
  const { item, bundle } = await evaluate(original, "index.html");
  assert.equal(item.modelJudgment!.status, "supported");
  assert.equal(item.modelJudgment!.citations[0].file, "index.html");
  assert.equal(item.sourceFinding!.status, "changes_suggested");
  assert.equal(item.sourceFinding!.scopeBinding!.formId, "contact");
  assert.equal(item.status, "insufficient_evidence");
  assert.deepEqual(item.citations, []);
  assert.equal(item.evidenceNeed!.reason, "field_relationship");
  assert.deepEqual(item.evidenceNeed!.targetFiles, ["contact.html"]);
  assert.equal((await verifyEvidenceExport(bundle)).consistency, "consistent");
});

test("the agreed target carries to a replacement and explicit correct-target prose can be supported", async () => {
  const next = replacement(corrected);
  const scope = await resolveScopeClarifications(next);
  assert.equal(scope.bindings.find(row => row.criterionId === criterionId)!.carriedFromBasis, true);
  assert.deepEqual(next.proof.criteria, original.proof.criteria);
  assert.equal(next.proof.delivery!.assessment, undefined);
  const raw = "本项检查目标文件为 contact.html。表单源码包含姓名和邮箱。";
  const { item, bundle } = await evaluate(next, "contact.html", "supported", raw);
  assert.equal(bundle.delivery.assessment!.publicationPolicy!.schema, "source-publication-v3");
  assert.equal(item.modelJudgment!.explanation, raw);
  assert.equal(item.sourceFinding!.version, "source-finding-v3");
  assert.equal(item.status, "supported");
  assert.equal(item.explanation, item.sourceFinding!.explanation);
  assert.deepEqual(item.citations, item.sourceFinding!.citations);
  assert.ok(item.citations.every(citation => citation.file === "contact.html"));
});

test("a correct agreed form cannot lend authority to wrong-form, foreign or incomplete raw citations", async () => {
  const next = replacement(corrected.replace("</body>", decoy + "</body>"));
  for (const choice of ["index.html", "decoy", "partial", "none"] as const) {
    const { item } = await evaluate(next, choice);
    assert.equal(item.sourceFinding!.status, "supported", choice);
    assert.equal(item.status, "insufficient_evidence", choice);
    assert.equal(item.evidenceNeed!.reason, "field_relationship", choice);
    assert.equal(item.modelJudgment!.citations.length, choice === "decoy" ? 2 : choice === "none" ? 0 : 1);
  }
});

test("pending scope and a lost target after replacement remain unresolved despite complete labels elsewhere", async () => {
  const latest = (await resolveScopeClarifications(original)).states.find(row => row.criterionId === criterionId)!.latest!;
  const pending = await applyScopeClarification(original, "buyer", {
    action: "propose", deliveryId: original.proof.delivery!.id, criterionId, criterionSource: latest.criterionSource,
    expectedLatestId: latest.id, target: latest.target, basisNote: "Controlled pending proposal.",
  });
  const moved = replacement(corrected.replace('id="contact"', 'id="moved"'));
  for (const [quote, expected] of [[pending, "pending"], [moved, "unavailable"]] as const) {
    const scope = await resolveScopeClarifications(quote);
    assert.equal(scope.states.find(row => row.criterionId === criterionId)!.status, expected);
    const { item } = await evaluate(quote, "index.html");
    assert.equal(item.status, "insufficient_evidence");
    assert.equal(item.evidenceNeed!.reason, "page_scope");
  }
});

test("offline v3 recomputes the scoped owner witness, original citations and report policy pairing", async () => {
  const { bundle } = await evaluate(replacement(corrected), "contact.html");
  const alter = async (edit: (report: NonNullable<ProofQuote["proof"]["delivery"]>["assessment"], item: ProofAssessmentItem) => void) => {
    const forged = structuredClone(bundle);
    const report = forged.delivery.assessment!;
    edit(report, report.items.find(row => row.criterionId === criterionId)!);
    assert.equal((await verifyEvidenceExport(forged)).consistency, "inconsistent");
  };
  const wrong = bundle.delivery.files!["index.html"];
  const exactForeign = [{ file: "index.html", start: 0, end: wrong.length, excerpt: wrong }];
  await alter((_report, item) => { item.modelJudgment!.citations = exactForeign; });
  await alter((_report, item) => { item.citations = exactForeign; });
  await alter((_report, item) => { item.explanation = item.modelJudgment!.explanation; });
  await alter(report => { delete report!.scopeContext; });
  await alter(report => { report!.requirementCompletenessPolicy!.version = "bilingual-bounded-v2"; });
  await alter(report => { report!.publicationPolicy!.schema = "source-publication-v2"; });
});

test("a legacy v2 report replays under its own policy without applying the new scope gate", async () => {
  const { bundle } = await evaluate(original, "index.html");
  const legacy = structuredClone(bundle);
  const report = legacy.delivery.assessment!;
  report.publicationPolicy = { schema: "source-publication-v2", reconciledCriterionIds: [] };
  report.requirementCompletenessPolicy!.version = "bilingual-bounded-v2";
  const check = createAssessmentSourceFindingCheck({
    files: original.proof.delivery!.files!, coverage: report.coverage, language: original.language,
    businessSteps: getBusinessCheckPlan(original), scope: await resolveScopeClarifications(original), version: "source-finding-v2",
  });
  for (const item of report.items) {
    const fact = check(original.proof.criteria.find(row => row.id === item.criterionId)!);
    if (fact) item.sourceFinding = fact;
    else delete item.sourceFinding;
  }
  const oldItem = report.items.find(item => item.criterionId === criterionId)!;
  oldItem.status = "supported";
  oldItem.citations = structuredClone(oldItem.modelJudgment!.citations);
  delete oldItem.evidenceNeed;
  delete report.withheldRisks;
  const retained = structuredClone(legacy);
  assert.equal((await verifyEvidenceExport(legacy)).consistency, "consistent");
  assert.deepEqual(legacy, retained);
  report.requirementCompletenessPolicy!.version = "bilingual-bounded-v3";
  assert.equal((await verifyEvidenceExport(legacy)).consistency, "inconsistent");
});
