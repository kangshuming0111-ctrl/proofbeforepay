import {parse,type DefaultTreeAdapterMap} from "parse5";

export const SELLER_ONBOARDING_DOCUMENT_LIMITS=Object.freeze({maxBytes:256*1024,maxNodes:4096,maxDepth:64}as const);
export type OnboardingDocumentIssue="html_size_or_encoding"|"html_node_limit"|"html_depth_limit"|"html_parse_unavailable";
export type OnboardingNode=DefaultTreeAdapterMap["node"];
export type OnboardingElement=DefaultTreeAdapterMap["element"];
export type OnboardingDocument={ok:true;bytes:number;nodes:OnboardingElement[]}|{ok:false;bytes:number;code:OnboardingDocumentIssue};
export function onboardingElement(node:OnboardingNode):node is OnboardingElement{return"tagName"in node;}
export function onboardingAttribute(node:OnboardingElement,name:string){return node.attrs.find(a=>a.name===name)?.value;}
export function onboardingParent(node:OnboardingNode):OnboardingElement|undefined{const parent="parentNode"in node?node.parentNode:undefined;return parent&&onboardingElement(parent)?parent:undefined;}
export function onboardingAncestor(node:OnboardingElement,predicate:(element:OnboardingElement)=>boolean){let current:OnboardingElement|undefined=node;while(current){if(predicate(current))return true;current=onboardingParent(current);}return false;}
/** Only the bounded active parse tree is considered. Template contents are
 * inert and are not traversed as if they were live form controls. */
export function readOnboardingDocument(html:unknown):OnboardingDocument{
 if(typeof html!=="string")return{ok:false,bytes:0,code:"html_size_or_encoding"};
 const bytes=new TextEncoder().encode(html).byteLength;
 if(bytes>SELLER_ONBOARDING_DOCUMENT_LIMITS.maxBytes||html.includes("\0")||[...html].some(char=>{const code=char.codePointAt(0)!;return code>=0xd800&&code<=0xdfff;}))return{ok:false,bytes,code:"html_size_or_encoding"};
 try{
  const root=parse(html,{sourceCodeLocationInfo:true}),stack:{node:OnboardingNode;depth:number}[]=[{node:root,depth:0}],nodes:OnboardingElement[]=[];let count=0;
  while(stack.length){const{node,depth}=stack.pop()!;if(++count>SELLER_ONBOARDING_DOCUMENT_LIMITS.maxNodes)return{ok:false,bytes,code:"html_node_limit"};if(depth>SELLER_ONBOARDING_DOCUMENT_LIMITS.maxDepth)return{ok:false,bytes,code:"html_depth_limit"};if(onboardingElement(node))nodes.push(node);if("childNodes"in node)for(let i=node.childNodes.length-1;i>=0;i--)stack.push({node:node.childNodes[i],depth:depth+1});}
  return{ok:true,bytes,nodes};
 }catch{return{ok:false,bytes,code:"html_parse_unavailable"};}
}
