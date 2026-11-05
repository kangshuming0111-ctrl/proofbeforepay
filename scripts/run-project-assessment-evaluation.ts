import { createHash } from "node:crypto";
import { readFile, writeFile, stat, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ProofAssessment, ProofCriterion, ProofQuote } from "../lib/contracts.ts";
import { assessDelivery,assessmentOutputTokenLimit } from "../lib/delivery-assessment.ts";
import {AssessmentResponseError,requireAssessmentItemCoverage,type AssessmentFailureReason,type AssessmentCoverageDiagnostic} from "../lib/assessment-response.ts";
import {assessmentCompletionText,assessmentReportJson} from "../lib/assessment-completion.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import { DEFAULT_DEEPSEEK_MODEL, type Fetcher, type ProviderEnv } from "../lib/providers.ts";

export type EvaluationStatus = "supported" | "changes_suggested" | "insufficient_evidence";
type Stratum = "clean" | "mismatch" | "untrusted" | "boundary";
type Reference = { expectedStatus: EvaluationStatus; rationale: string; relevantFiles: string[]; requiresSemanticReview: true };
export type EvaluationProject = { id: string; stratum: Stratum; language: "en" | "zh"; title: string; summary: string;
  files: Record<string, string>; criteria: (ProofCriterion & { reference: Reference })[] };
export type ProjectCorpus = { schema: "proofbeforepay-frozen-project-corpus-v1"; cohort: string; scope: string; referenceMethod: string; projects: EvaluationProject[] };
type Usage = { promptTokens: number; completionTokens: number };
type Packet = { criteria: ProofCriterion[]; files: Record<string, string>; coverage: ProofAssessment["coverage"]; fileInventory: unknown[] };
type Plan = { requestSha256: string; requestUtf8Bytes: number; promptTokenUpperEstimate: number; outputTokenLimit: number; reservedCostUsd: number; coverage: ProofAssessment["coverage"] };
type Prepared = { project: EvaluationProject; quote: ProofQuote; body: string; packet: Packet; plan: Plan };
export type ProjectFreeze = { schema: "proofbeforepay-project-evaluation-freeze-v1"; createdAt: string; snapshotSha256: string;
  snapshot: { cohort: string; corpusSha256: string; corpusEncoding: string; model: string; pricing: typeof PROJECT_EVALUATION_PRICE;
    implementation: { file: string; sha256: string }[]; projects: { id: string; quoteSha256: string; files: { file: string; sha256: string }[]; requestBody: string; plan: Plan }[] } };
type CitationCheck = { file: string | null; excerpt: string | null; valid: boolean; start: number | null; end: number | null };
type CriterionResult = { id: string; referenceStatus: EvaluationStatus; rawStatus: EvaluationStatus | "invalid" | "not_attempted";
  applicationStatus: EvaluationStatus | "error" | "not_attempted"; rawCitations: CitationCheck[]; applicationCitations: CitationCheck[];
  rawCitationValidity: "valid" | "invalid" | "none" | "unavailable"; semanticReview: "pending_independent_adjudication" };
type RawCapture = { httpStatus: number; bodyText: string | null; bodyPrefixText: string | null; bodyComplete: boolean; bodyUtf8Bytes: number; bodyByteCountIsComplete: boolean; utf8Valid: boolean; providerBody: unknown;
  contentText: string | null; originalContentText: string | null; originalJsonValid: boolean | null; contentNormalization: "none" | "one_trailing_brace"; transport: "strict_tool" | "legacy_json" | null; completion: unknown; items: unknown; risks: unknown; limitations: unknown; finishReason: unknown; model: unknown;
  riskCitationChecks: CitationCheck[][] };
export type RawItemDiagnostics={expectedCriterionIds:string[];returnedKnownCriterionIds:string[];missingCriterionIds:string[];duplicateCriterionIds:string[];unknownCriterionCount:number;invalidItemCount:number;contentParsed:boolean;idProfileParsed:boolean;profileSource:"original_json"|"normalized_strict_arguments"|"unavailable";completeItemCoverage:boolean;finishReason:"stop"|"tool_calls"|"length"|"other"|"unavailable"};
export type ProjectEvaluationResult = { id: string; stratum: Stratum; reference: { criterionId: string; label: Reference }[]; plan: Plan;
  attempted: boolean; networkAttempted: boolean; elapsedMilliseconds?: number; raw?: RawCapture; usage?: Usage | null;
  rawDiagnostics?:RawItemDiagnostics;
  usageExceededReservation?: boolean; reportedUsageCostUsd?: number | null; application?: { accepted: boolean; report: ProofAssessment | null; error: string | null;failureReason?:AssessmentFailureReason;coverageDiagnostic?:AssessmentCoverageDiagnostic };
  criteria: CriterionResult[]; wholeAnswerSemanticReview: "pending_independent_adjudication" };
type Options = { live?: boolean; maxCalls?: number; maxUsd?: number; env?: ProviderEnv; fetcher?: Fetcher; frozen?: ProjectFreeze;
  corpusText?: string; sourceRoot?: string; onResult?: (result: ProjectEvaluationResult) => Promise<void> };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATUSES: EvaluationStatus[] = ["supported", "changes_suggested", "insufficient_evidence"];
