import {parse,type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation,ProofCriterion} from "./contracts.ts";
import {assertStaticPath,staticFileKind} from "./static-resources.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT} from "./assessment-limits.ts";

/** A closed source-fact descriptor. Admission and witnessing share this parser;
 * no descriptor proves rendering, validation, submission, storage or email. */
export type NativeFormSourceDirective =
  | {kind:"labels";file:string;labels:string[];owner:"form"}
  | {kind:"input_types";file:string;controls:{name:string;type:string}[]}
  | {kind:"choice_pairs";file:string;inputType:"radio"|"checkbox";name:string;pairs:{label:string;value:string}[]}
  | {kind:"time_attributes";file:string;name:string;type:"time";min:string;max:string;step:string};
export type NativeFormCitationCoverage={kind:"not_applicable"}|{kind:"covered";file:string}|{kind:"unknown";file:string;reason:string};
const FILE="[A-Za-z0-9][A-Za-z0-9_./-]*\\.html";
const TYPES=new Set(["text","tel","email","password","number","url","search","date","time","datetime-local","month","week","range","color","file","checkbox","radio","button","submit","reset","image"]);
const normalized=(value:string)=>value.replace(/[\t\n\f\r \u00a0]+/gu," ").trim();
const path=(value:string)=>{try{return assertStaticPath(value)===value&&staticFileKind(value)==="html";}catch{return false;}};
function literal(value:string):string|undefined{
  const text=value.trim(),quotes:Record<string,string>={'"':'"',"'":"'","“":"”","「":"」"};
  const end=quotes[text[0]];
  if(end){const body=text.slice(1,-1);return text.endsWith(end)&&body.length>0&&body.length<=120&&!body.includes(end)&&!/[\u0000-\u001f\u007f]/u.test(body)?normalized(body):undefined;}
  // Unquoted operands cannot consume a prior sentence terminator or another
  // grammar clause. Punctuated/action-like text is still valid literal data
  // when supplied inside one explicit balanced quotation above.
  if(/[.!?。！？;；]/u.test(text)||/\b(?:must|shall|should|will|can|could|would|may|then|also|but|however|actually|automatically)\b|\bas\s+label\s+text\b|\blabels\s+with\s+the\s+values\b|\bunder\s+the\b/iu.test(text))return;
  return /^[\p{L}\p{N}][\p{L}\p{N} :_/@+&'’()#$%-]{0,119}$/u.test(text)?normalized(text):undefined;
}
function identifier(value:string):string|undefined{const raw=value.trim(),result=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/u.test(raw)?raw:literal(raw);return result&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/u.test(result)?result:undefined;}
function list(value:string):string[]|undefined{
  const parts:string[]=[];let start=0,close="";
  for(let i=0;i<value.length;i++){
    const char=value[i];if(close){if(char===close)close="";continue;}
    if(char==='"'||char==="“"||char==="「"||char==="'"&&!value.slice(start,i).trim()){close=char==="“"?"”":char==="「"?"」":char;continue;}
    const separator=/^\s+and\s+/u.exec(value.slice(i));
    if(separator){parts.push(value.slice(start,i).trim());i+=separator[0].length-1;start=i+1;}
  }
  if(close)return;parts.push(value.slice(start).trim());
  return parts.length>=2&&parts.length<=6?parts:undefined;
}

/** Prefix recognition only closes malformed forms off from broader fallback
 * admission. A candidate is not an admitted or satisfied source requirement. */
export function isNativeFormSourceDirectiveCandidate(source:string):boolean{
  if(typeof source!=="string")return false;
  return /^The form source in\s+/u.test(source.trim())||/^The static source in\s+/u.test(source.trim())
    ||/^The source content in\s+[\s\S]+?\s+must\s+(?:pair|associate)\b/u.test(source.trim())||/^The static [\s\S]+?\s+control\s+in\s+[\s\S]+?\s+must\s+declare\b/u.test(source.trim());
}
export function parseNativeFormSourceDirective(source:string):NativeFormSourceDirective|undefined{
  if(typeof source!=="string")return;const text=source.trim();
  if(text.length>800||/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))return;
  let m=new RegExp(`^The form source in (${FILE}) must include (.+) as label text\\.$`,"u").exec(text);
  if(m){const labels=list(m[2])?.map(literal);if(path(m[1])&&labels?.every((v):v is string=>!!v)&&new Set(labels).size===labels.length)return{kind:"labels",file:m[1],labels,owner:"form"};return;}
  m=new RegExp(`^The static source in (${FILE}) must declare (.+)\\.$`,"u").exec(text);
  if(m){const parts=list(m[2]),controls=parts?.map(part=>{const row=/^(.+?) as (?:a|an) ([a-z][a-z-]{0,23}) input$/u.exec(part),name=row?identifier(row[1]):undefined;return row&&name&&TYPES.has(row[2])?{name,type:row[2]}:undefined;});
    if(path(m[1])&&controls?.every((v):v is {name:string;type:string}=>!!v)&&new Set(controls.map(c=>c.name)).size===controls.length)return{kind:"input_types",file:m[1],controls};return;}
  m=new RegExp(`^The source content in (${FILE}) must (?:pair|associate) (.+?) (radio|checkbox) labels with the values (.+?) under the (?:same )?(.+?) name\\.$`,"u").exec(text);
  if(m){const labels=list(m[2])?.map(literal),values=list(m[4])?.map(literal),name=identifier(m[5]);
    if(path(m[1])&&name&&labels?.every((v):v is string=>!!v)&&values?.every((v):v is string=>!!v)&&labels.length===values.length&&new Set(labels).size===labels.length)return{kind:"choice_pairs",file:m[1],inputType:m[3] as "radio"|"checkbox",name,pairs:labels.map((label,i)=>({label,value:values[i]}))};return;}
  m=new RegExp(`^The static (.+?) control in (${FILE}) must declare type time and min ([0-2][0-9]:[0-5][0-9]) and max ([0-2][0-9]:[0-5][0-9]) and step ([1-9][0-9]{0,5})\\.$`,"u").exec(text);
  if(m){const name=identifier(m[1]);if(name&&path(m[2])&&Number(m[3].slice(0,2))<24&&Number(m[4].slice(0,2))<24&&Number(m[5])<=86400)return{kind:"time_attributes",file:m[2],name,type:"time",min:m[3],max:m[4],step:m[5]};}
}

