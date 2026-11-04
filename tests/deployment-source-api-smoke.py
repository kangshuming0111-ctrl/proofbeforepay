"""Fresh isolated local D1/Worker only. Synthetic identities and blocked target
transport exercise durable roles and concurrency, not production requests."""
import argparse
import hashlib
import copy
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

def stored_quote(value):
 result=copy.deepcopy(value)
 # This catalog is hydrated from independent tables, not stored quote data.
 result["proof"].get("delivery",{}).pop("supplementalCatalog",None)
 return result

def main():
 p=argparse.ArgumentParser();p.add_argument("--url",required=True);args=p.parse_args();api=roles.LocalAPI(args.url)
 assert api.ok(None,"/api/__synthetic_sandbox_test_mode")["outboundFetch"]=="blocked"
 suffix=uuid4().hex;buyer=roles.Actor("integration-operator-buyer","buyer@deployment-synthetic.example");seller=roles.Actor("deployment-seller-"+suffix,"seller@deployment-synthetic.example");outsider=roles.Actor("deployment-outside-"+suffix,"outside@deployment-synthetic.example")
 path,quote_path=chain.create_shared(api,buyer,seller,journey.specification());quote=chain.quote_of(api.ok(seller,path+"/delivery",{"files":{**journey.files(),"index.html":journey.files()["index.html"]+'<script type="module" src="./app.mjs"></script>'},"expectedDeliveryId":None,"reviewRules":True}),"seller");delivery=quote["proof"]["delivery"]["id"];endpoint=path+"/deployment-source";before=stored_quote(chain.quote_of(api.ok(buyer,quote_path),"buyer"))
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
 saved=api.ok(buyer,endpoint)["sessions"];assert len(chain.quote_of(api.ok(buyer,quote_path),"buyer")["proof"]["delivery"]["supplementalCatalog"]["rows"])==1;assert len(saved)==1;s=saved[0];assert s["status"]=="unknown" and len(s["readings"])==len(s["plan"]["files"]) and all(r["outcome"]=="unreadable" and r["reason"]=="network_unavailable" for r in s["readings"]);assert s["plan"]["registration"]==approved["registration"];assert api.ok(seller,endpoint)["sessions"]==saved
 api.reject(seller,endpoint,input,codes=(409,));assert stored_quote(chain.quote_of(api.ok(buyer,quote_path),"buyer"))==before;api.checked("History-count CAS admits exactly one concurrent member request; blocked target reads remain unknown and are durably readable by both roles; replay cannot trigger a second run; quote and money unchanged")
 artifacts=path+"/delivery-artifacts";metadata={"file":"app.mjs","bytes":len(b"export const price = 12; "),"sha256":hashlib.sha256(b"export const price = 12; ").hexdigest()}
 manifest_input={"deliveryId":delivery,"files":[metadata],"expectedManifestCount":0,"confirm":True}
 empty=api.ok(buyer,artifacts);assert empty["manifests"]==[] and empty["coverage"][0]["state"]=="missing" and empty["canSubmit"] is False
 api.reject(None,artifacts,codes=(401,));api.reject(outsider,artifacts,codes=(404,));api.reject(buyer,artifacts,manifest_input,codes=(403,));api.reject(buyer,artifacts,manifest_input,role="seller",codes=(403,));journey.custom_origin_reject(api,seller,artifacts,manifest_input)
 for patch in ({"confirm":False},{"source":"do not upload source"},{"files":[{**metadata,"source":"executable"}]},{"files":[{**metadata,"file":"../app.mjs"}]},{"files":[{**metadata,"bytes":2097153}]},{"files":[{**metadata,"file":"App.mjs"},metadata]}):api.reject(seller,artifacts,{**manifest_input,**patch},codes=(400,))
 api.reject(seller,artifacts,{**manifest_input,"deliveryId":"old"},codes=(409,))
 with ThreadPoolExecutor(max_workers=2) as pool:declarations=[f.result() for f in [pool.submit(api.request,seller,artifacts,manifest_input) for _ in range(2)]]
 assert sorted(r[0] for r in declarations)==[201,409],declarations
 created_view=next(r[1] for r in declarations if r[0]==201);assert len(created_view["manifests"])==1 and created_view["latestManifest"]["files"]==[metadata] and created_view["coverage"][0]["state"]=="declared" and created_view["canSubmit"] is True
 first_manifest=api.ok(buyer,artifacts)["latestManifest"];assert first_manifest["files"]==[metadata] and "createdBy" not in first_manifest and api.ok(seller,artifacts)["coverage"][0]["state"]=="declared"
 assert api.ok(buyer,endpoint)["sessions"][0]["stale"] is True;api.reject(seller,artifacts,manifest_input,codes=(409,));api.reject(seller,endpoint,{**input,"expectedSessionCount":1},codes=(409,));assert len(api.ok(buyer,endpoint)["sessions"])==1
 api.checked("Independent immutable manifest uses seller identity and CSRF, rejects raw source/path/size/case conflicts, admits exactly one racing save, makes old v1 check historical and rejects missing expected-manifest snapshot")
 next_input={**input,"expectedSessionCount":1,"expectedArtifactManifestId":first_manifest["id"]};second=api.ok(seller,endpoint,next_input)["sessions"];assert len(second)==2
 dynamic=next(item for item in second if item["plan"]["version"]==2);assert dynamic["plan"]["artifactManifest"]==first_manifest and dynamic["plan"]["scriptCoverage"][0]["state"]=="declared" and next(f for f in dynamic["plan"]["files"] if f["kind"]=="javascript")["sha256"]==metadata["sha256"]
 old_snapshot=copy.deepcopy(first_manifest);new_files=[{**metadata,"sha256":"b"*64}];new_view=api.ok(seller,artifacts,{**manifest_input,"files":new_files,"expectedManifestCount":1});assert len(new_view["manifests"])==2 and next(m for m in new_view["manifests"] if m["id"]==first_manifest["id"])=={**old_snapshot,"stale":False};assert new_view["latestManifest"]["manifestDigest"]!=first_manifest["manifestDigest"]
 assert all(item["stale"] for item in api.ok(buyer,endpoint)["sessions"]);assert next(item for item in api.ok(buyer,endpoint)["sessions"] if item["id"]==dynamic["id"])["readings"]==dynamic["readings"];api.reject(seller,endpoint,{**next_input,"expectedSessionCount":2},codes=(409,));assert stored_quote(chain.quote_of(api.ok(buyer,quote_path),"buyer"))==before
 api.checked("v2 embeds exact public manifest and declared script hashes; a new independent declaration retains original metadata and readings, marks older checks historical, blocks stale plan replay and leaves quote/money unchanged")
 api.ok(buyer,path+"/integration-requests",{"action":"review","requestId":approved["id"],"expectedRevision":approved["revision"],"status":"rejected","reason":"Synthetic operator revokes the disposable target after prior reads."})
 api.reject(seller,endpoint,{**next_input,"expectedSessionCount":2},codes=(404,409));assert api.ok(buyer,endpoint)["targets"]==[]
 replacement=chain.quote_of(api.ok(seller,path+"/delivery",{"files":journey.files(True),"expectedDeliveryId":delivery,"reviewRules":True}),"seller");retained=api.ok(buyer,endpoint)["sessions"];assert len(retained)==2 and all(x["stale"] for x in retained);assert api.ok(seller,artifacts)["latestManifest"] is None and all(m["stale"] for m in api.ok(seller,artifacts)["manifests"]);assert next(x for x in retained if x["id"]==s["id"])["readings"]==s["readings"]
 api.reject(seller,endpoint,{**next_input,"expectedSessionCount":2},codes=(409,));assert not replacement["proof"].get("acceptedDeliveryId") and replacement["proof"]["paymentState"]=="unfunded";api.checked("A separately consented repeat needs the current history count; revoked targets and replacement stop new requests while immutable previous readings remain historical; acceptance/payment untouched")
 # Exhaust the independent8-manifest bound using the current replacement.
 current_id=replacement["proof"]["delivery"]["id"]
 for count in range(2,8):api.ok(seller,artifacts,{**manifest_input,"deliveryId":current_id,"files":[{**metadata,"sha256":str(count)*64}],"expectedManifestCount":count})
 full=api.ok(buyer,artifacts);assert len(full["manifests"])==8 and full["canSubmit"] is False;api.reject(seller,artifacts,{**manifest_input,"deliveryId":current_id,"expectedManifestCount":8},codes=(400,));assert len(api.ok(seller,artifacts)["manifests"])==8
 # A separately accepted project rejects new metadata even below history bound.
 locked_path,locked_quote_path=chain.create_shared(api,buyer,seller,chain.spec("Synthetic accepted manifest lock"));locked_q=chain.quote_of(api.ok(seller,locked_path+"/delivery",{"files":{"index.html":"<!doctype html><html><head><title>Synthetic accepted artifact lock</title></head><body><p>Hello synthetic acceptance</p></body></html>"},"expectedDeliveryId":None,"reviewRules":True}),"seller");locked_id=locked_q["proof"]["delivery"]["id"];locked_artifacts=locked_path+"/delivery-artifacts"
 api.ok(seller,locked_artifacts,{**manifest_input,"deliveryId":locked_id});catalog=api.ok(buyer,locked_path+"/supplemental-evidence")["catalog"]
 decision={"version":1,"deliveryId":locked_id,"deliveryDigest":catalog["deliveryDigest"],"catalogDigest":catalog["catalogDigest"],"catalogContext":catalog["context"],"catalogRows":catalog["rows"],"confirmedAt":datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z"),"entries":[]}
 api.ok(buyer,locked_path+"/supplemental-evidence",decision);api.ok(seller,locked_path+"/submit_delivery",{"deliveryId":locked_id,"note":"Synthetic metadata accepted lock test"});locked_q=chain.quote_of(api.ok(buyer,locked_quote_path),"buyer");expected=roles.acceptance_basis(locked_q);expected["supplementalCatalogDigest"]=catalog["catalogDigest"]
 accepted=chain.quote_of(api.ok(buyer,locked_path+"/accept_delivery",{"deliveryId":locked_id,"confirm":True,"manualChecks":chain.human_checks(locked_q),"expectedEvidence":expected}),"buyer");assert accepted["proof"]["collaboration"]["stage"]=="accepted" and accepted["proof"]["collaboration"]["acceptance"]["deliveryId"]==locked_id and api.ok(seller,locked_artifacts)["canSubmit"] is False
 api.reject(seller,locked_artifacts,{**manifest_input,"deliveryId":locked_id,"expectedManifestCount":1},codes=(409,));assert len(api.ok(buyer,locked_artifacts)["manifests"])==1
 api.checked("Fresh D1 enforces8 immutable declarations across delivery history; a separate explicitly accepted project freezes metadata below the cap and no ninth row or post-acceptance declaration is saved")
 print(json.dumps({"checked":api.checks,"groups":len(api.checks),"outboundFetch":"blocked","browserOperated":False,"money":"unchanged","deployment":"none"},indent=2))
if __name__=="__main__":main()
