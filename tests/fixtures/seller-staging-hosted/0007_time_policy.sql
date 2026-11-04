CREATE TABLE `lab_time_policy_receipts` (
 `id` text PRIMARY KEY NOT NULL,
 `profile` text NOT NULL,
 `run_id` text NOT NULL,
 `case_id` text NOT NULL,
 `marker` text NOT NULL,
 `local_start` text NOT NULL,
 `instant` text NOT NULL,
 `status` text NOT NULL CHECK (`status` IN ('active','cancelled')),
 `created_at` text NOT NULL,
 `expires_at` text NOT NULL,
 UNIQUE (`profile`,`run_id`,`case_id`)
);
--> statement-breakpoint
CREATE INDEX `lab_time_policy_run_idx` ON `lab_time_policy_receipts` (`profile`,`run_id`);
