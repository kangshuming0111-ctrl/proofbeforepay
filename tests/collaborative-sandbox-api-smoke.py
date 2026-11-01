"""Two synthetic identities through local API/D1 and a network-blocked provider fixture.

Requires an isolated source-export build wrapped by sandbox-provider-worker.mjs,
with its fixed synthetic config. This never connects to PayPal and is not proof
of two actual sign-ins or an actual Sandbox transaction.
"""
import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("synthetic_sandbox_roles", Path(__file__).with_name("role-demo-api-smoke.py"))
roles = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = roles
_spec.loader.exec_module(roles)


def quote_response(result, role, payment_mode="sandbox"):
    assert result.get("role") == role
    quote = result["quote"]
    assert quote["workflow"] == "proof-v1" and quote["paymentMode"] == payment_mode
    assert not quote["proof"].get("demoRoleplay")
    roles.private_columns_absent(quote)
    if role == "seller":
        roles.seller_projection(quote)
    return quote


def no_payment_resources(value):
    if isinstance(value, dict):
        assert not {"paypalOrderId", "paypalApprovalUrl", "captureId", "authorizationId"}.intersection(value)
        for child in value.values():
            no_payment_resources(child)
    elif isinstance(value, list):
        for child in value:
            no_payment_resources(child)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("BRIEFPAY_COLLAB_SANDBOX_TEST_URL", "http://127.0.0.1:8794"))
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker.get("syntheticConfiguration") is True and marker.get("outboundFetch") == "blocked", "Stop: only use the fixed synthetic, network-blocked Worker"
    run = uuid4().hex
    buyer = roles.Actor("synthetic-sandbox-buyer-" + run, "buyer@synthetic-sandbox.example")
    seller = roles.Actor("synthetic-sandbox-seller-" + run, "seller@synthetic-sandbox.example")
    outsider = roles.Actor("synthetic-sandbox-outsider-" + run, "outsider@synthetic-sandbox.example")
    config = api.ok(buyer, "/api/config")
    assert config["aiMode"] == "demo" and config["paymentMode"] == "sandbox"
    base = {"mode": "custom", "collaborative": True, "demoRoleplay": False,
            "paymentTesting": "collaborative-sandbox", "language": "en", "currency": "AUD",
            "title": "Synthetic two-account website", "summary": "Local API/D1 test; no external provider",
            "amount": "1.00", "requiredPages": ["index.html", "contact.html"], "manualRequirements": []}
    api.reject(None, "/api/proofs", base, codes=(401,))
    for patch in ({"mode": "demo"}, {"collaborative": False}, {"demoRoleplay": True}, {"paymentTesting": "live"}):
        api.reject(buyer, "/api/proofs", {**base, **patch}, codes=(400,))
    legacy = dict(base)
    del legacy["paymentTesting"]
    quote = quote_response(api.ok(buyer, "/api/proofs", {**legacy, "paymentMode": "sandbox", "sandboxCollaboration": True, "proof": {"sandboxCollaboration": True}}), "buyer", payment_mode="demo")
    assert quote["paymentMode"] == "demo" and quote["proof"].get("sandboxCollaboration") is None
    api.checked("Only the explicit authenticated configured creation selector sets the Sandbox marker; forged fields and existing collaborative modes do not upgrade")

    quote = quote_response(api.ok(buyer, "/api/proofs", base, role="seller"), "buyer")
    assert quote["paymentMode"] == "sandbox" and quote["proof"]["sandboxCollaboration"] is True
    assert not quote["proof"].get("demoRoleplay")
    quote_id = quote["id"]
    path = "/api/proofs/" + quote_id
    api.ok(buyer, path + "/approve", {}, role="seller")
    api.reject(buyer, path + "/checkout", {}, codes=(409,))
    invitation = api.ok(buyer, path + "/invite", {"email": seller.email})["invitation"]
    api.reject(outsider, "/api/proof-invitations/accept", {"token": invitation["token"], "confirm": True, "sellerName": "Wrong seller"}, codes=(404,))
    quote = quote_response(api.ok(seller, "/api/proof-invitations/accept", {"token": invitation["token"], "confirm": True, "sellerName": "Synthetic invited seller"}), "seller")
    assert quote["proof"]["collaboration"]["stage"] == "in_progress"
    api.reject(buyer, path + "/delivery", {"files": {}, "expectedDeliveryId": None}, role="seller", codes=(403,))
    for who in (seller, outsider):
        for action in ("checkout", "authorize", "capture", "void", "reconcile"):
            api.reject(who, path + "/" + action, {"confirm": True}, role="buyer", codes=(403,) if who == seller else (404,))
    api.reject(outsider, "/api/quotes/" + quote_id, codes=(404,))
    api.checked("Email-bound invitation persists seller membership; forged role headers cannot grant uploads or financial authority; unrelated identity is denied")

    html = "<!doctype html><html><head><title>Website</title></head><body><main>Business details</main></body></html>"
    quote = quote_response(api.ok(seller, path + "/delivery", {"files": {"index.html": html}, "expectedDeliveryId": None, "reviewRules": True}), "seller")
    first_id = quote["proof"]["delivery"]["id"]
    api.ok(seller, path + "/submit_delivery", {"deliveryId": first_id, "note": "Initial source files"})
    api.reject(buyer, path + "/accept_delivery", {"deliveryId": first_id, "confirm": True, "manualChecks": ["mobile"]}, codes=(409,))
    api.ok(buyer, path + "/return", {"deliveryId": first_id, "feedback": [{"criterionId": "page-2", "comment": "Supply the agreed contact page."}]})
    quote = quote_response(api.ok(seller, path + "/delivery", {"files": {"index.html": html, "contact.html": html}, "expectedDeliveryId": first_id, "reviewRules": True}), "seller")
    current_id = quote["proof"]["delivery"]["id"]
    assert current_id != first_id
    api.reject(seller, path + "/delivery", {"files": {"index.html": html}, "expectedDeliveryId": first_id}, codes=(409,))
    api.reject(seller, path + "/submit_delivery", {"deliveryId": first_id, "note": "Stale"}, codes=(409,))
    api.ok(seller, path + "/submit_delivery", {"deliveryId": current_id, "note": "Revised contact page included"})
    api.reject(buyer, path + "/accept_delivery", {"deliveryId": first_id, "confirm": True, "manualChecks": ["mobile"]}, codes=(409,))
    api.ok(buyer, path + "/accept_delivery", {"deliveryId": current_id, "confirm": True, "manualChecks": ["mobile"]})
    api.checked("Seller revision and buyer acceptance use the exact current snapshot; stale upload, submission and acceptance are rejected")

    checkout = api.ok(buyer, path + "/checkout", {})
    assert checkout["mode"] == "sandbox" and checkout["orderId"].startswith("LOCAL-ORDER-")
    api.ok(buyer, path + "/authorize", {"orderId": checkout["orderId"]})
    api.reject(buyer, path + "/capture", {"deliveryId": first_id, "confirm": True, "manualChecks": ["mobile"]}, codes=(400, 409))
    api.reject(seller, path + "/capture", {"deliveryId": current_id, "confirm": True, "manualChecks": ["mobile"]}, role="buyer", codes=(403,))
    consent = {"deliveryId": current_id, "confirm": True, "manualChecks": ["mobile"]}
    receipt = quote_response(api.ok(buyer, path + "/capture", consent), "buyer")
    assert receipt["status"] == "paid" and receipt["proof"]["paymentState"] == "captured"
    assert receipt["proof"]["acceptedDeliveryId"] == current_id and receipt["captureId"].startswith("LOCAL-CAPTURE-")
    assert quote_response(api.ok(buyer, path + "/capture", consent), "buyer") == receipt
    seller_view = quote_response(api.ok(seller, "/api/quotes/" + quote_id), "seller")
    assert not any(seller_view.get(key) for key in ("paypalOrderId", "paypalApprovalUrl", "captureId"))
    assert not seller_view["proof"].get("authorizationId")
    no_payment_resources(api.ok(seller, path + "/versions"))
    no_payment_resources(api.ok(seller, path + "/versions/" + current_id))
    no_payment_resources(api.ok(seller, path + "/versions/" + first_id))
    persisted = quote_response(api.ok(buyer, "/api/quotes/" + quote_id), "buyer")
    assert persisted == receipt
    api.checked("Buyer-only mocked authorization/capture persists one exact-version receipt; retries reuse it and seller transport omits buyer payment resources")
    marker_after = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    print(json.dumps({"result": "passed", "checks": api.checks, "providerNetworkRequests": 0,
                      "syntheticProviderFetches": marker_after["syntheticCalls"] - marker["syntheticCalls"],
                      "scope": "isolated local API/D1, synthetic trusted identity fixtures and network-blocked provider responses; not real sign-ins or Sandbox funds"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
