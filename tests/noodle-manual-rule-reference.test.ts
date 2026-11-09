import assert from "node:assert/strict";
import test from "node:test";
import {isStaticManualSourceReference} from "../app/components/manual-rule-reference.ts";
import {createUploadedDelivery, parseStaticProject} from "../lib/static-project.ts";

test("manual source context from a real noodle intake is separated from actual rule evidence without editing saved records",()=>{
  const summary="菜单的牛肉面标价必须为AUD18且营业时间必须为上午11点到晚上8点。";
  const project=parseStaticProject({title:"Fictional noodle shop",summary,amount:"1.00",requiredPages:["index.html","menu.html","contact.html"],manualRequirements:[],
    coverage:{version:1,confirmed:true,sourceText:summary,decisions:[{id:"coverage-1",disposition:"include"}]}},"zh").project;
  const html=(inner:string)=>`<!doctype html><html><head><title>Test page</title></head><body>${inner}</body></html>`;
  const d=createUploadedDelivery({"index.html":html("Home"),"menu.html":html("牛肉面 AUD18"),"contact.html":html("营业时间：上午11点到晚上8点。"),"site.css":"body{color:#222}"},project,"zh",3);
  const before=structuredClone(d.evidence);
  const coverage=d.evidence.find(row=>row.criterionId==="coverage-1")!, mobile=d.evidence.find(row=>row.criterionId==="mobile")!;
  assert.equal(coverage.file,"index.html");
  assert.equal(mobile.file,"site.css");
  assert.equal(isStaticManualSourceReference(coverage,true),true);
  assert.equal(isStaticManualSourceReference(mobile,true),true);
  assert.equal(isStaticManualSourceReference(coverage,false),false);
  assert.equal(isStaticManualSourceReference({...coverage,file:"contact.html"},true),false);
  assert.equal(isStaticManualSourceReference({...coverage,id:"explicit-evidence"},true),false);
  assert.equal(isStaticManualSourceReference({...coverage,finding:"fail"},true),false);
  assert.ok(d.evidence.filter(row=>row.finding==="pass").length>=3);
  assert.ok(d.evidence.filter(row=>row.finding==="pass").every(row=>!isStaticManualSourceReference(row,true)));
  assert.deepEqual(d.evidence,before);
});
