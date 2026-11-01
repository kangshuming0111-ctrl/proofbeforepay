"""Synthetic assessment-route checks for an already running, provider-free Worker.

Use --url or BRIEFPAY_ASSESSMENT_TEST_URL with a plain loopback origin. The
reused LocalAPI rejects external origins, redirects and environment proxies.
This script never reads credentials or calls a model/payment provider. Trusted
identity headers simulate the application gateway; they do not test real login.

Optional cache test, without adding any deployable testing route:
  1. Run with --emit-cache-fixture outputs/.../assessment-cache.sql.
  2. Separately apply that SQL to the SAME isolated local D1, never production.
  3. Run with --verify-cache-fixture outputs/.../assessment-cache.json.
The emitted report is explicitly synthetic and proves cache/version behavior
only. No generated assessment or live model success is claimed.
"""

import argparse
import importlib.util
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4


sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("assessment_role_smoke", Path(__file__).with_name("role-demo-api-smoke.py"))
roles = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = roles
_spec.loader.exec_module(roles)

HTML = '<!doctype html><html><head><title>Assessment fixture</title></head><body><h1>Fixture only</h1><p>Hours: Monday to Friday 11am-8pm.</p></body></html>'
FILES = {"index.html": HTML, "design.css": "body { color: #243742; }"}
REVISED_FILES = {**FILES, "index.html": HTML.replace("Fixture only", "Revised fixture only")}


def spec(title, roleplay=True):
    return {"mode": "custom", "demoRoleplay": roleplay, "collaborative": not roleplay,
            "title": title, "summary": "Synthetic manual requirements without an attached contract",
            "clientName": "Assessment QA", "currency": "AUD", "amount": "1.00", "language": "en",
            "requiredPages": ["index.html"], "manualRequirements": ["Display opening hours: Monday to Friday 11am-8pm."]}


def actor(label):
    return roles.Actor("assessment-" + label + "-" + uuid4().hex[:12], label + "@assessment.example")


def read(api, owner, quote_id, role="buyer", roleplay=True):
    return roles.quote_response(api.ok(owner, "/api/quotes/" + quote_id, role=role), role, roleplay=roleplay)


def no_contract_or_money(quote):
    assert "requirements" not in quote["proof"], "A manually entered scope must not invent a contract attachment"
    roles.no_payment(quote)


def reject_unchanged(api, caller, owner, quote_id, payload, status, role="buyer", roleplay=True, message=None):
    before = read(api, owner, quote_id, roleplay=roleplay)
    code, result, _ = api.request(caller, "/api/proofs/" + quote_id + "/assess", payload, role=role)
    assert code == status, (code, status, api.diagnostic(result))
    if message:
        assert isinstance(result, dict) and re.search(message, result.get("error", ""), re.I), api.diagnostic(result)
    assert read(api, owner, quote_id, roleplay=roleplay) == before, "Failed assessment changed rules, delivery, acceptance or payment"
    return result


def create_reviewed_roleplay(api, owner, title):
    quote = roles.quote_response(api.ok(owner, "/api/proofs", spec(title)), "buyer")
    path = "/api/proofs/" + quote["id"]
    api.ok(owner, path + "/approve", {}, role="buyer")
    quote = roles.quote_response(api.ok(owner, path + "/delivery", {"files": FILES}, role="seller"), "seller")
    quote = roles.quote_response(api.ok(owner, path + "/review", {}, role="seller"), "seller")
    return quote


def check_provider_free(api, owner):
    config = api.ok(owner, "/api/config")
    assert config.get("aiMode") == "demo" and config.get("paymentMode") == "demo", "Stop: use empty model and payment provider configuration"


