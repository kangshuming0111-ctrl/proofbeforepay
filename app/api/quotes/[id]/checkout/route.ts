import { createOrder } from "@/lib/providers";
import { handle, HttpError, json, owner, providerEnv, readQuote, saveQuote } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const ownerId = owner(request, true); const {id} = await context.params;
    const {quote, version} = await readQuote(id, ownerId);
    if (quote.workflow === "proof-v1") throw new HttpError(409, "Use the ProofBeforePay agreement workflow for this record.");
    if (quote.status !== "approved") throw new HttpError(409, "Review and approve this quote before checkout.");
    if (quote.paymentMode === "demo") {
      const orderId = `DEMO-${quote.id}`;
      if (!quote.paypalOrderId) await saveQuote({...quote, paypalOrderId: orderId}, ownerId, version);
      return json({mode: "demo", orderId});
    }
    if (quote.paypalOrderId && quote.paypalApprovalUrl) return json({ mode: "sandbox", orderId: quote.paypalOrderId, approvalUrl: quote.paypalApprovalUrl });
    const origin = new URL(request.url).origin;
    const {orderId, approvalUrl} = await createOrder(quote, providerEnv(), origin);
    if (!quote.paypalOrderId) await saveQuote({...quote, paypalOrderId: orderId, paypalApprovalUrl: approvalUrl}, ownerId, version);
    else if (quote.paypalOrderId !== orderId) throw new HttpError(409, "The payment session changed. Create a new quote to try again.");
    return json({mode: "sandbox", orderId, approvalUrl});
  });
}
