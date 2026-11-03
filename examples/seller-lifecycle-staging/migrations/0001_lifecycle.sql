-- Independent disposable lifecycle state. Do not apply to the private main app database.
-- Existing capacity migrations/tables remain unchanged. Policy is server configuration.
CREATE TABLE seller_lifecycle_bookings (
  id TEXT PRIMARY KEY CHECK(length(id)=36 AND id=lower(id) AND id NOT GLOB '*[^a-f0-9-]*'),
  namespace TEXT NOT NULL CHECK(length(namespace) BETWEEN 1 AND 100),
  profile TEXT NOT NULL CHECK(profile IN('fixed','cancel-credit','move-loss','retry-duplicate')),
  test_run_id TEXT NOT NULL CHECK(length(test_run_id)=36 AND test_run_id=lower(test_run_id) AND test_run_id NOT GLOB '*[^a-f0-9-]*'),
  revision TEXT NOT NULL CHECK(revision='lifecycle-'||profile||'-v1'),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 100),
  slot TEXT NOT NULL CHECK(slot IN('2099-01-01T10:00:00Z','2099-01-01T11:00:00Z','2099-01-01T12:00:00Z')),
  party_size INTEGER NOT NULL CHECK(typeof(party_size)='integer' AND party_size BETWEEN 1 AND 6),
  status TEXT NOT NULL CHECK(status IN('active','cancelled')),
  created_at TEXT NOT NULL CHECK(length(created_at)=24),
  updated_at TEXT NOT NULL CHECK(length(updated_at)=24 AND updated_at>=created_at),
  expires_at TEXT NOT NULL CHECK(length(expires_at)=24 AND expires_at>created_at),
  CHECK(namespace=revision||':'||test_run_id)
);
--> statement-breakpoint
CREATE INDEX seller_lifecycle_booking_lookup ON seller_lifecycle_bookings(namespace,slot,status,expires_at);
--> statement-breakpoint
CREATE TABLE seller_lifecycle_operations (
  id TEXT PRIMARY KEY CHECK(length(id)=36 AND id=lower(id) AND id NOT GLOB '*[^a-f0-9-]*'),
  namespace TEXT NOT NULL,
  profile TEXT NOT NULL CHECK(profile IN('fixed','cancel-credit','move-loss','retry-duplicate')),
  test_run_id TEXT NOT NULL CHECK(length(test_run_id)=36),
  revision TEXT NOT NULL CHECK(revision='lifecycle-'||profile||'-v1'),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 100),
  fingerprint TEXT NOT NULL CHECK(length(fingerprint) BETWEEN 1 AND 1000),
  action TEXT NOT NULL CHECK(action IN('create','cancel','move')),
  booking_id TEXT NOT NULL CHECK(length(booking_id)=36),
  slot TEXT CHECK(slot IN('2099-01-01T10:00:00Z','2099-01-01T11:00:00Z','2099-01-01T12:00:00Z')),
  party_size INTEGER CHECK(party_size IS NULL OR (typeof(party_size)='integer' AND party_size BETWEEN 1 AND 6)),
  created_at TEXT NOT NULL CHECK(length(created_at)=24),
  expires_at TEXT NOT NULL CHECK(length(expires_at)=24 AND expires_at>created_at),
  CHECK(namespace=revision||':'||test_run_id),
  CHECK((action='create' AND slot IS NOT NULL AND party_size IS NOT NULL) OR (action='move' AND slot IS NOT NULL AND party_size IS NULL) OR (action='cancel' AND slot IS NULL AND party_size IS NULL)),
  UNIQUE(namespace,idempotency_key)
);
--> statement-breakpoint
CREATE TABLE seller_lifecycle_cancel_credits (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  slot TEXT NOT NULL,
  guests INTEGER NOT NULL CHECK(typeof(guests)='integer' AND guests BETWEEN 1 AND 6),
  expires_at TEXT NOT NULL CHECK(length(expires_at)=24)
);
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_insert_capacity BEFORE INSERT ON seller_lifecycle_bookings
WHEN NEW.status='active' AND COALESCE((SELECT SUM(party_size) FROM seller_lifecycle_bookings WHERE namespace=NEW.namespace AND slot=NEW.slot AND status='active' AND expires_at>NEW.created_at),0)
  - CASE WHEN NEW.profile='cancel-credit' THEN COALESCE((SELECT SUM(guests) FROM seller_lifecycle_cancel_credits WHERE namespace=NEW.namespace AND slot=NEW.slot AND expires_at>NEW.created_at),0) ELSE 0 END + NEW.party_size>8
