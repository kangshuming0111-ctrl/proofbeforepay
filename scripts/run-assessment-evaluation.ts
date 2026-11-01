import { createHash } from "node:crypto";
import { lstat, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ProofAssessment, ProofAssessmentCitation, ProofCriterion, ProofQuote } from "../lib/contracts.ts";
import { assessDelivery } from "../lib/delivery-assessment.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import { DEFAULT_DEEPSEEK_MODEL, type Fetcher, type ProviderEnv } from "../lib/providers.ts";

type Status = "supported" | "changes_suggested" | "insufficient_evidence";
type Stratum = "complete-literal" | "untrusted-source" | "runtime-or-subjective" | "coverage-limited";
export type EvaluationCase = {
  id: string; category: string; language: "zh" | "en"; criterion: ProofCriterion;
  files: Record<string, string>; evaluationStratum: Stratum;
  reference: { expectedStatus: Status; rationale: string; requiresHumanSemanticReview: boolean };
};
type Usage = { promptTokens: number; completionTokens: number };
type Packet = { criteria: ProofCriterion[]; files: Record<string, string>; coverage: ProofAssessment["coverage"] };
type RequestBody = { model: string; max_tokens: number; messages: { role: string; content: string }[] };
type Plan = { requestSha256: string; requestUtf8Bytes: number; promptTokenUpperEstimate: number; reservedCostUsd: number; coverage: ProofAssessment["coverage"] };
type RawResult = {
  httpStatus: number; model: string | null; finishReason: string | null; jsonValid: boolean;
  status: Status | "invalid"; citationValidity: "valid" | "invalid" | "none" | "unavailable";
  citations: { file: string; excerpt: string }[]; explanation: string | null;
};
type CaseResult = {
  id: string; category: string; stratum: Stratum; referenceStatus: Status;
  semanticReview: "pending"; plan: Plan; attempted: boolean; elapsedMilliseconds?: number;
  networkAttempted: boolean; httpError: boolean | null; usageExceededReservation: boolean | null;
  raw?: RawResult; application?: { status: Status | "error"; explanation: string | null; citations: ProofAssessmentCitation[] };
  usage?: Usage | null; conservativeUsageCostUsd?: number | null; error?: string;
};
export type EvaluationOptions = {
  live?: boolean; maxCalls?: number; maxUsd?: number; env?: ProviderEnv; fetcher?: Fetcher;
};

const STRATA: Stratum[] = ["complete-literal", "untrusted-source", "runtime-or-subjective", "coverage-limited"];
const STATUSES: Status[] = ["supported", "changes_suggested", "insufficient_evidence"];
export const VERIFIED_PRICE = Object.freeze({
  model: "deepseek-flash", modelVersionAtVerification: "DeepSeek-V4.1-Flash-1017",
  inputUsdPerMillion: 0.3, outputUsdPerMillion: 1.2, maxOutputTokens: 1800,
  source: "https://api-docs.deepseek.com/quick_start/pricing/", verifiedOn: "2026-11-02",
  assumption: "Peak cache-miss input and peak output rates, ignoring any discounts; estimated from reported usage, not an invoice.",
});
const usd = (usage: Usage) => (usage.promptTokens * VERIFIED_PRICE.inputUsdPerMillion + usage.completionTokens * VERIFIED_PRICE.outputUsdPerMillion) / 1_000_000;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function validateCases(value: unknown): EvaluationCase[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error("Use 1–100 explicitly labelled synthetic cases.");
  const ids = new Set<string>();
  for (const raw of value) {
    const c = raw as EvaluationCase;
    if (!c || !/^[a-z0-9-]{1,80}$/u.test(c.id) || ids.has(c.id) || !STRATA.includes(c.evaluationStratum)
      || !STATUSES.includes(c.reference?.expectedStatus) || !["zh", "en"].includes(c.language)
      || typeof c.category !== "string" || !c.criterion || typeof c.criterion.source !== "string") throw new Error("Invalid evaluation case or duplicate ID.");
    ids.add(c.id);
  }
  return value as EvaluationCase[];
}

