"use client";

import {useId,useRef,useState,type MouseEvent} from "react";
import type {Language} from "@/lib/contracts";
import saved from "@/public/benchmarks/real-projects-2026-11-05/summary.json";
import followup from "@/public/benchmarks/citation-relations-2026-11-05/citation-relations-summary.json";

type BatchCounts = {
 projects:number;
 criteria:number;
 rawAgreement:number;
 applicationAgreement:number;
 completeItemProjects?:number;
 admittedReports?:number;
};
type SavedValidation = {
 schema:string;
 phase:string;
 novelFirst:BatchCounts;
 historicalFirst:BatchCounts;
 knownFinal:BatchCounts;
 heldoutFirst:BatchCounts;
 heldoutKnownFinal:BatchCounts;
 longFirst:BatchCounts;
 longFinal:BatchCounts;
 latestModelCounts?:BatchCounts;
 postModelGuard?:{modelCalls:number;networkRequests:number;reclassifiedItems:number};
 assessmentCalls:number;
 wholeAnswerReview:{applicationWholeAnswers:{accepted:number;qualified:number;rejected:number};rawCitationCount:number;originalAsReceivedJsonValid:number;oneTrailingBraceNormalization:number};
 artifacts:string[];
 limits:string[];
};

const data:SavedValidation=saved;
const ROOT="/benchmarks/real-projects-2026-11-05/";
const FOLLOWUP_ROOT="/benchmarks/citation-relations-2026-11-05/";
const MAX_DOWNLOAD_BYTES=4*1024*1024;
function artifactUrl(file:string,root=ROOT){
 if(root!==ROOT&&root!==FOLLOWUP_ROOT)return undefined;
 if(!/^[a-z0-9][a-z0-9./-]*\.(?:json|md|txt)$/u.test(file)
  ||file.split("/").some(part=>!part||part==="."||part===".."))return undefined;
 return root+file.split("/").map(encodeURIComponent).join("/");
}

/** Saved source experiments only. Rendering this record performs no model,
 * website execution, acceptance or payment operation. */
