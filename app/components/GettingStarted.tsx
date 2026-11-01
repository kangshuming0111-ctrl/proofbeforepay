"use client";

import { ArrowRight, FileCheck2 } from "lucide-react";
import type { Language } from "@/lib/contracts";
import "../welcome.css";

export function GettingStarted({language, busy, onStart, onExample, onDemo}: {language: Language; busy: boolean; onStart: () => void; onExample: () => void; onDemo: () => void}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  return <section className="getting-started welcome" aria-label={tr("从需求到交付的使用说明", "From requirements to delivery")}>
    <div className="welcome-copy">
      <h2 id="welcome-introduction" tabIndex={-1}>{tr("交付哪里没做到，回到同一份证据。", "See what changed before you accept the work.")}</h2>
      <p>{tr("为花店、餐厅等小商家和网站开发者，把约定、交付与修改放在一起核对。卖家提供文件，买家查看证据，再决定接受哪一版。合同可选。", "For small businesses and website developers: compare the agreement, delivered files and revisions in one place. The seller delivers; the buyer checks the evidence and decides which version to accept. A contract is optional.")}</p>
      <div className="welcome-actions">
        <button type="button" className="button primary" disabled={busy} onClick={onDemo}>{tr("体验交付与修改流程", "Try a sample handoff")}<ArrowRight size={16} aria-hidden="true"/></button>
        <button type="button" className="subtle-button" disabled={busy} onClick={onStart}>{tr("填写自己的项目要求", "Enter my requirements")}</button>
      </div>
      <small className="welcome-action-note">{tr("体验会创建虚构样板项目，付款使用模拟模式；AI 只在你另行点击时运行。", "The sample creates a fictional project with simulated payment. AI runs only when you separately request it.")}</small>
      <details className="welcome-scope"><summary>{tr("当前可以检查哪些交付？", "What deliveries can I check?")}</summary><p>{tr("静态网站文件夹：HTML、CSS 和本地 PNG/JPEG/WebP。源码、实际浏览器观察和人工判断分别记录；脚本、表单后台及邮件送达不在静态检查范围内。", "Static website folders with HTML, CSS and local PNG/JPEG/WebP images. Source checks, browser observations and human decisions are separate records. Static checks do not run scripts, form backends or email delivery.")}</p><button type="button" className="text-button" disabled={busy} onClick={onExample}>{tr("用示例需求开始填写", "Start with example requirements")}<ArrowRight size={13} aria-hidden="true"/></button></details>
    </div>
    <div className="welcome-evidence" aria-label={tr("差异示意，尚未运行检查", "Illustration only; no check has run")}>
      <p className="welcome-illustration-note">{tr("流程示意 · 尚未运行检查", "Workflow illustration · no checks have run")}</p>
      <ol className="welcome-records">
        <li><span>{tr("买家约定", "Agreed requirement")}</span><strong>Monday to Friday, 11am–8pm</strong></li>
        <li className="welcome-mismatch"><span>{tr("第一次交付的页面原文", "First delivery’s page copy")}</span><strong>Monday to Friday, 10am–6pm</strong><p>{tr("对照原文，提出具体修改。", "Compare the source and request a specific change.")}</p></li>
        <li><span>{tr("修改后的页面原文", "Revised page copy")}</span><strong>Monday to Friday, 11am–8pm</strong></li>
      </ol>
      <p className="welcome-decision"><FileCheck2 size={18} aria-hidden="true"/>{tr("新版本不自动算通过。买家核对变化、明确验收，再单独确认测试付款。", "A revision does not pass automatically. The buyer checks the changes, explicitly accepts a version, then separately confirms test payment.")}</p>
    </div>
  </section>;
}
