import type { Language, ProofQuote, ProofRole, RequirementSource } from "./contracts.ts";
import { DomainError } from "./domain.ts";
import { validateSavedCoverage } from "./requirement-coverage.ts";
import { suggestBookingPolicy } from "./booking-policy.ts";
import { suggestSlotCapacity } from "./booking-capacity.ts";

/** Suggestions describe supported evidence recipes. They never confirm scope,
 * start a run, claim a test result or authorize acceptance/payment. */
export const JOURNEY_PLAN_CAPABILITIES = ["max_party_size", "slot_capacity", "cancellation_once", "atomic_reschedule", "same_key_retry"] as const;
export type JourneyPlanCapability = typeof JOURNEY_PLAN_CAPABILITIES[number];
export type JourneyPlanCandidate = {id: string; criterionId: string; source: RequirementSource; capability: JourneyPlanCapability; value?: number};
export type JourneyPlanUnresolved = {criterionId: string; source: RequirementSource; reason: string};
export type JourneySuggestionContext = {sourceText: string; language: Language; includedRequirements: {criterionId: string; source: RequirementSource}[]};
export type JourneyRecipeSuggestion = {protocol: "booking-lifecycle-http-v1"; recipe: "booking-lifecycle-20-v1"; maxPartySize: 6; maxGuestsPerSlot: 8; candidateIds: string[]; provenance: "unconfirmed-ai-recipe-suggestion"};
export type JourneyPlanSuggestions = {
  id: string; sourceText: string; sourceDigest: string; mode: "live"; model: string; generatedAt: string;
  candidates: JourneyPlanCandidate[]; unresolved: JourneyPlanUnresolved[]; recipeSuggestion?: JourneyRecipeSuggestion;
  warnings: string[]; usage?: {promptTokens: number; completionTokens: number};
};
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
const CONDITIONAL = /\b(?:if|unless|except|provided|depending|weekends?|holidays?|maybe|perhaps|tentative|tbd|alternatively|either|or)\b|如果|若|除非|除了|例外|周末|节假日|工作日|取决于|视情况|或者|或是|暂定|待定|待确认|另行/iu;
const NEGATION = /\b(?:no|not|never|cannot|can't|mustn't|disabled?|unavailable|forbidden|prohibit(?:ed)?|disallow(?:ed)?)\b|不要|不得|禁止|不允许|不支持|不提供|不能|不可|无需|无须|排除|不开放|没有|取消此功能/iu;
const RULE_QUALIFIER = /\b(?:minimum|maximum|unlimited|limits?|instead|different|at\s+least)\b|\d|至少|最多|上限|不限|不设|限制/iu;
const FINANCIAL = /\b(?:payment|pay|paypal|capture|refund|escrow|price|fee|budget|authorization|transfer)\b|支付|扣款|付款|托管|退款|金额|预算|报价|制作费|开发费/iu;
const relevant: Record<JourneyPlanCapability, RegExp> = {
  max_party_size: /\b(?:party|booking|people|persons|guests)\b|预约|预订|人数/iu,
  slot_capacity: /\b(?:slot|capacity|occupancy)\b|时段|时间段|容量|总人数/iu,
  cancellation_once: /\bcancel(?:lation|led|ing)?\b|取消/iu,
  atomic_reschedule: /\b(?:mov(?:e|es|ing)|reschedul(?:e|es|ing)|atomic(?:ally)?)\b|改期|变更时间|原子/iu,
  same_key_retry: /\b(?:retr(?:y|ies)|idempotenc[ey]|same[ -]key|lost response)\b|重试|幂等|同一.{0,3}键|相同.{0,3}键|响应丢失/iu,
};
// Complete positive grammars are deliberately small. A matching substring is
// insufficient: qualifiers, negations and extra instructions cannot disappear.
const lifecycleGrammar: Record<Exclude<JourneyPlanCapability, "max_party_size" | "slot_capacity">, RegExp[]> = {
  cancellation_once: [
    /^cancellation\s+releases\s+(?:the\s+)?capacity\s+(?:exactly\s+)?once\s+and\s+(?:repeated|repeating)\s+cancellation\s+has\s+no\s+further\s+effect$/iu,
    /^取消(?:预约|预订)?(?:时)?(?:仅|只)?释放一次(?:容量|名额)(?:并且|并|且|和)重复取消(?:不会|不再)释放(?:额外)?(?:容量|名额)$/u,
  ],
  atomic_reschedule: [
    /^a\s+(?:rejected|failed)\s+(?:move|reschedule)\s+preserves\s+the\s+original\s+booking\s+and\s+a\s+successful\s+(?:move|reschedule)\s+changes\s+the\s+same\s+booking\s+atomically$/iu,
    /^(?:失败|被拒绝)的?改期(?:必须)?保留原(?:预约|预订)(?:并且|并|且|和)成功的?改期(?:必须)?原子(?:地)?修改同一(?:预约|预订)$/u,
  ],
  same_key_retry: [
    /^after\s+a\s+lost\s+response\s+query\s+the\s+original\s+booking\s+and\s+retry\s+with\s+the\s+same\s+key\s+without\s+creating\s+another\s+booking$/iu,
    /^响应丢失后(?:先)?查询原(?:预约|预订)(?:并且|并|且|再|和)使用(?:相同|同一)(?:幂等)?键重试(?:不得|不能|不会)创建重复(?:预约|预订)$/u,
  ],
};
function object(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DomainError("Journey-plan suggestions require plain JSON objects.");
  if (required.some(key => !Object.hasOwn(value, key))) throw new DomainError("A journey-plan suggestion is missing a field.");
  for (const key of Reflect.ownKeys(value)) if (typeof key !== "string" || !allowed.includes(key) || !("value" in Object.getOwnPropertyDescriptor(value, key)!)) throw new DomainError("Journey-plan suggestions contain an unsupported field.");
  return value as Record<string, unknown>;
}
const word = (language: Language, zh: string, en: string) => language === "zh" ? zh : en;
function safeText(value: unknown, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || CONTROL.test(value)
    || [...value].some(char => {const code = char.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff;})) throw new DomainError("Journey suggestion text is invalid or too long.");
  return value;
}

