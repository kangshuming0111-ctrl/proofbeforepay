import {parse as parseModule,type ImportSpecifier} from "es-module-lexer/js";
import {parse as parseHtml,type DefaultTreeAdapterTypes} from "parse5";
import {DomainError} from "./domain.ts";
import {artifactPath} from "./delivery-artifacts.ts";

/** This is an inventory of observed ES-module specifiers. It never evaluates
 * seller code and never follows a specifier to a new network destination. */
export const MODULE_ANALYSIS_PROTOCOL="pbp-esm-import-observation-v1"as const;
export const MODULE_ANALYSIS_LIMITS={sourceBytes:512*1024,perModule:64,totalReferences:256,htmlNodes:20_000}as const;
export type ModuleContext={importMapPresent:boolean;htmlContextComplete:boolean};
export type ModuleImportKind="static"|"dynamic-literal"|"dynamic-expression"|"import-meta"|"unsupported-phase"|"unsupported-attributes";
export type ModuleImportReason="unsupported_reference"|"nonliteral_dynamic"|"import_meta"|"unsupported_phase"|"unsupported_attributes"|"import_map_unsupported"|"html_context_limit";
export type ModuleImportObservation={offset:number;kind:ModuleImportKind;resolution:"declared"|"missing"|"unresolved";specifier?:string;target?:string;reason?:ModuleImportReason};
export type ModuleAnalysisReason="byte_mismatch"|"invalid_utf8"|"lexer_failed"|"inspection_too_large"|"reference_budget";
export type ModuleAnalysisObservation={protocol:typeof MODULE_ANALYSIS_PROTOCOL;sourceSha256:string;sourceBytes:number;sourceCharacters:number;state:"observed"|"unavailable";imports:ModuleImportObservation[];omittedImports:number;reason?:ModuleAnalysisReason};
export type ModuleAnalysisBinding={file:string;bytes:number;sha256:string;outcome:"matched"|"mismatch";declaredFiles:string[];context:ModuleContext;referenceBudget?:number};
export type ModuleGraphReading={file:string;outcome:"matched"|"mismatch"|"unreadable";bytes?:number;sha256?:string;moduleAnalysis?:ModuleAnalysisObservation};
export type ModuleGraphPlan={version:number;files:{file:string;kind:string}[];moduleAnalysisProtocol?:string;moduleContext?:ModuleContext};
export type ModuleDependencyDiagnostic={from:string;outcome:"mismatch"|"unknown";reason:string;offset?:number;target?:string};
export type ModuleDependencyFinding={file:string;outcome:"supported"|"mismatch"|"unknown";missing:number;unknown:number;mismatches:number;references:number;reachableModules:number;details:ModuleDependencyDiagnostic[]};
const HASH=/^[a-f0-9]{64}$/u;
function invalid(message:string):never{throw new DomainError(message,409);}
function plain(value:unknown,keys:string[],required=keys){if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid("Module observations require plain JSON.");const row=value as Record<string,unknown>;if(Reflect.ownKeys(row).some(k=>typeof k!=="string"||!keys.includes(k)||!("value"in Object.getOwnPropertyDescriptor(row,k)!))||required.some(k=>!Object.hasOwn(row,k)))invalid("Unsupported or incomplete module observation.");return row;}
function canonical(value:unknown):string{if(Array.isArray(value))return`[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`;return JSON.stringify(value);}
export function validateModuleContext(value:unknown):ModuleContext{const c=plain(value,["importMapPresent","htmlContextComplete"]);if(typeof c.importMapPresent!=="boolean"||typeof c.htmlContextComplete!=="boolean")invalid("Invalid saved module HTML context.");return{importMapPresent:c.importMapPresent as boolean,htmlContextComplete:c.htmlContextComplete as boolean};}
export function moduleContextForFiles(files:Record<string,string>):ModuleContext{
 let importMapPresent=false,htmlContextComplete=true;
 for(const[file,source]of Object.entries(files).filter(([name])=>/\.html$/iu.test(name))){
  const pending:DefaultTreeAdapterTypes.Node[]=[parseHtml(source)];let count=0;
  while(pending.length){const node=pending.pop()!;if(++count>MODULE_ANALYSIS_LIMITS.htmlNodes){htmlContextComplete=false;break;}if("tagName"in node&&node.tagName==="script"&&node.attrs.some(a=>a.name==="type"&&a.value.trim().toLowerCase()==="importmap"))importMapPresent=true;if("childNodes"in node)pending.push(...node.childNodes);}
 }
 return{importMapPresent,htmlContextComplete};
}
/** Only short, unencoded relative JS/MJS references are retained. External
 * URLs, credentials, queries, expressions and raw error excerpts are omitted. */
