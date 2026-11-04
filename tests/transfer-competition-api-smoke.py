"""Owned local Worker/D1 checks for independent competing-transfer records.

Metadata/empty reads and uncertain POST504 are explicit local fixture responses.
No target, browser, real account or provider is contacted. Process restart proves
unknown durable writes are closed without POST resume or recovery I/O.
"""
import argparse
import copy
import importlib.util
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request
from uuid import uuid4
sys.dont_write_bytecode = True
spec=importlib.util.spec_from_file_location("transfer_onboarding_helpers",Path(__file__).with_name("seller-integration-api-smoke.py"));onboarding=importlib.util.module_from_spec(spec);sys.modules[spec.name]=onboarding;spec.loader.exec_module(onboarding)
journey,chain,roles=onboarding.journey,onboarding.chain,onboarding.roles

def actors(state):return [roles.Actor(**state[k]) for k in ("buyer","seller","outsider")]
def run_input(state,previous=None):return {"action":"run","deliveryId":state["deliveryId"],"targetId":state["targetId"],"seed":4,"confirm":True,"previousRunId":previous}
def query(api,actor,path):
    headers={"Origin":api.origin,"oai-authenticated-user-id":actor.identifier,"oai-authenticated-user-email":actor.email}
    try:r=api.opener.open(Request(api.origin+path,headers=headers),timeout=40)
    except HTTPError as e:r=e
    with r:return r.status,json.loads(r.read()),{k.lower():v for k,v in r.headers.items()}
