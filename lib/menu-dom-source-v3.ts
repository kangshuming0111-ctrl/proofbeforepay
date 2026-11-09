import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {ProofBusinessCheckStep} from "./contracts.ts";
import {createMenuDomSourceBusinessFactCheckV2} from "./menu-dom-source-v2.ts";
import {createSourceBusinessEvidenceCheck, type SourceBusinessEvidence, type SourceBusinessCheckResult} from "./source-business-evidence.ts";

export const UNCONFIRMED_MENU_CARD_OWNER = "unconfirmed_menu_card_owner";

type BusinessCheck = (criterionId: string) => SourceBusinessEvidence;
type Node = DefaultTreeAdapterTypes.Node;
const htmlNamespace = "http://www.w3.org/1999/xhtml";

function cardDescendantSpans(source: string): Set<string> | undefined {
  const document = parse(source, {sourceCodeLocationInfo: true, scriptingEnabled: true});
  const stack: {node: Node; insideCard: boolean; depth: number}[] = [{node: document, insideCard: false, depth: 0}];
  const spans = new Set<string>();
  let visited = 0;

  while (stack.length) {
    const {node, insideCard, depth} = stack.pop()!;
    if (++visited > 50_000 || depth > 512) return;
    let childrenInsideCard = insideCard;
    if ("tagName" in node && node.namespaceURI === htmlNamespace) {
      const location = node.sourceCodeLocation;
      if (insideCard && location?.startTag && location.endTag) {
        spans.add(`${location.startOffset}:${location.endOffset}`);
      }
      const classes = node.attrs.find(attr => attr.name === "class")?.value.split(/[\t\n\f\r ]+/u);
      childrenInsideCard ||= node.tagName === "div" && !!classes?.includes("menu-item");
    }
    if ("childNodes" in node) {
      for (const child of node.childNodes) stack.push({node: child, insideCard: childrenInsideCard, depth: depth + 1});
    }
  }
  return spans;
}

/** A legacy leaf inside a card cannot decide the card's item price on its own.
 * V2 already identifies complete card witnesses. Keep those and standalone
 * witnesses, while applying the same ancestor check to both price readers. */
function withCardOwnership(files: Record<string, string>, steps: readonly ProofBusinessCheckStep[], read: BusinessCheck): BusinessCheck {
  const snapshot = {...files};
  const priceKeys = new Set(steps.filter(step => step.expected.kind === "item_price").map(step => `${step.criterionId}\0${step.checkId}\0${step.file}`));
  const spansByFile = new Map<string, Set<string> | undefined>();

  return criterionId => {
    const original = read(criterionId);
    if (original.kind === "not_applicable") return original;

    const checks = original.checks.map((check): SourceBusinessCheckResult => {
      const citation = check.citation;
      if (check.kind === "unknown" || !citation || !priceKeys.has(`${criterionId}\0${check.checkId}\0${check.file}`)) return check;
      if (!spansByFile.has(check.file)) spansByFile.set(check.file, cardDescendantSpans(snapshot[check.file]));
      const spans = spansByFile.get(check.file);
      if (spans && !spans.has(`${citation.start}:${citation.end}`)) return check;
      return {checkId: check.checkId, file: check.file, kind: "unknown", reason: UNCONFIRMED_MENU_CARD_OWNER};
    });
    if (checks.every((check, index) => check === original.checks[index])) return original;

    const mismatches = checks.filter(check => check.kind === "mismatch");
    const kind = mismatches.length ? "mismatch" : "unknown";
    const cited = mismatches.length ? mismatches : checks.filter(check => check.reason === "merged_price_options_unconfirmed");
    const citations = cited.flatMap(check => check.citation ? [check.citation] : [])
      .filter((citation, index, all) => all.findIndex(other => other.file === citation.file && other.start === citation.start && other.end === citation.end) === index)
      .slice(0, 3);
    return {kind, checks, citations};
  };
}

export function createStrictMenuPriceEvidenceCheckV3(files: Record<string, string>, steps: readonly ProofBusinessCheckStep[]): BusinessCheck {
  return withCardOwnership(files, steps, createSourceBusinessEvidenceCheck(files, steps));
}

export function createMenuDomSourceBusinessFactCheckV3(files: Record<string, string>, steps: readonly ProofBusinessCheckStep[]): BusinessCheck {
  return withCardOwnership(files, steps, createMenuDomSourceBusinessFactCheckV2(files, steps));
}