type Node=DefaultTreeAdapterTypes.Node;
type Element=DefaultTreeAdapterTypes.Element;
type Part={start:number;end:number;value:string};
type Control={node:Element;form?:Element;start:number;end:number};
type Label={node:Element;form?:Element;text:string;parts:Part[];controls:Element[]};
type Parsed={inputs:Control[];labels:Label[];ids:Map<string,Element[]>};
const element=(node:Node):node is Element=>"tagName"in node;
const attr=(node:Element,name:string)=>node.attrs.find(a=>a.name===name&&!a.namespace)?.value;
const INERT=new Set(["head","script","style","template","noscript","textarea","title","iframe","xmp","noembed","noframes","plaintext"]);
const LABELABLE=new Set(["input","button","select","textarea","meter","output","progress"]);
const blocked=(node:Element)=>node.namespaceURI!=="http://www.w3.org/1999/xhtml"||INERT.has(node.tagName)||node.attrs.some(a=>!!a.namespace||["hidden","inert","style","contenteditable"].includes(a.name)
  ||a.name==="aria-hidden"&&a.value.trim().toLowerCase()!=="false"||a.name==="class"&&/(?:^|\s)(?:hidden|d-none|sr-only|visually-hidden|invisible|is-hidden)(?:\s|$)/u.test(a.value));
