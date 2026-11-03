"""Private model-check route/storage tests on an owned, network-blocked Worker.

Backend fetches deliberately fail after a short bounded delay. This exercises
durable leases, request checkpoints, CAS, expiry, version/acceptance references
and mocked payment only. It does not exercise the native model race or browser.
"""
import argparse
import copy
import importlib.util
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("model_api_journey_helpers", Path(__file__).with_name("project-journey-api-smoke.py"))
journey = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = journey
_spec.loader.exec_module(journey)
chain, roles = journey.chain, journey.roles


def actors(state):
    return [roles.Actor(**state[key]) for key in ("buyer", "seller", "outsider")]


def run_input(state, previous=None, seed=42):
    return {"action": "run", "deliveryId": state["deliveryId"], "previousReportId": previous,
            "targetId": "model-seller-current", "seed": seed, "confirm": True}


def model_report(result):
    report = result["model"]["report"]
    assert result["model"]["run"] is None and report["result"]["outcome"] == "inconclusive"
    assert report["trace"] and len(report["trace"]) <= 24
    assert not any(row["method"] == "POST" for row in report["trace"]), "Blocked metadata cannot authorize synthetic setup writes"
    return report


def decision(report):
    return {"reportId": report["id"], "acknowledgeServerCheck": True,
            "exceptionReason": "Synthetic reviewer explicitly acknowledges unavailable server-direct model evidence; no backend or browser success is claimed."}


def consent(quote, report, journey_report):
    return {"deliveryId": quote["proof"]["delivery"]["id"], "confirm": True,
            "manualChecks": chain.human_checks(quote), "expectedEvidence": roles.acceptance_basis(quote),
            "modelDecision": decision(report),
            "journeyDecision": {"reportId": journey_report["id"], "acknowledgeClientObservation": True, "acknowledgedSteps": journey.STEPS,
                                "exceptionReason": "The synthetic browser journey was not operated and its unavailable evidence was separately reviewed."}}


def readiness_checks(api, buyer, seller, outsider, state):
    before = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    path = state["path"] + "/readiness"
    api.reject(None, path, codes=(401, 404))
    api.reject(outsider, path, role="buyer", codes=(404,))
    views = [api.ok(actor, path, role=forged) for actor, forged in ((buyer, "seller"), (seller, "buyer"))]
    assert all(view["projectId"] == state["projectId"] and view["limits"]["providerQueried"] is False for view in views)
    assert views[0]["currentBasis"] == views[1]["currentBasis"]
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == before
    return views[0]


def seed(api, state_file):
    token = uuid4().hex
    buyer = roles.Actor("model-api-buyer-" + token, "buyer@model-api-synthetic.example")
    seller = roles.Actor("model-api-seller-" + token, "seller@model-api-synthetic.example")
    outsider = roles.Actor("model-api-outsider-" + token, "outsider@model-api-synthetic.example")
    path, quote_path = chain.create_shared(api, buyer, seller, journey.specification())
    quote = chain.quote_of(api.ok(seller, path + "/delivery", {"files": journey.files(), "expectedDeliveryId": None, "reviewRules": True}), "seller")
    delivery_id = quote["proof"]["delivery"]["id"]
    endpoint = path + "/model-checks"
    initial = api.ok(buyer, endpoint)
    assert initial["run"] is None and initial["report"] is None and initial["evaluation"] is None and initial["targets"] == []
    assert initial["definition"]
    api.reject(None, endpoint, codes=(401,))
    api.reject(None, endpoint, {"action": "run"}, codes=(401,))
    api.reject(outsider, endpoint, codes=(404,))
    api.reject(outsider, endpoint, {"action": "run"}, role="buyer", codes=(404,))
    journey.custom_origin_reject(api, buyer, endpoint, {"action": "run"})
    state = {"buyer": buyer.__dict__, "seller": seller.__dict__, "outsider": outsider.__dict__, "projectId": quote["id"],
             "path": path, "quotePath": quote_path, "deliveryId": delivery_id}
    api.reject(buyer, endpoint, run_input(state), codes=(404,))
    registry = [journey.registration(quote["id"]), journey.registration(quote["id"], True)]
    for entry, name in zip(registry, ("model-seller-current", "model-seller-other-upload")):
        entry["id"] = name
    state["registry"] = registry
    readiness_checks(api, buyer, seller, outsider, state)
    api.ok(buyer, path + "/journey-checks", {"action": "confirm-plan", "deliveryId": delivery_id, "confirm": True})
    state_file.write_text(json.dumps(state), encoding="utf-8")
    return {"result": "seeded", "outboundFetch": "blocked", "checks": ["Authentication, membership, CSRF and readonly readiness reject outsiders without provider calls; no target exists before operator registration"]}


