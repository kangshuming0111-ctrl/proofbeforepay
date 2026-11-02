"""Coverage -> explicit acceptance evidence -> supplemental history -> mock receipt.

Run only through the owned loopback Worker with fixed synthetic configuration
and blocked outbound fetch. Identities, browser readings and payment responses
are fixtures, not actual sign-ins, browser actions or PayPal Sandbox funds.
No mutation is retried after an unexpected result.
"""
import argparse
import copy
import importlib.util
import json
import sys
from pathlib import Path
from uuid import uuid4

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("coverage_chain_roles", Path(__file__).with_name("role-demo-api-smoke.py"))
roles = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = roles
_spec.loader.exec_module(roles)

SUMMARY = "Display the menu; Show opening hours; Show the address; Explain appointment policy; Provide Chinese and English pages."
ORIGINAL_GROUPS = ["Display the menu;", "Show opening hours;", "Show the address;", "Explain appointment policy;", "Provide Chinese and English pages."]
PAGES = ["contact.html", "en/menu.html", "index.html"]
LINKS = [{"from": "index.html", "text": "English menu", "to": "en/menu.html"},
         {"from": "en/menu.html", "text": "中文菜单", "to": "index.html#menu"},
         {"from": "en/menu.html", "text": "Appointment details", "to": "contact.html#booking"}]
WIDTHS = (375, 900)


def coverage():
    return {"version": 1, "sourceText": SUMMARY, "confirmed": True,
            "decisions": [{"id": f"coverage-{index + 1}", "disposition": "include"} for index in range(5)]}


def spec(title, with_links=False):
    value = {"mode": "custom", "collaborative": True, "demoRoleplay": False,
             "paymentTesting": "collaborative-sandbox", "language": "en", "currency": "AUD",
             "title": title, "summary": SUMMARY, "amount": "1.00",
             "requiredPages": ["index.html"], "manualRequirements": [], "coverage": coverage()}
    if with_links:
        value.update(requiredPages=["index.html", "en/menu.html", "contact.html"], links=copy.deepcopy(LINKS))
    return value


def quote_of(result, role):
    assert result["role"] == role
    quote = result["quote"]
    assert quote["workflow"] == "proof-v1" and quote["paymentMode"] == "sandbox"
    assert quote["proof"].get("sandboxCollaboration") is True and not quote["proof"].get("demoRoleplay")
    roles.private_columns_absent(quote)
    if role == "seller":
        roles.seller_projection(quote)
    return quote


def create_shared(api, buyer, seller, specification):
    quote = quote_of(api.ok(buyer, "/api/proofs", specification, role="seller"), "buyer")
    path = "/api/proofs/" + quote["id"]
    api.ok(buyer, path + "/approve", {}, role="seller")
    invitation = api.ok(buyer, path + "/invite", {"email": seller.email})["invitation"]
    quote_of(api.ok(seller, "/api/proof-invitations/accept", {"token": invitation["token"], "confirm": True, "sellerName": "Synthetic coverage seller"}), "seller")
    return path, "/api/quotes/" + quote["id"]


def human_checks(quote):
    return [row["criterionId"] for row in quote["proof"]["delivery"]["evidence"] if row["finding"] == "needs_human"]


def browser_input(quote, mode="matching"):
    rows = [{"stepId": f"page:{width}:{file}", "status": "observed", "kind": "page",
             "stylesExpected": 0, "stylesLoaded": 0, "imagesExpected": 0, "imagesLoaded": 0}
            for file in PAGES for width in WIDTHS]
    rows += [{"stepId": f"link:{width}" + (f":{index + 1}" if index else ""), "status": "observed", "kind": "link",
              "sourceVisible": True, "sourceHitTarget": True, "activated": True,
              "destinationMatched": True, "targetVisible": True}
             for index in range(len(LINKS)) for width in WIDTHS]
    if mode == "unavailable":
        rows = [{"stepId": row["stepId"], "status": "unavailable", "reason": "timeout"} for row in rows]
    elif mode == "resource-issue":
        rows[0].update(stylesExpected=1)
    delivery = quote["proof"]["delivery"]
    return {"deliveryId": delivery["id"], "previousReportId": delivery.get("browserChecks", {}).get("id"), "readings": rows}


def report_history(quote):
    return quote["proof"]["delivery"]["browserCheckHistory"]


