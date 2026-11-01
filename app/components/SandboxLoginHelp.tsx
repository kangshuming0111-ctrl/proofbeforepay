import type { Language } from "@/lib/contracts";
import type { ReactNode } from "react";

/** Login guidance only. Sandbox buyer credentials stay on PayPal's own pages. */
export function SandboxLoginHelp({language, children}: {language: Language; children: ReactNode}) {
  const tr = (zh: string, en: string) => language === "zh" ? zh : en;
  return <aside className="sandbox-login-help" aria-label={tr("PayPal 测试买家登录说明", "PayPal test buyer sign-in help")}>
    <p className="sandbox-login-help-title"><strong>{tr("请用 Personal Sandbox 测试买家", "Use a Personal Sandbox buyer")}</strong></p>
    <p className="sandbox-login-help-note">{tr("与普通 PayPal 账号分开；预授权不扣款。", "Separate from your regular account. Authorization does not capture payment.")}</p>
    {children}
    <a className="sandbox-login-help-link" href="https://developer.paypal.com/dashboard/accounts" target="_blank" rel="noopener noreferrer">{tr("获取测试账号（新标签页）", "Get a test buyer account (new tab)")}</a>
    <details className="sandbox-login-help-steps">
      <summary>{tr("登录步骤与密码说明", "Login and password help")}</summary>
      <ol>
        <li>{tr("用普通 PayPal 账号登录上方的开发者后台。", "Use your regular PayPal account to sign in to the Developer Dashboard linked above.")}</li>
        <li>{tr("进入 Testing Tools → Sandbox Accounts，选择类型为 Personal 的账号。", "Go to Testing Tools → Sandbox Accounts and select an account with type Personal.")}</li>
        <li>{tr("打开 ⋮ → View/Edit account → Login Info。用这里的测试邮箱和测试密码登录付款页。", "Open ⋮ → View/Edit account → Login Info. Use that test email and password on the checkout page.")}</li>
      </ol>
      <p>{tr("重设普通 PayPal 账号密码不会修改测试密码。如果已修改测试密码，请使用新设置的测试密码。登录资料只在 PayPal 页面使用，无需在本项目输入或保存。", "Resetting your regular PayPal password does not change the test password. If you changed the test password, use the new one. Use these credentials only on PayPal's pages; you do not need to enter or save them in this project.")}</p>
    </details>
  </aside>;
}
