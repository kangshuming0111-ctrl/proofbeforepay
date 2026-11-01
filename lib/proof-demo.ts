import type { Language, ProofQuote, ProofRole } from "./contracts.ts";
import { DomainError } from "./domain.ts";
import { createProofDelivery } from "./proof-evidence.ts";
import { createUploadedDelivery, parseStaticProject } from "./static-project.ts";

/** Only these explicitly created, provider-free records support one-owner role play. */
export function isDemoRoleplay(quote: ProofQuote): boolean {
  return quote.proof.demoRoleplay === true && quote.proof.sandboxRehearsal !== true && quote.aiMode === "demo" && quote.paymentMode === "demo"
    && !!quote.proof.project && !!quote.proof.collaboration;
}

/** A separately selected rehearsal uses virtual participants and a real test merchant. */
export function isSandboxRehearsal(quote: ProofQuote): boolean {
  return quote.proof.demoRoleplay === true && quote.proof.sandboxRehearsal === true
    && quote.aiMode === "demo" && quote.paymentMode === "sandbox"
    && !!quote.proof.project && !!quote.proof.collaboration;
}

/** Perspective selection is still restricted to the one authenticated project owner. */
export function isOwnerRoleplay(quote: ProofQuote): boolean {
  return isDemoRoleplay(quote) || isSandboxRehearsal(quote);
}

/** Validate a creation request without silently upgrading old/demo records. */
export function requestSandboxRehearsal(input: Record<string, unknown>, authenticated: boolean, configured: boolean): boolean {
  if (input.paymentTesting === undefined) return false;
  if (input.paymentTesting !== "sandbox") throw new DomainError("Choose the supported Sandbox payment rehearsal.");
  if (!authenticated) throw new DomainError("Sign in to create a Sandbox rehearsal.", 401);
  if (input.demoRoleplay !== true || input.collaborative === true || (input.mode !== "custom" && input.mode !== "demo")) {
    throw new DomainError("Sandbox rehearsal requires a new one-owner custom project or built-in demonstration, without a real seller invitation.");
  }
  if (!configured) throw new DomainError("PayPal Sandbox is not configured. Choose the provider-free demonstration or configure the test application.", 409);
  return true;
}

/** Unknown legacy origins keep uploads and history, but do not gain sample access. */
export function canUseRoleplaySamples(quote: ProofQuote): boolean {
  return isOwnerRoleplay(quote) && quote.proof.demoSampleProject === true;
}

type Membership = {
  buyerId: string;
  sellerId: string | null;
  actorId: string;
  authenticated: boolean;
  requestedDemoRole?: ProofRole;
};

/** The request header can select a demo perspective, never another account or real membership. */
export function resolveProofRole(quote: ProofQuote, membership: Membership): ProofRole | undefined {
  const { buyerId, sellerId, actorId, authenticated, requestedDemoRole } = membership;
  if (buyerId === actorId) {
    if (authenticated && !sellerId && isOwnerRoleplay(quote)
      && (requestedDemoRole === "buyer" || requestedDemoRole === "seller")) return requestedDemoRole;
    return "buyer";
  }
  if (sellerId === actorId && quote.proof.collaboration?.sellerJoinedAt) return "seller";
  return undefined;
}

export function createRoleplayProject(language: Language, sandboxRehearsal = false) {
  return parseStaticProject({
    title: sandboxRehearsal
      ? language === "zh" ? "Sandbox 演练：三页网站交付" : "Sandbox rehearsal: three-page website delivery"
      : language === "zh" ? "双端演示：三页网站交付" : "Two-sided demo: three-page website delivery",
    summary: sandboxRehearsal ? language === "zh"
      ? "同一账号体验虚拟买卖双方的交付、修改和验收，再单独确认 PayPal Sandbox 测试商户付款；不向真实卖家结算。"
      : "One account rehearses virtual buyer/seller delivery, revision and acceptance, followed by separately confirmed PayPal Sandbox test-merchant payment; no real seller settlement."
      : language === "zh"
      ? "买家约定三页网站和预约入口，卖家提交缺陷版或修订版，买家检查证据后验收。此演示无真实卖家或付款。"
      : "The buyer requests three pages and a booking entry. The seller submits an initial or revised version for buyer acceptance. No real seller or payment is involved.",
    amount: "480.00",
    requiredPages: ["index.html", "services.html", "contact.html"],
    link: { from: "index.html", text: "Book a call", to: "contact.html#booking" },
    manualRequirements: [language === "zh"
      ? "网页必须显示营业时间 Monday to Friday, 11am–8pm。"
      : "Display opening hours: Monday to Friday, 11am–8pm."],
  }, language);
}

/** Sample files use the same validation and criteria as uploaded collaborative deliveries. */
export function createRoleplayDelivery(quote: ProofQuote, input: Record<string, unknown>, sequence: number) {
  if (!isOwnerRoleplay(quote)) throw new DomainError("This project does not support owner-role deliveries.", 409);
  if (input.variant === undefined) return createUploadedDelivery(input.files, quote.proof.project!, quote.language, sequence);
  if ((input.variant !== "flawed" && input.variant !== "fixed") || input.files !== undefined) {
    throw new DomainError("Choose one sample delivery or upload files; do not combine them.");
  }
  if (!canUseRoleplaySamples(quote)) throw new DomainError("Upload your own files for this agreement. Fixed samples are only available in a newly created built-in demonstration.", 409);
  const sample = createProofDelivery(input.variant, quote.language);
  // The sample also contains a descriptive JSON manifest, which is not a deliverable HTML/CSS file.
  const files = Object.fromEntries(Object.entries(sample.files ?? {}).filter(([name]) => /\.(?:html|css)$/iu.test(name)));
  return { ...createUploadedDelivery(files, quote.proof.project!, quote.language, sequence), label: sample.label };
}
