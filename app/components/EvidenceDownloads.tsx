"use client";

import {useRef} from "react";
import {ArrowDownToLine,ShieldCheck} from "lucide-react";
import type {Language,ProofQuote} from "@/lib/contracts";
import {createEvidenceExport} from "@/lib/evidence-export";

export function EvidenceDownloads({quote,language,busy,onExport,onRaw}:{quote:ProofQuote|null;language:Language;busy:boolean;onExport:(task:()=>Promise<void>)=>Promise<void>;onRaw:()=>void}){
  const menu=useRef<HTMLDetailsElement>(null),tr=(zh:string,en:string)=>language==="zh"?zh:en;
  async function download(){
    if(!quote||busy)return;
    const selected=quote;
    await onExport(async()=>{
      const envelope=await createEvidenceExport(selected);
      const url=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:"application/json"}));
      try{const anchor=document.createElement("a");anchor.href=url;anchor.download=`${selected.reference}-verifiable-evidence.json`;anchor.click();}
      finally{URL.revokeObjectURL(url);}
      if(menu.current)menu.current.open=false;
    });
  }
  return <details className="evidence-download" ref={menu}>
    <summary aria-label={tr("导出交付证据","Export delivery evidence")}><ArrowDownToLine size={15}/><span>{tr("导出","Export")}</span></summary>
    <div className="evidence-download-menu">
      <button type="button" disabled={!quote?.proof.delivery?.files||busy} onClick={download}><ShieldCheck size={15}/>{tr("下载可离线核对的证据包","Download offline-checkable evidence")}</button>
      <p>{tr("包含原始要求、当前交付文件和证据关联；不导出账户成员与付款记录字段。离线工具可核对一致性，不能证明签发真实性、实际调用或付款。","Includes original requirements, current files and evidence references, omitting account-member and payment-record fields. The offline tool checks consistency, not authentic issuance, actual execution or payment.")}</p>
      <button type="button" disabled={!quote||busy} onClick={()=>{if(menu.current)menu.current.open=false;onRaw();}}>{tr("下载原始项目记录 JSON","Download raw project record JSON")}</button>
      <p>{tr("保留原有项目和付款状态字段；这是原始记录，未按离线证据格式核对。","Retains the original project and payment-state fields. This raw record is not checked against the offline evidence format.")}</p>
    </div>
  </details>;
}
