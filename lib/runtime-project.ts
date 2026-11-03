import type { ProofDelivery, ProofQuote, StaticProjectSpec } from "./contracts.ts";
import type { RuntimeCheckPlan, RuntimeCheckReport, RuntimeCheckTarget } from "./runtime-checks.ts";
import { DomainError } from "./domain.ts";
import {validateRuntimePlan,validateRuntimeReport} from "./runtime-checks.ts";
import {registrationTarget,validateRuntimeRegistrationSnapshot} from "./runtime-registration.ts";

export const RUNTIME_LAB_ORIGIN = "https://proofbeforepay-verification-lab.blueheron8.chatgpt.site";
/** Operator-owned disposable targets. No caller URL or ambient credentials. Add
 * an adapter here only after authorizing a separate owned test deployment. */
export const RUNTIME_TARGETS: RuntimeCheckTarget[] = [
  {id:"lab-flawed",label:"Controlled booking fixture v1",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/flawed/`,revision:"booking-flawed-v1",testOnly:true},
  {id:"lab-fixed",label:"Controlled booking fixture v2",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/fixed/`,revision:"booking-fixed-v2",testOnly:true},
  {id:"lab-policy-flawed",label:"Controlled booking policy mismatch",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/policy-flawed/`,revision:"booking-policy-flawed-v1",testOnly:true,protocol:"booking-http-v2"},
  {id:"lab-policy-fixed",label:"Controlled booking policy fixed",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/policy-fixed/`,revision:"booking-policy-fixed-v1",testOnly:true,protocol:"booking-http-v2"},
  {id:"lab-capacity-flawed",label:"Controlled slot-capacity overbooking",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/capacity-flawed/`,revision:"capacity-overbook-v1",testOnly:true,protocol:"booking-http-v3"},
  {id:"lab-capacity-fixed",label:"Controlled atomic slot capacity",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/capacity-fixed/`,revision:"capacity-fixed-v1",testOnly:true,protocol:"booking-http-v3"},
  {id:"lab-capacity-underlimit",label:"Controlled slot-capacity over-rejection",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/capacity-underlimit/`,revision:"capacity-underlimit-v1",testOnly:true,protocol:"booking-http-v3"},
  {id:"lab-coverage-fixed",label:"Combined input, replay and capacity checks",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/coverage-fixed/`,revision:"coverage-fixed-v1",testOnly:true,protocol:"booking-http-v4"},
  {id:"lab-coverage-validation-gap",label:"Combined checks · invalid-email persistence defect",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/coverage-validation-gap/`,revision:"coverage-validation-gap-v1",testOnly:true,protocol:"booking-http-v4"},
  {id:"lab-coverage-overbook",label:"Combined checks · capacity overbooking defect",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/coverage-overbook/`,revision:"coverage-overbook-v1",testOnly:true,protocol:"booking-http-v4"},
];
export function runtimeTarget(id: unknown): RuntimeCheckTarget {
  const target=RUNTIME_TARGETS.find(item=>item.id===id);
  if(!target) throw new DomainError("Select an operator-registered disposable backend target.");
  return structuredClone(target);
}
/** Historical evidence uses the immutable registration saved with its upload,
 * never today's registry or expiry. Authorization for a new outbound run is a
 * separate current-registry check in the server route before its lease CAS. */
