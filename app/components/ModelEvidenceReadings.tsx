"use client";
import {useMemo} from "react";
import type {Language,ProofDelivery} from "@/lib/contracts";
import {validateStoredModelCheckReport,type ModelCheckReport} from "@/lib/model-checks";
import {modelDiagnosisExplanationPacket,type ModelDiagnosisExplanationPacket} from "@/lib/model-diagnostics";
import {modelEvidenceBinding,validateModelEvidenceExplanation,type ModelEvidenceExplanation} from "@/lib/model-evidence-explanation";
import {useModelDiagnosis} from "./useModelDiagnosis";
import {ModelDiagnosticDetails,modelOperationLabel} from "./ModelDiagnosticDetails";
import {ModelExplanationCoverage} from "./ModelExplanationCoverage";

/** The selected historical report is explicit. Current report B can never be
 * substituted for frozen A, even while another current run is pending. */
export function ModelEvidenceReadings({report,deliveryId,language,context}:{report:ModelCheckReport;deliveryId:string;language:Language;context?:{delivery:ProofDelivery;projectId?:string}}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 const viewed=useMemo<ProofDelivery>(()=>context?{...context.delivery,modelReport:report,modelRun:undefined}:{id:deliveryId,variant:"upload",label:"Historical model evidence",submittedAt:report.startedAt,evidence:[],modelReport:report},[context?.delivery,report,deliveryId]);
 const model=useModelDiagnosis(viewed,{projectId:context?.projectId});
 let saved:ModelCheckReport|undefined;try{saved=validateStoredModelCheckReport(report,{deliveryId});}catch{/* Retain a visible invalid state instead of another report. */}
 const diagnosis=model.state==="ready"?model.diagnosis:undefined;
 let explanation:ModelEvidenceExplanation|undefined,explanationPacket:ModelDiagnosisExplanationPacket|undefined;
 try{if(saved&&diagnosis){explanationPacket=modelDiagnosisExplanationPacket(saved,{deliveryId,deliveryDigest:diagnosis.deliveryDigest,journeyPlanDigest:diagnosis.journeyPlanDigest,...(context?.projectId?{projectId:context.projectId}:{})});if(context?.delivery.modelExplanation)explanation=validateModelEvidenceExplanation(context.delivery.modelExplanation,modelEvidenceBinding(explanationPacket));}}catch{/* This explanation belongs to another report or binding. */}
 if(!saved)return <p className="evidence-history-warning">{tr("保存的模型证据无法校验，没有替换为其他报告。","Saved model evidence could not be validated. No other report was substituted.")}</p>;
 return <div className="project-journey">
  <p>{tr("只读的历史记录；不会重新操作卖家站或改变验收与付款。服务器直接读取登记的合成测试接口，有限输入不证明整站无缺陷或部署源码来源。","Read-only historical evidence: no new seller actions or acceptance/payment changes. Server-direct readbacks cover registered synthetic endpoints and finite inputs, not a bug-free site or deployed-source provenance.")}</p>
  {model.state==="checking"?<p role="status">{tr("正在用该版本的实际保存文件核对报告关联。","Checking the report against this version’s actual saved files.")}</p>:!diagnosis?<p className="evidence-history-warning">{tr("报告或该版本文件的关联无法完整校验，没有用最新交付替代。","The report or its file binding could not be fully validated. The latest delivery was not substituted.")}</p>:<><p className={diagnosis.outcome==="compatible"?"journey-result":"journey-warning"}><strong>{diagnosis.summary[language]}</strong></p><ModelDiagnosticDetails diagnosis={diagnosis} language={language}/></>}
  {explanationPacket&&diagnosis&&<details><summary>{explanation?tr("该报告单独保存的 AI 解释","Separately saved AI explanation for this report"):tr("本报告的 AI 解释状态","AI explanation availability for this report")}</summary><p>{tr("这是一份单独的辅助解释，不会被补记为原验收时已确认的依据。","This is a separate advisory explanation; it is not retrospectively added to the original acceptance evidence.")}</p><ModelExplanationCoverage diagnosis={diagnosis} packet={explanationPacket} explanation={explanation} language={language}/>{explanation?.findings.map((finding,index)=><blockquote key={index}><strong>{finding.findingIds.map(id=>diagnosis.findings.find(item=>item.id===id)?.title[language]??id).join(" / ")}</strong><p>{finding.explanation}</p><p>{tr("建议复测：","Suggested retest: ")}{finding.retest}</p></blockquote>)}{explanation?.limitations.map((item,index)=><p key={index}>{item}</p>)}</details>}
  <details><summary>{tr("本报告的版本与登记关联","Version and registration bindings")}</summary><p>{tr("输入种子","Seed")}: {saved.seed} · {saved.finishedAt}<br/>{saved.registration.label}<br/><code>{saved.id}</code><br/><code>{saved.deliveryDigest}</code><br/><code>{saved.modelSpecDigest}</code></p></details>
  <details><summary>{tr("查看保存的请求与读回","View retained requests and readbacks")}</summary><ol>{saved.trace.map(row=><li key={row.operationId}><strong>{modelOperationLabel(row.operationId,language)} · {row.status??"?"}</strong> · {row.invokedOrdinal}→{row.completedOrdinal??"?"}<pre>{JSON.stringify(row,null,2)}</pre></li>)}</ol></details>
 </div>;
}
