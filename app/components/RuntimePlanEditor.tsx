"use client";

import {useId} from "react";
import type {Language,RequirementCoverageUnit} from "@/lib/contracts";
import type {RuntimeCheckPlan} from "@/lib/runtime-checks";
import {buildRuntimePlanDraft} from "@/lib/runtime-plan-draft";
import {capacityRecipeNumbers} from "@/lib/booking-capacity";

type Props={language:Language;enabled:boolean;protocol:RuntimeCheckPlan["protocol"];criterionId:string;capacityCriterionId:string;confirmed:boolean;disabled:boolean;units:RequirementCoverageUnit[];
  decisions:{id:string;disposition:"include"|"exclude"|"pending"}[];onEnabledChange:(value:boolean)=>void;onProtocolChange:(value:RuntimeCheckPlan["protocol"])=>void;
  onCriterionChange:(id:string)=>void;onCapacityCriterionChange:(id:string)=>void;onConfirmedChange:(value:boolean)=>void};

export function RuntimePlanEditor({language,enabled,protocol,criterionId,capacityCriterionId,confirmed,disabled,units,decisions,onEnabledChange,onProtocolChange,onCriterionChange,onCapacityCriterionChange,onConfirmedChange}:Props){
  const tr=(zh:string,en:string)=>language==="zh"?zh:en,id=useId();
  const included=units.filter(unit=>decisions.some(row=>row.id===unit.id&&row.disposition==="include"));
  const draft=buildRuntimePlanDraft({protocol,criterionId,capacityCriterionId,units,decisions}),{policy,slotCapacity}=draft;
  const capacity=protocol==="booking-http-v3",depth=protocol!=="booking-http-v1";
  const recipe=draft.plan?.protocol==="booking-http-v3"?capacityRecipeNumbers(draft.plan):undefined;
  function change(action:()=>void){onConfirmedChange(false);action();}
  return <details className="business-check-editor">
    <summary>{tr("后端预约协议检查（可选）","Booking backend protocol checks (optional)")}</summary>
    <p>{tr("先选择原始约定，再单独确认技术检查。仅运行已登记的可丢弃测试接口，不运行卖家脚本或验证邮件。","Choose the original agreement, then separately confirm technical checks. Only registered disposable services are tested; seller scripts and email are not verified.")}</p>
    <label><input type="checkbox" checked={enabled} disabled={disabled} onChange={event=>change(()=>onEnabledChange(event.target.checked))}/>{tr("加入后端预约检查，卖家每次交付需声明测试目标","Add booking checks; the seller declares a test target for each delivery")}</label>
    {enabled&&<>
      <label htmlFor={`${id}-protocol`}>{tr("检验深度","Verification depth")}</label>
      <select id={`${id}-protocol`} value={protocol} disabled={disabled} onChange={event=>change(()=>onProtocolChange(event.target.value as RuntimeCheckPlan["protocol"]))}>
        <option value="booking-http-v1">{tr("基础八步：独立回读与重复请求","Eight basic steps: independent readback and replay")}</option>
        <option value="booking-http-v2">{tr("业务十八步：人数边界与同键并发","Eighteen business steps: party boundaries and same-key concurrency")}</option>
        <option value="booking-http-v3">{tr("容量十七步：不同键争抢、满额及独立时段","Seventeen capacity steps: distinct-key race, full slot and slot isolation")}</option>
      </select>
      <label htmlFor={`${id}-source`}>{depth?tr("单笔人数上限的原文要求","Original per-booking party-limit clause"):tr("对应原始要求","Original requirement")}</label>
      <select id={`${id}-source`} value={included.some(unit=>unit.id===criterionId)?criterionId:""} disabled={disabled} onChange={event=>change(()=>onCriterionChange(event.target.value))}>
        <option value="">{tr("选择一条纳入的原始要求","Choose an included original requirement")}</option>
        {included.map(unit=><option key={unit.id} value={unit.id}>{unit.text}</option>)}
      </select>
      {depth&&(policy?<p className="runtime-check-source"><strong>{tr(`每笔预约最多 ${policy.maxPartySize} 人`,`At most ${policy.maxPartySize} people per booking`)}</strong><span>{draft.plan?.source.excerpt??included.find(unit=>unit.id===criterionId)?.text}</span></p>:<p className="runtime-check-warning" role="status">{tr("请选择明示每笔预约最多人数的完整原文，例如“每笔预约最多6人”。支持2–12人；金额、最少人数和复合限制不会代入。","Select a complete, explicit maximum-party clause, for example ‘Each booking accepts at most 6 people.’ Supports 2–12; prices, minimums and compound limits are not inferred.")}</p>)}
      {capacity&&<>
        <label htmlFor={`${id}-capacity`}>{tr("时段总容量的另一条原文要求","Separate original total-capacity clause")}</label>
        <select id={`${id}-capacity`} value={included.some(unit=>unit.id===capacityCriterionId&&unit.id!==criterionId)?capacityCriterionId:""} disabled={disabled} onChange={event=>change(()=>onCapacityCriterionChange(event.target.value))}>
          <option value="">{tr("另选一条纳入的时段容量要求","Choose a separate included capacity requirement")}</option>
          {included.filter(unit=>unit.id!==criterionId).map(unit=><option key={unit.id} value={unit.id}>{unit.text}</option>)}
        </select>
        {slotCapacity?<p className="runtime-check-source"><strong>{tr(`每个时段合计最多 ${slotCapacity.maxGuestsPerSlot} 人`,`At most ${slotCapacity.maxGuestsPerSlot} guests per time slot in total`)}</strong><span>{slotCapacity.source.excerpt}</span></p>:<p className="runtime-check-warning" role="status">{tr("需要另一条完整原文，例如“每个时段合计最多8人”。支持3–12人；不能借用单笔上限代替时段容量。","A separate complete clause is required, for example ‘Each time slot accepts at most 8 guests in total.’ Supports 3–12; the party limit cannot substitute for slot capacity.")}</p>}
        {recipe?<p>{tr(`十七步：两个不同请求键各提交 ${recipe.racePartySize} 人，同一时段应仅一个201、另一个409；补入 ${recipe.remainingPartySize} 人至容量 ${recipe.maxGuestsPerSlot}，拒绝再加1人，再核对另一时段及原记录。恢复重试不重放首次并发；需新运行才能重新观察。`,`Seventeen steps: two distinct keys each request ${recipe.racePartySize} guests; one should return 201 and the other 409. Add ${recipe.remainingPartySize} to fill ${recipe.maxGuestsPerSlot}, reject one extra guest, then check another slot and the original records. Recovery never replays the initial race; a fresh run is needed to observe it again.`)}</p>:slotCapacity&&policy&&<p className="runtime-check-warning" role="status">{tr("此受控方案要求单笔上限 M 与时段容量 C 满足 M ≤ C < 2M；请澄清约定或选择其他协议，系统不会修改原文数值。","This bounded recipe requires party maximum M and slot capacity C to satisfy M ≤ C < 2M. Clarify the agreement or choose another protocol; original values are never changed.")}</p>}
      </>}
      {!capacity&&(depth&&policy?<p>{tr(`十八步探测 ${policy.maxPartySize-1}/${policy.maxPartySize}/${policy.maxPartySize+1} 人、零人、小数及同键并发一致性；不检验时段总容量。`,`Eighteen steps probe ${policy.maxPartySize-1}/${policy.maxPartySize}/${policy.maxPartySize+1} people, zero, fractions and same-key concurrent consistency. Total slot capacity is not tested.`)}</p>:!depth&&<p>{tr("基础八步检查版本声明、错误输入、创建、独立回读、重复请求、冲突与原记录保持，不核验业务人数或时段容量。","Eight basic steps check revision, invalid input, creation, independent readback, replay, conflict and unchanged records. Business party and capacity limits are not tested.")}</p>)}
      <label><input type="checkbox" checked={confirmed} disabled={disabled||!draft.ready} onChange={event=>onConfirmedChange(event.target.checked)}/>{capacity?tr("我已分别核对两条原文及其数值，确认将十七步容量协议纳入验收","I checked both original clauses and their values separately and confirm the seventeen-step capacity protocol"):depth?tr("我已核对原文人数上限，确认将十八步协议纳入验收","I checked the original party limit and confirm the eighteen-step protocol"):tr("我已阅读并确认将基础八步协议纳入验收","I reviewed and confirm the basic eight-step protocol")}</label>
    </>}
  </details>;
}
