"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck,
  ChevronRight, CircleAlert, ClipboardCheck, Clock3, Code2, FileCheck2,
  FileCode2, FileText, FlaskConical, Globe2, History, Info, Monitor,
  LoaderCircle, LockKeyhole, Plus, ReceiptText, RefreshCw, ShieldCheck,
  Smartphone, Sparkles, SquareCheckBig, Undo2, Upload, X, ScanLine,
} from "lucide-react";
import type {
  AppConfig, CheckoutResult, Currency, Language, ProofCriterion,
  ProofDeliveryVersion, ProofEvent, ProofEvidence, ProofPaymentReconciliation, ProofQuote, ProofRole, RequirementDraft, RequirementCoverageUnit,
} from "@/lib/contracts";
import { runLayoutProbe } from "@/lib/layout-probe";
import { LayoutCheckPanel } from "./components/LayoutCheckPanel";
import { runBrowserChecks } from "@/lib/browser-check-probe";
import { BrowserCheckPanel } from "./components/BrowserCheckPanel";
import { runBusinessChecks } from "@/lib/business-check-probe";
import { BusinessCheckEditor, BusinessChecksSource, BusinessChecksPanel, BusinessAcceptanceDecision, businessDraftReady, businessDraftItems, type BusinessCheckDraft } from "./components/BusinessChecksPanel";
import { BusinessCheckSuggestions, suggestionAlreadyDrafted, type BusinessSuggestionCandidate, type BusinessSuggestionInput } from "./components/BusinessCheckSuggestions";
import type { BusinessCheckSuggestions as BusinessSuggestionResult } from "@/lib/business-check-suggestions";
import { EvidenceHistoryPanel } from "./components/EvidenceHistoryPanel";
import { RequirementCoveragePanel, RequirementCoverageSource, type CoverageDraftDecision } from "./components/RequirementCoveragePanel";
import { summaryCoverageUnits } from "@/lib/requirement-coverage";
import { CollaborationPanel, type CollaborationHistoryHandle, type FeedbackSuggestion } from "./components/CollaborationPanel";
import { VersionViewer } from "./components/VersionViewer";
import { RequirementsIntake } from "./components/RequirementsIntake";
import { DeliveryAssessment } from "./components/DeliveryAssessment";
import type { RiskReviewInput } from "@/lib/risk-reviews";
import { readDeliveryUpload, deliveryFileUrl, isHtmlDeliveryPath } from "@/lib/delivery-upload";
import { ResourceChecks } from "./components/ResourceChecks";
import { DeliveryComparison } from "./components/DeliveryComparison";
import { isOlderDelivery } from "@/lib/delivery-comparison";
import { DeliveryOverview } from "./components/DeliveryOverview";
import { criterionDisplayTitle } from "@/lib/delivery-overview";
import { buildBusinessSpotlight } from "@/lib/business-spotlight";
import { WorkflowChoice, type WorkflowChoiceValue } from "./components/WorkflowChoice";
import { GettingStarted } from "./components/GettingStarted";
import { AuthorizationStart } from "./components/AuthorizationStart";
import { RequirementsSource, RequirementsDraftSource } from "./components/RequirementsSource";
import "./layout-check.css";
import "./browser-check.css";
import "./business-check.css";
import "./collaboration.css";
import "./requirements.css";
import "./requirement-coverage.css";
import "./smooth-flow.css";
import "./chain-flow.css";
import "./sandbox-login-help.css";

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function apiRequest<T>(path: string, method = "GET", body?: unknown, demoRole: ProofRole = "buyer"): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "x-proof-demo-role": demoRole },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : `Request failed (${response.status})`;
    throw new RequestError(message, response.status);
  }
  return data as T;
}

function isProof(value: unknown): value is ProofQuote {
  return !!value && typeof value === "object" && "workflow" in value && value.workflow === "proof-v1" && "proof" in value && !!value.proof;
}

type ModalState = { kind: "authorize"; orderId: string } | { kind: "void" } | null;
type ProjectMode = "custom" | "demo";
type CaseResult = {quote: ProofQuote; role?: ProofRole};
type CaseList = {quotes: unknown[]; roles?: Record<string, ProofRole>};
type BrowserStepDraft = { from: string; text: string; to: string };

const DEFAULT_PAGES = "index.html";

