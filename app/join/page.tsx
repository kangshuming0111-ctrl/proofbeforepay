"use client";
import { useEffect, useState } from "react";
import { FileCheck2, LoaderCircle, ShieldCheck } from "lucide-react";
import type { Currency, Language, ProofBusinessCheck, ProofCriterion, RequirementCoverage } from "@/lib/contracts";
import { BusinessChecksSource, businessExpectedLabel } from "../components/BusinessChecksPanel";
import { RequirementCoverageSource } from "../components/RequirementCoveragePanel";
import "../collaboration.css";
import "../business-check.css";
import "../requirement-coverage.css";

type InvitationPreview = {project: {id: string; reference: string; title: string; summary: string; currency: Currency; totalCents: number; language: Language; paymentMode: "demo" | "sandbox"; criteria: ProofCriterion[]; businessChecks: ProofBusinessCheck[]; coverage?: RequirementCoverage; runtimeCheck?: import("@/lib/runtime-checks").RuntimeCheckPlan}; email: string; expiresAt: string};

async function invitationRequest<T>(action: string, input: unknown): Promise<T> {
  const response = await fetch(`/api/proof-invitations/${action}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)});
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Invitation could not be opened.");
  return data as T;
}

export default function JoinProject() {
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<InvitationPreview>();
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const tr = (zh: string, en: string) => preview?.project.language === "en" ? en : zh;
  useEffect(() => {
    let active = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "";
    if (!/^[0-9a-f]{64}$/u.test(value)) {setError("邀请链接不完整，请重新打开买家发给你的原始链接。 / Open the original invitation link from the buyer."); setBusy(false); return;}
    setToken(value);
    invitationRequest<InvitationPreview>("inspect", {token: value}).then(result => {if (active) setPreview(result);})
      .catch(cause => {if (active) setError(cause instanceof Error ? cause.message : "Invitation unavailable.");})
      .finally(() => {if (active) setBusy(false);});
    return () => {active = false;};
  }, []);

  async function accept() {
    if (!preview || !token || !confirmed || !name.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await invitationRequest("accept", {token, confirm: true, sellerName: name.trim()});
      window.history.replaceState({}, "", "/join");
      window.location.assign(`/?proof=${encodeURIComponent(preview.project.id)}`);
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Could not join project."); setBusy(false);}
  }

  return <main className="join-project-page">
    <a className="brand" href="/"><span className="brand-mark"><FileCheck2 size={22}/></span><span>proof<span className="brand-light">before</span>pay.</span></a>
    <section className="join-project-card">
      <span className="section-kicker">SELLER INVITATION</span>
      <h1>{tr("确认约定，加入交付", "Confirm the scope and join as seller")}</h1>
      {busy && !preview && <p role="status"><LoaderCircle size={16} className="spin"/> {tr("正在检查邀请…", "Checking invitation…")}</p>}
      {error && <p role="alert" className="collab-error">{error}</p>}
      {preview ? <>
        <p className="collab-muted">{preview.project.reference} · {tr("受邀账号", "Invited account")} {preview.email}</p>
        <h2>{preview.project.title}</h2><p>{preview.project.summary}</p>
        <strong className="join-project-amount">{new Intl.NumberFormat(preview.project.language === "zh" ? "zh-CN" : "en-AU", {style: "currency", currency: preview.project.currency}).format(preview.project.totalCents / 100)}</strong>
        <ol>{preview.project.criteria.map(criterion => <li key={criterion.id}><strong>{criterion.title}</strong><p>{criterion.source}</p></li>)}</ol>
        {preview.project.coverage && <RequirementCoverageSource coverage={preview.project.coverage} language={preview.project.language}/>}
        {!!preview.project.businessChecks.length && <div className="join-project-business-scope"><h2>{tr("本次交付的业务内容标准", "Business content agreed for this delivery")}</h2><p className="collab-muted">{tr("核对指定页面、菜名、金额、币种和文案。这些是买家锁定的预期值，加入后交付会按同一份计划核对。", "Review the pages, item labels, amounts, currencies and copy. These are the buyer's locked expected values; the same plan will be used to inspect your delivery.")}</p><ul aria-label={tr("已锁定的业务检查", "Locked business checks")}>{preview.project.businessChecks.map(check => <li key={check.id}><strong>{check.file}</strong><p>{businessExpectedLabel(check.expected)}</p><blockquote>{check.source.excerpt}</blockquote></li>)}</ul><BusinessChecksSource checks={preview.project.businessChecks} language={preview.project.language}/></div>}
        {preview.project.runtimeCheck&&<section className="join-project-business-scope"><h2>{tr("已确认的预约后端协议","Agreed booking backend protocol")}</h2><blockquote>{preview.project.runtimeCheck.source.excerpt}</blockquote><p>{preview.project.runtimeCheck.protocol==="booking-http-v2"?tr(`十八步 HTTP 检查：每笔最多 ${preview.project.runtimeCheck.policy.maxPartySize} 人，分别探测 ${preview.project.runtimeCheck.policy.maxPartySize-1} / ${preview.project.runtimeCheck.policy.maxPartySize} / ${preview.project.runtimeCheck.policy.maxPartySize+1} 人、零人、小数、独立回读及同键并发一致性。卖家每次上传需声明兼容的登记目标；不证明全库没有隐藏重复记录、前端表单或邮件可用。`,`Eighteen HTTP steps: maximum ${preview.project.runtimeCheck.policy.maxPartySize} people per booking, probes at ${preview.project.runtimeCheck.policy.maxPartySize-1} / ${preview.project.runtimeCheck.policy.maxPartySize} / ${preview.project.runtimeCheck.policy.maxPartySize+1}, zero, fractions, independent readback and concurrent same-key consistency. Declare a compatible registered target for each upload. This does not prove absence of hidden database duplicates, frontend forms or email delivery.`):tr("基础八步 HTTP 检查：版本声明、错误输入、创建、独立回读、重复请求、冲突和原记录保持。卖家需为每次上传声明登记的测试目标。它不证明前端表单、邮件或所有后台功能。","Eight basic HTTP steps cover declared revision, invalid input, create, independent readback, replay, conflict and unchanged original. Declare a registered test target for each upload. This does not verify the frontend form, email or all backend behavior.")}</p></section>}
        <p className="collab-muted">{preview.project.paymentMode === "sandbox" ? tr("此项目使用 PayPal Sandbox 虚拟测试资金，收款方是服务端配置的测试商户，不向实际卖家结算。加入后可提交和修订交付；仅买家能在验收后单独确认授权与扣款。", "This project uses PayPal Sandbox virtual test funds paid to the configured test merchant, with no actual seller settlement. You can submit and revise deliveries. Only the buyer can authorize and capture test payment after acceptance.") : tr("此项目使用模拟付款，不会向卖家转账。加入后可提交和修订交付；验收与付款确认由买家操作。", "This project uses simulated payment and does not transfer funds to the seller. You can submit and revise deliveries; the buyer controls acceptance and payment confirmation.")}</p>
        <label htmlFor="sellerDisplayName">{tr("你的展示名称", "Your display name")}</label>
        <input id="sellerDisplayName" maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy}/>
        <label className="join-project-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy}/><span>{tr("我已阅读并确认以上范围、金额、排除项、业务内容及可选后端协议，同意按这些验收标准作为卖家参与此项目。", "I have read and confirm the scope, amount, exclusions, business checks and optional backend protocol above, and agree to join as seller under these acceptance criteria.")}</span></label>
        <button className="button primary" disabled={busy || !confirmed || !name.trim()} onClick={accept}>{busy ? <LoaderCircle size={16} className="spin"/> : <ShieldCheck size={16}/>} {tr("确认约定并加入", "Confirm scope and join")}</button>
      </> : !busy && <p className="collab-muted">{tr("请使用受邀邮箱登录，并确认你已有此网站的访问权限。若登录后邀请未恢复，请重新打开买家发来的原始链接。", "Sign in using the invited email and make sure you have access to this website. If the invitation is lost during sign-in, reopen the original link from the buyer.")}</p>}
    </section>
  </main>;
}
