import {AssessmentResponseError} from "./assessment-response.ts";

const REQUIRED = ["title", "explanation", "suggestion", "citations"] as const;
const fail = ():never => {throw new AssessmentResponseError("risk_fields");};

/** A narrow compatibility rule for provider annotations with no value. Every
 * required field must be an own data property. Never supplies a missing value,
 * discards a risk, accepts non-null extras or executes a property accessor. The
 * caller still validates every required value, size and source quotation. */
export function canonicalAssessmentRisk(value:unknown):{fields:Record<string,unknown>;ignoredNullFields:number}{
 if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail();
 const keys=Reflect.ownKeys(value);
 if(keys.length>REQUIRED.length+2||keys.some(key=>typeof key!=="string"))return fail();
 const fields:Record<string,unknown>={};
 for(const key of REQUIRED){
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!Object.hasOwn(value,key)||!descriptor||!("value" in descriptor))return fail();
  fields[key]=descriptor.value;
 }
 let ignoredNullFields=0;
 for(const key of keys){
  if(REQUIRED.includes(key as typeof REQUIRED[number]))continue;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(!descriptor||!("value" in descriptor)||descriptor.value!==null)return fail();
  ignoredNullFields++;
 }
 return{fields,ignoredNullFields};
}
