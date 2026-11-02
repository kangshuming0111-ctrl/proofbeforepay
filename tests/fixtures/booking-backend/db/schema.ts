import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Disposable synthetic data only. No participant identity, real booking, email,
// model credentials, payment or main ProofBeforePay records belong in this D1.
export const labBookings = sqliteTable("lab_bookings", {
  id: text("id").primaryKey().notNull(),
  testRunId: text("test_run_id").notNull(),
  marker: text("marker").notNull(),
  customer: text("customer").notNull(),
  email: text("email").notNull(),
  slot: text("slot").notNull(),
  partySize: integer("party_size").notNull(),
  revision: text("revision").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, table => [
  uniqueIndex("lab_bookings_revision_key_unique").on(table.revision, table.idempotencyKey),
  check("lab_bookings_synthetic_customer", sql`${table.customer} = 'PBP synthetic'`),
  check("lab_bookings_synthetic_email", sql`${table.email} = 'pbp-test@example.invalid'`),
  check("lab_bookings_synthetic_slot", sql`${table.slot} = '2099-01-01T10:00:00Z'`),
  check("lab_bookings_marker", sql`${table.marker} = 'PBP-' || ${table.testRunId}`),
  check("lab_bookings_party_size", sql`${table.partySize} IN (2, 3)`),
  check("lab_bookings_revision", sql`${table.revision} = 'booking-fixed-v2'`),
]);

// Separate table for the opt-in requirement-policy protocol. Keeping the original
// table and migration unchanged preserves existing v1 synthetic receipts.
export const labPolicyBookings = sqliteTable("lab_policy_bookings", {
  id: text("id").primaryKey().notNull(),
  testRunId: text("test_run_id").notNull(),
  marker: text("marker").notNull(),
  customer: text("customer").notNull(),
  email: text("email").notNull(),
  slot: text("slot").notNull(),
  partySize: integer("party_size").notNull(),
  revision: text("revision").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, table => [
  uniqueIndex("lab_policy_bookings_revision_key_unique").on(table.revision, table.idempotencyKey),
  check("lab_policy_bookings_synthetic_customer", sql`${table.customer} = 'PBP synthetic'`),
  check("lab_policy_bookings_synthetic_email", sql`${table.email} = 'pbp-test@example.invalid'`),
  check("lab_policy_bookings_synthetic_slot", sql`${table.slot} = '2099-01-01T10:00:00Z'`),
  check("lab_policy_bookings_marker", sql`${table.marker} = 'PBP-' || ${table.testRunId}`),
  check("lab_policy_bookings_party_size", sql`typeof(${table.partySize}) = 'integer' AND ${table.partySize} BETWEEN 1 AND 13`),
  check("lab_policy_bookings_revision", sql`${table.revision} IN ('booking-policy-fixed-v1', 'booking-policy-flawed-v1')`),
  check("lab_policy_bookings_fixed_limit", sql`${table.revision} != 'booking-policy-fixed-v1' OR ${table.partySize} <= 6`),
]);