/** Only the stored buyer scope is sent to the provider. A request cannot supply
 * another brief, role, price, delivery, URL or apparent confirmation. */
export function journeySuggestionContext(quote: ProofQuote, role: ProofRole, value: unknown): JourneySuggestionContext {
  if (role !== "buyer") throw new DomainError("Only the buyer can request an acceptance-plan suggestion.", 403);
  const request = object(value, ["confirm", "language"], ["confirm"]);
  if (request.confirm !== true) throw new DomainError("Confirm sending the included original requirements to AI for an unconfirmed plan suggestion.");
  if (request.language !== undefined && request.language !== "zh" && request.language !== "en") throw new DomainError("Language must be zh or en.");
  const saved = quote.proof.project?.coverage;
  if (!saved) throw new DomainError("Confirm the original requirement coverage before requesting a journey-plan suggestion.", 409);
  const coverage = validateSavedCoverage(saved);
  if (coverage.sourceText !== quote.summary.trim()) throw new DomainError("The original requirement coverage changed. Review it before requesting suggestions.", 409);
  const includedRequirements = coverage.decisions.filter(row => row.disposition === "include").map(row => {
    if (!quote.proof.criteria.some(criterion => criterion.id === row.criterionId && criterion.source === row.text)) throw new DomainError("The saved original requirement and agreed criterion differ.", 409);
    return {criterionId: row.criterionId!, source: {start: row.start, end: row.end, excerpt: safeText(row.text, 300)}};
  });
  if (!includedRequirements.length) throw new DomainError("Include an original requirement before requesting journey-plan suggestions.", 409);
  return {sourceText: coverage.sourceText, language: request.language as Language | undefined ?? quote.language, includedRequirements};
}

function supportedValue(capability: JourneyPlanCapability, source: RequirementSource): number | true | undefined {
  const clause = source.excerpt.trim().replace(/[。.!！；;]$/u, "").trimEnd();
  if (CONTROL.test(clause) || CONDITIONAL.test(clause) || FINANCIAL.test(clause)) return;
  if (capability === "max_party_size") return suggestBookingPolicy(source)?.maxPartySize;
  if (capability === "slot_capacity") return suggestSlotCapacity(source)?.maxGuestsPerSlot;
  return lifecycleGrammar[capability].some(grammar => grammar.test(clause)) ? true : undefined;
}

/** Model selection is advisory. The server independently re-derives every
 * capability from the complete source clause and the currently executable
 * fixed M6/C8 recipe. Unsupported semantics remain unresolved. */
