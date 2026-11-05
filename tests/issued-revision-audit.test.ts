import assert from "node:assert/strict";
import test from "node:test";
import type {ProofQuote} from "../lib/contracts.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {createEvidenceExport} from "../lib/evidence-export.ts";
import {createEvidenceBundle} from "../lib/evidence-bundle.ts";
import {buildSupplementalEvidenceCatalog} from "../lib/supplemental-evidence.ts";
import {createRevisionAudit,revisionAuditDigest,type RevisionAuditInput} from "../lib/revision-audit.ts";
import {ISSUED_REVISION_AUDIT_SCHEMA,createIssuedRevisionAuditVerifier,verifyIssuedRevisionAudit,issueRevisionAudit} from "../lib/issued-revision-audit.ts";
import {createEvidenceIssuerVerifier,EVIDENCE_ISSUER_RECEIPT_SCHEMA} from "../lib/evidence-issuer.ts";
import {EVIDENCE_ISSUER_ORIGIN} from "../lib/evidence-issuer-keys.ts";
const at="2026-11-06T00:00:00.000Z";
const html=(text:string)=>`<!doctype html><html><head><title>Revision fixture</title></head><body><p>${text}</p></body></html>`;
function quote(n:number,body=`Revision ${n}`,files:Record<string,string>={"index.html":html(body)}):ProofQuote{
 const summary="Deliver a one-page website.",p=parseStaticProject({title:"Revision evidence",summary,amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en"),delivery=createUploadedDelivery(files,p.project,"en",n);
 return{id:"revision-project",reference:"PBP-REVISIONS",workflow:"proof-v1",title:p.title,summary,brief:summary,clientName:"PRIVATE-CUSTOMER",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,paypalOrderId:"PRIVATE-ORDER",proof:{project:p.project,criteria:p.criteria,paymentState:"unfunded",audit:[],delivery,collaboration:{stage:"submitted",feedback:[],submission:{deliveryId:delivery.id,at,note:"PRIVATE-SUBMISSION"}}}};
}
async function input(n=2):Promise<{versions:RevisionAuditInput[]}>{
 const previous=await createEvidenceExport(quote(1)),q=quote(n),d=q.proof.delivery!,core=await createEvidenceExport(q),catalog=await buildSupplementalEvidenceCatalog(d.id,core.fileDigest,[]),current=await createEvidenceBundle(q,{catalog,objects:[]});
 return{versions:[{retainedAt:at,isCurrent:false,scope:"archived-core",evidence:previous},{retainedAt:at,isCurrent:true,scope:"current-full",evidence:current}]};
}
async function issued(){
 const audit=await createRevisionAudit(await input()),digest=await revisionAuditDigest(audit),pair=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]),spki=Buffer.from(await crypto.subtle.exportKey("spki",pair.publicKey)).toString("base64");
 const head={schema:EVIDENCE_ISSUER_RECEIPT_SCHEMA,keyId:"test-audit-key",issuer:EVIDENCE_ISSUER_ORIGIN,issuedAt:at,payloadSha256:digest} as const,signature=Buffer.from(await crypto.subtle.sign("Ed25519",pair.privateKey,new TextEncoder().encode(JSON.stringify(head)))).toString("base64url");
 return {packet:{schema:ISSUED_REVISION_AUDIT_SCHEMA,audit,receipt:{...head,signature}},verify:createIssuedRevisionAuditVerifier(createEvidenceIssuerVerifier({[head.keyId]:spki}))};
}
test("whole signed audit must pass every version and issuer check before any revision data is exposed",async()=>{const f=await issued(),r=await f.verify(f.packet);assert.equal(r.consistency,"consistent");assert.equal(r.issuance.status,"verified");assert.equal(r.audit?.versions.length,2);assert.equal((await verifyIssuedRevisionAudit(f.packet)).issuance.status,"invalid");});
test("stripped receipt, tampered source, malformed schema and extra embedded key fail without unsigned fallback",async()=>{const f=await issued();for(const mutate of[(p:any)=>delete p.receipt,(p:any)=>p.schema="proofbeforepay-revision-audit-v1",(p:any)=>p.receipt.signature="A".repeat(86),(p:any)=>p.publicKey="untrusted",(p:any)=>p.audit.versions[0].evidence.delivery.files["index.html"]+="x"]){const p=structuredClone(f.packet);mutate(p);const r=await f.verify(p);assert.equal(r.consistency,"inconsistent");assert.equal(r.audit,undefined);}});
test("verification captures the complete source envelope before the first asynchronous operation",async()=>{const f=await issued(),p=structuredClone(f.packet),pending=f.verify(p);p.audit.differences[0].changed.length=0;p.receipt.signature="A".repeat(86);assert.equal((await pending).consistency,"consistent");});
test("missing production signing configuration cannot silently issue an unsigned audit",async()=>{const f=await issued();await assert.rejects(issueRevisionAudit(f.packet.audit,undefined),/not configured/);});
