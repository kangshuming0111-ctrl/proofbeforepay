"use client";

import { ArrowRight, FileCheck2 } from "lucide-react";
import type { Language } from "@/lib/contracts";
import "../welcome.css";
import {RUNTIME_LAB_ORIGIN} from "@/lib/runtime-project";

export function GettingStarted({language, busy, onStart, onExample, onDemo}: {language: Language; busy: boolean; onStart: () => void; onExample: () => void; onDemo: () => void}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  return <section className="getting-started welcome" aria-label={tr("从需求到交付的使用说明", "From requirements to delivery")}>
    <div className="welcome-copy">
      <h2 id="welcome-introduction" tabIndex={-1}>{tr("看清网站交付的差异，再决定验收。", "Know what was delivered before you pay.")}</h2>
      <p>{tr("为跨国外包网站的小商家与开发者：买家确认要求，卖家提交网站。按需用 AI 整理检查项、给出带源码引用的评审建议。你核对具体差异，接受明确的一版，再单独确认付款。合同可选。", "For small businesses hiring website developers across borders. Agree on requirements, then review the seller’s files. Use AI when needed to draft checks and suggest changes with source citations. Inspect the differences, accept an exact version, and confirm payment separately. A contract is optional.")}</p>
      <div className="welcome-actions">
        <button type="button" className="button primary" disabled={busy} onClick={onDemo}>{tr("体验交付与修改流程", "Try a sample handoff")}<ArrowRight size={16} aria-hidden="true"/></button>
        <button type="button" className="subtle-button" disabled={busy} onClick={onStart}>{tr("填写自己的项目要求", "Enter my requirements")}</button>
      </div>
      <small className="welcome-action-note">{tr("体验会创建虚构样板项目，付款使用模拟模式；AI 只在你另行点击时运行。", "The sample creates a fictional project with simulated payment. AI runs only when you separately request it.")}</small>
      <a className="text-button welcome-example" href={RUNTIME_LAB_ORIGIN} target="_blank" rel="noreferrer">{tr("免账号体验：检查价格与预约后端","No-account lab: prices and booking backend")}<ArrowRight size={13} aria-hidden="true"/></a>
      <a className="text-button welcome-example" href={`${RUNTIME_LAB_ORIGIN}/journeys.html`} target="_blank" rel="noreferrer">{tr("流程实验：表单提交、取消、改期与重试","Journey lab: submit, cancel, reschedule and retry")}<ArrowRight size={13} aria-hidden="true"/></a>
      <button type="button" className="text-button welcome-example" disabled={busy} onClick={onExample}>{tr("用这份面馆需求开始填写", "Start with these noodle-shop requirements")}<ArrowRight size={13} aria-hidden="true"/></button>
      <details className="welcome-scope"><summary>{tr("当前可以检查哪些交付？", "What deliveries can I check?")}</summary><p>{tr("静态网站文件夹：HTML、CSS 和本地 PNG/JPEG/WebP。源码、实际浏览器观察和人工判断分别记录；脚本、表单后台及邮件送达不在静态检查范围内。", "Static website folders with HTML, CSS and local PNG/JPEG/WebP images. Source checks, browser observations and human decisions are separate records. Static checks do not run scripts, form backends or email delivery.")}</p></details>
    </div>
    <div className="welcome-evidence" aria-label={tr("差异示意，尚未运行检查", "Illustration only; no check has run")}>
      <p className="welcome-illustration-note">{tr("流程示意 · 尚未运行检查", "Workflow illustration · no checks have run")}</p>
      <ol className="welcome-records">
        <li><span>{tr("同一份约定", "One agreed requirement")}</span><strong>{tr("中文菜单 · 牛肉面 AUD 18", "Chinese menu · 牛肉面 AUD 18")}</strong></li>
        <li className="welcome-mismatch"><span>{tr("第一次交付", "First delivery")}</span><strong>{tr("牛肉面 AUD 28", "牛肉面 AUD 28")}</strong><p>{tr("把价格差异连回原始要求，起草具体修改意见。", "Link the price difference to the original requirement and draft precise feedback.")}</p></li>
        <li><span>{tr("修改版 · 仍需买家核对", "Revised delivery · buyer review required")}</span><strong>{tr("牛肉面 AUD 18", "牛肉面 AUD 18")}</strong></li>
      </ol>
      <p className="welcome-decision"><FileCheck2 size={18} aria-hidden="true"/>{tr("新版本不自动算通过。买家核对变化、明确验收，再单独确认测试付款。", "A revision does not pass automatically. The buyer checks the changes, explicitly accepts a version, then separately confirms test payment.")}</p>
    </div>
  </section>;
}
