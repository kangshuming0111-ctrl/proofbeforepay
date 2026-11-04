"""Fresh owned Worker/D1 acceptance chain; synthetic gateway identities only.
No AI/provider/browser was executed. Outbound network must be blocked by the
test worker. Frozen archive persistence is checked through the unified bundle.
"""
import argparse
import copy
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location("supplemental_time_helpers",Path(__file__).with_name("time-policy-api-smoke.py"))
time=importlib.util.module_from_spec(spec);sys.modules[spec.name]=time;spec.loader.exec_module(time)
chain,roles=time.chain,time.roles

def selection(catalog):
 return {"version":1,"deliveryId":catalog["deliveryId"],"deliveryDigest":catalog["deliveryDigest"],"catalogDigest":catalog["catalogDigest"],"catalogContext":catalog["context"],"catalogRows":catalog["rows"],"confirmedAt":"2026-11-04T12:00:00.000Z","entries":[{"ref":r["ref"],"disposition":"exclude","acknowledgedFindings":[],"reason":"Buyer reviewed and excludes this unexecuted synthetic policy."}for r in catalog["rows"]]}
def basis(quote):
 value=roles.acceptance_basis(quote);catalog=quote["proof"]["delivery"].get("supplementalCatalog")
 if catalog and (catalog["rows"]or catalog["context"].get("artifactManifest")or catalog["context"].get("followupHeads")):value["supplementalCatalogDigest"]=catalog["catalogDigest"]
 return value
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--url",required=True);args=parser.parse_args();api=roles.LocalAPI(args.url);assert api.ok(None,"/api/__synthetic_sandbox_test_mode")["outboundFetch"]=="blocked"
 suffix=uuid4().hex;buyer=roles.Actor("supplemental-buyer-"+suffix,"buyer@supplemental-synthetic.example");seller=roles.Actor("supplemental-seller-"+suffix,"seller@supplemental-synthetic.example");outsider=roles.Actor("supplemental-outsider-"+suffix,"outsider@supplemental-synthetic.example")
 path,quote_path=chain.create_shared(api,buyer,seller,chain.spec("Synthetic explicit supplemental acceptance"));quote=chain.quote_of(api.ok(seller,path+"/delivery",{"files":{"index.html":"<!doctype html><html><head><title>Synthetic</title></head><body><p>Reviewed synthetic source.</p></body></html>"},"expectedDeliveryId":None,"reviewRules":True}),"seller");delivery=quote["proof"]["delivery"]["id"];endpoint=path+"/supplemental-evidence"
 plan={"action":"save","deliveryId":delivery,"plan":time.PLAN,"confirm":True};first=api.ok(buyer,path+"/time-policy",plan)["session"];catalog=api.ok(buyer,endpoint)["catalog"];assert len(catalog["rows"])==1 and catalog["rows"][0]["status"]=="planned";assert api.ok(seller,endpoint)["catalog"]==catalog;decision=selection(catalog)
 api.reject(None,endpoint,codes=(401,));api.reject(outsider,endpoint,codes=(404,));api.reject(seller,endpoint,decision,codes=(403,));api.reject(seller,endpoint,decision,role="buyer",codes=(403,));time.journey.custom_origin_reject(api,buyer,endpoint,decision)
 bad=copy.deepcopy(decision);bad["entries"][0]["disposition"]="include";api.reject(buyer,endpoint,bad,codes=(409,));bad=copy.deepcopy(decision);bad["entries"][0]["reason"]="short";api.reject(buyer,endpoint,bad,codes=(409,));bad=copy.deepcopy(decision);bad["catalogRows"][0]["findings"][0]["outcome"]="supported";api.reject(buyer,endpoint,bad,codes=(409,))
 api.checked("Actual buyer role, CSRF, full server catalog and explicit reasons govern acceptance selection; unexecuted policy and forged labels cannot be included")
 with ThreadPoolExecutor(max_workers=2)as pool:responses=[f.result()for f in[pool.submit(api.request,buyer,endpoint,decision),pool.submit(api.request,buyer,endpoint,decision)]]
 assert sorted(r[0]for r in responses)in([200,200],[200,409]),responses
 # Two200s are valid when the Worker serializes the requests and the second
 # reads the committed version. Both requests intentionally choose identical
 # content; an overlapping stale CAS must fail, never overwrite a fresh report.
 quote=chain.quote_of(api.ok(buyer,quote_path),"buyer");assert quote["proof"]["delivery"]["supplementalDecision"]==decision;assert not quote["proof"].get("acceptedDeliveryId")and quote["proof"]["paymentState"]=="unfunded";old_basis=basis(quote)
 second=api.ok(buyer,path+"/time-policy",plan)["session"];assert second["id"]!=first["id"];api.reject(buyer,endpoint,decision,codes=(409,));quote=chain.quote_of(api.ok(buyer,quote_path),"buyer");assert quote["proof"]["delivery"]["supplementalCatalog"]["catalogDigest"]!=catalog["catalogDigest"]
 api.ok(seller,path+"/submit_delivery",{"deliveryId":delivery,"note":"Review two unexecuted supplemental policy records separately."});api.reject(buyer,path+"/accept_delivery",{"deliveryId":delivery,"confirm":True,"manualChecks":chain.human_checks(quote),"expectedEvidence":old_basis},codes=(400,409,))
 current=api.ok(buyer,endpoint)["catalog"];confirmed=selection(current);api.ok(buyer,endpoint,confirmed);quote=chain.quote_of(api.ok(buyer,quote_path),"buyer");accepted=chain.quote_of(api.ok(buyer,path+"/accept_delivery",{"deliveryId":delivery,"confirm":True,"manualChecks":chain.human_checks(quote),"expectedEvidence":basis(quote)}),"buyer");snapshot=chain.snapshot(accepted);assert snapshot["supplementalDecision"]==confirmed and accepted["proof"]["paymentState"]=="unfunded";api.reject(buyer,endpoint,confirmed,codes=(409,));assert chain.snapshot(chain.quote_of(api.ok(buyer,quote_path),"buyer"))==snapshot
 api.checked("A new excluded report invalidates the entire earlier view; fresh explicit selection freezes both exact references and cannot be replaced after acceptance, without payment")
 path2,qp2=chain.create_shared(api,buyer,seller,chain.spec("Synthetic replacement binding"));old=chain.quote_of(api.ok(seller,path2+"/delivery",{"files":{"index.html":"<!doctype html><title>Original</title><p>Original version</p>"},"expectedDeliveryId":None,"reviewRules":True}),"seller");old_id=old["proof"]["delivery"]["id"];api.ok(buyer,path2+"/time-policy",{**plan,"deliveryId":old_id});old_catalog=api.ok(buyer,path2+"/supplemental-evidence")["catalog"];old_decision=selection(old_catalog);api.ok(buyer,path2+"/supplemental-evidence",old_decision);new=chain.quote_of(api.ok(seller,path2+"/delivery",{"files":{"index.html":"<!doctype html><title>Replacement</title><p>Replacement version</p>"},"expectedDeliveryId":old_id,"reviewRules":True}),"seller");assert new["proof"]["delivery"]["id"]!=old_id and not new["proof"]["delivery"].get("supplementalDecision");api.reject(buyer,path2+"/supplemental-evidence",old_decision,codes=(409,));assert api.ok(buyer,path2+"/supplemental-evidence")["catalog"]["rows"]==[]
 api.checked("Seller replacement inherits neither prior selection nor old report coverage; exact old-delivery references are rejected")
 print(json.dumps({"groups":len(api.checks),"checked":api.checks,"archiveProjectId":accepted["id"],"frozenObjectRefs":[e["ref"]for e in confirmed["entries"]],"syntheticGatewayActors":True,"AIExecuted":False,"outboundFetch":"blocked","money":"unchanged","deployment":"none"},indent=2))
if __name__=="__main__":main()
