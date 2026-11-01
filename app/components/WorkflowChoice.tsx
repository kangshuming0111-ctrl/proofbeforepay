"use client";

import type { Language } from "@/lib/contracts";

export type WorkflowChoiceValue = "demo" | "sandbox" | "collaborative" | "single";

export function WorkflowChoice({value, language, sandboxAvailable, sampleOnly = false, onChange}: {
  value: WorkflowChoiceValue;
  language: Language;
  sandboxAvailable: boolean;
  sampleOnly?: boolean;
  onChange: (value: WorkflowChoiceValue) => void;
}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  return <>
    <label htmlFor="projectWorkflow">{tr("使用方式", "Workflow")}</label>
    <select id="projectWorkflow" value={value} onChange={event => onChange(event.target.value as WorkflowChoiceValue)} aria-describedby="workflow-help">
      <option value="demo">{tr("双端体验 · 模拟付款", "Try both roles · simulated payment")}</option>
      <option value="sandbox" disabled={!sandboxAvailable}>{tr("双端体验 + PayPal Sandbox 虚拟支付", "Both roles + PayPal Sandbox test payment")}{!sandboxAvailable ? tr("（尚未配置）", " (not configured)") : ""}</option>
      {!sampleOnly && <>
        <option value="collaborative">{tr("邀请真实卖家 · 模拟付款", "Invite a real seller · simulated payment")}</option>
        <option value="single">{tr("单人工具 · PayPal Sandbox", "Single-user tool · PayPal Sandbox")}</option>
      </>}
    </select>
    <p className="form-help" id="workflow-help">{value === "sandbox"
      ? tr("同一个本项目账号体验买卖双方；PayPal 批准使用独立的 Personal Sandbox 测试买家账号。验收后再分别确认预授权和测试扣款，收款方为测试商户，不向真实卖家结算。", "Use one app account for both roles and a separate Personal Sandbox test buyer for PayPal approval. After acceptance, confirm authorization and test capture separately. The payee is the test merchant; no real seller settlement.")
      : value === "demo"
        ? tr("同一账号体验交付、修改与验收。付款为模拟，AI 评估按需单独运行。", "Try delivery, revision and acceptance with one account. Payment is simulated; AI assessment runs only when requested.")
        : value === "collaborative"
          ? tr("两个账号分别交付和验收；付款为模拟。卖家还需已有网站访问权限，项目邀请不会更改网站共享。", "Two accounts handle delivery and acceptance. Payment is simulated. The seller also needs website access; project invitations do not change site sharing.")
          : sandboxAvailable
            ? tr("保留原单人文件核查流程；PayPal 批准使用独立的 Personal Sandbox 测试买家账号，支付仅使用虚拟资金。", "The original single-user file review flow. PayPal approval uses a separate Personal Sandbox test buyer and test funds only.")
            : tr("保留原单人文件核查流程；PayPal Sandbox 尚未配置，付款使用模拟模式。", "The original single-user file review flow. PayPal Sandbox is not configured; payment uses simulation.")}</p>
  </>;
}
