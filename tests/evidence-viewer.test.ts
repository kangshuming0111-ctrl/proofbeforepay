import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createEvidenceViewerController,runtimeEvidenceForViewer,currentEvidenceChecks,type EvidenceInput} from "../app/guest-lab/evidence-controller.ts";
import {verifyEvidenceExport,type EvidenceExport} from "../lib/evidence-export.ts";
import {EVIDENCE_BUNDLE_BYTE_LIMIT as EVIDENCE_EXPORT_BYTE_LIMIT} from "../lib/evidence-bundle.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {buildGuestLab} from "../scripts/build-guest-lab.mjs";
import ts from "typescript";
import vm from "node:vm";
import {modelFixture,completeModel} from "./model-check-fixture.ts";
import {prepareModelRunStorage} from "../lib/model-report-archive.ts";
import {createEvidenceExport} from "../lib/evidence-export.ts";
import {createEvidenceBundle,verifyEvidenceBundle} from "../lib/evidence-bundle.ts";
import {getModuleDependencyFindings} from "../lib/module-dependencies.ts";
import {bundleFixture,acceptBundleQuote} from "./evidence-bundle-fixtures.ts";

const recorded=async(version:1|2):Promise<EvidenceExport>=>JSON.parse(await readFile(new URL(`./fixtures/recorded-seller-staging/v${version}-evidence.json`,import.meta.url),"utf8"));
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).buffer;
const file=(value:unknown,name="evidence.json"):EvidenceInput=>{const body=bytes(value);return{name,size:body.byteLength,arrayBuffer:async()=>body};};

test("recorded examples remain separate17/18 and18/18 records with8 gates and no network or storage",async()=>{
  const controller=createEvidenceViewerController(),old=await recorded(1),current=await recorded(2),before=structuredClone(old);
  const savedFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error("The viewer must not fetch");};
  try{
    for(const [packet,expected] of [[old,17],[current,18]] as const){
      await controller.openRecorded(packet,`recorded-v${expected}.json`);const state=controller.getState();assert.equal(state.phase,"ready");
      if(state.phase!=="ready")return;assert.equal(state.recorded,true);assert.equal(state.verification.consistency,"consistent");assert.equal(state.verification.checks.length,8);assert.equal(state.verification.limits.networkRequests,0);assert.equal(state.verification.limits.authenticity,"not-proven");assert.equal(state.packet!.delivery.runtimeReport!.summary.observed,expected);
      assert.equal("accepted" in state,false);assert.equal("paid" in state,false);
    }
    assert.equal(calls,0);assert.deepEqual(old,before);
  }finally{globalThis.fetch=savedFetch;}
});

test("local file imports reject size, malformed UTF-8 and JSON before exposing sources",async()=>{
  const controller=createEvidenceViewerController();let reads=0;
  await controller.openFile({name:"large.json",size:EVIDENCE_EXPORT_BYTE_LIMIT+1,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0);}});
  assert.equal(reads,0);assert.deepEqual(controller.getState(),{phase:"error",label:"large.json",recorded:false,error:"too_large"});
  for(const [body,error] of [[new Uint8Array(EVIDENCE_EXPORT_BYTE_LIMIT+1),"too_large"],[new Uint8Array([0xc3,0x28]),"invalid_utf8"],[new TextEncoder().encode('{"incomplete":'),"invalid_json"]] as const){
    await controller.openFile({name:"local.json",size:1,arrayBuffer:async()=>body.buffer});const state=controller.getState();assert.equal(state.phase,"error");if(state.phase==="error")assert.equal(state.error,error);assert.equal("packet" in state,false);
  }
  await controller.openFile(file({unrelated:true}));const unsupported=controller.getState();assert.equal(unsupported.phase,"ready");if(unsupported.phase==="ready"){assert.equal(unsupported.verification.consistency,"unsupported");assert.equal(unsupported.packet,undefined);}
});

test("a pending supplemental run is not presented as the completed earlier report",async()=>{
  for(const version of [1,2] as const){
    const packet=await recorded(version),delivery=packet.delivery,controller=createEvidenceViewerController();
    delivery.runtimeRun={id:"pending-new-run",deliveryId:delivery.id,deliveryDigest:packet.fileDigest,targetId:delivery.backendTargetId!,startedAt:"2026-11-03T00:00:00.000Z",expiresAt:"2026-11-03T00:01:00.000Z"};
    await controller.openRecorded(packet,"pending.json");const view=runtimeEvidenceForViewer(controller.getState());assert.equal(view.state,"pending");assert.equal("report" in view,false);
    if(view.state==="pending"){assert.equal(view.previousReport!.id,delivery.runtimeReport!.id);assert.equal(view.previousReport!.summary.issues,version===1?1:0);}
    controller.reset();assert.deepEqual(runtimeEvidenceForViewer(controller.getState()),{state:"unavailable"});
  }
});

