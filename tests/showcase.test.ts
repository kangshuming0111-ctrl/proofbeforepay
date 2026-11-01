import assert from "node:assert/strict";
import test from "node:test";
import { SHOWCASE_REQUIREMENTS, showcaseFiles } from "../scripts/build-showcase.mjs";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import { assessDelivery } from "../lib/delivery-assessment.ts";
import type { ProofQuote } from "../lib/contracts.ts";

test("the standalone showcase uploads expose a genuine missing target and retain unknown human checks after repair", () => {
  const p = parseStaticProject(SHOWCASE_REQUIREMENTS, "en");
  const first = createUploadedDelivery(showcaseFiles(1), p.project, "en", 1);
  const revised = createUploadedDelivery(showcaseFiles(2), p.project, "en", 2);
  assert.equal(first.evidence.find(e => e.criterionId === "link")?.finding, "fail");
  assert.equal(revised.evidence.find(e => e.criterionId === "link")?.finding, "pass");
  for (const delivery of [first, revised]) {
    assert.equal(Object.keys(delivery.files!).length, 4);
    for (const source of Object.values(delivery.files!)) assert.ok(source.length < 6000, "Each complete file fits the application's AI source prefix cap.");
    assert.equal(delivery.evidence.find(e => e.criterionId === "mobile")?.finding, "needs_human");
    assert.equal(delivery.evidence.some(e => e.criterionId === "manual-3"), false, "An unimplemented runtime feature is not a required acceptance check in this marketing-site scope.");
  }
  assert.equal(SHOWCASE_REQUIREMENTS.assessmentBoundaryExample.excludedFromAcceptedScope, true);
});

test("policy wording can be assessed as static copy while a source-backed form claim must still abstain", async () => {
  // A separate boundary-only fixture deliberately adds a runtime requirement;
  // the actual paid showcase scope excludes this unimplemented behavior.
  const p = parseStaticProject({ ...SHOWCASE_REQUIREMENTS, manualRequirements: [...SHOWCASE_REQUIREMENTS.manualRequirements, SHOWCASE_REQUIREMENTS.assessmentBoundaryExample.criterion.source] }, "en");
  const delivery = createUploadedDelivery(showcaseFiles(2), p.project, "en", 2);
  const excerpt = "Every consultation is arranged in advance. We cannot accommodate walk-ins; please agree a time with our florist before visiting.";
  assert.ok(delivery.files!["services.html"].includes(excerpt));
  const quote: ProofQuote = { id: "synthetic-showcase", reference: "PBP-SHOWCASE", title: p.title, summary: p.summary, brief: "Synthetic", clientName: "Fictional business", language: "en", currency: "AUD", totalCents: p.totalCents, hourlyRateCents: 100, lineItems: [], assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "live", paymentMode: "demo", createdAt: "2026-11-02T00:00:00.000Z", workflow: "proof-v1", proof: {
    criteria: p.criteria.filter(c => ["manual-2", "manual-3"].includes(c.id)), delivery: { ...delivery, evidence: delivery.evidence.filter(e => ["manual-2", "manual-3"].includes(e.criterionId)) }, paymentState: "unfunded", audit: [], review: { deliveryId: delivery.id, reviewedAt: "2026-11-02T00:00:00.000Z", mode: "demo", summary: "Synthetic source rules" },
  } };
  const result = await assessDelivery(quote, { DEEPSEEK_API_KEY: "synthetic-showcase-key" }, async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ items: quote.proof.criteria.map(c => ({ criterionId: c.id, status: "supported", explanation: "Controlled model suggestion.", citations: [{ file: "services.html", excerpt }] })), risks: [], limitations: [] }) } }] }), { status: 200 }));
  assert.equal(result.items.find(i => i.criterionId === "manual-2")?.status, "supported");
  assert.equal(result.items.find(i => i.criterionId === "manual-3")?.status, "insufficient_evidence");
});
