"use client";

import {useEffect,useState} from "react";
import {ChevronDown,FlaskConical,LoaderCircle} from "lucide-react";
import type {Language,ProofDelivery,ProofDeliveryVersion} from "@/lib/contracts";
import type {RuntimeCheckPlan,RuntimeCheckStep} from "@/lib/runtime-checks";
import {runtimeProtocolStepIds} from "@/lib/runtime-checks";
import {runtimeReasonLabel,runtimeStepName} from "@/lib/runtime-feedback";
import {buildRuntimeComparison,type RuntimeComparison as ComparisonResult,type RuntimeComparisonSide,type RuntimeComparisonReason} from "@/lib/runtime-comparison";
import {runtimeSavedActualExcerpt} from "@/lib/runtime-overview";
import "../runtime-comparison.css";

type Props={projectId?:string;plan:RuntimeCheckPlan;delivery:ProofDelivery;previousVersion?:ProofDeliveryVersion;language:Language};
const reasons:Record<RuntimeComparisonReason,[string,string]>={
  no_previous:["未加载旧版；没有借用当前报告。","No earlier version is loaded; current evidence is not substituted."],
  not_older:["该记录无法确认为更早版本。","This record cannot be confirmed as an earlier delivery."],
  no_report:["此版本没有保存接口报告。","No HTTP report was saved for this version."],
  pending_run:["此版本有未完成的接口测试；暂不使用之前的报告对照。","This version has an unfinished run; an earlier report is not substituted."],
  missing_files:["原始交付文件缺失，不能核对报告摘要。","Original files are missing, so the report digest cannot be checked."],
  invalid_files:["交付文件无法通过有界文件检查。","The saved files do not pass the bounded file checks."],
  different_delivery:["报告不属于此交付版本。","The report belongs to a different delivery."],
  digest_mismatch:["实际文件摘要与此版本或报告不符。","The actual file digest differs from this version or its report."],
  plan_mismatch:["报告与这份已锁定的原始要求或测试计划不符。","The report differs from this locked original requirement or test plan."],
  invalid_target:["本版目标或冻结登记无法可靠核对。","This version’s target or frozen registration cannot be verified."],
  invalid_report:["报告内容、目标绑定或保存历史不一致。","The report, target binding or retained history is inconsistent."],
  invalid_plan:["已锁定的接口测试计划不可读取。","The locked HTTP test plan could not be read."],
  missing_project:["缺少当前项目编号，无法核对测试登记的归属。","The current project ID is missing; registration ownership cannot be checked."],
  different_project:["此版本的测试登记属于其他项目。","This version’s test registration belongs to a different project."],
};

/** Recorded evidence only: this component never runs HTTP checks or mutates a
 * delivery. Context identity and effect cleanup discard late digest results. */
