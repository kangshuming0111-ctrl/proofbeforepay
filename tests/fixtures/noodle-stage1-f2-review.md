# Stage1 F2 bounded export and replay review

This is an exact selected-source excerpt packet, not a full repository review. Fictional local tests only. No credentials, contracts, provider requests, or private actor details. Stage1 keeps a named v1 grammar; Stage2 is deferred and must not reinterpret v1 history. The current English scope retained replay deliberately still detects supported→unknown core differences; do not suggest swallowing them as metadata. Root will adjudicate the phase boundary.

## lib/contracts.ts
Full-file SHA256 49b450ff9a6173a6e3341d6ea38776c9054d5b42a01eb103b65ff51a6c9de3be
Exact excerpt:
```ts
export type ProofAssessment = {
  /** Named whole-original publication guard. Absence preserves historical
   * reports; a newer grammar must use a new version, never reinterpret v1. */
  requirementCompletenessPolicy?: {schema:"requirement-completeness-v1";version:"bounded-original-zh-v1"};
  publicationPolicy?: {schema:"source-publication-v1";reconciledCriterionIds:string[]};
```

## lib/evidence-export.ts
Full-file SHA256 9ef754230b2b54683a69807de51fdc17876750d985635e3d8ddebfd4c7ff286b
Exact excerpt:
```ts
  if(row.requirementCompletenessPolicy!==undefined){
    const policy=object(row.requirementCompletenessPolicy,["schema","version"],"Whole-original publication policy");
    requireValue(policy.schema==="requirement-completeness-v1"&&policy.version==="bounded-original-zh-v1","Unsupported whole-original publication policy.");
    requireValue(items.every(item=>(item as ProofAssessmentItem).modelJudgment!==undefined),"A current whole-original policy must retain every original decoded model item.");
  }
```

## lib/evidence-export.ts
Full-file SHA256 9ef754230b2b54683a69807de51fdc17876750d985635e3d8ddebfd4c7ff286b
Exact excerpt:
```ts
    for(const report of reports){const reportScope=await resolveAssessmentScopeContext(scopeQuote,report,mode);
      assessment(report,bundle.delivery,bundle.project.criteria,{hasBusinessChecks:bundle.project.spec?.businessChecks!==undefined&&(!Array.isArray(bundle.project.spec.businessChecks)||bundle.project.spec.businessChecks.length>0)});
      if(report.requirementCompletenessPolicy){
        const checkWholeOriginal=createRequirementCompletenessCheck({businessSteps:getBusinessCheckPlan(scopeQuote),version:report.requirementCompletenessPolicy.version});
        for(const item of report.items)requireValue(item.status!=="supported"||checkWholeOriginal(bundle.project.criteria.find(c=>c.id===item.criterionId)!).kind!=="incomplete","A partial price/source fact cannot establish support for the complete locked original requirement.");
      }
      // New source facts are recomputed
```

## scripts/replay-evidence-actions-2026-11-06.mjs
Full-file SHA256 777976cb1a141f027773f5d6600644f7731c264b55ec6d4df55b428f35320d7f
Exact excerpt:
```ts
  if(current)assert.ok(Object.hasOwn(value,"requirementCompletenessPolicy"),"Current catalog report lacks its named whole-original publication policy.");
  let completenessCheck;
  if(Object.hasOwn(value,"requirementCompletenessPolicy")){
   const policy=value.requirementCompletenessPolicy;
   assert.ok(object(policy));assert.deepEqual(Object.keys(policy).sort(),["schema","version"]);
   assert.equal(policy.schema,"requirement-completeness-v1");assert.equal(policy.version,"bounded-original-zh-v1");
   completenessCheck=createRequirementCompletenessCheck({businessSteps:getBusinessCheckPlan(quote),version:policy.version});
   if(current)accounting.requirementCompletenessPoliciesVerified++;else accounting.baselineRequirementCompletenessPoliciesRetained++;
  }
  const copy=structuredClone(value);
```

## scripts/replay-evidence-actions-2026-11-06.mjs
Full-file SHA256 777976cb1a141f027773f5d6600644f7731c264b55ec6d4df55b428f35320d7f
Exact excerpt:
```ts
   if(completenessCheck){
    const result=completenessCheck(packet.criteria[index]);
    assert.ok(item.status!=="supported"||result.kind!=="incomplete","A partial fact cannot hide an unverified part of the locked original requirement.");
    if(current)accounting.requirementCompletenessChecksRecomputed++;
   }
   if(current)assert.ok(Object.hasOwn(item,"modelJudgment")
```

## scripts/replay-evidence-actions-2026-11-06.mjs
Full-file SHA256 777976cb1a141f027773f5d6600644f7731c264b55ec6d4df55b428f35320d7f
Exact excerpt:
```ts
  delete copy.publicationPolicy;
  delete copy.requirementCompletenessPolicy;
  return copy;
```

