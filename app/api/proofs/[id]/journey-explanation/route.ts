import {currentJourneyEvidenceExplanation, journeyEvidenceContext, saveJourneyEvidenceExplanation} from "@/lib/journey-evidence-explanation";
import {explainJourneyEvidence} from "@/lib/journey-evidence-provider";
import {proofActor, proofResponse, readProofCase, saveProofCase} from "@/lib/proof-store";
import {body, handle, HttpError, json, providerEnv} from "@/lib/server";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const actor = proofActor(request);
    if (!actor.authenticated) throw new HttpError(401, "Sign in to read this project's AI journey explanation.");
    const {id} = await context.params, record = await readProofCase(id, actor);
    return json({explanation: await currentJourneyEvidenceExplanation(record.quote) ?? null});
  });
}
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const actor = proofActor(request, true);
    if (!actor.authenticated) throw new HttpError(401, "Sign in to request an AI journey explanation.");
    const {id} = await context.params, input = await body(request, 2048), record = await readProofCase(id, actor);
    const evidence = await journeyEvidenceContext(record.quote, record.role, input);
    const explanation = await explainJourneyEvidence(evidence, providerEnv());
    // Read membership and all version bindings again after the asynchronous
    // model call. A changed report/upload/explanation cannot receive stale AI.
    const fresh = await readProofCase(id, actor);
    await saveProofCase(fresh, await saveJourneyEvidenceExplanation(fresh.quote, fresh.role, input, explanation));
    return json({...proofResponse(fresh), explanation}, 201);
  });
}
