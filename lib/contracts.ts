export type Currency = "AUD" | "USD";
export type Language = "zh" | "en";
export type LineItem = { id: string; description: string; quantity: number; unitPriceCents: number };
export type QuoteDraft = {
  title: string;
  summary: string;
  lineItems: LineItem[];
  assumptions: string[];
  questions: string[];
  timelineDays: number;
};
export type Quote = QuoteDraft & {
  id: string;
  reference: string;
  brief: string;
  clientName: string;
  currency: Currency;
  language: Language;
  hourlyRateCents: number;
  totalCents: number;
  status: "draft" | "approved" | "paid";
  aiMode: "demo" | "live";
  paymentMode: "demo" | "sandbox";
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
  paypalOrderId?: string;
  paypalApprovalUrl?: string;
  captureId?: string;
  workflow?: "proof-v1";
  proof?: ProofState;
};
export type BriefInput = { brief: string; clientName: string; currency: Currency; language: Language; hourlyRate: number };
export type AppConfig = { aiMode: "demo" | "live"; paymentMode: "demo" | "sandbox"; model: string };
export type CheckoutResult = { mode: "demo" | "sandbox"; orderId: string; approvalUrl?: string };

export type ProofCriterion = { id: string; title: string; source: string };
export type ProofEvidence = { id: string; criterionId: string; file: string; excerpt: string; finding: "pass" | "fail" | "needs_human"; explanation: string };
export type ProofLayoutWidth = 375 | 900;
export type ProofLayoutUnavailableReason = "missing_file" | "load_failed" | "navigation_changed" | "access_denied" | "timeout" | "unstable_layout" | "snapshot_mismatch" | "response_type_mismatch" | "response_identity_mismatch" | "source_mismatch" | "rendered_snapshot_mismatch";
export type ProofLayoutReading =
  | { file: string; viewportWidth: ProofLayoutWidth; status: "measured"; clientWidth: number; scrollWidth: number; overflowPx: number; outcome: "overflow" | "no_overflow" }
  | { file: string; viewportWidth: ProofLayoutWidth; status: "unavailable"; reason: ProofLayoutUnavailableReason };
export type ProofLayoutReport = {
  id: string;
  deliveryId: string;
  reportedByRole?: ProofRole;
  method: "browser-observation-v1";
  receivedAt: string;
  viewportHeight: 800;
  readings: ProofLayoutReading[];
  summary: { measured: number; unavailable: number; overflow: number };
};
export type ProofBrowserCheckReason = "missing_file" | "load_failed" | "snapshot_mismatch" | "access_denied" | "timeout" | "navigation_changed" | "ambiguous_link" | "unsupported_target" | "resource_limit";
export type ProofBrowserCheckReading =
  | { stepId: string; status: "unavailable"; reason: ProofBrowserCheckReason }
  | { stepId: string; status: "observed"; kind: "page"; stylesExpected: number; stylesLoaded: number; imagesExpected: number; imagesLoaded: number }
  | { stepId: string; status: "observed"; kind: "link"; sourceVisible: boolean; sourceHitTarget: boolean; activated: boolean; destinationMatched: boolean; targetVisible: boolean };
export type ProofBrowserCheckStep = { stepId: string; kind: "page" | "link"; file: string; viewportWidth: ProofLayoutWidth; label?: string; target?: string };
export type ProofBrowserCheckReport = {
  id: string; deliveryId: string; method: "client-browser-checks-v1"; receivedAt: string; viewportHeight: 800;
  reportedByRole?: ProofRole;
  readings: (ProofBrowserCheckReading & ProofBrowserCheckStep & { outcome: "expected_observation" | "mismatch" | "unavailable" })[];
  summary: { steps: number; observed: number; issues: number; unavailable: number };
};
/** Buyer-confirmed expectations; source offsets refer to the original requirement summary. */
export type ProofBusinessExpected = { kind: "visible_copy"; text: string } | { kind: "item_price"; label: string; amountMinor: number; currency: "AUD" | "USD" };
export type ProofBusinessCheck = { id: string; criterionId: string; file: string; source: RequirementSource; expected: ProofBusinessExpected };
export type ProofBusinessCheckStep = Omit<ProofBusinessCheck, "id"> & { stepId: string; checkId: string; viewportWidth: ProofLayoutWidth };
export type ProofBusinessCheckReading =
  | { stepId: string; status: "observed"; blocks: string[] }
  | { stepId: string; status: "unavailable"; reason: ProofBrowserCheckReason | "ambiguous_content" | "text_limit" };
