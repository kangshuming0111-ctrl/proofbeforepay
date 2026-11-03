import { suggestProjectJourneyPlan } from "@/lib/journey-plan-provider";
import { proofActor, readProofCase } from "@/lib/proof-store";
import { body, handle, HttpError, json, providerEnv } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const actor = proofActor(request, true);
    if (!actor.authenticated) throw new HttpError(401, "Sign in to request an AI journey-plan suggestion.");
    const {id} = await context.params;
    const record = await readProofCase(id, actor);
    const suggestions = await suggestProjectJourneyPlan(record.quote, record.role, await body(request, 2048), providerEnv());
    // A recommendation is deliberately not saved as a confirmed plan, report,
    // acceptance snapshot or payment instruction.
    return json({suggestions}, 201);
  });
}
