"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, useReducer, type FormEvent, type Ref } from "react";
import { ArrowUpRight, Check, ChevronDown, Copy, History, Link2, LoaderCircle, Send, Users } from "lucide-react";
import type { Language, ProofDeliveryVersion, ProofQuote, ProofRole } from "@/lib/contracts";
import {emptyFeedbackDraft,feedbackDraftReducer} from "@/lib/feedback-draft";
import { criterionDisplayTitle } from "@/lib/delivery-overview";
import { SellerRevisionFeedback } from "./SellerRevisionFeedback";

export type FeedbackSuggestion = { quoteId: string; deliveryId: string; criterionId: string; comment: string; serial: number; startBlank?: true; journeyReportId?: string; modelReportId?: string; riskSource?: {assessmentId:string;riskIndex:number} };
export type CollaborationHistoryHandle = { quoteId: string; reveal: () => void };

export type CollaborationPanelProps = {
  quote: ProofQuote;
  role: ProofRole;
  language: Language;
  busy: boolean;
  invitation?: { url: string; expiresAt: string; email: string };
  versions: ProofDeliveryVersion[];
  feedbackSuggestion?: FeedbackSuggestion;
  onInvite: (email: string) => void;
  onRevokeInvite: () => void;
  onSubmit: (note: string) => void;
  onReturn: (feedback: { criterionId: string; comment: string; journeyReportId?: string; modelReportId?: string; riskSource?: {assessmentId:string;riskIndex:number} }[]) => void;
  onAccept: () => void;
  onLoadVersions: () => void;
  onViewVersion: (deliveryId: string) => void;
  historyRef?: Ref<CollaborationHistoryHandle>;
};

const stageLabels = {
  awaiting_seller: { zh: "等待卖家加入", en: "Awaiting seller" },
  in_progress: { zh: "卖家制作中", en: "In progress" },
  submitted: { zh: "等待买家验收", en: "Submitted for review" },
  changes_requested: { zh: "已退回修改", en: "Changes requested" },
  accepted: { zh: "交付已接受", en: "Delivery accepted" },
} as const;

function displayTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : value;
}

