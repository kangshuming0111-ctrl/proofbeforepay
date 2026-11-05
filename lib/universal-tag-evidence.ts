import {parse, type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation, ProofCriterion} from "./contracts.ts";
import {normalizeExactCopyWhitespace as normalized} from "./exact-copy-directive.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";

type Node=DefaultTreeAdapterTypes.Node;
type Element=DefaultTreeAdapterTypes.Element;
type TextPart={text:string;owner?:Element;unsafe:boolean};
type Parsed={parts:TextPart[];safe:boolean};
type Money={glyph:string;minor:number};
type Directive={scope:string;family:"attach"|"pair";label:string;tag:string;price?:Money};
export type UniversalTagEvidence={kind:"not_applicable"|"covered"|"unknown";reason?:string};
const BLOCKS=new Set(["p","li","div","tr"]);
const INERT=new Set(["head","script","style","template","noscript","textarea","title","iframe","xmp","noembed","noframes","plaintext"]);
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const UNSUPPORTED=/\b(?:not|never|no|without|unless|if|when|except|only|exact|verbatim|literal|actually|runtime|visible|visibility|render(?:ed|ing)?|click|interactive|interactivity|submit|submission|persist|storage|backend|database|payment|checkout|refund|mobile|responsive)\b/iu;
const money=(value:string):Money|undefined=>{
 const m=/^([$£€¥₹])\s*(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/u.exec(normalized(value));
 if(!m)return;
 return{glyph:m[1],minor:Number(m[2])*100+Number((m[3]??"").padEnd(2,"0"))};
};
const element=(node:Node):node is Element=>"tagName" in node;
const unknown=(reason:string):UniversalTagEvidence=>({kind:"unknown",reason});

/** These entire instructions name source facts, not rendered food safety or
 * business operation. Nearby wording never inherits their finite allowance. */
function directive(criterion:ProofCriterion):Directive|"unsupported"|undefined{
 const source=typeof criterion.source==="string"?criterion.source.trim():"";
 const candidate=/\bsource\s+content\b/iu.test(source)&&/\b(?:tags?|tagged)\b/iu.test(source)
  &&/\b(?:homepage|full\s+menu|[a-z0-9_/-]+\.html)\b/iu.test(source);
 if(!candidate)return;
 if(CONTROL.test(source)||/[\r\n]/u.test(source)||UNSUPPORTED.test(`${criterion.title}\n${source}`))return"unsupported";
 const attach=/^(?:The\s+)?(.+?)\s+source\s+content\s+must\s+both\s+attach\s+the\s+([A-Z]{1,8})\s+tag\s+to\s+(.{1,80}?)\.?$/iu.exec(source);
 const pair=/^(?:The\s+)?(.+?)\s+source\s+content\s+must\s+each\s+pair\s+(.{1,80}?)\s+with\s+the\s+([A-Z]{1,8})\s+tag(?:\s+and\s+advertised\s+price\s+([$£€¥₹]\s*(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?))?\.?$/iu.exec(source);
 if(!attach&&!pair)return"unsupported";
 const scope=(attach??pair)![1],label=normalized(attach?attach[3]:pair![2]),tag=attach?attach[2]:pair![3];
 if(!/^[A-Z]{1,8}$/u.test(tag)||!label||label.length>80||label===tag
  ||!/^[\p{L}\p{N}][\p{L}\p{N} '’&.,()/-]*$/u.test(label)||/\b(?:and|or|but|also|plus)\b/iu.test(label))return"unsupported";
 const price=pair?.[4]?money(pair[4]):undefined;
 if(pair?.[4]&&!price)return"unsupported";
 return{scope,family:attach?"attach":"pair",label,tag,...(price?{price}:{})};
}

function pages(d:Directive):string[]|undefined{
 const scope=normalized(d.scope);
 // A required-file list is not a buyer-confirmed mapping of business page
 // roles. Even exactly two files cannot establish which one is the full menu.
 // Recognised role-only instructions stay unknown until such a mapping exists.
 if(/\b(?:homepage|full\s+menu)\b/iu.test(scope))return;
 const explicit=scope.split(/\s+and\s+/iu);
 return explicit.length>=2&&explicit.length<=10&&new Set(explicit).size===explicit.length&&explicit.every(validHtmlPath)?explicit:undefined;
}
function validHtmlPath(file:string):boolean{
 return typeof file==="string"&&file.length<=300&&/^[a-z0-9][a-z0-9_./-]*\.html$/iu.test(file)
  &&file.split("/").every(part=>part!=="."&&part!==".."&&part!=="");
}
function unsafeElement(node:Element):boolean{
 return node.namespaceURI!=="http://www.w3.org/1999/xhtml"||INERT.has(node.tagName)||node.attrs.some(a=>
  !!a.namespace||a.name==="hidden"||a.name==="inert"||a.name==="style"||a.name==="contenteditable"
  ||a.name==="aria-hidden"&&a.value.toLowerCase()!=="false"
  ||/^on|^(?:v-|x-|ng-|:|@)|^(?:data-bind|data-template|data-dynamic|data-content)$/u.test(a.name)
  ||a.name==="class"&&/(?:^|\s)(?:hidden|d-none|sr-only|visually-hidden|invisible|is-hidden)(?:\s|$)/u.test(a.value));
}
function children(node:Node):Node[]{
 if(element(node)&&node.tagName==="template"&&"content" in node)return [...node.childNodes,...(node.content as DefaultTreeAdapterTypes.DocumentFragment).childNodes];
 return"childNodes" in node?node.childNodes:[];
}
function parseBody(source:string):Parsed{
 let issue=false,visits=0;
 const document=parse(source,{sourceCodeLocationInfo:true,scriptingEnabled:true,onParseError:e=>{if(e.code!=="missing-doctype")issue=true;}});
 const pending:{node:Node;body:boolean;unsafe:boolean;owner?:Element;depth:number}[]=[{node:document,body:false,unsafe:false,depth:0}],parts:TextPart[]=[];
 while(pending.length){
  const current=pending.pop()!;if(++visits>50_000||current.depth>512)return{parts:[],safe:false};
  const {node}=current;let body=current.body,unsafe=current.unsafe,owner=current.owner;
  if(element(node)){
   if(node.tagName==="body"&&node.namespaceURI==="http://www.w3.org/1999/xhtml")body=true;
   unsafe=unsafe||unsafeElement(node);
   if(BLOCKS.has(node.tagName))owner=node;
  }
  if(body&&node.nodeName==="#text"){
   const text=normalized((node as DefaultTreeAdapterTypes.TextNode).value);
   if(text)parts.push({text,owner,unsafe:unsafe||/\{\{|\{%|\$\{|\[\[/u.test(text)});
  }
  const next=children(node);
  for(let i=next.length-1;i>=0;i--)pending.push({node:next[i],body,unsafe,owner,depth:current.depth+1});
 }
 return{parts,safe:!issue};
}
function mentions(text:string,label:string):boolean{
 let at=0;
 while((at=text.indexOf(label,at))>=0){
  const before=text[at-1]??"",after=text[at+label.length]??"";
  if(!/[\p{L}\p{N}_]/u.test(before)&&!/[\p{L}\p{N}_]/u.test(after))return true;
  at+=label.length;
 }
 return false;
}
function simpleOwner(owner:Element):boolean{
 const pending:Node[]=[owner];let visits=0;
 while(pending.length){
  const node=pending.pop()!;if(++visits>2_000)return false;
  if(element(node)&&(unsafeElement(node)||node!==owner&&BLOCKS.has(node.tagName)))return false;
  pending.push(...children(node));
 }
 return true;
}

/** Negative-only witness for the two finite universal-tag source families.
 * A covered result never upgrades an unknown/changes result and establishes
 * neither visibility, nutritional correctness nor actual business operation. */
export function createUniversalTagEvidenceCheck(files:Record<string,string>,requiredPages:readonly string[]){
 const snapshot:Record<string,string>={},parsed=new Map<string,Parsed>();let valid=true,total=0;
 const descriptors=Object.getOwnPropertyDescriptors(files);
 if(Object.keys(descriptors).length>40)valid=false;
 for(const [file,descriptor] of Object.entries(descriptors)){
  if(!("value" in descriptor)||typeof descriptor.value!=="string"){valid=false;continue;}
  if(!/\.(?:html|css)$/iu.test(file))continue;
  const source=descriptor.value as string;total+=source.length;
  if(source.length>65_536||CONTROL.test(source))valid=false;
  snapshot[file]=source;
 }
 if(total>262_144)valid=false;
 const validPageList=Array.isArray(requiredPages)&&requiredPages.length>=1&&requiredPages.length<=10&&requiredPages.every(validHtmlPath);
 return(criterion:ProofCriterion,citations:readonly ProofAssessmentCitation[]):UniversalTagEvidence=>{
  const d=directive(criterion);if(!d)return{kind:"not_applicable"};
  if(d==="unsupported")return unknown("unsupported_requirement");
  if(!valid)return unknown("source_limit");
  const scoped=pages(d);if(!validPageList||!scoped)return unknown("unconfirmed_page_scope");
  if(!Array.isArray(citations)||citations.length>ASSESSMENT_ITEM_CITATION_LIMIT||citations.some(c=>
   !Object.hasOwn(snapshot,c.file)||!Number.isSafeInteger(c.start)||!Number.isSafeInteger(c.end)||c.start<0||c.end<=c.start
   ||c.end>snapshot[c.file].length||typeof c.excerpt!=="string"||!c.excerpt.trim()||c.excerpt.length>500||snapshot[c.file].slice(c.start,c.end)!==c.excerpt))return unknown("invalid_citations");
  for(const file of scoped){
   if(!Object.hasOwn(snapshot,file))return unknown("unavailable_source");
   const source=snapshot[file];if(!parsed.has(file))parsed.set(file,parseBody(source));const document=parsed.get(file)!;
   if(!document.safe)return unknown("unsafe_source_context");
   const labels=document.parts.filter(p=>mentions(p.text,d.label));
   if(labels.length!==1||labels[0].text!==d.label)return unknown("ambiguous_body_label");
   const label=labels[0],owner=label.owner,at=owner?.sourceCodeLocation;
   if(label.unsafe||!owner||!at?.startTag||!at.endTag||at.endOffset-at.startOffset>500||!simpleOwner(owner))return unknown("unsafe_source_owner");
   const group=document.parts.filter(p=>p.owner===owner);
   if(group.some(p=>p.unsafe))return unknown("unsafe_source_owner");
   const tags=group.filter(p=>p.text===d.tag),prices=group.flatMap(p=>{const value=money(p.text);return value?[value]:[];});
   if(tags.length!==1)return unknown("owner_tag_unverified");
   if(group.some(p=>p.text!==d.label&&p.text!==d.tag&&!money(p.text)))return unknown("owner_text_ambiguous");
   if(prices.length>1||d.price&&(prices.length!==1||prices[0].glyph!==d.price.glyph||prices[0].minor!==d.price.minor))return unknown("owner_price_unverified");
   if(!citations.some(c=>c.file===file&&c.start<=at.startOffset&&c.end>=at.endOffset))return unknown("owner_evidence_incomplete");
  }
  return{kind:"covered"};
 };
}