/** Build one controlled application fixture, using the actual upload rule evidence. */
export function caseQuote(c: EvaluationCase): ProofQuote {
  const parsed = parseStaticProject({ title: "Synthetic source evaluation", summary: "A controlled assessment case, not a customer project.", amount: "1.00", requiredPages: ["index.html"], manualRequirements: [c.criterion.source] }, c.language);
  const delivery = createUploadedDelivery(c.files, parsed.project, c.language, 1);
  delivery.evidence = delivery.evidence.filter(item => item.criterionId === "manual-1").map(item => ({ ...item, criterionId: c.criterion.id }));
  return {
    id: `evaluation-${c.id}`, reference: "PBP-EVALUATION", title: parsed.title, summary: parsed.summary,
    brief: "Synthetic evaluation only", clientName: "Synthetic business", currency: "AUD", language: c.language,
    hourlyRateCents: 100, totalCents: 100, lineItems: [{ id: "sample", description: "Synthetic", quantity: 1, unitPriceCents: 100 }],
    assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "live", paymentMode: "demo", createdAt: "2026-11-02T00:00:00.000Z", workflow: "proof-v1",
    proof: { criteria: [c.criterion], delivery, paymentState: "unfunded", audit: [], review: { deliveryId: delivery.id, reviewedAt: "2026-11-02T00:00:00.000Z", mode: "demo", summary: "Actual upload rules on synthetic source; no browser or provider call." } },
  };
}

/** Intercept the real application's request construction without network or secrets. */
async function prepare(quote: ProofQuote, model: string): Promise<{ body: string; packet: Packet; plan: Plan }> {
  let body = "";
  const intercept: Fetcher = async (_url, init) => { body = String(init?.body ?? ""); throw new Error("Dry-run request captured without sending."); };
  try { await assessDelivery(quote, { DEEPSEEK_API_KEY: "dry-run-placeholder", DEEPSEEK_MODEL: model }, intercept); }
  catch { /* requestJson intentionally sanitizes the sentinel; a captured body is required below. */ }
  if (!body) throw new Error("An evaluation fixture was rejected before request construction.");
  const request = JSON.parse(body) as RequestBody;
  if (request.model !== model || request.max_tokens !== VERIFIED_PRICE.maxOutputTokens || request.messages.length !== 2) throw new Error("Application request limits changed; review the evaluation configuration.");
  const packet = JSON.parse(request.messages[1].content) as Packet;
  const requestUtf8Bytes = new TextEncoder().encode(body).length;
  // Byte count plus a deliberately large chat-template allowance. This is a
  // conservative admission estimate, not tokenizer output or a billing promise.
  const promptTokenUpperEstimate = requestUtf8Bytes + 4096;
  return { body, packet, plan: { requestSha256: hash(body), requestUtf8Bytes, promptTokenUpperEstimate, reservedCostUsd: usd({ promptTokens: promptTokenUpperEstimate, completionTokens: 1800 }), coverage: packet.coverage } };
}

function parseUsage(value: unknown): Usage | null {
  const u = object(value);
  if (!u || !Number.isSafeInteger(u.prompt_tokens) || Number(u.prompt_tokens) < 0 || Number(u.prompt_tokens) > 10_000_000
    || !Number.isSafeInteger(u.completion_tokens) || Number(u.completion_tokens) < 0 || Number(u.completion_tokens) > 1800) return null;
  if (u.total_tokens !== undefined && u.total_tokens !== Number(u.prompt_tokens) + Number(u.completion_tokens)) return null;
  return { promptTokens: Number(u.prompt_tokens), completionTokens: Number(u.completion_tokens) };
}

function rawResult(data: unknown, status: number, packet: Packet, criterionId: string): { raw: RawResult; usage: Usage | null } {
  const root = object(data);
  const choice = root && Array.isArray(root.choices) ? object(root.choices[0]) : null;
  const message = object(choice?.message);
  let output: Record<string, unknown> | null = null;
  if (typeof message?.content === "string" && message.content.length <= 30_000) { try { output = object(JSON.parse(message.content)); } catch { /* Invalid JSON is itself an evaluation result. */ } }
  const items = output && Array.isArray(output.items) ? output.items.map(object) : [];
  const item = items.find(i => i?.criterionId === criterionId);
  const citations = Array.isArray(item?.citations) ? item.citations : null;
  const safeCitations: { file: string; excerpt: string }[] = [];
  let valid = citations !== null && citations.length <= 3;
  for (const value of citations ?? []) {
    const c = object(value);
    if (!c || typeof c.file !== "string" || c.file.length > 120 || typeof c.excerpt !== "string" || !c.excerpt || c.excerpt.length > 500) { valid = false; continue; }
    safeCitations.push({ file: c.file, excerpt: c.excerpt });
    if (!Object.hasOwn(packet.files, c.file) || !packet.files[c.file].includes(c.excerpt)) valid = false;
  }
  return {
    raw: { httpStatus: status, model: typeof root?.model === "string" ? root.model.slice(0, 120) : null,
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason.slice(0, 60) : null,
      jsonValid: !!output, status: STATUSES.includes(item?.status as Status) ? item!.status as Status : "invalid",
      citationValidity: !citations ? "unavailable" : !valid ? "invalid" : citations.length ? "valid" : "none", citations: safeCitations,
      explanation: typeof item?.explanation === "string" && item.explanation.length <= 600 ? item.explanation : null },
    usage: parseUsage(root?.usage),
  };
}

