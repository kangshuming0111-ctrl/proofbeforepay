import {handleEnquiryRequest} from "../examples/seller-enquiry-staging/worker/enquiry-service.mjs";

/** Team-owned control only. This is not a separately operated seller service. */
export const ENQUIRY_LAB_BASE="/enquiry/pbp/";
export const ENQUIRY_LAB_REVISION="team-owned-enquiry-fixed-v1";
const MESSAGES=new Set(["A fictional enquiry about a small shop website.","A second fictional enquiry, used for explicit recovery testing.","An intentionally conflicting fictional message."]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const reply=(code:string,status:number)=>Response.json({code},{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
async function fixedExerciseBody(request:Request):Promise<unknown>{
 if(request.headers.get("content-type")?.split(";",1)[0].trim()!=="application/json"||!request.body)throw new Error("synthetic_fixture_only");
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>2048)throw new Error("synthetic_fixture_only");chunks.push(item.value);}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}const input=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!["testRunId","marker","name","email","subject","message"].includes(k))||typeof input.testRunId!=="string"||!UUID.test(input.testRunId)||input.marker!==`PBP-${input.testRunId}`||input.name!=="PBP synthetic"||input.email!=="pbp-test@example.invalid"||input.subject!=="Website enquiry"||Object.hasOwn(input,"message")&&!MESSAGES.has(input.message))throw new Error("synthetic_fixture_only");
  // Missing message is the one explicit invalid-input exercise; the native
  // handler still decides its actual400 and whether a row was inserted.
  return input;
 }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function handleEnquiryLabRequest(request:Request,env:{ENQUIRY_DB?:unknown}):Promise<Response|null>{
 const url=new URL(request.url);if(!url.pathname.startsWith("/enquiry/"))return null;
 const resource=/^\/enquiry\/pbp\/(meta|enquiries(?:\/[a-f0-9-]{36})?|runs\/[a-f0-9-]{36})$/u.exec(url.pathname);if(!resource||url.search||url.hash||/[\\%]/u.test(request.url))return reply("not_found",404);
 if(request.headers.has("authorization")||request.headers.has("cookie")||request.headers.has("origin")&&request.headers.get("origin")!==url.origin)return reply("credentials_or_foreign_origin_rejected",403);
 const forwarded=new URL(request.url);forwarded.pathname=`/pbp/${resource[1]}`;
 let nativeRequest:Request;
 if(request.method==="POST"&&resource[1]==="enquiries"){
  let input:unknown;try{input=await fixedExerciseBody(request);}catch{return reply("synthetic_fixture_only",400);}
  nativeRequest=new Request(forwarded,{method:"POST",headers:request.headers,body:JSON.stringify(input)});
 }else nativeRequest=new Request(forwarded,request);
 // No profile, revision, origin, database or URL is selected by the caller.
 return handleEnquiryRequest(nativeRequest,{DB:env.ENQUIRY_DB,ENQUIRY_PROFILE:"fixed",ENQUIRY_REVISION:ENQUIRY_LAB_REVISION});
}
