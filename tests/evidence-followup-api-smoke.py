"""Owned fresh Worker/D1 retest chain. Synthetic gateway identities only;
outbound HTTP is blocked, therefore unknown remains unknown. No model or
payment provider is called and no two-human usability claim is made.
"""
import argparse, copy, importlib.util, json, sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('followup_supplemental',Path(__file__).with_name('supplemental-evidence-api-smoke.py'))
sup=importlib.util.module_from_spec(spec);sys.modules[spec.name]=sup;spec.loader.exec_module(sup)
time,chain,roles=sup.time,sup.chain,sup.roles

def main():
 p=argparse.ArgumentParser();p.add_argument('--url',required=True);args=p.parse_args();api=roles.LocalAPI(args.url)
 assert api.ok(None,'/api/__synthetic_sandbox_test_mode')['outboundFetch']=='blocked'
 suffix=uuid4().hex;buyer=roles.Actor('integration-operator-buyer','buyer@followup-synthetic.example');seller=roles.Actor('followup-seller-'+suffix,'seller@followup-synthetic.example');other=roles.Actor('followup-other-'+suffix,'other@followup-synthetic.example')
 path,qp=chain.create_shared(api,buyer,seller,chain.spec('Synthetic report-linked repair'))
 def current():return chain.quote_of(api.ok(buyer,qp),'buyer')
 def delivery(previous=None,changed=False):return chain.quote_of(api.ok(seller,path+'/delivery',{'files':{'index.html':'<!doctype html><html><head><title>Repair test</title></head><body><p>'+('New repaired source.' if changed else 'Original source.')+'</p></body></html>'},'expectedDeliveryId':previous,'reviewRules':True}),'seller')['proof']['delivery']['id']
 def catalog():return api.ok(buyer,path+'/supplemental-evidence')['catalog']
 def key(row):
  r=row['ref'];return f"{r['family']}:{r['id']}:{r['version']}:{r['payloadSha256']}"
 def planned(d):return api.ok(buyer,path+'/time-policy',{'action':'save','deliveryId':d,'plan':time.PLAN,'confirm':True})['session']
 def execute(d,s):
  request=api.ok(seller,path+'/integration-requests',{'action':'submit','deliveryId':d,'manifest':time.integration.manifest()})['requests'][0]
  approval={'label':'Synthetic blocked repair target','scenario':'fixed','expiresAt':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(timespec='milliseconds').replace('+00:00','Z')}
  approved=api.ok(buyer,path+'/integration-requests',{'action':'review','requestId':request['id'],'expectedRevision':request['revision'],'status':'approved','reason':'Operator approves only this disposable blocked-transport fixture.','approval':approval})['requests'][0]
  done=api.ok(seller,path+'/time-policy',{'action':'run','deliveryId':d,'sessionId':s['id'],'expectedVersion':1,'targetId':approved['registration']['id'],'confirm':True})['session'];assert done['status']=='unknown';return done
 d=delivery();s=planned(d);c=catalog();endpoint=path+'/evidence-followups';row=c['rows'][0];payload={'action':'request','catalogDigest':c['catalogDigest'],'reportKey':key(row),'findingKey':row['findings'][0]['key'],'criterionId':'supplemental:time-policy','note':'Please provide observable evidence that this exact time rule works.'}
 api.reject(buyer,endpoint,payload,codes=(409,));execute(d,s);c=catalog();row=c['rows'][0];payload.update(catalogDigest=c['catalogDigest'],reportKey=key(row))
 api.reject(None,endpoint,codes=(401,));api.reject(other,endpoint,codes=(404,));api.reject(seller,endpoint,payload,codes=(403,));api.reject(seller,endpoint,payload,role='buyer',codes=(403,));time.journey.custom_origin_reject(api,buyer,endpoint,payload)
 for patch in [{'reportKey':'forged-report'},{'findingKey':'not-in-the-report'},{'criterionId':'forged-contract-clause'}]:api.reject(buyer,endpoint,{**payload,**patch},codes=(409,))
 with ThreadPoolExecutor(max_workers=2)as pool:responses=[f.result()for f in[pool.submit(api.request,buyer,endpoint,payload),pool.submit(api.request,buyer,endpoint,payload)]]
 assert sorted(r[0]for r in responses)==[200,409],responses
 tasks=api.ok(seller,endpoint)['tasks'];assert len(tasks)==1;task=tasks[0];assert task['status']=='open' and task['source']['finding']['outcome']=='unknown';assert task['source']['ref']==row['ref'];api.reject(buyer,endpoint,payload,codes=(409,))
 api.checked('Real buyer, CSRF, terminal exact report, finding and scope gate repair creation; concurrent stale catalogs produce one winner and preserve unknown')
 d2=delivery(d,True);execute(d2,planned(d2));c=catalog();newrow=c['rows'][0];assert newrow['ref']['deliveryId']==d2
 proposal={'action':'propose','id':task['id'],'version':1,'catalogDigest':c['catalogDigest'],'reportKey':key(newrow),'findingKey':task['source']['finding']['key'],'note':'New delivery was uploaded and this same time check was attempted again.'}
 api.reject(buyer,endpoint,proposal,codes=(403,));api.reject(seller,endpoint,{**proposal,'reportKey':key(row)},codes=(409,));api.reject(seller,endpoint,{**proposal,'findingKey':'omitted-original-check'},codes=(409,))
 response=api.ok(seller,endpoint,proposal);task=response['tasks'][0];assert task['status']=='proposed' and task['version']==2 and task['proposal']['finding']['outcome']=='unknown';api.reject(seller,endpoint,proposal,codes=(409,))
 c=catalog();resolve={'action':'resolve','id':task['id'],'version':2,'catalogDigest':c['catalogDigest'],'resolution':'verified','note':'Buyer independently compares the original and replacement observations.'}
 api.reject(seller,endpoint,resolve,codes=(403,));api.reject(buyer,endpoint,resolve,codes=(409,));response=api.ok(buyer,endpoint,{**resolve,'resolution':'exception','note':'I explicitly accept the still unknown synthetic result as a limited exception.'});task=response['tasks'][0];assert task['status']=='resolved' and task['resolution']=='exception' and len(task['events'])==3
 assert current()['proof']['paymentState']=='unfunded' and not current()['proof'].get('acceptedDeliveryId')
 api.checked('Only seller proposes a new delivery exact retest, omitted checks and stale CAS fail; buyer cannot mark unknown verified and must explicitly accept an exception')
 c=catalog();decision=sup.selection(c);api.ok(buyer,path+'/supplemental-evidence',decision);q=current();oldbasis=sup.basis(q)
 api.ok(buyer,endpoint,{'action':'reopen','id':task['id'],'version':3,'catalogDigest':c['catalogDigest'],'note':'A later review requires another repair before considering acceptance.'})
 c=catalog();assert c['catalogDigest']!=decision['catalogDigest'];newdecision=sup.selection(c);api.reject(buyer,path+'/supplemental-evidence',newdecision,codes=(409,));newdecision['unresolvedFollowups']=[{'id':task['id'],'version':4,'reason':'Buyer explicitly acknowledges this repair remains unresolved at acceptance.'}];api.ok(buyer,path+'/supplemental-evidence',newdecision)
 api.ok(seller,path+'/submit_delivery',{'deliveryId':d2,'note':'Submitting with one explicitly acknowledged unresolved repair.'});q=current();api.reject(buyer,path+'/accept_delivery',{'deliveryId':d2,'confirm':True,'manualChecks':chain.human_checks(q),'expectedEvidence':oldbasis},codes=(400,409,))
 accepted=chain.quote_of(api.ok(buyer,path+'/accept_delivery',{'deliveryId':d2,'confirm':True,'manualChecks':chain.human_checks(q),'expectedEvidence':sup.basis(q)}),'buyer');snapshot=chain.snapshot(accepted);assert snapshot['supplementalDecision']['catalogContext']['followupHeads'][0]['version']==4
 api.reject(buyer,endpoint,{'action':'reopen','id':task['id'],'version':4,'catalogDigest':catalog()['catalogDigest'],'note':'An accepted project must not silently mutate its repair history.'},codes=(409,))
 bundle=api.ok(buyer,path+'/evidence-bundle');assert bundle['schema']=='proofbeforepay-evidence-bundle-v2';assert bundle['followups']['tasks'][0]['version']==4;assert len(bundle['supplemental']['objects'])==2;assert bundle['scope']=='current-delivery-only';assert bundle['followups']['scope']=='task-records-and-referenced-reports-only'
 raw=json.dumps(bundle);assert buyer.identifier not in raw and seller.identifier not in raw;assert 'participant-withheld' in raw
 api.reject(other,path+'/evidence-bundle',codes=(404,));assert api.ok(seller,path+'/evidence-bundle')['followups']==bundle['followups']
 api.checked('Task changes invalidate prior evidence consent; each unresolved repair needs explicit buyer acknowledgement; acceptance freezes exact heads and unified server bundle retains both report versions without private actor IDs or money')
 print(json.dumps({'checked':api.checks,'groups':len(api.checks),'syntheticGatewayActors':True,'outboundFetch':'blocked','AIExecuted':False,'money':'unchanged','deployment':'none','frozenProjectId':accepted['id']},indent=2))
if __name__=='__main__':main()
