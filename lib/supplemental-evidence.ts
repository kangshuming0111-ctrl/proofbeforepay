import type {ProofQuote} from "./contracts.ts";
import {getModuleDependencyFindings} from "./module-dependencies.ts";
import {DomainError} from "./domain.ts";
import {validateStoredVisibilityReport,type SourceVisibilityReport} from "./source-visibility.ts";
import {validateDeploymentSourceSession,type DeploymentSourceSession} from "./deployment-source.ts";
import {validateTimeSession,validateTimePolicy,type TimePolicySession} from "./time-policy.ts";

export type SupplementalEvidenceFamily="source-visibility"|"deployment-source"|"time-policy";
export type SupplementalEvidenceRef={family:SupplementalEvidenceFamily;id:string;version:number;payloadSha256:string;deliveryId:string;deliveryDigest:string};
export type SupplementalEvidenceObject={ref:SupplementalEvidenceRef;record:SourceVisibilityReport|DeploymentSourceSession|TimePolicySession};
export type SupplementalEvidenceFinding={key:string;outcome:"supported"|"mismatch"|"unknown";label:string};
export type SupplementalEvidenceRow={ref:SupplementalEvidenceRef;planKey:string;status:string;findings:SupplementalEvidenceFinding[];summary:string;scope:string};
export type SupplementalCatalogContext={artifactManifest:{id:string;manifestDigest:string}|null;followupHeads?:{id:string;version:number;payloadSha256:string;status:"open"|"proposed"|"resolved"}[]};
export type SupplementalEvidenceCatalog={version:1;deliveryId:string;deliveryDigest:string;catalogDigest:string;context:SupplementalCatalogContext;rows:SupplementalEvidenceRow[]};
export type SupplementalEvidenceDecision={version:1;deliveryId:string;deliveryDigest:string;catalogDigest:string;catalogContext:SupplementalCatalogContext;catalogRows:SupplementalEvidenceRow[];confirmedAt:string;unresolvedFollowups?:{id:string;version:number;reason:string}[];entries:{ref:SupplementalEvidenceRef;disposition:"include"|"exclude";acknowledgedFindings:string[];reason?:string}[]};
const HASH=/^[a-f0-9]{64}$/u;
export function supplementalCanonical(value:unknown):string {if(Array.isArray(value))return `[${value.map(supplementalCanonical).join(",")}]`;if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${supplementalCanonical((value as Record<string,unknown>)[k])}`).join(",")}}`;return JSON.stringify(value);}
export async function supplementalSha(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(supplementalCanonical(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");}
function fail(message:string):never{throw new DomainError(message,409);}
function plain(value:unknown,keys:string[]){if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail("Supplemental evidence must be plain objects.");const row=value as Record<string,unknown>;if(Reflect.ownKeys(row).some(k=>typeof k!=="string"||!keys.includes(k)||!("value"in Object.getOwnPropertyDescriptor(row,k)!)))fail("Supplemental evidence contains unsupported fields.");return row;}
function plainDecisionData(value:unknown){let nodes=0;const seen=new Set<object>();function visit(v:unknown,depth:number){if(++nodes>50000||depth>16)fail("Supplemental decision exceeds its bounded JSON structure.");if(v===null||typeof v==="string"||typeof v==="boolean"||typeof v==="number"&&Number.isFinite(v))return;if(!v||typeof v!=="object"||seen.has(v)||!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail("Supplemental decision needs plain JSON values.");seen.add(v);for(const k of Reflect.ownKeys(v)){if(Array.isArray(v)&&k==="length")continue;const property=Object.getOwnPropertyDescriptor(v,k)!;if(typeof k!=="string"||!("value"in property))fail("Supplemental decision cannot contain accessors.");visit(property.value,depth+1);}seen.delete(v);}visit(value,0);}
const id=(v:unknown)=>typeof v==="string"&&v.length>0&&v.length<=200&&!/[\u0000-\u001f\u007f]/u.test(v);
export function supplementalRefKey(ref:SupplementalEvidenceRef){return `${ref.family}:${ref.id}:${ref.version}:${ref.payloadSha256}`;}
export function validateSupplementalCatalogContext(value:unknown):SupplementalCatalogContext{
 const contextRow=plain(value,["artifactManifest","followupHeads"]);
 if(contextRow.artifactManifest!==null){const manifest=plain(contextRow.artifactManifest,["id","manifestDigest"]);if(!id(manifest.id)||typeof manifest.manifestDigest!=="string"||!HASH.test(manifest.manifestDigest))fail("Invalid artifact manifest context.");}
 if(contextRow.followupHeads!==undefined){if(!Array.isArray(contextRow.followupHeads)||contextRow.followupHeads.length>12)fail("Invalid repair task context.");const seenHeads=new Set<string>();for(const raw of contextRow.followupHeads){const h=plain(raw,["id","version","payloadSha256","status"]);if(!id(h.id)||seenHeads.has(h.id as string)||!Number.isSafeInteger(h.version)||(h.version as number)<1||(h.version as number)>20||typeof h.payloadSha256!=="string"||!HASH.test(h.payloadSha256)||!["open","proposed","resolved"].includes(h.status as string))fail("Invalid exact repair task head.");seenHeads.add(h.id as string);}}
 return structuredClone(contextRow)as unknown as SupplementalCatalogContext;
}

function publicTimeBody(value:unknown,session:TimePolicySession):unknown{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const body=value as Record<string,unknown>,result:Record<string,unknown>={},uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
 for(const key of ["protocol","syntheticOnly","testClock","deploymentRevision","policy","id","testRunId","caseId","marker","localStart","instant","status","code"]){if(!Object.hasOwn(body,key))continue;const v=body[key];let safe:unknown="withheld-invalid-value";
  if(key==="protocol"&&["time-policy-http-v1","time-policy-http-v2"].includes(v as string)||key==="syntheticOnly"&&typeof v==="boolean"||key==="testClock"&&typeof v==="boolean"||key==="deploymentRevision"&&v===session.registration?.deploymentRevision||key==="id"&&typeof v==="string"&&uuid.test(v)||key==="testRunId"&&v===session.id||key==="caseId"&&session.cases.some(c=>v===c.id||v===`${c.id}-setup`)||key==="marker"&&v===`PBP-${session.id}`||key==="localStart"&&typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d$/u.test(v)||key==="instant"&&typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(v)||key==="status"&&["active","cancelled"].includes(v as string)||key==="code"&&["allowed","nonexistent_local_time","ambiguous_local_time","closed","lead_time","cancellation_deadline"].includes(v as string))safe=v;
  if(key==="policy"){try{safe=validateTimePolicy(v);}catch{safe={};}}
  result[key]=safe;
 }
 return result;
}
export async function createSupplementalEvidenceObject(family:SupplementalEvidenceFamily,raw:unknown):Promise<SupplementalEvidenceObject>{
 let record:SupplementalEvidenceObject["record"];
 if(family==="source-visibility")record=validateStoredVisibilityReport(raw);
 else if(family==="deployment-source")record=await validateDeploymentSourceSession(raw);
 else if(family==="time-policy")record=validateTimeSession(raw);
 else return fail("Unsupported supplemental evidence family.");
 // This public projection has its own digest. Private storage hashes are never
 // represented as hashes of a differently redacted export object.
 if("createdBy"in record){record={...record,createdBy:"participant-withheld",...("startedBy"in record&&record.startedBy?{startedBy:"participant-withheld"}:{})};if(family==="time-policy"){const time=record as TimePolicySession;record={...time,trace:time.trace.map(t=>({...t,...(t.body!==undefined?{body:publicTimeBody(t.body,time)}:{})}))};}record=family==="deployment-source"?await validateDeploymentSourceSession(record):validateTimeSession(record);}
 const version="version"in record?record.version:1;
 return {ref:{family,id:record.id,version,payloadSha256:await supplementalSha(record),deliveryId:record.deliveryId,deliveryDigest:record.deliveryDigest},record};
}
export async function validateSupplementalEvidenceObject(value:unknown){const row=plain(value,["ref","record"]),r=plain(row.ref,["family","id","version","payloadSha256","deliveryId","deliveryDigest"]),object=await createSupplementalEvidenceObject(r.family as SupplementalEvidenceFamily,row.record);if(supplementalCanonical(r)!==supplementalCanonical(object.ref))fail("Supplemental record differs from its exact public content reference.");return object;}
async function catalogRow(object:SupplementalEvidenceObject,context:SupplementalCatalogContext):Promise<SupplementalEvidenceRow>{
 const {ref,record}=object;let plan:unknown,status:string,findings:SupplementalEvidenceFinding[],scope:string;
 if(ref.family==="source-visibility"){
  const r=record as SourceVisibilityReport;plan={widths:r.plan.widths,citations:r.plan.citations.map(c=>({file:c.citation.file,references:c.references.slice().sort(),text:c.target?.value??c.citation.excerpt,unsupported:c.unsupported??null}))};status="complete";
  findings=await Promise.all(r.readings.map(async reading=>{const c=r.plan.citations.find(c=>c.id===reading.citationId)!;return{key:`text:${c.id}:${(await supplementalSha([c.citation.file,c.references.slice().sort(),c.target?.value??c.citation.excerpt])).slice(0,20)}:${reading.viewportWidth}`,outcome:reading.state==="visible"?"supported"as const:reading.state==="hidden"?"mismatch"as const:"unknown"as const,label:`${c.citation.file} · ${reading.viewportWidth}px · ${reading.state}${reading.reason?` (${reading.reason})`:""}`.slice(0,200)};}));
  scope="Client-reported visibility of exact saved source text at two widths; no independent deployed-site or backend attestation.";
 }else if(ref.family==="deployment-source"){
  const r=record as DeploymentSourceSession;plan={method:"http-file-bytes",entryFile:r.plan.entryFile,files:r.plan.files.map(f=>({file:f.file,kind:f.kind})).sort((a,b)=>a.file.localeCompare(b.file)),...(r.plan.version===3?{moduleAnalysisProtocol:r.plan.moduleAnalysisProtocol,moduleContext:r.plan.moduleContext}:{})};status=r.status;
  findings=r.plan.files.map(f=>{const reading=r.readings.find(x=>x.file===f.file);return{key:`file:${f.file}`,outcome:reading?.outcome==="matched"?"supported":reading?.outcome==="mismatch"?"mismatch":"unknown",label:`${f.file} · ${reading?.outcome??"pending"}`.slice(0,200)};});
  const manifest=context.artifactManifest;
  if(manifest&&(r.plan.version===1||r.plan.artifactManifest.id!==manifest.id||r.plan.artifactManifest.manifestDigest!==manifest.manifestDigest)||!manifest&&r.plan.version!==1)findings.push({key:"artifact_manifest_changed",outcome:"unknown",label:"Build artifact manifest differs from the current delivery context; older byte readings do not cover it."});
  if(r.plan.version!==1)for(const coverage of r.plan.scriptCoverage.filter(c=>c.state!=="declared"))findings.push({key:`script:${(await supplementalSha([coverage.from,coverage.reference])).slice(0,20)}`,outcome:"unknown",label:`${coverage.from}: ${coverage.reference} · ${coverage.state}${coverage.reason?` (${coverage.reason})`:""}`.slice(0,200)});
  else findings.push({key:"javascript_scope_unchecked",outcome:"unknown",label:"This v1 static byte check does not cover separately built JavaScript artifacts or their dependency graph."});
  if(r.plan.version===2)findings.push({key:"dependency_graph_unchecked",outcome:"unknown",label:"Direct HTML script references and listed bytes only; JS imports, dynamic chunks and complete dependency graph remain unchecked."});
  if(r.plan.version===3){for(const module of getModuleDependencyFindings(r))findings.push({key:`module:${module.file}`,outcome:module.outcome,label:`${module.file}: ${module.references} recorded imports; ${module.missing} missing; ${module.mismatches} dependency mismatches; ${module.unknown} unknown; ${module.reachableModules} modules in bounded closure`.slice(0,200)});findings.push({key:"runtime_loading_unchecked",outcome:"unknown",label:"Only retained ES-module import observations within the declared file list are checked. Arbitrary runtime loading, execution and backend source remain unchecked."});}
  scope=r.plan.version===3?"Platform HTTP bytes and bounded recorded ES-module dependencies for the declared file list. Offline checks replay retained relationships, not JavaScript source parsing or execution; no backend attestation or selective-serving protection.":"Platform HTTP byte comparison for the registered deployment and exact package; no backend attestation or selective-serving protection.";
 }else{
  const r=record as TimePolicySession;const {sourceNote:_,...policyPlan}=r.plan;plan=policyPlan;status=r.status;
  findings=r.cases.map(c=>{const result=r.results?.find(x=>x.id===c.id);return{key:c.id,outcome:result?.outcome==="observed"?"supported":result?.outcome==="mismatch"?"mismatch":"unknown",label:`${c.label} · ${result?.outcome??"not executed"}`.slice(0,200)};});
  scope="Buyer-confirmed supplemental time policy and bounded registered test adapter observations; not a complete business rule audit.";
 }
 // Repeated identical HTML script references are one bounded finding; they
 // cannot create duplicate checkbox/task keys or inflate the evidence count.
 findings=[...new Map(findings.map(f=>[f.key,f])).values()];
 const counts={supported:0,mismatch:0,unknown:0};for(const f of findings)counts[f.outcome]++;
 return{ref,planKey:await supplementalSha([ref.family,plan]),status,findings,summary:`${counts.supported} supported; ${counts.mismatch} mismatch; ${counts.unknown} unknown`,scope};
}
export async function buildSupplementalEvidenceCatalog(deliveryId:string,deliveryDigest:string,objects:SupplementalEvidenceObject[],context:SupplementalCatalogContext={artifactManifest:null}):Promise<SupplementalEvidenceCatalog>{
 if(!id(deliveryId)||!HASH.test(deliveryDigest)||objects.length>40)fail("Supplemental catalog identity or history bound is invalid.");
 const seen=new Set<string>(),rows:SupplementalEvidenceRow[]=[];
 for(const raw of objects){const object=await validateSupplementalEvidenceObject(raw);if(object.ref.deliveryId!==deliveryId||object.ref.deliveryDigest!==deliveryDigest)continue;const identity=`${object.ref.family}:${object.ref.id}`;if(seen.has(identity))fail("Supplemental catalog contains conflicting report identities.");seen.add(identity);rows.push(await catalogRow(object,context));}
 rows.sort((a,b)=>supplementalRefKey(a.ref).localeCompare(supplementalRefKey(b.ref)));
 const body={version:1 as const,deliveryId,deliveryDigest,context:validateSupplementalCatalogContext(context),rows};
 return{...body,catalogDigest:await supplementalSha(body)};
}
export async function buildSupplementalCatalog(quote:ProofQuote,objects:SupplementalEvidenceObject[],context?:SupplementalCatalogContext){const d=quote.proof.delivery;if(!d)fail("Supplemental catalog needs a current delivery.");const entries=Object.entries(d.files??{}).sort(([a],[b])=>a.localeCompare(b,"en"));const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(entries))))).map(n=>n.toString(16).padStart(2,"0")).join("");return buildSupplementalEvidenceCatalog(d.id,digest,objects,context);}
/** Validate against the server-rederived complete catalog, never caller labels. */
export function validateSupplementalDecision(value:unknown,catalog:SupplementalEvidenceCatalog):SupplementalEvidenceDecision{
 plainDecisionData(value);
 const d=plain(value,["version","deliveryId","deliveryDigest","catalogDigest","catalogContext","catalogRows","confirmedAt","entries","unresolvedFollowups"]);
 if(d.version!==1||d.deliveryId!==catalog.deliveryId||d.deliveryDigest!==catalog.deliveryDigest||d.catalogDigest!==catalog.catalogDigest||supplementalCanonical(d.catalogContext)!==supplementalCanonical(catalog.context)||supplementalCanonical(d.catalogRows)!==supplementalCanonical(catalog.rows))fail("Supplemental reports or their complete catalog changed. Review them again.");
 if(typeof d.confirmedAt!=="string"||!Number.isFinite(Date.parse(d.confirmedAt))||new Date(d.confirmedAt).toISOString()!==d.confirmedAt||!Array.isArray(d.entries)||d.entries.length!==catalog.rows.length)fail("Review every current supplemental report before confirming.");
 const unresolved=catalog.context.followupHeads?.filter(h=>h.status!=="resolved")??[],acknowledgments=d.unresolvedFollowups??[];
 if(!Array.isArray(acknowledgments)||acknowledgments.length!==unresolved.length)fail("Explicitly acknowledge each open or proposed evidence follow-up before accepting this delivery.");
 const taskIds=new Set<string>();for(const raw of acknowledgments){const a=plain(raw,["id","version","reason"]),head=unresolved.find(h=>h.id===a.id&&h.version===a.version);if(!head||taskIds.has(head.id)||typeof a.reason!=="string"||a.reason.trim().length<10||a.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(a.reason))fail("Every unresolved follow-up needs its exact current version and a specific buyer reason (10–500 characters).");taskIds.add(head.id);}
 const seen=new Set<string>();for(const raw of d.entries){const e=plain(raw,["ref","disposition","acknowledgedFindings","reason"]),key=supplementalCanonical(e.ref),row=catalog.rows.find(r=>supplementalCanonical(r.ref)===key);if(!row||seen.has(key)||!["include","exclude"].includes(e.disposition as string))fail("Supplemental decisions need unique exact report references.");seen.add(key);
  if(row.status==="running")fail("Finish or explicitly close running supplemental checks before acceptance.");
  if(e.disposition==="include"&&row.status==="planned")fail("An unexecuted policy cannot be included as observed evidence.");
  const exceptions=row.findings.filter(f=>f.outcome!=="supported").map(f=>f.key);
  if(!Array.isArray(e.acknowledgedFindings)||e.acknowledgedFindings.some(k=>typeof k!=="string"||!exceptions.includes(k))||new Set(e.acknowledgedFindings).size!==e.acknowledgedFindings.length)fail("Acknowledge only real exceptional findings from this report.");
  if(e.reason!==undefined&&(typeof e.reason!=="string"||e.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(e.reason)))fail("Supplemental reason must be bounded plain text.");
  if(e.disposition==="exclude"||exceptions.length){if(typeof e.reason!=="string"||e.reason.trim().length<10)fail("Explain each excluded report or accepted observation exception in at least 10 characters.");if(e.disposition==="include"&&exceptions.some(k=>!(e.acknowledgedFindings as string[]).includes(k)))fail("Individually acknowledge every mismatched or unknown finding before including the report.");}
 }
 if(new TextEncoder().encode(JSON.stringify(d)).byteLength>96000)fail("Supplemental acceptance selection exceeds its retained bound.");
 return structuredClone(d)as unknown as SupplementalEvidenceDecision;
}
export function supplementalCatalogRequiresDecision(catalog:SupplementalEvidenceCatalog|undefined){return !!catalog&&(!!catalog.rows.length||!!catalog.context.artifactManifest||!!catalog.context.followupHeads?.length);}
export function currentSupplementalDecision(quote:ProofQuote){const delivery=quote.proof.delivery,catalog=delivery?.supplementalCatalog;if(!catalog||!supplementalCatalogRequiresDecision(catalog))return undefined;if(!delivery?.supplementalDecision)fail("Review and save the buyer supplemental evidence selection before accepting this delivery.");return validateSupplementalDecision(delivery.supplementalDecision,catalog);}
