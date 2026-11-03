#!/usr/bin/env python3
"""Synthetic overlap fixture over the independent Python workshop datastore.

The short barrier makes an actual cancel/transfer overlap reproducible. It is
operator controlled, never request selected, and is not a production scheduler.
Sequential commands continue through the ordinary fixed native implementation.
"""
import argparse
import importlib.util
import json
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("workshop_native", ROOT / "server.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
original_execute = native.execute_command
waiting = []
lock = threading.Lock()


def execute_with_overlap(database, profile, revision, verb, ref, value, key):
    native.validate_intent(value, verb, key)
    if verb not in ("withdraw", "transfer"):
        return original_execute(database, profile, revision, verb, ref, value, key)
    db = native.connect(database)
    try:
        row = db.execute("SELECT * FROM enrolments WHERE enrolment_ref=? AND exercise_id=?", (ref, value["testRunId"])).fetchone()
        replay = db.execute("SELECT command_ref FROM command_log WHERE command_ref=?", (key,)).fetchone()
    finally:
        db.close()
    if not row or row["enrolment_state"] != "confirmed" or replay:
        return original_execute(database, profile, revision, verb, ref, value, key)
    entry = {"verb": verb, "ref": ref, "run": value["testRunId"], "session": row["session_code"],
             "target": native.SESSION_CODES.get(value.get("slot")), "paired": False, "event": threading.Event()}
    with lock:
        peer = next((item for item in waiting if item["run"] == entry["run"] and item["ref"] != ref
                     and item["verb"] != verb and not item["paired"]
                     and (item["session"] == entry["target"] if verb == "transfer" else entry["session"] == item["target"])), None)
        waiting.append(entry)
        if peer:
            peer["paired"] = entry["paired"] = True
            peer["event"].set()
            entry["event"].set()
    entry["event"].wait(0.2)
    with lock:
        if entry in waiting:
            waiting.remove(entry)
    if variant == "overlap-loss" and entry["paired"] and verb == "transfer":
        # Real mutant: a different group's concurrent withdrawal incorrectly
        # invalidates this enrolment before a rejected transfer. SQL/readbacks
        # expose the actual bad state; no oracle verdict is manufactured here.
        db = native.connect(database)
        try:
            db.execute("BEGIN IMMEDIATE")
            db.execute("UPDATE enrolments SET enrolment_state='withdrawn',changed_at=? WHERE enrolment_ref=? AND exercise_id=?",
                       (native.timestamp(), ref, value["testRunId"]))
            db.commit()
        finally:
            db.close()
        raise native.Problem(409, "slot_capacity_exceeded")
    return original_execute(database, profile, revision, verb, ref, value, key)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variant", choices=("fixed", "overlap-loss"), required=True)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("Port must be0through65535")
    variant = args.variant
    args.db.parent.mkdir(parents=True, exist_ok=True)
    native.initialize(args.db, "fixed")
    native.execute_command = execute_with_overlap
    server = native.WorkshopServer(("127.0.0.1", args.port), native.Handler)
    server.database, server.profile = str(args.db.resolve()), "fixed"
    server.origin = f"http://127.0.0.1:{server.server_address[1]}"
    server.revision = "lifecycle-fixed-v1"
    server.native_revision = f"florist-race-fixture-{variant}-v1"
    server.parents = ["https://briefpay-kang-lab.blueheron8.chatgpt.site"]
    print(json.dumps({"ready": True, "origin": server.origin, "nativeRevision": server.native_revision,
                      "revision": server.revision, "controlledOverlapBarrier": True}), flush=True)
    try:
        server.serve_forever(poll_interval=0.1)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