const STRATA: Stratum[] = ["clean", "mismatch", "untrusted", "boundary"];
const FIXTURE_TIME = "2026-11-04T00:00:00.000Z";
export const PROJECT_EVALUATION_PRICE = Object.freeze({ model: "deepseek-flash", modelVersionAtVerification: "DeepSeek-V4.1-Flash-1017",
  inputUsdPerMillion: .3, outputUsdPerMillion: 1.2, verifiedOn: "2026-11-04", source: "https://api-docs.deepseek.com/quick_start/pricing/",
  assumption: "Peak cache-miss rates, excluding discounts; usage-derived estimate, not an invoice or provider-enforced spending cap." });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) => object(entry) ? Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, "en"))) : entry);
const cost = (usage: Usage) => (usage.promptTokens * PROJECT_EVALUATION_PRICE.inputUsdPerMillion + usage.completionTokens * PROJECT_EVALUATION_PRICE.outputUsdPerMillion) / 1e6;
const bounded = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;

/** Preserve historical two-manual provider packets. New shapes must come from
 * the real intake, including its five-manual/twelve-coverage limits and titles. */
function projectIntake(project:EvaluationProject){
 const manual=project.criteria.filter(c=>/^manual-/u.test(c.id)),coverage=project.criteria.filter(c=>/^coverage-/u.test(c.id)),legacy=project.criteria.length===2&&project.criteria.every((c,i)=>c.id===`manual-${i+1}`);
 if(manual.length+coverage.length!==project.criteria.length||manual.length>5||coverage.length>12||!project.criteria.length||project.criteria.length>17)throw new Error("Project criteria exceed supported production intake families or limits.");
 const units=coverage.length?summaryCoverageUnits(project.summary):[];
 if(coverage.length&&units.length!==coverage.length)throw new Error("Project coverage count does not match the original summary groups.");
 const parsed=parseStaticProject({title:project.title,summary:project.summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:manual.map(c=>c.source),...(coverage.length?{coverage:{version:1,sourceText:project.summary,confirmed:true,decisions:units.map(u=>({id:u.id,disposition:"include"}))}}:{})},project.language);
 // The real intake creates a current confirmation timestamp. This isolated
 // authored fixture pins it just like delivery/review time, without changing
 // the parsed source spans, decisions, criterion derivation or input limits.
 if(parsed.project.coverage)parsed.project.coverage.confirmedAt=FIXTURE_TIME;
 const derived=parsed.criteria.filter(c=>/^(?:manual|coverage)-/u.test(c.id));
 if(derived.length!==project.criteria.length||derived.some((c,i)=>c.id!==project.criteria[i].id||c.source!==project.criteria[i].source||!legacy&&c.title!==project.criteria[i].title))throw new Error("Project custom criteria must match production intake IDs, source, titles and order.");
 return{parsed,legacy};
}

export function validateProjectCorpus(value: unknown): ProjectCorpus {
  const corpus = object(value);
  if (corpus?.schema !== "proofbeforepay-frozen-project-corpus-v1" || !bounded(corpus.cohort, 100) || !bounded(corpus.scope, 2000)
    || !bounded(corpus.referenceMethod, 2000) || !Array.isArray(corpus.projects) || !corpus.projects.length || corpus.projects.length > 12) throw new Error("Invalid bounded project corpus.");
  const ids = new Set<string>();
  for (const entry of corpus.projects) {
    const p = entry as EvaluationProject;
    if (!p || !/^[a-z0-9-]{1,80}$/u.test(p.id) || ids.has(p.id) || !STRATA.includes(p.stratum) || !["en", "zh"].includes(p.language)
      || !bounded(p.title, 120) || !bounded(p.summary, 1000) || !object(p.files) || Object.keys(p.files).length < 3 || Object.keys(p.files).length > 12
      || Object.keys(p.files).filter(file => file.endsWith(".html")).length < 2 || Object.values(p.files).some(contents => typeof contents !== "string")
      || !Array.isArray(p.criteria) || p.criteria.length<1||p.criteria.length>17) throw new Error("Invalid project or duplicate project ID.");
    ids.add(p.id);
    for (const criterion of p.criteria) {
      const ref = criterion?.reference;
      if (typeof criterion?.id!=="string"||!/^(?:manual|coverage)-[1-9]\d?$/u.test(criterion.id)||!bounded(criterion.title, 500) || !bounded(criterion.source, 3000)
        || !ref || !STATUSES.includes(ref.expectedStatus) || !bounded(ref.rationale, 3000) || ref.requiresSemanticReview !== true
        || !Array.isArray(ref.relevantFiles) || !ref.relevantFiles.length || ref.relevantFiles.length > 12
        || ref.relevantFiles.some(file => typeof file !== "string" || !Object.hasOwn(p.files, file))) throw new Error("Invalid project reference or criterion.");
    }
    projectIntake(p);
  }
  return structuredClone(value) as ProjectCorpus;
}

