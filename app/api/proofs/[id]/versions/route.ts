import { listProofVersions, proofActor, readProofCase } from "@/lib/proof-store";
import { handle, json } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const {id} = await context.params;
    const record = await readProofCase(id, proofActor(request));
    return json({versions: await listProofVersions(record)});
  });
}
