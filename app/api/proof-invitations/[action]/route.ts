import { acceptInvitation, proofActor, readInvitation } from "@/lib/proof-store";
import { body, handle, HttpError, json } from "@/lib/server";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: {params: Promise<{action: string}>}) {
  return handle(async () => {
    const {action} = await context.params;
    if (action !== "inspect" && action !== "accept") throw new HttpError(404, "Invitation action not found.");
    const actor = proofActor(request, true);
    const input = await body(request, 4000);
    const record = await readInvitation(input.token, actor);
    if (action === "accept") return json(await acceptInvitation(record, actor, input.sellerName, input.confirm));
    const quote = record.quote;
    return json({project: {id: quote.id, reference: quote.reference, title: quote.title, summary: quote.summary,
      currency: quote.currency, totalCents: quote.totalCents, language: quote.language, paymentMode: quote.paymentMode, criteria: quote.proof.criteria},
      expiresAt: record.invitationExpiresAt, email: actor.email});
  });
}