## tests/requirement-completeness-export.test.ts
Full-file SHA256 e0c1fea84e8fd47dac4d2de6443e8fdb705a2943cc0b2681f49046a2a649015f
Exact excerpt:
```ts
test("new policy refuses forged whole support even when every price fact is exact",async()=>{
 const{quote}=await scenario(),bundle=await createEvidenceExport(quote);
 const forged=structuredClone(bundle),item=forged.delivery.assessment!.items.find(i=>i.criterionId==="coverage-1")!;
 item.status="supported";delete item.evidenceNeed;item.explanation=item.sourceFinding!.explanation;
 forged.delivery.assessment!.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};
 assert.equal(item.sourceFinding!.status,"supported");assert.equal(await aiCheck(forged),"inconsistent");
 for(const change of[(p:any)=>{p.schema="future";},(p:any)=>{p.version="bilingual-bounded-v2";},(p:any)=>{p.extra=true;},(p:any)=>{delete p.version;}]){
  const altered=structuredClone(bundle);change(altered.delivery.assessment!.requirementCompletenessPolicy);assert.equal(await aiCheck(altered),"inconsistent");
 }
 const noRaw=structuredClone(bundle);delete noRaw.delivery.assessment!.items[0].modelJudgment;assert.equal(await aiCheck(noRaw),"inconsistent");
});

test("same-version legacy snapshot stays byte-equivalent without applying a new whole-original policy",async()=>{
 const{quote,report,item}=await scenario(),legacy=structuredClone(report);legacy.id="synthetic-v91-compatible-legacy-report";
 // This is a controlled schema-compatibility example, not an original saved
 // provider report. It models the demonstrated old ordinary-price path.
 delete legacy.requirementCompletenessPolicy;const prior=legacy.items.find(i=>i.criterionId===item.criterionId)!;
 prior.status="supported";prior.explanation=prior.sourceFinding!.explanation;delete prior.evidenceNeed;
 legacy.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};
 quote.proof.delivery!.assessmentHistory=[legacy];const before=structuredClone(legacy),bundle=await createEvidenceExport(quote);
 assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual(bundle.delivery.assessmentHistory,[before]);assert.deepEqual(legacy,before);
 const claimed=structuredClone(bundle);claimed.delivery.assessmentHistory![0].requirementCompletenessPolicy=policy;assert.equal(await aiCheck(claimed),"inconsistent");
});

test("selected-revision verification
```

## tests/requirement-completeness-export.test.ts
Full-file SHA256 e0c1fea84e8fd47dac4d2de6443e8fdb705a2943cc0b2681f49046a2a649015f
Exact excerpt:
```ts
test("policy normalization never disguises the actual corrected whole-original verdict",async()=>{
 const{quote,report,packet,wire}=await scenario(),previous=structuredClone(report);delete previous.requirementCompletenessPolicy;
 const item=previous.items.find(i=>i.criterionId==="coverage-1")!;item.status="supported";item.explanation=item.sourceFinding!.explanation;delete item.evidenceNeed;
 previous.withheldRisks={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};
 const normalized=await verifyAssessmentProvenanceMetadata(report,previous,packet,quote,wire);
 assert.equal(normalized.accounting.requirementCompletenessPoliciesVerified,1);assert.equal(normalized.accounting.requirementCompletenessChecksRecomputed,quote.proof.criteria.length);
 assert.equal(Object.hasOwn(normalized.report,"requirementCompletenessPolicy"),false);assert.equal(normalized.report.items.find((i:any)=>i.criterionId==="coverage-1").status,"insufficient_evidence");
 assert.throws(()=>verifyAdditiveObligationsBaseline(normalized.report,normalized.previous,quote.proof.criteria),/field other than/u);
 const invalid=structuredClone(report);delete invalid.requirementCompletenessPolicy;await assert.rejects(verifyAssessmentProvenanceMetadata(invalid,previous,packet,quote,wire));
});
```

## Verification observed
The six new export/history/revision/strict-baseline tests and fourteen existing source-publication-export tests passed 20/20; typecheck passed. Initial test failures retained in tool transcript: copied scope stamp on a new delivery was a synthetic test construction error fixed by actually re-assessing that new delivery. Existing exported-tree English scope replay still correctly refuses a new semantic downgrade, no fixture/gold edited, no generic migration exception implemented. Known v1 finite grammar reduces English pure-price support pending explicit Stage2 language work; this limitation is not hidden.

## Review questions
Find concrete P1/P2 defects in strict schema/version membership, current/history/acceptance revalidation, no-partial-whole-pass invariant, legacy no-policy compatibility, or metadata stripping that might swallow a real verdict/explanation/citation change. The policy is unsigned supplied-data consistency, not provider authenticity. Predicate completeness alone is not source correctness. Avoid requesting broad auth/payment/new features.
