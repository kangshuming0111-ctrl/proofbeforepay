"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, MousePointer2, Square } from "lucide-react";
import type { Language, ProofAcceptanceEvidence, ProofBrowserCheckReport, ProofQuote } from "@/lib/contracts";
import { browserCheckMethodFor, NOODLE_BROWSER_METHOD, NOODLE_LINKS } from "@/lib/browser-check-report";
import { browserCheckReasons, NavigationReplayEvidence } from "./NavigationReplayEvidence";

const noodleLinkNames = NOODLE_LINKS.map(link => link.text);

type Props = {
  language: Language; report?: ProofBrowserCheckReport; enabled: boolean; busy: boolean;
  progress?: {done: number; total: number}; onRun: () => void; onCancel: () => void; readOnly?: boolean;
  navigationQuote?: ProofQuote; navigationArchived?: boolean; navigationAccepted?: boolean; deliveryLabel?: string;
  navigationAcceptance?: Pick<ProofAcceptanceEvidence, "deliveryId" | "browserReportId" | "at">;
};
export function BrowserCheckPanel({language, report, enabled, busy, progress, onRun, onCancel, readOnly = false, navigationQuote, navigationArchived, navigationAccepted, navigationAcceptance, deliveryLabel}: Props) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const details = useRef<HTMLDetailsElement>(null);
  const [initiallyExpanded] = useState(() => !report);
  const savedReplay = report?.method === NOODLE_BROWSER_METHOD;
  const noodleReplay = savedReplay || (!readOnly && navigationQuote && browserCheckMethodFor(navigationQuote) === NOODLE_BROWSER_METHOD);
  const acceptance = report && navigationAcceptance?.deliveryId === report.deliveryId ? navigationAcceptance : undefined;
  const usedAtAcceptance = !!report && (navigationAccepted || acceptance?.browserReportId === report.id);
  const afterAcceptance = report && acceptance && !usedAtAcceptance && Date.parse(report.receivedAt) > Date.parse(acceptance.at);
  const reportLabel = usedAtAcceptance ? tr("验收报告", "Acceptance report")
    : afterAcceptance ? tr("验收后补测", "Recheck after acceptance") : tr("浏览器报告", "Browser report");
  const status = busy ? tr("检查中", "Checking") : report
    ? tr(`已观察 ${report.summary.observed} 项 · ${report.summary.issues} 项需核对 · ${report.summary.unavailable} 项未验证`, `${report.summary.observed} observed · ${report.summary.issues} need review · ${report.summary.unavailable} unverified`)
    : tr("尚未运行", "Not run");
  useEffect(() => {if (busy && details.current) details.current.open = true;}, [busy]);
  return <details ref={details} className="browser-check-panel" open={initiallyExpanded}>
    <summary className={noodleReplay ? "browser-check-noodle-summary" : undefined}>
      {noodleReplay ? <span className="browser-check-summary-copy">
        <span className="browser-check-summary-title"><MousePointer2 size={16} aria-hidden="true"/>{tr("首页导航回放与资源检查", "Homepage navigation replay & resources")}</span>
        <span className="browser-check-summary-routes">{tr(`${noodleLinkNames.length} 条首页导航 · ${noodleLinkNames.join("、")}`, `${noodleLinkNames.length} homepage links · ${noodleLinkNames.join(" and ")}`)}</span>
        {savedReplay && <span className="browser-check-summary-reports">
          <span title={report.id}>{reportLabel} <strong>#{report.id.slice(0, 8)}</strong></span>
          {!usedAtAcceptance && acceptance?.browserReportId && <span title={acceptance.browserReportId}>
            {tr("验收引用", "Acceptance reference")} <strong>#{acceptance.browserReportId.slice(0, 8)}</strong>
          </span>}
        </span>}
      </span> : <span><MousePointer2 size={16} aria-hidden="true"/>{tr("链接行为与资源检查", "Link behavior & resource checks")}</span>}
      <span>{status}</span><ChevronDown size={15} aria-hidden="true"/>
    </summary>
    <div className="browser-check-body">
      <p>{noodleReplay ? tr("在 375px 和 900px 下分别从本版首页点击菜单与联系链接，保存实际到达页面。也会检查各页的样式和图片。", "At 375px and 900px, click Menu and Contact from this delivery’s homepage and save the actual destinations. The check also looks at page styles and images.") : tr("在 375px、900px 静态预览中分别激活约定的页面导航步骤，核对目标和可见性，并检查样式与页面图片。每步独立加载其保存页面；不验证表单提交或预约处理。", "Independently activates each agreed page-navigation step in 375px and 900px saved previews, checking its destination, visibility, styles and page images. Each step starts from its saved page; form submissions and booking processing remain unverified.")}</p>
      {!readOnly && <div className="browser-check-actions">
        <button type="button" className="button primary" onClick={onRun} disabled={!enabled || busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <MousePointer2 size={15}/>} {busy ? tr("正在检查当前版本…", "Checking this version…") : noodleReplay ? tr("实测并保存首页两次点击", "Test and save both homepage clicks") : report ? tr("重新检查当前版本", "Check this version again") : tr("检查当前版本的链接和资源", "Check this version's links & resources")}</button>
        {busy && <button type="button" className="subtle-button" onClick={onCancel}><Square size={13}/>{tr("取消", "Cancel")}</button>}
      </div>}
      {busy && <div role="status" aria-live="polite"><span>{tr(`已检查 ${progress?.done ?? 0} / ${progress?.total ?? "…"}`, `Checked ${progress?.done ?? 0} / ${progress?.total ?? "…"}`)}</span><progress max={progress?.total ?? 1} value={progress?.done}/></div>}
      {busy && report && <p className="browser-check-origin">{tr("正在重新检查；下方仍是上次保存的观察，当前进度尚未形成新报告。", "Re-checking; the observations below are from the previous saved run. Current progress is not yet a new report.")}</p>}
      {report && <>
        <p className="browser-check-origin">{tr("报告保存人", "Report saved by")}: {report.reportedByRole === "buyer" ? tr("买家", "Buyer") : report.reportedByRole === "seller" ? tr("卖家", "Seller") : tr("旧记录未注明", "Not recorded in this earlier report")}</p>
        <p className="browser-check-origin">{tr("服务器接收时间", "Received by server")}: <time dateTime={report.receivedAt}>{new Date(report.receivedAt).toISOString().slice(0,19).replace("T"," ")} UTC</time></p>
        {savedReplay && <NavigationReplayEvidence language={language} report={report} quote={navigationQuote} archived={navigationArchived} accepted={usedAtAcceptance} deliveryLabel={deliveryLabel ?? navigationQuote?.proof.delivery?.label}/>}
        <ul className="browser-check-readings">{report.readings.filter(reading => !savedReplay || reading.kind !== "link").map(reading => <li key={reading.stepId} className={`browser-check-${reading.outcome}`}>
          <div><strong>{reading.kind === "link" ? tr("约定链接行为", "Agreed link behavior") : tr("页面样式和图片", "Page styles & images")}</strong><span>{reading.file} · {reading.viewportWidth}px</span></div>
          {reading.kind === "link" && <p>{reading.label} → {reading.target}</p>}
          {reading.status === "unavailable" ? <p>{tr("未验证", "Unverified")}: {tr(...(browserCheckReasons[reading.reason] ?? browserCheckReasons.load_failed))}</p>
            : reading.kind === "page" ? <p>{tr(`样式加载 ${reading.stylesLoaded}/${reading.stylesExpected}，页面图片解码 ${reading.imagesLoaded}/${reading.imagesExpected}。`, `Styles loaded ${reading.stylesLoaded}/${reading.stylesExpected}; page images decoded ${reading.imagesLoaded}/${reading.imagesExpected}.`)}</p>
            : <p>{tr("链接可见", "Link visible")} {reading.sourceVisible ? "✓" : "×"} · {tr("无遮挡采样点", "Uncovered sample point")} {reading.sourceHitTarget ? "✓" : "×"} · {tr("已激活", "Activated")} {reading.activated ? "✓" : "×"} · {tr("到达约定目标", "Expected destination")} {reading.destinationMatched ? "✓" : "×"} · {tr("目标可见", "Target visible")} {reading.targetVisible ? "✓" : "×"}</p>}
          <small>{reading.outcome === "expected_observation" ? tr("本次观察符合此步骤预期", "This observation matched the planned step") : reading.outcome === "mismatch" ? tr("本次未达到观察预期，请复查证据", "This observation did not match the planned step; inspect it") : tr("未计为符合预期", "Not counted as matching the plan")}</small>
        </li>)}</ul>
      </>}
      <p className="browser-check-limits">{tr("客户端浏览器上报，非服务器独立验证。链接由程序激活，并检查可见性和采样点遮挡；不是完整键盘、触屏或无障碍测试。图片会预载解码，未验证图片语义或 CSS 背景图。脚本、表单和外部资源停用，不验证预约、邮件或后台。这些观察不自动确认验收或付款。", "Client-reported browser observations, not server-independent verification. Links are activated programmatically with visibility and sample-point checks; this is not full keyboard, touch or accessibility testing. Images are preloaded and decoded; image meaning and CSS background images are unverified. Scripts, forms and external resources remain disabled; booking, email and backends are unverified. These observations do not accept work or initiate payment.")}</p>
    </div>
  </details>;
}