def main_checks(api):
    owner, seller, outsider = actor("buyer"), actor("seller"), actor("outsider")
    check_provider_free(api, owner)
    api.reject(None, "/api/proofs", spec("Anonymous assessment project"), codes=(401,))
    quote = roles.quote_response(api.ok(owner, "/api/proofs", spec("Manual no-contract assessment QA")), "buyer")
    quote_id, path = quote["id"], "/api/proofs/" + quote["id"]
    no_contract_or_money(quote)
    assert quote["proof"].get("demoSampleProject") is False
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": "missing", "confirm": True}, 409)
    api.ok(owner, path + "/approve", {}, role="buyer")
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": "missing", "confirm": True}, 409)
    api.checked("Manual custom role play creates and locks without a contract; draft/missing-delivery assessment is rejected")

    api.reject(owner, path + "/delivery", {"files": FILES}, role="buyer", codes=(403,))
    quote = roles.quote_response(api.ok(owner, path + "/delivery", {"files": FILES}, role="seller"), "seller")
    delivery_id = quote["proof"]["delivery"]["id"]
    assert quote["proof"]["delivery"]["files"] == FILES
    for caller in (None, outsider):
        reject_unchanged(api, caller, owner, quote_id, {"deliveryId": delivery_id, "confirm": True}, 404, role="seller")
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": "stale", "confirm": True}, 409, role="seller")
    for payload in ({"deliveryId": delivery_id}, {"deliveryId": delivery_id, "confirm": False}):
        reject_unchanged(api, owner, owner, quote_id, payload, 400, role="seller", message="confirm")
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": delivery_id, "confirm": True}, 409, role="seller", message="rule checks")
    api.checked("Saved own files retain buyer-upload restrictions, account isolation, current-version binding, explicit consent and current rule-review prerequisite")

    quote = roles.quote_response(api.ok(owner, path + "/review", {}, role="seller"), "seller")
    for perspective in ("buyer", "seller"):
        reject_unchanged(api, owner, owner, quote_id, {"deliveryId": delivery_id, "confirm": True}, 409,
                         role=perspective, message="not configured")
    assert "assessment" not in read(api, owner, quote_id)["proof"]["delivery"]
    api.checked("No-key assessment is explicit in either demo perspective and never fabricates a report or modifies the saved quote")

    api.ok(owner, path + "/submit_delivery", {"deliveryId": delivery_id, "note": "Synthetic ready-for-review submission"}, role="seller")
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": delivery_id, "confirm": True}, 409, message="not configured")
    api.ok(owner, path + "/return", {"deliveryId": delivery_id, "feedback": [{"criterionId": "manual-1", "comment": "Please clarify the opening-hours wording."}]}, role="buyer")
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": delivery_id, "confirm": True}, 409, role="seller", message="not configured")
    quote = roles.quote_response(api.ok(owner, path + "/delivery", {"files": REVISED_FILES}, role="seller"), "seller")
    new_id = quote["proof"]["delivery"]["id"]
    assert new_id != delivery_id and "assessment" not in quote["proof"]["delivery"] and "review" not in quote["proof"]
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": delivery_id, "confirm": True}, 409)
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": new_id, "confirm": True}, 409, message="rule checks")
    api.checked("Submitted and returned versions keep their stage on AI failure; a replacement requires its own rule review and cannot borrow an old report")

    quote = roles.quote_response(api.ok(owner, path + "/review", {}, role="seller"), "seller")
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": new_id, "confirm": True}, 409, message="not configured")
    api.ok(owner, path + "/submit_delivery", {"deliveryId": new_id, "note": "Synthetic revised files ready"}, role="seller")
    human_ids = sorted({item["criterionId"] for item in quote["proof"]["delivery"]["evidence"] if item["finding"] == "needs_human"})
    accepted = roles.quote_response(api.ok(owner, path + "/accept_delivery", {"deliveryId": new_id, "confirm": True, "manualChecks": human_ids}, role="buyer"), "buyer")
    assert accepted["proof"]["collaboration"]["acceptance"]["deliveryId"] == new_id
    no_contract_or_money(accepted)
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": new_id, "confirm": True}, 409)
    api.checked("Human-only acceptance still works without an AI report or contract; accepted-stage assessment is frozen and cannot change acceptance/payment")

    shared = roles.quote_response(api.ok(owner, "/api/proofs", spec("Real collaboration assessment QA", roleplay=False)), "buyer", roleplay=False)
    shared_id, shared_path = shared["id"], "/api/proofs/" + shared["id"]
    no_contract_or_money(shared)
    api.ok(owner, shared_path + "/approve", {}, role="buyer")
    reject_unchanged(api, owner, owner, shared_id, {"deliveryId": "missing", "confirm": True}, 409, roleplay=False)
    invitation = api.ok(owner, shared_path + "/invite", {"email": seller.email}, role="buyer")["invitation"]
    # The bearer token remains in process memory and is never written to output.
    api.ok(seller, "/api/proof-invitations/accept", {"token": invitation["token"], "confirm": True, "sellerName": "Synthetic assessment seller"})
    invitation = None
    api.reject(owner, shared_path + "/delivery", {"files": FILES}, role="seller", codes=(403,))
    shared = roles.quote_response(api.ok(seller, shared_path + "/delivery", {"files": FILES}), "seller", roleplay=False)
    shared_delivery = shared["proof"]["delivery"]["id"]
    reject_unchanged(api, seller, owner, shared_id, {"deliveryId": shared_delivery, "confirm": True}, 409, role="seller", roleplay=False, message="rule checks")
    api.ok(seller, shared_path + "/review", {})
    for caller, perspective in ((owner, "buyer"), (seller, "seller")):
        reject_unchanged(api, caller, owner, shared_id, {"deliveryId": shared_delivery, "confirm": True}, 409,
                         role=perspective, roleplay=False, message="not configured")
    reject_unchanged(api, outsider, owner, shared_id, {"deliveryId": shared_delivery, "confirm": True}, 404, roleplay=False)
    no_contract_or_money(read(api, owner, shared_id, roleplay=False))
    api.checked("Real two-account collaboration supports manually entered scope and authentic seller files; role headers do not grant upload rights and both members receive truthful no-key assessment errors")
    return owner


