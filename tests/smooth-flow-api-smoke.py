"""Check combined upload/rule review on an already running isolated Worker.

Only a plain loopback origin is accepted. Empty AI/payment configuration is
required before any mutation. Synthetic trusted identity headers test the app,
not the production gateway. No model, payment, browser or deployed site is used.
The combined action must not submit to a buyer, assess with AI, accept or pay.
"""

import argparse
import importlib.util
import json
import os
import re
import sys
from pathlib import Path
from uuid import uuid4


sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("smooth_role_smoke", Path(__file__).with_name("role-demo-api-smoke.py"))
roles = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = roles
_spec.loader.exec_module(roles)

SOURCE = '<!doctype html><html><head><title>Smooth flow QA</title></head><body><h1>First synthetic delivery</h1><p>Hours: Monday to Friday 11am-8pm.</p></body></html>'
FILES = {"index.html": SOURCE, "design.css": "body { margin: 1rem; color: #243742; }"}


def actor(name):
    return roles.Actor("smooth-" + name + "-" + uuid4().hex[:12], name + "@smooth.example")


def project(title, roleplay=True):
    return {"mode": "custom", "demoRoleplay": roleplay, "collaborative": not roleplay,
            "title": title, "summary": "Synthetic static files without a required contract",
            "clientName": "Smooth QA", "amount": "1.00", "currency": "AUD", "language": "en",
            "requiredPages": ["index.html"], "manualRequirements": ["Display opening hours: Monday to Friday 11am-8pm."]}


def read(api, owner, quote_id, roleplay=True):
    return roles.quote_response(api.ok(owner, "/api/quotes/" + quote_id, role="buyer"), "buyer", roleplay=roleplay)


def unchanged(api, owner, quote_id, path, payload, status, role="seller", roleplay=True, message=None):
    before = read(api, owner, quote_id, roleplay=roleplay)
    code, result, _ = api.request(owner, path, payload, role=role)
    assert code == status, (code, status, api.diagnostic(result))
    if message:
        assert re.search(message, result.get("error", ""), re.I), api.diagnostic(result)
    assert read(api, owner, quote_id, roleplay=roleplay) == before, "Rejected request changed the saved project"


def unsubmitted_without_decisions(quote):
    roles.no_payment(quote)
    assert quote["status"] == "approved" and quote["proof"]["collaboration"]["stage"] == "in_progress"
    assert not quote["proof"]["collaboration"].get("submission") and not quote["proof"]["collaboration"].get("acceptance")
    assert "assessment" not in quote["proof"].get("delivery", {})
    assert not any(event["kind"] in {"assessed", "delivery_sent", "delivery_accepted", "authorized", "accepted", "captured"} for event in quote["proof"]["audit"])


