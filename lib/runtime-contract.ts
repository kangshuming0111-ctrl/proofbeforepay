import type {ProofQuote} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {runtimeIdentifier,runtimeDeliveryDigest as validateDigest,runtimeProtocolStepIds} from "./runtime-checks.ts";
import {savedRuntimePlan} from "./runtime-project.ts";
import {capacityRecipeNumbers,type BookingCapacityPlan} from "./booking-capacity.ts";
import {CAPACITY_EXECUTION_ORDER,CAPACITY_SLOTS,CAPACITY_V4_EXECUTION_ORDER,CAPACITY_V4_SLOTS,runtimeCapacityStepDefinitions} from "./runtime-capacity.ts";

type ContractStep={id:string;method:"GET"|"POST";path:string;key?:string;keyFrom?:string;bodyChange?:Record<string,unknown>;expected:string;receiptFrom?:string;concurrentGroup?:string};
const UUID_PATTERN="^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$";
function capacitySteps(plan:BookingCapacityPlan):ContractStep[]{
  const n=capacityRecipeNumbers(plan),post:Record<string,{suffix?:string;partySize:number|string;slot?:string;email?:string;omit?:string[]}>={
    party_above:{suffix:"above",partySize:n.maxPartySize+1},capacity_race_first:{suffix:"race-a",partySize:n.racePartySize},capacity_race_second:{suffix:"race-b",partySize:n.racePartySize},
    race_winner_replay:{partySize:n.racePartySize},fill_remainder:{suffix:"fill",partySize:n.remainingPartySize},reject_extra:{suffix:"extra",partySize:1},slot_b_create:{suffix:"slot-b",partySize:n.maxPartySize,slot:CAPACITY_SLOTS.b},
  };
  if(plan.protocol==="booking-http-v4")Object.assign(post,{
    missing_slot:{suffix:"missing-slot",partySize:1,omit:["slot"]},invalid_email:{suffix:"invalid-email",partySize:1,email:"not-an-email"},
    party_zero:{suffix:"zero",partySize:0},party_fraction:{suffix:"fraction",partySize:1.5},party_negative:{suffix:"negative",partySize:-1},party_string:{suffix:"string",partySize:"1"},
    winner_conflict:{partySize:1},same_key_first:{suffix:"same-key",partySize:1,slot:CAPACITY_V4_SLOTS.c},same_key_second:{suffix:"same-key",partySize:1,slot:CAPACITY_V4_SLOTS.c},
    party_one:{suffix:"one",partySize:1,slot:CAPACITY_V4_SLOTS.d},party_below:{suffix:"below",partySize:n.maxPartySize-1,slot:CAPACITY_V4_SLOTS.e},
  });
  const receiptFrom:Record<string,string>={race_winner_readback:"capacity-race-winner",fill_readback:"fill_remainder",slot_b_readback:"slot_b_create",same_key_readback:"same-key-coverage-pair",party_one_readback:"party_one",party_below_readback:"party_below"};
  return runtimeCapacityStepDefinitions(plan).map(({id,method,path,expected})=>({id,method,path:path==="bookings/:id"?"bookings/{receiptId}":path,expected,
    ...(post[id]?{key:post[id].suffix?`pbp-{runId}-capacity-${post[id].suffix}`:"{actualWinningRaceKey}",...((id==="race_winner_replay"||id==="winner_conflict")?{keyFrom:"capacity-race-winner"}:{}),bodyChange:{partySize:post[id].partySize,...(post[id].slot?{slot:post[id].slot}:{}),...(post[id].email?{email:post[id].email}:{}),...(post[id].omit?{omit:post[id].omit}:{})}}:{}),
    ...(receiptFrom[id]?{receiptFrom:receiptFrom[id]}:{}),...(id==="capacity_race_first"||id==="capacity_race_second"?{concurrentGroup:"distinct-key-capacity-pair"}:id==="same_key_first"||id==="same_key_second"?{concurrentGroup:"same-key-coverage-pair"}:{})}));
}

/** A developer handoff for the locked requirement and bounded test protocol.
 * This pure export does not register a URL, issue HTTP/model/payment requests,
 * approve a deployment or attest that deployed code came from uploaded files. */
