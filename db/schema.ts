import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  sellerId: text("seller_id"),
  invitationHash: text("invitation_hash"),
  invitationEmail: text("invitation_email"),
  invitationExpiresAt: text("invitation_expires_at"),
  payload: text("payload").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const proofVersions = sqliteTable("proof_versions", {
  id: text("id").primaryKey(),
  quoteId: text("quote_id").notNull(),
  payload: text("payload").notNull(),
  archivedAt: text("archived_at").notNull(),
});

export const requirementDrafts = sqliteTable("requirement_drafts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});
