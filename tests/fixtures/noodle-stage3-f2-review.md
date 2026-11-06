# Stage3 F2 exact schema/export/replay seams

Selected exact source excerpts only, not a full repository audit. Actual new menu-dom-source-v2.ts and assessment-source-findings.ts are supplied separately. Old source-business-evidence.ts was not edited. Source declarations, whole-original coverage, finite publication eligibility and original model judgments are separate. Historical schema1/absence selects v1; schema2 is an explicit new epoch and requires its whole-original policy. No provider/API evaluation, identity or payment test is claimed.

## lib/contracts.ts
Whole-file SHA256 6be950d8c71ac10d02916deabcaf54f29b2156f554d250a24becc7a5057bcccd
```ts
export type ProofAssessmentSourceFinding = {
  version: "source-finding-v1" | "source-finding-v2";
  status: "supported" | "changes_suggested" | "insufficient_evidence";
  basis: "declared_html_labels" | "locked_business_values";
  explanation: string; citations: ProofAssessmentCitation[]; files: string[];
  scopeBinding?: {proposalId: string; proposalDigest: string; file: string; kind: "page" | "form"; formId?: string};
};
/** Explicit source-only reconciliation; never rewrites the retained model item. */
export type ProofAssessmentPublicationBasis = {schema:"source-publication-v1"|"source-publication-v2";reason:"locked_price_mismatch"|"confirmed_form_label_absence"|"locked_price_match"};
export type ProofAssessmentItem =
```

## lib/contracts.ts
Whole-file SHA256 6be950d8c71ac10d02916deabcaf54f29b2156f554d250a24becc7a5057bcccd
```ts
export type ProofAssessment = {
  /** Named whole-original publication guard. Absence preserves historical
   * reports; a newer grammar must use a new version, never reinterpret v1. */
  requirementCompletenessPolicy?: {schema:"requirement-completeness-v1";version:"bounded-original-zh-v1"|"bilingual-bounded-v2"};
  publicationPolicy?: {schema:"source-publication-v1"|"source-publication-v2";reconciledCriterionIds:string[]};
  scopeContext?: import("./scope-clarifications").ScopeAssessmentContext;
```

## lib/evidence-export.ts
Whole-file SHA256 a796afa66b2b09b7b5c89157fa684217e4b79b9c03757286a256bf0b5a5884e3
```ts
    if(result.sourceFinding!==undefined){
      requireValue(result.modelJudgment!==undefined,"A new independent source finding must retain the separate decoded model item.");
      const source=object(result.sourceFinding,["version","status","basis","explanation","citations","files","scopeBinding"],"Independent source finding");
      requireValue(source.version===((row.publicationPolicy as ProofAssessment["publicationPolicy"])?.schema==="source-publication-v2"?"source-finding-v2":"source-finding-v1")&&["supported","changes_suggested","insufficient_evidence"].includes(source.status as string)&&["declared_html_labels","locked_business_values"].includes(source.basis as string),"The independent source finding schema must match its saved report policy.");
      text(source.explanation,3000);cite(source.citations,8);
      const files=array(source.files,40,"Independent checked files");
      requireValue(new Set(files).size===files.length,"Independent source files must be unique.");
      for(const value of files){const file=text(value,300);requireValue(Object.hasOwn(delivery.files!,file)&&staticFileKind(file)==="html","An independent source file is not supplied HTML.");}
      if(source.scopeBinding!==undefined){
        const binding=object(source.scopeBinding,["proposalId","proposalDigest","file","kind","formId"],"Independent scope reference");
        text(binding.proposalId,100);requireValue(typeof binding.proposalDigest==="string"&&/^[a-f0-9]{64}$/u.test(binding.proposalDigest),"The independent scope digest is invalid.");text(binding.file,300);
        requireValue(binding.kind==="page"&&!Object.hasOwn(binding,"formId")||binding.kind==="form"&&typeof binding.formId==="string","The independent scope target is invalid.");if(binding.formId!==undefined)text(binding.formId,120);
      }
    }
    if(result.publicationBasis!==undefined){
      const basis=object(result.publicationBasis,["schema","reason"],"Source publication basis");
      requireValue(["source-publication-v1","source-publication-v2"].includes(basis.schema as string)&&basis.schema===(row.publicationPolicy as ProofAssessment["publicationPolicy"])?.schema&&["locked_price_mismatch","confirmed_form_label_absence","locked_price_match"].includes(basis.reason as string),"The source publication reason or saved report schema is unsupported.");
      const expectedStatus=basis.reason==="locked_price_match"?"supported":"changes_suggested";
      requireValue(result.status===expectedStatus&&(result.modelJudgment as ProofAssessmentItem["modelJudgment"])?.status===expectedStatus&&(result.sourceFinding as ProofAssessmentItem["sourceFinding"])?.status===expectedStatus,"Source reconciliation must preserve the matching raw status and separate exact source fact.");
    }
    if(result.obligations!==undefined)
```

