CREATE TABLE `lab_policy_bookings` (
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
	CONSTRAINT "lab_policy_bookings_synthetic_customer" CHECK("lab_policy_bookings"."customer" = 'PBP synthetic'),
	CONSTRAINT "lab_policy_bookings_synthetic_email" CHECK("lab_policy_bookings"."email" = 'pbp-test@example.invalid'),
	CONSTRAINT "lab_policy_bookings_synthetic_slot" CHECK("lab_policy_bookings"."slot" = '2099-01-01T10:00:00Z'),
	CONSTRAINT "lab_policy_bookings_marker" CHECK("lab_policy_bookings"."marker" = 'PBP-' || "lab_policy_bookings"."test_run_id"),
	CONSTRAINT "lab_policy_bookings_party_size" CHECK(typeof("lab_policy_bookings"."party_size") = 'integer' AND "lab_policy_bookings"."party_size" BETWEEN 1 AND 13),
	CONSTRAINT "lab_policy_bookings_revision" CHECK("lab_policy_bookings"."revision" IN ('booking-policy-fixed-v1', 'booking-policy-flawed-v1')),
	CONSTRAINT "lab_policy_bookings_fixed_limit" CHECK("lab_policy_bookings"."revision" != 'booking-policy-fixed-v1' OR "lab_policy_bookings"."party_size" <= 6)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lab_policy_bookings_revision_key_unique` ON `lab_policy_bookings` (`revision`,`idempotency_key`);