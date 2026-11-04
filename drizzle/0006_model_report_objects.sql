CREATE TABLE `model_report_objects` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `delivery_id` text NOT NULL,
  `report_id` text NOT NULL,
  `run_id` text NOT NULL,
  `payload` text NOT NULL,
  `payload_sha256` text NOT NULL,
  `payload_bytes` integer NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_report_quote_delivery_idx` ON `model_report_objects` (`quote_id`, `delivery_id`);