export function resolveModuleSpecifier(from:string,specifier:unknown):string|undefined{
 if(typeof specifier!=="string"||!specifier||specifier.length>160||!/^\.\.?\//u.test(specifier)||/[\\%?#\s\u0000-\u001f\u007f]/u.test(specifier))return;
 const parts=artifactPath(from).split("/").slice(0,-1);
 for(const part of specifier.split("/")){if(part===".")continue;if(part===".."){if(!parts.length)return;parts.pop();}else if(!part)return;else parts.push(part);}
 try{return artifactPath(parts.join("/"));}catch{return;}
}
function referenceBudget(binding:ModuleAnalysisBinding){const budget=binding.referenceBudget??MODULE_ANALYSIS_LIMITS.perModule;if(!Number.isSafeInteger(budget)||budget<0||budget>MODULE_ANALYSIS_LIMITS.perModule)invalid("Invalid bounded module reference allowance.");return budget;}
function bindingCheck(binding:ModuleAnalysisBinding){artifactPath(binding.file);validateModuleContext(binding.context);if(!Number.isSafeInteger(binding.bytes)||binding.bytes<0||!HASH.test(binding.sha256)||binding.declaredFiles.length>32||new Set(binding.declaredFiles).size!==binding.declaredFiles.length||!binding.declaredFiles.includes(binding.file))invalid("Invalid exact module-byte binding.");for(const f of binding.declaredFiles)artifactPath(f);referenceBudget(binding);}
function classifyImport(offset:number,kind:ModuleImportKind,specifier:unknown,binding:ModuleAnalysisBinding):ModuleImportObservation{
 const fixed:Partial<Record<ModuleImportKind,ModuleImportReason>>={"dynamic-expression":"nonliteral_dynamic","import-meta":"import_meta","unsupported-phase":"unsupported_phase","unsupported-attributes":"unsupported_attributes"};
 if(fixed[kind])return{offset,kind,resolution:"unresolved",reason:fixed[kind]};
 const target=resolveModuleSpecifier(binding.file,specifier);if(!target)return{offset,kind,resolution:"unresolved",reason:"unsupported_reference"};
 if(!binding.context.htmlContextComplete)return{offset,kind,resolution:"unresolved",specifier:specifier as string,reason:"html_context_limit"};
 if(binding.context.importMapPresent)return{offset,kind,resolution:"unresolved",specifier:specifier as string,reason:"import_map_unsupported"};
 return{offset,kind,resolution:binding.declaredFiles.includes(target)?"declared":"missing",specifier:specifier as string,target};
}
function lexerKind(i:ImportSpecifier):ModuleImportKind{if(i.d===-2||i.t===3)return"import-meta";if(i.t!==1&&i.t!==2)return"unsupported-phase";if(i.a!==-1||i.at?.length)return"unsupported-attributes";return i.t===1?"static":i.n===undefined?"dynamic-expression":"dynamic-literal";}
export function analyzeModuleBytes(bytes:Uint8Array,binding:ModuleAnalysisBinding):ModuleAnalysisObservation{
 bindingCheck(binding);if(bytes.length!==binding.bytes)invalid("Module source length changed while being observed.");
 const base={protocol:MODULE_ANALYSIS_PROTOCOL,sourceSha256:binding.sha256,sourceBytes:binding.bytes,sourceCharacters:0,imports:[]as ModuleImportObservation[],omittedImports:0};
 const unavailable=(reason:ModuleAnalysisReason,sourceCharacters=0):ModuleAnalysisObservation=>({...base,state:"unavailable",sourceCharacters,reason});
 if(binding.outcome==="mismatch")return unavailable("byte_mismatch");if(bytes.length>MODULE_ANALYSIS_LIMITS.sourceBytes)return unavailable("inspection_too_large");const budget=referenceBudget(binding);if(!budget)return unavailable("reference_budget");
 let source:string;try{source=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{return unavailable("invalid_utf8");}
 try{
  const [raw]=parseModule(source),ordered=[...raw].sort((a,b)=>a.ss-b.ss||a.s-b.s),imports=ordered.slice(0,budget).map(i=>classifyImport(i.ss,lexerKind(i),i.n,binding)),omittedImports=ordered.length-imports.length;
  return{...base,sourceCharacters:source.length,state:"observed",imports,omittedImports,...(omittedImports?{reason:"reference_budget"as const}:{})};
 }catch{return unavailable("lexer_failed",source.length);}
}
export function validateModuleAnalysis(value:unknown,binding:ModuleAnalysisBinding):ModuleAnalysisObservation{
 bindingCheck(binding);const r=plain(value,["protocol","sourceSha256","sourceBytes","sourceCharacters","state","imports","omittedImports","reason"],["protocol","sourceSha256","sourceBytes","sourceCharacters","state","imports","omittedImports"]),budget=referenceBudget(binding);
 if(r.protocol!==MODULE_ANALYSIS_PROTOCOL||r.sourceSha256!==binding.sha256||r.sourceBytes!==binding.bytes||!Number.isSafeInteger(r.sourceCharacters)||Number(r.sourceCharacters)<0||Number(r.sourceCharacters)>binding.bytes||!Array.isArray(r.imports)||r.imports.length>budget||!Number.isSafeInteger(r.omittedImports)||Number(r.omittedImports)<0||Number(r.omittedImports)+r.imports.length>Number(r.sourceCharacters)||!["observed","unavailable"].includes(r.state as string))invalid("Module observation differs from its exact saved bytes or bounds.");
 if(r.state==="unavailable"){
  if(r.imports.length||r.omittedImports!==0||typeof r.reason!=="string"||!["byte_mismatch","invalid_utf8","lexer_failed","inspection_too_large","reference_budget"].includes(r.reason))invalid("Invalid unavailable module observation.");
  const shortcut=binding.outcome==="mismatch"?"byte_mismatch":binding.bytes>MODULE_ANALYSIS_LIMITS.sourceBytes?"inspection_too_large":budget===0?"reference_budget":undefined;
  if(shortcut?r.reason!==shortcut:!["invalid_utf8","lexer_failed"].includes(r.reason)||r.reason!=="lexer_failed"&&r.sourceCharacters!==0)invalid("Unavailable module reason contradicts its saved scope.");
  if(r.reason!=="lexer_failed"&&r.sourceCharacters!==0)invalid("Unavailable module source characters contradict its retained observation.");
 }else{
  if(binding.outcome!=="matched"||binding.bytes>MODULE_ANALYSIS_LIMITS.sourceBytes||!budget||Number(r.omittedImports)>0&&r.imports.length!==budget||(Number(r.omittedImports)>0?r.reason!=="reference_budget":r.reason!==undefined))invalid("Invalid observed module scope or omitted-reference marker.");
  let last=-1;for(const raw of r.imports){const imp=plain(raw,["offset","kind","resolution","specifier","target","reason"],["offset","kind","resolution"]);if(!Number.isSafeInteger(imp.offset)||Number(imp.offset)<0||Number(imp.offset)>=Number(r.sourceCharacters)||Number(imp.offset)<=last||!["static","dynamic-literal","dynamic-expression","import-meta","unsupported-phase","unsupported-attributes"].includes(imp.kind as string))invalid("Invalid or unordered module specifier observation.");last=Number(imp.offset);const expected=classifyImport(last,imp.kind as ModuleImportKind,imp.specifier,binding);if(canonical(expected)!==canonical(imp))invalid("Module resolution differs from its safe relative path, manifest or HTML context.");}
 }
 return structuredClone(r)as unknown as ModuleAnalysisObservation;
}
/** Recomputes only the algebra of saved observations. Without the JS bytes an
 * offline verifier cannot independently re-run the lexer or prove execution. */
export function getModuleDependencyFindings(session:{plan:ModuleGraphPlan;readings:ModuleGraphReading[]}):ModuleDependencyFinding[]{
 const {plan,readings}=session;if(plan.version!==3)return[];if(plan.moduleAnalysisProtocol!==MODULE_ANALYSIS_PROTOCOL||!plan.moduleContext)invalid("Unsupported module observation protocol.");const context=validateModuleContext(plan.moduleContext),files=plan.files.filter(f=>f.kind==="javascript").map(f=>f.file);if(files.length>32)invalid("Module graph exceeds its declared file bound.");
 let consumed=0;const direct=new Map<string,ModuleDependencyDiagnostic[]>(),adjacent=new Map<string,string[]>(),references=new Map<string,number>();
 for(const file of files){const reading=readings.find(r=>r.file===file),issues:ModuleDependencyDiagnostic[]=[],edges:string[]=[];direct.set(file,issues);adjacent.set(file,edges);references.set(file,0);
  const issue=(outcome:"mismatch"|"unknown",reason:string,extra:Partial<ModuleDependencyDiagnostic>={})=>issues.push({from:file,outcome,reason,...extra});
  if(!reading||reading.outcome==="unreadable"){issue("unknown",reading?"module_unreadable":"module_not_observed");continue;}
  const observation=validateModuleAnalysis(reading.moduleAnalysis,{file,bytes:reading.bytes!,sha256:reading.sha256!,outcome:reading.outcome,declaredFiles:files,context,referenceBudget:Math.min(MODULE_ANALYSIS_LIMITS.perModule,MODULE_ANALYSIS_LIMITS.totalReferences-consumed)});consumed+=observation.imports.length;references.set(file,observation.imports.length);
  if(reading.outcome==="mismatch"){issue("mismatch","module_bytes_differ");continue;}if(observation.state==="unavailable"){issue("unknown",observation.reason!);continue;}
  for(const imp of observation.imports){if(imp.resolution==="missing")issue("mismatch","artifact_not_declared",{offset:imp.offset,target:imp.target});else if(imp.resolution==="unresolved")issue("unknown",imp.reason!,{offset:imp.offset});else edges.push(imp.target!);}
  if(observation.omittedImports)issue("unknown","reference_budget");
 }
 return files.map(file=>{const visited=new Set<string>(),pending=[file],details:ModuleDependencyDiagnostic[]=[];while(pending.length){const f=pending.pop()!;if(visited.has(f))continue;visited.add(f);details.push(...(direct.get(f)??[]));pending.push(...(adjacent.get(f)??[]));}const mismatches=details.filter(d=>d.outcome==="mismatch").length,unknown=details.filter(d=>d.outcome==="unknown").length;return{file,outcome:mismatches?"mismatch"as const:unknown?"unknown"as const:"supported"as const,missing:details.filter(d=>d.reason==="artifact_not_declared").length,unknown,mismatches,references:references.get(file)??0,reachableModules:visited.size,details};});
}