def explanation_guards(api, buyer, seller, outsider, state, report):
    endpoint = state["path"] + "/model-explanation"
    payload = {"confirm": True, "deliveryId": state["deliveryId"], "reportId": report["id"], "previousExplanationId": None}
    before = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    assert api.ok(buyer, endpoint)["explanation"] is None
    assert api.ok(seller, endpoint)["explanation"] is None
    api.reject(None, endpoint, codes=(401,))
    api.reject(None, endpoint, payload, codes=(401,))
    api.reject(outsider, endpoint, codes=(404,))
    api.reject(outsider, endpoint, payload, codes=(404,))
    journey.custom_origin_reject(api, buyer, endpoint, payload)
    for patch, codes in (({"confirm": False}, (400,)), ({"reportId": "stale-report"}, (409,)), ({"deliveryId": "stale-upload"}, (409,)), ({"previousExplanationId": "other"}, (409,)), ({"report": report}, (400,)), ({"payment": "capture"}, (400,))):
        api.reject(buyer, endpoint, {**payload, **patch}, codes=codes)
    response = api.reject(buyer, endpoint, payload, codes=(409,))
    assert chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer") == before
    api.checked("Model explanation route authenticates membership/CSRF, rejects stale or forged bindings and truthfully fails without model configuration; saved verdict and money unchanged")


