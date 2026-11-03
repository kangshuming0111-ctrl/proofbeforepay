import assert from "node:assert/strict";
import test from "node:test";
import {JOURNEY_STEP_IDS,JOURNEY_SLOTS,journeyBackendBase,journeyKey,evaluateJourneyReport,validateJourneyReport,type JourneyInput,type JourneyObservation,type JourneyReceipt,type JourneyStepId,type JourneyReport} from "../lib/journey-checks.ts";

// Synthetic observer records exercise the pure evaluator; they are not browser
// execution evidence. Separate HTTP/SQL and CUA runs establish those layers.
function fixture():JourneyInput{
 const runId=crypto.randomUUID(),scenario="fixed" as const,base=journeyBackendBase(scenario),revision="lifecycle-fixed-v1",common={testRunId:runId,marker:`PBP-${runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid"};
 const receipt=(suffix:string,slot:string,partySize:number):JourneyReceipt=>({id:crypto.randomUUID(),...common,slot,partySize,status:"active",revision,idempotencyKey:journeyKey(runId,suffix)});
 const first=receipt("cancel-create",JOURNEY_SLOTS.a,5),cancelled={...first,status:"cancelled" as const},five=receipt("cancel-five",JOURNEY_SLOTS.a,5),three=receipt("cancel-three",JOURNEY_SLOTS.a,3),source=receipt("source-create",JOURNEY_SLOTS.b,2),moved={...source,slot:JOURNEY_SLOTS.c},loss=receipt("loss-create",JOURNEY_SLOTS.b,1);
 const observations:JourneyObservation[]=[];
 const add=(o:JourneyObservation)=>observations.push(structuredClone(o));
 const merchant=(rows:JourneyReceipt[])=>({status:200,body:{testRunId:runId,revision,bookings:rows}});
 const occupancy=(rows:JourneyReceipt[],slot:"a"|"b"|"c")=>{const active=rows.filter(r=>r.status==="active"&&r.slot===JOURNEY_SLOTS[slot]);return{slot,status:200,body:{testRunId:runId,revision,slot:JOURNEY_SLOTS[slot],guestCount:active.reduce((n,r)=>n+r.partySize,0),bookingIds:active.map(r=>r.id)}};};
 const write=(id:JourneyStepId,operation:"create"|"cancel"|"move",suffix:string,status:number,body:Record<string,unknown>,response:unknown,receiptId?:string):JourneyObservation=>({id,ui:{actionId:id,status:status===504?"unknown":status===409?"error":"success",message:"Synthetic observer fixture",fields:{operation,...(operation==="create"?{partySize:String(body.partySize),slot:String(body.slot)}:{bookingId:receiptId!,...(operation==="move"?{slot:String(body.slot)}:{})})},...(status<300?{receipt:response}:{})},requests:[{method:"POST",path:operation==="create"?`${base}bookings`:`${base}bookings/${receiptId}/${operation}`,key:journeyKey(runId,suffix),status,request:body,response}]});
 const createBody=(slot:string,partySize:number)=>({...common,slot,partySize}),actionBody={testRunId:runId,marker:common.marker};
 const read=(id:JourneyStepId,rows:JourneyReceipt[],slots:readonly("a"|"b"|"c")[],receipt?:JourneyReceipt):JourneyObservation=>({id,merchant:merchant(rows),occupancies:slots.map(slot=>occupancy(rows,slot)),...(receipt?{receipt:{status:200,body:receipt}}:{})});
 const metadata={protocol:"booking-lifecycle-http-v1",revision,maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false};add({id:"meta",requests:[{method:"GET",path:base+"meta",status:200,response:metadata}]});
 add(write("create","create","cancel-create",201,createBody(JOURNEY_SLOTS.a,5),first));add(read("create_readback",[first],["a"],first));
 add(write("cancel","cancel","cancel-first",200,actionBody,cancelled,first.id));add(read("cancel_readback",[cancelled],["a"],cancelled));
 add(write("rebook","create","cancel-five",201,createBody(JOURNEY_SLOTS.a,5),five));add(write("fill","create","cancel-three",201,createBody(JOURNEY_SLOTS.a,3),three));
 const full=[cancelled,five,three];add(read("full_readback",full,["a"]));add(write("cancel_repeat","cancel","cancel-repeat",200,actionBody,cancelled,first.id));add(read("cancel_repeat_readback",full,["a"],cancelled));
 add({...write("reject_extra","create","cancel-extra",409,createBody(JOURNEY_SLOTS.a,1),{code:"slot_capacity_exceeded"}),...read("reject_extra",full,["a"])});
 add(write("source_create","create","source-create",201,createBody(JOURNEY_SLOTS.b,2),source));
 add(write("move_full","move","move-full",409,{...actionBody,slot:JOURNEY_SLOTS.a},{code:"slot_capacity_exceeded"},source.id));add(read("move_full_readback",[...full,source],["a","b"],source));
 add(write("move_free","move","move-free",200,{...actionBody,slot:JOURNEY_SLOTS.c},moved,source.id));add(read("move_free_readback",[...full,moved],["b","c"],moved));
 add(write("response_loss_create","create","loss-create",504,createBody(JOURNEY_SLOTS.b,1),{code:"response_lost_after_commit"}));
 const final=[...full,moved,loss];add(read("response_loss_readback",final,[]));add({...write("response_loss_retry","create","loss-create",200,createBody(JOURNEY_SLOTS.b,1),loss),...read("response_loss_retry",final,[])});
 add(read("final_merchant_readback",final,["a","b","c"]));
 return{runId,scenario,startedAt:"2026-11-03T00:00:00.000Z",finishedAt:"2026-11-03T00:00:01.000Z",frontendEntry:`/journey.html?run=${runId}&scenario=${scenario}`,frontendDigest:"a".repeat(64),metadata,observations};
}
function observation(input:JourneyInput,id:JourneyStepId):JourneyObservation{return input.observations.find(o=>o.id===id)!;}
function step(report:JourneyReport,id:JourneyStepId){return report.steps.find(o=>o.id===id)!;}

test("synthetic complete lifecycle evidence derives20 canonical observations without mutating input or making network claims",()=>{
 const input=fixture(),before=structuredClone(input),report=evaluateJourneyReport(input);
 assert.deepEqual(report.summary,{steps:20,observed:20,issues:0,unavailable:0});assert.deepEqual(report.steps.map(s=>s.id),[...JOURNEY_STEP_IDS]);assert.deepEqual(validateJourneyReport(report),report);assert.deepEqual(input,before);
 assert.deepEqual(report.scope,{syntheticOnly:true,observer:"client-controlled-browser",deploymentAttestation:false,independentSeller:false,authenticatedRoles:false,acceptance:false,payment:false,privateDeliveryLinked:false,responseFault:"controlled HTTP504 after native commit; not an observed production outage"});
});
test("UI success cannot substitute for an actual matching POST, body, key or response",()=>{
 for(const change of[(o:JourneyObservation)=>{o.requests=[];},(o:JourneyObservation)=>{(o.requests![0].request as Record<string,unknown>).partySize=1;},(o:JourneyObservation)=>{o.requests![0].key+="-changed";},(o:JourneyObservation)=>{o.requests![0].status=200;},(o:JourneyObservation)=>{(o.requests![0].response as JourneyReceipt).slot=JOURNEY_SLOTS.b;},(o:JourneyObservation)=>{o.ui!.receipt={...(o.requests![0].response as JourneyReceipt),id:"different-receipt"};},(o:JourneyObservation)=>{o.ui!.actionId="cancel";},(o:JourneyObservation)=>{o.ui!.fields!.partySize="1";},(o:JourneyObservation)=>{o.ui!.fields!.slot=JOURNEY_SLOTS.b;},(o:JourneyObservation)=>{delete o.ui!.fields;},(o:JourneyObservation)=>{o.ui!.fields!.operation="cancel";},(o:JourneyObservation)=>{o.ui!.status="unknown";},(o:JourneyObservation)=>{o.ui!.status="error";},(o:JourneyObservation)=>{o.requests![0].status=500;},(o:JourneyObservation)=>{o.ui!.receipt={...(o.requests![0].response as JourneyReceipt),partySize:1};},(o:JourneyObservation)=>{o.ui!.receipt={...(o.requests![0].response as JourneyReceipt),status:"cancelled"};},(o:JourneyObservation)=>{o.ui!.receipt={...(o.requests![0].response as JourneyReceipt),slot:JOURNEY_SLOTS.b};},(o:JourneyObservation)=>{const r=o.requests![0],key=r.key;delete r.key;(r.request as Record<string,unknown>).idempotencyKey=key;},(o:JourneyObservation)=>{(o.requests![0].request as Record<string,unknown>).unexpected=true;}]){
  const input=fixture();change(observation(input,"create"));const report=evaluateJourneyReport(input);assert.equal(step(report,"create").outcome,"mismatch");assert.equal(step(report,"create_readback").reason,"prerequisite_not_observed");assert.notEqual(report.summary.observed,20);
 }
 for(const[id,suffix]of[["cancel","cancel-five"],["move_free","move-free"]]as const){
  const input=fixture(),row=observation(input,id),displayed=structuredClone(row.ui!.receipt);assert.equal(evaluateJourneyReport(input).summary.observed,20);
  row.requests![0].response={...(row.requests![0].response as JourneyReceipt),idempotencyKey:journeyKey(input.runId,suffix)};
  const report=evaluateJourneyReport(input);assert.equal(step(report,id).outcome,"mismatch");assert.ok(report.summary.issues>0);assert.deepEqual(row.ui!.receipt,displayed);
 }
});
test("an unavailable action and failed metadata keep dependencies unavailable while independent evidence remains separately evaluated",()=>{
 const missing=fixture();observation(missing,"create").unavailableReason="frame_not_ready";const report=evaluateJourneyReport(missing);assert.equal(step(report,"create").outcome,"unavailable");assert.equal(step(report,"create_readback").outcome,"unavailable");assert.equal(step(report,"source_create").outcome,"observed");assert.equal(step(report,"response_loss_create").outcome,"observed");assert.equal(step(report,"final_merchant_readback").outcome,"mismatch");
 const bad=fixture();(bad.metadata as Record<string,unknown>).maxGuestsPerSlot=9;const invalid=evaluateJourneyReport(bad);assert.equal(step(invalid,"meta").outcome,"mismatch");assert.equal(invalid.summary.observed,0);assert.equal(invalid.summary.unavailable,19);
 for(const change of[(o:JourneyObservation)=>{o.requests=[];},(o:JourneyObservation)=>{o.requests![0].status=500;},(o:JourneyObservation)=>{o.requests![0].response={};},(o:JourneyObservation)=>{o.requests![0].error="network_unavailable";},(o:JourneyObservation)=>{o.requests![0].method="POST";}]){const copy=fixture();change(observation(copy,"meta"));const report=evaluateJourneyReport(copy);assert.equal(step(report,"meta").outcome,"mismatch");assert.equal(report.summary.unavailable,19);assert.equal(report.summary.observed,0);}
});
test("merchant and occupancy must independently reconcile exact records, status, totals and identifiers",()=>{
 for(const change of[(o:JourneyObservation)=>{(o.merchant!.body as {bookings:JourneyReceipt[]}).bookings.pop();},(o:JourneyObservation)=>{const rows=(o.merchant!.body as {bookings:JourneyReceipt[]}).bookings;rows.push(structuredClone(rows[0]));},(o:JourneyObservation)=>{(o.occupancies![0].body as Record<string,unknown>).guestCount=7;},(o:JourneyObservation)=>{(o.occupancies![0].body as Record<string,unknown>).bookingIds=[];},(o:JourneyObservation)=>{const rows=(o.merchant!.body as {bookings:JourneyReceipt[]}).bookings;rows.find(r=>r.idempotencyKey.endsWith("cancel-five"))!.status="cancelled";},(o:JourneyObservation)=>{const rows=(o.merchant!.body as {bookings:JourneyReceipt[]}).bookings;rows.find(r=>r.idempotencyKey.endsWith("source-create"))!.slot=JOURNEY_SLOTS.b;}]){
  const input=fixture();change(observation(input,"final_merchant_readback"));assert.equal(step(evaluateJourneyReport(input),"final_merchant_readback").outcome,"mismatch");
 }
});
test("controlled post-commit504 stays unknown until independent readback and retry retains the original receipt",()=>{
 const wrongUi=fixture();observation(wrongUi,"response_loss_create").ui!.status="success";assert.equal(step(evaluateJourneyReport(wrongUi),"response_loss_create").outcome,"mismatch");assert.equal(step(evaluateJourneyReport(wrongUi),"response_loss_retry").outcome,"unavailable");
 const duplicate=fixture(),retry=observation(duplicate,"response_loss_retry"),rows=(retry.merchant!.body as {bookings:JourneyReceipt[]}).bookings,loss=rows.find(r=>r.idempotencyKey.endsWith("loss-create"))!;rows.push({...loss,id:crypto.randomUUID()});assert.equal(step(evaluateJourneyReport(duplicate),"response_loss_retry").outcome,"mismatch");
 const replaced=fixture();(observation(replaced,"response_loss_retry").requests![0].response as JourneyReceipt).id=crypto.randomUUID();assert.equal(step(evaluateJourneyReport(replaced),"response_loss_retry").outcome,"mismatch");
});
test("reports bind canonical source identity, inventory, scope and derived results while JSON key order is immaterial",()=>{
 const input=fixture();
 for(const change of[(x:JourneyInput)=>{x.frontendEntry=x.frontendEntry.replace(x.runId,crypto.randomUUID());},(x:JourneyInput)=>{x.scenario="move-loss";},(x:JourneyInput)=>{x.observations.push(structuredClone(x.observations[0]));},(x:JourneyInput)=>{observation(x,"create").requests![0].path="https://unapproved.example/bookings";},(x:JourneyInput)=>{x.frontendDigest="invalid";}]){const copy=structuredClone(input);change(copy);assert.throws(()=>evaluateJourneyReport(copy));}
 const report=evaluateJourneyReport(input);
 for(const change of[(x:JourneyReport)=>{x.summary.observed=19;},(x:JourneyReport)=>{x.steps.pop();},(x:JourneyReport)=>{x.steps[0].outcome="mismatch";},(x:JourneyReport)=>{x.scope.independentSeller=true as false;},(x:JourneyReport)=>{x.brief.maxGuestsPerSlot=9;},(x:JourneyReport)=>{observation(x,"create").requests![0].request={...(observation(x,"create").requests![0].request as object),partySize:1};}]){const copy=structuredClone(report);change(copy);assert.throws(()=>validateJourneyReport(copy));}
 const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value!==null&&typeof value==="object"?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
 assert.deepEqual(validateJourneyReport(reorder(report)),report);
});
test("controlled frontend query must be unambiguous while an independent final state never erases an earlier operation issue",()=>{
 for(const suffix of["&run=another-run","&scenario=move-loss","&unexpected=enabled","&lang=de","&lang=en&lang=zh"]){const input=fixture();input.frontendEntry+=suffix;assert.throws(()=>evaluateJourneyReport(input));}
 for(const language of["zh","en"]){const input=fixture();input.frontendEntry+=`&lang=${language}`;assert.equal(evaluateJourneyReport(input).summary.observed,20);}
 const input=fixture();observation(input,"cancel_repeat").ui!.status="error";const report=evaluateJourneyReport(input);
 assert.equal(step(report,"cancel_repeat").outcome,"mismatch");assert.equal(step(report,"cancel_repeat_readback").reason,"prerequisite_not_observed");assert.equal(step(report,"final_merchant_readback").outcome,"observed");assert.ok(report.summary.issues>0);assert.ok(report.summary.unavailable>0);assert.ok(report.summary.observed<20);assert.deepEqual(validateJourneyReport(report),report);
});
