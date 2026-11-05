"use client";
import {useEffect,useRef,useState} from "react";
import type {Language} from "@/lib/contracts";
import {DELIVERY_STAGE_REPORT_BYTE_LIMIT,validateDeliveryStageReport,type DeliveryStageReport,type DeliveryStage,type DeliveryStageStatus} from "@/lib/delivery-stage-evidence";
const names:Record<DeliveryStage,[string,string]>={submit:["1 原生提交","1 Native submission"],stored_record:["2 存储记录","2 Stored record"],fresh_readback:["3 新连接回读","3 Fresh readback"],email_receipt:["4 测试收件记录","4 Test inbox receipt"]};
const statuses:Record<DeliveryStageStatus,[string,string]>={matched:["记录相符","Records match"],mismatch:["记录不符","Records differ"],unknown:["未知／待补证","Unknown / evidence needed"],unsupported:["不支持／未适配","Unsupported / not adapted"]};
const reasons:Record<string,[string,string]>={manual_required:["此阶段需要另行人工观察。","This stage needs separate human observation."],stage_not_supported:["计划明确未适配此阶段。","The plan declares this stage unsupported."],adapter_not_supported:["适配器未提供该阶段。","The adapter did not supply this stage."],adapter_error:["适配器未完成；未保留异常正文。","The adapter did not complete; exception text is not retained."],timeout:["等待超时，外部结果未知；没有自动重试。","Timed out with an unknown external outcome; no automatic retry."],prior_result_unknown:["先前结果未知，后继阶段未运行。","A prior result was unknown; this later stage did not run."],wrong_run_or_revision:["运行标记或声明版本不符。","The run marker or declared revision differs."],submission_not_accepted:["提交未被接受或没有记录标识。","Submission was not accepted or supplied no record identity."],receipt_missing:["未找到所需测试收件记录。","The required test inbox receipt is absent."],record_missing:["未找到所需原生记录。","The required native record is absent."],payload_differs:["记录内容摘要与计划不符。","The recorded payload digest differs from the plan."],submission_not_established:["未建立本次提交对应的记录。","A record for this submission was not established."],record_identity_differs:["查询对应了另一条记录。","The query returned a different record identity."],stored_reader_unavailable:["没有可对照的原生存储读取者。","A native-store reader is unavailable for comparison."],reader_not_fresh:["回读仍声明使用原连接，不能确认新连接回读。","Readback declares the original connection; a fresh connection is not established."],cooperative_test_receipt_matches:["合作方的测试收件记录与本次记录相符；不证明外部邮箱送达。","The cooperative test receipt matches this record; external mailbox delivery is not proven."],cooperative_record_matches:["合作方报告的标识和内容摘要相符；不证明真实性。","The cooperative record identity and payload digest match; authenticity is not proven."]};
/** A local data viewer, never an adapter loader or a current-delivery verdict. */
export function DeliveryStageEvidence({language}:{language:Language}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 const [report,setReport]=useState<DeliveryStageReport|null>(null),[reading,setReading]=useState(false),[notice,setNotice]=useState("");
 const generation=useRef(0);
 useEffect(()=>()=>{generation.current++;},[]);
 async function choose(file?:File){
  const current=++generation.current;setReport(null);setNotice("");setReading(Boolean(file));if(!file)return;
  try{
   if(file.size>DELIVERY_STAGE_REPORT_BYTE_LIMIT)throw Error("size");
   const bytes=await file.arrayBuffer();if(current!==generation.current)return;
   const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);const value=await validateDeliveryStageReport(JSON.parse(text));
   if(current!==generation.current)return;setReport(value);setNotice(tr("分层记录已核对；尚未绑定为本项目验收证据。","Stage records checked; they are not bound as acceptance evidence for this project."));
  }catch{if(current===generation.current)setNotice(tr("未能核对这份报告。请使用工具生成的完整 UTF-8 JSON（最多 64 KiB）；不要选择代码或含私人资料的文件。","This report could not be checked. Use a complete tool-generated UTF-8 JSON file (up to 64 KiB); exclude code and private data."));}
  finally{if(current===generation.current)setReading(false);}
 }
 return <details className="seller-integration-guide"><summary>{tr("分层核对提交、存储、回读与测试收件","Check submission, storage, readback and test inbox separately")}</summary>
  <p>{tr("开发者可用本地适配器记录四个阶段，再在此选择报告核对。每个阶段分别显示未适配、未知或不符，某一步成功不会让整条约定自动通过。","A developer can record four stages with a local adapter, then choose the report here. Unsupported, unknown and differing stages stay separate; one successful step does not pass the whole agreement.")}</p>
  <label>{tr("选择本地分层报告 JSON","Choose local stage report JSON")}<input type="file" accept=".json,application/json" onChange={event=>{const file=event.target.files?.[0];event.target.value="";void choose(file);}}/></label>
  <p><small>{tr("只在浏览器内读取，不上传、不执行文件、不调用模型或付款；不会改变当前交付报告、验收或付款状态。","Read only in this browser. No upload, code execution, model or payment call; the current delivery report, acceptance and payment remain unchanged.")}</small></p>
  {reading&&<p role="status">{tr("正在核对分层记录…","Checking stage records…")}</p>}
  {notice&&<p role="status">{notice}</p>}
  {report&&<section aria-label={tr("分层记录核对结果","Stage record verification result")}>
   <p><strong>{tr("四阶段分别记录","Four separately recorded stages")}</strong>{" · "}{tr(`相符 ${report.summary.matched}，不符 ${report.summary.mismatch}，未知 ${report.summary.unknown}，未适配 ${report.summary.unsupported}`,`${report.summary.matched} match, ${report.summary.mismatch} differ, ${report.summary.unknown} unknown, ${report.summary.unsupported} unsupported`)}</p>
   <details><summary>{tr("所报告的约定与范围","Reported requirement and scope")}</summary><p>{report.plan.scope.requirement}</p><dl>{Object.entries({projectId:report.plan.scope.projectId,deliveryId:report.plan.scope.deliveryId,criterionId:report.plan.scope.criterionId,sourceRevision:report.plan.scope.sourceRevision,runId:report.plan.runId}).map(([key,value])=><div key={key}><dt>{key}</dt><dd><code>{value}</code></dd></div>)}</dl></details>
   <ol>{report.rows.map(row=><li key={row.stage}><strong>{tr(...names[row.stage])}</strong>{" — "}<span>{tr(...statuses[row.status])}</span><p>{reasons[row.reason]?tr(...reasons[row.reason]):tr("此阶段需要进一步核对。","This stage needs further review.")}</p>{row.observation.outcome==="observed"&&row.observation.stage==="email_receipt"&&<p><small>{row.observation.transport==="test_sink"?tr("来源：本地测试收件箱，不是外部邮箱。","Source: local test sink, not an external mailbox."):tr("来源：适配器声明的测试收件箱，真实性未独立证明。","Source: adapter-declared test inbox; authenticity is not independently established.")}</small></p>}</li>)}</ol>
   <p><small>{tr("SHA-256 只检查这份记录的内部一致性。适配器、数据库与收件箱由卖家控制；此处不证明实际请求、身份、源码部署或后台真实性。","SHA-256 checks this record's internal consistency only. The adapter, datastore and inbox are seller-controlled; this view does not prove actual requests, identity, deployed source or backend authenticity.")}</small></p>
  </section>}
  <p><a href="https://github.com/kangshuming0111-ctrl/proofbeforepay/tree/codex/public-release/examples/delivery-stage-staging" target="_blank" rel="noreferrer">{tr("取得适配器工具、可运行示例与故障验证","Get the adapter tool, runnable example and failure checks")}</a></p>
 </details>;
}