function parsedSource(source:string):Parsed|undefined{
  let issue=false,visits=0;const document=parse(source,{sourceCodeLocationInfo:true,scriptingEnabled:true,onParseError:e=>{if(e.code!=="missing-doctype")issue=true;}});
  const result:Parsed={inputs:[],labels:[],ids:new Map()};
  const pending:{node:Node;form?:Element;excluded:boolean;labelAncestor:boolean;depth:number}[]=[{node:document,excluded:false,labelAncestor:false,depth:0}];
  while(pending.length){
    const{node,form,excluded,labelAncestor,depth}=pending.pop()!;if(++visits>50000||depth>512)return;
    let owner=form,skip=excluded;
    if(element(node)){
      const id=attr(node,"id");if(id){if(!result.ids.has(id))result.ids.set(id,[]);result.ids.get(id)!.push(node);}
      skip=skip||blocked(node)||node.tagName==="label"&&labelAncestor;if(node.tagName==="form")owner=node;
      const at=node.sourceCodeLocation;
      if(!skip&&node.tagName==="input"&&attr(node,"type")?.toLowerCase()!=="hidden"){
        if(!at?.startTag)return;result.inputs.push({node,form:owner,start:at.startTag.startOffset,end:at.startTag.endOffset});
      }
      if(!skip&&node.tagName==="label"){
        const parts:Part[]=[],controls:Element[]=[],stack:{node:Node;depth:number}[]=[{node,depth:0}];let labelIssue=false;
        while(stack.length){const next=stack.pop()!;if(++visits>50000||next.depth>512)return;
          if(next.node.nodeName==="#text"){
            const t=next.node as DefaultTreeAdapterTypes.TextNode,location=t.sourceCodeLocation;
            if(location)parts.push({start:location.startOffset,end:location.endOffset,value:t.value});else if(normalized(t.value))labelIssue=true;
          }else if(element(next.node)){
            if(next.node!==node&&LABELABLE.has(next.node.tagName)){if(next.node.tagName!=="input"||attr(next.node,"type")?.toLowerCase()!=="hidden")controls.push(next.node);continue;}
            if(next.node!==node&&(blocked(next.node)||next.node.tagName==="label")){labelIssue=true;continue;}
          }
          if("childNodes"in next.node)for(let i=next.node.childNodes.length-1;i>=0;i--)stack.push({node:next.node.childNodes[i],depth:next.depth+1});
        }
        if(!labelIssue)result.labels.push({node,form:owner,text:normalized(parts.map(p=>p.value).join("")),parts:parts.filter(p=>normalized(p.value)),controls});
      }
    }
    // Template fragments and foreign subtrees are intentionally not evidence.
    if("childNodes"in node)for(let i=node.childNodes.length-1;i>=0;i--)pending.push({node:node.childNodes[i],form:owner,excluded:skip,labelAncestor:labelAncestor||element(node)&&node.tagName==="label",depth:depth+1});
  }
  if(issue)return;
  // File-only name/type facts do not imply a form. Choice relationships apply
  // their separate actual-form owner check below, including form= retargeting.
  return result;
}
function coveredRange(citations:readonly ProofAssessmentCitation[],file:string,start:number,end:number):boolean{return citations.some(c=>c.file===file&&c.start<=start&&c.end>=end);}
function labelCovered(label:Label,source:string,citations:readonly ProofAssessmentCitation[],file:string):boolean{
  return label.parts.length>0&&label.parts.every(part=>{const raw=source.slice(part.start,part.end),leading=/^[\t\n\f\r \u00a0]*/u.exec(raw)![0].length,trailing=/[\t\n\f\r \u00a0]*$/u.exec(raw)![0].length;return coveredRange(citations,file,part.start+leading,part.end-trailing);});
}
function ownForm(control:Control,parsed:Parsed):boolean{
  if(!control.form)return false;const id=attr(control.node,"form");return id===undefined||attr(control.form,"id")===id&&parsed.ids.get(id)?.length===1;
}
function associated(label:Label,control:Control,parsed:Parsed):boolean{
  if(!ownForm(control,parsed)||label.form!==control.form)return false;
  const id=attr(label.node,"for");
  if(id!==undefined)return !!id&&attr(control.node,"id")===id&&parsed.ids.get(id)?.length===1;
  return label.controls.length===1&&label.controls[0]===control.node;
}

/** A negative-only witness for supplied exact source spans. Missing ownership,
 * malformed HTML, ambiguous names and uncovered attributes remain unknown;
 * this function never upgrades a model verdict or manufactures a citation. */
