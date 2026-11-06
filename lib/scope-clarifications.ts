import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessment, ProofQuote, ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";
import {isOwnerRoleplay} from "./proof-demo.ts";
import {runtimeDeliveryDigest} from "./runtime-project.ts";
import {assertStaticPath, staticFileKind} from "./static-resources.ts";
import {criterionOwnSourceTargetHint} from "./assessment-source-target.ts";
import {getBusinessCheckPlan} from "./business-checks.ts";
import {parseNativeFormSourceDirective} from "./native-form-source.ts";

export type ScopeTarget = {kind:"page";file:string}|{kind:"form";file:string;formId:string};
export type ScopeConfirmationMode = "owner-roleplay"|"authenticated-participants";
export type ScopeClarification = {id:string;digest:string;criterionId:string;criterionSource:string;basis:{deliveryId:string;deliveryDigest:string};target:ScopeTarget;proposedByRole:ProofRole;proposedAt:string;basisNote:string;confirmationMode:ScopeConfirmationMode;confirmations:{role:ProofRole;at:string;basisNote:string}[]};
export type ScopeTargetCandidate={target:ScopeTarget;label:string};
export type ConfirmedScopeBinding={proposalId:string;proposalDigest:string;criterionId:string;criterionSource:string;file:string;kind:"page"|"form";formId?:string;basisDeliveryId:string;currentDeliveryId:string;currentDeliveryDigest:string;confirmationMode:ScopeConfirmationMode;carriedFromBasis:boolean};
export type ScopeClarificationState={criterionId:string;latest?:ScopeClarification;status:"none"|"pending"|"confirmed"|"unavailable";reason?:string};
export type ScopeContextStamp={proposalCount:number;confirmationCounts:number[]};
export type ScopeAssessmentContext=ScopeContextStamp&{digest:string};
export type ScopeContext={states:ScopeClarificationState[];bindings:ConfirmedScopeBinding[];contextDigest:string;stamp:ScopeContextStamp};
export type ScopeClarificationInput=
 |{action:"propose";deliveryId:string;criterionId:string;criterionSource:string;expectedLatestId:string|null;target:ScopeTarget;basisNote:string}
 |{action:"confirm";deliveryId:string;proposalId:string;proposalDigest:string;confirm:true;basisNote:string};
const MAX_PROPOSALS=12,MAX_SCOPE_BYTES=64*1024,MAX_ASSESSMENTS=4;
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
function fail(message:string):never{throw new DomainError(message,409,"SCOPE_CLARIFICATION_CONFLICT");}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail("The scope record has unsupported fields.");return value as Record<string,unknown>;}
function text(value:unknown,max:number):string{if(typeof value!=="string"||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail("Use bounded nonempty scope text.");return value as string;}
function role(value:unknown):asserts value is ProofRole{if(value!=="buyer"&&value!=="seller")fail("Only a project participant can confirm scope.");}
function date(value:unknown):string{const s=text(value,40);if(!Number.isFinite(Date.parse(s))||new Date(s).toISOString()!==s)fail("The scope timestamp is invalid.");return s;}
function digest(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{64}$/u.test(value))fail("The scope digest is invalid.");return value as string;}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,"en")).map(([k,v])=>[k,canonical(v)]));return value;}
async function sha(value:unknown):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(canonical(value)))))).map(x=>x.toString(16).padStart(2,"0")).join("");}
function target(value:unknown):ScopeTarget{const r=object(value,["kind","file","formId"]),file=text(r.file,200);try{if(assertStaticPath(file)!==file||staticFileKind(file)!=="html")fail("Choose a delivered HTML file.");}catch{fail("Choose a delivered HTML file.");}if(r.kind==="page"&&r.formId===undefined)return{kind:"page",file};if(r.kind==="form")return{kind:"form",file,formId:text(r.formId,120)};return fail("Choose a page or a form with an explicit HTML id.");}
export function scopeConfirmationMode(quote:ProofQuote):ScopeConfirmationMode{if(quote.proof.demoRoleplay===true&&!isOwnerRoleplay(quote))fail("The saved owner-roleplay origin is inconsistent.");return isOwnerRoleplay(quote)?"owner-roleplay":"authenticated-participants";}
function proposalBody(projectId:string,p:Omit<ScopeClarification,"digest"|"confirmations">){return{projectId,id:p.id,criterionId:p.criterionId,criterionSource:p.criterionSource,basis:{deliveryId:p.basis.deliveryId,deliveryDigest:p.basis.deliveryDigest},target:p.target,proposedByRole:p.proposedByRole,proposedAt:p.proposedAt,basisNote:p.basisNote,confirmationMode:p.confirmationMode};}

