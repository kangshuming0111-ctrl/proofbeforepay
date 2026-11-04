"""Owned isolated Worker/D1 witness guards. Synthetic actors and bounded GET
responses, no browser, native backend, external provider or payment execution."""
import copy
import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("witness_integration", Path(__file__).with_name("seller-integration-api-smoke.py"))
integration = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = integration
spec.loader.exec_module(integration)
journey, chain, roles = integration.journey, integration.chain, integration.roles

def main():
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument("--url",required=True);args=parser.parse_args();api=roles.LocalAPI(args.url)
 assert api.ok(None,"/api/__synthetic_browser_witness_mode")["outboundFetch"]=="blocked"
 suffix=uuid4().hex;buyer=roles.Actor("integration-operator-buyer","operator@witness-synthetic.example");seller=roles.Actor("witness-seller-"+suffix,"seller@witness-synthetic.example");outsider=roles.Actor("witness-outsider-"+suffix,"outsider@witness-synthetic.example")
 path,quote_path=chain.create_shared(api,buyer,seller,journey.specification());quote=chain.quote_of(api.ok(seller,path+"/delivery",{"files":journey.files(),"expectedDeliveryId":None,"reviewRules":True}),"seller");delivery=quote["proof"]["delivery"]["id"]
 # The saved optional technical agreement is a separate buyer decision.
 api.ok(buyer,path+"/journey-checks",{"action":"confirm-plan","deliveryId":delivery,"confirm":True})
 submitted=api.ok(seller,path+"/integration-requests",{"action":"submit","deliveryId":delivery,"manifest":integration.manifest()})["requests"][0]
 approval={"label":"Synthetic independently read staging","scenario":"fixed","expiresAt":(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(timespec="milliseconds").replace("+00:00","Z")}
 approved=api.ok(buyer,path+"/integration-requests",{"action":"review","requestId":submitted["id"],"expectedRevision":1,"status":"approved","reason":"Synthetic operator explicitly reviewed isolated staging.","approval":approval})["requests"][0]
 endpoint=path+"/browser-witness";target=approved["registration"]["id"];begin={"action":"begin","deliveryId":delivery,"targetId":target,"task":"valid_booking","confirm":True}
 api.reject(None,endpoint,codes=(401,));api.reject(outsider,endpoint,codes=(404,));api.reject(seller,endpoint,begin,codes=(403,));api.reject(seller,endpoint,begin,role="buyer",codes=(403,));journey.custom_origin_reject(api,buyer,endpoint,begin)
 for patch,codes in (({"confirm":False},(400,)),({"url":"https://caller.example"},(400,)),({"deliveryId":"stale"},(409,)),({"targetId":"unapproved"},(404,))):api.reject(buyer,endpoint,{**begin,**patch},codes=codes)
 assert api.ok(seller,endpoint)["canOperate"] is False
 api.checked("Configured owning operator, real membership, CSRF and exact current target govern a persisted witness; caller URL/authority claims are rejected")
 before=chain.quote_of(api.ok(buyer,quote_path),"buyer");view=api.ok(buyer,endpoint,begin);session=view["session"];assert session["version"]==2 and session["status"]=="open" and session["baseline"]["outcome"]=="empty";assert view["entryUrl"].endswith("run="+session["runId"]);assert api.ok(buyer,endpoint)["sessions"][0]["id"]==session["id"]
 api.reject(buyer,endpoint,begin,codes=(409,));assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==before
 fixture=api.ok(None,"/api/__synthetic_browser_witness_mode");assert fixture["calls"] and all(call["lease"] and call["method"]=="GET" for call in fixture["calls"])
 api.checked("Fresh task and expected intent survive reload before any read; synthetic transport observes saved leases, GET-only and unchanged quote/money")
 record={"action":"record","sessionId":session["id"],"expectedVersion":session["version"],"deliveryId":delivery,"displayedStatus":"success","resultText":"Saved. Your booking is active, for2people.","domExcerpt":"Synthetic supplied visible result; no browser was operated."}
 for patch,codes in (({"expectedVersion":1},(409,)),({"deliveryId":"stale"},(409,)),({"receiptId":"https://caller.example"},(400,)),({"accepted":True},(400,))):api.reject(buyer,endpoint,{**record,**patch},codes=codes)
 observed=api.ok(buyer,endpoint,record)["session"];assert observed["status"]=="recorded" and observed["report"]["outcome"]=="mismatch" and observed["report"]["reason"]=="page_claimed_success_without_saved_booking";assert observed["report"]["scope"]["browserAttestation"] is False
 api.reject(buyer,endpoint,record,codes=(409,));assert api.ok(seller,endpoint)["sessions"][0]["report"]==observed["report"];assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==before
 api.checked("One-time CAS report detects supplied success versus empty GET readbacks; old version, receipt URLs, authority claims and replay cannot overwrite it")
 above=api.ok(buyer,endpoint,{**begin,"task":"above_party_limit"})["session"];above_record={**record,"sessionId":above["id"],"expectedVersion":2,"displayedStatus":"client_blocked","resultText":"Value must be6orless."};saved=api.ok(buyer,endpoint,above_record)["session"];assert saved["report"]["outcome"]=="corroborated" and saved["report"]["reason"]=="above_limit_rejection_with_no_saved_booking"
 current=api.ok(buyer,endpoint,begin)["session"];closed=api.ok(buyer,endpoint,{"action":"close","sessionId":current["id"],"expectedVersion":current["version"],"deliveryId":delivery,"confirm":True})["session"];assert closed["report"]["outcome"]=="unknown" and closed["report"]["reason"]=="operator_closed_without_result" and closed["report"]["serverReadback"]==[]
 api.reject(buyer,endpoint,{**record,"sessionId":closed["id"],"expectedVersion":closed["version"]},codes=(409,));assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==before
 api.checked("Above-limit supplied rejection is corroborated separately; explicitly abandoning an unfinished task records unknown without I/O, rollback, acceptance or payment")
 waiting=api.ok(buyer,endpoint,begin)["session"]
 calls_before=len(api.ok(None,"/api/__synthetic_browser_witness_mode")["calls"])
 api.ok(buyer,path+"/integration-requests",{"action":"review","requestId":approved["id"],"expectedRevision":approved["revision"],"status":"rejected","reason":"Operator revoked this staging declaration after beginning the witness."})
 api.reject(buyer,endpoint,{**record,"sessionId":waiting["id"],"expectedVersion":waiting["version"]},codes=(404,409))
 assert len(api.ok(None,"/api/__synthetic_browser_witness_mode")["calls"])==calls_before
 abandoned=api.ok(buyer,endpoint,{"action":"close","sessionId":waiting["id"],"expectedVersion":waiting["version"],"deliveryId":delivery,"confirm":True})["session"]
 assert abandoned["report"]["outcome"]=="unknown" and abandoned["registration"]==waiting["registration"]
 assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==before
 api.checked("Revoked approval blocks before any seller GET; operator can explicitly close the stale task without I/O while retaining original binding")
 print(json.dumps({"checked":api.checks,"groups":len(api.checks),"outboundFetch":"blocked","browserOperated":False,"nativeBackend":"controlled response fixture only","money":"unchanged","deployment":"none"},indent=2))
if __name__=="__main__":main()
