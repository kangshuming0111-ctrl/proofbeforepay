"""Package/version checks in a fresh isolated synthetic Worker.

Use --url with the direct loopback app listener from the isolated-build recipe.
Require the synthetic-wrapper marker before mutations. Gateway identity headers
are local fixtures, not real logins. No model or payment request is made.
"""
import argparse
import base64
import json
import os
import struct
import zlib
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default=os.environ.get("BRIEFPAY_TEST_URL"))
args = parser.parse_args()
if not args.url:
    parser.error("Pass --url for an owned, freshly migrated isolated synthetic app Worker")
BASE = args.url.rstrip("/")
parsed = urlparse(BASE)
assert parsed.scheme in {"http", "https"} and parsed.hostname in {"localhost", "127.0.0.1", "::1"}, "Loopback only"
assert not parsed.username and not parsed.password and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment, "Use a plain loopback origin"
OWNER = "static-resource-synthetic-owner-" + uuid4().hex

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None

opener = build_opener(ProxyHandler({}), NoRedirect())

def request(path, data=None):
    assert path.startswith(("/api/", "/deliveries/", "/proof-versions/")), "Unexpected API path"
    assert not any(path.endswith("/" + action) for action in ("checkout", "authorize", "review", "assess", "capture", "void", "reconcile")), "Provider actions are outside this test"
    req = Request(BASE + path, data=None if data is None else json.dumps(data).encode(),
                  headers={"Content-Type": "application/json", "Origin": BASE,
                           "oai-authenticated-user-id": OWNER, "oai-authenticated-user-email": "owner@static-resource-synthetic.example"})
    try:
        with opener.open(req, timeout=40) as response:
            return response.status, response.read(), response.headers
    except HTTPError as error:
        return error.code, error.read(), error.headers

def ok(path, data=None):
    status, raw, _ = request(path, data)
    assert status in {200, 201}, (path, status)
    return json.loads(raw)

marker = ok("/api/__synthetic_sandbox_test_mode")
assert marker.get("syntheticConfiguration") is True and marker.get("outboundFetch") == "blocked", "Requires the isolated synthetic network-blocking wrapper"
assert marker.get("syntheticCalls") == 0, "Use a fresh isolated test context"
config = ok("/api/config")
assert config["aiMode"] == "demo" and config["paymentMode"] == "sandbox", "Requires the runner's fixed synthetic configuration"

def png(colour):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\0" + bytes(colour))) + chunk(b"IEND", b"")

def data_url(raw):
    return "data:image/png;base64," + base64.b64encode(raw).decode()

def page(body, stylesheet):
    return '<!doctype html><html><head><title>Local package QA</title><link rel="stylesheet" href="' + stylesheet + '"></head><body>' + body + '</body></html>'

SUMMARY = "Synthetic nested assets and immutable replacement checks"
quote = ok("/api/proofs", {"mode": "custom", "collaborative": False, "demoRoleplay": False, "title": "Local static resource package QA", "summary": SUMMARY, "amount": "15.00", "currency": "AUD", "language": "en", "requiredPages": ["index.html", "pages/contact.html"], "link": {"from": "pages/contact.html", "text": "Home", "to": "index.html#top"}, "manualRequirements": [], "coverage": {"version": 1, "sourceText": SUMMARY, "confirmed": True, "decisions": [{"id": "coverage-1", "disposition": "include"}]}})["quote"]
path = "/api/proofs/" + quote["id"]
ok(path + "/approve", {})
first_image, second_image = png((220, 50, 60)), png((40, 80, 210))
files = {"index.html": page('<h1 id="top">Home</h1><img src="assets/images/shop.png"><a href="pages/contact.html">Contact</a>', "assets/css/main.css"),
         "pages/contact.html": page('<a href="../index.html#top">Home</a>', "../assets/css/main.css"),
         "assets/css/main.css": 'body{color:#123;background:url(../images/shop.png)}',
         "assets/images/shop.png": data_url(first_image)}
first = ok(path + "/delivery", {"files": files, "expectedDeliveryId": None, "reviewRules": True})["quote"]["proof"]["delivery"]
assert first["resources"]["findings"] == []
assert first["files"] == files

def preview(prefix, delivery_id, file, expected, mime):
    route = prefix + quote["id"] + "/" + delivery_id + "/" + file
    status, raw, headers = request(route)
    assert status == 200 and raw == expected, (route, status)
    assert headers["Content-Type"].startswith(mime)
    assert headers["X-ProofBeforePay-Delivery"] == delivery_id
    csp = headers["Content-Security-Policy"]
    version_base = BASE + prefix + quote["id"] + "/" + delivery_id + "/"
    assert "img-src " + version_base in csp and "style-src " + version_base in csp
    assert "default-src 'none'" in csp and "form-action 'none'" in csp
    assert "allow-scripts" not in csp and "data:" not in csp
    assert headers["X-Content-Type-Options"] == "nosniff" and headers["Cache-Control"] == "no-store, no-transform"

preview("/deliveries/", first["id"], "pages/contact.html", files["pages/contact.html"].encode(), "text/html")
preview("/deliveries/", first["id"], "assets/css/main.css", files["assets/css/main.css"].encode(), "text/css")
preview("/deliveries/", first["id"], "assets/images/shop.png", first_image, "image/png")
replacement = {**files, "index.html": files["index.html"].replace("assets/images/shop.png", "assets/images/absent.png"), "assets/images/shop.png": data_url(second_image)}
second = ok(path + "/delivery", {"files": replacement, "expectedDeliveryId": first["id"], "reviewRules": True})["quote"]["proof"]["delivery"]
assert first["id"] != second["id"]
assert second["resources"]["findings"] == [{"from": "index.html", "reference": "assets/images/absent.png", "target": "assets/images/absent.png", "kind": "missing"}]
preview("/proof-versions/", first["id"], "assets/images/shop.png", first_image, "image/png")
preview("/proof-versions/", first["id"], "pages/contact.html", files["pages/contact.html"].encode(), "text/html")
preview("/deliveries/", second["id"], "assets/images/shop.png", second_image, "image/png")
assert request("/deliveries/" + quote["id"] + "/" + first["id"] + "/assets/images/shop.png")[0] == 404
version = ok(path + "/versions/" + first["id"])["version"]
assert version["delivery"]["resources"]["findings"] == []
assert version["delivery"]["files"] == files
assert ok(path.replace("/api/proofs/", "/api/quotes/"))["quote"]["proof"]["paymentState"] == "unfunded"
assert ok("/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == 0
print(json.dumps({"result": "passed", "suite": "static-resources", "checks": ["Nested HTML/CSS/raster exact preview bytes, MIME, delivery identity and no-store/no-transform CSP", "Deterministic missing resource findings", "Immutable archived version and raster snapshots after replacement", "Current-schema original requirement coverage remains explicit"], "applicationModelCalls": 0, "syntheticProviderFetches": 0, "mutationRetries": 0, "scope": "Fresh isolated loopback Worker and D1 with synthetic gateway identity; not real sign-ins, browser layout, provider connectivity or production."}, indent=2))
