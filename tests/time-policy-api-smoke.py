"""Isolated local Worker/D1 time-policy API. Gateway actors and outbound
transport are synthetic; this script does not claim native target execution.
The separate time-policy.test.ts executes actual independent native SQLite SQL.
"""
import argparse
import copy
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("time_policy_integration", Path(__file__).with_name("seller-integration-api-smoke.py"))
integration = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = integration
spec.loader.exec_module(integration)
journey, chain, roles = integration.journey, integration.chain, integration.roles
PLAN = {"policy": {"timezone": "Australia/Melbourne", "weekdays": [1, 2, 3, 4, 5, 6, 7], "opens": "11:00", "closes": "20:00", "leadMinutes": 120, "cancelMinutes": 1440}, "testDate": "2027-01-15", "gapLocal": "2027-10-03T02:30", "foldLocal": "2027-04-04T02:30", "sourceNote": "Buyer explicitly confirms an additional synthetic time agreement, separate from original contract citations.", "provenance": "buyer-confirmed-supplemental-agreement"}

def main():
 parser=argparse.ArgumentParser();parser.add_argument("--url",required=True);args=parser.parse_args();api=roles.LocalAPI(args.url)
 assert api.ok(None,"/api/__synthetic_sandbox_test_mode")["outboundFetch"]=="blocked"
 suffix=uuid4().hex;buyer=roles.Actor("integration-operator-buyer","buyer@time-policy-synthetic.example");seller=roles.Actor("time-seller-"+suffix,"seller@time-policy-synthetic.example");outsider=roles.Actor("time-outsider-"+suffix,"outsider@time-policy-synthetic.example")
 path,quote_path=chain.create_shared(api,buyer,seller,journey.specification());quote=chain.quote_of(api.ok(seller,path+"/delivery",{"files":journey.files(),"expectedDeliveryId":None,"reviewRules":True}),"seller");delivery=quote["proof"]["delivery"]["id"];endpoint=path+"/time-policy";before=chain.quote_of(api.ok(buyer,quote_path),"buyer")
 payload={"action":"save","deliveryId":delivery,"plan":PLAN,"confirm":True}
 api.reject(None,endpoint,codes=(401,));api.reject(outsider,endpoint,codes=(404,));api.reject(seller,endpoint,payload,codes=(403,));api.reject(seller,endpoint,payload,role="buyer",codes=(403,));journey.custom_origin_reject(api,buyer,endpoint,payload)
 for patch,codes in (({"confirm":False},(400,)),({"deliveryId":"stale"},(409,)),({"url":"https://caller.example"},(400,)),({"plan":{**PLAN,"gapLocal":"2027-01-15T02:30"}},(400,))):api.reject(buyer,endpoint,{**payload,**patch},codes=codes)
 session=api.ok(buyer,endpoint,payload)["session"];assert session["status"]=="planned" and session["version"]==1 and len(session["cases"])==12 and session["trace"]==[];assert api.ok(seller,endpoint)["sessions"][0]["id"]==session["id"];assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==before
 api.checked("Only true buyer can save explicit exact-version supplemental policy; outsider, forged role, CSRF, invalid DST and callerURL are rejected; quote and money remain unchanged")
 run={"action":"run","deliveryId":delivery,"sessionId":session["id"],"expectedVersion":1,"targetId":"unapproved","confirm":True};api.reject(buyer,endpoint,run,codes=(404,));assert api.ok(buyer,endpoint)["sessions"][0]["status"]=="planned"
 submitted=api.ok(seller,path+"/integration-requests",{"action":"submit","deliveryId":delivery,"manifest":integration.manifest()})["requests"][0]
 approval={"label":"Synthetic time protocol target","scenario":"fixed","expiresAt":(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(timespec="milliseconds").replace("+00:00","Z")}
 approved=api.ok(buyer,path+"/integration-requests",{"action":"review","requestId":submitted["id"],"expectedRevision":1,"status":"approved","reason":"Synthetic owner operator approved isolated staging target.","approval":approval})["requests"][0];run["targetId"]=approved["registration"]["id"]
 for patch,codes in (({"expectedVersion":0},(409,)),({"deliveryId":"stale"},(409,)),({"url":"https://caller.example"},(400,)),({"confirm":False},(400,))):api.reject(seller,endpoint,{**run,**patch},codes=codes)
 with ThreadPoolExecutor(max_workers=2) as pool:replies=[f.result() for f in [pool.submit(api.request,seller,endpoint,run) for _ in range(2)]]
 assert sorted(r[0] for r in replies)==[200,409],replies
 saved=api.ok(buyer,endpoint)["sessions"][0];assert saved["status"]=="unknown" and len(saved["trace"])==1 and saved["trace"][0]["method"]=="GET" and all(r["outcome"]=="unknown" for r in saved["results"]);assert saved["registration"]==approved["registration"];assert api.ok(seller,endpoint)["sessions"][0]==saved;api.reject(buyer,endpoint,run,codes=(409,));assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==before
 api.checked("One CAS winner executes one bounded metadataGET through blocked transport, records unknown without POSTs, retains exact registration and rejects replay; both real project roles read saved state")
 waiting=api.ok(buyer,endpoint,payload)["session"]
 api.ok(buyer,path+"/integration-requests",{"action":"review","requestId":approved["id"],"expectedRevision":approved["revision"],"status":"rejected","reason":"Synthetic operator explicitly revoked this target before another run."})
 api.reject(seller,endpoint,{**run,"sessionId":waiting["id"]},codes=(404,409));assert next(s for s in api.ok(buyer,endpoint)["sessions"] if s["id"]==waiting["id"])["trace"]==[]
 replacement=chain.quote_of(api.ok(seller,path+"/delivery",{"files":journey.files(True),"expectedDeliveryId":delivery,"reviewRules":True}),"seller");new_id=replacement["proof"]["delivery"]["id"];assert new_id!=delivery
 history=api.ok(buyer,endpoint)["sessions"];assert len(history)==2 and all(s["stale"] for s in history);assert next(s for s in history if s["id"]==saved["id"])["trace"]==saved["trace"]
 api.reject(buyer,endpoint,payload,codes=(409,));api.reject(seller,endpoint,{**run,"sessionId":waiting["id"]},codes=(409,));assert not replacement["proof"].get("acceptedDeliveryId") and replacement["proof"]["paymentState"]=="unfunded"
 api.checked("Revocation prevents new targetI/O and delivery replacement preserves old supplemental traces without inheriting them into the new version or changing acceptance/payment")
 calendar_plan=copy.deepcopy(PLAN);calendar_plan["policy"].update({"weekdays":[5],"opens":"22:00","closes":"02:00","calendar":{"version":2,"closedDates":["2027-01-22","2027-01-30"]}});calendar_plan["sourceNote"]="Buyer confirms calendar v2: Friday22:00 through Saturday02:00, opening-date weekday, closed civil dates and no tail from closed opening dates."
 calendar_payload={**payload,"deliveryId":new_id,"plan":calendar_plan};replacement_before=chain.quote_of(api.ok(buyer,quote_path),"buyer")
 for invalid in [{**calendar_plan,"policy":{k:v for k,v in calendar_plan["policy"].items() if k!="calendar"}},{**calendar_plan,"policy":{**calendar_plan["policy"],"calendar":{"version":2,"closedDates":["2027-01-22","2027-01-22"]}}},{**calendar_plan,"testDate":"2027-01-22"}]:api.reject(buyer,endpoint,{**calendar_payload,"plan":invalid},codes=(400,))
 calendar_saved=api.ok(buyer,endpoint,calendar_payload)["session"];assert calendar_saved["version"]==1 and calendar_saved["status"]=="planned" and len(calendar_saved["cases"])==17
 refreshed=api.ok(seller,endpoint)["sessions"];assert next(s for s in refreshed if s["id"]==calendar_saved["id"])["plan"]==calendar_plan;assert all(s["stale"] for s in refreshed if s["id"]!=calendar_saved["id"]);assert not next(s for s in refreshed if s["id"]==calendar_saved["id"])["stale"]
 assert next(s for s in refreshed if s["id"]==saved["id"])["trace"]==saved["trace"];assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==replacement_before
 api.checked("Explicit calendarv2 overnight/closed-date plan persists and reloads for both roles on exact replacement; v1 evidence stays unchanged, unversioned overnight/duplicate closure/closed baseline are refused")
 print(json.dumps({"checked":api.checks,"groups":len(api.checks),"outboundFetch":"blocked","nativeBackend":"separately tested by actual SQLite fixture","browserOperated":False,"money":"unchanged","deployment":"none"},indent=2))
if __name__=="__main__":main()
