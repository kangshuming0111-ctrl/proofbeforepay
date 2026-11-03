#!/usr/bin/env python3
"""Independent fictional florist workshop. Python stdlib and native SQLite only.

The wire adapter imports no ProofBeforePay checker. The operator chooses one
profile at startup; requests cannot select a fault or change business limits.
"""
import argparse
import hashlib
import json
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent
UUID = re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\Z")
REF = re.compile(r"enr_[a-f0-9]{32}\Z")
SLOTS = {"a": "2099-01-01T10:00:00Z", "b": "2099-01-01T11:00:00Z", "c": "2099-01-01T12:00:00Z"}
SESSION_CODES = {SLOTS["a"]: "STEM-MORNING", SLOTS["b"]: "STEM-MIDDAY", SLOTS["c"]: "STEM-AFTERNOON"}
SUFFIXES = {"enrol": {"cancel-create", "cancel-five", "cancel-three", "cancel-extra", "source-create", "loss-create"},
            "withdraw": {"cancel-first", "cancel-repeat"}, "transfer": {"move-full", "move-free"}}
ACTIONS = ["create", "cancel", "rebook", "fill", "cancel_repeat", "reject_extra", "source_create", "move_full", "move_free", "response_loss_create", "response_loss_retry"]
SCHEMA_REVISION = "florist-enrolments-v1"
MAX_BODY = 4096


