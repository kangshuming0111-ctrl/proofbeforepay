"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Language, ProofBrowserCheckReading, ProofBrowserCheckReason, ProofBrowserCheckReport, ProofLayoutWidth, ProofQuote } from "@/lib/contracts";
import { replayNoodleNavigation } from "@/lib/browser-check-probe";
import { NOODLE_BROWSER_METHOD } from "@/lib/browser-check-report";

export const browserCheckReasons: Record<ProofBrowserCheckReason, [string, string]> = {
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

type Props = {
  language: Language;
  report: ProofBrowserCheckReport;
  deliveryLabel?: string;
  quote?: ProofQuote;
  archived?: boolean;
  accepted?: boolean;
};

type Playback = { key: string; stepId: string; state: "running" | "failed" } | {
  key: string; stepId: string; state: "complete"; reading: ProofBrowserCheckReading;
};

export function NavigationReplayEvidence({language, report, deliveryLabel, quote, archived, accepted}: Props) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const context = `${quote?.id ?? ""}/${report.deliveryId}/${report.id}/${archived ?? false}`;
  const controller = useRef<AbortController | null>(null);
  const [playback, setPlayback] = useState<Playback>();
  const [width, setWidth] = useState<ProofLayoutWidth>(375);
  const current = playback?.key === context ? playback : undefined;
  const rows = report.readings.filter(row => row.kind === "link");
  const widths = [...new Set(rows.map(row => row.viewportWidth))].sort((a, b) => a - b);
  const displayedWidth = widths.includes(width) ? width : widths[0];
  const canReplay = quote?.proof.delivery?.id === report.deliveryId;
  useEffect(() => () => controller.current?.abort(), [context]);

  async function replay(stepId: string) {
    if (!quote || !canReplay || current?.state === "running") return;
    controller.current?.abort();
    const run = new AbortController();
    controller.current = run;
    setPlayback({key: context, stepId, state: "running"});
    try {
      const reading = await replayNoodleNavigation(quote, report, stepId, run.signal, archived);
      if (!run.signal.aborted) setPlayback({key: context, stepId, state: "complete", reading});
    } catch {
      if (!run.signal.aborted) setPlayback({key: context, stepId, state: "failed"});
    }
  }

  if (report.method !== NOODLE_BROWSER_METHOD || !rows.length) return null;

  function result(reading: ProofBrowserCheckReading) {
    if (reading.status === "unavailable") return tr(...(browserCheckReasons[reading.reason] ?? browserCheckReasons.load_failed));
    if (reading.kind !== "link") return tr("链接结果无法读取", "Link result unavailable");
    if (!reading.activated) return tr("链接未激活", "Link did not activate");
    if (!reading.reachedTarget) return tr("已激活，未核实到达页", "Activated; no arrival page verified");
    if (!reading.destinationMatched) return tr("到达页与约定不符", "Arrival differed from the agreement");
    return reading.targetVisible ? tr("到达约定页面", "Reached the agreed page") : tr("到达约定页面，目标可见性待核对", "Reached the agreed page; target visibility needs review");
  }

  return <section className="navigation-replay" aria-label={tr("首页导航回放证据", "Homepage navigation replay evidence")}>
    <header>
      <strong>{tr("首页导航回放证据", "Homepage navigation replay evidence")}</strong>
      {accepted && <span className="navigation-replay-saved">{tr("验收时保存的报告", "Report saved at acceptance")}</span>}
    </header>
    <div className="navigation-replay-version"><span>{tr("交付版本", "Delivery version")}</span> {deliveryLabel && <strong>{deliveryLabel}</strong>} <code>{report.deliveryId}</code></div>
    <div className="navigation-replay-version"><span>{tr("报告编号", "Report ID")}</span> <code>{report.id}</code></div>
    <p>{tr("每次点击都从本版首页开始。重放结果单独显示，原报告保留。", "Each click starts on this delivery’s homepage. A replay displays separately and preserves the saved report.")}</p>
    {widths.length > 1 && <div className="navigation-replay-widths no-print" role="group" aria-label={tr("回放视口宽度", "Replay viewport width")}>
      {widths.map(value => <button type="button" key={value} aria-pressed={displayedWidth === value} disabled={current?.state === "running"} onClick={() => setWidth(value)}>{value}px</button>)}
    </div>}
    <ul className="navigation-replay-rows">{rows.filter(row => row.viewportWidth === displayedWidth).map(row => {
      const observed = row.status === "observed" && row.kind === "link" ? row : undefined;
      const attempt = current?.stepId === row.stepId ? current : undefined;
      const reading = attempt?.state === "complete" ? attempt.reading : undefined;
      return <li key={row.stepId} className={`browser-check-${row.outcome}`}>
        <div className="navigation-replay-row-heading"><strong>{row.label}</strong><span>{row.viewportWidth}px · {result(row)}</span></div>
        <dl>
          <div><dt>{tr("起点", "From")}</dt><dd><code>{row.file}</code></dd></div>
          <div><dt>{tr("点击的链接", "Clicked link")}</dt><dd>{observed?.clickedLabel ?? tr("未记录点击", "No click recorded")}</dd></div>
          <div><dt>{tr("实际到达", "Reached")}</dt><dd>{observed?.reachedTarget ? <code>{observed.reachedTarget}</code> : tr("未核实", "Unverified")}</dd></div>
          {observed?.reachedTarget !== row.target && <div><dt>{tr("约定目标", "Expected")}</dt><dd><code>{row.target}</code></dd></div>}
        </dl>
        {canReplay && <button type="button" className="subtle-button no-print" aria-label={tr(`重放此点击 ${row.label} ${row.viewportWidth}px`, `Replay this click ${row.label} ${row.viewportWidth}px`)} disabled={current?.state === "running"} onClick={() => void replay(row.stepId)}><RotateCcw size={13} aria-hidden="true"/>{tr("重放此点击", "Replay this click")}</button>}
        {attempt && <div className="navigation-replay-attempt" role="status" aria-live="polite">
          {attempt.state === "running" ? tr("正在重放本版点击…", "Replaying this delivery’s click…") : attempt.state === "failed" ? tr("无法重放。请重试或重新打开此版本。", "Replay unavailable. Retry or reopen this version.") : <>
            <strong>{tr("本次重放", "This replay")}</strong> {reading && result(reading)}
            {reading?.status === "observed" && reading.kind === "link" && reading.clickedLabel && <span> · {tr("点击", "Clicked")} {reading.clickedLabel}</span>}
            {reading?.status === "observed" && reading.kind === "link" && reading.reachedTarget && <span> · {tr("到达", "Reached")} <code>{reading.reachedTarget}</code></span>}
          </>}
        </div>}
      </li>;
    })}</ul>
  </section>;
}
