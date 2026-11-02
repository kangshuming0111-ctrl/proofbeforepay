"""Business scope -> bounded observations -> revision -> exact acceptance -> mock receipt.

Only the owned isolated loopback Worker is supported. Outbound fetch is blocked;
identities, visible text readings and provider responses are synthetic fixtures.
This verifies application/API/D1 behavior, not actual browser visibility, real
sign-ins, independent users, an AI judgment or genuine PayPal Sandbox funds.
"""
import argparse
import copy
import importlib.util
import json
import sys
from pathlib import Path
from uuid import uuid4
from urllib.error import HTTPError
from urllib.request import Request

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("business_chain_helpers", Path(__file__).with_name("chain-coverage-api-smoke.py"))
chain = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = chain
_spec.loader.exec_module(chain)
roles = chain.roles

SUMMARY = "Display Beef noodles and 牛肉面 at AUD 18.00 on both menus; Display phone +61 3 1234 5678; Display opening hours Monday-Friday 11:00-20:00."
GROUPS = ["Display Beef noodles and 牛肉面 at AUD 18.00 on both menus;", "Display phone +61 3 1234 5678;", "Display opening hours Monday-Friday 11:00-20:00."]


def specification(title):
    cursor = 0
    sources = []
    for group in GROUPS:
        start = SUMMARY.index(group, cursor)
        sources.append({"start": start, "end": start + len(group), "excerpt": group})
        cursor = start + len(group)
    items = [
        {"id": "business-1", "criterionId": "coverage-1", "file": "index.html", "source": sources[0], "expected": {"kind": "item_price", "label": "Beef noodles", "amountMinor": 1800, "currency": "AUD"}},
        {"id": "business-2", "criterionId": "coverage-1", "file": "menu-zh.html", "source": sources[0], "expected": {"kind": "item_price", "label": "牛肉面", "amountMinor": 1800, "currency": "AUD"}},
        {"id": "business-3", "criterionId": "coverage-2", "file": "index.html", "source": sources[1], "expected": {"kind": "visible_copy", "text": "+61 3 1234 5678"}},
    ]
    return {"mode": "custom", "collaborative": True, "demoRoleplay": False, "paymentTesting": "collaborative-sandbox", "language": "en", "currency": "AUD", "title": title, "summary": SUMMARY, "amount": "1.00", "requiredPages": ["index.html", "menu-zh.html"], "manualRequirements": [], "coverage": {"version": 1, "sourceText": SUMMARY, "confirmed": True, "decisions": [{"id": f"coverage-{index + 1}", "disposition": "include"} for index in range(3)]}, "businessChecks": {"confirmed": True, "items": items}}


def files(fixed=False):
    html = lambda body: "<!doctype html><html><head><title>Synthetic noodle shop</title></head><body>" + body + "</body></html>"
    phone = "+61 3 1234 5678" if fixed else "+61 3 1234 5679"
    amount = "18.00" if fixed else "28.00"
    return {"index.html": html("<main><p>Beef noodles AUD 18.00</p><p>" + phone + "</p><p>Monday-Friday 11:00-20:00</p></main>"),
            "menu-zh.html": html('<main><p>牛肉面 AUD ' + amount + '</p><p hidden>牛肉面 AUD 18.00</p></main>')}


def observation(quote, mode="matching"):
    blocks = {"business-1": ["Beef noodles AUD 18.00"], "business-2": ["牛肉面 AUD 18.00"], "business-3": ["Phone: +61 3 1234 5678"]}
    if mode == "v1":
        blocks.update({"business-2": ["牛肉面 AUD 28.00"], "business-3": ["Phone: +61 3 1234 5679"]})
    rows = [{"stepId": f"business:{width}:{item['id']}", "status": "observed", "blocks": blocks[item["id"]]} for item in quote["proof"]["project"]["businessChecks"] for width in (375, 900)]
    if mode == "unavailable":
        rows = [{"stepId": row["stepId"], "status": "unavailable", "reason": "timeout"} for row in rows]
    delivery = quote["proof"]["delivery"]
    return {"deliveryId": delivery["id"], "previousReportId": delivery.get("businessChecks", {}).get("id"), "readings": rows}


