"use client";

import {useEffect, useId, useRef, useState} from "react";
import type {Language, ProofAssessment, ProofAssessmentItem, ProofBusinessCheckStep, ProofCriterion, ProofEvidence, ProofQuote, ProofRole} from "@/lib/contracts";
import {assessmentEvidenceNeedPresentation, isAssessmentEvidenceNeed} from "@/lib/assessment-evidence-needs";
import {createRequirementCompletenessCheck, requirementCompletenessExplanation} from "@/lib/assessment-requirement-completeness";
import type {ScopeContext, ScopeTargetCandidate} from "@/lib/scope-clarifications";
import "../scope-clarification.css";

export type RequirementNextStepProps = {
  criterion: ProofCriterion;
  item?: ProofAssessmentItem;
  evidence?: readonly ProofEvidence[];
  humanConfirmed?: boolean;
  businessSteps?: readonly ProofBusinessCheckStep[];
  requirementCompletenessPolicy?: ProofAssessment["requirementCompletenessPolicy"];
  mobileObservation?: {requiredPages: readonly string[]; onOpen?: () => void; disabled?: boolean};
  readOnly?: boolean;
  language: Language;
};

/** A presentation of existing evidence, never a new verdict or acceptance gate. */
export function RequirementNextStep({criterion, item, evidence = [], humanConfirmed = false, businessSteps = [], requirementCompletenessPolicy, mobileObservation, readOnly = false, language}: RequirementNextStepProps) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const currentItem = item?.criterionId === criterion.id ? item : undefined;
  const model = currentItem?.modelJudgment ?? currentItem;
  const sourceFinding = currentItem?.sourceFinding;
  const mobilePages=criterion.id==="mobile"&&mobileObservation?.requiredPages.length&&mobileObservation.requiredPages.every(file=>typeof file==="string"&&file.length>0)?mobileObservation.requiredPages:undefined;
  const completeness=requirementCompletenessPolicy?.schema==="requirement-completeness-v1"&&(requirementCompletenessPolicy.version==="bounded-original-zh-v1"||requirementCompletenessPolicy.version==="bilingual-bounded-v2")
    ?createRequirementCompletenessCheck({businessSteps,version:requirementCompletenessPolicy.version})(criterion):undefined;
  const incompleteSourceSupport=sourceFinding?.status==="supported"&&completeness?.kind==="incomplete";
  const incompleteWholeRequirement=completeness?.kind==="incomplete"&&currentItem?.status!=="changes_suggested"&&sourceFinding?.status!=="changes_suggested";
  const currentEvidence = evidence.filter(row => row.criterionId === criterion.id);
  const ruleFailed = currentEvidence.some(row => row.finding === "fail");
  const ruleSupported = currentEvidence.some(row => row.finding === "pass");
  const ruleHuman = currentEvidence.some(row => row.finding === "needs_human");
  const need = currentItem?.status === "insufficient_evidence" && isAssessmentEvidenceNeed(currentItem.evidenceNeed) ? currentItem.evidenceNeed : undefined;
  const sourceScopeUnconfirmed = sourceFinding?.basis === "declared_html_labels" && !sourceFinding.scopeBinding;
  const recordedHumanStep = tr("本项人工核对已记录；源码事实、AI 建议与人工判断分别保留。整版交付的验收和付款状态，请查看流程中的独立记录。", "The human check for this requirement is recorded. Source facts, AI suggestions and the human decision remain separate. Check the workflow’s separate records for delivery acceptance and payment status.");
  let actor = tr("买家", "Buyer");
  let materials = tr("查看本项原文和交付证据，再决定确认、提出修改或补证。", "Review this requirement and its delivery evidence, then decide whether to confirm it, request changes or ask for evidence.");
  if (ruleFailed) {
    actor = tr("卖家补交，买家复核", "Seller supplies a revision; buyer reviews");
    materials = tr("按本项规则证据核对差异，卖家修正对应交付并提交新版本；买家检查新版本，不沿用旧结果。", "Check the difference against this requirement’s rule evidence. The seller corrects the delivery and submits a new version; the buyer checks that version rather than reusing the old result.");
  } else if (sourceScopeUnconfirmed && !incompleteWholeRequirement) {
    actor = tr("买卖双方", "Buyer and seller");
    materials = tr("源码事实已经单独列出，但还没有确认本项对应哪个页面或表单。双方先明确确认范围，再回到本项检查；不按猜测的页面要求返工。", "Source facts are listed separately, but this requirement’s page or form has not been agreed. Both parties confirm that scope first, then return to this requirement’s checks. Do not request repairs on a guessed page.");
  } else if (sourceFinding?.status === "changes_suggested") {
    actor = tr("卖家补交，买家复核", "Seller supplies a revision; buyer reviews");
    materials = tr("本项已定位的源码证据存在差异。卖家按原始要求修正对应交付并提交新版本，买家重新核对；范围同意不代表修正已经完成。", "The scoped source evidence differs from this requirement. The seller corrects the corresponding delivery and submits a new version for buyer review. Scope agreement does not mean the correction is complete.");
  } else if (incompleteWholeRequirement && completeness) {
    actor = tr("买卖双方", "Buyer and seller");
    materials = `${humanConfirmed ? `${recordedHumanStep} ` : ""}${requirementCompletenessExplanation(completeness, language)}`;
  } else if (sourceFinding?.status === "supported" && (!need || need.reason === "model_unresolved" || need.reason === "no_citations")) {
    materials = humanConfirmed ? recordedHumanStep : tr("已检查的源码条件有支持。买家核对完整要求；未观察的外观或运行能力分别核对，源码事实本身不替代人工判断或整版验收。", "The checked source conditions have support. The buyer reviews the complete requirement. Unobserved appearance or execution needs separate review; source facts do not replace human judgment or delivery acceptance.");
  } else if (currentItem?.status === "changes_suggested" && !sourceFinding) {
    materials = tr("先核对 AI 引文和锁定要求；确认差异属于本项后，再请卖家修改。AI 建议本身不证明交付不符。", "Compare the AI citations with the locked requirement first. Ask the seller for changes only after checking that the difference belongs to this requirement. An AI suggestion alone does not establish a mismatch.");
  } else if (mobilePages) {
    materials=humanConfirmed?recordedHumanStep:tr("买家逐页查看约定页面的手机显示：文字是否可读、内容是否被遮挡或横向溢出、主要链接与按钮是否可见。缺页或无法观察时请卖家补交；看过后再主动确认本项。", "The buyer inspects every agreed page on a mobile-sized screen: readable text, clipped or overflowing content, and visible main links and buttons. Ask the seller for missing or unobservable pages, then explicitly confirm this requirement after inspection.");
  } else if (currentItem?.status === "insufficient_evidence") {
    const reason = need?.reason;
    if (reason === "page_scope" || reason === "requirement_clarification") {
      actor = tr("买卖双方", "Buyer and seller");
      materials = tr("先确认本项对应哪个页面，以及是否限定同一表单；双方明确确认后，再回到本项重新检查。证据不足不等于没有做到。", "First agree which page this requirement applies to and whether it concerns one form. After both parties explicitly confirm that scope, return to this requirement and check again. Insufficient evidence does not mean the work failed.");
    } else if (reason === "manual_interpretation") {
      materials = tr("对照完整要求和交付文字核对含义；还不能仅凭未证实的表述差异要求卖家返工。", "Compare the complete requirement with the delivered wording. An unestablished wording difference alone is not a repair demand.");
    } else if (reason === "record_readback") {
      actor = tr("卖家补证，买家核对", "Seller provides evidence; buyer reviews");
      materials = tr("卖家补充实际提交，以及重新读取后仍能找到对应记录的证据；买家核对两者是否为同一次测试。页面源码或成功提示不能证明已保存。", "The seller provides evidence of an actual submission and a fresh read that still finds its matching record. The buyer checks that both refer to the same test. Page source or a success message does not prove storage.");
    } else if (reason && reason !== "model_unresolved") {
      actor = tr("卖家补证，买家核对", "Seller provides evidence; buyer reviews");
      materials = assessmentEvidenceNeedPresentation(need, language).nextStep;
    } else {
      actor = tr("买卖双方", "Buyer and seller");
      materials = tr("对照本项要求检查现有材料，决定由卖家补充哪些源码或运行证据，再由买家核对。尚未建立结论，不推断交付失败。", "Review the available material against this requirement, agree what source or execution evidence the seller should add, then have the buyer review it. No conclusion is established; delivery failure is not inferred.");
    }
  } else if (humanConfirmed) {
    materials = recordedHumanStep;
  }
  const ruleLabel = ruleFailed ? tr("不符：规则检查发现差异", "Mismatch: rule check found a difference")
    : ruleSupported && !ruleHuman ? tr("规则证据有支持", "Rule evidence supports the checked facts")
    : currentEvidence.length ? tr("规则仍需人工核对", "Rule evidence needs human review") : tr("规则尚无本项结果", "No rule result for this requirement");
  const sourceLabel = incompleteSourceSupport ? sourceFinding?.basis==="locked_business_values"
    ?tr("已核业务值有支持，整条要求仍待核对", "Checked business values have support; the whole requirement still needs review")
    :tr("已核源码子条件有支持，整条要求仍待核对", "Checked source subconditions have support; the whole requirement still needs review")
    : sourceFinding?.status === "supported" ? tr("已证实：源码符合已检查条件", "Established: source meets the checked conditions")
    : sourceFinding?.status === "changes_suggested" ? tr("已证实不符：源码存在差异", "Established mismatch: source differs")
    : sourceFinding ? tr("未知：源码尚不能建立结论", "Unknown: source does not establish a conclusion")
    : incompleteWholeRequirement ? tr("整条要求仍待核对", "The whole requirement still needs review") : undefined;
  const aiLabel = model?.status === "supported" ? currentItem?.modelJudgment ? tr("AI 原始建议符合：仍需核对", "Original AI suggestion: support, still needs review") : tr("AI 已保存建议符合：仍需核对", "Saved AI suggestion: support, still needs review")
    : model?.status === "changes_suggested" ? currentItem?.modelJudgment ? tr("AI 原始建议修改：待核对", "Original AI suggestion: changes, review needed") : tr("AI 已保存建议修改：待核对", "Saved AI suggestion: changes, review needed")
    : model?.status === "insufficient_evidence" ? currentItem?.modelJudgment ? tr("未知：原 AI 证据不足", "Unknown: insufficient original AI evidence") : tr("未知：已保存 AI 证据不足", "Unknown: insufficient saved AI evidence") : tr("AI 尚未运行", "AI has not run");
  return <section className="requirement-next-step" aria-label={tr("本项结果与下一步", "This requirement’s result and next step")} data-criterion-id={criterion.id}>
    <dl>
      <div><dt>{tr("当前证据", "Current evidence")}</dt><dd className="requirement-next-step-layers">{sourceLabel && <strong className={sourceFinding?.status === "changes_suggested" ? "requirement-fact-mismatch" : "requirement-source-fact"}>{sourceLabel}</strong>}<span className={ruleFailed ? "requirement-fact-mismatch" : ""}>{ruleLabel}</span><span>{aiLabel}</span><span>{humanConfirmed ? tr("买家已人工确认本项", "Buyer confirmed this requirement manually") : tr("买家尚未人工确认本项", "Buyer has not confirmed this requirement manually")}</span></dd></div>
      <div><dt>{tr("接下来谁处理", "Who acts next")}</dt><dd>{actor}</dd></div>
      <div><dt>{tr("需要什么", "What is needed")}</dt><dd>{materials}</dd></div>
    </dl>
    {mobilePages&&<div className="requirement-mobile-observation">
      <p><strong>{tr("约定的全部页面：", "All agreed pages: ")}</strong>{mobilePages.map((file,index)=><span key={`${index}-${file}`}>{index>0?" · ":""}<code>{file}</code></span>)}</p>
      {!readOnly&&mobileObservation?.onOpen&&<div className="scope-actions no-print"><button type="button" className="button primary" disabled={!!mobileObservation.disabled} onClick={()=>{if(!mobileObservation.disabled)mobileObservation.onOpen?.();}}>{tr("打开手机显示检查", "Open mobile checks")}</button><small>{tr("只打开现有浏览器检查，不会运行测量或 AI，也不会勾选、验收或付款。", "Opens existing browser checks only. Does not measure, run AI, tick a confirmation, accept or pay.")}</small></div>}
      <p className="requirement-next-step-limit">{tr("先用测量按钮记录各页宽度，再点结果中的 375px 查看；也可在现有预览中逐页选页面和 375px。静态预览停用脚本及外部资源，实际操作能力需另行验证；宽度读数不等于手机可用。", "Use the measurement button to record page widths, then inspect each page’s 375px result, or select each page and 375px in the existing preview. Scripts and external resources are disabled there; working interactions need separate verification. Width readings do not establish mobile usability.")}</p>
    </div>}
    <p className="requirement-next-step-limit">{tr("各层证据分别记录；源码支持不证明页面可见、功能已运行或交付已验收。", "Evidence layers remain separate. Source support does not prove visibility, execution or accepted delivery.")}</p>
  </section>;
}

