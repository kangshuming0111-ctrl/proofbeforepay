import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";
import {createEvidenceViewerController,currentEvidenceChecks,runtimeEvidenceForViewer,type EvidenceInput,type EvidenceViewerState} from "../app/guest-lab/evidence-controller.ts";
import {createEvidenceExport} from "../lib/evidence-export.ts";
import {createEvidenceBundle,verifyEvidenceBundle} from "../lib/evidence-bundle.ts";
import {createRevisionAudit,revisionAuditDigest} from "../lib/revision-audit.ts";
import {createIssuedRevisionAuditVerifier,ISSUED_REVISION_AUDIT_SCHEMA,type IssuedRevisionAudit} from "../lib/issued-revision-audit.ts";
import {createEvidenceIssuerVerifier,EVIDENCE_ISSUER_RECEIPT_SCHEMA} from "../lib/evidence-issuer.ts";
import {EVIDENCE_ISSUER_ORIGIN} from "../lib/evidence-issuer-keys.ts";
import {bundleFixture,bundleAt} from "./evidence-bundle-fixtures.ts";
const file=(value:unknown,name="revisions.json"):EvidenceInput=>{const bytes=new TextEncoder().encode(JSON.stringify(value));return{name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};};
async function fixture(){
 const old=await bundleFixture({deliverySequence:1,html:"<!doctype html><html><head><title>Noodle shop</title></head><body><p>Open 11–20</p><p>Earlier version only</p></body></html>"}),fresh=await bundleFixture({deliverySequence:2}),previous=await createEvidenceExport(old.quote),current=await createEvidenceBundle(fresh.quote,{catalog:fresh.catalog,objects:fresh.objects}),audit=await createRevisionAudit({versions:[{retainedAt:bundleAt,isCurrent:false,scope:"archived-core",evidence:previous},{retainedAt:bundleAt,isCurrent:true,scope:"current-full",evidence:current}]});
 const pair=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]),publicKey=Buffer.from(await crypto.subtle.exportKey("spki",pair.publicKey)).toString("base64"),header={schema:EVIDENCE_ISSUER_RECEIPT_SCHEMA as typeof EVIDENCE_ISSUER_RECEIPT_SCHEMA,keyId:"isolated-viewer-test-key",issuer:EVIDENCE_ISSUER_ORIGIN,issuedAt:bundleAt,payloadSha256:await revisionAuditDigest(audit)},signature=Buffer.from(await crypto.subtle.sign("Ed25519",pair.privateKey,new TextEncoder().encode(JSON.stringify(header)))).toString("base64url"),envelope:IssuedRevisionAudit={schema:ISSUED_REVISION_AUDIT_SCHEMA,audit,receipt:{...header,signature}},verify=createIssuedRevisionAuditVerifier(createEvidenceIssuerVerifier({[header.keyId]:publicKey}));
 return{old,fresh,previous,current,audit,envelope,verify};
}

