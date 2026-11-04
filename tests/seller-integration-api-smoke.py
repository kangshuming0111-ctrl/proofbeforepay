"""Persisted staging applications on an owned, isolated Worker/D1 only.

Synthetic gateway identities are fixture inputs, not real sign-ins. All provider
and seller HTTP is blocked by the wrapper. No receipt, payment or browser
execution is claimed. No mutation is retried.
"""
import argparse
import copy
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("integration_journey_helpers", Path(__file__).with_name("project-journey-api-smoke.py"))
journey = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = journey
spec.loader.exec_module(journey)
chain, roles = journey.chain, journey.roles


def manifest():
    names = {"id": "enrolments.enrolment_ref", "testRunId": "enrolments.exercise_id", "marker": "enrolments.exercise_tag", "customer": "enrolments.participant_label", "email": "enrolments.participant_contact", "slot": "sessions.starts_at", "partySize": "enrolments.seat_count", "status": "enrolments.enrolment_state", "idempotencyKey": "enrolments.creation_command"}
    return {"version": 1, "native": {"stack": "python-sqlite", "schemaRevision": "independent-florist-v1", "deploymentRevision": "florist-fixed-v1", "receiptFields": names, "statusValues": {"confirmed": "active", "withdrawn": "cancelled"}}, "bridge": {"protocol": "pbp-seller-bridge-v1", "recipe": "booking-lifecycle-20-v1", "revision": "lifecycle-fixed-v1", "backendProtocol": "booking-lifecycle-http-v1"}, "deployment": {"frontendEntryUrl": "https://independent-seller.synthetic.example/workshop.html", "backendBaseUrl": "https://independent-seller.synthetic.example/pbp/", "allowedParentOrigin": "https://briefpay-kang-lab.blueheron8.chatgpt.site"}, "syntheticOnly": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["outboundFetch"] == "blocked"
    suffix = uuid4().hex
    buyer = roles.Actor("integration-operator-buyer", "operator@integration-synthetic.example")
    seller = roles.Actor("integration-seller-" + suffix, "seller@integration-synthetic.example")
    outsider = roles.Actor("integration-outsider-" + suffix, "outsider@integration-synthetic.example")
    path, quote_path = chain.create_shared(api, buyer, seller, journey.specification())
    quote = chain.quote_of(api.ok(seller, path + "/delivery", {"files": journey.files(), "expectedDeliveryId": None, "reviewRules": True}), "seller")
    delivery_id = quote["proof"]["delivery"]["id"]
    endpoint = path + "/integration-requests"
    seller_view = api.ok(seller, endpoint)
    assert seller_view["requests"] == [] and seller_view["canSubmit"] is True and seller_view["canReview"] is False
    assert api.ok(buyer, endpoint)["canReview"] is True
    payload = {"action": "submit", "deliveryId": delivery_id, "manifest": manifest()}
    api.reject(None, endpoint, codes=(401,))
    api.reject(None, endpoint, payload, codes=(401,))
    api.reject(outsider, endpoint, codes=(404,))
    api.reject(outsider, endpoint, payload, codes=(404,))
    api.reject(buyer, endpoint, payload, codes=(403,))
    api.reject(buyer, endpoint, payload, role="seller", codes=(403,))
    journey.custom_origin_reject(api, seller, endpoint, payload)
    for patch, codes in (({"deliveryId": "old-upload"}, (409,)), ({"approved": True}, (400,)), ({"manifest": {**manifest(), "syntheticOnly": False}}, (400,))):
        api.reject(seller, endpoint, {**payload, **patch}, codes=codes)
    api.checked("Authenticated project roles and CSRF govern application creation; buyer, outsider, forged role and unsafe manifest cannot submit")

    before = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = [f.result() for f in [pool.submit(api.request, seller, endpoint, payload) for _ in range(2)]]
    assert sorted(reply[0] for reply in replies) == [201, 409], replies
    view = api.ok(seller, endpoint)
    assert len(view["requests"]) == 1 and view["canSubmit"] is False
    first = copy.deepcopy(view["requests"][0])
    assert first["status"] == "requested" and first["revision"] == 1 and not first.get("registration")
    assert api.ok(seller, path + "/model-checks")["targets"] == []
    assert chain.quote_of(api.ok(buyer, quote_path), "buyer") == before
    api.checked("Concurrent duplicate submits atomically retain one durable request without changing quote, evidence or money; pending application grants no target")

    def decision(item, status, **extra):
        return {"action": "review", "requestId": item["id"], "expectedRevision": item["revision"], "status": status, "reason": "Synthetic operator explicitly reviewed the manifest.", **extra}

    api.reject(seller, endpoint, decision(first, "rejected"), codes=(403,))
    api.reject(seller, endpoint, decision(first, "rejected"), role="buyer", codes=(403,))
    journey.custom_origin_reject(api, buyer, endpoint, decision(first, "needs_changes"))
    returned_view = api.ok(buyer, endpoint, decision(first, "needs_changes"))
    returned = returned_view["requests"][0]
    assert returned["status"] == "needs_changes" and len(returned["history"]) == 2
    api.reject(buyer, endpoint, decision(first, "rejected"), codes=(409,))
    revised = manifest()
    revised["native"]["schemaRevision"] = "independent-florist-v2"
    next_view = api.ok(seller, endpoint, {**payload, "manifest": revised, "previousRequestId": first["id"]})
    second = next(item for item in next_view["requests"] if item["id"] != first["id"])
    assert second["previousRequestId"] == first["id"] and second["manifestDigest"] != first["manifestDigest"]
    assert next(item for item in next_view["requests"] if item["id"] == first["id"]) == returned
    approval = {"label": "Independent declared staging", "scenario": "fixed", "expiresAt": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")}
    api.reject(buyer, endpoint, decision(second, "approved", approval={**approval, "backendBaseUrl": "https://caller.synthetic.example/pbp/"}), codes=(400,))
    approved_view = api.ok(buyer, endpoint, decision(second, "approved", approval=approval))
    approved = next(item for item in approved_view["requests"] if item["id"] == second["id"])
    target = approved["registration"]
    assert target["frontendBundleDigest"] == approved["deliveryDigest"] and target["projectId"] == path.rsplit("/", 1)[-1]
    assert target["backendBaseUrl"] == revised["deployment"]["backendBaseUrl"]
    assert target["registrationRevision"] == "approval-2"
    assert [item["id"] for item in api.ok(seller, path + "/journey-checks")["targets"]] == [target["id"]]
    assert [item["id"] for item in api.ok(seller, path + "/model-checks")["targets"]] == [target["id"]]
    assert api.ok(seller, endpoint)["requests"] == approved_view["requests"]
    assert chain.quote_of(api.ok(buyer, quote_path), "buyer") == before
    api.checked("Only configured buyer-operator reviews; corrected application retains refusal, approval is exact-manifest/upload bound and survives readback in real target lists")

    api.ok(buyer, path + "/journey-checks", {"action": "confirm-plan", "deliveryId": delivery_id, "confirm": True})
    run = api.ok(buyer, path + "/model-checks", {"action": "run", "deliveryId": delivery_id, "targetId": target["id"], "previousReportId": None, "seed": 4, "confirm": True})
    assert run["model"]["report"]["registration"] == target
    assert run["model"]["report"]["result"]["outcome"] == "inconclusive"
    assert run["model"]["run"] is None
    assert run["model"]["report"]["trace"][0]["method"] == "GET"
    revoked_view = api.ok(buyer, endpoint, decision(approved, "rejected"))
    revoked = next(item for item in revoked_view["requests"] if item["id"] == second["id"])
    assert revoked["registration"] == target and len(revoked["history"]) == 3
    assert api.ok(buyer, path + "/model-checks")["targets"] == []
    api.reject(buyer, path + "/model-checks", {"action": "run", "deliveryId": delivery_id, "targetId": target["id"], "previousReportId": run["model"]["report"]["id"], "seed": 4, "confirm": True}, codes=(404,))
    kept = api.ok(buyer, quote_path)["quote"]
    assert kept["proof"]["delivery"]["modelReport"]["registration"] == target
    api.checked("Persisted target drives actual model admission; blocked metadata stays inconclusive, revocation disables future runs while historical frozen registration remains unchanged")

    # A new upload has no inherited target, while all application records remain.
    replacement = chain.quote_of(api.ok(seller, path + "/delivery", {"files": journey.files(True), "expectedDeliveryId": delivery_id, "reviewRules": True}), "seller")
    new_id = replacement["proof"]["delivery"]["id"]
    assert new_id != delivery_id
    stale = api.ok(seller, endpoint)
    assert all(item["stale"] for item in stale["requests"]) and stale["canSubmit"] is True
    assert api.ok(buyer, path + "/model-checks")["targets"] == []
    # Operator membership alone is insufficient on a different owner's project.
    other_buyer = roles.Actor("unconfigured-buyer-" + suffix, "other@integration-synthetic.example")
    other_path, _ = chain.create_shared(api, other_buyer, seller, journey.specification())
    other_quote = chain.quote_of(api.ok(seller, other_path + "/delivery", {"files": journey.files(), "expectedDeliveryId": None, "reviewRules": True}), "seller")
    other_endpoint = other_path + "/integration-requests"
    other_request = api.ok(seller, other_endpoint, {**payload, "deliveryId": other_quote["proof"]["delivery"]["id"]})["requests"][0]
    assert api.ok(other_buyer, other_endpoint)["canReview"] is False
    api.reject(other_buyer, other_endpoint, decision(other_request, "approved", approval=approval), codes=(403,))
    api.checked("Replacement exposes old requests as stale and requires fresh registration; a normal buyer owner still cannot become an operator")
    for index in range(1, 8):
        next_files = {"index.html": journey.files()["index.html"] + "<!--bounded-request-" + str(index) + "-->"}
        other_quote = chain.quote_of(api.ok(seller, other_path + "/delivery", {"files": next_files, "expectedDeliveryId": other_quote["proof"]["delivery"]["id"], "reviewRules": True}), "seller")
        api.ok(seller, other_endpoint, {**payload, "deliveryId": other_quote["proof"]["delivery"]["id"]})
    capped = api.ok(seller, other_endpoint)
    assert len(capped["requests"]) == capped["requestLimit"] == 8 and capped["canSubmit"] is False
    stable = copy.deepcopy(capped["requests"])
    api.reject(seller, other_endpoint, {**payload, "deliveryId": other_quote["proof"]["delivery"]["id"]}, codes=(409,))
    assert api.ok(seller, other_endpoint)["requests"] == stable
    api.checked("Eight applications bound persisted project metadata; capacity rejection retains all prior requests and decisions")
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == 0
    print(json.dumps({"passed": len(api.checks), "checks": api.checks, "outboundFetch": "blocked", "providerCalls": 0, "scope": "owned isolated Worker/D1, synthetic gateway identities; no actual accounts or browser attestation"}, indent=2))


if __name__ == "__main__":
    main()