def seed(api,state_file):
    suffix=uuid4().hex;buyer=roles.Actor("transfer-operator-buyer","buyer@transfer-synthetic.example");seller=roles.Actor("transfer-seller-"+suffix,"seller@transfer-synthetic.example");outsider=roles.Actor("transfer-outsider-"+suffix,"outsider@transfer-synthetic.example")
    path,quote_path=chain.create_shared(api,buyer,seller,journey.specification());q=chain.quote_of(api.ok(seller,path+"/delivery",{"files":journey.files(),"expectedDeliveryId":None,"reviewRules":True}),"seller");delivery=q["proof"]["delivery"]["id"];endpoint=path+"/transfer-competition"
    initial=api.ok(buyer,endpoint);assert initial["current"] is None and initial["history"]==[] and initial["canRun"] is False
    api.reject(None,endpoint,codes=(401,));api.reject(outsider,endpoint,codes=(404,));api.reject(None,endpoint,{},codes=(401,));api.reject(outsider,endpoint,{},codes=(404,))
    request=api.ok(seller,path+"/integration-requests",{"action":"submit","deliveryId":delivery,"manifest":onboarding.manifest()})["requests"][0]
    approved=api.ok(buyer,path+"/integration-requests",{"action":"review","requestId":request["id"],"expectedRevision":1,"status":"approved","reason":"Explicit synthetic operator approval for finite transfer checks.","approval":{"label":"Synthetic competing-transfer target","scenario":"fixed","expiresAt":(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(timespec="milliseconds").replace("+00:00","Z")}})["requests"][0]
    target=approved["registration"]["id"];api.ok(buyer,path+"/journey-checks",{"action":"confirm-plan","deliveryId":delivery,"confirm":True})
    # An existing accepted A remains the consent basis through new supplements.
    final,jreport=journey.run_to_report(api,buyer,path+"/journey-checks",delivery,target,abort=True)
    api.ok(seller,path+"/submit_delivery",{"deliveryId":delivery,"note":"Synthetic independent model input"});q=chain.quote_of(api.ok(buyer,quote_path),"buyer")
    q=chain.quote_of(api.ok(buyer,path+"/accept_delivery",{"deliveryId":delivery,"confirm":True,"manualChecks":chain.human_checks(q),"journeyDecision":{"reportId":jreport["id"],"acknowledgeClientObservation":True,"acknowledgedSteps":journey.STEPS,"exceptionReason":"The synthetic journey was not browser operated and all unavailable observations were separately acknowledged."}}),"buyer")
    state={"path":path,"quotePath":quote_path,"deliveryId":delivery,"targetId":target,"buyer":buyer.__dict__,"seller":seller.__dict__,"outsider":outsider.__dict__,"acceptedSnapshot":chain.snapshot(q)}
    base=run_input(state);before=copy.deepcopy(q)
    journey.custom_origin_reject(api,buyer,endpoint,base)
    for patch,codes in (({"confirm":False},(400,)),({"seed":True},(400,)),({"seed":-1},(400,)),({"seed":2**32},(400,)),({"url":"https://caller.synthetic.example"},(400,)),({"deliveryId":"stale-upload"},(409,)),({"previousRunId":str(uuid4())},(409,))):api.reject(buyer,endpoint,{**base,**patch},codes=codes)
    assert chain.quote_of(api.ok(buyer,quote_path),"buyer")==before
    assert api.ok(None,"/api/__synthetic_transfer_test_mode")["attempts"]==[]
    state_file.write_text(json.dumps(state),encoding="utf-8")
    return {"result":"seeded","checks":["Authentication, project membership, CSRF, exact upload/seed/previous report and operator registration guards reject before any target I/O","Original accepted snapshot A predates the separate supplemental model"]}

def registered(api,state_file):
    state=json.loads(state_file.read_text());buyer,seller,outsider=actors(state);path=state["path"];endpoint=path+"/transfer-competition";base=run_input(state)
    assert api.ok(buyer,endpoint)["canRun"] is True
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(api.request,buyer,endpoint,base) for _ in range(2)]
        deadline=time.monotonic()+8;active=None
        while time.monotonic()<deadline:
            active=api.ok(buyer,endpoint)["current"]
            if active and active["status"]=="running" and active["trace"]:break
            time.sleep(.02)
        assert active and active["status"]=="running" and active["trace"][-1]["completedOrdinal"] is None
        q=chain.quote_of(api.ok(buyer,state["quotePath"]),"buyer");lease=q["proof"]["delivery"]["transferCompetitionRun"];assert lease["id"]==active["id"] and chain.snapshot(q)==state["acceptedSnapshot"]
        assert api.ok(buyer,path+"/readiness")["financialActionsBlockedByRun"] is True
        api.reject(seller,path+"/delivery",{"files":journey.files(True),"expectedDeliveryId":state["deliveryId"]},codes=(409,))
        for action,payload in (("checkout",{}),("authorize",{"orderId":"none"}),("capture",{"confirm":True}),("void",{}),("accept_delivery",{"confirm":True,"deliveryId":state["deliveryId"],"manualChecks":[]}),("return",{"deliveryId":state["deliveryId"],"feedback":[]})):
            api.reject(buyer,path+"/"+action,payload,codes=(409,))
        api.reject(buyer,path+"/model-checks",{"action":"run","deliveryId":state["deliveryId"],"targetId":state["targetId"],"seed":4,"confirm":True,"previousReportId":None},codes=(409,))
        api.reject(buyer,path+"/journey-checks",{"action":"start","deliveryId":state["deliveryId"],"targetId":state["targetId"],"confirm":True,"previousReportId":q["proof"]["delivery"]["journeyReport"]["id"]},codes=(409,))
        api.reject(buyer,endpoint,{"action":"close","runId":active["id"],"expectedVersion":active["version"]},codes=(409,))
        replies=[f.result() for f in futures]
    assert sorted(r[0] for r in replies)==[201,409],replies
    view=api.ok(seller,endpoint);assert len(view["history"])==1 and view["current"]["status"]=="finished"
    current=view["current"];report=current["report"];assert report["result"]["outcome"]=="inconclusive" and len(report["trace"])==6 and sum(o["method"]=="POST" for o in report["trace"])==1
    assert any(o["status"]==504 for o in report["trace"] if "status" in o)
    q=chain.quote_of(api.ok(buyer,state["quotePath"]),"buyer");assert "transferCompetitionRun" not in q["proof"]["delivery"] and chain.snapshot(q)==state["acceptedSnapshot"]
    assert api.ok(buyer,path+"/readiness")["financialActionsBlockedByRun"] is False
    marker=api.ok(None,"/api/__synthetic_transfer_test_mode");assert marker["checkpointBeforeIo"] and sum(o["method"]=="POST" for o in marker["attempts"])==1
    code,packet,headers=query(api,buyer,endpoint+"?export="+current["id"]);assert code==200 and "attachment" in headers["content-disposition"] and packet["schema"]=="proofbeforepay-transfer-competition-evidence-v1" and packet["scope"]["supplemental"] is True
    (state_file.parent/"transfer-completed-export.json").write_text(json.dumps(packet),encoding="utf-8")
    code,selected,_=query(api,buyer,endpoint+"?runId="+current["id"]);assert code==200 and selected["current"]["report"]==report
    state["firstSessionId"]=current["id"]
    def abandon():
        try:api.request(buyer,endpoint,run_input(state,current["id"]))
        except Exception:pass
    threading.Thread(target=abandon,daemon=True).start();deadline=time.monotonic()+8
    while time.monotonic()<deadline:
        orphan=api.ok(buyer,endpoint)["current"]
        if orphan and orphan["id"]!=current["id"] and orphan["status"]=="running" and any(o["method"]=="POST" and o["completedOrdinal"] is None for o in orphan["trace"]):
            state["orphanRun"]=orphan;state_file.write_text(json.dumps(state),encoding="utf-8")
            return {"result":"unknown-write-lease-persisted","checks":["Concurrent claim creates one quote lease and one standalone row atomically","Active transfer lease blocks acceptance, capture, authorization, replacement and old test admissions","One uncertain POST is not retried; finish clears its exact lease while retaining accepted A","Standalone export and selected-history reads preserve independent report bindings","Second run stopped after a durable unknown POST intent for actual process restart"]}
        time.sleep(.02)
    raise AssertionError("No durable unknown POST intent before restart")