class Problem(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect(database):
    db = sqlite3.connect(database, timeout=8, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=8000")
    return db


def initialize(database, profile):
    db = connect(database)
    try:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript((ROOT / "schema.sql").read_text())
        db.execute("BEGIN IMMEDIATE")
        installed = db.execute("SELECT * FROM workshop_installation WHERE singleton=1").fetchone()
        if installed and (installed["operator_profile"] != profile or installed["schema_revision"] != SCHEMA_REVISION):
            raise ValueError("Use a separate database for each operator profile/schema.")
        db.execute("INSERT OR IGNORE INTO workshop_installation VALUES (1,?,?)", (SCHEMA_REVISION, profile))
        for alias, slot in SLOTS.items():
            db.execute("INSERT OR IGNORE INTO sessions VALUES (?,?,?,8)",
                       (SESSION_CODES[slot], slot, {"a": "Garden bouquet", "b": "Seasonal stems", "c": "Table flowers"}[alias]))
        db.commit()
    finally:
        db.close()


def receipt(db, row, revision):
    session = db.execute("SELECT starts_at FROM sessions WHERE session_code=?", (row["session_code"],)).fetchone()
    return {"id": row["enrolment_ref"], "testRunId": row["exercise_id"], "marker": row["exercise_tag"],
            "customer": row["participant_label"], "email": row["participant_contact"], "slot": session[0],
            "partySize": row["seat_count"], "status": {"confirmed": "active", "withdrawn": "cancelled"}[row["enrolment_state"]],
            "revision": revision, "idempotencyKey": row["creation_command"]}


def valid_run(value):
    if not isinstance(value, str) or not UUID.fullmatch(value):
        raise Problem(400, "synthetic_validation_failed")
    return value


def validate_intent(value, verb, key):
    required = {"testRunId", "marker"}
    if verb == "enrol":
        required |= {"customer", "email", "slot", "partySize"}
    if verb == "transfer":
        required.add("slot")
    if type(value) is not dict or set(value) != required:
        raise Problem(400, "synthetic_validation_failed")
    run = valid_run(value["testRunId"])
    if value["marker"] != "PBP-" + run:
        raise Problem(400, "synthetic_validation_failed")
    if verb == "enrol":
        if value["customer"] != "PBP synthetic" or value["email"] != "pbp-test@example.invalid":
            raise Problem(400, "synthetic_validation_failed")
        if type(value["partySize"]) is not int or not 1 <= value["partySize"] <= 6:
            raise Problem(422, "party_size_invalid")
    if verb != "withdraw" and (not isinstance(value["slot"], str) or value["slot"] not in SESSION_CODES):
        raise Problem(400, "synthetic_validation_failed")
    prefix = f"pbp-{run}-lifecycle-"
    if not isinstance(key, str) or not key.startswith(prefix) or key[len(prefix):] not in SUFFIXES[verb]:
        raise Problem(400, "synthetic_validation_failed")
    return run


def execute_command(database, profile, revision, verb, ref, value, key):
    run = validate_intent(value, verb, key)
    intent = json.dumps({"verb": verb, "ref": ref, "body": value}, sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(intent.encode()).hexdigest()
    db = connect(database)
    try:
        db.execute("BEGIN IMMEDIATE")
        prior = db.execute("SELECT * FROM command_log WHERE command_ref=?", (key,)).fetchone()
        if prior:
            if prior["request_fingerprint"] != fingerprint or prior["exercise_id"] != run:
                raise Problem(409, "idempotency_conflict")
            saved = db.execute("SELECT * FROM enrolments WHERE enrolment_ref=?", (prior["enrolment_ref"],)).fetchone()
            result = receipt(db, saved, revision)
            db.commit()
            return 200, result
        if db.execute("SELECT COUNT(*) FROM command_log").fetchone()[0] >= 3000:
            raise Problem(503, "staging_limit_reached")
        at = timestamp()
        if verb == "enrol":
            if db.execute("SELECT COUNT(*) FROM enrolments").fetchone()[0] >= 1000:
                raise Problem(503, "staging_limit_reached")
            if db.execute("SELECT COUNT(*) FROM enrolments WHERE exercise_id=?", (run,)).fetchone()[0] >= 24:
                raise Problem(503, "run_limit_reached")
            ref = "enr_" + uuid.uuid4().hex
            db.execute("INSERT INTO enrolments VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (ref, run, value["marker"], value["customer"], value["email"], SESSION_CODES[value["slot"]],
                        value["partySize"], "confirmed", key, at, at))
        else:
            row = db.execute("SELECT * FROM enrolments WHERE enrolment_ref=? AND exercise_id=?", (ref, run)).fetchone()
            if not row:
                raise Problem(404, "not_found")
            if verb == "withdraw":
                # Updating an already withdrawn row neither credits nor releases seats again.
                db.execute("UPDATE enrolments SET enrolment_state='withdrawn',changed_at=? WHERE enrolment_ref=?", (at, ref))
            else:
                if row["enrolment_state"] != "confirmed":
                    raise Problem(409, "booking_state_conflict")
                if profile == "move-loss":
                    # Deliberately wrong native algorithm: withdrawal is committed
                    # before the target session is admitted. A full target leaves
                    # a real withdrawn enrolment after the second transaction fails.
                    db.execute("UPDATE enrolments SET enrolment_state='withdrawn',changed_at=? WHERE enrolment_ref=?", (at, ref))
                    db.commit()
                    db.execute("BEGIN IMMEDIATE")
                db.execute("UPDATE enrolments SET session_code=?,enrolment_state='confirmed',changed_at=? WHERE enrolment_ref=?",
                           (SESSION_CODES[value["slot"]], at, ref))
        saved = db.execute("SELECT * FROM enrolments WHERE enrolment_ref=?", (ref,)).fetchone()
        result = receipt(db, saved, revision)
        db.execute("INSERT INTO command_log VALUES (?,?,?,?,?,?,?)",
                   (key, run, verb, ref, fingerprint, json.dumps(result, separators=(",", ":")), at))
        db.commit()
        # Fixed controlled response-loss policy, activated only by the named
        # synthetic loss-create command. Stored state and log already committed.
        if verb == "enrol" and key.endswith("-loss-create"):
            return 504, {"code": "response_lost_after_commit"}
        return (201 if verb == "enrol" else 200), result
    except sqlite3.IntegrityError as error:
        db.rollback()
        if "workshop_full" in str(error):
            raise Problem(409, "slot_capacity_exceeded") from None
        raise Problem(503, "storage_unavailable") from None
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


class WorkshopServer(ThreadingHTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = "WorkshopPython/1"

    def log_message(self, _format, *_args):
        pass  # Do not log bodies, query strings or request headers.

    def respond(self, body, status=200, kind="application/json; charset=utf-8"):
        data = json.dumps(body, separators=(",", ":")).encode() if kind.startswith("application/json") else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors " + " ".join(self.server.parents))
        self.end_headers()
        self.wfile.write(data)

    def guard(self):
        if self.headers.get("Authorization") is not None or self.headers.get("Cookie") is not None:
            raise Problem(403, "credentials_or_foreign_origin_not_accepted")
        if self.headers.get("Host") != urlsplit(self.server.origin).netloc:
            raise Problem(403, "host_not_accepted")
        origin = self.headers.get("Origin")
        if origin is not None and origin != self.server.origin:
            raise Problem(403, "credentials_or_foreign_origin_not_accepted")
        if self.command == "POST" and origin != self.server.origin:
            raise Problem(403, "same_origin_required")
        if "\\" in self.path or "%" in self.path or "#" in self.path or "//" in self.path:
            raise Problem(400, "noncanonical_path")
        parsed = urlsplit(self.path)
        if parsed.scheme or parsed.netloc:
            raise Problem(400, "noncanonical_path")
        if parsed.query and parsed.path != "/workshop.html":
            raise Problem(400, "query_not_accepted")
        if parsed.path == "/workshop.html" and parsed.query:
            params = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
            if set(params) != {"run"} or len(params["run"]) != 1:
                raise Problem(400, "query_not_accepted")
            valid_run(params["run"][0])
        return parsed.path

    def read_json(self):
        if self.headers.get("Transfer-Encoding") is not None or self.headers.get("Content-Encoding") not in (None, "identity"):
            raise Problem(400, "body_encoding_not_accepted")
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not re.fullmatch(r"[0-9]+", lengths[0]):
            raise Problem(400, "content_length_required")
        size = int(lengths[0])
        if size > MAX_BODY:
            raise Problem(413, "body_too_large")
        if not re.fullmatch(r"application/json(?:\s*;\s*charset=utf-8)?", self.headers.get("Content-Type", ""), re.I):
            raise Problem(415, "json_required")
        self.connection.settimeout(5)
        raw = self.rfile.read(size)
        if len(raw) != size:
            raise Problem(400, "incomplete_body")
        def unique_pairs(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError("duplicate key")
                result[key] = value
            return result
        try:
            return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_pairs,
                              parse_constant=lambda _value: (_ for _ in ()).throw(ValueError("nonfinite")))
        except (ValueError, UnicodeError, RecursionError):
            raise Problem(400, "synthetic_validation_failed") from None

    def dispatch(self):
        path = self.guard()
        if self.command not in ("GET", "POST"):
            raise Problem(405, "method_not_allowed")
        if path in ("/", "/workshop.html", "/workshop.mjs", "/workshop.css", "/config.mjs"):
            if self.command != "GET":
                raise Problem(405, "method_not_allowed")
            if path == "/config.mjs":
                config = {"backendBasePath": "/pbp/", "frontendRevision": "florist-workshop-browser-v1", "allowedParentOrigins": self.server.parents,
                          "nativeRevision": self.server.native_revision, "bridgeRevision": self.server.revision}
                return self.respond("export const workshopConfig=" + json.dumps(config) + ";\n", kind="text/javascript; charset=utf-8")
            name = "workshop.html" if path == "/" else path[1:]
            return self.respond((ROOT / name).read_text(), kind={"html": "text/html; charset=utf-8", "mjs": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8"}[name.rsplit(".", 1)[1]])
        if path == "/pbp/meta":
            if self.command != "GET":
                raise Problem(405, "method_not_allowed")
            return self.respond({"protocol": "booking-lifecycle-http-v1", "revision": self.server.revision,
                                 "nativeRevision": self.server.native_revision, "nativeSchemaRevision": SCHEMA_REVISION,
                                 "maxPartySize": 6, "maxGuestsPerSlot": 8, "syntheticOnly": True, "deploymentAttestation": False})
        match = re.fullmatch(r"/pbp/bookings/(enr_[a-f0-9]{32})(?:/(cancel|move))?", path)
        if self.command == "POST" and (path == "/pbp/bookings" or match and match[2]):
            action = "enrol" if path == "/pbp/bookings" else {"cancel": "withdraw", "move": "transfer"}[match[2]]
            status, result = execute_command(self.server.database, self.server.profile, self.server.revision, action,
                                             None if action == "enrol" else match[1], self.read_json(), self.headers.get("Idempotency-Key"))
            return self.respond(result, status)
        if path == "/pbp/bookings" or match and match[2]:
            raise Problem(405, "method_not_allowed")
        merchant = re.fullmatch(r"/pbp/merchant/([a-f0-9-]{36})", path)
        occupancy = re.fullmatch(r"/pbp/occupancy/([a-f0-9-]{36})/(a|b|c)", path)
        if not (match or merchant or occupancy):
            raise Problem(404, "not_found")
        if self.command != "GET":
            raise Problem(405, "method_not_allowed")
        db = connect(self.server.database)
        try:
            if match:
                row = db.execute("SELECT * FROM enrolments WHERE enrolment_ref=?", (match[1],)).fetchone()
                if not row:
                    raise Problem(404, "not_found")
                return self.respond(receipt(db, row, self.server.revision))
            run = valid_run((merchant or occupancy)[1])
            # One read transaction keeps enrolment rows and joined sessions coherent.
            db.execute("BEGIN")
            rows = db.execute("SELECT * FROM enrolments WHERE exercise_id=? ORDER BY enrolled_at,enrolment_ref LIMIT 25", (run,)).fetchall()
            if len(rows) > 24:
                raise Problem(503, "readback_limit_exceeded")
            if merchant:
                return self.respond({"testRunId": run, "revision": self.server.revision, "bookings": [receipt(db, row, self.server.revision) for row in rows]})
            slot = SLOTS[occupancy[2]]
            active = [row for row in rows if row["session_code"] == SESSION_CODES[slot] and row["enrolment_state"] == "confirmed"]
            return self.respond({"testRunId": run, "slot": slot, "revision": self.server.revision,
                                 "guestCount": sum(row["seat_count"] for row in active), "bookingIds": [row["enrolment_ref"] for row in active]})
        finally:
            db.close()

    def handle_request(self):
        try:
            self.dispatch()
        except Problem as problem:
            self.respond({"code": problem.code}, problem.status)
        except (sqlite3.Error, TimeoutError, OSError):
            self.respond({"code": "storage_or_request_unavailable"}, 503)
        except (ValueError, TypeError, KeyError, RecursionError):
            self.respond({"code": "synthetic_validation_failed"}, 400)

    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_HEAD = handle_request


def configured_origin(value):
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise argparse.ArgumentTypeError("Use one exact http(s) origin without credentials, path or query.")
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=("fixed", "move-loss"), required=True)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--host", choices=("127.0.0.1", "0.0.0.0"), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--public-origin", type=configured_origin)
    parser.add_argument("--parent-origin", type=configured_origin, action="append", default=[])
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("Port must be 0 through 65535.")
    args.db.parent.mkdir(parents=True, exist_ok=True)
    initialize(args.db, args.profile)
    server = WorkshopServer((args.host, args.port), Handler)
    server.database, server.profile = str(args.db.resolve()), args.profile
    server.origin = args.public_origin or f"http://127.0.0.1:{server.server_address[1]}"
    server.revision = f"lifecycle-{args.profile}-v1"
    server.native_revision = f"florist-workshop-python-{args.profile}-v1"
    server.parents = args.parent_origin or ["https://briefpay-kang-lab.blueheron8.chatgpt.site"]
    print(json.dumps({"ready": True, "origin": server.origin, "profile": args.profile, "revision": server.revision,
                      "nativeRevision": server.native_revision, "database": server.database}), flush=True)
    try:
        server.serve_forever(poll_interval=0.1)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