def emit_cache_fixture(api, sql_path):
    owner = actor("cache-owner")
    quote = create_reviewed_roleplay(api, owner, "External D1 synthetic assessment-cache fixture")
    delivery = quote["proof"]["delivery"]
    citation = {"file": "index.html", "start": HTML.index("<h1>Fixture only</h1>"), "end": HTML.index("<h1>Fixture only</h1>") + len("<h1>Fixture only</h1>"), "excerpt": "<h1>Fixture only</h1>"}
    report = {"id": str(uuid4()), "deliveryId": delivery["id"], "method": "source-ai-v1", "mode": "live", "model": "synthetic-no-provider-call",
              "assessedAt": datetime.now(timezone.utc).isoformat(),
              "items": [{"criterionId": criterion["id"], "status": "insufficient_evidence", "explanation": "Synthetic cache fixture only; no AI request or assessment occurred.",
                         "citations": [citation], "ruleEvidenceIds": [item["id"] for item in delivery["evidence"] if item["criterionId"] == criterion["id"]]}
                        for criterion in quote["proof"]["criteria"]],
              "risks": [], "limitations": ["SYNTHETIC D1 CACHE FIXTURE. This is not a generated or verified AI assessment."],
              "coverage": {"includedFiles": list(FILES), "truncatedFiles": [], "omittedFiles": []}}
    literal = lambda value: "'" + str(value).replace("'", "''") + "'"
    sql_path = Path(sql_path).resolve()
    sql_path.parent.mkdir(parents=True, exist_ok=True)
    statement = ("-- Apply externally to the same ISOLATED LOCAL D1 only. Never production.\n"
                 "-- Synthetic cache/version fixture; no model result or live API success is claimed.\n"
                 "UPDATE quotes SET payload = json_set(payload, '$.proof.delivery.assessment', json(" + literal(json.dumps(report)) + ")), version = version + 1 "
                 "WHERE id = " + literal(quote["id"]) + " AND owner_id = " + literal(owner.identifier)
                 + " AND json_extract(payload, '$.proof.demoRoleplay') = 1 AND json_extract(payload, '$.proof.collaboration.stage') = 'in_progress'"
                 + " AND json_extract(payload, '$.proof.delivery.id') = " + literal(delivery["id"])
                 + " AND json_extract(payload, '$.proof.review.deliveryId') = " + literal(delivery["id"]) + ";\n")
    sql_path.write_text(statement)
    context_path = sql_path.with_suffix(".json")
    context_path.write_text(json.dumps({"fixture": "synthetic-assessment-cache-v1", "origin": api.origin, "owner": {"identifier": owner.identifier, "email": owner.email},
                                        "quoteId": quote["id"], "deliveryId": delivery["id"], "report": report}, indent=2) + "\n")
    return {"sql": str(sql_path), "context": str(context_path), "applied": False,
            "next_step": "Apply SQL externally to isolated local D1, then use --verify-cache-fixture with the context file"}