## lib/evidence-export.ts
Whole-file SHA256 a796afa66b2b09b7b5c89157fa684217e4b79b9c03757286a256bf0b5a5884e3
```ts
  const markedIds=agreed.filter(c=>items.some(item=>(item as ProofAssessmentItem).criterionId===c.id&&(item as ProofAssessmentItem).publicationBasis!==undefined)).map(c=>c.id);
  if(row.publicationPolicy!==undefined){
    const policy=object(row.publicationPolicy,["schema","reconciledCriterionIds"],"Source publication policy"),ids=array(policy.reconciledCriterionIds,33,"Reconciled criteria");
    requireValue(["source-publication-v1","source-publication-v2"].includes(policy.schema as string)&&same(ids,markedIds),"The publication policy must list exactly the marked criteria in agreed order.");
    if(policy.schema==="source-publication-v2")requireValue(row.requirementCompletenessPolicy!==undefined&&items.every(item=>(item as ProofAssessmentItem).modelJudgment!==undefined),"A version2 source policy must retain its whole-original policy and every original decoded model item.");
  }else requireValue(markedIds.length===0,"A source publication basis requires its explicit report policy.");
  if(row.requirementCompletenessPolicy!==undefined){
    const policy=object(row.requirementCompletenessPolicy,["schema","version"],"Whole-original publication policy");
    requireValue(policy.schema==="requirement-completeness-v1"&&["bounded-original-zh-v1","bilingual-bounded-v2"].includes(policy.version as string),"Unsupported whole-original publication policy.");
    requireValue(items.every(item=>(item as ProofAssessmentItem).modelJudgment!==undefined),"A current whole-original policy must retain every original decoded model item.");
  }
  const validateRisk=
```

## lib/evidence-export.ts
Whole-file SHA256 a796afa66b2b09b7b5c89157fa684217e4b79b9c03757286a256bf0b5a5884e3
```ts
      const sourceFiles=Object.fromEntries(Object.entries(bundle.delivery.files!).filter(([file])=>["html","css"].includes(staticFileKind(file)??""))),businessSteps=getBusinessCheckPlan(scopeQuote),publicationSchema=report.publicationPolicy?.schema??"source-publication-v1";
      const checkSource=createAssessmentSourceFindingCheck({files:sourceFiles,coverage:report.coverage,language:bundle.project.language,businessSteps,scope:reportScope,version:sourceFindingVersionForPublication(publicationSchema)});
      const checkPublication=createSourcePublicationCheck({files:sourceFiles,coverage:report.coverage,language:bundle.project.language,businessSteps,scope:reportScope,ruleEvidence:bundle.delivery.evidence,requirementCompletenessVersion:report.requirementCompletenessPolicy?.version??"bounded-original-zh-v1",publicationSchema});
      for(const item of report.items)if(publicationSchema==="source-publication-v2"||item.modelJudgment!==undefined||item.sourceFinding!==undefined){
        const expected=checkSource(bundle.project.criteria.find(c=>c.id===item.criterionId)!);
        requireValue(same(item.sourceFinding??null,expected??null),"The independent source finding differs from exact source/scope replay.");
        if(publicationSchema==="source-publication-v2"&&item.status==="supported"&&businessSteps.some(step=>step.criterionId===item.criterionId&&step.expected.kind==="item_price"))requireValue(item.modelJudgment?.status==="supported"&&assessMenuPricePublicationAdmissionV2(sourceFiles,expected,item.modelJudgment.citations,report.coverage),"Every version2 affirmative price path needs complete source ownership, original citations and finite HTML/CSS eligibility.");
        const adjustment=report.withheldRisks?.adjustedCriteria.find(row=>row.criterionId===item.criterionId);
        if(adjustment)requireValue(adjustment.originalStatus===item.modelJudgment?.status,"The retained original AI status conflicts with its adjustment ledger.");
        if(item.publicationBasis!==undefined){
          requireValue(item.modelJudgment&&report.publicationPolicy,"Source publication requires the retained model item and explicit report policy.");
          const decision=checkPublication(bundle.project.criteria.find(c=>c.id===item.criterionId)!,{rawStatus:item.modelJudgment.status,rawCitations:item.modelJudgment.citations,guardedStatus:"insufficient_evidence",guardReason:item.publicationBasis.reason});
          requireValue(decision&&same(item.publicationBasis,decision.publicationBasis)&&item.status===decision.status&&same(item.sourceFinding,decision.sourceFinding)&&item.explanation===decision.explanation&&same(item.citations,decision.citations)&&item.evidenceNeed===undefined,"The published source reconciliation differs from its original scope, legacy guard or canonical source evidence.");
        }
      }
    }
    riskBindings(
```

