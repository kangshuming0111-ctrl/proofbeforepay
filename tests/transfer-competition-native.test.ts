import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp,rm,mkdir,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {executeTransferRun} from "../lib/transfer-competition-runner.ts";
import {TRANSFER_SPEC_DIGEST,TRANSFER_SLOTS,generateTransferPlan,describeTransferReport,type TransferBase} from "../lib/transfer-competition.ts";
import {PROJECT_JOURNEY_PLAN_DIGEST} from "../lib/project-journey.ts";
async function fixture(t:TestContext,variant:"competing-fixed"|"competing-overbook"){
 const temp=await mkdtemp(path.join(tmpdir(),"pbp-transfer-native-")),database=path.join(temp,"native.sqlite"),script=fileURLToPath(new URL("../examples/seller-workshop-python/race-fixture.py",import.meta.url));
 const child=spawn("/usr/bin/python3",[script,"--variant",variant,"--db",database,"--port","0"],{env:{PATH:"/usr/bin:/bin",NODE_ENV:"test"}});let errors="";child.stderr.on("data",part=>{errors+=String(part);});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const exited=once(child,"exit");child.kill("SIGTERM");const timer=setTimeout(()=>child.kill("SIGKILL"),2000);timer.unref();try{await exited;}finally{clearTimeout(timer);}}await rm(temp,{recursive:true,force:true});});
 const ready=await new Promise<{origin:string;nativeRevision:string}>((resolve,reject)=>{let output="";const timer=setTimeout(()=>reject(new Error("Native fixture did not start: "+errors)),8000);child.once("exit",()=>{clearTimeout(timer);reject(new Error("Native fixture exited: "+errors));});child.stdout.on("data",part=>{output+=String(part);const at=output.indexOf("\n");if(at>=0){clearTimeout(timer);resolve(JSON.parse(output.slice(0,at)));}});});
 const base=(seed:number):TransferBase=>({id:crypto.randomUUID(),projectId:"native-transfer-project",deliveryId:"native-transfer-delivery",deliveryDigest:"d".repeat(64),journeyPlanDigest:PROJECT_JOURNEY_PLAN_DIGEST,modelSpecDigest:TRANSFER_SPEC_DIGEST,seed,startedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30000).toISOString(),registration:{id:"native-transfer-race",label:"Native flower workshop",projectId:"native-transfer-project",registrationRevision:"native-transfer-reg-v1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:ready.origin+"/workshop.html",backendBaseUrl:ready.origin+"/pbp/",deploymentRevision:ready.nativeRevision,bridgeRevision:"lifecycle-fixed-v1",frontendBundleDigest:"d".repeat(64),scenario:"fixed",expiresAt:new Date(Date.now()+60000).toISOString(),testOnly:true,provenance:"operator-approved-declaration"}});
 return{base,database};
}
for(const variant of["competing-fixed","competing-overbook"]as const)test(`independent native SQLite ${variant} exposes actual competing-transfer capacity and preserves the losing source`,async t=>{
 const f=await fixture(t,variant),evidence=[];
 for(const seed of[0,4,17]){const input=f.base(seed),plan=generateTransferPlan(seed),report=await executeTransferRun(input,{allowLoopback:true}),summary=describeTransferReport(report,{allowLoopback:true});assert.equal(report.result.outcome,variant==="competing-fixed"?"compatible":"violated",JSON.stringify(report.result));assert.equal(report.trace.length,24);assert.equal(report.trace.filter(row=>row.method==="POST").length,5);
  const db=new DatabaseSync(f.database,{readOnly:true});try{const rows=db.prepare("SELECT * FROM enrolments WHERE exercise_id=? ORDER BY creation_command").all(input.id);assert.equal(rows.length,3);assert.equal(rows.filter(row=>row.enrolment_state==="confirmed").length,3);const targetCode={a:"STEM-MORNING",b:"STEM-MIDDAY",c:"STEM-AFTERNOON"}[plan.target],nativeTarget=rows.filter(row=>row.session_code===targetCode).reduce((sum,row)=>sum+Number(row.seat_count),0);assert.equal(nativeTarget,variant==="competing-fixed"?8:8+plan.p);assert.equal(summary.targetGuestCount,nativeTarget);
   const statuses=[summary.moveStatuses.x,summary.moveStatuses.y].sort();assert.deepEqual(statuses,variant==="competing-fixed"?[200,409]:[200,200]);assert.equal(summary.otherBookingUnchanged,true);if(variant==="competing-fixed")assert.deepEqual(Object.values(summary.originals).sort(),["moved","preserved"]);else assert.deepEqual(Object.values(summary.originals),["moved","moved"]);
   evidence.push({report,summary,nativeRows:rows,nativeTargetGuests:nativeTarget});
  }finally{db.close();}
 }
 if(process.env.PBP_TRANSFER_NATIVE_EVIDENCE){const destination=path.resolve(process.env.PBP_TRANSFER_NATIVE_EVIDENCE,variant+".json");await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify({schema:"proofbeforepay-native-transfer-comparison-v1",generatedAt:new Date().toISOString(),syntheticOnly:true,controlledOverlapBarrier:true,browserObserved:false,scope:"Actual independent Python HTTP and native SQLite; startup-selected disposable fixture, not seller/deployment attestation",variant,evidence},null,2)+"\n");}
});
