import type {Language, ProofAssessment, ProofAssessmentItem, ProofBusinessCheckStep, ProofCriterion} from "../../lib/contracts.ts";
import {priceOnlyOriginalForVersion} from "../../lib/assessment-requirement-completeness.ts";

const hour = "(?:[1-9]|1[0-2])";
const zhHours = new RegExp(`^(.+?)(?:且|并且|以及) *(营业时间必须为(?:上午|下午|晚上)${hour}点到(?:上午|下午|晚上)${hour}点)[。.]?$`, "u");
const clock = "(?:0?[1-9]|1[0-2])(?::[0-5][0-9])? *(?:am|pm)";
const military = "(?:[01][0-9]|2[0-3]):[0-5][0-9]";
const enHours = new RegExp(`^(.+?) +and +(opening hours must be (?:from )?(?:${clock} to ${clock}|${military} to ${military}))[.]?$`, "iu");

/** A read-time guide for the exact menu-price + opening-hours pattern. This
 * does not classify delivery hours or amend a saved report or requirement. */
export function openingHoursEvidenceGuide(
  criterion: ProofCriterion | undefined, item: ProofAssessmentItem | undefined,
  steps: readonly ProofBusinessCheckStep[], policy: ProofAssessment["requirementCompletenessPolicy"], language: Language,
) {
  const fact = item?.sourceFinding;
  if (!criterion || criterion.id !== item?.criterionId || item.status !== "insufficient_evidence"
    || fact?.basis !== "locked_business_values" || fact.status !== "supported"
    || !["source-finding-v2", "source-finding-v3"].includes(fact.version)
    || policy?.schema !== "requirement-completeness-v1"
    || !["bilingual-bounded-v2", "bilingual-bounded-v3"].includes(policy.version)) return;
  const original = criterion.source;
  if (original.length > 400 || /[\u0000-\u001f\u007f]/u.test(original)) return;
  const clause = zhHours.exec(original.trim()) ?? enHours.exec(original.trim());
  const priceSteps = steps.filter(step => step.criterionId === criterion.id);
  if (!clause || !priceOnlyOriginalForVersion({...criterion, source: clause[1].trim()}, priceSteps, "bilingual-bounded-v2")) return;
  const hours = clause[2];
  if (language === "zh") return {
    title: "营业时间仍待核对", actor: "卖家提供位置，买家核对本版",
    instructions: `价格已有源码证据。请核对「${hours}」：卖家指出本次交付中显示营业时间的页面及位置，买家打开本版核对；如果未显示，再请卖家补交。`,
    draft: `请指出本次交付中显示营业时间的页面及位置，供买家对照「${hours}」核对。如果当前版本尚未显示，请补交修正版并注明位置。\n\n完整锁定要求：${original}`,
  };
  return {
    title: "Opening hours still need review", actor: "Seller points to the evidence; buyer checks this version",
    instructions: `The prices have source evidence. For “${hours}”, the seller points to the page and location in this delivery and the buyer checks this version. If the hours are not displayed, ask for a revision.`,
    draft: `Please point to the page and location in this delivery where the opening hours are shown, so the buyer can check “${hours}”. If the hours are not yet displayed, send a revised version and identify the location.\n\nComplete locked requirement: ${original}`,
  };
}
