import { proofActor, readProofCase, readProofVersion } from "@/lib/proof-store";
import { handle, json } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string; deliveryId: string}>}) {
  return handle(async () => {
    const {id, deliveryId} = await context.params;
    const record = await readProofCase(id, proofActor(request));
    return json({version: await readProofVersion(record, deliveryId)});
  });
}