def verify_cache_fixture(api, context_path):
    context = json.loads(Path(context_path).read_text())
    assert context["fixture"] == "synthetic-assessment-cache-v1" and context["origin"] == api.origin
    owner = roles.Actor(**context["owner"])
    assert owner.identifier.startswith("assessment-cache-owner-")
    quote_id, old_id = str(UUID(context["quoteId"])), str(UUID(context["deliveryId"]))
    check_provider_free(api, owner)
    before = read(api, owner, quote_id)
    assert before["proof"]["delivery"]["id"] == old_id
    assert before["proof"]["delivery"].get("assessment") == context["report"], "Apply the external isolated-D1 SQL fixture before verifying cache behavior"
    assert context["report"]["model"] == "synthetic-no-provider-call"
    for payload, status in (({"deliveryId": old_id}, 400), ({"deliveryId": old_id, "confirm": False}, 400), ({"deliveryId": "stale", "confirm": True}, 409)):
        reject_unchanged(api, owner, owner, quote_id, payload, status)
    reject_unchanged(api, actor("cache-outsider"), owner, quote_id, {"deliveryId": old_id, "confirm": True}, 404)
    path = "/api/proofs/" + quote_id
    for perspective in ("buyer", "seller", "buyer"):
        roles.quote_response(api.ok(owner, path + "/assess", {"deliveryId": old_id, "confirm": True}, role=perspective), perspective)
        assert read(api, owner, quote_id) == before, "Cache retrieval must not modify any quote state or call the provider"
    api.checked("Explicit consent, ownership and current-delivery guards still apply before a seeded cached report; repeated retrieval uses no provider and changes no quote state")
    replacement = roles.quote_response(api.ok(owner, path + "/delivery", {"files": REVISED_FILES}, role="seller"), "seller")
    new_id = replacement["proof"]["delivery"]["id"]
    assert new_id != old_id and "assessment" not in replacement["proof"]["delivery"] and "review" not in replacement["proof"]
    old = api.ok(owner, path + "/versions/" + old_id)["version"]
    assert old["delivery"]["assessment"] == context["report"]
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": old_id, "confirm": True}, 409)
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": new_id, "confirm": True}, 409, message="rule checks")
    api.ok(owner, path + "/review", {}, role="seller")
    reject_unchanged(api, owner, owner, quote_id, {"deliveryId": new_id, "confirm": True}, 409, message="not configured")
    no_contract_or_money(read(api, owner, quote_id))
    api.checked("Replacing a seeded assessed version archives its report read-only, clears the current report/review and cannot reuse old assessment for the new delivery")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=os.environ.get("BRIEFPAY_ASSESSMENT_TEST_URL", "http://127.0.0.1:8789"))
    fixture = parser.add_mutually_exclusive_group()
    fixture.add_argument("--emit-cache-fixture", metavar="SQL_PATH")
    fixture.add_argument("--verify-cache-fixture", metavar="JSON_PATH")
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    if args.verify_cache_fixture:
        verify_cache_fixture(api, args.verify_cache_fixture)
        emitted = None
    else:
        main_checks(api)
        emitted = emit_cache_fixture(api, args.emit_cache_fixture) if args.emit_cache_fixture else None
    print(json.dumps({"scope": "Synthetic isolated loopback application API; no real auth/browser/provider verification", "passed": len(api.checks), "checks": api.checks,
                      "provider_calls": "None; empty provider configuration required", "cache_fixture": emitted,
                      "limits": "A seeded report proves cache/version behavior only, not live model generation; SQL is never executed by this script"}, indent=2))


if __name__ == "__main__":
    main()
