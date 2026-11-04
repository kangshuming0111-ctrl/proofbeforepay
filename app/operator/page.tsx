"use client";
import {useEffect,useRef,useState} from "react";
import type {Language} from "@/lib/contracts";
import type {IntegrationOperatorItem} from "@/lib/integration-operator-store";
import {OperatorDecision} from "@/app/components/SellerIntegrationGuide";
import "../project-journey.css";
import "./operator.css";
type Queue={items:IntegrationOperatorItem[];nextCursor:string|null};
async function api<T>(path:string,method="GET",value?:unknown):Promise<T>{const response=await fetch(path,{method,credentials:"same-origin",headers:value?{"Content-Type":"application/json"}:undefined,...(value?{body:JSON.stringify(value)}:{})});const result=await response.json()as Record<string,unknown>;if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Unable to load staging review.");return result as T;}
export default function OperatorWorkspace(){
 const[language,setLanguage]=useState<Language>("zh"),[queue,setQueue]=useState<Queue>(),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");const lock=useRef(false);
 const tr=(zh:string,en:string)=>language==="zh"?zh:en;
 async function load(cursor?:string){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{const value=await api<Queue>(`/api/operator/integrations${cursor?`?cursor=${encodeURIComponent(cursor)}`:""}`);setQueue(previous=>cursor&&previous?{items:[...previous.items,...value.items],nextCursor:value.nextCursor}:value);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{lock.current=false;setBusy(false);}}
 useEffect(()=>{void load();},[]);
 async function decide(item:IntegrationOperatorItem,input:Record<string,unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");try{const value=await api<IntegrationOperatorItem>(`/api/operator/integrations/${encodeURIComponent(item.id)}`,"POST",{...input,expectedDelegationRevision:item.delegationRevision});setQueue(previous=>previous?{...previous,items:previous.items.map(row=>row.id===value.id?value:row)}:previous);setNotice(tr("审核决定已保存。买卖双方刷新申请即可查看；未运行测试、验收或付款。","Review saved. Project participants can refresh to read it; no tests, acceptance or payment were executed."));}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{lock.current=false;setBusy(false);}}
 const status=(value:string)=>({requested:tr("等待审核","Awaiting review"),approved:tr("登记已批准","Registration approved"),needs_changes:tr("需要补充资料","Changes requested"),rejected:tr("未批准／已撤销","Declined / revoked")})[value]??value;
 return <main className="operator-workspace project-journey"><header><a href="/">ProofBeforePay</a><button className="subtle-button" onClick={()=>setLanguage(language==="zh"?"en":"zh")}>{language==="zh"?"EN":"中文"}</button></header>
  <h1>{tr("平台接入审核","Staging integration reviews")}</h1><p>{tr("这里仅显示买家明确交给本账号的测试站申请。你可以核对测试授权、字段映射与版本摘要，再批准或要求补充。","Only staging applications explicitly assigned by their buyer to this account appear here. Review test authorization, native mappings and version digests before approving or requesting changes.")}</p>
  <p className="operator-scope">{tr("这不是项目成员权限：合同、源码、客户身份、价格与付款资料不在此队列中。批准只登记测试范围；买家另行验收和付款。","This does not grant project membership. Contracts, source, client identity, prices and payment details are excluded. Approval registers test scope; the buyer separately accepts and pays.")}</p>
  <div className="integration-list-heading"><strong>{tr("分配给我的申请","Assigned to me")}</strong><button className="subtle-button" disabled={busy} onClick={()=>void load()}>{tr("刷新队列","Refresh queue")}</button></div>
  {busy&&<p role="status">{tr("正在保存或读取…","Saving or loading…")}</p>}{error&&<p role="alert" className="journey-warning">{error}</p>}{notice&&<p role="status" className="journey-result">{notice}</p>}
  {queue?.items.length===0&&<p>{tr("目前没有分配给你的申请。请让项目买家在“卖家接入申请与登记”中选择你并明确授权；查看项目或提交申请不会自动分享。","No applications are assigned. Ask the project buyer to choose you and explicitly share the staging application. Viewing a project or submitting a manifest does not automatically share it.")}</p>}
  {queue?.items.map(item=><details className="integration-application" key={`${item.id}:${item.revision}:${item.delegationRevision}`}><summary><span>{item.registration?.label??item.manifest.native.stack}</span><strong>{status(item.status)}</strong>{item.stale&&<b>{tr("旧交付，不能批准","Earlier delivery; cannot approve")}</b>}{item.expired&&<b>{tr("已过期","Expired")}</b>}</summary>
   <dl className="integration-bindings"><div><dt>{tr("项目标识","Project ID")}</dt><dd><code>{item.projectId}</code></dd></div><div><dt>{tr("交付版本","Delivery ID")}</dt><dd><code>{item.deliveryId}</code></dd></div><div><dt>{tr("交付摘要","Delivery digest")}</dt><dd><code>{item.deliveryDigest}</code></dd></div><div><dt>{tr("清单摘要","Manifest digest")}</dt><dd><code>{item.manifestDigest}</code></dd></div></dl>
   <p className="integration-endpoints">{tr("声明的测试站地址（不会自动访问）","Declared staging addresses (not automatically opened)")}<br/><code>{item.manifest.deployment.frontendEntryUrl}</code><br/><code>{item.manifest.deployment.backendBaseUrl}</code></p>
   <details><summary>{tr("查看获授权的接入清单","Inspect shared staging manifest")}</summary><pre>{JSON.stringify(item.manifest,null,2)}</pre></details><ol className="integration-events">{item.history.map(event=><li key={event.revision}>{status(event.status)} · {event.at}{event.reason&&<p>{event.reason}</p>}</li>)}</ol>
   {(item.status==="requested"||item.status==="approved")&&<OperatorDecision item={item} language={language} disabled={busy} onSubmit={input=>decide(item,input)}/>}<p><small>{tr("决定会关联以上交付和清单摘要。若买家撤回授权、卖家换版或申请变更，请刷新后重新核对。","The decision binds the delivery and manifest digests above. Refresh if access is withdrawn, files are replaced or the application changes.")}</small></p>
  </details>)}
  {queue?.nextCursor&&<button className="subtle-button" disabled={busy} onClick={()=>void load(queue.nextCursor!)}>{tr("读取更多申请","Load more applications")}</button>}
 </main>;
}