export function CollaborationPanel({ quote, role, language, busy, invitation, versions, feedbackSuggestion, onInvite, onRevokeInvite, onSubmit, onReturn, onAccept, onLoadVersions, onViewVersion, historyRef }: CollaborationPanelProps) {
  const zh = language === "zh";
  const tr = (chinese: string, english: string) => zh ? chinese : english;
  const collaboration = quote.proof.collaboration;
  const demoRoleplay = quote.proof.demoRoleplay === true;
  const stage = collaboration?.stage ?? "awaiting_seller";
  const delivery = quote.proof.delivery;
  const reviewCurrent = Boolean(delivery && quote.proof.review?.deliveryId === delivery.id);
  const isBuyer = role === "buyer";
  const expiresAt = Date.parse(quote.proof.authorizationExpiresAt ?? "");
  const authorizationExpired = quote.proof.paymentState === "authorized" && (!Number.isFinite(expiresAt) || expiresAt <= Date.now());
  const frozen = Boolean(quote.proof.paymentOperation || authorizationExpired || quote.status === "paid" || ["captured", "voided", "closed_unpaid"].includes(quote.proof.paymentState));
  const canInvite = !demoRoleplay && isBuyer && stage === "awaiting_seller" && !collaboration?.sellerJoinedAt && quote.status === "approved" && quote.proof.paymentState === "unfunded" && !quote.paypalOrderId && !frozen;
  const sellerEditing = !isBuyer && (stage === "in_progress" || stage === "changes_requested");
  const explainingReturnedStatic = stage === "changes_requested" && !!quote.proof.project;
  const buyerReviewing = isBuyer && stage === "submitted";
  const currentSubmission = collaboration?.submission?.deliveryId === delivery?.id ? collaboration?.submission : undefined;
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [note, setNote] = useState("");
  const [selectedCriteria, setSelectedCriteria] = useState<Record<string, boolean>>({});
  const [activeComment, setActiveComment] = useState<string>();
  const [draft,dispatchDraft]=useReducer(feedbackDraftReducer,undefined,emptyFeedbackDraft);
  const {comments,riskSources,riskDraftConflict,riskDraftConflicts}=draft;
  const [journeyDraftReportId, setJourneyDraftReportId] = useState<string>();
  const [modelDraftReportId, setModelDraftReportId] = useState<string>();

  const [suggestionNotice, setSuggestionNotice] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const invitationInput = useRef<HTMLInputElement>(null);
  const historyDetails = useRef<HTMLDetailsElement>(null);
  const historySummary = useRef<HTMLElement>(null);
  const handledSuggestion = useRef<string | null>(null);
  const pendingCommentFocus = useRef<string | null>(null);
  const commentField = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const criteria = quote.proof.criteria;
  const technicalAgreement = delivery?.journeyPlan;
  const journeyReport = technicalAgreement && delivery?.journeyReport?.deliveryId === delivery.id && delivery.journeyReport.planDigest === technicalAgreement.planDigest ? delivery.journeyReport : undefined;
  const modelReport=technicalAgreement && delivery?.modelReport?.deliveryId===delivery.id && delivery.modelReport.journeyPlanDigest===technicalAgreement.planDigest ? delivery.modelReport : undefined;
  const modelSelected=Boolean(technicalAgreement&&selectedCriteria["model-agreement"]);
  const journeySelected = Boolean(technicalAgreement && selectedCriteria["journey-agreement"]);
  const feedbackDraft: {criterionId: string; comment: string; journeyReportId?: string; modelReportId?: string; riskSource?: {assessmentId:string;riskIndex:number}}[] = criteria.filter(criterion => selectedCriteria[criterion.id]).map(criterion => ({ criterionId: criterion.id, comment: (comments[criterion.id] ?? "").trim(), ...(riskSources[criterion.id]?{riskSource:riskSources[criterion.id]}:{}) }));
  if (journeySelected) feedbackDraft.push({criterionId: "journey-agreement", comment: (comments["journey-agreement"] ?? "").trim(), journeyReportId: journeyDraftReportId});
  if(modelSelected)feedbackDraft.push({criterionId:"model-agreement",comment:(comments["model-agreement"]??"").trim(),modelReportId:modelDraftReportId});
  const modelDraftCurrent=!modelSelected||Boolean(modelReport&&modelDraftReportId===modelReport.id);
  const journeyDraftCurrent = !journeySelected || Boolean(journeyReport && journeyDraftReportId === journeyReport.id);
  const staleCommentId = !journeyDraftCurrent ? "journey-agreement" : !modelDraftCurrent ? "model-agreement" : undefined;
  const missingComment = feedbackDraft.find(item => !item.comment.length || item.comment.length > 1000);
  const returnReady = feedbackDraft.length > 0 && !staleCommentId && !missingComment;
  const submitReady = Boolean(delivery && reviewCurrent && note.trim().length > 0 && note.trim().length <= 2000);

  useImperativeHandle(historyRef, () => ({
    quoteId: quote.id,
    reveal() {
      if (!historyDetails.current || !historySummary.current) return;
      historyDetails.current.open = true;
      historySummary.current.scrollIntoView({ block: "nearest", behavior: "auto" });
      historySummary.current.focus({ preventScroll: true });
    },
  }), [quote.id]);

  useEffect(() => {
    setEmail(invitation?.email ?? "");
    setCopyState("idle");
  }, [quote.id, role, invitation?.email]);

  useEffect(() => {
    // Drafts belong to a delivery, not to quote refreshes or temporary busy states.
    setNote("");
    setSelectedCriteria({});
    setActiveComment(undefined);
    dispatchDraft({type:"reset"});
    setJourneyDraftReportId(undefined);
    setModelDraftReportId(undefined);

    setSuggestionNotice(false);
    pendingCommentFocus.current = null;
  }, [quote.id, delivery?.id]);

  useEffect(() => { setCopyState("idle"); }, [invitation?.url]);

  useEffect(() => {
    if (!feedbackSuggestion || feedbackSuggestion.quoteId !== quote.id || feedbackSuggestion.deliveryId !== delivery?.id
      || !isBuyer || stage !== "submitted" || frozen) return;
    const technical = feedbackSuggestion.criterionId === "journey-agreement";
    const modelTechnical=feedbackSuggestion.criterionId==="model-agreement";
    if (technical ? !journeyReport || feedbackSuggestion.journeyReportId !== journeyReport.id : modelTechnical ? !modelReport || feedbackSuggestion.modelReportId!==modelReport.id : !criteria.some(criterion => criterion.id === feedbackSuggestion.criterionId)) return;
    const key = `${feedbackSuggestion.quoteId}:${feedbackSuggestion.deliveryId}:${feedbackSuggestion.serial}`;
    if (handledSuggestion.current === key) return;
    handledSuggestion.current = key;
    const criterionId = feedbackSuggestion.criterionId;
    const riskRef=feedbackSuggestion.riskSource;
    if(riskRef && (technical||modelTechnical||riskRef.assessmentId!==delivery?.assessment?.id||!Number.isSafeInteger(riskRef.riskIndex)||riskRef.riskIndex<0||riskRef.riskIndex>=delivery.assessment.risks.length))return;

    const comment = feedbackSuggestion.comment.slice(0, 1000).replace(/[\uD800-\uDBFF]$/u, "");
    if (!comment.trim() && (!feedbackSuggestion.startBlank || technical || modelTechnical || riskRef)) return;
    pendingCommentFocus.current = criterionId;
    // Consume an explicit user command once; this is not display state derived on every refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCriteria(current => ({ ...current, [criterionId]: true }));
    setActiveComment(criterionId);
    // Existing text always wins. Repeated suggestions never append or overwrite it.
    if (comment.trim()) dispatchDraft({type:"suggest",criterionId,comment,...(riskRef?{riskSource:riskRef}:{})});
    if (technical) setJourneyDraftReportId(current => current ?? feedbackSuggestion.journeyReportId);
    if (modelTechnical) setModelDraftReportId(current=>current??feedbackSuggestion.modelReportId);
    setSuggestionNotice(!!comment.trim());
  }, [feedbackSuggestion, quote.id, delivery?.id, delivery?.assessment, isBuyer, stage, frozen, criteria, journeyReport, modelReport]);

  useEffect(() => {
    const criterionId = pendingCommentFocus.current;
    const field = commentField.current;
    if (!criterionId || criterionId !== activeComment || !field || field.matches(":disabled")) return;
    field.focus({ preventScroll: true });
    field.scrollIntoView({ block: "nearest", inline: "nearest" });
    pendingCommentFocus.current = null;
  }, [activeComment, selectedCriteria, busy, frozen, buyerReviewing]);

  function openComment(criterionId: string) {
    if (activeComment === criterionId && commentField.current) {
      commentField.current.focus({ preventScroll: true });
      commentField.current.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    pendingCommentFocus.current = criterionId;
    setActiveComment(criterionId);
  }

  function selectComment(criterionId: string, checked: boolean) {
    setSelectedCriteria(current => ({...current, [criterionId]: checked}));
    if (checked && !activeComment) setActiveComment(criterionId);
    if (!checked && activeComment === criterionId) setActiveComment(feedbackDraft.find(item => item.criterionId !== criterionId)?.criterionId);
    if (!checked && pendingCommentFocus.current === criterionId) pendingCommentFocus.current = null;
  }

  async function copyInvitation() {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
      invitationInput.current?.focus();
      invitationInput.current?.select();
    }
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && canInvite && email.trim()) onInvite(email.trim());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && !frozen && sellerEditing && submitReady) onSubmit(note.trim());
  }

  function returnDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || frozen || !buyerReviewing || !delivery) return;
    const incomplete = staleCommentId ?? missingComment?.criterionId;
    if (incomplete) openComment(incomplete);
    else if (returnReady) onReturn(feedbackDraft);
  }

  const feedbackById = new Map(versions.flatMap(version => version.feedback).map(item => [item.id, item]));
  for (const item of collaboration?.feedback ?? []) feedbackById.set(item.id, item);
  const allFeedback = [...feedbackById.values()].sort((a, b) => a.at.localeCompare(b.at));
  const currentFeedback = allFeedback.filter(item => item.deliveryId === delivery?.id);
  const historicalFeedback = allFeedback.filter(item => item.deliveryId !== delivery?.id);
  const criterionTitle = (criterionId: string) => {
    if (criterionId === "model-agreement") return tr("附加技术协议 · 并发状态", "Additional technical agreement · concurrent state");
    if (criterionId === "journey-agreement") return tr("附加技术协议 · 业务旅程", "Additional technical agreement · business journey");
    const criterion = criteria.find(item => item.id === criterionId);
    return criterion ? criterionDisplayTitle(criterion, language) : criterionId;
  };
  const commentChoices = criteria.map(criterion => ({
    id: criterion.id, title: criterionDisplayTitle(criterion, language), disabled: false,
  }));
  if (technicalAgreement) commentChoices.push(
    {id: "journey-agreement", title: tr("预约流程", "Booking flow"), disabled: !journeyReport && !journeySelected},
    {id: "model-agreement", title: tr("多人同时预约", "Simultaneous bookings"), disabled: !modelReport && !modelSelected},
  );
  const editing = commentChoices.find(choice => choice.id === activeComment && selectedCriteria[choice.id]);
  const editingRisk = editing && riskSources[editing.id];
  const editingTechnical = editing?.id === "journey-agreement" || editing?.id === "model-agreement";
  const editingReportId = editing?.id === "journey-agreement" ? journeyDraftReportId : modelDraftReportId;
  const editingReportStale = editing?.id === "journey-agreement" ? !journeyDraftCurrent : editing?.id === "model-agreement" && !modelDraftCurrent;
  const commentsLeft = feedbackDraft.filter(item => !item.comment || item.comment.length > 1000).length;
  const feedbackList = (items: typeof allFeedback) => <ul className="collaboration-feedback-list">
    {items.map(item => <li key={item.id}>
      <strong>{criterionTitle(item.criterionId)}</strong>
      <div className="collaboration-feedback-meta"><span>{tr("版本", "Version")} <code>{item.deliveryId}</code></span><time dateTime={item.at}>{displayTime(item.at)}</time></div>
      {item.criterionId === "journey-agreement" && <p className="collaboration-help">{tr("针对另行确认的技术协议，不代表原始需求自动失败。绑定报告：", "This addresses the separately confirmed technical agreement; it does not automatically fail an original requirement. Bound report: ")}<code>{item.journeyReportId ?? tr("未记录", "Not recorded")}</code></p>}
      {item.criterionId === "model-agreement" && <p className="collaboration-help">{tr("另行确认的技术协议；绑定并发报告：", "Separately confirmed technical agreement; bound concurrent report: ")}<code>{item.modelReportId ?? tr("未记录", "Not recorded")}</code></p>}
      <p>{item.comment}</p>
    </li>)}
  </ul>;

  return <section className="collaboration-panel" aria-labelledby={`${id}-heading`}>
    <header className="collaboration-heading">
      <h3 id={`${id}-heading`}><Users size={16} aria-hidden="true" />{tr("交付协作", "Delivery collaboration")}</h3>
      <span className={`collaboration-stage collaboration-stage-${stage}`} role="status" aria-live="polite">{demoRoleplay && stage === "awaiting_seller" ? tr("等待买家锁定约定", "Awaiting scope approval") : tr(stageLabels[stage].zh, stageLabels[stage].en)}</span>
      <span className="collaboration-role">{tr("当前角色：", "Your role: ")}{isBuyer ? tr("买家", "Buyer") : tr("卖家", "Seller")}</span>
    </header>

    <p className="collaboration-payment-note">{quote.proof.sandboxCollaboration ? tr("双账号 Sandbox 测试：买卖双方使用独立账号；验收后仅买家可单独确认虚拟付款，收款方为配置的测试商户，不向实际卖家结算。", "Two-account Sandbox test: buyer and seller use separate accounts. Only the buyer confirms virtual payment after acceptance, to the configured test merchant. No actual seller settlement.") : quote.proof.sandboxRehearsal ? tr("Sandbox 双端演练：同一账号体验双方；验收后单独向已配置的测试商户支付虚拟资金，不向真实卖家结算。", "Sandbox role rehearsal: one account tries both sides, then separately pays the configured test merchant with test funds. No real seller settlement.") : demoRoleplay ? tr("双端演示：同一账号切换买家与卖家；不创建真实对方账号，不转账。", "Two-sided demo: switch between buyer and seller using this account. No separate counterparty account is created and no funds are transferred.") : tr("双人协作的付款为本地模拟，不向卖家转账。", "Payments in this two-person workflow are local simulations. No funds are transferred to the seller.")}</p>

    <div className="collaboration-body">
      {collaboration?.sellerName && <p className="collaboration-person">{tr("卖家：", "Seller: ")}<strong>{collaboration.sellerName}</strong>{collaboration.sellerJoinedAt && <span> · <time dateTime={collaboration.sellerJoinedAt}>{displayTime(collaboration.sellerJoinedAt)}</time> {tr("加入", "joined")}</span>}</p>}
      {delivery && <div className="collaboration-current-version"><span>{tr("当前交付", "Current delivery")}</span><strong>{delivery.label}</strong><details className="collaboration-details"><summary>{tr("版本标识", "Version identifier")}</summary><code>{delivery.id}</code></details></div>}
      {frozen && <p className="collaboration-state-note" role="status">{tr("本记录的协作操作已冻结；仍可查看反馈和历史版本。", "Collaboration actions are frozen for this record. Feedback and version history remain available.")}</p>}

      {demoRoleplay && stage === "awaiting_seller" && <p className="collaboration-state-note">{tr("买家确认并锁定约定后，就能切换到卖家端开始交付。", "Lock scope as buyer, then switch to seller to start delivery.")}</p>}

      {!demoRoleplay && isBuyer && stage === "awaiting_seller" && <div className="collaboration-action">
        <h4>{tr("邀请卖家加入", "Invite your seller")}</h4>
        <p className="collaboration-help" id={`${id}-invite-help`}>{tr("受邀者必须使用下方邮箱登录，并已获得此网站的访问权限。邀请不会更改网站共享设置；网站访问权限需单独授予。", "The seller must sign in with the email below and already have access to this website. This invitation does not change website sharing; grant website access separately.")}</p>
        <form className="collaboration-invite-form no-print" onSubmit={invite}>
          <label htmlFor={`${id}-email`}>{tr("卖家的登录邮箱", "Seller's sign-in email")}</label>
          <div className="collaboration-invite-fields"><input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy || !canInvite} aria-describedby={`${id}-invite-help ${id}-invite-link-help`} placeholder="seller@example.com" /><button className="collaboration-button" type="submit" disabled={busy || !canInvite || !email.trim()}><Link2 size={14} aria-hidden="true" />{tr("生成邀请链接", "Create invitation link")}</button></div>
        </form>
        {!canInvite && !frozen && <p className="collaboration-state-note">{tr("需要先确认范围，且尚未开始付款流程，才能邀请卖家。", "Confirm the scope before inviting a seller. Invitations are available before the payment workflow starts.")}</p>}
        <p className="collaboration-help" id={`${id}-invite-link-help`}>{tr("只生成链接，不发送邮件。请自行发给指定卖家；重新生成会使旧链接失效。刷新页面后无法恢复原链接。", "Creates a link without sending email. Share it with the specified seller yourself. A new link invalidates the old one. The original link cannot be recovered after refreshing.")}</p>
        {invitation && <div className="collaboration-invitation">
          <p className="collaboration-invitation-meta"><span>{tr("受邀邮箱：", "Invited email: ")}<strong>{invitation.email}</strong></span><span>{tr("有效期至", "Expires")} <time dateTime={invitation.expiresAt}>{displayTime(invitation.expiresAt)}</time></span></p>
          <div className="collaboration-link-controls no-print"><label className="collaboration-visually-hidden" htmlFor={`${id}-invitation-url`}>{tr("邀请链接", "Invitation link")}</label><input ref={invitationInput} id={`${id}-invitation-url`} type="text" readOnly value={invitation.url} spellCheck={false} /><button className="collaboration-button collaboration-button-secondary" type="button" onClick={copyInvitation} aria-label={tr("复制邀请链接", "Copy invitation link")}>{copyState === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{tr("复制", "Copy")}</button></div>
          <p className="collaboration-copy-status no-print" role="status" aria-live="polite">{copyState === "copied" ? tr("链接已复制。未发送邮件。", "Link copied. No email was sent.") : copyState === "failed" ? tr("未能自动复制。已选中链接，请手动复制。", "Automatic copying failed. The link is selected for manual copying.") : ""}</p>
        </div>}
        <button className="collaboration-text-button no-print" type="button" onClick={onRevokeInvite} disabled={busy || !canInvite}>{tr("撤销卖家邀请", "Revoke seller invitation")}</button>
      </div>}

      {sellerEditing && <div className="collaboration-action">
        <h4>{explainingReturnedStatic ? tr("为当前版本补充说明", "Explain the current version") : stage === "changes_requested" ? tr("修改后重新提交验收", "Resubmit after making changes") : tr("提交给买家验收", "Submit for buyer review")}</h4>
        {delivery && quote.proof.project && stage === "in_progress" && <SellerRevisionFeedback feedback={collaboration?.feedback ?? []} criteria={criteria} currentDeliveryId={delivery.id} current={false} language={language}/>}
        {explainingReturnedStatic && <p className="collaboration-help">{tr("这里会重新提交当前版本。如果修改了网站文件，请先从上传入口保存修正版。", "This form resubmits the current version. If you changed website files, save the revision from the upload panel first.")}</p>}
        <form className="collaboration-submission-form no-print" onSubmit={submit}>
          <label htmlFor={`${id}-submission-note`}>{tr("交付说明", "Delivery note")}</label>
          <textarea id={`${id}-submission-note`} required maxLength={2000} value={note} onChange={event => setNote(event.target.value)} disabled={busy || frozen} rows={3} aria-describedby={`${id}-seller-note-help ${id}-submit-help`} placeholder={tr("说明交付了什么，以及如何回应买家的反馈。", "Describe what you delivered and how you addressed the buyer's feedback.")} />
          <div className="collaboration-field-meta"><span id={`${id}-seller-note-help`}>{tr("卖家陈述，不是独立验证结果。", "A seller statement, not independent verification.")}</span><span>{note.length} / 2000</span></div>
          <p className="collaboration-help" id={`${id}-submit-help`}>{!delivery ? tr("先上传交付文件，并核查当前版本。", "Upload your delivery files and review the current version first.") : !reviewCurrent ? tr("请先核查当前交付版本，再提交验收。", "Review the current delivery version before submitting it.") : !note.trim() ? tr("填写交付说明后，可提交此版本验收。", "Add a delivery note to submit this version for review.") : tr("提交将绑定当前交付版本，等待买家审核。", "Submission is tied to this delivery version and awaits the buyer's review.")}</p>
          <button className="collaboration-button" type="submit" disabled={busy || frozen || !submitReady}><Send size={14} aria-hidden="true" />{explainingReturnedStatic ? tr("提交当前版本和说明", "Resubmit this version with note") : tr("提交验收", "Submit for review")}</button>
        </form>
      </div>}

      {stage === "submitted" && !isBuyer && <p className="collaboration-state-note">{tr("此版本已提交。等待买家接受交付或退回具体修改意见。", "This version has been submitted. Await the buyer's acceptance or specific requests for changes.")}</p>}
      {(stage === "in_progress" || stage === "changes_requested") && isBuyer && <p className="collaboration-state-note">{stage === "changes_requested" ? tr("修改意见已退回，等待卖家修改并重新提交验收。", "Changes have been requested. Await the seller's revision and resubmission.") : tr("卖家正在准备交付；提交后会显示验收和退回操作。", "The seller is preparing the delivery. Acceptance and change-request actions appear after submission.")}</p>}
      {!demoRoleplay && stage === "awaiting_seller" && !isBuyer && <p className="collaboration-state-note">{tr("等待卖家加入记录更新。", "Awaiting the seller's membership update.")}</p>}
      {stage === "accepted" && <p className="collaboration-state-note">{tr("买家已接受交付。接受记录与该版本绑定；接受交付不付款。", "The buyer accepted the delivery. Acceptance is tied to that version and does not make a payment.")}</p>}

      {currentSubmission && <details className="collaboration-details collaboration-submitted-note">
        <summary>{tr("卖家交付说明", "Seller's delivery note")}<ChevronDown size={14} aria-hidden="true" /></summary>
        <div className="collaboration-details-body"><p className="collaboration-statement">{currentSubmission.note}</p><p className="collaboration-help">{tr("由卖家填写，不是独立证明。", "Written by the seller; this is not independent proof.")} <time dateTime={currentSubmission.at}>{displayTime(currentSubmission.at)}</time></p><code>{currentSubmission.deliveryId}</code></div>
      </details>}

      {buyerReviewing && <div className="collaboration-action">
        <h4>{tr("这个版本可以收下吗？", "Ready to accept this version?")}</h4>
        <div className="collaboration-accept no-print"><button className="collaboration-button" type="button" disabled={busy || frozen || !delivery || !reviewCurrent} onClick={onAccept}>{tr("接受交付…", "Accept delivery…")}</button><p className="collaboration-help">{tr("先确认网站是否合适；付款要另点确认。", "Confirm the website meets your needs. Payment is a separate step.")}</p></div>
        <form className="collaboration-return-form no-print" onSubmit={returnDelivery} noValidate>
          <fieldset disabled={busy || frozen || !delivery}>
            <legend>{tr("需要卖家改哪里？", "What should the seller fix?")}</legend>
            <p className="collaboration-help" id={`${id}-return-help`}>{tr("勾选要改的项目。每一项写清哪里不对、希望怎么改。", "Choose what needs fixing. For each item, say what’s wrong and what you’d like changed.")}</p>
            {suggestionNotice && editing && comments[editing.id]?.trim() && <p className="collaboration-suggestion-notice" role="status">{tr("已填入一条草稿。检查一下再发送。", "A draft is ready. Review it before sending.")}</p>}
            {riskDraftConflict && <p className="collaboration-help" role="status"><strong>{criteria.filter(criterion => riskDraftConflicts[criterion.id]).map(criterion => criterionDisplayTitle(criterion, language)).join(tr("、", ", "))} </strong>{tr("已保留你写的意见和原来的报告。要换报告，请先清空对应的意见。", "Your comment and its original report were kept. Clear that comment to attach a different report.")}</p>}
            <div className="collaboration-return-fields">
              {commentChoices.map(choice => {
                const checked = !!selectedCriteria[choice.id];
                const complete = !!comments[choice.id]?.trim() && comments[choice.id].trim().length <= 1000;
                const selectedForEditing = editing?.id === choice.id;
                return <div className="collaboration-return-criterion collaboration-compact-choice" key={choice.id}>
                  <label className="collaboration-criterion-choice">
                    <input type="checkbox" checked={checked} disabled={choice.disabled} onChange={event => {
                      const enabled = event.target.checked;
                      selectComment(choice.id, enabled);
                      if (choice.id === "journey-agreement") setJourneyDraftReportId(enabled ? journeyReport?.id : undefined);
                      if (choice.id === "model-agreement") setModelDraftReportId(enabled ? modelReport?.id : undefined);
                    }} />
                    <span>{choice.title}</span>
                  </label>
                  {choice.disabled && <small>{tr("需要本版的检查报告", "Needs a report for this version")}</small>}
                  {checked && (selectedForEditing ? <small>{tr("正在编辑", "Editing")}</small>
                    : <button type="button" className="text-button collaboration-edit-comment" aria-label={tr(`编辑意见：${choice.title}`, `Edit comment: ${choice.title}`)} aria-controls={`${id}-comment-editor`} onClick={() => openComment(choice.id)}>{complete ? tr("改意见", "Edit") : tr("写意见", "Write")}</button>)}
                </div>;
              })}
            </div>
            {editing && <div className="collaboration-comment-field collaboration-active-comment" id={`${id}-comment-editor`} key={editing.id}>
              <label htmlFor={`${id}-comment`}>{tr(`${editing.title} · 修改意见`, `${editing.title} · Requested changes`)}</label>
              {editingReportStale && <p className="collaboration-help" id={`${id}-stale-comment`} role="status">{tr("这项的报告已更新。请取消勾选后再选一次。你写的意见会保留。", "The report for this item changed. Deselect it and select it again. Your comment will be kept.")}</p>}
              <textarea id={`${id}-comment`} ref={commentField} required maxLength={1000} rows={3} value={comments[editing.id] ?? ""}
                placeholder={tr("比如：我没看到营业时间，请补上。", "For example: I couldn’t find the opening hours. Please add them.")}
                onChange={event => dispatchDraft({type:"edit", criterionId:editing.id, comment:event.target.value})}
                aria-describedby={`${id}-return-help${editingReportStale ? ` ${id}-stale-comment` : ""}`} />
              {editingRisk && <details className="collaboration-details">
                <summary>{tr(`已附第 ${editingRisk.riskIndex + 1} 条 AI 提醒`, `AI indication ${editingRisk.riskIndex + 1} attached`)}</summary>
                <div className="collaboration-details-body"><code>{editingRisk.assessmentId}</code><button type="button" className="text-button" onClick={() => dispatchDraft({type:"unlink", criterionId:editing.id})}>{tr("移除这条提醒", "Remove this indication")}</button></div>
              </details>}
              {editingTechnical && editingReportId && <details className="collaboration-details"><summary>{tr("查看所用检查报告", "View the linked report")}</summary><code>{editingReportId}</code></details>}
              <span className="collaboration-comment-count">{(comments[editing.id] ?? "").length} / 1000</span>
            </div>}
            <p className="collaboration-help" role="status">{!feedbackDraft.length ? tr("先勾选要改的项目。", "Choose at least one item.")
              : staleCommentId ? tr("有检查报告更新，需要重新选择对应项目。", "A check report changed. Select the affected item again.")
              : commentsLeft ? tr(`还要写 ${commentsLeft} 条意见。`, `${commentsLeft} comments still need to be written.`)
              : tr(`将把 ${feedbackDraft.length} 条意见发送给卖家。`, `${feedbackDraft.length} comments are ready to send to the seller.`)}</p>
            <button className="collaboration-button collaboration-button-secondary" type="submit" disabled={busy || frozen || !delivery || !feedbackDraft.length}>
              {staleCommentId ? tr("查看需要重新选择的项目", "Find the item to select again")
                : missingComment ? tr("填写下一条意见", "Write the next comment") : tr("发送修改意见", "Send change requests")}
            </button>
          </fieldset>
        </form>
      </div>}

      <section className="collaboration-feedback" aria-labelledby={`${id}-feedback-heading`}>
        <h4 id={`${id}-feedback-heading`}>{tr("这版的修改意见", "Change requests for this version")} <span>{currentFeedback.length}</span></h4>
        {currentFeedback.length ? <div className="collaboration-feedback-scroll">{feedbackList(currentFeedback)}</div> : <p className="collaboration-help">{tr("买家还没发修改意见。", "The buyer hasn’t sent any change requests.")}</p>}
        {historicalFeedback.length > 0 && <details className="collaboration-details"><summary>{tr(`历史版本反馈（${historicalFeedback.length}）`, `Earlier-version feedback (${historicalFeedback.length})`)}<ChevronDown size={14} aria-hidden="true" /></summary><div className="collaboration-feedback-scroll collaboration-details-body">{feedbackList(historicalFeedback)}</div></details>}
      </section>

      <details className="collaboration-details collaboration-history" ref={historyDetails}>
        <summary ref={historySummary} onClick={() => { if (!historyDetails.current?.open && !busy) onLoadVersions(); }}><span><History size={14} aria-hidden="true" />{tr("版本历史", "Version history")} <small>{tr(`${versions.length} 个已加载`, `${versions.length} loaded`)}</small></span><ChevronDown size={14} aria-hidden="true" /></summary>
        <div className="collaboration-details-body">
          <div className="collaboration-history-toolbar no-print"><button className="collaboration-text-button" type="button" onClick={onLoadVersions} disabled={busy}>{busy && <LoaderCircle className="collaboration-spinner" size={12} aria-hidden="true" />}{tr("刷新版本列表", "Refresh version list")}</button></div>
          {versions.length ? <ul className="collaboration-version-list">{versions.map(version => <li key={version.delivery.id}>
            <div className="collaboration-version-title"><strong>{version.delivery.label}</strong>{version.delivery.sequence !== undefined && <span>v{version.delivery.sequence}</span>}</div>
            <code>{version.delivery.id}</code>
            <p className="collaboration-help">{version.isCurrent ? tr("当前版本 · 保存于", "Current version · saved") : tr("归档于", "Archived")} <time dateTime={version.isCurrent ? version.delivery.submittedAt : version.archivedAt}>{displayTime(version.isCurrent ? version.delivery.submittedAt : version.archivedAt)}</time> · {version.review?.deliveryId === version.delivery.id ? tr("有该版本核查记录", "Version review available") : tr("无该版本核查记录", "No version review")} · {tr(`${version.feedback.length} 条反馈`, `${version.feedback.length} feedback item${version.feedback.length === 1 ? "" : "s"}`)}</p>
            <button className="collaboration-text-button no-print" type="button" onClick={() => onViewVersion(version.delivery.id)} disabled={busy}>{tr("查看此版本", "View this version")}<ArrowUpRight size={12} aria-hidden="true" /></button>
          </li>)}</ul> : <p className="collaboration-help">{tr("没有已加载的归档版本。可刷新列表以获取最新记录。", "No archived versions are loaded. Refresh the list to retrieve the latest records.")}</p>}
        </div>
      </details>
    </div>
  </section>;
}

export default CollaborationPanel;
