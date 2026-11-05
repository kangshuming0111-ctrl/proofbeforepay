import test from "node:test";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {createDeliveryStageProbe} from "../lib/delivery-stage-probe.ts";
import {DELIVERY_STAGES,validateDeliveryStageReport,type DeliveryStagePlan} from "../lib/delivery-stage-evidence.ts";
import {createAdapter} from "../examples/delivery-stage-staging/adapter.mjs";
const plan=():DeliveryStagePlan=>({schema:"pbp-delivery-stage-plan-v1",runId:"stage-reference-1",syntheticOnly:true,scope:{projectId:"synthetic-enquiry",deliveryId:"reference-1",criterionId:"manual-1",sourceRevision:"enquiry-reference-v1",requirement:"Submit an enquiry, retain it in the datastore, read it from a fresh connection, and record its receipt in the local test inbox."},payloadDigest:createHash("sha256").update(JSON.stringify({subject:"PBP synthetic enquiry",message:"Synthetic staged delivery test"})).digest("hex"),stages:DELIVERY_STAGES.map(stage=>({stage,coverage:"adapter"}))});
test("real loopback HTTP, SQLite and test sink distinguish three single-layer faults",async()=>{
 for(const profile of ["fixed","no-store","wrong-readback","no-email"]){const adapter=await createAdapter({plan:plan(),profile});try{const result=await createDeliveryStageProbe(adapter.stages).run(plan());await validateDeliveryStageReport(result);assert.equal(result.rows[0].status,"matched");if(profile==="fixed")assert.equal(result.summary.matched,4);else{const stage=profile==="no-store"?"stored_record":profile==="wrong-readback"?"fresh_readback":"email_receipt";assert.equal(result.rows.find(row=>row.stage===stage)!.status,"mismatch",profile);assert.ok(result.summary.mismatch>0);}}finally{await adapter.close();}}
});
test("CLI validates input and reserves new output before selected adapter runs",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-stage-cli-"));
 try{
  const p=path.join(dir,"plan.json"),output=path.join(dir,"report.json"),adapter=path.resolve(import.meta.dirname,"../examples/delivery-stage-staging/adapter.mjs"),cli=path.resolve(import.meta.dirname,"../scripts/run-delivery-stage-probe.mjs");await writeFile(p,JSON.stringify(plan()));
  const run=spawnSync(process.execPath,["--experimental-strip-types",cli,"--plan",p,"--adapter",adapter,"--output",output],{encoding:"utf8"});assert.equal(run.status,0,run.stderr);const result=await validateDeliveryStageReport(JSON.parse(await readFile(output,"utf8")));assert.equal(result.summary.matched,4);
  const again=spawnSync(process.execPath,["--experimental-strip-types",cli,"--plan",p,"--adapter",adapter,"--output",output],{encoding:"utf8"});assert.equal(again.status,1);assert.match(again.stderr,/STAGE_REPORT_ALREADY_EXISTS/u);
  await writeFile(p,JSON.stringify({...plan(),syntheticOnly:false}));const bad=spawnSync(process.execPath,["--experimental-strip-types",cli,"--plan",p,"--adapter",adapter,"--output",path.join(dir,"bad.json")],{encoding:"utf8"});assert.equal(bad.status,1);assert.match(bad.stderr,/INVALID_DELIVERY_STAGE_EVIDENCE/u);
 }finally{await rm(dir,{recursive:true,force:true});}
});
