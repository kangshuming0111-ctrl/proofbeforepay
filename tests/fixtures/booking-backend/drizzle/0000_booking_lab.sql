CREATE TABLE `lab_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`test_run_id` text NOT NULL,
	`marker` text NOT NULL,
	`customer` text NOT NULL,
	`email` text NOT NULL,
	`slot` text NOT NULL,
	`party_size` integer NOT NULL,
	`revision` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "lab_bookings_synthetic_customer" CHECK("lab_bookings"."customer" = 'PBP synthetic'),
	CONSTRAINT "lab_bookings_synthetic_email" CHECK("lab_bookings"."email" = 'pbp-test@example.invalid'),
	CONSTRAINT "lab_bookings_synthetic_slot" CHECK("lab_bookings"."slot" = '2099-01-01T10:00:00Z'),
	CONSTRAINT "lab_bookings_marker" CHECK("lab_bookings"."marker" = 'PBP-' || "lab_bookings"."test_run_id"),
	CONSTRAINT "lab_bookings_party_size" CHECK("lab_bookings"."party_size" IN (2, 3)),
	CONSTRAINT "lab_bookings_revision" CHECK("lab_bookings"."revision" = 'booking-fixed-v2')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_bookings_revision_key_unique` ON `lab_bookings` (`revision`,`idempotency_key`);