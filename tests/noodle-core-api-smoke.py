"""Fixed fictional noodle-shop workflow through actual local HTTP and fresh D1.

Gateway actors are synthetic; this is not production sign-in, real browser
visibility, AI or payment testing. The runner blocks all outbound provider fetch.
"""
import argparse
import copy
import importlib.util
import json
import sys
from pathlib import Path
from uuid import uuid4

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("noodle_core_chain", Path(__file__).with_name("chain-coverage-api-smoke.py"))
chain = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = chain
spec.loader.exec_module(chain)
roles = chain.roles
ROOT = Path(__file__).parent / "fixtures" / "noodle-core"


def specification():
    source = json.loads((ROOT / "project.json").read_text())
    summary = source["summary"]
    rows = summary.splitlines()
    items = []
    for i, (file, expected) in enumerate([
        ("menu-en.html", {"kind": "item_price", "label": "Beef noodles", "amountMinor": 1800, "currency": "AUD"}),
        ("menu-zh.html", {"kind": "item_price", "label": "牛肉面", "amountMinor": 1800, "currency": "AUD"}),
        ("visit.html", {"kind": "visible_copy", "text": "+61 3 9000 0000"}),
    ]):
        start = summary.index(rows[i])
        items.append({"id": f"business-{i + 1}", "criterionId": f"coverage-{i + 1}", "file": file,
                      "source": {"start": start, "end": start + len(rows[i]), "excerpt": rows[i]}, "expected": expected})
    return {"mode": "custom", "collaborative": True, "demoRoleplay": False, "paymentTesting": "collaborative-sandbox", "language": "zh",
            "currency": "AUD", "amount": "1.00", "title": source["title"], "summary": summary, "requiredPages": source["requiredPages"], "manualRequirements": [],
            "coverage": {"version": 1, "sourceText": summary, "confirmed": True, "decisions": [{"id": f"coverage-{i + 1}", "disposition": "include"} for i in range(len(rows))]},
            "businessChecks": {"confirmed": True, "items": items}}


def files(version):
    return {p.name: p.read_text() for p in (ROOT / version).iterdir() if p.is_file()}


def state(result, criterion="coverage-4"):
    return next(row for row in result["scopeContext"]["states"] if row["criterionId"] == criterion)


def proposal(quote, target, latest=None, criterion="coverage-4"):
    row = next(c for c in quote["proof"]["criteria"] if c["id"] == criterion)
    return {"action": "propose", "deliveryId": quote["proof"]["delivery"]["id"], "criterionId": criterion,
            "criterionSource": row["source"], "expectedLatestId": latest, "target": target,
            "basisNote": "This is the existing contact-form requirement, not a new compliance decision."}


