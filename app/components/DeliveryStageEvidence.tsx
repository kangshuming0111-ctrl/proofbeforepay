"use client";
import {useEffect,useRef,useState} from "react";
import type {Language,ProofQuote,ProofRole} from "@/lib/contracts";
import {DELIVERY_STAGE_REPORT_BYTE_LIMIT,validateDeliveryStageReport,type DeliveryStageReport,type DeliveryStage,type DeliveryStageStatus} from "@/lib/delivery-stage-evidence";
import {assertCooperativeStageScope,cooperativeStageContext,createCooperativeStagePlan} from "@/lib/cooperative-stage-evidence";
const names:Record<DeliveryStage,[string,string]>={submit:["1 原生提交","1 Native submission"],stored_record:["2 存储记录","2 Stored record"],fresh_readback:["3 新连接回读","3 Fresh readback"],email_receipt:["4 测试收件记录","4 Test inbox receipt"]};
const statuses:Record<DeliveryStageStatus,[string,string]>={matched:["记录相符","Records match"],mismatch:["记录不符","Records differ"],unknown:["未知／待补证","Unknown / evidence needed"],unsupported:["不支持／未适配","Unsupported / not adapted"]};
const reasons:Record<string,[string,string]>={manual_required:["此阶段需要另行人工观察。","This stage needs separate human observation."],stage_not_supported:["计划明确未适配此阶段。","The plan declares this stage unsupported."],adapter_not_supported:["适配器未提供该阶段。","The adapter did not supply this stage."],adapter_error:["适配器未完成；未保留异常正文。","The adapter did not complete; exception text is not retained."],timeout:["等待超时，外部结果未知；没有自动重试。","Timed out with an unknown external outcome; no automatic retry."],prior_result_unknown:["先前结果未知，后继阶段未运行。","A prior result was unknown; this later stage did not run."],wrong_run_or_revision:["运行标记或声明版本不符。","The run marker or declared revision differs."],submission_not_accepted:["提交未被接受或没有记录标识。","Submission was not accepted or supplied no record identity."],receipt_missing:["未找到所需测试收件记录。","The required test inbox receipt is absent."],record_missing:["未找到所需原生记录。","The required native record is absent."],payload_differs:["记录内容摘要与计划不符。","The recorded payload digest differs from the plan."],submission_not_established:["未建立本次提交对应的记录。","A record for this submission was not established."],record_identity_differs:["查询对应了另一条记录。","The query returned a different record identity."],stored_reader_unavailable:["没有可对照的原生存储读取者。","A native-store reader is unavailable for comparison."],reader_not_fresh:["回读仍声明使用原连接，不能确认新连接回读。","Readback declares the original connection; a fresh connection is not established."],cooperative_test_receipt_matches:["合作方的测试收件记录与本次记录相符；不证明外部邮箱送达。","The cooperative test receipt matches this record; external mailbox delivery is not proven."],cooperative_record_matches:["合作方报告的标识和内容摘要相符；不证明真实性。","The cooperative record identity and payload digest match; authenticity is not proven."]};
/** A local data viewer, never an adapter loader or a current-delivery verdict. */
function LocalStageEvidence({language}:{language:Language}){
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

type BoundStageProps={language:Language;quote?:ProofQuote;role?:ProofRole;enabled?:boolean;request?:<T>(path:string,method?:string,body?:unknown)=>Promise<T>;onApply?:(quote:ProofQuote,role:ProofRole)=>void;onBusy?:(busy:boolean)=>void};
export function DeliveryStageEvidence(props:BoundStageProps){
 return props.quote&&props.role&&props.request&&props.onApply?<BoundStageEvidence key={`${props.quote.id}:${props.quote.proof.delivery?.id}:${props.role}`} {...props} quote={props.quote} role={props.role} request={props.request} onApply={props.onApply}/>:<LocalStageEvidence language={props.language}/>;
}
function BoundStageEvidence({quote,role,language,enabled=true,request,onApply,onBusy}:BoundStageProps&Required<Pick<BoundStageProps,'quote'|'role'|'request'|'onApply'>>){
 const tr=(zh:string,en:string)=>language==='zh'?zh:en,delivery=quote.proof.delivery!,identity=`${quote.id}:${delivery.id}:${role}`;
 const current=useRef(identity);current.current=identity;
 const generation=useRef(0),inFlight=useRef(false);
 const [working,setWorking]=useState(false),[preview,setPreview]=useState<DeliveryStageReport>(),[matches,setMatches]=useState(false),[notice,setNotice]=useState('');
 const [criterionId,setCriterion]=useState(quote.proof.criteria[0]?.id??''),[runId,setRunId]=useState(''),[revision,setRevision]=useState(''),[payloadDigest,setDigest]=useState(''),[emailCoverage,setEmail]=useState<'adapter'|'manual'|'unsupported'>('unsupported');
 useEffect(()=>{setRunId('stage-'+crypto.randomUUID());return()=>{generation.current++;};},[]);
 const reports=delivery.cooperativeStageReports??[];
 const blocked=Boolean(quote.proof.paymentOperation||delivery.runtimeRun||delivery.journeyRun||delivery.modelRun||delivery.transferCompetitionRun||delivery.enquiryRun);
 function download(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function prepare(){
  if(inFlight.current)return;inFlight.current=true;setWorking(true);const token=++generation.current;
  try{const plan=await createCooperativeStagePlan(quote,{criterionId,runId,sourceRevision:revision,payloadDigest,emailCoverage});if(token!==generation.current||current.current!==identity)return;download('pbp-current-stage-plan.json',plan);setNotice(tr('当前要求的计划已下载。请在隔离测试站运行你审阅过的适配器，再选择报告。','Current-criterion plan downloaded. Run your reviewed adapter against isolated staging, then choose its report.'));}
  catch{if(token===generation.current)setNotice(tr('请填写运行标记、开发者声明版本和实际测试内容的64位小写SHA-256。计划不会执行测试。','Enter a run marker, developer-declared revision and the actual test payload’s 64-character lowercase SHA-256. Downloading a plan does not run a test.'));}
  finally{inFlight.current=false;if(token===generation.current)setWorking(false);}
 }
 async function choose(file?:File){
  if(inFlight.current)return;const token=++generation.current;setPreview(undefined);setMatches(false);setNotice('');if(!file)return;
  inFlight.current=true;setWorking(true);
  try{
   if(file.size>DELIVERY_STAGE_REPORT_BYTE_LIMIT)throw Error('size');
   const report=await validateDeliveryStageReport(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())));
   if(token!==generation.current||current.current!==identity)return;setPreview(report);
   let context:Awaited<ReturnType<typeof cooperativeStageContext>>;
   try{context=await cooperativeStageContext(quote);}catch{if(token===generation.current&&current.current===identity)setNotice(tr('当前交付文件尚未完整载入，无法关联这份报告。请刷新项目；预览已保留。','Current delivery files could not be loaded for this association. Refresh the project; preview retained.'));return;}
   if(token!==generation.current||current.current!==identity)return;
   try{assertCooperativeStageScope(report,context);setMatches(true);setNotice(tr('范围相符。确认后可共享保存；报告仍是合作方陈述。','Scope matches. You may explicitly share it; this remains a participant-supplied claim.'));}
   catch{if(token===generation.current)setNotice(tr('此报告属于其他项目、版本或要求，不能保存到当前交付。','This report belongs to another project, version or criterion and cannot be saved to this delivery.'));}
  }catch{if(token===generation.current)setNotice(tr('无法核对报告。请选择工具生成的完整UTF-8 JSON，最多64 KiB。','Report could not be checked. Choose complete tool-generated UTF-8 JSON, up to64 KiB.'));}
  finally{inFlight.current=false;if(token===generation.current)setWorking(false);}
 }
 async function save(){
  if(inFlight.current||!preview||!matches||!enabled||blocked)return;
  inFlight.current=true;setWorking(true);onBusy?.(true);const token=++generation.current;
  try{
   const binding=await cooperativeStageContext(quote);
   if(token!==generation.current||current.current!==identity)return;
   const result=await request<{quote:ProofQuote;role:ProofRole}>(`/api/proofs/${encodeURIComponent(quote.id)}/stage-evidence`,'POST',{deliveryId:delivery.id,deliveryDigest:binding.deliveryDigest,report:preview});
   if(token!==generation.current||current.current!==identity)return;
   onApply(result.quote,result.role);setNotice(tr('补充记录已共享保存，买卖双方可重新打开查看。验收与付款状态保持原样。','Supplemental record shared and saved for both participants to reopen. Acceptance and payment decisions are unchanged.'));
  }catch{if(token===generation.current)setNotice(tr('尚未确认保存成功。预览已保留；请刷新核对记录，处理版本变化、运行中任务或容量限制后，再明确保存。不会自动重试。','Save is not confirmed. Preview retained. Refresh to inspect records, then address version changes, active operations or limits before explicitly saving again. No automatic retry.'));}
  finally{inFlight.current=false;onBusy?.(false);if(token===generation.current)setWorking(false);}
 }
 return <details className="seller-integration-guide"><summary>{tr('共享动态检验记录（开发者）','Share dynamic-check records (developer)')}{reports.length?` · ${reports.length}/3`:''}</summary>
  <p>{tr('开发者用本地适配器分别观察提交、存储、回读和测试收件，再将报告保存到当前版本和具体要求，供买卖双方复查。','A developer observes submission, storage, fresh readback and test inbox using a local adapter, then shares its report against this version and one criterion.')}</p>
  <p className="journey-warning">{tr('合作方提供的补充记录。平台只核对范围和内部一致性，不证明后台实际执行、部署源码或邮箱送达；它不会让要求自动通过，也不会改写已冻结的验收或付款。','Participant-supplied supplemental records. The platform checks scope and internal consistency, not native execution, deployed source or email delivery. They do not pass requirements or rewrite frozen acceptance or payment.')}</p>
  <details><summary>{tr('准备当前要求的测试计划','Prepare a plan for the current criterion')}</summary>
   <label>{tr('关联验收要求','Related criterion')}<select value={criterionId} disabled={working} onChange={e=>setCriterion(e.target.value)}>{quote.proof.criteria.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
   <p>{quote.proof.criteria.find(c=>c.id===criterionId)?.source}</p>
   <label>{tr('虚构测试运行标记','Synthetic run marker')}<input value={runId} maxLength={120} disabled={working} onChange={e=>setRunId(e.target.value)}/></label>
   <label>{tr('开发者声明的代码版本','Developer-declared source revision')}<input value={revision} maxLength={120} disabled={working} onChange={e=>setRevision(e.target.value)}/></label>
   <p><small>{tr('运行标记和版本各1–120字符，首位为英文字母或数字，只可使用英文字母、数字、点、下划线、冒号和连字符；不能含空格。','Run marker and revision: 1–120 characters, starting with a letter or digit; use only letters, digits, dots, underscores, colons or hyphens, without spaces.')}</small></p>
   <label>{tr('实际测试内容的 SHA-256','Actual test payload SHA-256')}<input value={payloadDigest} maxLength={64} disabled={working} onChange={e=>setDigest(e.target.value)} spellCheck={false}/></label>
   <p><small>{tr('摘要必须由适配器对实际原生字段按约定计算；请只用虚构测试数据。代码版本是开发者声明，与当前上传文件摘要不同。','Your adapter must hash the actual native fields using its agreed encoding. Use synthetic data only. The source revision is a developer declaration, separate from the uploaded-file digest.')}</small></p>
   <label>{tr('测试收件阶段','Test inbox stage')}<select value={emailCoverage} disabled={working} onChange={e=>setEmail(e.target.value as typeof emailCoverage)}><option value="unsupported">{tr('未实现／未适配','Unsupported / not adapted')}</option><option value="manual">{tr('另行人工观察','Separate manual observation')}</option><option value="adapter">{tr('已有适配器观察','Adapter supplied')}</option></select></label>
   <button type="button" disabled={working} onClick={()=>void prepare()}>{tr('下载当前要求的计划','Download current-criterion plan')}</button>
  </details>
  <label>{tr('选择分层报告 JSON','Choose stage report JSON')}<input type="file" accept=".json,application/json" disabled={working} onChange={e=>{const f=e.target.files?.[0];e.target.value='';void choose(f);}}/></label>
  {notice&&<p role="status">{notice}</p>}{working&&<p role="status">{tr('正在处理…','Working…')}</p>}
  {preview&&<section aria-label={tr('待保存的合作方报告','Participant report preview')}><p>{tr(`相符 ${preview.summary.matched}，不符 ${preview.summary.mismatch}，未知 ${preview.summary.unknown}，未适配 ${preview.summary.unsupported}`,`${preview.summary.matched} match, ${preview.summary.mismatch} differ, ${preview.summary.unknown} unknown, ${preview.summary.unsupported} unsupported`)}</p><p>{preview.plan.scope.requirement}</p><ol>{preview.rows.map(row=><li key={row.stage}>{tr(...names[row.stage])}: {tr(...statuses[row.status])}</li>)}</ol><button type="button" disabled={!enabled||working||!matches||blocked} onClick={()=>void save()}>{tr('共享保存这份补充记录','Share and save supplemental record')}</button></section>}
  {blocked&&<p role="status">{tr('当前任务结束后才能保存新的补充记录。','Finish the current operation before saving new supplemental records.')}</p>}
  {reports.length>0&&<section aria-label={tr('已共享的补充记录','Shared supplemental records')}>{reports.map(row=><details key={row.id}><summary>{row.report.plan.scope.requirement} · {tr(row.reportedByRole==='seller'?'卖家提交':'买家提交',row.reportedByRole==='seller'?'Submitted by seller':'Submitted by buyer')}</summary><p>{row.receivedAt}</p><ol>{row.report.rows.map(r=><li key={r.stage}>{tr(...names[r.stage])}: {tr(...statuses[r.status])}</li>)}</ol><p><small>{tr('当前文件关联和合作方陈述，不是独立执行证明，也未被补记为原验收证据。','Current-file association and participant claim, not independent execution evidence or a retrospective acceptance record.')}</small></p><button type="button" onClick={()=>download('pbp-shared-stage-report.json',row.report)}>{tr('下载原始报告','Download original report')}</button></details>)}</section>}
  <p><small>{tr('每版最多3份、合计96 KiB；达到上限会拒绝新增并保留原记录。','Up to3 reports and96 KiB combined per version. At the limit, new records are refused and existing records retained.')}</small></p>
  <p><a href="https://github.com/kangshuming0111-ctrl/proofbeforepay/tree/codex/public-release/examples/delivery-stage-staging" target="_blank" rel="noreferrer">{tr('取得适配器工具和示例','Get adapter tools and examples')}</a></p>
 </details>;
}
