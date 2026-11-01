"""Loopback API checks using synthetic observations, never real browser measurements.

Safe with local Sandbox configuration: this script never checks out, authorizes,
reviews with AI, captures or cancels a payment. It does not read credentials.
Run against an already running preview via BRIEFPAY_TEST_URL if needed.
"""
import copy
import json
import os
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError
from urllib.parse import quote as encode_path, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

BASE = os.environ.get("BRIEFPAY_TEST_URL", "http://127.0.0.1:5173").rstrip("/")
parsed = urlparse(BASE)
assert parsed.scheme in {"http", "https"} and parsed.hostname in {"localhost", "127.0.0.1", "::1"}, "Local preview only"
assert not parsed.username and not parsed.password and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment, "Use a plain local preview origin"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


opener = build_opener(NoRedirect())


def request(path, payload=None):
    assert path.startswith(("/api/proofs", "/api/quotes/", "/deliveries/")), "Unexpected API path"
    assert not any(path.endswith("/" + action) for action in ("checkout", "authorize", "review", "capture", "void", "reconcile")), "Provider actions are outside this test"
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = Request(BASE + path, data=data, headers={"Content-Type": "application/json", "Origin": BASE})
    try:
        response = opener.open(req, timeout=40)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read().decode("utf-8")
        headers = dict(response.headers.items())
        try:
            result = json.loads(raw)
        except ValueError:
            result = raw
        return response.status, result, headers


def ok(path, payload=None):
    code, result, _ = request(path, payload)
    assert code in {200, 201}, (path, code, result)
    return result


def rejected(path, payload, code):
    actual, result, _ = request(path, payload)
    assert actual == code, (path, actual, code, result)


def page(title, text):
    return '<!doctype html><html><head><title>' + title + '</title><link rel="stylesheet" href="design.css"></head><body><main>' + text + '</main></body></html>'


def synthetic(quote):
    """These numbers are test inputs, not measurements or a usability verdict."""
    delivery = quote["proof"]["delivery"]
    saved = delivery["files"]
    names = sorted(set(quote["proof"]["project"]["requiredPages"]) | {name for name in saved if name.lower().endswith(".html")})
    readings = []
    for name in names:
        for width in (375, 900):
            readings.append({"file": name, "viewportWidth": width, "status": "measured", "clientWidth": width, "scrollWidth": width}
                            if name in saved else {"file": name, "viewportWidth": width, "status": "unavailable", "reason": "missing_file"})
    return {"deliveryId": delivery["id"], "previousReportId": delivery.get("layoutReport", {}).get("id"), "readings": readings}


def unchanged_acceptance(before, after):
    """Only the report and its audit event may differ from the prior snapshot."""
    stripped = copy.deepcopy(after)
    stripped["proof"]["audit"] = before["proof"]["audit"]
    stripped["proof"]["delivery"].pop("layoutReport", None)
    expected = copy.deepcopy(before)
    expected["proof"]["delivery"].pop("layoutReport", None)
    assert stripped == expected
    assert after["proof"]["paymentState"] == "unfunded"
    assert not any(key in after for key in ("paypalOrderId", "captureId", "paidAt"))
    assert not any(key in after["proof"] for key in ("review", "authorizationId", "acceptedAt", "acceptedDeliveryId", "manualChecks", "paymentOperation"))
    needs_human = {entry["criterionId"] for entry in after["proof"]["delivery"]["evidence"] if entry["finding"] == "needs_human"}
    assert needs_human == {"mobile", "manual-1"}, needs_human


spec = {"mode": "custom", "title": "Synthetic layout API QA", "summary": "Two saved HTML pages; this test does not observe a browser",
        "clientName": "Local QA", "amount": "18.50", "currency": "AUD", "language": "en",
        "requiredPages": ["index.html", "about.html"], "manualRequirements": ["The client checks the final design directly."]}
q = ok("/api/proofs", spec)["quote"]
p = "/api/proofs/" + q["id"]
rejected(p + "/layout", {"deliveryId": "missing", "previousReportId": None, "readings": []}, 409)
q = ok(p + "/approve", {})["quote"]
rejected(p + "/layout", {"deliveryId": "missing", "previousReportId": None, "readings": []}, 409)
files = {"index.html": page("Home", "Saved source only"), "design.css": "body { color: #123; }"}
q = ok(p + "/delivery", {"files": files, "expectedDeliveryId": None})["quote"]
first_delivery = q["proof"]["delivery"]["id"]
before = copy.deepcopy(q)
payload = synthetic(q)
assert len(payload["readings"]) == 4

