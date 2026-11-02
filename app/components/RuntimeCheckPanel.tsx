"use client";

import {useEffect, useId, useState} from "react";
import {ArrowRight, ChevronDown, FlaskConical, MessageSquarePlus} from "lucide-react";
import type {Language} from "@/lib/contracts";
import {runtimeReportSummary, runtimeProtocolStepIds, runtimeReportMethod, type RuntimeCheckPlan, type RuntimeCheckReport} from "@/lib/runtime-checks";
import {draftRuntimeFeedback, runtimeReasonLabel, runtimeStepName} from "@/lib/runtime-feedback";
import type {RuntimeTargetDescriptor} from "@/lib/server-runtime-targets";
import type {RuntimeRegistrationSnapshot} from "@/lib/runtime-registration";
import "../runtime-check.css";

export type RuntimeCheckPanelProps = {
  language: Language;
  deliveryId: string;
  plan: RuntimeCheckPlan;
  targetId?: string;
  target?: RuntimeTargetDescriptor;
  registration?: RuntimeRegistrationSnapshot;
  deliveryDigest?: string;
  report?: RuntimeCheckReport;
  pending?: boolean;
  busy?: boolean;
  enabled: boolean;
  onRun: () => void;
  onPrepareFeedback?: (criterionId: string, comment: string) => void;
};
const TARGETS: Record<string,[string,string]> = {
  "lab-flawed": ["受控示例：缺陷预约接口", "Controlled example: flawed booking service"],
  "lab-fixed": ["受控示例：修正版预约接口", "Controlled example: corrected booking service"],
  "lab-policy-flawed": ["受控示例：人数上限存在缺陷", "Controlled example: flawed party-size limit"],
  "lab-policy-fixed": ["受控示例：修正人数上限", "Controlled example: corrected party-size limit"],
};
export function currentRuntimeReport(report:RuntimeCheckReport|undefined, deliveryId:string, plan:RuntimeCheckPlan, targetId?:string,deliveryDigest?:string) {
  const steps=runtimeProtocolStepIds(plan);
  return report?.deliveryId===deliveryId && report.method===runtimeReportMethod(plan) && JSON.stringify(report.plan)===JSON.stringify(plan)
    && Array.isArray(report.steps) && report.steps.length===steps.length && report.steps.every((step,index)=>step.id===steps[index])
    && !!targetId && report.target.id===targetId && !!deliveryDigest && report.deliveryDigest===deliveryDigest ? report : undefined;
}
function displayTime(value:string) {return Number.isFinite(Date.parse(value))?`${new Date(value).toISOString().slice(0,19).replace("T"," ")} UTC`:value;}
function displayReason(reason:string,language:Language){
  if(reason==="registration_expired")return language==="zh"?"测试部署登记已过期，本次没有继续发出请求。":"The staging approval expired; this run made no further requests.";
  if(reason==="registration_no_longer_approved")return language==="zh"?"测试部署登记已撤销或改变，本次没有继续发出请求。":"The staging approval was revoked or changed; this run made no further requests.";
  return runtimeReasonLabel(reason,language);
}

/** A report is server-executed HTTP evidence for one recorded test target and
 * exact uploaded-file digest; it is not an attestation that target runs those files. */
