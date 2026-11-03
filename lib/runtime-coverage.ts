import type {Language} from "./contracts.ts";
import {runtimeProtocolStepIds,runtimeReportMethod,type RuntimeCheckPlan,type RuntimeCheckReport} from "./runtime-checks.ts";

const FAMILIES=[
  {id:"declaration",names:["接口声明","Target declaration"],steps:["revision"]},
  {id:"invalid-input",names:["无效输入拒绝","Invalid-input rejection"],steps:["missing_slot","invalid_email","party_zero","party_fraction","party_negative","party_string"]},
  {id:"party-boundaries",names:["单笔人数边界","Per-booking boundaries"],steps:["party_one","party_one_readback","party_below","party_below_readback","party_exact","party_exact_readback","party_above"]},
  {id:"idempotency",names:["重放、冲突及同键并发","Replay, conflicts and same-key concurrency"],steps:["replay","conflict","concurrent_first","concurrent_second","concurrent_readback","race_winner_replay","slot_a_after_replay","winner_conflict","same_key_first","same_key_second","same_key_readback"]},
  {id:"slot-capacity",names:["不同键容量争抢与满额","Distinct-key capacity and full-slot checks"],steps:["slot_a_initial","capacity_race_first","capacity_race_second","slot_a_after_race","fill_remainder","slot_a_full","reject_extra","slot_a_after_rejection"]},
  {id:"retained-records",names:["独立回读与旧记录保持","Independent reads and retained records"],steps:["create","readback","unchanged","race_winner_readback","fill_readback"]},
  {id:"slot-isolation",names:["独立时段B及上限人数","Independent slot B at party maximum"],steps:["slot_b_create","slot_b_readback","slot_b_occupancy"]},
] as const;
export type RuntimeCoverageFamily=typeof FAMILIES[number]["id"]|"other";
export type RuntimeCoverageGroup={id:RuntimeCoverageFamily;stepIds:string[];planned:number;observed?:number;mismatched?:number;unavailable?:number};
export type RuntimeCoverage={state:"not_run"|"pending"|"unavailable"|"recorded";planned:number;groups:RuntimeCoverageGroup[];reportId?:string};
export function runtimeCoverageFamilyName(id:RuntimeCoverageFamily,language:Language):string{
  return FAMILIES.find(family=>family.id===id)?.names[language==="zh"?0:1]??(language==="zh"?"其他已明确约定的步骤":"Other explicitly agreed steps");
}
/** A partition of canonical named protocol steps, not a website coverage score.
 * Callers bind the report to the actual delivery/target. A pending run cannot
 * borrow older observations; missing or incompatible evidence shows no counts. */
export function runtimeCoverage(plan:RuntimeCheckPlan,report?:RuntimeCheckReport,pending=false):RuntimeCoverage{
  const ids=runtimeProtocolStepIds(plan),assigned=new Set<string>();
  const groups:RuntimeCoverageGroup[]=FAMILIES.map(family=>{
    const stepIds=ids.filter(id=>(family.steps as readonly string[]).includes(id)&&!assigned.has(id));for(const id of stepIds)assigned.add(id);
    return{id:family.id,stepIds,planned:stepIds.length};
  }).filter(group=>group.planned>0);
  const other=ids.filter(id=>!assigned.has(id));if(other.length)groups.push({id:"other",stepIds:other,planned:other.length});
  const base={planned:ids.length,groups};
  if(pending)return{...base,state:"pending"};
  if(!report)return{...base,state:"not_run"};
  if(report.method!==runtimeReportMethod(plan)||JSON.stringify(report.plan)!==JSON.stringify(plan)||report.steps.length!==ids.length
    ||report.steps.some((step,index)=>step.id!==ids[index]||!["observed","mismatch","unavailable"].includes(step.outcome)))return{...base,state:"unavailable"};
  for(const group of groups){const steps=report.steps.filter(step=>group.stepIds.includes(step.id));group.observed=steps.filter(step=>step.outcome==="observed").length;group.mismatched=steps.filter(step=>step.outcome==="mismatch").length;group.unavailable=steps.filter(step=>step.outcome==="unavailable").length;}
  return{...base,state:"recorded",reportId:report.id};
}
