CREATE TABLE `source_visibility_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `delivery_id` text NOT NULL,
  `delivery_digest` text NOT NULL,
  `assessment_id` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `source_visibility_quote_idx` ON `source_visibility_reports` (`quote_id`, `created_at`);