def checked_review(quote):
    delivery = quote["proof"]["delivery"]
    review = quote["proof"]["review"]
    assert review["deliveryId"] == delivery["id"] and review["mode"] == "demo" and quote["aiMode"] == "demo"
    assert "no AI request" in review["summary"]
    assert any(item["finding"] == "needs_human" for item in delivery["evidence"]), "Rule review must not auto-confirm human checks"
    unsubmitted_without_decisions(quote)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("BRIEFPAY_SMOOTH_TEST_URL", "http://127.0.0.1:8789"))
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    owner, outsider = actor("owner"), actor("outsider")
    config = api.ok(owner, "/api/config")
    assert config.get("aiMode") == "demo" and config.get("paymentMode") == "demo", "Stop: use an isolated Worker with empty provider configuration"
    quote = roles.quote_response(api.ok(owner, "/api/proofs", project("Combined upload and rule review QA")), "buyer")
    quote_id, path = quote["id"], "/api/proofs/" + quote["id"]
    assert "requirements" not in quote["proof"]
    api.ok(owner, path + "/approve", {}, role="buyer")
    before = read(api, owner, quote_id)
    for flag in (None, "true", 1, [], {}):
        unchanged(api, owner, quote_id, path + "/delivery", {"files": FILES, "expectedDeliveryId": None, "reviewRules": flag}, 400)
    assert read(api, owner, quote_id) == before
    assert api.ok(owner, path + "/versions")["versions"] == []
    api.checked("Bad reviewRules flags are rejected as 400 without creating a delivery, review, archive or audit change")

    api.reject(owner, path + "/delivery", {"files": FILES, "reviewRules": True}, role="buyer", codes=(403,))
    api.reject(outsider, path + "/delivery", {"files": FILES, "expectedDeliveryId": None, "reviewRules": True}, role="seller", codes=(404,))
    quote = roles.quote_response(api.ok(owner, path + "/delivery", {"files": FILES, "expectedDeliveryId": None, "reviewRules": True}, role="seller"), "seller")
    first_id = quote["proof"]["delivery"]["id"]
    first_review = quote["proof"]["review"]
    assert quote["proof"]["delivery"]["files"] == FILES
    assert [(event["kind"], event.get("deliveryId")) for event in quote["proof"]["audit"][-2:]] == [("delivery_submitted", first_id), ("reviewed", first_id)]
    checked_review(quote)
    api.checked("Seller combined upload immediately saves current provider-free rule review and ordered audit events; no submission, AI assessment, buyer acceptance or payment is triggered")

    unchanged(api, owner, quote_id, path + "/review", {"deliveryId": "stale-version"}, 409)
    unchanged(api, owner, quote_id, path + "/review", {"deliveryId": None}, 409)
    assert roles.quote_response(api.ok(owner, path + "/review", {"deliveryId": first_id}, role="seller"), "seller") == quote
    assert roles.quote_response(api.ok(owner, path + "/review", {}, role="seller"), "seller") == quote
    unchanged(api, owner, quote_id, path + "/assess", {"deliveryId": first_id, "confirm": False}, 400, message="confirm")
    unchanged(api, owner, quote_id, path + "/assess", {"deliveryId": first_id, "confirm": True}, 409, message="not configured")
    api.checked("Cached rule reviews still reject an explicitly stale delivery ID; AI assessment remains a separate explicit-confirm action with a truthful no-key error")

    revised = {**FILES, "index.html": SOURCE.replace("First synthetic delivery", "Second synthetic delivery")}
    quote = roles.quote_response(api.ok(owner, path + "/delivery", {"files": revised, "expectedDeliveryId": first_id, "reviewRules": True}, role="seller"), "seller")
    second_id = quote["proof"]["delivery"]["id"]
    assert second_id != first_id and quote["proof"]["delivery"]["sequence"] == 2
    checked_review(quote)
    versions = api.ok(owner, path + "/versions")["versions"]
    assert len(versions) == 2 and {item["delivery"]["id"] for item in versions} == {first_id, second_id}
    archive = api.ok(owner, path + "/versions/" + first_id)["version"]
    assert archive["delivery"]["files"] == FILES and archive["review"] == first_review
    assert sum(item["kind"] == "delivery_submitted" for item in quote["proof"]["audit"]) == 2
    assert sum(item["kind"] == "reviewed" for item in quote["proof"]["audit"]) == 2
    unchanged(api, owner, quote_id, path + "/delivery", {"files": FILES, "expectedDeliveryId": first_id, "reviewRules": True}, 409)
    versions_after = api.ok(owner, path + "/versions")["versions"]
    assert len(versions_after) == 2 and {item["delivery"]["id"] for item in versions_after} == {first_id, second_id}
    assert api.ok(owner, path + "/versions/" + first_id)["version"] == archive
    api.checked("Combined replacement archives exactly one old snapshot with its own review, saves the new current review once and rejects stale uploads without extra archives")

    quote = roles.quote_response(api.ok(owner, path + "/delivery", {"files": FILES, "expectedDeliveryId": second_id, "reviewRules": False}, role="seller"), "seller")
    third_id = quote["proof"]["delivery"]["id"]
    assert "review" not in quote["proof"]
    unsubmitted_without_decisions(quote)
    unchanged(api, owner, quote_id, path + "/review", {"deliveryId": second_id}, 409)
    quote = roles.quote_response(api.ok(owner, path + "/review", {"deliveryId": third_id}, role="seller"), "seller")
    checked_review(quote)
    quote = roles.quote_response(api.ok(owner, path + "/delivery", {"files": revised, "expectedDeliveryId": third_id}, role="seller"), "seller")
    assert "review" not in quote["proof"]
    unsubmitted_without_decisions(quote)
    quote = roles.quote_response(api.ok(owner, path + "/review", {}, role="seller"), "seller")
    checked_review(quote)
    api.checked("False and omitted reviewRules preserve the old upload-only behavior; explicit-current and legacy-empty review requests remain compatible and provider-free")

    seller = actor("real-seller")
    shared = roles.quote_response(api.ok(owner, "/api/proofs", project("Real collaboration combined rule review QA", roleplay=False)), "buyer", roleplay=False)
    shared_path = "/api/proofs/" + shared["id"]
    api.ok(owner, shared_path + "/approve", {}, role="buyer")
    invitation = api.ok(owner, shared_path + "/invite", {"email": seller.email}, role="buyer")["invitation"]
    api.ok(seller, "/api/proof-invitations/accept", {"token": invitation["token"], "confirm": True, "sellerName": "Smooth QA seller"})
    invitation = None
    api.reject(owner, shared_path + "/delivery", {"files": FILES, "reviewRules": True}, role="seller", codes=(403,))
    shared = roles.quote_response(api.ok(seller, shared_path + "/delivery", {"files": FILES, "expectedDeliveryId": None, "reviewRules": True}), "seller", roleplay=False)
    checked_review(shared)
    api.checked("Real collaboration keeps server membership permissions while allowing its actual seller to save files and rule review together")
    print(json.dumps({"scope": "Synthetic isolated loopback API; no real gateway or browser verification", "passed": len(api.checks), "checks": api.checks,
                      "provider_calls": "None; empty provider configuration required. Route calls rule review with an explicit empty provider environment.",
                      "not_exercised": ["Real model generation or paid requests", "Production access, browser smoothness or payment providers"]}, indent=2))


if __name__ == "__main__":
    main()