def registered(api, state_file):
    state = json.loads(state_file.read_text())
    buyer, seller, outsider = actors(state)
    path, endpoint = state["path"], state["path"] + "/model-checks"
    quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    view = api.ok(buyer, endpoint)
    assert [row["id"] for row in view["targets"]] == ["model-seller-current"]
    assert api.ok(seller, endpoint) == view
    start = run_input(state)
    for patch, codes in (({"confirm": False}, (409,)), ({"seed": -1}, (400,)), ({"seed": 2 ** 32}, (400,)), ({"seed": True}, (400,)),
                         ({"seed": 1.5}, (400,)), ({"deliveryId": "stale-upload"}, (409,)), ({"previousReportId": "stale-report"}, (409,)),
                         ({"targetId": "model-seller-other-upload"}, (409,)), ({"trace": []}, (400,)), ({"url": "https://caller.synthetic.example/"}, (400,))):
        api.reject(buyer, endpoint, {**start, **patch}, codes=codes)
    api.reject(buyer, endpoint, {**start, "oversize": "x" * 5000}, codes=(413,))
    api.reject(buyer, endpoint, {"action": "resume", "deliveryId": state["deliveryId"]}, codes=(400,))
    journey.custom_origin_reject(api, buyer, endpoint, start)
    assert chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer") == quote
    # Required optional journey evidence is honestly unavailable in this suite.
    final, journey_report = journey.run_to_report(api, buyer, path + "/journey-checks", state["deliveryId"], "model-seller-current", abort=True)
    api.ok(seller, path + "/submit_delivery", {"deliveryId": state["deliveryId"], "note": "Synthetic model-check acceptance case"})
    before = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(api.request, buyer, endpoint, start) for _ in range(2)]
        deadline = time.monotonic() + 5
        active = None
        while time.monotonic() < deadline:
            active = api.ok(buyer, endpoint)["run"]
            if active and active["trace"]:
                break
            time.sleep(.025)
        assert active and active["trace"] and active["trace"][-1]["completedOrdinal"] is None
        pending_quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
        reservation = pending_quote["proof"]["delivery"]["modelEvidenceReservation"]
        assert reservation["runId"] == active["id"] and reservation["reportBytes"] == 32 * 1024
        pending_view = readiness_checks(api, buyer, seller, outsider, state)
        assert pending_view["financialActionsBlockedByRun"] is True
        for action, payload in (("checkout", {}), ("authorize", {"orderId": "not-created"}), ("capture", {"confirm": True}),
                                ("accept_delivery", {"deliveryId": state["deliveryId"], "confirm": True, "manualChecks": chain.human_checks(pending_quote)}),
                                ("return", {"deliveryId": state["deliveryId"], "feedback": []})):
            api.reject(buyer, path + "/" + action, payload, codes=(409,))
        api.reject(seller, path + "/delivery", {"files": journey.files(True), "expectedDeliveryId": state["deliveryId"]}, codes=(409,))
        api.reject(seller, path + "/journey-checks", {"action": "start", "deliveryId": state["deliveryId"], "previousReportId": journey_report["id"], "targetId": "model-seller-current", "confirm": True}, codes=(409,))
        api.reject(buyer, endpoint, {"action": "close", "deliveryId": state["deliveryId"], "runId": active["id"]}, codes=(409,))
        # A concurrent supplemental browser reading must survive later model CAS.
        annotated = chain.quote_of(api.ok(seller, path + "/browser-checks", {"deliveryId": state["deliveryId"], "previousReportId": None,
                    "readings": [{"stepId": f"page:{width}:index.html", "status": "observed", "kind": "page", "stylesExpected": 0, "stylesLoaded": 0, "imagesExpected": 0, "imagesLoaded": 0} for width in (375, 900)]}), "seller")
        null_basis = roles.acceptance_basis(annotated)
        results = [future.result(timeout=30) for future in futures]
    assert sorted(row[0] for row in results) == [200, 409], [(row[0], api.diagnostic(row[1])) for row in results]
    report_a = model_report(next(value for status, value, _ in results if status == 200))
    explanation_guards(api, buyer, seller, outsider, state, report_a)
    quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    assert quote["proof"]["delivery"]["browserChecks"] == annotated["proof"]["delivery"]["browserChecks"]
    marker = api.ok(None, "/api/__synthetic_model_test_mode")
    assert marker["backendAttempts"] == 1 and marker["checkpointBeforeIo"] is True and marker["observations"][0]["method"] == "GET"
    stale_null = {**consent(quote, report_a, journey_report), "expectedEvidence": null_basis}
    status, rejected, _ = api.request(buyer, path + "/accept_delivery", stale_null)
    assert status == 409 and "evidence changed" in rejected.get("error", "").lower()
    assert not quote["proof"]["delivery"].get("acceptanceEvidence")
    held_a = consent(quote, report_a, journey_report)
    second = api.ok(seller, endpoint, run_input(state, report_a["id"], 43))
    report_b = model_report(second)
    quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    status, rejected, _ = api.request(buyer, path + "/accept_delivery", {**held_a, "modelDecision": decision(report_b)})
    assert status == 409 and "evidence changed" in rejected.get("error", "").lower()
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == before
    current_consent = consent(quote, report_b, journey_report)
    for model_decision in (None, {**decision(report_b), "acknowledgeServerCheck": False}, {**decision(report_b), "exceptionReason": "short"}, decision(report_a)):
        api.reject(buyer, path + "/accept_delivery", {**current_consent, "modelDecision": model_decision}, codes=(400, 409))
    accepted = chain.quote_of(api.ok(buyer, path + "/accept_delivery", current_consent), "buyer")
    frozen = copy.deepcopy(chain.snapshot(accepted))
    assert frozen["modelReportId"] == report_b["id"] and frozen["modelDecision"] == decision(report_b)
    third = api.ok(seller, endpoint, run_input(state, report_b["id"], 44))
    report_c = model_report(third)
    quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    assert chain.snapshot(quote) == frozen and quote["proof"]["delivery"]["modelHistory"] == [report_a, report_b, report_c]
    ready = readiness_checks(api, buyer, seller, outsider, state)
    assert ready["frozenAcceptance"]["modelReportId"] == report_b["id"]
    assert any(row["kind"] == "modelReportId" for row in ready["supplementalDifferences"])
    state.update(journeyReport=journey_report, acceptedSnapshot=frozen, latestReportId=report_c["id"])
    state_file.write_text(json.dumps(state), encoding="utf-8")
    return {"result": "registered-passed", "reports": 3, "concurrentStarts": [200, 409], "backendAttempts": marker["backendAttempts"], "providerNetworkRequests": 0,
            "checks": ["Registry/source/seed/strict body guards", "Durable CAS lease and32KiB reservation before attempted GET", "One of two concurrent starts succeeds", "Pending acceptance/payment/replacement/journey locks", "Unrelated saved browser reading survives checkpoint CAS", "Explicit null→A and A→B model vectors reject stale acceptance with409/provider0", "Unknown model evidence requires exact acknowledgement and reason", "Frozen acceptance survives a newer supplemental model report", "Readonly readiness resolves membership and queries no provider"]}


