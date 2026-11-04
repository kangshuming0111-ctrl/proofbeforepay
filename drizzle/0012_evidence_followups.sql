CREATE TABLE evidence_followups (
 id TEXT PRIMARY KEY NOT NULL,
 quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
 source_delivery_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX evidence_followups_project ON evidence_followups(quote_id,created_at);