export function summarize(results: CaseResult[]) {
  return Object.fromEntries(STRATA.map(stratum => {
    const cases = results.filter(r => r.stratum === stratum), attempted = cases.filter(r => r.attempted);
    const mismatch = attempted.filter(r => r.referenceStatus === "changes_suggested");
    const clean = attempted.filter(r => r.referenceStatus === "supported");
    const abstain = attempted.filter(r => r.referenceStatus === "insufficient_evidence");
    const times = attempted.map(r => r.elapsedMilliseconds ?? 0).sort((a, b) => a - b);
    const fraction = (count: number, total: number) => ({ count, total, fraction: total ? count / total : null });
    return [stratum, {
      planned: cases.length, attempted: attempted.length, applicationErrors: attempted.filter(r => r.application?.status === "error").length,
      rawStatusAgreement: fraction(attempted.filter(r => r.raw?.status === r.referenceStatus).length, attempted.length),
      applicationStatusAgreement: fraction(attempted.filter(r => r.application?.status === r.referenceStatus).length, attempted.length),
      mismatchRecall: { raw: fraction(mismatch.filter(r => r.raw?.status === "changes_suggested").length, mismatch.length), application: fraction(mismatch.filter(r => r.application?.status === "changes_suggested").length, mismatch.length) },
      falsePositiveOnClean: { raw: fraction(clean.filter(r => r.raw?.status === "changes_suggested").length, clean.length), application: fraction(clean.filter(r => r.application?.status === "changes_suggested").length, clean.length) },
      correctAbstention: { raw: fraction(abstain.filter(r => r.raw?.status === "insufficient_evidence").length, abstain.length), application: fraction(abstain.filter(r => r.application?.status === "insufficient_evidence").length, abstain.length) },
      invalidCitationResponses: attempted.filter(r => r.raw?.citationValidity === "invalid").length,
      unknownUsage: attempted.filter(r => !r.usage).length,
      reportedUsageCostUsd: attempted.reduce((sum, r) => sum + (r.conservativeUsageCostUsd ?? 0), 0),
      latency: { samples: times.length, meanMilliseconds: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null, p50Milliseconds: times.length ? times[Math.ceil(times.length * .5) - 1] : null, p95Milliseconds: times.length ? times[Math.ceil(times.length * .95) - 1] : null },
    }];
  }));
}

