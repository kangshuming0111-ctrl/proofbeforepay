import {type EvidenceExport,type EvidenceVerification} from "../../lib/evidence-export.ts";
import {EVIDENCE_BUNDLE_BYTE_LIMIT,EVIDENCE_BUNDLE_SCHEMA,verifyEvidenceBundle,assertEvidenceBundleBudget,type EvidenceBundle} from "../../lib/evidence-bundle.ts";
import {ISSUED_REVISION_AUDIT_SCHEMA,verifyIssuedRevisionAudit,type IssuedRevisionAuditVerification} from "../../lib/issued-revision-audit.ts";
import type {EvidenceIssuerVerification} from "../../lib/evidence-issuer.ts";
import type {RevisionAudit} from "../../lib/revision-audit.ts";
import type {RuntimeCheckReport} from "../../lib/runtime-checks.ts";

export type EvidenceInput = {name?:string;size:number;arrayBuffer:()=>Promise<ArrayBuffer>};
export type EvidenceViewerError = "too_large"|"invalid_utf8"|"invalid_json"|"read_failed"|"verification_failed";
export type EvidenceViewerState =
  | {phase:"empty"}
  | {phase:"checking";label:string;recorded:boolean}
  | {phase:"error";label:string;recorded:boolean;error:EvidenceViewerError}
  | {phase:"ready";label:string;recorded:boolean;verification:EvidenceVerification|IssuedRevisionAuditVerification;issuance?:EvidenceIssuerVerification|{status:"unproven";reason:"unsigned_legacy"};revisionAudit?:RevisionAudit;packet?:EvidenceExport;supplemental?:EvidenceBundle["supplemental"];followups?:EvidenceBundle["followups"]};
export type RuntimeViewerEvidence={state:"unavailable"}|{state:"missing"}|{state:"pending";previousReport?:RuntimeCheckReport}|{state:"recorded";report:RuntimeCheckReport};
export function currentEvidenceChecks(state:EvidenceViewerState){
 if(state.phase!=="ready")return[];
 if(state.revisionAudit&&state.issuance?.status==="verified"&&state.verification.schema==="proofbeforepay-issued-revision-audit-verification-v1")return state.verification.versions.find(v=>v.deliveryId===state.packet?.delivery.id)?.verification.checks??[];
 return state.verification.checks;
}

/** A retained older report must not stand in for an unfinished run. */
export function runtimeEvidenceForViewer(state:EvidenceViewerState):RuntimeViewerEvidence {
  if(state.phase!=="ready"||!state.packet||!currentEvidenceChecks(state).some(row=>row.id==="runtime-bindings"&&row.status==="consistent"))return{state:"unavailable"};
  const delivery=state.packet.delivery;
  if(delivery.runtimeRun)return{state:"pending",...(delivery.runtimeReport?{previousReport:delivery.runtimeReport}:{})};
  return delivery.runtimeReport?{state:"recorded",report:delivery.runtimeReport}:{state:"missing"};
}

class InputError extends Error {readonly code:EvidenceViewerError;constructor(code:EvidenceViewerError){super(code);this.code=code;}}
const labelFor=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/gu,"").slice(0,160)||"evidence.json";

/** Parse bounded bytes as data. This never fetches, evaluates source, opens a
 * URL, reads environment configuration or sends a selected file anywhere. */
export function parseEvidenceBytes(bytes:ArrayBuffer):unknown {
  if(bytes.byteLength>EVIDENCE_BUNDLE_BYTE_LIMIT)throw new InputError("too_large");
  let text:string;
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{throw new InputError("invalid_utf8");}
  try{return JSON.parse(text);}catch{throw new InputError("invalid_json");}
}

/** Only a structurally checked envelope is exposed to the text-only view. A
 * failed gate remains visible; it never becomes an acceptance or payment. */
function checkedPacket(value:unknown,report:EvidenceVerification):EvidenceExport|undefined {
  if(!report.checks.some(row=>row.id==="structure"&&row.status==="consistent"))return undefined;
  return(value as {schema?:unknown}).schema===EVIDENCE_BUNDLE_SCHEMA?(value as EvidenceBundle).core:value as EvidenceExport;
}

/** Latest selection wins across file reads and async digests. Reset revokes
 * every in-flight result, including a late failure from an earlier input. */
