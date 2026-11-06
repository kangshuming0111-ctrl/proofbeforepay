import {parse,type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation,ProofAssessmentSourceFinding,ProofAssessment} from "./contracts.ts";
import {resolveStaticReference,staticFileKind} from "./static-resources.ts";

type Node=DefaultTreeAdapterTypes.Node;type Element=DefaultTreeAdapterTypes.Element;
const element=(node:Node):node is Element=>"tagName"in node;
const SPACE=/[\t\n\f\r ]+/u;
const STATIC_TAGS=new Set(["html","head","title","meta","link","body","main","section","article","header","footer","nav","div","p","ul","ol","li","h1","h2","h3","h4","h5","h6","br","hr","span","strong","a","table","thead","tbody","tfoot","tr","td","th"]);
const HIDDEN_CLASS=/^(?:hidden|invisible|d-none|sr-only|visually-hidden|is-hidden|offscreen|opacity-0)$/iu;
function lengths(value:string,allowAuto=false):boolean{
 const parts=value.split(SPACE);if(!parts.length||parts.length>4)return false;
 return parts.every(part=>{
  if(allowAuto&&part==="auto")return true;
  const m=/^(\d+(?:\.\d{1,3})?|\.\d{1,3})(px|rem|em)?$/u.exec(part);if(!m)return false;
  const n=Number(m[1]);return n===0||!!m[2]&&n>0&&n<=(m[2]==="px"?64:4);
 });
}
function declaration(property:string,value:string):boolean{
 if(property==="font-family")return value.split(",").every(v=>/^(?:system-ui|sans-serif|serif|monospace|arial|helvetica)$/u.test(v.trim()));
 if(property==="font-weight")return /^(?:normal|bold|[4-7]00)$/u.test(value);
 if(["margin","margin-top","margin-right","margin-bottom","margin-left"].includes(property))return lengths(value,true);
 if(["padding","padding-top","padding-right","padding-bottom","padding-left","gap","row-gap","column-gap"].includes(property))return lengths(value);
 if(property==="max-width"){
  const m=/^(\d+(?:\.\d{1,3})?|\.\d{1,3})(px|rem|em)$/u.exec(value);if(!m)return false;const n=Number(m[1]);return m[2]==="px"?n>=256&&n<=1920:n>=16&&n<=120;
 }
 if(property==="display")return /^(?:block|inline|inline-block|flex)$/u.test(value);
 if(property==="flex-wrap")return /^(?:wrap|nowrap)$/u.test(value);
 if(["justify-content","align-items"].includes(property))return /^(?:normal|start|end|center|stretch|space-between|space-around|baseline)$/u.test(value);
 if(property==="border")return /^(?:none|0|(?:[1-4](?:\.\d)?|0\.\d)px\s+(?:solid|dashed|dotted)\s+#[0-9a-f]{3}(?:[0-9a-f]{3})?)$/u.test(value);
 return false;
}
/** A small CLOSED stylesheet grammar, not a cascade/renderer. Every token is
 * consumed. Unknown styling remains unknown; no stripping/masking source. */
export function isFiniteMenuStylesheetV2(source:string):boolean{
 if(source.length>65536||/[\\@!()"'\[\]]|\/\*|\*\//u.test(source))return false;
 const rules=/([^{}]+)\{([^{}]*)\}/gu;let cursor=0,count=0;
 for(const match of source.matchAll(rules)){
  if(++count>300||source.slice(cursor,match.index).trim())return false;cursor=match.index+match[0].length;
  const selectors=match[1].trim().split(",");
  if(!selectors.length||selectors.some(s=>!s.trim()||!s.trim().split(/\s*>\s*|\s+/u).every(token=>/^(?:[a-z][a-z0-9-]*)?(?:[.#][a-z_][a-z0-9_-]*)*$/iu.test(token)&&!!token)))return false;
  const values=match[2].split(";");if(values.length>50)return false;
  for(const part of values){if(!part.trim())continue;const pair=/^\s*([a-z-]+)\s*:\s*([^:]+?)\s*$/iu.exec(part);if(!pair||!declaration(pair[1].toLowerCase(),pair[2].trim().toLowerCase()))return false;}
 }
 return !source.slice(cursor).trim();
}
const exact=(files:Record<string,string>,c:ProofAssessmentCitation)=>Object.hasOwn(files,c.file)&&staticFileKind(c.file)==="html"&&Number.isSafeInteger(c.start)&&Number.isSafeInteger(c.end)&&c.start>=0&&c.end>c.start&&c.end<=files[c.file].length&&c.end-c.start===c.excerpt.length&&c.excerpt.length<=500&&files[c.file].slice(c.start,c.end)===c.excerpt;

/** Finite static source qualification only. It cannot establish visibility,
 * touch usability, navigation or actual execution. The reader owns price facts.
 * This predicate is shared by restoration AND every final schema2 price pass. */
export function isMenuSourcePublicationSafeV2(files:Record<string,string>,citations:readonly ProofAssessmentCitation[]):boolean{
 if(!citations.length||citations.length>6||!citations.every(c=>exact(files,c)))return false;
 for(const[file,source]of Object.entries(files))if(staticFileKind(file)==="css"&&!isFiniteMenuStylesheetV2(source))return false;
 const found=new Set<number>();
 for(const file of new Set(citations.map(c=>c.file))){
  const source=files[file];let invalid=false,visits=0;
  const document=parse(source,{sourceCodeLocationInfo:true,scriptingEnabled:true,onParseError:e=>{if(e.code!=="missing-doctype")invalid=true;}});if(invalid)return false;
  const stack:{node:Node;body:boolean;depth:number}[]=[{node:document,body:false,depth:0}];
  while(stack.length){
   const{node,body,depth}=stack.pop()!;if(++visits>50000||depth>512)return false;let inside=body;
   if(element(node)){
    if(node.namespaceURI!=="http://www.w3.org/1999/xhtml")return false;
    if(node.tagName==="template"){if(node.attrs.length)return false;continue;}
    if(!STATIC_TAGS.has(node.tagName)||node.attrs.some(a=>!!a.namespace))return false;
    const attrs=new Map(node.attrs.map(a=>[a.name,a.value]));const allowed=new Set(["id","title","lang","class"]);
    if(node.tagName==="meta"){
     if(attrs.size===1&&attrs.has("charset")){if(!/^(?:utf-8|utf8)$/iu.test(attrs.get("charset")!))return false;}
     else if(attrs.size===2&&attrs.get("name")?.toLowerCase()==="viewport"&&/^width\s*=\s*device-width\s*,\s*initial-scale\s*=\s*1(?:\.0)?$/iu.test(attrs.get("content")??"")){}
     else return false;
     allowed.clear();for(const name of["charset","name","content"])allowed.add(name);
    }else if(node.tagName==="link"){
     if(attrs.size!==2||attrs.get("rel")?.toLowerCase()!=="stylesheet")return false;
     const target=resolveStaticReference(file,attrs.get("href")??"");if(!target||staticFileKind(target)!=="css"||!Object.hasOwn(files,target))return false;allowed.clear();allowed.add("rel");allowed.add("href");
    }else if(node.tagName==="a"){
     const target=resolveStaticReference(file,attrs.get("href")??"");if(!target||staticFileKind(target)!=="html"||!Object.hasOwn(files,target))return false;allowed.add("href");
    }
    if(node.attrs.some(a=>!allowed.has(a.name)))return false;
    if(attrs.has("class")){
     const names=attrs.get("class")!.trim().split(SPACE);if(!names.length||names.length>8||names.some(name=>!/^[a-z_][a-z0-9_-]{0,63}$/iu.test(name)||HIDDEN_CLASS.test(name)))return false;
    }
    inside ||= node.tagName==="body";
    const owner=inside&&(["p","li","tr"].includes(node.tagName)||node.tagName==="div"&&attrs.get("class")?.trim().split(SPACE).includes("menu-item"));
    const at=node.sourceCodeLocation;
    if(owner&&at?.startTag&&at.endTag)for(const[index,c]of citations.entries())if(c.file===file&&at.startOffset===c.start&&at.endOffset===c.end)found.add(index);
   }
   if("childNodes"in node)for(const child of node.childNodes)stack.push({node:child,body:inside,depth:depth+1});
  }
 }
 return found.size===citations.length;
}

/** Canonical independently rederived fact enters here, never model prose or an
 * unvalidated imported fact. Complete original quotes must cover every owner. */
export function assessMenuPricePublicationAdmissionV2(files:Record<string,string>,fact:ProofAssessmentSourceFinding|undefined,rawCitations:readonly ProofAssessmentCitation[],coverage:ProofAssessment["coverage"]):boolean{
 const textFile=(file:string)=>["html","css"].includes(staticFileKind(file)??"");
 if(!coverage||coverage.omittedFiles.some(textFile)||coverage.truncatedFiles.some(textFile)
  ||Object.keys(files).filter(textFile).some(file=>!coverage.includedFiles.includes(file))
  ||coverage.includedFiles.filter(textFile).some(file=>!Object.hasOwn(files,file)))return false;
 if(!fact||fact.version!=="source-finding-v2"||fact.status!=="supported"||fact.basis!=="locked_business_values"
  ||!rawCitations.length||rawCitations.length>6||!rawCitations.every(c=>exact(files,c))||!isMenuSourcePublicationSafeV2(files,fact.citations))return false;
 return fact.citations.every(owner=>rawCitations.some(raw=>raw.file===owner.file&&raw.start<=owner.start&&raw.end>=owner.end&&raw.excerpt.slice(owner.start-raw.start,owner.end-raw.start)===owner.excerpt));
}