test("trusted issued revisions expose only exact checked source and current native HTTP/supplemental checks, offline",async()=>{
 const f=await fixture(),prior=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error("Viewer must remain offline");};
 try{const controller=createEvidenceViewerController(()=>{},verifyEvidenceBundle,f.verify);await controller.openFile(file(f.envelope));const state=controller.getState();assert.equal(state.phase,"ready");if(state.phase!=="ready")return;assert.equal(state.issuance?.status,"verified");assert.equal(state.verification.consistency,"consistent");assert.equal(state.revisionAudit!.versions.length,2);assert.deepEqual(state.packet,f.current.core);assert.equal(state.revisionAudit!.versions[0].evidence.schema,"proofbeforepay-evidence-export-v1");assert.ok(state.supplemental?.objects.length);assert.ok(currentEvidenceChecks(state).some(c=>c.id==="runtime-bindings"&&c.status==="consistent"));assert.equal(runtimeEvidenceForViewer(state).state,"missing");assert.equal(calls,0);assert.equal("accepted"in state,false);assert.equal("paid"in state,false);}finally{globalThis.fetch=prior;}
});
test("production viewer never trusts the ephemeral test key embedded by a caller",async()=>{
 const f=await fixture(),controller=createEvidenceViewerController();await controller.openFile(file(f.envelope));const state=controller.getState();assert.equal(state.phase,"ready");if(state.phase!=="ready")return;assert.equal(state.issuance?.status,"invalid");assert.equal(state.verification.consistency,"inconsistent");assert.equal(state.packet,undefined);assert.equal(state.revisionAudit,undefined);assert.equal(state.supplemental,undefined);
});
test("missing, altered or schema-disguised issuance never calls the unsigned verifier or exposes revision bytes",async()=>{
 const f=await fixture();let legacyCalls=0;const controller=createEvidenceViewerController(()=>{},async value=>{legacyCalls++;return verifyEvidenceBundle(value);},f.verify);
 for(const mutation of ["receipt","signature","digest","key","schema","no-schema","extra"]){const value=structuredClone(f.envelope)as unknown as Record<string,unknown>;if(mutation==="receipt")delete value.receipt;if(mutation==="signature")(value.receipt as {signature:string}).signature="A".repeat(86);if(mutation==="digest")(value.receipt as {payloadSha256:string}).payloadSha256="a".repeat(64);if(mutation==="key")(value.receipt as {keyId:string}).keyId="untrusted";if(mutation==="schema")value.schema="proofbeforepay-evidence-export-v1";if(mutation==="no-schema")delete value.schema;if(mutation==="extra")value.publicKey="caller-supplied-key";await controller.openFile(file(value,`${mutation}.json`));const state=controller.getState();assert.equal(state.phase,"ready");if(state.phase!=="ready")continue;assert.equal(state.issuance?.status,"invalid",mutation);assert.equal(state.packet,undefined,mutation);assert.equal(state.revisionAudit,undefined,mutation);assert.equal(state.supplemental,undefined,mutation);assert.equal(state.followups,undefined,mutation);}
 assert.equal(legacyCalls,0);
});
test("legacy evidence retains native checks and is explicitly unsigned rather than reissued",async()=>{
 const f=await fixture(),controller=createEvidenceViewerController(()=>{},verifyEvidenceBundle,f.verify);for(const packet of [f.previous,f.current]){await controller.openFile(file(packet));const state=controller.getState();assert.equal(state.phase,"ready");if(state.phase!=="ready")continue;assert.equal(state.issuance?.status,"unproven");assert.equal(state.revisionAudit,undefined);assert.deepEqual(state.verification,await verifyEvidenceBundle(packet));assert.ok(state.packet);}
});
test("inconsistent inner audit is honestly labeled without pretending that its receipt digest was compared",async()=>{
 const f=await fixture(),bad=structuredClone(f.envelope);bad.audit.differences[0].changed=[];let calls=0;
 const verify=createIssuedRevisionAuditVerifier(async()=>{calls++;return{status:"invalid",reason:"unknown_key"};}),result=await verify(bad);
 assert.equal(result.consistency,"inconsistent");assert.equal(result.issuance.status,"invalid");assert.equal(result.issuance.reason,"audit_inconsistent");assert.equal(calls,0);assert.equal(result.audit,undefined);
});
test("new selections and reset revoke an in-flight signature result without leaking its revision source",async()=>{
 const f=await fixture();let release!:()=>void,started!:()=>void;let gate=new Promise<void>(resolve=>{release=resolve;}),began=new Promise<void>(resolve=>{started=resolve;});const controller=createEvidenceViewerController(()=>{},verifyEvidenceBundle,async value=>{started();await gate;return f.verify(value);});
 const pending=controller.openFile(file(f.envelope,"slow-issued.json"));await began;await controller.openFile(file(f.previous,"new-legacy.json"));release();await pending;let state=controller.getState();assert.equal(state.phase,"ready");if(state.phase==="ready"){assert.equal(state.label,"new-legacy.json");assert.equal(state.issuance?.status,"unproven");assert.equal(state.revisionAudit,undefined);}
 gate=new Promise<void>(resolve=>{release=resolve;});began=new Promise<void>(resolve=>{started=resolve;});const late=controller.openFile(file(f.envelope,"reset-issued.json"));await began;controller.reset();release();await late;assert.deepEqual(controller.getState(),{phase:"empty"});
});

