-- Seller staging storage. Never apply to the ProofBeforePay application DB.
-- A controlled lab may explicitly alias its D1 binding to these separate tables;
-- that deployment must disclose physical DB sharing, not claim isolation.
-- Hosted controlled reference uses a native versioned policy VIEW. This keeps
-- Sites migrations schema-only; no request or migration seeds business rows.
-- This planted v1 policy is intentionally7 while the buyer agrees6.
CREATE VIEW seller_business_policy AS SELECT 1 AS id, 7 AS max_party_size;
--> statement-breakpoint

CREATE TABLE seller_booking_receipts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND id NOT GLOB '*[^a-f0-9-]*'
    AND substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-' AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-'
    AND length(replace(id, '-', '')) = 32),
  namespace TEXT NOT NULL CHECK (length(namespace) BETWEEN 1 AND 400),
  project_id TEXT NOT NULL CHECK (length(project_id) BETWEEN 1 AND 80 AND project_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  registration_revision TEXT NOT NULL CHECK (length(registration_revision) BETWEEN 1 AND 80 AND registration_revision NOT GLOB '*[^A-Za-z0-9_-]*'),
  deployment_revision TEXT NOT NULL CHECK (length(deployment_revision) BETWEEN 1 AND 120 AND deployment_revision NOT GLOB '*[^A-Za-z0-9._-]*'),
  frontend_bundle_digest TEXT NOT NULL CHECK (length(frontend_bundle_digest) = 64 AND frontend_bundle_digest NOT GLOB '*[^a-f0-9]*'),
  test_run_id TEXT NOT NULL CHECK (length(test_run_id) = 36 AND test_run_id = lower(test_run_id) AND test_run_id NOT GLOB '*[^a-f0-9-]*'
    AND substr(test_run_id, 9, 1) = '-' AND substr(test_run_id, 14, 1) = '-' AND substr(test_run_id, 19, 1) = '-' AND substr(test_run_id, 24, 1) = '-'
    AND length(replace(test_run_id, '-', '')) = 32),
  marker TEXT NOT NULL CHECK (marker = 'PBP-' || test_run_id),
  customer TEXT NOT NULL CHECK (customer = 'PBP synthetic'),
  email TEXT NOT NULL CHECK (email = 'pbp-test@example.invalid'),
  slot TEXT NOT NULL CHECK (slot = '2099-01-01T10:00:00Z'),
  party_size INTEGER NOT NULL CHECK (typeof(party_size) = 'integer' AND party_size BETWEEN 1 AND 12),
  idempotency_key TEXT NOT NULL CHECK (idempotency_key IN (
    'pbp-' || test_run_id, 'pbp-' || test_run_id || '-missing-slot', 'pbp-' || test_run_id || '-invalid-email',
    'pbp-' || test_run_id || '-zero', 'pbp-' || test_run_id || '-fraction', 'pbp-' || test_run_id || '-below',
    'pbp-' || test_run_id || '-exact', 'pbp-' || test_run_id || '-above', 'pbp-' || test_run_id || '-concurrent')),
  created_at TEXT NOT NULL CHECK (length(created_at) = 24),
  expires_at TEXT NOT NULL CHECK (length(expires_at) = 24 AND expires_at > created_at),
  CHECK (namespace = project_id || ':' || registration_revision || ':' || deployment_revision || ':' || frontend_bundle_digest),
  UNIQUE (namespace, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX seller_booking_receipts_expiry ON seller_booking_receipts (expires_at, id);
--> statement-breakpoint

-- Business enforcement is native to the seller's database. The checker never
-- supplies a maximum, changes this row, or generates these response decisions.
CREATE TRIGGER seller_booking_policy_guard BEFORE INSERT ON seller_booking_receipts
WHEN NEW.party_size > (SELECT max_party_size FROM seller_business_policy WHERE id = 1)
  OR NOT EXISTS (SELECT 1 FROM seller_business_policy WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'seller_party_size_exceeded');
END;
--> statement-breakpoint

-- Atomic across connections, including two contenders for the final free row.
-- An ignored full-store insertion still permits replay/conflict readback.
CREATE TRIGGER seller_booking_capacity_guard BEFORE INSERT ON seller_booking_receipts
WHEN (SELECT COUNT(*) FROM seller_booking_receipts) >= 1000
BEGIN
  SELECT RAISE(IGNORE);
END;
