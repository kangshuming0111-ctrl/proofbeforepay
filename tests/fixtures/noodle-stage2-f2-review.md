# Stage2 F2 exact source seam review

Selected exact excerpts only; this is not a full-source review. Stage1 semantics were separately tested and reviewed; this delta admits an explicitly named bilingual policy and threads that historical per-report policy into source-publication replay. The complete helper/source-publication implementation is in the F1 packet. No private input, credentials or provider requests included.

## lib/contracts.ts
Whole-file SHA256 ea18d9aa094c32c0883edbd27532dc6051b18ca1126f174fd78c897bf7d6a77b
```ts
export type ProofAssessment = {
  /** Named whole-original publication guard. Absence preserves historical
   * reports; a newer grammar must use a new version, never reinterpret v1. */
  requirementCompletenessPolicy?: {schema:"requirement-completeness-v1";version:"bounded-original-zh-v1"|"bilingual-bounded-v2"};
  publicationPolicy?: {schema:"source-publication-v1";reconciledCriterionIds:string[]};
```

## lib/evidence-export.ts
Whole-file SHA256 2c4176c35f36098e48d317ebc7486d6118ee289d1f63102180174fad5c665ba0
```ts
  if(row.requirementCompletenessPolicy!==undefined){
    const policy=object(row.requirementCompletenessPolicy,["schema","version"],"Whole-original publication policy");
    requireValue(policy.schema==="requirement-completeness-v1"&&["bounded-original-zh-v1","bilingual-bounded-v2"].includes(policy.version as string),"Unsupported whole-original publication policy.");
    requireValue(items.every(item=>(item as ProofAssessmentItem).modelJudgment!==undefined),"A current whole-original policy must retain every original decoded model item.");
  }
```

## lib/evidence-export.ts
Whole-file SHA256 2c4176c35f36098e48d317ebc7486d6118ee289d1f63102180174fad5c665ba0
```ts
      if(report.requirementCompletenessPolicy){
        const checkWholeOriginal=createRequirementCompletenessCheck({businessSteps:getBusinessCheckPlan(scopeQuote),version:report.requirementCompletenessPolicy.version});
        for(const item of report.items)requireValue(item.status!=="supported"||checkWholeOriginal(bundle.project.criteria.find(c=>c.id===item.criterionId)!).kind!=="incomplete","A partial price/source fact cannot establish support for the complete locked original requirement.");
      }
      // New source facts are recomputed
```

Exact export per-report publication constructor:
```ts
      const checkPublication=createSourcePublicationCheck({files:Object.fromEntries(Object.entries(bundle.delivery.files!).filter(([file])=>["html","css"].includes(staticFileKind(file)??""))),coverage:report.coverage,language:bundle.project.language,businessSteps:getBusinessCheckPlan(scopeQuote),scope:reportScope,ruleEvidence:bundle.delivery.evidence,requirementCompletenessVersion:report.requirementCompletenessPolicy?.version??"bounded-original-zh-v1"});
```

Exact replay per-report publication constructor:
```ts
  const publicationCheck=createSourcePublicationCheck({files:packet.files,coverage:value.coverage,language:quote.language,businessSteps:getBusinessCheckPlan(quote),scope,ruleEvidence:quote.proof.delivery.evidence,requirementCompletenessVersion:value.requirementCompletenessPolicy?.version??"bounded-original-zh-v1"});
```

## scripts/replay-evidence-actions-2026-11-06.mjs
Whole-file SHA256 4461b1457b67655260fb9899c3a20a3ba2bca373da334850546b0c9f6d9fa3fa
```ts
  if(current)assert.ok(Object.hasOwn(value,"requirementCompletenessPolicy"),"Current catalog report lacks its named whole-original publication policy.");
  let completenessCheck;
  if(Object.hasOwn(value,"requirementCompletenessPolicy")){
   const policy=value.requirementCompletenessPolicy;
   assert.ok(object(policy));assert.deepEqual(Object.keys(policy).sort(),["schema","version"]);
   assert.equal(policy.schema,"requirement-completeness-v1");assert.ok(["bounded-original-zh-v1","bilingual-bounded-v2"].includes(policy.version));
   completenessCheck=createRequirementCompletenessCheck({businessSteps:getBusinessCheckPlan(quote),version:policy.version});
   if(current)accounting.requirementCompletenessPoliciesVerified++;else accounting.baselineRequirementCompletenessPoliciesRetained++;
  }
  const copy=structuredClone(value);
```

