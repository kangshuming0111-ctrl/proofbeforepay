import { acceptInvitation, proofActor, readInvitation } from "@/lib/proof-store";
import { body, handle, HttpError, json } from "@/lib/server";
import { proofInvitationPreview } from "@/lib/proof-invitation-preview";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: {params: Promise<{action: string}>}) {
  return handle(async () => {
    const {action} = await context.params;
    if (action !== "inspect" && action !== "accept") throw new HttpError(404, "Invitation action not found.");
    const actor = proofActor(request, true);
    const input = await body(request, 4000);
    const record = await readInvitation(input.token, actor);
    const preview = proofInvitationPreview(record.quote);
    if (action === "accept") return json(await acceptInvitation(record, actor, input.sellerName, input.confirm));
    return json({project: preview,
      expiresAt: record.invitationExpiresAt, email: actor.email});
  });
}
