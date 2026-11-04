CREATE TABLE supplemental_evidence_objects (
 quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
 delivery_id TEXT NOT NULL,
 delivery_digest TEXT NOT NULL,
 family TEXT NOT NULL,
 report_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 payload_sha256 TEXT NOT NULL,
 payload TEXT NOT NULL,
 bytes INTEGER NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE (quote_id,family,report_id,version,payload_sha256),
 UNIQUE (quote_id,family,report_id,version)
);
CREATE INDEX supplemental_evidence_objects_project ON supplemental_evidence_objects(quote_id,delivery_id);
