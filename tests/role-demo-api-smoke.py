"""Role-demo integration checks against an already running isolated local Worker.

Set BRIEFPAY_ROLE_DEMO_TEST_URL to its loopback origin (default port 8789).
Build/migrate/start the Worker separately with empty provider configuration.
This script neither reads credentials nor starts servers. Before any mutation,
it requires demo AI/payment configuration. HTTP proxies and redirects are off.

Trusted-gateway identity headers are synthetic application-layer fixtures. This
does not verify the real Sites authentication gateway, separate browser users,
seller settlement, provider connectivity, or real browser layout measurements.
Records remain in the isolated D1. Invitation tokens are never printed.
"""

import copy
import json
import os
import re
from dataclasses import dataclass
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


@dataclass(frozen=True)
class Actor:
    identifier: str
    email: str


OWNER = Actor("role-demo-qa-owner", "owner@role-demo.test")
SELLER = Actor("role-demo-qa-seller", "seller@role-demo.test")
OUTSIDER = Actor("role-demo-qa-outsider", "outsider@role-demo.test")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


class LocalAPI:
    def __init__(self, origin):
        parsed = urlparse(origin)
        assert parsed.scheme in {"http", "https"}, "Use an HTTP(S) loopback origin"
        assert parsed.hostname in {"127.0.0.1", "localhost", "::1"}, "Loopback only"
        assert not parsed.username and not parsed.password, "No URL credentials"
        assert parsed.path in {"", "/"} and not parsed.query and not parsed.fragment, "Use a plain origin"
        self.origin = origin.rstrip("/")
        self.opener = build_opener(ProxyHandler({}), NoRedirect())
        self.checks = []
        self.delivery_views = {}

    def with_delivery_baseline(self, actor, path, payload):
        """Mirror the caller's last read without silently refreshing a stale upload."""
        match = re.fullmatch(r"/api/proofs/([^/]+)/delivery", path)
        if actor is not None and match and isinstance(payload, dict) and "expectedDeliveryId" not in payload:
            key = (actor.identifier, match.group(1))
            if key in self.delivery_views:
                return {**payload, "expectedDeliveryId": self.delivery_views[key]}
        return payload

    def request(self, actor, path, payload=None, role=None, method=None):
        assert path.startswith(("/api/", "/deliveries/", "/proof-versions/")), "Unexpected path"
        assert "?" not in path and "#" not in path, "No credentials or invitation tokens in URLs"
        headers = {"Content-Type": "application/json", "Origin": self.origin}
        if actor is not None:
            headers["oai-authenticated-user-id"] = actor.identifier
            headers["oai-authenticated-user-email"] = actor.email
        if role is not None:
            headers["x-proof-demo-role"] = role
        data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = Request(self.origin + path, data=data, headers=headers, method=method)
        try:
            response = self.opener.open(req, timeout=40)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read().decode("utf-8")
            try:
                result = json.loads(raw)
            except ValueError:
                result = raw
            if actor is not None and response.status in {200, 201} and isinstance(result, dict):
                quote = result.get("quote")
                if isinstance(quote, dict) and quote.get("workflow") == "proof-v1":
                    self.delivery_views[(actor.identifier, quote["id"])] = quote["proof"].get("delivery", {}).get("id")
            return response.status, result, {key.lower(): value for key, value in response.headers.items()}

    @staticmethod
    def diagnostic(value):
        message = value.get("error", "Unexpected JSON response") if isinstance(value, dict) else "Non-JSON response"
        return re.sub(r"[0-9a-fA-F]{64}", "[redacted]", str(message))[:200]

    def ok(self, actor, path, payload=None, role=None, method=None):
        payload = self.with_delivery_baseline(actor, path, payload)
        code, result, _ = self.request(actor, path, payload, role, method)
        assert code in {200, 201}, (path, code, self.diagnostic(result))
        assert isinstance(result, dict), (path, "Expected JSON object")
        return result

    def reject(self, actor, path, payload=None, role=None, codes=(403,), method=None):
        payload = self.with_delivery_baseline(actor, path, payload)
        code, result, _ = self.request(actor, path, payload, role, method)
        assert code in codes, (path, code, codes, self.diagnostic(result))

    def checked(self, description):
        self.checks.append(description)


def private_columns_absent(value):
    forbidden = {"sellerid", "ownerid", "invitationhash", "invitationemail", "invitationexpiresat"}
    if isinstance(value, dict):
        for key, child in value.items():
            assert key.replace("_", "").lower() not in forbidden, "Private database column leaked"
            private_columns_absent(child)
    elif isinstance(value, list):
        for child in value:
            private_columns_absent(child)


