import type { ProofQuote, StaticProjectSpec } from "./contracts.ts";
import type { RuntimeCheckPlan, RuntimeCheckReport, RuntimeCheckTarget } from "./runtime-checks.ts";
import { DomainError } from "./domain.ts";
import {validateRuntimePlan,validateRuntimeReport} from "./runtime-checks.ts";

export const RUNTIME_LAB_ORIGIN = "https://proofbeforepay-verification-lab.blueheron8.chatgpt.site";
/** Operator-owned disposable targets. No caller URL or ambient credentials. Add
 * an adapter here only after authorizing a separate owned test deployment. */
export const RUNTIME_TARGETS: RuntimeCheckTarget[] = [
  {id:"lab-flawed",label:"Controlled booking fixture v1",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/flawed/`,revision:"booking-flawed-v1",testOnly:true},
  {id:"lab-fixed",label:"Controlled booking fixture v2",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/fixed/`,revision:"booking-fixed-v2",testOnly:true},
  {id:"lab-policy-flawed",label:"Controlled booking policy mismatch",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/policy-flawed/`,revision:"booking-policy-flawed-v1",testOnly:true,protocol:"booking-http-v2"},
  {id:"lab-policy-fixed",label:"Controlled booking policy fixed",baseUrl:`${RUNTIME_LAB_ORIGIN}/test-api/policy-fixed/`,revision:"booking-policy-fixed-v1",testOnly:true,protocol:"booking-http-v2"},
];
export function runtimeTarget(id: unknown): RuntimeCheckTarget {
  const target=RUNTIME_TARGETS.find(item=>item.id===id);
  if(!target) throw new DomainError("Select an operator-registered disposable backend target.");
  return structuredClone(target);
}
export function parseRuntimePlan(value:unknown, project:StaticProjectSpec, confirmed=false):RuntimeCheckPlan {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new DomainError("Backend check plan must be an object.");
  const input=value as Record<string,unknown>;
  if(Object.keys(input).some(key=>!["protocol","criterionId","source","confirmed",...(input.protocol==="booking-http-v2"?["policy"]:[])].includes(key)) || !["booking-http-v1","booking-http-v2"].includes(input.protocol as string) || confirmed && input.confirmed!==true) throw new DomainError("Explicitly confirm the booking HTTP protocol.");
  const row=project.coverage?.decisions.find(row=>row.criterionId===input.criterionId && row.disposition==="include");
  if(!row || !project.coverage || project.coverage.sourceText.slice(row.start,row.end)!==row.text) throw new DomainError("Link the backend check to an included original requirement.");
  const source={start:row.start,end:row.end,excerpt:row.text};
  if(input.source!==undefined && JSON.stringify(input.source)!==JSON.stringify(source)) throw new DomainError("The backend source reference changed.");
  return validateRuntimePlan({protocol:input.protocol,criterionId:row.criterionId!,source,...(input.protocol==="booking-http-v2"?{policy:input.policy}:{})},{sourceText:project.coverage.sourceText});
}
export function savedRuntimePlan(quote:ProofQuote):RuntimeCheckPlan|undefined {
  const project=quote.proof.project;
  if(!project?.runtimeCheck) return;
  const plan=parseRuntimePlan(project.runtimeCheck,project);
  if(!quote.proof.criteria.some(item=>item.id===plan.criterionId && item.source===plan.source.excerpt) || project.coverage?.sourceText!==quote.summary.trim()) throw new DomainError("The backend requirement and saved scope differ.",409);
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
  validateRuntimeReport(report,{deliveryId:delivery.id,deliveryDigest:delivery.runtimeDeliveryDigest!,plan,target:runtimeTarget(delivery.backendTargetId)});
  if((runtimeTarget(delivery.backendTargetId).protocol??"booking-http-v1")!==plan.protocol)throw new DomainError("The registered backend protocol differs from the agreed plan.",409);
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