/** Actual upload-rule evidence; deterministic IDs/times make freeze/replay exact. */
export function projectQuote(project: EvaluationProject): ProofQuote {
  const {parsed,legacy}=projectIntake(project);
  const delivery = createUploadedDelivery(project.files, parsed.project, project.language, 1);
  delivery.id = `eval-${project.id}`; delivery.submittedAt = FIXTURE_TIME;
  delivery.evidence = delivery.evidence.filter(row => project.criteria.some(c => c.id === row.criterionId))
    .map((row, index) => ({ ...row, id: `eval-evidence-${index + 1}` }));
  return { id: `eval-${project.id}`, reference: "PBP-NEW-PROJECT-EVALUATION", title: project.title, summary: project.summary,
    brief: "Synthetic source assessment only", clientName: "Fictional business", currency: "AUD", language: project.language,
    hourlyRateCents: 100, totalCents: 100, lineItems: [{ id: "synthetic", description: "Synthetic fixture", quantity: 1, unitPriceCents: 100 }],
    assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "live", paymentMode: "demo", createdAt: FIXTURE_TIME, workflow: "proof-v1",
    proof: { criteria: project.criteria.map(({ id, title, source }) => ({ id, title, source })),...(!legacy?{project:parsed.project}:{}), delivery, paymentState: "unfunded", audit: [],
      review: { deliveryId: delivery.id, reviewedAt: FIXTURE_TIME, mode: "demo", summary: "Actual upload rules on new synthetic files; no browser execution or payment." } } };
}

async function prepare(project: EvaluationProject, model: string): Promise<Prepared> {
  const quote = projectQuote(project); let body = "";
  try { await assessDelivery(quote, { DEEPSEEK_API_KEY: "dry-run-placeholder", DEEPSEEK_MODEL: model }, async (_url, init) => {
    body = String(init?.body ?? ""); throw new Error("Captured without network.");
  }); } catch { /* capture-only sentinel is intentionally sanitized by the real application */ }
  if (!body) throw new Error(`Project ${project.id} was rejected before request construction.`);
  const request = JSON.parse(body) as { model: string; max_tokens: number; messages: { role: string; content: string }[] };
  if (request.model !== model || request.max_tokens !== assessmentOutputTokenLimit(project.criteria.length) || request.messages.length !== 2 || request.messages[1].role !== "user") throw new Error("Assessment request contract changed.");
  const packet = JSON.parse(request.messages[1].content) as Packet;
  if (packet.criteria.length !== project.criteria.length || packet.criteria.some((c,i) => Object.keys(c).sort().join(",") !== "id,source,title"||canonical(c)!==canonical(quote.proof.criteria[i]))) throw new Error("References or non-derived criteria entered the provider packet.");
  const requestUtf8Bytes = Buffer.byteLength(body), promptTokenUpperEstimate = requestUtf8Bytes + 4096;
  return { project, quote, body, packet, plan: { requestSha256: hash(body), requestUtf8Bytes, promptTokenUpperEstimate, outputTokenLimit: request.max_tokens,
    reservedCostUsd: cost({ promptTokens: promptTokenUpperEstimate, completionTokens: request.max_tokens }), coverage: packet.coverage } };
}

/** Hash the working-tree implementation, including its relative-import closure and dependency lock. */
async function implementationSnapshot(root: string) {
  const pending = ["scripts/run-project-assessment-evaluation.ts", "package.json", "pnpm-lock.yaml"], seen = new Set<string>(), rows: { file: string; sha256: string }[] = [];
  while (pending.length) {
    const file = pending.pop()!; if (seen.has(file)) continue; seen.add(file);
    const contents = await readFile(path.join(root, file), "utf8"); rows.push({ file, sha256: hash(contents) });
    if (!file.endsWith(".ts")) continue;
    for (const match of contents.matchAll(/(?:from\s*|import\s*\()(["'])(\.[^"']+)\1/gu)) {
      const imported = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]));
      if (imported.startsWith("../") || path.isAbsolute(imported)) throw new Error("Implementation import escaped the source root.");
      if (imported.endsWith(".ts") || imported.endsWith(".json")) pending.push(imported);
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file, "en"));
}

export async function prepareProjectEvaluation(input: unknown, options: Pick<Options, "env" | "corpusText" | "sourceRoot"> = {}) {
  const corpus = validateProjectCorpus(input), model = options.env?.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
  if (model !== PROJECT_EVALUATION_PRICE.model) throw new Error("Model has no freshly verified price configuration.");
  if (options.corpusText !== undefined && canonical(JSON.parse(options.corpusText)) !== canonical(input)) throw new Error("Corpus bytes do not match the provided corpus.");
  const prepared = await Promise.all(corpus.projects.map(project => prepare(project, model)));
  const snapshot: ProjectFreeze["snapshot"] = { cohort: corpus.cohort, corpusSha256: hash(options.corpusText ?? canonical(input)),
    corpusEncoding: options.corpusText === undefined ? "canonical-json" : "exact-file-utf8", model, pricing: PROJECT_EVALUATION_PRICE,
    implementation: await implementationSnapshot(options.sourceRoot ?? ROOT), projects: prepared.map(p => ({ id: p.project.id, quoteSha256: hash(canonical(p.quote)),
      files: Object.entries(p.project.files).map(([file, contents]) => ({ file, sha256: hash(contents) })).sort((a, b) => a.file.localeCompare(b.file, "en")), requestBody: p.body, plan: p.plan })) };
  return { corpus, prepared, snapshot, snapshotSha256: hash(canonical(snapshot)) };
}

export async function freezeProjectEvaluation(input: unknown, options: Pick<Options, "env" | "corpusText" | "sourceRoot"> = {}): Promise<ProjectFreeze> {
  const preparation = await prepareProjectEvaluation(input, options);
  return { schema: "proofbeforepay-project-evaluation-freeze-v1", createdAt: new Date().toISOString(), snapshotSha256: preparation.snapshotSha256, snapshot: preparation.snapshot };
}

function citations(value: unknown, packet: Packet): CitationCheck[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    const c = object(entry), file = typeof c?.file === "string" ? c.file : null, excerpt = typeof c?.excerpt === "string" ? c.excerpt : null;
    const source = file !== null && Object.hasOwn(packet.files, file) ? packet.files[file] : null;
    const start = source !== null && excerpt !== null && excerpt.length > 0 && excerpt.length <= 500 ? source.indexOf(excerpt) : -1;
    return { file, excerpt, valid: start >= 0, start: start >= 0 ? start : null, end: start >= 0 ? start + excerpt!.length : null };
  });
}

