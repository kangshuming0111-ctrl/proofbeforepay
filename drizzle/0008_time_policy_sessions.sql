CREATE TABLE `time_policy_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `delivery_id` text NOT NULL,
  `delivery_digest` text NOT NULL,
  `payload` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `time_policy_quote_idx` ON `time_policy_sessions` (`quote_id`, `created_at`);
