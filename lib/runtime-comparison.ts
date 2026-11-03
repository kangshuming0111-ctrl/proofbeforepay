import type {ProofDelivery,ProofDeliveryVersion} from "./contracts.ts";
import {isOlderDelivery} from "./delivery-comparison.ts";
import {runtimeDeliveryDigest,deliveryRuntimeTarget} from "./runtime-project.ts";
import {runtimeReportSummary,validateRuntimePlan,validateRuntimeReport,type RuntimeCheckPlan,type RuntimeCheckReport,type RuntimeCheckStep} from "./runtime-checks.ts";
import {validateStaticFiles} from "./static-project.ts";

export type RuntimeComparisonReason="no_previous"|"not_older"|"no_report"|"pending_run"|"missing_files"|"invalid_files"|"different_delivery"|"digest_mismatch"|"plan_mismatch"|"invalid_target"|"invalid_report"|"invalid_plan"|"missing_project"|"different_project";
type DeliveryReference=Pick<ProofDelivery,"id"|"sequence"|"label"|"submittedAt">;
export type RuntimeVersionEvidence={
  delivery:DeliveryReference;report:RuntimeCheckReport;fileDigest:string;
  boundary?:RuntimeCheckStep;
  concurrency?:{responses:RuntimeCheckStep[];creationResponses:number;replayResponses:number;observedPair:boolean;readback:RuntimeCheckStep};
  capacity?:{responses:RuntimeCheckStep[];creationResponses:number;capacityRejections:number;observedPair:boolean;
    winnerReadback:RuntimeCheckStep;fillReadback:RuntimeCheckStep;winnerReplay:RuntimeCheckStep;rejectExtra:RuntimeCheckStep;slotBCreate:RuntimeCheckStep;slotBReadback:RuntimeCheckStep;
    occupancy:{initial:RuntimeCheckStep;afterRace:RuntimeCheckStep;afterReplay:RuntimeCheckStep;full:RuntimeCheckStep;finalA:RuntimeCheckStep;slotB:RuntimeCheckStep}};
};
export type RuntimeComparisonSide={state:"available";data:RuntimeVersionEvidence}|{state:"unavailable";reason:RuntimeComparisonReason;delivery?:DeliveryReference};
export type RuntimeComparison={plan?:RuntimeCheckPlan;previous:RuntimeComparisonSide;current:RuntimeComparisonSide};
export type RuntimeComparisonInput={projectId?:string;plan:RuntimeCheckPlan;delivery:ProofDelivery;previousVersion?:ProofDeliveryVersion};
const metadata=({id,label,sequence,submittedAt}:ProofDelivery):DeliveryReference=>({id,label,sequence,submittedAt});
const unavailable=(reason:RuntimeComparisonReason,delivery?:ProofDelivery):RuntimeComparisonSide=>({state:"unavailable",reason,...(delivery?{delivery:metadata(delivery)}:{})});