export function createNativeFormCitationCheck(files:Record<string,string>){
  const snapshot={...files},cache=new Map<string,Parsed|undefined>();
  const entries=Object.entries(snapshot),budgetOk=entries.length<=40&&entries.every(([,v])=>typeof v==="string")&&entries.reduce((n,[,v])=>n+new TextEncoder().encode(v).byteLength,0)<=256*1024;
  return(criterion:ProofCriterion,citations:readonly ProofAssessmentCitation[]):NativeFormCitationCoverage=>{
    const descriptor=parseNativeFormSourceDirective(criterion.source);if(!descriptor)return{kind:"not_applicable"};
    const file=descriptor.file,unknown=(reason:string):NativeFormCitationCoverage=>({kind:"unknown",file,reason});
    if(!budgetOk)return unknown("source_budget");if(!Object.hasOwn(snapshot,file))return unknown("file_unavailable");
    if(!Array.isArray(citations)||citations.length>ASSESSMENT_ITEM_CITATION_LIMIT||citations.some(c=>!c||!Object.hasOwn(snapshot,c.file)||!Number.isSafeInteger(c.start)||!Number.isSafeInteger(c.end)||c.start<0||c.end<=c.start||c.end>snapshot[c.file].length||snapshot[c.file].slice(c.start,c.end)!==c.excerpt))return unknown("invalid_citations");
    if(!cache.has(file))cache.set(file,parsedSource(snapshot[file]));const parsed=cache.get(file);if(!parsed)return unknown("source_unparseable");
    const source=snapshot[file],inputCovered=(control:Control)=>coveredRange(citations,file,control.start,control.end);
    if(descriptor.kind==="labels"){
      const groups=new Map<Element,Set<string>>();
      for(const label of parsed.labels)if(label.form&&descriptor.labels.includes(label.text)&&labelCovered(label,source,citations,file)){
        if(!groups.has(label.form))groups.set(label.form,new Set());groups.get(label.form)!.add(label.text);
      }
      const complete=[...groups.values()].filter(group=>descriptor.labels.every(text=>group.has(text)));
      return complete.length===1?{kind:"covered",file}:unknown(complete.length>1?"owner_not_unique":"label_not_witnessed");
    }
    if(descriptor.kind==="input_types"){
      for(const expected of descriptor.controls){const candidates=parsed.inputs.filter(control=>attr(control.node,"name")===expected.name);
        if(candidates.length!==1)return unknown("owner_not_unique");const control=candidates[0];
        if(attr(control.node,"type")?.toLowerCase()!==expected.type||!inputCovered(control))return unknown("attributes_not_witnessed");
      }return{kind:"covered",file};
    }
    if(descriptor.kind==="time_attributes"){
      const candidates=parsed.inputs.filter(control=>attr(control.node,"name")===descriptor.name);if(candidates.length!==1)return unknown("owner_not_unique");
      const control=candidates[0];return attr(control.node,"type")?.toLowerCase()==="time"&&["min","max","step"].every(key=>attr(control.node,key)===descriptor[key as "min"|"max"|"step"])&&inputCovered(control)?{kind:"covered",file}:unknown("attributes_not_witnessed");
    }
    const groups=new Map<Element,Map<number,Control>>();
    for(const[pairIndex,pair]of descriptor.pairs.entries()){
      // Establish the owner independently of the expected value and citations.
      // A second same-label control with the wrong value is still ambiguous;
      // selecting only the desired value would silently hide that conflict.
      const candidates=parsed.inputs.filter(control=>attr(control.node,"type")?.toLowerCase()===descriptor.inputType&&attr(control.node,"name")===descriptor.name&&ownForm(control,parsed));
      const matches=candidates.flatMap(control=>parsed.labels.filter(label=>label.text===pair.label&&associated(label,control,parsed)).map(label=>({control,label})));
      const byForm=new Map<Element,{control:Control;label:Label}[]>();
      for(const match of matches){if(!byForm.has(match.control.form!))byForm.set(match.control.form!,[]);byForm.get(match.control.form!)!.push(match);}
      for(const[form,owners]of byForm)if(owners.length===1){
        const{control,label}=owners[0];
        if(attr(control.node,"value")===pair.value&&labelCovered(label,source,citations,file)&&inputCovered(control)){
          if(!groups.has(form))groups.set(form,new Map());groups.get(form)!.set(pairIndex,control);
        }
      }
    }
    const complete=[...groups.values()].filter(group=>group.size===descriptor.pairs.length&&new Set([...group.values()].map(control=>control.node)).size===descriptor.pairs.length);
    return complete.length===1?{kind:"covered",file}:unknown(complete.length>1?"owner_not_unique":"pair_not_witnessed");
  };
}
