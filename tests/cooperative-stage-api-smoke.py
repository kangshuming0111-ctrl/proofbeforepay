"""Cooperative appendix API/D1 regression. Synthetic gateway identities only.

Run through the existing owned, outbound-blocked local Worker runner. No real
AI, payment, browser or third-party backend observations are asserted here.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

sys.dont_write_bytecode = True
module = importlib.util.spec_from_file_location("cooperative_chain", Path(__file__).with_name("chain-coverage-api-smoke.py"))
chain = importlib.util.module_from_spec(module)
sys.modules[module.name] = chain
module.loader.exec_module(chain)
roles = chain.roles


def compact(value, sort=False):
    return json.dumps(value, ensure_ascii=False, sort_keys=sort, separators=(",", ":"))


def digest(value, sort=False):
    return hashlib.sha256(compact(value, sort).encode()).hexdigest()


def report_for(quote, run):
    delivery = quote["proof"]["delivery"]
    criterion = next(c for c in quote["proof"]["criteria"] if c["id"].startswith("coverage-"))
    stages = ["submit", "stored_record", "fresh_readback", "email_receipt"]
    plan = {"schema": "pbp-delivery-stage-plan-v1", "runId": run, "syntheticOnly": True,
            "scope": {"projectId": quote["id"], "deliveryId": delivery["id"], "criterionId": criterion["id"], "sourceRevision": "synthetic-adapter-v1", "requirement": criterion["source"]},
            "payloadDigest": "b" * 64, "stages": [{"stage": s, "coverage": "adapter" if s != "email_receipt" else "unsupported"} for s in stages]}
    base = {"outcome": "observed", "runId": run, "sourceRevision": "synthetic-adapter-v1", "record": {"recordId": "native-test-1", "payloadDigest": "b" * 64}}
    observations = [{**base, "stage": "submit", "accepted": True, "operationId": "native-post"},
                    {**base, "stage": "stored_record", "reader": "native_store", "connectionId": "original"},
                    {**base, "stage": "fresh_readback", "reader": "fresh_connection", "connectionId": "new-connection"},
                    {"outcome": "unsupported"}]
    value = {"schema": "pbp-delivery-stage-report-v1", "evidenceLevel": "cooperative_adapter_observations", "plan": plan,
             "rows": [{"stage": stage, "observation": observation, "status": "matched" if index < 3 else "unsupported", "reason": "cooperative_record_matches" if index < 3 else "stage_not_supported"} for index, (stage, observation) in enumerate(zip(stages, observations))],
             "summary": {"matched": 3, "mismatch": 0, "unknown": 0, "unsupported": 1}}
    return {"deliveryId": delivery["id"], "deliveryDigest": digest(sorted(delivery["files"].items())), "report": {**value, "digest": digest(value, True)}}


def reseal(payload):
    report = payload["report"]
    report["digest"] = digest({k: v for k, v in report.items() if k != "digest"}, True)


def create(api, buyer, seller, label):
    path, quote_path = chain.create_shared(api, buyer, seller, chain.spec(label))
    q = chain.quote_of(api.ok(seller, path + "/delivery", {"files": {"index.html": "<!doctype html><html><head><title>Synthetic appendix</title></head><body><p>Controlled source.</p></body></html>"}, "expectedDeliveryId": None, "reviewRules": True}), "seller")
    return path, quote_path, q


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    args = parser.parse_args()
    api = roles.LocalAPI(args.url)
    marker = api.ok(None, "/api/__synthetic_sandbox_test_mode")
    assert marker["outboundFetch"] == "blocked" and marker["syntheticConfiguration"] is True
    suffix = uuid4().hex
    buyer = roles.Actor("stage-buyer-" + suffix, "buyer@stage-synthetic.example")
    seller = roles.Actor("stage-seller-" + suffix, "seller@stage-synthetic.example")
    outsider = roles.Actor("stage-outsider-" + suffix, "outsider@stage-synthetic.example")
    path, quote_path, quote = create(api, buyer, seller, "Synthetic shared cooperative appendix")
    endpoint = path + "/stage-evidence"
    payload = report_for(quote, "stage-one")
    api.reject(None, endpoint, payload, codes=(401,))
    api.reject(outsider, endpoint, payload, codes=(404,))
    for key, value in [("projectId", "wrong-project"), ("deliveryId", "wrong-delivery"), ("criterionId", "wrong-criterion"), ("requirement", "Changed original requirement")]:
        wrong = copy.deepcopy(payload)
        wrong["report"]["plan"]["scope"][key] = value
        reseal(wrong)
        api.reject(seller, endpoint, wrong, codes=(409,))
    wrong = copy.deepcopy(payload)
    wrong["deliveryDigest"] = "0" * 64
    api.reject(seller, endpoint, wrong, codes=(409,))
    wrong = {**payload, "reportedByRole": "buyer"}
    api.reject(seller, endpoint, wrong, codes=(400,))
    wrong = copy.deepcopy(payload)
    wrong["report"]["summary"]["matched"] = 4
    api.reject(seller, endpoint, wrong, codes=(400,))
    assert not api.ok(buyer, quote_path)["quote"]["proof"]["delivery"].get("cooperativeStageReports")
    api.checked("Authenticated membership, exact project/delivery/criterion/source/file bindings and report recomputation reject forged claims before persistence")

    saved = chain.quote_of(api.ok(seller, endpoint, payload, role="buyer"), "seller")
    records = saved["proof"]["delivery"]["cooperativeStageReports"]
    assert len(records) == 1 and records[0]["reportedByRole"] == "seller"
    assert records[0]["report"] == payload["report"]
    assert api.ok(buyer, quote_path)["quote"]["proof"]["delivery"]["cooperativeStageReports"] == records
    assert api.ok(seller, endpoint, payload)["quote"]["proof"]["delivery"]["cooperativeStageReports"] == records
    with ThreadPoolExecutor(max_workers=2) as pool:
        repeated = [f.result() for f in [pool.submit(api.request, buyer, endpoint, payload), pool.submit(api.request, seller, endpoint, payload)]]
    assert [r[0] for r in repeated] == [200, 200]
    assert api.ok(buyer, quote_path)["quote"]["proof"]["delivery"]["cooperativeStageReports"] == records
    roles.no_payment(saved)
    assert not saved["proof"]["delivery"].get("assessment")
    api.checked("Actual D1 save survives independent participant reads; forged role loses to membership; duplicate requests retain one server receipt and no acceptance/model/payment")

    for index in [2, 3]:
        api.ok(buyer, endpoint, report_for(quote, "stage-" + str(index)), role="seller")
    retained = api.ok(buyer, quote_path)["quote"]["proof"]["delivery"]["cooperativeStageReports"]
    assert len(retained) == 3 and retained[0] == records[0]
    api.reject(seller, endpoint, report_for(quote, "stage-four"), codes=(409,))
    assert api.ok(buyer, quote_path)["quote"]["proof"]["delivery"]["cooperativeStageReports"] == retained
    listing = api.ok(buyer, "/api/proofs")
    assert all("cooperativeStageReports" not in item["proof"].get("delivery", {}) for item in listing["quotes"])
    api.checked("Three-report append bound refuses without eviction; lightweight project lists omit report bodies")

    old_id = quote["proof"]["delivery"]["id"]
    replaced = chain.quote_of(api.ok(seller, path + "/delivery", {"files": {"index.html": "<!doctype html><html><head><title>Replacement</title></head><body>Replacement scope source</body></html>"}, "expectedDeliveryId": old_id, "reviewRules": True}), "seller")
    assert replaced["proof"]["delivery"]["id"] != old_id
    assert not replaced["proof"]["delivery"].get("cooperativeStageReports")
    api.reject(seller, endpoint, payload, codes=(409,))
    archived = api.ok(buyer, path + "/versions/" + old_id)
    assert archived["version"]["delivery"]["cooperativeStageReports"] == retained
    api.checked("Replacement inherits no old report; stale upload is rejected and the complete prior appendix remains in the archived delivery")

    path2, quote_path2, q2 = create(api, buyer, seller, "Synthetic frozen acceptance appendix")
    d2 = q2["proof"]["delivery"]["id"]
    api.ok(seller, path2 + "/submit_delivery", {"deliveryId": d2, "note": "Synthetic source requiring explicit human review."})
    q2 = chain.quote_of(api.ok(buyer, quote_path2), "buyer")
    accepted = chain.quote_of(api.ok(buyer, path2 + "/accept_delivery", {"deliveryId": d2, "confirm": True, "manualChecks": chain.human_checks(q2)}), "buyer")
    frozen = copy.deepcopy(chain.snapshot(accepted))
    appended = chain.quote_of(api.ok(seller, path2 + "/stage-evidence", report_for(accepted, "after-acceptance")), "seller")
    assert chain.snapshot(appended) == frozen
    assert appended["proof"]["collaboration"]["stage"] == "accepted"
    assert appended["proof"]["collaboration"]["acceptance"]["deliveryId"] == d2
    assert appended["proof"]["paymentState"] == "unfunded"
    assert "cooperativeStageReports" not in frozen
    assert api.ok(None, "/api/__synthetic_sandbox_test_mode")["syntheticCalls"] == marker["syntheticCalls"]
    api.checked("A post-acceptance appendix cannot rewrite frozen acceptance evidence or payment; the entire suite makes zero provider requests")
    print(json.dumps({"groups": len(api.checks), "checked": api.checks, "syntheticGatewayActors": True, "outboundFetch": "blocked", "providerCalls": 0, "money": "unchanged", "deployment": "none"}, indent=2))


if __name__ == "__main__":
    main()
