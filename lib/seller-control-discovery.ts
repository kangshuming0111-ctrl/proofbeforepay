import {readOnboardingDocument,SELLER_ONBOARDING_DOCUMENT_LIMITS,onboardingAncestor,onboardingAttribute as attr,onboardingElement,onboardingParent,type OnboardingDocumentIssue,type OnboardingElement,type OnboardingNode} from "./onboarding-document.ts";
import {ONBOARDING_SELECTOR_FIELDS,matchOnboardingSelector} from "./seller-onboarding.ts";

export {SELLER_ONBOARDING_DOCUMENT_LIMITS} from "./onboarding-document.ts";
export type SellerControlReason="label_match"|"aria_match"|"name_match"|"id_match"|"form_context"|"control_type"|"protocol_options"|"result_role";
export type SellerControlCandidate={id:string;selector:string;tagName:string;inputType?:string;label:string;formLabel:string;source:{line:number;column:number;startOffset:number;endOffset:number};reasons:SellerControlReason[]};
export type SellerControlDiscoveryField={key:string;state:"candidate"|"ambiguous"|"missing"|"unsupported";candidates:SellerControlCandidate[];reason?:"document_unavailable"|"no_matching_control"|"no_stable_selector"|"candidate_limit"};
export type SellerControlDiscovery={schema:"pbp-seller-control-discovery-v1";source:{sha256:string|null;bytes:number};validDocument:boolean;documentIssue?:OnboardingDocumentIssue;fields:SellerControlDiscoveryField[];limits:{networkRequests:0;scriptsExecuted:false;runtimeVerified:false;backendVerified:false;maxCandidatesPerField:8}};

const HTML_NAMESPACE="http://www.w3.org/1999/xhtml";
const CONTROL=/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
const SECRET=/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsk-[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/iu;
const ACTION={create:/\b(?:create|book|booking|reserve|reservation)\b|预约|預約|预订|預訂|订位|訂位/u,cancel:/\b(?:cancel|cancellation|withdraw)\b|取消|撤销|撤銷/u,move:/\b(?:move|reschedule|change|amend)\b|改期|改时|改時|更改|更換|更换/u,retry:/\b(?:retry|repeat|again)\b|重试|重試|重发|重發/u};
const PARTY=/\b(?:guests?|party|seats?|people|persons?|attendees?|headcount)\b|人数|人數|座位/u;
const SLOT=/\b(?:slot|time|arrival|session|start|schedule)\b|时段|時段|时间|時間|开始|開始/u;
const BOOKING_ID=/\b(?:booking|reservation|enrolment|enrollment)\b.*\b(?:id|ref|reference|saved|number)\b|\b(?:saved|existing)\b.*\b(?:booking|reservation)\b|预约.*(?:编号|編號|记录|記錄)|(?:订单|訂單|预订|預訂).*(?:号|號|编号|編號)/u;
const RESULT=/\b(?:result|status|notification|outcome|update|message)\b|结果|結果|状态|狀態|通知|回执|回執/u;
const OPERATIONS={create:["cancel-create","cancel-five","cancel-three","cancel-extra","source-create","loss-create"],cancel:["cancel-first","cancel-repeat"],move:["move-full","move-free"]}as const;
const blockedInputTypes=new Set(["password","hidden","checkbox","radio","file","image","reset","submit","button","range","color","date","datetime-local","month","week","time"]);
function normalize(value:string){return value.replace(/([a-z])([A-Z])/gu,"$1 $2").normalize("NFKC").toLowerCase().replace(/[_:.-]+/gu," ").replace(/\s+/gu," ").trim();}
function publicLabel(value:string){return SECRET.test(value)?"[withheld-sensitive-label]":value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/gu," ").replace(/\s+/gu," ").trim().slice(0,120);}
/** Text from labels/headings/buttons only. Input values, textarea content,
 * options, scripts, style and inert templates never supply semantic evidence. */