function reportedUsage(data: unknown, outputLimit: number): Usage | null {
  const u = object(object(data)?.usage);
  if (!u || !Number.isSafeInteger(u.prompt_tokens) || Number(u.prompt_tokens) < 0 || Number(u.prompt_tokens) > 10_000_000
    || !Number.isSafeInteger(u.completion_tokens) || Number(u.completion_tokens) < 0 || Number(u.completion_tokens) > outputLimit
    || (u.total_tokens !== undefined && u.total_tokens !== Number(u.prompt_tokens) + Number(u.completion_tokens))) return null;
  return { promptTokens: Number(u.prompt_tokens), completionTokens: Number(u.completion_tokens) };
}

async function capture(response: Response, packet: Packet): Promise<RawCapture> {
  const reader = response.clone().body?.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0, saved = 0, bodyComplete = true;
  if (reader) while (true) {
    const next = await reader.read(); if (next.done) break;
    bytes += next.value.byteLength;
    const room = 1_000_000 - saved, retained = next.value.subarray(0, Math.max(0, room));
    if (retained.byteLength) { chunks.push(retained); saved += retained.byteLength; }
    if (bytes > 1_000_000) { bodyComplete = false; void reader.cancel().catch(() => {}); break; }
  }
  const retained = new Uint8Array(saved); let offset = 0;
  for (const chunk of chunks) { retained.set(chunk, offset); offset += chunk.byteLength; }
  let text = "", utf8Valid = true;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(retained); } catch { utf8Valid = false; }
  let providerBody: unknown = null, completion: unknown = null;
  if (bodyComplete && utf8Valid) try { providerBody = JSON.parse(text); } catch { /* retain invalid original text */ }
  const root = object(providerBody), choice = Array.isArray(root?.choices) ? object(root.choices[0]) : null;
  const message = object(choice?.message);
  // Retain legacy partial text for historical diagnostics. A tool envelope is
  // decoded only by production's exact-name/count validator, never by taking
  // the first arbitrary tool argument. The raw provider finish remains intact.
  let contentText = typeof message?.content === "string" ? message.content : null;
  let transport: RawCapture["transport"] = contentText !== null ? "legacy_json" : null;
  if (choice?.finish_reason === "tool_calls" || message?.tool_calls !== undefined) {
    contentText = null; transport = null;
    try { const decoded = assessmentCompletionText(providerBody); contentText = decoded.text; transport = decoded.transport; }
    catch { /* Exact original envelope retained, but no trusted tool ID profile. */ }
  }
  const originalContentText = contentText;
  let originalJsonValid:boolean|null = null,contentNormalization:RawCapture["contentNormalization"]="none";
  if (contentText !== null) {
    try {completion=JSON.parse(contentText);originalJsonValid=true;}catch{originalJsonValid=false;}
    if (transport === "strict_tool") try {
      const parsed=assessmentReportJson({text:contentText,transport});completion=parsed.value;contentText=parsed.canonicalText;
      contentNormalization=parsed.repairedTrailingBrace?"one_trailing_brace":"none";
    }catch{/* Original malformed arguments remain in originalContentText and providerBody. */}
  }
  const output = object(completion);
  return { httpStatus: response.status, bodyText: bodyComplete && utf8Valid ? text : null,
    bodyPrefixText: bodyComplete && utf8Valid ? null : new TextDecoder().decode(retained), bodyComplete, bodyUtf8Bytes: bytes, bodyByteCountIsComplete: bodyComplete, utf8Valid, providerBody, contentText, originalContentText, originalJsonValid, contentNormalization, transport, completion,
    items: output?.items ?? null, risks: output?.risks ?? null, limitations: output?.limitations ?? null, finishReason: choice?.finish_reason ?? null, model: root?.model ?? null,
    riskCitationChecks: Array.isArray(output?.risks) ? output.risks.map(risk => citations(object(risk)?.citations, packet)) : [] };
}

