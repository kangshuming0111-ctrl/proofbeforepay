"use client";

import { ArrowRight, ChevronDown, FileCheck2 } from "lucide-react";
import { useId, useState } from "react";
import type { Language } from "@/lib/contracts";
import "../welcome.css";
import {RUNTIME_LAB_ORIGIN} from "@/lib/runtime-project";

export type GettingStartedProps = {language: Language; busy: boolean; onStart: () => void; onExample: () => void; onDemo: () => void; onFlorist: () => void; resumeProject?: {title: string; status: string; onOpen: () => void}};

export function GettingStarted({language, busy, onStart, onExample, onDemo, onFlorist, resumeProject}: GettingStartedProps) {
  const [illustrationExpanded, setIllustrationExpanded] = useState(false);
  const illustrationId = useId();
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const resume = resumeProject && typeof resumeProject.title === "string" && typeof resumeProject.status === "string" && typeof resumeProject.onOpen === "function" ? resumeProject : undefined;
  const demoNote = tr("卖家网站已备好。案例使用虚构资料和模拟付款。AI 评估需要你另行点击。", "The seller’s site is ready. The example uses fictional data and simulated payment. AI assessment runs only when you request it.");
  return <section className="getting-started welcome" aria-label={tr("从需求到交付的使用说明", "From requirements to delivery")}>
    <div className="welcome-copy">
      <h2 id="welcome-introduction" tabIndex={-1}>{tr("看清网站交付的差异，再决定验收。", "Know what was delivered before you pay.")}</h2>
      <p>{tr("买家确认要求，卖家提交网站；买家查看差异、提出修改，再决定是否验收。合同可选。", "Buyers confirm requirements; sellers submit website files. Review the differences, request changes and decide whether to accept. A contract is optional.")}</p>
      {resume && <div className="welcome-resume" aria-label={tr("可继续的项目", "Project you can continue")}><strong>{resume.title}</strong><span>{resume.status}</span></div>}
      <div className="welcome-actions">
        <button type="button" className="button primary" disabled={busy} onClick={resume ? resume.onOpen : onDemo}>{resume ? tr("打开这个项目", "Open this project") : tr("直接体验面馆验收", "Try the noodle-shop delivery")}<ArrowRight size={16} aria-hidden="true"/></button>
        <button type="button" className="subtle-button" disabled={busy} onClick={onStart}>{tr("填写我的项目要求", "Enter my requirements")}</button>
      </div>
      {resume ? <div className="welcome-new-example">
        <button type="button" className="text-button welcome-example" disabled={busy} onClick={onDemo}>{tr("直接体验面馆验收", "Try the noodle-shop delivery")}<ArrowRight size={13} aria-hidden="true"/></button>
        <small className="welcome-action-note">{demoNote}</small>
      </div> : <small className="welcome-action-note">{demoNote}</small>}
      <details className="welcome-more">
        <summary>{tr("更多案例与工具", "More examples and tools")}</summary>
        <div className="welcome-more-content">
          <a className="text-button welcome-example" href="/judge.html">{tr("评委入口：演示、源码与证据", "Judge start: demo, source and evidence")}<ArrowRight size={13} aria-hidden="true"/></a>
          <button type="button" className="text-button welcome-example" disabled={busy} onClick={onFlorist}>{tr("直接体验花店验收", "Try the florist delivery")}<ArrowRight size={13} aria-hidden="true"/></button>
          <a className="text-button welcome-example" href={RUNTIME_LAB_ORIGIN} target="_blank" rel="noreferrer">{tr("预约人数和时段容量案例（免账号）","Booking party size and slot capacity examples")}<ArrowRight size={13} aria-hidden="true"/></a>
          <small>{tr("进入后在「HTTP 深度检查」选择「每笔人数规则」或「同一时段总容量」。两版测试接口已备好。", "Under HTTP checks, choose the party-size rule or total slot capacity. Both test versions are ready.")}</small>
          <a className="text-button welcome-example" href={`${RUNTIME_LAB_ORIGIN}/journey.html`} target="_blank" rel="noreferrer">{tr("打开示范预约网页","Open the example booking website")}<ArrowRight size={13} aria-hidden="true"/></a>
          <a className="text-button welcome-example" href={`${RUNTIME_LAB_ORIGIN}/journeys.html`} target="_blank" rel="noreferrer">{tr("体验预约、取消和改期（免账号）","Try booking, cancellation and rescheduling")}<ArrowRight size={13} aria-hidden="true"/></a>
          <button type="button" className="text-button welcome-example" disabled={busy} onClick={onExample}>{tr("只复制面馆需求文字", "Copy the noodle-shop brief")}<ArrowRight size={13} aria-hidden="true"/></button>
        </div>
      </details>
      <details className="welcome-scope"><summary>{tr("当前可以检查哪些交付？", "What deliveries can I check?")}</summary><p>{tr("静态网站文件夹：HTML、CSS 和本地 PNG/JPEG/WebP。源码、实际浏览器观察和人工判断分别记录；脚本、表单后台及邮件送达不在静态检查范围内。", "Static website folders with HTML, CSS and local PNG/JPEG/WebP images. Source checks, browser observations and human decisions are separate records. Static checks do not run scripts, form backends or email delivery.")}</p></details>
    </div>
    <div className="welcome-evidence" data-expanded={illustrationExpanded} aria-label={tr("差异示意，尚未运行检查", "Illustration only; no check has run")}>
      <button type="button" className="welcome-illustration-toggle" aria-expanded={illustrationExpanded} aria-controls={illustrationId} onClick={() => setIllustrationExpanded(value => !value)}>
        {illustrationExpanded ? tr("收起流程示意", "Hide the workflow illustration") : tr("查看流程示意", "See the workflow illustration")}<ChevronDown size={16} aria-hidden="true" />
      </button>
      <div className="welcome-illustration-content" id={illustrationId}>
      <p className="welcome-illustration-note">{tr("流程示意 · 尚未运行检查", "Workflow illustration · no checks have run")}</p>
      <ol className="welcome-records">
        <li><span>{tr("买家想要", "What the buyer asked for")}</span><strong>{tr("「牛肉面请标 18 澳元。」", "‘Please list beef noodles at AUD 18.’")}</strong></li>
        <li className="welcome-mismatch"><span>{tr("第一次交付", "First delivery")}</span><strong>{tr("菜单上写的是 28 澳元", "The menu says AUD 28")}</strong><p>{tr("价格不对，请卖家改成 18 澳元。", "The price is wrong. Ask the seller to change it to AUD 18.")}</p></li>
        <li><span>{tr("卖家改完后", "After the seller’s changes")}</span><strong>{tr("菜单写对了，买家再核对", "The menu now says AUD 18. The buyer checks it.")}</strong></li>
      </ol>
      <p className="welcome-decision"><FileCheck2 size={18} aria-hidden="true"/>{tr("新版本不自动算通过。买家核对变化、明确验收，再单独确认测试付款。", "A revision does not pass automatically. The buyer checks the changes, explicitly accepts a version, then separately confirms test payment.")}</p>
      </div>
    </div>
  </section>;
}