function text(node:OnboardingElement){let value="";const stack:OnboardingNode[]=[node];while(stack.length&&value.length<500){const current=stack.pop()!;if(onboardingElement(current)&&["script","style","template","input","textarea","select","option"].includes(current.tagName))continue;if("value"in current&&current.nodeName==="#text")value+=" "+current.value;if("childNodes"in current)for(let i=current.childNodes.length-1;i>=0;i--)stack.push(current.childNodes[i]);}return publicLabel(value);}
function nearestForm(node:OnboardingElement){let current=onboardingParent(node);while(current){if(current.tagName==="form")return current;current=onboardingParent(current);}return undefined;}
function labelSources(node:OnboardingElement,nodes:OnboardingElement[]){
 const id=attr(node,"id"),labelledBy=attr(node,"aria-labelledby")?.split(/\s+/u).filter(Boolean)??[];
 const labels=nodes.filter(n=>n.tagName==="label"&&(!!id&&attr(n,"for")===id||onboardingAncestor(node,p=>p===n))).map(text);
 const referenced=labelledBy.length<=8?labelledBy.flatMap(id=>{const found=nodes.filter(n=>attr(n,"id")===id);return found.length===1?[text(found[0])]:[];}):[];
 const label=publicLabel(labels.join(" ")),aria=publicLabel([attr(node,"aria-label")??"",...referenced].join(" "));
 return{label,aria,name:publicLabel(attr(node,"name")??""),id:publicLabel(id??""),own:["button","output"].includes(node.tagName)?text(node):""};
}
function formContext(form:OnboardingElement|undefined,nodes:OnboardingElement[]){if(!form)return{label:"",groups:[]as string[]};const heading=nodes.find(n=>["legend","h1","h2","h3","h4","h5","h6"].includes(n.tagName)&&nearestForm(n)===form);const label=publicLabel([attr(form,"aria-label")??"",attr(form,"name")??"",attr(form,"id")??"",...form.attrs.filter(a=>a.name.startsWith("data-")).map(a=>a.name),heading?text(heading):""].join(" ")),normalized=normalize(label),specific=["cancel","move","retry"].filter(g=>ACTION[g as keyof typeof ACTION].test(normalized));return{label,groups:specific.length?specific:ACTION.create.test(normalized)?["create"]:[]};}
function unavailable(node:OnboardingElement){return attr(node,"readonly")!==undefined||onboardingAncestor(node,n=>attr(n,"hidden")!==undefined||attr(n,"inert")!==undefined||attr(n,"aria-hidden")?.toLowerCase()==="true"||n.tagName==="fieldset"&&attr(n,"disabled")!==undefined||/\b(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/iu.test(attr(n,"style")??""))||attr(node,"disabled")!==undefined;}
function quotedAttribute(name:string,value:string|undefined){return typeof value==="string"&&value.length>0&&value.length<=120&&!/["'\]\\\r\n]/u.test(value)&&!CONTROL.test(value)&&!SECRET.test(value)?`[${name}="${value}"]`:undefined;}
function localSelectors(node:OnboardingElement){const id=attr(node,"id"),parts:(string|undefined)[]=[id&&/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(id)?`#${id}`:undefined,quotedAttribute("id",id),...["data-testid","data-pbp-control","name"].map(name=>{const selector=quotedAttribute(name,attr(node,name));return selector?`${node.tagName}${selector}`:undefined;})];for(const attribute of node.attrs.filter(a=>/^data-[a-z0-9_-]{1,50}$/u.test(a.name)).slice(0,16))parts.push(`${node.tagName}[${attribute.name}]`);return parts.filter((s):s is string=>!!s);}
function stableSelector(node:OnboardingElement,form:OnboardingElement|undefined,nodes:OnboardingElement[]){
 const unique=(query:string)=>{try{const found=matchOnboardingSelector(nodes,query);return found.length===1&&found[0]===node;}catch{return false;}};
 const local=localSelectors(node);for(const query of local)if(unique(query))return query;
 if(form){const scope=localSelectors(form).find(query=>{try{const found=matchOnboardingSelector(nodes,query);return found.length===1&&found[0]===form;}catch{return false;}});if(scope)for(const query of [...local,node.tagName]){const scoped=`${scope} ${query}`;if(scoped.length<=200&&unique(scoped))return scoped;}}
 return undefined;
}
function fieldEvidence(key:string,node:OnboardingElement,nodes:OnboardingElement[],sources:ReturnType<typeof labelSources>,context:ReturnType<typeof formContext>):SellerControlReason[]|undefined{
 if(node.namespaceURI!==HTML_NAMESPACE||unavailable(node))return undefined;
 const[group,field]=key.split("."),isButton=node.tagName==="button"&&(attr(node,"type")??"submit").toLowerCase()!=="reset"||node.tagName==="input"&&["submit","button"].includes((attr(node,"type")??"text").toLowerCase()),isField=["input","select","textarea"].includes(node.tagName)&&!(node.tagName==="input"&&blockedInputTypes.has((attr(node,"type")??"text").toLowerCase())),reasons:SellerControlReason[]=[];
 const normalized=Object.fromEntries(Object.entries(sources).map(([name,value])=>[name,normalize(value)]));
 const semantic=(pattern:RegExp)=>{let matches=false;for(const[name,value]of Object.entries(normalized))if(pattern.test(value)){matches=true;const reason=name==="label"?"label_match":name==="aria"?"aria_match":name==="name"?"name_match":name==="id"?"id_match":"label_match";if(!reasons.includes(reason))reasons.push(reason);}return matches;};
 if(key==="result"){if(["input","textarea","select","form","label","html","head","body","script","style","template","option"].includes(node.tagName))return undefined;const role=(attr(node,"role")??"").toLowerCase();if(["status","alert","log"].includes(role)){reasons.push("result_role");return reasons;}return semantic(RESULT)?reasons:undefined;}
 const direct=normalize(Object.values(sources).join(" ")),specificActions=["cancel","move","retry"].filter(action=>ACTION[action as keyof typeof ACTION].test(direct));
 if(specificActions.length&&!specificActions.includes(group))return undefined;
 if(context.groups.length&&!context.groups.includes(group))return undefined;
 if(context.groups.includes(group))reasons.push("form_context");
 if(field==="submit"){
  if(!isButton)return undefined;
  if(!semantic(ACTION[group as keyof typeof ACTION])&&!context.groups.includes(group))return undefined;
  reasons.push("control_type");return reasons;
 }
 if(!isField)return undefined;
 if(field==="requestOperation"){
  if(node.tagName!=="select")return undefined;const required=OPERATIONS[group as keyof typeof OPERATIONS];if(!required)return undefined;
  const values=nodes.filter(n=>n.tagName==="option"&&onboardingAncestor(n,p=>p===node)).map(n=>attr(n,"value"));if(!required.every(v=>values.includes(v)))return undefined;
  reasons.push("protocol_options","control_type");return reasons;
 }
 if(field==="partySize"&&!semantic(PARTY)||field==="slot"&&!semantic(SLOT)||field==="bookingId"&&!semantic(BOOKING_ID))return undefined;
 if(field==="slot"&&group==="move"&&/\b(?:create|reserve)\b|新建|创建|創建/u.test(direct)&&!ACTION.move.test(direct))return undefined;
 reasons.push("control_type");return reasons;
}

export async function discoverSellerControls(html:string):Promise<SellerControlDiscovery>{
 const document=readOnboardingDocument(html),source={sha256:typeof html==="string"&&document.bytes<=SELLER_ONBOARDING_DOCUMENT_LIMITS.maxBytes?Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(html)))).map(n=>n.toString(16).padStart(2,"0")).join(""):null,bytes:document.bytes};
 const fields:SellerControlDiscoveryField[]=ONBOARDING_SELECTOR_FIELDS.map(key=>({key,state:"unsupported",candidates:[],reason:"document_unavailable"}));
 if(document.ok){
  const nodes=document.nodes,described=nodes.map(node=>{const form=nearestForm(node);return{node,form,sources:labelSources(node,nodes),context:formContext(form,nodes)};});
  for(const field of fields){const candidates:SellerControlCandidate[]=[];let missingSelector=false,overflow=false;
   for(const{node,form,sources,context}of described){const reasons=fieldEvidence(field.key,node,nodes,sources,context);if(!reasons)continue;const location=node.sourceCodeLocation,selector=stableSelector(node,form,nodes);if(!selector||!location){missingSelector=true;continue;}if(candidates.length>=8){overflow=true;break;}
    const label=publicLabel(sources.label||sources.aria||sources.own||sources.name||sources.id||node.tagName);candidates.push({id:`${field.key}:${location.startOffset}`,selector,tagName:node.tagName,...(node.tagName==="input"?{inputType:(attr(node,"type")??"text").toLowerCase().slice(0,40)}:{}),label,formLabel:context.label,source:{line:location.startLine,column:location.startCol,startOffset:location.startOffset,endOffset:location.endOffset},reasons});
   }
   if(overflow){field.state="unsupported";field.reason="candidate_limit";}else if(missingSelector){field.state="unsupported";field.reason="no_stable_selector";}else if(!candidates.length){field.state="missing";field.reason="no_matching_control";}else{field.state=candidates.length===1?"candidate":"ambiguous";field.candidates=candidates;delete field.reason;}
  }
 }
 return{schema:"pbp-seller-control-discovery-v1",source,validDocument:document.ok,...(!document.ok?{documentIssue:document.code}:{}),fields,limits:{networkRequests:0,scriptsExecuted:false,runtimeVerified:false,backendVerified:false,maxCandidatesPerField:8}};
}
