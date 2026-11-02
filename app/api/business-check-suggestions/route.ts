import { suggestBusinessChecks } from "@/lib/business-check-suggestions";
import { body, handle, HttpError, json, owner, providerEnv } from "@/lib/server";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handle(async () => {
    owner(request, true);
    if (!request.headers.get("oai-authenticated-user-id")) throw new HttpError(401, "Sign in to request business-check suggestions.");
    const suggestions = await suggestBusinessChecks(await body(request, 32 * 1024), providerEnv());
    return json({suggestions}, 201);
  });
}
