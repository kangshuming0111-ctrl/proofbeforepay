# Stage2 exact UI named-version seam
Only two whitelist expressions changed in the UI. All actions/perspective/scope/rendering logic remains existing Stage1. These are exact current-source excerpts, not a claim of full-component review.

## app/components/DeliveryAssessment.tsx
Whole-file SHA256: 907750e95eebcfe8d066777b0145952e3b828f174934addde8ba092bfd365ff4
```tsx

  function renderItem(item: ProofAssessment["items"][number], selected = false) {
    const sourcePublication = item.publicationBasis?.schema === "source-publication-v1" ? item.publicationBasis : undefined;
    const sourceFinding=item.sourceFinding;
    const criterion = criteria.find(criterion => criterion.id === item.criterionId);
    const policy=report?.requirementCompletenessPolicy;
    const completeness=criterion&&policy?.schema==="requirement-completeness-v1"&&(policy.version==="bounded-original-zh-v1"||policy.version==="bilingual-bounded-v2")
      ?createRequirementCompletenessCheck({businessSteps:scopeSteps,version:policy.version})(criterion):undefined;
    const incompleteSourceSupport=sourceFinding?.status==="supported"&&completeness?.kind==="incomplete";
    const actionableSource=!incompleteSourceSupport&&sourceFinding&&(sourceFinding.basis==="locked_business_values"||sourceFinding.scopeBinding)?sourceFinding:undefined;
    const feedbackItem=actionableSource?{...item,status:actionableSource.status,explanation:actionableSource.explanation,citations:actionableSource.citations,evidenceNeed:undefined}:item;
    const canPrepareFeedback = !readOnly && !!onPrepareFeedback && feedbackItem.status !== "supported";
    const insufficient = item.status === "insufficient_evidence";
    const lockedSource = assessmentCriterionSource(criterion, item.criterionId);
```

## app/components/ScopeClarificationPanel.tsx
Whole-file SHA256: 45b102acabf5ca347ad8ce2d0a764897b68b64aa3286ad56551ef66a6d132494
```tsx

/** A presentation of existing evidence, never a new verdict or acceptance gate. */
export function RequirementNextStep({criterion, item, evidence = [], humanConfirmed = false, businessSteps = [], requirementCompletenessPolicy, language}: RequirementNextStepProps) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const currentItem = item?.criterionId === criterion.id ? item : undefined;
  const model = currentItem?.modelJudgment ?? currentItem;
  const sourceFinding = currentItem?.sourceFinding;
  const completeness=requirementCompletenessPolicy?.schema==="requirement-completeness-v1"&&(requirementCompletenessPolicy.version==="bounded-original-zh-v1"||requirementCompletenessPolicy.version==="bilingual-bounded-v2")
    ?createRequirementCompletenessCheck({businessSteps,version:requirementCompletenessPolicy.version})(criterion):undefined;
  const incompleteSourceSupport=sourceFinding?.status==="supported"&&completeness?.kind==="incomplete";
  const currentEvidence = evidence.filter(row => row.criterionId === criterion.id);
  const ruleFailed = currentEvidence.some(row => row.finding === "fail");
  const ruleSupported = currentEvidence.some(row => row.finding === "pass");
  const ruleHuman = currentEvidence.some(row => row.finding === "needs_human");
  const need = currentItem?.status === "insufficient_evidence" && isAssessmentEvidenceNeed(currentItem.evidenceNeed) ? currentItem.evidenceNeed : undefined;
```

