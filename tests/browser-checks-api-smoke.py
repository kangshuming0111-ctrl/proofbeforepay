"""Browser-observation API/D1 checks on the owned network-blocked local Worker.

Synthetic gateway identities and browser readings exercise authorization,
validation, persistence and concurrency. They are not actual browser actions,
real sign-ins, independent server verification or real Sandbox transactions.
Never point this at production. No mutation retries are performed.
"""
import argparse
import copy
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("browser_checks_local_roles", Path(__file__).with_name("role-demo-api-smoke.py"))
roles = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = roles
_spec.loader.exec_module(roles)

WIDTHS = (375, 900)
PAGES = ("contact.html", "docs/help.html", "index.html")


def quote_of(result, role):
    assert result["role"] == role, "Role must come from server membership"
    quote = result["quote"]
    assert quote["workflow"] == "proof-v1" and quote["paymentMode"] == "sandbox"
    assert not quote["proof"].get("demoRoleplay")
    roles.private_columns_absent(quote)
    if role == "seller":
        roles.seller_projection(quote)
    return quote


def browser_input(quote):
    # This is the fixed test agreement: two required pages, one extra actual
    # HTML page, and one local-link requirement. No client-defined plan/URL.
    rows = [dict(stepId=f"page:{width}:{file}", status="observed", kind="page",
                 stylesExpected=1, stylesLoaded=1, imagesExpected=0, imagesLoaded=0)
            for file in PAGES for width in WIDTHS]
    rows += [dict(stepId=f"link:{width}", status="observed", kind="link",
                  sourceVisible=True, sourceHitTarget=True, activated=True,
                  destinationMatched=True, targetVisible=True) for width in WIDTHS]
    return dict(deliveryId=quote["proof"]["delivery"]["id"],
                previousReportId=quote["proof"]["delivery"].get("browserChecks", {}).get("id"), readings=rows)


def report_of(quote):
    return quote["proof"]["delivery"]["browserChecks"]


def first_capture_stale_guards(api, owner, specification, files):
    """A held browser-tab vector must fail before any first-capture provider call."""
    single = copy.deepcopy(specification)
    single.update(collaborative=False, title="Synthetic single-user stale capture evidence")
    single.pop("paymentTesting", None)
    quote = quote_of(api.ok(owner, "/api/proofs", single), "buyer")
    path = "/api/proofs/" + quote["id"]
    api.ok(owner, path + "/approve", {})
    quote = quote_of(api.ok(owner, path + "/delivery", {"files": files, "expectedDeliveryId": None, "reviewRules": True}), "buyer")
    checkout = api.ok(owner, path + "/checkout", {})
    quote = quote_of(api.ok(owner, path + "/authorize", {"orderId": checkout["orderId"]}), "buyer")
    calls = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    consent = {"deliveryId": quote["proof"]["delivery"]["id"], "confirm": True, "manualChecks": ["mobile", "coverage-1", "coverage-2"], "expectedEvidence": roles.acceptance_basis(quote)}
    assert consent["expectedEvidence"]["browserReportId"] is None
    report_a = quote_of(api.ok(owner, path + "/browser-checks", browser_input(quote)), "buyer")
    for held in (consent, {**consent, "expectedEvidence": roles.acceptance_basis(report_a)}):
        if held["expectedEvidence"]["browserReportId"] is not None:
            report_b = browser_input(report_a)
            report_b["readings"][0]["stylesLoaded"] = 0
            quote_of(api.ok(owner, path + "/browser-checks", report_b), "buyer")
        code, rejected, _ = api.request(owner, path + "/capture", held)
        assert code == 409 and "evidence" in rejected.get("error", "").lower(), (code, api.diagnostic(rejected))
        quote = quote_of(api.ok(owner, "/api/quotes/" + quote["id"]), "buyer")
        assert quote["proof"]["paymentState"] == "authorized" and not quote["proof"].get("paymentOperation")
        assert not quote["proof"].get("acceptedDeliveryId") and not quote["proof"]["delivery"].get("acceptanceEvidence")
        assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == calls
    # The same route succeeds once the current vector is explicitly reviewed.
    paid = quote_of(api.ok(owner, path + "/capture", {**consent, "expectedEvidence": roles.acceptance_basis(quote)}), "buyer")
    snapshot_id = paid["proof"]["acceptedEvidenceSnapshotId"]
    assert paid["proof"]["paymentState"] == "captured" and snapshot_id
    calls = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    for patch, expected_status in (({}, 400), ({"acceptedEvidenceSnapshotId": "different-acceptance"}, 409)):
        code, _, _ = api.request(owner, path + "/capture", {"deliveryId": consent["deliveryId"], "confirm": True, **patch})
        assert code == expected_status
    assert quote_of(api.ok(owner, path + "/capture", {"deliveryId": consent["deliveryId"], "confirm": True, "acceptedEvidenceSnapshotId": snapshot_id}), "buyer") == paid
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == calls
    api.checked("First single-user capture rejects explicit null→A and A→B evidence vectors with409 and zero provider/consent changes; fresh review succeeds, while captured receipt replay requires its frozen snapshot and never calls the provider again")