type Target = ScopeTargetCandidate["target"];
export type ScopeProposalInput = {deliveryId: string; criterionId: string; criterionSource: string; expectedLatestId: string | null; target: Target; basisNote: string};
export type ScopeConfirmationInput = {deliveryId: string; proposalId: string; proposalDigest: string; confirm: true; basisNote: string};
export type ScopeClarificationPanelProps = {
  quote: ProofQuote;
  criterion: ProofCriterion;
  role: ProofRole;
  language: Language;
  scopeContext?: ScopeContext;
  candidates: readonly ScopeTargetCandidate[];
  busy?: boolean;
  readOnly?: boolean;
  onPropose?: (input: ScopeProposalInput) => Promise<boolean>;
  onConfirm?: (input: ScopeConfirmationInput) => Promise<boolean>;
  onRecheck?: (criterionId: string) => void;
  onReload?: () => void;
};
type ScopeDraft = {file: string; formId: string};
type ScopeViewProps = ScopeClarificationPanelProps & {
  draft: ScopeDraft;
  working: boolean;
  notice: string;
  id: string;
  onChooseFile: (file: string) => void;
  onChooseForm: (formId: string) => void;
  onSaveProposal: (target: Target) => void;
  onSaveConfirmation: () => void;
};
const sameTarget = (a: Target, b: Target) => a.kind === b.kind && a.file === b.file && (a.kind !== "form" || b.kind === "form" && a.formId === b.formId);
function uniqueScopeState(context: ScopeContext | undefined, criterionId: string) {
  const matches = context?.states.filter(row => row.criterionId === criterionId) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}
