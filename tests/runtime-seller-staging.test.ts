import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleSellerBookingRequest} from "../examples/seller-staging/worker/booking-service.mjs";
import {executeRuntimeCheck} from "../lib/runtime-runner.ts";
import {registrationTarget,type RuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";
import {suggestBookingPolicy} from "../lib/booking-policy.ts";
import {validateRuntimeReport,runtimeReportSummary} from "../lib/runtime-checks.ts";

const original="Each booking accepts at most 6 people.",source={start:0,end:original.length,excerpt:original};
const registration:RuntimeRegistrationSnapshot={id:"seller-independent",label:"Independent synthetic seller handler",projectId:"independent-project",registrationRevision:"approved-1",deploymentRevision:"seller-native-1",protocol:"booking-http-v2",baseUrl:"https://seller.example.org/pbp/",frontendBundleDigest:"a".repeat(64),expiresAt:"2030-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
const migration=readFileSync(new URL("../examples/seller-staging/migrations/0001_seller_staging.sql",import.meta.url),"utf8");
function fixture(maximum:number){
  const sqlite=new DatabaseSync(":memory:");sqlite.exec(migration);
  sqlite.prepare("UPDATE seller_business_policy SET max_party_size = ? WHERE id = 1").run(maximum);
  const db={prepare(sql:string){const statement=sqlite.prepare(sql);return{bind(...args:(string|number|null)[]){return{async first(){return statement.get(...args)??null;},async run(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}};}};}};}};
  const env={SELLER_DB:db,SELLER_PROJECT_ID:registration.projectId,SELLER_REGISTRATION_REVISION:registration.registrationRevision,SELLER_DEPLOYMENT_REVISION:registration.deploymentRevision,SELLER_FRONTEND_BUNDLE_DIGEST:registration.frontendBundleDigest};
  return{sqlite,env};
}
test("checker catches independently stored seller business defects, rather than copying its max from meta",async()=>{
  for(const actualMaximum of [7,6,5]){
    const state=fixture(actualMaximum),runId=crypto.randomUUID();
    const input={deliveryId:"independent-upload",deliveryDigest:registration.frontendBundleDigest,runId,plan:{protocol:"booking-http-v2" as const,criterionId:"original-capacity",source,policy:suggestBookingPolicy(source)!},target:registrationTarget(registration),registration};
    const calls:string[]=[];
    try{
      const report=await executeRuntimeCheck(input,{fetch:async(url,init)=>{calls.push(`${init.method} ${new URL(url).pathname}`);return handleSellerBookingRequest(new Request(url,init),state.env);}});
      assert.deepEqual(validateRuntimeReport(report,input),report);assert.ok(report.plan.protocol==="booking-http-v2");assert.equal(report.plan.policy.maxPartySize,6);assert.equal(calls.length,actualMaximum===5?17:18);
      if(actualMaximum===7){
        assert.deepEqual(report.summary,{steps:18,observed:17,issues:1,unavailable:0});
        assert.equal(report.steps.find(row=>row.id==="party_above")!.status,201);
        assert.equal(state.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_booking_receipts WHERE party_size = 7").get()!.n,1);
      }else if(actualMaximum===6){
        assert.deepEqual(report.summary,{steps:18,observed:18,issues:0,unavailable:0});
        assert.equal(report.steps.find(row=>row.id==="party_above")!.status,422);
        assert.equal(state.sqlite.prepare("SELECT COUNT(*) AS n FROM seller_booking_receipts").get()!.n,4);
        const duplicateCreation=structuredClone(report);
        for(const row of duplicateCreation.steps.filter(row=>row.id==="concurrent_first"||row.id==="concurrent_second"))row.status=201;
        assert.throws(()=>validateRuntimeReport(duplicateCreation,input),/exactly one creation/);
        const partialSuccess=structuredClone(report);partialSuccess.steps.find(row=>row.id==="concurrent_second")!.outcome="mismatch";partialSuccess.summary=runtimeReportSummary(partialSuccess.steps);
        assert.throws(()=>validateRuntimeReport(partialSuccess,input),/exactly one creation/);
        for(const row of duplicateCreation.steps.filter(row=>row.id==="concurrent_first"||row.id==="concurrent_second"))row.outcome="mismatch";
        duplicateCreation.summary=runtimeReportSummary(duplicateCreation.steps);
        assert.doesNotThrow(()=>validateRuntimeReport(duplicateCreation,input));
        const reversedArrival=structuredClone(report),observedPair=reversedArrival.steps.filter(row=>row.id==="concurrent_first"||row.id==="concurrent_second");
        [observedPair[0].status,observedPair[1].status]=[observedPair[1].status,observedPair[0].status];
        assert.doesNotThrow(()=>validateRuntimeReport(reversedArrival,input));
      }else{
        assert.equal(report.steps.find(row=>row.id==="party_exact")!.outcome,"mismatch");
        assert.equal(report.steps.find(row=>row.id==="party_exact")!.status,422);
        assert.equal(report.steps.find(row=>row.id==="party_exact_readback")!.reason,"boundary_not_verified");
      }
      assert.equal(report.steps.find(row=>row.id==="concurrent_first")!.outcome,"observed");
      assert.equal(report.steps.find(row=>row.id==="concurrent_second")!.outcome,"observed");
      assert.ok(!JSON.stringify(report).includes("SELLER_DB"));
    }finally{state.sqlite.close();}
  }
});
