import {EVIDENCE_ISSUER_KEYS,EVIDENCE_ISSUER_KEY_ID,EVIDENCE_ISSUER_ORIGIN} from "./evidence-issuer-keys.ts";

export const EVIDENCE_ISSUER_RECEIPT_SCHEMA="pbp-evidence-issuer-receipt-v1";
export type EvidenceIssuerReceipt={schema:typeof EVIDENCE_ISSUER_RECEIPT_SCHEMA;keyId:string;issuer:string;issuedAt:string;payloadSha256:string;signature:string};
export type EvidenceIssuerVerification={status:"verified"|"invalid";reason:"pinned_issuer_signature"|"invalid_receipt"|"unknown_key"|"digest_mismatch"|"signature_invalid"|"crypto_unavailable"|"audit_inconsistent";keyId?:string;issuer?:string;issuedAt?:string};
const SHA=/^[a-f0-9]{64}$/u;
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const encode=(b:ArrayBuffer)=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/gu,"-").replace(/\//gu,"_").replace(/=+$/u,"");
function receiptData(value:unknown):value is EvidenceIssuerReceipt{
  if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const keys=["schema","keyId","issuer","issuedAt","payloadSha256","signature"];
  if(Reflect.ownKeys(value).length!==keys.length)return false;
  for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=="string"||!keys.includes(key)||!("value" in d)||!d.enumerable||typeof d.value!=="string"||d.value.length>200)return false;}
  const r=value as EvidenceIssuerReceipt;
  return r.schema===EVIDENCE_ISSUER_RECEIPT_SCHEMA&&/^[a-zA-Z0-9_-]{1,80}$/u.test(r.keyId)&&r.issuer===EVIDENCE_ISSUER_ORIGIN
    &&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(r.issuedAt)&&Number.isFinite(Date.parse(r.issuedAt))&&new Date(r.issuedAt).toISOString()===r.issuedAt
    &&SHA.test(r.payloadSha256)&&/^[A-Za-z0-9_-]{86}$/u.test(r.signature);
}
function message(r:Omit<EvidenceIssuerReceipt,"signature">):Uint8Array<ArrayBuffer>{
  return new TextEncoder().encode(JSON.stringify({schema:r.schema,keyId:r.keyId,issuer:r.issuer,issuedAt:r.issuedAt,payloadSha256:r.payloadSha256}));
}

/** The key registry is trusted application configuration, never imported from
 * the evidence. The official entry point below always uses source-pinned keys.
 * Exposed seam lets tests use their own ephemeral keys without production secrets. */
export function createEvidenceIssuerVerifier(trustedKeys:Readonly<Record<string,string>>){
  const trusted={...trustedKeys};
  return async(digest:string,value:unknown):Promise<EvidenceIssuerVerification>=>{
    if(!SHA.test(digest)||!receiptData(value))return {status:"invalid",reason:"invalid_receipt"};
    const r={...value};
    if(!Object.hasOwn(trusted,r.keyId))return {status:"invalid",reason:"unknown_key"};
    if(r.payloadSha256!==digest)return {status:"invalid",reason:"digest_mismatch"};
    try{
      const key=await crypto.subtle.importKey("spki",bytes(trusted[r.keyId]),{name:"Ed25519"},false,["verify"]);
      const signature=bytes(r.signature.replace(/-/gu,"+").replace(/_/gu,"/")+"==");
      if(encode(signature.buffer)!==r.signature)return {status:"invalid",reason:"invalid_receipt"};
      if(!await crypto.subtle.verify("Ed25519",key,signature,message(r)))return {status:"invalid",reason:"signature_invalid"};
      return {status:"verified",reason:"pinned_issuer_signature",keyId:r.keyId,issuer:r.issuer,issuedAt:r.issuedAt};
    }catch{return {status:"invalid",reason:"crypto_unavailable"};}
  };
}
export const verifyEvidenceIssuerReceipt=createEvidenceIssuerVerifier(EVIDENCE_ISSUER_KEYS);

/** Server-only operation at call sites. Private key comes exclusively from the
 * Site secret; errors never echo it. Issuance proves the application's export,
 * not the factual truth of imported reports, customer identity or execution. */
export async function signEvidenceDigest(digest:string,privatePkcs8:string|undefined,issuedAt=new Date().toISOString()):Promise<EvidenceIssuerReceipt>{
  if(!SHA.test(digest)||!privatePkcs8||privatePkcs8.length>2000||!/^[A-Za-z0-9+/]+={0,2}$/u.test(privatePkcs8))throw new Error("Evidence issuance is not configured.");
  const header={schema:EVIDENCE_ISSUER_RECEIPT_SCHEMA,keyId:EVIDENCE_ISSUER_KEY_ID,issuer:EVIDENCE_ISSUER_ORIGIN,issuedAt,payloadSha256:digest} as const;
  let receipt:EvidenceIssuerReceipt;
  try{const key=await crypto.subtle.importKey("pkcs8",bytes(privatePkcs8),{name:"Ed25519"},false,["sign"]);receipt={...header,signature:encode(await crypto.subtle.sign("Ed25519",key,message(header)))};}
  catch{throw new Error("Evidence issuance is not configured.");}
  if((await verifyEvidenceIssuerReceipt(digest,receipt)).status!=="verified")throw new Error("Evidence issuance key does not match the published verifier.");
  return receipt;
}
