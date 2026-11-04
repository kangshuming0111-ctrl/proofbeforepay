"use client";
import {useEffect,useRef,useState} from "react";
import type {Language,ProofRole} from "@/lib/contracts";
import {JOURNEY_INTEGRATION_TEMPLATE,parseJourneyIntegrationManifest,type JourneyIntegrationPreflight} from "@/lib/journey-integration-preflight";
import {JOURNEY_SCENARIOS,type JourneyScenario} from "@/lib/journey-checks";
import type {IntegrationStatus,SellerIntegrationRequest} from "@/lib/seller-integration";

type Request=<T>(path:string,method?:string,body?:unknown)=>Promise<T>;
type Application=SellerIntegrationRequest&{stale:boolean;expired:boolean};
type View={requests:Application[];currentDeliveryId:string|null;currentDeliveryDigest:string|null;canSubmit:boolean;canReview:boolean;canDelegate:boolean;reviewers:{key:string;label:string}[];requestLimit:number};
type Props={language:Language;projectId:string;deliveryId:string;role:ProofRole;enabled:boolean;request:Request;onChanged?:()=>void|Promise<void>};
const stamp=(value:string)=>value.slice(0,19).replace("T"," ")+" UTC";
const initialText=()=>JSON.stringify(JOURNEY_INTEGRATION_TEMPLATE,null,2);

/** Manifest checks stay local. Only explicit submission persists a declaration;
 * server-derived permissions and a separate operator decision govern targets. */
