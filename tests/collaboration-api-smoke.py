"""Application-layer integration checks for an isolated, already running Worker.

Default: http://127.0.0.1:8789; override with BRIEFPAY_COLLAB_TEST_URL.
Run only after building, migrating an isolated local D1, and starting that Worker.
The script neither starts a server nor reads credentials or database files.

Trusted-gateway identity headers are simulated here, not in deployable app code.
This is NOT a test of the production Sites authentication/access gateway, browser
sign-in, email delivery, real browser measurements, AI, or PayPal connectivity.
All provider modes must be demo before any mutating request is sent. Redirects
and environment HTTP proxies are disabled, so requests stay on the local origin.
Fixtures are deliberately synthetic; the script leaves its test records in D1.
"""

import copy
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


@dataclass(frozen=True)
class Actor:
    identifier: str
    email: str


BUYER = Actor("collab-qa-buyer-a", "buyer@test.example")
SELLER = Actor("collab-qa-seller-b", "seller@test.example")
OUTSIDER = Actor("collab-qa-outsider-c", "outsider@test.example")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


class LocalAPI:
    def __init__(self, origin):
        parsed = urlparse(origin)
        assert parsed.scheme in {"http", "https"}, "Use an HTTP(S) loopback origin"
        assert parsed.hostname in {"127.0.0.1", "localhost", "::1"}, "Loopback only"
        assert not parsed.username and not parsed.password, "Do not supply credentials"
        assert parsed.path in {"", "/"} and not parsed.query and not parsed.fragment, "Use a plain local origin"
        self.origin = origin.rstrip("/")
        self.opener = build_opener(ProxyHandler({}), NoRedirect())
        self.checks = []
        self.delivery_views = {}

    def with_delivery_baseline(self, actor, path, payload):
        """Use only this caller's previously observed view; never fetch a fresher baseline."""
        match = re.fullmatch(r"/api/proofs/([^/]+)/delivery", path)
        if actor is not None and match and isinstance(payload, dict) and "expectedDeliveryId" not in payload:
            key = (actor.identifier, match.group(1))
            if key in self.delivery_views:
                return {**payload, "expectedDeliveryId": self.delivery_views[key]}
        return payload

    def request(self, actor, path, payload=None, method=None):
        assert path.startswith(("/api/", "/deliveries/", "/proof-versions/")), "Unexpected path"
        assert "#" not in path and "?" not in path, "No invitation tokens or credentials in URLs"
        headers = {"Content-Type": "application/json", "Origin": self.origin}
        if actor is not None:
            headers["oai-authenticated-user-id"] = actor.identifier
            headers["oai-authenticated-user-email"] = actor.email
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
            return response.status, result, {name.lower(): value for name, value in response.headers.items()}

    @staticmethod
    def diagnostic(result):
        # Never print invitation bearer tokens or whole delivery snapshots.
        text = result.get("error", "Unexpected response") if isinstance(result, dict) else "Non-JSON response"
        return re.sub(r"[0-9a-fA-F]{64}", "[redacted]", str(text))[:250]

    def ok(self, actor, path, payload=None, method=None):
        payload = self.with_delivery_baseline(actor, path, payload)
        code, result, _ = self.request(actor, path, payload, method)
        assert code in {200, 201}, (path, code, self.diagnostic(result))
        assert isinstance(result, dict), (path, "Expected JSON object")
        return result

    def reject(self, actor, path, payload=None, codes=(403,), method=None):
        payload = self.with_delivery_baseline(actor, path, payload)
        code, result, _ = self.request(actor, path, payload, method)
        assert code in codes, (path, code, codes, self.diagnostic(result))
        return code

    def checked(self, description):
        self.checks.append(description)


def page(title, text):
    return ("<!doctype html><html><head><title>" + title
            + '</title><link rel="stylesheet" href="design.css"></head>'
            + "<body><main>" + text + "</main></body></html>")


