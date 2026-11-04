import {parse,type DefaultTreeAdapterTypes} from "parse5";
import {DomainError} from "./domain.ts";
import {assertStaticPath} from "./static-resources.ts";

/** Only opaque local byte hashes are submitted. JavaScript is neither uploaded
 * as executable source nor evaluated by this module or the saved-page preview. */
export const DELIVERY_ARTIFACT_LIMITS={maxFiles:32,fileBytes:2*1024*1024,totalBytes:8*1024*1024,history:8}as const;
export type DeliveryArtifactFile={file:string;bytes:number;sha256:string};
export type DeliveryArtifactManifest={version:1;id:string;projectId:string;deliveryId:string;deliveryDigest:string;createdAt:string;files:DeliveryArtifactFile[];manifestDigest:string};
export type DeliveryArtifactCoverage={from:string;reference:string;target?:string;state:"declared"|"missing"|"unavailable";reason?:"inline_script"|"unsupported_reference"|"base_element"|"source_complexity"};
const HASH=/^[a-f0-9]{64}$/u,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const encoder=new TextEncoder();
export function artifactCanonical(value:unknown):string{if(Array.isArray(value))return`[${value.map(artifactCanonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${artifactCanonical((value as Record<string,unknown>)[key])}`).join(",")}}`;return JSON.stringify(value);}
export async function artifactSha(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes))),b=>b.toString(16).padStart(2,"0")).join("");}
function object(value:unknown,keys:string[]):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new DomainError("Artifact metadata requires plain JSON.");if(Reflect.ownKeys(value).some(key=>typeof key!=="string"||!keys.includes(key)||!("value"in Object.getOwnPropertyDescriptor(value,key)!))||keys.some(key=>!Object.hasOwn(value,key)))throw new DomainError("Artifact metadata has unsupported or missing fields.");return value as Record<string,unknown>;}
function identity(value:unknown){if(typeof value!=="string"||!value.trim()||value.length>200||/[\s\u0000-\u001f\u007f]/u.test(value))throw new DomainError("Artifact identity is invalid.");return value;}
export function artifactPath(value:unknown){const file=assertStaticPath(value);if(!/\.(?:m?js)$/iu.test(file))throw new DomainError("Only bounded JS/MJS build artifacts are supported.");return file;}
export function validateDeliveryArtifactFiles(value:unknown):DeliveryArtifactFile[]{
 if(!Array.isArray(value)||!value.length||value.length>DELIVERY_ARTIFACT_LIMITS.maxFiles)throw new DomainError("Choose1–32 JavaScript build artifacts.");let total=0;
 const files=value.map(raw=>{const f=object(raw,["file","bytes","sha256"]),file=artifactPath(f.file);if(!Number.isSafeInteger(f.bytes)||Number(f.bytes)<1||Number(f.bytes)>DELIVERY_ARTIFACT_LIMITS.fileBytes||typeof f.sha256!=="string"||!HASH.test(f.sha256))throw new DomainError("Artifact byte length or SHA-256 is invalid.");total+=Number(f.bytes);return{file,bytes:Number(f.bytes),sha256:f.sha256};});
 if(total>DELIVERY_ARTIFACT_LIMITS.totalBytes||new Set(files.map(f=>f.file.toLowerCase())).size!==files.length)throw new DomainError("Artifacts exceed8MiB or contain duplicate/case-conflicting paths.");return files.sort((a,b)=>a.file.localeCompare(b.file,"en"));
}
export async function createDeliveryArtifactManifest(input:{projectId:string;deliveryId:string;deliveryDigest:string;files:unknown},options:{id?:string;at?:string}={}):Promise<DeliveryArtifactManifest>{
 const data={version:1 as const,id:options.id??crypto.randomUUID(),projectId:identity(input.projectId),deliveryId:identity(input.deliveryId),deliveryDigest:input.deliveryDigest,createdAt:options.at??new Date().toISOString(),files:validateDeliveryArtifactFiles(input.files)};
 if(!HASH.test(data.deliveryDigest)||!UUID.test(data.id)||!Number.isFinite(Date.parse(data.createdAt))||new Date(data.createdAt).toISOString()!==data.createdAt)throw new DomainError("Artifact manifest binding or timestamp is invalid.");return{...data,manifestDigest:await artifactSha(encoder.encode(artifactCanonical(data)))};
}
export async function validateDeliveryArtifactManifest(value:unknown):Promise<DeliveryArtifactManifest>{
 const m=object(value,["version","id","projectId","deliveryId","deliveryDigest","createdAt","files","manifestDigest"]);if(m.version!==1||typeof m.manifestDigest!=="string"||!HASH.test(m.manifestDigest)||typeof m.id!=="string"||typeof m.createdAt!=="string"||typeof m.deliveryDigest!=="string")throw new DomainError("Saved artifact manifest is invalid.",409);
 const expected=await createDeliveryArtifactManifest({projectId:identity(m.projectId),deliveryId:identity(m.deliveryId),deliveryDigest:m.deliveryDigest,files:m.files},{id:m.id,at:m.createdAt});if(expected.manifestDigest!==m.manifestDigest||artifactCanonical(expected.files)!==artifactCanonical(m.files))throw new DomainError("Saved artifact manifest changed.",409);return expected;
}
export type BrowserArtifactFile={name:string;size:number;webkitRelativePath?:string;arrayBuffer:()=>Promise<ArrayBuffer>};
export async function hashLocalDeliveryArtifacts(selected:BrowserArtifactFile[]):Promise<DeliveryArtifactFile[]>{
 if(!selected.length||selected.length>DELIVERY_ARTIFACT_LIMITS.maxFiles)throw new DomainError("Choose1–32 JavaScript build artifacts.");const roots=new Set(selected.filter(f=>f.webkitRelativePath).map(f=>f.webkitRelativePath!.split("/")[0]));if(roots.size>1||roots.size&&selected.some(f=>!f.webkitRelativePath))throw new DomainError("Choose one folder or individual artifact files, not both.");
 const files:DeliveryArtifactFile[]=[];let total=0;for(const f of selected){const file=artifactPath(f.webkitRelativePath?f.webkitRelativePath.slice(f.webkitRelativePath.indexOf("/")+1):f.name);if(!Number.isSafeInteger(f.size)||f.size<1||f.size>DELIVERY_ARTIFACT_LIMITS.fileBytes||total+f.size>DELIVERY_ARTIFACT_LIMITS.totalBytes)throw new DomainError("Artifact files exceed their2MiB/8MiB limits.");const bytes=new Uint8Array(await f.arrayBuffer());if(bytes.length!==f.size)throw new DomainError("An artifact changed while its bytes were read.");total+=bytes.length;files.push({file,bytes:bytes.length,sha256:await artifactSha(bytes)});}return validateDeliveryArtifactFiles(files);
}
function relativeScript(from:string,reference:string):string|undefined{
 if(!reference||reference!==reference.trim()||/[\\%?#]/u.test(reference)||/^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(reference))return;
 const parts=from.split("/").slice(0,-1);for(const part of reference.split("/")){if(part===".")continue;if(part===".."){if(!parts.length)return;parts.pop();}else if(!part)return;else parts.push(part);}try{return artifactPath(parts.join("/"));}catch{return;}
}
/** Direct HTML script references only. This does not parse JS imports, prove a
 * complete dependency graph or assert that seller runtime behavior is genuine. */
export function deliveryArtifactCoverage(files:Record<string,string>,manifest?:Pick<DeliveryArtifactManifest,"files">):DeliveryArtifactCoverage[]{
 const rows:DeliveryArtifactCoverage[]=[];for(const [from,source]of Object.entries(files).filter(([name])=>/\.html$/iu.test(name))){
  const doc=parse(source),pending:DefaultTreeAdapterTypes.Node[]=[doc];let visited=0,hasBase=false;const scripts:DefaultTreeAdapterTypes.Element[]=[];
  while(pending.length){const node=pending.pop()!;if(++visited>20000){rows.push({from,reference:"(bounded HTML traversal)",state:"unavailable",reason:"source_complexity"});break;}if("tagName"in node){if(node.tagName==="base"&&node.attrs.some(a=>a.name==="href"))hasBase=true;if(node.tagName==="script")scripts.push(node);}if("childNodes"in node)pending.push(...node.childNodes);}
  for(const script of scripts){const type=script.attrs.find(a=>a.name==="type")?.value.trim().toLowerCase()??"";if(!["","module","text/javascript","application/javascript","text/ecmascript","application/ecmascript"].includes(type))continue;const src=script.attrs.find(a=>a.name==="src")?.value;if(src===undefined){if(script.childNodes.some(n=>n.nodeName==="#text"&&(n as DefaultTreeAdapterTypes.TextNode).value.trim()))rows.push({from,reference:"(inline JavaScript)",state:"unavailable",reason:"inline_script"});continue;}const target=relativeScript(from,src);if(hasBase||!target){rows.push({from,reference:src,state:"unavailable",reason:hasBase?"base_element":"unsupported_reference"});continue;}rows.push({from,reference:src,target,state:manifest?.files.some(f=>f.file===target)?"declared":"missing"});}
 }
 if(rows.length>200)return [...rows.slice(0,199),{from:rows[199].from,reference:"(additional references beyond the200-row report limit)",state:"unavailable",reason:"source_complexity"}];return rows;
}