export function RuntimeCheckPanel({language,deliveryId,plan,targetId,target:descriptor,registration:deliveryRegistration,deliveryDigest,report,pending=false,busy=false,enabled,onRun,onPrepareFeedback}:RuntimeCheckPanelProps) {
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  const current=currentRuntimeReport(report,deliveryId,plan,targetId,deliveryDigest);
  const summary=current?runtimeReportSummary(current.steps):undefined;
  const issues=!!summary&&(summary.issues>0||summary.unavailable>0);
  const [open,setOpen]=useState(!current||issues);
  const [consent,setConsent]=useState(false);
  const consentId=useId();
  useEffect(()=>{setConsent(false);setOpen(!current||issues||pending);},[deliveryId,targetId,current?.id,pending]);
  const target=descriptor&&descriptor.id===targetId&&descriptor.protocol===plan.protocol?descriptor:undefined;
  const registration=deliveryRegistration&&deliveryRegistration.id===targetId&&deliveryRegistration.protocol===plan.protocol&&deliveryRegistration.frontendBundleDigest===deliveryDigest?deliveryRegistration:current?.target.registration;
  const fixture=targetId?TARGETS[targetId]:undefined;
  const targetLabel=registration?.label??current?.target.label??target?.label??(fixture?tr(...fixture):undefined);
  const registered=!!registration||target?.kind==="registered";
  const canRun=enabled&&!busy&&!pending&&!!targetLabel;
  const policy=plan.protocol==="booking-http-v2"?plan.policy:undefined;
  const above=current?.steps.find(step=>step.id==="party_above");
  const concurrent=current?.steps.filter(step=>["concurrent_first","concurrent_second","concurrent_readback"].includes(step.id));
  return <details className="runtime-check-panel" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><span><FlaskConical size={15} aria-hidden="true"/>{tr("预约接口实测","Booking HTTP check")}</span><span>{pending||busy?tr("正在运行","Running"):summary?tr(`${summary.issues} 项不符 · ${summary.unavailable} 项未确定`,`${summary.issues} mismatched · ${summary.unavailable} unavailable`):tr("尚无当前报告","No current report")}</span><ChevronDown size={14} aria-hidden="true"/></summary>
    <div className="runtime-check-body">
      <p>{policy?tr("十八步真实 HTTP 检查将原文人数上限、边界请求及同键并发纳入检验，并独立查回预约。只运行平台运营者批准的测试目标，不扫描任意网址。","Eighteen actual HTTP steps test the original party-size maximum, boundaries and concurrent same-key requests, with independent booking readback. Only operator-approved test targets run; arbitrary URLs are not scanned."):tr("用真实 HTTP 请求检查基础八步：缺失字段、错误邮箱、创建、独立读回、重复请求、冲突和最终读回。只运行平台运营者批准的测试目标，不扫描任意网址。","Actual HTTP requests check eight basic steps: missing fields, invalid email, creation, independent readback, replay, conflict and final readback. Only operator-approved test targets run; arbitrary URLs are not scanned.")}</p>
      <p className="runtime-check-source"><strong>{tr("已确认的原始要求","Original agreed requirement")}</strong><span>{plan.source.excerpt}</span></p>
      {policy&&<p className="runtime-check-source"><strong>{tr(`每笔最多 ${policy.maxPartySize} 人；探测 ${policy.maxPartySize-1} / ${policy.maxPartySize} / ${policy.maxPartySize+1} 人`,`Maximum ${policy.maxPartySize} people; probe ${policy.maxPartySize-1} / ${policy.maxPartySize} / ${policy.maxPartySize+1}`)}</strong><span>{policy.source.excerpt}</span><span>{tr("预期以内和恰好上限可创建并查回，超过上限应拒绝。并发只核对同键响应与回读的一致性，不证明整个数据库没有重复记录。","Below-limit and exact-limit bookings should be created and read back; above-limit input should be rejected. Concurrency checks same-key response/readback consistency, not the absence of hidden duplicates throughout a database.")}</span></p>}
      <p className="runtime-check-target">{registered?tr("本版卖家测试部署","Seller staging for this delivery"):tr("本版虚构演示接口","Synthetic demo for this delivery")}: <strong>{targetLabel??tr("尚未选择受支持的目标","No supported target selected")}</strong></p>
      {registration&&<p className="runtime-check-note">{tr("登记修订","Registration revision")}: {registration.registrationRevision} · {tr("部署修订","Deployment revision")}: {registration.deploymentRevision}<br/>{tr("绑定上传摘要","Bound upload digest")}: <code title={registration.frontendBundleDigest}>{registration.frontendBundleDigest.slice(0,12)}…</code> · {tr("登记有效至","Approval expires")}: {displayTime(registration.expiresAt)}<br/>{tr("保存的报告继续保留；每次新增运行仍需服务器核对当前登记、有效期与本版文件摘要。","Saved reports remain readable. Every new run still requires server checks of current approval, expiry and this version's upload digest.")}</p>}
      <label className="runtime-check-consent" htmlFor={consentId}><input id={consentId} type="checkbox" checked={consent} disabled={!canRun} onChange={event=>setConsent(event.target.checked)}/><span>{registered?tr("允许本次向上述卖家测试部署提交生成的虚构预约测试数据。不会发送合同、页面文件或私人客户资料。","Allow this run to submit generated fictional booking data to the seller staging target above. No contract, website files or private client material is sent."):tr("允许本次向上述虚构演示接口提交生成的虚构预约测试数据。不会发送合同、页面文件或私人客户资料。","Allow this run to submit generated fictional booking data to the synthetic demo service above. No contract, website files or private client material is sent.")}</span></label>
      <button type="button" className="runtime-check-run" disabled={!canRun||!consent} onClick={()=>{if(!canRun||!consent)return;setConsent(false);onRun();}}>{pending||busy?tr("正在请求和读回…","Requesting and reading back…"):current?tr("重新运行本版接口测试","Run this version’s HTTP check again"):tr("运行本版接口测试","Run this version’s HTTP check")}<ArrowRight size={13} aria-hidden="true"/></button>
      {!enabled&&!busy&&!pending&&<p className="runtime-check-note">{tr("当前状态不能新增测试，已有报告仍可查看。","New tests are unavailable in this state; saved reports remain readable.")}</p>}
      {(pending||busy)&&<p className="runtime-check-note" role="status">{tr("结果尚未完成，不能按通过处理；新报告不会替换已经验收时保存的依据。","The run is incomplete and cannot be treated as a pass. A new report does not replace evidence saved at acceptance.")}</p>}
      {report&&!current&&<p className="runtime-check-warning">{tr("已保存报告不符合当前交付、目标或计划，未借用它显示当前结果。请重新检查。","The saved report does not match this delivery, target or plan. It is not used as the current result; check again.")}</p>}
      {current&&summary&&<>
        <p className="runtime-check-counts">{tr(`本次 ${summary.steps} 步：${summary.observed} 步有预期观测支持，${summary.issues} 步不符，${summary.unavailable} 步无法确定。`,`${summary.steps} steps this run: ${summary.observed} with expected observations, ${summary.issues} mismatched, ${summary.unavailable} unavailable.`)}</p>
        {policy&&above?.outcome==="mismatch"&&above.status!==undefined&&above.status>=200&&above.status<300&&<p className="runtime-check-warning"><strong>{tr(`约定最多 ${policy.maxPartySize} 人，${policy.maxPartySize+1} 人请求却返回 HTTP ${above.status}`,`Agreed maximum ${policy.maxPartySize}; a ${policy.maxPartySize+1}-person request returned HTTP ${above.status}`)}</strong><br/>{tr("预期是 400/422 及结构化验证错误码；请查看这一步的实际证据。","Expected 400/422 and the structured validation code; inspect the actual evidence for this step.")}</p>}
        {policy&&concurrent?.length===3&&<p className="runtime-check-note">{tr("同键并发及独立回读","Concurrent same-key requests and independent readback")}: {concurrent.map(step=>`${step.status??"—"} (${step.outcome==="observed"?tr("观测支持","observed"):step.outcome==="mismatch"?tr("不符","mismatch"):tr("未确定","unavailable")})`).join(" / ")}</p>}
        <ol className="runtime-check-steps">{current.steps.map(step=><li key={step.id} className={`runtime-step-${step.outcome}`}>
          <div><strong>{runtimeStepName(step.id,language,step.label)}</strong><span>{step.outcome==="observed"?tr("观测支持","Observed support"):step.outcome==="mismatch"?tr("不符","Mismatch"):tr("无法确定","Unavailable")}</span></div>
          <details><summary>{tr("请求、预期与实际","Request, expected and actual")}</summary><dl>
            <div><dt>{tr("请求","Request")}</dt><dd><code>{step.method} {step.path}</code>{step.status!==undefined?` · HTTP ${step.status}`:""}</dd></div>
            <div><dt>{tr("预期","Expected")}</dt><dd>{step.expected}</dd></div>
            {step.actual&&<div><dt>{tr("实际","Actual")}</dt><dd>{step.actual}</dd></div>}
            {step.reason&&<div><dt>{tr("未确定原因","Unavailable reason")}</dt><dd>{displayReason(step.reason,language)} <code>({step.reason})</code></dd></div>}
          </dl></details>
        </li>)}</ol>
        {issues&&onPrepareFeedback&&<button type="button" className="runtime-check-feedback" disabled={busy||pending} onClick={()=>onPrepareFeedback(plan.criterionId,draftRuntimeFeedback(current,language))}><MessageSquarePlus size={13} aria-hidden="true"/>{tr("起草接口修改意见","Draft HTTP change request")}</button>}
        <details className="runtime-check-binding"><summary>{tr("报告、版本和目标绑定","Report, delivery and target binding")}</summary><dl>
          <div><dt>{tr("报告","Report")}</dt><dd><code>{current.id}</code></dd></div><div><dt>{tr("交付版本","Delivery")}</dt><dd><code>{current.deliveryId}</code></dd></div><div><dt>{tr("上传文件摘要","Uploaded-file digest")}</dt><dd><code>{current.deliveryDigest}</code></dd></div><div><dt>{tr("目标","Target")}</dt><dd>{current.target.label} · {current.target.origin}</dd></div><div><dt>{tr("目标声明修订","Target-declared revision")}</dt><dd>{current.target.revision}</dd></div><div><dt>{tr("运行时间","Run time")}</dt><dd>{displayTime(current.startedAt)} → {displayTime(current.finishedAt)}</dd></div>
        </dl><p>{tr("文件摘要将报告关联到本次上传；接口修订由测试目标声明。这不证明远端接口由这些上传文件构建。","The digest links this report to the upload; the test target declares its revision. This does not attest that the remote service was built from those uploaded files.")}</p></details>
      </>}
      <p className="runtime-check-limits">{tr("本次只证明受控接口的有限 HTTP 路径。没有操作卖家前端表单，不验证邮件送达、任意 JavaScript、全站安全或不存在其他 bug。HTTP 结果不自动验收，也不发起付款。","This establishes only bounded HTTP paths of the controlled service. It does not operate the seller’s frontend form or verify email delivery, arbitrary JavaScript, site-wide security or absence of other bugs. HTTP results never accept work or initiate payment.")}</p>
    </div>
  </details>;
}

