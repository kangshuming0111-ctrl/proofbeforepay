"use client";

import {useEffect, useId, useRef, useState} from "react";
import {ArrowRight, ChevronDown, FlaskConical, MessageSquarePlus} from "lucide-react";
import type {Language} from "@/lib/contracts";
import {runtimeReportSummary, runtimeProtocolStepIds, runtimeReportMethod, type RuntimeCheckPlan, type RuntimeCheckReport} from "@/lib/runtime-checks";
import {draftRuntimeFeedback, runtimeFeedbackCriterion, runtimeReasonLabel, runtimeStepName,runtimeStepOutcomeLabel} from "@/lib/runtime-feedback";
import type {RuntimeTargetDescriptor} from "@/lib/server-runtime-targets";
import type {RuntimeRegistrationSnapshot} from "@/lib/runtime-registration";
import type {RuntimeMetadataField} from "@/lib/runtime-metadata";
import type {RuntimePreflightResult,RuntimePreflightUnavailableReason} from "@/lib/runtime-preflight";
import {capacityRecipeNumbers} from "@/lib/booking-capacity";
import {runtimeCapacitySpotlightSteps,runtimeSavedActualExcerpt} from "@/lib/runtime-overview";
import {RuntimeCoverageSummary} from "./RuntimeCoverageSummary";
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
  preflightContext?:string;
  onPreflight?:(signal:AbortSignal)=>Promise<RuntimePreflightResult>;
  onPrepareFeedback?: (criterionId: string, comment: string) => void;
};
const TARGETS: Record<string,[string,string]> = {
  "lab-flawed": ["受控示例：缺陷预约接口", "Controlled example: flawed booking service"],
  "lab-fixed": ["受控示例：修正版预约接口", "Controlled example: corrected booking service"],
  "lab-policy-flawed": ["受控示例：人数上限存在缺陷", "Controlled example: flawed party-size limit"],
  "lab-policy-fixed": ["受控示例：修正人数上限", "Controlled example: corrected party-size limit"],
};
const METADATA_FIELDS:Record<RuntimeMetadataField,[string,string]>={metadata:["声明对象","metadata object"],revision:["部署修订","deployment revision"],protocol:["接口协议","protocol"],projectId:["项目标识","project identity"],registrationRevision:["登记修订","registration revision"],frontendBundleDigest:["上传文件摘要","upload digest"],backendArtifactDigest:["后端构建摘要","backend artifact digest"],backendSourceCommit:["后端源码版本","backend source commit"]};
const PREFLIGHT_REASONS:Record<RuntimePreflightUnavailableReason,[string,string]>={
  network_unavailable:["服务暂不可达，请卖家确认测试部署在线。","The service is unreachable. Ask the seller to check its staging deployment."],
  timeout:["读取接口声明超时，可以重试此检查。","Reading the declaration timed out. You can retry this check."],
  cancelled:["连接检查已取消。","The connection check was cancelled."],
  redirect_blocked:["测试地址返回跳转，请运营者核对登记的最终地址。","The test address redirected. Ask the operator to review the registered final address."],
  access_denied:["接口拒绝读取。此检查不发送登录凭据，请卖家核对测试接口。","Access was denied. This check sends no login credentials; ask the seller to review the staging endpoint."],
  http_error:["接口未返回预期状态，请卖家检查声明入口。","The endpoint returned an unexpected status. Ask the seller to check its metadata endpoint."],
  non_json_response:["接口声明不是 JSON，请卖家核对声明入口。","The declaration was not JSON. Ask the seller to check its metadata endpoint."],
  response_too_large:["接口声明超过 16 KiB 上限，请卖家缩减声明内容。","The declaration exceeded the 16 KiB limit. Ask the seller to reduce it."],
  invalid_json_response:["接口声明包含无效 JSON，请卖家修正。","The declaration contained invalid JSON. Ask the seller to correct it."],
  registration_expired:["测试登记已到期，本次未继续请求，请运营者核对。","The staging approval expired; no further request was made. Ask the operator to review it."],
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
export function RuntimeCheckPanel({language,deliveryId,plan,targetId,target:descriptor,registration:deliveryRegistration,deliveryDigest,report,pending=false,busy=false,enabled,onRun,preflightContext,onPreflight,onPrepareFeedback}:RuntimeCheckPanelProps) {
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  const current=currentRuntimeReport(report,deliveryId,plan,targetId,deliveryDigest);
  const summary=current?runtimeReportSummary(current.steps):undefined;
  const issues=!!summary&&(summary.issues>0||summary.unavailable>0);
  const [open,setOpen]=useState(!current||issues);
  const [consent,setConsent]=useState(false);
  const [preflight,setPreflight]=useState<{context:string;result:RuntimePreflightResult}>();
  const [preflightError,setPreflightError]=useState("");
  const [preflightBusy,setPreflightBusy]=useState(false);
  const preflightController=useRef<AbortController|null>(null);
  const preflightKey=preflightContext??JSON.stringify([deliveryId,targetId,deliveryDigest,plan]);
  const preflightCurrent=useRef(preflightKey);preflightCurrent.current=preflightKey;
  useEffect(()=>{preflightController.current?.abort();preflightController.current=null;setPreflight(undefined);setPreflightError("");setPreflightBusy(false);return()=>{preflightController.current?.abort();preflightController.current=null;};},[preflightKey]);
  const preflightResult=preflight?.context===preflightKey?preflight.result:undefined;
  const consentId=useId();
  useEffect(()=>{setConsent(false);setOpen(!current||issues||pending);},[deliveryId,targetId,current?.id,pending]);
  const target=descriptor&&descriptor.id===targetId&&descriptor.protocol===plan.protocol?descriptor:undefined;
  const registration=deliveryRegistration&&deliveryRegistration.id===targetId&&deliveryRegistration.protocol===plan.protocol&&deliveryRegistration.frontendBundleDigest===deliveryDigest?deliveryRegistration:current?.target.registration;
  const fixture=targetId?TARGETS[targetId]:undefined;
  const targetLabel=registration?.label??current?.target.label??target?.label??(fixture?tr(...fixture):undefined);
  const registered=!!registration||target?.kind==="registered";
  const canRun=enabled&&!busy&&!pending&&!preflightBusy&&!!targetLabel;
  async function checkConnection(){
    if(!onPreflight||!canRun||preflightController.current)return;
    const controller=new AbortController(),context=preflightKey;
    preflightController.current=controller;setPreflightBusy(true);setPreflight(undefined);setPreflightError("");
    try{
      const result=await onPreflight(controller.signal);
      if(controller.signal.aborted||preflightCurrent.current!==context)return;
      if(result.deliveryId!==deliveryId||result.targetId!==targetId||result.protocol!==plan.protocol)throw new Error(tr("连接结果不属于当前交付，请重新检查。","The connection result does not belong to this delivery. Check again."));
      setPreflight({context,result});
    }catch(error){if(!controller.signal.aborted&&preflightCurrent.current===context)setPreflightError(error instanceof Error?error.message:tr("连接检查未完成，请重试。","The connection check did not finish. Retry it."));}
    finally{if(preflightController.current===controller){preflightController.current=null;setPreflightBusy(false);}}
  }
  const policy=plan.protocol!=="booking-http-v1"?plan.policy:undefined;
  const capacity=plan.protocol==="booking-http-v3"||plan.protocol==="booking-http-v4"?plan:undefined;
  const expanded=plan.protocol==="booking-http-v4";
  const recipe=capacity?capacityRecipeNumbers(capacity):undefined;
  const capacitySpotlight=current&&capacity?runtimeCapacitySpotlightSteps(current):undefined;
  const above=current?.steps.find(step=>step.id==="party_above");
  const concurrent=current?.steps.filter(step=>(expanded?["same_key_first","same_key_second","same_key_readback"]:["concurrent_first","concurrent_second","concurrent_readback"]).includes(step.id));
  return <details className="runtime-check-panel" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary><span><FlaskConical size={15} aria-hidden="true"/>{tr("预约接口实测","Booking HTTP check")}</span><span>{pending||busy?tr("正在运行","Running"):summary?tr(`${summary.issues} 项不符 · ${summary.unavailable} 项未确定`,`${summary.issues} mismatched · ${summary.unavailable} unavailable`):tr("尚无当前报告","No current report")}</span><ChevronDown size={14} aria-hidden="true"/></summary>
    <div className="runtime-check-body">
      <p>{expanded?tr("三十一步预约HTTP检查包含输入校验、单笔人数边界、同键并发与冲突、不同键争抢时段容量，以及后续写入后的独立回读。依据两条明确确认的原文和单独同意的技术协议，限已批准测试目标；不代表全站功能检查。","31 booking HTTP checks cover input validation, party-size boundaries, same-key concurrency/conflicts, distinct-key slot capacity and independent reads after later writes. They use two explicitly confirmed source clauses and a separate technical agreement on approved targets; this is not a site-wide functional test."):capacity?tr("十七步真实 HTTP 检查核对两条原文：单笔人数及同一时段总容量。使用不同请求键争抢容量，检查满额拒绝、胜者重放与另一时段隔离；仅运行运营者批准的测试目标。","Seventeen actual HTTP steps check two original clauses: party size and total guests in one slot. Distinct keys race for capacity, followed by full-slot rejection, winner replay and another-slot isolation. Only operator-approved test targets run."):policy?tr("十八步真实 HTTP 检查将原文人数上限、边界请求及同键并发纳入检验，并独立查回预约。只运行平台运营者批准的测试目标，不扫描任意网址。","Eighteen actual HTTP steps test the original party-size maximum, boundaries and concurrent same-key requests, with independent booking readback. Only operator-approved test targets run; arbitrary URLs are not scanned."):tr("用真实 HTTP 请求检查基础八步：缺失字段、错误邮箱、创建、独立读回、重复请求、冲突和最终读回。只运行平台运营者批准的测试目标，不扫描任意网址。","Actual HTTP requests check eight basic steps: missing fields, invalid email, creation, independent readback, replay, conflict and final readback. Only operator-approved test targets run; arbitrary URLs are not scanned.")}</p>
      {!capacity&&<p className="runtime-check-source"><strong>{tr("已确认的原始要求","Original agreed requirement")}</strong><span>{plan.source.excerpt}</span></p>}
      {policy&&!capacity&&<p className="runtime-check-source"><strong>{tr(`每笔最多 ${policy.maxPartySize} 人；探测 ${policy.maxPartySize-1} / ${policy.maxPartySize} / ${policy.maxPartySize+1} 人`,`Maximum ${policy.maxPartySize} people; probe ${policy.maxPartySize-1} / ${policy.maxPartySize} / ${policy.maxPartySize+1}`)}</strong><span>{policy.source.excerpt}</span><span>{tr("预期以内和恰好上限可创建并查回，超过上限应拒绝。并发只核对同键响应与回读的一致性，不证明整个数据库没有重复记录。","Below-limit and exact-limit bookings should be created and read back; above-limit input should be rejected. Concurrency checks same-key response/readback consistency, not the absence of hidden duplicates throughout a database.")}</span></p>}
      {capacity&&recipe&&<>
        <p className="runtime-check-source"><strong>{tr(`每笔最多 ${recipe.maxPartySize} 人 · ${capacity.criterionId}`,`At most ${recipe.maxPartySize} per booking · ${capacity.criterionId}`)}</strong><span>{capacity.source.excerpt}</span></p>
        <p className="runtime-check-source"><strong>{tr(`每时段合计最多 ${recipe.maxGuestsPerSlot} 人 · ${capacity.slotCapacity.criterionId}`,`At most ${recipe.maxGuestsPerSlot} in total per slot · ${capacity.slotCapacity.criterionId}`)}</strong><span>{capacity.slotCapacity.source.excerpt}</span></p>
        <p className="runtime-check-note">{tr(`本方案向空时段A并发提交两个不同键、各 ${recipe.racePartySize} 人的预约，预期仅一个201、另一个409；补入 ${recipe.remainingPartySize} 人至 ${recipe.maxGuestsPerSlot}，再拒绝额外1人。在时段B创建 ${recipe.maxPartySize} 人后，复查A及原预约没有被改写。这里是不同键容量部分，同键并发有独立步骤；恢复运行不重放首次写入，未观察部分保持“未确定”。`,`Two distinct keys concurrently request ${recipe.racePartySize} guests each in empty slot A: one 201 and one 409 are expected. Add ${recipe.remainingPartySize} to fill ${recipe.maxGuestsPerSlot}, then reject one extra guest. After creating ${recipe.maxPartySize} in slot B, recheck A and its original bookings. This is the distinct-key capacity part; same-key concurrency has separate steps. Recovery never replays initial writes; unobserved steps remain unavailable.`)}</p>
      </>}
      <p className="runtime-check-target">{registered?tr("本版卖家测试部署","Seller staging for this delivery"):tr("本版虚构演示接口","Synthetic demo for this delivery")}: <strong>{targetLabel??tr("尚未选择受支持的目标","No supported target selected")}</strong></p>
      {registration&&<p className="runtime-check-note">{tr("登记修订","Registration revision")}: {registration.registrationRevision} · {tr("部署修订","Deployment revision")}: {registration.deploymentRevision}<br/>{tr("绑定上传摘要","Bound upload digest")}: <code title={registration.frontendBundleDigest}>{registration.frontendBundleDigest.slice(0,12)}…</code> · {tr("登记有效至","Approval expires")}: {displayTime(registration.expiresAt)}<br/>{tr("保存的报告继续保留；每次新增运行仍需服务器核对当前登记、有效期与本版文件摘要。","Saved reports remain readable. Every new run still requires server checks of current approval, expiry and this version's upload digest.")}</p>}
      <RuntimeCoverageSummary plan={plan} report={current} pending={pending||busy} language={language}/>
      {onPreflight&&<section aria-label={tr("不创建预约的连接检查","Connection check without booking writes")}>
        <button type="button" disabled={!canRun} onClick={()=>void checkConnection()}>{preflightBusy?tr("正在读取接口声明…","Reading the declaration…"):tr("检查连接（不创建预约）","Check connection (no booking writes)")}</button>
        {preflightBusy&&<button type="button" onClick={()=>{preflightController.current?.abort();preflightController.current=null;setPreflightBusy(false);}}>{tr("取消","Cancel")}</button>}
        <p className="runtime-check-note">{tr("只读取已登记接口的声明，不发送预约、模型或付款请求；结果不保存为验收报告。","Reads the registered endpoint's declaration only. No booking, model or payment request is sent; the result is not saved as acceptance evidence.")}</p>
        {preflightError&&<p className="runtime-check-warning" role="status">{preflightError}</p>}
        {preflightResult&&<div className={preflightResult.status==="matched"?"runtime-check-note":"runtime-check-warning"} role="status">
          <strong>{preflightResult.status==="matched"?tr("接口声明匹配；尚未检验预约行为。","The declaration matched; booking behaviour has not been tested."):preflightResult.status==="mismatch"?tr("接口声明未匹配当前交付。","The declaration did not match this delivery."):tr("连接检查未取得可用声明。","The connection check could not obtain a usable declaration.")}</strong>
          {preflightResult.status==="unavailable"?<p>{tr(...PREFLIGHT_REASONS[preflightResult.reason])}</p>:(["missing","mismatch","malformed"]as const).map(kind=>preflightResult.diagnosis[kind].length>0&&<p key={kind}>{kind==="missing"?tr("缺少字段","Missing fields"):kind==="mismatch"?tr("不匹配字段","Mismatched fields"):tr("格式不正确的字段","Malformed fields")}: {preflightResult.diagnosis[kind].map(field=>tr(...METADATA_FIELDS[field])).join("、")}</p>)}
          <p>{tr("检查时间","Checked")}: {displayTime(preflightResult.checkedAt)}</p>
        </div>}
      </section>}
      <label className="runtime-check-consent" htmlFor={consentId}><input id={consentId} type="checkbox" checked={consent} disabled={!canRun} onChange={event=>setConsent(event.target.checked)}/><span>{registered?tr("允许本次向上述卖家测试部署提交生成的虚构预约测试数据。不会发送合同、页面文件或私人客户资料。","Allow this run to submit generated fictional booking data to the seller staging target above. No contract, website files or private client material is sent."):tr("允许本次向上述虚构演示接口提交生成的虚构预约测试数据。不会发送合同、页面文件或私人客户资料。","Allow this run to submit generated fictional booking data to the synthetic demo service above. No contract, website files or private client material is sent.")}</span></label>
      <button type="button" className="runtime-check-run" disabled={!canRun||!consent} onClick={()=>{if(!canRun||!consent)return;setConsent(false);onRun();}}>{pending||busy?tr("正在请求和读回…","Requesting and reading back…"):current?tr("重新运行本版接口测试","Run this version’s HTTP check again"):tr("运行本版接口测试","Run this version’s HTTP check")}<ArrowRight size={13} aria-hidden="true"/></button>
      {!enabled&&!busy&&!pending&&<p className="runtime-check-note">{tr("当前状态不能新增测试，已有报告仍可查看。","New tests are unavailable in this state; saved reports remain readable.")}</p>}
      {(pending||busy)&&<p className="runtime-check-note" role="status">{tr("结果尚未完成，不能按通过处理；新报告不会替换已经验收时保存的依据。","The run is incomplete and cannot be treated as a pass. A new report does not replace evidence saved at acceptance.")}</p>}
      {report&&!current&&<p className="runtime-check-warning">{tr("已保存报告不符合当前交付、目标或计划，未借用它显示当前结果。请重新检查。","The saved report does not match this delivery, target or plan. It is not used as the current result; check again.")}</p>}
      {current&&summary&&<>
        <p className="runtime-check-counts">{tr(`本次 ${summary.steps} 步：${summary.observed} 步有预期观测支持，${summary.issues} 步不符，${summary.unavailable} 步无法确定。`,`${summary.steps} steps this run: ${summary.observed} with expected observations, ${summary.issues} mismatched, ${summary.unavailable} unavailable.`)}</p>
        {policy&&above?.outcome==="mismatch"&&above.status!==undefined&&above.status>=200&&above.status<300&&<p className="runtime-check-warning"><strong>{tr(`约定最多 ${policy.maxPartySize} 人，${policy.maxPartySize+1} 人请求却返回 HTTP ${above.status}`,`Agreed maximum ${policy.maxPartySize}; a ${policy.maxPartySize+1}-person request returned HTTP ${above.status}`)}</strong><br/>{tr("预期是 400/422 及结构化验证错误码；请查看这一步的实际证据。","Expected 400/422 and the structured validation code; inspect the actual evidence for this step.")}</p>}
        {(plan.protocol==="booking-http-v2"||expanded)&&concurrent?.length===3&&<p className="runtime-check-note">{tr("同键并发及独立回读","Concurrent same-key requests and independent readback")}: {concurrent.map(step=>`${step.status??"—"} (${step.outcome==="observed"?tr("观测支持","observed"):step.outcome==="mismatch"?tr("不符","mismatch"):tr("未确定","unavailable")})`).join(" / ")}</p>}
        {capacitySpotlight&&<section className="runtime-check-note" aria-label={tr("容量关键观测","Capacity observations")}><strong>{tr("容量关键观测（以本次保存报告为准）","Capacity observations from this saved run")}</strong><ul>{capacitySpotlight.map(step=><li key={step.id}>{runtimeStepName(step.id,language)}: {step.status===undefined?tr("未取得状态码","no HTTP status"):`HTTP ${step.status}`} · {step.outcome==="observed"?tr("预期观测支持","expected observation"):step.outcome==="mismatch"?tr("不符","mismatch"):tr("未确定","unavailable")}{runtimeSavedActualExcerpt(step)&&<><br/>{tr("保存的实际片段","Saved actual excerpt")}: <code>{runtimeSavedActualExcerpt(step)}</code></>}</li>)}</ul><p>{tr("两次争抢均需核对：一个201和一个409，同时保留独立查询。仅证明这次受控时段和记录；不证明全站或所有数据库并发均正确。","Inspect both race results: one 201 and one 409, with independent reads retained. These observations cover this controlled slot and its records; they do not establish site-wide or database-wide concurrency correctness.")}</p></section>}
        <details className="runtime-check-all-steps" open={!expanded}><summary>{tr(`查看本次全部 ${summary.steps} 步的请求与证据`,`Inspect requests and evidence for all ${summary.steps} steps`)}</summary><ol className="runtime-check-steps">{current.steps.map(step=><li key={step.id} className={`runtime-step-${step.outcome}`}>
          <div><strong>{runtimeStepName(step.id,language,step.label)}</strong><span>{runtimeStepOutcomeLabel(step,language)}</span></div>
          <details><summary>{tr("请求、预期与实际","Request, expected and actual")}</summary><dl>
            <div><dt>{tr("请求","Request")}</dt><dd><code>{step.method} {step.path}</code>{step.status!==undefined?` · HTTP ${step.status}`:""}</dd></div>
            <div><dt>{tr("预期","Expected")}</dt><dd>{step.expected}</dd></div>
            {step.actual&&<div><dt>{tr("实际","Actual")}</dt><dd>{step.actual}</dd></div>}
            {step.reason&&<div><dt>{tr("未确定原因","Unavailable reason")}</dt><dd>{displayReason(step.reason,language)} <code>({step.reason})</code></dd></div>}
          </dl></details>
        </li>)}</ol></details>
        {issues&&onPrepareFeedback&&<button type="button" className="runtime-check-feedback" disabled={busy||pending} onClick={()=>onPrepareFeedback(runtimeFeedbackCriterion(current),draftRuntimeFeedback(current,language))}><MessageSquarePlus size={13} aria-hidden="true"/>{tr("起草接口修改意见","Draft HTTP change request")}</button>}
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
      :exceptions.length?<><p>{tr(`本次有 ${summary!.issues} 步不符、${summary!.unavailable} 步未确定。可以退回修改；若仍选择接受，必须确认知晓下列每一步并说明原因。原报告不会标记成已修复。`,`${summary!.issues} steps differ and ${summary!.unavailable} remain unavailable. Request changes, or explicitly acknowledge every exception below and explain why you accept. The report is not marked fixed.`)}</p><ul>{exceptions.map(step=><li key={step.id}><code>{step.id}</code> {runtimeStepName(step.id,language,step.label)} · {runtimeStepOutcomeLabel(step,language)}</li>)}</ul><button type="button" disabled={disabled} onClick={onInspect}>{tr("查看完整接口报告","Inspect full HTTP report")}</button><label className="runtime-check-consent" htmlFor={`${id}-ack`}><input id={`${id}-ack`} type="checkbox" checked={acknowledged} disabled={disabled} onChange={event=>onAcknowledge(event.target.checked)}/><span>{tr("我已查看并知晓上面所有不符／未确定步骤，仍选择接受这些例外。","I inspected and acknowledge every mismatched/unavailable step above and choose to accept these exceptions.")}</span></label><label className="runtime-reason-label" htmlFor={`${id}-reason`}>{tr("接受接口例外的原因（10–500 字）","Reason for accepting HTTP exceptions (10–500 characters)")}</label><textarea id={`${id}-reason`} rows={2} minLength={10} maxLength={500} value={reason} disabled={disabled} onChange={event=>onReasonChange(event.target.value)} placeholder={tr("说明人工核对的情况，以及为何仍接受。","Explain what you inspected and why you still accept.")}/></>
      :<p>{tr(`本次 ${summary!.observed}/${summary!.steps} 步有预期 HTTP 观测支持。报告会随验收保存；这不替代人工核对，也不证明全部网站功能正常。`,`${summary!.observed}/${summary!.steps} steps have expected HTTP observations. The report is retained with acceptance; human inspection and broader website behavior remain separate.`)}</p>}
  </section>;
}
