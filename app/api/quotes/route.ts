import { generateDraft } from "@/lib/providers";
import { quoteTotal, validateBrief } from "@/lib/domain";
import { body, handle, insertQuote, json, listQuotes, owner, providerEnv } from "@/lib/server";
import type { Quote } from "@/lib/contracts";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handle(async () => json({ quotes: await listQuotes(owner(request)) })); }
export async function POST(request: Request) {
  return handle(async () => {
    const ownerId = owner(request, true);
    const input = validateBrief(await body(request));
    const config = providerEnv();
    const { draft, aiMode } = await generateDraft(input, config);
    const id = crypto.randomUUID();
    const quote: Quote = { ...draft, id, reference: `BP-${new Date().getUTCFullYear()}-${id.slice(0, 6).toUpperCase()}`, brief: input.brief, clientName: input.clientName, currency: input.currency, language: input.language, hourlyRateCents: Math.round(input.hourlyRate * 100), totalCents: quoteTotal(draft.lineItems), status: "draft", aiMode, paymentMode: config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET ? "sandbox" : "demo", createdAt: new Date().toISOString() };
    await insertQuote(quote, ownerId);
    return json({ quote }, 201);
  });
}