def closed(api,state_file):
    state=json.loads(state_file.read_text());buyer,seller,outsider=actors(state);endpoint=state["path"]+"/transfer-competition";old=state["orphanRun"]
    view=api.ok(buyer,endpoint);s=view["current"];assert s["id"]==old["id"] and s["trace"]==old["trace"] and s["status"]=="running"
    close={"action":"close","runId":s["id"],"expectedVersion":s["version"]};api.reject(outsider,endpoint,close,codes=(404,));api.reject(buyer,endpoint,close,codes=(409,));api.reject(buyer,endpoint,{"action":"resume","runId":s["id"]},codes=(400,));api.reject(buyer,endpoint,run_input(state,s["id"]),codes=(409,))
    remaining=datetime.fromisoformat(s["expiresAt"].replace("Z","+00:00")).timestamp()-time.time()
    if remaining>0:time.sleep(remaining+.1)
    before=api.ok(None,"/api/__synthetic_transfer_test_mode");assert before["attempts"]==[]
    result=api.ok(seller,endpoint,close);finished=result["session"];assert finished["status"]=="finished" and finished["report"]["trace"]==old["trace"] and finished["report"]["result"]["outcome"]=="inconclusive"
    assert any(o["method"]=="POST" and o["completedOrdinal"] is None for o in finished["report"]["trace"])
    assert api.ok(None,"/api/__synthetic_transfer_test_mode")["attempts"]==[]
    api.reject(buyer,endpoint,close,codes=(409,));q=chain.quote_of(api.ok(buyer,state["quotePath"]),"buyer");assert "transferCompetitionRun" not in q["proof"]["delivery"] and chain.snapshot(q)==state["acceptedSnapshot"]
    assert len(api.ok(buyer,endpoint)["history"])==2 and api.ok(buyer,state["path"]+"/readiness")["financialActionsBlockedByRun"] is False
    assert api.ok(None,"/api/__synthetic_sandbox_test_mode")["syntheticCalls"]==0
    return {"result":"passed","checks":["Restart retains exact quote lease, standalone session and unknown POST intent","Explicit expired close issues zero GET/POST and clears only its claimed lease","Reports remain immutable and original accepted A is byte-for-byte unchanged","No automatic write resume and no external provider calls"],"providerCalls":0,"outboundFetch":"blocked","scope":"Owned Worker, fresh D1, synthetic identities and explicit fixture responses; no real backend success, browser or funds asserted"}

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--url",required=True);parser.add_argument("--phase",choices=("seed","registered","closed"),required=True);parser.add_argument("--state",type=Path,required=True);args=parser.parse_args();api=roles.LocalAPI(args.url);assert api.ok(None,"/api/__synthetic_sandbox_test_mode")["outboundFetch"]=="blocked";print(json.dumps(globals()[args.phase](api,args.state),ensure_ascii=False))
if __name__=="__main__":main()
