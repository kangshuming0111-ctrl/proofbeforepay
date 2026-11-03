"""Local-only end-to-end financial state gates. No external provider calls."""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse

BASE = os.environ.get("BRIEFPAY_TEST_URL", "http://127.0.0.1:5173").rstrip("/")
assert urlparse(BASE).hostname in {"localhost", "127.0.0.1", "::1"}, "Local preview only"

def call(path, data=None, method=None):
    req = Request(BASE + path, data=None if data is None else json.dumps(data).encode(), method=method or ("POST" if data is not None else "GET"), headers={"Content-Type": "application/json", "Origin": BASE})
    try:
        with urlopen(req) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, json.load(error)

def ok(path, data=None):
    code, result = call(path, data)
    assert code in {200, 201}, (path, code, result)
    return result

def denied(path, data):
    code, result = call(path, data)
    assert code in {400, 409}, (path, code, result)

def new():
    q = ok("/api/proofs", {"language": "zh", "clientName": "Local smoke test", "currency": "AUD", "totalCents": 1})["quote"]
    assert q["totalCents"] == 48000 and q["paymentMode"] == "demo"
    return q, "/api/proofs/" + q["id"]

def acceptance_input(quote, checks):
    proof = quote["proof"]
    delivery = proof["delivery"]
    return {"confirm": True, "deliveryId": delivery["id"], "manualChecks": checks,
            "expectedEvidence": {"deliveryId": delivery["id"], "reviewReviewedAt": proof.get("review", {}).get("reviewedAt"),
                                 "browserReportId": delivery.get("browserChecks", {}).get("id"),
                                 "layoutReportId": delivery.get("layoutReport", {}).get("id"),
                                 "assessmentId": delivery.get("assessment", {}).get("id"),
                                 "riskReviewIds": [], "businessReportId": delivery.get("businessChecks", {}).get("id"),
                                 "runtimeReportId": delivery.get("runtimeReport", {}).get("id"),
                                 "journeyReportId": delivery.get("journeyReport", {}).get("id"),
                                 "journeyPlanDigest": delivery.get("journeyPlan", {}).get("planDigest"),
                                 "modelReportId": delivery.get("modelReport", {}).get("id")}}

q, p = new()
denied(p + "/checkout", {})
for action in ("approve", "checkout", "capture"):
    denied("/api/quotes/" + q["id"] + "/" + action, {})
assert call("/api/quotes/" + q["id"], {"lineItems": []}, "PATCH")[0] == 409
ok(p + "/approve", {})
order = ok(p + "/checkout", {})["orderId"]
assert ok(p + "/checkout", {})["orderId"] == order
denied(p + "/authorize", {"orderId": "forged"})
q = ok(p + "/authorize", {"orderId": order})["quote"]
assert q["proof"]["paymentState"] == "authorized" and q["status"] != "paid"
denied(p + "/reconcile", {})  # Local simulation cannot claim a PayPal lookup.
ok(p + "/delivery", {"variant": "flawed", "expectedDeliveryId": None})
q = ok(p + "/review", {})["quote"]
assert any(e["finding"] == "fail" for e in q["proof"]["delivery"]["evidence"])
denied(p + "/capture", {"confirm": True, "deliveryId": q["proof"]["delivery"]["id"], "manualChecks": ["mobile"]})
q = ok(p + "/delivery", {"variant": "fixed", "expectedDeliveryId": q["proof"]["delivery"]["id"]})["quote"]
assert "review" not in q["proof"]
delivery = q["proof"]["delivery"]["id"]
with urlopen(BASE + "/deliveries/" + q["id"] + "/" + delivery + "/contact.html") as response:
    assert response.status == 200 and response.read().decode() == q["proof"]["delivery"]["files"]["contact.html"]
assert call("/deliveries/" + q["id"] + "/wrong-version/contact.html")[0] == 404
denied(p + "/capture", {"confirm": True, "deliveryId": delivery, "manualChecks": ["mobile"]})
q = ok(p + "/review", {})["quote"]
checks = [e["criterionId"] for e in q["proof"]["delivery"]["evidence"] if e["finding"] == "needs_human"]
denied(p + "/capture", {"confirm": True, "deliveryId": delivery, "manualChecks": []})
denied(p + "/capture", {"confirm": True, "deliveryId": "old-version", "manualChecks": checks})
accept = acceptance_input(q, checks)
q = ok(p + "/capture", accept)["quote"]
assert q["status"] == "paid" and q["proof"]["acceptedDeliveryId"] == delivery and q["captureId"].startswith("SIM-CAP-")
accept["acceptedEvidenceSnapshotId"] = q["proof"]["acceptedEvidenceSnapshotId"]
assert ok(p + "/capture", accept)["quote"]["captureId"] == q["captureId"]
assert ok(p + "/reconcile", {})["quote"] == q  # Finished queries are idempotent and do not rewrite receipts.
denied(p + "/void", {"confirm": True})
denied(p + "/delivery", {"variant": "flawed", "expectedDeliveryId": delivery})
q, p = new()
ok(p + "/approve", {})
order = ok(p + "/checkout", {})["orderId"]
ok(p + "/authorize", {"orderId": order})
denied(p + "/void", {"confirm": False})
q = ok(p + "/void", {"confirm": True})["quote"]
assert q["proof"]["paymentState"] == "voided" and q["status"] != "paid" and "captureId" not in q
assert ok(p + "/void", {"confirm": True})["quote"]["proof"]["paymentState"] == "voided"
assert ok(p + "/reconcile", {})["quote"] == q
denied(p + "/capture", {"confirm": True, "deliveryId": "missing", "manualChecks": []})
assert all(q["workflow"] == "proof-v1" for q in ok("/api/proofs")["quotes"])
q, p = new()
ok(p + "/approve", {})
order = ok(p + "/checkout", {})["orderId"]
ok(p + "/authorize", {"orderId": order})
ok(p + "/delivery", {"variant": "fixed", "expectedDeliveryId": None})
q = ok(p + "/review", {})["quote"]
accept = acceptance_input(q, ["mobile"])
with ThreadPoolExecutor(max_workers=2) as executor:
    outcomes = list(executor.map(lambda _: call(p + "/capture", accept)[0], range(2)))
assert 200 in outcomes and all(code in {200, 409} for code in outcomes), outcomes
q = ok("/api/quotes/" + q["id"])["quote"]
assert q["proof"]["paymentState"] == "captured"
assert sum(event["kind"] == "accepted" for event in q["proof"]["audit"]) == 1
assert sum(event["kind"] == "captured" for event in q["proof"]["audit"]) == 1
print("ProofBeforePay API smoke passed: authorization/capture separation, failed evidence gates, saved artifacts, version binding, manual checks, concurrent capture, idempotency, void and legacy bypass guards.")