def confirm(quote, row):
    return {"action": "confirm", "deliveryId": quote["proof"]["delivery"]["id"], "proposalId": row["id"], "proposalDigest": row["digest"],
            "confirm": True, "basisNote": "I explicitly agree to this exact saved page/form scope."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker["syntheticConfiguration"] is True and marker["outboundFetch"] == "blocked"
    suffix = uuid4().hex
    buyer = roles.Actor("noodle-core-buyer-" + suffix, "buyer@noodle-core-synthetic.example")
    seller = roles.Actor("noodle-core-seller-" + suffix, "seller@noodle-core-synthetic.example")
    outsider = roles.Actor("noodle-core-outsider-" + suffix, "outsider@noodle-core-synthetic.example")
    path, quote_path = chain.create_shared(api, buyer, seller, specification())
    q = chain.quote_of(api.ok(seller, path + "/delivery", {"files": files("v1"), "expectedDeliveryId": None, "reviewRules": True}), "seller")
    assert len([c for c in q["proof"]["criteria"] if c["id"].startswith("coverage-")]) == 4
    assert not q["proof"].get("requirements")
    d1 = q["proof"]["delivery"]["id"]
    endpoint = path + "/scope-clarifications"
    initial = api.ok(buyer, endpoint)
    assert state(initial)["status"] == "none" and not initial["scopeContext"]["bindings"]
    assert {"kind": "form", "file": "visit.html", "formId": "enquiry"} in [row["target"] for row in initial["candidates"]]
    target = {"kind": "form", "file": "visit.html", "formId": "enquiry"}
    p = proposal(q, target)
    api.reject(None, endpoint, p, codes=(401, 404))
    api.reject(outsider, endpoint, codes=(404,))
    api.reject(outsider, endpoint, p, codes=(404,))
    for patch in ({"criterionSource": p["criterionSource"] + " changed"}, {"deliveryId": "stale"},
                  {"target": {"kind": "form", "file": "visit.html", "formId": "missing"}}, {"proposedByRole": "seller"}):
        api.reject(buyer, endpoint, {**p, **patch}, codes=(400, 409))
    assert state(api.ok(buyer, endpoint))["status"] == "none"
    api.checked("No-contract intake preserves four exact requirements; real local membership, original source, version, target and client-role guards reject invalid writes")

    proposed = api.ok(buyer, endpoint, p, role="seller")
    first = state(proposed)["latest"]
    assert first["proposedByRole"] == "buyer" and first["confirmations"] == []
    assert first["confirmationMode"] == "authenticated-participants"
    one = api.ok(buyer, endpoint, confirm(q, first), role="seller")
    assert state(one)["status"] == "pending" and [r["role"] for r in state(one)["latest"]["confirmations"]] == ["buyer"]
    assert not one["scopeContext"]["bindings"]
    duplicate = api.ok(buyer, endpoint, confirm(q, first))
    assert duplicate["scopeContext"] == one["scopeContext"]
    wrong = confirm(q, first); wrong["proposalDigest"] = "0" * 64
    api.reject(seller, endpoint, wrong, codes=(409,))
    both = api.ok(seller, endpoint, confirm(q, first), role="buyer")
    assert state(both)["status"] == "confirmed"
    assert [r["role"] for r in state(both)["latest"]["confirmations"]] == ["buyer", "seller"]
    saved_context = copy.deepcopy(both["scopeContext"])
    assert api.ok(buyer, endpoint)["scopeContext"] == saved_context
    assert api.ok(seller, endpoint)["scopeContext"] == saved_context
    assert not both["quote"]["proof"]["delivery"].get("assessment")
    assert not both["quote"]["proof"].get("acceptedDeliveryId")
    roles.no_payment(both["quote"])
    api.checked("Proposal is not consent; forged role cannot supply the other confirmation; duplicate consent is idempotent; two explicit participant confirmations persist without an AI pass, acceptance or payment")

    second = api.ok(seller, endpoint, proposal(q, {"kind": "page", "file": "visit.html"}, first["id"]))
    assert state(second)["status"] == "pending" and not second["scopeContext"]["bindings"]
    second_row = state(second)["latest"]
    api.reject(seller, endpoint, confirm(q, first), codes=(409,))
    api.reject(buyer, endpoint, p, codes=(409,))
    assert len(second["quote"]["proof"]["scopeClarifications"]) == 2
    assert second["quote"]["proof"]["scopeClarifications"][0] == state(both)["latest"]
    third = api.ok(buyer, endpoint, proposal(q, target, second_row["id"]))
    third_row = state(third)["latest"]
    api.ok(buyer, endpoint, confirm(q, third_row))
    scoped = api.ok(seller, endpoint, confirm(q, third_row))
    assert state(scoped)["status"] == "confirmed" and len(scoped["quote"]["proof"]["scopeClarifications"]) == 3
    before_feedback = copy.deepcopy(scoped["quote"])
    api.checked("A changed proposal immediately retires previous authority without deleting its history; old-proposal consent and stale expected-latest writes fail, and only the replacement proposal's two confirmations restore scope")

    api.ok(seller, path + "/submit_delivery", {"deliveryId": d1, "note": "First source has a wrong Chinese price and split contact fields."})
    api.reject(seller, path + "/return", {"deliveryId": d1, "feedback": [{"criterionId": "coverage-4", "comment": "Fix contact fields."}]}, codes=(403,))
    returned = chain.quote_of(api.ok(buyer, path + "/return", {"deliveryId": d1, "feedback": [
        {"criterionId": "coverage-2", "comment": "Chinese menu must show 牛肉面 AUD18, not28."},
        {"criterionId": "coverage-4", "comment": "Put 姓名 and 邮箱 together in the confirmed enquiry form."}]}), "buyer")
    assert returned["proof"]["collaboration"]["stage"] == "changes_requested"
    feedback = copy.deepcopy(returned["proof"]["collaboration"]["feedback"])
    fixed = chain.quote_of(api.ok(seller, path + "/delivery", {"files": files("v2"), "expectedDeliveryId": d1, "reviewRules": True}), "seller")
    d2 = fixed["proof"]["delivery"]["id"]
    assert d2 != d1 and not fixed["proof"]["delivery"].get("assessment") and not fixed["proof"]["delivery"].get("assessmentHistory")
    assert not fixed["proof"].get("acceptedDeliveryId")
    api.reject(seller, endpoint, confirm(q, third_row), codes=(409,))
    current_scope = api.ok(buyer, endpoint)
    assert state(current_scope)["status"] == "confirmed"
    binding = next(b for b in current_scope["scopeContext"]["bindings"] if b["criterionId"] == "coverage-4")
    assert binding["basisDeliveryId"] == d1 and binding["currentDeliveryId"] == d2 and binding["carriedFromBasis"] is True
    assert fixed["proof"]["collaboration"]["feedback"] == feedback
    archived = api.ok(buyer, path + "/versions/" + d1)["version"]
    assert archived["delivery"]["files"] == files("v1")
    assert "AUD 28" not in fixed["proof"]["delivery"]["files"]["menu-zh.html"]
    assert archived["delivery"]["id"] == d1
    api.checked("Buyer feedback is criterion-bound; seller replacement preserves the complete old file snapshot and feedback, revalidates scope against the new target, and inherits no assessment or acceptance")

    api.ok(seller, path + "/submit_delivery", {"deliveryId": d2, "note": "Revised source fixes the Chinese price, phone and enquiry labels. It claims no working form backend."})
    fresh = chain.quote_of(api.ok(buyer, quote_path), "buyer")
    # This is an isolated API boundary: these readings are synthetic inputs, not
    # an assertion of actual browser visibility. Production CUA checks separately.
    blocks={"business-1":["Beef noodles AUD 18"],"business-2":["牛肉面 AUD 18"],"business-3":["+61 3 9000 0000"]}
    readings=[{"stepId":f"business:{width}:{item['id']}","status":"observed","blocks":blocks[item["id"]]} for item in fresh["proof"]["project"]["businessChecks"] for width in (375,900)]
    fresh=chain.quote_of(api.ok(buyer,path+"/business-checks",{"deliveryId":d2,"previousReportId":None,"readings":readings}),"buyer")
    assert fresh["proof"]["delivery"]["businessChecks"]["summary"]["issues"]==0
    business_decision={"reportId":fresh["proof"]["delivery"]["businessChecks"]["id"]}
    api.reject(buyer, path + "/accept_delivery", {"deliveryId": d1, "confirm": True, "manualChecks": chain.human_checks(fresh)}, codes=(409,))
    api.reject(buyer, path + "/accept_delivery", {"deliveryId": d2, "confirm": True, "manualChecks": []}, codes=(400, 409))
    accepted = chain.quote_of(api.ok(buyer, path + "/accept_delivery", {"deliveryId": d2, "confirm": True, "manualChecks": chain.human_checks(fresh), "businessDecision":business_decision}), "buyer")
    assert accepted["proof"]["collaboration"]["stage"] == "accepted"
    assert accepted["proof"]["collaboration"]["acceptance"]["deliveryId"] == d2
    snapshot = chain.snapshot(accepted)
    assert snapshot["deliveryId"] == d2 and snapshot["assessmentId"] is None
    api.reject(buyer, endpoint, proposal(accepted, target, third_row["id"]), codes=(409,))
    roles.no_payment(accepted)
    assert accepted["proof"]["paymentState"] == "unfunded"
    api.checked("Only the current submitted version with explicit per-criterion human decisions is accepted; accepted scope is frozen and acceptance performs no financial action")

    sealed = json.loads((Path(__file__).parent / "fixtures" / "noodle-f1-sealed.json").read_text())["projects"][2]
    eval_spec = {"mode": "custom", "collaborative": True, "demoRoleplay": False, "paymentTesting": "collaborative-sandbox", "language": sealed["language"], "currency": "AUD", "amount": "1.00", "title": "Synthetic sealed source-binding fixture", "summary": sealed["summary"], "requiredPages": sealed["requiredPages"], "manualRequirements": [],
                 "businessChecks": sealed["businessChecks"], "coverage": {"version": 1, "sourceText": sealed["summary"], "confirmed": True, "decisions": [{"id": c["id"], "disposition": "include"} for c in sealed["criteria"]]}}
    eval_path, eval_quote_path = chain.create_shared(api, buyer, seller, eval_spec)
    eval_quote = chain.quote_of(api.ok(seller, eval_path + "/delivery", {"files": sealed["files"], "expectedDeliveryId": None, "reviewRules": True}), "seller")
    f = sealed["confirmedScopeFixture"]
    eval_proposed = api.ok(buyer, eval_path + "/scope-clarifications", proposal(eval_quote, {k: f[k] for k in ("kind", "file", "formId")}, criterion=f["criterionId"]))
    eval_row = state(eval_proposed, f["criterionId"])["latest"]
    api.ok(buyer, eval_path + "/scope-clarifications", confirm(eval_quote, eval_row))
    eval_result = api.ok(seller, eval_path + "/scope-clarifications", confirm(eval_quote, eval_row))
    assert state(eval_result, f["criterionId"])["status"] == "confirmed"
    assert eval_result["quote"]["proof"]["delivery"]["files"] == sealed["files"]
    for native_summary in ['The form source in contact.html must include Name and Email as label text.', 'The form source in contact.html must include "Name" as label text.']:
        native_spec={**eval_spec,"title":"Synthetic exact-file scope guard","summary":native_summary,"requiredPages":["index.html","contact.html","other.html"],"coverage":{"version":1,"sourceText":native_summary,"confirmed":True,"decisions":[{"id":"coverage-1","disposition":"include"}]}}
        native_spec.pop("businessChecks",None)
        native_path,_=chain.create_shared(api,buyer,seller,native_spec)
        markup='<!doctype html><html><head><title>Scope source</title></head><body><form id="enquiry"><label>Name<input></label><label>Email<input></label></form></body></html>'
        native_quote=chain.quote_of(api.ok(seller,native_path+"/delivery",{"files":{name:markup for name in native_spec["requiredPages"]},"expectedDeliveryId":None,"reviewRules":True}),"seller")
        api.reject(buyer,native_path+"/scope-clarifications",proposal(native_quote,{"kind":"form","file":"other.html","formId":"enquiry"},criterion="coverage-1"),codes=(409,))
        native_valid=api.ok(buyer,native_path+"/scope-clarifications",proposal(native_quote,{"kind":"form","file":"contact.html","formId":"enquiry"},criterion="coverage-1"))
        assert state(native_valid,"coverage-1")["status"]=="pending"
    api.checked("An explicit native contact.html requirement cannot be redirected to an unrelated page even when both files contain matching form labels")
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == marker["syntheticCalls"]
    api.checked("The frozen wrong-page AI case receives its scope through the actual propose/two-confirmation HTTP path; all tests make zero provider requests")
    print(json.dumps({"groups": len(api.checks), "checked": api.checks, "syntheticGatewayActors": True, "outboundFetch": "blocked", "providerCalls": 0, "money": "unchanged", "scopeFixtureQuote": eval_result["quote"], "scopeFixtureContext": eval_result["scopeContext"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
