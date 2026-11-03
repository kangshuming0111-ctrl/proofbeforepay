PRAGMA foreign_keys = ON;

-- Native workshop vocabulary and state. No checker tables or SQL are reused.
CREATE TABLE IF NOT EXISTS workshop_installation (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    schema_revision TEXT NOT NULL CHECK (schema_revision = 'florist-enrolments-v1'),
    operator_profile TEXT NOT NULL CHECK (operator_profile IN ('fixed', 'move-loss'))
);
CREATE TABLE IF NOT EXISTS sessions (
    session_code TEXT PRIMARY KEY,
    starts_at TEXT NOT NULL UNIQUE,
    workshop_title TEXT NOT NULL,
    seat_limit INTEGER NOT NULL CHECK (seat_limit = 8)
);
CREATE TABLE IF NOT EXISTS enrolments (
    enrolment_ref TEXT PRIMARY KEY,
    exercise_id TEXT NOT NULL,
    exercise_tag TEXT NOT NULL CHECK (exercise_tag = 'PBP-' || exercise_id),
    participant_label TEXT NOT NULL CHECK (participant_label = 'PBP synthetic'),
    participant_contact TEXT NOT NULL CHECK (participant_contact = 'pbp-test@example.invalid'),
    session_code TEXT NOT NULL REFERENCES sessions(session_code),
    seat_count INTEGER NOT NULL CHECK (typeof(seat_count) = 'integer' AND seat_count BETWEEN 1 AND 6),
    enrolment_state TEXT NOT NULL CHECK (enrolment_state IN ('confirmed', 'withdrawn')),
    creation_command TEXT NOT NULL UNIQUE,
    enrolled_at TEXT NOT NULL,
    changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS enrolments_by_exercise ON enrolments(exercise_id, session_code, enrolment_state);
CREATE TABLE IF NOT EXISTS command_log (
    command_ref TEXT PRIMARY KEY,
    exercise_id TEXT NOT NULL,
    verb TEXT NOT NULL CHECK (verb IN ('enrol', 'withdraw', 'transfer')),
    enrolment_ref TEXT NOT NULL REFERENCES enrolments(enrolment_ref),
    request_fingerprint TEXT NOT NULL,
    response_payload TEXT NOT NULL,
    completed_at TEXT NOT NULL
);

-- These guards also reject over-capacity enrolment changes outside the adapter.
CREATE TRIGGER IF NOT EXISTS workshop_insert_capacity
BEFORE INSERT ON enrolments WHEN NEW.enrolment_state = 'confirmed'
BEGIN
    SELECT CASE WHEN NEW.seat_count + COALESCE((
        SELECT SUM(seat_count) FROM enrolments
        WHERE exercise_id = NEW.exercise_id AND session_code = NEW.session_code
          AND enrolment_state = 'confirmed'
    ), 0) > (SELECT seat_limit FROM sessions WHERE session_code = NEW.session_code)
    THEN RAISE(ABORT, 'workshop_full') END;
END;
CREATE TRIGGER IF NOT EXISTS workshop_update_capacity
BEFORE UPDATE OF exercise_id, seat_count, session_code, enrolment_state ON enrolments
WHEN NEW.enrolment_state = 'confirmed'
BEGIN
    SELECT CASE WHEN NEW.seat_count + COALESCE((
        SELECT SUM(seat_count) FROM enrolments
        WHERE exercise_id = NEW.exercise_id AND session_code = NEW.session_code
          AND enrolment_state = 'confirmed' AND enrolment_ref != NEW.enrolment_ref
    ), 0) > (SELECT seat_limit FROM sessions WHERE session_code = NEW.session_code)
    THEN RAISE(ABORT, 'workshop_full') END;
END;