/** Diagnostics expose only locked IDs and aggregate counts. Raw upstream
 * strings stay solely in the separately retained synthetic raw response. */
function rawItemDiagnostics(raw:RawCapture|undefined,expectedCriterionIds:string[]):RawItemDiagnostics{
 let contentParsed=false;if(typeof raw?.contentText==="string")try{JSON.parse(raw.contentText);contentParsed=true;}catch{/* Preserve the raw malformed text without deriving an ID profile. */}
 const idProfileParsed=contentParsed&&!!object(raw?.completion)&&Array.isArray(raw?.items),items=idProfileParsed?raw!.items as unknown[]:[],known=new Set(expectedCriterionIds),counts=new Map<string,number>();let unknownCriterionCount=0,invalidItemCount=0;
 for(const item of items){const value=object(item),id=value?.criterionId;if(typeof id==="string"){if(known.has(id))counts.set(id,(counts.get(id)??0)+1);else unknownCriterionCount++;}
  try{requireAssessmentItemCoverage([item],expectedCriterionIds);}catch(error){if(!(error instanceof AssessmentResponseError)||error.reason==="structure")invalidItemCount++;}
 }
 const returnedKnownCriterionIds=expectedCriterionIds.filter(id=>counts.has(id)),missingCriterionIds=idProfileParsed?expectedCriterionIds.filter(id=>!counts.has(id)):[],duplicateCriterionIds=expectedCriterionIds.filter(id=>(counts.get(id)??0)>1),finishReason=raw?.finishReason==="stop"?"stop":raw?.finishReason==="tool_calls"&&raw.transport==="strict_tool"?"tool_calls":raw?.finishReason==="length"?"length":raw?.finishReason===undefined||raw.finishReason===null?"unavailable":"other";
 const profileSource:RawItemDiagnostics["profileSource"]=!idProfileParsed?"unavailable":raw?.contentNormalization==="one_trailing_brace"?"normalized_strict_arguments":"original_json";
 return{expectedCriterionIds:[...expectedCriterionIds],returnedKnownCriterionIds,missingCriterionIds,duplicateCriterionIds,unknownCriterionCount,invalidItemCount,contentParsed,idProfileParsed,profileSource,completeItemCoverage:idProfileParsed&&items.length===expectedCriterionIds.length&&!missingCriterionIds.length&&!duplicateCriterionIds.length&&!unknownCriterionCount&&!invalidItemCount,finishReason};
}
function score(result: ProjectEvaluationResult, packet: Packet) {
  result.rawDiagnostics=rawItemDiagnostics(result.raw,result.criteria.map(row=>row.id));
  const items = Array.isArray(result.raw?.items) ? result.raw.items.map(object) : [];
  for (const row of result.criteria) {
    const matches = items.filter(item => item?.criterionId === row.id), item = matches.length === 1 ? matches[0] : null;
    row.rawStatus = matches.length === 1 && STATUSES.includes(item?.status as EvaluationStatus) ? item!.status as EvaluationStatus : "invalid";
    row.rawCitations = citations(item?.citations, packet);
    row.rawCitationValidity = !Array.isArray(item?.citations) ? "unavailable" : row.rawCitations.some(c => !c.valid) ? "invalid" : row.rawCitations.length ? "valid" : "none";
    const app = result.application?.report?.items.find(item => item.criterionId === row.id);
    row.applicationStatus = app?.status ?? "error";
    row.applicationCitations = app ? citations(app.citations, packet).map((checked, i) => ({ ...checked,
      valid: checked.valid && checked.start === app.citations[i].start && checked.end === app.citations[i].end })) : [];
  }
}

