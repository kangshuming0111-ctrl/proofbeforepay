"""Exercise real custom artifacts locally; never authorize or call a payment provider."""
import json
import os
from http.client import HTTPConnection, HTTPSConnection
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse

BASE = os.environ.get("BRIEFPAY_TEST_URL", "http://127.0.0.1:5173").rstrip("/")
assert urlparse(BASE).hostname in {"localhost", "127.0.0.1", "::1"}, "Local preview only"

def call(path, data=None, headers=None):
    req = Request(BASE + path, data=None if data is None else json.dumps(data).encode(),
                  headers={"Content-Type": "application/json", "Origin": BASE, **(headers or {})})
    try:
        with urlopen(req, timeout=10) as res:
            return res.status, json.load(res)
    except HTTPError as error:
        raw = error.read().decode()
        try:
            result = json.loads(raw)
        except ValueError:
            result = {"error": raw[:300]}  # The local gateway can reject before JSON routing.
        return error.code, result

def ok(path, data=None):
    code, result = call(path, data)
    assert code in {200, 201}, (path, code, result)
    return result

def reject(path, data, expected=(400, 409)):
    code, result = call(path, data)
    assert code in expected, (path, code, result)

def reject_oversize_declared_length(path):
    """Check the early Content-Length gate without racing an oversized body write.

    The Worker can return 413 before consuming a body. Sending 2.1 MB with
    urllib then loses that response to BrokenPipe; no streaming-limit claim is
    made by this separate headers-only check.
    """
    origin = urlparse(BASE)
    connection_type = HTTPSConnection if origin.scheme == "https" else HTTPConnection
    connection = connection_type(origin.hostname, origin.port, timeout=10)
    try:
        connection.request("POST", path, headers={"Content-Type": "application/json", "Origin": BASE,
                                                  "Content-Length": str(2 * 1024 * 1024 + 1)})
        response = connection.getresponse()
        assert response.status == 413, (path, response.status, "Declared oversized body must be rejected before reading it")
        response.read()
    finally:
        connection.close()

def page(title, content):
    return '<!doctype html><html><head><title>' + title + '</title><link rel="stylesheet" href="design.css"></head><body>' + content + '</body></html>'

spec = {"mode": "custom", "title": "Independent portfolio acceptance QA", "summary": "My portfolio pages and contact section",
        "clientName": "Local QA", "amount": "125.50", "currency": "AUD", "language": "en",
        "requiredPages": ["index.html", "about.html"],
        "link": {"from": "index.html", "text": "Contact me", "to": "about.html#contact"},
        "manualRequirements": ["Confirm the project descriptions match the agreed brief."]}

for invalid in ({"amount": "12.345"}, {"amount": 125.50}, {"requiredPages": ["../index.html"]},
                {"link": {"from": "index.html", "text": "Contact", "to": "https://example.test/"}}):
    reject("/api/proofs", {**spec, **invalid})
q = ok("/api/proofs", {**spec, "totalCents": 1, "proof": {"paymentState": "captured"}})["quote"]
assert q["title"] == spec["title"] and q["totalCents"] == 12550
assert q["lineItems"][0]["unitPriceCents"] == 12550 and q["proof"]["paymentState"] == "unfunded"
assert len(q["proof"]["criteria"]) == 5 and q["proof"]["project"]["requiredPages"] == spec["requiredPages"]
p = "/api/proofs/" + q["id"]
files = {"index.html": page("Portfolio", '<h1>My work</h1><a href="about.html#contact">Contact me</a>'),
         "design.css": "body { color: #243742; } @media(max-width:600px) {body{margin:10px}}"}
reject(p + "/delivery", {"files": files, "expectedDeliveryId": None})  # Scope must first be locked.
ok(p + "/approve", {})
reject(p + "/delivery", {"variant": "fixed", "expectedDeliveryId": None})  # Custom projects cannot borrow fixture findings.
for invalid in ({**files, "../evil.html": page("Evil", "bad")}, {**files, "x.js": "alert(1)"},
                {**files, "INDEX.HTML": page("Duplicate", "bad")},
                {**files, "huge.css": "x" * 65_537}):
    reject(p + "/delivery", {"files": invalid, "expectedDeliveryId": None})
