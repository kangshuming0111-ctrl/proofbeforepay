CREATE TABLE `browser_witness_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `delivery_id` text NOT NULL,
  `delivery_digest` text NOT NULL,
  `started_by` text NOT NULL,
  `payload` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `browser_witness_quote_idx` ON `browser_witness_sessions` (`quote_id`, `created_at`);
