"""Fresh local D1/API checks with explicitly synthetic model/caller readings.
No browser/model execution, gateway authentication or external I/O is claimed.
SQL seeding is performed by the isolated runner, never a deployable test route.
"""
import argparse
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location("source_visibility_integration",Path(__file__).with_name("seller-integration-api-smoke.py"))
integration=importlib.util.module_from_spec(spec);sys.modules[spec.name]=integration;spec.loader.exec_module(integration)
journey,chain,roles=integration.journey,integration.chain,integration.roles
HTML='<!doctype html><html><head><title>Fictional citation observation</title><style>.old {display:none}</style></head><body><nav class="old"><span>Old hours 10–18</span></nav><main><p>New hours 11–20</p></main></body></html>'
FILES={"index.html":HTML}
def citation(excerpt):
 start=HTML.index(excerpt);return {"file":"index.html","start":start,"end":start+len(excerpt),"excerpt":excerpt}
def emit(api,path):
 suffix=uuid4().hex;buyer=roles.Actor("visibility-buyer-"+suffix,"buyer@visibility-synthetic.example");seller=roles.Actor("visibility-seller-"+suffix,"seller@visibility-synthetic.example")
 definition=chain.spec("Synthetic source-visibility D1 fixture")
 project,quote_path=chain.create_shared(api,buyer,seller,definition)
 quote=chain.quote_of(api.ok(seller,project+"/delivery",{"files":FILES,"expectedDeliveryId":None,"reviewRules":True}),"seller")
 delivery=quote["proof"]["delivery"]["id"];assessment={"id":"synthetic-assessment-"+suffix,"deliveryId":delivery,"method":"source-ai-v1","mode":"live","model":"synthetic-no-provider-call","assessedAt":"2026-11-04T12:00:00.000Z","items":[{"criterionId":quote["proof"]["criteria"][0]["id"],"status":"supported","explanation":"Synthetic fixture, no model was called.","citations":[citation("<p>New hours 11–20</p>")],"ruleEvidenceIds":[]}],"risks":[{"title":"Retained hidden old hours","explanation":"Synthetic source quotation only.","suggestion":"Observe saved static text separately.","citations":[citation("<span>Old hours 10–18</span>")]}],"limitations":["Synthetic storage fixture. No live AI assessment or browser observation occurred."],"coverage":{"includedFiles":["index.html"],"truncatedFiles":[],"omittedFiles":[]}}
 literal=lambda value:"'"+value.replace("'","''")+"'"
 sql="-- Isolated local D1 fixture only; no model call.\nUPDATE quotes SET payload = json_set(payload, '$.proof.delivery.assessment', json("+literal(json.dumps(assessment))+")), version = version + 1 WHERE id = "+literal(quote["id"])+" AND owner_id = "+literal(buyer.identifier)+";\n"
 path.write_text(sql);context={"fixture":"source-visibility-synthetic-v1","origin":api.origin,"buyer":{"identifier":buyer.identifier,"email":buyer.email},"seller":{"identifier":seller.identifier,"email":seller.email},"project":project,"quotePath":quote_path,"deliveryId":delivery,"assessmentId":assessment["id"]};path.with_suffix(".json").write_text(json.dumps(context));print(json.dumps({"fixture":"source-visibility-synthetic-v1","syntheticModel":True,"sourceFile":"index.html"}))
