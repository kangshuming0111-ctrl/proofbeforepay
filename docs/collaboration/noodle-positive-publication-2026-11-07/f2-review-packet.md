# F2 bounded positive-publication review packet

Exact current production diffs and selected direct test bodies only; the shared helper is supplied separately. Omitted unchanged code was reviewed in the preceding frozen slice. Tests are controlled local responses, not fresh model quality results.

## lib/contracts.ts
Current full-file SHA256 8f1f70c5d88f1731b14f32e957298a07ad41ee7c5f5e4bc37b5442add041a878
```diff
diff --git a/lib/contracts.ts b/lib/contracts.ts
index 1f99c45..594f2be 100644
--- a/lib/contracts.ts
+++ b/lib/contracts.ts
@@ -96,3 +96,3 @@ export type ProofAssessmentSourceFinding = {
 /** Explicit source-only reconciliation; never rewrites the retained model item. */
-export type ProofAssessmentPublicationBasis = {schema:"source-publication-v1";reason:"locked_price_mismatch"|"confirmed_form_label_absence"};
+export type ProofAssessmentPublicationBasis = {schema:"source-publication-v1";reason:"locked_price_mismatch"|"confirmed_form_label_absence"|"locked_price_match"};
 export type ProofAssessmentItem = { criterionId: string; status: "supported" | "changes_suggested" | "insufficient_evidence"; explanation: string; citations: ProofAssessmentCitation[]; ruleEvidenceIds: string[]; evidenceNeed?: ProofEvidenceNeed; obligations?: import("./assessment-obligations").AssessmentObligations; modelJudgment?: ProofAssessmentModelJudgment; sourceFinding?: ProofAssessmentSourceFinding; publicationBasis?: ProofAssessmentPublicationBasis };
```

## lib/evidence-export.ts
Current full-file SHA256 16b422826ddca6ecfd70a37ec7b2052935c73266e45ae41b1b33ef65a347f161
```diff
diff --git a/lib/evidence-export.ts b/lib/evidence-export.ts
index 0628b6b..b8349fa 100644
--- a/lib/evidence-export.ts
+++ b/lib/evidence-export.ts
@@ -216,4 +216,5 @@ function assessment(value:unknown,delivery:ProofDelivery,agreed:ProofCriterion[]
       const basis=object(result.publicationBasis,["schema","reason"],"Source publication basis");
-      requireValue(basis.schema==="source-publication-v1"&&["locked_price_mismatch","confirmed_form_label_absence"].includes(basis.reason as string),"The source publication reason is unsupported.");
-      requireValue(result.status==="changes_suggested"&&(result.modelJudgment as ProofAssessmentItem["modelJudgment"])?.status==="changes_suggested"&&(result.sourceFinding as ProofAssessmentItem["sourceFinding"])?.status==="changes_suggested","Source reconciliation must preserve a raw change and a separate negative source fact.");
+      requireValue(basis.schema==="source-publication-v1"&&["locked_price_mismatch","confirmed_form_label_absence","locked_price_match"].includes(basis.reason as string),"The source publication reason is unsupported.");
+      const expectedStatus=basis.reason==="locked_price_match"?"supported":"changes_suggested";
+      requireValue(result.status===expectedStatus&&(result.modelJudgment as ProofAssessmentItem["modelJudgment"])?.status===expectedStatus&&(result.sourceFinding as ProofAssessmentItem["sourceFinding"])?.status===expectedStatus,"Source reconciliation must preserve the matching raw status and separate exact source fact.");
     }
```

