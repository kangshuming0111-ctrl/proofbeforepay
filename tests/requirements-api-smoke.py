"""Requirement-draft integration checks against an isolated compiled Worker.

BRIEFPAY_REQUIREMENTS_TEST_URL defaults to http://127.0.0.1:8789. All provider
configuration must be empty/demo. This script uses synthetic loopback identity
headers, never reads credentials, and does not test the production auth gateway.
It leaves synthetic records in the isolated local database.
"""

import importlib.util
import json
import os
import sys
from pathlib import Path
from uuid import uuid4


sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("collaboration_smoke", Path(__file__).with_name("collaboration-api-smoke.py"))
collaboration = importlib.util.module_from_spec(spec)
# dataclasses resolves annotations through the owning module's registry entry.
sys.modules[spec.name] = collaboration
spec.loader.exec_module(collaboration)
role_spec = importlib.util.spec_from_file_location("role_demo_smoke", Path(__file__).with_name("role-demo-api-smoke.py"))
roles = importlib.util.module_from_spec(role_spec)
sys.modules[role_spec.name] = roles
role_spec.loader.exec_module(roles)


def main():
    api = collaboration.LocalAPI(os.environ.get("BRIEFPAY_REQUIREMENTS_TEST_URL", "http://127.0.0.1:8789"))
    suffix = uuid4().hex[:12]
    buyer = collaboration.Actor("requirements-buyer-" + suffix, "buyer@requirements.example")
    other = collaboration.Actor("requirements-other-" + suffix, "other@requirements.example")
    config = api.ok(buyer, "/api/config")
    assert config.get("aiMode") == "demo" and config.get("paymentMode") == "demo", "Use an isolated Worker with no real providers"
    assert api.ok(buyer, "/api/proofs")["quotes"] == []

    source = ("Deliver index.html and about.html;\n"
              'index.html contains a link labelled "Contact me" pointing to about.html#contact;\n'
              "The buyer must check the final text directly.")
    extraction_input = {"sourceText": source, "sourceName": "Synthetic contract.txt", "language": "en"}
    api.reject(None, "/api/requirements", extraction_input, (401,))
    api.reject(buyer, "/api/requirements", {**extraction_input, "language": "fr"}, (400,))
    api.reject(buyer, "/api/requirements", {**extraction_input, "sourceName": 123}, (400,))
    api.reject(buyer, "/api/requirements", {**extraction_input, "sourceText": []}, (400,))
    api.reject(buyer, "/api/requirements", {**extraction_input, "sourceText": "x" * 64_001}, (413,))
    api.checked("Extraction requires platform identity and validates JSON fields/64 kB byte cap")

    draft = api.ok(buyer, "/api/requirements", {
        **extraction_input, "id": "client-chosen", "mode": "live", "model": "forged",
        "ownerId": other.identifier, "sourceRefs": [{"criterionId": "forged"}],
    })["draft"]
    assert draft["id"] != "client-chosen" and draft["mode"] == "rules"
    assert draft.get("model") != "forged" and draft["sourceText"] == source
    assert draft["pages"] and any(page["file"] == "index.html" for page in draft["pages"])
    assert api.ok(buyer, "/api/proofs")["quotes"] == [], "Extraction must not create or change a payment project"
    api.checked("Only server extraction output is persisted; parsing alone creates no quote or payment")

    project = {
        "mode": "custom", "collaborative": True,
        "title": "Requirement draft API QA", "summary": "A synthetic website contract",
        "amount": "123.45", "currency": "AUD", "language": "en",
        "requiredPages": [page["file"] for page in draft["pages"]],
        "manualRequirements": [entry["text"] for entry in draft["manualRequirements"]],
        "requirementsDraftId": draft["id"], "confirmRequirements": True,
    }
    if draft.get("link"):
        project["link"] = {key: draft["link"][key] for key in ("from", "text", "to")}

    api.reject(other, "/api/proofs", project, (404,))
    api.reject(buyer, "/api/proofs", {**project, "requirementsDraftId": str(uuid4())}, (404,))
    api.reject(buyer, "/api/proofs", {**project, "requirementsDraftId": "bad-id"}, (404,))
    api.reject(buyer, "/api/proofs", {**project, "confirmRequirements": False}, (400,))
    missing_confirmation = {key: value for key, value in project.items() if key != "confirmRequirements"}
    api.reject(buyer, "/api/proofs", missing_confirmation, (400,))
    api.reject(buyer, "/api/proofs", {"mode": "demo", "requirementsDraftId": draft["id"], "confirmRequirements": True}, (400,))
    api.reject(buyer, "/api/proofs", {"mode": "demo", "demoRoleplay": True, "requirementsDraftId": draft["id"], "confirmRequirements": True}, (400,))
    api.checked("Draft IDs are owner-bound and unknown IDs share 404; custom-only explicit confirmation is required")

    result = api.ok(buyer, "/api/proofs", {
        **project, "requirements": {"sourceText": "forged", "mode": "live", "sourceRefs": []},
        "sourceRefs": [{"criterionId": "forged"}], "totalCents": 1, "paymentMode": "sandbox",
    })
    quote = result["quote"]
    agreement = quote["proof"]["requirements"]
    assert result["role"] == "buyer" and quote["totalCents"] == 12345
    assert quote["status"] == "draft" and quote["paymentMode"] == "demo"
    assert agreement["draftId"] == draft["id"] and agreement["sourceText"] == draft["sourceText"]
    assert agreement["mode"] == "rules" and agreement["extractedAt"] == draft["extractedAt"]
    assert agreement["sourceName"] == draft["sourceName"] and agreement["confirmedAt"]
    assert agreement["sourceRefs"] and all(ref["criterionId"] != "forged" for ref in agreement["sourceRefs"])
    for ref in agreement["sourceRefs"]:
        origin = ref["source"]
        assert agreement["sourceText"][origin["start"]:origin["end"]] == origin["excerpt"]
    collaboration.no_payment(quote)
    assert api.ok(buyer, "/api/quotes/" + quote["id"])["quote"]["proof"]["requirements"] == agreement
    listing = api.ok(buyer, "/api/proofs")
    listed = next(item for item in listing["quotes"] if item["id"] == quote["id"])
    assert "sourceText" not in listed["proof"]["requirements"], "Project lists must omit the original contract text"
    legacy_listing = api.ok(buyer, "/api/quotes")
    legacy_listed = next(item for item in legacy_listing["quotes"] if item["id"] == quote["id"])
    assert "sourceText" not in legacy_listed["proof"]["requirements"], "Legacy history must also omit the original text"
    api.reject(other, "/api/quotes/" + quote["id"], codes=(404,))
    api.checked("Confirmed server provenance is stored separately from amount and omitted from large history text payloads")

    edited = {**project, "requiredPages": ["changed.html", *project["requiredPages"][1:]],
              "manualRequirements": ["An edited human requirement"]}
    if "link" in edited:
        edited["link"] = {**edited["link"], "text": "Edited label"}
    edited_quote = api.ok(buyer, "/api/proofs", edited)["quote"]
    edited_refs = edited_quote["proof"]["requirements"]["sourceRefs"]
    assert not any(ref["criterionId"] in {"page-1", "link", "manual-1"} for ref in edited_refs), "Buyer edits must not inherit false extraction provenance"
    assert edited_quote["proof"]["project"]["requiredPages"][0] == "changed.html"
    collaboration.no_payment(edited_quote)
    api.checked("Buyer-edited pages, links and human checks do not retain misleading original-source mappings")

    quote_path = "/api/proofs/" + quote["id"]
    approved = api.ok(buyer, quote_path + "/approve", {})["quote"]
    assert approved["proof"]["requirements"] == agreement
    invitation = api.ok(buyer, quote_path + "/invite", {"email": other.email})["invitation"]
    joined = api.ok(other, "/api/proof-invitations/accept", {
        "token": invitation["token"], "confirm": True, "sellerName": "Synthetic seller",
    })
    assert joined["role"] == "seller" and joined["quote"]["proof"]["requirements"] == agreement
    seller_listing = api.ok(other, "/api/proofs")
    seller_listed = next(item for item in seller_listing["quotes"] if item["id"] == quote["id"])
    assert "sourceText" not in seller_listed["proof"]["requirements"]
    api.reject(other, "/api/proofs", project, (404,))
    collaboration.no_payment(joined["quote"])
    api.checked("Invited sellers can read agreed original terms but cannot reuse the buyer's private extraction draft")

    old = {key: value for key, value in project.items() if key not in {"requirementsDraftId", "confirmRequirements"}}
    legacy = api.ok(buyer, "/api/proofs", {**old, "requirements": {"sourceText": "forged"}})["quote"]
    assert "requirements" not in legacy["proof"], "Clients cannot inject provenance without a stored draft"
    collaboration.no_payment(legacy)
    api.checked("Existing custom creation remains compatible and ignores self-asserted requirement provenance")

    role_api = roles.LocalAPI(api.origin)
    roleplay = roles.quote_response(role_api.ok(buyer, "/api/proofs", {
        **project, "demoRoleplay": True, "collaborative": False,
        "aiMode": "live", "paymentMode": "sandbox", "sellerId": other.identifier, "demoSampleProject": True,
    }, role="seller"), "buyer")
    assert roleplay["title"] == project["title"] and roleplay["summary"] == project["summary"]
    assert roleplay["totalCents"] == 12345 and roleplay["proof"]["requirements"] == {
        **agreement, "confirmedAt": roleplay["proof"]["requirements"]["confirmedAt"],
    }
    assert roleplay["proof"]["project"]["requiredPages"] == project["requiredPages"]
    assert roleplay["proof"]["project"]["manualRequirements"] == project["manualRequirements"]
    assert roleplay["proof"]["project"]["link"] == project["link"]
    assert roleplay["proof"].get("demoSampleProject") is False, "Custom role play cannot forge built-in sample provenance"
    role_id = roleplay["id"]
    role_path = "/api/proofs/" + role_id
    role_api.reject(other, "/api/quotes/" + role_id, role="seller", codes=(404,))
    role_api.reject(buyer, role_path + "/approve", {}, role="seller")
    roleplay = roles.quote_response(role_api.ok(buyer, role_path + "/approve", {}, role="buyer"), "buyer")
    assert roleplay["proof"]["collaboration"]["stage"] == "in_progress"
    role_api.reject(buyer, role_path + "/invite", {"email": other.email}, role="buyer", codes=(409,))
    role_api.reject(buyer, role_path + "/delivery", {"files": collaboration.FILES_V1}, role="buyer")
    role_api.reject(buyer, role_path + "/delivery", {"variant": "fixed"}, role="seller", codes=(409,))
    first = roles.quote_response(role_api.ok(buyer, role_path + "/delivery", {
        "files": {"index.html": collaboration.FILES_V1["index.html"], "design.css": collaboration.FILES_V1["design.css"]},
    }, role="seller"), "seller")
    first_id = first["proof"]["delivery"]["id"]
    roles.quote_response(role_api.ok(buyer, role_path + "/review", {}, role="seller"), "seller")
    roles.quote_response(role_api.ok(buyer, role_path + "/submit_delivery", {
        "deliveryId": first_id, "note": "Initial custom website delivery",
    }, role="seller"), "seller")
    roles.quote_response(role_api.ok(buyer, role_path + "/return", {
        "deliveryId": first_id, "feedback": [{"criterionId": "page-2", "comment": "Please include the agreed about.html page."}],
    }, role="buyer"), "buyer")
    revised = roles.quote_response(role_api.ok(buyer, role_path + "/delivery", {"files": collaboration.FILES_V2}, role="seller"), "seller")
    delivery_id = revised["proof"]["delivery"]["id"]
    revised = roles.quote_response(role_api.ok(buyer, role_path + "/review", {}, role="seller"), "seller")
    assert not any(item["finding"] == "fail" for item in revised["proof"]["delivery"]["evidence"])
    checks = sorted({item["criterionId"] for item in revised["proof"]["delivery"]["evidence"] if item["finding"] == "needs_human"})
    roles.quote_response(role_api.ok(buyer, role_path + "/submit_delivery", {
        "deliveryId": delivery_id, "note": "Revised custom website delivery",
    }, role="seller"), "seller")
    acceptance = {"deliveryId": delivery_id, "confirm": True, "manualChecks": checks}
    accepted = roles.quote_response(role_api.ok(buyer, role_path + "/accept_delivery", acceptance, role="buyer"), "buyer")
    assert accepted["proof"]["collaboration"]["stage"] == "accepted"
    roles.no_payment(accepted)
    assert accepted["proof"]["requirements"] == roleplay["proof"]["requirements"]
    archived = role_api.ok(buyer, role_path + "/versions/" + first_id, role="seller")["version"]
    assert archived["submission"]["note"] == "Initial custom website delivery" and len(archived["feedback"]) == 1
    api.checked("Custom role play preserves the user's confirmed specification and sources; the owner alone can test seller upload, buyer return, revision and nonfinancial acceptance")

    checkout = role_api.ok(buyer, role_path + "/checkout", {}, role="buyer")
    assert checkout["mode"] == "demo" and not checkout.get("approvalUrl")
    roles.quote_response(role_api.ok(buyer, role_path + "/authorize", {"orderId": checkout["orderId"]}, role="buyer"), "buyer")
    role_api.reject(buyer, role_path + "/capture", acceptance, role="seller")
    captured = roles.quote_response(role_api.ok(buyer, role_path + "/capture", acceptance, role="buyer"), "buyer")
    assert captured["proof"]["paymentState"] == "captured" and captured["captureId"].startswith("SIM-")
    roles.quote_response(role_api.ok(buyer, "/api/quotes/" + role_id, role="seller"), "seller")
    api.checked("Custom role play forces provider-free AI/payment modes and keeps payment confirmation in the buyer role")
    print(json.dumps({"checks": api.checks, "provider_calls": "None; empty configuration required", "auth_boundary": "Simulated local trusted headers only"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
