import type {ProofQuote} from "./contracts.ts";
import {createEvidenceExport,verifyEvidenceExport,EVIDENCE_EXPORT_SCHEMA,type EvidenceExport,type EvidenceVerification} from "./evidence-export.ts";
import {createDeploymentSourcePlan,type DeploymentSourceSession} from "./deployment-source.ts";
import {getModuleDependencyFindings} from "./module-dependencies.ts";
import {validateDeliveryArtifactManifest,DELIVERY_ARTIFACT_LIMITS,type DeliveryArtifactManifest} from "./delivery-artifacts.ts";
import {sourceVisibilityPlan,type SourceVisibilityReport} from "./source-visibility.ts";
import {buildSupplementalEvidenceCatalog,validateSupplementalEvidenceObject,validateSupplementalDecision,type SupplementalEvidenceObject,type SupplementalEvidenceCatalog} from "./supplemental-evidence.ts";
import {validateEvidenceFollowup,replayFollowupVersion,evidenceFollowupHead,FOLLOWUP_LIMIT,type EvidenceFollowup,type FollowupObservation,type FollowupHead} from "./evidence-followup.ts";

/** The legacy core retains its original rules. This wrapper adds independently
 * typed supplemental objects without silently broadening the v1 verifier. */
export const EVIDENCE_BUNDLE_SCHEMA="proofbeforepay-evidence-bundle-v2";
export const EVIDENCE_BUNDLE_RULES="pbp-supplemental-chain-v1";
export const EVIDENCE_BUNDLE_MODULE_RULES="pbp-supplemental-chain-v2";
export const EVIDENCE_BUNDLE_BYTE_LIMIT=8*1024*1024;
export const EVIDENCE_BUNDLE_OBJECT_LIMIT=440;
export class EvidenceBundleBudgetError extends Error{constructor(){super("The evidence exceeds the bounded JSON or 8 MiB total export limit. No record was omitted.");this.name="EvidenceBundleBudgetError";}}
type SupplementalDecision=NonNullable<NonNullable<ProofQuote["proof"]["delivery"]>["acceptanceEvidence"]>[number]["supplementalDecision"];
export type EvidenceBundleAcceptance={snapshotId:string;snapshotSha256:string;decision:SupplementalDecision|null};
export type EvidenceBundle={
 schema:typeof EVIDENCE_BUNDLE_SCHEMA;verificationRules:typeof EVIDENCE_BUNDLE_RULES|typeof EVIDENCE_BUNDLE_MODULE_RULES;scope:"current-delivery-only";
 core:EvidenceExport;
 supplemental:{version:1;catalog:SupplementalEvidenceCatalog;objects:SupplementalEvidenceObject[];artifactManifests:DeliveryArtifactManifest[];acceptance:EvidenceBundleAcceptance[]};
 followups?:{version:1;scope:"task-records-and-referenced-reports-only";tasks:EvidenceFollowup[]};
};
function demand(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
const encoder=new TextEncoder();
/** Reject accessors, sparse arrays, nonfinite values and cycles before reading
 * properties or serialising. Byte/count budgets fail closed; nothing is cut. */
export function assertEvidenceBundleBudget(value:unknown){
 try{
 let nodes=0,characters=0;const ancestors=new Set<object>();
 function visit(v:unknown,depth:number){
  demand(++nodes<=120000&&depth<=36,"Evidence exceeds its structural budget.");
  if(v===null||typeof v==="boolean")return;
  if(typeof v==="number"){demand(Number.isFinite(v),"Evidence must contain finite JSON values.");return;}
  if(typeof v==="string"){characters+=v.length;demand(characters<=EVIDENCE_BUNDLE_BYTE_LIMIT,"Evidence exceeds its character budget.");return;}
  demand(v&&typeof v==="object"&&!ancestors.has(v),"Evidence must be acyclic plain JSON.");
  const row=v as object;demand(Array.isArray(row)||[Object.prototype,null].includes(Object.getPrototypeOf(row)),"Evidence must be plain JSON.");ancestors.add(row);
  const keys=Reflect.ownKeys(row);
  if(Array.isArray(row))demand(row.length<=120000&&keys.length===row.length+1,"Evidence arrays must be dense and bounded.");
  for(const key of keys){
   if(Array.isArray(row)&&key==="length")continue;
   demand(typeof key==="string","Evidence cannot contain symbol keys.");
   const descriptor=Object.getOwnPropertyDescriptor(row,key)!;
   demand("value"in descriptor&&descriptor.enumerable,"Evidence cannot contain getters or hidden properties.");
   if(Array.isArray(row))demand(/^(0|[1-9]\d*)$/u.test(key)&&Number(key)<row.length,"Evidence arrays cannot contain named properties.");
   characters+=key.length;demand(characters<=EVIDENCE_BUNDLE_BYTE_LIMIT,"Evidence exceeds its character budget.");visit(descriptor.value,depth+1);
  }
  ancestors.delete(row);
 }
 visit(value,0);demand(encoder.encode(JSON.stringify(value)).byteLength<=EVIDENCE_BUNDLE_BYTE_LIMIT,"Evidence exceeds the 8 MiB total byte budget. No record was omitted.");
 }catch{throw new EvidenceBundleBudgetError();}
}
function exact(value:unknown,keys:string[]){demand(value&&typeof value==="object"&&!Array.isArray(value),"Expected an evidence object.");const row=value as Record<string,unknown>;demand(Object.keys(row).length===keys.length&&keys.every(k=>Object.hasOwn(row,k)),"Evidence has incomplete or unsupported fields.");return row;}
function canonical(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`;return JSON.stringify(value);}
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
export async function evidenceBundleSha256(value:unknown){assertEvidenceBundleBudget(value);return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(canonical(value)))),b=>b.toString(16).padStart(2,"0")).join("");}
const objectKey=(value:SupplementalEvidenceObject)=>`${value.ref.family}:${value.ref.id}:${value.ref.version}`;
function taskObservations(task:EvidenceFollowup):FollowupObservation[]{return[task.source,...(task.proposal?[task.proposal]:[]),...task.events.flatMap(e=>e.observation?[e.observation]:[])];}
const extendedRulesRequired=(objects:SupplementalEvidenceObject[],tasks:EvidenceFollowup[])=>objects.some(o=>o.ref.family==="deployment-source"&&(o.record as DeploymentSourceSession).plan.version===3)||tasks.some(t=>taskObservations(t).some(o=>o.context!==undefined));
function optionalExact(value:unknown,required:string[],optional:string[]=[]){demand(value&&typeof value==="object"&&!Array.isArray(value),"Expected a plain object.");const row=value as Record<string,unknown>;demand(required.every(k=>Object.hasOwn(row,k))&&Object.keys(row).every(k=>required.includes(k)||optional.includes(k)),"Unsupported or incomplete evidence fields.");return row;}
function contextHeads(context:unknown):FollowupHead[]{
 const row=optionalExact(context,["artifactManifest"],["followupHeads"]);
 if(row.artifactManifest!==null){const m=exact(row.artifactManifest,["id","manifestDigest"]);demand(typeof m.id==="string"&&m.id.length>0&&m.id.length<=200&&typeof m.manifestDigest==="string"&&/^[a-f0-9]{64}$/u.test(m.manifestDigest),"Invalid artifact context reference.");}
 if(row.followupHeads===undefined)return[];
 demand(Array.isArray(row.followupHeads)&&row.followupHeads.length<=FOLLOWUP_LIMIT,"Follow-up heads exceed their retained bound.");const ids=new Set<string>();
 for(const raw of row.followupHeads){const h=exact(raw,["id","version","payloadSha256","status"]);demand(typeof h.id==="string"&&h.id.length>0&&h.id.length<=200&&!ids.has(h.id)&&Number.isSafeInteger(h.version)&&Number(h.version)>0&&typeof h.payloadSha256==="string"&&/^[a-f0-9]{64}$/u.test(h.payloadSha256)&&["open","proposed","resolved"].includes(h.status as string),"Invalid or duplicated follow-up head.");ids.add(h.id);}
 return row.followupHeads as FollowupHead[];
}

/** The v1 allowlist cannot represent supplemental decisions. Their exact
 * snapshot link lives in the wrapper; it never disappears from a v2 export. */
function legacyQuote(quote:ProofQuote){const copy=structuredClone(quote),delivery=copy.proof.delivery;if(delivery){delete delivery.supplementalCatalog;delete delivery.supplementalDecision;for(const snapshot of delivery.acceptanceEvidence??[])delete snapshot.supplementalDecision;}return copy;}

export async function createEvidenceBundle(quote:ProofQuote,input:{catalog:SupplementalEvidenceCatalog;objects:SupplementalEvidenceObject[];artifactManifests?:DeliveryArtifactManifest[];followups?:EvidenceFollowup[]}):Promise<EvidenceBundle>{
 assertEvidenceBundleBudget(quote);
 const core=await createEvidenceExport(legacyQuote(quote));
 const acceptance:EvidenceBundleAcceptance[]=[];
 for(const snapshot of quote.proof.delivery?.acceptanceEvidence??[]){const exported=core.delivery.acceptanceEvidence?.find(s=>s.id===snapshot.id);demand(exported,"The acceptance snapshot was not retained.");const decision=snapshot.supplementalDecision?structuredClone(snapshot.supplementalDecision):null;acceptance.push({snapshotId:snapshot.id,snapshotSha256:await evidenceBundleSha256({...exported,...(decision?{supplementalDecision:decision}:{})}),decision});}
 const tasks=(input.followups??[]).map(validateEvidenceFollowup);
 const requested=new Set([...input.catalog.rows.map(r=>canonical(r.ref)),...acceptance.flatMap(a=>a.decision?.entries.map(e=>canonical(e.ref))??[]),...tasks.flatMap(t=>taskObservations(t).map(o=>canonical(o.ref)))]);
 const objects=input.objects.filter(obj=>requested.has(canonical(obj.ref)));
 const manifests=new Map<string,DeliveryArtifactManifest>();for(const m of [...(input.artifactManifests??[]),...objects.flatMap(o=>o.ref.family==="deployment-source"&&(o.record as DeploymentSourceSession).plan.version!==1?[(o.record as DeploymentSourceSession).plan].flatMap(p=>p.version!==1?[p.artifactManifest]:[]):[])]){const prior=manifests.get(m.id);demand(!prior||same(prior,m),"Conflicting artifact manifest identity.");manifests.set(m.id,m);}
 const manifestRefs=[input.catalog.context.artifactManifest,...acceptance.map(a=>a.decision?.catalogContext.artifactManifest),...tasks.flatMap(t=>taskObservations(t).map(o=>o.context?.artifactManifest))].filter(Boolean);
 const artifactManifests=[...manifests.values()].filter(m=>manifestRefs.some(r=>r!.id===m.id&&r!.manifestDigest===m.manifestDigest)||objects.some(o=>o.ref.family==="deployment-source"&&(o.record as DeploymentSourceSession).plan.version!==1&&((o.record as DeploymentSourceSession).plan as {artifactManifest:DeliveryArtifactManifest}).artifactManifest.id===m.id));
 const result:EvidenceBundle={schema:EVIDENCE_BUNDLE_SCHEMA,verificationRules:extendedRulesRequired(objects,tasks)?EVIDENCE_BUNDLE_MODULE_RULES:EVIDENCE_BUNDLE_RULES,scope:"current-delivery-only",core,supplemental:{version:1,catalog:structuredClone(input.catalog),objects:structuredClone(objects),artifactManifests:structuredClone(artifactManifests),acceptance},...(input.followups!==undefined?{followups:{version:1,scope:"task-records-and-referenced-reports-only",tasks:structuredClone(tasks)}}:{})};
 assertEvidenceBundleBudget(result);
 const verification=await verifyEvidenceBundle(result);demand(verification.consistency==="consistent",`The unified evidence bundle is incomplete or inconsistent (${verification.checks.filter(c=>c.status==="inconsistent").map(c=>c.id).join(", ")}). No evidence was silently omitted.`);return result;
}

async function verifyVisibilityBinding(core:EvidenceExport,report:SourceVisibilityReport){
 for(const entry of report.plan.citations){const source=core.delivery.files?.[entry.citation.file];demand(typeof source==="string"&&source.slice(entry.citation.start,entry.citation.end)===entry.citation.excerpt,"The source-visibility citation differs from the exported files.");}
 // Historical AI assessments need not remain in the inline window. The
 // report's exact source targets can still be replayed against the full files,
 // including duplicate text and DOM paths. This does not prove AI provenance.
 const synthetic={id:core.project.id,proof:{delivery:{...core.delivery,assessment:{id:report.assessmentId,deliveryId:core.delivery.id,items:report.plan.citations.map((c,i)=>({criterionId:`export-${i}`,citations:[c.citation]})),risks:[]}}}}as unknown as ProofQuote;
 const replay=await sourceVisibilityPlan(synthetic);
 demand(replay.citations.length===report.plan.citations.length,"The retained source target list changed.");
 for(const [index,entry]of report.plan.citations.entries())demand(same({target:entry.target??null,unsupported:entry.unsupported??null},{target:replay.citations[index].target??null,unsupported:replay.citations[index].unsupported??null}),"A source text target does not resolve in the exported files.");
 const candidates=[core.delivery.assessment,...(core.delivery.acceptanceEvidence??[]).map(s=>s.assessment)].filter(a=>a?.id===report.assessmentId);
 if(candidates.length){const quote={id:core.project.id,proof:{delivery:{...core.delivery,assessment:candidates[0]}}}as ProofQuote;demand(same(await sourceVisibilityPlan(quote),report.plan),"The frozen visibility plan differs from its retained assessment.");}
}

/** One dispatcher accepts both the unchanged v1 core and the v2 wrapper.
 * Neither mode issues HTTP requests, runs source code, or proves authenticity. */
export async function verifyEvidenceBundle(input:unknown):Promise<EvidenceVerification>{
 let bounded=true;try{assertEvidenceBundleBudget(input);}catch{bounded=false;}
 const result:EvidenceVerification={schema:"proofbeforepay-evidence-verification-v1",consistency:"consistent",checks:[],limits:{scope:"current-delivery-only",authenticity:"not-proven",backendExecution:"not-proven",modelJudgment:"not-proven",payment:"not-proven",previousVersions:"not-included",networkRequests:0}};
 const check=async(id:string,action:()=>unknown|Promise<unknown>,message:string)=>{try{await action();result.checks.push({id,status:"consistent",message});return true;}catch{result.consistency="inconsistent";result.checks.push({id,status:"inconsistent",message:`${id} could not be established from the supplied record.`});return false;}};
 if(!bounded){result.consistency="inconsistent";result.checks.push({id:"bounded-json",status:"inconsistent",message:"The unified input exceeds its bounded plain JSON limits. No records were truncated."});return result;}
 if(input&&typeof input==="object"&&(input as Record<string,unknown>).schema===EVIDENCE_EXPORT_SCHEMA)return verifyEvidenceExport(input);
 if(!input||typeof input!=="object"||(input as Record<string,unknown>).schema!==EVIDENCE_BUNDLE_SCHEMA||!([EVIDENCE_BUNDLE_RULES,EVIDENCE_BUNDLE_MODULE_RULES]as unknown[]).includes((input as Record<string,unknown>).verificationRules)){result.consistency="unsupported";result.checks.push({id:"schema",status:"inconsistent",message:"Unsupported evidence bundle format or verification rules."});return result;}
 // Capture the already-checked plain data synchronously. Async digest work
 // must not revisit caller-owned objects that can change after this point.
 const bundle=structuredClone(input) as EvidenceBundle;
 if(!await check("bundle-structure",()=>{optionalExact(bundle,["schema","verificationRules","scope","core","supplemental"],["followups"]);demand(bundle.scope==="current-delivery-only","Unsupported scope.");exact(bundle.supplemental,["version","catalog","objects","artifactManifests","acceptance"]);demand(bundle.supplemental.version===1&&Array.isArray(bundle.supplemental.objects)&&bundle.supplemental.objects.length<=EVIDENCE_BUNDLE_OBJECT_LIMIT&&Array.isArray(bundle.supplemental.artifactManifests)&&bundle.supplemental.artifactManifests.length<=DELIVERY_ARTIFACT_LIMITS.history&&Array.isArray(bundle.supplemental.acceptance)&&bundle.supplemental.acceptance.length<=20,"Supplemental objects exceed their bound.");contextHeads(bundle.supplemental.catalog.context);if(bundle.followups){exact(bundle.followups,["version","scope","tasks"]);demand(bundle.followups.version===1&&bundle.followups.scope==="task-records-and-referenced-reports-only"&&Array.isArray(bundle.followups.tasks)&&bundle.followups.tasks.length<=FOLLOWUP_LIMIT,"Invalid follow-up extension.");}},"The unified wrapper retains an unchanged v1 core and bounded supplemental evidence."))return result;
 if(!await check("module-observation-rules",()=>{
  const extended=extendedRulesRequired(bundle.supplemental.objects,bundle.followups?.tasks??[]);
  demand((bundle.verificationRules===EVIDENCE_BUNDLE_MODULE_RULES)===extended,"Module observations and contextual task bindings require their named rule revision; legacy rules cannot reinterpret them.");
 },"The named rule revision explicitly distinguishes legacy records from bounded module observations and exact contextual task bindings."))return result;
 const coreReport=await verifyEvidenceExport(bundle.core);result.checks.push(...coreReport.checks);if(coreReport.consistency!=="consistent")result.consistency=coreReport.consistency;
 if(!coreReport.checks.some(c=>c.id==="structure"&&c.status==="consistent"))return result;
 const objects:SupplementalEvidenceObject[]=[],tasks:EvidenceFollowup[]=[];
 const tasksValid=await check("followup-records",()=>{const ids=new Set<string>();for(const raw of bundle.followups?.tasks??[]){const t=validateEvidenceFollowup(raw);demand(t.projectId===bundle.core.project.id&&!ids.has(t.id),"A follow-up task is foreign or duplicated.");ids.add(t.id);tasks.push(t);}},"Repair/retest tasks are replayed from bounded append-only buyer/seller events; older delivery files are outside this package.");
 if(!tasksValid)return result;
 const taskRefs=tasks.flatMap(t=>taskObservations(t).map(o=>o.ref));
 const objectsValid=await check("supplemental-objects",async()=>{
  const keys=new Set<string>();
  for(const raw of bundle.supplemental.objects){const obj=await validateSupplementalEvidenceObject(raw);demand(same(raw,obj),"A record contains fields outside its public projection.");demand(obj.record.projectId===bundle.core.project.id&&(obj.ref.deliveryId===bundle.core.delivery.id&&obj.ref.deliveryDigest===bundle.core.fileDigest||taskRefs.some(ref=>same(ref,obj.ref))),"A supplemental object belongs to another project or unreferenced delivery.");const key=objectKey(obj);demand(!keys.has(key),"Duplicate supplemental object identity.");keys.add(key);objects.push(obj);}
 },"Supplemental objects pass their native validators and exact public payload hashes; participant identifiers are withheld.");
 if(!objectsValid)return result;
 if(objects.some(o=>o.ref.family==="deployment-source"&&(o.record as DeploymentSourceSession).plan.version===3))await check("module-observations",()=>{
  for(const object of objects)if(object.ref.family==="deployment-source"&&(object.record as DeploymentSourceSession).plan.version===3)getModuleDependencyFindings(object.record as DeploymentSourceSession);
 },"Saved module observations are bound to exact file hashes, safe declared paths and bounded graph relationships. Original JS is absent, so the lexer, runtime loading and execution are not rerun.");
 await check("supplemental-bindings",async()=>{
  for(const obj of objects){
   if(obj.ref.deliveryId!==bundle.core.delivery.id||obj.ref.deliveryDigest!==bundle.core.fileDigest)continue;
   if(obj.ref.family==="source-visibility")await verifyVisibilityBinding(bundle.core,obj.record as SourceVisibilityReport);
   if(obj.ref.family==="deployment-source"){
    const p=(obj.record as DeploymentSourceSession).plan;
    const replay=await createDeploymentSourcePlan({projectId:bundle.core.project.id,deliveryId:bundle.core.delivery.id,deliveryDigest:bundle.core.fileDigest,entryFile:p.entryFile,registration:p.registration,files:bundle.core.delivery.files!,...(p.version!==1?{artifactManifest:p.artifactManifest}:{}),...(p.version===3?{analyzeModules:true}:{})});
    demand(same(replay,p),"The deployment byte plan differs from the exact files/artifact manifest.");
   }
  }
  const ids=new Set<string>();for(const raw of bundle.supplemental.artifactManifests){const m=await validateDeliveryArtifactManifest(raw);demand(m.projectId===bundle.core.project.id&&!ids.has(m.id),"A build-artifact manifest is foreign or duplicated.");ids.add(m.id);}
  const manifestRefs:{id:string;manifestDigest:string}[]=[];
  const requireManifest=(ref:{id:string;manifestDigest:string}|null|undefined,binding={deliveryId:bundle.core.delivery.id,deliveryDigest:bundle.core.fileDigest},at?:string)=>{if(ref){demand(bundle.supplemental.artifactManifests.some(m=>m.id===ref.id&&m.manifestDigest===ref.manifestDigest&&m.deliveryId===binding.deliveryId&&m.deliveryDigest===binding.deliveryDigest&&(!at||Date.parse(m.createdAt)<=Date.parse(at))),"A frozen artifact manifest is missing or belongs to a different delivery.");manifestRefs.push(ref);}};
  requireManifest(bundle.supplemental.catalog.context.artifactManifest);for(const row of bundle.supplemental.acceptance)requireManifest(row.decision?.catalogContext.artifactManifest);for(const obj of objects){if(obj.ref.family==="deployment-source"){const p=(obj.record as DeploymentSourceSession).plan;if(p.version!==1)requireManifest(p.artifactManifest,{deliveryId:obj.ref.deliveryId,deliveryDigest:obj.ref.deliveryDigest});}}
  for(const task of tasks)for(const event of task.events){const observation=event.observation;if(observation)requireManifest(observation.context?.artifactManifest,{deliveryId:observation.ref.deliveryId,deliveryDigest:observation.ref.deliveryDigest},event.at);}
  demand(bundle.supplemental.artifactManifests.every(m=>manifestRefs.some(r=>r.id===m.id&&r.manifestDigest===m.manifestDigest)),"An unrelated artifact manifest was included.");
 },"Current-delivery source spans and deployment byte plans resolve against the exported files. Older task reports receive native-record checks; their earlier source files are not included or replayed.");
 const catalogValid=await check("supplemental-catalog",async()=>{
  const catalog=bundle.supplemental.catalog;
  const current=catalog.rows.map(row=>objects.find(obj=>same(obj.ref,row.ref)));demand(current.every(Boolean),"The current catalog has a dangling exact record reference.");
  const rebuilt=await buildSupplementalEvidenceCatalog(bundle.core.delivery.id,bundle.core.fileDigest,current as SupplementalEvidenceObject[],catalog.context);
  demand(same(rebuilt,catalog),"The current supplemental catalog does not match its exact objects.");
  const referenced=[...catalog.rows.map(r=>r.ref),...bundle.supplemental.acceptance.flatMap(a=>a.decision?.entries.map(e=>e.ref)??[]),...taskRefs];demand(objects.every(o=>referenced.some(r=>same(r,o.ref))),"An unreferenced supplemental object was included.");
 },"The current supplemental catalog is re-derived from the included exact records and its frozen artifact context.");
 const acceptanceValid=await check("supplemental-acceptance",async()=>{
  const snapshots=bundle.core.delivery.acceptanceEvidence??[],rows=bundle.supplemental.acceptance;demand(rows.length===snapshots.length,"Every retained acceptance snapshot needs an explicit supplemental decision entry.");const ids=new Set<string>();
  for(const row of rows){exact(row,["snapshotId","snapshotSha256","decision"]);demand(!ids.has(row.snapshotId),"Duplicate acceptance decision.");ids.add(row.snapshotId);const snapshot=snapshots.find(s=>s.id===row.snapshotId);demand(snapshot&&row.snapshotSha256===await evidenceBundleSha256({...snapshot,...(row.decision?{supplementalDecision:row.decision}:{})}),"The supplemental decision no longer binds the exact acceptance snapshot.");
   if(row.decision){contextHeads(row.decision.catalogContext);const refs=row.decision.entries.map(e=>e.ref),retained=refs.map(ref=>objects.find(obj=>same(obj.ref,ref)));demand(retained.every(Boolean),"An exact frozen supplemental record is missing.");const catalog=await buildSupplementalEvidenceCatalog(bundle.core.delivery.id,bundle.core.fileDigest,retained as SupplementalEvidenceObject[],row.decision.catalogContext);validateSupplementalDecision(row.decision,catalog);}
  }
 },"Each retained buyer decision resolves to its exact frozen report versions and snapshot, including exclusions and acknowledged findings.");
 await check("followup-bindings",async()=>{
  for(const t of tasks)for(const observation of taskObservations(t)){
   const object=objects.find(o=>same(o.ref,observation.ref));demand(object,"A repair/retest event has a dangling exact report reference.");
   const c=await buildSupplementalEvidenceCatalog(object.ref.deliveryId,object.ref.deliveryDigest,[object],observation.context??{artifactManifest:null});
   // New tasks freeze the context that made a diagnostic true. Legacy tasks
   // may use a native-rebuilt catalog already retained in this exact bundle;
   // missing historical context is never invented from an unrelated manifest.
   const retainedRows=observation.context!==undefined?[]:[...(catalogValid?bundle.supplemental.catalog.rows:[]),...(acceptanceValid?bundle.supplemental.acceptance.flatMap(a=>a.decision?.catalogRows??[]):[])];
   const candidates=[...c.rows,...retainedRows.filter(r=>same(r.ref,observation.ref))];
   demand(candidates.some(row=>row.planKey===observation.planKey&&same(row.findings.find(f=>f.key===observation.finding.key),observation.finding)),"A repair/retest event changed the saved report plan/finding, or lacks its required historical context.");
  }
  const current=contextHeads(bundle.supplemental.catalog.context);demand(current.length===tasks.length,"The current task-head catalog is incomplete.");
  const contexts=[bundle.supplemental.catalog.context,...bundle.supplemental.acceptance.flatMap(a=>a.decision?[a.decision.catalogContext]:[])];
  for(const context of contexts)for(const head of contextHeads(context)){const task=tasks.find(t=>t.id===head.id);demand(task,"A frozen task head is missing its append-only events.");const replay=replayFollowupVersion(task,head.version);demand(same(await evidenceFollowupHead(replay),head),"A task head differs from the exact historical event version.");}
  for(const task of tasks)demand(current.some(h=>same(h.id,task.id)&&h.version===task.version),"The current catalog used an old task head.");
 },"Every task source/retest finding resolves to its exact report, and current/frozen task heads replay from their original event versions. Older delivery files are not included.");
 return result;
}
