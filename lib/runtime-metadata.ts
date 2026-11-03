import type {RuntimeCheckPlan} from "./runtime-checks.ts";
import type {RuntimeRegistrationSnapshot} from "./runtime-registration.ts";

export const RUNTIME_METADATA_FIELDS = ["metadata", "revision", "protocol", "projectId", "registrationRevision", "frontendBundleDigest", "backendArtifactDigest", "backendSourceCommit"] as const;
export type RuntimeMetadataField = typeof RUNTIME_METADATA_FIELDS[number];
export type RuntimeMetadataDiagnosis = {matches:boolean;missing:RuntimeMetadataField[];mismatch:RuntimeMetadataField[];malformed:RuntimeMetadataField[]};
export type RuntimeMetadataExpected = {revision:string;protocol:RuntimeCheckPlan["protocol"]|"booking-http-v3";registration?:RuntimeRegistrationSnapshot};

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

function valid(field:RuntimeMetadataField,value:unknown):boolean {
  if(typeof value!=="string")return false;
  if(field==="revision")return value.length>0&&value.length<=120&&value===value.trim()&&!CONTROL.test(value);
  if(field==="protocol")return value==="booking-http-v1"||value==="booking-http-v2"||value==="booking-http-v3";
  if(field==="projectId"||field==="registrationRevision")return IDENTIFIER.test(value);
  if(field==="backendSourceCommit")return COMMIT.test(value);
  return DIGEST.test(value);
}

/** Diagnose only the required public association fields. Unknown keys and all
 * response values are discarded; no caller getters are evaluated. A valid
 * declaration is not deployment attestation or a booking-behaviour result.
 * Legacy v1 metadata requires revision only, preserving its existing contract. */
export function diagnoseRuntimeMetadata(value:unknown,expected:RuntimeMetadataExpected):RuntimeMetadataDiagnosis {
  const result:RuntimeMetadataDiagnosis={matches:false,missing:[],mismatch:[],malformed:[]};
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype){result.malformed.push("metadata");return result;}
  const fields:[Exclude<RuntimeMetadataField,"metadata">,string][]=[["revision",expected.revision]];
  if(expected.protocol!=="booking-http-v1")fields.push(["protocol",expected.protocol]);
  const registration=expected.registration;
  if(registration){
    fields.push(["projectId",registration.projectId],["registrationRevision",registration.registrationRevision],["frontendBundleDigest",registration.frontendBundleDigest]);
    if(registration.backendArtifactDigest!==undefined)fields.push(["backendArtifactDigest",registration.backendArtifactDigest]);
    if(registration.backendSourceCommit!==undefined)fields.push(["backendSourceCommit",registration.backendSourceCommit]);
  }
  for(const[field,wanted]of fields){
    const descriptor=Object.getOwnPropertyDescriptor(value,field);
    if(!descriptor)result.missing.push(field);
    else if(!("value"in descriptor)||!valid(field,descriptor.value))result.malformed.push(field);
    else if(descriptor.value!==wanted)result.mismatch.push(field);
  }
  result.matches=result.missing.length+result.mismatch.length+result.malformed.length===0;
  return result;
}
