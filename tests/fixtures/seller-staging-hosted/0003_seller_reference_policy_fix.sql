-- Correct the controlled seller native business rule to the buyer-agreed6.
-- Schema-only VIEW change; no old receipt is edited or deleted.
DROP VIEW seller_business_policy;
--> statement-breakpoint
CREATE VIEW seller_business_policy AS SELECT 1 AS id, 6 AS max_party_size;