## scripts/replay-evidence-actions-2026-11-06.mjs
Current full-file SHA256 dd2b158618dd012801b8dad4e162cdf7b4dcc23d27fb068db56f6187bff2906f
```diff
diff --git a/scripts/replay-evidence-actions-2026-11-06.mjs b/scripts/replay-evidence-actions-2026-11-06.mjs
index f42338e..134675a 100644
--- a/scripts/replay-evidence-actions-2026-11-06.mjs
+++ b/scripts/replay-evidence-actions-2026-11-06.mjs
@@ -137,3 +137,3 @@ export async function verifyAssessmentProvenanceMetadata(report,previous,packet,
     assert.ok(object(item.publicationBasis)&&object(item.modelJudgment));assert.deepEqual(Object.keys(item.publicationBasis).sort(),["reason","schema"]);
-    assert.equal(item.publicationBasis.schema,"source-publication-v1");assert.ok(["locked_price_mismatch","confirmed_form_label_absence"].includes(item.publicationBasis.reason));
+    assert.equal(item.publicationBasis.schema,"source-publication-v1");assert.ok(["locked_price_mismatch","confirmed_form_label_absence","locked_price_match"].includes(item.publicationBasis.reason));
     const decision=publicationCheck(packet.criteria[index],{rawStatus:item.modelJudgment.status,rawCitations:item.modelJudgment.citations,guardedStatus:"insufficient_evidence",guardReason:item.publicationBasis.reason});
```

## Selected actual test source: tests/assessment-source-publication-export.test.ts
Full SHA256 f6307a9f1856dd72ab98dc530ce095385ceb4b0a09ca16b72c12ea3c25db7e34
```ts
test("positive price source adoption needs all original owners and replays exact fields without changing old records",async()=>{
 const q=await quote("matched"),before=structuredClone(q),report=await assessment(q,"supported"),item=report.items.find(i=>i.criterionId==="coverage-1")!;assert.deepEqual(q,before);
 assert.equal(item.modelJudgment!.status,"supported");assert.equal(item.status,"supported");assert.equal(item.sourceFinding!.status,"supported");assert.deepEqual(item.publicationBasis,{schema:"source-publication-v1",reason:"locked_price_match"});assert.equal(item.explanation,item.sourceFinding!.explanation);assert.deepEqual(item.citations,item.sourceFinding!.citations);assert.equal(item.evidenceNeed,undefined);assert.ok(item.citations.length===2);
 q.proof.delivery!.assessment=report;const bundle=await createEvidenceExport(q);assert.equal((await verifyEvidenceExport(bundle)).consistency,"consistent");assert.deepEqual(bundle.delivery.assessment!.items.find(i=>i.criterionId===item.criterionId),item);assert.deepEqual(q.proof.delivery!.files,before.proof.delivery!.files);assert.equal(q.proof.paymentState,"unfunded");assert.equal(q.proof.acceptedDeliveryId,undefined);assert.equal(report.risks.length,0);
 const fixture=JSON.parse(await readFile(new URL("./fixtures/noodle-v90-positive-export.json",import.meta.url),"utf8")),original=structuredClone(fixture.core);assert.equal((await verifyEvidenceExport(fixture.core)).consistency,"consistent");assert.equal(fixture.core.delivery.assessment.items.find((i:{criterionId:string})=>i.criterionId==="coverage-1").status,"insufficient_evidence");assert.deepEqual(fixture.core,original);
});```
```ts
test("a matched source cannot promote a raw unknown or incomplete/wrong-page original citation set",async()=>{
 for(const mode of["one","other","none"]as const){const report=await assessment(await quote("matched"),"supported",mode),item=report.items.find(i=>i.criterionId==="coverage-1")!;assert.equal(item.publicationBasis,undefined,mode);assert.equal(item.status,"insufficient_evidence",mode);assert.equal(item.sourceFinding!.status,"supported");}
 const report=await assessment(await quote("matched"),"insufficient_evidence"),item=report.items.find(i=>i.criterionId==="coverage-1")!;assert.equal(item.status,"insufficient_evidence");assert.equal(item.publicationBasis,undefined);
});```
```ts
test("all typed prices matching cannot hide an unplanned static obligation in the same original criterion",async()=>{
 const base=await quote("matched"),summary="菜单的牛肉面和Beef noodles标价必须为AUD18且营业时间必须为上午11点到晚上8点。",units=summaryCoverageUnits(summary);assert.equal(units.length,1);const u=units[0];
 const p=parseStaticProject({title:base.title,summary,amount:"1.00",requiredPages:base.proof.project!.requiredPages,manualRequirements:[],coverage:{version:1,sourceText:summary,confirmed:true,decisions:units.map(x=>({id:x.id,disposition:"include"}))},businessChecks:{confirmed:true,items:base.proof.project!.businessChecks!.map(x=>({...x,source:{start:u.start,end:u.end,excerpt:u.text}}))}},base.language);
 const d=createUploadedDelivery(base.proof.delivery!.files,p.project,base.language,1),q={...base,summary,brief:summary,proof:{...base.proof,project:p.project,criteria:p.criteria,delivery:d,review:{deliveryId:d.id,mode:"demo" as const,reviewedAt:at,summary:"Actual source checks"},collaboration:{...base.proof.collaboration!,submission:{deliveryId:d.id,at,note:"Controlled compound obligation"}}}};
 const report=await assessment(q,"supported"),item=report.items.find(i=>i.criterionId==="coverage-1")!;assert.equal(item.modelJudgment!.status,"supported");assert.equal(item.sourceFinding!.status,"supported");assert.equal(item.status,"insufficient_evidence");assert.equal(item.publicationBasis,undefined);q.proof.delivery.assessment=report;assert.equal((await verifyEvidenceExport(await createEvidenceExport(q))).consistency,"consistent");
});
```

