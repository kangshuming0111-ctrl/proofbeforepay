import assert from "node:assert/strict";
import test from "node:test";
import {diagnoseModelReport,modelDiagnosticFeedback,modelDiagnosisExplanationPacket,MODEL_DIAGNOSIS_REVISION} from "../lib/model-diagnostics.ts";
import {modelFixture,completeModel} from "./model-check-fixture.ts";
import {modelCheckReportFromTrace,type ModelCheckBase,type ModelCheckReport} from "../lib/model-checks.ts";

async function report(outcome:"compatible"|"violated"="compatible",seed=4){const f=await modelFixture();return completeModel(f.quote,f.digest,f.registration,seed,outcome).proof.delivery!.modelReport!;}
function base(r:ModelCheckReport):ModelCheckBase{return{id:r.runId,deliveryId:r.deliveryId,deliveryDigest:r.deliveryDigest,journeyPlanDigest:r.journeyPlanDigest,modelSpecDigest:r.modelSpecDigest,seed:r.seed,registration:r.registration,startedAt:r.startedAt};}

test("diagnosis binds the exact immutable evidence and cannot rewrite its stored result or original bytes",async()=>{
 const r=await report(),before=JSON.stringify(r),d=diagnoseModelReport(r,{deliveryId:r.deliveryId,deliveryDigest:r.deliveryDigest,journeyPlanDigest:r.journeyPlanDigest,projectId:r.registration.projectId});
 assert.equal(d.reportId,r.id);assert.equal(d.outcome,r.result.outcome);assert.equal(d.coverage.observations,24);assert.equal(d.coverage.syntheticWrites,5);assert.equal(d.findings[0].severity,"information");assert.equal(JSON.stringify(r),before);
 for(const expected of[{deliveryId:"other"},{deliveryDigest:"e".repeat(64)},{journeyPlanDigest:"e".repeat(64)},{projectId:"other"}])assert.throws(()=>diagnoseModelReport(r,expected));
 const forged=structuredClone(r);forged.result.outcome="violated";assert.throws(()=>diagnoseModelReport(forged));
});

test("confirmed original cancellation is described with party impact and both independent readback sources",async()=>{
 const r=await report("violated"),d=diagnoseModelReport(r),finding=d.findings.find(row=>row.id==="original_booking_status")!;
 assert.equal(d.outcome,"violated");assert.equal(finding.severity,"issue");assert.ok(finding.operationIds.includes("final_x"));assert.ok(finding.operationIds.includes("final_merchant"));assert.match(finding.expected.en,/Both legal orders/);assert.match(finding.actual.en,/merchant record also/);assert.match(finding.impact.zh,/6 人/);assert.match(d.summary.en,/wrongly cancelled/);assert.equal(d.alternatives.length,2);assert.ok(d.alternatives.every(order=>!order.matches&&order.differenceCount>0));
});

test("an uncertain or explicitly closed report never becomes a confirmed lost-booking diagnosis",async()=>{
 const r=await report("violated"),trace=structuredClone(r.trace);trace.find(row=>row.operationId==="final_x")!.status=503;
 const uncertain=modelCheckReportFromTrace(base(r),trace,r.finishedAt),d=diagnoseModelReport(uncertain);
 assert.equal(d.outcome,"inconclusive");assert.ok(d.findings.every(row=>row.severity==="unknown"));assert.ok(!d.findings.some(row=>row.id==="original_booking_status"));assert.ok(d.findings.some(row=>row.id==="observation_unavailable_final_x"));
 const closed=modelCheckReportFromTrace(base(r),r.trace,r.finishedAt,"https://seller.private.example/secret-customer-text");const packet=modelDiagnosisExplanationPacket(closed);
 assert.equal(packet.reason,"closed_without_replay");assert.ok(packet.findings.every(row=>row.severity==="unknown"));assert.doesNotMatch(JSON.stringify(packet),/seller\.private|secret-customer/);
});

test("one conflicting view is distinguished from merchant-confirmed cancellation",async()=>{
 const r=await report(),trace=structuredClone(r.trace);(trace.find(row=>row.operationId==="final_x")!.body as Record<string,unknown>).status="cancelled";
 const changed=modelCheckReportFromTrace(base(r),trace,r.finishedAt),d=diagnoseModelReport(changed),original=d.findings.find(row=>row.id==="original_booking_status")!;
 assert.equal(d.outcome,"violated");assert.ok(d.findings.some(row=>row.id==="receipt_merchant_agreement"));assert.match(original.actual.en,/requires separate reconciliation/);assert.doesNotMatch(d.summary.en,/wrongly cancelled/);
});

