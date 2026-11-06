# Stage3 planned finite menu source reader and historical routing

This is a bounded implementation PLAN, not an implemented capability. Fictional noodle-site requirements only. No API/provider evaluation, browser execution, auth change or generic renderer is planned. Existing source-business-evidence.ts v1 bytes/functions remain unchanged. Stage1 whole-original final affirmative guard and Stage2 named bilingual grammar remain independent and unchanged.

## Proposed ownership and interfaces

F2 owns new lib/menu-dom-source-v2.ts, assessment-source-findings.ts factory version, contracts/export/replay routing, focused tests. F1 owns publication-v2 positive admission, CSS/tag/attribute qualification, the current pipeline caller and pipeline tests. One online constant publicationSchema='source-publication-v2' supplies report.publicationPolicy.schema, publication-check input and sourceFindingVersionForPublication(schema). Schema1 or absent history always maps to source-finding-v1. New schema2 requires all present sourceFinding.version2 and every publicationBasis.schema2. A lone item version cannot select wider authority. Old report/schema1 factories/canonical findings remain exact, not recomputed using latest behavior.

Actual additional same-boundary control: old ordinary no-template plain-p prices with CSS display:none or opacity:0 still publish supported because only special restoration used the stricter admission. Schema2 therefore also applies F1's pure finite HTML/CSS eligibility at the FINAL funnel of EVERY typed-price supported path, and strict export/replay re-runs the same gate even with no item publication marker. Unsafe/unknown source admission makes published whole status unknown; independent source facts remain separate declarations. This does not claim rendered visibility or modify schema1 historical verdicts.

New factory signature: createMenuDomSourceBusinessFactCheckV2(files:Record<string,string>, savedSteps:readonly ProofBusinessCheckStep[])(criterionId:string):SourceBusinessEvidence. Preserve the existing result/check/citation shape. SourceFindingInputs.version?: 'source-finding-v1'|'source-finding-v2' defaults v1. sourceFindingVersionForPublication(schema) strictly maps supported schema values to the fact version. Existing v1 sourceFinding function defaults remain v1. The result version changes only for explicit v2. Exports verify each current/history/acceptance report using its own policy schema and exact immutable scope prefix. Source-publication v1 remains its original premise/owner policy; only v2 may admit a legacy complex_or_unlocated_item via this new finite reader.

## Proposed reader algorithm

Snapshot inputs and call createIndependentSourceBusinessFactCheck unchanged. Preserve every definitive v1 check and every other unknown reason. Attempt new extraction only for item_price checks whose v1 reason is complex_or_unlocated_item. Thus missing file, duplicate label, generated content/script/handler, foreign/parse uncertainty, merged-price option and budget failures never inherit the new exception. New reader does not accept a precomputed model answer as evidence.

Parse the exact same file using parse5 sourceCodeLocationInfo. Finite owner forms: (1) a closed p (possibly li under the identical rule) containing text plus recursively closed span/strong only; (2) closed div with class token menu-item, exactly two nonblank element children h3 then p with class token price, each containing only text/span/strong. No comments, nested cards/blocks, implicit missing closing tags, iframe/template/foreign text or cross-sibling/card concatenation. Exact owner is cited in full at original UTF-16 offsets, <=500 characters; parse errors other than missing doctype, 50k visits or depth512 fail closed. AST children must account for every nonblank raw source span; never trust repaired/moved source alone.

New owner ancestry rejects hidden/inert/aria-hidden other than false, popover/style/contenteditable/handlers/namespace/dynamic attributes and default-hidden or foreign containers; quoted classes hidden/d-none/sr-only/invisible/is-hidden are not accepted. Ordinary CSS is not evaluated by the reader and the result never claims visibility. F1 separately qualifies all CSS/tags/attributes for any affirmative published exception. A safe source relationship alone never proves browser display.

