"""Runtime lease/report -> revision -> explicit acceptance in isolated API/D1.

Use only the owned loopback Worker from run-collaborative-sandbox-local.mjs.
All outbound fetch is blocked: the runtime report must retain all eight basic,
eighteen party-policy, seventeen capacity or thirty-one combined steps as unavailable,
never manufacture successful backend observations. Synthetic gateway
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
CAPACITY_STEP_IDS = ["revision", "slot_a_initial", "party_above", "capacity_race_first", "capacity_race_second", "race_winner_readback",
                     "slot_a_after_race", "race_winner_replay", "slot_a_after_replay", "fill_remainder", "fill_readback", "slot_a_full",
                     "reject_extra", "slot_a_after_rejection", "slot_b_create", "slot_b_readback", "slot_b_occupancy"]
COMBINED_STEP_IDS = CAPACITY_STEP_IDS + ["missing_slot", "invalid_email", "party_zero", "party_fraction", "party_negative", "party_string",
    "winner_conflict", "same_key_first", "same_key_second", "same_key_readback", "party_one", "party_one_readback", "party_below", "party_below_readback"]


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


def capacity_specification(title):
    value = policy_specification(title)
    capacity_clause = "Each time slot accepts at most 8 guests in total."
    summary = POLICY_SUMMARY + "\n" + capacity_clause
    value["summary"] = summary
    value["coverage"] = {"version": 1, "sourceText": summary, "confirmed": True,
                         "decisions": [{"id": "coverage-1", "disposition": "include"}, {"id": "coverage-2", "disposition": "include"}]}
    value["runtimeCheck"]["protocol"] = "booking-http-v3"
    value["runtimeCheck"]["slotCapacity"] = {"criterionId": "coverage-2", "maxGuestsPerSlot": 8,
        "source": {"start": len(POLICY_SUMMARY) + 1, "end": len(summary), "excerpt": capacity_clause}}
    return value


def combined_specification(title):
    value = capacity_specification(title)
    value["runtimeCheck"]["protocol"] = "booking-http-v4"
    return value


def retained_history_bytes(delivery):
    # Same persisted collections as the public evidence-budget boundary; do not
    # count the duplicate latest runtimeReport twice or infer a hidden reserve.
    histories = {"runtime": delivery.get("runtimeHistory", []), "business": delivery.get("businessCheckHistory", []),
                 "browser": delivery.get("browserCheckHistory", []), "layout": delivery.get("layoutHistory", []),
                 "acceptance": delivery.get("acceptanceEvidence", [])}
    return len(json.dumps(histories, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


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


def assert_combined_report(quote, source_files, expected_delivery_id, previous_reports):
    """Every supplemental run retains the exact v4 binding and prior history.

    Acceptance deliberately stays frozen on reportA, not the newest supplement.
    """
    delivery = quote["proof"]["delivery"]
    report = delivery["runtimeReport"]
    expected_plan = combined_specification("Expected combined plan")["runtimeCheck"]
    del expected_plan["confirmed"]
    expected_plan["source"] = {"start": 0, "end": len(POLICY_SUMMARY), "excerpt": POLICY_SUMMARY}
    assert delivery["id"] == expected_delivery_id and delivery["files"] == source_files
    assert report["deliveryId"] == expected_delivery_id and report["id"] == report["runId"]
    assert report["deliveryDigest"] == delivery["runtimeDeliveryDigest"] == digest(source_files)
    assert report["plan"] == quote["proof"]["project"]["runtimeCheck"] == expected_plan
    assert report["target"] == {"id": "lab-coverage-fixed", "label": "Combined input, replay and capacity checks", "origin": LAB_ORIGIN, "revision": "coverage-fixed-v1"}
    assert report["method"] == "server-booking-http-v4"
    assert report["summary"] == {"steps": 31, "observed": 0, "issues": 0, "unavailable": 31}
    assert [row["id"] for row in report["steps"]] == COMBINED_STEP_IDS
    assert all(row["outcome"] == "unavailable" for row in report["steps"])
    assert report["steps"][0]["reason"] == "network_unavailable"
    assert all(row["reason"] == "revision_not_verified" for row in report["steps"][1:])
    assert "runtimeRun" not in delivery
    assert delivery["runtimeHistory"] == previous_reports + [report]
    assert len({row["id"] for row in delivery["runtimeHistory"]}) == len(previous_reports) + 1
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
    buyer_targets = api.ok(buyer, path + "/runtime-targets")
    assert buyer_targets == api.ok(seller, path + "/runtime-targets")
    assert {item["id"] for item in buyer_targets["targets"]} == {"lab-flawed", "lab-fixed"}
    assert all(item["kind"] == "fixture" and "baseUrl" not in item for item in buyer_targets["targets"])
    contract = api.ok(seller, path + "/runtime-contract")
    assert contract["projectId"] == path.split("/")[-1] and contract["protocol"] == "booking-http-v1"
    assert contract["registration"]["required"] is True and contract["execution"]["autoAcceptance"] is False
    assert len(contract["steps"]) == 8 and contract["registration"]["deploymentAttestation"] is False
    for suffix in ("/runtime-targets", "/runtime-contract"):
        api.reject(outsider, path + suffix, codes=(404,))
        api.reject(None, path + suffix, codes=(401, 404))
    api.checked("Authenticated member-only target descriptors omit endpoints; exact project contract downloads without granting outsiders access")
    before_upload = api.ok(buyer, quote_path)["quote"]
    for extra in ({"backendUrl": "https://caller-url.synthetic.example"}, {"runtimeRegistration": {"id": "caller-forged"}}, {"target": {"baseUrl": "https://caller-url.synthetic.example"}}):
        api.reject(seller, path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-fixed", **extra}, codes=(400,))
    api.reject(seller, path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "unregistered"}, codes=(400,))
    assert_unchanged(api, buyer, quote_path, before_upload)
    quote = chain.quote_of(api.ok(seller, path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-fixed"}), "seller")
    assert quote["proof"]["delivery"]["runtimeDeliveryDigest"] == digest(files())
    first_id = quote["proof"]["delivery"]["id"]
    # Connection preflight reads only meta. The isolated wrapper blocks external
    # fetch, so this must remain unavailable and must not create a lease/report.
    preflight_endpoint = path + "/runtime-preflight"
    preflight_input = {"deliveryId": first_id}
    before_preflight = api.ok(buyer, quote_path)["quote"]
    api.reject(outsider, preflight_endpoint, preflight_input, codes=(404,))
    api.reject(None, preflight_endpoint, preflight_input, codes=(401, 404))
    api.reject(buyer, preflight_endpoint, {"deliveryId": "stale-delivery"}, codes=(409,))
    for extra in ({"url": "https://unregistered.synthetic.example/"}, {"metadata": {"revision": "caller-claim"}}, {"confirm": True}):
        api.reject(buyer, preflight_endpoint, {**preflight_input, **extra}, codes=(400,))
    request = Request(api.origin + preflight_endpoint, data=json.dumps(preflight_input).encode("utf-8"), headers={"Content-Type": "application/json", "Origin": "https://unrelated.synthetic.example", "oai-authenticated-user-id": buyer.identifier, "oai-authenticated-user-email": buyer.email}, method="POST")
    try:
        api.opener.open(request, timeout=40)
        raise AssertionError("Cross-origin preflight unexpectedly succeeded")
    except HTTPError as error:
        assert error.code == 403
    for member in (buyer, seller):
        preflight = api.ok(member, preflight_endpoint, preflight_input)
        assert preflight["method"] == "server-booking-meta-preflight-v1" and preflight["deliveryId"] == first_id
        assert preflight["targetId"] == "lab-fixed" and preflight["protocol"] == "booking-http-v1"
        assert preflight["status"] == "unavailable" and preflight["reason"] == "network_unavailable"
        assert not any(field in preflight for field in ("steps", "runId", "metadata", "source", "quote"))
    assert_unchanged(api, buyer, quote_path, before_preflight)
    api.checked("Connection-only preflight enforces member/origin/current-upload boundaries, refuses caller URLs/metadata, and leaves no saved lease/report/audit mutation")
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
    before_capacity = api.ok(buyer, "/api/proofs")
    wrong_capacity = capacity_specification("Rejected ungrounded capacity")
    wrong_capacity["runtimeCheck"]["slotCapacity"]["maxGuestsPerSlot"] = 9
    partial_capacity = capacity_specification("Rejected partial capacity clause")
    partial_capacity["runtimeCheck"]["slotCapacity"]["source"]["end"] -= 1
    partial_capacity["runtimeCheck"]["slotCapacity"]["source"]["excerpt"] = partial_capacity["runtimeCheck"]["slotCapacity"]["source"]["excerpt"][:-1]
    same_clause = capacity_specification("Rejected reused capacity citation")
    same_clause["runtimeCheck"]["slotCapacity"]["criterionId"] = "coverage-1"
    excluded_capacity = capacity_specification("Rejected excluded capacity")
    excluded_capacity["coverage"]["decisions"][1].update(disposition="exclude", reason="Not included in this delivery")
    for invalid in (wrong_capacity, partial_capacity, same_clause, excluded_capacity):
        api.reject(buyer, "/api/proofs", invalid, codes=(400,))
    assert api.ok(buyer, "/api/proofs") == before_capacity
    capacity_path, capacity_quote_path = chain.create_shared(api, buyer, seller, capacity_specification("Synthetic two-constraint capacity lifecycle"))
    capacity_targets = api.ok(seller, capacity_path + "/runtime-targets")["targets"]
    assert {row["id"] for row in capacity_targets} == {"lab-capacity-flawed", "lab-capacity-fixed", "lab-capacity-underlimit"}
    capacity_contract = api.ok(seller, capacity_path + "/runtime-contract")
    assert capacity_contract["protocol"] == "booking-http-v3" and len(capacity_contract["steps"]) == 17
    before_capacity_upload = api.ok(buyer, capacity_quote_path)["quote"]
    api.reject(seller, capacity_path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-policy-fixed"}, codes=(400,))
    assert_unchanged(api, buyer, capacity_quote_path, before_capacity_upload)
    capacity_quote = api.ok(seller, capacity_path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-capacity-fixed"})["quote"]
    capacity_endpoint = capacity_path + "/runtime-checks"
    capacity_quote = api.ok(buyer, capacity_endpoint, runtime_input(capacity_quote))["quote"]
    capacity_delivery = capacity_quote["proof"]["delivery"]
    capacity_report = copy.deepcopy(capacity_delivery["runtimeReport"])
    assert capacity_report["method"] == "server-booking-http-v3"
    assert capacity_report["summary"] == {"steps": 17, "observed": 0, "issues": 0, "unavailable": 17}
    assert capacity_report["plan"]["slotCapacity"] == capacity_specification("Expected")["runtimeCheck"]["slotCapacity"]
    assert capacity_report["deliveryDigest"] == digest(files())
    api.ok(seller, capacity_path + "/submit_delivery", {"deliveryId": capacity_delivery["id"], "note": "Synthetic per-booking and aggregate slot limits for explicit buyer review"})
    capacity_quote = api.ok(buyer, capacity_quote_path)["quote"]
    api.reject(buyer, capacity_path + "/accept_delivery", consent(capacity_quote), codes=(409,))
    capacity_incomplete = consent(capacity_quote, True)
    capacity_incomplete["runtimeDecision"]["acknowledgedSteps"].pop()
    api.reject(buyer, capacity_path + "/accept_delivery", capacity_incomplete, codes=(409,))
    capacity_quote = api.ok(buyer, capacity_path + "/accept_delivery", consent(capacity_quote, True))["quote"]
    capacity_snapshot = copy.deepcopy(chain.snapshot(capacity_quote))
    assert capacity_snapshot["runtimeReportId"] == capacity_report["id"]
    assert len(capacity_snapshot["runtimeAcknowledgedSteps"]) == 17
    assert {row["id"] for row in capacity_snapshot["criteria"]} >= {"coverage-1", "coverage-2"}
    capacity_quote = api.ok(seller, capacity_endpoint, runtime_input(capacity_quote))["quote"]
    assert chain.snapshot(capacity_quote) == capacity_snapshot
    assert capacity_quote["proof"]["paymentState"] == "unfunded" and not capacity_quote.get("paypalOrderId")
    api.checked("V3 requires two separately included complete source clauses, rejects forged capacities and v2 targets; retains all17 unavailable observations and exact-version exceptions while later reports stay supplemental, without payment")
    before_combined = api.ok(buyer, "/api/proofs")
    combined_invalid = []
    for label, missing in (("capacity", "slotCapacity"), ("party policy", "policy")):
        invalid = combined_specification("Rejected v4 missing " + label)
        del invalid["runtimeCheck"][missing]
        combined_invalid.append(invalid)
    for key in ("slotCapacity", "policy"):
        invalid = combined_specification("Rejected v4 missing source")
        del invalid["runtimeCheck"][key]["source"]
        combined_invalid.append(invalid)
    for index in (0, 1):
        invalid = combined_specification("Rejected v4 excluded clause")
        invalid["coverage"]["decisions"][index].update(disposition="exclude", reason="This source is deliberately outside acceptance")
        combined_invalid.append(invalid)
    shortened_v4 = combined_specification("Rejected v4 shortened capacity clause")
    shortened_v4["runtimeCheck"]["slotCapacity"]["source"]["end"] -= 1
    shortened_v4["runtimeCheck"]["slotCapacity"]["source"]["excerpt"] = shortened_v4["runtimeCheck"]["slotCapacity"]["source"]["excerpt"][:-1]
    combined_invalid.append(shortened_v4)
    forged_v4 = combined_specification("Rejected v4 forged original capacity")
    forged_v4["runtimeCheck"]["slotCapacity"]["maxGuestsPerSlot"] = 9
    forged_v4["runtimeCheck"]["slotCapacity"]["source"]["excerpt"] = forged_v4["runtimeCheck"]["slotCapacity"]["source"]["excerpt"].replace("8", "9")
    combined_invalid.append(forged_v4)
    reused_v4 = combined_specification("Rejected v4 single-clause reuse")
    reused_v4["runtimeCheck"]["slotCapacity"]["criterionId"] = "coverage-1"
    combined_invalid.append(reused_v4)
    for invalid in combined_invalid:
        api.reject(buyer, "/api/proofs", invalid, codes=(400,))
    assert api.ok(buyer, "/api/proofs") == before_combined
    combined_path, combined_quote_path = chain.create_shared(api, buyer, seller, combined_specification("Synthetic combined31 lifecycle"))
    combined_targets = api.ok(seller, combined_path + "/runtime-targets")["targets"]
    assert {row["id"] for row in combined_targets} == {"lab-coverage-fixed", "lab-coverage-validation-gap", "lab-coverage-overbook"}
    assert all(row["protocol"] == "booking-http-v4" for row in combined_targets)
    combined_contract = api.ok(seller, combined_path + "/runtime-contract")
    assert combined_contract["protocol"] == "booking-http-v4" and combined_contract["bounds"]["maxRequests"] == 31
    assert [row["id"] for row in combined_contract["steps"]] == COMBINED_STEP_IDS
    assert len(set(combined_contract["execution"]["stepOrder"])) == 31
    assert {combined_contract["plan"]["criterionId"], combined_contract["plan"]["slotCapacity"]["criterionId"]} == {"coverage-1", "coverage-2"}
    assert combined_contract["plan"]["source"]["excerpt"] == POLICY_SUMMARY
    assert combined_contract["plan"]["slotCapacity"]["source"] == combined_specification("Expected")["runtimeCheck"]["slotCapacity"]["source"]
    before_combined_upload = api.ok(buyer, combined_quote_path)["quote"]
    api.reject(seller, combined_path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-capacity-fixed"}, codes=(400,))
    assert_unchanged(api, buyer, combined_quote_path, before_combined_upload)
    combined_quote = api.ok(seller, combined_path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True, "backendTargetId": "lab-coverage-fixed"})["quote"]
    combined_delivery_id = combined_quote["proof"]["delivery"]["id"]
    combined_endpoint = combined_path + "/runtime-checks"
    combined_quote = api.ok(buyer, combined_endpoint, runtime_input(combined_quote))["quote"]
    combined_delivery = combined_quote["proof"]["delivery"]
    combined_report = copy.deepcopy(assert_combined_report(combined_quote, files(), combined_delivery_id, []))
    assert combined_report["method"] == "server-booking-http-v4" and combined_report["plan"] == combined_quote["proof"]["project"]["runtimeCheck"]
    assert combined_report["deliveryId"] == combined_delivery["id"] and combined_report["deliveryDigest"] == digest(files())
    assert combined_report["target"]["id"] == "lab-coverage-fixed" and combined_report["target"]["revision"] == "coverage-fixed-v1"
    assert combined_report["summary"] == {"steps": 31, "observed": 0, "issues": 0, "unavailable": 31}
    assert [row["id"] for row in combined_report["steps"]] == COMBINED_STEP_IDS
    assert combined_report["steps"][0]["reason"] == "network_unavailable"
    assert all(row["outcome"] == "unavailable" for row in combined_report["steps"])
    assert all(row["reason"] == "revision_not_verified" for row in combined_report["steps"][1:])
    assert "runtimeRun" not in combined_delivery and combined_delivery["runtimeHistory"] == [combined_report]
    api.ok(seller, combined_path + "/submit_delivery", {"deliveryId": combined_delivery["id"], "note": "Synthetic31-check combined protocol for explicit buyer review"})
    combined_quote = api.ok(buyer, combined_quote_path)["quote"]
    api.reject(buyer, combined_path + "/accept_delivery", consent(combined_quote), codes=(409,))
    incomplete_combined = consent(combined_quote, True)
    incomplete_combined["runtimeDecision"]["acknowledgedSteps"].pop()
    api.reject(buyer, combined_path + "/accept_delivery", incomplete_combined, codes=(409,))
    combined_quote = api.ok(buyer, combined_path + "/accept_delivery", consent(combined_quote, True))["quote"]
    combined_snapshot = copy.deepcopy(chain.snapshot(combined_quote))
    assert combined_snapshot["runtimeReportId"] == combined_report["id"]
    assert combined_snapshot["runtimeDeliveryDigest"] == combined_report["deliveryDigest"] and combined_snapshot["runtimeTargetId"] == "lab-coverage-fixed"
    assert combined_snapshot["runtimeAcknowledgedSteps"] == COMBINED_STEP_IDS
    assert {row["id"] for row in combined_snapshot["criteria"]} >= {"coverage-1", "coverage-2"}
    combined_quote = api.ok(seller, combined_endpoint, runtime_input(combined_quote))["quote"]
    assert_combined_report(combined_quote, files(), combined_delivery_id, [combined_report])
    combined_reports_saved = 2
    assert combined_quote["proof"]["delivery"]["runtimeReport"]["id"] != combined_report["id"]
    assert chain.snapshot(combined_quote) == combined_snapshot
    assert combined_quote["proof"]["collaboration"]["stage"] == "accepted"
    assert combined_quote["proof"]["paymentState"] == "unfunded" and not combined_quote.get("paypalOrderId")
    # Observe admission at the actual API/storage boundary, without a flaky
    # poll of the transient lease. Every success is a separate explicit start;
    # a rejected admission is never retried and must preserve all prior data.
    budget_observation = None
    for _ in range(20):
        before_budget_run = copy.deepcopy(combined_quote)
        code, response, _ = api.request(buyer, combined_endpoint, runtime_input(combined_quote))
        if code == 409:
            assert "saved evidence history is full" in str(response.get("error", "")).lower(), api.diagnostic(response)
            assert_unchanged(api, buyer, combined_quote_path, before_budget_run)
            saved_delivery = before_budget_run["proof"]["delivery"]
            retained_bytes = retained_history_bytes(saved_delivery)
            assert len(saved_delivery["runtimeHistory"]) < 20
            assert retained_bytes + 96 * 1024 > 256 * 1024
            assert retained_bytes + 48 * 1024 <= 256 * 1024
            assert "runtimeRun" not in saved_delivery
            budget_observation = {"retainedHistoryBytes": retained_bytes, "v4ReportReservationBytes": 96 * 1024,
                                  "oldReportReservationBytes": 48 * 1024, "historyLimitBytes": 256 * 1024,
                                  "reportsRetained": len(saved_delivery["runtimeHistory"]), "rejectedBeforeLease": True}
            break
        assert code == 200, (code, api.diagnostic(response))
        assert_combined_report(response["quote"], files(), combined_delivery_id, before_budget_run["proof"]["delivery"]["runtimeHistory"])
        combined_quote = response["quote"]
        combined_reports_saved += 1
        assert chain.snapshot(combined_quote) == combined_snapshot
        assert combined_quote["proof"]["paymentState"] == "unfunded" and not combined_quote.get("paypalOrderId")
    assert budget_observation is not None, "V4 runtime admission did not enforce the expanded report reservation"
    api.checked("V4 actual routes require both complete included sources and compatible targets; preserve31 unavailable steps, complete exception acknowledgements and frozen acceptance across supplemental runs; admission reserves96KiB before a new lease without eviction or payment")
    after = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert after["syntheticCalls"] == marker["syntheticCalls"]
    print(json.dumps({"result": "passed", "suite": "runtime-checks", "checks": api.checks, "runtimeReportsSaved": 7 + combined_reports_saved, "combinedV4ReportsSaved": combined_reports_saved, "combinedV4StepsPerReport": 31, "combinedV4SnapshotPreservedAcrossSupplement": True, "combinedV4BudgetAdmission": budget_observation, "capacityV3ReportsSaved": 2, "capacityV3StepsPerReport": 17, "capacitySnapshotPreservedAcrossSupplement": True, "basicV1ReportsSaved": 3, "businessV2ReportsSaved": 2, "concurrentStarts": {"attempts": 2, "successes": 1, "conflicts": 1}, "stepsPerReport": 8, "unavailablePerReport": 8, "v2StepsPerReport": 18, "v2UnavailablePerReport": 18, "acceptanceSnapshotPreservedAcrossSupplement": True, "v2AcceptanceSnapshotPreservedAcrossSupplement": True, "providerNetworkRequests": 0, "applicationModelCalls": 0, "syntheticProviderFetches": 0, "mutationRetries": 0, "scope": "Fresh isolated API/D1 with synthetic gateway identity headers; all outbound backend/provider fetches blocked. This verifies roles, storage, leases, version/acceptance binding, not actual backend protocol execution, real sign-ins, UI use, independent users or payment."}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