const fraction = (count: number, total: number) => ({ count, total, fraction: total ? count / total : null });
export function summarizeProjectEvaluation(results: ProjectEvaluationResult[]) {
  const layer = (criteria: CriterionResult[], key: "rawStatus" | "applicationStatus") => {
    const defects = criteria.filter(c => c.referenceStatus === "changes_suggested"), clean = criteria.filter(c => c.referenceStatus === "supported"), unknown = criteria.filter(c => c.referenceStatus === "insufficient_evidence");
    return { statusAgreement: fraction(criteria.filter(c => c[key] === c.referenceStatus).length, criteria.length),
      defectDetected: fraction(defects.filter(c => c[key] === "changes_suggested").length, defects.length),
      defectFalsePass: fraction(defects.filter(c => c[key] === "supported").length, defects.length),
      defectConservativeUnknown: fraction(defects.filter(c => c[key] === "insufficient_evidence").length, defects.length),
      falseAlarmOnClean: fraction(clean.filter(c => c[key] === "changes_suggested").length, clean.length),
      unsupportedUnknownOnClean: fraction(clean.filter(c => c[key] === "insufficient_evidence").length, clean.length),
      justifiedUnknown: fraction(unknown.filter(c => c[key] === "insufficient_evidence").length, unknown.length),
      unsupportedRuntimeAssurance: fraction(unknown.filter(c => c[key] === "supported").length, unknown.length),
      confusion: Object.fromEntries(STATUSES.map(expected => [expected, Object.fromEntries([...STATUSES, "invalid", "error"].map(actual => [actual,
        criteria.filter(c => c.referenceStatus === expected && c[key] === actual).length]))])) };
  };
  const group = (selected: ProjectEvaluationResult[]) => {
    const attempted = selected.filter(p => p.attempted), criteria = attempted.flatMap(p => p.criteria), rawChecks = criteria.flatMap(c => c.rawCitations), appChecks = criteria.flatMap(c => c.applicationCitations);
    const profiles=attempted.flatMap(p=>p.rawDiagnostics?.idProfileParsed?[p.rawDiagnostics]:[]);
    const times = attempted.map(p => p.elapsedMilliseconds ?? 0).sort((a, b) => a - b);
    return { plannedProjects: selected.length, plannedCriteria: selected.reduce((n, p) => n + p.criteria.length, 0), attemptedProjects: attempted.length, attemptedCriteria: criteria.length,
      raw: layer(criteria, "rawStatus"), application: layer(criteria, "applicationStatus"),
      applicationRejectedProjects: attempted.filter(p => !p.application?.accepted).length,
      rawItemStructure:{attemptedProjects:attempted.length,contentParsedProjects:attempted.filter(p=>p.rawDiagnostics?.contentParsed).length,parsedIdProfileProjects:profiles.length,
        // Historical keys are retained for readers; both normal legacy stop and
        // validated strict tool_calls are complete finishes, never relabelled.
        firstStoppedCompleteItemProjects:fraction(profiles.filter(p=>p.completeItemCoverage&&["stop","tool_calls"].includes(p.finishReason)).length,attempted.length),
        firstCompletedItemProjects:fraction(profiles.filter(p=>p.completeItemCoverage&&["stop","tool_calls"].includes(p.finishReason)).length,attempted.length),
        completeItemCoverageAmongParsedIdProfiles:fraction(profiles.filter(p=>p.completeItemCoverage).length,profiles.length),completeStoppedItemCoverageAmongParsedIdProfiles:fraction(profiles.filter(p=>p.completeItemCoverage&&["stop","tool_calls"].includes(p.finishReason)).length,profiles.length),
        strictToolResponseProjects:attempted.filter(p=>p.raw?.transport==="strict_tool").length,
        legacyJsonResponseProjects:attempted.filter(p=>p.raw?.transport==="legacy_json").length,
        syntaxNormalizedProjects:attempted.filter(p=>p.raw?.contentNormalization==="one_trailing_brace").length,
        normalizedIdProfileProjects:profiles.filter(p=>p.profileSource==="normalized_strict_arguments").length,
        originalIdProfileProjects:profiles.filter(p=>p.profileSource==="original_json").length,
        missingItemProjectsAmongParsedIdProfiles:fraction(profiles.filter(p=>p.missingCriterionIds.length>0).length,profiles.length),duplicateItemProjectsAmongParsedIdProfiles:fraction(profiles.filter(p=>p.duplicateCriterionIds.length>0).length,profiles.length),
        unknownIdProjectsAmongParsedIdProfiles:fraction(profiles.filter(p=>p.unknownCriterionCount>0).length,profiles.length),invalidItemProjectsAmongParsedIdProfiles:fraction(profiles.filter(p=>p.invalidItemCount>0).length,profiles.length),
        unparsedIdProfileProjects:attempted.length-profiles.length,outputLimitedProjects:attempted.filter(p=>p.rawDiagnostics?.finishReason==="length").length},
      applicationFailureReasons:Object.fromEntries(["structure","output_limit","incomplete","citation","missing_items","duplicate_items","unknown_items","risk_fields","generic"].map(reason=>[reason,attempted.filter(p=>!p.application?.accepted&&(p.application?.failureReason??"generic")===reason).length])),
      rawExactCitations: fraction(rawChecks.filter(c => c.valid).length, rawChecks.length), applicationExactCitationsAndOffsets: fraction(appChecks.filter(c => c.valid).length, appChecks.length),
      pendingSemanticCriterionReviews: criteria.length, pendingWholeAnswerReviews: attempted.length,
      latency: { samples: times.length, meanMilliseconds: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
        p50Milliseconds: times.length ? times[Math.ceil(times.length * .5) - 1] : null, p95Milliseconds: times.length ? times[Math.ceil(times.length * .95) - 1] : null } };
  };
  return { overall: group(results), byStratum: Object.fromEntries(STRATA.map(s => [s, group(results.filter(p => p.stratum === s))])) };
}