export function SellerIntegrationGuide({language,projectId,deliveryId,role,enabled,request,onChanged}:Props){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 const identity=`${projectId}:${deliveryId}:${role}`,path=`/api/proofs/${encodeURIComponent(projectId)}/integration-requests`;
 const [text,setText]=useState(initialText),[result,setResult]=useState<JourneyIntegrationPreflight>(),[previousId,setPreviousId]=useState<string>();
 const [saved,setSaved]=useState<{identity:string;view:View}>(),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const epoch=useRef(0),lock=useRef(false),currentIdentity=useRef(identity);currentIdentity.current=identity;
 const view=saved?.identity===identity?saved.view:undefined;
 useEffect(()=>{
  const token=++epoch.current;let active=true;lock.current=false;setBusy(false);setLoading(true);setSaved(undefined);setError("");setNotice("");setPreviousId(undefined);setText(initialText());setResult(undefined);
  request<View>(path).then(value=>{if(active&&epoch.current===token&&currentIdentity.current===identity)setSaved({identity,view:value});}).catch(cause=>{if(active&&epoch.current===token)setError(cause instanceof Error?cause.message:String(cause));}).finally(()=>{if(active&&epoch.current===token)setLoading(false);});
  return()=>{active=false;};
 },[identity,path]);
 async function refresh(){
  if(lock.current)return;const token=++epoch.current;setLoading(true);setError("");
  try{const value=await request<View>(path);if(token===epoch.current&&currentIdentity.current===identity)setSaved({identity,view:value});}catch(cause){if(token===epoch.current)setError(cause instanceof Error?cause.message:String(cause));}finally{if(token===epoch.current)setLoading(false);}
 }
 async function post(input:Record<string,unknown>){
  if(lock.current||!enabled||!view)return;lock.current=true;setBusy(true);setError("");setNotice("");const token=++epoch.current;
  try{
   const value=await request<View>(path,"POST",input);
   if(token===epoch.current&&currentIdentity.current===identity){setSaved({identity,view:value});setPreviousId(undefined);setNotice(tr("申请状态已保存，刷新后仍可查看。审批不会运行测试、接受交付或付款。其他检验面板可点击“刷新项目”更新目标。","The application state is saved and survives refresh. Reviewing does not run tests, accept delivery or pay. Use Refresh project to update targets in other check panels."));try{await onChanged?.();}catch{if(token===epoch.current)setError(tr("申请已保存，但目标列表未能刷新。请点击“刷新项目”读取最新登记。","The application was saved, but targets could not be refreshed. Use Refresh project to load the current registration."));}}
  }catch(cause){if(token===epoch.current&&currentIdentity.current===identity)setError(cause instanceof Error?cause.message:String(cause));}finally{if(token===epoch.current&&currentIdentity.current===identity){lock.current=false;setBusy(false);setLoading(false);}}
 }
 async function submit(){
  const checked=parseJourneyIntegrationManifest(text);setResult(checked);if(!checked.canRequestRegistration)return;
  try{const manifest:unknown=JSON.parse(text);await post({action:"submit",deliveryId,manifest,...(previousId?{previousRequestId:previousId}:{})});}catch{setError(tr("请选择完整、有效的清单 JSON。","Use complete, valid manifest JSON."));}
 }
 function edit(item:Application){setText(JSON.stringify(item.manifest,null,2));setPreviousId(item.id);setResult(undefined);setNotice(tr("已载入待修改清单。编辑、检查后再提交；原申请保留。","The manifest is loaded for revision. Edit, check, then submit; the previous application remains retained."));}
 function download(){const url=URL.createObjectURL(new Blob([text],{type:"application/json"})),link=document.createElement("a");link.href=url;link.download="proofbeforepay-staging-manifest.json";link.click();URL.revokeObjectURL(url);}
 const status=(value:IntegrationStatus)=>({requested:tr("等待审核","Awaiting review"),needs_changes:tr("需要补充／修改","Changes requested"),rejected:tr("未批准／已撤销","Declined / revoked"),approved:tr("登记已批准","Registration approved")})[value];
 return <details className="seller-integration-guide"><summary>{tr("卖家接入申请与登记","Seller integration applications")}{view&&<small> · {view.requests.length}/{view.requestLimit}</small>}</summary>
  <p>{tr("卖家提交独立测试站清单，运营方审核后才会出现在本交付版本的测试目标中。使用虚构资料，保留每次申请与决定。","The seller submits a separate staging manifest. After operator review, its target becomes available for this delivery. Use fictional data; each application and decision is retained.")}</p>
  <div className="integration-list-heading"><strong>{tr("本项目的申请","Project applications")}</strong><button className="subtle-button" disabled={busy||loading} onClick={()=>void refresh()}>{tr("刷新申请","Refresh applications")}</button></div>
  {loading&&<p role="status">{tr("正在读取已保存的申请…","Loading saved applications…")}</p>}
  {error&&<p role="alert" className="journey-warning">{error}</p>}
  {notice&&<p role="status" className="journey-result">{notice}</p>}
  {view&&<>
   {!view.requests.length&&<p className="integration-empty">{tr("还没有接入申请。卖家可在下方准备并提交清单。","No integration application yet. The seller can prepare and submit a manifest below.")}</p>}
   {view.requests.map(item=><details className="integration-application" key={`${item.id}:${item.revision}`}><summary><span>{item.registration?.label??item.manifest.native.stack}</span><strong>{status(item.status)}</strong>{item.stale&&<b>{tr("旧交付版本","Earlier delivery")}</b>}{item.expired&&<b>{tr("批准已过期","Approval expired")}</b>}</summary>
    <p>{tr("提交：","Submitted: ")}{stamp(item.submittedAt)} · {tr("决定版本","Decision revision")} {item.revision}</p>
    <dl className="integration-bindings"><div><dt>{tr("交付版本","Delivery")}</dt><dd><code>{item.deliveryId}</code></dd></div><div><dt>{tr("文件摘要","File digest")}</dt><dd><code>{item.deliveryDigest}</code></dd></div><div><dt>{tr("清单摘要","Manifest digest")}</dt><dd><code>{item.manifestDigest}</code></dd></div></dl>
    <p className="integration-endpoints"><strong>{tr("卖家声明的测试站","Seller-declared staging")}</strong><br/><code>{item.manifest.deployment.frontendEntryUrl}</code><br/><code>{item.manifest.deployment.backendBaseUrl}</code></p>
    {item.registration&&<p>{tr("批准窗口截止：","Approval expires: ")}{stamp(item.registration.expiresAt)} · {tr("登记修订：","Registration revision: ")}{item.registration.registrationRevision}</p>}
    <ol className="integration-events">{item.history.map(event=><li key={event.revision}><strong>{status(event.status)}</strong> · {stamp(event.at)}{event.reason&&<p>{event.reason}</p>}</li>)}</ol>
    <details><summary>{tr("查看已提交的清单","Inspect submitted manifest")}</summary><pre>{JSON.stringify(item.manifest,null,2)}</pre></details>
    {view.canDelegate&&<ReviewSharing item={item} hasOtherPending={view.requests.some(row=>row.id!==item.id&&row.status==="requested"&&row.delegation?.active!==false&&row.deliveryId===item.deliveryId&&row.deliveryDigest===item.deliveryDigest)} reviewers={view.reviewers} language={language} disabled={!enabled||busy} onSubmit={post}/>}
    {item.delegation&&!item.delegation.active&&<p className="journey-warning">{tr("买家已撤回审核访问；此申请的登记不能用于新的测试，历史记录保留。","The buyer withdrew review access. This application cannot authorize new tests; history remains retained.")}</p>}
    {role==="seller"&&(["needs_changes","rejected"].includes(item.status)||item.delegation?.active===false)&&view.canSubmit&&<button className="subtle-button" disabled={!enabled||busy} onClick={()=>edit(item)}>{tr("载入修改并重新申请","Revise and resubmit")}</button>}
    {view.canReview&&(item.status==="requested"||item.status==="approved")&&<OperatorDecision item={item} language={language} disabled={!enabled||busy} onSubmit={post}/>}
   </details>)}
   {role!=="seller"&&!view.canReview&&<p className="integration-muted">{tr("你可以选择平台审核人并授权其查看这份测试站清单。授权后，对方在独立审核队列处理；你仍单独决定验收和付款。","Choose a platform reviewer and explicitly share this staging application. They review it in a separate queue; acceptance and payment remain your decisions.")}</p>}
   {role==="seller"&&<details className="integration-editor" open={!view.requests.length||!!previousId}><summary>{previousId?tr("修改后重新申请","Submit a revised application"):tr("准备新的接入申请","Prepare an application")}</summary>
    <p>{tr("准备只含虚构数据的独立测试部署，填写原生字段映射和地址。清单应说明你有权进行测试；不填写密码、API key 或真实客户资料。","Prepare a separate synthetic-data staging deployment and fill in native mappings and addresses. Describe an authorized test target; exclude passwords, API keys and real customer data.")}</p>
    {previousId&&<p>{tr("原申请：","Previous application: ")}<code>{previousId}</code></p>}
    <label className="integration-text-label">{tr("测试站接入清单 JSON","Staging integration manifest JSON")}<textarea value={text} maxLength={16384} rows={8} spellCheck={false} disabled={busy||!enabled} onChange={e=>{setText(e.target.value);setResult(undefined);}}/></label>
    <div className="journey-integration-actions"><button className="subtle-button" disabled={busy} onClick={()=>setResult(parseJourneyIntegrationManifest(text))}>{tr("检查接入清单","Check integration manifest")}</button><button className="subtle-button" disabled={busy} onClick={download}>{tr("下载清单","Download manifest")}</button><button className="subtle-button" disabled={busy} onClick={()=>{setText(initialText());setResult(undefined);setPreviousId(undefined);}}>{tr("恢复模板","Reset template")}</button></div>
    {result&&<div role="status"><strong>{result.canRequestRegistration?tr("本地检查完成，可提交审核","Local checks complete; ready for review"):tr("先修正以下接入问题","Fix these integration issues first")}</strong><ul>{result.checks.map(check=><li key={check.id}><strong>{check.status==="error"?tr("需修正","Fix"):check.status==="warning"?tr("注意","Note"):tr("配置有效","Valid")}</strong>: {language==="zh"?check.messageZh:check.message}</li>)}</ul></div>}
    <button className="button primary" disabled={!enabled||busy||loading||!view.canSubmit||!result?.canRequestRegistration||view.currentDeliveryId!==deliveryId} onClick={()=>void submit()}>{busy?tr("正在保存…","Saving…"):tr("提交接入申请","Submit staging application")}</button>
    {!view.canSubmit&&<p className="integration-muted">{view.requests.length>=view.requestLimit?tr("本项目已达到保留申请上限，旧记录不会被删除。","This project reached its retained application limit. Previous records are preserved."):tr("当前版本已有待审申请，或暂不允许提交。刷新查看最新状态。","This delivery already has a pending application, or submission is unavailable. Refresh for the current state.")}</p>}
    <p><small>{tr("检查清单只在浏览器内解析；点击提交后才保存到本项目。提交和批准均不会访问测试站、证明部署源码、运行业务测试、验收或付款。","Checking parses the manifest locally; Submit explicitly saves it to this project. Submission and approval do not fetch the target, attest deployed source, run business tests, accept work or pay.")}</small></p>
   </details>}
  </>}
  <p className="integration-muted"><a href="/operator">{tr("平台审核工作台","Platform review workspace")}</a> · {tr("审核人只能看到买家明确授权的测试站清单；不能查看合同、源码、金额或操作验收和付款。","Reviewers see only buyer-shared staging applications, with no contract, source, price, acceptance or payment access.")}</p>
 </details>;
}

