import {assertEvidenceBundleBudget} from "./evidence-bundle.ts";
import {verifyRevisionAudit,revisionAuditDigest,type RevisionAudit,type RevisionAuditVerification} from "./revision-audit.ts";
import {signEvidenceDigest,verifyEvidenceIssuerReceipt,type EvidenceIssuerReceipt,type EvidenceIssuerVerification} from "./evidence-issuer.ts";

export const ISSUED_REVISION_AUDIT_SCHEMA="proofbeforepay-issued-revision-audit-v1";
export type IssuedRevisionAudit={schema:typeof ISSUED_REVISION_AUDIT_SCHEMA;audit:RevisionAudit;receipt:EvidenceIssuerReceipt};
export type IssuedRevisionAuditVerification=Omit<RevisionAuditVerification,"schema">&{schema:"proofbeforepay-issued-revision-audit-verification-v1";issuance:EvidenceIssuerVerification;audit?:RevisionAudit};
function envelope(value:unknown):asserts value is IssuedRevisionAudit{
 assertEvidenceBundleBudget(value);
 const row=value as IssuedRevisionAudit;
 if(!row||typeof row!=="object"||Array.isArray(row)||Object.keys(row).sort().join("|")!=="audit|receipt|schema"||row.schema!==ISSUED_REVISION_AUDIT_SCHEMA)throw Error("Invalid issued audit envelope.");
}
/** Verify a captured plain-data envelope. Failed receipt validation is never
 * retried as unsigned evidence. Official callers use the pinned-key verifier. */
export function createIssuedRevisionAuditVerifier(receiptVerifier=verifyEvidenceIssuerReceipt){
 return async(value:unknown):Promise<IssuedRevisionAuditVerification>=>{
  let captured:IssuedRevisionAudit;
  try{envelope(value);captured=structuredClone(value);}catch{
   const base=await verifyRevisionAudit(null);
   return {...base,schema:"proofbeforepay-issued-revision-audit-verification-v1",consistency:"inconsistent",issuance:{status:"invalid",reason:"invalid_receipt"},checks:[{id:"issuer-envelope",status:"inconsistent",message:"The issued audit envelope is missing, malformed or outside its complete budget. No unsigned fallback was used."}]};
  }
  const base=await verifyRevisionAudit(captured.audit);
  const issuance=base.consistency==="consistent"?await receiptVerifier(await revisionAuditDigest(captured.audit),captured.receipt):{status:"invalid",reason:"audit_inconsistent"} as EvidenceIssuerVerification;
  const valid=base.consistency==="consistent"&&issuance.status==="verified";
  return {...base,schema:"proofbeforepay-issued-revision-audit-verification-v1",consistency:valid?"consistent":"inconsistent",issuance,
   checks:[...base.checks,{id:"issuer-receipt",status:valid?"consistent":"inconsistent",message:valid
    ?"The source-pinned public key verifies that the official application issued these exact selected revision bytes. This does not establish the truth of model advice, backend execution, human identity or payment."
    :"The official application signature or its exact payload binding could not be established. This signed envelope was not treated as unsigned evidence."}],
   ...(valid?{audit:captured.audit}:{})};
 };
}
export const verifyIssuedRevisionAudit=createIssuedRevisionAuditVerifier();

/** Server route supplies the existing Site secret after authorized, consistent
 * store reads. Clone before awaiting; don't sign a changing caller object. */
export async function issueRevisionAudit(value:RevisionAudit,privatePkcs8:string|undefined):Promise<IssuedRevisionAudit>{
 assertEvidenceBundleBudget(value);const audit=structuredClone(value);
 if((await verifyRevisionAudit(audit)).consistency!=="consistent")throw Error("The complete revision audit is inconsistent; no issuer receipt was produced.");
 const receipt=await signEvidenceDigest(await revisionAuditDigest(audit),privatePkcs8),result={schema:ISSUED_REVISION_AUDIT_SCHEMA,audit,receipt} as const;
 envelope(result);return result;
}
