import type {Language,ProofQuote,ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {assertQuoteEvidenceBudget} from "./evidence-budget.ts";
import {savedProjectJourneyPlan} from "./project-journey.ts";
import {runtimeDeliveryDigest} from "./runtime-project.ts";
import {modelReportsFor} from "./model-check-actions.ts";
import {modelDiagnosisExplanationPacket,type ModelDiagnosisExplanationPacket} from "./model-diagnostics.ts";

export const MODEL_EXPLANATION_BYTES=16*1024;
export type ModelEvidenceBinding=Pick<ModelDiagnosisExplanationPacket,"deliveryId"|"deliveryDigest"|"journeyPlanDigest"|"modelSpecDigest"|"reportId"|"diagnosisRevision"|"findingIds">;
export type ModelEvidenceFinding={findingIds:string[];explanation:string;retest:string};
export type ModelEvidenceExplanation=ModelEvidenceBinding&{id:string;method:"ai-model-evidence-explanation-v1";mode:"live";model:string;language:Language;generatedAt:string;findings:ModelEvidenceFinding[];limitations:string[];usage?:{promptTokens:number;completionTokens:number}};
export type ModelEvidenceContext={language:Language;binding:ModelEvidenceBinding;previousExplanationId:string|null;evidence:ModelDiagnosisExplanationPacket};
const CONTROL=/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
function object(value:unknown,keys:readonly string[],required=keys):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new DomainError("Model explanation requires plain JSON.");
 for(const key of Reflect.ownKeys(value)){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=="string"||!keys.includes(key)||!descriptor||!("value"in descriptor))throw new DomainError("Model explanation contains unsupported fields.");}
 if(required.some(key=>!Object.hasOwn(value,key)))throw new DomainError("Model explanation is missing a required field.");return value as Record<string,unknown>;
}
function text(value:unknown,max:number):string{if(typeof value!=="string"||!value.trim()||value!==value.trim()||value.length>max||CONTROL.test(value))throw new DomainError("Model explanation text is invalid or too long.");return value;}
export function modelEvidenceBinding(evidence:ModelDiagnosisExplanationPacket):ModelEvidenceBinding{return{deliveryId:evidence.deliveryId,deliveryDigest:evidence.deliveryDigest,journeyPlanDigest:evidence.journeyPlanDigest,modelSpecDigest:evidence.modelSpecDigest,reportId:evidence.reportId,diagnosisRevision:evidence.diagnosisRevision,findingIds:[...evidence.findingIds]};}

/** This sentinel is only counted locally, never saved or sent to the model.
 * Reject an unaffordable explanation before provider I/O; save still rechecks
 * current capacity after the asynchronous call and the database CAS. */