# Invalid submissions do not create a report or mutate the agreement.
rejected(p + "/layout", {**payload, "deliveryId": "stale-delivery"}, 409)
missing_previous = copy.deepcopy(payload)
del missing_previous["previousReportId"]
rejected(p + "/layout", missing_previous, 409)
duplicate = copy.deepcopy(payload)
duplicate["readings"][1] = copy.deepcopy(duplicate["readings"][0])
rejected(p + "/layout", duplicate, 400)
rejected(p + "/layout", {**payload, "readings": payload["readings"][:-1]}, 400)
wrong_missing = copy.deepcopy(payload)
wrong_missing["readings"][0]["reason"] = "timeout"  # about.html is absent, not a failed page load.
rejected(p + "/layout", wrong_missing, 400)
assert ok("/api/quotes/" + q["id"])["quote"] == before

# The server must derive conclusions and ignore forged timestamps or summaries.
payload.update({"id": "forged-report", "receivedAt": "1900-01-01", "method": "certified", "viewportHeight": 1,
                "summary": {"measured": 999, "unavailable": 0, "overflow": 0}})
index_375 = next(row for row in payload["readings"] if row["file"] == "index.html" and row["viewportWidth"] == 375)
index_375.update({"scrollWidth": 400, "overflowPx": 0, "outcome": "no_overflow"})
q = ok(p + "/layout", payload)["quote"]
unchanged_acceptance(before, q)
report = q["proof"]["delivery"]["layoutReport"]
assert report["id"] != "forged-report" and report["method"] == "browser-observation-v1" and report["viewportHeight"] == 800
assert report["receivedAt"] != "1900-01-01" and report["deliveryId"] == first_delivery
assert report["summary"] == {"measured": 2, "unavailable": 2, "overflow": 1}
assert [event["kind"] for event in q["proof"]["audit"]][-1] == "layout_checked"
assert q["proof"]["audit"][-1]["deliveryId"] == first_delivery
assert ok("/api/quotes/" + q["id"])["quote"] == q

# Preview source and CSP remain intact and advertise the current saved version.
code, source, headers = request("/deliveries/" + q["id"] + "/" + first_delivery + "/" + encode_path("index.html"))
headers = {name.lower(): value for name, value in headers.items()}
assert code == 200 and source == files["index.html"]
assert headers["x-proofbeforepay-delivery"] == first_delivery
assert "sandbox allow-same-origin;" in headers["content-security-policy"] and "allow-scripts" not in headers["content-security-policy"]

rejected(p + "/layout", payload, 409)  # previousReportId:null cannot overwrite the saved report.
retry = synthetic(q)
for row in retry["readings"]:
    if row["file"] == "index.html" and row["viewportWidth"] == 900:
        row.clear()
        row.update({"file": "index.html", "viewportWidth": 900, "status": "unavailable", "reason": "timeout"})
before = copy.deepcopy(q)
with ThreadPoolExecutor(max_workers=2) as executor:
    codes = list(executor.map(lambda _: request(p + "/layout", retry)[0], range(2)))
assert sorted(codes) == [200, 409], codes  # CAS/prior report binding allows only one run to replace it.
q = ok("/api/quotes/" + q["id"])["quote"]
unchanged_acceptance(before, q)
assert q["proof"]["delivery"]["layoutReport"]["summary"] == {"measured": 1, "unavailable": 3, "overflow": 0}
assert sum(event["kind"] == "layout_checked" for event in q["proof"]["audit"]) == 2

# A complete replacement clears the old report and still leaves manual acceptance required.
old_report_id = q["proof"]["delivery"]["layoutReport"]["id"]
files["about.html"] = page("About", "A second saved page")
q = ok(p + "/delivery", {"files": files, "expectedDeliveryId": first_delivery})["quote"]
second_delivery = q["proof"]["delivery"]["id"]
assert second_delivery != first_delivery and "layoutReport" not in q["proof"]["delivery"]
assert request("/deliveries/" + q["id"] + "/" + first_delivery + "/index.html")[0] == 404
rejected(p + "/layout", retry, 409)
payload = synthetic(q)
rejected(p + "/layout", {**payload, "previousReportId": old_report_id}, 409)
before = copy.deepcopy(q)
q = ok(p + "/layout", payload)["quote"]
unchanged_acceptance(before, q)
assert q["proof"]["delivery"]["layoutReport"]["summary"] == {"measured": 4, "unavailable": 0, "overflow": 0}
assert q["proof"]["delivery"]["layoutReport"]["deliveryId"] == second_delivery
print("Layout API smoke passed using SYNTHETIC browser readings: exact saved-version coverage, derived overflow, stale/duplicate/missing/unavailable rejection, concurrent report protection, snapshot header and replacement reset; human checks remain needs_human. No payment or AI-provider action was called; no real browser measurement was performed.")
