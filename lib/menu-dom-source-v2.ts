import {parse,type DefaultTreeAdapterTypes} from "parse5";
import type {ProofAssessmentCitation,ProofBusinessCheckStep} from "./contracts.ts";
import {createIndependentSourceBusinessFactCheck,type SourceBusinessEvidence,type SourceBusinessCheckResult} from "./source-business-evidence.ts";

type Node=DefaultTreeAdapterTypes.Node;
type Element=DefaultTreeAdapterTypes.Element;
type Owner={text?:string;label?:string;price?:string;citation:ProofAssessmentCitation};
const HTML="http://www.w3.org/1999/xhtml";
const element=(node:Node):node is Element=>"tagName"in node;
const normalize=(value:string)=>value.replace(/[\t\n\f\r \u00a0]+/gu," ").trim();
const tokens=(node:Element)=>node.attrs.find(a=>a.name==="class")?.value.split(/[\t\n\f\r ]+/u).filter(Boolean)??[];
const unavailableTags=new Set(["head","template","script","style","noscript","textarea","xmp","iframe","frame","frameset","object","embed","slot","noembed","noframes","plaintext","details","dialog","datalist","select","option","optgroup"]);
const unsafe=(node:Element)=>node.namespaceURI!==HTML||unavailableTags.has(node.tagName)
 ||node.attrs.some(a=>!!a.namespace||!["id","class","title","lang"].includes(a.name))
 ||tokens(node).some(token=>!/^[A-Za-z_][A-Za-z0-9_-]{0,79}$/u.test(token)||/^(?:hidden|d-none|sr-only|visually-hidden|invisible|is-hidden)$/iu.test(token));
const amount=(value:string)=>{
 const match=/^(AUD|USD) *(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u.exec(value);if(!match)return;
 const amountMinor=Number(match[2])*100+Number((match[3]??"").padEnd(2,"0"));
 return Number.isSafeInteger(amountMinor)?{currency:match[1],amountMinor}:undefined;
};
const money=(currency:string,minor:number)=>`${currency} ${Math.trunc(minor/100)}.${String(minor%100).padStart(2,"0")}`;

/** Deliberately finite source ownership, not a DOM renderer. A new p/li
 * permits text/span/strong only; a card owns its direct h3 + p.price pair.
 * It never combines adjacent cards, rows or a loose title with a later price. */
function ownersFor(file:string,source:string):Owner[]|undefined{
 let invalid=false,visits=0;
 const document=parse(source,{sourceCodeLocationInfo:true,scriptingEnabled:true,onParseError:e=>{if(e.code!=="missing-doctype")invalid=true;}});
 if(invalid)return;
 const within=(depth:number)=>++visits<=50_000&&depth<=512;
 const bounds=(node:Element)=>{
  const at=node.sourceCodeLocation;
  if(!at?.startTag||!at.endTag||at.startOffset<0||at.endOffset>source.length||at.startTag.endOffset>at.endTag.startOffset)return;
  return at;
 };
 const accounted=(node:Element)=>{
  const at=bounds(node);if(!at)return false;let cursor=at.startTag!.endOffset;
  for(const child of node.childNodes){const span=child.sourceCodeLocation;
   if(!span||span.startOffset<cursor||span.endOffset>at.endTag!.startOffset||normalize(source.slice(cursor,span.startOffset)))return false;
   cursor=span.endOffset;
  }
  return !normalize(source.slice(cursor,at.endTag!.startOffset));
 };
 const inline=(node:Element,depth:number):string|undefined=>{
  if(!within(depth)||unsafe(node)||!accounted(node))return;
  let text="";
  for(const child of node.childNodes){
   if(child.nodeName==="#text"){if(!within(depth+1))return;text+=(child as DefaultTreeAdapterTypes.TextNode).value;}
   else if(element(child)&&["span","strong"].includes(child.tagName)){const value=inline(child,depth+1);if(value===undefined)return;text+=value;}
   else return;
  }
  return text;
 };
 const citation=(node:Element):ProofAssessmentCitation|undefined=>{
  const at=bounds(node);if(!at||at.endOffset<=at.startOffset||at.endOffset-at.startOffset>500)return;
  const excerpt=source.slice(at.startOffset,at.endOffset);if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(excerpt))return;
  return{file,start:at.startOffset,end:at.endOffset,excerpt};
 };
 const owners:Owner[]=[],stack:{node:Node;body:boolean;unsafe:boolean;cardAncestor:boolean;rowAncestor:boolean;depth:number}[]=[{node:document,body:false,unsafe:false,cardAncestor:false,rowAncestor:false,depth:0}];
 while(stack.length){
  const state=stack.pop()!,{node,depth}=state;if(!within(depth))return;
  let body=state.body,unavailable=state.unsafe,cardAncestor=state.cardAncestor,rowAncestor=state.rowAncestor;
  if(element(node)){
   if(node.namespaceURI!==HTML||unavailableTags.has(node.tagName))continue;
   body ||= node.tagName==="body";unavailable ||= unsafe(node);
   const card=node.tagName==="div"&&tokens(node).includes("menu-item"),row=["p","li"].includes(node.tagName);
   if(body&&!unavailable&&!cardAncestor&&!rowAncestor){
    const full=citation(node);
    if(card&&full&&accounted(node)){
     const children=node.childNodes.filter(child=>child.nodeName!=="#text"||normalize((child as DefaultTreeAdapterTypes.TextNode).value));
     if(children.length===2&&children.every(element)&&children[0].tagName==="h3"&&children[1].tagName==="p"&&tokens(children[1]).includes("price")){
      const label=inline(children[0],depth+1),price=inline(children[1],depth+1);
      if(label!==undefined&&price!==undefined)owners.push({label:normalize(label),price:normalize(price),citation:full});
     }
    }else if(row&&full){const text=inline(node,depth);if(text!==undefined)owners.push({text:normalize(text),citation:full});}
   }
   // A malformed/unmatched card cannot lend its inner price paragraph as a
   // standalone item. Likewise a nested block cannot escape its outer row.
   cardAncestor ||= card;rowAncestor ||= row;
  }
  if("childNodes"in node)for(let i=node.childNodes.length-1;i>=0;i--)stack.push({node:node.childNodes[i],body,unsafe:unavailable,cardAncestor,rowAncestor,depth:depth+1});
 }
 return owners;
}