## scripts/replay-evidence-actions-2026-11-06.mjs
Whole-file SHA256 95888e3acc2f9e738b719561fb652e4d47b89955b055f259c68e814cf6229a8d
```ts
  const publicationSchema=value.publicationPolicy?.schema??"source-publication-v1",businessSteps=getBusinessCheckPlan(quote);
  const sourceCheck=createAssessmentSourceFindingCheck({files:packet.files,coverage:value.coverage,language:quote.language,businessSteps,scope,version:sourceFindingVersionForPublication(publicationSchema)});
  const publicationCheck=createSourcePublicationCheck({files:packet.files,coverage:value.coverage,language:quote.language,businessSteps,scope,ruleEvidence:quote.proof.delivery.evidence,requirementCompletenessVersion:value.requirementCompletenessPolicy?.version??"bounded-original-zh-v1",publicationSchema});
  const markedIds=packet.criteria.filter(c=>value.items.some(i=>i.criterionId===c.id&&Object.hasOwn(i,"publicationBasis"))).map(c=>c.id);
  if(current)assert.ok(Object.hasOwn(value,"publicationPolicy"),"Current catalog report lacks its explicit source-publication policy.");
  if(Object.hasOwn(value,"publicationPolicy")){
   assert.ok(object(value.publicationPolicy));assert.deepEqual(Object.keys(value.publicationPolicy).sort(),["reconciledCriterionIds","schema"]);
   assert.ok(["source-publication-v1","source-publication-v2"].includes(value.publicationPolicy.schema));assert.deepEqual(value.publicationPolicy.reconciledCriterionIds,markedIds,"Publication policy must list exactly the marked criteria in agreed order.");
   if(publicationSchema==="source-publication-v2")assert.ok(Object.hasOwn(value,"requirementCompletenessPolicy")&&value.items.every(item=>Object.hasOwn(item,"modelJudgment")),"Version2 must retain its whole-original policy and every original decoded model item.");
   if(current)accounting.publicationPoliciesVerified++;else accounting.baselinePublicationPoliciesRetained++;
  }else assert.deepEqual(markedIds,[],"An item marker without an explicit report policy cannot be stripped.");
  if(current)assert.ok(Object.hasOwn(value,"requirementCompletenessPolicy")
```

## scripts/replay-evidence-actions-2026-11-06.mjs
Whole-file SHA256 95888e3acc2f9e738b719561fb652e4d47b89955b055f259c68e814cf6229a8d
```ts
   }else assert.ok(!Object.hasOwn(item,"sourceFinding"),"A sourceFinding without retained modelJudgment cannot be stripped.");
   if(publicationSchema==="source-publication-v2"&&item.status==="supported"&&businessSteps.some(step=>step.criterionId===item.criterionId&&step.expected.kind==="item_price"))assert.ok(item.modelJudgment?.status==="supported"&&assessMenuPricePublicationAdmissionV2(packet.files,expected,item.modelJudgment.citations,value.coverage),"Every version2 affirmative price path needs complete exact owners and finite HTML/CSS admission.");
   if(Object.hasOwn(item,"publicationBasis")){
    assert.ok(object(item.publicationBasis)&&object(item.modelJudgment));assert.deepEqual(Object.keys(item.publicationBasis).sort(),["reason","schema"]);
    assert.equal(item.publicationBasis.schema,publicationSchema);assert.ok(["source-publication-v1","source-publication-v2"].includes(item.publicationBasis.schema));assert.ok(["locked_price_mismatch","confirmed_form_label_absence","locked_price_match"].includes(item.publicationBasis.reason));
    const decision=publicationCheck(packet.criteria[index],{rawStatus:item.modelJudgment.status,rawCitations:item.modelJudgment.citations,guardedStatus:"insufficient_evidence",guardReason:item.publicationBasis.reason});
    assert.ok(decision,"The source publication marker has no rederived legacy guard and source authority.");assert.deepEqual(item.publicationBasis,decision.publicationBasis);assert.equal(item.status,decision.status);assert.equal(item.explanation,decision.explanation);assert.deepEqual(item.citations,decision.citations);assert.deepEqual(item.sourceFinding,decision.sourceFinding);assert.equal(item.evidenceNeed,undefined);
    if(current)accounting.publicationMarkersRecomputed++;else accounting.baselinePublicationMarkersRetained++;
   }
   delete copy.items[index].modelJudgment;
```

