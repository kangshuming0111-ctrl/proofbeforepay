"use client";

import { ArrowRight, FileCheck2 } from "lucide-react";
import type { Language } from "@/lib/contracts";

export function GettingStarted({language, busy, onExample, onDemo}: {language: Language; busy: boolean; onExample: () => void; onDemo: () => void}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  return <section className="getting-started" aria-label={tr("从需求到交付的使用说明", "From requirements to delivery")}>
    <span className="section-kicker">AGREE. CHECK. DECIDE.</span>
    <h3>{tr("做没做完，回到同一份要求。", "Review the delivery against what you agreed.")}</h3>
    <p>{tr("为外包网站说清标准，让卖家提交网站文件，按具体证据修改和验收。合同可选。", "Agree on an outsourced website, receive the seller’s files, then use specific evidence to revise and accept. A contract is optional.")}</p>
    <div className="handoff-example" aria-label={tr("差异示意，尚未运行检查", "Illustration only; no check has run")}>
      <div><span>{tr("买家约定", "Agreed requirement")}</span><strong>Monday to Friday, 11am–8pm</strong></div>
      <div><span>{tr("卖家交付 v1", "Seller delivery v1")}</span><strong>Monday to Friday, 10am–6pm</strong></div>
      <p><FileCheck2 size={15} aria-hidden="true"/>{tr("对照要求与来源，提出具体修改，再检查新版本。", "Compare requirements and source evidence, request a specific change, then review the revision.")}</p>
      <small>{tr("流程示意，尚未运行 AI 或规则检查。", "Workflow illustration; no AI or rule check has run.")}</small>
    </div>
    <ol className="handoff-steps"><li><b>01</b><span>{tr("买家确认要求和金额", "Buyer confirms scope and amount")}</span></li><li><b>02</b><span>{tr("卖家交付，双方核查和修改", "Seller delivers; both sides review and revise")}</span></li><li><b>03</b><span>{tr("买家验收，再单独确认测试付款", "Buyer accepts, then separately confirms test payment")}</span></li></ol>
    <div className="getting-started-actions"><button type="button" className="subtle-button" disabled={busy} onClick={onExample}>{tr("填入示例需求", "Fill example requirements")}<ArrowRight size={14}/></button><button type="button" className="text-button" disabled={busy} onClick={onDemo}>{tr("直接体验双端样板", "Try the two-sided sample")}</button></div>
  </section>;
}
