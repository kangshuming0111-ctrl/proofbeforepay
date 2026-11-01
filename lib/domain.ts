import type { BriefInput, LineItem, QuoteDraft } from "./contracts.ts";

export const MAX_TOTAL_CENTS = 100_000_000;

/** Errors safe to show to a caller; provider responses must never be passed in. */
export class DomainError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "VALIDATION_ERROR") {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new DomainError(`${label} must be text.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new DomainError(`${label} must contain ${min}–${max} characters.`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
    throw new DomainError(`${label} contains unsupported control characters.`);
  }
  return normalized;
}

function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new DomainError(`${label} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function hundredths(value: number, label: string): number {
  const scaled = Math.round(value * 100);
  if (Math.abs(value * 100 - scaled) > 0.0000001) {
    throw new DomainError(`${label} may have at most two decimal places.`);
  }
  return scaled;
}

export function validateBrief(value: unknown): BriefInput {
  const input = record(value, "Brief");
  if (input.currency !== "AUD" && input.currency !== "USD") {
    throw new DomainError("Currency must be AUD or USD.");
  }
  if (input.language !== "en" && input.language !== "zh") {
    throw new DomainError("Language must be en or zh.");
  }
  const hourlyRate = number(input.hourlyRate, "Hourly rate", 1, 5000);
  hundredths(hourlyRate, "Hourly rate");
  return {
    brief: text(input.brief, "Client brief", 20, 4000),
    clientName: text(input.clientName, "Client name", 0, 100) || (input.language === "zh" ? "客户" : "Client"),
    currency: input.currency,
    language: input.language,
    hourlyRate,
  };
}

function lineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new DomainError("A quote must contain between 1 and 20 line items.");
  }
  const identifiers = new Set<string>();
  return value.map((value, index) => {
    const item = record(value, `Line item ${index + 1}`);
    const id = text(item.id, "Line item ID", 1, 80);
    if (!/^[A-Za-z0-9_-]+$/u.test(id) || identifiers.has(id)) {
      throw new DomainError("Line item IDs must be unique letters, numbers, underscores or hyphens.");
    }
    identifiers.add(id);
    const quantity = number(item.quantity, "Quantity", 0.01, 1000);
    hundredths(quantity, "Quantity");
    const unitPriceCents = number(item.unitPriceCents, "Unit price in cents", 0, MAX_TOTAL_CENTS);
    if (!Number.isSafeInteger(unitPriceCents)) {
      throw new DomainError("Unit prices must use whole cents.");
    }
    return {
      id,
      description: text(item.description, "Line item description", 1, 300),
      quantity,
      unitPriceCents,
    };
  });
}

/** Round each line to its nearest cent, then add integer cents on the server. */
export function quoteTotal(value: readonly LineItem[]): number {
  const items = lineItems(value);
  let total = 0;
  for (const item of items) {
    const quantityHundredths = hundredths(item.quantity, "Quantity");
    const product = quantityHundredths * item.unitPriceCents;
    if (!Number.isSafeInteger(product)) throw new DomainError("Line item amount is too large.");
    total += Math.round(product / 100);
    if (!Number.isSafeInteger(total) || total > MAX_TOTAL_CENTS) {
      throw new DomainError("Quote total exceeds the maximum supported amount.");
    }
  }
  if (total < 1) throw new DomainError("Quote total must be at least one cent.");
  return total;
}

function textList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 12) {
    throw new DomainError(`${label} must be a list of no more than 12 entries.`);
  }
  return value.map((entry) => text(entry, label, 1, 300));
}

/** Whitelist editable fields: client/model totals and payment state are discarded. */
export function validateDraft(value: unknown): QuoteDraft {
  const input = record(value, "Quote draft");
  const items = lineItems(input.lineItems);
  quoteTotal(items);
  const timelineDays = number(input.timelineDays, "Timeline in days", 1, 365);
  if (!Number.isInteger(timelineDays)) throw new DomainError("Timeline must use whole days.");
  return {
    title: text(input.title, "Quote title", 1, 120),
    summary: text(input.summary, "Quote summary", 1, 1000),
    lineItems: items,
    assumptions: textList(input.assumptions, "Assumptions"),
    questions: textList(input.questions, "Questions"),
    timelineDays,
  };
}
