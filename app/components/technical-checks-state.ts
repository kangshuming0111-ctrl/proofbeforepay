import type {ProofDelivery} from "@/lib/contracts";

export type TechnicalChecksFocusRequest = {kind:"journey"|"transfer";id:number;deliveryId:string};
export type TechnicalChecksDisclosure = {activated:boolean;open:boolean};
export type TechnicalChecksDisclosureAction = {type:"needed"}|{type:"open"}|{type:"toggle";open:boolean};

/** Presence is a navigation hint, never a claim that a plan or report passed.
 * Source-visibility checks remain in the ordinary browser flow. Follow-up heads
 * have no family field, so they cannot independently imply backend activity. */
export function hasTechnicalChecksState(delivery:ProofDelivery,hasSupplementalEvidence=false):boolean{
  return Boolean(delivery.journeyPlan||delivery.journeyRun||delivery.journeyReport||delivery.journeyPlanSuggestions
    ||delivery.journeyPlanAdoption||delivery.journeyExplanation||delivery.journeyHistory?.length
    ||delivery.journeyEvidenceReservation||delivery.transferCompetitionRun||hasSupplementalEvidence
    ||delivery.supplementalCatalog?.context.artifactManifest
    ||delivery.supplementalCatalog?.rows.some(row=>row.ref.family==="deployment-source"||row.ref.family==="time-policy"));
}

export function initialTechnicalChecksDisclosure(needed:boolean):TechnicalChecksDisclosure{return {activated:needed,open:needed};}
export function technicalChecksDisclosure(state:TechnicalChecksDisclosure,action:TechnicalChecksDisclosureAction):TechnicalChecksDisclosure{
  if(action.type==="open")return {activated:true,open:true};
  if(action.type==="needed")return {activated:true,open:state.activated?state.open:true};
  return {activated:state.activated||action.open,open:action.open};
}
export function technicalChecksFocusMatches(request:TechnicalChecksFocusRequest|undefined,deliveryId:string):boolean{
  return Boolean(request&&request.deliveryId===deliveryId&&Number.isSafeInteger(request.id)&&request.id>0
    &&(request.kind==="journey"||request.kind==="transfer"));
}
export function integrationRequestHistoryPresent(value:unknown):boolean{
  if(!value||typeof value!=="object"||Array.isArray(value)||!Array.isArray((value as {requests?:unknown}).requests))throw new Error("Integration history was not established.");
  return (value as {requests:unknown[]}).requests.length>0;
}

export type TechnicalApplicationHistory={state:"known";hasRecords:boolean}|{state:"unknown"};
/** One read, no automatic retries and no mutation. A completed old-scope read
 * cannot settle or reveal tools after disposal or an identity/epoch change. */
export function readTechnicalApplicationHistory(read:()=>Promise<unknown>,isCurrent:()=>boolean,settle:(value:TechnicalApplicationHistory)=>void):()=>void{
  let active=true;
  void(async()=>{
    try{const value=await read();if(active&&isCurrent())settle({state:"known",hasRecords:integrationRequestHistoryPresent(value)});}
    catch{if(active&&isCurrent())settle({state:"unknown"});}
  })();
  return()=>{active=false;};
}