/** Finite source targets only. This does not observe visibility, labels or submission. */
export function scopeTargetCandidates(quote:ProofQuote):ScopeTargetCandidate[]{
 const result:ScopeTargetCandidate[]=[];
 for(const[file,source]of Object.entries(quote.proof.delivery?.files??{})){
  try{if(assertStaticPath(file)!==file||staticFileKind(file)!=="html")continue;}catch{continue;}
  let malformed=false,visits=0;const doc=parse(source,{sourceCodeLocationInfo:true,onParseError:e=>{if(e.code!=="missing-doctype")malformed=true;}});
  let allForms=0;const ids=new Map<string,DefaultTreeAdapterTypes.Element[]>(),forms:DefaultTreeAdapterTypes.Element[]=[];
  const walk=(node:DefaultTreeAdapterTypes.Node,inactive=false,depth=0)=>{if(++visits>50000||depth>512){malformed=true;return;}let skip=inactive;if("tagName"in node){if(node.tagName==="form")allForms++;const id=node.attrs.find(a=>a.name==="id"&&!a.namespace)?.value;if(id){const rows=ids.get(id)??[];rows.push(node);ids.set(id,rows);}skip=skip||node.namespaceURI!=="http://www.w3.org/1999/xhtml"||["template","noscript","script","style","iframe","object","head"].includes(node.tagName)||node.attrs.some(a=>["hidden","inert"].includes(a.name)||a.name==="aria-hidden"&&a.value!=="false");if(!skip&&node.tagName==="form"&&node.sourceCodeLocation?.startTag&&node.sourceCodeLocation.endTag)forms.push(node);}if("childNodes"in node)for(const child of node.childNodes)walk(child,skip,depth+1);};walk(doc);
  if([...source.matchAll(/<form(?=[\s>])/giu)].length!==allForms)malformed=true;
  if(malformed)continue;result.push({target:{kind:"page",file},label:file});
  for(const form of forms){const formId=form.attrs.find(a=>a.name==="id"&&!a.namespace)?.value;if(formId&&formId.length<=120&&ids.get(formId)?.length===1)result.push({target:{kind:"form",file,formId},label:`${file} — form #${formId}`});}
 }return result;
}
export function assertScopeClarificationBounds(value:unknown):number{if(value===undefined)return 0;if(!Array.isArray(value)||value.length>MAX_PROPOSALS||bytes(value)>MAX_SCOPE_BYTES)fail("Scope history is full or invalid (12 proposals / 64 KiB). Existing decisions were retained.");return bytes(value);}
export function assessmentHistoryFor(quote:ProofQuote):ProofAssessment[]{const d=quote.proof.delivery;if(!d)return[];const rows=d.assessmentHistory??[];if(!Array.isArray(rows)||rows.length>MAX_ASSESSMENTS||new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>r.deliveryId!==d.id))fail("The four-report assessment history is full or invalid; existing reports were retained.");return rows;}
/** A file-only restriction, not admission of label semantics. Unsupported label
 * counts can still be clarified without contradicting this finite own-source file. */
