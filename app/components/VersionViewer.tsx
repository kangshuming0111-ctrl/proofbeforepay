"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, FileClock, Monitor, RotateCcw, Smartphone, X } from "lucide-react";
import type { Language, ProofCriterion, ProofDeliveryVersion } from "@/lib/contracts";
import { deliveryFileUrl } from "@/lib/delivery-upload";
import { ResourceChecks } from "./ResourceChecks";
import { DeliveryAssessment } from "./DeliveryAssessment";

export type VersionViewerProps = {
  quoteId: string;
  version: ProofDeliveryVersion;
  language: Language;
  criteria?: ProofCriterion[];
  onClose: () => void;
};

function displayTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : value;
}

export function VersionViewer({ quoteId, version, language, criteria = [], onClose }: VersionViewerProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const { delivery } = version;
  const files = useMemo(() => Object.keys(delivery.files ?? {}).filter(file => /\.html$/iu.test(file)).sort((a, b) => a.toLowerCase() === "index.html" ? -1 : b.toLowerCase() === "index.html" ? 1 : a.localeCompare(b)), [delivery.files]);
  const [selectedFile, setSelectedFile] = useState("");
  const [width, setWidth] = useState<375 | 900>(375);
  const [reload, setReload] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameDocumentRef = useRef<Document | null>(null);
  const onCloseRef = useRef(onClose);
  const id = useId();
  const activeFile = files.includes(selectedFile) ? selectedFile : files[0] ?? "";
  const previewUrl = activeFile ? deliveryFileUrl(quoteId,delivery.id,activeFile,true) : "";
  const review = version.review?.deliveryId === delivery.id ? version.review : undefined;
  const assessment = delivery.assessment?.deliveryId === delivery.id ? delivery.assessment : undefined;
  const submission = version.submission?.deliveryId === delivery.id ? version.submission : undefined;
  const feedback = version.feedback.filter(item => item.deliveryId === delivery.id);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    // A native modal makes the rest of the page inert and confines keyboard focus.
    dialog.showModal();
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    function escapeFromPreview(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    function connectPreviewKeys() {
      frameDocumentRef.current?.removeEventListener("keydown", escapeFromPreview);
      frameDocumentRef.current = null;
      try {
        const childDocument = frameRef.current?.contentDocument;
        if (childDocument) {
          childDocument.addEventListener("keydown", escapeFromPreview);
          frameDocumentRef.current = childDocument;
        }
      } catch { /* Native modal keyboard handling remains available after navigation. */ }
    }
    const frame = frameRef.current;
    frame?.addEventListener("load", connectPreviewKeys);
    connectPreviewKeys();
    return () => {
      frame?.removeEventListener("load", connectPreviewKeys);
      frameDocumentRef.current?.removeEventListener("keydown", escapeFromPreview);
      frameDocumentRef.current = null;
    };
  }, [previewUrl, reload]);

  const findingLabel = (finding: "pass" | "fail" | "needs_human") => finding === "pass"
    ? tr("当时规则检查通过", "Rule check passed at the time")
    : finding === "fail" ? tr("当时规则检查未通过", "Rule check failed at the time")
      : tr("当时需要人工确认", "Required human confirmation at the time");

  return <dialog ref={dialogRef} className="version-viewer-dialog no-print" aria-labelledby={`${id}-title`} aria-describedby={`${id}-notice`} aria-modal="true" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <header className="version-viewer-heading">
      <div><span className="version-viewer-kicker"><FileClock size={14} aria-hidden="true" />{version.isCurrent ? tr("只读交付快照", "Read-only delivery snapshot") : tr("只读版本历史", "Read-only version history")}</span><h2 id={`${id}-title`}>{delivery.label}</h2></div>
      <button ref={closeButtonRef} className="version-viewer-close" type="button" onClick={onClose} aria-label={tr("关闭历史版本并返回工作台", "Close historical version and return to the workspace")}><X size={20} aria-hidden="true" /></button>
    </header>
    <p className="version-viewer-notice" id={`${id}-notice`}>{version.isCurrent ? tr("只读查看当前交付快照；请返回工作台完成验收或付款。", "Read-only view of the current delivery. Return to the workspace for acceptance or payment.") : tr("历史快照，不用于当前验收或付款。查看不会替换当前交付。", "Historical snapshot. It is not used for current acceptance or payment. Viewing it does not replace the current delivery.")}</p>
    <div className="version-viewer-meta"><code>{delivery.id}</code><span>{version.isCurrent ? tr("保存于", "Saved") : tr("归档于", "Archived")} <time dateTime={version.isCurrent ? delivery.submittedAt : version.archivedAt}>{displayTime(version.isCurrent ? delivery.submittedAt : version.archivedAt)}</time></span></div>

    <div className="version-viewer-body">
      <section className="version-viewer-preview" aria-label={tr("历史交付预览", "Historical delivery preview")}>
        {files.length > 0 ? <>
          <div className="version-viewer-preview-controls">
            <div className="version-viewer-file-select"><label htmlFor={`${id}-file`}>{tr("保存的 HTML 入口", "Saved HTML entry")}</label><select id={`${id}-file`} value={activeFile} onChange={event => { setSelectedFile(event.target.value); setPreviewFailed(false); }}>{files.map(file => <option key={file} value={file}>{file}</option>)}</select></div>
            <div className="version-viewer-widths" role="group" aria-label={tr("历史预览视口宽度", "Historical preview viewport width")}><button type="button" aria-pressed={width === 375} onClick={() => setWidth(375)}><Smartphone size={14} aria-hidden="true" />375px</button><button type="button" aria-pressed={width === 900} onClick={() => setWidth(900)}><Monitor size={14} aria-hidden="true" />900px</button></div>
            <button className="version-viewer-reload" type="button" onClick={() => { setPreviewFailed(false); setReload(value => value + 1); }} aria-label={tr("重新加载所选历史入口", "Reload selected historical entry")}><RotateCcw size={14} aria-hidden="true" /></button>
          </div>
          <div className="version-viewer-preview-scroll" role="region" tabIndex={0} aria-label={tr("历史页面预览，可在此区域滚动", "Historical page preview; scroll within this region")}>
            <iframe ref={frameRef} key={`${delivery.id}-${activeFile}-${reload}`} className="version-viewer-frame" src={previewUrl} style={{ width }} height={800} title={tr(`历史快照：${delivery.label}，${activeFile}，${width}px`, `Historical snapshot: ${delivery.label}, ${activeFile}, ${width}px`)} sandbox="allow-same-origin" referrerPolicy="no-referrer" onError={() => setPreviewFailed(true)} />
          </div>
          {previewFailed && <p className="version-viewer-warning" role="status">{tr("该快照预览未能加载。请重新选择或加载保存的入口。", "The snapshot preview could not load. Select or reload a saved entry.")}</p>}
          <p className="version-viewer-help">{tr("预览仅从该历史版本加载保存的文件，脚本禁用。页面内链接可能导航；重新加载所选入口可返回快照。", "Preview entries load saved files from this historical version, with scripts disabled. Links within a page may navigate; reload the selected entry to return to the snapshot.")}</p>
        </> : <p className="version-viewer-empty">{tr("此快照没有可预览的已保存 HTML 文件。下方仍显示该版记录，不替换为其他版本文件。", "This snapshot has no saved HTML files to preview. Its records remain below; files from another version are not substituted.")}</p>}
      </section>

      <section className="version-viewer-records" aria-label={tr("此历史版本的记录", "Records for this historical version")}>
        <ResourceChecks delivery={delivery} language={language}/>
        <DeliveryAssessment report={assessment} criteria={criteria} language={language} riskReviews={delivery.riskReviews} readOnly />
        <details className="version-viewer-details"><summary>{tr("卖家交付说明", "Seller's delivery note")}<ChevronDown size={14} aria-hidden="true" /></summary><div className="version-viewer-details-body">{submission ? <><p className="version-viewer-text">{submission.note}</p><p className="version-viewer-help">{tr("卖家陈述，不是独立证明。", "A seller statement, not independent proof.")} <time dateTime={submission.at}>{displayTime(submission.at)}</time></p><code>{submission.deliveryId}</code></> : <p className="version-viewer-help">{tr("没有与此快照版本绑定的交付说明。", "No delivery note is tied to this snapshot version.")}</p>}</div></details>

        <details className="version-viewer-details"><summary>{tr(`买家反馈（${feedback.length}）`, `Buyer feedback (${feedback.length})`)}<ChevronDown size={14} aria-hidden="true" /></summary><div className="version-viewer-details-body">{feedback.length ? <ul className="version-viewer-feedback">{feedback.map(item => <li key={item.id}><strong>{tr("验收标准：", "Criterion: ")}{item.criterionId}</strong><p className="version-viewer-text">{item.comment}</p><p className="version-viewer-help"><time dateTime={item.at}>{displayTime(item.at)}</time></p><code>{item.deliveryId}</code></li>)}</ul> : <p className="version-viewer-help">{tr("此快照没有已归档反馈。", "No feedback is archived with this snapshot.")}</p>}</div></details>

        <details className="version-viewer-details"><summary>{tr("该版核查解释", "Version review explanation")}<ChevronDown size={14} aria-hidden="true" /></summary><div className="version-viewer-details-body">{review ? <><p className="version-viewer-review-source">{review.mode === "live" ? tr("当时的 AI 证据解释", "AI evidence explanation at the time") : tr("当时的模板解释 · 未调用 AI", "Template explanation at the time · no AI request")}</p><p className="version-viewer-text">{review.summary}</p><p className="version-viewer-help"><time dateTime={review.reviewedAt}>{displayTime(review.reviewedAt)}</time></p><code>{review.deliveryId}</code></> : <p className="version-viewer-help">{tr("没有与此快照版本匹配的核查记录。", "No review record matches this snapshot version.")}</p>}</div></details>

        <details className="version-viewer-details"><summary>{tr(`规则证据明细（${delivery.evidence.length}）`, `Rule evidence details (${delivery.evidence.length})`)}<ChevronDown size={14} aria-hidden="true" /></summary><div className="version-viewer-details-body">{delivery.evidence.length ? <ul className="version-viewer-evidence">{delivery.evidence.map((item, index) => <li key={`${item.id}-${index}`}><div className="version-viewer-evidence-heading"><strong>{item.criterionId}</strong><span className={`version-viewer-finding version-viewer-finding-${item.finding}`}>{findingLabel(item.finding)}</span></div><code>{item.file}</code><pre><code>{item.excerpt}</code></pre><p className="version-viewer-text">{item.explanation}</p></li>)}</ul> : <p className="version-viewer-help">{tr("此快照没有已保存的规则证据。", "No rule evidence was saved with this snapshot.")}</p>}</div></details>
      </section>
    </div>
  </dialog>;
}

export default VersionViewer;