Class matching is by exact ASCII-whitespace-separated tokens, never substring. A card owner's class is exactly the single token menu-item; its price child's class is exactly price. New inline/strong/span/title fields accept no class, or the finite price token where appropriate, and unknown class tokens on new owner ancestry fail closed. Both forms run this attribute/ancestry check before extracting text. Script-bearing or otherwise v1-dynamic pages are deliberately unsupported and are not promised by the new forms.

Require exactly one matching owner for the exact buyer-locked label/file; preserve v1's active-body label uniqueness gate. Only parse full explicit AUD/USD decimal tail with existing cents semantics; no bare$ inference, substrings or truncation. Card title must exactly equal the label and card price field must wholly parse as one price. Inline owner text must wholly be label followed by one price. A located unequal same-owner price can be a limited source mismatch; it is not automatic whole-criterion failure/acceptance. Reconstruct aggregate SourceBusinessEvidence exactly like v1 (mismatch if any mismatch; otherwise unknown if any unknown; all unchanged only if every check is unchanged). Do not slice checks; complete canonical fact citations remain controlled by existing sourceFinding8/main6 limits.

The aggregate citations convenience array retains v1's existing <=3 mismatch/merged-context projection. Every check retains its own complete citation; the existing source-finding factory uses all check citations, independently deduplicates them, and refuses >8 rather than silently slicing. The publisher independently refuses a complete fact needing >6. V1 equality applies only when the v1 version is selected; the deliberately new v2 result can differ on a newly supported owner.

## Required observed tests

Before/after known controls: legacy plain p and pure text two-cell table retain exact v1 facts; v1 nested p/span, card h3+p.price and nested cell are unknown today. New supported forms are limited to the two planned owner kinds (nested table is NOT newly promised in this slice). V1 facts rederive byte-equivalent on all known retained fixtures. Version2 can produce a correct source fact for supported new forms without changing raw model records. Test inline p, card, price mismatch in same card, multi-item same-price cards, wrong neighbor price, duplicated label/owner, title/price split across separate cards, missing price field, hidden/style/default-hidden/foreign/template ancestors, malformed/unclosed markup, nested block/card, scripts/handlers, overflow raw owner and node budgets, missing/omitted/truncated source, source-text/runtime distinction, incomplete whole requirement and missing original model owner citations. Some published controls belong to F1; reader tests must not claim publisher/browser coverage.

History/export tests must reject schema2 marker+v1 facts, schema1 marker+v2 facts, missing report policy while claiming v2, lone schema changes and fake new correct facts pasted into old schema1 unknown/negative reports. Valid old v1 and new v2 reports can coexist without rewriting any old object. Whole-envelope unsigned edits are not authenticity proof; distinguish consistency from original provider or real execution.

## Actual frozen v1 factory excerpt (dependency behavior stays unchanged)