test("both legal orders remain compatible, with no cherry-picked slot expectation",async()=>{
 const r=await report(),trace=structuredClone(r.trace),x=structuredClone(trace.find(row=>row.operationId==="create_x")!.body) as Record<string,unknown>,y={...(trace.find(row=>row.operationId==="create_y")!.body as Record<string,unknown>),status:"cancelled"} as Record<string,unknown>,z=trace.find(row=>row.operationId==="create_z")!.body as Record<string,unknown>;
 const move=trace.find(row=>row.operationId==="transfer_x")!;move.status=409;move.body={code:"slot_capacity_exceeded"};
 for(const row of trace){if(row.operationId==="final_merchant")(row.body as Record<string,unknown>).bookings=[x,y,z];else if(row.operationId==="final_x")row.body=x;else if(/^final_[abc]$/.test(row.operationId)){const body=row.body as Record<string,unknown>,active=[x,y,z].filter(item=>item.status==="active"&&item.slot===body.slot);body.guestCount=active.reduce((sum,item)=>sum+Number(item.partySize),0);body.bookingIds=active.map(item=>item.id);}}
 // Fresh JSON removes intentionally shared fixture objects before strict parser.
 const corrected=modelCheckReportFromTrace(base(r),JSON.parse(JSON.stringify(trace)),r.finishedAt),d=diagnoseModelReport(corrected);
 assert.equal(d.outcome,"compatible");assert.deepEqual(corrected.result.compatibleOrders,["move_then_cancel"]);assert.ok(d.findings.every(row=>row.severity==="information"));assert.ok(!d.findings.some(row=>row.id.startsWith("occupancy_")));
});

test("AI packet and editable feedback are bounded, use aliases, and exclude arbitrary seller payloads and raw identifiers",async()=>{
 const r=await report("violated"),trace=structuredClone(r.trace),privateValue="PRIVATE-name https://private.invalid customer@example.org sk-private-not-real";
 (trace.find(row=>row.operationId==="final_x")!.body as Record<string,unknown>).extra=privateValue;
 const changed=modelCheckReportFromTrace(base(r),trace,r.finishedAt),packet=modelDiagnosisExplanationPacket(changed),encoded=JSON.stringify(packet);
 assert.equal(packet.diagnosisRevision,MODEL_DIAGNOSIS_REVISION);assert.equal(packet.reportId,changed.id);assert.ok(packet.findingIds.length>0);assert.ok(new TextEncoder().encode(encoded).byteLength<=16*1024);
 assert.doesNotMatch(encoded,/PRIVATE-name|private\.invalid|customer@example|sk-private|native-x|native-y|native-z|idempotencyKey|backendBaseUrl/);
 for(const language of["zh","en"]as const){const draft=modelDiagnosticFeedback(changed,language);assert.ok(draft.length<=1000);assert.ok(draft.includes(changed.id));assert.match(draft,/原预约|original booking/i);assert.match(draft,/新命名空间|fresh namespace/);}
});

test("many independent mismatches retain bounded alias displays and a fresh-retest footer",async()=>{
 const r=await report(),trace=structuredClone(r.trace),find=(id:string)=>trace.find(row=>row.operationId===id)!;
 const x=find("final_x").body as Record<string,unknown>,y=find("final_y").body as Record<string,unknown>,z=find("final_z").body as Record<string,unknown>;
 x.status="cancelled";x.partySize=5;y.status="active";z.status="cancelled";z.partySize=1;
 (find("final_merchant").body as Record<string,unknown>).bookings=JSON.parse(JSON.stringify([x,x,z]));
 for(const row of trace.filter(row=>/^final_[abc]$/.test(row.operationId))){const b=row.body as Record<string,unknown>;b.guestCount=99999;b.bookingIds=Array(60).fill("private-booking-reference");}
 find("cancel_y").status=400;find("cancel_y").body={code:"private-seller-error"};find("transfer_x").status=400;find("transfer_x").body={code:"private-seller-error"};
 const changed=modelCheckReportFromTrace(base(r),JSON.parse(JSON.stringify(trace)),r.finishedAt),d=diagnoseModelReport(changed),packet=modelDiagnosisExplanationPacket(changed);
 assert.equal(d.outcome,"violated");assert.ok(d.findings.length>8);assert.equal(packet.findings.length,8);assert.ok(packet.omittedFindingCount>0);assert.ok(new TextEncoder().encode(JSON.stringify(packet)).byteLength<=16*1024);assert.doesNotMatch(JSON.stringify(packet),/private-booking-reference|private-seller-error/);
 for(const language of["zh","en"]as const){const draft=modelDiagnosticFeedback(changed,language);assert.ok(draft.length<=1000);assert.match(draft,/新命名空间|fresh namespace/);}
});
