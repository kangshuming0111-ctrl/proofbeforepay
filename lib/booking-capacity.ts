import {DomainError} from "./domain.ts";
import {validateBookingPolicy,type BookingPartyPolicy,type BookingPolicySource} from "./booking-policy.ts";

export type BookingSlotCapacity={criterionId:string;maxGuestsPerSlot:number;source:BookingPolicySource};
export type BookingCapacityPlan={protocol:"booking-http-v3"|"booking-http-v4";criterionId:string;source:BookingPolicySource;policy:BookingPartyPolicy;slotCapacity:BookingSlotCapacity};
export type SlotCapacityProposal=Pick<BookingSlotCapacity,"maxGuestsPerSlot"|"source">;

const CONTROL_OR_FORMAT=/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
function object(value:unknown,allowed:readonly string[],name:string):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new DomainError(`${name} must be a plain object.`);
  for(const key of Reflect.ownKeys(value))if(typeof key!=="string"||!allowed.includes(key)||!("value"in Object.getOwnPropertyDescriptor(value,key)!))throw new DomainError(`${name} contains an unsupported field.`);
  return value as Record<string,unknown>;
}
function identifier(value:unknown,name:string):string{
  if(typeof value!=="string"||!IDENTIFIER.test(value))throw new DomainError(`${name} is invalid.`);return value;
}
function exactSource(value:unknown,name:string):BookingPolicySource{
  const source=object(value,["start","end","excerpt"],name);
  if(!Number.isSafeInteger(source.start)||!Number.isSafeInteger(source.end)||(source.start as number)<0||(source.end as number)<=(source.start as number)
    ||typeof source.excerpt!=="string"||!source.excerpt.trim()||source.excerpt.length>1000||CONTROL_OR_FORMAT.test(source.excerpt)
    ||(source.end as number)-(source.start as number)!==source.excerpt.length)throw new DomainError(`${name} must retain an exact complete UTF-16 source clause.`);
  return{start:source.start as number,end:source.end as number,excerpt:source.excerpt};
}
const GRAMMARS=[
  /^(?:each|every)\s+time\s+slot\s+(?:accepts|allows|supports)\s+(?:at\s+most|a\s+maximum\s+of)\s+([1-9]\d?)\s+(?:people|persons|guests)\s+in\s+total$/iu,
  /^每(?:个|個|一|一個)?(?:时间段|时段|時間段|時段)(?:合计|合計|总共|總共|总计|總計)?最多(?:接受|接待|容纳|容納)?\s*([1-9]\d?)\s*(?:人|位客人)(?:合计|合計|总计|總計)?$/u,
] as const;

/** A narrow complete-clause proposal. The original span, including punctuation,
 * remains intact: no convenient substring can discard an exception or minimum. */
export function suggestSlotCapacity(requirementSource:unknown):SlotCapacityProposal|undefined{
  const source=exactSource(requirementSource,"Slot-capacity requirement");
  const clause=source.excerpt.trim().replace(/[。.!！]$/u,"").trimEnd();
  for(const grammar of GRAMMARS){
    const match=grammar.exec(clause);if(!match)continue;
    const maxGuestsPerSlot=Number(match[1]);
    if(maxGuestsPerSlot<3||maxGuestsPerSlot>12)return;
    return{maxGuestsPerSlot,source};
  }
}
export function validateSlotCapacity(value:unknown,requirementSource:unknown):SlotCapacityProposal{
  const raw=object(value,["maxGuestsPerSlot","source"],"Slot capacity"),source=exactSource(raw.source,"Slot-capacity source");
  const proposed=suggestSlotCapacity(requirementSource);
  if(!proposed||raw.maxGuestsPerSlot!==proposed.maxGuestsPerSlot||source.start!==proposed.source.start||source.end!==proposed.source.end||source.excerpt!==proposed.source.excerpt)
    throw new DomainError("Slot capacity must match one complete supported original clause and its exact source span.");
  return proposed;
}

/** The atomic-capacity recipe deliberately supports only a small range where
 * two individually valid requests exceed one slot and a positive fill remains. */
export function capacityRecipeNumbers(plan:BookingCapacityPlan):{maxPartySize:number;maxGuestsPerSlot:number;racePartySize:number;remainingPartySize:number}{
  const maxPartySize=plan.policy.maxPartySize,maxGuestsPerSlot=plan.slotCapacity.maxGuestsPerSlot;
  if(!Number.isInteger(maxPartySize)||maxPartySize<2||maxPartySize>12||!Number.isInteger(maxGuestsPerSlot)||maxGuestsPerSlot<3||maxGuestsPerSlot>12
    ||maxPartySize>maxGuestsPerSlot||maxGuestsPerSlot>=2*maxPartySize)throw new DomainError("Capacity checks require party maximum M2–12, slot maximum C3–12 and M ≤ C < 2M.");
  const racePartySize=Math.floor(maxGuestsPerSlot/2)+1,remainingPartySize=maxGuestsPerSlot-racePartySize;
  return{maxPartySize,maxGuestsPerSlot,racePartySize,remainingPartySize};
}

/** Caller-provided criteria must already be the included agreement criteria.
 * Root intake additionally resolves the capacity clause against saved coverage. */
export function validateBookingCapacityPlan(value:unknown,options:{sourceText?:string;criteria?:{id:string;source?:string}[]}={}):BookingCapacityPlan{
  const raw=object(value,["protocol","criterionId","source","policy","slotCapacity"],"Capacity test plan");
  if(raw.protocol!=="booking-http-v3"&&raw.protocol!=="booking-http-v4")throw new DomainError("Choose the explicit booking-http-v3 or booking-http-v4 capacity protocol.");
  const criterionId=identifier(raw.criterionId,"Party-limit criterion"),source=exactSource(raw.source,"Party-limit source");
  const policy=validateBookingPolicy(raw.policy,source),capacity=object(raw.slotCapacity,["criterionId","maxGuestsPerSlot","source"],"Slot-capacity criterion");
  const capacityId=identifier(capacity.criterionId,"Slot-capacity criterion"),capacitySource=exactSource(capacity.source,"Complete slot-capacity source");
  if(capacityId===criterionId||!(source.end<=capacitySource.start||capacitySource.end<=source.start))throw new DomainError("Party and slot limits need two separate included original clauses.");
  const proposed=validateSlotCapacity({maxGuestsPerSlot:capacity.maxGuestsPerSlot,source:capacitySource},capacitySource);
  for(const[id,clause]of[[criterionId,source],[capacityId,capacitySource]] as const){
    if(options.sourceText!==undefined&&options.sourceText.slice(clause.start,clause.end)!==clause.excerpt)throw new DomainError("Capacity sources must retain the exact original requirement substrings.");
    if(options.criteria){const criterion=options.criteria.find(item=>item.id===id);if(!criterion||criterion.source!==undefined&&criterion.source!==clause.excerpt)throw new DomainError("Capacity sources must match separate included original criteria.");}
  }
  const plan:BookingCapacityPlan={protocol:raw.protocol,criterionId,source,policy,slotCapacity:{criterionId:capacityId,...proposed}};
  capacityRecipeNumbers(plan);return plan;
}
