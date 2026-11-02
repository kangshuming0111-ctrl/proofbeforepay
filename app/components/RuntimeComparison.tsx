"use client";

import {useEffect,useState} from "react";
import {ChevronDown,FlaskConical,LoaderCircle} from "lucide-react";
import type {Language,ProofDelivery,ProofDeliveryVersion} from "@/lib/contracts";
import type {RuntimeCheckPlan,RuntimeCheckStep} from "@/lib/runtime-checks";
import {runtimeProtocolStepIds} from "@/lib/runtime-checks";
import {runtimeReasonLabel,runtimeStepName} from "@/lib/runtime-feedback";
import {buildRuntimeComparison,type RuntimeComparison as ComparisonResult,type RuntimeComparisonSide,type RuntimeComparisonReason} from "@/lib/runtime-comparison";
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
        <dl className="runtime-comparison-refs"><div><dt>{tr("报告","Report")}</dt><dd><code>{data.report.id}</code></dd></div><div><dt>{tr("交付","Delivery")}</dt><dd><code>{data.delivery.id}</code></dd></div><div><dt>{tr("目标","Target")}</dt><dd>{data.report.target.label}</dd></div><div><dt>{tr("修订","Revision")}</dt><dd>{data.report.target.revision}</dd></div><div><dt>{tr("文件摘要","File digest")}</dt><dd><code title={data.fileDigest}>{data.fileDigest.slice(0,12)}…</code></dd></div></dl>
      </>:<><p className="runtime-comparison-unavailable">{side.state==="unavailable"?tr(...reasons[side.reason]):""}</p>{version&&<code className="runtime-comparison-delivery-id">{version.id}</code>}</>}
    </article>;
  }
  const before=result?.previous.state==="available"?result.previous.data.boundary:undefined,after=result?.current.state==="available"?result.current.data.boundary:undefined;
  return <section className="runtime-comparison" aria-label={tr("预约接口修改对照","Booking HTTP revision comparison")}>
    <h3><FlaskConical size={14} aria-hidden="true"/>{tr("这次接口记录具体变了什么","What changed in the HTTP evidence")}</h3>
    <blockquote>{result?.plan?.source.excerpt??plan.source.excerpt}</blockquote>
    {(result?.plan??plan).protocol==="booking-http-v2"&&<p className="runtime-comparison-agreed">{tr(`已约定每笔最多 ${plan.protocol==="booking-http-v2"?plan.policy.maxPartySize:""} 人；超过上限应拒绝。`,`Agreed maximum: ${plan.protocol==="booking-http-v2"?plan.policy.maxPartySize:""} people per booking; above-limit input should be rejected.`)}</p>}
    {!context?<p className="runtime-comparison-loading" role="status"><LoaderCircle size={13} className="spin"/>{tr("正在独立核对两版文件摘要与已保存的报告…","Checking each version’s file digest and saved report independently…")}</p>:context.error?<p className="runtime-comparison-unavailable" role="status">{tr("暂时无法核对这两版记录。请刷新项目后重试，未显示通过结果。","These records could not be checked. Refresh the project and retry; no successful result is shown.")}</p>:result&&<>
      {before?.status!==undefined&&after?.status!==undefined&&before.status!==after.status&&<p className="runtime-comparison-change">{tr("超上限请求的已保存响应","Saved response to above-limit input")}: <strong>HTTP {before.status} → HTTP {after.status}</strong></p>}
      <div className="runtime-comparison-columns">{sideCard(result.previous,true)}{sideCard(result.current,false)}</div>
      {(result.previous.state==="available"||result.current.state==="available")&&result.plan&&<details className="runtime-comparison-steps"><summary>{tr(`展开两版全部 ${runtimeProtocolStepIds(result.plan).length} 个步骤`,`Inspect all ${runtimeProtocolStepIds(result.plan).length} steps for both versions`)}<ChevronDown size={13} aria-hidden="true"/></summary><ol>{runtimeProtocolStepIds(result.plan).map(id=><li key={id}><h4>{runtimeStepName(id,language)}</h4><div className="runtime-comparison-columns">{([result.previous,result.current] as const).map((side,index)=>{const step=side.state==="available"?side.data.report.steps.find(step=>step.id===id):undefined;return <div key={index} className="runtime-comparison-step"><strong>{index===0?tr("旧版","Earlier"):tr("当前版","Current")}: {response(step)}</strong>{step?<><code>{step.method} {step.path}</code><p>{tr("预期","Expected")}: {step.expected}</p>{step.actual&&<pre>{step.actual}</pre>}{step.reason&&<p>{runtimeReasonLabel(step.reason,language)} <code>{step.reason}</code></p>}</>:<p>{tr("此侧没有可比报告，未借用另一版。","This side has no comparable report; the other version is not substituted.")}</p>}</div>;})}</div></li>)}</ol></details>}
    </>}
    <p className="runtime-comparison-limits">{tr("对照的是各版保存的有限 HTTP 观测；并发数字是响应数量，不是全数据库的重复记录统计。问题数量减少不证明整个网站已修复，也不自动验收或付款。","This compares bounded HTTP observations saved for each version. Concurrent counts describe responses, not duplicate records across a database. Fewer mismatches do not establish a fully repaired website, accept work or initiate payment.")}</p>
  </section>;
}
