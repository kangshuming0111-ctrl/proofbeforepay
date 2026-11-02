import { DomainError } from "./domain.ts";

export type BookingPolicySource = { start: number; end: number; excerpt: string };
export type BookingPartyPolicy = { maxPartySize: number; source: BookingPolicySource };

const CONTROL_OR_FORMAT = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
const MINIMUM = 2;
const MAXIMUM = 12;

function plain(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new DomainError(`${name} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function source(value: unknown, name: string): BookingPolicySource {
  const item = plain(value, name);
  if (Object.keys(item).some(key => !["start", "end", "excerpt"].includes(key))
    || !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end)
    || (item.start as number) < 0 || (item.end as number) <= (item.start as number)
    || typeof item.excerpt !== "string" || !item.excerpt.trim() || item.excerpt.length > 1000
    || CONTROL_OR_FORMAT.test(item.excerpt) || (item.end as number) - (item.start as number) !== item.excerpt.length) {
    throw new DomainError(`${name} must retain an exact UTF-16 source span.`);
  }
  return { start: item.start as number, end: item.end as number, excerpt: item.excerpt };
}

/** Deliberately narrow complete-clause grammars. A value elsewhere in a clause,
 * a minimum, alternative limits, negatives or a compound sentence is not a
 * proposal. Unsupported wording remains a requirement for manual clarification.
 * These rules never infer a price, capacity/inventory rule or deployment policy. */
const CLAUSES = [
  /^(?:(?:每(?:笔|次|个)|单次)(?:预约|预订)(?:人数)?最多(?:接受|接待|容纳)?|(?:预约|预订)(?:人数上限(?:为|是)?|最多(?:接受|接待|容纳)?))\s*([1-9]\d?)\s*(?:人|位客人)$/u,
  /^(?:each|every|a|one|single)\s+booking\s+(?:accepts|allows|supports)\s+(?:at\s+most|a\s+maximum\s+of)\s+([1-9]\d?)\s+(?:people|persons|guests)$/iu,
  /^(?:the\s+)?maximum\s+party\s+size\s+(?:per\s+booking|for\s+each\s+booking)(?:\s+is|\s*:)\s*([1-9]\d?)\s+(?:people|persons|guests)$/iu,
] as const;

/** A proposal is deterministic and source-grounded, not an adopted check. The
 * caller must separately obtain buyer confirmation before adding a test plan.
 * The supplied requirement must already be an included, exact original span. */
export function suggestBookingPolicy(requirementSource: unknown): BookingPartyPolicy | undefined {
  const requirement = source(requirementSource, "Booking requirement");
  const leading = requirement.excerpt.length - requirement.excerpt.trimStart().length;
  const trimmed = requirement.excerpt.trim();
  const clause = trimmed.replace(/[。.!！]$/u, "").trimEnd();
  for (const grammar of CLAUSES) {
    const match = grammar.exec(clause);
    if (!match) continue;
    const maxPartySize = Number(match[1]);
    if (!Number.isInteger(maxPartySize) || maxPartySize < MINIMUM || maxPartySize > MAXIMUM) return;
    const start = requirement.start + leading;
    return { maxPartySize, source: { start, end: start + clause.length, excerpt: clause } };
  }
  return;
}

/** Re-derive from the complete included clause, then compare the caller's value
 * and literal citation. Selecting a convenient digit from a conflicting or
 * unsupported clause cannot turn it into a supported maximum-party policy. */
export function validateBookingPolicy(value: unknown, requirementSource: unknown): BookingPartyPolicy {
  const item = plain(value, "Booking policy");
  if (Object.keys(item).some(key => !["maxPartySize", "source"].includes(key))
    || !Number.isInteger(item.maxPartySize) || (item.maxPartySize as number) < MINIMUM || (item.maxPartySize as number) > MAXIMUM) {
    throw new DomainError("Booking maximum party size must be an integer from 2 to 12.");
  }
  const proposedSource = source(item.source, "Booking policy source");
  const proposed = suggestBookingPolicy(requirementSource);
  if (!proposed || item.maxPartySize !== proposed.maxPartySize
    || proposedSource.start !== proposed.source.start || proposedSource.end !== proposed.source.end
    || proposedSource.excerpt !== proposed.source.excerpt) {
    throw new DomainError("Booking policy must match one clear maximum-party requirement and its exact source span.");
  }
  return proposed;
}
