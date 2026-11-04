CREATE TABLE `seller_integration_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `delivery_id` text NOT NULL,
  `delivery_digest` text NOT NULL,
  `submitted_by` text NOT NULL,
  `payload` text NOT NULL,
  `version` integer NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `seller_integration_quote_idx` ON `seller_integration_requests` (`quote_id`, `created_at`);
