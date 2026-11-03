"""Project journey routes, roles, durable evidence, revision and mock payment.

Only the owned loopback synthetic Worker is supported. No browser was operated:
the empty observations deliberately record unavailable browser work. All
outbound fetch is blocked; gateway identities and payment responses are fixtures.
Two phases let an operator-only test registry reference an API-generated project
without editing D1 records or accepting a caller-controlled production URL.
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
from urllib.error import HTTPError
from urllib.request import Request

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("project_journey_chain_helpers", Path(__file__).with_name("chain-coverage-api-smoke.py"))
chain = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = chain
_spec.loader.exec_module(chain)
roles = chain.roles
STEPS = ["meta", "create", "create_readback", "cancel", "cancel_readback", "rebook", "fill", "full_readback", "cancel_repeat", "cancel_repeat_readback", "reject_extra", "source_create", "move_full", "move_full_readback", "move_free", "move_free_readback", "response_loss_create", "response_loss_readback", "response_loss_retry", "final_merchant_readback"]
SUMMARY = "Each booking accepts at most 6 people.\nEach time slot accepts at most 8 guests in total."


def files(revised=False):
    return {"index.html": "<!doctype html><html><head><title>Synthetic journey acceptance</title></head><body><h1>Booking handoff</h1><p>" + ("Revised source version." if revised else "Original source version.") + "</p></body></html>"}


def digest(value):
    return hashlib.sha256(json.dumps(sorted(value.items()), ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def specification():
    return {"mode": "custom", "collaborative": True, "demoRoleplay": False, "paymentTesting": "collaborative-sandbox", "language": "en", "currency": "AUD", "title": "Synthetic project journey API", "summary": SUMMARY, "amount": "1.00", "requiredPages": ["index.html"], "manualRequirements": [], "coverage": {"version": 1, "sourceText": SUMMARY, "confirmed": True, "decisions": [{"id": "coverage-1", "disposition": "include"}, {"id": "coverage-2", "disposition": "include"}]}}


def custom_origin_reject(api, actor, path, payload):
    headers = {"Content-Type": "application/json", "Origin": "https://cross-origin.synthetic.example", "sec-fetch-site": "cross-site", "oai-authenticated-user-id": actor.identifier, "oai-authenticated-user-email": actor.email}
    request = Request(api.origin + path, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        response = api.opener.open(request, timeout=40)
    except HTTPError as error:
        response = error
    with response:
        assert response.status == 403, (path, response.status)
        response.read()


def money_unchanged(quote):
    assert quote["proof"]["paymentState"] == "unfunded"
    assert not any(quote.get(key) for key in ("paypalOrderId", "paypalApprovalUrl", "captureId", "paidAt"))
    assert not quote["proof"].get("paymentOperation")


def registration(project_id, revised=False):
    return {"id": "seller-journey-v2" if revised else "seller-journey-v1", "label": "Synthetic declared staging " + ("v2" if revised else "v1"), "projectId": project_id, "registrationRevision": "synthetic-r1", "protocol": "booking-lifecycle-http-v1", "recipe": "booking-lifecycle-20-v1", "frontendEntryUrl": "https://seller-journey.synthetic.example/seller-lifecycle.html", "backendBaseUrl": "https://seller-journey.synthetic.example/pbp/", "deploymentRevision": "lifecycle-fixed-v1", "frontendBundleDigest": digest(files(revised)), "scenario": "fixed", "expiresAt": "2099-01-01T00:00:00.000Z", "testOnly": True, "provenance": "operator-approved-declaration"}


def listed_projection(api, actor, project_id):
    listing = api.ok(actor, "/api/proofs")
    quote = next(row for row in listing["quotes"] if row["id"] == project_id)
    delivery = quote["proof"]["delivery"]
    assert not any(key in delivery for key in ("files", "journeyRun", "journeyReport", "journeyHistory", "acceptanceEvidence"))
    roles.private_columns_absent(quote)
    return quote


def seed(api, state_file):
    run = uuid4().hex
    buyer = roles.Actor("journey-api-buyer-" + run, "buyer@journey-api-synthetic.example")
    seller = roles.Actor("journey-api-seller-" + run, "seller@journey-api-synthetic.example")
    outsider = roles.Actor("journey-api-outsider-" + run, "outsider@journey-api-synthetic.example")
    path, quote_path = chain.create_shared(api, buyer, seller, specification())
    quote = chain.quote_of(api.ok(seller, path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True}), "seller")
    delivery_id = quote["proof"]["delivery"]["id"]
    endpoint = path + "/journey-checks"
    initial = api.ok(buyer, endpoint)
    assert initial["plan"] is None and initial["targets"] == [] and initial["run"] is None and initial["report"] is None
    assert api.ok(seller, endpoint) == initial
    api.reject(outsider, endpoint, codes=(404,))
    confirm = {"action": "confirm-plan", "deliveryId": delivery_id, "confirm": True}
    api.reject(seller, endpoint, confirm, role="buyer", codes=(403,))
    api.reject(outsider, endpoint, confirm, codes=(404,))
    for patch, codes in [({"confirm": False}, (400,)), ({"deliveryId": "stale-delivery"}, (409,)), ({"maxPartySize": 7}, (400,)), ({"source": "not a customer source"}, (400,))]:
        api.reject(buyer, endpoint, {**confirm, **patch}, codes=codes)
    custom_origin_reject(api, buyer, endpoint, confirm)
    assert chain.quote_of(api.ok(buyer, quote_path), "buyer") == quote
    quote = chain.quote_of(api.ok(buyer, endpoint, confirm, role="seller"), "buyer")
    plan = copy.deepcopy(quote["proof"]["delivery"]["journeyPlan"])
    assert plan["provenance"] == "buyer-confirmed-technical-agreement" and plan["maxPartySize"] == 6 and plan["maxGuestsPerSlot"] == 8
    assert "source" not in plan and "criterionId" not in plan
    assert chain.quote_of(api.ok(buyer, endpoint, confirm), "buyer")["proof"]["delivery"]["journeyPlan"] == plan
    api.checked("Actual API membership overrides forged perspective headers; only the buyer explicitly confirms an additional technical agreement, preserving original requirements and unfunded payment state")

    start = {"action": "start", "deliveryId": delivery_id, "previousReportId": None, "targetId": "unregistered-seller", "confirm": True}
    api.reject(buyer, endpoint, start, codes=(404,))
    before_ai = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    ai = path + "/journey-plan-suggestions"
    api.reject(None, ai, {"confirm": True}, codes=(401,))
    api.reject(outsider, ai, {"confirm": True}, codes=(404,))
    api.reject(seller, ai, {"confirm": True}, role="buyer", codes=(403,))
    for payload in ({"confirm": False}, {"confirm": True, "role": "buyer"}, {"confirm": True, "summary": "Client replacement"}):
        api.reject(buyer, ai, payload, codes=(400,))
    custom_origin_reject(api, buyer, ai, {"confirm": True})
    api.reject(buyer, ai, {"confirm": True}, codes=(409,))
    assert chain.quote_of(api.ok(buyer, quote_path), "buyer") == before_ai
    money_unchanged(before_ai)
    api.checked("No registry means no journey start; AI recommendation guards authenticate buyer/CSRF/source and fail truthfully with no provider key, without changing the project")
    state = {"buyer": buyer.__dict__, "seller": seller.__dict__, "outsider": outsider.__dict__, "path": path, "quotePath": quote_path, "projectId": quote["id"], "deliveryId": delivery_id, "plan": plan, "registry": [registration(quote["id"]), registration(quote["id"], True)], "checks": api.checks}
    state_file.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    return {"result": "seeded", "suite": "project-journey", "checks": api.checks, "registeredSyntheticTargets": 0, "sourceDigest": digest(files()), "outboundFetch": "blocked"}


def run_to_report(api, actor, endpoint, delivery_id, target_id, previous_report_id=None, abort=False):
    started = api.ok(actor, endpoint, {"action": "start", "deliveryId": delivery_id, "previousReportId": previous_report_id, "targetId": target_id, "confirm": True})
    run = started["journey"]["run"]
    assert run["deliveryId"] == delivery_id and run["registration"]["id"] == target_id
    if not abort:
        for step in STEPS:
            api.ok(actor, endpoint, {"action": "observe", "deliveryId": delivery_id, "runId": run["id"], "stepId": step})
    final = api.ok(actor, endpoint, {"action": "abort" if abort else "finish", "deliveryId": delivery_id, "runId": run["id"]})
    assert final["journey"]["run"] is None
    report = final["journey"]["report"]
    assert report["deliveryId"] == delivery_id and report["runId"] == run["id"] and report["browserAttestation"] is False
    assert report["observer"] == "client-controlled-browser-with-server-readbacks"
    assert report["deliveryDigest"] == run["deliveryDigest"] == report["registration"]["frontendBundleDigest"]
    evaluation = final["journey"]["evaluation"]
    assert evaluation["summary"] == {"steps": 20, "observed": 0, "issues": 0, "unavailable": 20}
    assert evaluation["scope"]["serverReadbacks"] is True and evaluation["scope"]["browserWritesAttested"] is False and evaluation["scope"]["privateDeliveryLinked"] is True
    assert [row["id"] for row in report["input"]["observations"]] == STEPS
    assert all(not row.get("ui") for row in report["input"]["observations"])
    return final, report


def registered(api, state_file):
    state = json.loads(state_file.read_text(encoding="utf-8"))
    buyer, seller, outsider = [roles.Actor(**state[key]) for key in ("buyer", "seller", "outsider")]
    path, quote_path, delivery_id = state["path"], state["quotePath"], state["deliveryId"]
    endpoint = path + "/journey-checks"
    api.checks.extend(state["checks"])
    quote = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    assert quote["proof"]["delivery"]["journeyPlan"] == state["plan"]
    view = api.ok(buyer, endpoint)
    assert len(view["targets"]) == 1 and view["targets"][0]["id"] == "seller-journey-v1"
    assert set(view["targets"][0]) == {"id", "label", "registrationRevision", "expiresAt"}
    start = {"action": "start", "deliveryId": delivery_id, "previousReportId": None, "targetId": "seller-journey-v1", "confirm": True}
    for patch, codes in [({"confirm": False}, (409,)), ({"deliveryId": "stale-delivery"}, (409,)), ({"previousReportId": "stale-report"}, (409,)), ({"targetId": "seller-journey-v2"}, (409,)), ({"url": "https://caller.synthetic.example/"}, (400,)), ({"deliveryDigest": "f" * 64}, (400,))]:
        api.reject(buyer, endpoint, {**start, **patch}, codes=codes)
    custom_origin_reject(api, buyer, endpoint, start)
    assert chain.quote_of(api.ok(buyer, quote_path), "buyer") == quote
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: api.request(buyer, endpoint, start), range(2)))
    assert sorted(row[0] for row in results) == [200, 409], [(row[0], api.diagnostic(row[1])) for row in results]
    active = api.ok(buyer, endpoint)["run"]
    run_id = active["id"]
    assert active["deliveryDigest"] == digest(files())
    assert chain.quote_of(api.ok(buyer, quote_path), "buyer")["proof"]["delivery"]["journeyEvidenceReservation"]["runId"] == run_id
    for actor in (buyer, seller):
        listed_projection(api, actor, state["projectId"])
    api.reject(outsider, endpoint, codes=(404,))
    api.reject(seller, endpoint, {"action": "observe", "deliveryId": delivery_id, "runId": run_id, "stepId": "meta"}, role="buyer", codes=(403,))
    for payload, codes in [({"action": "observe", "deliveryId": delivery_id, "runId": run_id, "stepId": "create"}, (409,)), ({"action": "observe", "deliveryId": delivery_id, "runId": run_id, "stepId": "meta", "merchant": {"status": 200}}, (400,)), ({"action": "observe", "deliveryId": delivery_id, "runId": run_id, "stepId": "meta", "ui": {"status": "success"}}, (400,)), ({"action": "finish", "deliveryId": delivery_id, "runId": run_id}, (409,)), ({"action": "abort", "deliveryId": delivery_id, "runId": "stale-run"}, (409,))]:
        api.reject(buyer, endpoint, payload, codes=codes)
    api.reject(seller, path + "/delivery", {"files": files(True), "expectedDeliveryId": delivery_id, "reviewRules": True}, codes=(409,))
    for step in STEPS:
        api.ok(buyer, endpoint, {"action": "observe", "deliveryId": delivery_id, "runId": run_id, "stepId": step})
    final = api.ok(buyer, endpoint, {"action": "finish", "deliveryId": delivery_id, "runId": run_id})
    first = copy.deepcopy(final["journey"]["report"])
    assert final["journey"]["evaluation"]["summary"] == {"steps": 20, "observed": 0, "issues": 0, "unavailable": 20}
    assert first["input"]["observations"][0]["unavailableReason"] == "server_read_unavailable"
    assert "journeyRun" not in final["quote"]["proof"]["delivery"]
    assert final["quote"]["proof"]["delivery"]["journeyEvidenceReservation"]["reportBytes"] == 0
    assert "runId" not in final["quote"]["proof"]["delivery"]["journeyEvidenceReservation"]
    for action in ("observe", "finish", "abort"):
        api.reject(buyer, endpoint, {"action": action, "deliveryId": delivery_id, "runId": run_id, **({"stepId": "meta"} if action == "observe" else {})}, codes=(409,))
    assert api.ok(buyer, endpoint)["report"] == first
    money_unchanged(final["quote"])
    api.checked("Operator-only project/upload registry gates target discovery; two concurrent starts yield one lease; wrong role/order/injected GET evidence/stale run and replacement reject; twenty actual route observations save a truthful unavailable terminal report and release only its matching reservation")

    api.ok(seller, path + "/submit_delivery", {"deliveryId": delivery_id, "note": "Synthetic source for explicit unavailable-check review"})
    technical_feedback = {"criterionId": "journey-agreement", "journeyReportId": first["id"], "comment": "Revise the source against this separately confirmed technical agreement before the next explicit journey review. These unavailable observations do not automatically fail the original clauses."}
    before_return = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    api.reject(buyer, path + "/return", {"deliveryId": delivery_id, "feedback": [{**technical_feedback, "journeyReportId": "wrong-current-report"}]}, codes=(409,))
    api.reject(buyer, path + "/return", {"deliveryId": delivery_id, "feedback": [{"criterionId": "coverage-1", "journeyReportId": first["id"], "comment": "Attempt to misattribute technical observations to an original clause."}]}, codes=(400,))
    assert chain.quote_of(api.ok(buyer, quote_path), "buyer") == before_return
    returned = chain.quote_of(api.ok(buyer, path + "/return", {"deliveryId": delivery_id, "feedback": [technical_feedback]}), "buyer")
    saved_feedback = copy.deepcopy(returned["proof"]["collaboration"]["feedback"][-1])
    assert saved_feedback["criterionId"] == "journey-agreement" and saved_feedback["journeyReportId"] == first["id"] and saved_feedback["deliveryId"] == delivery_id
    assert returned["proof"]["criteria"] == before_return["proof"]["criteria"] and returned["proof"]["delivery"]["evidence"] == before_return["proof"]["delivery"]["evidence"]
    assert "source" not in saved_feedback and not any(row["id"] == "journey-agreement" for row in returned["proof"]["criteria"])
    replaced = chain.quote_of(api.ok(seller, path + "/delivery", {"files": files(True), "expectedDeliveryId": delivery_id, "reviewRules": True}), "seller")
    new_id = replaced["proof"]["delivery"]["id"]
    assert new_id != delivery_id
    assert not any(key in replaced["proof"]["delivery"] for key in ("journeyPlan", "journeyRun", "journeyReport", "journeyHistory", "acceptanceEvidence"))
    historical = api.ok(buyer, path + "/versions/" + delivery_id)["version"]
    assert historical["delivery"]["journeyReport"] == first and historical["delivery"]["journeyHistory"] == [first]
    assert historical["feedback"][-1] == saved_feedback and replaced["proof"]["collaboration"]["feedback"][-1] == saved_feedback
    assert [row["id"] for row in api.ok(seller, endpoint)["targets"]] == ["seller-journey-v2"]
    api.ok(buyer, endpoint, {"action": "confirm-plan", "deliveryId": new_id, "confirm": True})
    api.reject(buyer, endpoint, {**start, "deliveryId": new_id}, codes=(409,))
    api.reject(buyer, endpoint, {"action": "abort", "deliveryId": new_id, "runId": run_id}, codes=(409,))
    final, report_a = run_to_report(api, buyer, endpoint, new_id, "seller-journey-v2")
    assert report_a["deliveryDigest"] == digest(files(True)) and report_a["deliveryDigest"] != first["deliveryDigest"]
    assert api.ok(buyer, path + "/versions/" + delivery_id)["version"] == historical
    api.checked("Technical feedback rejects a wrong report and original-clause misattribution, preserves exact report-linked comments without changing original findings, then seller replacement archives v1 and feedback intact, removes v1 checks from v2 and rejects the old registration digest")

    quote = chain.quote_of(api.ok(seller, path + "/submit_delivery", {"deliveryId": new_id, "note": "Synthetic corrected source, no successful browser observations asserted"}), "seller")
    accept = {"deliveryId": new_id, "confirm": True, "manualChecks": chain.human_checks(quote)}
    api.reject(buyer, path + "/accept_delivery", accept, codes=(400, 409))
    decision = {"reportId": report_a["id"], "acknowledgeClientObservation": True, "acknowledgedSteps": STEPS, "exceptionReason": "Synthetic reviewer explicitly accepts that all browser and backend results are unavailable in this outbound-blocked test; no successful behavior is claimed."}
    for patch in ({"acknowledgeClientObservation": False}, {"reportId": first["id"]}, {"acknowledgedSteps": STEPS[:-1]}, {"exceptionReason": "short"}):
        api.reject(buyer, path + "/accept_delivery", {**accept, "journeyDecision": {**decision, **patch}}, codes=(400, 409))
    api.reject(seller, path + "/accept_delivery", {**accept, "journeyDecision": decision}, role="buyer", codes=(403,))
    accepted = chain.quote_of(api.ok(buyer, path + "/accept_delivery", {**accept, "journeyDecision": decision}), "buyer")
    frozen = copy.deepcopy(chain.snapshot(accepted))
    assert frozen["journeyReportId"] == report_a["id"] and frozen["journeyDeliveryDigest"] == report_a["deliveryDigest"] and frozen["journeyPlanDigest"] == report_a["planDigest"]
    assert frozen["journeyClientObservationAcknowledged"] is True and frozen["journeyAcknowledgedSteps"] == STEPS and frozen["journeyExceptionReason"] == decision["exceptionReason"]
    money_unchanged(accepted)
    supplement, report_b = run_to_report(api, seller, endpoint, new_id, "seller-journey-v2", report_a["id"], abort=True)
    assert report_b["id"] != report_a["id"] and supplement["quote"]["proof"]["delivery"]["journeyHistory"] == [report_a, report_b]
    assert chain.snapshot(supplement["quote"]) == frozen
    assert supplement["quote"]["proof"]["collaboration"]["acceptance"] == accepted["proof"]["collaboration"]["acceptance"]
    for actor in (buyer, seller):
        current = chain.quote_of(api.ok(actor, quote_path), "buyer" if actor == buyer else "seller")
        assert chain.snapshot(current) == frozen
        assert current["proof"]["delivery"]["journeyHistory"] == [report_a, report_b]
        listed_projection(api, actor, state["projectId"])
        versions = api.ok(actor, path + "/versions")["versions"]
        assert len(versions) == 2
        for row in versions:
            assert not any(key in row["delivery"] for key in ("files", "journeyRun", "journeyReport", "journeyHistory", "acceptanceEvidence"))
    api.checked("Incomplete or stale journey consent cannot accept; explicit per-step unknown exceptions freeze reportA/digest/plan/registration, while member-saved aborted reportB stays supplemental across refresh and authorized reads; list projections omit evidence payloads")

    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == 0
    checkout = api.ok(buyer, path + "/checkout", {})
    api.ok(buyer, path + "/authorize", {"orderId": checkout["orderId"]})
    api.reject(seller, path + "/capture", accept, role="buyer", codes=(403,))
    paid = chain.quote_of(api.ok(buyer, path + "/capture", accept), "buyer")
    assert paid["status"] == "paid" and paid["proof"]["paymentState"] == "captured"
    assert paid["proof"]["acceptedDeliveryId"] == new_id and paid["proof"]["acceptedEvidenceSnapshotId"] == frozen["id"] and chain.snapshot(paid) == frozen
    assert paid["proof"]["delivery"]["journeyReport"]["id"] == report_b["id"]
    calls = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    assert calls > 0 and chain.quote_of(api.ok(buyer, path + "/capture", accept), "buyer") == paid
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == calls
    api.reject(buyer, endpoint, {"action": "start", "deliveryId": new_id, "previousReportId": report_b["id"], "targetId": "seller-journey-v2", "confirm": True}, codes=(409,))
    api.checked("No provider operation occurs before separate buyer checkout/authorization/capture; mock receipt binds exact v2 acceptance snapshotA despite latest reportB, replay does not repeat capture and terminal payment blocks another journey")
    return {"result": "passed", "suite": "project-journey", "checks": api.checks, "journeyReportsSaved": 3, "canonicalStepsPerReport": 20, "observedPerReport": 0, "unavailablePerReport": 20, "simulatedBrowserClaims": "none; canonical empty observations through actual API", "actualBrowserInteractions": False, "serverReadbacks": "attempted but blocked by the synthetic wrapper", "registration": "synthetic HTTPS declarations in cloned local config only", "concurrentStarts": {"attempts": 2, "successes": 1, "conflicts": 1}, "frozenAcceptanceAcrossSupplement": True, "nativeSellerState": "not tested here; separate native SQL suite", "payment": "local mocked provider only; no PayPal network or funds", "mockProviderCalls": calls, "externalAI": "not called; missing-key/authorization routes tested"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--phase", choices=("seed", "registered"), required=True)
    parser.add_argument("--state", required=True, type=Path)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker["syntheticConfiguration"] is True and marker["outboundFetch"] == "blocked"
    config = api.ok(None, "/api/config")
    assert config["aiMode"] == "demo" and config["paymentMode"] == "sandbox"
    result = seed(api, args.state) if args.phase == "seed" else registered(api, args.state)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