def verify(api,path):
 context=json.loads(path.read_text());assert context["origin"]==api.origin and context["fixture"]=="source-visibility-synthetic-v1"
 buyer=roles.Actor(**context["buyer"]);seller=roles.Actor(**context["seller"]);outsider=roles.Actor("visibility-outsider-"+uuid4().hex,"outsider@visibility-synthetic.example");project=context["project"];endpoint=project+"/source-visibility"
 quote=chain.quote_of(api.ok(buyer,context["quotePath"]),"buyer");assert quote["proof"]["delivery"]["assessment"]["model"]=="synthetic-no-provider-call";before=json.loads(json.dumps(quote))
 view=api.ok(buyer,endpoint);assert len(view["plan"]["citations"])==2 and all(c.get("target")for c in view["plan"]["citations"]);assert view["scope"]["clientReported"] and not view["scope"]["scriptsExecuted"] and not view["scope"]["acceptance"]
 assert api.ok(seller,endpoint)==view;api.reject(None,endpoint,codes=(401,));api.reject(outsider,endpoint,codes=(404,))
 readings=[{"citationId":c["id"],"viewportWidth":w,"state":"hidden"if i else"visible",**({"reason":"display_none"}if i else{})}for i,c in enumerate(view["plan"]["citations"])for w in [375,1280]]
 payload={"deliveryId":context["deliveryId"],"assessmentId":context["assessmentId"],"previousReportId":None,"readings":readings}
 for patch,codes in (({"deliveryId":"old"},(409,)),({"assessmentId":"old"},(409,)),({"url":"https://caller.example"},(400,)),({"readings":readings[:-1]},(400,)),({"readings":[{**r,"viewportWidth":900}for r in readings]},(400,))):api.reject(buyer,endpoint,{**payload,**patch},codes=codes)
 journey.custom_origin_reject(api,buyer,endpoint,payload);api.reject(outsider,endpoint,payload,role="buyer",codes=(404,));assert api.ok(buyer,endpoint)["reports"]==[]
 api.checked("Only actual project members inspect exact saved citation plan; CSRF, outsider/forged role, stale version/assessment, callerURL and partial/wrong-width observations are refused")
 with ThreadPoolExecutor(max_workers=2)as pool:responses=[f.result()for f in [pool.submit(api.request,buyer,endpoint,payload)for _ in range(2)]]
 assert sorted(r[0]for r in responses)==[201,409],responses
 retained=api.ok(buyer,endpoint)["reports"][0];assert retained["summary"]=={"visible":2,"hidden":2,"ambiguous":0,"unavailable":0};assert retained["reportedByRole"]=="buyer" and not retained["stale"]
 saved=api.ok(seller,endpoint,{**payload,"previousReportId":retained["id"]},role="buyer")["report"];assert saved["reportedByRole"]=="seller";history=api.ok(buyer,endpoint)["reports"];assert len(history)==2 and history[1]==retained
 api.reject(buyer,endpoint,{**payload,"previousReportId":retained["id"]},codes=(409,));assert chain.quote_of(api.ok(buyer,context["quotePath"]),"buyer")==before
 api.checked("One concurrent CAS winner appends immutable supplemental evidence; actual seller role is retained despite buyer role header; stale history cannot overwrite, quote and money remain exactly unchanged")
 replacement=chain.quote_of(api.ok(seller,project+"/delivery",{"files":{"index.html":HTML.replace("New hours 11–20","New hours 12–21")},"expectedDeliveryId":context["deliveryId"],"reviewRules":True}),"seller")
 assert replacement["proof"]["delivery"]["id"]!=context["deliveryId"];history=api.ok(seller,endpoint);assert history.get("plan")is None and len(history["reports"])==2 and all(r["stale"]for r in history["reports"])
 api.reject(seller,endpoint,{**payload,"previousReportId":saved["id"]},codes=(409,));assert not replacement["proof"].get("acceptedDeliveryId")
 api.checked("Delivery replacement clears current AI/visibility plan while preserving old reports as stale history; old observations cannot become a new version’s evidence")
 print(json.dumps({"groups":len(api.checks),"checked":api.checks,"syntheticModelAndReadings":True,"browserOperated":False,"outboundFetch":"blocked","money":"unchanged","deployment":"none"},indent=2))
def main():
 parser=argparse.ArgumentParser();parser.add_argument("--url",required=True);modes=parser.add_mutually_exclusive_group(required=True);modes.add_argument("--emit-fixture",type=Path);modes.add_argument("--verify-fixture",type=Path);args=parser.parse_args();api=roles.LocalAPI(args.url);assert api.ok(None,"/api/__synthetic_sandbox_test_mode")["outboundFetch"]=="blocked"
 if args.emit_fixture:emit(api,args.emit_fixture)
 else:verify(api,args.verify_fixture)
if __name__=="__main__":main()
