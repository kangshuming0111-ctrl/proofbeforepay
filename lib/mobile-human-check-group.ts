import type { ProofQuote } from "./contracts.ts";
import { isHtmlDeliveryPath } from "./delivery-upload.ts";
import { validateSavedCoverage } from "./requirement-coverage.ts";

const MOBILE_CLAUSE = "首页、菜单页和联系页在手机上均可用，正文与导航可阅读及操作，无需横向滚动。";
const BUILT_IN_MOBILE_SOURCES = [
  "所有交付页面都必须能在手机屏幕上正常使用；必须由人实际检查。",
  "All delivered pages must be usable on a mobile screen; a person must check them directly.",
];
const PAGES = ["index.html", "menu.html", "contact.html"];

function samePages(files: readonly string[]) {
  return files.length === PAGES.length && PAGES.every(file => files.includes(file));
}

/** UI shortcut for one bounded inspection. Both original criterion IDs remain required. */
export function mobileHumanCheckGroup(quote: Pick<ProofQuote, "summary" | "proof"> | undefined): readonly [string, string] | undefined {
  if (!quote) return;
  const { project, criteria, review, delivery, scopeClarifications } = quote.proof;
  if (project?.coverage?.version !== 2 || project.coverage.sourceText !== quote.summary.trim()
    || !samePages(project.requiredPages) || delivery?.variant !== "upload" || !delivery.files || review?.deliveryId !== delivery.id
    || !samePages(Object.keys(delivery.files).filter(isHtmlDeliveryPath))) return;

  let coverage;
  try { coverage = validateSavedCoverage(project.coverage); } catch { return; }
  const matchingClauses = coverage.decisions.filter(row => row.text === MOBILE_CLAUSE);
  const original = matchingClauses[0];
  if (matchingClauses.length !== 1 || original.disposition !== "include" || !original.criterionId) return;

  const ids = ["mobile", original.criterionId] as const;
  const builtIn = criteria.find(criterion => criterion.id === ids[0]);
  if (!builtIn || !BUILT_IN_MOBILE_SOURCES.includes(builtIn.source)
    || !criteria.some(criterion => criterion.id === ids[1] && criterion.source === original.text)
    || scopeClarifications?.some(scope => ids.some(id => id === scope.criterionId))) return;

  return ids.every(id => {
    const findings = delivery.evidence.filter(item => item.criterionId === id);
    return findings.length === 1 && findings[0].finding === "needs_human";
  }) ? ids : undefined;
}

export function selectMobileHumanChecks(current: string[], ids: readonly [string, string], checked: boolean): string[] {
  return checked ? [...current, ...ids.filter(id => !current.includes(id))] : current.filter(id => !ids.includes(id));
}