FILES_V1 = {
    "index.html": page("QA home v1", '<h1>First delivery</h1><a href="about.html#contact">Contact me</a>'),
    "about.html": page("QA about v1", '<section id="contact">Contact details v1</section>'),
    "design.css": "body { margin: 1rem; color: #243742; } main { max-width: 48rem; }",
}
FILES_V2 = {
    "index.html": page("QA home v2", '<h1>Revised delivery</h1><a href="about.html#contact">Contact me</a>'),
    "about.html": page("QA about v2", '<section id="contact">Revised contact details v2</section>'),
    "design.css": "body { margin: 1rem; color: #173e37; } main { max-width: 100%; overflow-wrap: anywhere; }",
}


def specification(title, collaborative=True):
    value = {
        "mode": "custom", "title": title, "summary": "Synthetic local application-level collaboration QA",
        "clientName": "QA buyer", "amount": "125.50", "currency": "AUD", "language": "en",
        "requiredPages": ["index.html", "about.html"],
        "link": {"from": "index.html", "text": "Contact me", "to": "about.html#contact"},
        "manualRequirements": ["The buyer checks the final text directly."],
    }
    if collaborative:
        value["collaborative"] = True
    return value


def shared_state(quote):
    return quote["proof"]["collaboration"]


def assert_private_columns_absent(value):
    forbidden = {"sellerid", "ownerid", "invitationhash", "invitationemail", "invitationexpiresat"}
    if isinstance(value, dict):
        for key, child in value.items():
            assert key.replace("_", "").lower() not in forbidden, "Server-only membership/invitation column leaked"
            assert_private_columns_absent(child)
    elif isinstance(value, list):
        for child in value:
            assert_private_columns_absent(child)


def quote_response(result, role):
    assert result.get("role") == role, "Role must be derived by the server"
    quote = result["quote"]
    assert quote["workflow"] == "proof-v1" and quote["paymentMode"] == "demo"
    assert quote["aiMode"] == "demo", "Stop: this Worker has live AI configured"
    assert quote["totalCents"] == 12550, "The server must preserve the agreed amount"
    assert_private_columns_absent(quote)
    if role == "seller":
        assert_seller_projection(quote)
    return quote


def assert_seller_projection(quote):
    assert not any(quote.get(key) for key in ("paypalOrderId", "paypalApprovalUrl", "captureId")), "Seller transport must omit buyer payment resource IDs"
    assert not quote["proof"].get("authorizationId"), "Seller transport must omit buyer authorization IDs"


def no_payment(quote):
    assert quote["proof"]["paymentState"] == "unfunded"
    assert not any(quote.get(key) for key in ("paypalOrderId", "paypalApprovalUrl", "captureId", "paidAt"))
    assert not any(quote["proof"].get(key) for key in ("authorizationId", "acceptedAt", "acceptedDeliveryId", "manualChecks", "paymentOperation"))


def manual_ids(quote):
    required = sorted({entry["criterionId"] for entry in quote["proof"]["delivery"]["evidence"] if entry["finding"] == "needs_human"})
    assert required == ["manual-1", "mobile"], required
    return required


def invite(api, path, email=SELLER.email):
    result = api.ok(BUYER, path + "/invite", {"email": email})
    quote_response(result, "buyer")
    invitation = result["invitation"]
    assert re.fullmatch(r"[0-9a-f]{64}", invitation["token"]), "Invitation must have 32 random bytes"
    assert invitation["email"] == email.strip().lower()
    expiry = datetime.fromisoformat(invitation["expiresAt"].replace("Z", "+00:00"))
    remaining = (expiry - datetime.now(timezone.utc)).total_seconds()
    assert 6 * 86400 < remaining <= 7 * 86400 + 60, "Invitation expiry must use the server's seven-day window"
    return invitation["token"]


def join_payload(token):
    return {"token": token, "confirm": True, "sellerName": "QA seller"}


def read_quote(api, actor, quote_id, role):
    return quote_response(api.ok(actor, "/api/quotes/" + quote_id), role)