async function versionEvidence(delivery:ProofDelivery,plan:RuntimeCheckPlan,projectId:string):Promise<RuntimeComparisonSide>{
  // Even an expired lease means a replacement result is incomplete. The last
  // report must not silently stand in for the unfinished run in this comparison.
  if(delivery.runtimeRun)return unavailable("pending_run",delivery);
  const report=delivery.runtimeReport;
  if(!report)return unavailable("no_report",delivery);
  if(report.deliveryId!==delivery.id)return unavailable("different_delivery",delivery);
  if(!delivery.files)return unavailable("missing_files",delivery);
  let files:Record<string,string>;
  try{files=validateStaticFiles(delivery.files);}catch{return unavailable("invalid_files",delivery);}
  const digest=await runtimeDeliveryDigest(files);
  if(delivery.runtimeDeliveryDigest!==digest||report.deliveryDigest!==digest)return unavailable("digest_mismatch",delivery);
  if(delivery.runtimeRegistration&&delivery.runtimeRegistration.projectId!==projectId)return unavailable("different_project",delivery);
  try{if(JSON.stringify(validateRuntimePlan(report.plan))!==JSON.stringify(plan))return unavailable("plan_mismatch",delivery);}catch{return unavailable("plan_mismatch",delivery);}
  let target:ReturnType<typeof deliveryRuntimeTarget>;
  try{
    target=deliveryRuntimeTarget(delivery);
    if((target.protocol??"booking-http-v1")!==plan.protocol)return unavailable("invalid_target",delivery);
  }catch{return unavailable("invalid_target",delivery);}
  let validated:RuntimeCheckReport;
  try{validated=validateRuntimeReport(report,{deliveryId:delivery.id,deliveryDigest:digest,plan,target,registration:delivery.runtimeRegistration});}catch{return unavailable("invalid_report",delivery);}
  // Histories may repeat the latest immutable report, but cannot redefine its
  // identifier. Never substitute another historical report if latest is invalid.
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,"en")).map(([key,entry])=>[key,canonical(entry)])):value;
  if(delivery.runtimeHistory!==undefined&&(!Array.isArray(delivery.runtimeHistory)||delivery.runtimeHistory.some(previous=>!previous||previous.deliveryId!==delivery.id||previous.id===validated.id&&JSON.stringify(canonical(previous))!==JSON.stringify(canonical(validated)))))return unavailable("invalid_report",delivery);
  validated.summary=runtimeReportSummary(validated.steps);
  const pair=validated.steps.filter(step=>step.id==="concurrent_first"||step.id==="concurrent_second");
  const readback=validated.steps.find(step=>step.id==="concurrent_readback");
  const creationResponses=pair.filter(step=>step.status===201).length,replayResponses=pair.filter(step=>step.status===200).length;
  const capacityPair=validated.steps.filter(step=>step.id==="capacity_race_first"||step.id==="capacity_race_second");
  const capacityCreations=capacityPair.filter(step=>step.status===201).length,capacityRejections=capacityPair.filter(step=>step.status===409).length;
  const step=(id:string)=>validated.steps.find(step=>step.id===id)!;
  return {state:"available",data:{delivery:metadata(delivery),report:validated,fileDigest:digest,
    ...(plan.protocol==="booking-http-v2"?{boundary:validated.steps.find(step=>step.id==="party_above"),
      ...(readback?{concurrency:{responses:pair,creationResponses,replayResponses,observedPair:pair.length===2&&pair.every(step=>step.outcome==="observed")&&creationResponses===1&&replayResponses===1,readback}}:{})}:plan.protocol==="booking-http-v3"?{capacity:{responses:capacityPair,creationResponses:capacityCreations,capacityRejections,observedPair:capacityPair.length===2&&capacityPair.every(step=>step.outcome==="observed")&&capacityCreations===1&&capacityRejections===1,
        winnerReadback:step("race_winner_readback"),fillReadback:step("fill_readback"),winnerReplay:step("race_winner_replay"),rejectExtra:step("reject_extra"),slotBCreate:step("slot_b_create"),slotBReadback:step("slot_b_readback"),
        occupancy:{initial:step("slot_a_initial"),afterRace:step("slot_a_after_race"),afterReplay:step("slot_a_after_replay"),full:step("slot_a_full"),finalA:step("slot_a_after_rejection"),slotB:step("slot_b_occupancy")}}}:{})}};
}

/** Read-only comparison of saved HTTP observations. Each side must bind its own
 * actual files, target and frozen registration to the same locked requirement.
 * No request, code execution, repair judgment, acceptance or payment occurs. */
export async function buildRuntimeComparison(input:RuntimeComparisonInput):Promise<RuntimeComparison>{
  // Capture before the first await so later UI updates cannot mix file snapshots
  // with another report while asynchronous SHA-256 work completes.
  const snapshot=structuredClone(input);
  let plan:RuntimeCheckPlan;
  try{plan=validateRuntimePlan(snapshot.plan);}catch{return {previous:unavailable("invalid_plan",snapshot.previousVersion?.delivery),current:unavailable("invalid_plan",snapshot.delivery)};}
  const projectId=snapshot.projectId;
  if(typeof projectId!=="string"||!projectId.trim())return {plan,previous:unavailable("missing_project",snapshot.previousVersion?.delivery),current:unavailable("missing_project",snapshot.delivery)};
  const previous=snapshot.previousVersion;
  const previousResult:Promise<RuntimeComparisonSide>=!previous?Promise.resolve(unavailable("no_previous"))
    :!isOlderDelivery(previous,snapshot.delivery)?Promise.resolve(unavailable("not_older",previous.delivery))
    :versionEvidence(previous.delivery,plan,projectId);
  const [old,current]=await Promise.all([previousResult,versionEvidence(snapshot.delivery,plan,projectId)]);
  return structuredClone({plan,previous:old,current});
}
