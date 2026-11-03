"use client";
import {useEffect,useState} from "react";
import type {ProofDelivery} from "@/lib/contracts";
import {runtimeDeliveryDigest} from "@/lib/runtime-project";
import {buildModelSpotlight,type ModelSpotlightOptions} from "@/lib/model-spotlight";

/** Bind to actual canonical file bytes, not only delivery/report IDs. Equal
 * file content across an annotation refresh retains its hash and acknowledgement;
 * changed bytes are unverified immediately, before the next effect runs. */
export function useModelDiagnosis(delivery:ProofDelivery,options:Omit<ModelSpotlightOptions,"deliveryDigest"|"digestPending">={}){
 const files=delivery.files;
 const content=files?JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,"en"))):undefined;
 const [binding,setBinding]=useState<{content:string;digest?:string}>();
 const hasEvidence=!!(delivery.modelReport||delivery.modelRun);
 useEffect(()=>{
  let active=true;if(!hasEvidence||!files||content===undefined)return()=>{active=false;};
  runtimeDeliveryDigest(files).then(digest=>{if(active)setBinding({content,digest});}).catch(()=>{if(active)setBinding({content});});
  return()=>{active=false;};
 },[content,hasEvidence]);
 return buildModelSpotlight(delivery,{...options,deliveryDigest:binding?.content===content?binding?.digest:undefined,digestPending:hasEvidence&&!!files&&binding?.content!==content});
}
