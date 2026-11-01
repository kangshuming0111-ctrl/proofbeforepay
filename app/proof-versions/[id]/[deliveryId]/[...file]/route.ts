import { proofActor, readProofCase, readProofVersion } from "@/lib/proof-store";
import { handle, HttpError } from "@/lib/server";
import { assertStaticPath, staticPreviewResponse } from "@/lib/static-resources";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string; deliveryId: string; file: string[]}>}) {
  return handle(async () => {
    const {id, deliveryId, file: segments} = await context.params;
    const record = await readProofCase(id, proofActor(request));
    const {delivery} = await readProofVersion(record, deliveryId);
    if (segments.some(segment => segment.includes("/"))) throw new HttpError(404, "Delivery file not found.");
    const file = assertStaticPath(segments.join("/"));
    if (!delivery.files || !Object.hasOwn(delivery.files, file)) throw new HttpError(404, "Delivery file not found.");
    const styleSource = new URL(`/proof-versions/${encodeURIComponent(id)}/${encodeURIComponent(deliveryId)}/`, request.url).href;
    return staticPreviewResponse(file, delivery.files[file], styleSource, deliveryId);
  });
}