function targetName(target: Target, language: Language) {
  return target.kind === "form" ? `${target.file} · ${language === "zh" ? "表单" : "form"} #${target.formId}` : `${target.file} · ${language === "zh" ? "整页" : "whole page"}`;
}

/** Pure view for real callbacks/SSR checks. Scope authority comes from the saved server context. */
export function ScopeClarificationView(props: ScopeViewProps) {
  const {quote, criterion, role, language, scopeContext, candidates, readOnly = false, draft, working, notice, id} = props;
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const state = uniqueScopeState(scopeContext, criterion.id);
  const latest = state?.latest;
  const consistent = !latest || latest.criterionId === criterion.id && latest.criterionSource === criterion.source;
  const bothRecorded = !!latest && latest.confirmations.some(row => row.role === "buyer") && latest.confirmations.some(row => row.role === "seller");
  const invalidContext = !state || !consistent || state.status !== "none" && !latest || state.status === "none" && !!latest || state.status === "confirmed" && !bothRecorded || state.status === "pending" && bothRecorded;
  const unavailable = invalidContext || state?.status === "unavailable";
  const disabled = working || readOnly || invalidContext || !quote.proof.delivery;
  const files = [...new Set(candidates.map(row => row.target.file))];
  const forms = candidates.filter(row => row.target.file === draft.file && row.target.kind === "form");
  const target = candidates.find(row => row.target.file === draft.file && (draft.formId ? row.target.kind === "form" && row.target.formId === draft.formId : row.target.kind === "page"))?.target;
  const ownConfirmation = latest?.confirmations.some(row => row.role === role) ?? false;
  const confirmed = !unavailable && state.status === "confirmed";
  const pending = !unavailable && state.status === "pending";
  const draftDiffers = !!target && !!latest && !sameTarget(target, latest.target);
  return <section className="scope-clarification" aria-label={tr("逐项确认检查范围", "Confirm this requirement’s check scope")} data-criterion-id={criterion.id}>
    <div className="scope-clarification-heading"><strong>{tr("先明确检查哪一页或表单", "Agree which page or form to check")}</strong><span>{unavailable ? tr("待重新读取", "Reload needed") : confirmed ? tr("双方已确认范围", "Both parties confirmed scope") : pending ? tr("等待双方分别确认", "Individual confirmations pending") : tr("尚无范围提案", "No scope proposal yet")}</span></div>
    <p className="scope-clarification-limit">{tr("只澄清这条原有要求的适用范围，不新增要求，也不表示交付已通过。", "Clarifies where this existing requirement applies. It adds no requirement and does not pass the delivery.")}</p>
    <details className="scope-original"><summary>{tr("查看本项完整原文", "Read this requirement’s complete wording")}</summary><blockquote>{criterion.source}</blockquote></details>
    {invalidContext ? <p role="status">{tr("当前范围记录尚不能用于这条要求，请重新读取后再提案或确认。", "The current scope record cannot yet be used for this requirement. Reload before proposing or confirming.")}{props.onReload && <button type="button" className="scope-secondary" disabled={working} onClick={props.onReload}>{tr("重新读取范围记录", "Reload scope records")}</button>}</p> : <>
      {unavailable && <p className="scope-draft-note" role="status">{tr("旧提案暂不能用于当前交付。请从本版页面重新选择并提出提案，双方再分别确认；旧记录保留。", "The previous proposal cannot be used for this delivery. Choose a page from this version and propose scope again for each party to confirm. The old record is retained.")}</p>}
      {latest && <div className="scope-saved-proposal">
        <strong>{unavailable ? tr("旧提案记录 · 本版不可用", "Previous proposal record · unavailable for this version") : tr("当前保存的提案", "Current saved proposal")}</strong><p>{targetName(latest.target, language)}</p>
        <ul className="scope-confirmations">{(["buyer", "seller"] as const).map(side => <li key={side}><span>{side === "buyer" ? tr("买家", "Buyer") : tr("卖家", "Seller")}</span><strong>{latest.confirmations.some(row => row.role === side) ? tr("已明确确认", "Explicitly confirmed") : tr("待确认", "Not confirmed")}</strong></li>)}</ul>
        <p className="scope-mode-note">{latest.confirmationMode === "owner-roleplay" ? tr("同一账号的双角色演练；不是两个独立参与者的确认。", "Both roles are rehearsed by one account; these are not confirmations by two independent participants.") : tr("双方分别以各自的项目身份确认。", "Each party confirms using their own project role.")}</p>
        {confirmed && latest.basis.deliveryId !== quote.proof.delivery?.id && <p className="scope-mode-note">{tr("这份范围约定沿用到当前交付；旧版证据不随之通过，仍需检查本版。", "This scope agreement carries to the current delivery. Earlier evidence does not pass this version; check it again.")}</p>}
        {pending && <div className="scope-actions"><button type="button" className="scope-primary" disabled={disabled || ownConfirmation || !props.onConfirm} onClick={props.onSaveConfirmation}>{ownConfirmation ? tr("本方已确认，等待对方", "Your confirmation is saved; await the other party") : role === "buyer" ? tr("买家明确同意此范围", "Buyer: agree to this scope") : tr("卖家明确同意此范围", "Seller: agree to this scope")}</button></div>}
      </div>}
      {confirmed && <div className="scope-actions"><button type="button" className="scope-primary" disabled={working || !props.onRecheck} onClick={() => props.onRecheck?.(criterion.id)}>{tr("回到本项重新检查", "Return to this requirement and recheck")}</button><small>{tr("只打开本项检查，不自动运行 AI、验收或付款。", "Opens this requirement’s checks; it does not run AI, accept work or pay.")}</small></div>}
      {!readOnly && <details className="scope-proposal-editor" open={!latest || unavailable || undefined}>
        <summary>{latest ? tr("提出另一份范围提案", "Propose a different scope") : tr("选择页面并提出范围", "Choose a page and propose scope")}</summary>
        <p>{tr("候选来自当前上传 HTML 的文件名和已声明表单，不是 AI 猜测；选择本身尚未保存。", "Candidates are filenames and declared forms in the current HTML upload, not AI guesses. A selection alone is not saved.")}</p>
        <div className="scope-selectors">
          <label htmlFor={`${id}-file`}>{tr("页面文件", "Page file")}<select id={`${id}-file`} value={draft.file} disabled={disabled || !files.length} onChange={event => props.onChooseFile(event.target.value)}><option value="">{tr("请选择页面", "Choose a page")}</option>{files.map(file => <option value={file} key={file}>{file}</option>)}</select></label>
          <label htmlFor={`${id}-form`}>{tr("限定表单（可选）", "Limit to a form (optional)")}<select id={`${id}-form`} value={draft.formId} disabled={disabled || !draft.file || !forms.length} onChange={event => props.onChooseForm(event.target.value)}><option value="">{tr("整页，不限定表单", "Whole page, no form limit")}</option>{forms.map(row => row.target.kind === "form" ? <option value={row.target.formId} key={row.target.formId}>#{row.target.formId}</option> : null)}</select></label>
        </div>
        {!files.length && <p role="status">{tr("当前没有可选的 HTML 页面。请先由卖家提交网站文件，再确认范围。", "No HTML page is available. The seller should submit website files before scope is agreed.")}</p>}
        {target && <p className="scope-draft-note">{tr("尚未提交的选择：", "Unsaved selection: ")}{targetName(target, language)}{draftDiffers ? tr("。提交新提案后，双方需对新提案分别确认。", ". After saving a new proposal, both parties must confirm that proposal separately.") : ""}</p>}
        <button type="button" className="scope-primary" disabled={disabled || !target || !props.onPropose || !unavailable && !!latest && !!target && sameTarget(target, latest.target)} onClick={() => {if (target) props.onSaveProposal(target);}}>{tr("提出此范围，等待双方确认", "Propose this scope for both parties to confirm")}</button>
      </details>}
    </>}
    {readOnly && <p className="scope-mode-note">{tr("这里只读查看保存记录；不修改范围或确认状态。", "Saved records are read-only here; scope and confirmations cannot be changed.")}</p>}
    {notice && <p className="scope-notice" role="status" aria-live="polite">{notice}</p>}
  </section>;
}

function ScopeClarificationEditor(props: ScopeClarificationPanelProps) {
  const {quote, criterion, language, scopeContext} = props;
  const id = useId();
  const [draft, setDraft] = useState<ScopeDraft>({file: "", formId: ""});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const alive = useRef(false);
  const inFlight = useRef(false);
  const activeRequest = useRef(0);
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  useEffect(() => {alive.current = true; return () => {alive.current = false; activeRequest.current++;};}, []);
  const latest = uniqueScopeState(scopeContext, criterion.id)?.latest;
  async function save(action: () => Promise<boolean>) {
    if (inFlight.current || props.busy || props.readOnly || !quote.proof.delivery) return;
    inFlight.current = true;
    const request = ++activeRequest.current;
    setPending(true); setNotice("");
    try {
      const saved = await action();
      if (!alive.current || request !== activeRequest.current) return;
      setNotice(saved ? tr("已保存，请以上方重新读取的范围记录为准。", "Saved. Use the refreshed scope record above.") : tr("这次没有保存。请重新读取当前记录，再核对范围和本方身份。", "This change was not saved. Reload the current record and check the scope and your role."));
    } catch {
      if (alive.current && request === activeRequest.current) setNotice(tr("范围操作未能完成。当前选择保留；请重新读取记录后再试。", "The scope action did not complete. Your selection is retained; reload the record before retrying."));
    } finally {if (alive.current && request === activeRequest.current) {inFlight.current = false; setPending(false);}}
  }
  return <ScopeClarificationView {...props} draft={draft} working={!!props.busy || pending} notice={notice} id={id}
    onChooseFile={file => {setDraft({file, formId: ""}); setNotice("");}}
    onChooseForm={formId => {setDraft(value => ({...value, formId})); setNotice("");}}
    onSaveProposal={target => {if (props.onPropose && quote.proof.delivery) void save(() => props.onPropose!({deliveryId: quote.proof.delivery!.id, criterionId: criterion.id, criterionSource: criterion.source, expectedLatestId: latest?.id ?? null, target, basisNote: tr("提议明确本项的页面或表单范围；原始要求保持不变，仍待双方分别确认。", "Propose this requirement’s page or form scope; original wording is unchanged and each party must confirm separately.")}));}}
    onSaveConfirmation={() => {if (props.onConfirm && quote.proof.delivery && latest) void save(() => props.onConfirm!({deliveryId: quote.proof.delivery!.id, proposalId: latest.id, proposalDigest: latest.digest, confirm: true, basisNote: tr("明确同意此提案的页面或表单范围；这不确认交付完成，也不接受交付或付款。", "Explicitly agree to this proposal’s page or form scope; this does not confirm completion, accept delivery or pay.")}));}}/>;
}

/** Key local selections and async notices to the exact current delivery/requirement/proposal. */
export function ScopeClarificationPanel(props: ScopeClarificationPanelProps) {
  const latest = uniqueScopeState(props.scopeContext, props.criterion.id)?.latest;
  const identity = JSON.stringify([props.quote.id, props.quote.proof.delivery?.id ?? null, props.criterion.id, props.criterion.source, props.role, latest?.id ?? null, latest?.digest ?? null]);
  return <ScopeClarificationEditor key={identity} {...props}/>;
}
