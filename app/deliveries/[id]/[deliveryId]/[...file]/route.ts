import { handle, HttpError } from "@/lib/server";
import { proofActor, readProofCase } from "@/lib/proof-store";
import { assertStaticPath, staticPreviewResponse } from "@/lib/static-resources";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string; deliveryId: string; file: string[]}>}) {
  return handle(async () => {
    const {id, deliveryId, file: segments} = await context.params;
    const {quote} = await readProofCase(id, proofActor(request));
    if (segments.some(segment => segment.includes("/"))) throw new HttpError(404, "Delivery file not found.");
    const file = assertStaticPath(segments.join("/"));
    const delivery = quote.proof.delivery;
    if (!delivery || delivery.id !== deliveryId || !delivery.files || !Object.hasOwn(delivery.files, file)) throw new HttpError(404, "Delivery file not found.");
    const styleSource = new URL(`/deliveries/${encodeURIComponent(id)}/${encodeURIComponent(deliveryId)}/`, request.url).href;
    return staticPreviewResponse(file, delivery.files[file], styleSource, delivery.id);
  });
}
