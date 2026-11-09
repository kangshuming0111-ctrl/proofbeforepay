import type { Language, ProofDemoExample, ProofQuote, ProofRole } from "./contracts.ts";
import { DomainError } from "./domain.ts";
import { createProofDelivery, type ProofVariant } from "./proof-evidence.ts";
import { createUploadedDelivery, parseStaticProject } from "./static-project.ts";
import { createNoodleDemoProject, noodleDemoFiles } from "./noodle-demo.ts";

/** Only these explicitly created, provider-free records support one-owner role play. */
export function isDemoRoleplay(quote: ProofQuote): boolean {
  return quote.proof.demoRoleplay === true && quote.proof.sandboxRehearsal !== true && quote.proof.sandboxCollaboration !== true && quote.aiMode === "demo" && quote.paymentMode === "demo"
    && !!quote.proof.project && !!quote.proof.collaboration;
}

/** A separately selected rehearsal uses virtual participants and a real test merchant. */
export function isSandboxRehearsal(quote: ProofQuote): boolean {
  return quote.proof.demoRoleplay === true && quote.proof.sandboxRehearsal === true
    && quote.proof.sandboxCollaboration !== true
    && quote.aiMode === "demo" && quote.paymentMode === "sandbox"
    && !!quote.proof.project && !!quote.proof.collaboration;
}

/** Creation-only server marker: real app members, configured test merchant, no seller settlement. */
export function isSandboxCollaboration(quote: ProofQuote): boolean {
  return quote.proof.sandboxCollaboration === true && quote.proof.demoRoleplay !== true
    && quote.proof.sandboxRehearsal !== true && quote.paymentMode === "sandbox"
    && !!quote.proof.project && !!quote.proof.collaboration;
}

/** Perspective selection is still restricted to the one authenticated project owner. */
export function isOwnerRoleplay(quote: ProofQuote): boolean {
  return isDemoRoleplay(quote) || isSandboxRehearsal(quote);
}

/** Validate a creation request without silently upgrading old/demo records. */
export function requestSandboxTesting(input: Record<string, unknown>, authenticated: boolean, configured: boolean): "rehearsal" | "collaborative" | undefined {
  if (input.paymentTesting === undefined) return undefined;
  if (input.paymentTesting !== "sandbox" && input.paymentTesting !== "collaborative-sandbox") throw new DomainError("Choose a supported Sandbox payment testing workflow.");
  if (!authenticated) throw new DomainError("Sign in to create a Sandbox project.", 401);
  const collaborative = input.paymentTesting === "collaborative-sandbox";
  if (collaborative) {
    if (input.collaborative !== true || (input.demoRoleplay !== undefined && input.demoRoleplay !== false) || input.mode !== "custom") {
      throw new DomainError("Two-account Sandbox testing requires a new custom shared project, without owner role play.");
    }
  } else if (input.demoRoleplay !== true || input.collaborative === true || (input.mode !== "custom" && input.mode !== "demo")) {
    throw new DomainError("Sandbox rehearsal requires a new one-owner custom project or built-in demonstration, without a real seller invitation.");
  }
  if (!configured) throw new DomainError("PayPal Sandbox is not configured. Choose the provider-free demonstration or configure the test application.", 409);
  return collaborative ? "collaborative" : "rehearsal";
}

/** Kept for callers that explicitly ask about the existing owner rehearsal. */
export function requestSandboxRehearsal(input: Record<string, unknown>, authenticated: boolean, configured: boolean): boolean {
  return requestSandboxTesting(input, authenticated, configured) === "rehearsal";
}

/** Unknown legacy origins keep uploads and history, but do not gain sample access. */
export function canUseRoleplaySamples(quote: ProofQuote): boolean {
  return isOwnerRoleplay(quote) && quote.proof.demoSampleProject === true;
}

