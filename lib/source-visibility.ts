import {parse,parseFragment,type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation, ProofQuote, ProofRole} from "./contracts.ts";
import {DomainError} from "./domain.ts";

export const SOURCE_VISIBILITY_WIDTHS = [375, 1280] as const;
export const SOURCE_VISIBILITY_LIMIT = 20;
export const SOURCE_VISIBILITY_CITATION_LIMIT = 24;
const EXCLUDED = new Set(["script", "style", "template", "noscript", "textarea", "title", "head", "svg", "math", "iframe", "xmp", "noembed", "noframes", "plaintext"]);
type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlElement = DefaultTreeAdapterTypes.Element;
export type VisibilityTarget = {path: number[]; tags: string[]; textIndex: number; value: string; sourceStart:number; sourceEnd:number};
export type SourceVisibilityCitation = {
 id: string; citation: ProofAssessmentCitation; references: string[];
 target?: VisibilityTarget; unsupported?: "non_html_source" | "non_body_text" | "partial_or_multiple_nodes" | "repeated_text" | "source_complexity";
};
export type SourceVisibilityPlan = {
 deliveryId: string; deliveryDigest: string; assessmentId: string; citations: SourceVisibilityCitation[];
 omittedCitations: number; widths: [375,1280];
};
export type VisibilityReason = "display_none" | "visibility_hidden" | "opacity_zero" | "content_hidden" | "ambiguous_text" | "not_visually_determined" | "styles_unverified" | "snapshot_mismatch" | "load_failed" | "timeout" | "access_denied" | "navigation_changed" | "unsupported_target" | "resource_limit" | "missing_file";
export type SourceVisibilityReading = {citationId: string; viewportWidth: 375 | 1280; state: "visible" | "hidden" | "ambiguous" | "unavailable"; reason?: VisibilityReason};
export type SourceVisibilityReport = {
 id: string; projectId: string; deliveryId: string; deliveryDigest: string; assessmentId: string;
 method: "client-source-visibility-v1"; reportedByRole: ProofRole; receivedAt: string;
 plan: SourceVisibilityPlan; readings: SourceVisibilityReading[];
 summary: {visible: number; hidden: number; ambiguous: number; unavailable: number};
};
const isElement = (node: HtmlNode): node is HtmlElement => "tagName" in node;
const normalized = (value: string) => value.replace(/\s+/gu," ").trim();
function object(value: unknown, allowed: readonly string[]): Record<string,unknown> {
 if (!value || typeof value!=="object" || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new DomainError("Source-visibility data must be plain objects.");
 const row=value as Record<string,unknown>;
 if(Reflect.ownKeys(row).some(key=>typeof key!=="string" || !allowed.includes(key) || !("value" in Object.getOwnPropertyDescriptor(row,key)!))) throw new DomainError("Source-visibility data contains an unsupported field.");
 return row;
}
const text=(value:unknown,max=200)=>{if(typeof value!=="string"||!value||value.length>max)throw new DomainError("Source-visibility identity or text is invalid.");return value;};
function sourceNodes(source:string): {start:number;end:number;target:VisibilityTarget}[] {
 const document=parse(source,{sourceCodeLocationInfo:true,scriptingEnabled:false});
 const pending:{node:HtmlNode;path:number[];tags:string[];body:boolean;excluded:boolean}[]=[{node:document,path:[],tags:[],body:false,excluded:false}];
 const rows:{start:number;end:number;target:VisibilityTarget}[]=[];let visited=0;
 while(pending.length){
  if(++visited>20000)throw new DomainError("Source citation exceeds the bounded DOM plan.");
  const {node,path,tags,body,excluded}=pending.pop()!;
  if(!("childNodes" in node))continue;
  const element=isElement(node),inside=body||element&&node.tagName==="body",skip=excluded||element&&(EXCLUDED.has(node.tagName)||node.namespaceURI!=="http://www.w3.org/1999/xhtml");
  if(skip)continue;
  let childElement=0,textIndex=0;
  for(const child of node.childNodes){
   if(isElement(child)){
    const nextPath=inside?[...path,childElement]:[],nextTags=inside?[...tags,child.tagName]:[];childElement++;
    if(child.tagName==="body")pending.push({node:child,path:[],tags:[],body:true,excluded:false});
    else pending.push({node:child,path:nextPath,tags:nextTags,body:inside,excluded:skip});
   }else if(child.nodeName==="#text"){
    const value=(child as DefaultTreeAdapterTypes.TextNode).value,loc=child.sourceCodeLocation;
    if(inside&&loc&&normalized(value).length>=2&&value.length<=1000&&path.length<=40)rows.push({start:loc.startOffset,end:loc.endOffset,target:{path,tags,textIndex,value,sourceStart:loc.startOffset,sourceEnd:loc.endOffset}});
    textIndex++;
   }
  }
 }
 return rows;
}
async function digestFiles(files:Record<string,string>){const bytes=new TextEncoder().encode(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,"en"))));return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");}
/** Plan only exact saved citations. Full text-node spans are required; no fuzzy
 * quote matching, invented selectors or caller-supplied URLs enter a browser. */
