import { recordBusinessChecks } from "@/lib/business-check-actions";
import { proofActor, proofResponse, readProofCase, saveProofCase } from "@/lib/proof-store";
import { body, handle, json } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const {id} = await context.params;
    const record = await readProofCase(id, proofActor(request, true));
    const next = recordBusinessChecks(record.quote, record.role, await body(request, 96_000));
    await saveProofCase(record, next);
    return json(proofResponse(record, next));
  });
}
