"""Fresh isolated local D1/Worker only. Synthetic identities and blocked target
transport exercise durable roles and concurrency, not production requests."""
import argparse
import importlib.util
import json
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
from uuid import uuid4
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location("deployment_integration",Path(__file__).with_name("seller-integration-api-smoke.py"));integration=importlib.util.module_from_spec(spec);sys.modules[spec.name]=integration;spec.loader.exec_module(integration)
journey,chain,roles=integration.journey,integration.chain,integration.roles

def main():
 p=argparse.ArgumentParser();p.add_argument("--url",required=True);args=p.parse_args();api=roles.LocalAPI(args.url)
 assert api.ok(None,"/api/__synthetic_sandbox_test_mode")["outboundFetch"]=="blocked"
 suffix=uuid4().hex;buyer=roles.Actor("integration-operator-buyer","buyer@deployment-synthetic.example");seller=roles.Actor("deployment-seller-"+suffix,"seller@deployment-synthetic.example");outsider=roles.Actor("deployment-outside-"+suffix,"outside@deployment-synthetic.example")
 path,quote_path=chain.create_shared(api,buyer,seller,journey.specification());quote=chain.quote_of(api.ok(seller,path+"/delivery",{"files":journey.files(),"expectedDeliveryId":None,"reviewRules":True}),"seller");delivery=quote["proof"]["delivery"]["id"];endpoint=path+"/deployment-source";before=chain.quote_of(api.ok(buyer,quote_path),"buyer")
 input={"action":"run","deliveryId":delivery,"entryFile":"index.html","targetId":"none","expectedSessionCount":0,"confirm":True}
 api.reject(None,endpoint,codes=(401,));api.reject(outsider,endpoint,codes=(404,));api.reject(outsider,endpoint,input,codes=(404,));journey.custom_origin_reject(api,buyer,endpoint,input)
 for patch,codes in (({"confirm":False},(400,)),({"url":"https://unapproved.example"},(400,)),({"deliveryId":"old"},(409,)),({"expectedSessionCount":-1},(400,))):api.reject(buyer,endpoint,{**input,**patch},codes=codes)
 api.reject(seller,endpoint,input,codes=(404,));assert api.ok(buyer,endpoint)["sessions"]==[]
 request=api.ok(seller,path+"/integration-requests",{"action":"submit","deliveryId":delivery,"manifest":integration.manifest()})["requests"][0]
 approval={"label":"Approved isolated byte check","scenario":"fixed","expiresAt":(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(timespec="milliseconds").replace("+00:00","Z")}
 approved=api.ok(buyer,path+"/integration-requests",{"action":"review","requestId":request["id"],"expectedRevision":1,"status":"approved","reason":"Synthetic operator approves only the named disposable staging files.","approval":approval})["requests"][0];input["targetId"]=approved["registration"]["id"]
 for name in ("../private.html","missing.html","style.css"):api.reject(seller,endpoint,{**input,"entryFile":name},codes=(400,409))
 assert api.ok(buyer,endpoint)["sessions"]==[];api.checked("Only authenticated members and CSRF-valid requests may run; callerURLs, absent entries, traversal, stale uploads and unapproved targets reserve no report and issue no I/O")
 with ThreadPoolExecutor(max_workers=2) as pool:replies=[f.result() for f in [pool.submit(api.request,seller,endpoint,input),pool.submit(api.request,buyer,endpoint,input)]]
 assert sorted(r[0] for r in replies)==[200,409],replies
 saved=api.ok(buyer,endpoint)["sessions"];assert len(saved)==1;s=saved[0];assert s["status"]=="unknown" and len(s["readings"])==len(s["plan"]["files"]) and all(r["outcome"]=="unreadable" and r["reason"]=="network_unavailable" for r in s["readings"]);assert s["plan"]["registration"]==approved["registration"];assert api.ok(seller,endpoint)["sessions"]==saved
 api.reject(seller,endpoint,input,codes=(409,));assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==before;api.checked("History-count CAS admits exactly one concurrent member request; blocked target reads remain unknown and are durably readable by both roles; replay cannot trigger a second run; quote and money unchanged")
 next_input={**input,"expectedSessionCount":1};second=api.ok(seller,endpoint,next_input)["sessions"];assert len(second)==2
 api.ok(buyer,path+"/integration-requests",{"action":"review","requestId":approved["id"],"expectedRevision":approved["revision"],"status":"rejected","reason":"Synthetic operator revokes the disposable target after prior reads."})
 api.reject(seller,endpoint,{**next_input,"expectedSessionCount":2},codes=(404,409));assert api.ok(buyer,endpoint)["targets"]==[]
 replacement=chain.quote_of(api.ok(seller,path+"/delivery",{"files":journey.files(True),"expectedDeliveryId":delivery,"reviewRules":True}),"seller");retained=api.ok(buyer,endpoint)["sessions"];assert len(retained)==2 and all(x["stale"] for x in retained);assert next(x for x in retained if x["id"]==s["id"])["readings"]==s["readings"]
 api.reject(seller,endpoint,{**next_input,"expectedSessionCount":2},codes=(409,));assert not replacement["proof"].get("acceptedDeliveryId") and replacement["proof"]["paymentState"]=="unfunded";api.checked("A separately consented repeat needs the current history count; revoked targets and replacement stop new requests while immutable previous readings remain historical; acceptance/payment untouched")
 print(json.dumps({"checked":api.checks,"groups":len(api.checks),"outboundFetch":"blocked","browserOperated":False,"money":"unchanged","deployment":"none"},indent=2))
if __name__=="__main__":main()
