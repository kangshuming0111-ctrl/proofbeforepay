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
export type ProofLayoutUnavailableReason = "missing_file" | "load_failed" | "navigation_changed" | "access_denied" | "timeout" | "unstable_layout" | "snapshot_mismatch";
export type ProofLayoutReading =
  | { file: string; viewportWidth: ProofLayoutWidth; status: "measured"; clientWidth: number; scrollWidth: number; overflowPx: number; outcome: "overflow" | "no_overflow" }
  | { file: string; viewportWidth: ProofLayoutWidth; status: "unavailable"; reason: ProofLayoutUnavailableReason };
export type ProofLayoutReport = {
  id: string;
  deliveryId: string;
  method: "browser-observation-v1";
  receivedAt: string;
  viewportHeight: 800;
  readings: ProofLayoutReading[];
  summary: { measured: number; unavailable: number; overflow: number };
};
/** Exact original-file substring; start/end are UTF-16 code-unit offsets, [start,end). */
export type ProofAssessmentCitation = { file: string; start: number; end: number; excerpt: string };
export type ProofAssessmentItem = { criterionId: string; status: "supported" | "changes_suggested" | "insufficient_evidence"; explanation: string; citations: ProofAssessmentCitation[]; ruleEvidenceIds: string[] };
export type ProofAssessmentRisk = { title: string; explanation: string; suggestion: string; citations: ProofAssessmentCitation[] };
/** Append-only human annotations; never edits the source model report or accepts work. */
export type ProofRiskReview = { id: string; deliveryId: string; assessmentId: string; riskIndex: number; decision: "confirmed" | "rejected" | "needs_evidence"; reason: string; actorRole: ProofRole; reviewedAt: string };
export type ProofResourceReport = { method: "static-resources-v1"; checked: number; findings: { from: string; reference: string; target?: string; kind: "missing" | "blocked" | "uninspectable" }[] };
export type ProofAssessment = {
  id: string; deliveryId: string; method: "source-ai-v1"; mode: "live"; model: string; assessedAt: string;
  items: ProofAssessmentItem[]; risks: ProofAssessmentRisk[]; limitations: string[];
  coverage: { includedFiles: string[]; truncatedFiles: string[]; omittedFiles: string[] };
  usage?: { promptTokens: number; completionTokens: number };
};
export type ProofDelivery = { id: string; variant: "flawed" | "fixed" | "upload"; sequence?: number; label: string; submittedAt: string; evidence: ProofEvidence[]; files?: Record<string, string>; layoutReport?: ProofLayoutReport; assessment?: ProofAssessment; riskReviews?: ProofRiskReview[]; resources?: ProofResourceReport };
export type ProofReview = { deliveryId: string; reviewedAt: string; mode: "demo" | "live"; summary: string };
export type ProofRole = "buyer" | "seller";
export type ProofSubmission = { deliveryId: string; note: string; at: string };
export type ProofFeedback = { id: string; deliveryId: string; criterionId: string; comment: string; at: string };
export type ProofCollaboration = {
  stage: "awaiting_seller" | "in_progress" | "submitted" | "changes_requested" | "accepted";
  sellerName?: string;
  sellerJoinedAt?: string;
  submission?: ProofSubmission;
  acceptance?: { deliveryId: string; at: string; manualChecks: string[] };
  feedback: ProofFeedback[];
};
export type ProofDeliveryVersion = { isCurrent?: boolean; delivery: ProofDelivery; review?: ProofReview; submission?: ProofSubmission; feedback: ProofFeedback[]; archivedAt: string };
export type StaticProjectSpec = {
  requiredPages: string[];
  link?: { from: string; text: string; to: string };
  manualRequirements: string[];
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
export type ProofEvent = { at: string; kind: "created" | "scope_approved" | "seller_joined" | "authorized" | "delivery_submitted" | "delivery_sent" | "changes_requested" | "delivery_accepted" | "reviewed" | "assessed" | "risk_reviewed" | "layout_checked" | "accepted" | "captured" | "voided" | "payment_closed" | "payment_reconciled"; deliveryId?: string };
export type ProofState = {
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
  acceptedAt?: string;
  manualChecks?: string[];
  paymentOperation?: "capture" | "void";
  audit: ProofEvent[];
};
export type ProofQuote = Quote & { workflow: "proof-v1"; proof: ProofState };
