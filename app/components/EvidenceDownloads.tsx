"use client";

import {useRef} from "react";
import {ArrowDownToLine,ShieldCheck} from "lucide-react";
import type {Language,ProofQuote} from "@/lib/contracts";
import {verifyEvidenceBundle} from "@/lib/evidence-bundle";
import {verifyIssuedRevisionAudit} from "@/lib/issued-revision-audit";

export function EvidenceDownloads({quote,language,busy,onExport,onRaw,request}:{quote:ProofQuote|null;language:Language;busy:boolean;onExport:(task:()=>Promise<void>)=>Promise<void>;onRaw:()=>void;request:(path:string)=>Promise<unknown>}){
  const menu=useRef<HTMLDetailsElement>(null),tr=(zh:string,en:string)=>language==="zh"?zh:en;
  async function download(){
    if(!quote||busy)return;
    const selected=quote;
    await onExport(async()=>{
      const envelope=await request(`/api/proofs/${selected.id}/evidence-bundle`);
      const verification=await verifyEvidenceBundle(envelope);
      if(verification.consistency!=="consistent")throw new Error(tr("证据在下载时未能完整核对，请刷新后重试。没有省略失败的报告。","The complete evidence could not be checked during download. Refresh and retry; failed reports were not omitted."));
      const url=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:"application/json"}));
      try{const anchor=document.createElement("a");anchor.href=url;anchor.download=`${selected.reference}-verifiable-evidence.json`;anchor.click();}
      finally{URL.revokeObjectURL(url);}
      if(menu.current)menu.current.open=false;
    });
  }
  async function downloadRevisions(){
    if(!quote||busy)return;
    const selected=quote;
    await onExport(async()=>{
      const envelope=await request(`/api/proofs/${selected.id}/revision-audit`);
      const verification=await verifyIssuedRevisionAudit(envelope);
      if(verification.consistency!=="consistent")throw new Error(tr("前后两版证据未能完整核对，请刷新检查保存的版本；没有补造或略过旧版。","The selected revision evidence could not be checked. Refresh and inspect the retained versions; none were reconstructed or omitted."));
      const url=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:"application/json"}));
      try{const anchor=document.createElement("a");anchor.href=url;anchor.download=`${selected.reference}-revision-audit.json`;anchor.click();}
      finally{URL.revokeObjectURL(url);}
      if(menu.current)menu.current.open=false;
    });
  }
  return <details className="evidence-download" ref={menu}>
    <summary aria-label={tr("导出交付证据","Export delivery evidence")}><ArrowDownToLine size={15}/><span>{tr("导出","Export")}</span></summary>
    <div className="evidence-download-menu">
      <button type="button" disabled={!quote?.proof.delivery?.files||busy} onClick={download}><ShieldCheck size={15}/>{tr("下载可离线核对的证据包","Download offline-checkable evidence")}</button>
      <p>{tr("由服务器整理原始要求、当前交付文件、可见性／部署字节／时间规则报告，以及冻结验收引用；总计最多 8 MiB，超限会报错。成员身份和付款记录字段不进入此包。离线核对不证明真实性、实际调用或付款。","The server assembles original requirements, current files, visibility/deployment-byte/time-policy reports and frozen acceptance references. Maximum 8 MiB; oversized exports fail explicitly. Member identities and payment-record fields are omitted. Offline consistency does not prove authenticity, execution or payment.")}</p>
      <button type="button" disabled={!quote?.proof.delivery?.files||(quote.proof.delivery.sequence??1)<2||busy} onClick={downloadRevisions}><ShieldCheck size={15}/>{tr("下载前后两版审计包","Download the last two revisions")}</button>
      <p>{tr("包含当前与上一版源码并重算变化；最多 8 MiB。旧版只含留存的核心报告，缺失历史会报错。签发记录不证明网站合格或付款。","Complete current and previous source with recomputed changes; maximum 8 MiB. Earlier revisions contain retained core reports only; missing history fails explicitly. Issuance does not prove website correctness or payment.")}</p>
      <button type="button" disabled={!quote||busy} onClick={()=>{if(menu.current)menu.current.open=false;onRaw();}}>{tr("下载原始项目记录 JSON","Download raw project record JSON")}</button>
      <p>{tr("保留原有项目和付款状态字段；这是原始记录，未按离线证据格式核对。","Retains the original project and payment-state fields. This raw record is not checked against the offline evidence format.")}</p>
    </div>
  </details>;
}