test("rehashing changed source never hides bound-report failures and script text stays data",async()=>{
  const packet=await recorded(1),controller=createEvidenceViewerController(),canary="PBP_VIEWER_SOURCE_EXECUTED";
  packet.delivery.files!["index.html"]+=`<script>globalThis.${canary}=true</script>`;
  packet.fileDigest=await runtimeDeliveryDigest(packet.delivery.files);
  await controller.openFile(file(packet));const state=controller.getState();assert.equal(state.phase,"ready");
  if(state.phase!=="ready")return;assert.equal(state.recorded,false);assert.equal(state.verification.consistency,"inconsistent");assert.ok(state.verification.checks.some(row=>row.id==="runtime-bindings"&&row.status==="inconsistent"));assert.ok(state.packet!.delivery.files!["index.html"].includes(canary));assert.equal((globalThis as Record<string,unknown>)[canary],undefined);
});

test("a newer file selection wins even when an older read finishes later",async()=>{
  const controller=createEvidenceViewerController(),old=await recorded(1),current=await recorded(2);
  let resolveOld!:(value:ArrayBuffer)=>void;
  const pending=controller.openFile({name:"older.json",size:1,arrayBuffer:()=>new Promise(resolve=>{resolveOld=resolve;})});
  await controller.openFile(file(current,"newer.json"));resolveOld(bytes(old));await pending;
  const state=controller.getState();assert.equal(state.phase,"ready");if(state.phase==="ready"){assert.equal(state.label,"newer.json");assert.equal(state.packet!.delivery.id,current.delivery.id);}
});

test("reset suppresses a late verifier result or error and sample snapshots are independent",async()=>{
  const packet=await recorded(1);let resolveCheck!:(value:Awaited<ReturnType<typeof verifyEvidenceExport>>)=>void,rejectCheck!:(reason:unknown)=>void,captured:unknown;
  const controller=createEvidenceViewerController(()=>{},value=>{captured=value;return new Promise((resolve,reject)=>{resolveCheck=resolve;rejectCheck=reject;});});
  const pending=controller.openRecorded(packet,"first.json");packet.project.title="Changed outside the viewer";
  assert.notEqual((captured as EvidenceExport).project.title,packet.project.title);controller.reset();resolveCheck(await verifyEvidenceExport(captured));await pending;assert.deepEqual(controller.getState(),{phase:"empty"});
  const lateFailure=controller.openRecorded(packet,"second.json");controller.reset();rejectCheck(new Error("SYNTHETIC_PRIVATE_ERROR_DO_NOT_SHOW"));await lateFailure;assert.deepEqual(controller.getState(),{phase:"empty"});
});

test("guest multi-entry build emits a script-isolated local verifier at verify.html",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"pbp-evidence-viewer-build-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const output=join(dir,"build");await buildGuestLab(output);
  const viewer=await readFile(join(output,"verify.html"),"utf8"),lab=await readFile(join(output,"index.html"),"utf8"),manifest=JSON.parse(await readFile(join(output,"guest-build.json"),"utf8"));
  assert.match(viewer,/connect-src 'none'/);assert.match(viewer,/object-src 'none'/);assert.match(viewer,/type="module"/);assert.ok(!viewer.includes("evidence-viewer.ts"));assert.match(lab,/id="app"/);assert.ok(manifest.files.some((row:{file:string})=>row.file==="verify.html"));assert.ok(manifest.files.some((row:{file:string})=>row.file==="index.html"));
});


type GateNode={tag:string;className:string;text:string;children:GateNode[];setAttribute:(name:string,value:string)=>void};
/** Exercise the actual gate renderer against verifier output. This is a DOM
 * unit double, not a browser interaction or execution-attestation claim. */
