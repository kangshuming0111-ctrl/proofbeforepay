"use client";
import {useEffect,useRef,useState} from "react";
import type {Language,ProofQuote,ProofRole} from "@/lib/contracts";
import {JOURNEY_STEP_IDS} from "@/lib/journey-checks";
import {evaluateStoredProjectJourneyReport,type ProjectJourneyEvaluation,type ProjectJourneyDecision,type ProjectJourneyPlan,type ProjectJourneyReport,type ProjectJourneyRun} from "@/lib/project-journey";
import {projectJourneyStepLabel,projectJourneyUnavailableLabel,draftProjectJourneyFeedback} from "@/lib/project-journey-display";
import {projectJourneyCommand} from "@/lib/project-journey-actions";
import type {JourneyPlanSuggestions,JourneyPlanCapability} from "@/lib/journey-plan-suggestions";
import type {SellerBridgeActionId} from "@/lib/seller-journey-bridge";
import {createSellerJourneyDriver,type SellerJourneyDriver} from "@/lib/seller-journey-driver";
import "../project-journey.css";

type State={plan:ProjectJourneyPlan|null;agreement:string;targets:{id:string;label:string;registrationRevision:string;expiresAt:string}[];run:ProjectJourneyRun|null;report:ProjectJourneyReport|null;evaluation:ProjectJourneyEvaluation|null};
type Result={quote:ProofQuote;role:ProofRole;journey:State};
type Request=<T>(path:string,method?:string,body?:unknown)=>Promise<T>;
export function ProjectJourneyPanel({quote,role,language,enabled,request,onApply,onBusy,onDecision,onFeedback}:{quote:ProofQuote;role:ProofRole;language:Language;enabled:boolean;request:Request;onApply:(quote:ProofQuote,role:ProofRole)=>void;onBusy:(busy:boolean)=>void;onDecision:(decision:ProjectJourneyDecision|undefined)=>void;onFeedback?:(comment:string)=>void}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en,delivery=quote.proof.delivery!;
 const path=`/api/proofs/${encodeURIComponent(quote.id)}/journey-checks`;
 const [state,setState]=useState<State>(),[target,setTarget]=useState(""),[consent,setConsent]=useState(false),[running,setRunning]=useState(false),[frameReady,setFrameReady]=useState(false),[error,setError]=useState(""),[progress,setProgress]=useState(0),[ack,setAck]=useState(false),[ackReportId,setAckReportId]=useState<string>(),[acknowledged,setAcknowledged]=useState<string[]>([]),[reason,setReason]=useState(""),[aiConsent,setAiConsent]=useState(false),[suggestions,setSuggestions]=useState<JourneyPlanSuggestions>();
 const frame=useRef<HTMLIFrameElement>(null),driver=useRef<SellerJourneyDriver|undefined>(undefined),cancelled=useRef(false),alive=useRef(true);
 const report=delivery.journeyReport;
 let evaluation:ProjectJourneyEvaluation|undefined;try{evaluation=report?evaluateStoredProjectJourneyReport(report):undefined;}catch{/* The server rejects invalid binding; retain a visible missing-result state. */}
 const exceptions=evaluation?.steps.filter(step=>step.outcome!=="observed")??[];
 const exceptionSignature=exceptions.map(step=>step.id).join(","),evaluationValid=!!evaluation;
 useEffect(()=>{alive.current=true;let active=true;request<State>(path).then(value=>{if(active){setState(value);setTarget(old=>value.targets.some(t=>t.id===old)?old:value.targets[0]?.id??"");}}).catch(cause=>{if(active)setError(String(cause instanceof Error?cause.message:cause));});return()=>{active=false;alive.current=false;cancelled.current=true;driver.current?.dispose();};},[path,delivery.id,role]);
 useEffect(()=>{setAck(false);setAckReportId(undefined);setAcknowledged([]);setReason("");onDecision(undefined);},[report?.id,delivery.id]);
 useEffect(()=>{onDecision(report&&evaluationValid&&ack&&ackReportId===report.id&&(!exceptions.length||exceptions.every(step=>acknowledged.includes(step.id))&&reason.trim().length>=10)?{reportId:report.id,acknowledgeClientObservation:true,acknowledgedSteps:exceptions.filter(step=>acknowledged.includes(step.id)).map(step=>step.id),...(exceptions.length?{exceptionReason:reason.trim()}:{})}:undefined);},[report?.id,delivery.id,evaluationValid,exceptionSignature,ack,ackReportId,acknowledged.join(","),reason]);
 async function post(input:Record<string,unknown>){const result=await request<Result>(path,"POST",{deliveryId:delivery.id,...input});if(alive.current){setState(result.journey);onApply(result.quote,result.role);}return result.journey;}
 async function adopt(){setError("");onBusy(true);try{await post({action:"confirm-plan",confirm:true});setConsent(false);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{onBusy(false);}}
 async function abort(){cancelled.current=true;driver.current?.dispose();if(!running&&state?.run){onBusy(true);try{await post({action:"abort",runId:state.run.id});}catch(cause){setError(String(cause instanceof Error?cause.message:cause));}finally{onBusy(false);}}}
 async function start(){
  if(!consent||!target||!frame.current)return;
  setError("");setProgress(0);setFrameReady(false);setRunning(true);onBusy(true);cancelled.current=false;setConsent(false);let run:ProjectJourneyRun|undefined;
  try{
   const started=await post({action:"start",previousReportId:report?.id??null,targetId:target,confirm:true});run=started.run??undefined;
   if(!run)throw new Error("The server did not return a saved journey ticket.");
   const url=new URL(run.registration.frontendEntryUrl);
   driver.current=createSellerJourneyDriver({frame:frame.current!,frontendEntryUrl:url.href,allowedOrigin:url.origin,runId:run.id});
   const ready=await driver.current.connect();
   if(ready.backendBasePath!==new URL(run.registration.backendBaseUrl).pathname)throw new Error("The seller page’s declared backend differs from its approved registration.");
   setFrameReady(true);
   for(let index=run.observations.length;index<JOURNEY_STEP_IDS.length;index++){
    if(cancelled.current)break;
    setProgress(index);const command=projectJourneyCommand(run,JOURNEY_STEP_IDS[index]);
    const reading=command?await driver.current.perform({sequence:run.observations.filter(o=>o.ui).length+1,actionId:JOURNEY_STEP_IDS[index] as SellerBridgeActionId,action:command}):undefined;
    const next=await post({action:"observe",runId:run.id,stepId:JOURNEY_STEP_IDS[index],...(reading?{ui:reading.ui,requests:reading.requests}:{})});
    run=next.run??undefined;if(!run)throw new Error("The saved run was not returned. Reload before continuing.");
   }
   await post({action:cancelled.current?"abort":"finish",runId:run.id});setProgress(JOURNEY_STEP_IDS.length);
  }catch(cause){
   setError(cause instanceof Error?cause.message:String(cause));
   // Never retry an unknown write. The explicit abort only saves available
   // evidence and marks the remaining checks unavailable; it is not rollback.
   if(run&&alive.current){try{await post({action:"abort",runId:run.id});}catch{/* Pending ticket remains visible for explicit recovery. */}}
  }finally{driver.current?.dispose();driver.current=undefined;setRunning(false);onBusy(false);}
 }
 async function suggest(){onBusy(true);setError("");try{setSuggestions((await request<{suggestions:JourneyPlanSuggestions}>(`/api/proofs/${encodeURIComponent(quote.id)}/journey-plan-suggestions`,"POST",{confirm:true,language})).suggestions);setAiConsent(false);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{onBusy(false);}}
 const capabilityLabel=(value:JourneyPlanCapability)=>({max_party_size:tr("每笔预约人数上限","Party size limit"),slot_capacity:tr("时段总容量","Slot capacity"),cancellation_once:tr("取消只释放一次容量","One-time cancellation release"),atomic_reschedule:tr("原子改期与失败保留原单","Atomic move and original-booking preservation"),same_key_retry:tr("先查单，再用原键重试","Read before original-key retry")})[value];
 return <details className="project-journey" id="project-journey" open={!!delivery.journeyPlan||running}>
  <summary><span>{tr("本版本的业务旅程验收","Business journey for this delivery")}</span><b>{running?`${progress}/20`:evaluation?`${evaluation.summary.observed}/20`:tr("可选","Optional")}</b></summary>
  <p>{tr("针对已登记的独立测试站，实际操作卖家表单，并由主站服务器逐步读取预约、收据和容量。结果会保存到本交付版本。","Operate the registered seller staging form, with step-by-step server readbacks of bookings, receipts and occupancy. Results are retained for this delivery.")}</p>
  <details><summary>{tr("检验范围和双方约定","Coverage and technical agreement")}</summary><p>{tr("预约人数上限 6、时段容量 8；取消只释放一次容量；重复取消无副作用；失败改期保留原单；成功改期原子更新；模拟提交后 504，先查询再原键重试；最后核对商家账目与容量。这是单独采纳的技术约定，不冒充原始合同条款。","Party limit 6 and slot capacity 8; one-time capacity release on cancellation; harmless repeat cancellation; failed move preserves the booking; atomic successful move; a controlled post-commit 504, independent lookup, then original-key retry; final merchant/occupancy reconciliation. This is a separately adopted technical agreement, not an inferred contract clause.")}</p><p>{tr("仅用随机编号和虚构资料。浏览器记录由客户端提供；服务器读取的是卖家接口，二者一致也不证明数据库诚实、线上源码来源或整站没有缺陷。测试不代表接受交付，也不触发付款。","Uses random identifiers and fictional data only. Browser observations are client supplied; the server reads seller endpoints. Agreement does not prove database honesty, deployed-source provenance or absence of all bugs. Testing neither accepts delivery nor triggers payment.")}</p></details>
  {error&&<p className="journey-warning" role="alert">{error}</p>}
  {!delivery.journeyPlan&&role==="buyer"&&<><label><input type="checkbox" checked={consent} disabled={!enabled} onChange={e=>setConsent(e.target.checked)}/>{tr("我明确采纳上述可选技术检查约定。","I explicitly adopt the optional technical agreement above.")}</label><button className="button primary" disabled={!enabled||!consent} onClick={adopt}>{tr("为本版本确认检查约定","Confirm agreement for this delivery")}</button></>}
  {!delivery.journeyPlan&&role!=="buyer"&&<p>{tr("只有买家可以采纳这份附加约定。","Only the buyer can adopt this additional agreement.")}</p>}
  <details><summary>{tr("让 AI 对照客户原文建议检查能力","Ask AI to map the original brief to supported checks")}</summary><label><input type="checkbox" checked={aiConsent} disabled={!enabled||role!=="buyer"} onChange={e=>setAiConsent(e.target.checked)}/>{tr("允许发送已纳入范围的需求原文给 DeepSeek；不会发送交付文件、支付或账号资料。","Allow included requirement text to be sent to DeepSeek, without delivery files, payment or account details.")}</label><button className="subtle-button" disabled={!enabled||!aiConsent||role!=="buyer"} onClick={suggest}>{tr("生成建议（不自动采纳）","Generate suggestions — review required")}</button>{suggestions&&<div className="journey-suggestions"><p>{tr("DeepSeek 已返回建议，尚未采纳或执行。请对照每条原文。","DeepSeek returned suggestions; none are adopted or executed. Compare each with the original clause.")}</p>{suggestions.candidates.map(candidate=><blockquote key={candidate.id}><strong>{capabilityLabel(candidate.capability)}{candidate.value!==undefined?`: ${candidate.value}`:""}</strong><p>{candidate.source.excerpt}</p></blockquote>)}{suggestions.unresolved.length>0&&<><strong>{tr("需要澄清或尚不支持的要求","Needs clarification or unsupported")}</strong>{suggestions.unresolved.map((item,index)=><p key={index}>{item.source.excerpt}<br/><small>{item.reason}</small></p>)}</>}<p>{suggestions.recipeSuggestion?tr("原文包含当前固定配方需要的能力。仍需买家阅读并单独确认上方技术约定。","The original clauses support the current fixed recipe’s capabilities. The buyer must still read and separately confirm the technical agreement above."):tr("当前建议不足以完整覆盖 20 步配方，不能把部分能力当作全部需求已覆盖。","These suggestions do not fully cover the 20-step recipe; partial matches are not complete requirement coverage.")}</p></div>}</details>
  {delivery.journeyPlan&&<>
   {state?.targets.length?<label>{tr("已登记测试站","Registered staging target")}<select value={target} disabled={!enabled||running||!!state?.run} onChange={e=>{setTarget(e.target.value);setConsent(false);}}>{state.targets.map(t=><option value={t.id} key={t.id}>{t.label}</option>)}</select></label>:<p className="journey-warning">{tr("当前文件摘要还没有获准的测试站。卖家需要提供专用虚构数据部署，由运营方登记；不能粘贴任意网址或把实验室报告当成本项目通过。","No approved staging target matches this upload digest. The seller needs a dedicated synthetic-data deployment and operator registration. Arbitrary URLs and public-lab reports cannot stand in for this delivery.")}</p>}
   {!state?.run&&<><label><input type="checkbox" checked={consent} disabled={!enabled||!target} onChange={e=>setConsent(e.target.checked)}/>{tr("允许本次合成预约、取消、改期及一次明确的原键重试。停止不会撤销已写入的测试记录。","Allow synthetic booking, cancellation, move and one explicit original-key retry. Stopping does not roll back prior test writes.")}</label><button className="button primary" disabled={!enabled||!target||!consent} onClick={start}>{tr("开始本版本的 20 步检验","Run this delivery’s 20-step journey")}</button></>}
   {(running||state?.run)&&<div role="status"><p>{tr("正在逐步保存观测","Saving each observation")}: {running?progress:state?.run?.observations.length}/20 {running&&progress<20?`· ${projectJourneyStepLabel(JOURNEY_STEP_IDS[progress],language)}`:""}</p><button className="subtle-button" onClick={abort}>{running?tr("停止后续操作并保存未知结果","Stop further actions and retain unknowns"):tr("关闭中断的运行并保存已有证据","Close interrupted run and retain available evidence")}</button></div>}
   {running&&!frameReady&&<p role="status">{tr("正在连接本次登记测试站…","Connecting to this run’s registered staging site…")}</p>}
   <iframe ref={frame} className="seller-journey-frame" title={tr("登记卖家测试站","Registered seller staging site")} hidden={!running||!frameReady}/>
  </>}
  {report&&evaluation&&<>
   <p className="journey-saved-target">{tr("已保存报告的测试站","Saved report target")}: <strong>{report.registration.label}</strong> · {report.receivedAt.slice(0,19).replace("T"," ")} UTC</p>
   <p className={exceptions.length?"journey-warning":"journey-result"}>{tr(`20 步：${evaluation.summary.observed} 项观测支持，${evaluation.summary.issues} 项不符，${evaluation.summary.unavailable} 项未知。`,`20 steps: ${evaluation.summary.observed} supported, ${evaluation.summary.issues} mismatched, ${evaluation.summary.unavailable} unavailable.`)}</p>
   <details><summary>{tr("逐项证据与版本绑定","Step evidence and version binding")}</summary><p><code>{report.deliveryId}</code><br/><code>{report.deliveryDigest}</code><br/>{report.registration.label} · {report.registration.registrationRevision}</p><ol>{evaluation.steps.map(step=><li key={step.id}><strong>{projectJourneyStepLabel(step.id,language)} · {step.outcome==="observed"?tr("观测支持","Supported"):step.outcome==="mismatch"?tr("不符","Mismatch"):tr("未确定","Unavailable")}</strong>{step.outcome==="unavailable"&&<p>{projectJourneyUnavailableLabel(report.input.observations.find(o=>o.id===step.id)?.unavailableReason??step.reason,language)}</p>}<details><summary>{tr("预期、实际与原始观测","Expected, actual and raw observations")}</summary><p>{step.expected}</p><pre>{step.actual??step.reason??"—"}</pre></details></li>)}</ol></details>
   {onFeedback&&exceptions.length>0&&<button className="subtle-button" onClick={()=>onFeedback(draftProjectJourneyFeedback(report,language))}>{tr("把问题带入修改意见","Prepare change request from findings")}</button>}
   {role==="buyer"&&<fieldset disabled={!enabled}><legend>{tr("接受交付前的独立决定","Separate decision before acceptance")}</legend><label><input type="checkbox" checked={ack&&ackReportId===report.id} onChange={e=>{setAck(e.target.checked);setAckReportId(e.target.checked?report.id:undefined);}}/>{tr("我知道浏览器记录属于客户端观测，不是独立审计；我已检查本版本证据。","I reviewed this delivery’s evidence and understand client browser records are not an independent audit.")}</label>{exceptions.length>0&&<><p>{tr("逐项复核不符或未知结果","Review each mismatched or unknown result")}: {exceptions.filter(step=>acknowledged.includes(step.id)).length}/{exceptions.length}</p><div className="journey-exception-list">{exceptions.map(step=><label key={step.id}><input type="checkbox" checked={acknowledged.includes(step.id)} onChange={e=>setAcknowledged(current=>e.target.checked?[...current.filter(id=>id!==step.id),step.id]:current.filter(id=>id!==step.id))}/><span>{projectJourneyStepLabel(step.id,language)} · {step.outcome==="mismatch"?tr("不符","Mismatch"):tr("未确定","Unavailable")}</span></label>)}</div><textarea value={reason} maxLength={500} minLength={10} onChange={e=>setReason(e.target.value)} aria-label={tr("旅程例外原因","Journey exception reason")} placeholder={tr("说明为何仍接受（10–500 字符）；或先要求卖家修复。","Explain acceptance despite these exceptions (10–500 characters), or request repairs first.")}/></>}</fieldset>}
  </>}
 </details>;
}
