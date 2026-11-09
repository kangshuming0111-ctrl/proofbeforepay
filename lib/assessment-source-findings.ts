import type {Language, ProofAssessment, ProofAssessmentCitation, ProofAssessmentSourceFinding, ProofBusinessCheckStep, ProofCriterion} from "./contracts.ts";
import {assessmentEvidenceScope, assessmentObservationExplanation} from "./assessment-evidence-scope.ts";
import {createIndependentLabelSourceFactsCheck} from "./assessment-label-citations.ts";
import {createIndependentSourceBusinessFactCheck, sourceBusinessEvidenceExplanation} from "./source-business-evidence.ts";
import {parseSourceLiteralDirective} from "./source-literal-directive.ts";
import {createMenuDomSourceBusinessFactCheckV2} from "./menu-dom-source-v2.ts";
import {createMenuDomSourceBusinessFactCheckV3} from "./menu-dom-source-v3.ts";
import {isOriginalBilingualMenuPriceStep} from "./assessment-requirement-completeness.ts";

export type SourcePublicationSchema=NonNullable<ProofAssessment["publicationPolicy"]>["schema"];
export function sourceFindingVersionForPublication(schema:SourcePublicationSchema="source-publication-v1"):ProofAssessmentSourceFinding["version"]{
  if(schema==="source-publication-v1")return"source-finding-v1";
  if(schema==="source-publication-v2")return"source-finding-v2";
  if(schema==="source-publication-v3")return"source-finding-v3";
  throw new TypeError("Unsupported source publication schema.");
}

/** A projection of the validated scope-domain context, never client authority. */
export type SourceFindingScope = {
  states: readonly {criterionId: string; status: "none" | "pending" | "confirmed" | "unavailable"}[];
  bindings: readonly {proposalId: string; proposalDigest: string; criterionId: string; criterionSource: string; file: string; kind: "page" | "form"; formId?: string}[];
};
export type SourceFindingInputs = {
  files: Record<string, string>; coverage: ProofAssessment["coverage"]; language: Language;
  businessSteps: readonly ProofBusinessCheckStep[]; scope?: SourceFindingScope;
  version?: ProofAssessmentSourceFinding["version"];
};
const uniqueCitations = (citations: ProofAssessmentCitation[]) => citations.filter((c, i, all) => all.findIndex(other => other.file === c.file && other.start === c.start && other.end === c.end && other.excerpt === c.excerpt) === i);

/** Independent source facts; no model text or status enters this function.
 * Recognised finite families only. A source success never establishes rendered
 * visibility, operation, acceptance or payment. Export replay uses this same seam. */