def seller_projection(quote):
    assert not any(quote.get(key) for key in ("paypalOrderId", "paypalApprovalUrl", "captureId"))
    assert not quote["proof"].get("authorizationId"), "Seller must not receive buyer payment identifiers"


def quote_response(result, role, roleplay=True):
    assert result.get("role") == role, "Server resolved an unexpected role"
    quote = result["quote"]
    assert quote["workflow"] == "proof-v1"
    assert quote["aiMode"] == "demo" and quote["paymentMode"] == "demo", "Stop: provider-free records only"
    assert (quote["proof"].get("demoRoleplay") is True) == roleplay
    private_columns_absent(quote)
    if role == "seller":
        seller_projection(quote)
    return quote


def no_payment(quote):
    assert quote["proof"]["paymentState"] == "unfunded"
    assert not any(quote.get(key) for key in ("paypalOrderId", "paypalApprovalUrl", "captureId", "paidAt"))
    assert not any(quote["proof"].get(key) for key in (
        "authorizationId", "acceptedAt", "acceptedDeliveryId", "manualChecks", "paymentOperation",
    )), "Nonfinancial acceptance must not write financial-consent fields"


def shared(quote):
    return quote["proof"]["collaboration"]


def custom_specification(title, collaborative=True):
    return {
        "mode": "custom", "title": title, "summary": "Synthetic role-header isolation regression",
        "clientName": "Role QA buyer", "amount": "1.00", "currency": "AUD", "language": "en",
        "requiredPages": ["index.html"], "manualRequirements": [], "collaborative": collaborative,
    }


REGRESSION_FILES = {"index.html": "<!doctype html><html><head><title>QA page</title></head><body>QA content</body></html>"}