export function parseJourneyPlanProposal(value: unknown, context: JourneySuggestionContext): Pick<JourneyPlanSuggestions, "candidates" | "unresolved" | "recipeSuggestion"> {
  const output = object(value, ["candidates", "unresolved"]);
  if (!Array.isArray(output.candidates) || output.candidates.length > 12 || !Array.isArray(output.unresolved) || output.unresolved.length > 12) throw new DomainError("Journey-plan suggestions exceed the supported limits.");
  const included = new Map(context.includedRequirements.map(row => [row.criterionId, row]));
  const unresolved: JourneyPlanUnresolved[] = [], candidates: JourneyPlanCandidate[] = [];
  const clarify = (criterionId: string, reason: string) => {
    const row = included.get(criterionId)!;
    if (!unresolved.some(item => item.criterionId === criterionId)) unresolved.push({criterionId, source: structuredClone(row.source), reason});
  };
  for (const raw of output.unresolved) {
    const row = object(raw, ["criterionId", "reason"]);
    if (typeof row.criterionId !== "string" || !included.has(row.criterionId) || unresolved.some(item => item.criterionId === row.criterionId)) throw new DomainError("Unresolved journey suggestions must use unique included criteria.");
    clarify(row.criterionId, safeText(row.reason, 500));
  }
  const seen = new Set<string>();
  for (const raw of output.candidates) {
    const row = object(raw, ["criterionId", "capability", "value"], ["criterionId", "capability"]);
    if (typeof row.criterionId !== "string" || !included.has(row.criterionId) || !JOURNEY_PLAN_CAPABILITIES.includes(row.capability as JourneyPlanCapability)) throw new DomainError("Journey suggestions must reference included criteria and supported capabilities.");
    const capability = row.capability as JourneyPlanCapability, criterion = included.get(row.criterionId)!;
    const identity = `${criterion.criterionId}:${capability}`;
    if (seen.has(identity)) throw new DomainError("Duplicate journey-plan suggestions are not supported.");
    seen.add(identity);
    const observed = supportedValue(capability, criterion.source);
    const expected = capability === "max_party_size" ? 6 : capability === "slot_capacity" ? 8 : undefined;
    if (observed === undefined || expected !== undefined && (row.value !== expected || observed !== expected) || expected === undefined && row.value !== undefined) {
      clarify(criterion.criterionId, word(context.language, "本条完整原文无法形成当前固定 6 人／8 人协议支持的检查，或包含未支持的条件；请澄清，不会自动改写需求。", "This complete original clause does not define a supported check in the fixed 6-person/8-guest recipe, or has unsupported conditions. Clarify it; the requirement is not rewritten."));
      continue;
    }
    if (!unresolved.some(item => item.criterionId === criterion.criterionId)) candidates.push({id: `journey-suggestion-${candidates.length + 1}`, criterionId: criterion.criterionId, source: structuredClone(criterion.source), capability, ...(expected !== undefined ? {value: expected} : {})});
  }
  // A condition can be a separate literal coverage group (e.g. "Unless ...,").
  // Preserve it conservatively rather than allow a later positive fragment to
  // silently turn the qualified whole original brief into an executable plan.
  const risky = context.includedRequirements.filter(row => !JOURNEY_PLAN_CAPABILITIES.some(capability => supportedValue(capability, row.source) !== undefined)
    && (CONDITIONAL.test(row.source.excerpt) || NEGATION.test(row.source.excerpt) || FINANCIAL.test(row.source.excerpt) || RULE_QUALIFIER.test(row.source.excerpt)));
  const blocked = new Set<JourneyPlanCapability>();
  for (const risk of risky) {
    // Supported positive retry/cancellation sentences contain "without"/"no"
    // or Chinese prohibitions on duplicates. Only the full positive grammar
    // can explain these safely; otherwise fail closed for related capabilities.
    for (const capability of JOURNEY_PLAN_CAPABILITIES) {
      if (supportedValue(capability, risk.source) !== undefined) continue;
      if (CONDITIONAL.test(risk.source.excerpt) || relevant[capability].test(risk.source.excerpt)) blocked.add(capability);
    }
    if (blocked.size) clarify(risk.criterionId, word(context.language, "原文包含条件、否定或财务范围，不能忽略该限制来建议完整旅程；请先澄清。", "The original contains a condition, negation or financial scope. It cannot be ignored to propose a complete journey; clarify it first."));
  }
  for (const capability of JOURNEY_PLAN_CAPABILITIES) {
    const facts = context.includedRequirements.map(row => supportedValue(capability, row.source)).filter(value => value !== undefined);
    if (new Set(facts).size > 1) blocked.add(capability);
  }
  for (const candidate of candidates) if (blocked.has(candidate.capability)) clarify(candidate.criterionId, word(context.language, "其他完整原文对该能力存在冲突、条件或否定，建议暂不采纳。", "Another complete original clause conflicts with, qualifies or negates this capability. Do not adopt it yet."));
  for (const row of context.includedRequirements) if (!candidates.some(item => item.criterionId === row.criterionId) && !unresolved.some(item => item.criterionId === row.criterionId)) clarify(row.criterionId, word(context.language, "本条没有受当前旅程协议支持的 AI 检查建议；仍需其他检查或人工确认。", "No supported journey check was proposed for this original clause. It still needs other checks or human confirmation."));
  const accepted = candidates.filter(item => !blocked.has(item.capability) && !unresolved.some(row => row.criterionId === item.criterionId)).map((item, index) => ({...item, id: `journey-suggestion-${index + 1}`}));
  const complete = JOURNEY_PLAN_CAPABILITIES.every(capability => accepted.some(item => item.capability === capability));
  return {candidates: accepted, unresolved, ...(complete ? {recipeSuggestion: {protocol: "booking-lifecycle-http-v1" as const, recipe: "booking-lifecycle-20-v1" as const, maxPartySize: 6 as const, maxGuestsPerSlot: 8 as const, candidateIds: accepted.map(row => row.id), provenance: "unconfirmed-ai-recipe-suggestion" as const}} : {})};
}

export async function journeySuggestionDigest(sourceText: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sourceText)))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
