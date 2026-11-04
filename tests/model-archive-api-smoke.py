"""Real isolated D1/API model archive rollover with all outbound traffic blocked.

Each server run observes one explicit synthetic metadata503 and issues no POST.
Private fixture administration injects corruption and zero-row CAS failures only
in this fresh loopback database. No mutation or uncertain write is retried.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("model_archive_model_helpers", Path(__file__).with_name("model-checks-api-smoke.py"))
model = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = model
_spec.loader.exec_module(model)
chain, journey, roles = model.chain, model.journey, model.roles
ADMIN = "/api/__synthetic_model_archive_admin"
MARKER = "/api/__synthetic_model_archive_test_mode"


def actors(state):
    return [roles.Actor(**state[key]) for key in ("buyer", "seller", "outsider")]


def run_input(state, previous=None, seed=42):
    return {**model.run_input(state, previous, seed), "targetId": state.get("targetId", "model-seller-current")}


def admin(api, state, action, **extra):
    return api.ok(None, ADMIN, {"projectId": state["projectId"], "action": action, **extra})


def inspect(api, state):
    return admin(api, state, "inspect")


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def snapshot_bytes(quote):
    return compact(chain.snapshot(quote))


def provider_zero(api):
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == 0


def assert_storage(api, state, total, archived):
    buyer, seller, outsider = actors(state)
    quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    assert snapshot_bytes(quote) == state["acceptedSnapshotBytes"]
    view = api.ok(buyer, state["path"] + "/model-checks")
    assert len(view["history"]) == total and len({report["id"] for report in view["history"]}) == total
    assert view["history"][0] == state["reportA"] and view["report"]["id"] == state["latestReportId"]
    assert view["capacity"]["schema"] == "model-storage-capacity-v1"
    assert view["capacity"]["saved"]["totalReports"] == total
    assert view["capacity"]["saved"]["archivedReports"] == archived
    assert view["capacity"]["saved"]["inlineReports"] == min(total, 4)
    assert view["capacity"]["canRun"] is True
    assert api.ok(seller, state["path"] + "/model-checks")["history"] == view["history"]
    api.reject(outsider, state["path"] + "/model-checks", role="buyer", codes=(404,))
    persisted = inspect(api, state)
    raw_quote = json.loads(persisted["quote"]["payload"])
    delivery = raw_quote["proof"]["delivery"]
    assert "modelArchive" not in delivery, "Exact archive payloads must not be duplicated in quotes.payload"
    assert len(delivery.get("modelHistory", [])) == min(total, 4)
    assert len(delivery.get("modelArchiveRefs", [])) == archived and len(persisted["objects"]) == archived
    assert snapshot_bytes(raw_quote) == state["acceptedSnapshotBytes"]
    if archived:
        original = next(row for row in persisted["objects"] if row["report_id"] == state["reportA"]["id"])
        assert original["payload"] == state["reportABytes"]
        assert hashlib.sha256(original["payload"].encode()).hexdigest() == original["payload_sha256"]
        assert len(original["payload"].encode()) == original["payload_bytes"]
    readiness = api.ok(buyer, state["path"] + "/readiness")
    assert readiness["frozenAcceptance"]["modelReportId"] == state["reportA"]["id"]
    version = api.ok(buyer, state["path"] + "/versions/" + state["deliveryId"])["version"]
    assert compact(next(r for r in version["delivery"]["acceptanceEvidence"] if r["id"] == state["acceptedSnapshot"]["id"])) == state["acceptedSnapshotBytes"]
    marker = api.ok(None, MARKER)
    assert marker["checkpointBeforeIo"] is True
    assert all(row["method"] == "GET" and row["path"] == "/pbp/meta" for row in marker["observations"])
    provider_zero(api)
    return quote, view, persisted


def seed(api, state_file):
    token = uuid4().hex
    buyer = roles.Actor("model-archive-buyer-" + token, "buyer@model-archive-synthetic.example")
    seller = roles.Actor("model-archive-seller-" + token, "seller@model-archive-synthetic.example")
    outsider = roles.Actor("model-archive-outsider-" + token, "outsider@model-archive-synthetic.example")
    path, quote_path = chain.create_shared(api, buyer, seller, journey.specification())
    quote = chain.quote_of(api.ok(seller, path + "/delivery", {"files": journey.files(), "expectedDeliveryId": None, "reviewRules": True}), "seller")
    delivery = quote["proof"]["delivery"]["id"]
    api.ok(buyer, path + "/journey-checks", {"action": "confirm-plan", "deliveryId": delivery, "confirm": True})
    state = {"buyer": buyer.__dict__, "seller": seller.__dict__, "outsider": outsider.__dict__, "projectId": quote["id"],
             "path": path, "quotePath": quote_path, "deliveryId": delivery}
    state["registry"] = [journey.registration(quote["id"]), journey.registration(quote["id"], True)]
    for entry, name in zip(state["registry"], ("model-seller-current", "model-seller-other-upload")):
        entry["id"] = name
    # A separate unaccepted project exercises the real replacement workflow;
    # accepted A in the first project is never returned or altered.
    revision_path, revision_quote_path = chain.create_shared(api, buyer, seller, journey.specification())
    revision_quote = chain.quote_of(api.ok(seller, revision_path + "/delivery", {"files": journey.files(), "expectedDeliveryId": None, "reviewRules": True}), "seller")
    revision_id = revision_quote["proof"]["delivery"]["id"]
    api.ok(buyer, revision_path + "/journey-checks", {"action": "confirm-plan", "deliveryId": revision_id, "confirm": True})
    revision = {"buyer": buyer.__dict__, "seller": seller.__dict__, "outsider": outsider.__dict__, "projectId": revision_quote["id"],
                "path": revision_path, "quotePath": revision_quote_path, "deliveryId": revision_id, "targetId": "model-archive-revision-target"}
    entry = journey.registration(revision_quote["id"])
    entry["id"] = revision["targetId"]
    state["registry"].append(entry)
    state["revisionCase"] = revision
    endpoint = path + "/model-checks"
    api.reject(None, endpoint, codes=(401,))
    api.reject(outsider, endpoint, codes=(404,))
    api.reject(outsider, endpoint, run_input(state), role="buyer", codes=(404,))
    journey.custom_origin_reject(api, buyer, endpoint, run_input(state))
    assert api.ok(buyer, endpoint)["history"] == []
    assert inspect(api, state)["objects"] == []
    state_file.write_text(json.dumps(state), encoding="utf-8")
    provider_zero(api)
    return {"result": "seeded", "checks": ["Fresh project, true synthetic buyer/seller membership, CSRF/auth guards and empty archive before operator registry configuration"]}


def registered(api, state_file):
    state = json.loads(state_file.read_text())
    buyer, seller, outsider = actors(state)
    path, endpoint = state["path"], state["path"] + "/model-checks"
    assert [r["id"] for r in api.ok(buyer, endpoint)["targets"]] == ["model-seller-current"]
    _, journey_report = journey.run_to_report(api, buyer, path + "/journey-checks", state["deliveryId"], "model-seller-current", abort=True)
    api.ok(seller, path + "/submit_delivery", {"deliveryId": state["deliveryId"], "note": "Synthetic archive acceptance case"})
    report_a = model.model_report(api.ok(buyer, endpoint, run_input(state)))
    assert report_a["trace"][0]["status"] == 503 and len(report_a["trace"]) == 1
    quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    accepted = chain.quote_of(api.ok(buyer, path + "/accept_delivery", model.consent(quote, report_a, journey_report)), "buyer")
    state.update(reportA=report_a, reportABytes=compact(report_a), acceptedSnapshot=copy.deepcopy(chain.snapshot(accepted)),
                 acceptedSnapshotBytes=snapshot_bytes(accepted), latestReportId=report_a["id"])
    for seed in (43, 44, 45):
        report = model.model_report(api.ok(seller, endpoint, run_input(state, state["latestReportId"], seed)))
        state["latestReportId"] = report["id"]
        assert len(report["trace"]) == 1 and report["trace"][0]["status"] == 503
    _, view, persisted = assert_storage(api, state, 4, 0)
    assert view["capacity"]["next"]["archiveMoves"] == 1
    assert api.ok(None, MARKER)["backendAttempts"] == 4
    assert persisted["objects"] == []
    state_file.write_text(json.dumps(state), encoding="utf-8")
    return {"result": "four-reports-saved", "frozenAcceptance": "A", "backendAttempts": 4, "providerCalls": 0,
            "checks": ["Accepted A remains exact across B/C/D supplementary reports", "Four inline reports advertise the next automatic archive move instead of rejecting the next run"]}


def rollover(api, state_file):
    state = json.loads(state_file.read_text())
    buyer, seller, _ = actors(state)
    endpoint = state["path"] + "/model-checks"
    before = inspect(api, state)
    prior_attempts = api.ok(None, MARKER)["backendAttempts"]
    start = run_input(state, state["latestReportId"], 46)
    poison = admin(api, state, "poison-next-object")
    api.reject(buyer, endpoint, start, codes=(409, 500))
    after = inspect(api, state)
    assert after["quote"] == before["quote"] and len(after["objects"]) == 1
    assert after["objects"][0]["id"] == poison["objectId"]
    assert api.ok(None, MARKER)["backendAttempts"] == prior_attempts
    admin(api, state, "remove-poison", objectId=poison["objectId"])
    admin(api, state, "install-cas-miss")
    try:
        api.reject(buyer, endpoint, start, codes=(409,))
        after = inspect(api, state)
        assert after["quote"] == before["quote"] and after["objects"] == []
        assert api.ok(None, MARKER)["backendAttempts"] == prior_attempts
    finally:
        admin(api, state, "remove-cas-miss")
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: api.request(buyer, endpoint, start), range(2)))
    assert sorted(status for status, _, _ in results) == [200, 409], [(s, api.diagnostic(v)) for s, v, _ in results]
    report_e = model.model_report(next(value for status, value, _ in results if status == 200))
    state["latestReportId"] = report_e["id"]
    _, view, _ = assert_storage(api, state, 5, 1)
    assert view["history"][0]["id"] == state["reportA"]["id"]
    assert api.ok(None, MARKER)["backendAttempts"] == 5
    state_file.write_text(json.dumps(state), encoding="utf-8")
    return {"result": "fifth-report-with-archive", "concurrentStarts": [200, 409], "archiveObjects": 1, "providerCalls": 0,
            "checks": ["Conflicting immutable object rolls back quote lease/reference mutation before target I/O", "Injected zero-row quote CAS leaves no orphan archive object", "One concurrent fifth run wins; oldest A leaves inline window but exact original bytes and acceptance survive"]}


def persisted(api, state_file):
    state = json.loads(state_file.read_text())
    buyer, seller, outsider = actors(state)
    assert_storage(api, state, 5, 1)
    assert api.ok(None, MARKER)["backendAttempts"] == 0, "Reload must not resume model I/O"
    # A new explicitly consented mutation after a real process restart must
    # preserve hydrated archive A and store a second independent object B.
    report_f = model.model_report(api.ok(seller, state["path"] + "/model-checks", run_input(state, state["latestReportId"], 47)))
    state["latestReportId"] = report_f["id"]
    _, view, before = assert_storage(api, state, 6, 2)
    assert api.ok(None, MARKER)["backendAttempts"] == 1
    for kind in ("missing", "payload", "foreign"):
        admin(api, state, "corrupt-object", kind=kind)
        try:
            for route in (state["quotePath"], state["path"] + "/model-checks", state["path"] + "/versions/" + state["deliveryId"], state["path"] + "/readiness"):
                api.reject(buyer, route, codes=(409,))
            api.reject(outsider, state["path"] + "/model-checks", role="buyer", codes=(404,))
            api.reject(buyer, state["path"] + "/checkout", {}, codes=(409,))
            assert api.ok(None, MARKER)["backendAttempts"] == 1
            provider_zero(api)
        finally:
            admin(api, state, "restore-object")
        _, _, restored = assert_storage(api, state, 6, 2)
        assert restored == before
    api.reject(seller, state["path"] + "/model-checks", run_input(state, state["reportA"]["id"], 48), codes=(409,))
    assert inspect(api, state) == before and api.ok(None, MARKER)["backendAttempts"] == 1
    historical = replacement_history(api, state["revisionCase"])
    assert inspect(api, state) == before, "The separately tested revision must not alter accepted project A"
    return {"result": "passed", "suite": "model-archive-api", "savedReports": 6, "inlineReports": 4, "archiveObjects": 2,
            "acceptedReportRetained": "A exact bytes", "providerNetworkRequests": 0, "mockProviderCalls": 0, "automaticPostRestartTargetRequests": 0, "explicitPostRestartRuns": 1,
            "historicalVersion": historical,
            "checks": ["Owned Worker restart hydrates five exact reports without rerunning target requests", "Explicit sixth same-version run after restart saves a second object without dropping hydrated A", "Accepted A and its acknowledgement remain byte-for-byte frozen after A/B archive rollover", "Missing archive, changed payload bytes and foreign ownership metadata fail closed for member detail/model/version/readiness/checkout", "Outsider remains404 and no corruption failure contacts a provider", "Restoration returns exact prior quote/object bytes; stale previous-report admission is denied without orphan objects"],
            "scope": "Fresh isolated D1, synthetic gateway actors and metadata503 fixture only; no real backend success, browser, sign-in, model API, settlement or PayPal funds asserted"}


def replacement_history(api, state):
    buyer, seller, outsider = actors(state)
    endpoint, reports, previous = state["path"] + "/model-checks", [], None
    before_attempts = api.ok(None, MARKER)["backendAttempts"]
    for seed in range(70, 75):
        report = model.model_report(api.ok(seller, endpoint, run_input(state, previous, seed)))
        reports.append(report)
        previous = report["id"]
    view = api.ok(buyer, endpoint)
    assert view["history"] == reports and view["capacity"]["saved"]["archivedReports"] == 1
    before = inspect(api, state)
    old_object = before["objects"][0]
    assert old_object["payload"] == compact(reports[0])
    assert hashlib.sha256(old_object["payload"].encode()).hexdigest() == old_object["payload_sha256"]
    api.ok(seller, state["path"] + "/submit_delivery", {"deliveryId": state["deliveryId"], "note": "Synthetic unaccepted delivery for historical archive preservation"})
    quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    api.ok(buyer, state["path"] + "/return", {"deliveryId": state["deliveryId"], "feedback": [{"criterionId": quote["proof"]["criteria"][0]["id"], "comment": "Supply the revised source package for this synthetic revision test."}]})
    replaced = chain.quote_of(api.ok(seller, state["path"] + "/delivery", {"files": journey.files(True), "expectedDeliveryId": state["deliveryId"], "reviewRules": True}), "seller")
    new_delivery = replaced["proof"]["delivery"]
    assert new_delivery["id"] != state["deliveryId"]
    assert not new_delivery.get("modelArchiveRefs") and not new_delivery.get("modelArchive")
    assert not new_delivery.get("modelHistory") and not new_delivery.get("modelReport")
    persisted = inspect(api, state)
    current = json.loads(persisted["quote"]["payload"])["proof"]["delivery"]
    assert "modelArchive" not in current and not current.get("modelArchiveRefs")
    assert persisted["objects"] == before["objects"]
    saved_version = next(row for row in persisted["versions"] if row["id"] == state["projectId"] + ":" + state["deliveryId"])
    archived_delivery = json.loads(saved_version["payload"])["delivery"]
    assert "modelArchive" not in archived_delivery and len(archived_delivery["modelArchiveRefs"]) == 1
    version_path = state["path"] + "/versions/" + state["deliveryId"]
    for actor in (buyer, seller):
        version = api.ok(actor, version_path)["version"]
        delivery = version["delivery"]
        retained = [json.loads(obj["payload"]) for obj in delivery["modelArchive"]] + delivery["modelHistory"]
        assert retained == reports and delivery["files"] == journey.files()
        assert journey.digest(delivery["files"]) == reports[0]["deliveryDigest"]
        assert delivery["modelArchive"][0]["payload"] == old_object["payload"]
        assert delivery["modelArchiveRefs"][0]["payloadSha256"] == old_object["payload_sha256"]
    api.reject(outsider, version_path, role="buyer", codes=(404,))
    old_asset = "/proof-versions/" + state["projectId"] + "/" + state["deliveryId"] + "/index.html"
    code, body, _ = api.request(buyer, old_asset)
    assert code == 200 and body == journey.files()["index.html"]
    api.reject(outsider, old_asset, role="buyer", codes=(404,))
    assert api.ok(None, MARKER)["backendAttempts"] == before_attempts + 5
    admin(api, state, "corrupt-object", kind="missing")
    try:
        api.reject(buyer, version_path, codes=(409,))
        api.reject(buyer, old_asset, codes=(409,))
        current_again = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
        assert current_again["proof"]["delivery"]["id"] == new_delivery["id"]
        assert api.ok(seller, endpoint)["history"] == []
        assert api.ok(None, MARKER)["backendAttempts"] == before_attempts + 5
        provider_zero(api)
    finally:
        admin(api, state, "restore-object")
    assert inspect(api, state) == persisted
    assert api.ok(buyer, version_path)["version"]["delivery"]["modelArchive"][0]["payload"] == old_object["payload"]
    return {"result": "passed", "reports": 5, "archivedObjects": 1, "actualWorkflow": "unaccepted delivery -> seller submit -> buyer changes -> seller replacement",
            "oldVersionHydrated": True, "persistedOldVersionHasOnlyRefs": True, "newVersionHasNoOldArchiveRefs": True,
            "oldObjectMissing": "old detail/asset409; new current remains readable", "targetRequests": 5, "targetPostRequests": 0, "providerCalls": 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--phase", required=True, choices=("seed", "registered", "rollover", "persisted"))
    parser.add_argument("--state", required=True, type=Path)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker["syntheticConfiguration"] is True and marker["outboundFetch"] == "blocked"
    print(json.dumps(globals()[args.phase](api, args.state), ensure_ascii=False))


if __name__ == "__main__":
    main()
