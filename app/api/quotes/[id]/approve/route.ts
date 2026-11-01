import { quoteTotal, validateDraft } from "@/lib/domain";
import { handle, HttpError, json, owner, readQuote, saveQuote } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ownerId = owner(request, true); const {id} = await context.params;
    const {quote, version} = await readQuote(id, ownerId);
    if (quote.workflow === "proof-v1") throw new HttpError(409, "Use the ProofBeforePay agreement workflow for this record.");
    if (quote.status !== "draft") return json({quote});
    const draft = validateDraft(quote); const totalCents = quoteTotal(draft.lineItems);
    if (totalCents < 100) throw new HttpError(400, "The quote total must be at least 1.00.");
    const updated = { ...quote, totalCents, status: "approved" as const, approvedAt: new Date().toISOString() };
    await saveQuote(updated, ownerId, version); return json({quote: updated});
  });
}
