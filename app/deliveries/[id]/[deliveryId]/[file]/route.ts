import { handle, HttpError } from "@/lib/server";
import { proofActor, readProofCase } from "@/lib/proof-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: {params: Promise<{id: string; deliveryId: string; file: string}>}) {
  return handle(async () => {
    const {id, deliveryId, file} = await context.params;
    const {quote} = await readProofCase(id, proofActor(request));
    const delivery = quote.proof.delivery;
    if (!delivery || delivery.id !== deliveryId || !delivery.files || !Object.hasOwn(delivery.files, file)) throw new HttpError(404, "Delivery file not found.");
    const styleSource = new URL(`/deliveries/${encodeURIComponent(id)}/${encodeURIComponent(deliveryId)}/`, request.url).href;
    return new Response(delivery.files[file], {headers: {
      "Content-Type": file.toLowerCase().endsWith(".css") ? "text/css; charset=utf-8" : file.toLowerCase().endsWith(".json") ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
      // The response sandbox also protects a preview opened outside its iframe.
      "Content-Security-Policy": `sandbox allow-same-origin; default-src 'none'; style-src ${styleSource} 'unsafe-inline'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`,
      "Referrer-Policy": "no-referrer", "Cross-Origin-Opener-Policy": "same-origin",
      "X-Robots-Tag": "noindex, nofollow",
      "X-ProofBeforePay-Delivery": delivery.id,
      "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
    }});
  });
}
