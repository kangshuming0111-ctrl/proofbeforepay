"use client";

import type { Language } from "@/lib/contracts";

export type WorkflowChoiceValue = "demo" | "sandbox" | "collaborative" | "collaborative-sandbox" | "single";

export function WorkflowChoice({value, language, sandboxAvailable, sampleOnly = false, onChange}: {
  value: WorkflowChoiceValue;
  language: Language;
  sandboxAvailable: boolean;
  sampleOnly?: boolean;
  onChange: (value: WorkflowChoiceValue) => void;
}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const advanced = value !== "demo" && value !== "collaborative";
  const sandboxSelected = value === "sandbox" || value === "collaborative-sandbox";
  const selectedLabel = {
    demo: tr("自己体验 · 模拟付款", "Try both roles · simulated payment"),
    sandbox: tr("自己体验 · PayPal Sandbox 测试支付", "Try both roles · PayPal Sandbox test payment"),
    collaborative: tr("邀请卖家 · 模拟付款", "Invite a seller · simulated payment"),
    "collaborative-sandbox": tr("邀请卖家 · PayPal Sandbox 测试支付", "Invite a seller · PayPal Sandbox test payment"),
    single: sandboxAvailable ? tr("单人工具 · PayPal Sandbox 测试支付", "Single-user tool · PayPal Sandbox test payment") : tr("单人工具 · 模拟付款", "Single-user tool · simulated payment"),
  }[value];
  return <>
    <div className="workflow-primary-choice">
      <strong>{tr("项目怎么使用？", "How will you use this project?")}</strong>
      <div className="project-mode-switch" role="group" aria-label={tr("选择项目使用方式", "Choose how to use this project")}>
        <button type="button" className={value === "demo" ? "active" : undefined} aria-pressed={value === "demo"} onClick={() => onChange("demo")}>{tr("自己体验 · 模拟付款", "Try both roles · simulated payment")}</button>
        {!sampleOnly && <button type="button" className={value === "collaborative" ? "active" : undefined} aria-pressed={value === "collaborative"} onClick={() => onChange("collaborative")}>{tr("邀请卖家 · 模拟付款", "Invite a seller · simulated payment")}</button>}
      </div>
    </div>
    <p className="form-help workflow-current-choice" role="status"><strong>{tr("当前选择：", "Current choice: ")}</strong>{selectedLabel}{sandboxSelected && !sandboxAvailable ? tr("（尚未配置，暂不可用）", " (not configured; unavailable)") : ""}</p>
    {sandboxSelected && !sandboxAvailable && <p className="form-help">{tr("PayPal Sandbox 尚未配置，请明确选择模拟付款后继续；系统不会自动切换方式。", "PayPal Sandbox is not configured. Explicitly choose simulated payment to continue; the mode is not switched automatically.")}</p>}
    <p className="form-help" id="workflow-help">{value === "sandbox"
      ? tr("同一个本项目账号体验买卖双方；PayPal 批准使用独立的 Personal Sandbox 测试买家账号。验收后再分别确认预授权和测试扣款，收款方为测试商户，不向真实卖家结算。", "Use one app account for both roles and a separate Personal Sandbox test buyer for PayPal approval. After acceptance, confirm authorization and test capture separately. The payee is the test merchant; no real seller settlement.")
      : value === "demo"
        ? tr("同一账号体验交付、修改与验收。付款为模拟，AI 评估按需单独运行。", "Try delivery, revision and acceptance with one account. Payment is simulated; AI assessment runs only when requested.")
        : value === "collaborative-sandbox"
          ? tr("两个网站账号分别交付与验收，只有买家可在验收后确认虚拟支付。收款方为配置的 Sandbox 测试商户，不向实际卖家结算。卖家需已有网站访问权限，邀请不改变共享。", "Separate app accounts deliver and accept the work. Only the buyer can confirm test payment after acceptance. The configured Sandbox test merchant receives it; the actual seller receives no settlement. The seller needs website access; invitations do not change sharing.")
        : value === "collaborative"
          ? tr("两个账号分别交付和验收；付款为模拟。卖家还需已有网站访问权限，项目邀请不会更改网站共享。", "Two accounts handle delivery and acceptance. Payment is simulated. The seller also needs website access; project invitations do not change site sharing.")
          : sandboxAvailable
            ? tr("保留原单人文件核查流程；PayPal 批准使用独立的 Personal Sandbox 测试买家账号，支付仅使用虚拟资金。", "The original single-user file review flow. PayPal approval uses a separate Personal Sandbox test buyer and test funds only.")
            : tr("保留原单人文件核查流程；PayPal Sandbox 尚未配置，付款使用模拟模式。", "The original single-user file review flow. PayPal Sandbox is not configured; payment uses simulation.")}</p>
    <details className="project-optional workflow-advanced-choice" open={advanced || undefined}>
    <summary>{tr("测试支付与其他方式（选填）", "Test payment and other modes (optional)")}</summary>
    <label htmlFor="projectWorkflow">{tr("使用方式", "Workflow")}</label>
    <select id="projectWorkflow" value={value} onChange={event => onChange(event.target.value as WorkflowChoiceValue)} aria-describedby="workflow-help">
      <option value="demo">{tr("双端体验 · 模拟付款", "Try both roles · simulated payment")}</option>
      <option value="sandbox" disabled={!sandboxAvailable}>{tr("双端体验 + PayPal Sandbox 虚拟支付", "Both roles + PayPal Sandbox test payment")}{!sandboxAvailable ? tr("（尚未配置）", " (not configured)") : ""}</option>
      {!sampleOnly && <>
        <option value="collaborative">{tr("邀请真实卖家 · 模拟付款", "Invite a real seller · simulated payment")}</option>
        <option value="collaborative-sandbox" disabled={!sandboxAvailable}>{tr("邀请真实卖家 + Sandbox 虚拟支付", "Invite a real seller + Sandbox test payment")}{!sandboxAvailable ? tr("（尚未配置）", " (not configured)") : ""}</option>
        <option value="single">{sandboxAvailable ? tr("单人工具 · PayPal Sandbox", "Single-user tool · PayPal Sandbox") : tr("单人工具 · 模拟付款", "Single-user tool · simulated payment")}</option>
      </>}
    </select>
    </details>
  </>;
}
