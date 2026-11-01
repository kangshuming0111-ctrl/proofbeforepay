import { getProofFixture } from "@/lib/proof-evidence";
export async function GET(_request: Request, context: {params: Promise<{variant: string; file: string}>}) {
  const {variant, file} = await context.params;
  if (variant !== "flawed" && variant !== "fixed") return new Response("Example not found", {status: 404});
  const files = getProofFixture(variant).files;
  if (!Object.hasOwn(files, file)) return new Response("Example file not found", {status: 404});
  return new Response(files[file], {headers: {
    "Content-Type": file.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
  }});
}