def assert_listing(api, actor, quote_id, role=None):
    result = api.ok(actor, "/api/proofs")
    matches = [item for item in result["quotes"] if item["id"] == quote_id]
    if role is None:
        assert not matches and quote_id not in result.get("roles", {}), "Unrelated case leaked in listing"
    else:
        assert len(matches) == 1 and result["roles"][quote_id] == role
        assert "files" not in matches[0]["proof"].get("delivery", {}), "List must omit full source snapshots"
        assert_private_columns_absent(matches[0])
        if role == "seller":
            assert_seller_projection(matches[0])


def assert_preview(api, actor, path, source):
    code, actual, headers = api.request(actor, path)
    assert code == 200 and actual == source, "Preview must serve the exact saved file"
    policy = headers.get("content-security-policy", "")
    assert "sandbox allow-same-origin" in policy and "allow-scripts" not in policy
    assert headers.get("cache-control") == "no-store, no-transform"


def main():
    api = LocalAPI(os.environ.get("BRIEFPAY_COLLAB_TEST_URL", "http://127.0.0.1:8789"))
    config = api.ok(BUYER, "/api/config")
    assert config.get("aiMode") == "demo" and config.get("paymentMode") == "demo", "Use an isolated Worker with empty provider configuration; nothing has been created"

    # Verify strict authentication rather than confusing Sites' one-user Vite
    # development login, the legacy loopback fallback, and real app membership.
    api.reject(None, "/api/proofs", specification("Anonymous must not create shared cases"), (401,))
    result = api.ok(BUYER, "/api/proofs", {
        **specification("Collaboration API QA"), "paymentMode": "sandbox", "totalCents": 1,
        "sellerId": SELLER.identifier, "role": "seller",
    })
    quote = quote_response(result, "buyer")
    quote_id = quote["id"]
    path = "/api/proofs/" + quote_id
    assert quote["status"] == "draft" and shared_state(quote)["stage"] == "awaiting_seller"
    no_payment(quote)
    api.reject(BUYER, path + "/invite", {"email": SELLER.email}, (409,))
    api.reject(SELLER, "/api/quotes/" + quote_id, codes=(404,))
    api.reject(OUTSIDER, "/api/quotes/" + quote_id, codes=(404,))
    api.reject(None, "/api/quotes/" + quote_id, codes=(401, 404))
    quote = quote_response(api.ok(BUYER, path + "/approve", {}), "buyer")
    api.checked("Shared creation requires identity and ignores forged role, membership, amount and Sandbox mode")

    api.reject(BUYER, path + "/invite", {"email": BUYER.email.upper()}, (400, 403))
    first_token = invite(api, path, "  SELLER@TEST.EXAMPLE  ")
    for actor in (BUYER, OUTSIDER):
        api.reject(actor, "/api/proof-invitations/inspect", {"token": first_token}, (403, 404))
        api.reject(actor, "/api/proof-invitations/accept", join_payload(first_token), (403, 404))
    api.reject(None, "/api/proof-invitations/inspect", {"token": first_token}, (401,))
    api.reject(None, "/api/proof-invitations/accept", join_payload(first_token), (401,))
    inspected = api.ok(SELLER, "/api/proof-invitations/inspect", {"token": first_token})
    assert inspected["project"]["id"] == quote_id
    assert inspected["project"]["totalCents"] == 12550
    assert inspected["email"] == SELLER.email
    assert "quote" not in inspected, "Invitation inspection should expose scope, not full membership/payment state"
    assert_private_columns_absent(inspected["project"])
    second_token = invite(api, path)
    assert first_token != second_token
    api.reject(SELLER, "/api/proof-invitations/inspect", {"token": first_token}, (404, 410))
    api.reject(SELLER, "/api/proof-invitations/accept", join_payload(first_token), (404, 410))
    api.ok(BUYER, path + "/invite", {"revoke": True})
    api.reject(SELLER, "/api/proof-invitations/inspect", {"token": second_token}, (404, 410))
    token = invite(api, path)
    api.reject(SELLER, "/api/proof-invitations/accept", {**join_payload(token), "confirm": False}, (400,))
    quote = quote_response(api.ok(SELLER, "/api/proof-invitations/accept", join_payload(token)), "seller")
    assert shared_state(quote)["stage"] == "in_progress"
    assert shared_state(quote)["sellerName"] == "QA seller"
    api.reject(SELLER, "/api/proof-invitations/accept", join_payload(token), (404, 409, 410))
    api.reject(SELLER, "/api/proof-invitations/inspect", {"token": token}, (404, 409, 410))
    api.checked("Email-bound, explicit, one-use invitations rotate and revoke; buyer, outsider and anonymous cannot claim")

    read_quote(api, BUYER, quote_id, "buyer")
    read_quote(api, SELLER, quote_id, "seller")
    for actor in (BUYER, SELLER):
        assert_listing(api, actor, quote_id, "buyer" if actor == BUYER else "seller")
    assert_listing(api, OUTSIDER, quote_id)
    api.reject(OUTSIDER, "/api/quotes/" + quote_id, codes=(404,))
    api.reject(None, "/api/quotes/" + quote_id, codes=(401, 404))
    seller_forbidden = {
        "approve": {}, "checkout": {}, "authorize": {"orderId": "not-authorized"},
        "capture": {"confirm": True}, "void": {"confirm": True}, "reconcile": {},
        "return": {"deliveryId": "not-current", "feedback": []},
        "accept_delivery": {"confirm": True, "deliveryId": "not-current", "manualChecks": []},
        "invite": {"email": OUTSIDER.email},
    }
    for action, payload in seller_forbidden.items():
        api.reject(SELLER, path + "/" + action, payload, (403,))
    api.reject(BUYER, path + "/delivery", {"files": FILES_V1}, (403,))
    api.checked("Membership controls read/list access; seller cannot invoke buyer or payment actions; buyer cannot upload")

    # Raw requests intentionally skip the normal caller-view helper here.
    empty_before = read_quote(api, SELLER, quote_id, "seller")
    for payload in ({"files": FILES_V1}, {"files": FILES_V1, "expectedDeliveryId": True},
                    {"files": FILES_V1, "expectedDeliveryId": []}, {"files": FILES_V1, "expectedDeliveryId": ""}):
        code, _, _ = api.request(SELLER, path + "/delivery", payload)
        assert code == 409, "Missing or invalid caller baselines must not upload files"
        assert read_quote(api, SELLER, quote_id, "seller") == empty_before
    quote = quote_response(api.ok(SELLER, path + "/delivery", {"files": FILES_V1, "expectedDeliveryId": None}), "seller")
    first_delivery = quote["proof"]["delivery"]["id"]
    assert quote["proof"]["delivery"]["files"] == FILES_V1
    assert quote["proof"]["delivery"]["sequence"] == 1
    api.reject(SELLER, path + "/delivery", {"files": FILES_V2, "expectedDeliveryId": None}, (409,))
    assert read_quote(api, SELLER, quote_id, "seller") == quote, "A second empty-view upload cannot replace the first delivery"
    api.reject(SELLER, path + "/submit_delivery", {"deliveryId": first_delivery, "note": "Before review"}, (409,))
    quote = quote_response(api.ok(SELLER, path + "/review", {}), "seller")
    assert quote["proof"]["review"]["mode"] == "demo"
    assert quote["proof"]["review"]["deliveryId"] == first_delivery
    checks = manual_ids(quote)
    assert not any(entry["finding"] == "fail" for entry in quote["proof"]["delivery"]["evidence"])
    quote_response(api.ok(BUYER, path + "/review", {}), "buyer")
    api.reject(BUYER, path + "/accept_delivery", {"confirm": True, "deliveryId": first_delivery, "manualChecks": checks}, (409,))
    api.reject(SELLER, path + "/submit_delivery", {"deliveryId": "stale", "note": "Wrong delivery"}, (409,))
    quote = quote_response(api.ok(SELLER, path + "/submit_delivery", {"deliveryId": first_delivery, "note": "Please review the first saved version."}), "seller")
    assert shared_state(quote)["stage"] == "submitted"
    api.reject(SELLER, path + "/delivery", {"files": FILES_V2}, (409,))
    api.reject(BUYER, path + "/return", {"deliveryId": first_delivery, "feedback": [{"criterionId": "invented", "comment": "Not agreed"}]}, (400,))
    feedback = [{"criterionId": "mobile", "comment": "Revise the mobile text wrapping, then submit a new version."}]
    quote = quote_response(api.ok(BUYER, path + "/return", {"deliveryId": first_delivery, "feedback": feedback}), "buyer")
    assert shared_state(quote)["stage"] == "changes_requested"
    assert any(item["deliveryId"] == first_delivery and item["criterionId"] == "mobile" for item in shared_state(quote)["feedback"])
    no_payment(quote)
    api.checked("Seller submits a reviewed snapshot, cannot silently replace a submission, and receives criterion-bound buyer feedback")

    quote = quote_response(api.ok(SELLER, path + "/delivery", {"files": FILES_V2}), "seller")
    second_delivery = quote["proof"]["delivery"]["id"]
    assert second_delivery != first_delivery and quote["proof"]["delivery"]["sequence"] == 2
    assert quote["proof"]["delivery"]["files"] == FILES_V2
    assert not quote["proof"].get("review") and not shared_state(quote).get("submission")
    assert not shared_state(quote).get("acceptance")
    api.reject(SELLER, path + "/delivery", {"files": FILES_V1, "expectedDeliveryId": first_delivery}, (409,))
    assert read_quote(api, SELLER, quote_id, "seller") == quote, "A stale previous delivery ID cannot replace the revision"
    no_payment(quote)
    old_version_path = path + "/versions/" + first_delivery
    archive = api.ok(BUYER, old_version_path)["version"]
    assert archive["delivery"]["files"] == FILES_V1 and archive["delivery"]["id"] == first_delivery
    assert archive["review"]["deliveryId"] == first_delivery
    assert archive["submission"]["deliveryId"] == first_delivery
    assert archive["feedback"][0]["criterionId"] == "mobile"
    archive_before = copy.deepcopy(archive)
    for actor in (BUYER, SELLER):
        assert api.ok(actor, old_version_path)["version"] == archive_before
        versions = api.ok(actor, path + "/versions")["versions"]
        assert {item["delivery"]["id"] for item in versions} == {first_delivery, second_delivery}
        assert all("files" not in item["delivery"] for item in versions)
        assert_preview(api, actor, "/proof-versions/" + quote_id + "/" + first_delivery + "/index.html", FILES_V1["index.html"])
        api.reject(actor, "/deliveries/" + quote_id + "/" + first_delivery + "/index.html", codes=(404,))
        assert_preview(api, actor, "/deliveries/" + quote_id + "/" + second_delivery + "/index.html", FILES_V2["index.html"])
        api.reject(actor, old_version_path, {}, (404, 405), method="POST")
    for actor in (OUTSIDER, None):
        expected = (404,) if actor else (401, 404)
        for resource in (path + "/versions", old_version_path,
                         "/proof-versions/" + quote_id + "/" + first_delivery + "/index.html",
                         "/deliveries/" + quote_id + "/" + second_delivery + "/index.html"):
            api.reject(actor, resource, codes=expected)
    for actor, role in ((BUYER, "buyer"), (SELLER, "seller")):
        assert_listing(api, actor, quote_id, role)
    api.checked("Replacement clears current checks; exact immutable v1 files, review, submission and feedback remain role-scoped in history")

    quote = quote_response(api.ok(SELLER, path + "/review", {}), "seller")
    checks = manual_ids(quote)
    quote = quote_response(api.ok(SELLER, path + "/submit_delivery", {"deliveryId": second_delivery, "note": "Revised files are ready for acceptance."}), "seller")
    api.reject(BUYER, path + "/return", {"deliveryId": first_delivery, "feedback": feedback}, (409,))
    api.reject(BUYER, path + "/accept_delivery", {"confirm": True, "deliveryId": first_delivery, "manualChecks": checks}, (409,))
    api.reject(BUYER, path + "/accept_delivery", {"confirm": False, "deliveryId": second_delivery, "manualChecks": checks}, (400,))
    api.reject(BUYER, path + "/accept_delivery", {"confirm": True, "deliveryId": second_delivery, "manualChecks": []}, (400,))
    quote = quote_response(api.ok(BUYER, path + "/accept_delivery", {"confirm": True, "deliveryId": second_delivery, "manualChecks": checks}), "buyer")
    assert shared_state(quote)["stage"] == "accepted"
    acceptance = shared_state(quote)["acceptance"]
    assert acceptance["deliveryId"] == second_delivery and sorted(acceptance["manualChecks"]) == checks
    no_payment(quote)
    api.reject(SELLER, path + "/delivery", {"files": FILES_V1}, (409,))
    api.reject(BUYER, path + "/return", {"deliveryId": second_delivery, "feedback": feedback}, (409,))
    capture_input = {"confirm": True, "deliveryId": second_delivery, "manualChecks": checks}
    api.reject(BUYER, path + "/capture", capture_input, (400, 409))
    api.checked("Independent delivery acceptance requires current review and human checks without authorizing or capturing payment")

    checkout = api.ok(BUYER, path + "/checkout", {})
    assert checkout["mode"] == "demo" and checkout["orderId"].startswith("DEMO-"), "Never authorize a provider order"
    assert not checkout.get("approvalUrl"), "Demo flow must not supply a PayPal approval URL"
    quote = quote_response(api.ok(BUYER, path + "/authorize", {"orderId": checkout["orderId"]}), "buyer")
    assert quote["proof"]["paymentState"] == "authorized" and not quote.get("captureId")
    assert quote["paypalOrderId"] == checkout["orderId"] and quote["proof"]["authorizationId"], "Buyer retains its own payment resources"
    read_quote(api, SELLER, quote_id, "seller")
    assert_listing(api, SELLER, quote_id, "seller")
    # Saved non-financial acceptance already contains both human checks. Capture
    # must still require fresh explicit financial consent and supplied checks.
    api.reject(BUYER, path + "/capture", {**capture_input, "confirm": False}, (400, 409))
    api.reject(BUYER, path + "/capture", {**capture_input, "manualChecks": []}, (400, 409))
    quote = quote_response(api.ok(BUYER, path + "/capture", capture_input), "buyer")
    assert quote["status"] == "paid" and quote["proof"]["paymentState"] == "captured"
    assert quote["captureId"].startswith("SIM-") and quote["proof"]["acceptedDeliveryId"] == second_delivery
    assert quote_response(api.ok(BUYER, path + "/capture", capture_input), "buyer") == quote
    read_quote(api, SELLER, quote_id, "seller")
    assert_listing(api, SELLER, quote_id, "seller")
    api.reject(SELLER, path + "/delivery", {"files": FILES_V1}, (409,))
    api.reject(BUYER, path + "/return", {"deliveryId": second_delivery, "feedback": feedback}, (409,))
    assert api.ok(BUYER, old_version_path)["version"] == archive_before, "Payment must not mutate the archived delivery"
    api.checked("Only buyer can perform an explicit demo authorization and capture; retries reuse the receipt and terminal delivery stays locked")

    # A separate untouched project lets simultaneous invitation claims exercise
    # real D1 membership/version CAS without relying on payment timing races.
    race = quote_response(api.ok(BUYER, "/api/proofs", specification("Concurrent invitation claim QA")), "buyer")
    race_path = "/api/proofs/" + race["id"]
    api.ok(BUYER, race_path + "/approve", {})
    race_token = invite(api, race_path)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: api.request(SELLER, "/api/proof-invitations/accept", join_payload(race_token)), range(4)))
    codes = [code for code, _, _ in results]
    assert sum(code in {200, 201} for code in codes) == 1, ("Only one concurrent claim may succeed", codes)
    assert all(code in {200, 201, 404, 409, 410} for code in codes), codes
    joined = read_quote(api, BUYER, race["id"], "buyer")
    assert sum(event["kind"] == "seller_joined" for event in joined["proof"]["audit"]) == 1
    api.checked("Concurrent claim has exactly one success and one persisted seller_joined event")

    # Both callers observed the same initial delivery. Exactly one replacement
    # may succeed; a later read inside the route must not bless a stale client.
    replacement = quote_response(api.ok(BUYER, "/api/proofs", specification("Concurrent replacement QA")), "buyer")
    replacement_id = replacement["id"]
    replacement_path = "/api/proofs/" + replacement_id
    api.ok(BUYER, replacement_path + "/approve", {})
    replacement_token = invite(api, replacement_path)
    api.ok(SELLER, "/api/proof-invitations/accept", join_payload(replacement_token))
    replacement = quote_response(api.ok(SELLER, replacement_path + "/delivery", {"files": FILES_V1}), "seller")
    initial_id = replacement["proof"]["delivery"]["id"]
    stale_client = LocalAPI(api.origin)
    read_quote(stale_client, SELLER, replacement_id, "seller")
    expected_sources = {initial_id: copy.deepcopy(FILES_V1)}
    third_files = {**FILES_V2, "index.html": page("QA concurrent alternate", '<h1>Another complete replacement</h1><a href="about.html#contact">Contact me</a>')}
    replacements = [copy.deepcopy(FILES_V2), third_files]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda files: api.request(SELLER, replacement_path + "/delivery", {"files": files, "expectedDeliveryId": initial_id}), replacements))
    successful = []
    for files, (code, result, _) in zip(replacements, results):
        assert code in {200, 201, 409}, ("Unexpected concurrent replacement result", code, api.diagnostic(result))
        if code in {200, 201}:
            response_quote = quote_response(result, "seller")
            response_delivery = response_quote["proof"]["delivery"]
            assert response_delivery["files"] == files, "Successful response must identify its own saved source"
            assert response_delivery["id"] not in expected_sources, "Each successful replacement needs a distinct delivery ID"
            expected_sources[response_delivery["id"]] = copy.deepcopy(files)
            successful.append(response_delivery["id"])
    assert len(successful) == 1, "Two callers with the same delivery baseline must not both replace it"
    current = read_quote(api, BUYER, replacement_id, "buyer")["proof"]["delivery"]
    assert current["id"] in successful and current["files"] == expected_sources[current["id"]]
    stale_client.reject(SELLER, replacement_path + "/delivery", {"files": FILES_V1}, (409,))
    assert read_quote(api, BUYER, replacement_id, "buyer")["proof"]["delivery"] == current
    for actor in (BUYER, SELLER):
        versions = api.ok(actor, replacement_path + "/versions")["versions"]
        version_ids = [item["delivery"]["id"] for item in versions]
        assert len(version_ids) == len(set(version_ids)), "No duplicate current/archive delivery IDs"
        assert set(version_ids) == set(expected_sources), "History must cover all successes and contain no failed-request orphan"
        assert all("files" not in item["delivery"] for item in versions)
        for delivery_id, files in expected_sources.items():
            version = api.ok(actor, replacement_path + "/versions/" + delivery_id)["version"]
            assert version["delivery"]["files"] == files, "Archive source changed or was attributed to another replacement"
            assert_preview(api, actor, "/proof-versions/" + replacement_id + "/" + delivery_id + "/index.html", files["index.html"])
    api.checked("Missing/invalid/stale caller baselines are rejected; concurrent replacements have one winner and history preserves each committed source snapshot")

    # The largest valid agreement has ten page criteria, one link criterion,
    # mobile, and five manual criteria. Valid Chinese feedback exceeds the old
    # 24 KB request cap even though every individual comment is within its limit.
    maximum_spec = specification("Maximum Chinese feedback QA")
    maximum_spec["requiredPages"] = ["index.html", "about.html"] + [f"page-{number}.html" for number in range(2, 10)]
    maximum_spec["manualRequirements"] = [f"The buyer directly confirms requirement {number}." for number in range(1, 6)]
    maximum = quote_response(api.ok(BUYER, "/api/proofs", maximum_spec), "buyer")
    maximum_path = "/api/proofs/" + maximum["id"]
    assert len(maximum["proof"]["criteria"]) == 17
    api.ok(BUYER, maximum_path + "/approve", {})
    maximum_token = invite(api, maximum_path)
    api.ok(SELLER, "/api/proof-invitations/accept", join_payload(maximum_token))
    maximum_files = {**FILES_V1, **{
        f"page-{number}.html": page(f"Page {number}", f"Synthetic page {number}")
        for number in range(2, 10)
    }}
    maximum = quote_response(api.ok(SELLER, maximum_path + "/delivery", {"files": maximum_files}), "seller")
    maximum = quote_response(api.ok(SELLER, maximum_path + "/review", {}), "seller")
    maximum_delivery = maximum["proof"]["delivery"]["id"]
    api.ok(SELLER, maximum_path + "/submit_delivery", {"deliveryId": maximum_delivery, "note": "Please check all seventeen agreed criteria."})
    maximum_feedback = [{"criterionId": criterion["id"], "comment": "请" * 1000} for criterion in maximum["proof"]["criteria"]]
    maximum_return = {"deliveryId": maximum_delivery, "feedback": maximum_feedback}
    encoded_size = len(json.dumps(maximum_return, ensure_ascii=False).encode("utf-8"))
    assert 24_000 < encoded_size < 96_000, "Exercise the actual UTF-8 request-size boundary"
    maximum = quote_response(api.ok(BUYER, maximum_path + "/return", maximum_return), "buyer")
    saved_feedback = shared_state(maximum)["feedback"]
    assert shared_state(maximum)["stage"] == "changes_requested"
    assert len(saved_feedback) == 17 and all(item["comment"] == "请" * 1000 for item in saved_feedback)
    no_payment(maximum)
    api.checked("Maximum seventeen-criterion return accepts all 1000-character Chinese comments above the former 24 KB cap")

    # The original single-owner custom workflow intentionally retains its owner
    # upload/review behavior, with no seller collaboration or accidental sharing.
    legacy = quote_response(api.ok(BUYER, "/api/proofs", specification("Legacy custom regression QA", collaborative=False)), "buyer")
    legacy_path = "/api/proofs/" + legacy["id"]
    assert not legacy["proof"].get("collaboration")
    api.ok(BUYER, legacy_path + "/approve", {})
    legacy = quote_response(api.ok(BUYER, legacy_path + "/delivery", {"files": FILES_V1}), "buyer")
    legacy = quote_response(api.ok(BUYER, legacy_path + "/review", {}), "buyer")
    assert legacy["proof"]["review"]["deliveryId"] == legacy["proof"]["delivery"]["id"]
    no_payment(legacy)
    api.reject(SELLER, "/api/quotes/" + legacy["id"], codes=(404,))
    api.reject(OUTSIDER, legacy_path + "/delivery", {"files": FILES_V2}, (404,))
    api.checked("Legacy custom cases retain owner upload/review behavior and remain private")

    print(json.dumps({
        "scope": "Isolated loopback Worker application-layer integration; simulated trusted gateway identities",
        "passed": len(api.checks), "checks": api.checks,
        "payment": "Demo authorization/capture only; no PayPal requests",
        "ai": "Demo configuration required before mutations; no AI-provider requests",
        "not_exercised": [
            "Production Sites access policy, login gateway, real dual-account browser flow or email delivery",
            "A truly expired invitation, which needs an injected clock/storage fixture",
            "Persisted pending paymentOperation, which cannot be deterministically produced by synchronous public demo APIs",
            "Real browser layout measurements or production seller settlement",
        ],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
