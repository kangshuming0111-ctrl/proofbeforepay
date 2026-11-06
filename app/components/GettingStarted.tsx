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
      <p>{tr("买家确认要求，卖家提交网站；买家查看差异、提出修改，再决定是否验收。合同可选。", "Buyers confirm requirements; sellers submit website files. Review the differences, request changes and decide whether to accept. A contract is optional.")}</p>
      <div className="welcome-actions">
        <button type="button" className="button primary" disabled={busy} onClick={onDemo}>{tr("先体验一个完整例子", "Try a complete example")}<ArrowRight size={16} aria-hidden="true"/></button>
        <button type="button" className="subtle-button" disabled={busy} onClick={onStart}>{tr("填写我的项目要求", "Enter my requirements")}</button>
      </div>
      <small className="welcome-action-note">{tr("例子使用虚构项目和模拟付款。AI 评估需要你另行点击。", "The example uses a fictional project and simulated payment. AI assessment runs only when you request it.")}</small>
      <details className="welcome-more">
        <summary>{tr("更多示例与开发者工具", "More examples and developer tools")}</summary>
        <div className="welcome-more-content">
          <a className="text-button welcome-example" href={RUNTIME_LAB_ORIGIN} target="_blank" rel="noreferrer">{tr("免账号体验：检查价格与预约后端","No-account lab: prices and booking backend")}<ArrowRight size={13} aria-hidden="true"/></a>
          <a className="text-button welcome-example" href={`${RUNTIME_LAB_ORIGIN}/journeys.html`} target="_blank" rel="noreferrer">{tr("流程实验：表单提交、取消、改期与重试","Journey lab: submit, cancel, reschedule and retry")}<ArrowRight size={13} aria-hidden="true"/></a>
          <button type="button" className="text-button welcome-example" disabled={busy} onClick={onExample}>{tr("用这份面馆需求开始填写", "Start with these noodle-shop requirements")}<ArrowRight size={13} aria-hidden="true"/></button>
        </div>
      </details>
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