function ReviewSharing({item,hasOtherPending,reviewers,language,disabled,onSubmit}:{item:Application;hasOtherPending:boolean;reviewers:{key:string;label:string}[];language:Language;disabled:boolean;onSubmit:(input:Record<string,unknown>)=>Promise<void>}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;const[key,setKey]=useState(reviewers[0]?.key??""),[confirmed,setConfirmed]=useState(false);
 const active=item.delegation?.active;
 return <details className="integration-review"><summary>{active?tr("已交给平台审核／撤回访问","Shared for platform review / withdraw access"):tr("请平台审核这份申请","Request platform review")}</summary>
  {active?<p>{tr("指定审核人可在独立队列查看此申请，买卖双方可刷新本页查看决定。撤回后对方不再能读取或审核，此登记也不能用于新的测试；历史决定不删除。","The assigned reviewer can inspect this application in a separate queue. Refresh here for their decision. Withdrawal removes reviewer access and future testing admission; earlier decisions remain retained.")}</p>:<><p>{tr("仅分享本申请的测试站地址、字段映射、交付与清单摘要及审核记录。不会分享合同、交付源码、客户身份、金额或支付资料。审核人不能接受交付或付款。","Share only this application's staging URLs, field mappings, delivery/manifest digests and review history. Contracts, source files, client identity, price and payment details stay private. The reviewer cannot accept work or pay.")}</p><label className="integration-text-label">{tr("指定平台审核人","Assigned platform reviewer")}<select value={key} disabled={disabled||!reviewers.length} onChange={e=>{setKey(e.target.value);setConfirmed(false);}}>{reviewers.map((row,index)=><option key={row.key} value={row.key}>{tr(`平台审核人 ${index+1}`,row.label)}</option>)}</select></label>{!reviewers.length&&<p className="journey-warning">{tr("当前没有可用的独立审核人。请联系网站运营方配置审核账号；卖家不能自审。","No independent reviewer is configured. Contact the site operator to configure a reviewer account; the seller cannot self-approve.")}</p>}</>}
  <label><input type="checkbox" checked={confirmed} disabled={disabled} onChange={e=>setConfirmed(e.target.checked)}/>{active?tr("确认撤回审核访问及后续测试许可。","Withdraw reviewer access and future testing admission."):tr("确认将上述有限资料分享给所选审核人。","Share the limited metadata above with this reviewer.")}</label>
  <button className={active?"subtle-button":"button primary"} disabled={disabled||!confirmed||!active&&(!key||item.status!=="requested"||item.stale||hasOtherPending||(item.delegation?.events.length??0)>=8)} onClick={()=>void onSubmit({action:active?"revoke-review":"grant-review",requestId:item.id,expectedRevision:item.revision,expectedDelegationRevision:item.delegation?.revision??0,reviewerKey:active?null:key,confirm:true})}>{active?tr("撤回审核访问","Withdraw review access"):tr("交给所选平台审核人","Share with assigned reviewer")}</button>
  {!active&&(hasOtherPending||(item.delegation?.events.length??0)>=8)&&<p>{tr("请使用卖家的新申请继续审核；同一交付只允许一份有效待审申请。旧审核访问记录保留。","Continue with the seller’s new application. Only one active pending application is allowed per delivery; earlier access history remains retained.")}</p>}
  {!active&&item.status!=="requested"&&<p>{tr("只有待审申请可交给审核人。请卖家按当前交付重新申请。","Only pending applications can be shared. Ask the seller to submit a new application for the current delivery.")}</p>}
 </details>;
}