## Selected actual replay test (controlled response construction line omitted): tests/evidence-actions-replay.test.ts
Full SHA256 87737d4a763bc72d29cf60779de0b1e09ce62f49bb762beb6d6586ab3137dfcd
```ts
test("positive source-publication metadata cannot conceal a conservative historical verdict or partial raw witness",async()=>{
 const saved=JSON.parse(await readFile(new URL("./fixtures/noodle-v90-positive-export.json",import.meta.url),"utf8")).core;
 const quote={id:saved.project.id,title:saved.project.title,summary:saved.project.summary,language:saved.project.language,status:"approved",workflow:"proof-v1",aiMode:"demo",paymentMode:"demo",proof:{project:saved.project.spec,criteria:saved.project.criteria,delivery:structuredClone(saved.delivery),scopeClarifications:saved.project.scopeClarifications,paymentState:"unfunded",audit:[],review:{deliveryId:saved.delivery.id,mode:"demo",reviewedAt:saved.delivery.submittedAt,summary:"Controlled source replay"},...(saved.project.scopeConfirmationMode==="owner-roleplay"?{demoRoleplay:true,collaboration:{stage:"submitted",feedback:[]}}:{})}} as unknown as ProofQuote;
 const id="coverage-1",item=report.items.find(i=>i.criterionId===id)!;assert.equal(item.publicationBasis!.reason,"locked_price_match");assert.equal(item.status,"supported");const verified=await verifyAssessmentProvenanceMetadata(report,structuredClone(report),packet,quote,wire);assert.equal(verified.accounting.publicationMarkersRecomputed,1);
 const old=structuredClone(report);old.publicationPolicy!.reconciledCriterionIds=[];const legacy=old.items.find(i=>i.criterionId===id)!;delete legacy.publicationBasis;legacy.status="insufficient_evidence";legacy.explanation="Controlled legacy conservative verdict.";legacy.evidenceNeed={schema:"source-evidence-need-v1",reason:"source_ambiguity",targetFiles:["menu.html"]};const compared=await verifyAssessmentProvenanceMetadata(report,old,packet,quote,wire);assert.throws(()=>verifyAdditiveObligationsBaseline(compared.report,compared.previous,packet.criteria),/field other than/u);
 for(const mutate of[(r:ProofAssessment)=>{delete r.items.find(i=>i.criterionId===id)!.publicationBasis;},(r:ProofAssessment)=>{r.items.find(i=>i.criterionId===id)!.explanation+=" changed";},(r:ProofAssessment)=>{r.items.find(i=>i.criterionId===id)!.modelJudgment!.citations=[r.items.find(i=>i.criterionId===id)!.sourceFinding!.citations[0]];}]){const r=structuredClone(report);mutate(r);await assert.rejects(verifyAssessmentProvenanceMetadata(r,report,packet,quote,wire));}
});
```

## Additional executed negative boundaries (not source excerpts in this packet)

The complete test file also checks deleted policy/marker, wrong raw status/reason, no/partial raw owner citation, CSS/hidden/style/class/handler/script, native closed containers/popover, duplicated/partial subjects, runtime fields and canonical field tampering. Relevant test log: outputs/noodle-positive-publication-2026-11-07/f2-positive-related-final.log. These executions do not imply the reviewer saw omitted test source.
