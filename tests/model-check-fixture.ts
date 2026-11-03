import type {ProofQuote} from "../lib/contracts.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {beginProjectJourneyRun,finishProjectJourneyRun} from "../lib/project-journey-actions.ts";
import {newProjectJourneyPlan,validateJourneyRegistration} from "../lib/project-journey.ts";
import {beginModelCheckRun,finishModelCheckRun} from "../lib/model-check-actions.ts";
import {generateModelTrace,MODEL_SLOTS,MODEL_OPERATION_IDS,modelCheckReportFromTrace,modelKey,type ModelCheckBase,type ModelHttpObservation} from "../lib/model-checks.ts";
import {acceptanceBasis} from "../lib/acceptance-basis.ts";

export async function modelFixture(){
 const at=new Date().toISOString(),parsed=parseStaticProject({title:"Synthetic model evidence",summary:"One static page",amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en");
 const delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Model fixture</title></head><body>Synthetic website</body></html>"},parsed.project,"en",1);
 const quote:ProofQuote={id:"synthetic-model-project",reference:"PBP-MODEL",workflow:"proof-v1",title:parsed.title,summary:parsed.summary,brief:parsed.summary,clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Rules only"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Review this version"},feedback:[]}}};
 delivery.journeyPlan=newProjectJourneyPlan(at);const digest=await runtimeDeliveryDigest(delivery.files);
 const registration=validateJourneyRegistration({id:"seller-model-staging",label:"Synthetic declared model staging",projectId:quote.id,registrationRevision:"r1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:"https://seller-model.example.org/workshop.html",backendBaseUrl:"https://seller-model.example.org/pbp/",deploymentRevision:"lifecycle-fixed-v1",frontendBundleDigest:digest,scenario:"fixed",expiresAt:"2099-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"});
 const pending=beginProjectJourneyRun(quote,"buyer",{action:"start",deliveryId:delivery.id,previousReportId:null,targetId:registration.id,confirm:true},digest,registration);
 const q=finishProjectJourneyRun(pending,"buyer",{action:"abort",deliveryId:delivery.id,runId:pending.proof.delivery!.journeyRun!.id});return{quote:q,digest,registration,at};
}
export function modelInput(q:ProofQuote,targetId:string,seed=42){return{action:"run",deliveryId:q.proof.delivery!.id,previousReportId:q.proof.delivery!.modelReport?.id??null,targetId,seed,confirm:true};}

/** Independent synthetic wire transcript for domain binding tests. This is not
 * an HTTP execution result; the native/runner suites establish that layer. */
export function modelTrace(base:ModelCheckBase,outcome:"compatible"|"violated"="compatible"):ModelHttpObservation[]{
 const p=generateModelTrace(base.seed),rev=base.registration.bridgeRevision??base.registration.deploymentRevision,run=base.id,prefix=new URL(base.registration.backendBaseUrl).pathname;
 const receipt=(id:string,slot:string,partySize:number,suffix:string)=>({id,testRunId:run,marker:`PBP-${run}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot,partySize,status:"active",revision:rev,idempotencyKey:modelKey(run,suffix)});
 const x=receipt("native-x",MODEL_SLOTS[p.source],p.p,"source-create"),y=receipt("native-y",MODEL_SLOTS[p.target],p.p,"cancel-five"),z=receipt("native-z",MODEL_SLOTS[p.target],8-p.p,"cancel-three"),cancelled={...y,status:"cancelled"},moved={...x,slot:MODEL_SLOTS[p.target]};
 const final=[outcome==="compatible"?moved:{...x,status:"cancelled"},cancelled,z];
 const rows:ModelHttpObservation[]=[];let ordinal=0;
 for(const operationId of MODEL_OPERATION_IDS){
  let path:string,status=200,body:unknown,request:unknown,key:string|undefined;
  if(operationId==="meta"){path="meta";body={protocol:"booking-lifecycle-http-v1",revision:rev,maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false,...(base.registration.bridgeRevision?{nativeRevision:base.registration.deploymentRevision}:{})};}
  else if(operationId.startsWith("create_")){path="bookings";status=201;const original={create_x:x,create_y:y,create_z:z}[operationId as "create_x"|"create_y"|"create_z"];body=original;key=original.idempotencyKey;request={testRunId:run,marker:`PBP-${run}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:original.slot,partySize:original.partySize};}
  else if(operationId==="cancel_y"){path=`bookings/${y.id}/cancel`;body=cancelled;key=modelKey(run,"cancel-first");request={testRunId:run,marker:`PBP-${run}`};}
  else if(operationId==="transfer_x"){path=`bookings/${x.id}/move`;status=outcome==="compatible"?200:409;body=outcome==="compatible"?moved:{code:"slot_capacity_exceeded"};key=modelKey(run,"move-full");request={testRunId:run,marker:`PBP-${run}`,slot:MODEL_SLOTS[p.target]};}
  else{
   const [phase,kind]=operationId.split("_");const state=phase==="empty"?[]:phase==="seeded"?[x,y,z]:final;
   if(kind==="merchant"){path=`merchant/${run}`;body={testRunId:run,revision:rev,bookings:state};}
   else if(["a","b","c"].includes(kind)){path=`occupancy/${run}/${kind}`;const slot=MODEL_SLOTS[kind as keyof typeof MODEL_SLOTS],active=state.filter(row=>row.slot===slot&&row.status==="active");body={testRunId:run,slot,revision:rev,guestCount:active.reduce((sum,row)=>sum+row.partySize,0),bookingIds:active.map(row=>row.id)};}
   else{const selected=state.find(row=>row.id===`native-${kind}`)!;path=`bookings/${selected.id}`;body=selected;}
  }
  let invokedOrdinal:number,completedOrdinal:number;
  if(operationId==="cancel_y"){invokedOrdinal=++ordinal;completedOrdinal=ordinal+2;}
  else if(operationId==="transfer_x"){invokedOrdinal=++ordinal;completedOrdinal=ordinal+2;ordinal+=2;}
  else{invokedOrdinal=++ordinal;completedOrdinal=++ordinal;}
  rows.push({operationId,method:operationId.startsWith("create_")||operationId==="cancel_y"||operationId==="transfer_x"?"POST":"GET",path:prefix+path,invokedOrdinal,completedOrdinal,status,body,...(request?{request}:{}),...(key?{key}:{})});
 }
 return JSON.parse(JSON.stringify(rows));
}
export function completeModel(q:ProofQuote,digest:string,registration:ModelCheckBase["registration"],seed=42,outcome:"compatible"|"violated"="compatible"){
 const pending=beginModelCheckRun(q,"seller",modelInput(q,registration.id,seed),digest,registration),run=pending.proof.delivery!.modelRun!;
 return finishModelCheckRun(pending,run.id,modelCheckReportFromTrace(run,modelTrace(run,outcome),new Date().toISOString()));
}
export function modelConsent(q:ProofQuote){
 const delivery=q.proof.delivery!,journey=delivery.journeyReport!,model=delivery.modelReport;
 return{confirm:true,deliveryId:delivery.id,expectedEvidence:acceptanceBasis(q),manualChecks:delivery.evidence.filter(row=>row.finding==="needs_human").map(row=>row.criterionId),journeyDecision:{reportId:journey.id,acknowledgeClientObservation:true,acknowledgedSteps:journey.input.observations.map(row=>row.id),exceptionReason:"Synthetic previous journey was closed without network observations"},...(model?{modelDecision:{reportId:model.id,acknowledgeServerCheck:true,...(model.result.outcome!=="compatible"?{exceptionReason:"Buyer explicitly reviewed the synthetic model exception"}:{})}}:{})};
}