## tests/requirement-completeness-export.test.ts
Whole-file SHA256 882c85dc1ec081256807cc7ff0f0d93c010bcf109f354610b684ab8c5ea42809
```ts
test("new bilingual price-only publication replays its named version and cannot fall back to an old grammar",async()=>{
 for(const summaryOverride of["The menu must list 牛肉面 and Beef noodles at AUD18.","菜单中牛肉面和Beef noodles的价格必须为18澳元。"]){
  for(const template of[false,true]){
   const{quote,report,item}=await scenario({compound:false,summaryOverride,template});assert.deepEqual(report.requirementCompletenessPolicy,policy);assert.equal(item.status,"supported");
   const bundle=await createEvidenceExport(quote);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");
   const v1=structuredClone(bundle);v1.delivery.assessment!.requirementCompletenessPolicy!.version="bounded-original-zh-v1";assert.equal(await aiCheck(v1),"inconsistent");
   if(template){assert.equal(item.publicationBasis?.reason,"locked_price_match");const noVersion=structuredClone(bundle);delete noVersion.delivery.assessment!.requirementCompletenessPolicy;assert.equal(await aiCheck(noVersion),"inconsistent");}
  }
 }
});

test("a v1 English unknown
```

## tests/requirement-completeness-export.test.ts
Whole-file SHA256 882c85dc1ec081256807cc7ff0f0d93c010bcf109f354610b684ab8c5ea42809
```ts
test("a v1 English unknown and v2 support can coexist without reinterpreting the historical policy",async()=>{
 const{quote,report,item}=await scenario({compound:false,summaryOverride:"The menu must list 牛肉面 and Beef noodles at AUD18.",template:true});
 const criterion=quote.proof.criteria.find(c=>c.id===item.criterionId)!,oldCheck=createRequirementCompletenessCheck({businessSteps:getBusinessCheckPlan(quote),version:"bounded-original-zh-v1"})(criterion);assert.equal(oldCheck.kind,"incomplete");
 const legacy=structuredClone(report);legacy.id="controlled-v1-english-unknown";legacy.requirementCompletenessPolicy={schema:"requirement-completeness-v1",version:"bounded-original-zh-v1"};legacy.publicationPolicy!.reconciledCriterionIds=[];
 const prior=legacy.items.find(i=>i.criterionId===item.criterionId)!;delete prior.publicationBasis;prior.status="insufficient_evidence";prior.explanation=requirementCompletenessExplanation(oldCheck,quote.language);prior.evidenceNeed={schema:"source-evidence-need-v1",reason:"requirement_clarification",targetFiles:[]};
 legacy.withheldRisks={version:1,reason:"item_status_adjusted",adjustedCriteria:[{criterionId:item.criterionId,originalStatus:"supported",publishedStatus:"insufficient_evidence"}],entries:[]};
 quote.proof.delivery!.assessmentHistory=[legacy];const before=structuredClone(legacy),bundle=await createEvidenceExport(quote);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual(bundle.delivery.assessmentHistory,[before]);assert.equal(bundle.delivery.assessment!.items.find(i=>i.criterionId===item.criterionId)!.status,"supported");
 const claim=structuredClone(bundle),claimed=claim.delivery.assessmentHistory![0];claimed.items.find(i=>i.criterionId===item.criterionId)!.status="supported";delete claimed.items.find(i=>i.criterionId===item.criterionId)!.evidenceNeed;claimed.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};assert.equal(await aiCheck(claim),"inconsistent");assert.deepEqual(legacy,before);
});
```

## Observed verification
38 focused tests passed: nine new export/history/version tests, fifteen strict retained replay tests including the exported-source-tree case, fourteen existing source-publication export tests. A second persistent exported tree replay completed all six original frozen scope cases with original gold and no network/provider calls; all six published core comparisons remained unchanged. Exact existing source/body/freeze hashes were enforced. The Stage1 English conservative regression is retained separately and was resolved by the named v2 grammar, not a core comparison exception.

## Review question
Find concrete defects in version routing, missing-policy legacy fallback, positive marker grammar provenance, or v1-history stability. The same-report source policy is unsigned consistency metadata, not original provider authenticity. Do not claim all report-envelope metadata removal can be detected; the format retains legacy compatibility.
