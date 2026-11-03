import {EVIDENCE_EXPORT_BYTE_LIMIT, verifyEvidenceExport, type EvidenceExport, type EvidenceVerification} from "../../lib/evidence-export.ts";
import type {RuntimeCheckReport} from "../../lib/runtime-checks.ts";

export type EvidenceInput = {name?:string;size:number;arrayBuffer:()=>Promise<ArrayBuffer>};
export type EvidenceViewerError = "too_large"|"invalid_utf8"|"invalid_json"|"read_failed"|"verification_failed";
export type EvidenceViewerState =
  | {phase:"empty"}
  | {phase:"checking";label:string;recorded:boolean}
  | {phase:"error";label:string;recorded:boolean;error:EvidenceViewerError}
  | {phase:"ready";label:string;recorded:boolean;verification:EvidenceVerification;packet?:EvidenceExport};
export type RuntimeViewerEvidence={state:"unavailable"}|{state:"missing"}|{state:"pending";previousReport?:RuntimeCheckReport}|{state:"recorded";report:RuntimeCheckReport};

/** A retained older report must not stand in for an unfinished run. */
export function runtimeEvidenceForViewer(state:EvidenceViewerState):RuntimeViewerEvidence {
  if(state.phase!=="ready"||!state.packet||!state.verification.checks.some(row=>row.id==="runtime-bindings"&&row.status==="consistent"))return{state:"unavailable"};
  const delivery=state.packet.delivery;
  if(delivery.runtimeRun)return{state:"pending",...(delivery.runtimeReport?{previousReport:delivery.runtimeReport}:{})};
  return delivery.runtimeReport?{state:"recorded",report:delivery.runtimeReport}:{state:"missing"};
}

class InputError extends Error {readonly code:EvidenceViewerError;constructor(code:EvidenceViewerError){super(code);this.code=code;}}
const labelFor=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/gu,"").slice(0,160)||"evidence.json";

/** Parse bounded bytes as data. This never fetches, evaluates source, opens a
 * URL, reads environment configuration or sends a selected file anywhere. */
export function parseEvidenceBytes(bytes:ArrayBuffer):unknown {
  if(bytes.byteLength>EVIDENCE_EXPORT_BYTE_LIMIT)throw new InputError("too_large");
  let text:string;
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{throw new InputError("invalid_utf8");}
  try{return JSON.parse(text);}catch{throw new InputError("invalid_json");}
}

/** Only a structurally checked envelope is exposed to the text-only view. A
 * failed gate remains visible; it never becomes an acceptance or payment. */
function checkedPacket(value:unknown,report:EvidenceVerification):EvidenceExport|undefined {
  return report.checks.some(row=>row.id==="structure"&&row.status==="consistent")?value as EvidenceExport:undefined;
}

/** Latest selection wins across file reads and async digests. Reset revokes
 * every in-flight result, including a late failure from an earlier input. */
export function createEvidenceViewerController(
  onChange:(state:EvidenceViewerState)=>void=()=>{},
  verifier:(value:unknown)=>Promise<EvidenceVerification>=verifyEvidenceExport,
) {
  let generation=0,state:EvidenceViewerState={phase:"empty"};
  const publish=(next:EvidenceViewerState)=>{state=next;onChange(next);};
  const begin=(name:string,recorded:boolean)=>{const token=++generation,label=labelFor(name);publish({phase:"checking",label,recorded});return{token,label,recorded};};
  const failed=(context:ReturnType<typeof begin>,error:EvidenceViewerError)=>{if(context.token===generation)publish({phase:"error",label:context.label,recorded:context.recorded,error});};
  async function check(value:unknown,context:ReturnType<typeof begin>) {
    if(context.token!==generation)return;
    try{
      const verification=await verifier(value);
      if(context.token!==generation)return;
      const packet=checkedPacket(value,verification);
      publish({phase:"ready",label:context.label,recorded:context.recorded,verification,...(packet?{packet}:{})});
    }catch{failed(context,"verification_failed");}
  }
  return {
    getState:()=>state,
    reset(){generation++;publish({phase:"empty"});},
    async openFile(file:EvidenceInput){
      const context=begin(file.name??"evidence.json",false);
      if(!Number.isSafeInteger(file.size)||file.size<0||file.size>EVIDENCE_EXPORT_BYTE_LIMIT){failed(context,"too_large");return;}
      try{const bytes=await file.arrayBuffer();if(context.token!==generation)return;await check(parseEvidenceBytes(bytes),context);}
      catch(error){failed(context,error instanceof InputError?error.code:"read_failed");}
    },
    async openRecorded(value:unknown,name:string){
      const context=begin(name,true);
      // The shipped synthetic objects are copied before hashing; later caller
      // changes cannot mix another sample into this result.
      try{await check(structuredClone(value),context);}catch{failed(context,"verification_failed");}
    },
  };
}
