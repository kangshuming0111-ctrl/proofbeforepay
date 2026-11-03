"use client";
import {ArrowRight} from "lucide-react";
import type {Language} from "@/lib/contracts";
import type {ModelSpotlight as ModelSpotlightData} from "@/lib/model-spotlight";
import {ModelDiagnosticDetails} from "./ModelDiagnosticDetails";

export function modelSpotlightTitle(data:ModelSpotlightData,language:Language){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 return data.state==="pending"?tr("并发检查仍在进行","Concurrent checks are still running")
  :data.state==="checking"?tr("正在核对并发报告与本版文件","Checking report against this delivery’s files")
  :data.state==="invalid"?tr("并发报告无法校验，需重新核对","Concurrent evidence could not be validated")
  :data.diagnosis?.summary[language]??tr("本版尚无并发报告","No concurrent report for this delivery");
}
export function ModelSpotlight({data,language,busy=false,onInspect}:{data:ModelSpotlightData;language:Language;busy?:boolean;onInspect?:()=>void}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 if(data.state==="none")return null;
 const severity=data.state==="ready"?data.diagnosis?.outcome??"inconclusive":data.state;
 const badge=data.state==="ready"?data.diagnosis?.outcome==="violated"?tr("发现异常","Issue found"):data.diagnosis?.outcome==="compatible"?tr("本轮记录相容","Compatible this run"):tr("未确定","Inconclusive"):data.state==="pending"?tr("运行中","Running"):data.state==="checking"?tr("核对中","Validating"):tr("需核对","Needs review");
 return <section className={`model-spotlight model-spotlight-${severity}`} aria-label={tr("并发检查的业务结果","Business outcome of concurrent checks")}>
  <header><span>{tr("并发状态检查","Concurrent state check")}</span><b>{badge}</b>{onInspect&&<button type="button" disabled={busy} onClick={onInspect}>{tr("查看诊断与复测","Inspect diagnosis and retest")}<ArrowRight size={12} aria-hidden="true"/></button>}</header>
  <p className="model-spotlight-summary">{modelSpotlightTitle(data,language)}</p>
  {data.state==="ready"&&data.diagnosis&&<ModelDiagnosticDetails diagnosis={data.diagnosis} language={language} compact/>}
  {data.state==="pending"&&<p>{tr("本轮尚未完成，先前报告不代表本轮结果。待检查结束或明确关闭后再继续。","This run is incomplete. A previous report is not this run’s result. Finish or explicitly close the run before continuing.")}</p>}
  {data.state==="invalid"&&<p>{tr("保存记录或交付关联不完整；没有用旧报告或通过结论替代。","Saved evidence or its delivery binding is incomplete. An older or passing report was not substituted.")}</p>}
  {data.acceptance!=="not_accepted"&&<p className={`model-spotlight-acceptance${data.acceptance==="unavailable"?" model-spotlight-reference-warning":""}`}>{data.acceptance==="accepted_report"?tr("这份报告由原验收快照引用，后续检查不会改写当时的决定。","The original acceptance snapshot references this report. Later checks do not rewrite that decision."):data.acceptance==="supplemental"?tr("补充检查：原验收和测试付款仍引用当时冻结的证据，这份报告没有被补记为已接受。","Supplemental check: acceptance and test payment retain the originally frozen evidence. This report was not retrospectively accepted."):tr("原验收报告关联暂无法确认；本次检查不能补作原验收证明。","The original acceptance reference could not be verified. This check cannot replace that historical evidence.")}</p>}
  {data.state==="ready"&&<p className="model-spotlight-scope">{tr("只反映本轮登记接口和有限输入，不证明整站无缺陷。","Covers this run’s registered endpoints and finite inputs, not a bug-free website.")}</p>}
 </section>;
}