export function requestPreparedDemo(input: Record<string, unknown>): ProofDemoExample | undefined {
  if (input.example === undefined) return undefined;
  if (input.example !== "noodle" && input.example !== "florist") throw new DomainError("Choose a prepared example.");
  if (input.mode !== "demo" || input.demoRoleplay !== true || input.collaborative === true || input.paymentTesting !== undefined) {
    throw new DomainError("Prepared examples require the simulated one-owner demonstration.");
  }
  return input.example;
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

export function createPreparedDemoProject(example: ProofDemoExample, language: Language) {
  if (example === "noodle") return createNoodleDemoProject(language);
  const project = createRoleplayProject(language);
  return {
    ...project,
    title: language === "zh" ? "花店网站示例" : "Florist website example",
    summary: language === "zh"
      ? "我开了家花店，想让客人先看首页，再看看有哪些花和服务，也能找到怎么联系我。\n首页放个「Book a call」按钮，点进去就能看到怎么预约电话。\n请写清营业时间，周一到周五上午 11 点到晚上 8 点。\n客人用手机也要看得清、点得动。"
      : "I run a flower shop. I’d like customers to see our home page, learn about our flowers and services, and find out how to reach us.\nPut a ‘Book a call’ button on the home page so customers can find the booking section.\nPlease show our hours, Monday to Friday from 11 am to 8 pm.\nMake the pages easy to read and use on a phone.",
  };
}

export function preparedDemoDeliveryNote(language: Language, example: ProofDemoExample, variant: ProofVariant): string {
  if (example === "noodle") return language === "zh"
    ? variant === "fixed" ? "我更新了中文菜单的牛肉面价格和到店信息页的电话，请再核对一次。" : "我交了网站首页、中英文菜单和到店信息页，请核对菜单和电话。"
    : variant === "fixed" ? "I updated the beef noodle price on the Chinese menu and the phone number on the visit page. Please check them again." : "I delivered the home page, both menus and the visit page. Please check the menu prices and phone number.";
  return language === "zh"
    ? variant === "fixed" ? "我补上了联系页和预约入口，也改好了营业时间，请再核对一次。" : "我交了花店的网站，请核对服务、联系和营业时间。"
    : variant === "fixed" ? "I added the contact page and booking section and corrected the opening hours. Please check the revision." : "I delivered the flower shop website. Please check its services, contact details and opening hours.";
}

/** Sample files use the same validation and criteria as uploaded collaborative deliveries. */
export function createRoleplayDelivery(quote: ProofQuote, input: Record<string, unknown>, sequence: number) {
  if (!isOwnerRoleplay(quote)) throw new DomainError("This project does not support owner-role deliveries.", 409);
  if (input.variant === undefined) return createUploadedDelivery(input.files, quote.proof.project!, quote.language, sequence);
  if ((input.variant !== "flawed" && input.variant !== "fixed") || input.files !== undefined) {
    throw new DomainError("Choose one sample delivery or upload files; do not combine them.");
  }
  if (!canUseRoleplaySamples(quote)) throw new DomainError("Upload your own files for this agreement. Fixed samples are only available in a newly created built-in demonstration.", 409);
  if (quote.proof.demoExample) {
    if (!isDemoRoleplay(quote)) throw new DomainError("Prepared examples require simulated payment.", 409);
    const files = quote.proof.demoExample === "noodle"
      ? noodleDemoFiles(input.variant)
      : htmlAndCss(createProofDelivery(input.variant, quote.language).files);
    const label = quote.language === "zh"
      ? input.variant === "fixed" ? "卖家修正版" : "卖家首次交付"
      : input.variant === "fixed" ? "Seller’s revised delivery" : "Seller’s first delivery";
    return {...createUploadedDelivery(files, quote.proof.project!, quote.language, sequence), label};
  }
  const sample = createProofDelivery(input.variant, quote.language);
  return { ...createUploadedDelivery(htmlAndCss(sample.files), quote.proof.project!, quote.language, sequence), label: sample.label };
}

function htmlAndCss(files: Record<string, string> | undefined) {
  // The sample also contains a descriptive JSON manifest, which is not a deliverable HTML/CSS file.
  return Object.fromEntries(Object.entries(files ?? {}).filter(([name]) => /\.(?:html|css)$/iu.test(name)));
}