def orphan(api, state_file):
    state = json.loads(state_file.read_text())
    buyer, seller, _ = actors(state)
    endpoint = state["path"] + "/model-checks"
    def abandoned_request():
        try:
            api.request(seller, endpoint, run_input(state, state["latestReportId"], 45))
        except Exception:
            pass  # Process restart intentionally prevents observing this result.
    threading.Thread(target=abandoned_request, daemon=True).start()
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        active = api.ok(buyer, endpoint)["run"]
        if active and active["trace"]:
            state["orphanRun"] = active
            state_file.write_text(json.dumps(state), encoding="utf-8")
            return {"result": "orphan-lease-persisted", "runId": active["id"], "expiresAt": active["expiresAt"]}
        time.sleep(.02)
    raise AssertionError("The fourth run did not persist its pre-I/O checkpoint")


def closed(api, state_file):
    state = json.loads(state_file.read_text())
    buyer, seller, outsider = actors(state)
    path, endpoint, run = state["path"], state["path"] + "/model-checks", state["orphanRun"]
    pending = api.ok(buyer, endpoint)
    assert pending["run"]["id"] == run["id"]
    close = {"action": "close", "deliveryId": state["deliveryId"], "runId": run["id"]}
    api.reject(outsider, endpoint, close, role="buyer", codes=(404,))
    api.reject(buyer, endpoint, close, codes=(409,))
    now_ms = time.time() * 1000
    from datetime import datetime
    remaining = datetime.fromisoformat(run["expiresAt"].replace("Z", "+00:00")).timestamp() * 1000 - now_ms
    if remaining > 0:
        time.sleep((remaining + 100) / 1000)
    before = api.ok(None, "/api/__synthetic_model_test_mode")
    closed_result = api.ok(seller, endpoint, close)
    closed_report = model_report(closed_result)
    assert closed_report["runId"] == run["id"] and closed_report["trace"] == run["trace"]
    assert any(row["completedOrdinal"] is None for row in closed_report["trace"])
    quote = chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer")
    assert len(quote["proof"]["delivery"]["modelHistory"]) == 4 and chain.snapshot(quote) == state["acceptedSnapshot"]
    after = api.ok(None, "/api/__synthetic_model_test_mode")
    assert before["backendAttempts"] == after["backendAttempts"] == 0, "Explicit expiry close must issue no recovery GET or write"
    api.reject(buyer, endpoint, close, codes=(409,))
    api.reject(buyer, endpoint, run_input(state, closed_report["id"], 46), codes=(409,))
    assert chain.quote_of(api.ok(buyer, state["quotePath"]), "buyer") == quote
    assert api.ok(None, "/api/__synthetic_model_test_mode")["backendAttempts"] == 0
    readiness_checks(api, buyer, seller, outsider, state)
    checkout = api.ok(buyer, path + "/checkout", {})
    api.ok(buyer, path + "/authorize", {"orderId": checkout["orderId"]})
    capture = {"deliveryId": state["deliveryId"], "confirm": True, "manualChecks": chain.human_checks(quote), "acceptedEvidenceSnapshotId": state["acceptedSnapshot"]["id"]}
    api.reject(seller, path + "/capture", capture, role="buyer", codes=(403,))
    paid = chain.quote_of(api.ok(buyer, path + "/capture", capture), "buyer")
    assert paid["proof"]["paymentState"] == "captured" and chain.snapshot(paid) == state["acceptedSnapshot"]
    assert paid["proof"]["delivery"]["modelReport"]["id"] == closed_report["id"]
    calls = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    assert chain.quote_of(api.ok(buyer, path + "/capture", capture), "buyer") == paid
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == calls
    return {"result": "passed", "suite": "model-checks-api", "retainedReports": 4, "modelOutcomes": "inconclusive; outbound metadata unavailable", "expiredCloseBackendRequests": 0,
            "frozenAcceptanceAcrossSupplementAndCapture": True, "providerNetworkRequests": 0, "mockProviderCalls": calls,
            "checks": ["Worker restart retains the orphaned pre-I/O checkpoint", "Premature close409; expired explicit close has zero recovery IO and retains unknown completion", "Four-report budget rejects new admission without evicting old evidence", "Accepted report remains frozen across supplemental reports and mocked capture; replay does not recapture"],
            "scope": "Owned isolated Worker, fresh D1 and fixed synthetic identities/readings/provider responses. No native race success, browser operation, real sign-in, external model or Sandbox funds is asserted."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--phase", choices=("seed", "registered", "orphan", "closed"), required=True)
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker["syntheticConfiguration"] is True and marker["outboundFetch"] == "blocked"
    result = globals()[args.phase](api, args.state)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
