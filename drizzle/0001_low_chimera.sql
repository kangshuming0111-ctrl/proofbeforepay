CREATE TABLE `proof_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`payload` text NOT NULL,
	`archived_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `quotes` ADD `seller_id` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `invitation_hash` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `invitation_email` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `invitation_expires_at` text;