export async function runProjectEvaluation(input: unknown, options: Options = {}) {
  if (options.live && (!Number.isSafeInteger(options.maxCalls) || options.maxCalls! < 1 || options.maxCalls! > 12 || !Number.isFinite(options.maxUsd)
    || options.maxUsd! <= 0 || options.maxUsd! > 1 || !options.env?.DEEPSEEK_API_KEY?.trim())) throw new Error("Live mode requires a process API key, explicit maxCalls 1–12 and maxUsd >0 and <=1.");
  const preparation = await prepareProjectEvaluation(input, options);
  if (options.live && (!options.frozen || options.frozen.schema !== "proofbeforepay-project-evaluation-freeze-v1"
    || options.frozen.snapshotSha256 !== hash(canonical(options.frozen.snapshot)) || options.frozen.snapshotSha256 !== preparation.snapshotSha256
    || canonical(options.frozen.snapshot) !== canonical(preparation.snapshot))) throw new Error("Frozen corpus, request or working-tree implementation changed before live I/O.");
  const results: ProjectEvaluationResult[] = preparation.prepared.map(p => ({ id: p.project.id, stratum: p.project.stratum,
    reference: p.project.criteria.map(c => ({ criterionId: c.id, label: c.reference })), plan: p.plan, attempted: false, networkAttempted: false,
    criteria: p.project.criteria.map(c => ({ id: c.id, referenceStatus: c.reference.expectedStatus, rawStatus: "not_attempted", applicationStatus: "not_attempted",
      rawCitations: [], applicationCitations: [], rawCitationValidity: "unavailable", semanticReview: "pending_independent_adjudication" })), wholeAnswerSemanticReview: "pending_independent_adjudication" }));
  let calls = 0, reportedCost = 0, unknownUsageReservedUsd = 0, stopReason = options.live ? "all_projects_completed" : "dry_run_no_provider_calls";
  if (options.live) for (const [i, p] of preparation.prepared.entries()) {
    if (calls >= options.maxCalls!) { stopReason = "max_calls_reached"; break; }
    if (reportedCost + p.plan.reservedCostUsd > options.maxUsd! + 1e-12) { stopReason = "budget_reservation_rejected"; break; }
    const result = results[i], began = performance.now(), originalQuote = canonical(p.quote);
    const wrapped: Fetcher = async (url, init) => {
      if (String(url) !== "https://api.deepseek.com/beta/chat/completions" || hash(String(init?.body ?? "")) !== p.plan.requestSha256 || result.networkAttempted) throw new Error("Unexpected or repeated evaluation request.");
      result.attempted = true; result.networkAttempted = true; calls++;
      const response = await (options.fetcher ?? fetch)(url, init);
      result.raw = await capture(response, p.packet); result.usage = reportedUsage(result.raw.providerBody, p.plan.outputTokenLimit);
      result.reportedUsageCostUsd = result.usage ? cost(result.usage) : null;
      result.usageExceededReservation = !!result.usage && result.usage.promptTokens > p.plan.promptTokenUpperEstimate;
      if (!result.raw.bodyComplete || !result.raw.utf8Valid) {
        // Never give the application's parser an oversized/invalid byte stream.
        // Both cloned branches are cancelled; no usage is inferred from a prefix.
        void response.body?.cancel().catch(() => {});
        throw new Error("Provider body exceeded the bounded capture contract.");
      }
      return response;
    };
    try { const report = await assessDelivery(p.quote, { DEEPSEEK_API_KEY: options.env!.DEEPSEEK_API_KEY, DEEPSEEK_MODEL: preparation.snapshot.model }, wrapped);
      result.application = { accepted: true, report, error: null };
    } catch(error) { result.application = error instanceof AssessmentResponseError?{accepted:false,report:null,error:error.reason,failureReason:error.reason,...(error.coverage?{coverageDiagnostic:structuredClone(error.coverage)}:{})}:{ accepted: false, report: null, error: "application_rejected_or_provider_failed" }; }
    result.elapsedMilliseconds = Math.round(performance.now() - began);
    if (canonical(p.quote) !== originalQuote) throw new Error("Assessment mutated the synthetic workflow fixture.");
    if (result.attempted) score(result, p.packet);
    if (!result.networkAttempted) stopReason = "application_rejected_before_network";
    else if (!result.usage) { unknownUsageReservedUsd += p.plan.reservedCostUsd; stopReason = "unknown_usage_stop"; }
    else {
      reportedCost += result.reportedUsageCostUsd!;
      if (result.usageExceededReservation || reportedCost > options.maxUsd! + 1e-12) stopReason = "usage_exceeded_conservative_estimate";
      else if (result.raw!.httpStatus < 200 || result.raw!.httpStatus >= 300) stopReason = "provider_http_error";
    }
    // A caller may persist each completed attempt before the next call. A failed
    // persistence callback throws and prevents further spending; never retry.
    if (options.onResult) await options.onResult(structuredClone(result));
    if (stopReason !== "all_projects_completed") break;
  }
  return { schema: "proofbeforepay-project-evaluation-report-v1", generatedAt: new Date().toISOString(), mode: options.live ? "live" : "dry-run",
    cohort: preparation.corpus.cohort, model: preparation.snapshot.model, freezeSha256: preparation.snapshotSha256, snapshot: preparation.snapshot,
    pricing: PROJECT_EVALUATION_PRICE, limits: { maxCalls: options.live ? options.maxCalls : 0, maxUsd: options.live ? options.maxUsd : 0, automaticRetries: 0, timeoutMilliseconds: 30000, maxResponseBytes: 1_000_000 },
    accounting: { calls, reportedUsageCostUsd: reportedCost, unknownUsageReservedUsd, stopReason }, summary: summarizeProjectEvaluation(results), results,
    measurementNotes: ["Authored evaluation tasks; upstream or synthetic file provenance belongs to the corpus and companion provenance, not a customer deployment or human usability study.", "Reference labels never enter provider requests; freeze covers exact corpus, requests and working-tree source before live I/O.",
      "Provider envelopes, original argument text and originalJsonValid are retained. A bounded one-brace normalization has explicit contentNormalization and rawDiagnostics.profileSource=normalized_strict_arguments; original and normalized ID profiles are counted separately. Complete-finish totals include marked normalized profiles, not a claim that the original JSON or provider strict schema was valid.",
      "This assessment layer evaluates only the declared custom manual/coverage criteria, not the additional page/mobile checks from the full product intake or an end-to-end user task. New checklist shapes use the real five-manual/twelve-coverage intake; historical two-manual packets retain their prior shape.",
      "Raw item-coverage rates use attempted projects with a parsed items array. Unparsed/no-response attempts are counted separately and remain in the all-attempt status denominators. Complete ID coverage does not establish citation entailment, full response validity or semantic correctness; multiple structural issue categories can apply to one response.",
      "Raw model status and application policy output are separate measurements. Application-forced unknown is not model abstention.",
      "Exact substring/UTF-16 offset checks do not establish semantic entailment. All criterion explanations, extra risks and limitations require separate independent adjudication, labelled AI or human honestly.",
      "This small authored cohort is not a general accuracy estimate. Revising prompts after seeing it makes it development evidence, not unseen validation.",
      "Missing or invalid usage and network ambiguity stop all further calls; the reservation remains an estimate, not an invoice or hard provider spending cap.",
      "No buyer decision, quote, database, acceptance or payment is changed. Complete supported HTML/CSS source is supplied; no browser/backend is run and raster pixels are excluded."] };
}