/** Version2 augments ONLY the old finite reader's unlocated-owner case.
 * All v1 definitive values and other unknown reasons remain intact. In
 * particular this does not exempt scripts, duplicates, merged options, missing
 * files or parser/budget failures, and it makes no visibility claim. */
export function createMenuDomSourceBusinessFactCheckV2(files:Record<string,string>,savedSteps:readonly ProofBusinessCheckStep[]){
 const snapshot={...files},steps=structuredClone(savedSteps),legacy=createIndependentSourceBusinessFactCheck(snapshot,steps),parsed=new Map<string,Owner[]|undefined>();
 return(criterionId:string):SourceBusinessEvidence=>{
  const before=legacy(criterionId);if(before.kind==="not_applicable")return before;
  const checks=before.checks.map((prior):SourceBusinessCheckResult=>{
   if(prior.kind!=="unknown"||prior.reason!=="complex_or_unlocated_item")return prior;
   const step=steps.find(s=>s.checkId===prior.checkId&&s.criterionId===criterionId&&s.file===prior.file);if(!step||step.expected.kind!=="item_price"||!Object.hasOwn(snapshot,prior.file))return prior;
   if(!parsed.has(prior.file))parsed.set(prior.file,ownersFor(prior.file,snapshot[prior.file]));
   const owners=parsed.get(prior.file);if(!owners)return prior;
   const label=normalize(step.expected.label),matching=owners.filter(owner=>owner.label===undefined?owner.text?.startsWith(label):owner.label===label);
   if(matching.length!==1)return prior;
   const owner=matching[0],value=amount(owner.price??normalize(owner.text!.slice(label.length)));if(!value)return prior;
   const equal=value.currency===step.expected.currency&&value.amountMinor===step.expected.amountMinor;
   return{checkId:prior.checkId,file:prior.file,kind:equal?"unchanged":"mismatch",reason:equal?"menu_dom_price_equal_v2":"menu_dom_price_differs_v2",citation:owner.citation,label,expected:money(step.expected.currency,step.expected.amountMinor),actual:money(value.currency,value.amountMinor)};
  });
  const mismatches=checks.filter(c=>c.kind==="mismatch"),kind=mismatches.length?"mismatch":checks.some(c=>c.kind==="unknown")?"unknown":"unchanged";
  const cited=mismatches.length?mismatches:kind==="unknown"?checks.filter(c=>c.kind==="unknown"&&c.reason==="merged_price_options_unconfirmed"):[];
  const citations=cited.flatMap(c=>c.citation?[c.citation]:[]).filter((c,i,all)=>all.findIndex(other=>other.file===c.file&&other.start===c.start&&other.end===c.end)===i).slice(0,3);
  return{kind,checks,citations};
 };
}
