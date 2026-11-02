"use client";

import {useId} from "react";
import type {Language, RequirementCoverageUnit} from "@/lib/contracts";
import type {RuntimeCheckPlan} from "@/lib/runtime-checks";
import type {BookingPartyPolicy} from "@/lib/booking-policy";

type Props={
  language:Language; enabled:boolean; protocol:RuntimeCheckPlan["protocol"]; criterionId:string;
  confirmed:boolean; disabled:boolean; units:RequirementCoverageUnit[];
  decisions:{id:string;disposition:"include"|"exclude"|"pending"}[]; policy?:BookingPartyPolicy;
  onEnabledChange:(enabled:boolean)=>void; onProtocolChange:(protocol:RuntimeCheckPlan["protocol"])=>void;
  onCriterionChange:(id:string)=>void; onConfirmedChange:(confirmed:boolean)=>void;
};

/** Requirement choices and the technical testing agreement remain separate.
 * A literal maximum is proposed from the original clause, never a project fee. */
export function RuntimePlanEditor({language,enabled,protocol,criterionId,confirmed,disabled,units,decisions,policy,onEnabledChange,onProtocolChange,onCriterionChange,onConfirmedChange}:Props){
  const tr=(zh:string,en:string)=>language==="zh"?zh:en,id=useId();
  const included=units.filter(unit=>decisions.some(row=>row.id===unit.id&&row.disposition==="include"));
  const depth=protocol==="booking-http-v2",ready=!!included.find(unit=>unit.id===criterionId)&&(!depth||!!policy);
  return <details className="business-check-editor">
    <summary>{tr("后端预约协议检查（可选）","Booking backend protocol checks (optional)")}</summary>
    <p>{tr("先选择原始约定，再单独确认技术检查。仅运行已登记的可丢弃测试接口，不运行卖家脚本或验证邮件。","Choose the original agreement, then separately confirm the technical checks. Only registered disposable services are tested; seller scripts and email are not verified.")}</p>
    <label><input type="checkbox" checked={enabled} disabled={disabled} onChange={event=>onEnabledChange(event.target.checked)}/>{tr("加入后端预约检查，卖家每次交付需声明测试目标","Add booking checks; the seller declares a test target for each delivery")}</label>
    {enabled&&<>
      <label htmlFor={`${id}-protocol`}>{tr("检验深度","Verification depth")}</label>
      <select id={`${id}-protocol`} value={protocol} disabled={disabled} onChange={event=>onProtocolChange(event.target.value as RuntimeCheckPlan["protocol"])}>
        <option value="booking-http-v1">{tr("基础八步：独立回读与重复请求","Eight basic steps: independent readback and replay")}</option>
        <option value="booking-http-v2">{tr("业务十八步：预约人数边界与并发一致性","Eighteen business steps: party-size boundaries and concurrent consistency")}</option>
      </select>
      <label htmlFor={`${id}-source`}>{tr("对应原始要求","Original requirement")}</label>
      <select id={`${id}-source`} value={criterionId} disabled={disabled} onChange={event=>onCriterionChange(event.target.value)}>
        {!included.some(unit=>unit.id===criterionId)&&<option value="">{tr("选择一条纳入的原始要求","Choose an included original requirement")}</option>}
        {included.map(unit=><option key={unit.id} value={unit.id}>{unit.text}</option>)}
      </select>
      {depth?(policy?<p className="runtime-check-source"><strong>{tr(`原文明示每笔预约最多 ${policy.maxPartySize} 人`,`The original clause limits each booking to ${policy.maxPartySize} people`)}</strong><span>{policy.source.excerpt}</span><span>{tr(`分别探测 ${policy.maxPartySize-1} 人、${policy.maxPartySize} 人和 ${policy.maxPartySize+1} 人，并独立查询边界预约；另测零人、小数及并发同键请求。`,`Probe ${policy.maxPartySize-1}, ${policy.maxPartySize} and ${policy.maxPartySize+1} people and independently read boundary bookings; also check zero, fractional and concurrent same-key requests.`)}</span></p>:<p className="runtime-check-warning" role="status">{tr("这条原文没有可明确识别的预约人数上限。请先澄清原始要求，例如“每笔预约最多6人”。目前支持2–12人的单一明确上限；金额、最少人数、矛盾或复合限制不会代入。也可选择基础八步。","This clause has no unambiguous supported booking maximum. Clarify the original requirement, for example ‘Each booking accepts at most 6 people.’ One clear maximum from 2–12 is supported. Prices, minimums, conflicting or compound limits are not inferred. You can also choose the eight basic steps.")}</p>):<p>{tr("基础八步检查版本声明、错误输入、创建、独立回读、重复请求、冲突与原记录保持，不核验具体业务人数上限。","The eight basic steps check declared revision, invalid input, creation, independent readback, replay, conflicts and an unchanged original. They do not check a business-specific party-size maximum.")}</p>}
      <label><input type="checkbox" checked={confirmed} disabled={disabled||!ready} onChange={event=>onConfirmedChange(event.target.checked)}/>{depth?tr("我已核对原文人数上限，并确认将十八步协议纳入本次验收","I checked the original party-size maximum and confirm the eighteen-step protocol for this acceptance"):tr("我已阅读并确认将基础八步协议纳入本次验收","I reviewed and confirm the basic eight-step protocol for this acceptance")}</label>
    </>}
  </details>;
}
