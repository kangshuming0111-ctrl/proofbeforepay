import type { RequirementDraft } from "@/lib/contracts";
import { extractRequirements } from "@/lib/requirement-extraction";
import { insertRequirementDraft } from "@/lib/requirement-store";
import { body, handle, HttpError, json, owner, providerEnv } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    const ownerId = owner(request, true);
    if (!request.headers.get("oai-authenticated-user-id")) throw new HttpError(401, "Sign in to extract project requirements.");
    const input = await body(request, 64_000);
    if (typeof input.sourceText !== "string") throw new HttpError(400, "Enter the original contract or project requirements.");
    if (input.sourceName !== undefined && typeof input.sourceName !== "string") throw new HttpError(400, "Source name must be text.");
    if (input.language !== undefined && input.language !== "zh" && input.language !== "en") throw new HttpError(400, "Language must be zh or en.");
    const extraction = await extractRequirements({
      sourceText: input.sourceText,
      ...(input.sourceName !== undefined ? {sourceName: input.sourceName} : {}),
      language: input.language === "en" ? "en" : "zh",
    }, providerEnv());
    const draft: RequirementDraft = {...extraction, id: crypto.randomUUID()};
    await insertRequirementDraft(draft, ownerId);
    return json({draft}, 201);
  });
}