export type RuntimeAcceptanceDecisionProps={language:Language;report?:RuntimeCheckReport;reason:string;acknowledged:boolean;disabled:boolean;onReasonChange:(reason:string)=>void;onAcknowledge:(acknowledged:boolean)=>void;onInspect:()=>void};
/** This records an explicit buyer choice, not a correction of failed evidence. */
export function RuntimeAcceptanceDecision({language,report,reason,acknowledged,disabled,onReasonChange,onAcknowledge,onInspect}:RuntimeAcceptanceDecisionProps){
  const tr=(zh:string,en:string)=>language==="zh"?zh:en,id=useId();
  const summary=report?runtimeReportSummary(report.steps):undefined;
  const exceptions=report?.steps.filter(step=>step.outcome!=="observed")??[];
  return <section className="runtime-acceptance-decision" aria-label={tr("接口实测验收决定","HTTP evidence acceptance decision")}>
    <h4>{tr("预约接口实测","Booking HTTP evidence")}</h4>
    {!report?<><p>{tr("这份约定需要当前交付的接口测试报告。先运行实测，再决定是否接受。","This agreement requires an HTTP report for the current delivery. Run the check before deciding acceptance.")}</p><button type="button" disabled={disabled} onClick={onInspect}>{tr("前往接口实测","Open HTTP checks")}<ArrowRight size={12} aria-hidden="true"/></button></>
      :exceptions.length?<><p>{tr(`本次有 ${summary!.issues} 步不符、${summary!.unavailable} 步未确定。可以退回修改；若仍选择接受，必须确认知晓下列每一步并说明原因。原报告不会标记成已修复。`,`${summary!.issues} steps differ and ${summary!.unavailable} remain unavailable. Request changes, or explicitly acknowledge every exception below and explain why you accept. The report is not marked fixed.`)}</p><ul>{exceptions.map(step=><li key={step.id}><code>{step.id}</code> {runtimeStepName(step.id,language,step.label)} · {step.outcome==="mismatch"?tr("不符","Mismatch"):tr("未确定","Unavailable")}</li>)}</ul><button type="button" disabled={disabled} onClick={onInspect}>{tr("查看完整接口报告","Inspect full HTTP report")}</button><label className="runtime-check-consent" htmlFor={`${id}-ack`}><input id={`${id}-ack`} type="checkbox" checked={acknowledged} disabled={disabled} onChange={event=>onAcknowledge(event.target.checked)}/><span>{tr("我已查看并知晓上面所有不符／未确定步骤，仍选择接受这些例外。","I inspected and acknowledge every mismatched/unavailable step above and choose to accept these exceptions.")}</span></label><label className="runtime-reason-label" htmlFor={`${id}-reason`}>{tr("接受接口例外的原因（10–500 字）","Reason for accepting HTTP exceptions (10–500 characters)")}</label><textarea id={`${id}-reason`} rows={2} minLength={10} maxLength={500} value={reason} disabled={disabled} onChange={event=>onReasonChange(event.target.value)} placeholder={tr("说明人工核对的情况，以及为何仍接受。","Explain what you inspected and why you still accept.")}/></>
      :<p>{tr(`本次 ${summary!.observed}/${summary!.steps} 步有预期 HTTP 观测支持。报告会随验收保存；这不替代人工核对，也不证明全部网站功能正常。`,`${summary!.observed}/${summary!.steps} steps have expected HTTP observations. The report is retained with acceptance; human inspection and broader website behavior remain separate.`)}</p>}
  </section>;
}