BEGIN SELECT RAISE(ABORT,'lifecycle_slot_capacity_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_update_capacity BEFORE UPDATE OF slot,status,party_size ON seller_lifecycle_bookings
WHEN NEW.status='active' AND COALESCE((SELECT SUM(party_size) FROM seller_lifecycle_bookings WHERE namespace=NEW.namespace AND id<>NEW.id AND slot=NEW.slot AND status='active' AND expires_at>NEW.updated_at),0)
  - CASE WHEN NEW.profile='cancel-credit' THEN COALESCE((SELECT SUM(guests) FROM seller_lifecycle_cancel_credits WHERE namespace=NEW.namespace AND slot=NEW.slot AND expires_at>NEW.updated_at),0) ELSE 0 END + NEW.party_size>8
BEGIN SELECT RAISE(ABORT,'lifecycle_slot_capacity_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_operation_target BEFORE INSERT ON seller_lifecycle_operations
WHEN NEW.action<>'create' AND NOT EXISTS(SELECT 1 FROM seller_lifecycle_bookings WHERE namespace=NEW.namespace AND id=NEW.booking_id AND expires_at>NEW.created_at)
BEGIN SELECT RAISE(ABORT,'lifecycle_not_found'); END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_operation_move_state BEFORE INSERT ON seller_lifecycle_operations
WHEN NEW.action='move' AND NEW.profile<>'move-loss' AND NOT EXISTS(SELECT 1 FROM seller_lifecycle_bookings WHERE namespace=NEW.namespace AND id=NEW.booking_id AND status='active' AND expires_at>NEW.created_at)
BEGIN SELECT RAISE(ABORT,'lifecycle_state_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_operation_create AFTER INSERT ON seller_lifecycle_operations WHEN NEW.action='create'
BEGIN
  INSERT INTO seller_lifecycle_bookings(id,namespace,profile,test_run_id,revision,idempotency_key,slot,party_size,status,created_at,updated_at,expires_at)
    VALUES(NEW.booking_id,NEW.namespace,NEW.profile,NEW.test_run_id,NEW.revision,NEW.idempotency_key,NEW.slot,NEW.party_size,'active',NEW.created_at,NEW.created_at,NEW.expires_at);
END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_operation_cancel AFTER INSERT ON seller_lifecycle_operations WHEN NEW.action='cancel'
BEGIN
  -- Deliberate controlled defect: repeating an already cancelled operation grants excess capacity.
  -- Occupancy GET still sums the actual active booking rows, exposing the resulting overbooking.
  INSERT INTO seller_lifecycle_cancel_credits(id,namespace,slot,guests,expires_at)
    SELECT NEW.id,namespace,slot,party_size,expires_at FROM seller_lifecycle_bookings WHERE namespace=NEW.namespace AND id=NEW.booking_id AND status='cancelled' AND NEW.profile='cancel-credit';
  UPDATE seller_lifecycle_bookings SET status='cancelled',updated_at=NEW.created_at WHERE namespace=NEW.namespace AND id=NEW.booking_id AND status='active';
END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_operation_move AFTER INSERT ON seller_lifecycle_operations WHEN NEW.action='move'
BEGIN
  UPDATE seller_lifecycle_bookings SET slot=NEW.slot,status='active',updated_at=NEW.created_at WHERE namespace=NEW.namespace AND id=NEW.booking_id;
END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_bookings_bound BEFORE INSERT ON seller_lifecycle_bookings WHEN (SELECT COUNT(*) FROM seller_lifecycle_bookings)>=1000
BEGIN SELECT RAISE(ABORT,'lifecycle_staging_limit'); END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_operations_bound BEFORE INSERT ON seller_lifecycle_operations WHEN (SELECT COUNT(*) FROM seller_lifecycle_operations)>=3000
BEGIN SELECT RAISE(ABORT,'lifecycle_staging_limit'); END;
--> statement-breakpoint
CREATE TRIGGER seller_lifecycle_credits_bound BEFORE INSERT ON seller_lifecycle_cancel_credits WHEN (SELECT COUNT(*) FROM seller_lifecycle_cancel_credits)>=1000
BEGIN SELECT RAISE(ABORT,'lifecycle_staging_limit'); END;
