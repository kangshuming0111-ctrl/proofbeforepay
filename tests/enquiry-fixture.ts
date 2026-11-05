import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import type {ProofQuote} from "../lib/contracts.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {ENQUIRY_STEP_IDS} from "../lib/enquiry-checks.ts";
import {beginProjectEnquiryRun,beginProjectEnquiryStep,confirmProjectEnquiryPlan,finishProjectEnquiryRun,finishProjectEnquiryStep} from "../lib/project-enquiry-actions.ts";
import {validateEnquiryRegistration,type EnquiryDelivery} from "../lib/project-enquiry.ts";
import {executeProjectEnquiryStep} from "../lib/server-enquiry-targets.ts";
import {handleEnquiryRequest} from "../examples/seller-enquiry-staging/worker/enquiry-service.mjs";
export const origin="https://synthetic-enquiry.example.org";
export const schema=readFileSync(new URL("../examples/seller-enquiry-staging/migrations/0001_enquiries.sql",import.meta.url),"utf8");
export const persisted=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
export function d1(sqlite:DatabaseSync){return{prepare(sql:string){const stmt=sqlite.prepare(sql);return{bind(...args:(string|number|null)[]){return{async first(){return stmt.get(...args)??null;},async all(){return{success:true,results:stmt.all(...args)};},async run(){return{success:true,meta:{changes:Number(stmt.run(...args).changes)}};}};}};}};}
export async function enquiryFixture(profile="fixed"){
 const parsed=parseStaticProject({title:"Fictional shop enquiry",summary:"Build a website.",amount:"1.00",requiredPages:["index.html"],manualRequirements:[]},"en"),delivery=createUploadedDelivery({"index.html":"<!doctype html><html><head><title>Shop</title></head><body><h1>Fictional shop</h1></body></html>"},parsed.project,"en",1),at=new Date().toISOString();
 let quote={id:"synthetic-enquiry-project",reference:"PBP-ENQUIRY",workflow:"proof-v1",title:parsed.title,summary:"Build a website.",brief:"Build a website.",clientName:"Synthetic",currency:"AUD",language:"en",hourlyRateCents:100,totalCents:100,lineItems:[{id:"site",description:"Synthetic",quantity:1,unitPriceCents:100}],assumptions:[],questions:[],timelineDays:1,status:"approved",aiMode:"demo",paymentMode:"demo",createdAt:at,proof:{project:parsed.project,criteria:parsed.criteria,paymentState:"unfunded",audit:[],delivery,review:{deliveryId:delivery.id,reviewedAt:at,mode:"demo",summary:"Static review only"},collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at,note:"Ready"},feedback:[]}}} as ProofQuote;
 quote=persisted(await confirmProjectEnquiryPlan(quote,"buyer",{action:"confirm-plan",deliveryId:delivery.id,confirmBackendOnly:true}));
 const digest=await runtimeDeliveryDigest(delivery.files),registration=validateEnquiryRegistration({id:"seller-enquiry",label:"Authorized fictional enquiry staging",projectId:quote.id,deliveryDigest:digest,baseUrl:origin+"/pbp/",revision:`enquiry-${profile}-v1`,registrationRevision:"review-r1",expiresAt:"2099-01-01T00:00:00.000Z",protocol:"enquiry-http-v1",testOnly:true,authorisedSyntheticMutations:true,provenance:"operator-approved-declaration"}),sqlite=new DatabaseSync(":memory:");sqlite.exec(schema);
 const env={DB:d1(sqlite),ENQUIRY_PROFILE:profile,ENQUIRY_REVISION:registration.revision},requests:{url:string;init:RequestInit}[]=[];
 const fetch=async(url:string,init:RequestInit)=>{requests.push({url,init});return handleEnquiryRequest(new Request(url,init),env);};
 async function execute(){quote=persisted(await beginProjectEnquiryRun(quote,"buyer",{action:"start",deliveryId:delivery.id,targetId:registration.id,confirmSyntheticMutations:true},registration));for(const step of ENQUIRY_STEP_IDS){const run=(quote.proof.delivery as EnquiryDelivery).enquiryRun!,begun=beginProjectEnquiryStep(quote,"buyer",{action:"advance",deliveryId:delivery.id,runId:run.id,stepId:step,...(step==="retry_original"?{confirmOriginalKeyRetry:true}:{})});quote=persisted(begun.quote);const observation=await executeProjectEnquiryStep(begun.run,step,{fetch});quote=persisted(finishProjectEnquiryStep(quote,run.id,begun.leaseId,observation));}const run=(quote.proof.delivery as EnquiryDelivery).enquiryRun!;quote=persisted(finishProjectEnquiryRun(quote,"buyer",{action:"finish",deliveryId:delivery.id,runId:run.id}));return{quote,report:(quote.proof.delivery as EnquiryDelivery).enquiryReport!,requests,rows:sqlite.prepare("SELECT * FROM enquiry_receipts ORDER BY created_at,id").all()};}
 return{quote,delivery,digest,registration,sqlite,env,fetch,requests,execute};
}