def consent(quote, reason=None, include_decision=True):
    value = {"deliveryId": quote["proof"]["delivery"]["id"], "confirm": True, "manualChecks": chain.human_checks(quote)}
    if include_decision:
        value["businessDecision"] = {"reportId": quote["proof"]["delivery"].get("businessChecks", {}).get("id")}
        if reason is not None:
            value["businessDecision"]["exceptionReason"] = reason
    return value


def create_with_scope_preview(api, buyer, seller, outsider, specification):
    quote = chain.quote_of(api.ok(buyer, "/api/proofs", specification), "buyer")
    path = "/api/proofs/" + quote["id"]
    api.ok(buyer, path + "/approve", {})
    invitation = api.ok(buyer, path + "/invite", {"email": seller.email})["invitation"]
    api.reject(outsider, "/api/proof-invitations/inspect", {"token": invitation["token"]}, codes=(404,))
    preview = api.ok(seller, "/api/proof-invitations/inspect", {"token": invitation["token"]})["project"]
    assert preview["businessChecks"] == quote["proof"]["project"]["businessChecks"]
    assert len(preview["businessChecks"]) == 3
    assert preview["coverage"] == quote["proof"]["project"]["coverage"]
    assert preview["criteria"] == quote["proof"]["criteria"]
    assert not any(key in preview for key in ("proof", "brief", "clientName", "paypalOrderId", "captureId"))
    assert preview["businessChecks"][1]["file"] == "menu-zh.html"
    assert preview["businessChecks"][1]["expected"] == {"kind": "item_price", "label": "牛肉面", "amountMinor": 1800, "currency": "AUD"}
    chain.quote_of(api.ok(seller, "/api/proof-invitations/accept", {"token": invitation["token"], "confirm": True, "sellerName": "Synthetic business seller"}), "seller")
    api.checked("The invited seller sees the exact locked business page/value/source plan and coverage before confirming; outsider access is rejected and private delivery/payment state is absent")
    return path, "/api/quotes/" + quote["id"]


