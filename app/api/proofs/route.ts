import type { ProofQuote } from "@/lib/contracts";
import { proofCriteria } from "@/lib/proof-evidence";
import { parseStaticProject } from "@/lib/static-project";
import { createRoleplayProject, requestSandboxTesting } from "@/lib/proof-demo";
import { body, handle, HttpError, insertQuote, json, owner, providerEnv } from "@/lib/server";
import { listProofCases, proofActor } from "@/lib/proof-store";
import { readRequirementDraft } from "@/lib/requirement-store";
import { confirmRequirementDraft } from "@/lib/requirement-extraction";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => json(await listProofCases(proofActor(request))));
}

export async function POST(request: Request) {
  return handle(async () => {
    const ownerId = owner(request, true);
    const input = await body(request);
    if (input.collaborative !== undefined && typeof input.collaborative !== "boolean") throw new HttpError(400, "Choose a valid collaboration mode.");
    if (input.demoRoleplay !== undefined && typeof input.demoRoleplay !== "boolean") throw new HttpError(400, "Choose a valid demo role-play mode.");
    const config = providerEnv();
    const sandboxTesting = requestSandboxTesting(input, proofActor(request).authenticated,
      !!config.PAYPAL_CLIENT_ID?.trim() && !!config.PAYPAL_CLIENT_SECRET?.trim());
    const sandboxRehearsal = sandboxTesting === "rehearsal";
    const sandboxCollaboration = sandboxTesting === "collaborative";
    const demoRoleplay = input.demoRoleplay === true;
    if (demoRoleplay && input.mode !== "demo" && input.mode !== "custom") throw new HttpError(400, "Choose a built-in demo or custom project for role play.");
    const collaborative = input.collaborative === true || demoRoleplay;
    if (collaborative && !proofActor(request).authenticated) throw new HttpError(401, "Sign in to create a shared delivery project.");
    if (collaborative && input.mode !== "custom" && !demoRoleplay) throw new HttpError(400, "Create a custom project for buyer/seller collaboration.");
    const language = input.language === "en" ? "en" : "zh";
    if (input.currency !== undefined && input.currency !== "AUD" && input.currency !== "USD") throw new HttpError(400, "Unsupported currency.");
    if (input.clientName !== undefined && (typeof input.clientName !== "string" || input.clientName.length > 100)) throw new HttpError(400, "Client name must be at most 100 characters.");
    const currency = input.currency === "USD" ? "USD" : "AUD";
    const clientName = typeof input.clientName === "string" && input.clientName.trim() ? input.clientName.trim() : (language === "zh" ? "示例客户" : "Demo client");
    if (input.mode !== undefined && input.mode !== "demo" && input.mode !== "custom") throw new HttpError(400, "Choose a custom project or a demo agreement.");
    if (input.requirementsDraftId !== undefined && input.mode !== "custom") throw new HttpError(400, "Requirement drafts can only be attached to custom website projects.");
    const custom = input.mode === "custom" ? parseStaticProject(input, language) : demoRoleplay ? createRoleplayProject(language, sandboxRehearsal) : undefined;
    const criteria = custom?.criteria ?? proofCriteria(language);
    let requirements;
    if (input.requirementsDraftId !== undefined && custom) {
      if (!proofActor(request).authenticated) throw new HttpError(401, "Sign in to confirm extracted requirements.");
      const draft = await readRequirementDraft(input.requirementsDraftId, ownerId);
      requirements = confirmRequirementDraft(draft, custom.project, criteria, input.confirmRequirements);
    }
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    const quote: ProofQuote = {
      id, reference: `PBP-${id.slice(0, 8).toUpperCase()}`, workflow: "proof-v1",
      title: custom?.title ?? (language === "zh" ? "三页服务网站交付约定" : "Three-page service website agreement"),
      summary: custom?.summary ?? (language === "zh" ? "固定范围样例：三页网站、手机布局与可用的预约入口。" : "Fixed-scope example: three pages, a mobile layout and a working booking entry."),
      brief: criteria.map(c => c.source).join("\n"), clientName, language, currency,
      lineItems: [{id: "website", description: custom?.title ?? (language === "zh" ? "网站制作与一次修改" : "Website delivery and one revision"), quantity: 1, unitPriceCents: custom?.totalCents ?? 48000}],
      hourlyRateCents: custom?.totalCents ?? 48000, totalCents: custom?.totalCents ?? 48000, timelineDays: 1,
      assumptions: [language === "zh" ? "静态网页与本地图片资源验收；预授权后24小时内确认，仅测试资金，本网站不托管资金。" : "Static website files and local raster assets; confirm within 24 hours of authorization. Test funds only; this website does not hold funds.", ...(sandboxCollaboration ? [language === "zh" ? "买卖双方使用不同网站账号；验收后由买家单独确认 Sandbox 付款，收款方为服务端配置的测试商户，不向实际卖家结算。" : "Buyer and seller use separate app accounts. After acceptance, only the buyer confirms Sandbox payment to the configured test merchant; the actual seller receives no settlement."] : [])], questions: [],
      status: "draft", aiMode: !demoRoleplay && config.DEEPSEEK_API_KEY ? "live" : "demo", paymentMode: sandboxTesting || !collaborative && config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET ? "sandbox" : "demo", createdAt: at,
      proof: {criteria, ...(requirements ? {requirements} : {}), ...(demoRoleplay ? {demoRoleplay: true, demoSampleProject: input.mode === "demo"} : {}), ...(sandboxRehearsal ? {sandboxRehearsal: true} : {}), ...(sandboxCollaboration ? {sandboxCollaboration: true} : {}), ...(custom ? {project: custom.project} : {}), ...(collaborative ? {collaboration: {stage: "awaiting_seller", feedback: []}} : {}), paymentState: "unfunded", audit: [{at, kind: "created"}]},
    };
    await insertQuote(quote, ownerId);
    return json({quote, role: "buyer"}, 201);
  });
}
