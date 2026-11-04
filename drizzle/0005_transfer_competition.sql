CREATE TABLE `transfer_competition_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `delivery_id` text NOT NULL,
  `delivery_digest` text NOT NULL,
  `started_by` text NOT NULL,
  `status` text NOT NULL,
  `payload` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transfer_competition_quote_idx` ON `transfer_competition_sessions` (`quote_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `transfer_competition_open_project_idx` ON `transfer_competition_sessions` (`quote_id`) WHERE status = 'running';
