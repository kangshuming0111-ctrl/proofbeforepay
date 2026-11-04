import {defaultSellerOnboardingConfig,ONBOARDING_SELECTOR_FIELDS,type OnboardingReport,type SellerOnboardingConfig} from "../../lib/seller-onboarding.ts";
import type {SellerControlDiscovery} from "../../lib/seller-control-discovery.ts";

/** The report and explicit confirmations belong to one local file and config revision. */
export type SellerOnboardingState={
 step:number;generation:number;revision:number;config:SellerOnboardingConfig;
 filename:string;html?:string;discovery?:SellerControlDiscovery;
 reading:boolean;notice:string;report?:OnboardingReport;
 selected:Record<string,string>;confirmed:Record<string,{candidateId:string;selector:string;sha256:string}>;
};
export function onboardingFieldValue(config:SellerOnboardingConfig,key:string):string{
 if(key==="result")return config.result;
 const[group,field]=key.split(".");return(config.forms[group as keyof typeof config.forms] as Record<string,string>)[field];
}
export function withOnboardingField(config:SellerOnboardingConfig,key:string,value:string):SellerOnboardingConfig{
 if(!ONBOARDING_SELECTOR_FIELDS.includes(key))return config;
 const next=structuredClone(config);
 if(key==="result")next.result=value;
 else{const[group,field]=key.split(".");(next.forms[group as keyof typeof next.forms] as Record<string,string>)[field]=value;}
 return next;
}
function emptyMappings(config:SellerOnboardingConfig){return ONBOARDING_SELECTOR_FIELDS.reduce((next,key)=>withOnboardingField(next,key,""),config);}
export function createSellerOnboardingState():SellerOnboardingState{return{step:0,generation:0,revision:0,config:emptyMappings(defaultSellerOnboardingConfig()),filename:"",reading:false,notice:"",selected:{},confirmed:{}};}
export type SellerOnboardingAction=
 |{type:"step";step:number}
 |{type:"file-start";generation:number}
 |{type:"file-ready";generation:number;filename:string;html:string;discovery:SellerControlDiscovery}
 |{type:"file-error";generation:number;message:string}
 |{type:"select";key:string;candidateId:string}
 |{type:"confirm";key:string;candidateId:string}
 |{type:"config";config:SellerOnboardingConfig;field?:string}
 |{type:"example"}
 |{type:"report";generation:number;revision:number;report:OnboardingReport}
 |{type:"notice";message:string};
export function sellerOnboardingReducer(state:SellerOnboardingState,action:SellerOnboardingAction):SellerOnboardingState{
 switch(action.type){
  case"step":return{...state,step:action.step};
  case"file-start":return{...state,generation:action.generation,revision:state.revision+1,config:emptyMappings(state.config),filename:"",html:undefined,discovery:undefined,reading:true,selected:{},confirmed:{},report:undefined,notice:"",step:0};
  case"file-ready":{
   if(action.generation!==state.generation)return state;
   // A unique candidate is a visible preview only. Confirmation still writes the mapping.
   const selected=Object.fromEntries(action.discovery.validDocument?action.discovery.fields.filter(field=>field.state==="candidate"&&field.candidates.length===1).map(field=>[field.key,field.candidates[0].id]):[]);
   return{...state,filename:action.filename,html:action.html,discovery:action.discovery,reading:false,selected,confirmed:{},report:undefined};
  }
  case"file-error":if(action.generation!==state.generation)return state;return{...state,reading:false,notice:action.message};
  case"select":{
   const selected={...state.selected,[action.key]:action.candidateId},confirmed={...state.confirmed};delete confirmed[action.key];
   return{...state,selected,confirmed,config:withOnboardingField(state.config,action.key,""),revision:state.revision+1,report:undefined,notice:""};
  }
  case"confirm":{
   const source=state.discovery?.source.sha256,field=state.discovery?.fields.find(field=>field.key===action.key),candidate=field?.candidates.find(candidate=>candidate.id===action.candidateId);
   if(!state.discovery?.validDocument||!source||!candidate||state.selected[action.key]!==candidate.id)return state;
   return{...state,config:withOnboardingField(state.config,action.key,candidate.selector),confirmed:{...state.confirmed,[action.key]:{candidateId:candidate.id,selector:candidate.selector,sha256:source}},revision:state.revision+1,report:undefined,notice:""};
  }
  case"config":{
   const confirmed={...state.confirmed},selected={...state.selected};
   // Manual selector changes cannot inherit a previous candidate confirmation.
   for(const key of ONBOARDING_SELECTOR_FIELDS)if(onboardingFieldValue(state.config,key)!==onboardingFieldValue(action.config,key)){delete confirmed[key];delete selected[key];}
   return{...state,config:action.config,confirmed,selected,revision:state.revision+1,report:undefined,notice:""};
  }
  case"example":return{...state,config:defaultSellerOnboardingConfig(),selected:{},confirmed:{},revision:state.revision+1,report:undefined,notice:""};
  case"report":if(action.generation!==state.generation||action.revision!==state.revision||state.reading)return state;return{...state,report:action.report,notice:""};
  case"notice":return{...state,notice:action.message};
 }
}
export function confirmedOnboardingCount(state:SellerOnboardingState):number{
 const source=state.discovery?.source.sha256;if(!source)return 0;
 return ONBOARDING_SELECTOR_FIELDS.filter(key=>state.confirmed[key]?.sha256===source&&state.confirmed[key]?.selector===onboardingFieldValue(state.config,key)).length;
}
/** Fatal decoding prevents replacement characters from creating a misleading mapping. */
export function decodeSellerOnboardingHtml(bytes:ArrayBuffer):string{
 const html=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 if(html.includes("\0"))throw new Error("html_size_or_encoding");
 return html;
}
