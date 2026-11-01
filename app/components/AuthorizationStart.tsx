import { ArrowUpRight, LoaderCircle, LockKeyhole } from "lucide-react";
import type { Language } from "@/lib/contracts";
import { SandboxLoginHelp } from "./SandboxLoginHelp";

/** Entry guidance only. The existing checkout action retains server authority. */
export function AuthorizationStart({language, mode, busy, checkingOut, onCheckout}: {
  language: Language;
  mode: "demo" | "sandbox";
  busy: boolean;
  checkingOut: boolean;
  onCheckout: () => void;
}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  const action = <button className="button primary" disabled={busy} onClick={onCheckout}>
    {checkingOut ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}
    {mode === "demo" ? tr("体验模拟预授权", "Try demo authorization") : tr("前往 PayPal 测试预授权", "Authorize with PayPal Sandbox")}
    <ArrowUpRight size={15} />
  </button>;
  return mode === "sandbox"
    ? <SandboxLoginHelp language={language}>{action}</SandboxLoginHelp>
    : <><p>{tr("预授权是本次测试流程的第一道确认，不是付款。", "Authorization is the first test confirmation, not payment.")}</p>{action}</>;
}