export async function runEvaluation(input: unknown, options: EvaluationOptions = {}) {
  const cases = validateCases(input), env = options.env ?? {};
  const model = env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
  if (model !== VERIFIED_PRICE.model) throw new Error("Model has no verified price configuration; only deepseek-flash is allowed.");
  if (options.live && (!Number.isSafeInteger(options.maxCalls) || options.maxCalls! < 1 || options.maxCalls! > 100
    || !Number.isFinite(options.maxUsd) || options.maxUsd! <= 0 || options.maxUsd! > 1)) throw new Error("Live evaluation requires explicit --max-calls 1–100 and --max-usd >0 and <=1.");
  if (options.live && !env.DEEPSEEK_API_KEY?.trim()) throw new Error("Live evaluation requires DEEPSEEK_API_KEY in the caller's process environment.");
  const prepared = await Promise.all(cases.map(async c => { const quote = caseQuote(c); return { c, quote, ...await prepare(quote, model) }; }));
  const results: CaseResult[] = prepared.map(({ c, plan }) => ({ id: c.id, category: c.category, stratum: c.evaluationStratum, referenceStatus: c.reference.expectedStatus, semanticReview: "pending", plan, attempted: false, networkAttempted: false, httpError: null, usageExceededReservation: null }));
  let calls = 0, reportedCost = 0, unaccountedReservedCost = 0;
  let stopReason = options.live ? "all_cases_completed" : "dry_run_no_provider_calls";
  if (options.live) for (let i = 0; i < prepared.length; i++) {
    const { c, quote, plan, packet } = prepared[i], result = results[i];
    if (calls >= options.maxCalls!) { stopReason = "max_calls_reached"; break; }
    if (reportedCost + plan.reservedCostUsd > options.maxUsd! + 1e-12) { stopReason = "budget_reservation_rejected"; break; }
    const began = performance.now();
    let networkAttempted = false;
    const wrapped: Fetcher = async (url, init) => {
      if (String(url) !== "https://api.deepseek.com/chat/completions" || hash(String(init?.body ?? "")) !== plan.requestSha256 || networkAttempted) throw new Error("Unexpected evaluation request.");
      networkAttempted = true; result.attempted = true; result.networkAttempted = true; calls++;
      const response = await (options.fetcher ?? fetch)(url, init);
      result.httpError = response.status < 200 || response.status >= 300;
      let data: unknown = null;
      try { const body = await response.clone().text(); if (body.length <= 1_000_000) data = JSON.parse(body); } catch { /* No trustworthy usage => stop below. */ }
      const captured = rawResult(data, response.status, packet, c.criterion.id);
      result.raw = captured.raw; result.usage = captured.usage;
      result.conservativeUsageCostUsd = captured.usage ? usd(captured.usage) : null;
      result.usageExceededReservation = captured.usage ? captured.usage.promptTokens > plan.promptTokenUpperEstimate : null;
      return response;
    };
    try {
      const report = await assessDelivery(quote, { DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL: model }, wrapped);
      const item = report.items.find(item => item.criterionId === c.criterion.id)!;
      result.application = { status: item.status, explanation: item.explanation, citations: item.citations };
    } catch { result.application = { status: "error", explanation: null, citations: [] }; result.error = "application_rejected_or_provider_failed"; }
    result.elapsedMilliseconds = Math.round(performance.now() - began);
    if (!networkAttempted) { stopReason = "application_rejected_before_network"; break; }
    if (!result.usage) { unaccountedReservedCost = plan.reservedCostUsd; stopReason = "unknown_usage_stop"; break; }
    reportedCost += result.conservativeUsageCostUsd!;
    if (result.usageExceededReservation || reportedCost > options.maxUsd! + 1e-12) { stopReason = "usage_exceeded_conservative_estimate"; break; }
    if (result.raw!.httpStatus < 200 || result.raw!.httpStatus >= 300) { stopReason = "provider_http_error"; break; }
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: options.live ? "live" : "dry-run", model,
    pricing: VERIFIED_PRICE, limits: { maxCalls: options.live ? options.maxCalls : 0, maxUsd: options.live ? options.maxUsd : 0, outputTokensPerCall: 1800, applicationRequestTimeoutMilliseconds: 30_000, automaticRetries: 0 },
    accounting: { calls, conservativeReportedUsageCostUsd: reportedCost, unknownUsageReservedUsd: unaccountedReservedCost, stopReason },
    measurementNotes: ["Reference labels never enter a provider request.", "Raw model and application policy statuses are reported separately; application abstention does not prove the model abstained.", "Four strata are reported separately; do not pool coverage-limited cases into complete-literal error rates.", "Status agreement is not a human semantic accuracy result; every case still needs human review.", "Input reservation uses request UTF-8 byte count plus 4096 tokens for template overhead; it is a deliberately conservative estimate, not tokenizer output or a provider-enforced spending cap.", "Missing/invalid usage or network ambiguity stops further calls and records that call's reserved estimate.", "No payment, database writes, customer data or application credentials are included in this evaluation."],
    summaryByStratum: summarize(results), results };
}

async function main(args: string[]) {
  const flags = new Map<string, string>(); let live = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--live") { if (live) throw new Error("Duplicate --live."); live = true; continue; }
    if (!["--output", "--max-calls", "--max-usd"].includes(args[i]) || flags.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Usage: node --experimental-strip-types scripts/run-assessment-evaluation.ts --output /absolute/new.json [--live --max-calls 19 --max-usd 0.05]");
    flags.set(args[i], args[++i]);
  }
  const output = flags.get("--output");
  if (!output || !path.isAbsolute(output) || !output.endsWith(".json")) throw new Error("Use a new absolute JSON output path.");
  try { await lstat(output); throw new Error("Output already exists."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (!(await stat(path.dirname(output))).isDirectory()) throw new Error("Output directory does not exist.");
  const corpus = JSON.parse(await readFile(new URL("./assessment-evaluation-cases.json", import.meta.url), "utf8"));
  const report = await runEvaluation(corpus.cases, { live, maxCalls: flags.has("--max-calls") ? Number(flags.get("--max-calls")) : undefined, maxUsd: flags.has("--max-usd") ? Number(flags.get("--max-usd")) : undefined,
    env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL } });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output, mode: report.mode, ...report.accounting }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error("Evaluation stopped. Check explicit arguments, fixture validity, model configuration and a new writable output path; no credentials or provider diagnostics are printed."); process.exitCode = 1; });
}