async function renderGateChecks(checks:Awaited<ReturnType<typeof verifyEvidenceExport>>["checks"],language:"zh"|"en"="zh"){
 const source=await readFile(new URL("../app/guest-lab/evidence-viewer.ts",import.meta.url),"utf8"),file=ts.createSourceFile("evidence-viewer.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const declaration=file.statements.find(statement=>ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(item=>ts.isIdentifier(item.name)&&item.name.text==="gates"));
 const renderer=file.statements.find(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text==="gatePanel");assert.ok(declaration);assert.ok(renderer);
 const script=ts.transpileModule(`${declaration.getText(file)}\n${renderer.getText(file)}\nglobalThis.rendered=gatePanel();`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const context:{rendered?:GateNode;[key:string]:unknown}={state:{phase:"ready",verification:{checks}},tr:(zh:string,en:string)=>language==="zh"?zh:en,node:(tag:string,className="",text=""):GateNode=>({tag,className,text,children:[],setAttribute:()=>{}}),append:(parent:GateNode,...children:GateNode[])=>{parent.children.push(...children);}};
 vm.runInNewContext(script,context,{timeout:1000});assert.ok(context.rendered);return context.rendered;
}
function gateNodes(node:GateNode):GateNode[]{return[node,...node.children.flatMap(gateNodes)];}

test("archive integrity has a named bilingual gate without an unknown warning, while legacy exports keep only eight gates",async()=>{
 const legacy=await verifyEvidenceExport(await recorded(1)),legacyNodes=gateNodes(await renderGateChecks(legacy.checks));
 assert.equal(legacyNodes.filter(node=>node.tag==="h3").length,8);assert.ok(!legacyNodes.some(node=>node.text.includes("不可变模型报告档案")));assert.ok(!legacyNodes.some(node=>node.text.includes("尚未命名")));
 const fixture=await modelFixture();let quote=fixture.quote;for(let seed=0;seed<6;seed++)quote=completeModel(await prepareModelRunStorage(quote),fixture.digest,fixture.registration,seed);
 const packet=await createEvidenceExport(quote),verification=await verifyEvidenceExport(packet);assert.equal(verification.consistency,"consistent");assert.ok(verification.checks.some(row=>row.id==="model-archive-integrity"&&row.status==="consistent"));
 const nodes=gateNodes(await renderGateChecks(verification.checks));assert.ok(nodes.some(node=>node.tag==="h3"&&node.text==="不可变模型报告档案"));assert.ok(!nodes.some(node=>node.text.includes("尚未命名")));assert.ok(nodes.some(node=>node.text.includes("SHA-256")));assert.ok(nodes.some(node=>node.text.includes("真实性")));
 const english=gateNodes(await renderGateChecks(verification.checks,"en"));assert.ok(english.some(node=>node.tag==="h3"&&node.text==="Immutable model report archive"));assert.ok(!english.some(node=>node.text.includes("not yet named")));
});

test("module rule and saved-relationship checks have bilingual gates and explicitly forbid a no-source lexer replay claim",async()=>{
 const fixture=await bundleFixture({modules:{"app.mjs":"import './menu.mjs';","menu.mjs":"export default 1;"}}),bundle=await createEvidenceBundle(acceptBundleQuote(fixture.quote,fixture.catalog),{catalog:fixture.catalog,objects:fixture.objects,artifactManifests:[fixture.manifest!]}),verification=await verifyEvidenceBundle(bundle);
 assert.equal(verification.consistency,"consistent");
 const zh=gateNodes(await renderGateChecks(verification.checks));assert.ok(zh.some(n=>n.tag==="h3"&&n.text==="补充证据规则版本"));assert.ok(zh.some(n=>n.tag==="h3"&&n.text==="已保存的有限模块关系"));assert.ok(zh.some(n=>n.text.includes("没有原始 JS")));assert.ok(!zh.some(n=>n.text.includes("尚未命名")));
 const en=gateNodes(await renderGateChecks(verification.checks,"en"));assert.ok(en.some(n=>n.text.includes("Original JS is absent")));assert.ok(!en.some(n=>n.text.includes("not yet named")));
});

test("actual supplemental renderer exposes bounded missing-module details and hides recalculated outcomes when that check failed",async()=>{
 const fixture=await bundleFixture({modules:{"app.mjs":"import './missing.mjs';"}}),bundle=await createEvidenceBundle(acceptBundleQuote(fixture.quote,fixture.catalog),{catalog:fixture.catalog,objects:fixture.objects,artifactManifests:[fixture.manifest!]}),verification=await verifyEvidenceBundle(bundle);
 const source=await readFile(new URL("../app/guest-lab/evidence-viewer.ts",import.meta.url),"utf8"),file=ts.createSourceFile("evidence-viewer.ts",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),renderer=file.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==="supplementalPanel");assert.ok(renderer);
 const script=ts.transpileModule(`${renderer.getText(file)}\nglobalThis.rendered=supplementalPanel();`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const render=(checks:typeof verification.checks)=>{
  const make=(tag:string,className="",text=""):GateNode=>({tag,className,text,children:[],setAttribute:()=>{}}),append=(p:GateNode,...nodes:GateNode[])=>p.children.push(...nodes),labelledValue=(label:string,value:string)=>{const n=make("div");append(n,make("dt","",label),make("dd","",value));return n;};
  const context:{rendered?:GateNode;[key:string]:unknown}={state:{phase:"ready",supplemental:bundle.supplemental,verification:{checks}},tr:(zh:string)=>zh,node:make,append,labelledValue,getModuleDependencyFindings,currentEvidenceChecks};vm.runInNewContext(script,context,{timeout:1000});return gateNodes(context.rendered!);
 };
 const good=render(verification.checks);assert.ok(good.some(n=>n.text==="有限模块依赖观察"));assert.ok(good.some(n=>n.text.includes("artifact_not_declared")&&n.text.includes("missing.mjs")));assert.ok(good.some(n=>n.text.includes("没有原始 JS 可供重新解析")));assert.ok(good.some(n=>n.text.includes("声明范围关系：mismatch")));
 const bad=render(verification.checks.map(c=>c.id==="module-observations"?{...c,status:"inconsistent"as const}:c));assert.ok(bad.some(n=>n.text.includes("模块关系尚未核对一致")));assert.ok(!bad.some(n=>n.text.includes("声明范围关系：")));
});
