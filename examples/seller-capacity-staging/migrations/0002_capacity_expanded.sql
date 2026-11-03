-- Append-only expanded synthetic capacity storage; old capacity tables and pins are untouched. Never apply to the main app database.
-- A lab may alias its existing D1 only if physical sharing is disclosed.
-- Policy choices are operator configuration, never request parameters.
CREATE VIEW seller_capacity_expanded_policy AS
SELECT 'fixed' AS policy_id,'strict' AS validation_profile,6 AS max_party_size,8 AS max_guests_per_slot,1 AS enforce_capacity,1 AS enforce_email
UNION ALL SELECT 'overbook','strict',6,8,0,1
UNION ALL SELECT 'underlimit','strict',6,7,1,1
UNION ALL SELECT 'fixed','email-gap',6,8,1,0;
--> statement-breakpoint
CREATE TABLE seller_capacity_expanded_receipts (
  id TEXT PRIMARY KEY CHECK(length(id)=36 AND id=lower(id) AND id NOT GLOB '*[^a-f0-9-]*'
    AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-' AND length(replace(id,'-',''))=32),
  namespace TEXT NOT NULL CHECK(length(namespace) BETWEEN 1 AND 450),
  manifest_namespace TEXT NOT NULL CHECK(length(manifest_namespace) BETWEEN 1 AND 400),
  project_id TEXT NOT NULL CHECK(length(project_id) BETWEEN 1 AND 80 AND project_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  registration_revision TEXT NOT NULL CHECK(length(registration_revision) BETWEEN 1 AND 80 AND registration_revision NOT GLOB '*[^A-Za-z0-9_-]*'),
  deployment_revision TEXT NOT NULL CHECK(length(deployment_revision) BETWEEN 1 AND 120 AND deployment_revision NOT GLOB '*[^A-Za-z0-9._-]*'),
  frontend_bundle_digest TEXT NOT NULL CHECK(length(frontend_bundle_digest)=64 AND frontend_bundle_digest NOT GLOB '*[^a-f0-9]*'),
  policy_id TEXT NOT NULL CHECK(policy_id IN('fixed','overbook','underlimit')),
  protocol TEXT NOT NULL CHECK(protocol IN('booking-http-v3','booking-http-v4')),
  validation_profile TEXT NOT NULL CHECK(validation_profile IN('strict','email-gap')),
  test_run_id TEXT NOT NULL CHECK(length(test_run_id)=36 AND test_run_id=lower(test_run_id) AND test_run_id NOT GLOB '*[^a-f0-9-]*'
    AND substr(test_run_id,9,1)='-' AND substr(test_run_id,14,1)='-' AND substr(test_run_id,19,1)='-' AND substr(test_run_id,24,1)='-' AND length(replace(test_run_id,'-',''))=32),
  marker TEXT NOT NULL CHECK(marker='PBP-'||test_run_id),
  customer TEXT NOT NULL CHECK(customer='PBP synthetic'),
  email TEXT NOT NULL CHECK(email IN('pbp-test@example.invalid','not-an-email')),
  slot TEXT NOT NULL CHECK(slot IN('2099-01-01T10:00:00Z','2099-01-01T11:00:00Z','2099-01-01T12:00:00Z','2099-01-01T13:00:00Z','2099-01-01T14:00:00Z')),
  party_size INTEGER NOT NULL CHECK(typeof(party_size)='integer' AND party_size BETWEEN 1 AND 12),
  idempotency_key TEXT NOT NULL CHECK(idempotency_key IN(
    'pbp-'||test_run_id||'-capacity-above','pbp-'||test_run_id||'-capacity-race-a','pbp-'||test_run_id||'-capacity-race-b',
    'pbp-'||test_run_id||'-capacity-fill','pbp-'||test_run_id||'-capacity-extra','pbp-'||test_run_id||'-capacity-slot-b',
    'pbp-'||test_run_id||'-capacity-missing-slot','pbp-'||test_run_id||'-capacity-invalid-email','pbp-'||test_run_id||'-capacity-zero',
    'pbp-'||test_run_id||'-capacity-fraction','pbp-'||test_run_id||'-capacity-negative','pbp-'||test_run_id||'-capacity-string',
    'pbp-'||test_run_id||'-capacity-same-key','pbp-'||test_run_id||'-capacity-one','pbp-'||test_run_id||'-capacity-below')),
  created_at TEXT NOT NULL CHECK(length(created_at)=24),
  expires_at TEXT NOT NULL CHECK(length(expires_at)=24 AND expires_at>created_at),
  CHECK(manifest_namespace=project_id||':'||registration_revision||':'||deployment_revision||':'||frontend_bundle_digest||':'||policy_id||':'||protocol||':'||validation_profile),
  CHECK(namespace=manifest_namespace||':'||test_run_id),
  CHECK(protocol='booking-http-v4' OR (slot IN('2099-01-01T10:00:00Z','2099-01-01T11:00:00Z') AND idempotency_key IN(
    'pbp-'||test_run_id||'-capacity-above','pbp-'||test_run_id||'-capacity-race-a','pbp-'||test_run_id||'-capacity-race-b',
    'pbp-'||test_run_id||'-capacity-fill','pbp-'||test_run_id||'-capacity-extra','pbp-'||test_run_id||'-capacity-slot-b'))),
  UNIQUE(namespace,idempotency_key)
);
--> statement-breakpoint
CREATE INDEX seller_capacity_expanded_slot_lookup ON seller_capacity_expanded_receipts(namespace,slot,expires_at);
--> statement-breakpoint
CREATE INDEX seller_capacity_expanded_expiry ON seller_capacity_expanded_receipts(expires_at,id);
--> statement-breakpoint
CREATE TRIGGER seller_capacity_expanded_party_guard BEFORE INSERT ON seller_capacity_expanded_receipts
WHEN NOT EXISTS(SELECT 1 FROM seller_capacity_expanded_policy WHERE policy_id=NEW.policy_id AND validation_profile=NEW.validation_profile)
  OR NEW.party_size>(SELECT max_party_size FROM seller_capacity_expanded_policy WHERE policy_id=NEW.policy_id AND validation_profile=NEW.validation_profile)
BEGIN
  SELECT RAISE(ABORT,'seller_capacity_party_exceeded');
END;
--> statement-breakpoint
CREATE TRIGGER seller_capacity_expanded_slot_guard BEFORE INSERT ON seller_capacity_expanded_receipts
WHEN (SELECT enforce_capacity FROM seller_capacity_expanded_policy WHERE policy_id=NEW.policy_id AND validation_profile=NEW.validation_profile)=1
  AND NOT EXISTS(SELECT 1 FROM seller_capacity_expanded_receipts WHERE namespace=NEW.namespace AND idempotency_key=NEW.idempotency_key AND expires_at>NEW.created_at)
  AND COALESCE((SELECT SUM(party_size) FROM seller_capacity_expanded_receipts WHERE namespace=NEW.namespace AND slot=NEW.slot AND expires_at>NEW.created_at),0)+NEW.party_size
      >(SELECT max_guests_per_slot FROM seller_capacity_expanded_policy WHERE policy_id=NEW.policy_id AND validation_profile=NEW.validation_profile)
BEGIN
  SELECT RAISE(ABORT,'seller_slot_capacity_exceeded');
END;
--> statement-breakpoint
CREATE TRIGGER seller_capacity_expanded_store_guard BEFORE INSERT ON seller_capacity_expanded_receipts
WHEN (SELECT COUNT(*) FROM seller_capacity_expanded_receipts)>=1000
BEGIN
  SELECT RAISE(IGNORE);
END;
--> statement-breakpoint
CREATE TRIGGER seller_capacity_expanded_email_guard BEFORE INSERT ON seller_capacity_expanded_receipts
WHEN (SELECT enforce_email FROM seller_capacity_expanded_policy WHERE policy_id=NEW.policy_id AND validation_profile=NEW.validation_profile)=1
  AND NEW.email<>'pbp-test@example.invalid'
BEGIN
  SELECT RAISE(ABORT,'seller_capacity_email_invalid');
END;
