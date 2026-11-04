CREATE TABLE `delivery_artifact_manifests` (
 `id` text PRIMARY KEY NOT NULL,
 `quote_id` text NOT NULL,
 `delivery_id` text NOT NULL,
 `delivery_digest` text NOT NULL,
 `created_by` text NOT NULL,
 `payload` text NOT NULL,
 `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `delivery_artifact_quote_idx` ON `delivery_artifact_manifests` (`quote_id`, `created_at`);
