import {assertEvidenceBundleBudget,evidenceBundleSha256,verifyEvidenceBundle,type EvidenceBundle} from "./evidence-bundle.ts";
import {EVIDENCE_EXPORT_SCHEMA,type EvidenceExport,type EvidenceVerification} from "./evidence-export.ts";
import type {ProofDeliveryVersion,ProofQuote} from "./contracts.ts";

export const REVISION_AUDIT_SCHEMA="proofbeforepay-revision-audit-v1";
export const REVISION_AUDIT_RULES="pbp-selected-revisions-v1";
export const REVISION_AUDIT_VERSION_LIMIT=5;
export type RevisionAuditEvidence=EvidenceBundle|EvidenceExport;
export type RevisionAuditScope="current-full"|"archived-core";
export type RevisionAuditInput={retainedAt:string;isCurrent:boolean;scope:RevisionAuditScope;evidence:RevisionAuditEvidence};
export type RevisionAuditFile={file:string;bytes:number;sha256:string};
export type RevisionAuditEntry=RevisionAuditInput&{deliveryId:string;sequence:number;evidenceSha256:string;fileDigest:string;files:RevisionAuditFile[]};
export type RevisionAuditDifference={fromDeliveryId:string;toDeliveryId:string;fromSequence:number;toSequence:number;added:string[];removed:string[];changed:string[];unchanged:string[]};
const LIMITS={selectedVersionsOnly:true,historicalSupplementalEvidence:"not-included",historicalQuoteLevelFinancialConsent:"not-included",historicalQuoteLevelRepairEvents:"not-included",authenticity:"not-proven",execution:"not-reexecuted",networkRequests:0}as const;
export type RevisionAudit={schema:typeof REVISION_AUDIT_SCHEMA;verificationRules:typeof REVISION_AUDIT_RULES;scope:"selected-delivery-revisions";project:{id:string;reference:string;title:string};versions:RevisionAuditEntry[];differences:RevisionAuditDifference[];limits:typeof LIMITS};
export type RevisionAuditVerification={schema:"proofbeforepay-revision-audit-verification-v1";consistency:"consistent"|"inconsistent"|"unsupported";checks:{id:string;status:"consistent"|"inconsistent";message:string}[];versions:{deliveryId:string;sequence:number;scope:RevisionAuditScope;verification:EvidenceVerification}[];limits:typeof LIMITS};
const encoder=new TextEncoder();
const core=(e:RevisionAuditEvidence)=>e.schema===EVIDENCE_EXPORT_SCHEMA?e:e.core;
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==="object"?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`:JSON.stringify(value);
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
function demand(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function exact(value:unknown,keys:string[]){demand(value&&typeof value==="object"&&!Array.isArray(value),"Expected a revision audit object.");const row=value as Record<string,unknown>;demand(Object.keys(row).length===keys.length&&keys.every(k=>Object.hasOwn(row,k)),"Incomplete or unsupported revision audit fields.");return row;}
const identity=(value:unknown)=>typeof value==="string"&&value.length>0&&value.length<=100&&!/[\u0000-\u001f\u007f]/u.test(value);
const validTime=(value:unknown)=>typeof value==="string"&&value.length<=40&&Number.isFinite(Date.parse(value));
function sequence(e:RevisionAuditEvidence){const value=core(e).delivery.sequence;demand(Number.isSafeInteger(value)&&Number(value)>0,"Every revision needs its persisted positive sequence number.");return value as number;}
async function filesFor(e:RevisionAuditEvidence):Promise<RevisionAuditFile[]>{const files=core(e).delivery.files;demand(files&&Object.keys(files).length,"Exact retained source files are required for every selected revision.");return Promise.all(Object.keys(files).sort().map(async file=>{const text=files[file];demand(typeof text==="string","Retained source must be a string.");const bytes=encoder.encode(text);return{file,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("")};}));}
function differences(versions:RevisionAuditEntry[]):RevisionAuditDifference[]{return versions.slice(1).map((v,index)=>{const old=versions[index],before=new Map(old.files.map(f=>[f.file,f.sha256])),after=new Map(v.files.map(f=>[f.file,f.sha256])),names=[...new Set([...before.keys(),...after.keys()])].sort(),added:string[]=[],removed:string[]=[],changed:string[]=[],unchanged:string[]=[];for(const name of names){if(!before.has(name))added.push(name);else if(!after.has(name))removed.push(name);else if(before.get(name)!==after.get(name))changed.push(name);else unchanged.push(name);}return{fromDeliveryId:old.deliveryId,toDeliveryId:v.deliveryId,fromSequence:old.sequence,toSequence:v.sequence,added,removed,changed,unchanged};});}
function inputs(value:unknown):RevisionAuditInput[]{
 demand(Array.isArray(value)&&value.length>=2&&value.length<=REVISION_AUDIT_VERSION_LIMIT,"Choose two to five retained delivery revisions.");
 const ids=new Set<string>();let last=0;const first=core((value[0] as RevisionAuditInput).evidence);
 for(const raw of value){const row=exact(raw,["retainedAt","isCurrent","scope","evidence"]),entry=row as unknown as RevisionAuditInput,c=core(entry.evidence),n=sequence(entry.evidence);demand(validTime(entry.retainedAt)&&typeof entry.isCurrent==="boolean"&&["current-full","archived-core"].includes(entry.scope),"Invalid revision metadata.");demand(identity(c.delivery.id)&&!ids.has(c.delivery.id)&&Number.isSafeInteger(n)&&n>last,"Selected revisions need unique identities and increasing saved sequence numbers.");ids.add(c.delivery.id);last=n;demand(same(c.project,first.project),"Every selected revision must retain the same locked project, criteria and original source.");demand(entry.scope==="current-full"?entry.isCurrent&&entry.evidence.schema!==EVIDENCE_EXPORT_SCHEMA:!entry.isCurrent&&entry.evidence.schema===EVIDENCE_EXPORT_SCHEMA,"Revision scope does not match its retained evidence format.");}
 demand(value.filter(v=>(v as RevisionAuditInput).isCurrent).length===1&&(value.at(-1)as RevisionAuditInput).isCurrent,"The exact current delivery must be the final selected revision.");return value as RevisionAuditInput[];
}

/** Keeps the original archived delivery and report objects. Quote-level state
 * was not stored by proof_versions and is deliberately not reconstructed. */
export function archivedRevisionQuote(quote:ProofQuote,snapshot:ProofDeliveryVersion):ProofQuote{
 assertEvidenceBundleBudget({quote,snapshot});const copy=structuredClone(quote),version=structuredClone(snapshot);demand(!version.isCurrent&&version.delivery.files&&Object.keys(version.delivery.files).length,"A full retained archived source snapshot is required.");
 copy.proof.delivery=version.delivery;delete copy.proof.delivery.supplementalCatalog;delete copy.proof.delivery.supplementalDecision;for(const acceptance of copy.proof.delivery.acceptanceEvidence??[])delete acceptance.supplementalDecision;
 copy.proof.review=version.review;delete copy.proof.acceptedDeliveryId;delete copy.proof.acceptedEvidenceSnapshotId;
 if(copy.proof.collaboration){delete copy.proof.collaboration.acceptance;copy.proof.collaboration.feedback=version.feedback;copy.proof.collaboration.submission=version.submission;delete copy.proof.collaboration.riskRepairEvents;}
 return copy;
}

/** No network, source execution, inferred repair verdict or historical metadata
 * retrofit. The caller must supply each exact retained evidence object. */
export async function createRevisionAudit(input:{versions:RevisionAuditInput[]}):Promise<RevisionAudit>{
 assertEvidenceBundleBudget(input);const captured=structuredClone(input);exact(captured,["versions"]);const rows=inputs(captured.versions),versions:RevisionAuditEntry[]=[];
 for(const row of rows){const verification=await verifyEvidenceBundle(row.evidence);demand(verification.consistency==="consistent","A selected revision cannot be independently replayed; no revision was omitted or rebuilt.");const c=core(row.evidence);versions.push({...row,deliveryId:c.delivery.id,sequence:sequence(row.evidence),evidenceSha256:await evidenceBundleSha256(row.evidence),fileDigest:c.fileDigest,files:await filesFor(row.evidence)});}
 const c=core(rows[0].evidence),result:RevisionAudit={schema:REVISION_AUDIT_SCHEMA,verificationRules:REVISION_AUDIT_RULES,scope:"selected-delivery-revisions",project:{id:c.project.id,reference:c.project.reference,title:c.project.title},versions,differences:differences(versions),limits:{...LIMITS}};assertEvidenceBundleBudget(result);return result;
}
/** Stable canonical digest of the entire bounded unsigned audit. An external
 * issuer receipt may sign this digest; an embedded key is not trusted here. */
export async function revisionAuditDigest(value:RevisionAudit){return evidenceBundleSha256(value);}

export async function verifyRevisionAudit(input:unknown):Promise<RevisionAuditVerification>{
 const result:RevisionAuditVerification={schema:"proofbeforepay-revision-audit-verification-v1",consistency:"consistent",checks:[],versions:[],limits:{...LIMITS}};
 const check=async(id:string,action:()=>void|Promise<void>,message:string)=>{try{await action();result.checks.push({id,status:"consistent",message});return true;}catch{result.consistency="inconsistent";result.checks.push({id,status:"inconsistent",message:`${id} could not be established; no revision or missing source was reconstructed.`});return false;}};
 // The validation and capture must both finish before the first await. Even
 // awaiting a synchronous validation helper would let a caller insert getters.
 let audit:RevisionAudit;
 try{assertEvidenceBundleBudget(input);audit=structuredClone(input)as RevisionAudit;result.checks.push({id:"bounded-json",status:"consistent",message:"The whole selected-revision audit is bounded plain JSON within 8 MiB."});}
 catch{result.consistency="inconsistent";result.checks.push({id:"bounded-json",status:"inconsistent",message:"The input is not bounded plain JSON. No revision was omitted or reconstructed."});return result;}
 if(!audit||typeof audit!=="object"||audit.schema!==REVISION_AUDIT_SCHEMA||audit.verificationRules!==REVISION_AUDIT_RULES){result.consistency="unsupported";result.checks.push({id:"schema",status:"inconsistent",message:"Unsupported revision audit schema or named rules."});return result;}
 if(!await check("revision-inventory",()=>{exact(audit,["schema","verificationRules","scope","project","versions","differences","limits"]);demand(audit.scope==="selected-delivery-revisions"&&same(audit.limits,LIMITS),"Invalid audit scope or limitations.");demand(Array.isArray(audit.versions),"Revision inventory is required.");for(const row of audit.versions)exact(row,["retainedAt","isCurrent","scope","evidence","deliveryId","sequence","evidenceSha256","fileDigest","files"]);const rows=inputs(audit.versions.map(({retainedAt,isCurrent,scope,evidence})=>({retainedAt,isCurrent,scope,evidence})));const c=core(rows[0].evidence);demand(same(audit.project,{id:c.project.id,reference:c.project.reference,title:c.project.title}),"Project descriptor differs from the exact evidence.");for(const v of audit.versions){demand(v.deliveryId===core(v.evidence).delivery.id&&v.sequence===sequence(v.evidence),"Declared revision identity differs from its source record.");}},"Two to five unique saved sequences share the exact locked project; the current revision is last."))return result;
 for(const v of audit.versions){const verification=await verifyEvidenceBundle(v.evidence);result.versions.push({deliveryId:v.deliveryId,sequence:v.sequence,scope:v.scope,verification});if(verification.consistency!=="consistent")result.consistency="inconsistent";}
 await check("revision-source-and-record-digests",async()=>{for(const v of audit.versions){demand(v.evidenceSha256===await evidenceBundleSha256(v.evidence)&&v.fileDigest===core(v.evidence).fileDigest&&same(v.files,await filesFor(v.evidence)),"Revision files or record digests changed.");}},"Every full retained file and evidence record matches its own exact digest; no authenticity is inferred.");
 await check("revision-file-differences",()=>demand(same(audit.differences,differences(audit.versions)),"Declared differences do not match the retained file inventories."),"Added, removed, changed and unchanged paths are recomputed between adjacent selected revisions; this does not declare a repair successful.");
 return result;
}
