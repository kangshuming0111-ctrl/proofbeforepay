import assets from "pbp-guest-assets";
import {handleBookingRequest} from "../../tests/fixtures/booking-backend/worker/booking-api.js";
import {executeRuntimeCheck} from "../../lib/runtime-runner.ts";
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
export default {async fetch(request:Request,env:{DB?:D1Database;LAB_ALLOW_LOOPBACK?:string}):Promise<Response>{
  const url=new URL(request.url);
  const fixture=await handleBookingRequest(request,env);if(fixture)return fixture;
  if(url.pathname==="/health")return json({service:"proofbeforepay-isolated-lab",protocol:"booking-http-v1",privateProjects:false,modelCredentials:false,realPayments:false});
  if(url.pathname==="/api/lab-check"){
    if(request.method!=="POST")return json({error:"POST required"},405);
    if(request.headers.get("origin")!==url.origin)return json({error:"Same-origin request required"},403);
    let input;try{input=await body(request);}catch{return json({error:"Send a bounded JSON test consent"},400);}
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!["scenario","consent"].includes(k))||!["flawed","fixed"].includes(input.scenario)||input.consent!==true)return json({error:"Confirm synthetic writes and choose a controlled scenario"},400);
    const scenario=input.scenario as "flawed"|"fixed",runId=crypto.randomUUID();
    const source="The booking backend must reject invalid input, preserve independently readable bookings and handle replay/conflict without duplicate or overwritten records.";
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`controlled-fixture:${scenario}`)))).map(n=>n.toString(16).padStart(2,"0")).join("");
    const report=await executeRuntimeCheck({deliveryId:`lab-${scenario}-${runId}`,deliveryDigest:digest,runId,plan:{protocol:"booking-http-v1",criterionId:"booking",source:{start:0,end:source.length,excerpt:source}},target:{id:`lab-${scenario}`,label:`Controlled disposable ${scenario} booking fixture`,baseUrl:`${url.origin}/test-api/${scenario}/`,revision:scenario==="fixed"?"booking-fixed-v2":"booking-flawed-v1",testOnly:true}}, {allowLoopback:env.LAB_ALLOW_LOOPBACK==="true"&&["127.0.0.1","localhost"].includes(url.hostname)});
    return json(report);
  }
  if(request.method!=="GET"&&request.method!=="HEAD")return json({error:"Method not allowed"},405);
  const asset=assets[url.pathname==="/"?"/index.html":url.pathname];
  if(!asset)return json({error:"Not found"},404);
  const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
  return new Response(request.method==="HEAD"?null:bytes,{headers:{...headers,"Content-Type":asset.type,"Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
}};