export function RealProjectAssessmentValidation({language}:{language:Language}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 const inFlight=useRef(new Set<string>());
 const [pendingDownloads,setPendingDownloads]=useState<string[]>([]);
 const [downloadError,setDownloadError]=useState<string|null>(null);
 const [downloadStatus,setDownloadStatus]=useState("");
 const downloadErrorId=useId();
 const n=data.novelFirst,h=data.heldoutFirst;
 const finalCriteria=followup.knownFinal.criteria+followup.repairNew.criteria+followup.scopeFinal.criteria;
 const finalAgreement=followup.knownFinal.applicationAgreement+followup.repairNew.applicationAgreement+followup.scopeFinal.applicationAgreement;
 async function downloadArtifact(event:MouseEvent<HTMLAnchorElement>,file:string,root=ROOT){
  // Keep modified-click and the original href/download as browser fallbacks.
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  const href=artifactUrl(file,root);
  if(!href||inFlight.current.has(file))return;
  inFlight.current.add(file);setPendingDownloads(current=>[...current,file]);setDownloadError(null);
  setDownloadStatus(tr(`正在准备 ${file}。`,`Preparing ${file}.`));
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20_000);
  let objectUrl:string|undefined;
  try{
   const response=await fetch(href,{credentials:"same-origin",mode:"same-origin",redirect:"error",signal:controller.signal});
   const mime=(response.headers.get("content-type")??"").split(";",1)[0].trim().toLowerCase();
   const length=response.headers.get("content-length");
   if(!response.ok||mime&& !/^(?:application\/(?:json|octet-stream|[a-z0-9.+-]+\+json)|text\/(?:plain|markdown|x-markdown))$/u.test(mime)
    ||length!==null&&/^\d+$/u.test(length)&&Number(length)>MAX_DOWNLOAD_BYTES)throw new Error("Artifact response refused.");
   const blob=await response.blob();
   if(!blob.size||blob.size>MAX_DOWNLOAD_BYTES||/^\s*(?:<!doctype\s+html\b|<html\b|<head\b|<body\b)/iu.test(await blob.slice(0,256).text()))throw new Error("Artifact body refused.");
   objectUrl=URL.createObjectURL(blob);
   const anchor=document.createElement("a");
   anchor.href=objectUrl;anchor.download=file.split("/").at(-1)??file;anchor.hidden=true;
   document.body.appendChild(anchor);
   try{anchor.click();}finally{anchor.remove();}
   setDownloadStatus(tr(`已发起 ${file} 下载；请在浏览器核对文件已保存。`,`Download started for ${file}; confirm the saved file in your browser.`));
  }catch{
   setDownloadStatus("");
   setDownloadError(tr(`未能下载 ${file}。请确认仍已登录后重试；登录页面或无效响应不会保存为证据文件。`,`Could not download ${file}. Check that you are still signed in and retry. A sign-in page or invalid response will not be saved as evidence.`));
  }finally{
   clearTimeout(timeout);
   if(objectUrl){const completedUrl=objectUrl;setTimeout(()=>URL.revokeObjectURL(completedUrl),1_000);}
   inFlight.current.delete(file);setPendingDownloads(current=>current.filter(name=>name!==file));
  }
 }
 const countLine=(batch:BatchCounts)=>tr(
  `${batch.projects} 组交付任务、${batch.criteria} 条要求；模型状态 ${batch.rawAgreement}/${batch.criteria}、应用状态 ${batch.applicationAgreement}/${batch.criteria} 与参考一致。`,
  `${batch.projects} delivery tasks and ${batch.criteria} criteria; raw status agreement ${batch.rawAgreement}/${batch.criteria}, application status agreement ${batch.applicationAgreement}/${batch.criteria}.`,
 );
 const batchRow=(label:string,batch:BatchCounts)=><div key={label}>
  <dt>{label}</dt>
  <dd>{countLine(batch)}
   {(typeof batch.completeItemProjects==="number"||typeof batch.admittedReports==="number")&&<small>
    {typeof batch.completeItemProjects==="number"&&tr(`完整返回条目 ${batch.completeItemProjects}/${batch.projects}。 `,`Complete item lists ${batch.completeItemProjects}/${batch.projects}. `)}
    {typeof batch.admittedReports==="number"&&tr(`结构与引文准入 ${batch.admittedReports}/${batch.projects} 份；准入不等于判断正确或买家接受。`,`Schema/citation admission ${batch.admittedReports}/${batch.projects}; admission is separate from semantic correctness and buyer acceptance.`)}
   </small>}
  </dd>
 </div>;
 return <section className="benchmark-followup">
  <strong>{tr("本轮：引文与跨页面关系核验","This follow-up: quotations and cross-page evidence")}</strong>
  <p>{tr(
   `最终真实调用返回 ${followup.latestCitationChecks.reports} 份报告、${finalCriteria} 条要求；保留原答中 ${followup.latestCitationChecks.valid}/${followup.latestCitationChecks.count} 个引文准确对应原文。应用状态与参考一致 ${finalAgreement}/${finalCriteria}；另外 ${finalCriteria-finalAgreement} 项保留为证据不足。引文能定位，不代表结论必然正确。`,
   `The final real-call batch returned ${followup.latestCitationChecks.reports} reports and ${finalCriteria} criteria, with ${followup.latestCitationChecks.valid}/${followup.latestCitationChecks.count} retained original quotations matching their source. Application status agreement was ${finalAgreement}/${finalCriteria}; ${finalCriteria-finalAgreement} criteria remained insufficiently evidenced. Locatable quotations do not by themselves establish correct conclusions.`,
  )}</p>
  <details className="benchmark-counterexamples">
   <summary>{tr("查看本轮首次结果、修复结果与原答","Inspect first attempts, repair results and original answers")}</summary>
   <dl className="benchmark-meta">
    {batchRow(tr("新增两仓库的首次结果","First attempts on two additional repositories"),followup.newFirst)}
    {batchRow(tr("披露后重测，不计为新项目","Known-case repair after first disclosure"),followup.repairNew)}
    {batchRow(tr("既有七任务，来自六仓库","Seven known tasks from six repositories"),followup.knownFinal)}
    {batchRow(tr("六个人工构造的跨页与价格边界","Six authored page/price boundary tasks"),followup.scopeFinal)}
   </dl>
   <p className="benchmark-note">{tr(
    `五轮共 ${followup.assessmentCalls} 次真实评估调用，保留失败原答。最终发布规则另用这 15 份原答回放：0 次模型调用、0 次网络请求，请求逐字相同，82 项状态未变。金额差异说明改由已确认的金额生成；未经核实的模型自述不作为检测事实。结论经规则或证据校验调整时，可选风险暂缓发布，并说明数量。`,
    `The five cycles used ${followup.assessmentCalls} real assessment calls, retaining failed attempts. A separate publication-policy replay reused these 15 answers with 0 model calls and 0 network requests: requests were byte-identical and all 82 statuses stayed unchanged. Confirmed amounts now generate price-mismatch explanations; unverified model self-descriptions are withheld. When rule or evidence validation adjusts a status, optional risks are temporarily withheld with a count.`,
   )}</p>
   <p className="benchmark-note">{tr(
    "这些是公开模板原件配以新撰验收要求，不是真实客户成功率。首次与修复结果分开保留。未知项包括页面角色尚未确认、需要运行才能判断的可见性，以及跨页内容未被完整引证；未知不等于交付不合格。整答 AI 审阅仍有保留意见，且不是独立真人评测。当前引文候选的粒度仍可能需要优化。",
    "These are original public templates paired with authored acceptance tasks, not a customer success rate. First and repair attempts stay separate. Unknowns include unconfirmed page roles, visibility that requires execution, and incompletely cited cross-page content; unknown does not establish a delivery defect. AI whole-answer reviews still have qualifications and are not independent human tests. Citation-candidate granularity remains an improvement area.",
   )}</p>
   <div className="benchmark-artifacts">
    <strong>{tr("下载本轮可回查记录","Download this follow-up's records")}</strong>
    {["citation-relations-summary.json","cycle-13-new-first-live.json","cycle-15-repair-new-live.json","cycle-15-known-live.json","cycle-15-scope-live.json","final-publication-replay.json","final-publication-replay-review.json","publication-verified-implementation.json"].map(file=>{
     const href=artifactUrl(file,FOLLOWUP_ROOT),pending=pendingDownloads.includes(file);
     return href?<a className="subtle-button" key={file} href={href} download aria-busy={pending||undefined} aria-disabled={pending||undefined} aria-describedby={downloadError?downloadErrorId:undefined} onClick={event=>void downloadArtifact(event,file,FOLLOWUP_ROOT)}>{file}{pending?tr("（准备文件中）"," (preparing file)"):""}</a>:null;
    })}
   </div>
  </details>
  <strong>{tr("真实开源项目：保留首次，再核对修复回归","Real open-source projects: first attempts and repair regressions")}</strong>
  <p>{tr(
   `已追踪测试中首次出现的项目共 ${n.projects} 个、${n.criteria} 条要求：模型状态一致 ${n.rawAgreement}/${n.criteria}，应用状态一致 ${n.applicationAgreement}/${n.criteria}。其中封存留出批次为 ${h.projects} 个、${h.criteria} 条要求，模型 ${h.rawAgreement}/${h.criteria}、应用 ${h.applicationAgreement}/${h.criteria}；项目数不叠加。`,
   `First attempts on ${n.projects} repositories new to tracked test history and ${n.criteria} criteria: raw agreement ${n.rawAgreement}/${n.criteria}, application agreement ${n.applicationAgreement}/${n.criteria}. This includes the sealed held-out batch of ${h.projects} repositories and ${h.criteria} criteria: raw ${h.rawAgreement}/${h.criteria}, application ${h.applicationAgreement}/${h.criteria}. These project counts are not added together.`,
  )}</p>
  <p className="benchmark-note">{tr(
   "真实公开模板和脚手架原件配以新撰验收要求；仓库数不等于独立作者或客户数，也不是客户成功率或通用 AI 准确率。公开源码 JSON 仅供回查，未执行其中代码；查看记录不调用模型或付款接口。",
   "Unchanged public templates and scaffolds are paired with newly authored acceptance tasks. Repository counts are not independent author or customer counts, customer success rates or general AI accuracy. Public source JSON is retained for inspection; its code was not executed. Viewing these records makes no model or payment request.",
  )}</p>
  {data.latestModelCounts&&<p className="benchmark-note">{tr(
   `先前一批真实调用（最后的标点保护规则之前）：${countLine(data.latestModelCounts)}报告准入 ${data.latestModelCounts.admittedReports}/${data.latestModelCounts.projects}，包含被拒绝的错误引文报告，没有只挑成功结果。`,
   `Previous real-call batch, before the final punctuation guard: ${countLine(data.latestModelCounts)} Report admission ${data.latestModelCounts.admittedReports}/${data.latestModelCounts.projects}, including the rejected quotation failure; failed attempts are not excluded.`,
  )}</p>}
  <details className="benchmark-counterexamples">
   <summary>{tr("查看首次、已知回归和长清单的分批结果","Inspect first attempts, known-case regressions and longer tasks")}</summary>
   <strong>{tr("首次记录保持原样","First-attempt records are preserved")}</strong>
   <dl className="benchmark-meta">
    {batchRow(tr("未见仓库合计","Previously untested repositories"),n)}
    {batchRow(tr("其中封存留出","Sealed held-out subset"),h)}
    {batchRow(tr("历史已见项目另列","Previously seen project"),data.historicalFirst)}
   </dl>
   <strong>{tr("已知案例修复回归","Repair regressions on known cases")}</strong>
   <dl className="benchmark-meta">
    {batchRow(tr("开发集修复回归","Development-set regression"),data.knownFinal)}
    {batchRow(tr("留出首答后的回归","Regression after held-out first attempts"),data.heldoutKnownFinal)}
   </dl>
   <p className="benchmark-note">{tr(
    "修复回归复用已知案例，不增加未见项目。留出案例在首次披露后也属于已知案例；不把修复后的分数覆盖首次结果。",
    "Repair regressions reuse known cases and add no unseen repositories. Once first disclosed, held-out cases are also known cases. Their repaired scores do not replace the first-attempt record.",
   )}</p>
   <strong>{tr("同一项目的较长要求任务","Longer task on an existing project")}</strong>
   <dl className="benchmark-meta">
    {batchRow(tr("长清单首次","Long-list first attempt"),data.longFirst)}
    {batchRow(tr("长清单修复回归","Long-list regression"),data.longFinal)}
   </dl>
   <p className="benchmark-note">{tr(
    "长清单来自同一 Corona 项目的新任务，不再增加仓库数。状态一致、条目完整、报告准入和整份回答的语义质量分别判断；这些源码实验没有新增真人试用、运行成功或付款结果。",
    "The longer task uses the same Corona project and adds no repository. Status agreement, complete items, report admission and whole-answer semantic quality are separate. These source experiments establish no new human-use, runtime-success or payment outcome.",
   )}</p>
   <p className="benchmark-note">{tr(
    `先前一批 AI 整答源码审阅：${data.wholeAnswerReview.applicationWholeAnswers.accepted} 份接受、${data.wholeAnswerReview.applicationWholeAnswers.qualified} 份保留意见、${data.wholeAnswerReview.applicationWholeAnswers.rejected} 份拒绝。部分多字段结论的摘录仍不完整，动态页面文字范围也有歧义；状态一致不代表整份解释无误。原参数 JSON ${data.wholeAnswerReview.originalAsReceivedJsonValid}/7 份有效，另 ${data.wholeAnswerReview.oneTrailingBraceNormalization} 份仅移除一个多余尾括号后完成语法解析，未补造字段；完整报告仍须通过引文等准入检查，其中错误引文报告已被拒绝。原答与审阅均可下载。`,
    `Previous-batch AI whole-answer source review: ${data.wholeAnswerReview.applicationWholeAnswers.accepted} accepted, ${data.wholeAnswerReview.applicationWholeAnswers.qualified} qualified, ${data.wholeAnswerReview.applicationWholeAnswers.rejected} rejected. Some multi-field conclusions still have partial displayed evidence, and dynamic-copy scope remains ambiguous. Matching statuses do not establish error-free explanations. Original argument JSON was valid in ${data.wholeAnswerReview.originalAsReceivedJsonValid}/7 reports; ${data.wholeAnswerReview.oneTrailingBraceNormalization} more parsed after removing only one orphan trailing brace, without inventing fields. Complete reports must still pass citation and other admission checks; the invalid-quotation report was rejected. Original answers and review are downloadable.`,
   )}</p>
   <dl className="benchmark-semantic"><div><dt>{tr("本组实际评估调用","Assessment calls in this set")}</dt><dd>{data.assessmentCalls}</dd></div></dl>
   {data.postModelGuard&&<p className="benchmark-note">{tr(
    `后续源码保护规则用保留的原答做零网络回放：${data.postModelGuard.reclassifiedItems} 项仅凭普通标题逗号提出的修改建议改为证据不足，等待买家确认。新增模型调用 ${data.postModelGuard.modelCalls}，网络请求 ${data.postModelGuard.networkRequests}；这是应用规则核验，不是模型准确率提升，原矩阵与原答不变。`,
    `The later source guard was checked by replaying retained answers with no network: ${data.postModelGuard.reclassifiedItems} comma-only title repair claim became insufficient evidence for buyer confirmation. Additional model calls ${data.postModelGuard.modelCalls}; network requests ${data.postModelGuard.networkRequests}. This checks application policy, not improved model accuracy; the original matrix and answers remain unchanged.`,
   )}</p>}
   <div className="benchmark-artifacts">
    <strong>{tr("下载逐批原答、冻结输入与限制","Download batch answers, frozen inputs and limits")}</strong>
    {Array.from(new Set(["summary.json",...data.artifacts])).map(file=>{
     const href=artifactUrl(file);
     const pending=pendingDownloads.includes(file);
     return href?<a className="subtle-button" key={file} href={href} download aria-busy={pending||undefined} aria-disabled={pending||undefined} aria-describedby={downloadError?downloadErrorId:undefined} onClick={event=>void downloadArtifact(event,file)}>{file}{pending?tr("（准备文件中）"," (preparing file)"):""}</a>:null;
    })}
   </div>
  </details>
  <p className="benchmark-note" role="status" aria-live="polite">{downloadStatus}</p>
  {downloadError&&<p className="benchmark-note" id={downloadErrorId} role="alert">{downloadError}</p>}
 </section>;
}