def snapshot(quote):
    pointer = quote["proof"]["collaboration"]["acceptance"]["evidenceSnapshotId"]
    return next(row for row in quote["proof"]["delivery"]["acceptanceEvidence"] if row["id"] == pointer)


def assert_snapshot_preserved(quote, frozen, expected_reports):
    assert snapshot(quote) == frozen
    assert quote["proof"]["collaboration"]["acceptance"]["evidenceSnapshotId"] == frozen["id"]
    assert report_history(quote) == expected_reports
    assert [row["id"] for row in report_history(quote)] == [row["id"] for row in expected_reports]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker.get("syntheticConfiguration") is True and marker.get("outboundFetch") == "blocked"
    run = uuid4().hex
    buyer = roles.Actor("coverage-chain-buyer-" + run, "buyer@coverage-chain-synthetic.example")
    seller = roles.Actor("coverage-chain-seller-" + run, "seller@coverage-chain-synthetic.example")
    outsider = roles.Actor("coverage-chain-outsider-" + run, "outsider@coverage-chain-synthetic.example")
    config = api.ok(buyer, "/api/config")
    assert config["aiMode"] == "demo" and config["paymentMode"] == "sandbox"

    base = spec("Synthetic coverage validation")
    initial = api.ok(buyer, "/api/proofs")
    malformed = []
    missing = copy.deepcopy(base); del missing["coverage"]; malformed.append(missing)
    for patch in ({"sourceText": SUMMARY + " Changed"}, {"confirmed": False}, {"version": "1"}):
        value = copy.deepcopy(base); value["coverage"].update(patch); malformed.append(value)
    value = copy.deepcopy(base); value["coverage"]["decisions"].pop(); malformed.append(value)
    value = copy.deepcopy(base); value["coverage"]["decisions"][0].update(disposition="exclude", reason=" "); malformed.append(value)
    value = copy.deepcopy(base); value["coverage"]["decisions"][1]["id"] = "coverage-1"; malformed.append(value)
    value = copy.deepcopy(base); value["coverage"]["decisions"][0]["criterionId"] = "page-1"; malformed.append(value)
    for value in malformed:
        api.reject(buyer, "/api/proofs", value, codes=(400,))
    assert api.ok(buyer, "/api/proofs") == initial
    api.checked("New HTTP custom creation rejects missing, stale, unconfirmed, wrong-version, missing/duplicate-row, empty-exclusion and client-forged coverage without saving projects")

    hello_path, hello_quote_path = create_shared(api, buyer, seller, spec("Synthetic Hello counterexample"))
    html = lambda body: "<!doctype html><html><head><title>Synthetic website</title></head><body>" + body + "</body></html>"
    quote_of(api.ok(seller, hello_path + "/delivery", {"files": {"index.html": html("<p>Hello</p>")}, "expectedDeliveryId": None, "reviewRules": True}), "seller")
    hello = quote_of(api.ok(buyer, hello_quote_path), "buyer")
    delivery_id = hello["proof"]["delivery"]["id"]
    saved_coverage = hello["proof"]["project"]["coverage"]
    assert saved_coverage["version"] == 1 and saved_coverage["sourceText"] == SUMMARY
    assert [row["text"] for row in saved_coverage["decisions"]] == ORIGINAL_GROUPS
    assert all(SUMMARY[row["start"]:row["end"]] == row["text"] for row in saved_coverage["decisions"])
    assert [row["criterionId"] for row in saved_coverage["decisions"]] == [f"coverage-{index + 1}" for index in range(5)]
    assert len(human_checks(hello)) == 6
    assert [row["finding"] for row in hello["proof"]["delivery"]["evidence"] if row["criterionId"] == "page-1"] == ["pass"]
    api.ok(seller, hello_path + "/submit_delivery", {"deliveryId": delivery_id, "note": "Hello source for explicit coverage counterexample"})
    api.reject(buyer, hello_path + "/accept_delivery", {"deliveryId": delivery_id, "confirm": True, "manualChecks": ["mobile"]}, codes=(400,))
    after_rejection = quote_of(api.ok(buyer, hello_quote_path), "buyer")
    assert after_rejection["proof"]["collaboration"]["stage"] == "submitted"
    assert not after_rejection["proof"].get("acceptedDeliveryId") and after_rejection["proof"]["paymentState"] == "unfunded"
    accepted = quote_of(api.ok(buyer, hello_path + "/accept_delivery", {"deliveryId": delivery_id, "confirm": True, "manualChecks": human_checks(hello)}), "buyer")
    assert accepted["proof"]["collaboration"]["stage"] == "accepted"
    assert snapshot(accepted)["browserReportId"] is None and snapshot(accepted)["manualChecks"] == human_checks(hello)
    api.checked("Actual API/D1 Hello-page counterexample preserves five original requirements and rejects mobile-only acceptance; deliberate confirmation of every item remains human authority and records no invented observations")

    path, quote_path = create_shared(api, buyer, seller, spec("Synthetic multi-step acceptance history", with_links=True))
    # Positive controls on the exact same endpoint prevent an absent route from
    # being mistaken for an outsider membership denial.
    buyer_detail = quote_of(api.ok(buyer, quote_path), "buyer")
    seller_detail = quote_of(api.ok(seller, quote_path), "seller")
    assert buyer_detail["id"] == seller_detail["id"] == path.rsplit("/", 1)[-1]
    api.reject(outsider, quote_path, role="buyer", codes=(404,))
    files = {"index.html": html('<section id="menu">中文菜单 / Menu</section><a href="en/menu.html">English menu</a><p>11am–8pm, 1 Example Street.</p>'),
             "en/menu.html": html('<p>English menu</p><a href="../index.html#menu">中文菜单</a><a href="../contact.html#booking">Appointment details</a>'),
             "contact.html": html('<section id="booking">Consultations require advance arrangement. No live form or email is included.</section>')}
    quote_of(api.ok(seller, path + "/delivery", {"files": files, "expectedDeliveryId": None, "reviewRules": True}, role="buyer"), "seller")
    quote = quote_of(api.ok(buyer, quote_path), "buyer")
    current_id = quote["proof"]["delivery"]["id"]
    assert not any(row["finding"] == "fail" for row in quote["proof"]["delivery"]["evidence"])
    assert [row["id"] for row in quote["proof"]["criteria"] if row["id"].startswith("link")] == ["link", "link-2", "link-3"]
    api.reject(buyer, path + "/delivery", {"files": files, "expectedDeliveryId": current_id}, role="seller", codes=(403,))
    api.reject(outsider, path + "/browser-checks", browser_input(quote), role="buyer", codes=(404,))
    before_observations = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    payload_a = browser_input(quote)
    quote = quote_of(api.ok(buyer, path + "/browser-checks", payload_a, role="seller"), "buyer")
    report_a = copy.deepcopy(quote["proof"]["delivery"]["browserChecks"])
    assert report_a["reportedByRole"] == "buyer"
    assert report_a["summary"] == {"steps": 12, "observed": 12, "issues": 0, "unavailable": 0}
    link_rows = [row for row in report_a["readings"] if row["kind"] == "link"]
    assert [(row["file"], row["label"], row["target"], row["viewportWidth"]) for row in link_rows] == [(link["from"], link["text"], link["to"], width) for link in LINKS for width in WIDTHS]
    assert report_history(quote) == [report_a]
    assert quote["proof"]["audit"][-1]["reportId"] == report_a["id"]
    api.checked("Saved three-link plan covers page and fragment targets at both widths with exact server-derived labels/order; membership wins over forged role headers and reportA is retained")

    api.ok(seller, path + "/submit_delivery", {"deliveryId": current_id, "note": "Three local navigation steps for human inspection"})
    quote = quote_of(api.ok(buyer, path + "/accept_delivery", {"deliveryId": current_id, "confirm": True, "manualChecks": human_checks(quote)}), "buyer")
    frozen = copy.deepcopy(snapshot(quote))
    assert frozen["browserReportId"] == report_a["id"] and frozen["layoutReportId"] is None
    assert frozen["assessmentId"] is None and "assessment" not in frozen
    assert frozen["criteria"] == quote["proof"]["criteria"] and frozen["evidence"] == quote["proof"]["delivery"]["evidence"]
    assert_snapshot_preserved(quote, frozen, [report_a])
    acceptance = copy.deepcopy(quote["proof"]["collaboration"]["acceptance"])
    quote = quote_of(api.ok(seller, path + "/browser-checks", browser_input(quote, "unavailable"), role="buyer"), "seller")
    quote = quote_of(api.ok(buyer, quote_path), "buyer")
    report_b = copy.deepcopy(quote["proof"]["delivery"]["browserChecks"])
    assert report_b["reportedByRole"] == "seller" and report_b["summary"]["unavailable"] == 12
    assert quote["proof"]["collaboration"]["acceptance"] == acceptance
    assert_snapshot_preserved(quote, frozen, [report_a, report_b])
    api.reject(buyer, path + "/browser-checks", payload_a, codes=(409,))
    api.reject(buyer, path + "/browser-checks", {**browser_input(quote), "deliveryId": "stale-version"}, codes=(409,))
    assert quote_of(api.ok(buyer, quote_path), "buyer") == quote
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == before_observations
    api.checked("Acceptance freezes reportA and exact criteria/evidence/manual checks; later unavailable reportB remains supplemental, and stale report/delivery IDs reject without changing the accepted snapshot")

    checkout = api.ok(buyer, path + "/checkout", {})
    api.ok(buyer, path + "/authorize", {"orderId": checkout["orderId"]})
    consent = {"deliveryId": current_id, "confirm": True, "manualChecks": human_checks(quote)}
    api.reject(seller, path + "/capture", consent, role="buyer", codes=(403,))
    paid = quote_of(api.ok(buyer, path + "/capture", consent), "buyer")
    assert paid["status"] == "paid" and paid["proof"]["paymentState"] == "captured"
    assert paid["proof"]["acceptedDeliveryId"] == current_id
    assert paid["proof"]["acceptedEvidenceSnapshotId"] == frozen["id"]
    assert_snapshot_preserved(paid, frozen, [report_a, report_b])
    assert quote_of(api.ok(buyer, path + "/capture", consent), "buyer") == paid
    receipt_before = {key: paid.get(key) for key in ("paidAt", "captureId", "paypalOrderId")}
    marker_paid = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    latest = quote_of(api.ok(buyer, path + "/browser-checks", browser_input(paid, "resource-issue")), "buyer")
    report_c = copy.deepcopy(latest["proof"]["delivery"]["browserChecks"])
    assert report_c["summary"]["issues"] == 1
    assert_snapshot_preserved(latest, frozen, [report_a, report_b, report_c])
    assert latest["proof"]["collaboration"]["acceptance"] == acceptance
    assert latest["proof"]["acceptedEvidenceSnapshotId"] == frozen["id"]
    assert {key: latest.get(key) for key in receipt_before} == receipt_before
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == marker_paid
    api.checked("Buyer-only controlled capture binds the earlier acceptance snapshotA despite reportB; receipt replay is idempotent and post-capture issue reportC changes neither acceptance nor the receipt")

    for actor, role in ((buyer, "buyer"), (seller, "seller")):
        detailed = quote_of(api.ok(actor, quote_path), role)
        assert_snapshot_preserved(detailed, frozen, [report_a, report_b, report_c])
        version = api.ok(actor, path + "/versions/" + current_id)["version"]
        assert version["delivery"]["browserCheckHistory"] == [report_a, report_b, report_c]
        assert version["delivery"]["acceptanceEvidence"] == [frozen]
        versions = api.ok(actor, path + "/versions")["versions"]
        for row in versions:
            for heavy in ("files", "browserCheckHistory", "layoutHistory", "acceptanceEvidence"):
                assert heavy not in row["delivery"]
        listing = api.ok(actor, "/api/proofs")["quotes"]
        listed = next(row for row in listing if row["id"] == latest["id"])
        for heavy in ("files", "assessment", "browserCheckHistory", "layoutHistory", "acceptanceEvidence"):
            assert heavy not in listed["proof"]["delivery"]
        roles.private_columns_absent(listed)
    api.reject(outsider, path + "/versions/" + current_id, codes=(404,))
    api.checked("Both member detail reads retain A/B/C and the frozen acceptance after readback; case/version listings omit bulky history while outsiders cannot retrieve exact-version evidence")
    marker_after = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    print(json.dumps({"result": "passed", "suite": "chain-coverage", "checks": api.checks,
                      "rejectedCoveragePayloads": len(malformed), "originalRequirementGroups": 5,
                      "navigationSteps": 3, "browserReadingsPerReport": 12, "retainedBrowserReports": 3,
                      "acceptanceSnapshotPreservedAcrossSupplementAndCapture": True,
                      "providerNetworkRequests": 0, "browserCheckProviderFetches": 0,
                      "syntheticProviderFetches": marker_after["syntheticCalls"] - marker["syntheticCalls"],
                      "scope": "Fresh isolated local API/D1, synthetic identities/browser readings/payment responses. No real browser actions, independent users, model calls, PayPal Sandbox funds or production authentication. AI was not configured, so list assessment absence was not tested with a saved live model report."}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
