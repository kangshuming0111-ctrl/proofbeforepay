import type {Language} from "./contracts.ts";
import type {RuntimeCheckReport,RuntimeCheckStep} from "./runtime-checks.ts";
import {runtimeStepOutcomeLabel} from "./runtime-feedback.ts";

export type RuntimeOverviewRow={id:string;label:string;detail:string};
const CAPACITY_SPOTLIGHT=["capacity_race_first","capacity_race_second","slot_a_after_race","slot_a_full","slot_a_after_rejection","slot_b_occupancy"] as const;
/** Retain the independent post-race aggregate even when dependent writes were
 * skipped. Two successful POST statuses alone never establish occupancy. */
export function runtimeCapacitySpotlightSteps(report:RuntimeCheckReport):RuntimeCheckStep[]{
  return (report.plan.protocol==="booking-http-v3"||report.plan.protocol==="booking-http-v4")?report.steps.filter(step=>(CAPACITY_SPOTLIGHT as readonly string[]).includes(step.id)):[];
}
/** Literal saved data only; malformed/oversized records do not gain a count or
 * an execution claim. UI uses text nodes and links to the complete step. */
export function runtimeSavedActualExcerpt(step:RuntimeCheckStep|undefined):string|undefined{
  const actual=step?.actual;
  return typeof actual==="string"&&actual.length>0&&actual.length<=2000&&!/[\u0000-\u001f\u007f]/u.test(actual)?actual.slice(0,420)+(actual.length>420?"…":""):undefined;
}
function reading(step:RuntimeCheckStep|undefined,language:Language,includeActual=false):string{
  const zh=language==="zh";
  if(!step)return zh?"未记录":"Not recorded";
  const status=typeof step.status==="number"&&Number.isInteger(step.status)&&step.status>=100&&step.status<=599?`HTTP ${step.status}`:zh?"无 HTTP 状态":"No HTTP status";
  const outcome=runtimeStepOutcomeLabel(step,language);
  // Never derive an aggregate from HTTP status or diagnostic prose.
  const excerpt=includeActual?runtimeSavedActualExcerpt(step):undefined;
  return `${status} · ${outcome}${excerpt?` · ${zh?"保存的实际片段":"Saved actual excerpt"}: ${excerpt}`:""}`;
}

/** Compact presentation of a saved report, not new execution or validation. */
export function runtimeOverviewRows(report:RuntimeCheckReport,language:Language):RuntimeOverviewRow[]{
  const zh=language==="zh",step=(id:string)=>report.steps.find(row=>row.id===id);
  if(report.plan.protocol==="booking-http-v3"||report.plan.protocol==="booking-http-v4")return[
    ...(report.plan.protocol==="booking-http-v4"?[{id:"same-key-pair",label:zh?"同键并发创建与重放":"Same-key concurrent creation and replay",detail:[reading(step("same_key_first"),language),reading(step("same_key_second"),language)].join(" / ")}]:[]),
    {id:"capacity-race",label:zh?"不同键容量争抢":"Distinct-key capacity race",detail:[reading(step("capacity_race_first"),language),reading(step("capacity_race_second"),language)].join(" / ")},
    {id:"slot_a_after_race",label:zh?"争抢后时段A独立查询":"Independent slot A read after race",detail:reading(step("slot_a_after_race"),language,true)},
    {id:"slot_a_after_rejection",label:zh?"后续写入后时段A最终查询":"Final slot A read after later writes",detail:reading(step("slot_a_after_rejection"),language,true)},
  ];
  return[
    {id:"create",label:zh?"创建请求":"Create request",detail:reading(step("create"),language)},
    {id:"readback",label:zh?"独立回读":"Independent readback",detail:reading(step("readback"),language)},
  ];
}