export function OperatorDecision({item,language,disabled,onSubmit}:{item:Pick<Application,"id"|"revision"|"status"|"registration"|"manifest"|"stale">;language:Language;disabled:boolean;onSubmit:(input:Record<string,unknown>)=>Promise<void>}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 const [reason,setReason]=useState(""),[label,setLabel]=useState(item.registration?.label??`${item.manifest.native.stack} staging`),[scenario,setScenario]=useState<JourneyScenario>(item.registration?.scenario??"fixed"),[expires,setExpires]=useState(()=>new Date(Date.now()+7*24*60*60*1000).toISOString().slice(0,16)),[confirm,setConfirm]=useState(false);
 function decide(status:"needs_changes"|"rejected"|"approved"){
  if(disabled||reason.trim().length<10||status==="approved"&&(!confirm||item.stale))return;
  void onSubmit({action:"review",requestId:item.id,expectedRevision:item.revision,status,reason:reason.trim(),...(status==="approved"?{approval:{label:label.trim(),scenario,expiresAt:new Date(`${expires}:00.000Z`).toISOString()}}:{})});
 }
 return <fieldset className="integration-review" disabled={disabled}><legend>{tr("运营方审核","Operator review")}</legend>
  <label className="integration-text-label">{tr("审核原因（10–500 字符）","Review reason (10–500 characters)")}<textarea value={reason} minLength={10} maxLength={500} rows={2} onChange={e=>setReason(e.target.value)}/></label>
  {item.status==="requested"&&<>
   <details><summary>{tr("核对批准范围","Review approval scope")}</summary>
    <label className="integration-text-label">{tr("测试目标名称","Target label")}<input value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/></label>
    <label className="integration-text-label">{tr("批准截止时间（UTC）","Approval expiry (UTC)")}<input type="datetime-local" value={expires} onChange={e=>setExpires(e.target.value)}/></label>
    <label className="integration-text-label">{tr("声明的测试配置","Declared test profile")}<select value={scenario} onChange={e=>setScenario(e.target.value as JourneyScenario)}>{JOURNEY_SCENARIOS.map(value=><option value={value} key={value}>{value==="fixed"?tr("标准动作协议（fixed）","Standard actions (fixed)"):value}</option>)}</select></label>
    <p><small>{tr("配置名称不是检测结论。批准只登记声明与测试窗口，最多 30 天。","The profile name is not a test result. Approval registers the declaration and a window of at most 30 days.")}</small></p>
   </details>
   <label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/>{tr("我已核对测试授权、虚构数据范围、当前文件摘要及声明地址。","I reviewed test authorization, synthetic-data scope, current file digest and declared addresses.")}</label>
   {item.stale&&<p className="journey-warning">{tr("该申请属于旧交付，不能批准；请要求卖家用当前版本重新申请。","This application belongs to an earlier delivery and cannot be approved. Ask the seller to apply for the current version.")}</p>}
  </>}
  <div className="journey-integration-actions">{item.status==="requested"&&<><button className="button primary" disabled={disabled||reason.trim().length<10||!confirm||item.stale||!label.trim()||!expires||!Number.isFinite(Date.parse(`${expires}:00.000Z`))} onClick={()=>decide("approved")}>{tr("批准登记","Approve registration")}</button><button className="subtle-button" disabled={disabled||reason.trim().length<10} onClick={()=>decide("needs_changes")}>{tr("要求补充资料","Request changes")}</button></>}<button className="subtle-button" disabled={disabled||reason.trim().length<10} onClick={()=>decide("rejected")}>{item.status==="approved"?tr("撤销后续测试权限","Revoke future test access"):tr("不批准此申请","Decline application")}</button></div>
 </fieldset>;
}
