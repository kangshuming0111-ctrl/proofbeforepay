import type {ProofQuote} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {runtimeIdentifier,runtimeDeliveryDigest as validateDigest,runtimeProtocolStepIds} from "./runtime-checks.ts";
import {savedRuntimePlan} from "./runtime-project.ts";

type ContractStep={id:string;method:"GET"|"POST";path:string;key?:string;bodyChange?:Record<string,unknown>;expected:string;receiptFrom?:string;concurrentGroup?:string};
const UUID_PATTERN="^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$";

/** A developer handoff for the locked requirement and bounded test protocol.
 * This pure export does not register a URL, issue HTTP/model/payment requests,
 * approve a deployment or attest that deployed code came from uploaded files. */
export function buildRuntimeContract(quote:ProofQuote) {
  if(quote.status!=="approved")throw new DomainError("Lock the agreed scope before exporting its backend contract.",409);
  const projectId=runtimeIdentifier(quote.id,"Project ID"),plan=savedRuntimePlan(quote);
  if(!plan)throw new DomainError("This project has no agreed backend protocol.",409);
  const policy=plan.protocol==="booking-http-v2"?plan.policy:undefined;
  const minimum=policy?1:2,conflicting=policy?2:3;
  const steps:ContractStep[]=[
    {id:"revision",method:"GET",path:"meta",expected:"200 JSON matching the pinned operator registration: revision, projectId, registrationRevision and frontendBundleDigest; include matching backendArtifactDigest/backendSourceCommit when declared; v2 also requires protocol booking-http-v2. No booking writes occur if this check fails."},
    {id:"missing_slot",method:"POST",path:"bookings",key:"pbp-{runId}-missing-slot",bodyChange:{omit:["slot"]},expected:"400 or422, JSON code synthetic_validation_failed"},
    {id:"invalid_email",method:"POST",path:"bookings",key:"pbp-{runId}-invalid-email",bodyChange:{email:"not-an-email"},expected:"400 or422, JSON code synthetic_validation_failed"},
    {id:"create",method:"POST",path:"bookings",key:"pbp-{runId}",expected:`201 with a new receipt ID and exact synthetic fields, including partySize ${minimum}`},
    {id:"readback",method:"GET",path:"bookings/{receiptId}",receiptFrom:"create",expected:"200 with the same ID and exact original fields; no expected fields are sent in the GET"},
    {id:"replay",method:"POST",path:"bookings",key:"pbp-{runId}",expected:"200 or201 with the original receipt ID and fields, not another booking"},
    {id:"conflict",method:"POST",path:"bookings",key:"pbp-{runId}",bodyChange:{partySize:conflicting},expected:"409 JSON code idempotency_conflict; original record remains unchanged"},
    {id:"unchanged",method:"GET",path:"bookings/{receiptId}",receiptFrom:"create",expected:"200 with original receipt ID and unchanged fields"},
  ];
  if(policy)steps.push(
    {id:"party_zero",method:"POST",path:"bookings",key:"pbp-{runId}-zero",bodyChange:{partySize:0},expected:"400 or422, JSON code party_size_invalid"},
    {id:"party_fraction",method:"POST",path:"bookings",key:"pbp-{runId}-fraction",bodyChange:{partySize:1.5},expected:"400 or422, JSON code party_size_invalid"},
    {id:"party_below",method:"POST",path:"bookings",key:"pbp-{runId}-below",bodyChange:{partySize:policy.maxPartySize-1},expected:"200 or201 with receipt ID and exact requested fields"},
    {id:"party_below_readback",method:"GET",path:"bookings/{receiptId}",receiptFrom:"party_below",expected:"200 with the same below-limit booking and original fields"},
    {id:"party_exact",method:"POST",path:"bookings",key:"pbp-{runId}-exact",bodyChange:{partySize:policy.maxPartySize},expected:"200 or201 with receipt ID and exact requested fields"},
    {id:"party_exact_readback",method:"GET",path:"bookings/{receiptId}",receiptFrom:"party_exact",expected:"200 with the same maximum-size booking and original fields"},
    {id:"party_above",method:"POST",path:"bookings",key:"pbp-{runId}-above",bodyChange:{partySize:policy.maxPartySize+1},expected:"400 or422, JSON code party_size_exceeded"},
    {id:"concurrent_first",method:"POST",path:"bookings",key:"pbp-{runId}-concurrent",concurrentGroup:"same-key-pair",expected:"Together with concurrent_second: exactly one201 and one200, same ID and original fields"},
    {id:"concurrent_second",method:"POST",path:"bookings",key:"pbp-{runId}-concurrent",concurrentGroup:"same-key-pair",expected:"Initiated before awaiting concurrent_first; both receipts must identify the same booking"},
    {id:"concurrent_readback",method:"GET",path:"bookings/{receiptId}",receiptFrom:"same-key-pair",expected:"200 with the same concurrent receipt ID and original fields"},
  );
  if(JSON.stringify(steps.map(step=>step.id))!==JSON.stringify(runtimeProtocolStepIds(plan)))throw new DomainError("The handoff protocol inventory is inconsistent.",409);
  const frontendBundleDigest=quote.proof.delivery?.runtimeDeliveryDigest;
  const contract={
    schema:"proofbeforepay-runtime-contract-v1",projectId,protocol:plan.protocol,plan:structuredClone(plan),
    frontendBundleDigest:frontendBundleDigest?validateDigest(frontendBundleDigest):null,
    registration:{required:true,status:"operator-review-required",projectScoped:true,frontendDigestRequired:true,testOnly:true,callerSuppliedUrlAccepted:false,deploymentAttestation:false},
    paths:{metadata:"meta",create:"bookings",readback:"bookings/{receiptId}"},
    syntheticCanary:{testRunId:"{generated UUID for each run}",marker:"PBP-{runId}",customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:"2099-01-01T10:00:00Z",partySize:minimum},
    requestSchema:{type:"object",additionalProperties:false,required:["testRunId","marker","customer","email","slot","partySize"],properties:{testRunId:{type:"string",pattern:UUID_PATTERN},marker:{type:"string",description:"Must equal PBP- plus testRunId"},customer:{const:"PBP synthetic"},email:{const:"pbp-test@example.invalid"},slot:{const:"2099-01-01T10:00:00Z"},partySize:{type:"integer",minimum:1,...(policy?{maximum:policy.maxPartySize}:{})}}},
    receiptSchema:{type:"object",required:["id","testRunId","marker","customer","email","slot","partySize","revision"],properties:{id:{type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$"},revision:{type:"string",description:"Must match the operator-registered deployment revision"}},exactRequestFieldsRequired:true},
    metadata:{
      requiredFields:["revision","projectId","registrationRevision","frontendBundleDigest",...(policy?["protocol"]:[])],
      requiredWhenDeclared:["backendArtifactDigest","backendSourceCommit"],
      protocol:plan.protocol,
      schema:{type:"object",required:["revision","projectId","registrationRevision","frontendBundleDigest",...(policy?["protocol"]:[])],properties:{
        revision:{type:"string",description:"Exact runtimeRegistration.deploymentRevision"},
        projectId:{const:projectId},
        registrationRevision:{type:"string",description:"Exact runtimeRegistration.registrationRevision"},
        frontendBundleDigest:{type:"string",pattern:"^[a-f0-9]{64}$",description:"Exact runtimeRegistration.frontendBundleDigest, computed from the seller's saved static frontend file map"},
        protocol:{const:plan.protocol},
        backendArtifactDigest:{type:"string",pattern:"^[a-f0-9]{64}$",description:"Required and equal when runtimeRegistration.backendArtifactDigest is declared"},
        backendSourceCommit:{type:"string",pattern:"^(?:[a-f0-9]{40}|[a-f0-9]{64})$",description:"Required and equal when runtimeRegistration.backendSourceCommit is declared"},
      }},
      fieldSources:{revision:"runtimeRegistration.deploymentRevision",projectId:"runtimeRegistration.projectId",registrationRevision:"runtimeRegistration.registrationRevision",frontendBundleDigest:"runtimeRegistration.frontendBundleDigest",backendArtifactDigest:"runtimeRegistration.backendArtifactDigest, if present",backendSourceCommit:"runtimeRegistration.backendSourceCommit, if present",protocol:"agreed plan.protocol; v2 response field is mandatory"},
      declarationBinding:"The operator declaration is copied into the saved seller delivery. A new run must still match that entire declaration in the current server registry and be unexpired; metadata equality is a declaration association, not deployment provenance attestation.",
    },
    requestHeaders:{Accept:"application/json",postContentType:"application/json",idempotencyHeader:"Idempotency-Key"},
    errorCodes:{invalidSyntheticInput:"synthetic_validation_failed",idempotencyConflict:"idempotency_conflict",...(policy?{invalidPartySize:"party_size_invalid",exceededPartySize:"party_size_exceeded"}:{})},
    steps,
    bounds:{maxRequests:steps.length,totalTimeoutMs:30000,perRequestTimeoutMs:4000,maxResponseBytes:16384,redirects:"blocked",cookies:"omitted",authenticationHeaders:"not sent"},
    execution:{requiresConsentForEveryRun:true,modelCalled:false,paymentCalled:false,autoAcceptance:false,deploymentAttestation:false,
      recovery:"Only a server-recovered persisted run may continue after exact same-key200; original create201 and original concurrent creation remain unavailable when not observed."},
    implementationRequirements:["Implement these paths against your own authorised staging business handler and test datastore; do not return canned or in-memory imitation responses.","Namespace synthetic records so real customers, inventory, notifications and payments cannot be affected.","The maximum comes from the agreed source, not a value copied back from this checker request.","Use atomic uniqueness/idempotency for the same key; changed valid data must409 without overwriting the original.","GET must independently read the stored receipt; receipt equality does not by itself prove the entire database has no duplicates."],
    limitations:["This handoff is not URL registration or operator approval.","Frontend file digest and declared backend build identifiers do not attest deployed code provenance.","Only these bounded HTTP paths are tested; seller frontend JavaScript, browser form submission, emails and site-wide security remain unverified."],
  };
  if(new TextEncoder().encode(JSON.stringify(contract)).byteLength>24*1024)throw new DomainError("The backend contract exceeds the export budget.",409);
  return structuredClone(contract);
}
