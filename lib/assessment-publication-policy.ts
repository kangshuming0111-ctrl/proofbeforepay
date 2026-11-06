import type {Language, ProofAssessment, ProofAssessmentItem, ProofAssessmentWithheldRisks, ProofCriterion} from "./contracts.ts";
import {assertStaticPath, staticFileKind} from "./static-resources.ts";
import {createSourcePresenceEvidenceCheck} from "./source-presence-evidence.ts";
import {assessmentEvidenceScope} from "./assessment-evidence-scope.ts";

/** Independently re-derive this finite scope from exact locked criteria and
 * matching item identities; a caller/model boolean is never an authority. */
function htmlPath(value: string): boolean {try {return assertStaticPath(value) === value && staticFileKind(value) === "html";} catch {return false;}}
function structuralCriterion(criterion: ProofCriterion): boolean {
  if (criterion.id === "mobile") return ["All delivered pages must be usable on a mobile screen; a person must check them directly.", "所有交付页面都必须能在手机屏幕上正常使用；必须由人实际检查。"].includes(criterion.source);
  if (/^page-(?:[1-9]|10)$/u.test(criterion.id)) {
    const page = /^Deliver (\S+) as a separate nonempty HTML document with an HTML doctype, a nonempty title and a body\.$/u.exec(criterion.source)
      ?? /^交付独立非空 HTML 文档 ([^，\s]+)，包含 HTML doctype、非空 title 与 body。$/u.exec(criterion.source);
    return !!page && htmlPath(page[1]);
  }
  if (/^link(?:-[2-5])?$/u.test(criterion.id)) {
    const link = /^(\S+) contains a link labelled “([^\r\n]{1,120})” pointing to (\S+)\.$/u.exec(criterion.source)
      ?? /^([^\s]+) 包含文字为“([^\r\n]{1,120})”的链接，指向 ([^\s]+)。$/u.exec(criterion.source);
    if (!link || !htmlPath(link[1])) return false;
    const target = /^([^#]+\.html)(?:#[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127})?$/iu.exec(link[3]);
    return !!target && htmlPath(target[1]);
  }
  return false;
}
/** Only named production structural criteria may accompany the explicit
 * contact-copy subset. Ignoring another custom obligation would be a scope bug.
 * This does not establish that any structural or content item passed. */
export function finiteContactPresenceScopeCriterionIds(criteria: readonly ProofCriterion[] | undefined, items: readonly Pick<ProofAssessmentItem, "criterionId">[], files: Record<string, string>): string[] | undefined {
  if (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 33 || criteria.length !== items.length
    || new Set(criteria.map(criterion => criterion?.id)).size !== criteria.length) return;
  const check = createSourcePresenceEvidenceCheck(files);
  const ids: string[] = [];
  for (const [index, criterion] of criteria.entries()) {
    if (!criterion || typeof criterion.id !== "string" || criterion.id !== items[index]?.criterionId || typeof criterion.source !== "string" || criterion.source.length > 3000) return;
    if (/^(?:manual-[1-5]|coverage-(?:[1-9]|1[0-2]))$/u.test(criterion.id)) {
      if (check(criterion).kind === "not_applicable") return;
      ids.push(criterion.id);
    } else if (!structuralCriterion(criterion)) return;
  }
  return ids.length ? ids : undefined;
}

export type ObservationScopeContext={hasBusinessChecks:boolean};
/** A separate, fail-closed scope. Only explicit server-derived context may
 * enable v3; absent context preserves all legacy caller behavior. This does
 * not identify a defect, associate each optional lead with a criterion, or
 * establish that any page/mobile requirement passed. */
export function observationOnlyCustomScopeCriterionIds(
 criteria:readonly ProofCriterion[]|undefined,
 items:readonly Pick<ProofAssessmentItem,'criterionId'|'status'>[],
 context?:ObservationScopeContext,
):string[]|undefined{
 if(!context||typeof context!=='object'||Array.isArray(context)||Object.keys(context).length!==1
  ||!Object.hasOwn(context,'hasBusinessChecks')||!('value'in Object.getOwnPropertyDescriptor(context,'hasBusinessChecks')!)
  ||context.hasBusinessChecks!==false)return;
 if(!Array.isArray(criteria)||!Array.isArray(items)||criteria.length<1||criteria.length>33||criteria.length!==items.length
  ||new Set(criteria.map(c=>c?.id)).size!==criteria.length)return;
 const ids:string[]=[];
 for(const [index,criterion]of criteria.entries()){
  const item=items[index];
  if(!criterion||typeof criterion.id!=='string'||typeof criterion.title!=='string'||!criterion.title.trim()||criterion.title.length>500
   ||typeof criterion.source!=='string'||!criterion.source.trim()||criterion.source.length>3000||criterion.id!==item?.criterionId
   ||!['supported','changes_suggested','insufficient_evidence'].includes(item.status))return;
  if(/^(?:manual-[1-5]|coverage-(?:[1-9]|1[0-2]))$/u.test(criterion.id)){
   if(item.status!=='insufficient_evidence'||assessmentEvidenceScope(criterion).category!=='requires_observation')return;
   ids.push(criterion.id);
  }else if(!(criterion.id==='mobile'||/^page-(?:[1-9]|10)$/u.test(criterion.id))||!structuralCriterion(criterion))return;
 }
 return ids.length?ids:undefined;
}

/** Semantic publication policy, after the caller has validated every model
 * item/risk field and exact citation. This is not malformed-response recovery:
 * it never supplies a missing risk field or relaxes an earlier rejection.
 * Model limitation prose is intentionally unavailable here: only its count may
 * inform a fixed system note, never become a verified detection fact. */
export function publishSourceAssessmentNotes(
  language: Language,
  items: readonly ProofAssessmentItem[],
  originalStatuses: ReadonlyMap<string, string>,
  risks: ProofAssessment["risks"],
  modelLimitationCount: number,
  files: Record<string, string>,
  criteria?: readonly ProofCriterion[],
  observationContext?:ObservationScopeContext,
): {risks: ProofAssessment["risks"]; limitations: string[]; statusAdjustedCount: number; withheldRisks?: ProofAssessmentWithheldRisks} {
  if (!Number.isSafeInteger(modelLimitationCount) || modelLimitationCount < 0) throw new TypeError("Source publication needs a nonnegative model-limitation count.");
  if (risks.length > 5) throw new TypeError("Source publication needs at most five validated optional risks.");
  const counts = {html: 0, css: 0, raster: 0};
  for (const file of Object.keys(files)) {
    const kind = staticFileKind(file);
    if (kind === "html" || kind === "css") counts[kind]++;
    else if (kind === "png" || kind === "jpeg" || kind === "webp") counts.raster++;
  }
  const zh = language === "zh";
  const limitations = [
    zh
      ? `已提供文件清单：HTML ${counts.html} 个、CSS ${counts.css} 个、栅格图片 ${counts.raster} 个。数量只说明文件已提供。本次源码评估未运行浏览器、脚本或后台，也未分析图片像素。`
      : `Supplied inventory: ${counts.html} HTML, ${counts.css} CSS and ${counts.raster} raster image file(s). Counts establish supplied files only. This source assessment did not run a browser, scripts or backend, or analyze image pixels.`,
    zh
      ? `模型提供了 ${modelLimitationCount} 条自述局限；其中事实未经独立核验，未作为检测事实发布。请以逐项证据和系统边界说明为准。`
      : `The model supplied ${modelLimitationCount} self-described limitations; their facts were not independently verified, so they are not published as detection findings. Use item evidence and system boundaries.`,
  ];
  const statuses = ["supported", "changes_suggested", "insufficient_evidence"] as const;
  const status = (value: string | undefined): value is ProofAssessmentItem["status"] => statuses.some(candidate => candidate === value);
  if (items.length > 33 || new Set(items.map(item => item.criterionId)).size !== items.length) throw new TypeError("Source publication needs bounded unique criterion identities.");
  const adjustedCriteria: ProofAssessmentWithheldRisks["adjustedCriteria"] = [];
  for (const item of items) {
    const originalStatus = originalStatuses.get(item.criterionId);
    if (!status(originalStatus) || !status(item.status)) throw new TypeError("Source publication needs each exact validated original and published status.");
    if (item.status !== originalStatus) adjustedCriteria.push({criterionId: item.criterionId, originalStatus, publishedStatus: item.status});
  }
  const statusAdjustedCount = adjustedCriteria.length;
  if (statusAdjustedCount) {
    limitations.push(zh
      ? `${statusAdjustedCount} 项状态经系统调整，${risks.length} 条未复核风险暂不采纳，以逐项证据为准。这是发布范围限制，不代表验收、授权或付款。`
      : `${statusAdjustedCount} item status(es) were adjusted by system checks. ${risks.length} unreviewed optional AI risk(s) are temporarily withheld; use item-level evidence. This publication gate does not accept work, authorize or trigger payment.`);
    const withheldRisks: ProofAssessmentWithheldRisks = {version: 1, reason: "item_status_adjusted", adjustedCriteria,
      entries: risks.map((risk, originalRiskIndex) => ({originalRiskIndex, risk: {...risk, citations: risk.citations.map(citation => ({...citation}))}}))};
    return {risks: [], limitations, statusAdjustedCount, withheldRisks};
  }
  const scopeCriterionIds = risks.length ? finiteContactPresenceScopeCriterionIds(criteria, items, files) : undefined;
  if (scopeCriterionIds) {
    limitations.push(zh
      ? `${risks.length} 条可选模型线索的独立约定范围尚未建立，已按电话／邮箱文字自定义范围单独暂缓；所有逐项结论保持不变，也未认定其他页面、链接或手机要求通过。没有伪造状态调整记录；人工意见不自动解除暂缓、验收或付款。`
      : `The independent agreed scope of ${risks.length} optional model indication(s) is not established, so originals are withheld under the custom phone/email text scope. All item findings are unchanged; other page, link or mobile requirements are not declared passed. No status-adjustment record was invented. Human opinions do not release the gate, accept work or make a payment.`);
    return {risks: [], limitations, statusAdjustedCount,
      withheldRisks: {version: 2, reason: "source_scope_unestablished", scopeCriterionIds, adjustedCriteria: [],
        entries: risks.map((risk, originalRiskIndex) => ({originalRiskIndex, risk: {...risk, citations: risk.citations.map(citation => ({...citation}))}}))}};
  }
  const observationScopeIds=risks.length?observationOnlyCustomScopeCriterionIds(criteria,items,observationContext):undefined;
  if(observationScopeIds){
    limitations.push(zh
      ? `${risks.length} 条可选模型线索已暂缓：自定义要求仍需运行或人工观察，逐项状态未改变。原始线索单独保留；未建立逐条因果关联，人工意见不解除暂缓、验收或付款。`
      : `${risks.length} optional model indication(s) are withheld: custom requirements still need execution or human observation. Item statuses are unchanged. Original leads remain separate; no per-lead causation, release, acceptance or payment is established.`);
    return{risks:[],limitations,statusAdjustedCount,withheldRisks:{version:3,reason:'custom_scope_requires_observation',scopeCriterionIds:observationScopeIds,adjustedCriteria:[],entries:risks.map((risk,originalRiskIndex)=>({originalRiskIndex,risk:{...risk,citations:risk.citations.map(citation=>({...citation}))}}))}};
  }
  // Independent copies prevent later presentation edits from mutating the raw
  // validated response. Retained risks remain AI leads awaiting human review;
  // neither their presence nor this publication decision changes item status.
  return {risks: risks.map(risk => ({...risk, citations: risk.citations.map(citation => ({...citation}))})), limitations, statusAdjustedCount,
    withheldRisks: {version: 1, reason: "not_withheld", adjustedCriteria: [], entries: []}};
}
