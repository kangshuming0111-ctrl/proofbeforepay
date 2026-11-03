"use client";
import type {Language} from "@/lib/contracts";
import {validateStoredModelCheckReport,type ModelCheckReport} from "@/lib/model-checks";

export function ModelEvidenceReadings({report,deliveryId,language}:{report:ModelCheckReport;deliveryId:string;language:Language}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 let saved:ModelCheckReport;try{saved=validateStoredModelCheckReport(report,{deliveryId});}catch{return <p className="evidence-history-warning">{tr("保存的模型证据无法校验，没有替换为其他报告。","Saved model evidence could not be validated. No other report was substituted.")}</p>;}
 return <div className="project-journey"><p>{tr("服务器直接读取登记的合成测试接口；有限输入不证明整站无缺陷、浏览器可用性或部署源码来源。","Server-direct readbacks from registered synthetic endpoints. Finite inputs do not establish a bug-free site, browser usability or deployed-source provenance.")}</p><p><strong>{saved.result.outcome==="compatible"?tr("符合一种合法顺序","Matches a legal order"):saved.result.outcome==="violated"?tr("违反状态模型","State-model violation"):tr("未确定","Inconclusive")}</strong> · {saved.result.reason}</p><p>{tr("输入种子","Seed")}: {saved.seed} · {saved.finishedAt}<br/>{saved.registration.label}<br/><code>{saved.id}</code><br/><code>{saved.deliveryDigest}</code><br/><code>{saved.modelSpecDigest}</code></p><details><summary>{tr("查看保存的请求与读回","View retained requests and readbacks")}</summary><ol>{saved.trace.map(row=><li key={row.operationId}><strong>{row.operationId} · {row.status??"?"}</strong> · {row.invokedOrdinal}→{row.completedOrdinal??"?"}<pre>{JSON.stringify(row,null,2)}</pre></li>)}</ol></details></div>;
}
