import assets from "pbp-guest-assets";
import {handleBookingRequest} from "../../tests/fixtures/booking-backend/worker/booking-api.js";
import {handlePolicyBookingRequest} from "../../tests/fixtures/booking-backend/worker/policy-booking-api.js";
import {executeRuntimeCheck} from "../../lib/runtime-runner.ts";
import {suggestBookingPolicy} from "../../lib/booking-policy.ts";
import {handleSellerBookingRequest} from "../../examples/seller-staging/worker/booking-service.mjs";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
function json(value:unknown,status=200){return Response.json(value,{status,headers});}
async function body(request:Request){
  if(request.headers.get("content-type")?.split(";")[0]!=="application/json")throw new Error("JSON required");
  const reader=request.body?.getReader();if(!reader)throw new Error("Body required");
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new Error("Body too large");}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
export default {async fetch(request:Request,env:{DB?:D1Database;LAB_ALLOW_LOOPBACK?:string} & Record<string,unknown>):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname.startsWith("/seller-staging/")){
    const forwarded=new URL(request.url);forwarded.pathname=url.pathname.slice("/seller-staging".length);
    // Controlled reference hosting reuses this synthetic lab's physical D1,
    // with separate seller_* tables and native business policy. It is a
    // separately implemented handler, not an independent third-party seller.
    return handleSellerBookingRequest(new Request(forwarded,request),{SELLER_DB:env.DB,
      SELLER_PROJECT_ID:env.SELLER_PROJECT_ID,SELLER_REGISTRATION_REVISION:env.SELLER_REGISTRATION_REVISION,
      SELLER_DEPLOYMENT_REVISION:env.SELLER_DEPLOYMENT_REVISION,SELLER_FRONTEND_BUNDLE_DIGEST:env.SELLER_FRONTEND_BUNDLE_DIGEST,
      ...(env.SELLER_BACKEND_ARTIFACT_DIGEST===undefined?{}:{SELLER_BACKEND_ARTIFACT_DIGEST:env.SELLER_BACKEND_ARTIFACT_DIGEST}),
      ...(env.SELLER_BACKEND_SOURCE_COMMIT===undefined?{}:{SELLER_BACKEND_SOURCE_COMMIT:env.SELLER_BACKEND_SOURCE_COMMIT})});
  }
  const fixture=await handleBookingRequest(request,env);if(fixture)return fixture;
  const policyFixture=await handlePolicyBookingRequest(request,env);if(policyFixture)return policyFixture;
  if(url.pathname==="/health")return json({service:"proofbeforepay-isolated-lab",protocols:["booking-http-v1","booking-http-v2"],privateProjects:false,modelCredentials:false,realPayments:false,referenceStaging:{handler:"separate-native-business-handler",syntheticOnly:true,sharesPhysicalLabDatabase:true}});
  if(url.pathname==="/api/lab-check"){
    if(request.method!=="POST")return json({error:"POST required"},405);
    if(request.headers.get("origin")!==url.origin)return json({error:"Same-origin request required"},403);
    let input;try{input=await body(request);}catch{return json({error:"Send a bounded JSON test consent"},400);}
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!["scenario","consent","protocol","maxPartySize"].includes(k))||!["flawed","fixed"].includes(input.scenario)||input.consent!==true)return json({error:"Confirm synthetic writes and choose a controlled scenario"},400);
    const protocol=input.protocol??"booking-http-v1";
    if(!["booking-http-v1","booking-http-v2"].includes(protocol)||protocol==="booking-http-v1"&&input.maxPartySize!==undefined||protocol==="booking-http-v2"&&(!Number.isInteger(input.maxPartySize)||input.maxPartySize<2||input.maxPartySize>12))return json({error:"Choose a supported protocol and explicit synthetic maximum from2to12 for policy checks"},400);
    const scenario=input.scenario as "flawed"|"fixed",runId=crypto.randomUUID();
    const source=protocol==="booking-http-v2"?`Each booking accepts at most ${input.maxPartySize} people.`:"The booking backend must reject invalid input, preserve independently readable bookings and handle replay/conflict without duplicate or overwritten records.";
    const citation={start:0,end:source.length,excerpt:source};
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`controlled-fixture:${scenario}`)))).map(n=>n.toString(16).padStart(2,"0")).join("");
    const report=await executeRuntimeCheck({deliveryId:`lab-${scenario}-${runId}`,deliveryDigest:digest,runId,plan:protocol==="booking-http-v2"?{protocol,criterionId:"booking",source:citation,policy:suggestBookingPolicy(citation)!}:{protocol:"booking-http-v1",criterionId:"booking",source:citation},target:{id:protocol==="booking-http-v2"?`lab-policy-${scenario}`:`lab-${scenario}`,label:`Controlled disposable ${scenario} booking fixture`,baseUrl:`${url.origin}/test-api/${protocol==="booking-http-v2"?"policy-":""}${scenario}/`,revision:protocol==="booking-http-v2"?`booking-policy-${scenario}-v1`:scenario==="fixed"?"booking-fixed-v2":"booking-flawed-v1",testOnly:true,protocol}}, {allowLoopback:env.LAB_ALLOW_LOOPBACK==="true"&&["127.0.0.1","localhost"].includes(url.hostname)});
    return json(report);
  }
  if(request.method!=="GET"&&request.method!=="HEAD")return json({error:"Method not allowed"},405);
  const asset=assets[url.pathname==="/"?"/index.html":url.pathname];
  if(!asset)return json({error:"Not found"},404);
  const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
  return new Response(request.method==="HEAD"?null:bytes,{headers:{...headers,"Content-Type":asset.type,"Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
}};
