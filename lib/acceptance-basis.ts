import type {ProofQuote} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {supplementalCatalogRequiresDecision} from "./supplemental-evidence.ts";

/** A client-view precondition, not a signature or an acceptance decision.
 * Explicit nulls ensure a newly added report also invalidates an older view. */
export type AcceptanceBasis = {
  deliveryId: string;
  reviewReviewedAt: string | null;
  browserReportId: string | null;
  layoutReportId: string | null;
  assessmentId: string | null;
  riskReviewIds: string[];
  businessReportId: string | null;
  runtimeReportId: string | null;
  journeyReportId: string | null;
  journeyPlanDigest: string | null;
  modelReportId: string | null;
  supplementalCatalogDigest?: string;
};
const KEYS = ["deliveryId", "reviewReviewedAt", "browserReportId", "layoutReportId", "assessmentId", "riskReviewIds", "businessReportId", "runtimeReportId", "journeyReportId", "journeyPlanDigest", "modelReportId"] as const;
const CONTROL = /[\u0000-\u001f\u007f]/u;
function identifier(value: unknown): value is string {return typeof value === "string" && value.length > 0 && value.length <= 160 && value === value.trim() && !CONTROL.test(value);}
function schema(message: string): never {throw new DomainError(message);}
function stale(): never {throw new DomainError("The acceptance evidence changed. Refresh and review the current reports before confirming this delivery.", 409);}

/** Reads only immutable report identities and relevant current annotations.
 * This does not perform human checks, freeze a record or contact a provider. */
export function acceptanceBasis(quote: ProofQuote): AcceptanceBasis {
  const delivery = quote.proof.delivery;
  if (!delivery || !identifier(delivery.id)) throw new DomainError("Acceptance evidence needs the current delivery.", 409);
  const assessment = delivery.assessment;
  return {
    deliveryId: delivery.id,
    reviewReviewedAt: quote.proof.review?.deliveryId === delivery.id ? quote.proof.review.reviewedAt : null,
    browserReportId: delivery.browserChecks?.id ?? null,
    layoutReportId: delivery.layoutReport?.id ?? null,
    assessmentId: assessment?.id ?? null,
    riskReviewIds: (delivery.riskReviews ?? []).filter(review => review.deliveryId === delivery.id && review.assessmentId === assessment?.id).map(review => review.id).sort(),
    businessReportId: delivery.businessChecks?.id ?? null,
    runtimeReportId: delivery.runtimeReport?.id ?? null,
    journeyReportId: delivery.journeyReport?.id ?? null,
    journeyPlanDigest: delivery.journeyPlan?.planDigest ?? null,
    modelReportId: delivery.modelReport?.id ?? null,
    ...(supplementalCatalogRequiresDecision(delivery.supplementalCatalog)?{supplementalCatalogDigest:delivery.supplementalCatalog!.catalogDigest}:{}),
  };
}

/** value is the raw request.expectedEvidence object. The quote-version CAS
 * remains necessary for changes that occur after this precondition is checked. */
export function assertAcceptanceBasis(quote: ProofQuote, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) schema("Supply the complete expectedEvidence from the delivery view before accepting it.");
  const input = value as Record<string, unknown>;
  const expected = acceptanceBasis(quote),keys:string[]=[...KEYS,...(expected.supplementalCatalogDigest?["supplementalCatalogDigest"]:[])];
  if (Reflect.ownKeys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) schema("expectedEvidence must include every current report identity, using explicit null for a missing report.");
  for (const key of Reflect.ownKeys(input)) if (typeof key !== "string" || !keys.includes(key) || !("value" in Object.getOwnPropertyDescriptor(input, key)!)) schema("expectedEvidence contains unsupported fields or accessors.");
  if (!identifier(input.deliveryId)) schema("expectedEvidence needs a bounded delivery identifier.");
  if (input.reviewReviewedAt !== null && (typeof input.reviewReviewedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(input.reviewReviewedAt) || !Number.isFinite(Date.parse(input.reviewReviewedAt)) || new Date(input.reviewReviewedAt).toISOString() !== input.reviewReviewedAt)) schema("expectedEvidence needs the saved UTC rule-review timestamp or null.");
  for (const key of ["browserReportId", "layoutReportId", "assessmentId", "businessReportId", "runtimeReportId", "journeyReportId", "modelReportId"] as const) if (input[key] !== null && !identifier(input[key])) schema("expectedEvidence report identities must be bounded strings or null.");
  if (input.journeyPlanDigest !== null && (typeof input.journeyPlanDigest !== "string" || !/^[a-f0-9]{64}$/u.test(input.journeyPlanDigest))) schema("expectedEvidence needs the saved journey-plan digest or null.");
  if (!Array.isArray(input.riskReviewIds) || input.riskReviewIds.length > 100 || input.riskReviewIds.some(id => !identifier(id)) || new Set(input.riskReviewIds).size !== input.riskReviewIds.length) schema("expectedEvidence needs unique bounded risk-review identifiers.");
  if (keys.some(key => key === "riskReviewIds" ? JSON.stringify([...input.riskReviewIds as string[]].sort()) !== JSON.stringify(expected.riskReviewIds) : input[key] !== expected[key as keyof AcceptanceBasis])) stale();
}

/** Capture refers to the already accepted snapshot, including pending retries.
 * Later supplemental reports deliberately do not change this precondition. */
export function assertAcceptedSnapshotConsent(quote: ProofQuote, value: unknown): void {
  const frozen = quote.proof.acceptedEvidenceSnapshotId ?? quote.proof.collaboration?.acceptance?.evidenceSnapshotId;
  if (!identifier(frozen)) throw new DomainError("The frozen acceptance snapshot is unavailable. A new capture cannot be confirmed from an unknown historical acceptance.", 409);
  if (!identifier(value)) schema("Supply acceptedEvidenceSnapshotId from the frozen acceptance before confirming this payment.");
  if (value !== frozen) throw new DomainError("This payment consent references a different accepted evidence snapshot. Refresh before confirming the same payment.", 409);
}