function inputLines(value: string) {
  return value.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("zh");
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [records, setRecords] = useState<ProofQuote[]>([]);
  const [quote, setQuote] = useState<ProofQuote | null>(null);
  const [role, setRole] = useState<ProofRole>("buyer");
  const [workspaceRole, setWorkspaceRole] = useState<ProofRole>("buyer");
  const request = <T,>(path: string, method = "GET", body?: unknown) => apiRequest<T>(path, method, body, workspaceRole);
  const [recordRoles, setRecordRoles] = useState<Record<string, ProofRole>>({});
  const [collaborative, setCollaborative] = useState(true);
  const [customRoleDemo, setCustomRoleDemo] = useState(true);
  const [sandboxRehearsal, setSandboxRehearsal] = useState(false);
  const [sandboxCollaboration, setSandboxCollaboration] = useState(false);
  const [invitation, setInvitation] = useState<{url: string; email: string; expiresAt: string}>();
  const [versions, setVersions] = useState<ProofDeliveryVersion[]>([]);
  const [viewedVersion, setViewedVersion] = useState<ProofDeliveryVersion>();
  const [deliveryConsent, setDeliveryConsent] = useState(false);
  const [showDeliveryAcceptance, setShowDeliveryAcceptance] = useState(false);
  const [feedbackSuggestion, setFeedbackSuggestion] = useState<FeedbackSuggestion>();
  const feedbackSerial = useRef(0);
  const operationLock = useRef(false);
  const [clientName, setClientName] = useState("");
  const [currency, setCurrency] = useState<Currency>("AUD");
  const [projectMode, setProjectMode] = useState<ProjectMode>("custom");
  const [projectStep, setProjectStep] = useState<0 | 1>(0);
  const [intakeStarted, setIntakeStarted] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectSummary, setProjectSummary] = useState("");
  const [projectAmount, setProjectAmount] = useState("");
  const [requirementsDraft, setRequirementsDraft] = useState<RequirementDraft>();
  const [requirementsConfirmed, setRequirementsConfirmed] = useState(false);
  const [requirementsFromBrief, setRequirementsFromBrief] = useState(false);
  const [requiredPagesInput, setRequiredPagesInput] = useState(DEFAULT_PAGES);
  const [manualRequirementsInput, setManualRequirementsInput] = useState("");
  const [browserSteps, setBrowserSteps] = useState<BrowserStepDraft[]>([]);
  const [coverageDecisions, setCoverageDecisions] = useState<Record<string, CoverageDraftDecision>>({});
  const [coverageConfirmed, setCoverageConfirmed] = useState(false);
  const [businessDrafts, setBusinessDrafts] = useState<BusinessCheckDraft[]>([]);
  const [businessConfirmed, setBusinessConfirmed] = useState(false);
  const [businessExceptionReason, setBusinessExceptionReason] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reconciliation, setReconciliation] = useState<{ quoteId: string; result: ProofPaymentReconciliation } | null>(null);
  const [configError, setConfigError] = useState(false);
  const [returnOrder, setReturnOrder] = useState<{ proofId: string; orderId: string } | null>(null);
  const [manualChecks, setManualChecks] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [now, setNow] = useState(0);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("mobile");
  const [previewFile, setPreviewFile] = useState("index.html");
  const [previewEntry, setPreviewEntry] = useState(0);
  const [workspaceView, setWorkspaceView] = useState<"workbench" | "audit" | "history">("workbench");
  const [workspacePanel, setWorkspacePanel] = useState<"agreement" | "delivery" | "payment">("agreement");
  const [deliveryTab, setDeliveryTab] = useState<"preview" | "evidence" | "layout">("preview");
  const [layoutProgress, setLayoutProgress] = useState<{done: number; total: number}>();
  const [browserCheckProgress, setBrowserCheckProgress] = useState<{done: number; total: number}>();
  const [businessCheckProgress, setBusinessCheckProgress] = useState<{done: number; total: number}>();
  const [criterionIndex, setCriterionIndex] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const layoutController = useRef<AbortController | null>(null);
  const browserCheckController = useRef<AbortController | null>(null);
  const browserCheckSavePending = useRef(false);
  const businessCheckController = useRef<AbortController | null>(null);
  const businessCheckSavePending = useRef(false);
  const currentBrowserContext = useRef("");
  const currentDelivery = useRef("");
  const acceptanceRef = useRef<HTMLDivElement>(null);
  const completedCollaborationRef = useRef<HTMLDetailsElement>(null);
  const collaborationHistoryRef = useRef<CollaborationHistoryHandle>(null);

  let coverageUnits: RequirementCoverageUnit[] = [];
  let coverageError = "";
  try { if (projectSummary.trim()) coverageUnits = summaryCoverageUnits(projectSummary.trim()); }
  catch (cause) { coverageError = cause instanceof Error ? cause.message : tr("需求原文暂时无法整理，请检查长度和内容。", "Could not prepare the source requirements. Check their length and content."); }
  const coverageRows = coverageUnits.map(unit => coverageDecisions[unit.id] ?? {id: unit.id, disposition: "include" as const});
  const coverageReady = !!coverageUnits.length && !coverageError && coverageRows.every(row => row.disposition !== "pending" && (row.disposition !== "exclude" || !!row.reason?.trim()));

  const businessDraftKey = JSON.stringify(businessDrafts);
  const coverageDraftKey = JSON.stringify(coverageRows);
  const businessDraftsReady = businessDraftReady(businessDrafts, coverageUnits, coverageRows, inputLines(requiredPagesInput));

  const proof = quote?.proof;
  const collaboration = proof?.collaboration;
  const roleplay = proof?.demoRoleplay === true;
  const sandboxRoleplay = proof?.sandboxRehearsal === true;
  const sampleRoleplay = roleplay && proof?.demoSampleProject === true;
  const displayRole = collaboration && !roleplay ? role : workspaceRole;
  const buyer = displayRole === "buyer";
  const sellerEntry = !quote && workspaceRole === "seller";
  const welcomeActive = !quote && !sellerEntry && !intakeStarted;
  const roleRecords = records.filter(item => item.proof.demoRoleplay || (recordRoles[item.id] ?? "buyer") === workspaceRole);
  const delivery = proof?.delivery;
  currentDelivery.current = `${quote?.id ?? ""}:${delivery?.id ?? ""}`;
  const customProject = proof?.project;
  const custom = !!customProject;
  const customView = quote ? custom : projectMode === "custom";
  const deliveryFiles = delivery?.files;
  const requiredPages = customProject?.requiredPages ?? ["index.html", "services.html", "contact.html"];
  const htmlFiles = Object.keys(deliveryFiles ?? {}).filter(file => file.toLowerCase().endsWith(".html")).sort();
  const previewPages = [...new Set([...requiredPages, ...htmlFiles])];
  const deliverySequence = delivery?.sequence ?? (delivery?.variant === "fixed" ? 2 : 1);
  const previewAvailable = !!deliveryFiles
    && Object.hasOwn(deliveryFiles, previewFile)
    && typeof deliveryFiles[previewFile] === "string";
  const reviewCurrent = !!delivery && proof?.review?.deliveryId === delivery.id;
  const authorized = proof?.paymentState === "authorized";
  const captured = proof?.paymentState === "captured";
  const voided = proof?.paymentState === "voided";
  const closedUnpaid = proof?.paymentState === "closed_unpaid";
  const expired = authorized && !!proof?.authorizationExpiresAt && now > 0 && Date.parse(proof.authorizationExpiresAt) <= now;
  const evidence = reviewCurrent ? delivery.evidence : [];
  const failed = evidence.some(item => item.finding === "fail");
  const humanCriteria = proof?.criteria.filter(criterion => evidence.some(item => item.criterionId === criterion.id && item.finding === "needs_human")) ?? [];
  const evidenceComplete = !!proof && proof.criteria.every(criterion => evidence.some(item => item.criterionId === criterion.id));
  const acceptedCurrent = !!delivery && collaboration?.stage === "accepted" && collaboration.acceptance?.deliveryId === delivery.id;
  // Acceptance survives a PayPal redirect; fresh payment consent never does.
  const confirmedManualChecks = acceptedCurrent ? collaboration.acceptance!.manualChecks : manualChecks;
  const allHumanChecked = humanCriteria.every(criterion => confirmedManualChecks.includes(criterion.id));
  const pendingHumanCriteria = humanCriteria.filter(criterion => !confirmedManualChecks.includes(criterion.id));
  const pendingCapture = proof?.paymentOperation === "capture";
  const pendingVoid = proof?.paymentOperation === "void";
  const paymentPending = pendingCapture || pendingVoid;
  const deliveryUnlocked = quote?.status === "approved" && !paymentPending
    && ((authorized && !expired) || (custom && proof?.paymentState === "unfunded"));
  const canManageDelivery = !buyer && deliveryUnlocked && (!collaboration || ["in_progress", "changes_requested"].includes(collaboration.stage));
  const canCheckDelivery = deliveryUnlocked && (!collaboration || ["in_progress", "changes_requested", "submitted"].includes(collaboration.stage));
  const canObserveBrowser = !!quote && !!deliveryFiles && ["approved", "paid"].includes(quote.status) && !paymentPending;
  const businessChecksConfigured = !!customProject?.businessChecks?.length;
  const businessReport = delivery?.businessChecks?.deliveryId === delivery?.id ? delivery?.businessChecks : undefined;
  const businessHasExceptions = !!businessReport && (businessReport.summary.issues > 0 || businessReport.summary.unavailable > 0);
  const businessDecisionReady = !businessChecksConfigured || !!businessReport && (!businessHasExceptions || businessExceptionReason.trim().length >= 10);
  const businessDecision = businessChecksConfigured && businessReport ? {reportId: businessReport.id, ...(businessHasExceptions ? {exceptionReason: businessExceptionReason.trim()} : {})} : undefined;
  const canAcceptDelivery = buyer && collaboration?.stage === "submitted" && deliveryUnlocked && reviewCurrent && evidenceComplete && !failed && allHumanChecked && deliveryConsent && businessDecisionReady;
  const canCapture = buyer && (!collaboration || collaboration.stage === "accepted") && authorized && !pendingVoid && (pendingCapture || (!expired && reviewCurrent && evidenceComplete && !failed && allHumanChecked && consent && (acceptedCurrent || businessDecisionReady)));
  const aiMode = quote?.aiMode ?? (projectMode === "demo" || customRoleDemo ? "demo" : config?.aiMode);
  const paymentMode = quote?.paymentMode ?? (sandboxRehearsal || sandboxCollaboration ? "sandbox" : projectMode === "demo" || collaborative || customRoleDemo ? "demo" : config?.paymentMode);
  const canReconcile = authorized && paymentPending && quote?.paymentMode === "sandbox";
  const currentReconciliation = reconciliation?.quoteId === quote?.id ? reconciliation?.result : null;
  const money = (cents: number, unit = quote?.currency ?? currency) => new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-AU", {
    style: "currency", currency: unit, currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
  const time = (value: string, full = false) => new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-AU", {
    ...(full ? { month: "short", day: "numeric" } : {}), hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => { setRequirementsConfirmed(false); setCoverageConfirmed(false); }, [requirementsDraft?.id, requiredPagesInput, manualRequirementsInput, browserSteps, projectTitle, projectSummary, projectAmount, currency]);

  useEffect(() => {
    let savedDetails: { element: HTMLDetailsElement; open: boolean }[] = [];
    const expandForPrint = () => {
      if (savedDetails.length) return;
      savedDetails = Array.from(document.querySelectorAll<HTMLDetailsElement>(".cockpit-shell details"))
        .map(element => ({ element, open: element.open }));
      savedDetails.forEach(({ element }) => { element.open = true; });
    };
    const restoreAfterPrint = () => {
      savedDetails.forEach(({ element, open }) => { element.open = open; });
      savedDetails = [];
    };
    window.addEventListener("beforeprint", expandForPrint);
    window.addEventListener("afterprint", restoreAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", expandForPrint);
      window.removeEventListener("afterprint", restoreAfterPrint);
      restoreAfterPrint();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const requestedRole = url.searchParams.get("side") === "seller" ? "seller" : "buyer";
    const proofId = url.searchParams.get("proof");
    const orderId = url.searchParams.get("token");
    const cancelled = url.searchParams.get("cancelled") === "1";
    if (proofId && orderId && !cancelled) setReturnOrder({ proofId, orderId });
    setWorkspaceRole(requestedRole);
    const returned = proofId ? apiRequest<CaseResult>(`/api/quotes/${encodeURIComponent(proofId)}`, "GET", undefined, requestedRole) : Promise.resolve(null);
    Promise.allSettled([
      request<AppConfig>("/api/config"),
      request<CaseList>("/api/proofs"),
      returned,
    ]).then(([settings, history, restored]) => {
      if (!active) return;
      if (settings.status === "fulfilled") setConfig(settings.value);
      else setConfigError(true);
      if (history.status === "fulfilled") {setRecords(history.value.quotes.filter(isProof)); setRecordRoles(history.value.roles ?? {});}
      else setError("案例记录未能加载 / Could not load case history.");
      if (restored.status === "fulfilled" && restored.value) {
        if (isProof(restored.value.quote)) {
          setQuote(restored.value.quote);
          setRole(restored.value.role ?? "buyer");
          setWorkspaceRole(restored.value.quote.proof.collaboration ? restored.value.role ?? "buyer" : requestedRole);
          setLanguage(restored.value.quote.language);
        }
        else setError("返回的案例格式不受支持 / Unsupported case format.");
      } else if (proofId) setError("无法恢复返回的案例，请从记录重新打开 / Could not restore the returned case.");
      if (cancelled) {
        const restoredLanguage = restored.status === "fulfilled" && isProof(restored.value?.quote)
          ? restored.value.quote.language : "zh";
        setNotice(restoredLanguage === "zh"
          ? "你已取消本次 PayPal 预授权批准。页面没有自动完成预授权或扣款；请以保存的付款状态为准，需要时可重新尝试。"
          : "You cancelled this PayPal approval. This page did not authorize or capture automatically. The saved payment state remains authoritative; you can try again when ready.");
      }
      setLoading(false);
    });
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    setManualChecks([]);
    setConsent(false);
    setDeliveryConsent(false);
    setShowDeliveryAcceptance(false);
    setPreviewFile("index.html");
  }, [quote?.id, delivery?.id, proof?.review?.reviewedAt, collaboration?.stage, collaboration?.submission?.at]);

  useEffect(() => {setBusinessConfirmed(false);}, [projectSummary, requiredPagesInput, coverageDraftKey, businessDraftKey]);
  useEffect(() => {setBusinessExceptionReason(""); setDeliveryConsent(false); setConsent(false);}, [quote?.id, delivery?.id, businessReport?.id]);

  useEffect(() => {
    setDeliveryTab("preview");
    setCriterionIndex(0);
    setFeedbackSuggestion(undefined);
    layoutController.current?.abort();
  }, [delivery?.id]);

  useEffect(() => () => { layoutController.current?.abort(); }, []);

  useLayoutEffect(() => {
    currentBrowserContext.current = `${quote?.id ?? ""}:${delivery?.id ?? ""}:${displayRole}`;
    // Context changes and unmount invalidate an in-flight observation, never a received save.
    browserCheckController.current?.abort(); businessCheckController.current?.abort();
    return () => { browserCheckController.current?.abort(); businessCheckController.current?.abort(); };
  }, [quote?.id, delivery?.id, displayRole]);

  useEffect(() => {
    if (!quote?.id || !delivery?.id) return;
    let cancelled = false;
    apiRequest<{versions: ProofDeliveryVersion[]}>(`/api/proofs/${quote.id}/versions`, "GET", undefined, workspaceRole)
      .then(result => {if (!cancelled) setVersions(result.versions);})
      .catch(() => {if (!cancelled) setVersions([]);});
    return () => {cancelled = true;};
  }, [quote?.id, delivery?.id, workspaceRole]);

  useEffect(() => {
    setPendingFiles([]);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
        if (folderInputRef.current) folderInputRef.current.value = "";
    setInvitation(undefined); setVersions([]); setViewedVersion(undefined);
  }, [quote?.id]);

  useEffect(() => {
    setWorkspacePanel(proof?.paymentOperation ? "payment" : !quote || quote.status === "draft" ? "agreement"
      : collaboration?.stage === "accepted" || collaboration?.stage === "submitted" && !buyer ? "payment"
      : proof?.paymentState === "authorized" || (custom && proof?.paymentState === "unfunded") ? "delivery" : "payment");
  }, [quote?.id, quote?.status, proof?.paymentState, proof?.paymentOperation, custom, collaboration?.stage, buyer]);

  useEffect(() => {
    if (!modal) return;
    returnFocus.current = document.activeElement as HTMLElement;
    modalRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; returnFocus.current?.focus(); };
  }, [modal]);

  function apply(next: ProofQuote, nextRole?: ProofRole) {
    if (!isProof(next)) throw new Error(tr("服务器返回的案例格式不受支持。", "The server returned an unsupported case."));
    setQuote(next);
    if (nextRole) {setRole(nextRole); setRecordRoles(old => ({...old, [next.id]: nextRole}));}
    setRecords(old => [next, ...old.filter(item => item.id !== next.id)]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }

  function clearReturnContext() {
    setReturnOrder(null);
    const url = new URL(window.location.href);
    ["proof", "side", "token", "PayerID", "cancelled"].forEach(key => url.searchParams.delete(key));
    window.history.replaceState({}, "", url);
  }

  async function openCase(item: ProofQuote) {
    await run("open", async () => {
      const result = await request<CaseResult>(`/api/quotes/${encodeURIComponent(item.id)}`);
      apply(result.quote, result.role ?? "buyer");
      if (!result.quote.proof.demoRoleplay) setWorkspaceRole(result.role ?? "buyer");
      setWorkspaceView("workbench");
      clearReturnContext();
      showCaseAddress(result.quote, result.quote.proof.demoRoleplay ? workspaceRole : result.role ?? "buyer");
      setLanguage(result.quote.language);
      setReconciliation(null);
      window.requestAnimationFrame(() => workspaceRef.current?.focus({ preventScroll: true }));
    });
  }

  function startCase() {
    setIntakeStarted(true);
    setWorkspaceView("workbench");
    setWorkspacePanel("agreement");
    clearReturnContext();
    setQuote(null);
    setRole("buyer"); setWorkspaceRole("buyer"); setCollaborative(true); setCustomRoleDemo(true); setSandboxRehearsal(false); setSandboxCollaboration(false);
    setError("");
    setNotice("");
    setReconciliation(null);
    setProjectMode("custom");
    setProjectStep(0);
    setProjectTitle("");
    updateProjectSummary("");
    setProjectAmount("");
    setRequirementsDraft(undefined); setRequirementsConfirmed(false);
    setRequirementsFromBrief(false);
    setRequiredPagesInput(DEFAULT_PAGES);
    setManualRequirementsInput("");
    setBrowserSteps([]); setCoverageDecisions({}); setCoverageConfirmed(false); setBusinessDrafts([]); setBusinessConfirmed(false);
    window.requestAnimationFrame(() => workspaceRef.current?.focus({ preventScroll: true }));
  }

  function showCaseAddress(item: ProofQuote, side: ProofRole) {
    const url = new URL(window.location.href);
    url.searchParams.set("proof", item.id);
    url.searchParams.set("side", side);
    window.history.replaceState({}, "", url);
  }

  function switchWorkspaceRole(next: ProofRole) {
    if (operationLock.current || busy || layoutController.current || browserCheckController.current || businessCheckController.current || next === workspaceRole) return;
    const commitSwitch = () => {
      setWorkspaceRole(next);
      setWorkspaceView("workbench");
      setWorkspacePanel(!quote ? "agreement" : next === "buyer" && collaboration?.stage !== "submitted" ? "payment" : "delivery");
      setManualChecks([]); setConsent(false); setDeliveryConsent(false);
      setFeedbackSuggestion(undefined);
      setShowDeliveryAcceptance(false); setModal(null);
      if (!roleplay) {setPendingFiles([]); setUploadError(""); if (fileInputRef.current) fileInputRef.current.value = "";
        if (folderInputRef.current) folderInputRef.current.value = "";}
      setViewedVersion(undefined);
      setInvitation(undefined); setError(""); setNotice("");
      if (quote && collaboration && !roleplay && next !== role) {
        setQuote(null); clearReturnContext();
        setNotice(tr("已切换工作台。真实项目按登录账号的参与身份显示；切换不会变更项目成员。", "Workspace switched. Real projects follow your signed-in membership; switching does not change project participants."));
      } else if (quote) showCaseAddress(quote, next);
      if (!quote || collaboration && !roleplay && next !== role) {
        const url = new URL(window.location.href); url.searchParams.set("side", next);
        window.history.replaceState({}, "", url);
      }
    };
    if (quote && roleplay) {
      // Load the selected transport projection; seller responses omit buyer payment IDs.
      void run("switch-role", async () => {
        const result = await apiRequest<CaseResult>(`/api/quotes/${quote.id}`, "GET", undefined, next);
        apply(result.quote, result.role); commitSwitch();
      });
    } else commitSwitch();
  }

  function fillNoodleBusinessExample() {
    setIntakeStarted(true); setProjectMode("custom"); setProjectStep(0); setWorkspacePanel("agreement");
    setProjectTitle(tr("双语面馆：业务内容验收", "Bilingual noodle shop: business content checks"));
    updateProjectSummary(tr("英文菜单标明 Beef noodles AUD 18\n中文菜单标明牛肉面 AUD 18\n到店说明展示电话 +61 3 9000 0000", "The English menu must show Beef noodles AUD 18\nThe Chinese menu must show 牛肉面 AUD 18\nThe visit page must show phone +61 3 9000 0000"));
    setProjectAmount("1.00"); setCurrency("AUD"); setRequiredPagesInput("index.html\nmenu-en.html\nmenu-zh.html\nvisit.html"); setManualRequirementsInput("");
    setBrowserSteps([{from: "index.html", text: "View menu", to: "menu-en.html"}, {from: "menu-en.html", text: "中文菜单", to: "menu-zh.html"}, {from: "menu-zh.html", text: "查看到店说明", to: "visit.html#consultation"}]);
    setBusinessDrafts([
      {key: "noodle-en", criterionId: "coverage-1", file: "menu-en.html", kind: "item_price", text: "", label: "Beef noodles", amount: "18.00", currency: "AUD"},
      {key: "noodle-zh", criterionId: "coverage-2", file: "menu-zh.html", kind: "item_price", text: "", label: "牛肉面", amount: "18.00", currency: "AUD"},
      {key: "noodle-phone", criterionId: "coverage-3", file: "visit.html", kind: "visible_copy", text: "+61 3 9000 0000", label: "", amount: "", currency: "AUD"},
    ]);
    setBusinessConfirmed(false); setRequirementsDraft(undefined); setRequirementsConfirmed(false); setRequirementsFromBrief(false);
    setNotice(tr("已填入虚构面馆需求和 3 项业务检查，请先编辑，再在下一步逐条确认。尚未创建项目或付款。", "Fictional noodle-shop requirements and three business checks are filled in. Edit them, then confirm each scope row in the next step. No project or payment was created."));
  }

  function beginIntake() {
    setIntakeStarted(true); setWorkspaceView("workbench"); setWorkspacePanel("agreement");
    setProjectMode("custom"); setProjectStep(0);
    window.requestAnimationFrame(() => workspaceRef.current?.querySelector<HTMLInputElement>("#projectTitle")?.focus());
  }

  function returnToIntroduction() {
    setIntakeStarted(false); setError(""); setNotice("");
    window.requestAnimationFrame(() => document.getElementById("welcome-introduction")?.focus());
  }

  function chooseWorkflow(value: WorkflowChoiceValue) {
    setSandboxRehearsal(value === "sandbox");
    setSandboxCollaboration(value === "collaborative-sandbox");
    setCustomRoleDemo(value === "demo" || value === "sandbox");
    setCollaborative(value !== "single");
  }

  async function startRoleDemo() {
    await run("create", async () => {
      const result = await apiRequest<CaseResult>("/api/proofs", "POST", {mode: "demo", demoRoleplay: true, currency, language}, "buyer");
      apply(result.quote, result.role); setWorkspaceRole("buyer");
      setWorkspaceView("workbench"); setWorkspacePanel("agreement");
      clearReturnContext(); showCaseAddress(result.quote, "buyer");
      setNotice(tr("双端演示已创建。先由买家锁定约定，再用右上角切换到卖家端。", "Two-sided demo created. Lock the scope as buyer, then switch to seller at the top right."));
    });
  }

  async function run(name: string, action: () => Promise<void>, refreshAfterFailure = true) {
    if (operationLock.current || busy || layoutController.current || browserCheckController.current || businessCheckController.current) return;
    operationLock.current = true;
    setBusy(name); setError(""); setNotice("");
    setReconciliation(null);
    try { await action(); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("操作未完成，请重试。", "The action failed. Please try again."));
      // A provider error can follow a persisted pending operation. Refresh before offering retries.
      if (quote && refreshAfterFailure) {
        try {
          const refreshed = await request<CaseResult>(`/api/quotes/${quote.id}`);
          if (isProof(refreshed.quote)) apply(refreshed.quote, refreshed.role);
        } catch { /* Keep the original failure visible if the refresh is unavailable too. */ }
      }
    }
    finally { operationLock.current = false; setBusy(""); }
  }

  async function mutate(action: string, body: unknown = {}, message = "") {
    if (!quote) return;
    await run(action, async () => {
      const result = await request<CaseResult>(`/api/proofs/${quote.id}/${action}`, "POST", action === "delivery" ? {...(body as Record<string, unknown>), expectedDeliveryId: delivery?.id ?? null, reviewRules: true} : body);
      apply(result.quote, result.role);
      if (action === "review" || action === "assess" || action === "delivery") { setWorkspacePanel("delivery"); setDeliveryTab("evidence"); }
      if (action === "submit_delivery") setWorkspacePanel("payment");
      if (action === "accept_delivery") setWorkspacePanel("payment");
      if (message) setNotice(message);
    });
  }

  async function saveRiskReview(input: RiskReviewInput): Promise<boolean> {
    if (!quote) return false;
    let saved = false;
    await run("risk-review", async () => {
      const result = await request<CaseResult>(`/api/proofs/${quote.id}/risk-reviews`, "POST", input);
      apply(result.quote, result.role); saved = true;
      setNotice(tr("人工复核已保存，原始 AI 报告、验收与付款未改变。", "Human review saved. The original AI report, acceptance and payment are unchanged."));
    }, false);
    return saved;
  }

  async function refreshCase() {
    if (!quote) return;
    await run("refresh", async () => {
      const result = await request<CaseResult>(`/api/quotes/${quote.id}`);
      apply(result.quote, result.role);
      setNotice(tr("已读取项目最新状态。", "Project state refreshed."));
    });
  }

  async function inviteSeller(email: string) {
    if (!quote || !buyer) return;
    await run("invite", async () => {
      const result = await request<CaseResult & {invitation: {token: string; email: string; expiresAt: string}}>(`/api/proofs/${quote.id}/invite`, "POST", {email});
      apply(result.quote, result.role);
      const link = new URL("/join", window.location.origin);
      link.hash = new URLSearchParams({invite: result.invitation.token}).toString();
      setInvitation({url: link.href, email: result.invitation.email, expiresAt: result.invitation.expiresAt});
      setNotice(tr("邀请链接已生成，请自行发给指定卖家。未发送邮件，网站访问权限未更改。", "Invitation created. Share it with the specified seller yourself. No email was sent and website access was not changed."));
    });
  }

  async function revokeInvitation() {
    if (!quote || !buyer) return;
    await run("invite", async () => {
      const result = await request<CaseResult>(`/api/proofs/${quote.id}/invite`, "POST", {revoke: true});
      apply(result.quote, result.role); setInvitation(undefined);
      setNotice(tr("卖家邀请已撤销，原链接已失效。", "Seller invitation revoked. The previous link is invalid."));
    });
  }

  async function loadVersions() {
    if (!quote) return;
    await run("versions", async () => setVersions((await request<{versions: ProofDeliveryVersion[]}>(`/api/proofs/${quote.id}/versions`)).versions));
  }

  function openVersionHistory() {
    if (!quote) return;
    setWorkspaceView("workbench"); setWorkspacePanel("payment");
    window.requestAnimationFrame(() => {
      const history = collaborationHistoryRef.current;
      if (!history || history.quoteId !== quote.id) return;
      if (completedCollaborationRef.current) completedCollaborationRef.current.open = true;
      history.reveal();
    });
    void loadVersions();
  }

  async function viewVersion(deliveryId: string) {
    if (!quote) return;
    await run("version", async () => setViewedVersion((await request<{version: ProofDeliveryVersion}>(`/api/proofs/${quote.id}/versions/${encodeURIComponent(deliveryId)}`)).version));
  }

  function beginDeliveryAcceptance() {
    setShowDeliveryAcceptance(true); setDeliveryConsent(false);
    setWorkspacePanel("payment"); setDeliveryTab("evidence");
    window.requestAnimationFrame(() => acceptanceRef.current?.scrollIntoView({block: "nearest", behavior: "smooth"}));
  }

  function openCriterion(criterionId?: string) {
    const index = proof?.criteria.findIndex(item => item.id === criterionId) ?? -1;
    if (index < 0) return;
    setWorkspaceView("workbench"); setWorkspacePanel("delivery"); setDeliveryTab("evidence"); setCriterionIndex(index);
    window.requestAnimationFrame(() => {
      const article = workspaceRef.current?.querySelectorAll<HTMLElement>(".criterion-evidence")[index];
      article?.scrollIntoView({block: "nearest", behavior: "smooth"});
      article?.focus({preventScroll: true});
    });
  }

  function openPendingHumanCheck() {
    if (pendingHumanCriteria.length) openCriterion(pendingHumanCriteria[0].id);
    else if (collaboration?.stage === "submitted") beginDeliveryAcceptance();
    else setWorkspacePanel("payment");
  }

  function prepareFeedback(input: {deliveryId: string; criterionId: string; comment: string}) {
    if (!quote || !buyer || collaboration?.stage !== "submitted" || !deliveryUnlocked || busy
      || input.deliveryId !== delivery?.id || !proof?.criteria.some(item => item.id === input.criterionId)) return;
    setFeedbackSuggestion({...input, quoteId: quote.id, serial: ++feedbackSerial.current});
    setWorkspaceView("workbench"); setWorkspacePanel("payment");
    setNotice(tr("已定位到可编辑的修改草稿；已有文字会保留。核对后再点击“退回修改”，本次尚未提交。", "Opened the editable change-request draft; existing text is preserved. Check it before clicking Request changes. Nothing has been sent."));
  }

  function focusPanel(panel: "agreement" | "delivery" | "payment", selector?: string) {
    setWorkspaceView("workbench"); setWorkspacePanel(panel);
    window.requestAnimationFrame(() => workspaceRef.current?.querySelector<HTMLElement>(selector ?? `.${panel === "agreement" ? "scope" : panel === "payment" ? "payment" : "evidence"}-panel`)?.focus({preventScroll: false}));
  }

  function nextWorkspaceAction(): {label: string; help: string; action: () => void} {
    if (paymentPending || captured || voided || closedUnpaid || expired) return {
      label: tr("查看验收与付款状态", "View acceptance & payment"), help: tr("交付决定和付款分开处理。", "Delivery decisions and payment remain separate."), action: () => focusPanel("payment"),
    };
    if (acceptedCurrent) return {
      label: !buyer ? roleplay ? tr("切换买家确认付款", "Continue payment as buyer") : tr("查看买家付款状态", "View buyer payment status") : authorized ? tr("继续确认测试付款", "Confirm test payment") : quote?.paymentMode === "sandbox" ? tr("继续 PayPal Sandbox 预授权", "Continue to PayPal Sandbox") : tr("继续模拟付款", "Continue simulated payment"),
      help: tr("当前交付已验收。已确认的人工检查会保留；付款仍需单独同意。", "This delivery is accepted. Saved human checks remain valid; payment needs separate consent."),
      action: () => !buyer && roleplay ? switchWorkspaceRole("buyer") : focusPanel("payment", buyer ? authorized ? ".pay-consent input" : ".authorization-action button" : undefined),
    };
    if (quote?.status === "draft") return {label: buyer ? tr("查看并确认标准", "Review and confirm scope") : tr("切换买家确认标准", "Confirm scope as buyer"), help: tr("先核对范围、金额和验收标准。", "Check scope, amount and criteria."), action: () => buyer ? focusPanel("agreement", ".scope-approval button") : switchWorkspaceRole("buyer")};
    if (collaboration?.stage === "awaiting_seller") return {label: tr("邀请卖家加入", "Invite your seller"), help: tr("发送邀请链接后，等待卖家交付。", "Share an invitation and await the seller's delivery."), action: () => focusPanel("payment", ".collaboration-invite-form input")};
    if (buyer && collaboration && ["in_progress", "changes_requested"].includes(collaboration.stage)) return {
      label: roleplay ? tr("切换卖家继续交付", "Continue as seller") : tr("查看交付进度", "View delivery progress"),
      help: tr("交付文件由卖家准备和提交。", "The seller prepares and submits delivery files."), action: () => roleplay ? switchWorkspaceRole("seller") : focusPanel("payment"),
    };
    if (!buyer && collaboration?.stage === "submitted") return {
      label: roleplay ? tr("切换买家审核", "Review as buyer") : tr("查看买家反馈", "View buyer feedback"), help: tr("此版本已提交，等待买家决定。", "This version is submitted and awaits the buyer."), action: () => roleplay ? switchWorkspaceRole("buyer") : focusPanel("payment"),
    };
    if (!deliveryUnlocked) return {label: tr("查看项目状态", "View project state"), help: tr("请先处理约定或付款状态。", "Resolve the agreement or payment state first."), action: () => focusPanel("payment")};
    if (!delivery) return {label: tr("前往上传交付文件", "Open delivery upload"), help: tr("保存时会同时完成规则核查。", "Saving also runs the rule checks."), action: () => focusPanel("delivery", "#deliveryFiles")};
    if (!reviewCurrent) return {label: tr("核查当前交付", "Check this delivery"), help: tr("即时检查保存的文件，不调用 AI。", "Immediate checks of saved files, without AI."), action: () => {void mutate("review", {deliveryId: delivery.id}, tr("规则核查完成。", "Rule checks complete."));}};
    if (!buyer && collaboration) return {label: tr("填写说明并提交验收", "Add a note & submit"), help: tr("AI 评估可按需使用，无需等待即可提交。", "AI assessment is optional; you can submit without it."), action: () => focusPanel("payment", ".collaboration-submission-form textarea")};
    if (failed) return {label: tr("查看未通过项", "Inspect unmet requirements"), help: tr("核对证据，再准备具体修改意见。", "Inspect the evidence and prepare specific feedback."), action: () => openCriterion(evidence.find(item => item.finding === "fail")?.criterionId)};
    if (businessChecksConfigured && !businessReport) return {label: tr("核对约定的业务内容", "Check agreed business content"), help: tr("先对照菜单价格、电话等约定，再进行人工验收。", "Compare agreed prices, contact details and copy before accepting."), action: openBusinessChecks};
    const businessAttention = buildBusinessSpotlight(delivery);
    if (businessChecksConfigured && businessReport && (!businessAttention || (businessAttention.issues > 0 || businessAttention.unavailable > 0) && businessExceptionReason.trim().length < 10)) return {
      label: tr("先核对业务内容差异", "Inspect business-content differences"),
      help: tr("查看具体约定和观察，起草修改意见；若仍选择接受，需另行说明例外原因。", "Inspect agreed and observed values, then draft changes. Accepting exceptions requires a separate reason."), action: openBusinessChecks,
    };
    if (!allHumanChecked) return {label: tr(`检查下一项 · 剩余 ${pendingHumanCriteria.length} 项`, `Check next · ${pendingHumanCriteria.length} remaining`), help: tr(`人工检查已确认 ${humanCriteria.length - pendingHumanCriteria.length}/${humanCriteria.length} 项。`, `Human checks confirmed: ${humanCriteria.length - pendingHumanCriteria.length}/${humanCriteria.length}.`), action: openPendingHumanCheck};
    return {label: collaboration ? tr("继续验收确认（不付款）", "Continue acceptance — no payment") : tr("继续验收与付款确认", "Continue to acceptance & payment"), help: tr("下一步仍需你的明确确认。", "Your explicit confirmation is still required."), action: () => collaboration ? beginDeliveryAcceptance() : focusPanel("payment")};
  }

  async function checkLayout() {
    if (!quote || !delivery || !canCheckDelivery || operationLock.current || busy || layoutController.current || browserCheckController.current || businessCheckController.current) return;
    const snapshot = quote;
    const key = `${quote.id}:${delivery.id}`;
    const controller = new AbortController();
    layoutController.current = controller;
    setBusy("layout"); setError(""); setNotice(""); setLayoutProgress(undefined);
    try {
      const input = await runLayoutProbe(snapshot, controller.signal, value => {
        if (!controller.signal.aborted && currentDelivery.current === key) setLayoutProgress(value);
      });
      if (controller.signal.aborted || currentDelivery.current !== key) return;
      // Saving is not cancellable: a received report may already have been persisted.
      setBusy("layout-save");
      const result = await request<CaseResult>(`/api/proofs/${snapshot.id}/layout`, "POST", input);
      if (currentDelivery.current !== key) return;
      apply(result.quote, result.role);
      setNotice(tr("布局测量已保存。溢出和不可测项请逐页查看；手机可用性仍需人工确认。", "Layout observations saved. Inspect overflow and unavailable pages; mobile usability still needs human confirmation."));
    } catch (cause) {
      if (currentDelivery.current !== key) return;
      if (controller.signal.aborted) setNotice(tr("测量已取消，本次结果未保存。", "Measurement cancelled; this run was not saved."));
      else {
        setError(cause instanceof RequestError && cause.status === 409
          ? tr("当前案例状态或报告已更新，本次结果未覆盖已保存记录。请确认当前交付后重新测量。", "The case state or report has changed. This run did not overwrite the saved record. Check the current delivery and measure again.")
          : cause instanceof Error ? cause.message : tr("布局检查未完成，请重试。", "Layout check could not complete. Please retry."));
        try {
          const refreshed = await request<CaseResult>(`/api/quotes/${snapshot.id}`);
          if (currentDelivery.current === key) apply(refreshed.quote, refreshed.role);
        } catch { /* Preserve the original error. Do not resubmit stale observations. */ }
      }
    } finally {
      if (layoutController.current === controller) {
        layoutController.current = null;
        setBusy(""); setLayoutProgress(undefined);
      }
    }
  }

  async function checkBrowserBehavior() {
    if (!quote || !delivery || !canObserveBrowser || operationLock.current || busy || layoutController.current || browserCheckController.current || businessCheckController.current) return;
    const snapshot = quote, key = `${quote.id}:${delivery.id}:${displayRole}`;
    const controller = new AbortController();
    browserCheckController.current = controller; browserCheckSavePending.current = false;
    setBusy("browser-check"); setError(""); setNotice(""); setBrowserCheckProgress(undefined);
    try {
      const input = await runBrowserChecks(snapshot, controller.signal, value => {
        if (!controller.signal.aborted && currentBrowserContext.current === key) setBrowserCheckProgress(value);
      });
      if (controller.signal.aborted || currentBrowserContext.current !== key) return;
      // After the POST starts, a cancellation must not be described as an unsaved run.
      browserCheckSavePending.current = true; setBusy("browser-check-save");
      const result = await request<CaseResult>(`/api/proofs/${snapshot.id}/browser-checks`, "POST", input);
      if (currentBrowserContext.current !== key) return;
      apply(result.quote, result.role);
      setNotice(tr("链接行为与资源观察已保存。请核对不符和未验证的步骤；这些观察不替代人工验收。", "Link behavior and resource observations saved. Inspect steps needing review or verification; these observations do not replace human acceptance."));
    } catch (cause) {
      if (currentBrowserContext.current !== key) return;
      if (controller.signal.aborted && !browserCheckSavePending.current) setNotice(tr("浏览器检查已取消，本次结果未保存。", "Browser check cancelled; this run was not saved."));
      else {
        setError(cause instanceof RequestError && cause.status === 409
          ? tr("当前交付或浏览器报告已更新，本次观察未覆盖已有记录。请刷新后重新检查。", "The delivery or browser report changed. This run did not overwrite the saved record. Refresh and check again.")
          : cause instanceof Error ? cause.message : tr("浏览器行为检查未完成，请重试。", "Browser behavior checks could not complete. Please retry."));
        try {
          const refreshed = await request<CaseResult>(`/api/quotes/${snapshot.id}`);
          if (currentBrowserContext.current === key) apply(refreshed.quote, refreshed.role);
        } catch { /* Keep the original error; do not replay a save with uncertain outcome. */ }
      }
    } finally {
      if (browserCheckController.current === controller) {
        browserCheckController.current = null; browserCheckSavePending.current = false;
        setBusy(""); setBrowserCheckProgress(undefined);
      }
    }
  }

  function openBusinessChecks() {
    setWorkspaceView("workbench"); setWorkspacePanel("delivery"); setDeliveryTab("layout");
    window.requestAnimationFrame(() => {
      const panel = workspaceRef.current?.querySelector<HTMLDetailsElement>(".business-check-panel");
      if (panel) {panel.open = true; panel.scrollIntoView({block: "nearest", behavior: "smooth"}); panel.querySelector<HTMLElement>("button")?.focus({preventScroll: true});}
    });
  }

  async function checkBusinessContent() {
    if (!quote || !delivery || !businessChecksConfigured || !canObserveBrowser || operationLock.current || busy || layoutController.current || browserCheckController.current || businessCheckController.current) return;
    const snapshot = quote, key = `${quote.id}:${delivery.id}:${displayRole}`;
    const controller = new AbortController();
    businessCheckController.current = controller; businessCheckSavePending.current = false;
    setBusy("business-check"); setError(""); setNotice(""); setBusinessCheckProgress(undefined);
    try {
      const input = await runBusinessChecks(snapshot, controller.signal, value => {
        if (!controller.signal.aborted && currentBrowserContext.current === key) setBusinessCheckProgress(value);
      });
      if (controller.signal.aborted || currentBrowserContext.current !== key) return;
      businessCheckSavePending.current = true; setBusy("business-check-save");
      const result = await request<CaseResult>(`/api/proofs/${snapshot.id}/business-checks`, "POST", input);
      if (currentBrowserContext.current !== key) return;
      apply(result.quote, result.role);
      setNotice(tr("业务内容核对已保存。逐项对照预期和实际观察，再决定修改或验收。", "Business content observations saved. Compare expected and observed details, then decide whether to request changes or accept."));
    } catch (cause) {
      if (currentBrowserContext.current !== key) return;
      if (controller.signal.aborted && !businessCheckSavePending.current) setNotice(tr("业务内容核对已取消，本次未保存。", "Business content check cancelled; this run was not saved."));
      else {
        setError(cause instanceof RequestError && cause.status === 409 ? tr("交付或报告已更新，本次未覆盖已有记录。请核对当前版本后重试。", "The delivery or report changed. Existing records were not overwritten. Check the current version and retry.") : cause instanceof Error ? cause.message : tr("业务内容核对未完成，请重试。", "Business content check could not complete. Please retry."));
        try {const refreshed = await request<CaseResult>(`/api/quotes/${snapshot.id}`); if (currentBrowserContext.current === key) apply(refreshed.quote, refreshed.role);} catch { /* Do not replay uncertain saves. */ }
      }
    } finally {
      if (businessCheckController.current === controller) {businessCheckController.current = null; businessCheckSavePending.current = false; setBusy(""); setBusinessCheckProgress(undefined);}
    }
  }

  function updateProjectSummary(value: string) {
    setProjectSummary(value); setCoverageDecisions({}); setCoverageConfirmed(false); setBusinessDrafts([]); setBusinessConfirmed(false);
  }

  function projectBasicsError() {
    if (!projectTitle.trim()) return tr("请填写项目名称。", "Enter a project title.");
    if (!projectSummary.trim()) return tr("请简要说明交付内容。", "Describe what will be delivered.");
    if (!/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/u.test(projectAmount.trim())
      || Number(projectAmount) < 0.01 || Number(projectAmount) > 10000) {
      return tr("金额须为 0.01–10000.00，最多两位小数。", "Enter an amount from 0.01 to 10000.00, with at most two decimal places.");
    }
    return "";
  }

  async function suggestBusinessChecks(input: BusinessSuggestionInput): Promise<BusinessSuggestionResult> {
    if (operationLock.current || busy || loading || layoutController.current || browserCheckController.current || businessCheckController.current) throw new Error(tr("请等待当前操作完成。", "Wait for the current action to finish."));
    operationLock.current = true; setBusy("business-suggestions"); setError(""); setNotice("");
    try {return (await request<{suggestions: BusinessSuggestionResult}>("/api/business-check-suggestions", "POST", input)).suggestions;}
    finally {operationLock.current = false; setBusy("");}
  }

  function openBusinessEditor() {
    window.requestAnimationFrame(() => {
      const editor = workspaceRef.current?.querySelector<HTMLDetailsElement>(".business-check-editor");
      if (editor) {editor.open = true; editor.scrollIntoView({block: "nearest", behavior: "smooth"}); editor.querySelector<HTMLElement>("summary")?.focus({preventScroll: true});}
    });
  }

  function adoptBusinessSuggestion(candidate: BusinessSuggestionCandidate) {
    if (busy || loading || !coverageConfirmed || !coverageReady) return;
    const unit = coverageUnits.find(unit => unit.id === candidate.criterionId);
    const decision = coverageRows.find(row => row.id === candidate.criterionId);
    if (!unit || decision?.disposition !== "include" || candidate.source.start !== unit.start || candidate.source.end !== unit.end || candidate.source.excerpt !== unit.text
      || candidate.file && !inputLines(requiredPagesInput).includes(candidate.file)) return;
    const expected = candidate.expected;
    setBusinessDrafts(current => current.length >= 8 || suggestionAlreadyDrafted(candidate, current) ? current : [...current,
      {key: crypto.randomUUID(), criterionId: candidate.criterionId, file: candidate.file, kind: expected.kind,
        text: expected.kind === "visible_copy" ? expected.text : "", label: expected.kind === "item_price" ? expected.label : "",
        amount: expected.kind === "item_price" ? (expected.amountMinor / 100).toFixed(2) : "", currency: expected.kind === "item_price" ? expected.currency : currency}]);
    setBusinessConfirmed(false);
    window.requestAnimationFrame(() => {const editor = workspaceRef.current?.querySelector<HTMLDetailsElement>(".business-check-editor"); if (editor) editor.open = true;});
  }

  async function analyzeRequirements(input: {sourceText: string; sourceName?: string}) {
    if (operationLock.current || busy || loading || layoutController.current || browserCheckController.current || businessCheckController.current) throw new Error(tr("请等待当前操作完成。", "Wait for the current action to finish."));
    operationLock.current = true;
    setBusy("requirements"); setError(""); setNotice("");
    try {
      return (await request<{draft: RequirementDraft}>("/api/requirements", "POST", {...input, language})).draft;
    } finally { operationLock.current = false; setBusy(""); }
  }

  function applyRequirements(draft: RequirementDraft, fromBrief = false) {
    setRequirementsFromBrief(fromBrief);
    setRequirementsDraft(draft); setRequirementsConfirmed(false);
    setRequiredPagesInput(draft.pages.length ? draft.pages.map(item => item.file).join("\n") : DEFAULT_PAGES);
    setManualRequirementsInput(draft.manualRequirements.map(item => item.text).join("\n"));
    setBrowserSteps(draft.link ? [{from: draft.link.from, text: draft.link.text, to: draft.link.to}] : []);
    if (!projectTitle.trim()) setProjectTitle(tr("网站交付验收", "Website delivery acceptance"));
    if (!projectSummary.trim()) updateProjectSummary(draft.sourceText.slice(0, 1000));
    setNotice(tr("需求清单已载入。请填写项目金额，下一步核对和编辑清单；金额不会由解析结果决定。", "Requirements loaded. Enter the amount, then review and edit the checklist. Extraction does not decide the price."));
  }

  async function analyzeProjectBrief() {
    if (!projectSummary.trim() || busy || loading) return;
    try {
      const draft = await analyzeRequirements({sourceText: projectSummary});
      applyRequirements(draft, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("暂时无法整理需求，已保留文字。", "Could not organize the requirements. Your text is retained."));
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (projectMode === "custom" && projectStep === 0) {
      const message = projectBasicsError();
      setError(message);
      if (!message) setProjectStep(1);
      return;
    }
    await run("create", async () => {
      if ((sandboxRehearsal || sandboxCollaboration) && config?.paymentMode !== "sandbox") throw new Error(tr("PayPal Sandbox 尚未配置，请选择模拟演示。", "PayPal Sandbox is not configured. Choose the simulated demo."));
      let input: Record<string, unknown> = { mode: projectMode, clientName: clientName.trim(), currency, language, ...(projectMode === "custom" ? {collaborative: !customRoleDemo && collaborative, demoRoleplay: customRoleDemo} : {demoRoleplay: true}), ...(sandboxRehearsal ? {paymentTesting: "sandbox"} : sandboxCollaboration ? {paymentTesting: "collaborative-sandbox"} : {}) };
      if (projectMode === "custom") {
        const message = projectBasicsError();
        if (message) throw new Error(message);
        const pages = inputLines(requiredPagesInput);
        const manualRequirements = inputLines(manualRequirementsInput);
        if (!coverageConfirmed || !coverageReady) throw new Error(tr("请逐条处理原始需求，填写排除理由，并确认范围后再创建。", "Handle every source requirement, give reasons for exclusions, and confirm the scope before creating."));
        if (businessDrafts.length && (!businessConfirmed || !businessDraftsReady)) throw new Error(tr("请补齐并确认业务内容检查。", "Complete and confirm the business content checks."));
        if (requirementsDraft && !requirementsConfirmed) throw new Error(tr("请先核对原文与最终验收清单，并勾选确认。", "Review the original requirements and final checklist, then confirm them."));
        if (!pages.length || pages.length > 10 || pages.some(file => !isHtmlDeliveryPath(file))) {
          throw new Error(tr("填写 1–10 个相对 HTML 路径，每行一个，例如 index.html。", "Enter 1–10 relative HTML paths, one per line, such as index.html."));
        }
        if (new Set(pages.map(file => file.toLowerCase())).size !== pages.length) throw new Error(tr("要求的页面文件名不能重复或仅大小写不同。", "Required page names cannot repeat or differ only by letter case."));
        if (manualRequirements.length > 5 || manualRequirements.some(requirement => requirement.length > 300)) {
          throw new Error(tr("人工标准最多 5 条，每条不超过 300 字。", "Use at most five human checks, with no more than 300 characters per check."));
        }
        const links = browserSteps.map(step => ({from: step.from.trim(), text: step.text.trim(), to: step.to.trim()}));
        if (links.length > 5 || links.some(step => {
          const [file, fragment, extra] = step.to.split("#");
          return !isHtmlDeliveryPath(step.from) || !step.text || step.text.length > 120 || !isHtmlDeliveryPath(file) || extra !== undefined || fragment !== undefined && !/^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/u.test(fragment);
        })) throw new Error(tr("浏览步骤最多 5 个，每个需填写来源 HTML、可见链接文字和本地 HTML 目标（可选 #区域）。", "Use up to five browser steps, each with source HTML, visible link text and a local HTML target (optionally #section)."));
        input = { ...input, title: projectTitle.trim(), summary: projectSummary.trim(), amount: projectAmount.trim(), requiredPages: pages, manualRequirements,
          ...(requirementsDraft ? {requirementsDraftId: requirementsDraft.id, confirmRequirements: requirementsConfirmed} : {}),
          coverage: {version: 1, sourceText: projectSummary.trim(), confirmed: coverageConfirmed, decisions: coverageRows.map(row => ({id: row.id, disposition: row.disposition, ...(row.disposition === "exclude" ? {reason: row.reason?.trim()} : {})}))},
          ...(links.length ? {links} : {}), ...(businessDrafts.length ? {businessChecks: {confirmed: businessConfirmed, items: businessDraftItems(businessDrafts, coverageUnits)}} : {}) };
      }
      const result = await request<CaseResult>("/api/proofs", "POST", input);
      apply(result.quote, result.role);
      clearReturnContext();
      showCaseAddress(result.quote, "buyer");
      setNotice(projectMode === "demo" || customRoleDemo ? tr("双端演示已创建。买家锁定约定后，切换卖家端提交；买家不需要提供交付文件。", "Two-sided demo created. Lock the scope as buyer, then switch to seller to deliver. Buyers do not provide delivery files.") : collaborative ? tr("项目已创建。请先锁定标准，再邀请卖家加入。", "Project created. Lock the scope, then invite your seller.") : tr("项目已创建。锁定标准后，切换到卖家端上传文件。", "Project created. Lock the scope, then switch to seller to upload files."));
    });
  }

  async function uploadDelivery() {
    if (!quote || !custom || !canManageDelivery) return;
    setUploadError("");
    await run("upload", async () => {
      try {
        const files = await readDeliveryUpload(pendingFiles);
        const result = await request<CaseResult>(`/api/proofs/${quote.id}/delivery`, "POST", { files, expectedDeliveryId: delivery?.id ?? null, reviewRules: true });
        apply(result.quote, result.role);
        setPendingFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (folderInputRef.current) folderInputRef.current.value = "";
        // The delivery-id effect opens its preview; focus evidence after that render settles.
        window.requestAnimationFrame(() => { setWorkspacePanel("delivery"); setDeliveryTab("evidence"); });
        setNotice(tr("文件已保存，规则核查已完成。可按需运行 AI 评估，或填写说明提交验收。旧版 AI 评估与验收同意未沿用。", "Files saved and rule checks complete. Optionally run AI assessment, or add a note and submit for review. Previous AI assessment and acceptance were not carried over."));
      } catch (cause) {
        setUploadError(cause instanceof RequestError && cause.status === 409
          ? tr("交付版本已更新或被锁定，未保存这次替换。已保留选中文件；请核对刷新后的当前版本，再决定是否替换。", "The delivery changed or is locked, so this replacement was not saved. Your files are retained. Check the refreshed current version before deciding whether to replace it.")
          : cause instanceof Error ? cause.message : tr("文件交付未完成，请保留选择并重试。", "The upload did not complete. Your selection is retained."));
        throw cause;
      }
    });
  }

  async function checkout() {
    if (!quote) return;
    await run("checkout", async () => {
      const result = await request<CheckoutResult>(`/api/proofs/${quote.id}/checkout`, "POST", {});
      if (result.mode === "demo") {
        setModal({ kind: "authorize", orderId: result.orderId });
        return;
      }
      const destination = new URL(result.approvalUrl ?? "");
      if (destination.protocol !== "https:") throw new Error(tr("预授权链接无效。", "Invalid authorization link."));
      window.location.assign(destination.href);
    });
  }

  async function authorize(orderId: string) {
    if (!quote) return;
    await run("authorize", async () => {
      const result = await request<CaseResult>(`/api/proofs/${quote.id}/authorize`, "POST", { orderId });
      apply(result.quote, result.role);
      setModal(null);
      clearReturnContext();
      showCaseAddress(result.quote, workspaceRole);
      setNotice(sandboxRoleplay ? tr("Sandbox 预授权已完成，尚未扣款。当前交付的验收记录已保留，请单独确认测试付款。", "Sandbox authorization complete, without capture. Delivery acceptance is preserved. Confirm test payment separately.") : tr("预授权已完成，尚未扣款。核查交付并人工确认后，再完成测试付款。", "Authorization complete. No capture yet. Review the delivery and confirm acceptance before test payment."));
    });
  }

  async function capture() {
    if (!quote || !delivery || !canCapture) return;
    await mutate("capture", { confirm: true, deliveryId: pendingCapture ? proof?.acceptedDeliveryId ?? delivery.id : delivery.id, manualChecks: pendingCapture ? proof?.manualChecks ?? confirmedManualChecks : confirmedManualChecks, ...(!collaboration && !pendingCapture && businessDecision ? {businessDecision} : {}) },
      tr("已确认当前交付版本，并完成测试扣款。收据已生成。", "This delivery was accepted and the test capture completed. Your receipt is ready."));
  }

  async function release() {
    if (!quote) return;
    await run("void", async () => {
      const result = await request<CaseResult>(`/api/proofs/${quote.id}/void`, "POST", { confirm: true });
      apply(result.quote, result.role); setModal(null);
      setNotice(tr("预授权已撤销；未进行付款扣款。", "Authorization voided. No payment was captured."));
    });
  }

  async function reconcilePayment() {
    if (!quote || !canReconcile) return;
    await run("reconcile", async () => {
      const result = await request<CaseResult & {reconciliation?: ProofPaymentReconciliation}>(`/api/proofs/${quote.id}/reconcile`, "POST", {});
      apply(result.quote, result.role);
      if (result.reconciliation) setReconciliation({ quoteId: result.quote.id, result: result.reconciliation });
      if (result.quote.proof.paymentState === "captured") {
        setNotice(tr("已向 PayPal 核实测试扣款完成，保存的付款状态与收据已更新。", "PayPal confirmed the test capture. The saved payment state and receipt are updated."));
      } else if (result.quote.proof.paymentState === "voided") {
        setNotice(tr("已向 PayPal 核实预授权已撤销，未进行付款扣款。", "PayPal confirmed that the authorization was voided. No payment was captured."));
      } else if (result.quote.proof.paymentState === "closed_unpaid") {
        setNotice(tr("PayPal 已确认预授权被拒，案例已关闭且未收款。", "PayPal confirmed that the authorization was denied. The case is closed with no payment received."));
      }
    });
  }

  function unresolvedPaymentMessage(reason: Extract<ProofPaymentReconciliation, { kind: "unresolved" }>["reason"]) {
    const messages = {
      pending: tr("PayPal 仍在处理，尚未返回可确认的最终结果。", "PayPal is still processing and has not returned a confirmed final result."),
      authorization_still_active: tr("PayPal 显示预授权仍有效，但原扣款或撤销操作尚未得到最终确认。", "PayPal shows the authorization is still active, but the original capture or void has no confirmed final result."),
      provider_unavailable: tr("暂时无法从 PayPal 取得可靠状态，请稍后再次核对。", "A reliable PayPal status is unavailable right now. Check again later."),
      inconsistent_resources: tr("PayPal 的交易历史或资源状态不一致，需要人工核对，不能靠反复重试确认结果。", "PayPal transaction history or resource states are inconsistent. Manual reconciliation is needed; repeated retries do not establish the outcome."),
    };
    return messages[reason];
  }

  function exportRecord() {
    if (!quote) return;
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(quote, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl; anchor.download = `${quote.reference}-evidence.json`; anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  function onModalKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !busy) setModal(null);
    if (event.key !== "Tab") return;
    const buttons = modalRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!buttons?.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function findingFor(criterion: ProofCriterion): ProofEvidence["finding"] | "unreviewed" {
    const matches = evidence.filter(item => item.criterionId === criterion.id);
    if (!matches.length) return "unreviewed";
    if (matches.some(item => item.finding === "fail")) return "fail";
    if (matches.some(item => item.finding === "needs_human")) return "needs_human";
    return "pass";
  }

  function findingLabel(finding: ProofEvidence["finding"] | "unreviewed") {
    return {
      pass: tr("证据支持", "Evidence supports"), fail: tr("未通过", "Not met"),
      needs_human: tr("需人工确认", "Human check"), unreviewed: tr("待核查", "Not reviewed"),
    }[finding];
  }

  function stateLabel(item: ProofQuote, showWorkflow = false) {
    if (showWorkflow && item.proof.collaboration && item.proof.paymentState === "unfunded") return ({awaiting_seller: tr("等待卖家加入", "Awaiting seller"), in_progress: tr("卖家制作中", "In progress"), submitted: tr("等待买家验收", "Awaiting acceptance"), changes_requested: tr("已退回修改", "Changes requested"), accepted: tr("交付已接受 · 未付款", "Accepted · unpaid")})[item.proof.collaboration.stage];
    return item.proof.paymentState === "captured" ? tr("测试已付款", "Test captured")
      : item.proof.paymentState === "voided" ? tr("预授权已撤销", "Authorization voided")
      : item.proof.paymentState === "closed_unpaid" ? tr("已关闭 · 未收款", "Closed · no payment received")
      : item.proof.paymentState === "authorized" ? tr("已预授权 · 未扣款", "Authorized · not captured")
      : tr("尚未预授权", "Not authorized");
  }

  const auditLabels: Record<ProofEvent["kind"], string> = {
    created: tr("创建约定", "Case created"), scope_approved: tr("锁定验收标准", "Scope approved"),
    authorized: tr("完成预授权", "Authorized"), delivery_submitted: tr("提交交付版本", "Delivery submitted"),
    reviewed: tr("完成证据核查", "Evidence reviewed"), accepted: tr("人工接受交付", "Delivery accepted"),
    captured: tr("完成测试扣款", "Test payment captured"), voided: tr("撤销预授权", "Authorization voided"),
    payment_closed: tr("授权被拒 · 关闭且未收款", "Authorization denied · closed unpaid"),
    payment_reconciled: tr("向 PayPal 核对付款状态", "Payment state reconciled with PayPal"),
    assessed: tr("保存逐条 AI 源码评估", "AI source assessment saved"),
    risk_reviewed: tr("保存人工风险复核", "Human risk review saved"),
    layout_checked: tr("保存浏览器布局测量", "Browser layout observations saved"),
    browser_checked: tr("保存浏览器交付行为观察", "Browser delivery behavior observations saved"),
    business_checked: tr("保存业务内容核对", "Business content observations saved"),
    seller_joined: tr("卖家确认约定并加入", "Seller confirmed the scope and joined"),
    delivery_sent: tr("卖家提交验收", "Seller submitted for acceptance"),
    changes_requested: tr("买家退回具体修改意见", "Buyer requested changes"),
    delivery_accepted: tr("买家接受交付（未付款）", "Buyer accepted delivery (no payment)"),
  };
  const steps = collaboration ? [tr("确认约定", "Confirm scope"), tr("卖家交付", "Seller delivery"), tr("买家验收", "Buyer acceptance"), quote?.paymentMode === "sandbox" ? tr("Sandbox 付款", "Sandbox payment") : tr("模拟付款", "Demo payment")] : customView
    ? [tr("约定标准", "Agree the scope"), tr("上传交付", "Upload delivery"), tr("逐项核查", "Review evidence"), voided || closedUnpaid ? tr("已结束 · 未扣款", "Ended · not captured") : tr("授权并验收", "Authorize & accept")]
    : [tr("约定标准", "Agree the scope"), tr("买方预授权", "Authorize first"), tr("逐项看证据", "Review evidence"), voided || closedUnpaid ? tr("已结束 · 未扣款", "Ended · not captured") : tr("确认后付款", "Accept & pay")];
  const currentStep = captured || voided || closedUnpaid ? 3 : collaboration
    ? quote?.status === "draft" ? 0 : collaboration.stage === "accepted" ? 3 : collaboration.stage === "submitted" ? 2 : 1 : customView
    ? reviewCurrent ? 3 : delivery ? 2 : quote?.status === "approved" ? 1 : 0
    : authorized ? 2 : quote?.status === "approved" ? 1 : 0;
  const completedSteps = collaboration ? [quote?.status !== "draft", !!collaboration.submission, collaboration.stage === "accepted", captured] : customView ? [!!quote && quote.status !== "draft", !!delivery, reviewCurrent, captured || voided || closedUnpaid] : [
    !!quote && quote.status !== "draft",
    !!proof?.authorizedAt,
    reviewCurrent,
    captured || voided || closedUnpaid,
  ];
  const nextStep = quote ? nextWorkspaceAction() : undefined;
  const busyLabel = busy === "upload" || busy === "delivery" ? tr("正在保存并核查文件…", "Saving files and running checks…")
    : busy === "assess" ? tr("正在等待 DeepSeek 评估…", "Waiting for DeepSeek assessment…")
    : busy === "browser-check" ? tr("正在观察链接行为和页面资源…", "Observing link behavior and page resources…")
    : busy === "browser-check-save" ? tr("正在保存浏览器观察…", "Saving browser observations…")
    : busy === "switch-role" ? tr("正在切换工作台…", "Switching workspace…")
    : busy === "review" ? tr("正在核查保存的文件…", "Checking saved files…")
    : busy ? tr("正在保存或读取项目，请稍候…", "Saving or loading the project…") : "";

  const terminalPayment = captured || voided || closedUnpaid;
  const collaborationPanel = (quote && collaboration && <CollaborationPanel key={quote.id} quote={quote} role={displayRole} language={language} busy={!!busy} historyRef={collaborationHistoryRef}
    invitation={invitation} versions={versions} feedbackSuggestion={feedbackSuggestion} onInvite={inviteSeller} onRevokeInvite={revokeInvitation}
    onSubmit={note => mutate("submit_delivery", {deliveryId: delivery?.id, note}, tr("此版本已提交买家验收。", "This delivery was submitted for buyer acceptance."))}
    onReturn={feedback => mutate("return", {deliveryId: delivery?.id, feedback}, tr("修改意见已关联此版本，等待卖家修订。", "Change requests are linked to this delivery. Await the seller's revision."))}
    onAccept={beginDeliveryAcceptance} onLoadVersions={loadVersions} onViewVersion={viewVersion}/>);
  const paymentSummary = (<section className={`payment-strip ${captured ? "is-captured" : voided ? "is-voided" : closedUnpaid ? "is-closed-unpaid" : ""}`} aria-label={tr("付款状态", "Payment state")}>
    <div className="payment-symbol">{captured ? <ReceiptText size={20} /> : voided ? <Undo2 size={20} /> : closedUnpaid ? <CircleAlert size={20} /> : <LockKeyhole size={20} />}</div>
    <div className="payment-state">
      <span>{tr("付款状态", "PAYMENT STATE")}</span>
      <strong>{quote ? stateLabel(quote) : tr("尚未预授权", "Not authorized")}</strong>
      <p>{captured ? tr("已针对接受的交付版本完成测试扣款。", "Test capture completed for the accepted delivery.") : voided ? tr("预授权已撤销，未进行付款扣款。", "Authorization voided. No payment was captured.") : closedUnpaid ? proof?.paymentClosure?.reason === "authorization_denied"
        ? tr("PayPal 核对结果：预授权被拒，未收款。此案例已结束，不能继续扣款。", "Verified with PayPal: authorization denied and no payment received. This case has ended and cannot be captured.")
        : tr("付款已关闭且未收款。请核对 PayPal 交易记录了解关闭原因。", "Payment is closed with no funds received. Check the PayPal transaction record for the closure reason.")
        : authorized ? tr("预授权 ≠ 已付款。验收通过且由你确认后才扣款。", "Authorization is not payment. Capture follows your acceptance.") : custom ? tr("可先核查交付；测试付款前需买方批准预授权。", "Review the delivery first. Buyer authorization is required before test payment.") : tr("先锁定标准，再由买方批准预授权。", "Lock the scope, then get buyer authorization.")}</p>
      {closedUnpaid && proof?.paymentClosure?.verifiedAt && <p className="closure-verified">{tr("核实时间", "Verified at")} <time dateTime={proof.paymentClosure.verifiedAt}>{time(proof.paymentClosure.verifiedAt, true)}</time></p>}
    </div>
    <div className="payment-amount">{quote ? money(quote.totalCents) : tr("待填写金额", "Set a project amount")}<small>{quote?.currency ?? currency}</small></div>
  </section>);
  const paymentReceipt = (captured && quote && <section className="receipt-section"><div className="receipt-heading"><span><CheckCheck size={24} /></span><div><span className="section-kicker">ACCEPTED. VERIFIED. RECORDED.</span><h3>{tr("这一次付款，有据可查。", "A payment with a clear paper trail.")}</h3><p>{quote.paymentMode === "demo" ? tr("模拟收据 · 未发生真实付款", "SIMULATED RECEIPT · NO REAL PAYMENT") : tr("PayPal Sandbox 收据 · 测试资金", "PAYPAL SANDBOX RECEIPT · TEST FUNDS")}</p></div></div><details className="receipt-details"><summary>{tr("交易编号与验收版本", "Transaction IDs & accepted version")}</summary><dl>{[
    [tr("已接受交付", "Accepted delivery"), proof?.acceptedDeliveryId],
    [tr("原始约定", "Agreement"), quote.reference],
    [tr("预授权编号", "Authorization ID"), proof?.authorizationId],
    [tr("PayPal 订单", "PayPal order"), quote.paypalOrderId],
    [tr("扣款编号", "Capture ID"), quote.captureId],
    [tr("确认时间", "Confirmed at"), quote.paidAt ? time(quote.paidAt, true) : "—"],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl></details><div className="receipt-total"><span>{tr("测试付款总额", "TEST PAYMENT TOTAL")}</span><strong>{money(quote.totalCents)} <small>{quote.currency}</small></strong></div></section>);

  return (
    <div className={`proof-app cockpit-shell${quote ? " has-project" : ""}`}>
      <a href="#workspace" className="skip-link" onClick={() => {setWorkspaceView("workbench"); if (!quote && !sellerEntry) beginIntake();}}>{tr("跳到验收工作台", "Skip to workspace")}</a>
      <header className="site-header no-print">
        <a className="brand" href="/" aria-label="ProofBeforePay"><span className="brand-mark"><FileCheck2 size={22} /></span><span>proof<span className="brand-light">before</span>pay<span className="brand-dot">.</span></span></a>
        <nav aria-label={tr("主导航", "Main navigation")}>
          {([["workbench", tr("验收工作台", "Workspace")], ["audit", tr("操作记录", "Activity")], ["history", tr("案例记录", "Cases")]] as const).map(([view, label]) => <button key={view} className={workspaceView === view ? "active" : ""} aria-pressed={workspaceView === view} onClick={() => setWorkspaceView(view)}>{label}</button>)}
        </nav>
        <div className="header-right"><span><ShieldCheck size={14} />{tr("证据先行，决定在人", "Evidence first. You decide.")}</span><div className="workspace-role-switch" role="group" aria-label={tr("切换买卖家工作台", "Switch buyer or seller workspace")}>{(["buyer", "seller"] as const).map(side => <button key={side} type="button" aria-pressed={workspaceRole === side} disabled={!!busy || loading} onClick={() => switchWorkspaceRole(side)}>{side === "buyer" ? tr("买家端", "Buyer") : tr("卖家端", "Seller")}</button>)}</div><button className="language-button" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} aria-label={tr("Switch to English", "切换中文")}><Globe2 size={14} />{language === "zh" ? "EN" : "中文"}</button></div>
      </header>

      <main className="main-wrap cockpit-main">
        <h1 className="sr-only">{tr("交付验收工作台", "Delivery acceptance workspace")}</h1>
        <div className="workflow no-print" hidden={welcomeActive} aria-label={tr("验收流程", "Acceptance workflow")}>
          {steps.map((step, index) => <div className={`workflow-step ${index === currentStep ? "current" : ""} ${index < currentStep && completedSteps[index] ? "done" : ""}`} key={step}><span>{index < currentStep && completedSteps[index] ? <Check size={13} /> : `0${index + 1}`}</span><strong>{step}</strong>{index < steps.length - 1 && <ChevronRight className="step-arrow" size={15} />}</div>)}
        </div>

        <div className="mode-banner no-print" role="status" hidden={welcomeActive && !configError}><FlaskConical size={18} /><div><strong>{!config && !quote ? configError ? tr("连接尚未就绪", "Connection unavailable") : tr("正在检查连接…", "Checking connections…") : tr("受控测试环境", "CONTROLLED TEST ENVIRONMENT")}</strong><details className="mode-details"><summary>{aiMode === "live" ? tr("AI 解释", "AI explanation") : tr("规则核查", "Rule checks")} · {paymentMode === "sandbox" ? "PayPal Sandbox" : tr("本地模拟", "Local simulation")} · {tr("仅测试资金", "Test funds only")}</summary><p>{aiMode === "demo" ? sampleRoleplay ? tr("规则核查保存的样例或卖家文件；逐条 AI 评估通过单独按钮运行并保存。", "Rules check saved samples or seller files. Item-by-item AI assessment runs and saves separately.") : customView ? tr("规则核查已上传文件；逐条 AI 评估通过单独按钮运行并保存。", "Uploaded files are checked by rules. Item-by-item AI assessment runs and saves separately.") : tr("规则核查内置文件样例，未调用 AI。", "Built-in files are checked by rules, with no AI request.") : aiMode === "live" ? tr("AI 辅助解释证据，验收与付款仍需人工确认。", "AI helps explain evidence; acceptance and payment require your confirmation.") : ""} {paymentMode === "demo" ? tr("预授权与付款均为本地模拟，未连接 PayPal。", "Authorization and payment are local simulations, not PayPal.") : paymentMode === "sandbox" ? tr("已配置 PayPal Sandbox，仅使用测试资金。", "PayPal Sandbox is configured for test funds only.") : ""} {customView ? tr("仅核查已保存的交付文件，不抓取任意网站。", "Only saved delivery files are inspected; arbitrary websites are not fetched.") : tr("仅含内置交付样例。", "Built-in delivery examples only.")}</p></details></div><span className="mode-badge">{paymentMode === "sandbox" ? "SANDBOX" : "DEMO"}</span>{configError && <button className="text-button" disabled={!!busy} onClick={() => run("config", async () => { setConfig(await request<AppConfig>("/api/config")); setConfigError(false); })}>{tr("重试", "Retry")}</button>}</div>

        {(error || notice) && <div role={error ? "alert" : "status"} className={`feedback no-print ${error ? "error" : "success"}`}><Info size={18} /><div>{error && <strong>{tr("操作未完成", "Action not completed")}</strong>}<span>{error || notice}</span></div><button className="icon-button" aria-label={tr("关闭提示", "Dismiss message")} onClick={() => { setError(""); setNotice(""); }}><X size={16} /></button></div>}

        {workspaceView === "workbench" && welcomeActive && (loading ? <p className="history-loading" role="status">{tr("正在恢复工作台…", "Restoring the workspace…")}</p> : <GettingStarted language={language} busy={!!busy} onStart={beginIntake} onExample={fillNoodleBusinessExample} onDemo={() => {void startRoleDemo();}}/>)}
        {workspaceView === "workbench" && !quote && !sellerEntry && intakeStarted && <button type="button" className="text-button intake-return" disabled={!!busy || loading} onClick={returnToIntroduction}>{tr("返回流程介绍（保留草稿）", "Back to the introduction (keep draft)")}</button>}
        <nav className="compact-panel-nav no-print" hidden={workspaceView !== "workbench" || sellerEntry || !quote} aria-label={tr("工作区分栏", "Workspace panels")}>
          {([["agreement", tr("约定", "Agreement")], ["delivery", tr("交付与证据", "Delivery & evidence")], ["payment", collaboration && !buyer ? tr("交付进度", "Delivery progress") : tr("验收与付款", "Accept & pay")]] as const).map(([panel, label]) => <button key={panel} aria-pressed={workspacePanel === panel} className={workspacePanel === panel ? "active" : ""} onClick={() => setWorkspacePanel(panel)}>{label}</button>)}
        </nav>
        {quote && nextStep && <div className={`collaboration-workspace-bar guided-workspace-bar no-print${busy ? " is-busy" : ""}`}><strong>{buyer ? tr("买家工作台", "Buyer workspace") : tr("卖家工作台", "Seller workspace")}<small>{sandboxRoleplay ? tr("Sandbox 双端演练", "Sandbox role rehearsal") : roleplay ? tr("双端演示", "Two-sided demo") : collaboration ? tr("成员身份已确认", "Participant workspace") : tr("单人测试", "Single-user test")}</small></strong><span role="status" aria-live="polite">{busy ? <><LoaderCircle size={13} className="spin"/>{busyLabel}</> : nextStep.help}</span><button className="subtle-button workspace-next-action" type="button" disabled={!!busy} onClick={nextStep.action}>{nextStep.label}<ArrowRight size={14}/></button><button className="text-button workspace-refresh" disabled={!!busy} onClick={refreshCase} aria-label={tr("刷新项目", "Refresh project")} title={tr("刷新项目", "Refresh project")}><RefreshCw size={13}/></button></div>}
        {!quote && !sellerEntry && !welcomeActive && workspaceView === "workbench" && <div className="role-context-banner no-print"><strong>{tr("买家：约定要求、查看交付、验收与付款", "Buyer: set requirements, inspect delivery, accept and pay")}</strong><span>{tr("交付文件由卖家提供。想先体验完整流程，可以用同一账号切换样板的两端。", "Sellers provide the delivery files. Try both sides of a demo with one account.")}</span><button className="subtle-button" disabled={!!busy || loading} onClick={startRoleDemo}>{tr("体验双端样板", "Try the two-sided demo")}<ArrowRight size={14}/></button></div>}
        {sellerEntry && workspaceView === "workbench" && <section className="seller-entry" aria-label={tr("卖家工作台", "Seller workspace")}><span className="section-kicker">SELLER WORKSPACE</span><h2>{tr("卖家负责交付，买家负责验收", "Sellers deliver. Buyers accept.")}</h2><p>{tr("真实项目：通过买家发来的邀请链接加入，使用受邀邮箱登录。加入后，在这里上传文件、填写说明、提交验收并处理修改意见。", "For a real project, open the buyer's invitation and sign in with the invited email. Then upload files, describe your work, submit for acceptance and respond to feedback here.")}</p><div className="seller-entry-actions"><button className="button primary" disabled={!!busy || loading} onClick={startRoleDemo}>{tr("先体验双端样板", "Try a two-sided demo first")}<ArrowRight size={15}/></button><button className="subtle-button" disabled={!!busy} onClick={() => setWorkspaceView("history")}>{tr("查看卖家项目", "View seller projects")}</button></div><div className="seller-entry-cards">{roleRecords.map(item => <button className="seller-entry-card" key={item.id} disabled={!!busy} onClick={() => openCase(item)}><strong>{item.title}</strong><span>{item.proof.demoRoleplay ? tr("双端演示", "Two-sided demo") : item.reference} · {stateLabel(item, true)}</span><ArrowUpRight size={16}/></button>)}</div>{!loading && !roleRecords.length && <p>{tr("还没有以卖家身份参与的项目。切换工作台不会自动加入买家的项目。", "You have no seller projects yet. Switching workspaces does not join you to a buyer's project.")}</p>}</section>}
        <div className={`workspace-grid cockpit-grid panel-${workspacePanel} ${!quote ? "is-intake" : ""}`} id="workspace" ref={workspaceRef} tabIndex={-1} hidden={workspaceView !== "workbench" || sellerEntry || welcomeActive}>
          <aside className="scope-panel" aria-label={tr("服务约定", "Service agreement")}>
            <div className="section-heading"><span className="section-kicker">01 / THE AGREEMENT</span><h2>{tr("先把标准说清楚", "Start with a clear agreement")}</h2></div>
            <div className="scope-document">
              <div className="scope-topline"><span><FileText size={14} />{tr("交付服务约定", "DELIVERY AGREEMENT")}</span>{quote && <span className="tiny-reference">{quote.reference}</span>}</div>
              {quote ? <>
                <h3>{quote.title}</h3>
                <p className="scope-description">{quote.summary}</p>
                <div className="contract-price"><strong>{money(quote.totalCents)}</strong><span>{quote.currency}<small>{tr("项目金额", "PROJECT TOTAL")}</small></span></div>
                <div className="contract-client"><span>{tr("客户", "CLIENT")}</span><strong>{quote.clientName}</strong><span className={`small-state ${quote.status !== "draft" ? "positive" : ""}`}>{quote.status === "draft" ? tr("标准待确认", "Awaiting approval") : <><LockKeyhole size={11} />{tr("标准已锁定", "Scope locked")}</>}</span></div>
                <details className="scope-criteria">
                  <summary>{tr(`查看 ${proof?.criteria.length ?? 0} 项验收标准`, `View ${proof?.criteria.length ?? 0} acceptance criteria`)}</summary>
                  {proof?.criteria.map((criterion, index) => <div className="scope-criterion" key={criterion.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{criterionDisplayTitle(criterion, language)}</strong><p>“{criterion.source}”</p></div></div>)}
                </details>
                {proof?.requirements && <RequirementsSource agreement={proof.requirements} language={language} criteria={proof.criteria}/>}
                {customProject?.coverage && <RequirementCoverageSource coverage={customProject.coverage} language={language}/>}
                <BusinessChecksSource checks={customProject?.businessChecks} language={language}/>
                {customProject && !customProject.coverage && <p className="requirement-coverage-help">{tr("此旧项目没有逐条需求处理记录；现有约定和验收结果保持原样。", "This earlier project has no per-clause scope record; its existing agreement and acceptance are preserved.")}</p>}
              </> : <>
                <div className="project-mode-switch no-print" aria-label={tr("项目类型", "Project type")}>
                  <button type="button" disabled={!!busy} className={projectMode === "custom" ? "active" : ""} aria-pressed={projectMode === "custom"} onClick={() => { setProjectMode("custom"); setError(""); }}>{tr("我的项目", "My project")}</button>
                  <button type="button" disabled={!!busy} className={projectMode === "demo" ? "active" : ""} aria-pressed={projectMode === "demo"} onClick={() => { setProjectMode("demo"); chooseWorkflow("demo"); setError(""); }}>{tr("内置演示", "Built-in demo")}</button>
                </div>
                <form onSubmit={create} className="project-form no-print">
                  <fieldset disabled={!!busy}>
                    {projectMode === "custom" ? <>
                      <ol className="project-steps" aria-label={tr("新建项目步骤", "Project setup steps")}><li aria-current={projectStep === 0 ? "step" : undefined}>{tr("01 项目与金额", "01 Project & price")}</li><li aria-current={projectStep === 1 ? "step" : undefined}>{tr("02 验收标准", "02 Acceptance")}</li></ol>
                      {projectStep === 0 ? <>
                        <p className="form-help">{tr("没有合同也可以开始。直接描述需求，下一步确认具体的验收标准。", "Start without a contract. Describe your requirements, then confirm specific acceptance criteria.")}</p>
                        <button type="button" className="subtle-button business-example-button" disabled={!!busy || loading} onClick={fillNoodleBusinessExample}><ClipboardCheck size={13}/>{tr("填入面馆业务验收示例", "Fill a noodle-shop content-check example")}</button>
                        <label htmlFor="projectTitle">{tr("项目名称", "Project title")}</label><input id="projectTitle" name="projectTitle" value={projectTitle} maxLength={120} required placeholder={tr("例如：咖啡店网站交付", "e.g. Café website delivery")} onChange={event => setProjectTitle(event.target.value)} />
                        <label htmlFor="projectSummary">{tr("网站需求", "Website requirements")}</label><textarea id="projectSummary" value={projectSummary} maxLength={1000} required rows={3} placeholder={tr("例如：面馆网站展示菜单、价格、营业时间和地址。支持中文与英文。预约入口说明如何联系店家。每行一项会更清楚。", "For example: show the menu, prices, opening hours and address. Support Chinese and English. Explain how to contact the shop to arrange a booking. One requirement per line helps.")} onChange={event => {updateProjectSummary(event.target.value); if (requirementsFromBrief) {setRequirementsDraft(undefined); setRequirementsConfirmed(false); setRequirementsFromBrief(false);}}} />
                        <button type="button" className="requirements-button" disabled={!!busy || loading || !projectSummary.trim()} onClick={analyzeProjectBrief}>{busy === "requirements" ? <LoaderCircle size={13} className="spin"/> : <Sparkles size={13}/>} {config?.aiMode === "live" ? tr("用 AI 整理这些需求", "Organize these requirements with AI") : tr("用规则整理这些需求", "Organize these requirements with rules")}</button>
                        <p className="form-help">{tr("整理是可选的；下一步会保留原文并逐条确认验收范围。AI 整理会把上方需求发送给 DeepSeek；金额单独填写。", "Organizing is optional; the next step retains the source and confirms each row’s acceptance scope. AI organizing sends the requirements above to DeepSeek. Enter the price separately.")}</p>
                        <RequirementsIntake language={language} busy={!!busy || loading} aiMode={config?.aiMode} initialDraft={requirementsFromBrief ? undefined : requirementsDraft} onAnalyze={analyzeRequirements} onApply={draft => applyRequirements(draft)} onClear={() => {setRequirementsDraft(undefined); setRequirementsConfirmed(false); setRequirementsFromBrief(false);}} />
                        <div className="project-price-fields"><div><label htmlFor="projectAmount">{tr("项目金额", "Amount")}</label><input id="projectAmount" value={projectAmount} inputMode="decimal" required placeholder="480.00" aria-describedby="amount-help" onChange={event => setProjectAmount(event.target.value)} /></div><div><label htmlFor="currency">{tr("测试币种", "Currency")}</label><select id="currency" value={currency} onChange={event => setCurrency(event.target.value as Currency)}><option value="AUD">AUD</option><option value="USD">USD</option></select></div></div>
                        <p className="form-help" id="amount-help">{tr("0.01–10000.00，最多两位小数。后续付款使用测试资金。", "0.01–10000.00, up to two decimal places. Payments use test funds.")}</p>
                        <WorkflowChoice value={sandboxCollaboration ? "collaborative-sandbox" : sandboxRehearsal ? "sandbox" : customRoleDemo ? "demo" : collaborative ? "collaborative" : "single"} language={language} sandboxAvailable={config?.paymentMode === "sandbox"} onChange={chooseWorkflow}/>
                        <details className="project-optional"><summary>{tr("客户名称（选填）", "Client name (optional)")}</summary><label className="sr-only" htmlFor="clientName">{tr("客户名称", "Client name")}</label><input id="clientName" value={clientName} maxLength={100} onChange={event => setClientName(event.target.value)} /></details>
                      </> : <>
                        {requirementsDraft && <div className="requirements-confirm-summary"><strong>{tr("从原始需求整理的验收清单", "Checklist prepared from your requirements")}</strong><p>{requirementsDraft.mode === "live" ? tr("AI 建议，已保存原文依据；请逐项编辑确认。", "AI suggestions with saved source excerpts. Edit and confirm every item.") : tr("规则整理 · 未调用 AI。请逐项编辑确认，补足未明确要求。", "Rule-based extraction · no AI request. Edit and confirm every item and resolve unclear requirements.")}</p>{requirementsDraft.unresolved.length > 0 && <p>{tr(`还有 ${requirementsDraft.unresolved.length} 条原文需要自行确认，已保留在原始需求中。`, `${requirementsDraft.unresolved.length} source clauses still need your review and remain in the original requirements.`)}</p>}</div>}
                        {requirementsDraft && <RequirementsDraftSource draft={requirementsDraft} language={language} />}
                        <RequirementCoveragePanel language={language} units={coverageUnits} decisions={coverageRows} confirmed={coverageConfirmed} disabled={!!busy || loading}
                          onDecisionChange={decision => {setCoverageDecisions(current => ({...current, [decision.id]: decision})); setCoverageConfirmed(false);}}
                          onConfirmChange={setCoverageConfirmed}/>
                        {coverageError && <p className="requirement-coverage-warning" role="alert">{coverageError}</p>}
                        <BusinessCheckSuggestions language={language} summary={projectSummary} pages={inputLines(requiredPagesInput)} coverageRows={coverageRows}
                          confirmed={coverageConfirmed} scopeReady={coverageReady && inputLines(requiredPagesInput).length >= 1 && inputLines(requiredPagesInput).length <= 10 && inputLines(requiredPagesInput).includes("index.html") && coverageRows.some(row => row.disposition === "include") && inputLines(requiredPagesInput).every(isHtmlDeliveryPath) && new Set(inputLines(requiredPagesInput).map(file => file.toLowerCase())).size === inputLines(requiredPagesInput).length}
                          aiAvailable={config?.aiMode === "live"} disabled={!!busy || loading} busy={busy === "business-suggestions"} drafts={businessDrafts}
                          onAnalyze={suggestBusinessChecks} onAdopt={adoptBusinessSuggestion} onOpenEditor={openBusinessEditor}/>
                        <BusinessCheckEditor language={language} units={coverageUnits} decisions={coverageRows} pages={inputLines(requiredPagesInput)} rows={businessDrafts} confirmed={businessConfirmed} disabled={!!busy || loading} onChange={setBusinessDrafts} onConfirm={setBusinessConfirmed}/>
                        <details className="project-advanced-checks"><summary>{tr("补充页面与检查方式（可与开发者一起填写）", "Add pages and checks (with your developer)")}</summary>
                          <label htmlFor="requiredPages">{tr("必须交付的 HTML 页面", "Required HTML pages")}</label><textarea id="requiredPages" value={requiredPagesInput} required rows={3} maxLength={1000} aria-describedby="pages-help" onChange={event => setRequiredPagesInput(event.target.value)} />
                          <p className="form-help" id="pages-help">{tr("默认检查 index.html。可与开发者约定更多页面，每行一个，最多 10 页。", "index.html is checked by default. Agree additional pages with your developer, one per line, up to ten.")}</p>
                          <label htmlFor="manualRequirements">{tr("补充人工验收标准（选填）", "Additional human checks (optional)")}</label><textarea id="manualRequirements" value={manualRequirementsInput} rows={2} maxLength={1505} placeholder={tr("例如：与另附设计稿逐屏对照。", "e.g. Compare each screen with the supplied design.")} aria-describedby="manual-help" onChange={event => setManualRequirementsInput(event.target.value)} />
                          <p className="form-help" id="manual-help">{tr("原文中纳入的要求会自动成为人工检查；这里可另加最多 5 条，每条 300 字。", "Included source rows become human checks automatically. Add up to five further checks here, 300 characters each.")}</p>
                          <section className="project-browser-steps" aria-label={tr("要检查的浏览步骤", "Browser steps to check")}>
                            <strong>{tr("要检查的浏览步骤", "Browser steps to check")}</strong>
                            <p className="form-help">{tr("例如：首页到菜单、中文页到英文页、预约说明入口。最多 5 步；检查保存的本地页面，不验证预约提交、邮件或后台。", "For example: home to menu, Chinese to English, or booking instructions. Up to five steps on saved local pages; this does not verify booking submissions, email or backends.")}</p>
                            {browserSteps.map((step, index) => <div className="project-browser-step" key={index}>
                              <div className="project-browser-step-heading"><strong>{tr(`步骤 ${index + 1}`, `Step ${index + 1}`)}</strong><button type="button" className="text-button" onClick={() => setBrowserSteps(current => current.filter((_, item) => item !== index))}>{tr("移除此步骤", "Remove this step")}</button></div>
                              <div className="project-link-fields"><label htmlFor={`linkFrom-${index}`}>{tr("来源页面", "Source page")}</label><input id={`linkFrom-${index}`} value={step.from} required onChange={event => setBrowserSteps(current => current.map((value, item) => item === index ? {...value, from: event.target.value} : value))}/>
                                <label htmlFor={`linkText-${index}`}>{tr("链接可见文字", "Visible link text")}</label><input id={`linkText-${index}`} value={step.text} required maxLength={120} onChange={event => setBrowserSteps(current => current.map((value, item) => item === index ? {...value, text: event.target.value} : value))}/>
                                <label htmlFor={`linkTo-${index}`}>{tr("目标页面（可选 #区域）", "Target page (optional #section)")}</label><input id={`linkTo-${index}`} value={step.to} required onChange={event => setBrowserSteps(current => current.map((value, item) => item === index ? {...value, to: event.target.value} : value))}/></div>
                            </div>)}
                            <button type="button" className="subtle-button" disabled={browserSteps.length >= 5} onClick={() => setBrowserSteps(current => [...current, {from: "index.html", text: "", to: ""}])}><Plus size={12}/>{tr("添加浏览步骤", "Add a browser step")}</button>
                          </section>
                        </details>
                        {requirementsDraft && <label className="requirements-confirm"><input type="checkbox" checked={requirementsConfirmed} onChange={event => setRequirementsConfirmed(event.target.checked)}/><span>{tr("我已核对原文、未明确项和最终清单。新增或改写的标准由我确认；解析不决定金额、验收或付款。", "I reviewed the source, unclear clauses and final checklist. I confirm any added or edited checks. Extraction does not decide the price, acceptance or payment.")}</span></label>}
                      </>}
                    </> : <>
                      <h3>{tr("用同一账号体验买卖双方", "Try both roles with one account")}</h3><p className="form-help">{tr("花艺工作室的三页网站：发现缺页和营业时间差异，提出修改，检查修订版，再由买家验收。示例为虚构测试资料。", "A fictional floral studio website: find a missing page and incorrect opening hours, request changes, inspect the revision, then accept as buyer.")}</p>
                      <WorkflowChoice value={sandboxRehearsal ? "sandbox" : "demo"} language={language} sandboxAvailable={config?.paymentMode === "sandbox"} sampleOnly onChange={chooseWorkflow}/>

                      <label htmlFor="demoCurrency">{tr("测试币种", "Test currency")}</label><select id="demoCurrency" value={currency} onChange={event => setCurrency(event.target.value as Currency)}><option value="AUD">AUD</option><option value="USD">USD</option></select>
                      <label htmlFor="demoClientName">{tr("客户名称（选填）", "Client name (optional)")}</label><input id="demoClientName" value={clientName} maxLength={100} onChange={event => setClientName(event.target.value)} />
                    </>}
                    <div className="project-form-actions">{projectMode === "custom" && projectStep === 1 && <button type="button" className="subtle-button" onClick={() => { setProjectStep(0); setError(""); }}>{tr("上一步", "Back")}</button>}<button className="button primary" type="submit" disabled={!!busy || loading || projectMode === "custom" && projectStep === 1 && (!coverageConfirmed || !coverageReady || !!requirementsDraft && !requirementsConfirmed || !!businessDrafts.length && (!businessConfirmed || !businessDraftsReady))}>{busy === "create" ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{projectMode === "custom" && projectStep === 0 ? tr("下一步：验收标准", "Next: acceptance criteria") : projectMode === "custom" ? tr("创建项目", "Create project") : tr("创建内置演示", "Create built-in demo")}<ArrowRight size={15} /></button></div>
                  </fieldset>
                </form>
              </>}
            </div>
            {buyer && quote?.status === "draft" && <div className="scope-approval no-print"><p><ShieldCheck size={14} />{tr("确认后锁定范围、金额和标准。", "Approval locks the scope, price and criteria.")}</p><button className="button primary" disabled={!!busy} onClick={() => mutate("approve", {}, roleplay ? tr("标准已锁定。切换右上角卖家端，开始准备交付。", "Scope locked. Switch to Seller at the top right to prepare delivery.") : collaboration ? tr("标准已锁定。请在右侧生成卖家邀请链接。", "Scope locked. Create a seller invitation on the right.") : custom ? tr("验收标准已锁定。切换卖家端上传并核查交付。", "Criteria locked. Switch to Seller to upload and check the delivery.") : tr("验收标准已锁定。下一步进行买方预授权。", "Acceptance criteria locked. Continue with buyer authorization."))}>{busy === "approve" ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{tr("确认并锁定约定", "Approve & lock agreement")}</button></div>}
            <div className="scope-note"><ShieldCheck size={18} /><p>{tr("付款由买家确认，模型不会自动放款。", "The buyer confirms payment; the model never releases funds.")}</p></div>
          </aside>
          <section className="evidence-panel" aria-label={tr("交付验收工作台", "Delivery acceptance workspace")}>
            <div className="evidence-heading"><div><span className="section-kicker">02 / PROOF BEFORE PAYMENT</span><h2>{tr("让交付拿出证据", "Let the work show its proof")}</h2></div><div className="document-actions no-print"><button className="icon-button" disabled={!quote || !!busy} onClick={exportRecord} aria-label={tr("导出证据 JSON", "Export evidence JSON")} title={tr("导出证据 JSON", "Export evidence JSON")}><ArrowDownToLine size={16} /></button><button className="subtle-button" disabled={!quote || !!busy} onClick={() => window.print()}><FileText size={14} />{tr("打印 / PDF", "Print / PDF")}</button></div></div>

            <div className={`delivery-workspace ${delivery ? "has-delivery" : ""} ${customView ? "is-custom" : ""}`}>
              <div className="delivery-topline"><div><span className="section-kicker">{sampleRoleplay ? "DEMO DELIVERY" : customView ? "YOUR DELIVERY FILES" : "CONTROLLED EXAMPLES"}</span><h3>{tr("交付版本", "Delivery versions")}</h3></div><span className="fixture-label"><Code2 size={12} />{sampleRoleplay ? tr("演示交付", "DEMO DELIVERY") : customView ? tr("你的交付文件", "YOUR FILES") : tr("内置样例", "EXAMPLE FILES")}</span></div>

              {customView && !buyer && <details className="upload-delivery no-print" open={(!sampleRoleplay && !delivery) || pendingFiles.length > 0 || !!uploadError}>
                <summary><Upload size={15} /><span className="upload-summary-label">{delivery ? tr("提交替换版本", "Submit a replacement") : tr("上传网站文件或文件夹", "Upload website files or folder")}</span>{delivery && <small>{tr(`${Object.keys(deliveryFiles ?? {}).length} 个已保存文件`, `${Object.keys(deliveryFiles ?? {}).length} saved files`)}</small>}</summary>
                <p className="upload-help">{tr("保留目录结构，根目录包含 index.html。最多 40 个 HTML/CSS/PNG/JPEG/WebP 文件；文本每个 64 KiB、合计 256 KiB，图片每个 256 KiB、合计 1 MiB。脚本、表单和外部资源不运行。", "Keep the folder structure with index.html at its root. Up to 40 HTML/CSS/PNG/JPEG/WebP files: text 64 KiB each, 256 KiB total; images 256 KiB each, 1 MiB total. Scripts, forms and external resources do not run.")}</p>
                <label className="sr-only" htmlFor="deliveryFiles">{tr("选择交付文件", "Choose delivery files")}</label><input id="deliveryFiles" ref={fileInputRef} type="file" accept=".html,.css,.png,.jpg,.jpeg,.webp" multiple disabled={!canManageDelivery || !!busy} onChange={event => { setPendingFiles(Array.from(event.target.files ?? [])); setUploadError(""); }} />
                <input id="deliveryFolder" className="sr-only" ref={folderInputRef} type="file" multiple disabled={!canManageDelivery || !!busy} {...({webkitdirectory:""} as Record<string,string>)} onChange={event => {setPendingFiles(Array.from(event.target.files ?? [])); setUploadError("");}}/><button type="button" className="subtle-button" disabled={!canManageDelivery || !!busy} onClick={() => folderInputRef.current?.click()}>{tr("选择项目文件夹", "Choose project folder")}</button>
                {pendingFiles.length > 0 && <div className="pending-file-selection"><div><strong>{tr(`${pendingFiles.length} 个待提交文件`, `${pendingFiles.length} selected files`)}</strong><button type="button" className="text-button" disabled={!!busy} onClick={() => { setPendingFiles([]); setUploadError(""); if (fileInputRef.current) fileInputRef.current.value = "";
        if (folderInputRef.current) folderInputRef.current.value = ""; }}>{tr("清空选择", "Clear selection")}</button></div><ul>{pendingFiles.map((file, index) => <li key={`${file.name}-${index}`}><code>{file.webkitRelativePath || file.name}</code><span>{Math.ceil(file.size / 1024)} KiB</span></li>)}</ul></div>}
                {uploadError && <p className="upload-error" role="alert">{uploadError}</p>}
                {delivery && <p className="upload-replacement-note">{tr("新文件将替换整份当前交付；旧核查与验收同意会失效。", "These files replace the entire delivery. The previous review and acceptance will no longer apply.")}</p>}
                <button type="button" className="button primary upload-submit" disabled={!canManageDelivery || !pendingFiles.length || !!busy} onClick={uploadDelivery}>{busy === "upload" ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}{delivery ? tr("替换文件并重新核查", "Replace files & run fresh checks") : tr("保存并核查交付", "Save & check delivery")}</button>
                {!canManageDelivery && !captured && !voided && !closedUnpaid && <p className="form-help">{quote?.status === "draft" || !quote ? tr("先创建项目并锁定标准，即可上传核查。", "Create a project and lock its criteria to upload and review.") : collaboration?.stage === "submitted" ? tr("此版本已提交，等待买家验收；买家退回后可上传修订版。", "This version is submitted. Wait for buyer review; upload a revision after changes are requested.") : collaboration?.stage === "accepted" ? tr("此版本已被买家接受，不能再替换。", "The buyer accepted this version; it can no longer be replaced.") : tr("当前交付已锁定；请先处理待确认的付款状态。", "The delivery is locked. Resolve the pending payment state first.")}</p>}
              </details>}
              {(!customView || sampleRoleplay) && !buyer && <div className="demo-quick-deliveries no-print"><p>{roleplay ? tr("保存样例时自动核查，再填写说明提交。也可上传自己的文件。", "Save and check a sample, then submit a note. You can also upload your files.") : tr("旧版内置样例：卖家端准备交付，买家端验收。", "Older built-in sample: prepare as seller, accept as buyer.")}</p><div className="variant-options">
                <button className={`variant-button is-flawed ${delivery?.variant === "flawed" ? "selected" : ""}`} disabled={!canManageDelivery || !!busy} onClick={() => mutate("delivery", { variant: "flawed" }, roleplay ? tr("缺陷样例已保存并核查，请填写说明提交验收。", "Sample saved and checked. Add a note and submit.") : tr("缺陷版已提交。请核查其证据；预约链接的目标不存在。", "Flawed delivery submitted. Review the evidence: the booking destination is missing."))}><span className="variant-icon"><CircleAlert size={18} /></span><span><strong>{roleplay ? tr("准备缺陷样例", "Prepare flawed sample") : tr("提交缺陷版", "Submit flawed version")}</strong><small>{tr("预约链接目标缺失", "Missing booking destination")}</small></span><span className="variant-corner">v1<ArrowUpRight size={12} /></span></button>
                <button className={`variant-button is-fixed ${delivery?.variant === "fixed" ? "selected" : ""}`} disabled={!canManageDelivery || !!busy} onClick={() => mutate("delivery", { variant: "fixed" }, roleplay ? tr("修复样例已保存并核查，可提交验收。", "Fixed sample saved and checked. Submit for review.") : tr("修复版已保存并重新核查。", "Fixed delivery saved with fresh rule checks."))}><span className="variant-icon"><FileCheck2 size={18} /></span><span><strong>{roleplay ? tr("准备修复样例", "Prepare fixed sample") : tr("提交修复版", "Submit fixed version")}</strong><small>{tr("补齐预约链接目标", "Booking link destination restored")}</small></span><span className="variant-corner">v2<ArrowUpRight size={12} /></span></button>
              </div>
              </div>}
              {!customView && !buyer && !authorized && !captured && !voided && !closedUnpaid && <p className="locked-hint no-print"><LockKeyhole size={12} />{tr("旧版案例须先由买家完成预授权；新双端样板支持先交付后付款。", "This older case needs buyer authorization first. The new two-sided demo supports delivery before payment.")}</p>}
              {buyer && !collaboration && <p className="locked-hint no-print">{tr("交付证据由卖家提交；买家在这里查看、核查和验收。", "Sellers submit delivery evidence. Buyers inspect, review and accept it here.")}</p>}
              {delivery && <div className="current-delivery"><span className={`delivery-version variant-${delivery.variant}`}>{`v${deliverySequence}`}</span><div><strong>{delivery.label}</strong><code>{delivery.id}</code></div><span className={`small-state ${reviewCurrent ? "positive" : ""}`}>{reviewCurrent ? tr("当前版本已核查", "This version reviewed") : tr("新版本 · 待核查", "New version · review needed")}</span></div>}
              {delivery && proof && <DeliveryOverview key={delivery.id} delivery={delivery} criteria={proof.criteria} review={proof.review} manualChecks={confirmedManualChecks} language={language} role={displayRole} stage={collaboration?.stage} busy={!!busy}
                previousVersion={versions.find(version => isOlderDelivery(version, delivery))}
                onOpenBusiness={businessChecksConfigured || businessReport ? openBusinessChecks : undefined}
                onOpenLayout={canCheckDelivery || canObserveBrowser || delivery.layoutReport || delivery.browserChecks || businessChecksConfigured ? () => {setWorkspacePanel("delivery"); setDeliveryTab("layout");} : undefined}
                onInspectLayout={(file, width) => {setPreviewFile(file); setPreviewWidth(width === 375 ? "mobile" : "desktop"); setPreviewEntry(value => value + 1); setDeliveryTab("preview"); setWorkspacePanel("delivery");}}
                onInspect={openCriterion} onPrepareFeedback={buyer && collaboration?.stage === "submitted" && deliveryUnlocked ? prepareFeedback : undefined}
                onViewHistory={openVersionHistory}/>}
              {delivery && <ResourceChecks delivery={delivery} language={language}/>}
              {delivery && proof && <DeliveryComparison delivery={delivery} review={proof.review} criteria={proof.criteria} previousVersion={versions.find(version => isOlderDelivery(version,delivery))} feedback={collaboration?.feedback} language={language} onInspectCurrent={openCriterion}/>}
              <nav className="delivery-view-switch no-print" hidden={!quote} aria-label={tr("交付查看方式", "Delivery view")}>
                <button aria-pressed={deliveryTab === "preview"} className={deliveryTab === "preview" ? "active" : ""} onClick={() => setDeliveryTab("preview")}><Monitor size={15} />{tr("交付预览", "Preview")}</button>
                <button aria-pressed={deliveryTab === "evidence"} className={deliveryTab === "evidence" ? "active" : ""} onClick={() => setDeliveryTab("evidence")}><FileCheck2 size={15} />{tr("逐项核查", "Evidence checks")}</button>
                <button aria-pressed={deliveryTab === "layout"} className={deliveryTab === "layout" ? "active" : ""} onClick={() => setDeliveryTab("layout")}><ScanLine size={15} />{tr("浏览器检查", "Browser checks")}</button>
              </nav>
              <div className="delivery-preview-view" hidden={!quote || deliveryTab !== "preview"}>
                {!delivery && <div className="empty-delivery"><span><FileCode2 size={30} strokeWidth={1.3} /></span><h4>{buyer ? tr("等待卖家提交交付", "Awaiting the seller’s delivery") : tr("准备你的交付", "Prepare your delivery")}</h4><p>{buyer ? roleplay || !collaboration ? tr("买家不需要上传交付证据。锁定约定后，切换右上角卖家端，体验上传和提交；再切回买家端验收。", "Buyers do not upload delivery evidence. Lock the scope, switch to Seller to prepare and submit, then switch back to Buyer to accept.") : tr("确认约定后，在右侧邀请卖家。卖家上传并提交验收后，你可以在这里查看文件和逐项证据。", "Lock the scope and invite your seller on the right. Once they submit, inspect the files and evidence here.") : sampleRoleplay ? tr("先选择一个样例，或上传自己的 HTML/CSS。核查后填写说明，并提交给买家验收。", "Choose a sample or upload your HTML/CSS. Run the checks, add a delivery note and submit for buyer acceptance.") : tr("上传自己的 HTML/CSS，核查当前版本并填写交付说明后，提交给买家。", "Upload your HTML/CSS, check this version, add a delivery note and submit it to the buyer.")}</p>{buyer && (!collaboration || roleplay) && <button className="subtle-button no-print" disabled={!!busy} onClick={() => switchWorkspaceRole("seller")}>{tr("切换卖家端体验交付", "Switch to Seller to try delivery")}<ArrowRight size={14}/></button>}<div className="empty-evidence-lines" aria-hidden="true"><i /><i /><i /></div></div>}
              {delivery && quote && <section className="preview-section no-print" aria-label={tr("交付版本预览", "Delivery version preview")}>
                <div className="preview-heading">
                  <div className="preview-pages" aria-label={tr("选择预览入口", "Choose a preview entry")}>
                  {previewPages.map(file => <button key={file} title={file} className={previewFile === file ? "active" : ""} aria-pressed={previewFile === file} onClick={() => { setPreviewFile(file); setPreviewEntry(entry => entry + 1); }}><span>{file}</span>{!Object.hasOwn(deliveryFiles ?? {}, file) && <small>{tr("未交付", "missing")}</small>}</button>)}
                </div>
                  <strong>{tr("交付预览入口", "Delivery preview entry")}</strong>
                  <div className="preview-widths" aria-label={tr("预览宽度", "Preview width")}>
                    <button className={previewWidth === "mobile" ? "active" : ""} disabled={!previewAvailable} aria-pressed={previewWidth === "mobile"} onClick={() => setPreviewWidth("mobile")}><Smartphone size={12} />375px</button>
                    <button className={previewWidth === "desktop" ? "active" : ""} disabled={!previewAvailable} aria-pressed={previewWidth === "desktop"} onClick={() => setPreviewWidth("desktop")}><Monitor size={12} />900px</button>
                  </div>
                  {previewAvailable && <a href={deliveryFileUrl(quote.id,delivery.id,previewFile)} target="_blank" rel="noopener noreferrer" title={tr("独立打开当前交付页面", "Open this delivery page separately")} aria-label={tr("在新标签页打开所选预览入口", "Open the selected preview entry in a new tab")}><ArrowUpRight size={14} /></a>}
                </div>
                {previewAvailable
                  ? <div className="preview-scroll"><div className={`preview-frame ${previewWidth}`}><iframe key={`${delivery.id}-${previewFile}-${previewEntry}`} src={deliveryFileUrl(quote.id,delivery.id,previewFile)} title={tr(`交付预览入口：${delivery.label}，${previewFile}`, `Delivery preview entry: ${delivery.label}, ${previewFile}`)} sandbox="allow-same-origin" /></div></div>
                  : <div className="preview-missing" role="status"><FileCode2 size={25} strokeWidth={1.5} /><div><h4>{delivery.files ? tr("此交付缺少所选文件", "This delivery is missing the selected file") : tr("旧记录未保存交付文件", "This older record has no saved delivery files")}</h4><code>{previewFile}</code><p>{delivery.files
                    ? tr("这个版本没有保存该文件，不能预览。缺失状态不会被替换为其他版本的内容。", "This version does not contain the file, so no preview is available. It is not replaced with content from another delivery.")
                    : tr("此记录没有文件快照。请提交新的交付并重新核查；若案例已结束，请新建项目。", "There is no file snapshot for this record. Submit a new delivery and review it again; if the case has ended, create a new project.")}</p></div></div>}
                <details className="preview-note"><summary>{tr("预览范围与说明", "Preview scope and notes")}</summary><p>{tr("已保存的交付页面禁止脚本、表单和外部子资源。链接可能让预览离开当前交付；重新选择入口可返回。请只针对已保存的交付页面确认验收。", "Saved delivery pages cannot run scripts, forms or external subresources. Links may navigate the preview away from this delivery; select an entry again to return. Confirm acceptance only for the saved delivery pages.")}</p></details>
              </section>}

              </div>
              <div className="delivery-layout-view" hidden={deliveryTab !== "layout"}>
                <LayoutCheckPanel key={delivery?.id ?? "empty"} language={language} report={delivery?.layoutReport}
                  enabled={!!deliveryFiles && !!canCheckDelivery && !busy} busy={busy === "layout"} progress={layoutProgress}
                  onRun={checkLayout} onCancel={() => layoutController.current?.abort()}
                  onInspect={(file, width) => {setPreviewFile(file); setPreviewWidth(width === 375 ? "mobile" : "desktop"); setPreviewEntry(value => value + 1); setDeliveryTab("preview"); setWorkspacePanel("delivery");}} />
                {busy === "layout-save" && <p className="layout-check-source" role="status">{tr("正在保存测量报告…", "Saving layout observations…")}</p>}
                <BrowserCheckPanel key={`browser-${delivery?.id ?? "empty"}`} language={language} report={delivery?.browserChecks?.deliveryId === delivery?.id ? delivery?.browserChecks : undefined}
                  enabled={canObserveBrowser && !busy} busy={busy === "browser-check"} progress={browserCheckProgress}
                  onRun={checkBrowserBehavior} onCancel={() => {if (!browserCheckSavePending.current) browserCheckController.current?.abort();}}/>
                <BusinessChecksPanel key={`business-${delivery?.id ?? "empty"}`} language={language} count={customProject?.businessChecks?.length ?? 0} report={businessReport} enabled={canObserveBrowser && !busy} busy={busy === "business-check"} progress={businessCheckProgress} onRun={checkBusinessContent} onCancel={() => {if (!businessCheckSavePending.current) businessCheckController.current?.abort();}} onPrepareFeedback={buyer && collaboration?.stage === "submitted" && deliveryUnlocked && !busy ? (criterionId, comment) => prepareFeedback({deliveryId: delivery!.id, criterionId, comment}) : undefined}/>
                {busy === "business-check-save" && <p className="layout-check-source" role="status">{tr("正在保存业务内容核对…", "Saving business content observations…")}</p>}
                {delivery && <EvidenceHistoryPanel key={`history-${delivery.id}`} delivery={delivery} language={language} acceptedSnapshotId={collaboration?.acceptance?.evidenceSnapshotId}/>}
                {busy === "browser-check-save" && <p className="layout-check-source" role="status">{tr("正在保存链接行为与资源观察…", "Saving link behavior and resource observations…")}</p>}
              </div>
              <div className="delivery-evidence-view" hidden={deliveryTab !== "evidence"}>
                {!delivery && <p className="empty-evidence-message">{buyer ? tr("等待卖家提交后，在这里查看逐项核查证据。买家不需要提供交付文件。", "Inspect evidence here after the seller submits. Buyers do not provide delivery files.") : tr("准备并保存交付文件后，在这里核查当前版本，再提交验收。", "Prepare and save delivery files, check this version here, then submit for acceptance.")}</p>}
              {delivery && <div className="review-toolbar no-print"><div><span className="source-badge">{proof?.review?.mode === "live" && reviewCurrent ? tr("规则核查 + AI 解释", "RULE CHECKS + AI EXPLANATION") : tr("即时规则核查", "RULE CHECKS")}</span><span>{tr("只有当前版本的核查结果可以用于验收。", "Only this delivery’s review can be accepted.")}</span></div><button className="subtle-button" disabled={!canCheckDelivery || !!busy || reviewCurrent} onClick={() => mutate("review", {deliveryId: delivery?.id}, tr("逐项核查完成。需要人工确认的标准仍由你亲自检查。", "Evidence reviewed. Requirements marked for human confirmation still need your direct inspection."))}>{busy === "review" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{reviewCurrent ? tr("规则已核查", "Rules checked") : tr("核查当前交付", "Review this delivery")}</button></div>}

              {reviewCurrent && proof?.review && <details className="review-summary">
                <summary className="review-summary-heading"><FileText size={16} /><h3>{proof.review.mode === "live" ? tr("AI 证据解释", "AI evidence explanation") : tr("规则核查摘要 · 未调用 AI", "Rule summary · no AI request")}</h3></summary>
                <p className="review-summary-text">{proof.review.summary}</p>
                <p className="review-summary-note">{tr("这段解释针对当前交付版本。下方规则证据保持独立，解释不会改变核查结果或触发付款；验收仍由你确认。", "This explanation belongs to the current delivery. The rule evidence below remains independent. An explanation cannot change findings or trigger payment; you decide acceptance.")}</p>
              </details>}

              {delivery && custom && <div className="custom-criterion-select no-print"><label htmlFor="criterionChoice">{tr("验收项目", "Acceptance criterion")}</label><select id="criterionChoice" value={criterionIndex} onChange={event => setCriterionIndex(Number(event.target.value))}>{proof?.criteria.map((criterion, index) => <option key={criterion.id} value={index}>{index + 1}/{proof.criteria.length} · {criterionDisplayTitle(criterion, language)} · {findingLabel(findingFor(criterion))}</option>)}</select></div>}
              {delivery && !custom && <nav className="criterion-switch no-print" aria-label={tr("选择验收项目", "Choose an acceptance criterion")}>
                {proof?.criteria.map((criterion, index) => <button key={criterion.id} aria-pressed={criterionIndex === index} className={criterionIndex === index ? "active" : ""} onClick={() => setCriterionIndex(index)}><span>0{index + 1}</span><strong>{criterionDisplayTitle(criterion, language)}</strong><small>{findingLabel(findingFor(criterion))}</small></button>)}
              </nav>}
              {delivery && proof && <DeliveryAssessment report={delivery.assessment?.deliveryId === delivery.id ? delivery.assessment : undefined} riskReviews={delivery.riskReviews} actorRole={displayRole} onSaveRiskReview={saveRiskReview} criteria={proof.criteria} language={language} selectedCriterionId={proof.criteria[criterionIndex]?.id} configured={config?.aiMode === "live"} enabled={!!canCheckDelivery && reviewCurrent && !!delivery.files && !busy} busy={busy === "assess"} onPrepareFeedback={buyer && collaboration?.stage === "submitted" && deliveryUnlocked && !busy ? prepareFeedback : undefined} onRun={() => mutate("assess", {deliveryId: delivery.id, confirm: true}, tr("已保存当前版本的 AI 评估。建议与规则证据独立，最终仍由买家验收。", "AI assessment saved for this version. Advice remains separate from rule evidence; the buyer decides acceptance."))} />}
              {delivery && <div className="criteria-evidence-list">
                {proof?.criteria.map((criterion, index) => {
                  const finding = findingFor(criterion);
                  const matches = evidence.filter(item => item.criterionId === criterion.id);
                  const requirementSource = proof.requirements?.sourceRefs.find(item => item.criterionId === criterion.id)?.source;
                  return <article className={`criterion-evidence ${finding}`} tabIndex={-1} key={criterion.id} hidden={criterionIndex !== index}>
                    <div className="criterion-heading"><span className="criterion-number">0{index + 1}</span><h4>{criterionDisplayTitle(criterion, language)}</h4><span className={`finding-badge finding-${finding}`}>{finding === "pass" ? <Check size={12} /> : finding === "fail" ? <X size={12} /> : finding === "needs_human" ? <Smartphone size={12} /> : <Clock3 size={12} />}{findingLabel(finding)}</span></div>
                    <div className="criterion-source"><span>{proof.requirements ? tr("已确认的验收标准", "CONFIRMED ACCEPTANCE CHECK") : tr("已确认的验收标准", "CONFIRMED ACCEPTANCE CHECK")}</span><p>“{criterion.source}”</p></div>
                    {proof.requirements && <div className="requirements-evidence-source"><span>{tr("原始需求依据", "ORIGINAL REQUIREMENT")}</span>{requirementSource ? <blockquote>{requirementSource.excerpt}</blockquote> : <p>{tr("此项为买家确认或系统建议的检查，没有匹配的提取原文。", "This is a buyer-confirmed or system-suggested check without a matching extracted source clause.")}</p>}</div>}
                    {matches.length ? matches.map(item => <div className="evidence-detail" key={item.id}><div className="evidence-file"><FileCode2 size={13} /><code>{item.file}</code><span>{tr("证据文件", "EVIDENCE FILE")}</span></div><pre><code>{item.excerpt}</code></pre><p className="evidence-explanation"><Info size={13} />{item.explanation}</p></div>) : <p className="not-reviewed"><Clock3 size={13} />{tr("尚未对这个版本核查，不作通过判断。", "This version has not been reviewed. No pass finding yet.")}</p>}
                    {finding === "needs_human" && buyer && (authorized || collaboration?.stage === "submitted") && <><label className="manual-check no-print"><input type="checkbox" checked={confirmedManualChecks.includes(criterion.id)} disabled={!!busy || expired || paymentPending || acceptedCurrent} onChange={event => setManualChecks(old => event.target.checked ? [...old, criterion.id] : old.filter(id => id !== criterion.id))} /><span><strong>{tr("我已人工检查并确认此项", "I checked and confirm this criterion")}</strong><small>{tr("勾选表示你已亲自检查并确认这一要求；源码证据不能代替你的判断。", "Check this only after personally inspecting and confirming this requirement; source evidence does not replace your judgment.")}</small></span></label><div className="human-check-navigation no-print"><span>{tr(`人工检查已确认 ${humanCriteria.length - pendingHumanCriteria.length}/${humanCriteria.length} 项`, `Human checks: ${humanCriteria.length - pendingHumanCriteria.length}/${humanCriteria.length} confirmed`)}</span><button className="text-button" type="button" hidden={acceptedCurrent} disabled={!!busy || expired || paymentPending || failed || !confirmedManualChecks.includes(criterion.id)} onClick={openPendingHumanCheck}>{!manualChecks.includes(criterion.id) ? tr("先检查并勾选当前项", "Check and confirm this item first") : pendingHumanCriteria.length ? tr("下一待检查项", "Next unchecked requirement") : tr("继续验收确认", "Continue to acceptance")}<ArrowRight size={13}/></button></div></>}
                  </article>;
                })}
              </div>}

              </div>
            </div>
          </section>
          <aside className="payment-panel" aria-label={tr("验收与付款", "Acceptance and payment")}>
            <div className="payment-panel-heading"><span className="section-kicker">03 / YOUR DECISION</span><h2>{collaboration && !buyer ? tr("交付进度", "Delivery progress") : tr("验收与付款", "Accept & pay")}</h2></div>
            {terminalPayment && <>{paymentSummary}{paymentReceipt}</>}
            {collaborationPanel && (terminalPayment ? <details className="completed-collaboration" ref={completedCollaborationRef} key={`${quote?.id}:${proof?.paymentState}`}>
              <summary>{tr("交付与协作记录（已锁定）", "Delivery & collaboration record (locked)")}</summary>
              {collaborationPanel}
            </details> : collaborationPanel)}
            {quote && buyer && collaboration?.stage === "submitted" && showDeliveryAcceptance && <div className="collaboration-acceptance-confirm no-print" ref={acceptanceRef}>
              <h3>{tr("人工验收确认", "Confirm delivery acceptance")}</h3>
              <p>{tr("仅接受当前交付，不进行预授权或付款。", "Accept this delivery only, without authorizing or capturing a payment.")}</p>
              {failed ? <p className="capture-blocked has-failure">{tr("仍有未通过的标准，请退回卖家修改。", "Some criteria are unmet. Request changes from the seller.")}</p> : <>
                {!allHumanChecked && <button className="text-button" onClick={openPendingHumanCheck}>{tr("查看并确认人工检查项目", "Inspect the human-check requirements")}<ArrowRight size={13}/></button>}
                {businessChecksConfigured && <BusinessAcceptanceDecision language={language} report={businessReport} reason={businessExceptionReason} disabled={!!busy} onReasonChange={value => {setBusinessExceptionReason(value); setDeliveryConsent(false); setConsent(false);}} onInspect={openBusinessChecks}/>}
                <label className="pay-consent"><input type="checkbox" checked={deliveryConsent} disabled={!!busy || !deliveryUnlocked || !allHumanChecked || !reviewCurrent || !evidenceComplete || !businessDecisionReady} onChange={event => setDeliveryConsent(event.target.checked)}/><span>{tr("我已核查并接受此交付版本。本次确认不付款。", "I have checked and accept this delivery version. This confirmation does not make a payment.")}<code>{delivery?.id}</code></span></label>
                <button className="button primary" disabled={!!busy || !canAcceptDelivery} onClick={() => mutate("accept_delivery", {deliveryId: delivery?.id, confirm: true, manualChecks, ...(businessDecision ? {businessDecision} : {})}, tr("交付已接受。本次确认未发起预授权或付款。", "Delivery accepted. This confirmation did not initiate authorization or payment."))}>{tr("确认接受交付（不付款）", "Accept delivery — no payment")}</button>
              </>}
            </div>}
            {!terminalPayment && paymentSummary}

            {authorized && paymentPending && <div className="pending-payment no-print" role="status"><Clock3 size={16} /><p>{pendingCapture ? tr("测试付款正在核实，尚不能标记为已付款。请重试原扣款操作；交付与验收记录已冻结。", "Test capture is pending, not confirmed paid. Retry the original capture; delivery and acceptance are frozen.") : tr("撤销预授权尚未确认。请重试撤销；本次交付不能继续付款。", "The authorization void is not yet confirmed. Retry the void; capture is unavailable.")}</p></div>}
            {buyer && canReconcile && <section className="payment-reconciliation no-print" aria-label={tr("核对 PayPal 状态", "Check PayPal state")}>
              <div className="reconciliation-heading">
                <div><h3>{tr("向 PayPal 核对这次操作", "Check this operation with PayPal")}</h3><p>{tr("只读取并同步结果，不发起新的扣款或撤销。", "Read and synchronize the result without requesting a capture or void.")}</p></div>
                <button className="subtle-button" disabled={!!busy} onClick={reconcilePayment}>{busy === "reconcile" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{tr("核对 PayPal 状态", "Check PayPal state")}</button>
              </div>
              {currentReconciliation?.kind === "unresolved" && <div className="reconciliation-unresolved" role="status"><CircleAlert size={16} /><div><strong>{tr("最终结果仍未确认", "Final result still unconfirmed")}</strong><p>{unresolvedPaymentMessage(currentReconciliation.reason)}</p><p>{currentReconciliation.reason === "inconsistent_resources" ? tr("交付与验收记录继续锁定。请先查看 PayPal Sandbox 的订单、授权和扣款记录，必要时联系 PayPal 支持；确认清楚后再核对状态。", "Delivery and acceptance remain locked. Inspect the PayPal Sandbox order, authorization and capture records, and contact PayPal support if needed. Check the status again after the history is understood.") : tr("交付与验收记录继续锁定，原操作的同一重试入口保留。请继续核对；若状态持续不明，请查看 PayPal Sandbox 交易记录或联系 PayPal 支持，不要据此认定已付款或授权已关闭。", "Delivery and acceptance remain locked, and the same operation can still be retried. Continue checking; if the outcome remains unclear, inspect the PayPal Sandbox transaction record or contact PayPal support. This result does not confirm payment or a closed authorization.")}</p></div></div>}
            </section>}
            {sandboxRoleplay && !terminalPayment && <p className="sandbox-rehearsal-note">{tr("PayPal Sandbox 双端演练：虚拟卖家，测试商户收款。验收不扣款；预授权和扣款需由买家分别确认。", "PayPal Sandbox role rehearsal: simulated seller, configured test merchant. Acceptance does not capture; the buyer separately confirms authorization and capture.")}</p>}
            {buyer && quote && quote.status === "approved" && proof?.paymentState === "unfunded" && (!collaboration || collaboration.stage === "accepted") && <div className="authorization-action no-print">{returnOrder?.proofId === quote.id ? <><div><strong>{tr("已从 PayPal 返回，尚需完成预授权", "Back from PayPal. Complete the authorization.")}</strong><p>{tr("返回链接不代表预授权成功。点击后向服务器核实并完成，不会扣款。", "Returning is not authorization. Verify and complete it with the server; no capture yet.")}</p></div><button className="button primary" disabled={!!busy} onClick={() => authorize(returnOrder.orderId)}>{busy === "authorize" ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{tr("完成预授权", "Complete authorization")}</button></> : <AuthorizationStart language={language} mode={paymentMode ?? "demo"} busy={!!busy} checkingOut={busy === "checkout"} onCheckout={checkout} />}</div>}
            {authorized && <div className={`authorization-expiry ${expired ? "expired" : ""}`}><Clock3 size={13} /><span>{expired ? pendingCapture
              ? paymentMode === "sandbox" ? tr("本地测试操作时限已到；原扣款结果仍需核对，不代表 PayPal 授权已过期。", "The local test window ended. The original capture still needs verification; this does not mean the PayPal authorization expired.") : tr("演示预授权时限已到；已确认的扣款操作仍需继续核实。", "The demo authorization window ended; the previously accepted capture still needs verification.")
              : paymentMode === "sandbox" ? tr("本地测试操作时限已到，不能发起新的扣款；这不证明 PayPal 授权已过期。", "The local test window ended, so no new capture can start. This does not establish that the PayPal authorization expired.") : tr("演示预授权时限已到，不能发起新的扣款。", "The demo authorization window ended. No new capture can be started.")
              : <>{paymentMode === "demo" ? tr("演示预授权有效期 24 小时", "Demo authorization lasts 24 hours") : tr("本地测试操作时限", "Local test operation window")}{proof?.authorizationExpiresAt && <> · {paymentMode === "sandbox" ? tr("本地截止", "Local deadline") : tr("到期", "Expires")} {time(proof.authorizationExpiresAt, true)}</>}</>}</span></div>}

              {buyer && authorized && delivery && <div className="acceptance-panel no-print">
                <div className="acceptance-heading"><SquareCheckBig size={19} /><div><h3>{tr("证据之后，是你的决定", "The final decision is yours")}</h3><p>{tr("接受当前交付版本，才进入测试扣款。", "Accept this exact delivery before test capture.")}</p></div></div>
                {pendingCapture ? <p className="capture-blocked"><Clock3 size={14} />{tr("付款确认尚未完成。交付版本和同意记录已锁定，请重试同一扣款操作。", "Payment confirmation is pending. The accepted delivery and consent are frozen. Retry the same capture.")}</p> : pendingVoid ? <p className="capture-blocked"><Undo2 size={14} />{tr("撤销正在处理中。请重试撤销，不能发起付款。", "A void is pending. Retry the void; capture is unavailable.")}</p> : !reviewCurrent ? <p className="capture-blocked"><LockKeyhole size={14} />{tr("此交付尚未核查。先运行核查，再继续。", "This delivery needs a review before acceptance.")}</p> : failed ? <p className="capture-blocked has-failure"><CircleAlert size={14} />{tr("存在未通过项，付款已阻止。提交修复版后重新核查。", "A criterion is not met. Capture is blocked. Submit the fix and review again.")}</p> : !evidenceComplete ? <p className="capture-blocked"><Info size={14} />{tr("证据尚不完整，不能确认付款。", "Evidence is incomplete. Capture is unavailable.")}</p> : <><label className="pay-consent"><input type="checkbox" checked={consent} disabled={!!busy || expired || !allHumanChecked || paymentPending || !acceptedCurrent && !businessDecisionReady} onChange={event => setConsent(event.target.checked)} /><span>{acceptedCurrent ? tr("我已接受当前交付，现在单独同意完成", "I already accepted this delivery and separately consent to capture") : tr("我接受当前交付，并同意完成", "I accept this delivery and consent to capture")} <strong>{money(quote?.totalCents ?? 0)} {quote?.currency}</strong> {tr("的测试扣款。", "in test funds.")}<code title={delivery.id}>{delivery.id}</code></span></label>{!allHumanChecked && <button className="human-reminder text-button" onClick={openPendingHumanCheck}>{tr("打开人工确认项目", "Open the human acceptance check")}<ArrowRight size={13} /></button>}</>}
                {!collaboration && !paymentPending && businessChecksConfigured && <BusinessAcceptanceDecision language={language} report={businessReport} reason={businessExceptionReason} disabled={!!busy} onReasonChange={value => {setBusinessExceptionReason(value); setDeliveryConsent(false); setConsent(false);}} onInspect={openBusinessChecks}/>}
                <button className="button primary capture-button" disabled={!!busy || !canCapture} onClick={capture}>{busy === "capture" ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{pendingCapture ? tr("重试核实同一测试付款", "Retry the same test capture") : acceptedCurrent ? tr("单独确认测试扣款", "Confirm test capture") : tr("接受交付并完成测试付款", "Accept delivery & capture test payment")}<ArrowRight size={16} /></button>
                <p className="capture-footnote">{tr("服务器将再次检查预授权、核查版本与人工确认。", "The server rechecks authorization, delivery version and your confirmations.")}</p>
              </div>}
            {buyer && authorized && !pendingCapture && <div className="void-action no-print"><span>{tr("不接受交付？你也可以结束本次预授权。", "Not accepting the work? You can end this authorization.")}</span><button className="text-button" disabled={!!busy} onClick={() => setModal({ kind: "void" })}><Undo2 size={13} />{pendingVoid ? tr("重试撤销预授权", "Retry void authorization") : tr("撤销预授权", "Void authorization")}</button></div>}
          </aside>
        </div>
        <section className="audit-section screen-panel" id="audit" hidden={workspaceView !== "audit"}><div className="section-heading"><span className="section-kicker">03 / THE PAPER TRAIL</span><h2>{tr("每一步，都留有记录", "Every step leaves a clear record")}</h2><p>{tr("按真实操作记录，绑定具体交付版本。", "Actual recorded actions, linked to their delivery versions.")}</p></div>{proof?.audit.length ? <ol className="audit-timeline">{proof.audit.map((event, index) => <li key={`${event.at}-${index}`}><span className="audit-dot">{event.kind === "captured" ? <CheckCheck size={12} /> : <Check size={11} />}</span><div><strong>{auditLabels[event.kind]}</strong>{event.deliveryId && <code>{event.deliveryId}</code>}</div><time dateTime={event.at} title={new Date(event.at).toLocaleString()}>{time(event.at, true)}</time></li>)}</ol> : <div className="audit-empty"><History size={22} strokeWidth={1.5} /><p>{tr("创建约定后，确认、预授权、核查与付款的记录会显示在这里。", "Create an agreement to begin a record of approvals, authorization, review and payment.")}</p></div>}</section>

        <section className="history-section screen-panel no-print" hidden={workspaceView !== "history"}><div className="history-heading"><h2>{buyer ? tr("买家案例", "Buyer cases") : tr("卖家案例", "Seller cases")}<span>{roleRecords.length.toString().padStart(2, "0")}</span></h2><div><button className="icon-button" aria-label={tr("刷新记录", "Refresh cases")} disabled={!!busy || loading} onClick={() => run("history", async () => { const result = await request<CaseList>("/api/proofs"); setRecords(result.quotes.filter(isProof)); setRecordRoles(result.roles ?? {}); })}><RefreshCw size={15} className={busy === "history" ? "spin" : ""} /></button><button className="subtle-button" disabled={!!busy} onClick={startCase}><Plus size={14} />{tr("新建项目", "New project")}</button></div></div>{loading ? <p className="history-loading"><LoaderCircle size={17} className="spin" />{tr("正在加载案例…", "Loading cases…")}</p> : !roleRecords.length ? <p className="history-loading">{workspaceRole === "seller" ? tr("暂无卖家项目。通过买家邀请加入，或先体验双端样板。", "No seller projects yet. Join through a buyer invitation or try a two-sided demo.") : tr("第一份有据可查的交付，从上方约定开始。", "Your first evidence-backed handoff starts with an agreement above.")}</p> : <div className="history-list">{roleRecords.map(item => <button className={`history-row ${item.id === quote?.id ? "selected" : ""}`} key={item.id} disabled={!!busy} onClick={() => openCase(item)}><span className="history-icon"><FileCheck2 size={18} /></span><span className="history-name"><strong>{item.title}</strong><small>{item.clientName} · {item.reference}{item.proof.demoRoleplay ? ` · ${tr("双端演示", "Two-sided demo")}` : item.proof.collaboration ? ` · ${recordRoles[item.id] === "seller" ? tr("卖家", "Seller") : tr("买家", "Buyer")}` : ""}</small></span><span className={`small-state ${item.proof.paymentState === "captured" ? "positive" : ""}`}>{stateLabel(item, true)}</span><span className="history-amount">{money(item.totalCents, item.currency)}<small>{item.currency}</small></span><ArrowUpRight size={16} /></button>)}</div>}</section>
      </main>

      {viewedVersion && quote && <VersionViewer quoteId={quote.id} version={viewedVersion} criteria={quote.proof.criteria} language={language} onClose={() => setViewedVersion(undefined)}/>}
      {modal && <div className="modal-overlay no-print" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setModal(null); }}><div className="confirmation-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-copy" onKeyDown={onModalKey}><button className="icon-button modal-close" disabled={!!busy} aria-label={tr("关闭", "Close")} onClick={() => setModal(null)}><X size={18} /></button><span className="modal-symbol">{modal.kind === "authorize" ? <LockKeyhole size={27} strokeWidth={1.5} /> : <Undo2 size={27} strokeWidth={1.5} />}</span><span className="mode-badge">{modal.kind === "authorize" ? "DEMO AUTHORIZATION" : "VOID AUTHORIZATION"}</span><h2 id="confirmation-title">{modal.kind === "authorize" ? tr("先预授权，暂不付款。", "Authorize first. Don’t pay yet.") : tr("结束这次预授权？", "End this authorization?")}</h2><p id="confirmation-copy">{modal.kind === "authorize" ? tr("这会模拟买方批准 24 小时短期预授权。不会跳转 PayPal、扣款或移动真实资金。交付核查与人工确认后，仍需单独完成测试付款。", "This simulates buyer approval of a 24-hour authorization. It does not open PayPal, capture payment or move real funds. Delivery review and your acceptance are still required before test capture.") : tr("撤销后，本次预授权不能再用于扣款。操作记录与交付证据将保留。", "Once voided, this authorization cannot be captured. The delivery evidence and audit record remain available.")}</p><div className="modal-amount"><span>{tr("本次约定", "AGREEMENT TOTAL")}</span><strong>{money(quote?.totalCents ?? 0)}<small>{quote?.currency}</small></strong></div><button className="button primary" disabled={!!busy} onClick={() => modal.kind === "authorize" ? authorize(modal.orderId) : release()}>{busy ? <LoaderCircle size={16} className="spin" /> : modal.kind === "authorize" ? <Check size={16} /> : <Undo2 size={16} />}{modal.kind === "authorize" ? tr("模拟完成预授权（不扣款）", "Simulate authorization — no capture") : tr("确认撤销预授权", "Confirm void authorization")}</button><button className="cancel-button" disabled={!!busy} onClick={() => setModal(null)}>{tr("返回工作台", "Back to workspace")}</button></div></div>}
    </div>
  );
}
