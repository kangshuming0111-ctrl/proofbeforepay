import type { ProofBusinessCheck, ProofBusinessCheckReading, ProofBusinessCheckReport, ProofBusinessCheckStep, ProofBusinessExpected, ProofQuote, StaticProjectSpec } from "./contracts.ts";
import { DomainError } from "./domain.ts";
import { validateSavedCoverage } from "./requirement-coverage.ts";

export const BUSINESS_CHECK_LIMIT = 8;
export const BUSINESS_BLOCK_LIMIT = 12;
export const BUSINESS_BLOCK_TEXT_LIMIT = 300;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const REASONS = new Set(["missing_file", "load_failed", "snapshot_mismatch", "access_denied", "timeout", "navigation_changed", "ambiguous_link", "unsupported_target", "resource_limit", "ambiguous_content", "text_limit"]);

function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DomainError(`${label} must be a plain object.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key) || !("value" in Object.getOwnPropertyDescriptor(value, key)!)) throw new DomainError(`${label} contains an unsupported field.`);
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || CONTROL.test(value) || [...value].some(char => { const point = char.codePointAt(0)!; return point >= 0xd800 && point <= 0xdfff; })) throw new DomainError(`${label} needs 1–${max} valid text characters.`);
  return value.trim();
}
function expectedValue(value: unknown): ProofBusinessExpected {
  const raw = object(value, ["kind", "text", "label", "amountMinor", "currency"], "Business expectation");
  if (raw.kind === "visible_copy") {
    object(raw, ["kind", "text"], "Visible-copy expectation");
    return {kind: "visible_copy", text: text(raw.text, "Expected visible copy", 160)};
  }
  if (raw.kind === "item_price") {
    object(raw, ["kind", "label", "amountMinor", "currency"], "Item-price expectation");
    if (typeof raw.amountMinor !== "number" || !Number.isSafeInteger(raw.amountMinor) || raw.amountMinor < 0 || (raw.currency !== "AUD" && raw.currency !== "USD")) throw new DomainError("Expected price needs nonnegative safe-integer cents and AUD or USD.");
    return {kind: "item_price", label: text(raw.label, "Expected item label", 80), amountMinor: raw.amountMinor, currency: raw.currency};
  }
  throw new DomainError("Unsupported business expectation kind.");
}
function items(value: unknown, project: StaticProjectSpec): ProofBusinessCheck[] {
  if (!Array.isArray(value) || value.length > BUSINESS_CHECK_LIMIT) throw new DomainError("Use at most eight business checks.");
  if (!value.length) return [];
  if (!project.coverage) throw new DomainError("Business checks need confirmed original-requirement coverage.");
  const coverage = validateSavedCoverage(project.coverage);
  return value.map((entry, index) => {
    const row = object(entry, ["id", "criterionId", "file", "source", "expected"], "Business check");
    const id = `business-${index + 1}`;
    if (row.id !== id) throw new DomainError("Business check identifiers must be sequential business-N identifiers.");
    const criterion = coverage.decisions.find(item => item.disposition === "include" && item.criterionId === row.criterionId);
    if (!criterion) throw new DomainError("Business checks must reference an included original requirement.");
    if (typeof row.file !== "string" || !project.requiredPages.includes(row.file)) throw new DomainError("Business checks must use an agreed required HTML page.");
    const source = object(row.source, ["start", "end", "excerpt"], "Business-check original source");
    if (typeof source.start !== "number" || typeof source.end !== "number" || !Number.isSafeInteger(source.start) || !Number.isSafeInteger(source.end)
      || source.start < criterion.start || source.end > criterion.end || source.end <= source.start || typeof source.excerpt !== "string" || !source.excerpt.trim()
      || source.excerpt !== coverage.sourceText.slice(source.start, source.end)) throw new DomainError("Business source must be an exact span within its included original requirement.");
    text(source.excerpt, "Business-check source excerpt", 300);
    // Expectations are explicit buyer inputs. This parser does not infer that an
    // exact source quote semantically entails a particular price or phrase.
    return {id, criterionId: criterion.criterionId!, file: row.file, source: {start: source.start, end: source.end, excerpt: source.excerpt}, expected: expectedValue(row.expected)};
  });
}
/** New scope input requires a separate, explicit confirmation of all expected values. */
export function parseBusinessChecks(value: unknown, project: StaticProjectSpec): ProofBusinessCheck[] {
  const input = object(value, ["confirmed", "items"], "Business checks");
  if (input.confirmed !== true) throw new DomainError("Confirm all expected business values before locking the scope.");
  return items(input.items, project);
}
/** Saved arrays retain their original ordering and source bindings. */
export function validateSavedBusinessChecks(value: unknown, project: StaticProjectSpec): ProofBusinessCheck[] { return items(value, project); }

export function normalizeBusinessText(value: string): string { return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase(); }
/** Literal phrase matching, not semantic or visual correctness. Chinese phrases may occur within a sentence. */
export function containsBusinessText(haystack: string, needle: string): boolean {
  const value = normalizeBusinessText(haystack), target = normalizeBusinessText(needle);
  if (!target) return false;
  let cursor = 0;
  while (cursor <= value.length - target.length) {
    const at = value.indexOf(target, cursor);
    if (at < 0) return false;
    const before = value[at - 1] ?? "", after = value[at + target.length] ?? "";
    if (!(/[a-z0-9_]/u.test(target[0]) && /[a-z0-9_]/u.test(before)) && !(/[a-z0-9_]/u.test(target.at(-1)!) && /[a-z0-9_]/u.test(after))) return true;
    cursor = at + 1;
  }
  return false;
}
type Evaluation = {outcome: "expected_observation" | "mismatch" | "unavailable"; explanation: string};
type Money = {currency: "aud" | "usd"; amountMinor: number};
function prices(block: string): {values: Money[]; ambiguous: boolean} {
  const normalized = normalizeBusinessText(block), values: Money[] = [];
  let ambiguous = /[$€£¥₹₩₽₫฿₱₦₺₪]/u.test(normalized);
  const consumed: {start: number; end: number}[] = [];
  // Sentence punctuation may follow a price; decimal/thousands fragments may
  // not be treated as a smaller standalone amount.
  const pattern = /(?:(?<![a-z0-9_+\-])(aud|usd)\s*(\d+(?:\.\d+)?)(?![a-z0-9_]|[.,](?=\S))|(?<![a-z0-9_.,+\-])(\d+(?:\.\d+)?)\s*(aud|usd)(?![a-z0-9_]))/gu;
  for (const match of normalized.matchAll(pattern)) {
    consumed.push({start: match.index, end: match.index + match[0].length});
    const literal = match[2] ?? match[3], currency = (match[1] ?? match[4]) as Money["currency"];
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(literal)) {ambiguous = true; continue;}
    const [whole, fraction = ""] = literal.split(".");
    const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(amountMinor)) {ambiguous = true; continue;}
    values.push({currency, amountMinor});
  }
  let residual = normalized;
  for (const span of consumed.reverse()) residual = residual.slice(0, span.start) + " ".repeat(span.end - span.start) + residual.slice(span.end);
  // A second unsupported or malformed money token must not be silently
  // discarded just because another amount happens to match the expectation.
  if (/(?<![a-z])(?:aud|usd)(?![a-z])/u.test(residual)
    || /(?<![a-z])[a-z]{3}\s*\d/u.test(residual)
    || /\d+(?:\.\d+)?\s*[a-z]{3}(?![a-z])/u.test(residual)) ambiguous = true;
  return {values, ambiguous};
}
/** The result describes supplied visible blocks, never pixels, runtime behavior or a guarantee of delivery quality. */
export function evaluateBusinessBlocks(expected: ProofBusinessExpected, blocks: string[]): Evaluation {
  const normalized = [...new Set(blocks.map(normalizeBusinessText))];
  if (expected.kind === "visible_copy") return normalized.some(block => containsBusinessText(block, expected.text))
    ? {outcome: "expected_observation", explanation: "The expected literal copy was observed in a supplied visible text block."}
    : {outcome: "mismatch", explanation: "The expected literal copy was not observed in the supplied visible text blocks."};
  const matching = normalized.filter(block => containsBusinessText(block, expected.label));
  if (!matching.length) return {outcome: "mismatch", explanation: "The expected item label was not observed in a supplied visible text block."};
  const amounts = new Map<string, Money>();
  for (const block of matching) {
    const parsed = prices(block);
    if (parsed.ambiguous || !parsed.values.length) return {outcome: "unavailable", explanation: "The item block does not provide an unambiguous standalone amount with explicit AUD or USD currency."};
    for (const money of parsed.values) amounts.set(`${money.currency}:${money.amountMinor}`, money);
  }
  if (amounts.size !== 1) return {outcome: "unavailable", explanation: "The item label is associated with conflicting amounts or currencies in the supplied visible blocks."};
  const observed = [...amounts.values()][0];
  return observed.currency === expected.currency.toLowerCase() && observed.amountMinor === expected.amountMinor
    ? {outcome: "expected_observation", explanation: "The item label and expected ISO currency/amount were observed together in an unambiguous visible block."}
    : {outcome: "mismatch", explanation: `The item block reports ${observed.currency.toUpperCase()} ${(observed.amountMinor / 100).toFixed(2)}, which differs from the buyer-confirmed currency or amount.`};
}
/** The saved agreement supplies every expected value; clients submit observations only. */
export function getBusinessCheckPlan(quote: ProofQuote): ProofBusinessCheckStep[] {
  const project = quote.proof.project;
  if (project?.businessChecks === undefined) return [];
  const checks = validateSavedBusinessChecks(project.businessChecks, project);
  if (!checks.length) return [];
  if (project.coverage?.sourceText !== quote.summary.trim()) throw new DomainError("Business checks no longer match the original project summary.", 409);
  for (const check of checks) {
    const criterion = project.coverage!.decisions.find(row => row.criterionId === check.criterionId)!;
    if (!quote.proof.criteria.some(row => row.id === check.criterionId && row.source === criterion.text)) throw new DomainError("Business checks reference a missing or changed original criterion.", 409);
  }
  return checks.flatMap(({id, ...check}) => ([375, 900] as const).map(viewportWidth => ({...structuredClone(check), checkId: id, stepId: `business:${viewportWidth}:${id}`, viewportWidth})));
}
/** Complete, bounded client observations; server-derived expectations and outcomes are not independent browser verification. */
export function createBusinessCheckReport(quote: ProofQuote, value: unknown, receivedAt = new Date().toISOString()): ProofBusinessCheckReport {
  const input = object(value, ["deliveryId", "previousReportId", "readings"], "Business observations"), delivery = quote.proof.delivery;
  if (!delivery || input.deliveryId !== delivery.id) throw new DomainError("Business checks must use the current delivery version.", 409);
  if (!Object.hasOwn(input, "previousReportId") || input.previousReportId !== (delivery.businessChecks?.id ?? null)) throw new DomainError("Business observations changed. Refresh before saving another run.", 409);
  const plan = getBusinessCheckPlan(quote);
  if (!plan.length) throw new DomainError("The agreement has no buyer-confirmed business checks.", 409);
  if (!Array.isArray(input.readings) || input.readings.length !== plan.length) throw new DomainError("Business observations must cover every agreed check and width exactly once.");
  const remaining = new Map(plan.map(step => [step.stepId, step])), rows = new Map<string, ProofBusinessCheckReport["readings"][number]>();
  for (const raw of input.readings) {
    const row = object(raw, ["stepId", "status", "blocks", "reason"], "Business observation"), step = typeof row.stepId === "string" ? remaining.get(row.stepId) : undefined;
    if (!step) throw new DomainError("Unexpected or duplicate business observation step.");
    remaining.delete(step.stepId);
    let reading: ProofBusinessCheckReading, evaluation: Evaluation;
    if (row.status === "unavailable") {
      object(row, ["stepId", "status", "reason"], "Unavailable business observation");
      if (typeof row.reason !== "string" || !REASONS.has(row.reason)) throw new DomainError("Unknown business unavailability reason.");
      reading = {stepId: step.stepId, status: "unavailable", reason: row.reason as Extract<ProofBusinessCheckReading, {status: "unavailable"}>["reason"]};
      evaluation = {outcome: "unavailable", explanation: `The browser could not provide a bounded observation: ${row.reason}.`};
    } else if (row.status === "observed") {
      object(row, ["stepId", "status", "blocks"], "Observed business content");
      if (!Object.hasOwn(delivery.files ?? {}, step.file)) throw new DomainError("A missing required page cannot have observed business content.");
      if (!Array.isArray(row.blocks) || row.blocks.length > BUSINESS_BLOCK_LIMIT) throw new DomainError("Business observations may include at most 12 visible blocks.");
      const blocks = row.blocks.map(block => text(block, "Observed visible block", BUSINESS_BLOCK_TEXT_LIMIT));
      reading = {stepId: step.stepId, status: "observed", blocks};
      evaluation = evaluateBusinessBlocks(step.expected, blocks);
    } else throw new DomainError("Unsupported business observation status.");
    rows.set(step.stepId, {...step, ...reading, ...evaluation});
  }
  if (typeof receivedAt !== "string" || !Number.isFinite(Date.parse(receivedAt))) throw new DomainError("Invalid business observation receipt time.");
  const readings = plan.map(step => rows.get(step.stepId)!);
  return {id: crypto.randomUUID(), deliveryId: delivery.id, method: "client-business-content-v1", receivedAt, readings,
    summary: {steps: readings.length, observed: readings.filter(row => row.status === "observed").length, issues: readings.filter(row => row.outcome === "mismatch").length, unavailable: readings.filter(row => row.outcome === "unavailable").length}};
}
