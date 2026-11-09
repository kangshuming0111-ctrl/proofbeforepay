import {assertEnquiryAcceptance} from "@/lib/project-enquiry";
import type { ProofEvent, ProofQuote } from "@/lib/contracts";
import { requireProof, requireActiveAuthorization, validateAcceptance, applyPaymentReconciliation } from "@/lib/proof-domain";
import { createProofDelivery } from "@/lib/proof-evidence";
import { createUploadedDelivery } from "@/lib/static-project";
import { recordLayoutReport } from "@/lib/layout-report";
import { validateBusinessDecision } from "@/lib/business-decision";
import { recordCaptureConsent } from "@/lib/acceptance-evidence";
import { assertAcceptedSnapshotConsent } from "@/lib/acceptance-basis";
import { assessDelivery } from "@/lib/delivery-assessment";
import {AssessmentResponseError} from "@/lib/assessment-response";
import {assessmentFailureResponse} from "@/lib/assessment-failure-presentation";
import { acceptDelivery, joinSeller, prepareReplacement, requestChanges, requireExpectedDelivery, requireWorkflowAction, submitDelivery, type ProofWorkflowAction } from "@/lib/proof-workflow";
import { createRoleplayDelivery, isDemoRoleplay, isOwnerRoleplay, preparedDemoDeliveryNote } from "@/lib/proof-demo";
import { issueInvitation, proofActor, proofResponse, readProofCase, saveProofCase } from "@/lib/proof-store";
import { authorizeOrder, captureAuthorization, createAuthorizationOrder, ProviderError, reconcileProofPayment, reviewProof, voidAuthorization } from "@/lib/providers";
import { body, handle, HttpError, json, providerEnv } from "@/lib/server";
import { runtimeDeliveryDigest, savedRuntimePlan } from "@/lib/runtime-project";
import {resolveUploadRuntimeTarget} from "@/lib/server-runtime-targets";
export const dynamic = "force-dynamic";

function log(quote: ProofQuote, kind: ProofEvent["kind"], deliveryId?: string): ProofQuote {
  return {...quote, proof: {...quote.proof, audit: [...quote.proof.audit, {at: new Date().toISOString(), kind, ...(deliveryId ? {deliveryId} : {})}]}};
}

