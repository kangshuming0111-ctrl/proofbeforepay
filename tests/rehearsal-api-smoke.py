"""New Sandbox-rehearsal request boundaries on an isolated provider-free Worker.

The only supported target is a plain loopback origin. Empty AI/payment config
is required before any mutation. Trusted identity headers are synthetic local
fixtures, not production authentication. No credentials are read and no real
provider request is made. Positive Sandbox provider protocol is separately
covered by mocked fetch responses in proof-rehearsal.test.ts.
"""

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("rehearsal_role_smoke", Path(__file__).with_name("role-demo-api-smoke.py"))
roles = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = roles
_spec.loader.exec_module(roles)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("BRIEFPAY_REHEARSAL_TEST_URL", "http://127.0.0.1:8789"))
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    owner = roles.Actor("rehearsal-qa-" + uuid4().hex, "buyer@rehearsal.example")
    config = api.ok(owner, "/api/config")
    assert config.get("aiMode") == "demo" and config.get("paymentMode") == "demo", "Stop: use empty provider config"
    base = {"mode": "custom", "demoRoleplay": True, "collaborative": False,
            "title": "Synthetic rehearsal boundary", "summary": "Local request policy only",
            "amount": "1.00", "currency": "AUD", "language": "en",
            "requiredPages": ["index.html"], "manualRequirements": []}
    listed_before = api.ok(owner, "/api/proofs")["quotes"]
    assert not listed_before
    api.reject(None, "/api/proofs", {**base, "paymentTesting": "sandbox"}, codes=(401,))
    for value in (False, True, None, "live", "demo", "sandbox ", 1, {}):
        api.reject(owner, "/api/proofs", {**base, "paymentTesting": value}, codes=(400,))
    for changes in ({"demoRoleplay": False}, {"collaborative": True}, {"mode": "other"}):
        api.reject(owner, "/api/proofs", {**base, **changes, "paymentTesting": "sandbox"}, codes=(400,))
    api.checked("Invalid rehearsal modes, anonymous identity and real-collaboration requests cannot opt into Sandbox")

    code, rejected, _ = api.request(owner, "/api/proofs", {**base, "paymentTesting": "sandbox"})
    assert code == 409 and "not configured" in rejected.get("error", ""), (code, api.diagnostic(rejected))
    api.reject(owner, "/api/proofs", {"mode": "demo", "demoRoleplay": True, "collaborative": False, "paymentTesting": "sandbox"}, codes=(409,))
    assert api.ok(owner, "/api/proofs")["quotes"] == listed_before, "Rejected configuration must not create a fallback demo"
    api.checked("Custom and built-in Sandbox without test credentials reject409 without saving silently downgraded projects")

    # Neither a client-composed proof marker nor a later action can turn an
    # old provider-free demonstration into the newly authorized creation mode.
    created = api.ok(owner, "/api/proofs", {**base, "sandboxRehearsal": True,
                   "paymentMode": "sandbox", "proof": {"sandboxRehearsal": True}})
    quote = roles.quote_response(created, "buyer")
    assert quote["proof"].get("sandboxRehearsal") is None
    path = "/api/proofs/" + quote["id"]
    approved = roles.quote_response(api.ok(owner, path + "/approve", {"paymentTesting": "sandbox"}, role="buyer"), "buyer")
    assert approved["proof"].get("sandboxRehearsal") is None
    assert approved["proof"]["collaboration"]["stage"] == "in_progress"
    checkout = api.ok(owner, path + "/checkout", {"paymentTesting": "sandbox"}, role="buyer")
    assert checkout["mode"] == "demo" and checkout["orderId"].startswith("DEMO-")
    persisted = roles.quote_response(api.ok(owner, "/api/quotes/" + quote["id"], role="buyer"), "buyer")
    assert persisted["proof"].get("sandboxRehearsal") is None
    api.checked("Forged creation fields and later paymentTesting fields never upgrade existing demo records")
    api.reject(owner, path + "/checkout", {}, role="seller", codes=(403,))
    api.checked("Owner role-play seller perspective retains no buyer payment authority")
    print(json.dumps({"result": "passed", "checks": api.checks,
                      "providerCalls": "none; empty config asserted", "scope": "isolated local application/D1 only"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