export async function sourceVisibilityPlan(quote:ProofQuote):Promise<SourceVisibilityPlan>{
 const delivery=quote.proof.delivery,assessment=delivery?.assessment,files=delivery?.files;
 if(!delivery||!files||!assessment||assessment.deliveryId!==delivery.id)throw new DomainError("Save an AI source assessment on the current delivery before observing its citations.",409);
 const all=new Map<string,{citation:ProofAssessmentCitation;references:string[]}>();
 const add=(citation:ProofAssessmentCitation,reference:string)=>{
  const source=files[citation.file];
  if(typeof source!=="string"||!Number.isSafeInteger(citation.start)||!Number.isSafeInteger(citation.end)||citation.start<0||citation.end<=citation.start||source.slice(citation.start,citation.end)!==citation.excerpt)throw new DomainError("The saved AI citation differs from its exact delivery source.",409);
  const key=JSON.stringify([citation.file,citation.start,citation.end]);const row=all.get(key);if(row)row.references.push(reference);else all.set(key,{citation:structuredClone(citation),references:[reference]});
 };
 for(const item of assessment.items)for(const citation of item.citations)add(citation,`criterion:${item.criterionId}`);
 for(const [index,risk]of assessment.risks.entries())for(const citation of risk.citations)add(citation,`risk:${index}`);
 const cache=new Map<string,ReturnType<typeof sourceNodes>|null>(),citations:SourceVisibilityCitation[]=[];
 for(const [index,row]of [...all.values()].slice(0,SOURCE_VISIBILITY_CITATION_LIMIT).entries()){
  const result:SourceVisibilityCitation={id:`citation-${index+1}`,...row};
  if(!/\.html?$/iu.test(row.citation.file)){result.unsupported="non_html_source";citations.push(result);continue;}
  if(!cache.has(row.citation.file)){try{cache.set(row.citation.file,sourceNodes(files[row.citation.file]));}catch{cache.set(row.citation.file,null);}}
  const nodes=cache.get(row.citation.file);if(!nodes){result.unsupported="source_complexity";citations.push(result);continue;}
  const exact=nodes.filter(node=>node.start>=row.citation.start&&node.end<=row.citation.end);
  if(exact.length!==1){result.unsupported=exact.length?"partial_or_multiple_nodes":"non_body_text";}
  else if(nodes.filter(node=>normalized(node.target.value)===normalized(exact[0].target.value)).length!==1){result.unsupported="repeated_text";}
  else result.target=structuredClone(exact[0].target);
  citations.push(result);
 }
 return{deliveryId:delivery.id,deliveryDigest:await digestFiles(files),assessmentId:assessment.id,citations,omittedCitations:Math.max(0,all.size-SOURCE_VISIBILITY_CITATION_LIMIT),widths:[375,1280]};
}
const reasons=new Set<VisibilityReason>(["display_none","visibility_hidden","opacity_zero","content_hidden","ambiguous_text","not_visually_determined","styles_unverified","snapshot_mismatch","load_failed","timeout","access_denied","navigation_changed","unsupported_target","resource_limit","missing_file"]);
const hiddenReasons=new Set<VisibilityReason>(["display_none","visibility_hidden","opacity_zero","content_hidden"]);
export function validateVisibilityReadings(plan:SourceVisibilityPlan,value:unknown):SourceVisibilityReading[]{
 if(!Array.isArray(value)||value.length!==plan.citations.length*2)throw new DomainError("Observe every planned citation at both widths; partial reports are not saved.");
 const readings:SourceVisibilityReading[]=[],seen=new Set<string>();
 for(const raw of value){
  const row=object(raw,["citationId","viewportWidth","state","reason"]),citation=plan.citations.find(c=>c.id===row.citationId),width=row.viewportWidth;
  if(!citation||width!==375&&width!==1280)throw new DomainError("Source-visibility reading is outside the saved plan.");
  const key=`${citation.id}:${width}`;if(seen.has(key))throw new DomainError("Source-visibility readings cannot repeat.");seen.add(key);
  if(!["visible","hidden","ambiguous","unavailable"].includes(row.state as string))throw new DomainError("Unknown source-visibility state.");
  if(row.state==="visible"&&row.reason!==undefined||row.state!=="visible"&&(!reasons.has(row.reason as VisibilityReason)))throw new DomainError("Source-visibility state needs a valid observation reason.");
  if(row.state==="hidden"&&!hiddenReasons.has(row.reason as VisibilityReason)||row.state==="ambiguous"&&row.reason!=="ambiguous_text"||row.state==="unavailable"&&(hiddenReasons.has(row.reason as VisibilityReason)||row.reason==="ambiguous_text"))throw new DomainError("Source-visibility state and reason disagree.");
  if(!citation.target&&(row.state!=="unavailable"||row.reason!=="unsupported_target"))throw new DomainError("Non-text or ambiguous source citations cannot become observed DOM text.");
  readings.push({citationId:citation.id,viewportWidth:width,state:row.state as SourceVisibilityReading["state"],...(row.reason?{reason:row.reason as VisibilityReason}:{})});
 }
 return plan.citations.flatMap(c=>SOURCE_VISIBILITY_WIDTHS.map(w=>readings.find(r=>r.citationId===c.id&&r.viewportWidth===w)!));
}
export function visibilitySummary(readings:SourceVisibilityReading[]){const summary={visible:0,hidden:0,ambiguous:0,unavailable:0};for(const reading of readings)summary[reading.state]++;return summary;}
export async function createSourceVisibilityReport(quote:ProofQuote,role:ProofRole,value:unknown,options:{id?:string;at?:string}={}):Promise<{report:SourceVisibilityReport;previousReportId:string|null}>{
 const input=object(value,["deliveryId","assessmentId","previousReportId","readings"]),plan=await sourceVisibilityPlan(quote);
 if(input.deliveryId!==plan.deliveryId||input.assessmentId!==plan.assessmentId)throw new DomainError("The delivery or AI assessment changed; repeat observations on the current version.",409);
 if(input.previousReportId!==null&&(typeof input.previousReportId!=="string"||!input.previousReportId||input.previousReportId.length>200))throw new DomainError("Refresh the previous source-visibility report before saving.",409);
 const readings=validateVisibilityReadings(plan,input.readings);
 const report:SourceVisibilityReport={id:options.id??crypto.randomUUID(),projectId:quote.id,deliveryId:plan.deliveryId,deliveryDigest:plan.deliveryDigest,assessmentId:plan.assessmentId,method:"client-source-visibility-v1",reportedByRole:role,receivedAt:options.at??new Date().toISOString(),plan,readings,summary:visibilitySummary(readings)};
 if(new TextEncoder().encode(JSON.stringify(report)).byteLength>128000)throw new DomainError("Source-visibility report exceeds the retained size limit.");
 return{report,previousReportId:input.previousReportId as string|null};
}
/** Storage validation cannot authenticate a browser. It preserves the saved
 * plan and re-derives all counts; current plans are separately re-derived. */