export function createAssessmentSourceFindingCheck(input: SourceFindingInputs) {
  const {language} = input, zh = language === "zh", files = {...input.files};
  const version=input.version??"source-finding-v1";
  if(version!=="source-finding-v1"&&version!=="source-finding-v2"&&version!=="source-finding-v3")throw new TypeError("Unsupported source finding version.");
  const coverage=structuredClone(input.coverage);
  const scope = input.scope ? structuredClone(input.scope) : undefined;
  const readBusiness = version === "source-finding-v3" ? createMenuDomSourceBusinessFactCheckV3
    : version === "source-finding-v2" ? createMenuDomSourceBusinessFactCheckV2
    : createIndependentSourceBusinessFactCheck;
  const business = readBusiness(files, input.businessSteps);
  const labels = createIndependentLabelSourceFactsCheck(files, input.coverage);
  return (criterion: ProofCriterion): ProofAssessmentSourceFinding | undefined => {
    const labelDirective = parseSourceLiteralDirective(criterion.source)?.kind === "html_labels";
    const prices = business(criterion.id);
    if (!labelDirective && prices.kind === "not_applicable") return;
    const basis = prices.kind !== "not_applicable" ? "locked_business_values" : "declared_html_labels";
    const candidates = scope?.bindings.filter(b => b.criterionId === criterion.id && b.criterionSource === criterion.source) ?? [];
    const binding = candidates.length === 1 ? candidates[0] : undefined;
    const bindingRef = binding ? {proposalId: binding.proposalId, proposalDigest: binding.proposalDigest, file: binding.file, kind: binding.kind, ...(binding.formId !== undefined ? {formId: binding.formId} : {})} : undefined;
    const scopedFiles = (binding ? [binding.file] : prices.kind !== "not_applicable" ? [...new Set(prices.checks.map(c => c.file))] : Object.keys(files).filter(file => /\.html$/iu.test(file)).sort()).filter(file => Object.hasOwn(files, file));
    const result = (status: ProofAssessmentSourceFinding["status"], explanation: string, citations: ProofAssessmentCitation[] = []): ProofAssessmentSourceFinding => ({version, status, basis, explanation, citations, files: scopedFiles, ...(bindingRef ? {scopeBinding: bindingRef} : {})});
    const observation = assessmentEvidenceScope(criterion);
    if (observation.category === "requires_observation") return result("insufficient_evidence", assessmentObservationExplanation(observation, language));
    const state = scope?.states.find(s => s.criterionId === criterion.id);
    if (candidates.length > 1 || state && state.status !== "none" && (state.status !== "confirmed" || !binding)) return result("insufficient_evidence", zh
      ? "这条要求的页面或表单范围尚未形成当前有效的双方确认。请先确认同一提案和当前目标，再按该范围复检；未把任何页面猜作业务页面。"
      : "This requirement has no current effective two-sided page/form confirmation. Confirm the same proposal and current target, then recheck within that scope. No business-page identity was guessed.");
    if (prices.kind !== "not_applicable") {
      if (binding && prices.checks.some(c => c.file !== binding.file)) return result("insufficient_evidence", zh
        ? "已确认范围与原有买家锁定的业务检查文件冲突，需双方澄清；系统没有擅自选择一方。"
        : "The confirmed scope conflicts with the buyer-locked business-check file. Clarification is required; the system did not choose one silently.");
      if(version!=="source-finding-v1"&&prices.checks.some(check=>!coverage.includedFiles.includes(check.file)||coverage.omittedFiles.includes(check.file)||coverage.truncatedFiles.includes(check.file)))return result("insufficient_evidence",zh
        ?"买家锁定目标文件的源码文本未完整提供；不能从已提供的片段确认整页唯一的菜名与价格关联。请补齐该目标的完整源码后复检。"
        :"The buyer-locked target source is incomplete. A supplied fragment cannot establish the whole file's unique item/price ownership. Supply the complete target source and recheck.");
      const citations = uniqueCitations(prices.checks.flatMap(c => c.citation ? [c.citation] : []));
      if (citations.length > 8) return result("insufficient_evidence", zh ? "完整源码事实超出保存引用额度，需逐项核查。" : "The complete source facts exceed the retained citation budget; inspect each check separately.");
      const status = prices.kind === "unchanged" ? "supported" : prices.kind === "mismatch" ? "changes_suggested" : "insufficient_evidence";
      if (input.businessSteps.some(step => step.criterionId === criterion.id && isOriginalBilingualMenuPriceStep(step)) &&
        prices.checks.length === 2 && prices.checks.every(check => check.kind !== "unknown" && check.label && check.actual && check.expected)) {
        const observed = prices.checks.map(check => zh
          ? `「${check.label}」为 ${check.actual}（约定 ${check.expected}）`
          : `"${check.label}" is ${check.actual} (agreed ${check.expected})`).join(zh ? "，" : ", and ");
        return result(status, zh
          ? `在 ${prices.checks[0].file} 的两处完整源码段中，${observed}。买家可在当前版预览核对页面上的实际显示。`
          : `In the two complete source blocks of ${prices.checks[0].file}, ${observed}. The buyer can inspect the rendered prices in the current preview.`, citations);
      }
      return result(status, prices.kind === "unchanged" ? zh
        ? `独立源码检查已在买家锁定的文件和对应对象内核对全部 ${prices.checks.length} 个业务值；对应内容与已确认业务值一致；价格检查按同一币种和最小货币单位金额核对，而非金额的字符格式。这是有限源码事实，不证明浏览器可见或运行保存；原始 AI 判断另行保留。`
        : `Independent source inspection matched all ${prices.checks.length} buyer-locked values to their exact files and subjects. Numeric formatting differences with the same currency and minor-unit amount are equivalent. This is a limited source fact, not rendered visibility or operation/persistence. The original AI judgment is retained separately.`
        : sourceBusinessEvidenceExplanation(prices, language), citations);
    }
    const fact = labels(criterion, binding);
    if (fact.kind === "not_applicable") return;
    if (fact.kind === "unknown") return result("insufficient_evidence", zh
      ? "当前完整源码、解析或标签所属范围不足以证明这组源码标签符合或缺失。请补齐源码并核对范围；缺少模型引用不等于缺少字段，未观察可见性或运行。"
      : "The complete source, parse or label ownership does not establish this source-label group as present or absent. Complete the source and verify scope. Missing model citations do not mean missing fields; visibility and operation were not observed.");
    const context = fact.context === "form" ? zh ? "表单" : "form" : zh ? "页面" : "page";
    const scopeNote = binding ? zh ? `检查范围来自双方确认的 ${binding.file}${binding.formId ? ` / ${binding.formId}` : ""}。` : `The checked scope is the two-sided confirmed ${binding.file}${binding.formId ? ` / ${binding.formId}` : ""}.`
      : zh ? "文件是实际检查位置，业务页面身份尚未确认；给具体页面下修改指令前应先澄清范围。" : "Files are inspected locations; their business-page identity remains unconfirmed. Clarify scope before directing edits to a page.";
    return result(fact.kind === "declared" ? "supported" : "changes_suggested", zh
      ? `${fact.kind === "declared" ? "独立源码检查在同一" + context + "见证了全部" : "已完整检查范围内的 HTML，没有任何单一" + context + "包含全部"} ${fact.labelCount} 个要求的标签文字声明。${scopeNote}这是源码事实，不证明渲染可见、表单运行或持久保存；原始 AI 判断另行保留。`
      : `${fact.kind === "declared" ? "Independent source inspection witnesses all" : "Complete HTML inspection found no single " + context + " containing all"} ${fact.labelCount} required declared label texts${fact.kind === "declared" ? " in one " + context : ""}. ${scopeNote} This is a source fact, not proof of rendered visibility, form operation or persistence. The original AI judgment is retained separately.`, fact.citations);
  };
}