export function buildRuntimeContract(quote:ProofQuote) {
  if(quote.status!=="approved")throw new DomainError("Lock the agreed scope before exporting its backend contract.",409);
  const projectId=runtimeIdentifier(quote.id,"Project ID"),plan=savedRuntimePlan(quote);
  if(!plan)throw new DomainError("This project has no agreed backend protocol.",409);
  const policy=plan.protocol!=="booking-http-v1"?plan.policy:undefined,capacity=(plan.protocol==="booking-http-v3"||plan.protocol==="booking-http-v4")?capacityRecipeNumbers(plan):undefined;
  const minimum=policy?1:2,conflicting=policy?2:3;
  const capacitySlots=plan.protocol==="booking-http-v4"?CAPACITY_V4_SLOTS:CAPACITY_SLOTS;
  const steps:ContractStep[]=(plan.protocol==="booking-http-v3"||plan.protocol==="booking-http-v4")?capacitySteps(plan):[
    {id:"revision",method:"GET",path:"meta",expected:"200 JSON matching the pinned operator registration: revision, projectId, registrationRevision and frontendBundleDigest; include matching backendArtifactDigest/backendSourceCommit when declared; v2 also requires protocol booking-http-v2. No booking writes occur if this check fails."},
    {id:"missing_slot",method:"POST",path:"bookings",key:"pbp-{runId}-missing-slot",bodyChange:{omit:["slot"]},expected:"400 or422, JSON code synthetic_validation_failed"},
    {id:"invalid_email",method:"POST",path:"bookings",key:"pbp-{runId}-invalid-email",bodyChange:{email:"not-an-email"},expected:"400 or422, JSON code synthetic_validation_failed"},
    {id:"create",method:"POST",path:"bookings",key:"pbp-{runId}",expected:`201 with a new receipt ID and exact synthetic fields, including partySize ${minimum}`},
    {id:"readback",method:"GET",path:"bookings/{receiptId}",receiptFrom:"create",expected:"200 with the same ID and exact original fields; no expected fields are sent in the GET"},
    {id:"replay",method:"POST",path:"bookings",key:"pbp-{runId}",expected:"200 or201 with the original receipt ID and fields, not another booking"},
    {id:"conflict",method:"POST",path:"bookings",key:"pbp-{runId}",bodyChange:{partySize:conflicting},expected:"409 JSON code idempotency_conflict; original record remains unchanged"},
    {id:"unchanged",method:"GET",path:"bookings/{receiptId}",receiptFrom:"create",expected:"200 with original receipt ID and unchanged fields"},
  ];
  if(policy&&!capacity)steps.push(
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
  const finalWitnesses=new Set(["readback","unchanged","party_below_readback","party_exact_readback","concurrent_readback"]);
  // Report display order remains canonical. In a new v2 run, independent
  // receipts must also survive all later writes, so GET witnesses run last.
  const stepOrder:string[]=capacity?[...(plan.protocol==="booking-http-v4"?CAPACITY_V4_EXECUTION_ORDER:CAPACITY_EXECUTION_ORDER)]:policy?[...steps.filter(step=>!finalWitnesses.has(step.id)),...steps.filter(step=>finalWitnesses.has(step.id))].map(step=>step.id):steps.map(step=>step.id);
  if(policy&&!capacity)for(const step of steps){
    if(finalWitnesses.has(step.id))step.expected+="; observed after all later independent-key writes have completed";
  }
  const frontendBundleDigest=quote.proof.delivery?.runtimeDeliveryDigest;
  const contract={
    schema:"proofbeforepay-runtime-contract-v1",projectId,protocol:plan.protocol,plan:structuredClone(plan),
    frontendBundleDigest:frontendBundleDigest?validateDigest(frontendBundleDigest):null,
    registration:{required:true,status:"operator-review-required",projectScoped:true,frontendDigestRequired:true,testOnly:true,callerSuppliedUrlAccepted:false,deploymentAttestation:false},
    paths:{metadata:"meta",create:"bookings",readback:"bookings/{receiptId}",...(capacity?{occupancy:"occupancy/{runId}/{a|b}"}:{})},
    syntheticCanary:{testRunId:"{generated UUID for each run}",marker:"PBP-{runId}",customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:CAPACITY_SLOTS.a,partySize:capacity?capacity.racePartySize:minimum},
    requestSchema:{type:"object",additionalProperties:false,required:["testRunId","marker","customer","email","slot","partySize"],properties:{testRunId:{type:"string",pattern:UUID_PATTERN},marker:{type:"string",description:"Must equal PBP- plus testRunId"},customer:{const:"PBP synthetic"},email:{const:"pbp-test@example.invalid"},slot:capacity?{enum:Object.values(capacitySlots)}:{const:CAPACITY_SLOTS.a},partySize:{type:"integer",minimum:1,...(policy?{maximum:policy.maxPartySize}:{})}}},
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
      fieldSources:{revision:"runtimeRegistration.deploymentRevision",projectId:"runtimeRegistration.projectId",registrationRevision:"runtimeRegistration.registrationRevision",frontendBundleDigest:"runtimeRegistration.frontendBundleDigest",backendArtifactDigest:"runtimeRegistration.backendArtifactDigest, if present",backendSourceCommit:"runtimeRegistration.backendSourceCommit, if present",protocol:"agreed plan.protocol; v2/v3/v4 response field is mandatory"},
      declarationBinding:"The operator declaration is copied into the saved seller delivery. A new run must still match that entire declaration in the current server registry and be unexpired; metadata equality is a declaration association, not deployment provenance attestation.",
    },
    requestHeaders:{Accept:"application/json",postContentType:"application/json",idempotencyHeader:"Idempotency-Key"},
    errorCodes:{invalidSyntheticInput:"synthetic_validation_failed",idempotencyConflict:"idempotency_conflict",...(policy?{invalidPartySize:"party_size_invalid",exceededPartySize:"party_size_exceeded"}:{}),...(capacity?{slotCapacityExceeded:"slot_capacity_exceeded"}:{})},
    ...((plan.protocol==="booking-http-v3"||plan.protocol==="booking-http-v4")?{capacityRecipe:{...capacity!,partyRequirement:{criterionId:plan.criterionId,source:structuredClone(plan.source)},slotRequirement:structuredClone(plan.slotCapacity),slots:capacitySlots,
      occupancySchema:{type:"object",additionalProperties:false,required:["testRunId","slot","revision","guestCount","bookingIds"],properties:{testRunId:{type:"string",pattern:UUID_PATTERN},slot:{enum:Object.values(capacitySlots)},revision:{type:"string",description:"Exact registered deployment revision"},guestCount:{type:"integer",minimum:0,maximum:1000},bookingIds:{type:"array",maxItems:24,uniqueItems:true,items:{type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$"}}}},
      occupancyMeaning:"An independent GET reports this run/slot's current total and unique receipt IDs from the seller's own datastore. Booking ID order is immaterial. GET requests never contain expected counts or IDs.",
      raceMeaning:"Initiate two different keys concurrently. Each party is individually valid, but their combined size exceeds the agreed slot total. Exactly one201 and one409 slot_capacity_exceeded must be observed. Replay the actual winner's key with200 and unchanged occupancy."}}:{}),
    ...(plan.protocol==="booking-http-v4"?{combinedCoverage:{baseline:["missing_slot","invalid_email","party_zero","party_fraction","party_negative","party_string"],sameKey:["same_key_first","same_key_second","same_key_readback","winner_conflict"],boundary:["party_one","party_one_readback","party_below","party_below_readback","party_above","slot_b_create","slot_b_readback"],isolatedSlots:"C same-key, D one guest, E below maximum; A/B retain the capacity recipe",failurePolicy:"Negative inputs run before initial A occupancy. Any unexpected persisted booking makes that witness mismatch and blocks dependent writes. No missing response is counted as a pass."}}:{}),
    steps,
    bounds:{maxRequests:steps.length,totalTimeoutMs:30000,perRequestTimeoutMs:4000,maxResponseBytes:16384,redirects:"blocked",cookies:"omitted",authenticationHeaders:"not sent"},
    execution:{requiresConsentForEveryRun:true,modelCalled:false,paymentCalled:false,autoAcceptance:false,deploymentAttestation:false,
      stepOrder,finalCrossKeyReadbacks:!!policy,
      recovery:capacity?"A recovered capacity/combined run performs no POST retries: only metadata and current slot A occupancy may be read. Original pre-write/race/checkpoint steps remain unavailable; current occupancy is not substituted for an unobserved original checkpoint. A new consented run uses a new UUID namespace.":"Only a server-recovered persisted run may continue after exact same-key200; original create201 and original concurrent creation remain unavailable when not observed."},
    implementationRequirements:["Implement these paths against your own authorised staging business handler and test datastore; do not return canned or in-memory imitation responses.","Namespace synthetic records so real customers, inventory, notifications and payments cannot be affected.","The maximum comes from the agreed source, not a value copied back from this checker request.","Use atomic uniqueness/idempotency for the same key; changed valid data must409 without overwriting the original.","Different independent booking keys must retain different receipt IDs; same-key replays must retain the original receipt.","GET must independently read the stored receipt; receipt equality does not by itself prove the entire database has no duplicates.",...(capacity?["Use an atomic native capacity decision for each slot, independent of the checker. One winner fills part of slot A, a later distinct booking fills its positive remainder, and one extra guest must be rejected.","Final winner/fill GETs and the final slot A occupancy follow slot B creation. Other-slot writes must not delete or overwrite earlier receipts or consume slot A's capacity."]:policy?["New v2 runs postpone all five receipt GET witnesses until later creates finish. Each earlier booking must still exist with its original ID and fields. Historical reports retain their original observations."]:[])],
    limitations:["This handoff is not URL registration or operator approval.","Frontend file digest and declared backend build identifiers do not attest deployed code provenance.","Only these bounded HTTP paths are tested; seller frontend JavaScript, browser form submission, emails and site-wide security remain unverified."],
  };
  if(new TextEncoder().encode(JSON.stringify(contract)).byteLength>24*1024)throw new DomainError("The backend contract exceeds the export budget.",409);
  return structuredClone(contract);
}
