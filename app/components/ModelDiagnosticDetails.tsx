"use client";
import type {Language} from "@/lib/contracts";
import type {ModelDiagnosis} from "@/lib/model-diagnostics";
import type {ModelOperationId} from "@/lib/model-checks";
import "../model-diagnosis.css";

export const modelOperationLabel=(id:ModelOperationId,language:Language)=>{
 const zh=language==="zh";
 const labels:Record<ModelOperationId,[string,string]>={
  meta:["登记接口声明","Registered endpoint metadata"],empty_merchant:["初始商家账目","Initial merchant records"],empty_a:["初始时段 A","Initial slot A"],empty_b:["初始时段 B","Initial slot B"],empty_c:["初始时段 C","Initial slot C"],
  create_x:["创建原预约 X","Create original booking X"],create_y:["创建待取消预约 Y","Create cancellable booking Y"],create_z:["创建另一笔预约 Z","Create other booking Z"],seeded_merchant:["准备后的商家账目","Prepared merchant records"],seeded_a:["准备后的时段 A","Prepared slot A"],seeded_b:["准备后的时段 B","Prepared slot B"],seeded_c:["准备后的时段 C","Prepared slot C"],seeded_x:["原预约 X 的初始收据","Initial receipt X"],seeded_y:["预约 Y 的初始收据","Initial receipt Y"],seeded_z:["预约 Z 的初始收据","Initial receipt Z"],
  cancel_y:["取消预约 Y 的返回","Cancellation Y response"],transfer_x:["原预约 X 改期的返回","Transfer X response"],final_merchant:["最终商家账目","Final merchant records"],final_a:["最终时段 A 人数","Final slot A occupancy"],final_b:["最终时段 B 人数","Final slot B occupancy"],final_c:["最终时段 C 人数","Final slot C occupancy"],final_x:["原预约 X 的最终收据","Final original-booking receipt X"],final_y:["预约 Y 的最终收据","Final receipt Y"],final_z:["预约 Z 的最终收据","Final receipt Z"]
 };
 return labels[id][zh?0:1];
};

/** Generated business differences, never seller prose or an AI verdict. The
 * first two stay visible; further evidence is an intentional disclosure. */
export function ModelDiagnosticDetails({diagnosis,language,compact=false}:{diagnosis:ModelDiagnosis;language:Language;compact?:boolean}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 const findings=[...diagnosis.findings].sort((a,b)=>({issue:0,unknown:1,information:2}[a.severity]-{issue:0,unknown:1,information:2}[b.severity]));
 const count=compact?1:2;
 const render=(finding:typeof findings[number])=><article className={`model-diagnostic-finding model-diagnostic-${finding.severity}`} key={finding.id}>
  <strong>{finding.title[language]}</strong>
  <dl><div><dt>{tr("应该怎样","Expected")}</dt><dd>{finding.expected[language]}</dd></div><div><dt>{tr("本次记录","Observed in this run")}</dt><dd>{finding.actual[language]}</dd></div></dl>
  <p className="model-diagnostic-impact">{finding.impact[language]}</p>
  {!compact&&<><p className="model-diagnostic-retest"><strong>{tr("修复与复测：","Repair and retest: ")}</strong>{finding.retest[language]}</p><p className="model-diagnostic-evidence">{tr("依据观测：","Evidence observations: ")}{finding.operationIds.map(id=>modelOperationLabel(id,language)).join(" / ")}</p></>}
 </article>;
 return <div className={`model-diagnostic-details${compact?" model-diagnostic-compact":""}`}>
  {findings.slice(0,count).map(render)}
  {!compact&&findings.length>count&&<details><summary>{tr(`其余 ${findings.length-count} 项差异与证据`,`Other ${findings.length-count} differences and evidence`)}</summary>{findings.slice(count).map(render)}</details>}
  {!compact&&<details className="model-diagnostic-plan"><summary>{tr("完整复测要点与合法顺序","Retest plan and legal orders")}</summary><ul>{diagnosis.retest.map((step,index)=><li key={index}>{step[language]}</li>)}</ul><ul>{diagnosis.alternatives.map(alternative=><li key={alternative.order}><strong>{alternative.order==="cancel_then_move"?tr("先取消，再改期","Cancel then move"):tr("先改期，再取消","Move then cancel")}</strong>: {alternative.matches?tr("能解释本轮完整记录","Explains the complete recorded run"):!alternative.allowedByTiming?tr("不符合本轮请求先后关系","Excluded by the recorded invocation/completion order"):tr(`${alternative.differenceCount} 项记录差异`,`Differences in ${alternative.differenceCount} recorded assertions`)}</li>)}</ul></details>}
 </div>;
}