export type ProofBusinessCheckReport = {
  id: string; deliveryId: string; method: "client-business-content-v1"; receivedAt: string; reportedByRole?: ProofRole;
  readings: (ProofBusinessCheckStep & ProofBusinessCheckReading & { outcome: "expected_observation" | "mismatch" | "unavailable"; explanation: string })[];
  summary: { steps: number; observed: number; issues: number; unavailable: number };
};
/** Exact original-file substring; start/end are UTF-16 code-unit offsets, [start,end). */
export type ProofAssessmentCitation = { file: string; start: number; end: number; excerpt: string };
export type ProofEvidenceNeed = {
  schema: "source-evidence-need-v1";
  reason: "browser_observation" | "direct_observation" | "financial_execution" | "record_readback" | "requirement_clarification" | "manual_interpretation" | "page_scope" | "page_citations" | "field_relationship" | "source_ambiguity" | "no_citations" | "model_unresolved";
  targetFiles: string[];
};
/** The strict decoded item before publication guards; this is not a provider signature. */
export type ProofAssessmentModelJudgment = {status: "supported" | "changes_suggested" | "insufficient_evidence"; explanation: string; citations: ProofAssessmentCitation[]};
/** Independent, replayable source-only finding. It never attests rendering,
 * persistence, acceptance or payment, and does not rewrite the raw model item. */
export type ProofAssessmentSourceFinding = {
  version: "source-finding-v1";
  status: "supported" | "changes_suggested" | "insufficient_evidence";
  basis: "declared_html_labels" | "locked_business_values";
  explanation: string; citations: ProofAssessmentCitation[]; files: string[];
  scopeBinding?: {proposalId: string; proposalDigest: string; file: string; kind: "page" | "form"; formId?: string};
};
/** Explicit source-only reconciliation; never rewrites the retained model item. */
export type ProofAssessmentPublicationBasis = {schema:"source-publication-v1";reason:"locked_price_mismatch"|"confirmed_form_label_absence"|"locked_price_match"};
export type ProofAssessmentItem = { criterionId: string; status: "supported" | "changes_suggested" | "insufficient_evidence"; explanation: string; citations: ProofAssessmentCitation[]; ruleEvidenceIds: string[]; evidenceNeed?: ProofEvidenceNeed; obligations?: import("./assessment-obligations").AssessmentObligations; modelJudgment?: ProofAssessmentModelJudgment; sourceFinding?: ProofAssessmentSourceFinding; publicationBasis?: ProofAssessmentPublicationBasis };
export type ProofAssessmentRisk = { title: string; explanation: string; suggestion: string; citations: ProofAssessmentCitation[] };
/** Validated original AI leads retained outside the active indication pool.
 * v1 preserves status-adjustment publication; v2 records an independently
 * bounded source-scope gate; v3 separately records unchanged insufficient
 * custom requirements needing observation, without invented adjustments.
 * v4 retains otherwise-unbound optional source leads outside actionable findings. */