async function main(args: string[]) {
  const flags = new Map<string, string>(); let live = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--live") { if (live) throw new Error("Duplicate live flag."); live = true; continue; }
    if (!["--output", "--freeze", "--frozen", "--max-calls", "--max-usd", "--corpus"].includes(args[i]) || flags.has(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Invalid arguments.");
    flags.set(args[i], args[++i]);
  }
  const output = flags.get("--output"), freezePath = flags.get("--freeze"), frozenPath = flags.get("--frozen");
  if (!output || !path.isAbsolute(output) || !output.endsWith(".json") || (freezePath && (!path.isAbsolute(freezePath) || !freezePath.endsWith(".json")))
    || (live && (!frozenPath || freezePath)) || (!live && frozenPath)) throw new Error("Use absolute new JSON outputs; freeze in dry-run mode and supply --frozen for live mode.");
  if (!(await stat(path.dirname(output))).isDirectory()) throw new Error("Output directory missing.");
  // Reserve the report path before any provider I/O, so an existing output can
  // never consume tokens and fail only after the calls have finished.
  await writeFile(output, JSON.stringify({ state: "preparing", live }) + "\n", { flag: "wx", mode: 0o600 });
  const corpusPath = flags.get("--corpus") ?? path.join(ROOT, "scripts/assessment-project-corpus-2026-11-04.json");
  const corpusText = await readFile(corpusPath, "utf8"), corpus: unknown = JSON.parse(corpusText);
  const options: Options = { corpusText, env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL } };
  const validCorpus = validateProjectCorpus(corpus);
  // A previous orphan attempt must be discovered before spending. Retain wx in
  // the callback as protection against concurrent filesystem changes.
  for (const p of validCorpus.projects) {
    try { await lstat(`${output}.attempt-${p.id}.json`); throw new Error("Attempt output already exists."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  if (freezePath) await writeFile(freezePath, JSON.stringify(await freezeProjectEvaluation(corpus, options), null, 2) + "\n", { flag: "wx", mode: 0o600 });
  if (live) options.frozen = JSON.parse(await readFile(frozenPath!, "utf8")) as ProjectFreeze;
  const report = await runProjectEvaluation(corpus, { ...options, live, maxCalls: Number(flags.get("--max-calls")), maxUsd: Number(flags.get("--max-usd")),
    onResult: async result => { await writeFile(`${output}.attempt-${result.id}.json`, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 }); } });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ output, freezeSha256: report.freezeSha256, ...report.accounting }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error("Project evaluation stopped. Review bounded arguments, freeze/source match and new output paths; no provider diagnostics or secrets are printed."); process.exitCode = 1; });
}