type NodeDouble={tag:string;className:string;text:string;children:NodeDouble[];setAttribute:(key:string,value:string)=>void;};
const flatten=(node:NodeDouble):NodeDouble[]=>[node,...node.children.flatMap(flatten)];
async function renderFunction(name:"revisionPanel"|"issuancePanel"|"gatePanel"|"sourcePanel",state:EvidenceViewerState,language:"zh"|"en"){
 const text=await readFile(new URL("../app/guest-lab/evidence-viewer.ts",import.meta.url),"utf8"),source=ts.createSourceFile("evidence-viewer.ts",text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),gates=source.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==="gates")),fn=source.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name);assert.ok(gates);assert.ok(fn);
 const code=ts.transpileModule(`${gates.getText(source)}\n${fn.getText(source)}\nglobalThis.result=${name}(state.packet);`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context:{result?:NodeDouble;[key:string]:unknown}={state,selectedRevisionId:state.phase==="ready"?state.revisionAudit?.versions[0].deliveryId:"",selectedFile:"index.html",tr:(zh:string,en:string)=>language==="zh"?zh:en,node:(tag:string,className="",text=""):NodeDouble=>Object.assign({tag,className,text,children:[],setAttribute:()=>{}},{dataset:{},addEventListener:()=>{}}),append:(parent:NodeDouble,...children:NodeDouble[])=>parent.children.push(...children)};vm.runInNewContext(code,context,{timeout:1000});assert.ok(context.result);return flatten(context.result);
}
test("actual bilingual renderers distinguish issuance, per-version scope and file changes without declaring repairs complete",async()=>{
 const f=await fixture(),controller=createEvidenceViewerController(()=>{},verifyEvidenceBundle,f.verify);await controller.openFile(file(f.envelope));const state=controller.getState();for(const language of ["zh","en"]as const){const revision=await renderFunction("revisionPanel",state,language),issuance=await renderFunction("issuancePanel",state,language),gates=await renderFunction("gatePanel",state,language);assert.ok(revision.some(n=>n.text.includes(language==="zh"?"历史范围":"Archived scope")));assert.ok(revision.some(n=>n.text.includes(language==="zh"?"不代表所有历史":"not all history")));assert.ok(revision.some(n=>n.text.includes("v1 → v2")));assert.ok(issuance.some(n=>n.text.includes(language==="zh"?"应用签发已验证":"Application issuance verified")));assert.ok(issuance.some(n=>n.text.includes(language==="zh"?"不证明网站合格":"not website correctness")));assert.ok(gates.some(n=>n.text=== (language==="zh"?"应用签发记录":"Application issuance receipt")));assert.ok(!gates.some(n=>n.text.includes(language==="zh"?"尚未命名":"not yet named")));}
 const oldSource=await renderFunction("sourcePanel",state,"en");assert.ok(oldSource.some(n=>n.tag==="pre"&&n.text.includes("Earlier version only")));assert.ok(oldSource.some(n=>n.tag==="label"&&n.text==="Source revision"));
 const bad=structuredClone(f.envelope);bad.receipt.signature="A".repeat(86);await controller.openFile(file(bad));const invalid=controller.getState();assert.ok((await renderFunction("issuancePanel",invalid,"zh")).some(n=>n.text.includes("没有退回未签名核对")));assert.ok((await renderFunction("revisionPanel",invalid,"en")).some(n=>n.text.includes("No verified issued revision audit")));
});
test('malformed issued envelopes retain a named visible failure gate and never display unsigned source',async()=>{
 const f=await fixture(),controller=createEvidenceViewerController(()=>{},verifyEvidenceBundle,f.verify);
 for(const mutate of [(p:any)=>p.audit=null,(p:any)=>delete p.receipt,(p:any)=>p.receipt.signature='A'.repeat(86)]){
  const p=structuredClone(f.envelope);mutate(p);await controller.openFile(file(p));const state=controller.getState();assert.equal(state.phase,'ready');if(state.phase!=='ready')continue;assert.equal(state.issuance?.status,'invalid');assert.equal(state.packet,undefined);
  const gates=await renderFunction('gatePanel',state,'en');assert.ok(gates.some(n=>/Application(?: issuance receipt|-issued envelope)/.test(n.text)));assert.ok(gates.some(n=>n.className==='ev-gate-failure'));assert.ok(!gates.some(n=>n.text.includes('not yet named')));
  assert.ok((await renderFunction('sourcePanel',state,'en')).some(n=>n.text.includes('Sources are hidden')));
 }
});