function explicitNativeLabelFile(source:string):string|undefined{
 const fileToken="[A-Za-z0-9][A-Za-z0-9_./-]*\\.html",prefix=new RegExp(`^The form source in (${fileToken}) must `,"u").exec(source.trim());if(!prefix)return;
 let outside="",closing="";
 for(let i=0;i<source.length;i++){const c=source[i];if(closing){outside+=" ";if(c===closing)closing="";continue;}if(c==='"'||c==="“"||c==="「"||c==="`"||c==="'"&&!/[\p{L}\p{N}]/u.test(source[i-1]??"")){closing=c==="“"?"”":c==="「"?"」":c;outside+=" ";}else outside+=c;}
 if(closing||/\b(?:if|unless|whether|might|could|perhaps|hypothetical|example|unclear|unknown|not|doesn't)\b|\b(?:every|each|all|both)\s+(?:delivered\s+)?(?:pages?|forms?|files?)\b|如果|假如|是否|不确定|所有(?:页面|表单|文件)/iu.test(outside))return;
 const names=[...outside.matchAll(new RegExp(fileToken,"gu"))].map(m=>m[0]);if(names.length!==1||names[0]!==prefix[1])return;
 try{if(assertStaticPath(prefix[1])===prefix[1]&&staticFileKind(prefix[1])==="html")return prefix[1];}catch{return;}
}
async function validatedHistory(quote:ProofQuote,expectedMode:ScopeConfirmationMode):Promise<ScopeClarification[]>{
 assertScopeClarificationBounds(quote.proof.scopeClarifications);const rows=quote.proof.scopeClarifications??[],seen=new Set<string>();
 for(const p of rows){const r=object(p,["id","digest","criterionId","criterionSource","basis","target","proposedByRole","proposedAt","basisNote","confirmationMode","confirmations"]);text(r.id,100);if(seen.has(p.id))fail("A scope proposal id was reused.");seen.add(p.id);const criterion=quote.proof.criteria.find(c=>c.id===p.criterionId);if(!criterion||criterion.source!==p.criterionSource)fail("The scope proposal no longer matches its exact original criterion.");text(p.criterionSource,3000);const basis=object(p.basis,["deliveryId","deliveryDigest"]);text(basis.deliveryId,100);digest(basis.deliveryDigest);const t=target(p.target);role(p.proposedByRole);date(p.proposedAt);text(p.basisNote,1000);if(p.confirmationMode!==expectedMode)fail("The scope confirmation mode does not match this project.");if(!Array.isArray(p.confirmations)||p.confirmations.length>2)fail("Scope confirmations are invalid.");const roles=new Set<string>();for(const c of p.confirmations){object(c,["role","at","basisNote"]);role(c.role);if(roles.has(c.role)||date(c.at)<p.proposedAt)fail("Scope confirmations are duplicated or predate the proposal.");roles.add(c.role);text(c.basisNote,1000);}if(digest(p.digest)!==await sha(proposalBody(quote.id,{...p,target:t})))fail("The immutable scope proposal digest does not match.");
 }return rows;
}
function targetAllowed(quote:ProofQuote,criterionId:string,t:ScopeTarget,candidates:ScopeTargetCandidate[]):boolean{
 if(!candidates.some(c=>JSON.stringify(canonical(c.target))===JSON.stringify(canonical(t))))return false;
 const c=quote.proof.criteria.find(c=>c.id===criterionId)!;const native=parseNativeFormSourceDirective(c.source);if(native&&native.file!==t.file)return false;
 const explicit=explicitNativeLabelFile(c.source);if(explicit&&explicit!==t.file)return false;
 const hint=criterionOwnSourceTargetHint(c,quote.proof.delivery?.files??{},getBusinessCheckPlan(quote));
 return hint.basis!=="conflicting_explicit_and_locked"&&(!hint.establishedFiles.length||hint.establishedFiles.length===1&&hint.establishedFiles[0]===t.file);
}
/** expectedMode is an offline declared-envelope consistency context, never a request field. */
export async function resolveScopeClarifications(quote:ProofQuote,expectedMode=scopeConfirmationMode(quote)):Promise<ScopeContext>{
 const rows=await validatedHistory(quote,expectedMode),d=quote.proof.delivery,currentDigest=d?.files?await runtimeDeliveryDigest(d.files):undefined,candidates=scopeTargetCandidates(quote),bindings:ConfirmedScopeBinding[]=[];
 const states:ScopeClarificationState[]=quote.proof.criteria.map(c=>{const latest=rows.filter(p=>p.criterionId===c.id).at(-1);if(!latest)return{criterionId:c.id,status:"none"};
  if(!d||!currentDigest||!targetAllowed(quote,c.id,latest.target,candidates)||latest.basis.deliveryId===d.id&&latest.basis.deliveryDigest!==currentDigest)return{criterionId:c.id,latest,status:"unavailable",reason:"The agreed target does not resolve uniquely in this delivery, or its files changed."};
  if(latest.confirmations.length!==2)return latest.basis.deliveryId===d.id?{criterionId:c.id,latest,status:"pending"}:{criterionId:c.id,latest,status:"unavailable",reason:"Re-propose this unconfirmed scope against the current delivery."};
  bindings.push({proposalId:latest.id,proposalDigest:latest.digest,criterionId:c.id,criterionSource:c.source,file:latest.target.file,kind:latest.target.kind,...(latest.target.kind==="form"?{formId:latest.target.formId}:{}),basisDeliveryId:latest.basis.deliveryId,currentDeliveryId:d.id,currentDeliveryDigest:currentDigest,confirmationMode:expectedMode,carriedFromBasis:latest.basis.deliveryId!==d.id});return{criterionId:c.id,latest,status:"confirmed"};});
 const stamp={proposalCount:rows.length,confirmationCounts:rows.map(p=>p.confirmations.length)};return{states,bindings,contextDigest:await sha({projectId:quote.id,deliveryId:d?.id??null,deliveryDigest:currentDigest??null,criteria:quote.proof.criteria.map(c=>({id:c.id,source:c.source})),proposals:rows,bindings}),stamp};
}
export async function getConfirmedScopeBindings(quote:ProofQuote):Promise<ConfirmedScopeBinding[]>{return(await resolveScopeClarifications(quote)).bindings;}
/** Replays only the historical prefixes saved on THIS report. No stamp means legacy no-scope. */
export async function resolveAssessmentScopeContext(quote:ProofQuote,report:ProofAssessment,expectedMode=scopeConfirmationMode(quote)):Promise<ScopeContext>{
 if(report.deliveryId!==quote.proof.delivery?.id)fail("The report belongs to another delivery.");
 const all=await validatedHistory(quote,expectedMode),s=report.scopeContext;
 if(!s){const legacy=structuredClone(quote);delete legacy.proof.scopeClarifications;return resolveScopeClarifications(legacy,expectedMode);}
 object(s,["digest","proposalCount","confirmationCounts"]);digest(s.digest);if(!Number.isSafeInteger(s.proposalCount)||s.proposalCount<0||s.proposalCount>all.length||!Array.isArray(s.confirmationCounts)||s.confirmationCounts.length!==s.proposalCount)fail("The assessment scope prefix is invalid.");
 const historical=structuredClone(quote);historical.proof.scopeClarifications=all.slice(0,s.proposalCount).map((p,i)=>{const n=s.confirmationCounts[i];if(!Number.isSafeInteger(n)||n<0||n>p.confirmations.length)fail("The assessment confirmation prefix is invalid.");const confirmations=p.confirmations.slice(0,n);if(p.proposedAt>report.assessedAt||confirmations.some(c=>c.at>report.assessedAt))fail("The report predates its declared scope decisions.");return{...p,confirmations};});
 const context=await resolveScopeClarifications(historical,expectedMode);if(context.contextDigest!==s.digest)fail("The assessment scope context differs from its exact historical prefix.");return context;
}
function mutable(quote:ProofQuote,r:ProofRole){role(r);const d=quote.proof.delivery;if(!quote.proof.project||!quote.proof.collaboration||!d)fail("Scope clarification needs a current shared delivery.");if(quote.status!=="approved"||quote.proof.collaboration.stage==="accepted"||quote.proof.collaboration.acceptance?.deliveryId===d.id||quote.proof.acceptedDeliveryId===d.id||d.acceptanceEvidence?.length)fail("The accepted delivery scope is frozen. Existing decisions were retained.");if(quote.proof.paymentOperation||["captured","voided","closed_unpaid"].includes(quote.proof.paymentState)||d.runtimeRun||d.journeyRun||d.modelRun||d.transferCompetitionRun||d.enquiryRun)fail("Finish the pending operation before changing scope.");}
function archiveAssessment(quote:ProofQuote){const d=quote.proof.delivery!,rows=assessmentHistoryFor(quote);if(!d.assessment)return;if(rows.some(r=>r.id===d.assessment!.id)){if(JSON.stringify(rows.find(r=>r.id===d.assessment!.id))!==JSON.stringify(d.assessment))fail("An assessment id cannot be rewritten.");}else{if(rows.length>=MAX_ASSESSMENTS)fail("The four-report assessment history is full. Existing reports were retained.");d.assessmentHistory=[...rows,structuredClone(d.assessment)];}delete d.assessment;}
export async function applyScopeClarification(quote:ProofQuote,actorRole:ProofRole,value:unknown,at=new Date().toISOString()):Promise<ProofQuote>{
 mutable(quote,actorRole);date(at);const input=object(value,["action","deliveryId","criterionId","criterionSource","expectedLatestId","target","basisNote","proposalId","proposalDigest","confirm"]),d=quote.proof.delivery!,context=await resolveScopeClarifications(quote);
 if(input.deliveryId!==d.id)fail("The delivery changed. Refresh before clarifying its scope.");const note=text(input.basisNote,1000).trim(),next=structuredClone(quote),rows=next.proof.scopeClarifications??=[];
 if(input.action==="propose"){
  if(Object.keys(input).some(k=>!["action","deliveryId","criterionId","criterionSource","expectedLatestId","target","basisNote"].includes(k)))fail("A proposal contains unsupported fields.");
  const criterion=quote.proof.criteria.find(c=>c.id===input.criterionId),state=context.states.find(s=>s.criterionId===input.criterionId);if(!criterion||criterion.source!==input.criterionSource)fail("The original criterion changed.");if((state?.latest?.id??null)!==input.expectedLatestId)fail("A newer scope proposal exists. Refresh before proposing.");const t=target(input.target);if(!targetAllowed(quote,criterion.id,t,scopeTargetCandidates(quote)))fail("This target is unavailable or contradicts the original locked scope.");
  const p:ScopeClarification={id:crypto.randomUUID(),digest:"",criterionId:criterion.id,criterionSource:criterion.source,basis:{deliveryId:d.id,deliveryDigest:await runtimeDeliveryDigest(d.files)},target:t,proposedByRole:actorRole,proposedAt:at,basisNote:note,confirmationMode:scopeConfirmationMode(quote),confirmations:[]};p.digest=await sha(proposalBody(quote.id,p));rows.push(p);
 }else if(input.action==="confirm"){
  if(Object.keys(input).some(k=>!["action","deliveryId","proposalId","proposalDigest","confirm","basisNote"].includes(k))||input.confirm!==true)fail("Explicitly confirm this exact scope proposal.");
  const p=rows.find(p=>p.id===input.proposalId),state=p&&context.states.find(s=>s.criterionId===p.criterionId);if(!p||p.digest!==input.proposalDigest||state?.latest?.id!==p.id||state.status==="unavailable"||p.basis.deliveryId!==d.id)fail("This proposal is stale or unavailable. Refresh and re-propose if needed.");if(p.confirmations.some(c=>c.role===actorRole))return quote;p.confirmations.push({role:actorRole,at,basisNote:note});
 }else fail("Choose propose or confirm scope.");
 assertScopeClarificationBounds(rows);archiveAssessment(next);await resolveScopeClarifications(next);return next;
}