export function deliveryRuntimeTarget(delivery:ProofDelivery):RuntimeCheckTarget {
  const registration=delivery.runtimeRegistration;
  if(registration){
    const snapshot=validateRuntimeRegistrationSnapshot(registration);
    if(snapshot.id!==delivery.backendTargetId||snapshot.frontendBundleDigest!==delivery.runtimeDeliveryDigest)throw new DomainError("The saved backend registration does not match this delivery.",409);
    return registrationTarget(snapshot);
  }
  return runtimeTarget(delivery.backendTargetId);
}
export function parseRuntimePlan(value:unknown, project:StaticProjectSpec, confirmed=false):RuntimeCheckPlan {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new DomainError("Backend check plan must be an object.");
  const input=value as Record<string,unknown>;
  if(Object.keys(input).some(key=>!["protocol","criterionId","source","confirmed",...(input.protocol!=="booking-http-v1"?["policy"]:[]),...((input.protocol==="booking-http-v3"||input.protocol==="booking-http-v4")?["slotCapacity"]:[])].includes(key)) || !["booking-http-v1","booking-http-v2","booking-http-v3","booking-http-v4"].includes(input.protocol as string) || confirmed && input.confirmed!==true) throw new DomainError("Explicitly confirm the booking HTTP protocol.");
  const row=project.coverage?.decisions.find(row=>row.criterionId===input.criterionId && row.disposition==="include");
  if(!row || !project.coverage || project.coverage.sourceText.slice(row.start,row.end)!==row.text) throw new DomainError("Link the backend check to an included original requirement.");
  const source={start:row.start,end:row.end,excerpt:row.text};
  if(input.source!==undefined && JSON.stringify(input.source)!==JSON.stringify(source)) throw new DomainError("The backend source reference changed.");
  let slotCapacity:unknown;
  if((input.protocol==="booking-http-v3"||input.protocol==="booking-http-v4")){
    const capacity=input.slotCapacity;
    if(!capacity||typeof capacity!=="object"||Array.isArray(capacity))throw new DomainError("Link slot capacity to its own complete included requirement.");
    const candidate=capacity as Record<string,unknown>,capacityRow=project.coverage.decisions.find(item=>item.criterionId===candidate.criterionId&&item.disposition==="include");
    if(!capacityRow||capacityRow.criterionId===row.criterionId)throw new DomainError("Slot capacity needs a separate included original requirement.");
    const completeSource={start:capacityRow.start,end:capacityRow.end,excerpt:capacityRow.text};
    const given=candidate.source as Record<string,unknown>|undefined;
    if(!given||given.start!==completeSource.start||given.end!==completeSource.end||given.excerpt!==completeSource.excerpt)throw new DomainError("Slot capacity must retain its complete included original clause.");
    slotCapacity=capacity;
  }
  return validateRuntimePlan({protocol:input.protocol,criterionId:row.criterionId!,source,...(input.protocol!=="booking-http-v1"?{policy:input.policy}:{}),...((input.protocol==="booking-http-v3"||input.protocol==="booking-http-v4")?{slotCapacity}:{})},{sourceText:project.coverage.sourceText,criteria:project.coverage.decisions.filter(item=>item.disposition==="include").map(item=>({id:item.criterionId!}))});
}
export function savedRuntimePlan(quote:ProofQuote):RuntimeCheckPlan|undefined {
  const project=quote.proof.project;
  if(!project?.runtimeCheck) return;
  const plan=parseRuntimePlan(project.runtimeCheck,project);
  if(!quote.proof.criteria.some(item=>item.id===plan.criterionId && item.source===plan.source.excerpt) || project.coverage?.sourceText!==quote.summary.trim()) throw new DomainError("The backend requirement and saved scope differ.",409);
  if((plan.protocol==="booking-http-v3"||plan.protocol==="booking-http-v4")&&!quote.proof.criteria.some(item=>item.id===plan.slotCapacity.criterionId&&item.source===plan.slotCapacity.source.excerpt))throw new DomainError("The slot-capacity requirement and saved scope differ.",409);
  return plan;
}
export async function runtimeDeliveryDigest(files:Record<string,string>|undefined):Promise<string> {
  if(!files || !Object.keys(files).length) throw new DomainError("Backend checks require saved delivery files.",409);
  const bytes=new TextEncoder().encode(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,"en"))));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function runtimeReportsFor(delivery:NonNullable<ProofQuote["proof"]["delivery"]>):RuntimeCheckReport[] {
  const rows=[...(delivery.runtimeHistory??[]),...(delivery.runtimeReport?[delivery.runtimeReport]:[])];
  const result:RuntimeCheckReport[]=[];
  for(const row of rows){
    if(!row || row.deliveryId!==delivery.id || !row.id) throw new DomainError("Backend report history does not match this delivery.",409);
    const found=result.find(item=>item.id===row.id);
    if(found && JSON.stringify(found)!==JSON.stringify(row)) throw new DomainError("A backend report cannot be rewritten.",409);
    if(!found) result.push(row);
  }
  if(result.length>20) throw new DomainError("Backend report history is full; prior evidence is retained.",409);
  return structuredClone(result);
}
export type RuntimeDecision={reportId:string;exceptionReason?:string;acknowledgedSteps?:string[]};
export function validateRuntimeDecision(quote:ProofQuote,value:unknown):RuntimeDecision|undefined {
  const plan=savedRuntimePlan(quote); if(!plan)return;
  const delivery=quote.proof.delivery,report=delivery?.runtimeReport;
  if(delivery?.runtimeRun) throw new DomainError("Wait for the pending backend run before accepting.",409);
  if(!report || report.deliveryId!==delivery?.id || JSON.stringify(report.plan)!==JSON.stringify(plan) || report.target.id!==delivery.backendTargetId) throw new DomainError("Run the agreed backend checks on this delivery first.",409);
  const target=deliveryRuntimeTarget(delivery);
  if(delivery.runtimeRegistration&&delivery.runtimeRegistration.projectId!==quote.id)throw new DomainError("The backend registration belongs to another project.",409);
  validateRuntimeReport(report,{deliveryId:delivery.id,deliveryDigest:delivery.runtimeDeliveryDigest!,plan,target,registration:delivery.runtimeRegistration});
  if((target.protocol??"booking-http-v1")!==plan.protocol)throw new DomainError("The registered backend protocol differs from the agreed plan.",409);
  if(!value || typeof value!=="object" || Array.isArray(value))throw new DomainError("Confirm the exact backend report.",409);
  const input=value as RuntimeDecision;
  if(Object.keys(input).some(key=>!["reportId","exceptionReason","acknowledgedSteps"].includes(key)) || input.reportId!==report.id)throw new DomainError("The backend report changed. Review it again.",409);
  const failed=report.steps.filter(item=>item.outcome!=="observed").map(item=>item.id);
  if(input.exceptionReason!==undefined && typeof input.exceptionReason!=="string")throw new DomainError("Backend exception reason must be text.");
  const reason=input.exceptionReason?.trim();
  if(reason!==undefined && reason.length>500)throw new DomainError("Backend exception reason must be at most500 characters.");
  if(failed.length && (!reason || reason.length<10 || !Array.isArray(input.acknowledgedSteps) || failed.some(id=>!input.acknowledgedSteps!.includes(id))))throw new DomainError("Review every failed or uncertain backend step and explain any explicit acceptance exception.",409);
  return {reportId:report.id,...(reason?{exceptionReason:reason}:{}),...(failed.length?{acknowledgedSteps:failed}:{})};
}
