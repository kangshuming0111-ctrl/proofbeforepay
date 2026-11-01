import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { requirementDrafts } from "@/db/schema";
import type { RequirementDraft } from "./contracts";
import { HttpError } from "./server";

/** Drafts belong to the authenticated creator and are never shared through a list. */
export async function insertRequirementDraft(draft: RequirementDraft, ownerId: string) {
  await getDb().insert(requirementDrafts).values({
    id: draft.id,
    ownerId,
    payload: JSON.stringify(draft),
    createdAt: new Date().toISOString(),
  });
}

export async function readRequirementDraft(id: unknown, ownerId: string): Promise<RequirementDraft> {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) {
    throw new HttpError(404, "Requirement draft not found or expired.");
  }
  const [row] = await getDb().select({payload: requirementDrafts.payload}).from(requirementDrafts)
    .where(and(eq(requirementDrafts.id, id), eq(requirementDrafts.ownerId, ownerId),
      sql`julianday(${requirementDrafts.createdAt}) > julianday('now', '-7 days')`)).limit(1);
  if (!row) throw new HttpError(404, "Requirement draft not found or expired.");
  return JSON.parse(row.payload) as RequirementDraft;
}
