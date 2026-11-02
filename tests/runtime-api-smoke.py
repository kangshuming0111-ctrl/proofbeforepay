"""Runtime lease/report -> revision -> explicit acceptance in isolated API/D1.

Use only the owned loopback Worker from run-collaborative-sandbox-local.mjs.
All outbound fetch is blocked: the runtime report must retain all eight basic
or eighteen business steps as unavailable, never manufacture successful backend observations. Synthetic gateway
identities are not actual sign-ins. No mutation is retried and no external
model, backend or payment is contacted. Real backend protocol execution is a
separate check against the hosted disposable verification lab.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request
from uuid import uuid4

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("runtime_chain_helpers", Path(__file__).with_name("chain-coverage-api-smoke.py"))
chain = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = chain
_spec.loader.exec_module(chain)
roles = chain.roles

SUMMARY = "Accept a synthetic booking with required slot and valid email and retain it for independent readback and idempotent repeated submission."
LAB_ORIGIN = "https://proofbeforepay-verification-lab.blueheron8.chatgpt.site"
POLICY_SUMMARY = "Each booking accepts at most 6 people."
POLICY_STEP_IDS = ["revision", "missing_slot", "invalid_email", "create", "readback", "replay", "conflict", "unchanged",
                   "party_zero", "party_fraction", "party_below", "party_below_readback", "party_exact", "party_exact_readback", "party_above",
                   "concurrent_first", "concurrent_second", "concurrent_readback"]


def specification(title, runtime=True):
    value = {"mode": "custom", "collaborative": True, "demoRoleplay": False,
             "paymentTesting": "collaborative-sandbox", "language": "en", "currency": "AUD",
             "title": title, "summary": SUMMARY, "amount": "1.00", "requiredPages": ["index.html"], "manualRequirements": [],
             "coverage": {"version": 1, "sourceText": SUMMARY, "confirmed": True, "decisions": [{"id": "coverage-1", "disposition": "include"}]}}
    if runtime:
        value["runtimeCheck"] = {"protocol": "booking-http-v1", "criterionId": "coverage-1", "confirmed": True}
    return value


def files(revised=False):
    return {"index.html": "<!doctype html><html><head><title>Synthetic booking handoff</title></head><body><h1>Book a test visit</h1><p>" + ("Revised owned fixture." if revised else "First owned fixture.") + "</p></body></html>"}


def policy_specification(title):
    value = specification(title)
    value["summary"] = POLICY_SUMMARY
    value["coverage"]["sourceText"] = POLICY_SUMMARY
    value["runtimeCheck"] = {"protocol": "booking-http-v2", "criterionId": "coverage-1", "confirmed": True,
                             "policy": {"maxPartySize": 6, "source": {"start": 0, "end": len(POLICY_SUMMARY) - 1, "excerpt": POLICY_SUMMARY[:-1]}}}
    return value


def digest(value):
    raw = json.dumps(sorted(value.items()), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def runtime_input(quote):
    delivery = quote["proof"]["delivery"]
    return {"deliveryId": delivery["id"], "previousReportId": delivery.get("runtimeReport", {}).get("id"), "confirm": True}


def consent(quote, exceptions=False):
    delivery = quote["proof"]["delivery"]
    report = delivery.get("runtimeReport", {})
    value = {"deliveryId": delivery["id"], "confirm": True, "manualChecks": chain.human_checks(quote), "runtimeDecision": {"reportId": report.get("id")}}
    if exceptions:
        value["runtimeDecision"].update(exceptionReason="Buyer explicitly accepts the unavailable synthetic HTTP evidence after a separate review.", acknowledgedSteps=[step["id"] for step in report["steps"] if step["outcome"] != "observed"])
    return value


def assert_report(quote, source_files):
    delivery = quote["proof"]["delivery"]
    report = delivery["runtimeReport"]
    assert report["deliveryId"] == delivery["id"] and report["id"] == report["runId"]
    assert report["deliveryDigest"] == delivery["runtimeDeliveryDigest"] == digest(source_files)
    assert report["target"] == {"id": "lab-fixed", "label": "Controlled booking fixture v2", "origin": LAB_ORIGIN, "revision": "booking-fixed-v2"}
    assert report["plan"] == quote["proof"]["project"]["runtimeCheck"]
    assert report["method"] == "server-booking-http-v1"
    assert report["summary"] == {"steps": 8, "observed": 0, "issues": 0, "unavailable": 8}
    assert [step["id"] for step in report["steps"]] == ["revision", "missing_slot", "invalid_email", "create", "readback", "replay", "conflict", "unchanged"]
    assert all(step["outcome"] == "unavailable" for step in report["steps"])
    assert report["steps"][0]["reason"] == "network_unavailable"
    assert all(step["reason"] == "revision_not_verified" for step in report["steps"][1:])
    assert "runtimeRun" not in delivery
    assert delivery["runtimeHistory"][-1] == report
    return report


def assert_unchanged(api, buyer, quote_path, before):
    assert api.ok(buyer, quote_path)["quote"] == before


def assert_policy_report(quote, source_files):
    delivery = quote["proof"]["delivery"]
    report = delivery["runtimeReport"]
    assert report["deliveryId"] == delivery["id"] and report["id"] == report["runId"]
    assert report["deliveryDigest"] == delivery["runtimeDeliveryDigest"] == digest(source_files)
    assert report["target"] == {"id": "lab-policy-fixed", "label": "Controlled booking policy fixed", "origin": LAB_ORIGIN, "revision": "booking-policy-fixed-v1"}
    assert report["plan"] == quote["proof"]["project"]["runtimeCheck"]
    assert report["plan"]["protocol"] == "booking-http-v2"
    assert report["plan"]["source"] == {"start": 0, "end": len(POLICY_SUMMARY), "excerpt": POLICY_SUMMARY}
    assert report["plan"]["policy"] == policy_specification("Expected policy")["runtimeCheck"]["policy"]
    assert report["method"] == "server-booking-http-v2"
    assert report["summary"] == {"steps": 18, "observed": 0, "issues": 0, "unavailable": 18}
    assert [step["id"] for step in report["steps"]] == POLICY_STEP_IDS
    assert all(step["outcome"] == "unavailable" for step in report["steps"])
    assert report["steps"][0]["reason"] == "network_unavailable"
    assert all(step["reason"] == "revision_not_verified" for step in report["steps"][1:])
    assert "runtimeRun" not in delivery
    assert delivery["runtimeHistory"][-1] == report
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    api = roles.LocalAPI(parser.parse_args().url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker.get("syntheticConfiguration") is True and marker.get("outboundFetch") == "blocked"
    run = uuid4().hex
    buyer = roles.Actor("runtime-buyer-" + run, "buyer@runtime-synthetic.example")
    seller = roles.Actor("runtime-seller-" + run, "seller@runtime-synthetic.example")
    outsider = roles.Actor("runtime-outsider-" + run, "outsider@runtime-synthetic.example")
    config = api.ok(buyer, "/api/config")
    assert config["aiMode"] == "demo" and config["paymentMode"] == "sandbox"

    initial = api.ok(buyer, "/api/proofs")
    malformed = []
    for patch in ({"confirmed": False}, {"criterionId": "page-1"}, {"protocol": "arbitrary-script"}, {"source": {"start": 0, "end": 4, "excerpt": "fake"}}, {"url": "https://unregistered.synthetic.example"}):
        value = specification("Rejected backend scope"); value["runtimeCheck"].update(patch); malformed.append(value)
    excluded = specification("Excluded backend scope"); excluded["coverage"]["decisions"][0].update(disposition="exclude", reason="Deliberately not in acceptance scope"); malformed.append(excluded)
    for value in malformed:
        api.reject(buyer, "/api/proofs", value, codes=(400,))
    assert api.ok(buyer, "/api/proofs") == initial
    api.checked("HTTP creation refuses unconfirmed/forged/unsupported/out-of-scope backend plans without creating records")

    path, quote_path = chain.create_shared(api, buyer, seller, specification("Synthetic runtime lifecycle"))
    before_upload = api.ok(buyer, quote_path)["quote"]
    api.reject(seller, path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "unregistered"}, codes=(400,))
    assert_unchanged(api, buyer, quote_path, before_upload)
    quote = chain.quote_of(api.ok(seller, path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-fixed"}), "seller")
    assert quote["proof"]["delivery"]["runtimeDeliveryDigest"] == digest(files())
    first_id = quote["proof"]["delivery"]["id"]
    endpoint = path + "/runtime-checks"
    payload = runtime_input(quote)
    guarded = api.ok(buyer, quote_path)["quote"]
    api.reject(outsider, endpoint, payload, role="buyer", codes=(404,))
    api.reject(None, endpoint, payload, codes=(401, 404))
    request = Request(api.origin + endpoint, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json", "Origin": "https://unrelated.synthetic.example", "oai-authenticated-user-id": buyer.identifier, "oai-authenticated-user-email": buyer.email}, method="POST")
    try:
        response = api.opener.open(request, timeout=40)
    except HTTPError as error:
        response = error
    with response:
        assert response.status == 403
    for patch, codes in [({"url": "https://unregistered.synthetic.example"}, (400,)), ({"resuming": True}, (400,)), ({"report": {"summary": {"observed": 8}}}, (400,)), ({"confirm": False}, (400,)), ({"deliveryId": "stale-upload"}, (409,)), ({"previousReportId": "stale-report"}, (409,))]:
        api.reject(buyer, endpoint, {**payload, **patch}, codes=codes)
    api.reject(buyer, endpoint, {**payload, "oversize": "x" * 5000}, codes=(413,))
    assert_unchanged(api, buyer, quote_path, guarded)
    api.checked("Identity and CSRF checks, operator-only target IDs, strict body fields/limit, write consent and delivery/report preconditions are enforced by actual routes")

    no_plan_path, no_plan_quote_path = chain.create_shared(api, buyer, seller, specification("No backend plan", runtime=False))
    api.ok(seller, no_plan_path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True})
    no_plan = api.ok(buyer, no_plan_quote_path)["quote"]
    api.reject(buyer, no_plan_path + "/runtime-checks", runtime_input(no_plan), codes=(409,))
    assert_unchanged(api, buyer, no_plan_quote_path, no_plan)
    api.ok(seller, path + "/submit_delivery", {"deliveryId": first_id, "note": "Synthetic backend-bound delivery for review"})
    submitted = api.ok(buyer, quote_path)["quote"]
    api.reject(buyer, path + "/accept_delivery", consent(submitted), codes=(409,))
    api.reject(seller, path + "/accept_delivery", consent(submitted), role="buyer", codes=(403,))
    api.checked("A project without the confirmed plan cannot run backend tests, and an agreed plan cannot be accepted without its report or by a spoofed seller role")

    def concurrent_run():
        return roles.LocalAPI(api.origin).request(buyer, endpoint, payload)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: concurrent_run(), range(2)))
    assert sorted(code for code, _, _ in results) == [200, 409], [(code, api.diagnostic(value)) for code, value, _ in results]
    quote = api.ok(buyer, quote_path)["quote"]
    first_report = copy.deepcopy(assert_report(quote, files()))
    assert len(quote["proof"]["delivery"]["runtimeHistory"]) == 1
    api.reject(buyer, endpoint, payload, codes=(409,))
    api.reject(buyer, path + "/accept_delivery", consent(quote), codes=(409,))
    incomplete = consent(quote, True); incomplete["runtimeDecision"]["acknowledgedSteps"].pop()
    api.reject(buyer, path + "/accept_delivery", incomplete, codes=(409,))
    assert api.ok(buyer, quote_path)["quote"]["proof"]["collaboration"]["stage"] == "submitted"
    api.checked("Concurrent actual HTTP starts save at most one run through CAS; blocked outbound fetch retains eight unavailable steps and explicit exception gates, never a false backend pass")

    api.ok(buyer, path + "/return", {"deliveryId": first_id, "feedback": [{"criterionId": "coverage-1", "comment": "Provide separately verifiable backend behavior before final acceptance."}]})
    api.ok(seller, path + "/delivery", {"files": files(True), "expectedDeliveryId": first_id, "reviewRules": True, "backendTargetId": "lab-fixed"})
    quote = api.ok(buyer, quote_path)["quote"]
    delivery = quote["proof"]["delivery"]; second_id = delivery["id"]
    assert second_id != first_id and delivery["runtimeDeliveryDigest"] == digest(files(True)) != first_report["deliveryDigest"]
    assert all(key not in delivery for key in ("runtimeReport", "runtimeHistory", "runtimeRun", "acceptanceEvidence"))
    archived = api.ok(buyer, path + "/versions/" + first_id)["version"]
    assert archived["delivery"]["runtimeReport"] == first_report and archived["delivery"]["runtimeHistory"] == [first_report] and archived["delivery"]["files"] == files()
    api.reject(buyer, endpoint, payload, codes=(409,))
    api.reject(seller, path + "/delivery", {"files": files(), "expectedDeliveryId": first_id, "backendTargetId": "lab-fixed"}, codes=(409,))
    api.checked("Replacement assigns a new file digest and clears runtime evidence; the original exact files and runtime history remain in the private archived version")

    api.ok(seller, path + "/submit_delivery", {"deliveryId": second_id, "note": "Synthetic revised delivery"})
    quote = api.ok(buyer, endpoint, runtime_input(quote))["quote"]
    report_a = copy.deepcopy(assert_report(quote, files(True)))
    quote = api.ok(buyer, path + "/accept_delivery", consent(quote, True))["quote"]
    snapshot = copy.deepcopy(chain.snapshot(quote))
    assert snapshot["runtimeReportId"] == report_a["id"] and snapshot["runtimeDeliveryDigest"] == report_a["deliveryDigest"] and snapshot["runtimeTargetId"] == "lab-fixed"
    assert snapshot["runtimeAcknowledgedSteps"] == [step["id"] for step in report_a["steps"]]
    assert quote["proof"]["paymentState"] == "unfunded" and not quote.get("paypalOrderId")
    quote = api.ok(seller, endpoint, runtime_input(quote), role="buyer")["quote"]
    report_b = assert_report(quote, files(True))
    assert report_b["id"] != report_a["id"] and len(quote["proof"]["delivery"]["runtimeHistory"]) == 2
    assert chain.snapshot(quote) == snapshot and quote["proof"]["collaboration"]["stage"] == "accepted"
    assert quote["proof"]["paymentState"] == "unfunded"
    for actor in (buyer, seller):
        versions = api.ok(actor, path + "/versions")["versions"]
        assert all("runtimeHistory" not in row["delivery"] and "runtimeRun" not in row["delivery"] for row in versions)
        listed = next(row for row in api.ok(actor, "/api/proofs")["quotes"] if row["id"] == quote["id"])
        assert "runtimeHistory" not in listed["proof"]["delivery"] and "runtimeRun" not in listed["proof"]["delivery"]
    api.reject(outsider, path + "/versions/" + first_id, codes=(404,))
    assert api.ok(buyer, path + "/versions/" + first_id)["version"] == archived
    api.checked("Explicit buyer exceptions freeze exact reportA/digest/target/failed steps; later reportB remains supplemental; member-scoped lists omit histories and outsider archive reads reject, with no payment")

    # A second, independent agreement exercises the v2 business policy through
    # actual routes/storage without altering the basic v1 lifecycle above.
    before_policy_creation = api.ok(buyer, "/api/proofs")
    tampered_maximum = policy_specification("Rejected policy maximum")
    tampered_maximum["runtimeCheck"]["policy"]["maxPartySize"] = 7
    tampered_source = policy_specification("Rejected policy citation")
    tampered_source["runtimeCheck"]["policy"]["source"]["excerpt"] = POLICY_SUMMARY[:-1].replace("6", "7")
    minimum = policy_specification("Rejected minimum as maximum")
    minimum_summary = "Each booking accepts at least 6 people."
    minimum["summary"] = minimum_summary
    minimum["coverage"]["sourceText"] = minimum_summary
    minimum["runtimeCheck"]["policy"]["source"] = {"start": 0, "end": len(minimum_summary) - 1, "excerpt": minimum_summary[:-1]}
    missing_policy = policy_specification("Rejected absent policy")
    del missing_policy["runtimeCheck"]["policy"]
    for invalid_policy in (tampered_maximum, tampered_source, minimum, missing_policy):
        api.reject(buyer, "/api/proofs", invalid_policy, codes=(400,))
    assert api.ok(buyer, "/api/proofs") == before_policy_creation

    policy_path, policy_quote_path = chain.create_shared(api, buyer, seller, policy_specification("Synthetic maximum-party lifecycle"))
    before_policy_upload = api.ok(buyer, policy_quote_path)["quote"]
    api.reject(seller, policy_path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-fixed"}, codes=(400,))
    assert_unchanged(api, buyer, policy_quote_path, before_policy_upload)
    policy_quote = chain.quote_of(api.ok(seller, policy_path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-policy-fixed"}), "seller")
    policy_endpoint = policy_path + "/runtime-checks"
    policy_quote = api.ok(buyer, policy_endpoint, runtime_input(policy_quote))["quote"]
    policy_report_a = copy.deepcopy(assert_policy_report(policy_quote, files()))
    policy_id = policy_quote["proof"]["delivery"]["id"]
    api.ok(seller, policy_path + "/submit_delivery", {"deliveryId": policy_id, "note": "Synthetic six-person policy for independent buyer review"})
    policy_quote = api.ok(buyer, policy_quote_path)["quote"]
    api.reject(buyer, policy_path + "/accept_delivery", consent(policy_quote), codes=(409,))
    incomplete_policy_consent = consent(policy_quote, True)
    incomplete_policy_consent["runtimeDecision"]["acknowledgedSteps"].pop()
    api.reject(buyer, policy_path + "/accept_delivery", incomplete_policy_consent, codes=(409,))
    policy_quote = api.ok(buyer, policy_path + "/accept_delivery", consent(policy_quote, True))["quote"]
    policy_snapshot = copy.deepcopy(chain.snapshot(policy_quote))
    assert policy_snapshot["runtimeReportId"] == policy_report_a["id"]
    assert policy_snapshot["runtimeDeliveryDigest"] == policy_report_a["deliveryDigest"]
    assert policy_snapshot["runtimeTargetId"] == "lab-policy-fixed"
    assert policy_snapshot["runtimeAcknowledgedSteps"] == POLICY_STEP_IDS
    policy_quote = api.ok(seller, policy_endpoint, runtime_input(policy_quote))["quote"]
    policy_report_b = assert_policy_report(policy_quote, files())
    assert policy_report_b["id"] != policy_report_a["id"]
    assert len(policy_quote["proof"]["delivery"]["runtimeHistory"]) == 2
    assert chain.snapshot(policy_quote) == policy_snapshot
    assert policy_quote["proof"]["collaboration"]["stage"] == "accepted"
    assert policy_quote["proof"]["paymentState"] == "unfunded" and not policy_quote.get("paypalOrderId")
    api.checked("V2 routes reject tampered maximum/source, minimum-as-maximum, missing policy and incompatible v1 targets; preserve all18 unavailable steps and exact policy/digest; explicit complete exceptions freeze reportA while reportB stays supplemental, with no payment")
    after = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert after["syntheticCalls"] == marker["syntheticCalls"]
    print(json.dumps({"result": "passed", "suite": "runtime-checks", "checks": api.checks, "runtimeReportsSaved": 5, "basicV1ReportsSaved": 3, "businessV2ReportsSaved": 2, "concurrentStarts": {"attempts": 2, "successes": 1, "conflicts": 1}, "stepsPerReport": 8, "unavailablePerReport": 8, "v2StepsPerReport": 18, "v2UnavailablePerReport": 18, "acceptanceSnapshotPreservedAcrossSupplement": True, "v2AcceptanceSnapshotPreservedAcrossSupplement": True, "providerNetworkRequests": 0, "applicationModelCalls": 0, "syntheticProviderFetches": 0, "mutationRetries": 0, "scope": "Fresh isolated API/D1 with synthetic gateway identity headers; all outbound backend/provider fetches blocked. This verifies roles, storage, leases, version/acceptance binding, not actual backend protocol execution, real sign-ins, UI use, independent users or payment."}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
