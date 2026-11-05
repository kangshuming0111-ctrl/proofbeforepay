import assert from "node:assert/strict";
import test from "node:test";
import {createEvidenceIssuerVerifier,verifyEvidenceIssuerReceipt,signEvidenceDigest,EVIDENCE_ISSUER_RECEIPT_SCHEMA} from "../lib/evidence-issuer.ts";
import {EVIDENCE_ISSUER_ORIGIN} from "../lib/evidence-issuer-keys.ts";
const digest="a".repeat(64);
async function fixture(){
 const pair=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]),publicKey=Buffer.from(await crypto.subtle.exportKey("spki",pair.publicKey)).toString("base64");
 const header={schema:EVIDENCE_ISSUER_RECEIPT_SCHEMA,keyId:"test-ephemeral",issuer:EVIDENCE_ISSUER_ORIGIN,issuedAt:"2026-11-06T00:00:00.000Z",payloadSha256:digest} as const;
 const signature=Buffer.from(await crypto.subtle.sign("Ed25519",pair.privateKey,new TextEncoder().encode(JSON.stringify(header)))).toString("base64url");
 return {pair,receipt:{...header,signature},verify:createEvidenceIssuerVerifier({[header.keyId]:publicKey})};
}
test("independent ephemeral issuer verifies only against its explicitly trusted key",async()=>{
 const f=await fixture();assert.equal((await f.verify(digest,f.receipt)).status,"verified");assert.equal((await verifyEvidenceIssuerReceipt(digest,f.receipt)).reason,"unknown_key");
 const wrong=await fixture();assert.equal((await wrong.verify(digest,f.receipt)).reason,"signature_invalid");
});
test("payload, issuer, time and key alterations cannot silently become unsigned verification",async()=>{
 const f=await fixture();for(const change of [{payloadSha256:"b".repeat(64)},{issuer:"https://attacker.invalid"},{issuedAt:"2026-11-07T00:00:00.000Z"},{keyId:"another-key"},{signature:"A".repeat(86)},{publicKey:"attacker-key"}])assert.equal((await f.verify(digest,{...f.receipt,...change})).status,"invalid",JSON.stringify(change));
 assert.equal((await f.verify("b".repeat(64),f.receipt)).reason,"digest_mismatch");assert.equal((await f.verify(digest,undefined)).status,"invalid");
});
test("malformed fields, accessors and prototypes fail before values are read",async()=>{
 const f=await fixture();let read=false;const withGetter={...f.receipt};Object.defineProperty(withGetter,"signature",{get(){read=true;throw Error("getter");},enumerable:true});
 for(const r of [withGetter,Object.assign(Object.create({}),f.receipt),{...f.receipt,issuedAt:"2026-02-30T00:00:00.000Z"},{...f.receipt,signature:f.receipt.signature+"=="},{...f.receipt,extra:1}])assert.equal((await f.verify(digest,r)).status,"invalid");assert.equal(read,false);
});
test("caller receipt mutation after verification starts cannot change signed bytes",async()=>{
 const f=await fixture(),r={...f.receipt},pending=f.verify(digest,r);r.payloadSha256="b".repeat(64);r.signature="A".repeat(86);assert.equal((await pending).status,"verified");
});
test("unconfigured or wrong production signer rejects without exposing key material",async()=>{
 await assert.rejects(signEvidenceDigest(digest,undefined),/not configured/);await assert.rejects(signEvidenceDigest(digest,"not a key"),/not configured/);
 const f=await fixture(),privateKey=Buffer.from(await crypto.subtle.exportKey("pkcs8",f.pair.privateKey)).toString("base64");await assert.rejects(signEvidenceDigest(digest,privateKey),e=>e instanceof Error&&!e.message.includes(privateKey)&&/does not match/.test(e.message));
});
test('deferred key import still verifies the captured receipt despite caller mutation during the wait',async()=>{
 const f=await fixture(),r={...f.receipt},subtle=crypto.subtle,original=subtle.importKey,descriptor=Object.getOwnPropertyDescriptor(subtle,'importKey');let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 Object.defineProperty(subtle,'importKey',{configurable:true,value:async(...args:unknown[])=>{await gate;return Reflect.apply(original,subtle,args);}});
 try{const pending=f.verify(digest,r);r.signature='A'.repeat(86);r.payloadSha256='b'.repeat(64);release();assert.equal((await pending).status,'verified');}
 finally{release();if(descriptor)Object.defineProperty(subtle,'importKey',descriptor);else Reflect.deleteProperty(subtle,'importKey');}
});
test('retained public production-key preflight receipt verifies without the private key',async()=>{
 const fs=await import('node:fs/promises'),record=JSON.parse(await fs.readFile(new URL('./fixtures/evidence-issuer/public-preflight.json',import.meta.url),'utf8'));
 assert.equal((await verifyEvidenceIssuerReceipt(record.digest,record.receipt)).status,'verified');assert.equal(record.privateKeyPersisted,false);assert.equal(JSON.stringify(record).includes('privatePkcs8'),false);
});