export type ProofAssessmentWithheldRisks = ({version: 1; reason: "item_status_adjusted" | "not_withheld"}
  | {version: 2; reason: "source_scope_unestablished"; scopeCriterionIds: string[]}
  | {version: 3; reason: "custom_scope_requires_observation"; scopeCriterionIds: string[]}
  | {version: 4; reason: "optional_source_leads_unverified"}) & {
  adjustedCriteria: {criterionId: string; originalStatus: ProofAssessmentItem["status"]; publishedStatus: ProofAssessmentItem["status"]}[];
  entries: {originalRiskIndex: number; risk: ProofAssessmentRisk}[];
};
/** Append-only human annotations; never edits the source model report or accepts work.
 * Absent riskOrigin retains legacy published indices; withheld is a separate pool. */
export type ProofRiskReview = { id: string; deliveryId: string; assessmentId: string; riskIndex: number; riskOrigin?: "withheld"; decision: "confirmed" | "rejected" | "needs_evidence"; reason: string; actorRole: ProofRole; reviewedAt: string };
export type ProofResourceReport = { method: "static-resources-v1"; checked: number; findings: { from: string; reference: string; target?: string; kind: "missing" | "blocked" | "uninspectable" }[] };
export type ProofAssessment = {
  publicationPolicy?: {schema:"source-publication-v1";reconciledCriterionIds:string[]};
  scopeContext?: import("./scope-clarifications").ScopeAssessmentContext;
  id: string; deliveryId: string; method: "source-ai-v1"; mode: "live"; model: string; assessedAt: string;
  items: ProofAssessmentItem[]; risks: ProofAssessmentRisk[]; limitations: string[];
  withheldRisks?: ProofAssessmentWithheldRisks;
  coverage: { includedFiles: string[]; truncatedFiles: string[]; omittedFiles: string[] };
  usage?: { promptTokens: number; completionTokens: number };
};
export type ProofDelivery = {
  assessmentHistory?: ProofAssessment[];
  /** Participant-supplied appendix; never an acceptance or execution attestation. */
  cooperativeStageReports?: import("./cooperative-stage-evidence").CooperativeStageReport[];
  enquiryPlan?: import("./project-enquiry").ProjectEnquiryPlan;
  enquiryRun?: import("./project-enquiry").ProjectEnquiryRun;
  enquiryReport?: import("./project-enquiry").ProjectEnquiryReport;
  enquiryHistory?: import("./project-enquiry").ProjectEnquiryReport[];
  enquiryEvidenceReservation?: {runId:string;reportBytes:number;acceptanceBytes:number};
  id: string; variant: "flawed" | "fixed" | "upload"; sequence?: number; label: string; submittedAt: string; evidence: ProofEvidence[]; files?: Record<string, string>; layoutReport?: ProofLayoutReport; layoutHistory?: ProofLayoutReport[]; browserChecks?: ProofBrowserCheckReport; browserCheckHistory?: ProofBrowserCheckReport[]; businessChecks?: ProofBusinessCheckReport; businessCheckHistory?: ProofBusinessCheckReport[]; acceptanceEvidence?: ProofAcceptanceEvidence[]; assessment?: ProofAssessment; riskReviews?: ProofRiskReview[]; resources?: ProofResourceReport;
  journeyPlan?: import("./project-journey").ProjectJourneyPlan;
  journeyPlanSuggestions?: import("./journey-plan-adoption").SavedJourneyPlanSuggestions;
  journeyPlanAdoption?: import("./journey-plan-adoption").JourneyPlanAdoption;
  journeyExplanation?: import("./journey-evidence-explanation").JourneyEvidenceExplanation;
  journeyReport?: import("./project-journey").ProjectJourneyReport;
  journeyHistory?: import("./project-journey").ProjectJourneyReport[];
  journeyRun?: import("./project-journey").ProjectJourneyRun;
  journeyEvidenceReservation?: {runId?:string;reportBytes:number;acceptanceBytes:number};
  transferCompetitionRun?: import("./transfer-competition").TransferLease;
  modelRun?: import("./model-check-actions").ModelCheckRun;
  modelReport?: import("./model-checks").ModelCheckReport;
  modelHistory?: import("./model-checks").ModelCheckReport[];
  modelArchiveRefs?: import("./model-report-archive").ModelArchiveRef[];
  modelArchive?: import("./model-report-archive").ModelArchiveObject[];
  modelExplanation?: import("./model-evidence-explanation").ModelEvidenceExplanation;
  modelEvidenceReservation?: {runId?:string;reportBytes:number;acceptanceBytes:number};
  backendTargetId?: string;
  runtimeDeliveryDigest?: string;
  runtimeRegistration?: import("./runtime-registration").RuntimeRegistrationSnapshot;
  runtimeReport?: import("./runtime-checks").RuntimeCheckReport;
  runtimeHistory?: import("./runtime-checks").RuntimeCheckReport[];
  runtimeRun?: {id:string;deliveryId:string;deliveryDigest:string;targetId:string;startedAt:string;expiresAt:string};
  evidenceReservation?: {runtimeRunId?:string;reportBytes:number;acceptanceBytes:number};
  /** Server-derived transport view; never stored as the authoritative report. */
  supplementalCatalog?: import("./supplemental-evidence").SupplementalEvidenceCatalog;
  supplementalDecision?: import("./supplemental-evidence").SupplementalEvidenceDecision;
};
export type ProofReview = { deliveryId: string; reviewedAt: string; mode: "demo" | "live"; summary: string };
export type ProofRole = "buyer" | "seller";
export type ProofSubmission = { deliveryId: string; note: string; at: string };
export type ProofFeedback = { id: string; deliveryId: string; criterionId: string; comment: string; at: string; journeyReportId?: string; modelReportId?: string; riskSource?: import("./risk-repairs").RiskFeedbackSource };
export type ProofAcceptanceEvidence = {
  id: string; deliveryId: string; at: string;
  supplementalDecision?: import("./supplemental-evidence").SupplementalEvidenceDecision;
  enquiryReportId?:string; enquiryDeliveryDigest?:string; enquiryDecision?:import("./project-enquiry").ProjectEnquiryDecision;
  browserReportId: string | null; layoutReportId: string | null; assessmentId: string | null;
  businessReportId?: string | null; businessExceptionReason?: string;
  runtimeReportId?: string | null; runtimeExceptionReason?: string; runtimeAcknowledgedSteps?: string[]; runtimeDeliveryDigest?: string; runtimeTargetId?: string;
  runtimeRegistration?: import("./runtime-registration").RuntimeRegistrationSnapshot;
  journeyReportId?: string; journeyDeliveryDigest?: string; journeyPlanDigest?: string;
  journeyRegistration?: import("./project-journey").JourneyRegistrationSnapshot;
  journeyExceptionReason?: string; journeyAcknowledgedSteps?: string[];
  journeyClientObservationAcknowledged?: true;
  modelReportId?: string; modelSpecDigest?: string; modelDeliveryDigest?: string;
  modelDecision?: import("./model-check-actions").ModelDecision;
  criteria: ProofCriterion[]; evidence: ProofEvidence[]; manualChecks: string[];
  review?: ProofReview; assessment?: ProofAssessment;
  riskReviews: ProofRiskReview[];
};
export type ProofCollaboration = {
  stage: "awaiting_seller" | "in_progress" | "submitted" | "changes_requested" | "accepted";
  sellerName?: string;
  sellerJoinedAt?: string;
  submission?: ProofSubmission;
  acceptance?: { deliveryId: string; at: string; manualChecks: string[]; evidenceSnapshotId?: string };
  feedback: ProofFeedback[];
  /** Append-only human repair proposals and reviews; never automatic acceptance. */
  riskRepairEvents?: import("./risk-repairs").RiskRepairEvent[];
};
export type ProofDeliveryVersion = { isCurrent?: boolean; delivery: ProofDelivery; review?: ProofReview; submission?: ProofSubmission; feedback: ProofFeedback[]; archivedAt: string; scopeClarifications?: import("./scope-clarifications").ScopeClarification[] };
export type RequirementCoverageUnit = { id: string; start: number; end: number; text: string };
export type RequirementCoverageDecision = RequirementCoverageUnit & { disposition: "include" | "exclude"; reason?: string; criterionId?: string };
export type RequirementCoverage = { version: 1; sourceText: string; confirmedAt: string; decisions: RequirementCoverageDecision[] };
export type StaticProjectSpec = {
  requiredPages: string[];
  link?: { from: string; text: string; to: string };
  links?: { from: string; text: string; to: string }[];
  manualRequirements: string[];
  coverage?: RequirementCoverage;
  businessChecks?: ProofBusinessCheck[];
  runtimeCheck?: import("./runtime-checks").RuntimeCheckPlan;
};
export type RequirementSource = { start: number; end: number; excerpt: string };
export type RequirementExtraction = {
  sourceText: string;
  sourceName?: string;
  mode: "rules" | "live";
  model?: string;
  extractedAt: string;
  pages: { file: string; source: RequirementSource }[];
  link?: { from: string; text: string; to: string; source: RequirementSource };
  manualRequirements: { text: string; source: RequirementSource }[];
  unresolved: { source: RequirementSource; reason: string }[];
  warnings: string[];
};
export type RequirementDraft = RequirementExtraction & { id: string };
export type RequirementAgreement = {
  draftId: string;
  sourceText: string;
  sourceName?: string;
  mode: "rules" | "live";
  model?: string;
  extractedAt: string;
  confirmedAt: string;
  sourceRefs: { criterionId: string; source: RequirementSource }[];
  unresolved: RequirementExtraction["unresolved"];
  warnings: string[];
};
export type ProofPaymentReconciliation =
  | { kind: "captured"; captureId: string; verifiedAt: string }
  | { kind: "voided"; verifiedAt: string }
  | { kind: "closed_unpaid"; reason: "authorization_denied"; verifiedAt: string }
  | { kind: "unresolved"; reason: "pending" | "authorization_still_active" | "provider_unavailable" | "inconsistent_resources" };
