-- Disposable synthetic enquiries only. No real customer accounts or email.
CREATE TABLE enquiry_receipts (
 id TEXT PRIMARY KEY, namespace TEXT NOT NULL, test_run_id TEXT NOT NULL,
 revision TEXT NOT NULL, creation_key TEXT NOT NULL,
 name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX enquiry_receipts_run ON enquiry_receipts(namespace,created_at,id);
--> statement-breakpoint
CREATE TABLE enquiry_commands (
 id TEXT PRIMARY KEY, namespace TEXT NOT NULL, creation_key TEXT NOT NULL,
 fingerprint TEXT NOT NULL, enquiry_id TEXT NOT NULL,
 test_run_id TEXT NOT NULL, revision TEXT NOT NULL,
 name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 UNIQUE(namespace,creation_key)
);
--> statement-breakpoint
CREATE TRIGGER enquiry_staging_limit BEFORE INSERT ON enquiry_commands
 WHEN (SELECT COUNT(*) FROM enquiry_receipts)>=500
 BEGIN SELECT RAISE(ABORT,'enquiry_staging_limit'); END;
--> statement-breakpoint
CREATE TRIGGER enquiry_command_receipt AFTER INSERT ON enquiry_commands
 BEGIN
 INSERT INTO enquiry_receipts(id,namespace,test_run_id,revision,creation_key,name,email,subject,message,created_at,expires_at)
 VALUES(NEW.enquiry_id,NEW.namespace,NEW.test_run_id,NEW.revision,NEW.creation_key,NEW.name,NEW.email,NEW.subject,NEW.message,NEW.created_at,NEW.expires_at);
 END;
