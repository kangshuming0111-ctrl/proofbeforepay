"""Local-only package/version checks. No model, authorization or payment requests."""
import base64
import json
import os
import struct
import zlib
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BASE = os.environ.get("BRIEFPAY_TEST_URL", "http://127.0.0.1:5173").rstrip("/")
assert urlparse(BASE).hostname in {"localhost", "127.0.0.1", "::1"}, "Local preview only"

def request(path, data=None):
    req = Request(BASE + path, data=None if data is None else json.dumps(data).encode(),
                  headers={"Content-Type": "application/json", "Origin": BASE})
    try:
        with urlopen(req, timeout=15) as response:
            return response.status, response.read(), response.headers
    except HTTPError as error:
        return error.code, error.read(), error.headers

def ok(path, data=None):
    status, raw, _ = request(path, data)
    assert status in {200, 201}, (path, status)
    return json.loads(raw)

def png(colour):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\0" + bytes(colour))) + chunk(b"IEND", b"")

def data_url(raw):
    return "data:image/png;base64," + base64.b64encode(raw).decode()

def page(body, stylesheet):
    return '<!doctype html><html><head><title>Local package QA</title><link rel="stylesheet" href="' + stylesheet + '"></head><body>' + body + '</body></html>'

quote = ok("/api/proofs", {"mode": "custom", "title": "Local static resource package QA", "summary": "Synthetic nested assets and immutable replacement checks", "amount": "15.00", "currency": "AUD", "language": "en", "requiredPages": ["index.html", "pages/contact.html"], "link": {"from": "pages/contact.html", "text": "Home", "to": "index.html#top"}, "manualRequirements": []})["quote"]
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
    assert headers["X-Content-Type-Options"] == "nosniff" and headers["Cache-Control"] == "no-store"

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
print("Static resources API passed: nested HTML/CSS/raster preview, MIME/CSP, deterministic missing files and immutable asset/version snapshots; no provider calls.")
