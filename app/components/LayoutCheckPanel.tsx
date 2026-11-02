"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowUpRight, ChevronDown, LoaderCircle, RotateCcw, ScanLine, Square } from "lucide-react";
import type { Language, ProofLayoutReport, ProofLayoutUnavailableReason } from "@/lib/contracts";

export type LayoutCheckPanelProps = {
  language: Language;
  report?: ProofLayoutReport;
  enabled: boolean;
  busy: boolean;
  progress?: { done: number; total: number };
  onRun: () => void;
  onCancel: () => void;
  onInspect?: (file: string, width: 375 | 900) => void;
};

const unavailableReasons: Record<ProofLayoutUnavailableReason, { zh: string; en: string }> = {
  missing_file: { zh: "交付中缺少此文件", en: "This file is missing from the delivery." },
  load_failed: { zh: "预览页面或所需样式未能加载", en: "The preview or a required stylesheet could not load." },
  navigation_changed: { zh: "页面已离开所选交付，未记录测量", en: "The page navigated away from this delivery; no measurement was recorded." },
  access_denied: { zh: "浏览器无法读取预览布局", en: "The browser could not read the preview layout." },
  timeout: { zh: "页面测量超时", en: "The page measurement timed out." },
  unstable_layout: { zh: "布局持续变化，无法取得稳定读数", en: "The layout kept changing; a stable reading was unavailable." },
  snapshot_mismatch: { zh: "页面与保存的交付版本不一致", en: "The page did not match the saved delivery snapshot." },
  response_type_mismatch: { zh: "响应不是预期网页或样式，请重新打开预览后重试", en: "The response was not the expected page or stylesheet. Reopen the preview and retry." },
  response_identity_mismatch: { zh: "响应未匹配当前交付标识，请刷新项目后重试", en: "The response did not identify this delivery. Refresh the project and retry." },
  source_mismatch: { zh: "返回源码与保存文件不同，未测量；请重新打开当前预览", en: "The returned source differed from the saved file. Reopen the current preview." },
  rendered_snapshot_mismatch: { zh: "浏览器呈现的页面与保存快照不同，未测量；请刷新预览后重试", en: "The rendered page differed from the saved snapshot. Refresh the preview and retry." },
};

function receivedTime(value: string) {
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? `${time.toISOString().slice(0, 16).replace("T", " ")} UTC` : value;
}

function pixels(value: number) {
  return `${Math.round(value * 10) / 10}px`;
}

