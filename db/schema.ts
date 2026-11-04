import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

/** Exact immutable model report bytes; participant reads use scoped manifests. */
export const modelReportObjects = sqliteTable("model_report_objects", {
  id:text("id").primaryKey(),quoteId:text("quote_id").notNull(),deliveryId:text("delivery_id").notNull(),
  reportId:text("report_id").notNull(),runId:text("run_id").notNull(),payload:text("payload").notNull(),
  payloadSha256:text("payload_sha256").notNull(),payloadBytes:integer("payload_bytes").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("model_report_quote_delivery_idx").on(table.quoteId,table.deliveryId)]);

export const requirementDrafts = sqliteTable("requirement_drafts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Staging applications are operational metadata, never acceptance evidence. */
export const sellerIntegrationRequests = sqliteTable("seller_integration_requests", {
  id: text("id").primaryKey(),
  quoteId: text("quote_id").notNull(),
  deliveryId: text("delivery_id").notNull(),
  deliveryDigest: text("delivery_digest").notNull(),
  submittedBy: text("submitted_by").notNull(),
  payload: text("payload").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("seller_integration_quote_idx").on(table.quoteId, table.createdAt)]);

/** Operator-recorded page observations and HTTP corroboration, never consent. */
export const browserWitnessSessions = sqliteTable("browser_witness_sessions", {
  id: text("id").primaryKey(),
  quoteId: text("quote_id").notNull(),
  deliveryId: text("delivery_id").notNull(),
  deliveryDigest: text("delivery_digest").notNull(),
  startedBy: text("started_by").notNull(),
  payload: text("payload").notNull(),
  version: integer("version").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("browser_witness_quote_idx").on(table.quoteId, table.createdAt)]);

/** Full supplemental traces live outside the immutable acceptance envelope. */
export const transferCompetitionSessions = sqliteTable("transfer_competition_sessions", {
  id: text("id").primaryKey(), quoteId: text("quote_id").notNull(),
  deliveryId: text("delivery_id").notNull(), deliveryDigest: text("delivery_digest").notNull(),
  startedBy: text("started_by").notNull(), status: text("status").notNull(),
  payload: text("payload").notNull(), version: integer("version").notNull(),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
},table=>[index("transfer_competition_quote_idx").on(table.quoteId,table.createdAt)]);

/** Buyer-confirmed supplemental clock policy and bounded synthetic observations. */
export const timePolicySessions = sqliteTable("time_policy_sessions", {
  id:text("id").primaryKey(),quoteId:text("quote_id").notNull(),deliveryId:text("delivery_id").notNull(),
  deliveryDigest:text("delivery_digest").notNull(),payload:text("payload").notNull(),version:integer("version").notNull(),
  createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},table=>[index("time_policy_quote_idx").on(table.quoteId,table.createdAt)]);

/** Participant-reported static citation observations never alter acceptance. */
export const sourceVisibilityReports = sqliteTable("source_visibility_reports", {
 id:text("id").primaryKey(),quoteId:text("quote_id").notNull(),deliveryId:text("delivery_id").notNull(),
 deliveryDigest:text("delivery_digest").notNull(),assessmentId:text("assessment_id").notNull(),
 payload:text("payload").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("source_visibility_quote_idx").on(table.quoteId,table.createdAt)]);

/** Platform GET byte comparisons, separate from acceptance and payment. */
export const deploymentSourceSessions=sqliteTable("deployment_source_sessions",{
 id:text("id").primaryKey(),quoteId:text("quote_id").notNull(),deliveryId:text("delivery_id").notNull(),
 deliveryDigest:text("delivery_digest").notNull(),startedBy:text("started_by").notNull(),payload:text("payload").notNull(),
 version:integer("version").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},table=>[index("deployment_source_quote_idx").on(table.quoteId,table.createdAt)]);

/** Opaque seller-declared build artifact hashes; code is never executed. */
export const deliveryArtifactManifests=sqliteTable("delivery_artifact_manifests",{
 id:text("id").primaryKey(),quoteId:text("quote_id").notNull(),deliveryId:text("delivery_id").notNull(),
 deliveryDigest:text("delivery_digest").notNull(),createdBy:text("created_by").notNull(),payload:text("payload").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("delivery_artifact_quote_idx").on(table.quoteId,table.createdAt)]);

/** Exact-report repair requests and append-only buyer/seller retest history. */
export const evidenceFollowups=sqliteTable("evidence_followups",{id:text("id").primaryKey(),quoteId:text("quote_id").notNull(),sourceDeliveryId:text("source_delivery_id").notNull(),version:integer("version").notNull(),payload:text("payload").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()},table=>[index("evidence_followups_project").on(table.quoteId,table.createdAt)]);
