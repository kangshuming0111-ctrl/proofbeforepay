import { quoteTotal, validateDraft } from "@/lib/domain";
import { body, handle, HttpError, json, owner, readQuote, saveQuote } from "@/lib/server";
import { proofActor, proofResponse, readProofCase } from "@/lib/proof-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const {id} = await context.params;
    const actor = proofActor(request);
    try {
      const {quote} = await readQuote(id, actor.id);
      if (quote.workflow !== "proof-v1") return json({quote});
    } catch (error) { if (!(error instanceof HttpError) || error.status !== 404) throw error; }
    return json(proofResponse(await readProofCase(id, actor)));
  });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ownerId = owner(request, true); const {id} = await context.params;
    const {quote, version} = await readQuote(id, ownerId);
    if (quote.workflow === "proof-v1") throw new HttpError(409, "Use the ProofBeforePay agreement workflow for this record.");
    if (quote.status !== "draft") throw new HttpError(409, "Approved quotes are locked. Create a new quote for changes.");
    const patch = await body(request);
    const draft = validateDraft({ title: patch.title ?? quote.title, summary: patch.summary ?? quote.summary, lineItems: patch.lineItems ?? quote.lineItems, assumptions: patch.assumptions ?? quote.assumptions, questions: quote.questions, timelineDays: patch.timelineDays ?? quote.timelineDays });
    const updated = { ...quote, ...draft, totalCents: quoteTotal(draft.lineItems) };
    await saveQuote(updated, ownerId, version); return json({quote: updated});
  });
}