export async function POST(request: Request, context: {params: Promise<{id: string; action: string}>}) {
  return handle(async () => {
    const actor = proofActor(request, true);
    const {id, action} = await context.params;
    if (!["approve", "checkout", "authorize", "delivery", "review", "assess", "layout", "capture", "void", "reconcile", "invite", "submit_delivery", "return", "accept_delivery"].includes(action)) throw new HttpError(404, "Unknown agreement action.");
    const stored = await readProofCase(id, actor);
    requireProof(stored.quote);
    let quote: ProofQuote = stored.quote;
    if (quote.proof.demoRoleplay && !isOwnerRoleplay(quote)) throw new HttpError(409, "This role-play record has an invalid provider or workflow configuration.");
    requireWorkflowAction(quote, stored.role, action as ProofWorkflowAction);
    const input = await body(request, action === "delivery" ? 2 * 1024 * 1024 : action === "return" ? 96_000 : 24_000);
    if (["accept_delivery","capture","void","checkout","authorize","return","delivery","submit_delivery"].includes(action) && (quote.proof.delivery?.runtimeRun || quote.proof.delivery?.journeyRun || quote.proof.delivery?.modelRun || quote.proof.delivery?.transferCompetitionRun||quote.proof.delivery?.enquiryRun)) throw new HttpError(409,"Finish the pending backend or model check before changing acceptance, delivery or payment.");
    if (["accept_delivery","capture"].includes(action) && quote.proof.delivery?.journeyPlan && quote.proof.delivery.journeyReport && await runtimeDeliveryDigest(quote.proof.delivery.files)!==quote.proof.delivery.journeyReport.deliveryDigest) throw new HttpError(409,"The accepted journey file binding is inconsistent.");
    if (["accept_delivery","capture"].includes(action) && savedRuntimePlan(quote) && quote.proof.delivery && await runtimeDeliveryDigest(quote.proof.delivery.files)!==quote.proof.delivery.runtimeDeliveryDigest) throw new HttpError(409,"The accepted backend file binding is inconsistent.");
    if (["accept_delivery","capture"].includes(action) && quote.proof.delivery?.enquiryPlan && await runtimeDeliveryDigest(quote.proof.delivery.files)!==quote.proof.delivery.enquiryPlan.deliveryDigest) throw new HttpError(409,"The enquiry file binding is inconsistent.");
    if (["accept_delivery","capture"].includes(action) && quote.proof.delivery?.modelReport && await runtimeDeliveryDigest(quote.proof.delivery.files)!==quote.proof.delivery.modelReport.deliveryDigest) throw new HttpError(409,"The model-check file binding is inconsistent.");
    const config = isDemoRoleplay(quote) ? {} : providerEnv();
    const persist = async (next: ProofQuote, archive = false) => {await saveProofCase(stored, next, {archive}); quote = next;};
    const response = () => json(proofResponse(stored, quote));

    if (action === "invite") {
      if (quote.proof.demoRoleplay) throw new HttpError(409, "Demo role play uses the seller workspace and does not send invitations.");
      if (input.revoke === true) {
        await saveProofCase(stored, quote, {invitation: null});
        return response();
      }
      const invitation = await issueInvitation(stored, input.email, actor);
      return json({...proofResponse(stored), invitation});
    }
    if (action === "submit_delivery") { await persist(submitDelivery(quote, input)); return response(); }
    if (action === "return") { await persist(requestChanges(quote, input)); return response(); }
    if (action === "accept_delivery") { await assertEnquiryAcceptance(quote,input.enquiryDecision); await persist(acceptDelivery(quote, input)); return response(); }

    if (action === "approve") {
      if (quote.status !== "draft") return response();
      const approved = log({...quote, status: "approved", approvedAt: new Date().toISOString()}, "scope_approved");
      await persist(quote.proof.demoRoleplay ? joinSeller(approved, quote.language === "zh" ? "演示卖家" : "Demo seller") : approved);
      return response();
    }
    if (quote.status === "draft") throw new HttpError(409, "Approve the exact scope before continuing.");
    if (action === "checkout") {
      if (quote.proof.paymentState !== "unfunded") throw new HttpError(409, "This agreement already has a payment outcome or authorization.");
      if (quote.paypalOrderId) return json({mode: quote.paymentMode, orderId: quote.paypalOrderId, approvalUrl: quote.paypalApprovalUrl});
      const checkout = quote.paymentMode === "demo" ? {orderId: `DEMO-${quote.id}`, approvalUrl: undefined} : await createAuthorizationOrder(quote, config, new URL(request.url).origin);
      await persist({...quote, paypalOrderId: checkout.orderId, paypalApprovalUrl: checkout.approvalUrl});
      return json({mode: quote.paymentMode, ...checkout});
    }
    if (action === "authorize") {
      if (!quote.paypalOrderId || input.orderId !== quote.paypalOrderId) throw new HttpError(409, "This authorization does not match the saved order.");
      if (quote.proof.paymentState === "authorized") return response();
      if (quote.proof.paymentState !== "unfunded") throw new HttpError(409, "This agreement is already finished.");
      const result = quote.paymentMode === "demo" ? {authorizationId: `SIM-AUTH-${quote.id}`, expiresAt: undefined} : await authorizeOrder(quote, config);
      const at = new Date().toISOString();
      // The product deliberately uses a 24h acceptance window, never promises escrow.
      const limit = Date.now() + 24 * 60 * 60 * 1000;
      const upstream = result.expiresAt ? Date.parse(result.expiresAt) : limit;
      if (!Number.isFinite(upstream) || upstream <= Date.now()) throw new HttpError(409, "The provider authorization has expired.");
      await persist(log({...quote, proof: {...quote.proof, paymentState: "authorized", authorizationId: result.authorizationId, authorizedAt: at, authorizationExpiresAt: new Date(Math.min(limit, upstream)).toISOString()}}, "authorized"));
      return response();
    }
    if (action === "delivery" || action === "review" || action === "assess" || action === "layout") {
      // A locked custom agreement can be checked before visiting PayPal.
      // Capture still requires an active authorization and explicit acceptance.
      if (quote.proof.project && quote.proof.paymentState === "unfunded") {
        if (quote.status !== "approved") throw new HttpError(409, "Approve the exact scope before checking a delivery.");
      } else requireActiveAuthorization(quote);
      if (quote.proof.paymentOperation) throw new HttpError(409, "Finish the pending payment operation before changing the delivery.");
      if (action === "assess") {
        const delivery = quote.proof.delivery;
        if (!delivery || input.deliveryId !== delivery.id) throw new HttpError(409, "AI assessment must use the current delivery version.");
        if (input.confirm !== true) throw new HttpError(400, "Confirm sending the current requirements and saved source files to DeepSeek.");
        if (quote.proof.review?.deliveryId !== delivery.id) throw new HttpError(409, "Run the current delivery's rule checks before requesting AI advice.");
        if (delivery.assessment?.deliveryId === delivery.id) return response();
        // This explicit opt-in is independent of role-play's provider-free rule review/payment.
        // No contract is required and no financial mode or rule finding is changed.
        let assessment;
        try {assessment = await assessDelivery(quote, providerEnv());}
        catch(error) {
          if(error instanceof AssessmentResponseError)return json(assessmentFailureResponse(error,quote.language),502);
          if(error instanceof ProviderError)return json({error:quote.language==="zh"
            ? "本次 DeepSeek 评估未生成报告。可以先打开交付预览核对网页，或稍后重新运行 AI 评估。已有规则结果和验收决定保持不变。"
            : "DeepSeek did not produce a report this time. Inspect the delivery preview now, or rerun the AI assessment later. Saved rule results and acceptance decisions are unchanged."},502);
          throw error;
        }
        await persist(log({...quote, proof: {...quote.proof, delivery: {...delivery, assessment}}}, "assessed", delivery.id));
        return response();
      }
      if (action === "delivery") {
        if(Object.keys(input).some(key=>!["files","variant","expectedDeliveryId","reviewRules","backendTargetId","submitSample"].includes(key)))throw new HttpError(400,"Delivery uploads do not accept backend URLs, scripts, credentials or client registration snapshots.");
        requireExpectedDelivery(quote, input);
        if (input.reviewRules !== undefined && typeof input.reviewRules !== "boolean") throw new HttpError(400, "Choose whether to run the delivery's rule checks with a boolean flag.");
        const sampleExample = quote.proof.demoExample;
        const sendPreparedRevision = input.submitSample === true;
        if (input.submitSample !== undefined && (!sendPreparedRevision || !isDemoRoleplay(quote) || !sampleExample
          || quote.proof.collaboration?.stage !== "changes_requested" || input.variant !== "fixed" || input.files !== undefined)) {
          throw new HttpError(400, "A prepared revision is available only for a returned built-in demo.");
        }
        const sequence = quote.proof.audit.filter(event => event.kind === "delivery_submitted").length + 1;
        let delivery;
        if (quote.proof.demoRoleplay) {
          delivery = createRoleplayDelivery(quote, input, sequence);
        } else if (quote.proof.project) {
          if (input.variant !== undefined) throw new HttpError(400, "Upload your own files for this custom agreement.");
          delivery = createUploadedDelivery(input.files, quote.proof.project, quote.language, sequence);
        } else {
          if (input.variant !== "flawed" && input.variant !== "fixed" || input.files !== undefined) throw new HttpError(400, "Choose one of the two sample deliveries, or create a custom agreement to upload your files.");
          delivery = {...createProofDelivery(input.variant, quote.language), sequence};
        }
        const backendPlan=savedRuntimePlan(quote);
        if (backendPlan) {
          const digest=await runtimeDeliveryDigest(delivery.files);
          const {target,registration}=resolveUploadRuntimeTarget(quote,input.backendTargetId,digest);
          delivery.backendTargetId = target.id;
          delivery.runtimeDeliveryDigest = digest;
          if(registration)delivery.runtimeRegistration=registration;
        } else if (input.backendTargetId !== undefined) throw new HttpError(400,"A backend target requires a buyer-confirmed backend check plan.");
        const replaced = quote.proof.collaboration ? prepareReplacement(quote, delivery)
          : {...quote, proof: {...quote.proof, delivery, review: undefined, acceptedAt: undefined, acceptedDeliveryId: undefined, acceptedEvidenceSnapshotId: undefined, manualChecks: undefined}};
        let next = log(replaced, "delivery_submitted", delivery.id);
        if (input.reviewRules === true || sendPreparedRevision) {
          // Save the files and their immediate, provider-free rule summary in one CAS.
          // Explicit source assessment, seller submission and buyer decisions stay separate.
          const result = await reviewProof(next, {});
          next = log({...next, aiMode: result.mode, proof: {...next.proof, review: {deliveryId: delivery.id, reviewedAt: new Date().toISOString(), ...result}}}, "reviewed", delivery.id);
        }
        if (sendPreparedRevision && sampleExample) {
          next = submitDelivery(next, {deliveryId: delivery.id, note: preparedDemoDeliveryNote(quote.language, sampleExample, "fixed")});
        }
        await persist(next, true);
      } else if (action === "review") {
        if (!quote.proof.delivery) throw new HttpError(409, "Select a delivery before reviewing it.");
        if (input.deliveryId !== undefined && input.deliveryId !== quote.proof.delivery.id) throw new HttpError(409, "Rule checks must use the current delivery version.");
        if (quote.proof.review?.deliveryId === quote.proof.delivery.id) return response();
        const result = await reviewProof(quote, {});
        await persist(log({...quote, aiMode: result.mode, proof: {...quote.proof, review: {deliveryId: quote.proof.delivery.id, reviewedAt: new Date().toISOString(), ...result}}}, "reviewed", quote.proof.delivery.id));
      } else {
        const delivery = quote.proof.delivery;
        if (!delivery || input.deliveryId !== delivery.id) throw new HttpError(409, "Layout observations must use the current delivery version.");
        if (!Object.hasOwn(input, "previousReportId") || input.previousReportId !== (delivery.layoutReport?.id ?? null)) {
          throw new HttpError(409, "The layout report has changed. Reload before saving new observations.");
        }
        // Preserve all genuinely saved runs and their server-derived initiator.
        // The existing quote-version CAS rejects simultaneous changes.
        await persist(recordLayoutReport(quote, stored.role, input));
      }
      return response();
    }
    if (action === "reconcile") {
      if (["captured", "voided", "closed_unpaid"].includes(quote.proof.paymentState)) return response();
      if (quote.paymentMode !== "sandbox" || quote.proof.paymentState !== "authorized" || !quote.proof.paymentOperation) {
        throw new HttpError(409, "Only a pending PayPal Sandbox payment operation can be reconciled.");
      }
      // This provider operation performs resource reads, never capture or cancellation.
      const reconciliation = await reconcileProofPayment(quote, config);
      const next = applyPaymentReconciliation(quote, reconciliation);
      // CAS prevents an older query from overwriting another operation's saved result.
      if (next !== quote) await persist(next);
      return json({...proofResponse(stored, quote), reconciliation});
    }
    if (action === "capture") {
      if (quote.proof.paymentState === "captured") {
        if (input.confirm !== true || input.deliveryId !== quote.proof.acceptedDeliveryId) throw new HttpError(409, "This receipt belongs to a different delivery version.");
        assertAcceptedSnapshotConsent(quote, input.acceptedEvidenceSnapshotId);
        return response();
      }
      if (quote.proof.paymentOperation === "void") throw new HttpError(409, "Cancellation is already in progress.");
      // Record the capture consent time before validating the active window, so
      // crossing its boundary during the subsequent write cannot create a later timestamp.
      const captureConfirmedAt = new Date().toISOString();
      const manualChecks = validateAcceptance(quote, input);
      if (!quote.proof.paymentOperation) {
        // Persist consent and freeze this delivery before contacting the payment provider.
        if(!quote.proof.collaboration)await assertEnquiryAcceptance(quote,input.enquiryDecision);
        await persist(recordCaptureConsent(quote, manualChecks, captureConfirmedAt, quote.proof.collaboration ? undefined : validateBusinessDecision(quote, input.businessDecision), input.runtimeDecision, input.journeyDecision, input.modelDecision,input.enquiryDecision));
      }
      const captureId = quote.paymentMode === "demo" ? `SIM-CAP-${quote.id}` : (await captureAuthorization(quote, config)).captureId;
      await persist(log({...quote, status: "paid", paidAt: new Date().toISOString(), captureId, proof: {...quote.proof, paymentOperation: undefined, paymentState: "captured"}}, "captured", quote.proof.acceptedDeliveryId));
      return response();
    }
    if (input.confirm !== true) throw new HttpError(400, "Explicit confirmation is required to cancel the authorization.");
    if (quote.proof.paymentState === "voided") return response();
    if (quote.proof.paymentState !== "authorized" || !quote.proof.authorizationId) throw new HttpError(409, "Only an uncaptured authorization can be cancelled.");
    if (quote.proof.paymentOperation === "capture") throw new HttpError(409, "Payment confirmation is pending. Retry that operation before cancelling.");
    if (!quote.proof.paymentOperation) await persist({...quote, proof: {...quote.proof, paymentOperation: "void"}});
    if (quote.paymentMode === "sandbox") await voidAuthorization(quote, config);
    await persist(log({...quote, proof: {...quote.proof, paymentOperation: undefined, paymentState: "voided"}}, "voided"));
    return response();
  });
}