export function RuntimeComparison({projectId,plan,delivery,previousVersion,language}:Props){
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  const [saved,setSaved]=useState<{projectId?:string;plan:RuntimeCheckPlan;delivery:ProofDelivery;previousVersion?:ProofDeliveryVersion;result?:ComparisonResult;error?:true}>();
  useEffect(()=>{
    let active=true;
    buildRuntimeComparison({projectId,plan,delivery,previousVersion}).then(result=>{if(active)setSaved({projectId,plan,delivery,previousVersion,result});}).catch(()=>{if(active)setSaved({projectId,plan,delivery,previousVersion,error:true});});
    return()=>{active=false;};
  },[projectId,plan,delivery,previousVersion]);
  const context=saved?.projectId===projectId&&saved?.plan===plan&&saved.delivery===delivery&&saved.previousVersion===previousVersion?saved:undefined;
  const result=context?.result;
  const outcome=(step:RuntimeCheckStep)=>step.outcome==="observed"?tr("观测支持","Observed support"):step.outcome==="mismatch"?tr("不符","Mismatch"):tr("未确定","Unavailable");
  const response=(step:RuntimeCheckStep|undefined)=>!step?tr("未保存读数","No saved reading"):`HTTP ${step.status??"—"} · ${outcome(step)}`;
  function sideCard(side:RuntimeComparisonSide,earlier:boolean){
    const data=side.state==="available"?side.data:undefined,version=data?.delivery??(side.state==="unavailable"?side.delivery:undefined);
    return <article className="runtime-comparison-version">
      <h4>{earlier?tr("旧版接口记录","Earlier HTTP evidence"):tr("当前版接口记录","Current HTTP evidence")}{version?.sequence?` v${version.sequence}`:""}</h4>
      {data?<>
        <p className="runtime-comparison-score"><strong>{data.report.summary.observed}/{data.report.summary.steps}</strong><span>{tr("步有预期观测支持","steps with expected observations")}</span></p>
        <p className="runtime-comparison-counts">{tr(`${data.report.summary.issues} 步不符；${data.report.summary.unavailable} 步未确定`,`${data.report.summary.issues} mismatched; ${data.report.summary.unavailable} unavailable`)}</p>
        {data.boundary&&result?.plan?.protocol==="booking-http-v2"&&<p className={`runtime-comparison-boundary runtime-comparison-${data.boundary.outcome}`}><strong>{tr(`${result.plan.policy.maxPartySize+1} 人请求`,`${result.plan.policy.maxPartySize+1}-person request`)}</strong><span>{response(data.boundary)}</span></p>}
        {data.concurrency&&<p className="runtime-comparison-concurrency"><strong>{tr("同键并发响应","Concurrent same-key responses")}</strong><span>{data.concurrency.responses.map(step=>`HTTP ${step.status??"—"}`).join(" / ")}</span><span>{tr(`201 响应 ${data.concurrency.creationResponses} 次；200 响应 ${data.concurrency.replayResponses} 次`,`201 responses: ${data.concurrency.creationResponses}; 200 responses: ${data.concurrency.replayResponses}`)}</span><span>{data.concurrency.observedPair?tr("一次创建响应、一次重放响应有观测支持","One creation and one replay response observed"):tr("未完整观察到预期并发对","Expected concurrent pair not fully observed")}</span><span>{tr("独立回读","Independent readback")}: {response(data.concurrency.readback)}</span></p>}
        {data.capacity&&<div className="runtime-comparison-concurrency"><strong>{tr("不同订单并发争用同一时段","Distinct orders contend for one slot")}</strong>
          <span>{data.capacity.responses.map(step=>response(step)).join(" / ")}</span>
          <span>{tr(`201 创建响应 ${data.capacity.creationResponses} 次；409 容量拒绝响应 ${data.capacity.capacityRejections} 次`,`201 creation responses: ${data.capacity.creationResponses}; 409 capacity-rejection responses: ${data.capacity.capacityRejections}`)}</span>
          <span>{data.capacity.observedPair?tr("一次创建、一次容量拒绝有观测支持","One creation and one capacity rejection observed"):tr("未完整观察到预期容量争用结果","Expected capacity-race result not fully observed")}</span>
          <span>{tr("赢家原键重放","Replay actual winning key")}: {response(data.capacity.winnerReplay)}</span>
          <span>{tr("满额后多一人","One guest beyond the full slot")}: {response(data.capacity.rejectExtra)}</span>
          <span>{tr("独立时段 B 创建及回读","Independent slot B create/readback")}: {response(data.capacity.slotBCreate)} / {response(data.capacity.slotBReadback)}</span>
          <span>{tr("最后回读赢家／补位订单","Final winner/fill receipt readbacks")}: {response(data.capacity.winnerReadback)} / {response(data.capacity.fillReadback)}</span>
          <strong>{tr("保存的时段总人数与订单编号检查","Saved slot-total and booking-ID observations")}</strong>
          {([["初始 A","Initial A",data.capacity.occupancy.initial],["争用后 A","A after race",data.capacity.occupancy.afterRace],["重放后 A","A after replay",data.capacity.occupancy.afterReplay],["满额 A","Full A",data.capacity.occupancy.full],["其他时段写入后 A","Final A after other-slot writes",data.capacity.occupancy.finalA],["独立 B","Independent B",data.capacity.occupancy.slotB]] as const).map(([zh,en,step])=>{const excerpt=["slot_a_after_race","slot_a_after_rejection"].includes(step.id)?runtimeSavedActualExcerpt(step):undefined;return <span key={step.id}>{tr(zh,en)}: {response(step)}{excerpt&&<><br/>{tr("保存的实际片段","Saved actual excerpt")}: <code>{excerpt}</code></>}</span>;})}
        </div>}
        <dl className="runtime-comparison-refs"><div><dt>{tr("报告","Report")}</dt><dd><code>{data.report.id}</code></dd></div><div><dt>{tr("交付","Delivery")}</dt><dd><code>{data.delivery.id}</code></dd></div><div><dt>{tr("目标","Target")}</dt><dd>{data.report.target.label}</dd></div><div><dt>{tr("修订","Revision")}</dt><dd>{data.report.target.revision}</dd></div><div><dt>{tr("文件摘要","File digest")}</dt><dd><code title={data.fileDigest}>{data.fileDigest.slice(0,12)}…</code></dd></div></dl>
      </>:<><p className="runtime-comparison-unavailable">{side.state==="unavailable"?tr(...reasons[side.reason]):""}</p>{version&&<code className="runtime-comparison-delivery-id">{version.id}</code>}</>}
    </article>;
  }
  const before=result?.previous.state==="available"?result.previous.data.boundary:undefined,after=result?.current.state==="available"?result.current.data.boundary:undefined;
  const activePlan=result?.plan??plan,beforeCapacity=result?.previous.state==="available"?result.previous.data.capacity:undefined,afterCapacity=result?.current.state==="available"?result.current.data.capacity:undefined;
  const capacityResponses=(value:NonNullable<typeof beforeCapacity>)=>value.responses.map(step=>step.status??"—").sort().join(" / ");
  return <section className="runtime-comparison" aria-label={tr("预约接口修改对照","Booking HTTP revision comparison")}>
    <h3><FlaskConical size={14} aria-hidden="true"/>{tr("这次接口记录具体变了什么","What changed in the HTTP evidence")}</h3>
    <blockquote>{result?.plan?.source.excerpt??plan.source.excerpt}</blockquote>
    {activePlan.protocol==="booking-http-v2"&&<p className="runtime-comparison-agreed">{tr(`已约定每笔最多 ${activePlan.policy.maxPartySize} 人；超过上限应拒绝。`,`Agreed maximum: ${activePlan.policy.maxPartySize} people per booking; above-limit input should be rejected.`)}</p>}
    {activePlan.protocol==="booking-http-v3"&&<><p className="runtime-comparison-agreed">{tr(`两项独立约定：每笔最多 ${activePlan.policy.maxPartySize} 人；每个时段合计最多 ${activePlan.slotCapacity.maxGuestsPerSlot} 人。`,`Two separate constraints: at most ${activePlan.policy.maxPartySize} guests per booking and ${activePlan.slotCapacity.maxGuestsPerSlot} guests in total per slot.`)}</p><blockquote>{activePlan.slotCapacity.source.excerpt}</blockquote><p className="runtime-comparison-counts">{tr("不同订单争用容量；检查独立回读、重放不重复占位，以及其他时段写入后旧订单仍保留。","Distinct orders contend for capacity, with independent readback, replay without extra occupancy, and retained earlier bookings after other-slot writes.")}</p></>}
    {!context?<p className="runtime-comparison-loading" role="status"><LoaderCircle size={13} className="spin"/>{tr("正在独立核对两版文件摘要与已保存的报告…","Checking each version’s file digest and saved report independently…")}</p>:context.error?<p className="runtime-comparison-unavailable" role="status">{tr("暂时无法核对这两版记录。请刷新项目后重试，未显示通过结果。","These records could not be checked. Refresh the project and retry; no successful result is shown.")}</p>:result&&<>
      {before?.status!==undefined&&after?.status!==undefined&&before.status!==after.status&&<p className="runtime-comparison-change">{tr("超上限请求的已保存响应","Saved response to above-limit input")}: <strong>HTTP {before.status} → HTTP {after.status}</strong></p>}
      {beforeCapacity&&afterCapacity&&capacityResponses(beforeCapacity)!==capacityResponses(afterCapacity)&&<p className="runtime-comparison-change">{tr("不同订单容量争用的已保存响应","Saved responses to distinct-order capacity contention")}: <strong>{capacityResponses(beforeCapacity)} → {capacityResponses(afterCapacity)}</strong></p>}
      <div className="runtime-comparison-columns">{sideCard(result.previous,true)}{sideCard(result.current,false)}</div>
      {(result.previous.state==="available"||result.current.state==="available")&&result.plan&&<details className="runtime-comparison-steps"><summary>{tr(`展开两版全部 ${runtimeProtocolStepIds(result.plan).length} 个步骤`,`Inspect all ${runtimeProtocolStepIds(result.plan).length} steps for both versions`)}<ChevronDown size={13} aria-hidden="true"/></summary><ol>{runtimeProtocolStepIds(result.plan).map(id=><li key={id}><h4>{runtimeStepName(id,language)}</h4><div className="runtime-comparison-columns">{([result.previous,result.current] as const).map((side,index)=>{const step=side.state==="available"?side.data.report.steps.find(step=>step.id===id):undefined;return <div key={index} className="runtime-comparison-step"><strong>{index===0?tr("旧版","Earlier"):tr("当前版","Current")}: {response(step)}</strong>{step?<><code>{step.method} {step.path}</code><p>{tr("预期","Expected")}: {step.expected}</p>{step.actual&&<pre>{step.actual}</pre>}{step.reason&&<p>{runtimeReasonLabel(step.reason,language)} <code>{step.reason}</code></p>}</>:<p>{tr("此侧没有可比报告，未借用另一版。","This side has no comparable report; the other version is not substituted.")}</p>}</div>;})}</div></li>)}</ol></details>}
    </>}
    <p className="runtime-comparison-limits">{tr("对照的是各版保存的有限 HTTP 观测；并发数字是响应数量，人数与订单编号是后端回传的有限快照，不是全数据库审计。问题数量减少不证明整个网站已修复，也不自动验收或付款。","This compares bounded HTTP observations saved for each version. Concurrent counts describe responses; guest totals and booking IDs are bounded backend-reported snapshots, not a full database audit. Fewer mismatches do not establish a fully repaired website, accept work or initiate payment.")}</p>
  </section>;
}
