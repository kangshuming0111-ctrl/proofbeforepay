import assert from "node:assert/strict";
import test from "node:test";
import { DomainError, MAX_TOTAL_CENTS, quoteTotal, validateBrief, validateDraft } from "../lib/domain.ts";

const input = {
  brief: "Build a small website for a local flower shop with a contact form.",
  clientName: "Willow Flowers", currency: "AUD", language: "en", hourlyRate: 99.95,
};
const draft = {
  title: "Website estimate", summary: "A small shop website.",
  lineItems: [{ id: "design", description: "Website design (hours)", quantity: 1.25, unitPriceCents: 999 }],
  assumptions: ["Client supplies photographs."], questions: ["When is launch?"], timelineDays: 7,
};

test("brief validation keeps explicit currency/language and rejects coercion or excessive precision", () => {
  assert.equal(validateBrief({ ...input, clientName: "  Willow Flowers  " }).clientName, "Willow Flowers");
  assert.equal(validateBrief({ ...input, clientName: " " }).clientName, "Client");
  assert.equal(validateBrief({ ...input, clientName: "", language: "zh" }).clientName, "客户");
  for (const changed of [{ hourlyRate: "100" }, { hourlyRate: Infinity }, { hourlyRate: 0 }, { hourlyRate: 1.001 }, { currency: "EUR" }, { brief: "Too short" }]) {
    assert.throws(() => validateBrief({ ...input, ...changed }), DomainError);
  }
});

test("money is calculated in cents with defined rounding for fractional hours", () => {
  assert.equal(quoteTotal([
    ...draft.lineItems,
    { id: "meeting", description: "Meeting", quantity: 0.1, unitPriceCents: 100 },
  ]), 1259);
  assert.equal(quoteTotal([{ id: "exact", description: "Maximum", quantity: 1, unitPriceCents: MAX_TOTAL_CENTS }]), MAX_TOTAL_CENTS);
  assert.throws(() => quoteTotal([{ id: "over", description: "Over limit", quantity: 1.01, unitPriceCents: MAX_TOTAL_CENTS }]), /maximum/u);
});

test("draft validation strips forged payment state and model totals", () => {
  const clean = validateDraft({ ...draft, totalCents: 1, status: "paid", paypalOrderId: "FORGED" });
  assert.equal(quoteTotal(clean.lineItems), 1249);
  assert.equal("totalCents" in clean, false);
  assert.equal("status" in clean, false);
  assert.equal("paypalOrderId" in clean, false);
});

test("invalid model/editor line items cannot produce a payable quote", () => {
  for (const changed of [
    { quantity: NaN }, { quantity: Infinity }, { quantity: -1 }, { quantity: 0 },
    { quantity: 1.001 }, { quantity: 1001 }, { unitPriceCents: 99.9 },
    { unitPriceCents: -1 }, { unitPriceCents: Number.MAX_SAFE_INTEGER },
  ]) {
    assert.throws(() => validateDraft({ ...draft, lineItems: [{ ...draft.lineItems[0], ...changed }] }), DomainError);
  }
  assert.throws(() => validateDraft({ ...draft, lineItems: [] }), DomainError);
  assert.throws(() => validateDraft({ ...draft, lineItems: [draft.lineItems[0], draft.lineItems[0]] }), /unique/u);
  assert.throws(() => validateDraft({ ...draft, lineItems: [{ ...draft.lineItems[0], unitPriceCents: 0 }] }), /at least one cent/u);
  assert.throws(() => validateDraft({ ...draft, timelineDays: 2.5 }), DomainError);
});
