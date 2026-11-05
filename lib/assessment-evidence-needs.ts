import type {Language, ProofEvidenceNeed} from "./contracts.ts";
import {staticFileKind} from "./static-resources.ts";

export const ASSESSMENT_EVIDENCE_NEED_REASONS = ["browser_observation", "direct_observation", "financial_execution", "record_readback", "requirement_clarification", "manual_interpretation", "page_scope", "page_citations", "field_relationship", "source_ambiguity", "no_citations", "model_unresolved"] as const satisfies readonly ProofEvidenceNeed["reason"][];
const PATH = /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,63}\/){0,4}[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

/** Presentation accepts old/untrusted saved shapes without guessing a cause.
 * Export validation separately rejects invalid metadata and checks membership
 * in that delivery's actual files; this does not repair or persist a payload. */
export function isAssessmentEvidenceNeed(value: unknown): value is ProofEvidenceNeed {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 3 || keys.some(key => typeof key !== "string" || !["schema", "reason", "targetFiles"].includes(key) || !("value" in Object.getOwnPropertyDescriptor(value, key)!))) return false;
  const row = value as Record<string, unknown>;
  if (row.schema !== "source-evidence-need-v1" || typeof row.reason !== "string"
    || !(ASSESSMENT_EVIDENCE_NEED_REASONS as readonly string[]).includes(row.reason) || !Array.isArray(row.targetFiles) || row.targetFiles.length > 40) return false;
  const targets = row.targetFiles;
  if (Reflect.ownKeys(targets).length !== targets.length + 1) return false;
  const files: string[] = [];
  for (let index = 0; index < targets.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(targets, String(index));
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") return false;
    const file = descriptor.value as string;
    if (file.length > 300 || !PATH.test(file) || !["html", "css"].includes(staticFileKind(file) ?? "")) return false;
    files.push(file);
  }
  return new Set(files).size === files.length;
}

/** Called only from an actual server guard branch. Keep exact provided keys,
 * never normalize an alias or infer a file from model wording/page roles. */
export function makeAssessmentEvidenceNeed(reason: ProofEvidenceNeed["reason"], candidates: readonly string[], sent: Record<string, string>): ProofEvidenceNeed {
  return {schema: "source-evidence-need-v1", reason, targetFiles: [...new Set(candidates)].filter(file => Object.hasOwn(sent, file)
    && file.length <= 300 && PATH.test(file) && ["html", "css"].includes(staticFileKind(file) ?? ""))};
}

const COPY: Record<ProofEvidenceNeed["reason"], {zh: [string, string]; en: [string, string]}> = {
  browser_observation: {zh: ["需要浏览器实际观察", "卖家补充对应页面的浏览器观察记录，买家核对要求的视口与操作；源码不能证明手机体验。"], en: ["Browser observation needed", "Provide browser observations for the required viewport and actions; the buyer reviews them against the locked wording."]},
  direct_observation: {zh: ["需要运行或人工核对", "卖家补充可复查的运行或人工观察证据，买家按完整要求核对；不把源码描述当作操作成功。"], en: ["Direct observation needed", "Provide inspectable execution or human-observation evidence; the buyer checks the full requirement, without assuming source proves operation."]},
  financial_execution: {zh: ["需要资金操作证据", "核对已有、经明确授权的 Sandbox／测试执行结果及对应交易记录；此补证请求不发起新的付款或退款。"], en: ["Transaction evidence needed", "Inspect existing, explicitly authorized Sandbox/test results and matching transaction records. This request starts no new payment or refund."]},
  record_readback: {zh: ["需要写入与独立回读证据", "核对已有、经授权测试的写入及所需重载或重启后的独立回读记录，买家确认同一条数据。若同项还要求邮件送达或其他操作，也须分别核对相应执行证据；不自动执行。"], en: ["Independent record readback needed", "Inspect existing authorized-test write and independent readback records after the required reload or restart. Also check separate execution evidence for email delivery or other operations if the same locked requirement includes them; no action runs automatically."]},
  requirement_clarification: {zh: ["需要澄清如何核对要求", "双方先对照完整锁定原文，确认需补哪类证据；本提示不重写约定，也不要求添加合同。"], en: ["Evidence scope needs clarification", "Review the complete locked wording together and agree what evidence is needed. This does not rewrite scope or require a contract."]},
  manual_interpretation: {zh: ["需要买家核对文字含义", "请买家对照完整要求与原文核对标点或表述含义；不能仅凭尚未证实的文字差异要求返工。"], en: ["Buyer interpretation needed", "The buyer should compare the complete requirement and source wording; an unestablished punctuation difference alone is not a repair demand."]},
  page_scope: {zh: ["页面范围尚未确认", "双方核对要求对应的确切文件名与页面范围，再补逐页证据；不凭主页等别名猜测文件。"], en: ["Page scope is unconfirmed", "Confirm the exact file-to-requirement scope together, then provide per-page evidence. Do not infer files from page-role aliases."]},
  page_citations: {zh: ["逐页来源证据尚不完整", "卖家补充每个指定页面对应内容的完整源码证据，买家逐页核对；单页正确不能替代其他页。"], en: ["Per-page source evidence is incomplete", "Provide complete source evidence for every specified page; the buyer checks each page rather than substituting one correct page."]},
  field_relationship: {zh: ["字段或内容块关联未见证", "补充同一页面、表单或内容块内的完整关联与引用，由买家核对；相邻字段或相同价格不能替代。"], en: ["The field relationship is not witnessed", "Provide the complete same-page, form or content-block relationship and citations for buyer review; neighboring fields cannot substitute."]},
  source_ambiguity: {zh: ["源码来源或结构仍不确定", "查看锁定要求与当前交付，补完整关联来源或人工观察记录；复杂或动态源码不等于交付内容缺失。"], en: ["Source structure or origin is uncertain", "Review the current delivery and add complete source relationships or human observations; complex or dynamic source does not prove content is missing."]},
  no_citations: {zh: ["没有可核对的源码引用", "卖家补充当前交付中对应要求的可核对源码证据，买家确认其页面与内容；暂不能判通过或返工。"], en: ["No verifiable source citation", "Provide inspectable source evidence from the current delivery for buyer review; neither compliance nor a change request is established."]},
  model_unresolved: {zh: ["模型尚未建立结论", "对照完整要求检查现有证据，双方补充或人工核对；系统没有从模型说明猜测更具体的原因。"], en: ["The model did not establish a conclusion", "Review the full requirement and available evidence together. No more specific cause is inferred from the model's explanation."]},
};

/** Shared bounded UI/draft wording. No model prose, mutation or automatic
 * action is an input; a legacy/invalid shape gets a truthful generic fallback. */
export function assessmentEvidenceNeedPresentation(value: unknown, language: Language): {reason: string; nextStep: string; targetFiles: string[]; legacy: boolean} {
  if (!isAssessmentEvidenceNeed(value)) return language === "zh"
    ? {reason: "此报告未记录结构化补证原因", nextStep: "查看完整锁定要求与保存说明，双方补充可复查证据；不能从旧说明推断具体检查原因。", targetFiles: [], legacy: true}
    : {reason: "No structured evidence-needed reason was recorded", nextStep: "Inspect the complete locked wording and saved explanation, then request inspectable evidence. Do not infer a cause from historical prose.", targetFiles: [], legacy: true};
  const [reason, nextStep] = COPY[value.reason][language];
  return {reason, nextStep, targetFiles: [...value.targetFiles], legacy: false};
}