def main():
    api = LocalAPI(os.environ.get("BRIEFPAY_ROLE_DEMO_TEST_URL", "http://127.0.0.1:8789"))
    config = api.ok(OWNER, "/api/config")
    assert config.get("aiMode") == "demo" and config.get("paymentMode") == "demo", "Use empty provider configuration; no records have been created"

    create_input = {
        "mode": "demo", "demoRoleplay": True, "language": "en", "currency": "AUD",
        "paymentMode": "sandbox", "aiMode": "live", "totalCents": 1,
        "sellerId": OUTSIDER.identifier, "role": "seller",
    }
    api.reject(None, "/api/proofs", create_input, role="buyer", codes=(401,))
    api.reject(OWNER, "/api/proofs", {**create_input, "mode": "custom"}, role="buyer", codes=(400,))
    # Creation always establishes the authenticated account as buyer, even if
    # the browser was displaying the seller workspace before this request.
    quote = quote_response(api.ok(OWNER, "/api/proofs", create_input, role="seller"), "buyer")
    quote_id = quote["id"]
    path = "/api/proofs/" + quote_id
    quote_path = "/api/quotes/" + quote_id
    assert quote["totalCents"] == 48000, "The fixed demo scope must ignore a forged amount"
    assert quote["proof"].get("demoSampleProject") is True, "Only fixed built-in role play enables controlled samples"
    assert quote["status"] == "draft" and shared(quote)["stage"] == "awaiting_seller"
    no_payment(quote)
    api.checked("Role-demo creation requires identity, fixed demo scope and provider-free modes despite forged payload fields")

    quote_response(api.ok(OWNER, quote_path), "buyer")
    for role in ("buyer", "seller"):
        quote_response(api.ok(OWNER, quote_path, role=role), role)
        listed = api.ok(OWNER, "/api/proofs", role=role)
        assert listed["roles"][quote_id] == role
        assert len([item for item in listed["quotes"] if item["id"] == quote_id]) == 1
    quote_response(api.ok(OWNER, quote_path, role="administrator"), "buyer")
    api.reject(OWNER, path + "/approve", {}, role="seller")
    for role in ("buyer", "seller"):
        api.reject(OWNER, path + "/invite", {"email": SELLER.email}, role=role, codes=(403, 409))
        api.reject(OWNER, path + "/invite", {"revoke": True}, role=role, codes=(403, 409))
    quote = quote_response(api.ok(OWNER, path + "/approve", {}, role="buyer"), "buyer")
    assert quote["status"] == "approved" and shared(quote)["stage"] == "in_progress"
    assert shared(quote)["sellerName"] and shared(quote)["sellerJoinedAt"]
    assert sum(item["kind"] == "seller_joined" for item in quote["proof"]["audit"]) == 1
    repeated = quote_response(api.ok(OWNER, path + "/approve", {}, role="buyer"), "buyer")
    assert repeated == quote, "Repeated scope approval must not add virtual sellers or events"
    no_payment(quote)
    api.checked("Only the owner can select a demo perspective; buyer approval joins the virtual seller exactly once and invitations are disabled")

    forbidden_seller_actions = {
        "approve": {}, "checkout": {}, "authorize": {"orderId": "forged"},
        "capture": {"confirm": True}, "void": {"confirm": True}, "reconcile": {},
        "accept_delivery": {"confirm": True, "deliveryId": "forged", "manualChecks": []},
        "return": {"deliveryId": "forged", "feedback": []},
    }
    for action, payload in forbidden_seller_actions.items():
        api.reject(OWNER, path + "/" + action, payload, role="seller")
    api.reject(OWNER, path + "/delivery", {"variant": "flawed"}, role="buyer")
    api.reject(OWNER, path + "/submit_delivery", {"deliveryId": "forged", "note": "Buyer cannot submit"}, role="buyer")
    for role in ("buyer", "seller"):
        api.reject(OWNER, path + "/invite", {"email": SELLER.email}, role=role, codes=(403, 409))
    api.checked("Demo role selection preserves buyer-only scope, acceptance and payment actions and seller-only upload/submission actions")

    quote = quote_response(api.ok(OWNER, path + "/delivery", {"variant": "flawed"}, role="seller"), "seller")
    first = copy.deepcopy(quote["proof"]["delivery"])
    first_id = first["id"]
    assert first["sequence"] == 1 and "contact.html" not in first["files"]
    assert "delivery-manifest.json" not in first["files"], "Sample manifest is not an uploaded HTML/CSS artifact"
    api.reject(OWNER, path + "/submit_delivery", {"deliveryId": first_id, "note": "Before review"}, role="seller", codes=(409,))
    quote = quote_response(api.ok(OWNER, path + "/review", {}, role="seller"), "seller")
    first_review = copy.deepcopy(quote["proof"]["review"])
    assert first_review["deliveryId"] == first_id and first_review["mode"] == "demo"
    failed = [item for item in quote["proof"]["delivery"]["evidence"] if item["finding"] == "fail"]
    assert failed, "First sample must actually fail an agreed criterion"
    note_one = "First delivery; please review the incomplete booking destination."
    quote = quote_response(api.ok(OWNER, path + "/submit_delivery", {"deliveryId": first_id, "note": note_one}, role="seller"), "seller")
    assert shared(quote)["stage"] == "submitted" and shared(quote)["submission"]["note"] == note_one
    api.reject(OWNER, path + "/delivery", {"variant": "fixed"}, role="seller", codes=(409,))
    api.reject(OWNER, path + "/accept_delivery", {"deliveryId": first_id, "confirm": True, "manualChecks": ["mobile"]}, role="buyer", codes=(409,))
    feedback = [{"criterionId": failed[0]["criterionId"], "comment": "Deliver the missing contact page and booking destination."}]
    quote = quote_response(api.ok(OWNER, path + "/return", {"deliveryId": first_id, "feedback": feedback}, role="buyer"), "buyer")
    assert shared(quote)["stage"] == "changes_requested"
    assert len(shared(quote)["feedback"]) == 1 and shared(quote)["feedback"][0]["deliveryId"] == first_id
    assert shared(quote)["feedback"][0]["criterionId"] == failed[0]["criterionId"]
    first_feedback = copy.deepcopy(shared(quote)["feedback"])
    no_payment(quote)
    api.checked("Seller submits the actual flawed sample; buyer cannot accept failures and returns specific criterion-bound feedback")

    quote = quote_response(api.ok(OWNER, path + "/delivery", {"variant": "fixed"}, role="seller"), "seller")
    second = quote["proof"]["delivery"]
    second_id = second["id"]
    assert second_id != first_id and second["sequence"] == 2 and "contact.html" in second["files"]
    assert not quote["proof"].get("review") and not shared(quote).get("submission") and not shared(quote).get("acceptance")
    no_payment(quote)
    archive_path = path + "/versions/" + first_id
    archive = api.ok(OWNER, archive_path, role="buyer")["version"]
    assert archive["delivery"] == first and archive["review"] == first_review
    assert archive["submission"]["deliveryId"] == first_id and archive["submission"]["note"] == note_one
    assert archive["feedback"] == first_feedback
    archive_before = copy.deepcopy(archive)
    for role in ("buyer", "seller"):
        versions = api.ok(OWNER, path + "/versions", role=role)["versions"]
        assert len(versions) == 2 and {item["delivery"]["id"] for item in versions} == {first_id, second_id}
        assert [item["delivery"]["id"] for item in versions if item.get("isCurrent")] == [second_id]
        assert all("files" not in item["delivery"] for item in versions)
        assert api.ok(OWNER, archive_path, role=role)["version"] == archive_before
        current_version = api.ok(OWNER, path + "/versions/" + second_id, role=role)["version"]
        assert current_version["delivery"]["files"] == second["files"] and not current_version["feedback"]
        code, source, headers = api.request(OWNER, "/proof-versions/" + quote_id + "/" + first_id + "/index.html", role=role)
        assert code == 200 and source == first["files"]["index.html"]
        assert "sandbox allow-same-origin" in headers.get("content-security-policy", "")
        assert "allow-scripts" not in headers.get("content-security-policy", "")
        api.reject(OWNER, "/deliveries/" + quote_id + "/" + first_id + "/index.html", role=role, codes=(404,))
    api.checked("Fixed replacement clears current review/submission while both perspectives retain exact immutable old files, review, note and feedback")

    quote = quote_response(api.ok(OWNER, path + "/review", {}, role="seller"), "seller")
    evidence = quote["proof"]["delivery"]["evidence"]
    assert not any(item["finding"] == "fail" for item in evidence)
    checks = sorted({item["criterionId"] for item in evidence if item["finding"] == "needs_human"})
    assert checks == ["manual-1", "mobile"], "The built-in demo requires opening-hours and mobile confirmation"
    note_two = "Revised complete website, including the booking section."
    quote = quote_response(api.ok(OWNER, path + "/submit_delivery", {"deliveryId": second_id, "note": note_two}, role="seller"), "seller")
    assert shared(quote)["stage"] == "submitted"
    acceptance_input = {"deliveryId": second_id, "confirm": True, "manualChecks": checks}
    api.reject(OWNER, path + "/accept_delivery", acceptance_input, role="seller")
    api.reject(OWNER, path + "/accept_delivery", {**acceptance_input, "deliveryId": first_id}, role="buyer", codes=(409,))
    api.reject(OWNER, path + "/accept_delivery", {**acceptance_input, "confirm": False}, role="buyer", codes=(400,))
    api.reject(OWNER, path + "/accept_delivery", {**acceptance_input, "manualChecks": []}, role="buyer", codes=(400,))
    api.reject(OWNER, path + "/accept_delivery", {**acceptance_input, "manualChecks": ["mobile"]}, role="buyer", codes=(400,))
    quote = quote_response(api.ok(OWNER, path + "/accept_delivery", acceptance_input, role="buyer"), "buyer")
    assert shared(quote)["stage"] == "accepted"
    assert shared(quote)["acceptance"]["deliveryId"] == second_id
    assert sorted(shared(quote)["acceptance"]["manualChecks"]) == checks
    no_payment(quote)
    quote_response(api.ok(OWNER, quote_path, role="seller"), "seller")
    api.reject(OWNER, path + "/delivery", {"variant": "flawed"}, role="seller", codes=(409,))
    api.reject(OWNER, path + "/capture", acceptance_input, role="buyer", codes=(400, 409))
    api.checked("Buyer independently accepts the revised version with required human checks; acceptance leaves payment unfunded with no order")

    checkout = api.ok(OWNER, path + "/checkout", {}, role="buyer")
    assert checkout["mode"] == "demo" and checkout["orderId"].startswith("DEMO-") and not checkout.get("approvalUrl")
    quote = quote_response(api.ok(OWNER, path + "/authorize", {"orderId": checkout["orderId"]}, role="buyer"), "buyer")
    assert quote["proof"]["paymentState"] == "authorized" and quote["proof"]["authorizationId"].startswith("SIM-")
    quote_response(api.ok(OWNER, quote_path, role="seller"), "seller")
    api.reject(OWNER, path + "/capture", acceptance_input, role="seller")
    api.reject(OWNER, path + "/capture", {**acceptance_input, "confirm": False}, role="buyer", codes=(400, 409))
    api.reject(OWNER, path + "/capture", {**acceptance_input, "manualChecks": []}, role="buyer", codes=(400, 409))
    quote = quote_response(api.ok(OWNER, path + "/capture", acceptance_input, role="buyer"), "buyer")
    assert quote["status"] == "paid" and quote["proof"]["paymentState"] == "captured"
    assert quote["captureId"].startswith("SIM-")
    assert quote_response(api.ok(OWNER, path + "/capture", acceptance_input, role="buyer"), "buyer") == quote
    quote_response(api.ok(OWNER, quote_path, role="seller"), "seller")
    assert api.ok(OWNER, archive_path, role="buyer")["version"] == archive_before
    api.checked("Buyer may separately simulate authorization/capture with fresh confirmation; seller projection hides payment identifiers and archives stay unchanged")

    resources = (quote_path, path + "/versions", archive_path,
                 "/proof-versions/" + quote_id + "/" + first_id + "/index.html",
                 "/deliveries/" + quote_id + "/" + second_id + "/index.html")
    for actor in (OUTSIDER, None):
        for role in ("buyer", "seller"):
            for resource in resources:
                api.reject(actor, resource, role=role, codes=(401, 404))
            api.reject(actor, path + "/delivery", {"variant": "fixed"}, role=role, codes=(401, 404))
            listed = api.ok(actor, "/api/proofs", role=role)
            assert not any(item["id"] == quote_id for item in listed["quotes"])
            assert quote_id not in listed.get("roles", {})
    api.checked("Outsider/anonymous role headers cannot read, list, mutate or preview the owner's role-demo project")

    ordinary = quote_response(api.ok(OWNER, "/api/proofs", custom_specification("Ordinary collaboration role-header isolation"), role="seller"), "buyer", roleplay=False)
    ordinary_id = ordinary["id"]
    ordinary_path = "/api/proofs/" + ordinary_id
    quote_response(api.ok(OWNER, ordinary_path + "/approve", {}, role="seller"), "buyer", roleplay=False)
    quote_response(api.ok(OWNER, "/api/quotes/" + ordinary_id, role="seller"), "buyer", roleplay=False)
    api.reject(OWNER, ordinary_path + "/delivery", {"files": REGRESSION_FILES}, role="seller")
    invitation = api.ok(OWNER, ordinary_path + "/invite", {"email": SELLER.email}, role="seller")["invitation"]
    token = invitation["token"]
    assert re.fullmatch(r"[0-9a-f]{64}", token), "Real collaboration still uses a random invitation"
    joined = api.ok(SELLER, "/api/proof-invitations/accept", {"token": token, "confirm": True, "sellerName": "QA actual seller"}, role="buyer")
    quote_response(joined, "seller", roleplay=False)
    quote_response(api.ok(SELLER, "/api/quotes/" + ordinary_id, role="buyer"), "seller", roleplay=False)
    for action in ("approve", "checkout", "authorize", "capture", "void", "reconcile", "accept_delivery"):
        api.reject(SELLER, ordinary_path + "/" + action, {"confirm": True}, role="buyer")
    ordinary_list = api.ok(SELLER, "/api/proofs", role="buyer")
    assert ordinary_list["roles"][ordinary_id] == "seller"
    api.checked("Ordinary collaborative membership ignores demo-role headers: buyer cannot upload and a joined seller cannot impersonate the buyer")

    legacy = quote_response(api.ok(OWNER, "/api/proofs", custom_specification("Legacy role-header isolation", collaborative=False), role="seller"), "buyer", roleplay=False)
    legacy_path = "/api/proofs/" + legacy["id"]
    assert not legacy["proof"].get("collaboration")
    quote_response(api.ok(OWNER, legacy_path + "/approve", {}, role="seller"), "buyer", roleplay=False)
    legacy = quote_response(api.ok(OWNER, legacy_path + "/delivery", {"files": REGRESSION_FILES}, role="seller"), "buyer", roleplay=False)
    assert legacy["proof"]["delivery"]["files"] == REGRESSION_FILES
    legacy = quote_response(api.ok(OWNER, legacy_path + "/review", {}, role="seller"), "buyer", roleplay=False)
    assert legacy["proof"]["review"]["deliveryId"] == legacy["proof"]["delivery"]["id"]
    for actor in (SELLER, OUTSIDER):
        api.reject(actor, "/api/quotes/" + legacy["id"], role="buyer", codes=(404,))
    api.checked("Legacy single-owner custom workflow ignores demo-role headers and retains private owner upload/review behavior")

    print(json.dumps({
        "scope": "Isolated loopback Worker, application layer, synthetic trusted identity headers",
        "passed": len(api.checks), "checks": api.checks,
        "payment": "Only provider-free demo authorization/capture; no PayPal request",
        "ai": "Demo configuration required before every fixture; no AI-provider request",
        "not_exercised": ["Production Sites authentication/access gateway or real dual-account login", "Real browser layout measurements or seller settlement"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
