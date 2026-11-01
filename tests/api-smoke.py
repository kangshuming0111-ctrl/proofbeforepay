"""Exercise the demo workflow against a running loopback preview; no external payments."""
import json
import os
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BASE = os.environ.get("BRIEFPAY_TEST_URL", "http://localhost:5173").rstrip("/")
assert urlparse(BASE).hostname in ("localhost", "127.0.0.1", "::1"), "Smoke test is loopback-only"
checks = []


def request(path, method="GET", payload=None, expected=200, **extra_headers):
    headers = {"Content-Type": "application/json", "Origin": BASE, **extra_headers}
    data = None if payload is None else json.dumps(payload).encode()
    try:
        response = urlopen(Request(BASE + path, data=data, headers=headers, method=method), timeout=40)
    except HTTPError as error:
        response = error
    raw = response.read().decode()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {"error": raw}
    assert response.status == expected, (path, response.status, expected, result)
    return result


config = request("/api/config")
assert config["aiMode"] == config["paymentMode"] == "demo", "Run smoke checks with no provider keys"
request("/api/quotes", "POST", {}, 400)
checks.append("invalid briefs rejected")
quote = request("/api/quotes", "POST", {"brief": "Build a small cafe website with menu, opening hours and a contact form.", "clientName": "API test cafe", "hourlyRate": 85, "currency": "AUD", "language": "en"}, 201)["quote"]
assert quote["status"] == "draft" and quote["totalCents"] == 102000
checks.append("template quote created and priced in integer cents")
path = "/api/quotes/" + quote["id"]
request(path + "/checkout", "POST", {}, 409)
checks.append("checkout before review rejected")
items = quote["lineItems"]
items[0]["unitPriceCents"] = 8501
quote = request(path, "PATCH", {"lineItems": items, "totalCents": 1, "status": "paid"})["quote"]
assert quote["status"] == "draft" and quote["totalCents"] == 102002
checks.append("edits recomputed; spoofed totals and states ignored")
quote = request(path + "/approve", "POST", {})["quote"]
assert quote["status"] == "approved"
request(path, "PATCH", {"title": "Altered after approval"}, 409)
checks.append("approved amount and scope locked")
request(path + "/capture", "POST", {"orderId": "unrelated"}, 409)
checkout = request(path + "/checkout", "POST", {})
repeat = request(path + "/checkout", "POST", {})
assert checkout == repeat and checkout["mode"] == "demo"
checks.append("repeat checkout reuses the same demo order")
request(path + "/capture", "POST", {"orderId": "wrong-order"}, 409)
paid = request(path + "/capture", "POST", {"orderId": checkout["orderId"]})["quote"]
again = request(path + "/capture", "POST", {"orderId": checkout["orderId"]})["quote"]
assert paid["status"] == "paid" and paid["paymentMode"] == "demo" and again == paid
assert request(path)["quote"] == paid
checks.append("demo receipt persisted; repeat capture does not create a second receipt")
assert request(path, **{"oai-authenticated-user-id": "different-owner"})["quote"] == paid
request("/api/quotes", "POST", {}, 403, **{"Origin": "https://unrelated.example"})
checks.append("local preview middleware does not accept a forged identity; cross-site mutations rejected")
print(json.dumps({"passed": len(checks), "checks": checks, "external_services_called": False}, indent=2))