q = ok(p + "/delivery", {"files": files, "expectedDeliveryId": None})["quote"]
assert q["proof"]["delivery"]["files"] == files and q["proof"]["delivery"]["variant"] == "upload"
first = q["proof"]["delivery"]["id"]
assert q["proof"]["delivery"]["sequence"] == 1 and "review" not in q["proof"]
q = ok(p + "/review", {})["quote"]
assert any(e["finding"] == "fail" for e in q["proof"]["delivery"]["evidence"])
assert q["proof"]["paymentState"] == "unfunded" and "authorizationId" not in q["proof"]

files["about.html"] = page("About", '<h1>About me</h1><section id="contact">Email by agreement</section>')
q = ok(p + "/delivery", {"files": files, "expectedDeliveryId": first})["quote"]
second = q["proof"]["delivery"]["id"]
assert first != second and q["proof"]["delivery"]["sequence"] == 2
assert not any(k in q["proof"] for k in ("review", "acceptedAt", "acceptedDeliveryId", "manualChecks"))
q = ok(p + "/review", {})["quote"]
assert all(e["finding"] != "fail" for e in q["proof"]["delivery"]["evidence"])
checks = [e["criterionId"] for e in q["proof"]["delivery"]["evidence"] if e["finding"] == "needs_human"]
assert set(checks) == {"mobile", "manual-1"}
reject(p + "/capture", {"confirm": True, "deliveryId": second, "manualChecks": checks})  # Still no authorization.
# The local Sites gateway supplies one development identity; a forged identity
# header cannot switch accounts here. Owner predicates are reviewed separately.
assert call(p + "/review", {}, headers={"Origin": "https://other.example"})[0] == 403
assert call("/deliveries/" + q["id"] + "/" + first + "/index.html")[0] == 404
artifact = "/deliveries/" + q["id"] + "/" + second + "/about.html"
with urlopen(BASE + artifact, timeout=10) as res:
    assert res.read().decode() == files["about.html"]
    assert "sandbox allow-same-origin;" in res.headers["Content-Security-Policy"]
    assert "allow-scripts" not in res.headers["Content-Security-Policy"]
    assert res.headers["Referrer-Policy"] == "no-referrer"
assert ok("/api/quotes/" + q["id"])["quote"]["proof"]["review"]["deliveryId"] == second
listed = next(item for item in ok("/api/proofs")["quotes"] if item["id"] == q["id"])
assert "files" not in listed["proof"]["delivery"]  # Reopen fetches the full owner-scoped record.

# Full replacement must not silently retain an earlier required page.
q = ok(p + "/delivery", {"files": {"index.html": files["index.html"]}, "expectedDeliveryId": second})["quote"]
assert q["proof"]["delivery"]["sequence"] == 3 and "about.html" not in q["proof"]["delivery"]["files"]
assert "review" not in q["proof"]
q = ok(p + "/review", {})["quote"]
assert any(e["finding"] == "fail" for e in q["proof"]["delivery"]["evidence"])

# These transport probes deliberately allow a 413 before the body is consumed.
# The local workerd proxy may restart the Worker afterwards, returning 503 to a
# following POST instead of retrying it. Run normal mutations first and report
# their completion separately. A timeout or failure in these final transport
# probes still fails the script; no mutation is retried or failure hidden.
print("Custom project normal-flow assertions passed; checking the two oversized-request transport rejections next.", flush=True)
reject("/api/proofs", {**spec, "summary": "字" * 24_001}, (413,))
reject_oversize_declared_length(p + "/delivery")
print("Custom project API passed: exact custom amount/scope, own files before authorization, actual missing/fixed evidence, replacement invalidation, manual checks, cross-site mutation rejection, bounded uploads and capture still blocked without authorization.")