export function LayoutCheckPanel({ language, report, enabled, busy, progress, onRun, onCancel, onInspect }: LayoutCheckPanelProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  // Keep later renders from changing the reader's native disclosure choice.
  const initiallyExpanded = useRef(!report);
  const headingId = useId();
  const sourceId = useId();
  const limitsId = useId();
  const total = Math.max(1, progress?.total ?? 1);
  const done = Math.min(total, Math.max(0, progress?.done ?? 0));

  useEffect(() => {
    if (busy && detailsRef.current) detailsRef.current.open = true;
  }, [busy]);

  return <details className="layout-check-panel" ref={detailsRef} open={initiallyExpanded.current} data-has-report={report ? "true" : "false"}>
    <summary className="layout-check-heading" id={headingId}>
      <span className="layout-check-title"><ScanLine size={16} aria-hidden="true" />{tr("浏览器布局检查", "Browser layout check")}</span>
      <span className="layout-check-summary">
        {busy ? <span>{tr("测量中", "Measuring")}</span> : report ? <>
          {report.summary.overflow > 0 && <span className="layout-check-count-overflow">{tr(`${report.summary.overflow} 处溢出`, `${report.summary.overflow} overflow reading${report.summary.overflow === 1 ? "" : "s"}`)}</span>}
          {report.summary.unavailable > 0 && <span className="layout-check-count-unavailable">{tr(`${report.summary.unavailable} 项不可测`, `${report.summary.unavailable} unavailable`)}</span>}
          {report.summary.measured > 0 && report.summary.overflow === 0 && <span>{report.summary.unavailable > 0
            ? tr("已测项未发现横向溢出；仍有未覆盖项", "No horizontal overflow found in measured items; some items remain uncovered")
            : tr("未发现文档横向溢出（不代表手机可用）", "No document overflow found (does not establish mobile usability)")}</span>}
          {report.summary.measured === 0 && report.summary.unavailable === 0 && <span>{tr("尚无测量读数", "No measurement readings")}</span>}
        </> : <span>{tr("尚未测量", "Not measured yet")}</span>}
      </span>
      <ChevronDown className="layout-check-chevron" size={15} aria-hidden="true" />
    </summary>

    <div className="layout-check-body" aria-labelledby={headingId}>
      <p className="layout-check-source" id={sourceId}>{tr(
        "当前浏览器测量；已保存数据由客户端上报，非服务器独立验证。",
        "Measured in the current browser. Saved data is reported by the client and has not been independently verified by the server.",
      )}</p>

      <div className="layout-check-toolbar no-print">
        <button className="layout-check-run" type="button" onClick={onRun} disabled={!enabled || busy} aria-describedby={`${sourceId} ${limitsId}`}>
          {busy ? <LoaderCircle className="layout-check-spinner" size={14} aria-hidden="true" /> : report ? <RotateCcw size={14} aria-hidden="true" /> : <ScanLine size={14} aria-hidden="true" />}
          {busy ? tr("正在测量…", "Measuring…") : report ? tr("重新测量全部页面", "Measure all pages again") : tr("一键测量全部页面", "Measure all pages")}
        </button>
        {busy && <button className="layout-check-cancel" type="button" onClick={onCancel}><Square size={12} aria-hidden="true" />{tr("取消", "Cancel")}</button>}
        {!enabled && !busy && <span className="layout-check-disabled-note">{tr("当前交付暂不能运行测量。", "Measurement is unavailable for this delivery right now.")}</span>}
      </div>

      <div className="layout-check-progress no-print" role="status" aria-live="polite" aria-atomic="true">
        {busy && <>
          <span>{progress ? tr(`正在测量：${done} / ${progress.total}`, `Measuring: ${done} / ${progress.total}`) : tr("正在准备浏览器测量…", "Preparing browser measurements…")}</span>
          <progress max={total} value={progress ? done : undefined} aria-label={tr("布局测量进度", "Layout measurement progress")} />
        </>}
      </div>

      {report ? <>
        <p className="layout-check-report-meta">
          <span>{tr(`已测 ${report.summary.measured} 项 · 不可测 ${report.summary.unavailable} 项`, `${report.summary.measured} measured · ${report.summary.unavailable} unavailable`)}</span>
          <span>{tr(`视口高度 ${report.viewportHeight}px`, `Viewport height ${report.viewportHeight}px`)}</span>
          <span>{tr("接收于", "Received")} <time dateTime={report.receivedAt}>{receivedTime(report.receivedAt)}</time></span>
        </p>
        <div className="layout-check-table-scroll" role="region" aria-label={tr("各页面布局测量读数，可滚动查看", "Page layout readings, scroll to inspect")} tabIndex={0}>
          <table className="layout-check-table" aria-describedby={limitsId}>
            <caption className="layout-check-visually-hidden">{tr("各页面在不同视口宽度下的文档宽度。不可测不计为通过。", "Document widths for each page and viewport. Unavailable readings do not count as a pass.")}</caption>
            <thead><tr><th scope="col">{tr("文件", "File")}</th><th scope="col">{tr("屏宽", "Viewport")}</th><th scope="col">{tr("内容宽", "Content width")}</th><th scope="col">{tr("结果", "Result")}</th></tr></thead>
            <tbody>{report.readings.map((reading, index) => {
              const unavailable = "reason" in reading;
              const width = reading.viewportWidth === 375 ? 375 : reading.viewportWidth === 900 ? 900 : undefined;
              const canInspect = Boolean(onInspect && width);
              const reason = unavailable ? unavailableReasons[reading.reason] : undefined;
              return <tr key={`${reading.file}-${reading.viewportWidth}-${index}`} className={unavailable ? "layout-check-row-unavailable" : reading.outcome === "overflow" ? "layout-check-row-overflow" : ""}>
                <th scope="row">
                  {canInspect ? <>
                    <button className="layout-check-file no-print" type="button" onClick={() => { if (width) onInspect?.(reading.file, width); }} aria-label={tr(`在 ${reading.viewportWidth}px 预览中查看 ${reading.file}`, `Inspect ${reading.file} in the ${reading.viewportWidth}px preview`)}><span>{reading.file}</span><ArrowUpRight size={12} aria-hidden="true" /></button>
                    <span className="layout-check-file-print">{reading.file}</span>
                  </> : <span className="layout-check-filename">{reading.file}</span>}
                </th>
                <td>{pixels(reading.viewportWidth)}</td>
                <td>{unavailable ? <span aria-label={tr("无测量数据", "No measurement data")}>—</span> : <>{pixels(reading.scrollWidth)}<small>{tr(`文档宽 ${pixels(reading.clientWidth)}`, `Client width ${pixels(reading.clientWidth)}`)}</small></>}</td>
                <td>{unavailable ? <><span className="layout-check-result-unavailable">{tr("不可测", "Unavailable")}</span><small>{reason ? tr(reason.zh, reason.en) : tr("浏览器未能取得可靠读数", "The browser could not obtain a reliable reading.")}</small></> : reading.outcome === "overflow" ? <span className="layout-check-result-overflow">{tr(`横向溢出 ${pixels(reading.overflowPx)}`, `${pixels(reading.overflowPx)} horizontal overflow`)}</span> : <span>{tr("未发现横向溢出", "No horizontal overflow found")}</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {report.readings.length === 0 && <p className="layout-check-empty">{tr("此报告没有可展示的测量读数。", "This report contains no measurement readings.")}</p>}
      </> : !busy && <p className="layout-check-empty">{tr("测量此交付的全部 HTML 页面，分别使用 375px 和 900px 视口宽度。", "Measure every HTML page in this delivery at viewport widths of 375px and 900px.")}</p>}

      <p className="layout-check-limits" id={limitsId}>{tr(
        "测量静态预览，脚本和外部资源停用。只检查文档横向宽度，不证明视觉、可读性、按钮功能或无障碍；仍需人工验收。不可测不代表通过。",
        "Measures the static preview with scripts and external resources disabled. Checks document width only. It does not establish visual quality, readability, button functionality or accessibility. Human acceptance is still required. Unavailable does not mean passed.",
      )}</p>
    </div>
  </details>;
}

export default LayoutCheckPanel;
