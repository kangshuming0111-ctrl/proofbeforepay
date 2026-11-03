import type {RequirementCoverageUnit} from "./contracts.ts";
import {suggestBookingPolicy,type BookingPartyPolicy} from "./booking-policy.ts";
import {suggestSlotCapacity,validateBookingCapacityPlan,type BookingSlotCapacity} from "./booking-capacity.ts";
import type {RuntimeCheckPlan} from "./runtime-checks.ts";

export const CAPACITY_EXAMPLE_PROTOCOL="booking-http-v4" as const;
export const CAPACITY_EXAMPLE_REQUIREMENTS="Each booking accepts at most 6 people.\nEach time slot accepts at most 8 guests in total.";
type Input={protocol:RuntimeCheckPlan["protocol"];criterionId:string;capacityCriterionId:string;units:RequirementCoverageUnit[];decisions:{id:string;disposition:"include"|"exclude"|"pending"}[]};
export type RuntimePlanDraft={ready:boolean;plan?:RuntimeCheckPlan;policy?:BookingPartyPolicy;slotCapacity?:BookingSlotCapacity;reason?:"primary"|"party"|"capacity"|"recipe"};

/** A proposal never confirms adoption. Both capacity clauses must remain separate included rows. */
export function buildRuntimePlanDraft(input:Input):RuntimePlanDraft{
  const included=input.units.filter(unit=>input.decisions.some(row=>row.id===unit.id&&row.disposition==="include"));
  const primary=included.find(unit=>unit.id===input.criterionId);
  if(!primary)return{ready:false,reason:"primary"};
  const source={start:primary.start,end:primary.end,excerpt:primary.text};
  if(input.protocol==="booking-http-v1")return{ready:true,plan:{protocol:input.protocol,criterionId:primary.id,source}};
  let policy:BookingPartyPolicy|undefined;
  try{policy=suggestBookingPolicy(source);}catch{/* Unsupported wording remains unadopted. */}
  if(!policy)return{ready:false,reason:"party"};
  if(input.protocol==="booking-http-v2")return{ready:true,policy,plan:{protocol:input.protocol,criterionId:primary.id,source,policy}};
  const secondary=included.find(unit=>unit.id===input.capacityCriterionId&&unit.id!==primary.id);
  if(!secondary)return{ready:false,policy,reason:"capacity"};
  let slotCapacity:BookingSlotCapacity|undefined;
  try{const proposal=suggestSlotCapacity({start:secondary.start,end:secondary.end,excerpt:secondary.text});if(proposal)slotCapacity={criterionId:secondary.id,...proposal};}catch{/* No partial-clause fallback. */}
  if(!slotCapacity)return{ready:false,policy,reason:"capacity"};
  try{
    const plan=validateBookingCapacityPlan({protocol:input.protocol,criterionId:primary.id,source,policy,slotCapacity},{criteria:included.map(unit=>({id:unit.id,source:unit.text}))});
    return{ready:true,policy,slotCapacity,plan};
  }catch{return{ready:false,policy,slotCapacity,reason:"recipe"};}
}
export function confirmedRuntimeDraft(draft:RuntimePlanDraft,confirmed:boolean):RuntimeCheckPlan&{confirmed:true}{
  if(!confirmed||!draft.ready||!draft.plan)throw new Error("Separately confirm the supported original clauses and backend protocol before creating.");
  return{...structuredClone(draft.plan),confirmed:true};
}