## tests/menu-dom-export-v2.test.ts
Whole-file SHA256 79a84ac98b0f5174748f557e57b05e035b17faec7765fc7a58ec1b0c5d1e3151
```ts
test("marker/fact/report versions cannot independently select a wider owner reader",async()=>{
 const{bundle}=await run();
 for(const mutate of[(b:EvidenceExport)=>{b.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!.sourceFinding!.version="source-finding-v1";},(b:EvidenceExport)=>{b.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!.publicationBasis!.schema="source-publication-v1";},(b:EvidenceExport)=>{b.delivery.assessment!.publicationPolicy!.schema="source-publication-v1";},(b:EvidenceExport)=>{delete b.delivery.assessment!.publicationPolicy;},(b:EvidenceExport)=>{const r=b.delivery.assessment!;r.publicationPolicy!.schema="source-publication-v1";for(const i of r.items){if(i.sourceFinding)i.sourceFinding.version="source-finding-v1";if(i.publicationBasis)i.publicationBasis.schema="source-publication-v1";}}]){
  const changed=structuredClone(bundle);mutate(changed);assert.equal(await check(changed),"inconsistent");
 }
});

test("schema2 unknown
```

## tests/menu-dom-export-v2.test.ts
Whole-file SHA256 79a84ac98b0f5174748f557e57b05e035b17faec7765fc7a58ec1b0c5d1e3151
```ts
test("ordinary no-marker price paths reject partial CSS and unsafe CSS while retaining source subfacts",async()=>{
 const body="<p>牛肉面 AUD18</p><p>Beef noodles AUD18</p>",normal=await run({body});assert.equal(normal.item.status,"supported");assert.equal(normal.item.publicationBasis,undefined);
 for(const kind of["truncated","omitted"]){const changed=structuredClone(normal.bundle);if(kind==="truncated")changed.delivery.assessment!.coverage.truncatedFiles.push("site.css");else{changed.delivery.assessment!.coverage.omittedFiles.push("site.css");changed.delivery.assessment!.coverage.includedFiles=changed.delivery.assessment!.coverage.includedFiles.filter(f=>f!=="site.css");}assert.equal(changed.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!.sourceFinding!.status,"supported");assert.equal(await check(changed),"inconsistent");}
 for(const css of["p{display:none}","body{opacity:0}"]){const sample=await run({body,css});assert.equal(sample.item.status,"insufficient_evidence");assert.equal(sample.item.sourceFinding!.status,"supported");assert.equal(sample.item.publicationBasis,undefined);const fake=structuredClone(sample.bundle);affirm(fake);assert.equal(await check(fake),"inconsistent");}
});

test("schema2 cannot delete its whole-original policy to approve a compound ordinary requirement",async()=>{
 const{bundle,item}=await run({body:"<p>牛肉面 AUD18</p><p>Beef noodles AUD18</p>",compound:true});assert.equal(item.status,"insufficient_evidence");assert.equal(item.sourceFinding!.status,"supported");assert.equal(item.publicationBasis,undefined);
 const changed=structuredClone(bundle);affirm(changed);delete changed.delivery.assessment!.requirementCompletenessPolicy;assert.equal(await check(changed),"inconsistent");
});

test("a controlled v1 unknown
```

## Actual verification at this stable point
51 focused tests passed, covering the new reader6, new export/schema/history7, whole-original/history9, strict retained replay15 (including exported tree with original six gold cases), and existing source-publication export14. Typecheck passed. New partial-CSS ordinary no-marker controls retain independent source facts but reject affirmative publication; schema2 missing-whole-policy compound control is rejected. Old V90 saved source findings rederive exactly using v1. A separate frozen Stage2 source copy independently matched all thirteen current v1 facts; one older v89 originalApplication already differed before this stage, so that old artifact was not silently used or altered as v91 compatibility gold. These are intercepted or pure deterministic tests, not new model inference.

## Requested critique
Look for concrete P1/P2 in version mismatch, epoch coupling, current/history report recomputation, missing/truncated CSS all-path admission, or metadata stripping that could hide a real status/explanation/citation change. Unsigned whole-envelope edits are not authenticated originals; do not claim authenticity. Reader source facts make no visibility or browser/backend claim.
