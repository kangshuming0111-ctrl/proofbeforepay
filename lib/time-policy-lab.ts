import {DomainError} from "./domain.ts";
import {DEFAULT_TIME_PLAN,timePolicyCases,validateTimeSession,type TimePolicySession,type TimeTrace} from "./time-policy.ts";
import {executeTimePolicy} from "./time-policy-runner.ts";
import {validateJourneyRegistration} from "./project-journey.ts";
export const TIME_LAB_SCOPE={syntheticOnly:true,fixture:true,privateProject:false,acceptance:false,payment:false,browserExecution:false,deploymentAttestation:false,independentSeller:false,reportStorage:"server-memory-then-browser-download",refreshClearsReport:true,fileHashMeaning:"declared-controlled-fixture-identity-only"}as const;
/** This account-free controlled fixture is separate from durable authenticated
 * project records. Its in-memory intents are NOT presented as persisted leases.
 * It only addresses three fixed same-lab targets and never accepts an input URL. */
export async function runTimePolicyLab(origin:string,profile:unknown,options:{fetch?:(url:string,init:RequestInit)=>Promise<Response>}={}){
 if(!["fixed","cancel-credit","move-loss"].includes(String(profile)))throw new DomainError("Choose a supported controlled time-policy fixture.");const label=String(profile),id=crypto.randomUUID(),at=new Date().toISOString(),plan=structuredClone(DEFAULT_TIME_PLAN),manifest=`controlled-time-policy-fixture-v1:${label}:${JSON.stringify(plan.policy)}`,digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(manifest)))).map(v=>v.toString(16).padStart(2,"0")).join("");
 const registration=validateJourneyRegistration({id:`controlled-time-${label}`,label:`Controlled native time policy: ${label}`,projectId:"public-time-policy-lab",registrationRevision:"public-controlled-time-v1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:`${origin}/seller-reference/${label}/index.html`,backendBaseUrl:`${origin}/seller-reference/${label}/pbp/`,deploymentRevision:`lifecycle-${label}-v1`,frontendBundleDigest:digest,scenario:label,expiresAt:new Date(Date.parse(at)+120000).toISOString(),testOnly:true,provenance:"operator-approved-declaration"});
 let session:TimePolicySession={id,projectId:"public-time-policy-lab",deliveryId:`controlled-time-${label}`,deliveryDigest:digest,createdBy:"public-synthetic-lab",createdAt:at,updatedAt:at,version:2,status:"running",plan,cases:timePolicyCases(plan),trace:[],targetId:registration.id,registration,startedBy:"public-synthetic-lab",startedAt:at,expiresAt:new Date(Date.parse(at)+60000).toISOString()};
 const guard=async()=>{if(Date.now()>=Date.parse(session.expiresAt!))throw new DomainError("The finite public fixture run expired.",409);};
 const onTrace=async(trace:TimeTrace[])=>{session={...session,trace,version:session.version+1,updatedAt:new Date().toISOString()};validateTimeSession(session);};
 const output=await executeTimePolicy(session,registration,{guard,onTrace,...options});session={...session,...output,status:output.results.some(r=>r.outcome==="unknown")?"unknown":"complete",version:session.version+1,updatedAt:new Date().toISOString()};validateTimeSession(session);
 return{schema:"proofbeforepay-public-time-policy-v1",profile:label,scope:TIME_LAB_SCOPE,requestCount:session.trace.length,postCount:session.trace.filter(t=>t.method==="POST").length,session};
}