def only_supplemental_changed(before, after):
    left, right = copy.deepcopy(before), copy.deepcopy(after)
    left["proof"]["delivery"].pop("browserChecks", None)
    old_history = left["proof"]["delivery"].pop("browserCheckHistory", [])
    right["proof"]["delivery"].pop("browserChecks", None)
    new_history = right["proof"]["delivery"].pop("browserCheckHistory", [])
    assert new_history[:-1] == old_history and len(new_history) == len(old_history) + 1
    assert new_history[-1]["id"] == after["proof"]["delivery"]["browserChecks"]["id"]
    old_audit = left["proof"].pop("audit")
    new_audit = right["proof"].pop("audit")
    assert left == right, "Browser observations changed source, rules, AI, collaboration, acceptance, manual consent or payment"
    assert new_audit[:-1] == old_audit and len(new_audit) == len(old_audit) + 1
    assert new_audit[-1]["kind"] == "browser_checked"
    assert new_audit[-1]["deliveryId"] == after["proof"]["delivery"]["id"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker.get("syntheticConfiguration") is True and marker.get("outboundFetch") == "blocked"
    run = uuid4().hex
    buyer = roles.Actor("browser-buyer-" + run, "buyer@browser-synthetic.example")
    seller = roles.Actor("browser-seller-" + run, "seller@browser-synthetic.example")
    outsider = roles.Actor("browser-outsider-" + run, "outsider@browser-synthetic.example")
    config = api.ok(buyer, "/api/config")
    assert config["aiMode"] == "demo" and config["paymentMode"] == "sandbox"
    specification = dict(mode="custom", collaborative=True, demoRoleplay=False, paymentTesting="collaborative-sandbox",
                         language="en", currency="AUD", title="Synthetic browser-observation case", amount="1.00",
                         summary="Isolated API/D1 test of client observations; no browser or external provider",
                         requiredPages=["index.html", "contact.html"], manualRequirements=[],
                         link=dict(from_="index.html", text="Book a call", to="contact.html#booking"))
    specification["link"]["from"] = specification["link"].pop("from_")
    specification["coverage"] = {"version": 1, "sourceText": specification["summary"], "confirmed": True, "decisions": [{"id": "coverage-1", "disposition": "include"}, {"id": "coverage-2", "disposition": "include"}]}
    quote = quote_of(api.ok(buyer, "/api/proofs", specification, role="seller"), "buyer")
    quote_id = quote["id"]
    path, quote_path = "/api/proofs/" + quote_id, "/api/quotes/" + quote_id
    endpoint = path + "/browser-checks"
    api.ok(buyer, path + "/approve", {}, role="seller")
    invitation = api.ok(buyer, path + "/invite", {"email": seller.email})["invitation"]
    quote_of(api.ok(seller, "/api/proof-invitations/accept", {"token": invitation["token"], "confirm": True, "sellerName": "Synthetic browser seller"}), "seller")
    head = '<!doctype html><html><head><title>Observed synthetic page</title><link rel="stylesheet" href="assets/site.css"></head><body>'
    files = {"index.html": head + '<a href="contact.html#booking">Book a call</a></body></html>',
             "contact.html": head + '<section id="booking">Consultation</section></body></html>',
             "docs/help.html": head.replace("assets/site.css", "../assets/site.css") + '<p>Help page</p></body></html>',
             "assets/site.css": "body{font-family:sans-serif}a{display:inline-block;padding:16px}"}
    quote_of(api.ok(seller, path + "/delivery", {"files": files, "expectedDeliveryId": None, "reviewRules": True}), "seller")
    quote = quote_of(api.ok(buyer, quote_path), "buyer")
    first_delivery = quote["proof"]["delivery"]["id"]
    payload = browser_input(quote)
    api.reject(None, endpoint, payload, role="buyer", codes=(401, 404))
    api.reject(outsider, endpoint, payload, role="buyer", codes=(404,))
    api.reject(outsider, quote_path, role="buyer", codes=(404,))
    api.checked("Unauthenticated/nonmember requests are rejected despite forged buyer headers; the case uses real local buyer/seller membership")

    baseline = copy.deepcopy(quote)
    malformed = []
    malformed.append(({**payload, "deliveryId": "old-delivery"}, (409,)))
    malformed.append(({**payload, "previousReportId": "old-report"}, (409,)))
    missing_previous = copy.deepcopy(payload)
    del missing_previous["previousReportId"]
    malformed.append((missing_previous, (409,)))
    malformed.append(({**payload, "readings": payload["readings"][:-1]}, (400,)))
    malformed.append(({**payload, "readings": [payload["readings"][0]] + payload["readings"][:-1]}, (400,)))
    for row_patch in ({"outcome": "expected_observation"}, {"file": "https://external.example/page"}, {"viewportWidth": 500},
                      {"stylesExpected": [1]}, {"stylesLoaded": 2}, {"imagesExpected": 101},
                      {"status": ["observed"]}, {"stepId": "page:500:index.html"}):
        value = copy.deepcopy(payload)
        value["readings"][0].update(row_patch)
        malformed.append((value, (400,)))
    for row_patch in ({"activated": [True]}, {"sourceVisible": "true"},
                      {"activated": False, "destinationMatched": True}, {"sourceVisible": False, "sourceHitTarget": True},
                      {"kind": "page"}, {"outcome": "expected_observation"}):
        value = copy.deepcopy(payload)
        value["readings"][-1].update(row_patch)
        malformed.append((value, (400,)))
    malformed.append(({**payload, "role": "seller"}, (400,)))
    malformed.append(({**payload, "reportedByRole": "seller"}, (400,)))
    unavailable = copy.deepcopy(payload)
    unavailable["readings"][0] = {"stepId": payload["readings"][0]["stepId"], "status": "unavailable", "reason": ["timeout"]}
    malformed.append((unavailable, (400,)))
    for value, codes in malformed:
        api.reject(buyer, endpoint, value, role="seller", codes=codes)
    assert quote_of(api.ok(buyer, quote_path), "buyer") == baseline
    api.checked("Version/report CAS guards, complete step/width coverage, duplicate steps, unsupported fields, forged outcomes, arrays, strict flags and impossible sequences reject without any saved change")

    saved = quote_of(api.ok(buyer, endpoint, payload, role="seller"), "buyer")
    report = report_of(saved)
    assert report["method"] == "client-browser-checks-v1" and report["deliveryId"] == first_delivery
    assert report.get("reportedByRole") == "buyer", "Stored provenance must use the server role, not the forged seller header"
    assert report["summary"] == dict(steps=8, observed=8, issues=0, unavailable=0)
    assert report["viewportHeight"] == 800
    assert [r["stepId"] for r in report["readings"]] == [r["stepId"] for r in payload["readings"]]
    expected_steps = [(f"page:{width}:{file}", "page", file, width) for file in PAGES for width in WIDTHS]
    expected_steps += [(f"link:{width}", "link", "index.html", width) for width in WIDTHS]
    assert [(r["stepId"], r["kind"], r["file"], r["viewportWidth"]) for r in report["readings"]] == expected_steps
    assert all(r["outcome"] == "expected_observation" for r in report["readings"])
    assert all(r["target"] == "contact.html#booking" and r["label"] == "Book a call" for r in report["readings"] if r["kind"] == "link")
    only_supplemental_changed(baseline, saved)
    api.reject(buyer, endpoint, payload, codes=(409,))
    unavailable = browser_input(saved)
    unavailable["readings"] = [{"stepId": row["stepId"], "status": "unavailable", "reason": "timeout"} for row in unavailable["readings"]]
    quote_of(api.ok(seller, endpoint, unavailable, role="buyer"), "seller")
    current = quote_of(api.ok(buyer, quote_path), "buyer")
    only_supplemental_changed(saved, current)
    assert report_of(current)["summary"] == dict(steps=8, observed=0, issues=0, unavailable=8)
    assert report_of(current).get("reportedByRole") == "seller"
    assert all(row["outcome"] == "unavailable" for row in report_of(current)["readings"])
    api.checked("Both members can save with server-derived roles; saved plan labels, summary and ordering are server-derived, and unavailable readings never become matching observations")

    race_before = copy.deepcopy(current)
    race_a, race_b = browser_input(current), browser_input(current)
    race_b["readings"][0]["stylesLoaded"] = 0
    barrier = Barrier(2)
    def race_save(actor, value, requested_role):
        local = roles.LocalAPI(args.url)
        barrier.wait(timeout=5)
        return local.request(actor, endpoint, value, role=requested_role)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(race_save, buyer, race_a, "seller"), executor.submit(race_save, seller, race_b, "buyer")]
        races = [future.result(timeout=45) for future in futures]
    assert sorted(code for code, _, _ in races) == [200, 409]
    winning = next(result for code, result, _ in races if code == 200)
    current = quote_of(api.ok(buyer, quote_path), "buyer")
    only_supplemental_changed(race_before, current)
    assert report_of(current)["id"] == winning["quote"]["proof"]["delivery"]["browserChecks"]["id"]
    assert report_of(current).get("reportedByRole") == winning["role"]
    assert report_of(current)["summary"]["issues"] in (0, 1)
    api.checked("Concurrent writes with the same predecessor yield one persisted winner and one 409; one audit event is appended without a lost update")

    archived_report = copy.deepcopy(report_of(current))
    api.ok(seller, path + "/submit_delivery", {"deliveryId": first_delivery, "note": "First synthetic version for revision"})
    api.ok(buyer, path + "/return", {"deliveryId": first_delivery, "feedback": [{"criterionId": "mobile", "comment": "Please supply the revised package."}]})
    revised = {name: data.replace("Observed synthetic page", "Revised synthetic page") for name, data in files.items()}
    quote_of(api.ok(seller, path + "/delivery", {"files": revised, "expectedDeliveryId": first_delivery, "reviewRules": True}), "seller")
    current = quote_of(api.ok(buyer, quote_path), "buyer")
    second_delivery = current["proof"]["delivery"]["id"]
    assert second_delivery != first_delivery and "browserChecks" not in current["proof"]["delivery"]
    archived = api.ok(buyer, path + "/versions/" + first_delivery)["version"]
    assert archived["delivery"]["browserChecks"] == archived_report
    assert api.ok(seller, path + "/versions/" + first_delivery)["version"]["delivery"]["browserChecks"] == archived_report
    api.reject(buyer, endpoint, {**browser_input(current), "deliveryId": first_delivery}, codes=(409,))
    api.reject(buyer, endpoint, {**browser_input(current), "previousReportId": archived_report["id"]}, codes=(409,))
    api.checked("Replacement starts with no inherited browser report; both members can read the old exact-version report and old report/version IDs cannot save against the replacement")

    api.ok(seller, path + "/submit_delivery", {"deliveryId": second_delivery, "note": "Revised synthetic delivery"})
    # Send explicit caller-observed vectors through request(), bypassing the
    # helper that fills missing fields. A failure must come from a changed
    # evidence vector, not missing submission, human checks or authorization.
    marker_before_stale = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    null_basis = roles.acceptance_basis(current)
    assert null_basis["browserReportId"] is None
    report_a_quote = quote_of(api.ok(seller, endpoint, browser_input(current)), "seller")
    stale_null = {"deliveryId": second_delivery, "confirm": True, "manualChecks": ["mobile", "coverage-1", "coverage-2"], "expectedEvidence": null_basis}
    code, rejected, _ = api.request(buyer, path + "/accept_delivery", stale_null)
    assert code == 409 and "evidence" in rejected.get("error", "").lower(), (code, api.diagnostic(rejected))
    current = quote_of(api.ok(buyer, quote_path), "buyer")
    assert current == report_a_quote and current["proof"]["collaboration"]["stage"] == "submitted"
    assert not current["proof"].get("acceptedDeliveryId") and not current["proof"]["delivery"].get("acceptanceEvidence")
    stale_a = {**stale_null, "expectedEvidence": roles.acceptance_basis(current)}
    assert stale_a["expectedEvidence"]["browserReportId"] == report_of(current)["id"]

    before = copy.deepcopy(current)
    mismatch = browser_input(current)
    mismatch["readings"][0]["stylesLoaded"] = 0
    mismatch["readings"][-1]["targetVisible"] = False
    quote_of(api.ok(seller, endpoint, mismatch), "seller")
    code, rejected, _ = api.request(buyer, path + "/accept_delivery", stale_a)
    assert code == 409 and "evidence" in rejected.get("error", "").lower(), (code, api.diagnostic(rejected))
    current = quote_of(api.ok(buyer, quote_path), "buyer")
    only_supplemental_changed(before, current)
    assert report_of(current)["summary"] == dict(steps=8, observed=8, issues=2, unavailable=0)
    assert current["proof"].get("manualChecks") is None and current["proof"].get("acceptedDeliveryId") is None
    assert current["proof"]["paymentState"] == "unfunded"
    assert report_of(current)["id"] != stale_a["expectedEvidence"]["browserReportId"]
    assert not current["proof"]["delivery"].get("acceptanceEvidence")
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == marker_before_stale
    api.checked("Actual acceptance routes reject caller-observed null→reportA and reportA→reportB vectors with409, preserve submitted state with no frozen acceptance, and make zero provider calls")
    api.checked("Resource shortfalls and an invisible reached target derive mismatches but never tick manual checks, accept delivery or fund payment")

    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == marker["syntheticCalls"]
    api.ok(buyer, path + "/accept_delivery", {"deliveryId": second_delivery, "confirm": True, "manualChecks": ["mobile", "coverage-1", "coverage-2"]})
    checkout = api.ok(buyer, path + "/checkout", {})
    api.ok(buyer, path + "/authorize", {"orderId": checkout["orderId"]})
    api.ok(buyer, path + "/capture", {"deliveryId": second_delivery, "confirm": True, "manualChecks": ["mobile", "coverage-1", "coverage-2"]})
    current = quote_of(api.ok(buyer, quote_path), "buyer")
    assert current["status"] == "paid" and current["proof"]["paymentState"] == "captured"
    payment_marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    for actor, role, forged_role in ((buyer, "buyer", "seller"), (seller, "seller", "buyer")):
        before = copy.deepcopy(current)
        response = api.ok(actor, endpoint, browser_input(current), role=forged_role)
        quote_of(response, role)
        current = quote_of(api.ok(buyer, quote_path), "buyer")
        only_supplemental_changed(before, current)
        assert current["proof"]["acceptedDeliveryId"] == second_delivery and current["proof"]["manualChecks"] == ["mobile", "coverage-1", "coverage-2"]
        assert current["proof"]["paymentState"] == "captured" and current["status"] == "paid"
        assert report_of(current).get("reportedByRole") == role
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == payment_marker["syntheticCalls"]
    api.checked("Buyer and seller can append supplemental checks after controlled capture while acceptance, manual consent, buyer receipt and provider state stay byte-for-byte unchanged")

    versions = api.ok(buyer, path + "/versions")["versions"]
    assert next(v for v in versions if v["delivery"]["id"] == first_delivery)["delivery"]["browserChecks"] == archived_report
    assert next(v for v in versions if v["delivery"]["id"] == second_delivery)["delivery"]["browserChecks"] == report_of(current)
    assert all(not any(key in version["delivery"] for key in ("files", "browserCheckHistory", "layoutHistory", "acceptanceEvidence")) for version in versions)
    full_current = api.ok(buyer, path + "/versions/" + second_delivery)["version"]
    assert full_current["delivery"]["browserCheckHistory"] == current["proof"]["delivery"]["browserCheckHistory"]
    assert full_current["delivery"]["acceptanceEvidence"] == current["proof"]["delivery"]["acceptanceEvidence"]
    api.reject(outsider, path + "/versions/" + first_delivery, codes=(404,))
    api.checked("Persisted old/current version listings retain their own reports and unrelated identities cannot retrieve archives")
    first_capture_stale_guards(api, buyer, specification, files)
    payment_marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    print(json.dumps(dict(result="passed", suite="browser-checks", checks=api.checks,
                          rejectedMalformedPayloads=len(malformed), concurrentStatuses=sorted(code for code, _, _ in races),
                          providerNetworkRequests=0, browserCheckProviderFetches=0,
                          syntheticProviderFetches=payment_marker["syntheticCalls"] - marker["syntheticCalls"],
                          scope="Owned isolated Worker and fresh D1; synthetic identities/readings/provider responses only; no actual browser, sign-ins or Sandbox funds"), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
