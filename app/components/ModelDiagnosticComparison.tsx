"use client";
import {useEffect,useState} from "react";
import type {Language,ProofDelivery,ProofDeliveryVersion} from "@/lib/contracts";
import {runtimeDeliveryDigest} from "@/lib/runtime-project";
import {compareModelReports,type ModelDiagnosticComparison as Comparison} from "@/lib/model-diagnostic-comparison";
export function ModelDiagnosticComparison({delivery,previousVersion,projectId,language,onInspect,loading=false}:{delivery:ProofDelivery;previousVersion?:ProofDeliveryVersion;projectId?:string;language:Language;onInspect?:()=>void;loading?:boolean}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en,previous=previousVersion?.delivery;
 const [bound,setBound]=useState<{files:ProofDelivery["files"];oldFiles:ProofDelivery["files"];digest?:string;oldDigest?:string}>();
 useEffect(()=>{let active=true;if(!delivery.modelReport||!previous?.modelReport||!delivery.files||!previous.files)return()=>{active=false;};Promise.all([runtimeDeliveryDigest(delivery.files),runtimeDeliveryDigest(previous.files)]).then(([digest,oldDigest])=>{if(active)setBound({files:delivery.files,oldFiles:previous.files,digest,oldDigest});}).catch(()=>{if(active)setBound({files:delivery.files,oldFiles:previous.files});});return()=>{active=false;};},[delivery.files,previous?.files,delivery.modelReport?.id,previous?.modelReport?.id]);
 if(!delivery.modelReport&&!previous?.modelReport&&!delivery.modelRun)return null;
 let result:Comparison|undefined,error=false;
 const hasBoth=!!delivery.modelReport&&!!previous?.modelReport;
 if(hasBoth&&(!delivery.files||!previous?.files))error=true;
 if(hasBoth&&bound&&bound.files===delivery.files&&bound.oldFiles===previous?.files){try{if(!bound.digest||!bound.oldDigest||!delivery.journeyPlan||!previous?.journeyPlan)throw new Error("Missing saved binding");result=compareModelReports(previous.modelReport,delivery.modelReport,{previous:{deliveryId:previous.id,deliveryDigest:bound.oldDigest,journeyPlanDigest:previous.journeyPlan.planDigest,projectId},current:{deliveryId:delivery.id,deliveryDigest:bound.digest,journeyPlanDigest:delivery.journeyPlan.planDigest,projectId}});}catch{error=true;}}
 const label=(value:string)=>value==="compatible"?tr("模型符合","Compatible"):value==="violated"?tr("发现冲突","Violation"):tr("未确定","Inconclusive");
 return <details className="model-revision-comparison"><summary>{tr("并发问题的版本复测对照","Concurrent issue retest across versions")}</summary>
  {delivery.modelRun?<p role="status">{tr("本轮并发检查尚未结束，未比较旧报告来推断本轮问题是否消失。","The current concurrent run is unfinished. Earlier reports are not compared to infer this run’s outcome.")}</p>:loading?<p role="status">{tr("正在读取旧版本的完整检测记录…","Loading the earlier version’s complete test records…")}</p>:!hasBoth?<p>{tr("缺少旧版或新版的这项报告。新版通过本身不能证明旧问题已修复。","An earlier or current report is missing. A passing current run alone does not establish that an earlier issue was fixed.")}</p>:error?<p className="journey-warning">{tr("两版报告或文件关联无法校验，未显示修复结论。","The reports or file bindings could not be validated. No repair conclusion is shown.")}</p>:!result?<p role="status">{tr("正在核对两版保存的文件与报告…","Checking both versions' saved files and reports…")}</p>:<>
   <p>{label(result.before.outcome)} → {label(result.after.outcome)}</p><p>{result.message[language]}</p>
   {result.rows.map(row=><div className="model-revision-row" key={row.id}><strong>{row.title[language]}</strong><p>{tr("旧版实际：","Earlier observation: ")}{row.before[language]}</p><p>{tr("新版实际：","Current observation: ")}{row.after[language]}</p><small>{row.state==="still_observed"?tr("本轮仍观察到","Still observed"):row.state==="not_reproduced"?tr("同等输入下本轮未重现，仍需按范围复核","Not reproduced with equivalent inputs; scope still needs review"):tr("仍需核对","Needs review")}</small></div>)}
  </>}
  {onInspect&&<button type="button" className="text-button" onClick={onInspect}>{tr("查看本版诊断与原始证据","Inspect current diagnosis and raw evidence")}</button>}
 </details>;
}
