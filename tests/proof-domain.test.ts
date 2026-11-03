import {validateAcceptanceWithBasis as validateAcceptance} from "./acceptance-client.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {requireProof, applyPaymentReconciliation} from "../lib/proof-domain.ts";
import type { ProofQuote } from "../lib/contracts.ts";
import {recordCaptureConsent} from "../lib/acceptance-evidence.ts";

function agreement(): ProofQuote {
  return {
    id: "proof-test", reference: "PBP-TEST", workflow: "proof-v1", title: "Website", summary: "Scope", brief: "Scope", clientName: "Client", currency: "AUD", language: "en", hourlyRateCents: 48000, totalCents: 48000, lineItems: [{id: "site", description: "Site", quantity: 1, unitPriceCents: 48000}], timelineDays: 1, assumptions: [], questions: [], status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: new Date().toISOString(),
    proof: {criteria: [{id: "pages", title: "Pages", source: "3 pages"}, {id: "mobile", title: "Mobile", source: "Mobile usable"}], paymentState: "authorized", authorizationId: "AUTH-1", authorizationExpiresAt: new Date(Date.now() + 60000).toISOString(), audit: [], delivery: {id: "v2", variant: "fixed", label: "Fixed", submittedAt: new Date().toISOString(), evidence: [{id: "e1", criterionId: "pages", file: "index.html", excerpt: "3 pages", finding: "pass", explanation: "Counted"}, {id: "e2", criterionId: "mobile", file: "styles.css", excerpt: "media", finding: "needs_human", explanation: "Render needs human check"}]}, review: {deliveryId: "v2", reviewedAt: new Date().toISOString(), mode: "demo", summary: "Review"}},
  };
}

test("acceptance is tied to the reviewed delivery and explicit manual confirmation", () => {
  const q = agreement();
  const valid = {confirm: true, deliveryId: "v2", manualChecks: ["mobile"]};
  assert.deepEqual(validateAcceptance(q, valid), ["mobile"]);
  assert.throws(() => validateAcceptance(q, {...valid, confirm: false}));
  assert.throws(() => validateAcceptance(q, {...valid, deliveryId: "v1"}));
  assert.throws(() => validateAcceptance(q, {...valid, manualChecks: []}));
  q.proof.review!.deliveryId = "v1";
  assert.throws(() => validateAcceptance(q, valid));
});

test("failed or missing evidence and expired authorization block a new capture", () => {
  const input = {confirm: true, deliveryId: "v2", manualChecks: ["mobile"]};
  const q = agreement();
  q.proof.delivery!.evidence[0].finding = "fail";
  assert.throws(() => validateAcceptance(q, input));
  q.proof.delivery!.evidence.shift();
  assert.throws(() => validateAcceptance(q, input));
  const expired = agreement();
  expired.proof.authorizationExpiresAt = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => validateAcceptance(expired, input));
  const pending = recordCaptureConsent(agreement(), ["mobile"], new Date(Date.now() - 2000).toISOString());
  pending.proof.authorizationExpiresAt = new Date(Date.now() - 1000).toISOString();
  assert.deepEqual(validateAcceptance(pending, input), ["mobile"], "a payment accepted within the window remains retryable with its real frozen consent snapshot");
});

test("proof records cannot accept inconsistent saved totals", () => {
  const q = agreement();
  q.totalCents = 1;
  assert.throws(() => requireProof(q));
});


function pendingCapture(): ProofQuote {
  const q = agreement();
  q.paymentMode = "sandbox";
  q.proof.paymentOperation = "capture";
  q.proof.acceptedDeliveryId = "v2";
  q.proof.acceptedAt = new Date().toISOString();
  q.proof.manualChecks = ["mobile"];
  return q;
}

test("verified completed capture preserves the frozen acceptance and writes an audited paid outcome", () => {
  const q = pendingCapture();
  const verifiedAt = new Date().toISOString();
  const next = applyPaymentReconciliation(q, { kind: "captured", captureId: "CAP-1", verifiedAt });
  assert.equal(q.proof.paymentState, "authorized", "the caller's prior snapshot stays unchanged");
  assert.equal(next.status, "paid");
  assert.equal(next.captureId, "CAP-1");
  assert.equal(next.proof.acceptedDeliveryId, "v2");
  assert.equal(next.proof.paymentOperation, undefined);
  assert.deepEqual(next.proof.audit.map(e => e.kind), ["captured", "payment_reconciled"]);
  assert.throws(() => applyPaymentReconciliation(next, { kind: "voided", verifiedAt }));
});

test("voided and denied authorizations close without inventing a payment or refund", () => {
  const q = pendingCapture();
  for (const result of [{ kind: "voided", verifiedAt: new Date().toISOString() }, { kind: "closed_unpaid", reason: "authorization_denied", verifiedAt: new Date().toISOString() }] as const) {
    const next = applyPaymentReconciliation(q, result);
    assert.equal(next.status, "approved");
    assert.equal(next.captureId, undefined);
    assert.equal(next.paidAt, undefined);
    assert.equal(next.proof.paymentState, result.kind);
    assert.equal(next.proof.paymentOperation, undefined);
    assert.equal(next.proof.acceptedDeliveryId, "v2", "keep the prior consent as history, not a paid receipt");
    if (result.kind === "closed_unpaid") assert.equal(next.proof.paymentClosure?.reason, "authorization_denied");
  }
});

test("uncertain query outcomes retain the exact pending snapshot, operation and accepted version", () => {
  const q = pendingCapture();
  for (const reason of ["pending", "authorization_still_active", "provider_unavailable", "inconsistent_resources"] as const) {
    assert.equal(applyPaymentReconciliation(q, { kind: "unresolved", reason }), q);
    assert.equal(q.proof.paymentOperation, "capture");
    assert.equal(q.proof.acceptedDeliveryId, "v2");
  }
});

test("a found capture cannot fabricate missing, late, failed or different-version acceptance", () => {
  const result = { kind: "captured", captureId: "CAP-1", verifiedAt: new Date().toISOString() } as const;
  const changes = [
    { acceptedAt: undefined }, { acceptedDeliveryId: "old" }, { manualChecks: [] }, { paymentOperation: "void" as const },
    { acceptedAt: new Date(Date.now() + 120000).toISOString() },
  ];
  for (const change of changes) {
    const q = pendingCapture();
    Object.assign(q.proof, change);
    assert.throws(() => applyPaymentReconciliation(q, result));
    assert.equal(q.proof.paymentState, "authorized");
  }
  const failed = pendingCapture();
  failed.proof.delivery!.evidence[0].finding = "fail";
  assert.throws(() => applyPaymentReconciliation(failed, result));
});

test("acceptance recorded in time can reconcile after the local window without declaring provider expiry", () => {
  const q = pendingCapture();
  q.proof.acceptedAt = new Date(Date.now() - 2000).toISOString();
  q.proof.authorizationExpiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(applyPaymentReconciliation(q, { kind: "unresolved", reason: "authorization_still_active" }), q);
  assert.equal(applyPaymentReconciliation(q, { kind: "captured", captureId: "CAP-1", verifiedAt: new Date().toISOString() }).proof.paymentState, "captured");
});