export type ProofEvent = { at: string; kind: "created" | "scope_approved" | "seller_joined" | "authorized" | "delivery_submitted" | "delivery_sent" | "changes_requested" | "delivery_accepted" | "reviewed" | "assessed" | "risk_reviewed" | "risk_repair_proposed" | "risk_repair_reviewed" | "layout_checked" | "browser_checked" | "business_checked" | "accepted" | "captured" | "voided" | "payment_closed" | "payment_reconciled"; deliveryId?: string; reportId?: string; evidenceSnapshotId?: string; feedbackId?: string };
export type ProofState = {
  scopeClarifications?: import("./scope-clarifications").ScopeClarification[];
  requirements?: RequirementAgreement;
  demoRoleplay?: true;
  /** Explicitly created one-owner PayPal Sandbox rehearsal, never seller settlement. */
  sandboxRehearsal?: true;
  /** Explicit two-account Sandbox origin; configured test merchant, never seller settlement. */
  sandboxCollaboration?: true;
  /** Server-recorded origin; role play alone never permits fixed sample files. */
  demoSampleProject?: boolean;
  project?: StaticProjectSpec;
  collaboration?: ProofCollaboration;
  criteria: ProofCriterion[];
  paymentState: "unfunded" | "authorized" | "captured" | "voided" | "closed_unpaid";
  paymentClosure?: { reason: "authorization_denied"; verifiedAt: string };
  authorizationId?: string;
  authorizedAt?: string;
  authorizationExpiresAt?: string;
  delivery?: ProofDelivery;
  review?: ProofReview;
  acceptedDeliveryId?: string;
  acceptedEvidenceSnapshotId?: string;
  acceptedAt?: string;
  manualChecks?: string[];
  paymentOperation?: "capture" | "void";
  audit: ProofEvent[];
};
export type ProofQuote = Quote & { workflow: "proof-v1"; proof: ProofState };
