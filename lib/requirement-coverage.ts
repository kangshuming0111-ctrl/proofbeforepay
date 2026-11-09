import type { Language, ProofCriterion, ProofQuote, RequirementCoverage, RequirementCoverageDecision, RequirementCoverageUnit } from "./contracts.ts";
import { DomainError } from "./domain.ts";

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const BREAK = /[，、；;\n]+|[。！？!?]+|[,.](?=\s|$)/gu;
const MAX_UNITS = 12;
const MAX_UNIT_LENGTH = 300;

function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DomainError(`${label} must be a plain object.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key) || !("value" in Object.getOwnPropertyDescriptor(value, key)!)) throw new DomainError(`${label} contains an unsupported field.`);
  }
  return value as Record<string, unknown>;
}

function sourceText(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 1000 || CONTROL.test(value)) throw new DomainError("Coverage needs 1–1000 characters of original website requirements.");
  return value.trim();
}

type SourceSpan = {start: number; end: number};

function punctuationSpans(source: string): SourceSpan[] {
  const spans: SourceSpan[] = [];
  const add = (from: number, to: number) => {
    while (from < to && /\s/u.test(source[from])) from++;
    while (to > from && /\s/u.test(source[to - 1])) to--;
    while (from < to) {
      let end = Math.min(to, from + MAX_UNIT_LENGTH);
      if (end < to && /[\uD800-\uDBFF]/u.test(source[end - 1]) && /[\uDC00-\uDFFF]/u.test(source[end])) end--;
      spans.push({start: from, end}); from = end;
    }
  };
  let cursor = 0;
  for (const match of source.matchAll(BREAK)) {
    const end = match.index + match[0].length;
    add(cursor, end); cursor = end;
  }
  add(cursor, source.length);
  while (spans.length > MAX_UNITS) {
    let best = -1, length = Infinity;
    for (let i = 0; i < spans.length - 1; i++) {
      const combined = spans[i + 1].end - spans[i].start;
      if (combined <= MAX_UNIT_LENGTH && combined < length) {best = i; length = combined;}
    }
    if (best < 0) throw new DomainError("Use at most 12 short requirement groups; keep each group under 300 characters.");
    spans.splice(best, 2, {start: spans[best].start, end: spans[best + 1].end});
  }
  return spans;
}

function lineSpans(source: string): SourceSpan[] {
  const spans: SourceSpan[] = [];
  for (const match of source.matchAll(/[^\r\n]+/gu)) {
    const line = match[0], text = line.trim();
    if (!text) continue;
    if (spans.length >= MAX_UNITS || text.length > MAX_UNIT_LENGTH) {
      throw new DomainError("Use at most 12 non-empty requirement lines, each up to 300 characters.", 400, "COVERAGE_LINE_LIMIT");
    }
    const start = match.index + line.length - line.trimStart().length;
    spans.push({start, end: start + text.length});
  }
  return spans;
}

/** Version 1 preserves saved punctuation spans. Version 2 preserves explicit
 * lines. A compound span still has to be checked in full. */
export function summaryCoverageUnits(summary: string, version: RequirementCoverage["version"] = 1): RequirementCoverageUnit[] {
  const source = sourceText(summary);
  const spans = version === 2 ? lineSpans(source) : punctuationSpans(source);
  return spans.map(({start, end}, index) => ({id: `coverage-${index + 1}`, start, end, text: source.slice(start, end)}));
}

// Both names are kept small and explicit for the intake and domain callers.
export const coverageUnits = summaryCoverageUnits;

export function confirmCoverage(summary: string, value: unknown, at = new Date().toISOString()): RequirementCoverage {
  const source = sourceText(summary);
  const input = object(value, ["version", "sourceText", "confirmed", "decisions"], "Requirement coverage");
  const {version} = input;
  if ((version !== 1 && version !== 2) || input.confirmed !== true || input.sourceText !== source) throw new DomainError("Review every original requirement and confirm the current text before creating the project.");
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) throw new DomainError("Coverage confirmation time is invalid.");
  const units = summaryCoverageUnits(source, version);
  if (!Array.isArray(input.decisions) || input.decisions.length !== units.length) throw new DomainError("Every original requirement group needs an included check or an explicit exclusion.");
  const pending = new Map(units.map(unit => [unit.id, unit]));
  const decisions = new Map<string, RequirementCoverageDecision>();
  for (const raw of input.decisions) {
    const row = object(raw, ["id", "disposition", "reason"], "Coverage decision");
    const unit = typeof row.id === "string" ? pending.get(row.id) : undefined;
    if (!unit) throw new DomainError("Coverage contains an unknown or duplicate original requirement.");
    pending.delete(unit.id);
    if (row.disposition === "include") {
      if (row.reason !== undefined) throw new DomainError("Only excluded requirements can have an exclusion reason.");
      decisions.set(unit.id, {...unit, disposition: "include", criterionId: unit.id});
    } else if (row.disposition === "exclude") {
      if (typeof row.reason !== "string" || !row.reason.trim() || row.reason.trim().length > 300 || CONTROL.test(row.reason)) throw new DomainError("Give a 1–300 character reason for each requirement excluded from this delivery.");
      decisions.set(unit.id, {...unit, disposition: "exclude", reason: row.reason.trim()});
    } else throw new DomainError("Choose an included human check or an explicit exclusion for every original requirement.");
  }
  return {version, sourceText: source, confirmedAt: at, decisions: units.map(unit => decisions.get(unit.id)!)};
}

/** Revalidate saved records without trusting client-provided spans or IDs. */
export function validateSavedCoverage(value: unknown): RequirementCoverage {
  const saved = object(value, ["version", "sourceText", "confirmedAt", "decisions"], "Saved requirement coverage");
  if (!Array.isArray(saved.decisions) || typeof saved.confirmedAt !== "string") throw new DomainError("Saved coverage decisions or confirmation time are invalid.");
  const raw = saved.decisions.map(value => {
    const row = object(value, ["id", "start", "end", "text", "disposition", "reason", "criterionId"], "Saved coverage decision");
    return {row, request: {id: row.id, disposition: row.disposition, ...(row.reason !== undefined ? {reason: row.reason} : {})}};
  });
  const result = confirmCoverage(saved.sourceText as string, {version: saved.version, sourceText: saved.sourceText, confirmed: true, decisions: raw.map(entry => entry.request)}, saved.confirmedAt as string);
  const expected = new Map(result.decisions.map(row => [row.id, row]));
  for (const {row} of raw) {
    const target = expected.get(row.id as string)!;
    if (row.start !== target.start || row.end !== target.end || row.text !== target.text || row.criterionId !== target.criterionId || row.reason !== target.reason) throw new DomainError("Saved requirement coverage no longer matches its original source.");
  }
  return result;
}

export function coverageCriteria(coverage: RequirementCoverage | undefined, language: Language): ProofCriterion[] {
  if (!coverage) return [];
  return validateSavedCoverage(coverage).decisions.filter(row => row.disposition === "include").map(row => ({
    id: row.criterionId!, title: language === "zh" ? `原始需求 ${row.id.slice(9)}` : `Original requirement ${row.id.slice(9)}`,
    source: row.text,
  }));
}

/** Old agreements are not retroactively rewritten. For new covered agreements,
 * each included original clause must remain an exact, independently checked item. */
export function assertCoverageForAcceptance(quote: ProofQuote): void {
  const saved = quote.proof.project?.coverage;
  if (!saved) return;
  const coverage = validateSavedCoverage(saved);
  if (coverage.sourceText !== quote.summary.trim()) throw new DomainError("The saved requirement coverage is stale. Review the original requirements.", 409);
  for (const item of coverageCriteria(coverage, quote.language)) {
    const criterion = quote.proof.criteria.find(row => row.id === item.id);
    if (!criterion || criterion.source !== item.source) throw new DomainError("The review does not cover an included original requirement.", 409);
    const evidence = quote.proof.delivery?.evidence.filter(row => row.criterionId === item.id) ?? [];
    if (evidence.length !== 1 || evidence[0].finding !== "needs_human") throw new DomainError("Each original requirement needs its own explicit human check.", 409);
  }
}
