"use client";
import type {Language} from "@/lib/contracts";
import validation from "@/public/benchmarks/gap-closure-cycles-2026-11-04/summary.json";
import {LatestAssessmentValidation} from "./LatestAssessmentValidation";
import {ReliabilityAssessmentValidation} from "./ReliabilityAssessmentValidation";
import {AssessmentBenchmarkPanel} from "./AssessmentBenchmarkPanel";
import "../assessment-benchmark.css";

const ROOT="/benchmarks/gap-closure-cycles-2026-11-04/";
function link(file:string){return /^[a-z0-9][a-z0-9-]*\.json$/u.test(file)?ROOT+file:undefined;}

/** Saved evaluator experiments, never a result for the customer's delivery.
 * Static local data: opening this panel makes no model or payment request. */
export function AssessmentValidationPanel({language}:{language:Language}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 return <details className="assessment-benchmark" id="assessment-validation">
  <summary><span>{tr("AI 可靠性记录：完整回归与迁移验证","AI validation: complete regression and transfer checks")}</span><small>{tr("查看已保存实测","Inspect recorded experiments")}</small></summary>
  <p>{tr("这里验证评估器本身。当前客户交付的结果另行保存；展开不会重新调用模型。每批原始输出、应用输出与冻结清单均保留。","These experiments evaluate the evaluator. The current delivery has its own saved result; expanding this panel does not call a model. Raw answers, application output and frozen inputs are retained for each batch.")}</p>
  <div className="benchmark-table-scroll" tabIndex={0} role="region" aria-label={tr("新版评估器的分批实测","Separate evaluator validation batches")}>
   <table><thead><tr><th scope="col">{tr("批次","Batch")}</th><th scope="col">{tr("项目／标准","Projects / criteria")}</th><th scope="col">{tr("模型状态一致","Raw status agreement")}</th><th scope="col">{tr("应用状态一致","Application status agreement")}</th><th scope="col">{tr("缺陷误放行","Defects reported supported")}</th><th scope="col">{tr("无效回答拒收","Invalid answers refused")}</th></tr></thead>
    <tbody>{validation.rows.map(row=><tr key={row.output}><th scope="row">{language==="zh"?row.nameZh:row.nameEn}</th><td>{row.projects} / {row.criteria}</td><td>{row.raw} / {row.criteria}</td><td>{row.application} / {row.criteria}</td><td>{row.falsePass}</td><td>{row.rejectedReports}</td></tr>)}</tbody>
   </table>
  </div>
  <p className="benchmark-note">{tr("这些是每批状态与参考标签的一致数量，不是陌生真实项目的总体准确率。相同语料的两次运行分别列出，不合并成更多独立项目。","These counts compare statuses with reference labels, not general accuracy on unfamiliar projects. Repeated runs on the same corpus remain separate and are not counted as additional independent projects.")}</p>
  {Object.entries(validation.semantic).map(([kind,review])=><section className="benchmark-followup" key={kind}>
   <strong>{kind==="known"?tr("早期完整回归的整份回答审查","Whole-answer review of earlier complete regression"):kind==="current"?tr("11月4日批次20份完整回答审查","Whole-answer review of the November4 batch of20 answers"):tr("初始迁移案例的整份回答审查","Whole-answer review of initial transfer cases")}</strong>
   <p>{tr(`共 ${review.answers} 份：接受 ${review.accepted}，附条件 ${review.qualified}，拒绝 ${review.rejected}。`,`Answers ${review.answers}: accepted ${review.accepted}, qualified ${review.qualified}, rejected ${review.rejected}.`)}</p>
   <small>{tr("独立 AI 审阅全部判定、解释、风险、限制及引用；不是独立真人盲评。","An independent AI reviewer inspected decisions, explanations, risks, limitations and citations. This is not a blinded human study.")}</small>
   {kind==="transfer-initial"&&<p className="benchmark-note">{tr("此处的拒绝项是被应用正确拦截、未交付的虚构引文回答；不能描述为放行了错误报告。","The refused answer here contained an invented quotation and was correctly blocked before report delivery; it was not an incorrect report allowed through.")}</p>}
   <p><a href={link(review.file)} download>{tr("下载逐项审查","Download item-level review")}</a></p>
  </section>)}
  <ul className="benchmark-limits">{(language==="zh"?validation.limitationsZh:validation.limitationsEn).map((limit,index)=><li key={index}>{limit}</li>)}</ul>
  <div className="benchmark-artifacts">{validation.rows.map(row=><a className="subtle-button" key={row.output} href={link(row.output)} download>{language==="zh"?row.nameZh:row.nameEn} JSON</a>)}{validation.artifacts.map(file=><a className="subtle-button" key={file} href={link(file)} download>{file}</a>)}</div>
  <ReliabilityAssessmentValidation language={language}/>
  <LatestAssessmentValidation language={language}/>
  <AssessmentBenchmarkPanel language={language}/>
 </details>;
}