export function assertModelExplanationCapacity(quote:ProofQuote):void{
 const next=structuredClone(quote);if(!next.proof.delivery)throw new DomainError("A saved delivery is required.",409);
 next.proof.delivery.modelExplanation={padding:"x".repeat(MODEL_EXPLANATION_BYTES-14)} as unknown as ModelEvidenceExplanation;
 assertQuoteEvidenceBudget(next);
}
async function packetFor(quote:ProofQuote){
 const delivery=quote.proof.delivery,plan=savedProjectJourneyPlan(quote);
 if(quote.workflow!=="proof-v1"||!delivery||delivery.variant!=="upload"||!delivery.files||!plan||!delivery.modelReport)throw new DomainError("Save a model report for this uploaded delivery before requesting an explanation.",409);
 if(!modelReportsFor(delivery).some(row=>row.id===delivery.modelReport!.id))throw new DomainError("The model report is not retained.",409);
 const digest=await runtimeDeliveryDigest(delivery.files),packet=modelDiagnosisExplanationPacket(delivery.modelReport,{deliveryId:delivery.id,deliveryDigest:digest,journeyPlanDigest:plan.planDigest,projectId:quote.id});
 return{delivery,packet,binding:modelEvidenceBinding(packet)};
}
export async function modelEvidenceContext(quote:ProofQuote,role:ProofRole,value:unknown):Promise<ModelEvidenceContext>{
 if(role!=="buyer"&&role!=="seller")throw new DomainError("Only project members may explain model evidence.",403);
 const input=object(value,["confirm","deliveryId","reportId","previousExplanationId","language"],["confirm","deliveryId","reportId","previousExplanationId"]);
 if(input.confirm!==true)throw new DomainError("Confirm sending this report's compact diagnostic facts to AI.");
 if(input.language!==undefined&&input.language!=="zh"&&input.language!=="en")throw new DomainError("Language must be zh or en.");
 const {delivery,packet,binding}=await packetFor(quote);
 if(delivery.modelRun||delivery.journeyRun||delivery.runtimeRun||delivery.transferCompetitionRun)throw new DomainError("Finish the pending evidence run before explaining saved model evidence.",409);
 if(input.deliveryId!==binding.deliveryId||input.reportId!==binding.reportId||input.previousExplanationId!==(delivery.modelExplanation?.id??null))throw new DomainError("The delivery, model report or explanation changed. Refresh before requesting AI.",409);
 assertModelExplanationCapacity(quote);
 return{language:input.language as Language|undefined??quote.language,binding,previousExplanationId:input.previousExplanationId as string|null,evidence:packet};
}
export function parseModelEvidenceProposal(value:unknown,binding:ModelEvidenceBinding):Pick<ModelEvidenceExplanation,"findings"|"limitations">{
 const input=object(value,["findings","limitations"]);
 if(!Array.isArray(input.findings)||input.findings.length<1||input.findings.length>6||!Array.isArray(input.limitations)||input.limitations.length<1||input.limitations.length>4)throw new DomainError("Model explanation exceeds its supported limits.");
 const seen=new Set<string>();const findings=input.findings.map(value=>{
  const row=object(value,["findingIds","explanation","retest"]);
  if(!Array.isArray(row.findingIds)||!row.findingIds.length||row.findingIds.length>12||new Set(row.findingIds).size!==row.findingIds.length||row.findingIds.some(id=>typeof id!=="string"||!binding.findingIds.includes(id)))throw new DomainError("AI explanation must cite only existing diagnostic finding IDs.");
  const identity=[...row.findingIds].sort().join(",");if(seen.has(identity))throw new DomainError("Duplicate explanation groups are unsupported.");seen.add(identity);
  return{findingIds:[...row.findingIds] as string[],explanation:text(row.explanation,500),retest:text(row.retest,350)};
 });const proposal={findings,limitations:input.limitations.map(value=>text(value,300))};
 if(new TextEncoder().encode(JSON.stringify(proposal)).byteLength>MODEL_EXPLANATION_BYTES-2048)throw new DomainError("The explanation exceeds its saved byte limit.");return proposal;
}
export function validateModelEvidenceExplanation(value:unknown,binding:ModelEvidenceBinding):ModelEvidenceExplanation{
 const x=object(value,["id","method","mode","model","language","generatedAt","deliveryId","deliveryDigest","journeyPlanDigest","modelSpecDigest","reportId","diagnosisRevision","findingIds","findings","limitations","usage"],["id","method","mode","model","language","generatedAt","deliveryId","deliveryDigest","journeyPlanDigest","modelSpecDigest","reportId","diagnosisRevision","findingIds","findings","limitations"]);
 if(typeof x.id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(x.id)||x.method!=="ai-model-evidence-explanation-v1"||x.mode!=="live"||!["zh","en"].includes(String(x.language))||typeof x.generatedAt!=="string"||!Number.isFinite(Date.parse(x.generatedAt))||new Date(x.generatedAt).toISOString()!==x.generatedAt)throw new DomainError("Saved model explanation identity is invalid.",409);
 for(const key of["deliveryId","deliveryDigest","journeyPlanDigest","modelSpecDigest","reportId","diagnosisRevision"]as const)if(x[key]!==binding[key])throw new DomainError("The explanation belongs to a different report, file or diagnostic revision.",409);
 if(JSON.stringify(x.findingIds)!==JSON.stringify(binding.findingIds))throw new DomainError("The diagnostic finding inventory changed.",409);
 text(x.model,120);parseModelEvidenceProposal({findings:x.findings,limitations:x.limitations},binding);
 if(x.usage!==undefined){const usage=object(x.usage,["promptTokens","completionTokens"]);if(Object.values(usage).some(n=>!Number.isSafeInteger(n)||Number(n)<0||Number(n)>1_000_000))throw new DomainError("Invalid explanation usage.");}
 if(new TextEncoder().encode(JSON.stringify(x)).byteLength>MODEL_EXPLANATION_BYTES)throw new DomainError("The saved explanation exceeds16KiB.",409);return structuredClone(x)as ModelEvidenceExplanation;
}
export async function saveModelEvidenceExplanation(quote:ProofQuote,role:ProofRole,request:unknown,value:unknown):Promise<ProofQuote>{
 const context=await modelEvidenceContext(quote,role,request),explanation=validateModelEvidenceExplanation(value,context.binding),next=structuredClone(quote);next.proof.delivery!.modelExplanation=explanation;assertQuoteEvidenceBudget(next);return next;
}
export async function currentModelEvidenceExplanation(quote:ProofQuote):Promise<ModelEvidenceExplanation|undefined>{
 if(!quote.proof.delivery?.modelExplanation)return;const {delivery,binding}=await packetFor(quote);if(delivery.modelExplanation!.reportId!==binding.reportId)return;return validateModelEvidenceExplanation(delivery.modelExplanation,binding);
}