def suggestion_endpoint_guards(api, buyer, base):
    endpoint = "/api/business-check-suggestions"
    payload = {key: copy.deepcopy(base[key]) for key in ("summary", "requiredPages", "coverage", "language")}
    before = api.ok(buyer, "/api/proofs")
    calls_before = api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"]
    api.reject(None, endpoint, payload, codes=(401,))
    request = Request(api.origin + endpoint, data=json.dumps(payload).encode("utf-8"), method="POST",
                      headers={"Content-Type": "application/json", "Origin": "https://unrelated.synthetic.example",
                               "oai-authenticated-user-id": buyer.identifier, "oai-authenticated-user-email": buyer.email})
    try:
        response = api.opener.open(request, timeout=40)
    except HTTPError as error:
        response = error
    with response:
        assert response.status == 403, "Cross-origin suggestion requests must be refused before provider use"
    malformed = []
    value = copy.deepcopy(payload); value["unknown"] = True; malformed.append(value)
    value = copy.deepcopy(payload); value["summary"] = 123; malformed.append(value)
    value = copy.deepcopy(payload); value["requiredPages"] = ["index.html", "https://external.synthetic.example/menu.html"]; malformed.append(value)
    value = copy.deepcopy(payload); value["coverage"]["sourceText"] += " stale"; malformed.append(value)
    value = copy.deepcopy(payload); value["coverage"]["confirmed"] = False; malformed.append(value)
    for value in malformed:
        api.reject(buyer, endpoint, value, codes=(400,))
    code, result, _ = api.request(buyer, endpoint, payload)
    assert code == 409 and "not configured" in result.get("error", ""), "Empty provider configuration must explicitly preserve manual fallback"
    # A fully valid draft can exceed 16KiB: both source fields contain the
    # 1000-character CJK summary, and 11 excluded rows each retain a 300-CJK
    # reason. These are the actual 12-unit/10-page limits, not a 40-file plan.
    large_summary = "".join("门" + "店" * (96 if index == 11 else 80) + ";" for index in range(12))
    long_pages = ["index.html"] + [f"p{index}/" + "a" * 64 + "/" + "b" * 64 + "/" + "c" * 22 + ".html" for index in range(9)]
    assert len(large_summary) == 1000 and all(len(path) == 160 for path in long_pages[1:])
    large = {"summary": large_summary, "requiredPages": long_pages, "language": "zh",
             "coverage": {"version": 1, "sourceText": large_summary, "confirmed": True,
                          "decisions": [{"id": f"coverage-{index + 1}", "disposition": "exclude" if index else "include",
                                         **({"reason": "另" * 300} if index else {})} for index in range(12)]}}
    large_valid_bytes = len(json.dumps(large, ensure_ascii=False).encode("utf-8"))
    assert 16 * 1024 < large_valid_bytes < 32 * 1024
    code, result, _ = api.request(buyer, endpoint, large)
    assert code == 409 and "not configured" in result.get("error", ""), "A valid UTF-8 draft above 16KiB must reach the explicit no-key fallback, not 413"
    oversized = {**large, "summary": "店" * 11000}
    assert len(json.dumps(oversized, ensure_ascii=False).encode("utf-8")) > 32 * 1024
    api.reject(buyer, endpoint, oversized, codes=(413,))
    assert api.ok(buyer, "/api/proofs") == before, "Suggestion failure/validation must not create or mutate projects"
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == calls_before
    api.checked("AI suggestion HTTP route rejects anonymous, cross-origin, malformed and stale inputs; valid drafts including a maximum-length CJK draft above16KiB reach the explicit no-key fallback, while bodies above32KiB are refused, with zero provider calls or project mutations")
    return {"largeValidUtf8Bytes": large_valid_bytes, "bodyLimitBytes": 32 * 1024, "summaryCharacters": 1000, "coverageUnits": 12, "excludedReasons": 11, "requiredPages": 10}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker.get("syntheticConfiguration") is True and marker.get("outboundFetch") == "blocked"
    run = uuid4().hex
    buyer = roles.Actor("business-buyer-" + run, "buyer@business-synthetic.example")
    seller = roles.Actor("business-seller-" + run, "seller@business-synthetic.example")
    outsider = roles.Actor("business-outsider-" + run, "outsider@business-synthetic.example")
    config = api.ok(buyer, "/api/config")
    assert config["aiMode"] == "demo" and config["paymentMode"] == "sandbox"
    initial = api.ok(buyer, "/api/proofs")
    base = specification("Synthetic business verification")
    suggestion_bounds = suggestion_endpoint_guards(api, buyer, base)
    malformed = []
    for patch in ({"confirmed": False}, {"unrecognized": True}):
        value = copy.deepcopy(base); value["businessChecks"].update(patch); malformed.append(value)
    for patch in ({"criterionId": "manual-1"}, {"file": "unagreed.html"}, {"id": "business-4"}):
        value = copy.deepcopy(base); value["businessChecks"]["items"][0].update(patch); malformed.append(value)
    value = copy.deepcopy(base); value["businessChecks"]["items"][0]["source"]["excerpt"] = "fabricated"; malformed.append(value)
    value = copy.deepcopy(base); value["businessChecks"]["items"][0]["expected"]["amountMinor"] = 18.5; malformed.append(value)
    value = copy.deepcopy(base); value["coverage"]["decisions"][0].update(disposition="exclude", reason="Separate purchase"); malformed.append(value)
    for value in malformed:
        api.reject(buyer, "/api/proofs", value, codes=(400,))
    assert api.ok(buyer, "/api/proofs") == initial
    api.checked("HTTP creation rejects unconfirmed/unknown business schema, forged criteria/source, unagreed pages, invalid cents and excluded requirements without creating records")

    path, quote_path = create_with_scope_preview(api, buyer, seller, outsider, base)
    buyer_view = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    chain.quote_of(api.ok(seller, quote_path), "seller")
    assert buyer_view["proof"]["project"]["businessChecks"] == base["businessChecks"]["items"]
    api.reject(outsider, quote_path, codes=(404,))
    chain.quote_of(api.ok(seller, path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True}), "seller")
    quote = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    first_id = quote["proof"]["delivery"]["id"]
    api.ok(seller, path + "/submit_delivery", {"deliveryId": first_id, "note": "Synthetic v1 for review"})
    api.reject(buyer, path + "/accept_delivery", consent(quote), codes=(409,))
    api.reject(outsider, path + "/business-checks", observation(quote, "v1"), role="buyer", codes=(404,))
    payload_v1 = observation(quote, "v1")
    quote = chain.quote_of(api.ok(buyer, path + "/business-checks", payload_v1, role="seller"), "buyer")
    report_v1 = copy.deepcopy(quote["proof"]["delivery"]["businessChecks"])
    assert report_v1["reportedByRole"] == "buyer" and report_v1["summary"] == {"steps": 6, "observed": 6, "issues": 4, "unavailable": 0}
    assert all(row["source"] == base["businessChecks"]["items"][int(row["checkId"].split("-")[1]) - 1]["source"] for row in report_v1["readings"])
    api.reject(buyer, path + "/accept_delivery", consent(quote), codes=(409,))
    api.reject(buyer, path + "/accept_delivery", consent(quote, "short"), codes=(409,))
    api.reject(seller, path + "/accept_delivery", consent(quote, "Explicit synthetic exception after review"), role="buyer", codes=(403,))
    api.checked("Actual member role defeats spoofed role headers; incomplete delivery acceptance and mismatch-without-reason reject, and the server derives six scoped observations with four synthetic issues")

    guarded = api.ok(buyer, quote_path)
    invalid_reports = []
    value = observation(quote); value["deliveryId"] = "stale"; invalid_reports.append((value, 409))
    invalid_reports.append((payload_v1, 409))
    value = observation(quote); value["readings"].pop(); invalid_reports.append((value, 400))
    value = observation(quote); value["readings"][-1] = copy.deepcopy(value["readings"][0]); invalid_reports.append((value, 400))
    value = observation(quote); value["readings"][0]["expected"] = {"kind": "visible_copy", "text": "forged"}; invalid_reports.append((value, 400))
    value = observation(quote); value["readings"][0]["outcome"] = "expected_observation"; invalid_reports.append((value, 400))
    value = observation(quote); value["readings"][0]["blocks"] = ["x"] * 13; invalid_reports.append((value, 400))
    for value, status in invalid_reports:
        api.reject(buyer, path + "/business-checks", value, codes=(status,))
    assert api.ok(buyer, quote_path) == guarded
    api.ok(buyer, path + "/return", {"deliveryId": first_id, "feedback": [{"criterionId": "coverage-1", "comment": "Chinese price must be AUD18; repair the phone too."}]})
    api.ok(seller, path + "/delivery", {"files": files(True), "expectedDeliveryId": first_id, "reviewRules": True})
    quote = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    second_id = quote["proof"]["delivery"]["id"]
    assert second_id != first_id and not quote["proof"]["delivery"].get("businessChecks") and not quote["proof"]["delivery"].get("businessCheckHistory")
    api.reject(buyer, path + "/business-checks", payload_v1, codes=(409,))
    archived = api.ok(buyer, path + "/versions/" + first_id)["version"]
    assert archived["delivery"]["businessCheckHistory"] == [report_v1] and archived["delivery"]["files"] == files()
    api.checked("Complete-plan, bounded-text, server-only expectation/outcome and delivery/report CAS checks reject unchanged; replacement starts with no inherited observations while exact v1 files/report remain archived")

    payload_a = observation(quote)
    quote = chain.quote_of(api.ok(seller, path + "/business-checks", payload_a, role="buyer"), "seller")
    quote = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    report_a = copy.deepcopy(quote["proof"]["delivery"]["businessChecks"])
    assert report_a["reportedByRole"] == "seller" and report_a["summary"] == {"steps": 6, "observed": 6, "issues": 0, "unavailable": 0}
    api.ok(seller, path + "/submit_delivery", {"deliveryId": second_id, "note": "Synthetic corrected version"})
    api.reject(buyer, path + "/accept_delivery", {**consent(quote), "businessDecision": {"reportId": report_v1["id"]}}, codes=(409,))
    quote = chain.quote_of(api.ok(buyer, path + "/accept_delivery", consent(quote)), "buyer")
    frozen = copy.deepcopy(chain.snapshot(quote))
    assert frozen["businessReportId"] == report_a["id"] and not frozen.get("businessExceptionReason")
    acceptance = copy.deepcopy(quote["proof"]["collaboration"]["acceptance"])
    quote = chain.quote_of(api.ok(seller, path + "/business-checks", observation(quote, "v1")), "seller")
    quote = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    report_b = copy.deepcopy(quote["proof"]["delivery"]["businessChecks"])
    assert report_b["summary"]["issues"] == 4
    assert chain.snapshot(quote) == frozen and quote["proof"]["collaboration"]["acceptance"] == acceptance
    api.reject(buyer, path + "/business-checks", payload_a, codes=(409,))
    checkout = api.ok(buyer, path + "/checkout", {})
    api.ok(buyer, path + "/authorize", {"orderId": checkout["orderId"]})
    payment_consent = consent(quote, include_decision=False)
    api.reject(seller, path + "/capture", payment_consent, role="buyer", codes=(403,))
    paid = chain.quote_of(api.ok(buyer, path + "/capture", payment_consent), "buyer")
    assert paid["status"] == "paid" and paid["proof"]["paymentState"] == "captured"
    assert paid["proof"]["acceptedEvidenceSnapshotId"] == frozen["id"]
    assert chain.snapshot(paid) == frozen and paid["proof"]["delivery"]["businessCheckHistory"] == [report_a, report_b]
    assert chain.quote_of(api.ok(buyer, path + "/capture", payment_consent), "buyer") == paid
    for actor, role in ((buyer, "buyer"), (seller, "seller")):
        saved = chain.quote_of(api.ok(actor, quote_path), role)
        assert chain.snapshot(saved) == frozen
        assert saved["proof"]["delivery"]["businessCheckHistory"] == [report_a, report_b]
        versions = api.ok(actor, path + "/versions")["versions"]
        assert all("businessCheckHistory" not in row["delivery"] for row in versions)
        listing = api.ok(actor, "/api/proofs")["quotes"]
        listed = next(row for row in listing if row["id"] == paid["id"])
        assert "businessCheckHistory" not in listed["proof"]["delivery"]
    assert api.ok(buyer, path + "/versions/" + first_id)["version"] == archived
    api.reject(outsider, path + "/versions/" + first_id, codes=(404,))
    api.checked("Corrected v2 reportA is explicitly accepted and immutable; later mismatch reportB remains supplemental; buyer-only mock capture and idempotent receipt remain bound to A, with role-scoped history after readback")

    exception_path, exception_quote_path = chain.create_shared(api, buyer, seller, specification("Synthetic deliberate business exception"))
    api.ok(seller, exception_path + "/delivery", {"files": files(), "expectedDeliveryId": None, "reviewRules": True})
    exception_quote = chain.quote_of(api.ok(buyer, exception_quote_path), "buyer")
    api.ok(seller, exception_path + "/submit_delivery", {"deliveryId": exception_quote["proof"]["delivery"]["id"], "note": "Buyer may choose a documented exception"})
    exception_quote = chain.quote_of(api.ok(buyer, exception_path + "/business-checks", observation(exception_quote, "unavailable")), "buyer")
    reason = "Buyer independently reviewed the unavailable content and explicitly accepts this exception."
    api.reject(buyer, exception_path + "/accept_delivery", consent(exception_quote), codes=(409,))
    exception_quote = chain.quote_of(api.ok(buyer, exception_path + "/accept_delivery", consent(exception_quote, reason)), "buyer")
    exception_snapshot = chain.snapshot(exception_quote)
    assert exception_snapshot["businessExceptionReason"] == reason
    assert exception_snapshot["businessReportId"] == exception_quote["proof"]["delivery"]["businessChecks"]["id"]
    assert exception_quote["proof"]["delivery"]["businessChecks"]["summary"]["unavailable"] == 6
    assert exception_quote["proof"]["paymentState"] == "unfunded"
    api.checked("Unavailable business evidence is never rewritten as matching; a separate explicit buyer exception is required and frozen with the exact report while acceptance remains separate from payment")
    after = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    print(json.dumps({"result": "passed", "suite": "business-checks", "checks": api.checks, "suggestionRouteBounds": suggestion_bounds, "rejectedCreatePayloads": len(malformed), "rejectedObservationPayloads": len(invalid_reports), "businessFacts": 3, "readingsPerReport": 6, "acceptanceSnapshotPreservedAcrossSupplementAndCapture": True, "providerNetworkRequests": 0, "businessCheckProviderFetches": 0, "syntheticProviderFetches": after["syntheticCalls"] - marker["syntheticCalls"], "scope": "Fresh isolated API/D1 with synthetic identity headers, visible-text readings and payment responses. No real browser actions or visibility, production authentication, independent users, model calls or genuine PayPal Sandbox funds."}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