export function validateStoredVisibilityReport(value:unknown):SourceVisibilityReport{
 const r=object(value,["id","projectId","deliveryId","deliveryDigest","assessmentId","method","reportedByRole","receivedAt","plan","readings","summary"]);
 for(const key of ["id","projectId","deliveryId","assessmentId"]as const)text(r[key]);
 if(typeof r.deliveryDigest!=="string"||!/^\p{ASCII_Hex_Digit}{64}$/u.test(r.deliveryDigest)||r.method!=="client-source-visibility-v1"||!["buyer","seller"].includes(r.reportedByRole as string)||typeof r.receivedAt!=="string"||!Number.isFinite(Date.parse(r.receivedAt)))throw new DomainError("Saved source-visibility metadata is invalid.",503);
 const p=object(r.plan,["deliveryId","deliveryDigest","assessmentId","citations","omittedCitations","widths"]);
 if(p.deliveryId!==r.deliveryId||p.deliveryDigest!==r.deliveryDigest||p.assessmentId!==r.assessmentId||JSON.stringify(p.widths)!=="[375,1280]"||!Number.isSafeInteger(p.omittedCitations)||(p.omittedCitations as number)<0||!Array.isArray(p.citations)||p.citations.length>SOURCE_VISIBILITY_CITATION_LIMIT)throw new DomainError("Saved source-visibility plan is invalid.",503);
 for(const [index,raw]of p.citations.entries()){
  const c=object(raw,["id","citation","references","target","unsupported"]),citation=object(c.citation,["file","start","end","excerpt"]);text(citation.file);text(citation.excerpt,50000);
  if(c.id!==`citation-${index+1}`||!Number.isSafeInteger(citation.start)||!Number.isSafeInteger(citation.end)||(citation.start as number)<0||(citation.end as number)<=(citation.start as number)||(citation.end as number)-(citation.start as number)!==(citation.excerpt as string).length||!Array.isArray(c.references)||c.references.some(v=>typeof v!=="string"||v.length>220)||!!c.target===!!c.unsupported)throw new DomainError("Saved source-visibility citation is invalid.",503);
  if(c.target){
   const t=object(c.target,["path","tags","textIndex","value","sourceStart","sourceEnd"]);text(t.value,1000);
   if(!Array.isArray(t.path)||!Array.isArray(t.tags)||t.path.length!==t.tags.length||t.path.length>40||t.path.some(n=>!Number.isSafeInteger(n)||n<0||n>20000)||t.tags.some(n=>typeof n!=="string"||!/^[a-z0-9-]+$/u.test(n))||!Number.isSafeInteger(t.textIndex)||(t.textIndex as number)<0||!Number.isSafeInteger(t.sourceStart)||!Number.isSafeInteger(t.sourceEnd)||(t.sourceStart as number)<(citation.start as number)||(t.sourceEnd as number)>(citation.end as number)||(t.sourceEnd as number)<=(t.sourceStart as number))throw new DomainError("Saved source-visibility target is invalid.",503);
   const rawText=(citation.excerpt as string).slice((t.sourceStart as number)-(citation.start as number),(t.sourceEnd as number)-(citation.start as number)),fragment=parseFragment(rawText,{scriptingEnabled:false});
   if(fragment.childNodes.length!==1||fragment.childNodes[0].nodeName!=="#text"||(fragment.childNodes[0]as DefaultTreeAdapterTypes.TextNode).value!==t.value)throw new DomainError("Saved observed text differs from its exact cited source span.",503);
  }
  else if(!["non_html_source","non_body_text","partial_or_multiple_nodes","repeated_text","source_complexity"].includes(c.unsupported as string))throw new DomainError("Saved unsupported citation reason is invalid.",503);
 }
 const readings=validateVisibilityReadings(p as unknown as SourceVisibilityPlan,r.readings),summary=object(r.summary,["visible","hidden","ambiguous","unavailable"]),expectedSummary=visibilitySummary(readings);if((Object.keys(expectedSummary)as (keyof typeof expectedSummary)[]).some(key=>summary[key]!==expectedSummary[key]))throw new DomainError("Saved source-visibility counts disagree with retained readings.",503);
 return structuredClone(r)as unknown as SourceVisibilityReport;
}