export function createEvidenceViewerController(
  onChange:(state:EvidenceViewerState)=>void=()=>{},
  verifier:(value:unknown)=>Promise<EvidenceVerification>=verifyEvidenceBundle,
  issuedVerifier:(value:unknown)=>Promise<IssuedRevisionAuditVerification>=verifyIssuedRevisionAudit,
) {
  let generation=0,state:EvidenceViewerState={phase:"empty"};
  const publish=(next:EvidenceViewerState)=>{state=next;onChange(next);};
  const begin=(name:string,recorded:boolean)=>{const token=++generation,label=labelFor(name);publish({phase:"checking",label,recorded});return{token,label,recorded};};
  const failed=(context:ReturnType<typeof begin>,error:EvidenceViewerError)=>{if(context.token===generation)publish({phase:"error",label:context.label,recorded:context.recorded,error});};
  async function check(value:unknown,context:ReturnType<typeof begin>) {
    if(context.token!==generation)return;
    try{
      // Recognizable signed envelopes never fall back to unsigned verification,
      // including an envelope whose schema has been removed or overwritten.
      const row=value&&typeof value==="object"?value as Record<string,unknown>:undefined;
      if(row&&(row.schema===ISSUED_REVISION_AUDIT_SCHEMA||Object.hasOwn(row,"audit")||Object.hasOwn(row,"receipt"))){
        const verification=await issuedVerifier(value);if(context.token!==generation)return;
        const audit=verification.consistency==="consistent"&&verification.issuance.status==="verified"?verification.audit:undefined,current=audit?.versions.at(-1),evidence=current?.evidence;
        const packet=evidence?.schema===EVIDENCE_BUNDLE_SCHEMA?evidence.core:undefined;
        const checks=packet?verification.versions.find(v=>v.deliveryId===packet.delivery.id)?.verification.checks??[]:[];
        const supplemental=evidence?.schema===EVIDENCE_BUNDLE_SCHEMA&&checks.some(c=>c.id==="supplemental-catalog"&&c.status==="consistent")&&checks.some(c=>c.id==="supplemental-objects"&&c.status==="consistent")?evidence.supplemental:undefined;
        const followups=supplemental&&checks.some(c=>c.id==="followup-bindings"&&c.status==="consistent")&&evidence?.schema===EVIDENCE_BUNDLE_SCHEMA?evidence.followups:undefined;
        publish({phase:"ready",label:context.label,recorded:context.recorded,verification,issuance:verification.issuance,...(audit&&packet?{revisionAudit:audit,packet}:{}),...(supplemental?{supplemental}:{}),...(followups?{followups}:{})});return;
      }
      const verification=await verifier(value);
      if(context.token!==generation)return;
      const packet=checkedPacket(value,verification);
      const supplemental=(value as {schema?:unknown})?.schema===EVIDENCE_BUNDLE_SCHEMA&&verification.checks.some(row=>row.id==="supplemental-catalog"&&row.status==="consistent")&&(verification.checks.some(row=>row.id==="supplemental-objects"&&row.status==="consistent"))?(value as EvidenceBundle).supplemental:undefined;
      const followups=supplemental&&verification.checks.some(row=>row.id==="followup-bindings"&&row.status==="consistent")?(value as EvidenceBundle).followups:undefined;
      publish({phase:"ready",label:context.label,recorded:context.recorded,verification,issuance:{status:"unproven",reason:"unsigned_legacy"},...(packet?{packet}:{}),...(supplemental?{supplemental}:{}),...(followups?{followups}:{})});
    }catch{failed(context,"verification_failed");}
  }
  return {
    getState:()=>state,
    reset(){generation++;publish({phase:"empty"});},
    async openFile(file:EvidenceInput){
      const context=begin(file.name??"evidence.json",false);
      if(!Number.isSafeInteger(file.size)||file.size<0||file.size>EVIDENCE_BUNDLE_BYTE_LIMIT){failed(context,"too_large");return;}
      try{const bytes=await file.arrayBuffer();if(context.token!==generation)return;await check(parseEvidenceBytes(bytes),context);}
      catch(error){failed(context,error instanceof InputError?error.code:"read_failed");}
    },
    async openRecorded(value:unknown,name:string){
      const context=begin(name,true);
      // The shipped synthetic objects are copied before hashing; later caller
      // changes cannot mix another sample into this result.
      try{assertEvidenceBundleBudget(value);await check(structuredClone(value),context);}catch{failed(context,"verification_failed");}
    },
  };
}
