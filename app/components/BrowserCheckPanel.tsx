"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, MousePointer2, Square } from "lucide-react";
import type { Language, ProofBrowserCheckReason, ProofBrowserCheckReport } from "@/lib/contracts";

type Props = {language: Language; report?: ProofBrowserCheckReport; enabled: boolean; busy: boolean; progress?: {done: number; total: number}; onRun: () => void; onCancel: () => void; readOnly?: boolean};
const reasons: Record<ProofBrowserCheckReason, [string,string]> = {
  missing_file: ["所需页面未交付", "A required page was not delivered"],
  load_failed: ["页面或必要样式加载失败", "A page or required style could not load"],
  snapshot_mismatch: ["响应与保存版本不一致", "The response did not match the saved version"],
  access_denied: ["浏览器无法读取此预览", "The browser could not read this preview"],
  timeout: ["本次操作超时", "This observation timed out"],
  navigation_changed: ["页面离开了约定目标", "The page left the expected destination"],
  ambiguous_link: ["链接文字或目标不唯一／未找到", "The link label or target was missing or ambiguous"],
  unsupported_target: ["链接不是约定的当前版本本地目标", "The link was not the agreed local target in this version"],
  resource_limit: ["页面资源过多，本次未覆盖", "The page exceeded this check's resource limit"],
};
export function BrowserCheckPanel({language, report, enabled, busy, progress, onRun, onCancel, readOnly = false}: Props) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const details = useRef<HTMLDetailsElement>(null);
  const [initiallyExpanded] = useState(() => !report);
  useEffect(() => {if (busy && details.current) details.current.open = true;}, [busy]);
  return <details ref={details} className="browser-check-panel" open={initiallyExpanded}>
    <summary><span><MousePointer2 size={16} aria-hidden="true"/>{tr("链接行为与资源检查", "Link behavior & resource checks")}</span><span>{busy ? tr("检查中", "Checking") : report ? tr(`已观察 ${report.summary.observed} 项 · ${report.summary.issues} 项需核对 · ${report.summary.unavailable} 项未验证`, `${report.summary.observed} observed · ${report.summary.issues} need review · ${report.summary.unavailable} unverified`) : tr("尚未运行", "Not run")}</span><ChevronDown size={15} aria-hidden="true"/></summary>
    <div className="browser-check-body">
      <p>{tr("在 375px、900px 静态预览中实际激活约定链接，核对是否到达目标、目标是否可见，并检查样式和页面图片预载解码。", "Activates the agreed link in 375px and 900px static previews, observes its destination and target visibility, and checks styles and preloaded page-image decoding.")}</p>
      {!readOnly && <div className="browser-check-actions">
        <button type="button" className="button primary" onClick={onRun} disabled={!enabled || busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <MousePointer2 size={15}/>} {busy ? tr("正在检查当前版本…", "Checking this version…") : report ? tr("重新检查当前版本", "Check this version again") : tr("检查当前版本的链接和资源", "Check this version's links & resources")}</button>
        {busy && <button type="button" className="subtle-button" onClick={onCancel}><Square size={13}/>{tr("取消", "Cancel")}</button>}
      </div>}
      {busy && <div role="status" aria-live="polite"><span>{tr(`已检查 ${progress?.done ?? 0} / ${progress?.total ?? "…"}`, `Checked ${progress?.done ?? 0} / ${progress?.total ?? "…"}`)}</span><progress max={progress?.total ?? 1} value={progress?.done}/></div>}
      {busy && report && <p className="browser-check-origin">{tr("正在重新检查；下方仍是上次保存的观察，当前进度尚未形成新报告。", "Re-checking; the observations below are from the previous saved run. Current progress is not yet a new report.")}</p>}
      {report && <>
        <p className="browser-check-origin">{tr("最近一次观察的发起身份", "Latest observation reported by")}: {report.reportedByRole === "buyer" ? tr("买家", "Buyer") : report.reportedByRole === "seller" ? tr("卖家", "Seller") : tr("旧记录未注明", "Not recorded in this earlier report")}</p>
        <p className="browser-check-origin">{tr("服务器接收时间", "Received by server")}: <time dateTime={report.receivedAt}>{new Date(report.receivedAt).toISOString().slice(0,19).replace("T"," ")} UTC</time></p>
        <ul className="browser-check-readings">{report.readings.map(reading => <li key={reading.stepId} className={`browser-check-${reading.outcome}`}>
          <div><strong>{reading.kind === "link" ? tr("约定链接行为", "Agreed link behavior") : tr("页面样式和图片", "Page styles & images")}</strong><span>{reading.file} · {reading.viewportWidth}px</span></div>
          {reading.kind === "link" && <p>{reading.label} → {reading.target}</p>}
          {reading.status === "unavailable" ? <p>{tr("未验证", "Unverified")}: {tr(...(reasons[reading.reason] ?? reasons.load_failed))}</p>
            : reading.kind === "page" ? <p>{tr(`样式加载 ${reading.stylesLoaded}/${reading.stylesExpected}，页面图片解码 ${reading.imagesLoaded}/${reading.imagesExpected}。`, `Styles loaded ${reading.stylesLoaded}/${reading.stylesExpected}; page images decoded ${reading.imagesLoaded}/${reading.imagesExpected}.`)}</p>
            : <p>{tr("链接可见", "Link visible")} {reading.sourceVisible ? "✓" : "×"} · {tr("无遮挡采样点", "Uncovered sample point")} {reading.sourceHitTarget ? "✓" : "×"} · {tr("已激活", "Activated")} {reading.activated ? "✓" : "×"} · {tr("到达约定目标", "Expected destination")} {reading.destinationMatched ? "✓" : "×"} · {tr("目标可见", "Target visible")} {reading.targetVisible ? "✓" : "×"}</p>}
          <small>{reading.outcome === "expected_observation" ? tr("本次观察符合此步骤预期", "This observation matched the planned step") : reading.outcome === "mismatch" ? tr("本次未达到观察预期，请复查证据", "This observation did not match the planned step; inspect it") : tr("未计为符合预期", "Not counted as matching the plan")}</small>
        </li>)}</ul>
      </>}
      <p className="browser-check-limits">{tr("客户端浏览器上报，非服务器独立验证。链接由程序激活，并检查可见性和采样点遮挡；不是完整键盘、触屏或无障碍测试。图片会预载解码，未验证图片语义或 CSS 背景图。脚本、表单和外部资源停用，不验证预约、邮件或后台。这些观察不自动确认验收或付款。", "Client-reported browser observations, not server-independent verification. Links are activated programmatically with visibility and sample-point checks; this is not full keyboard, touch or accessibility testing. Images are preloaded and decoded; image meaning and CSS background images are unverified. Scripts, forms and external resources remain disabled; booking, email and backends are unverified. These observations do not accept work or initiate payment.")}</p>
    </div>
  </details>;
}