Full-file SHA256 6d62133f10992c0effd51e6f7753ff41562c7c23fd53ba58ff69bd99458889a0
```ts
function sourceBusinessEvidenceCheck(files: Record<string, string>, savedSteps: readonly ProofBusinessCheckStep[], independentPriceFacts: boolean): (criterionId: string) => SourceBusinessEvidence {
  const snapshot = {...files}, steps = structuredClone(savedSteps), checks = steps.filter((step, index) => steps.findIndex(other => other.checkId === step.checkId) === index);
  const parsed = new Map<string, Source | undefined>(), uncertainty = new Map<string, boolean>();
  return criterionId => {
    const selected = checks.filter(check => check.criterionId === criterionId);
    if (!selected.length) return {kind: "not_applicable"};
    const results: SourceBusinessCheckResult[] = selected.map(check => {
      const unknown = (reason: string): SourceBusinessCheckResult => ({checkId: check.checkId, file: check.file, kind: "unknown", reason});
      if (!Object.hasOwn(snapshot, check.file)) return unknown("missing_file");
      const priceFacts = independentPriceFacts && check.expected.kind === "item_price", certaintyKey = `${priceFacts ? "price-fact" : "published"}\u0000${check.file}`;
      if (!uncertainty.has(certaintyKey)) uncertainty.set(certaintyKey, priceFacts ? hasUncertainDeclaredPriceSourceAtFile(snapshot, check.file) : hasUncertainSourceBodyCopyAtFile(snapshot, check.file));
      if (uncertainty.get(certaintyKey)) return unknown("dynamic_or_unsupported_source");
      if (!parsed.has(check.file)) parsed.set(check.file, sourceFor(check.file, snapshot[check.file]));
      const source = parsed.get(check.file); if (!source) return unknown("parse_or_budget");
      if (check.expected.kind === "visible_copy") {
        const literal = normalize(check.expected.text), matching = source.leaves.filter(leaf => occurrences(leaf.text, literal) === 1);
        if (occurrences(source.bodyText, literal) !== 1 || matching.length !== 1) return unknown("literal_not_unique_or_not_located");
        if (!matching[0].citation) return unknown("source_span_unavailable_or_too_long");
        return {checkId: check.checkId, file: check.file, kind: "unchanged", reason: "literal_source_present", citation: matching[0].citation};
      }
      const label = normalize(check.expected.label);
      const merged=findMergedPriceContext(snapshot,check.file,label);
      if(merged)return{checkId:check.checkId,file:check.file,kind:"unknown",reason:"merged_price_options_unconfirmed",label,expected:money(check.expected.currency,check.expected.amountMinor),actual:merged.amounts.map(value=>money(value.currency,value.amountMinor)).join(" / "),citation:merged.citation};
      if (occurrences(source.bodyText, label) !== 1) return unknown("label_not_unique_or_not_located");
      const matching = source.priceLeaves.filter(leaf => leaf.label === undefined ? leaf.text.startsWith(label) : leaf.label === label);
      if (matching.length !== 1) return unknown("complex_or_unlocated_item");
      const leaf = matching[0], tail = normalize(leaf.text.slice(label.length)), actual = amount(tail);
      if (!actual) return unknown("noncanonical_or_compound_price");
      if (!leaf.citation) return unknown("source_span_unavailable_or_too_long");
      const same = actual.currency === check.expected.currency && actual.amountMinor === check.expected.amountMinor;
      return {checkId: check.checkId, file: check.file, kind: same ? "unchanged" : "mismatch", reason: same ? "explicit_iso_price_equal" : "explicit_iso_price_differs", citation: leaf.citation, label, expected: money(check.expected.currency, check.expected.amountMinor), actual: money(actual.currency, actual.amountMinor)};
    });
    const mismatches = results.filter(result => result.kind === "mismatch"), kind = mismatches.length ? "mismatch" : results.some(result => result.kind === "unknown") ? "unknown" : "unchanged";
    const cited=mismatches.length?mismatches:kind==="unknown"?results.filter(result=>result.kind==="unknown"&&result.reason==="merged_price_options_unconfirmed"):[];
    const citations = cited.flatMap(result => result.citation ? [result.citation] : []).filter((citation, index, list) => list.findIndex(other => other.file === citation.file && other.start === citation.start && other.end === citation.end) === index).slice(0, 3);
    return {kind, checks: results, citations};
  };
}

/** Legacy publication semantics remain unchanged and conservative. */
export function createSourceBusinessEvidenceCheck(files: Record<string, string>, savedSteps: readonly ProofBusinessCheckStep[]) {
  return sourceBusinessEvidenceCheck(files, savedSteps, false);
}
/** Independent source-PRICE findings use the same exact subject/value parser.
 * Only a plain inert template differs from the published uncertainty policy. */
export function createIndependentSourceBusinessFactCheck(files: Record<string, string>, savedSteps: readonly ProofBusinessCheckStep[]) {
  return sourceBusinessEvidenceCheck(files, savedSteps, true);
}


```
