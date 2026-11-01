import { captureOrder } from "@/lib/providers";
import { body, handle, HttpError, json, owner, providerEnv, readQuote, saveQuote } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ownerId = owner(request, true); const {id} = await context.params;
    const {quote, version} = await readQuote(id, ownerId);
    if (quote.workflow === "proof-v1") throw new HttpError(409, "Use the ProofBeforePay agreement workflow for this record.");
    const input = await body(request);
    if (quote.status === "paid") return json({quote});
    if (quote.status !== "approved" || !quote.paypalOrderId || input.orderId !== quote.paypalOrderId) throw new HttpError(409, "This payment does not match an approved quote.");
    const captureId = quote.paymentMode === "demo" ? `SIMULATED-${quote.id}` : (await captureOrder(quote, providerEnv())).captureId;
    const updated = {...quote, status: "paid" as const, paidAt: new Date().toISOString(), captureId};
    await saveQuote(updated, ownerId, version); return json({quote: updated});
  });
}
