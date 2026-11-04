import test from "node:test";
import assert from "node:assert/strict";
import {artifactSha,hashLocalDeliveryArtifacts,createDeliveryArtifactManifest,validateDeliveryArtifactFiles,validateDeliveryArtifactManifest,deliveryArtifactCoverage,DELIVERY_ARTIFACT_LIMITS} from "../lib/delivery-artifacts.ts";
const source="export const accepted = true;",bytes=new TextEncoder().encode(source),file={file:"app.mjs",bytes:bytes.length,sha256:await artifactSha(bytes)};
const manifest=()=>createDeliveryArtifactManifest({projectId:"p-1",deliveryId:"d-1",deliveryDigest:"a".repeat(64),files:[file]},{id:"1f830427-db0e-4d14-b40c-b20c95396563",at:"2026-11-04T10:00:00.000Z"});
test("local metadata derives actual JS bytes and preserves bounded folder paths without code upload",async()=>{
 const selected={name:"app.mjs",size:bytes.length,arrayBuffer:async()=>bytes.buffer},metadata=await hashLocalDeliveryArtifacts([selected]);assert.deepEqual(metadata,[file]);assert.equal(Object.hasOwn(metadata[0],"source"),false);
 assert.deepEqual(await hashLocalDeliveryArtifacts([{...selected,webkitRelativePath:"dist/assets/app.mjs"}]),[{...file,file:"assets/app.mjs"}]);
 await assert.rejects(hashLocalDeliveryArtifacts([{...selected,size:1}]),/changed/u);await assert.rejects(hashLocalDeliveryArtifacts([{...selected,name:"../app.mjs"}]));await assert.rejects(hashLocalDeliveryArtifacts([{...selected,name:"app.html"}]));await assert.rejects(hashLocalDeliveryArtifacts([{...selected,webkitRelativePath:"dist/app.mjs"},selected]));await assert.rejects(hashLocalDeliveryArtifacts([{...selected,size:DELIVERY_ARTIFACT_LIMITS.fileBytes+1}]));
});
test("manifest public projection is canonical, immutable and rejects actor/source additions, aliases and oversized declarations",async()=>{
 const m=await manifest();assert.deepEqual(await validateDeliveryArtifactManifest(JSON.parse(JSON.stringify(m))),m);assert.equal(Object.hasOwn(m,"createdBy"),false);
 for(const patch of [{manifestDigest:"b".repeat(64)},{deliveryId:"d-2"},{files:[{...file,bytes:1}]},{createdBy:"seller"},{source}])await assert.rejects(validateDeliveryArtifactManifest({...m,...patch}));
 assert.throws(()=>validateDeliveryArtifactFiles([{...file,file:"App.mjs"},file]),/duplicate/u);for(const path of ["/app.js","a/../../app.js","https://bad.example/app.js","app.js?version=1","%61pp.js","a\\app.js"]){assert.throws(()=>validateDeliveryArtifactFiles([{...file,file:path}]));}
 assert.throws(()=>validateDeliveryArtifactFiles(Array.from({length:5},(_,i)=>({...file,file:`chunk${i}.js`,bytes:2*1024*1024}))),/8MiB/u);assert.throws(()=>validateDeliveryArtifactFiles([{...file,source}]));
 for(const count of [0,33])assert.throws(()=>validateDeliveryArtifactFiles(Array.from({length:count},(_,i)=>({...file,file:`chunk${i}.js`}))));for(const count of [0,2*1024*1024+1])assert.throws(()=>validateDeliveryArtifactFiles([{...file,bytes:count}]));
 const maximum=validateDeliveryArtifactFiles(Array.from({length:32},(_,i)=>({...file,file:`chunk${i}.js`,bytes:256*1024})));assert.equal(maximum.length,32);assert.equal(maximum.reduce((n,f)=>n+f.bytes,0),8*1024*1024);
 const first=await manifest(),second=await createDeliveryArtifactManifest({...first,files:[{...file,sha256:"c".repeat(64)}]});assert.notEqual(first.manifestDigest,second.manifestDigest);assert.deepEqual(await validateDeliveryArtifactManifest(first),first);
});
test("direct-script coverage resolves local references and keeps unsupported, inline and missing dependencies visible",async()=>{
 const m=await manifest(),coverage=deliveryArtifactCoverage({"index.html":'<script src="./app.mjs" type="module"></script><script src="missing.js"></script><script src="https://cdn.example/a.js"></script><script>window.example=1</script><script type="application/json">{"not":"code"}</script>',"sub/index.html":'<script src="../app.mjs"></script><script src="../../escape.js"></script>'},m);
 assert.equal(coverage.filter(c=>c.state==="declared").length,2);assert.equal(coverage.filter(c=>c.state==="missing").length,1);assert.equal(coverage.filter(c=>c.state==="unavailable").length,3);assert.ok(coverage.find(c=>c.reference==="missing.js"&&c.target==="missing.js"));
 assert.equal(deliveryArtifactCoverage({"index.html":'<base href="/other/"><script src="app.mjs"></script>'},m)[0].reason,"base_element");
 for(const src of ["/app.mjs","app.mjs?v=1","%61pp.mjs","//cdn.example/app.mjs"]){assert.equal(deliveryArtifactCoverage({"index.html":`<script src="${src}"></script>`},m)[0].state,"unavailable");}
 assert.equal(deliveryArtifactCoverage({"index.html":'<script type="module" src="./app.mjs"></script>'})[0].state,"missing");const bounded=deliveryArtifactCoverage({"index.html":'<script src="a.js"></script>'.repeat(201)});assert.equal(bounded.length,200);assert.equal(bounded[199].reason,"source_complexity");
});
