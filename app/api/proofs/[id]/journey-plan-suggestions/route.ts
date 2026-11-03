import { suggestProjectJourneyPlan } from "@/lib/journey-plan-provider";
import { journeySuggestionState, prepareJourneySuggestionRequest, saveJourneySuggestions } from "@/lib/journey-plan-adoption";
import { proofActor, proofResponse, readProofCase, saveProofCase } from "@/lib/proof-store";
import { body, handle, HttpError, json, providerEnv } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const {id} = await context.params, record = await readProofCase(id, proofActor(request));
    return json(await journeySuggestionState(record.quote));
  });
}
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const actor = proofActor(request, true);
    if (!actor.authenticated) throw new HttpError(401, "Sign in to request an AI journey-plan suggestion.");
    const {id} = await context.params;
    const record = await readProofCase(id, actor);
    if (record.role !== "buyer") throw new HttpError(403, "Only the buyer may generate journey-plan suggestions.");
    const input = await body(request, 2048), providerInput = await prepareJourneySuggestionRequest(record.quote, record.role, input);
    const suggestions = await suggestProjectJourneyPlan(record.quote, record.role, providerInput, providerEnv());
    // Keep the original quote-version CAS across the provider await: a stale
    // response cannot attach advice to a replacement or a newly confirmed plan.
    await saveProofCase(record, await saveJourneySuggestions(record.quote, record.role, input, suggestions));
    return json({...proofResponse(record), ...await journeySuggestionState(record.quote)}, 201);
  });
}
